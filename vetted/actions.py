"""Approval queue and exactly-once execution of irreversible actions (outbox pattern).

pending_approval -> approved -> executing -> done
                 -> held | blocked

- Every action has an idempotency key (action_id) derived from run + kind + vendor; creating it twice is a no-op.
- Execution claims an action atomically (approved -> executing) so two workers cannot both run it.
- After a crash, an action left in `executing` is reconciled: if its side effect already exists it is marked
  done without running again; only if the effect is missing is it executed.
"""
from __future__ import annotations

import hashlib
import json
import os
import smtplib
import time
from email.message import EmailMessage
from pathlib import Path

from .config import DATA_DIR, env
from .store import Store

OUTBOX_DIR = DATA_DIR / "outbox"
OUTBOX_DIR.mkdir(parents=True, exist_ok=True)


def action_key(run_id: str, kind: str, vendor: str) -> str:
    return hashlib.sha256(f"{run_id}|{kind}|{vendor}".encode()).hexdigest()[:20]


def _now() -> float:
    return time.time()


# --------------------------------------------------------------------------- proposals
def propose_actions(store: Store, result: dict, request: dict) -> list[dict]:
    """Create the actions a person must approve, based on the decision. Idempotent."""
    run_id, vendor, decision = result["run_id"], result.get("vendor") or "vendor", result["decision"]
    contact = request.get("contact_email") or env("VENDOR_CONTACT_EMAIL", "vendor-desk@example.test")
    legal = result.get("legal_name") or vendor
    proposals = []
    if decision == "CLEARED":
        cin = next((f["value"] for f in result.get("facts", []) if f["field"] == "cin"), None)
        proposals.append(("activate_vendor", {
            "vendor_name": vendor, "legal_name": legal, "cin": cin,
            "domain": request.get("website"), "gstin": request.get("gstin"), "pan": request.get("pan"),
            "bank_account": request.get("bank_account"), "ifsc": request.get("ifsc"), "city": request.get("city"),
            "why": result.get("reasons", [])}))
        proposals.append(("email_vendor", {
            "to": contact, "subject": f"Vendor onboarding approved: {legal}",
            "body": (f"Dear {legal},\n\nYour vendor registration has been verified and approved.\n\n"
                     f"Reasons on file:\n- " + "\n- ".join(result.get("reasons", [])) +
                     "\n\nRegards,\nVendor Onboarding")}))
    elif decision in ("REJECTED", "REFER", "CANNOT_VERIFY"):
        missing = result.get("missing") or []
        flags = result.get("flags") or []
        if decision == "REJECTED":
            subj, intro = f"Vendor registration not approved: {legal}", "We are unable to approve your vendor registration."
        else:
            subj, intro = f"Additional documents needed: {legal}", "We need a few more details before we can approve your registration."
        body = f"Dear {legal},\n\n{intro}\n\n"
        if flags:
            body += "What we found:\n- " + "\n- ".join(flags) + "\n\n"
        if missing:
            body += "Please send:\n- " + "\n- ".join(missing) + "\n\n"
        body += "If you believe this is a mistake, reply to this email and a person will review it.\n\nRegards,\nVendor Onboarding"
        proposals.append(("email_vendor", {"to": contact, "subject": subj, "body": body}))

    out = []
    for kind, payload in proposals:
        aid = action_key(run_id, kind, vendor)
        store.x("""INSERT OR IGNORE INTO actions (action_id, run_id, kind, payload_json, status, executed_count,
                   created_at, updated_at) VALUES (?,?,?,?, 'pending_approval', 0, ?, ?)""",
                (aid, run_id, kind, json.dumps(payload, default=str), _now(), _now()))
        out.append(aid)
    return [get_action(store, a) for a in out]


def get_action(store: Store, action_id: str) -> dict | None:
    rows = store.q("SELECT * FROM actions WHERE action_id=?", (action_id,))
    if not rows:
        return None
    a = dict(rows[0])
    a["payload"] = json.loads(a.pop("payload_json"))
    a["result"] = json.loads(a["result_json"]) if a.get("result_json") else None
    a.pop("result_json", None)
    return a


def list_actions(store: Store, status: str | None = None, run_id: str | None = None) -> list[dict]:
    sql, args = "SELECT action_id FROM actions WHERE 1=1", []
    if status:
        sql += " AND status=?"
        args.append(status)
    if run_id:
        sql += " AND run_id=?"
        args.append(run_id)
    sql += " ORDER BY created_at DESC"
    return [get_action(store, r["action_id"]) for r in store.q(sql, tuple(args))]


# --------------------------------------------------------------------------- approvals
def decide_action(store: Store, action_id: str, verdict: str, approver: str, reason: str = "") -> dict:
    status = {"approve": "approved", "hold": "held", "block": "blocked"}[verdict]
    store.x("""UPDATE actions SET status=?, approver=?, reason=?, updated_at=?
               WHERE action_id=? AND status IN ('pending_approval','held')""",
            (status, approver, reason, _now(), action_id))
    return get_action(store, action_id)


# --------------------------------------------------------------------------- side effects
def _effect_exists(store: Store, a: dict) -> bool:
    if a["kind"] == "activate_vendor":
        return bool(store.q("SELECT 1 FROM vendor_master WHERE vendor_id=?", (a["action_id"],)))
    if a["kind"] == "email_vendor":
        return (OUTBOX_DIR / f"{a['action_id']}.eml").exists()
    return False


def _perform(store: Store, a: dict) -> dict:
    p = a["payload"]
    if a["kind"] == "activate_vendor":
        store.x("""INSERT OR IGNORE INTO vendor_master (vendor_id, legal_name, gstin, pan, cin, domain, bank_account,
                   ifsc, city, status, added_at) VALUES (?,?,?,?,?,?,?,?,?, 'active', ?)""",
                (a["action_id"], p.get("legal_name"), p.get("gstin"), p.get("pan"), p.get("cin"),
                 (p.get("domain") or "").replace("https://", "").replace("http://", "").strip("/") or None,
                 p.get("bank_account"), p.get("ifsc"), p.get("city"), _now()))
        return {"vendor_id": a["action_id"], "added": True}
    if a["kind"] == "email_vendor":
        msg = EmailMessage()
        msg["From"] = env("SMTP_FROM", "vetted@localhost")
        msg["To"] = p["to"]
        msg["Subject"] = p["subject"]
        msg["Message-ID"] = f"<{a['action_id']}@vetted>"
        msg.set_content(p["body"])
        sent_via = "outbox file"
        if env("SMTP_HOST"):
            with smtplib.SMTP(env("SMTP_HOST"), int(env("SMTP_PORT", "587"))) as s:
                s.starttls()
                s.login(env("SMTP_USER"), env("SMTP_PASS"))
                s.send_message(msg)
            sent_via = "smtp"
        # the .eml file is written last and atomically: its presence proves the email went out
        tmp = OUTBOX_DIR / f"{a['action_id']}.eml.tmp"
        tmp.write_bytes(bytes(msg))
        os.replace(tmp, OUTBOX_DIR / f"{a['action_id']}.eml")
        return {"message_id": msg["Message-ID"], "to": p["to"], "via": sent_via}
    raise ValueError(f"unknown action kind {a['kind']}")


def execute_approved(store: Store) -> list[dict]:
    """Run every approved action exactly once. Safe to call repeatedly and after a crash."""
    done = []
    # 1) reconcile anything a crash left in `executing`
    for r in store.q("SELECT action_id FROM actions WHERE status='executing'"):
        a = get_action(store, r["action_id"])
        if _effect_exists(store, a):
            store.x("UPDATE actions SET status='done', updated_at=? WHERE action_id=?", (_now(), a["action_id"]))
        else:
            store.x("UPDATE actions SET status='approved', updated_at=? WHERE action_id=?", (_now(), a["action_id"]))
    # 2) claim and run approved actions
    for r in store.q("SELECT action_id FROM actions WHERE status='approved' ORDER BY updated_at"):
        aid = r["action_id"]
        with store.conn:  # atomic claim
            cur = store.conn.execute("UPDATE actions SET status='executing', updated_at=? WHERE action_id=? AND status='approved'",
                                     (_now(), aid))
        if cur.rowcount != 1:
            continue
        a = get_action(store, aid)
        try:
            res = {"skipped": "effect already present"} if _effect_exists(store, a) else _perform(store, a)
            store.x("""UPDATE actions SET status='done', executed_count=executed_count+?, result_json=?, updated_at=?
                       WHERE action_id=?""",
                    (0 if "skipped" in res else 1, json.dumps(res), _now(), aid))
        except Exception as e:  # leave it visible, never silently retry an irreversible step
            store.x("UPDATE actions SET status='failed', result_json=?, updated_at=? WHERE action_id=?",
                    (json.dumps({"error": str(e)}), _now(), aid))
        done.append(get_action(store, aid))
    return done
