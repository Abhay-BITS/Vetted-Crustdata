"""HTTP API for the UI.

  .venv/bin/uvicorn vetted.api:app --port 8000

On start-up it resumes every run left `running` (e.g. after a kill) and starts the action executor,
which reconciles anything a crash left half-done before running newly approved actions.
"""
from __future__ import annotations

import csv
import httpx
import io
import json
import threading
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import actions as act
from .config import ROOT, load_policy
from .report import to_markdown
from .runner import new_run_id, run
from .store import Store

store = Store()
app = FastAPI(title="Vetted")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_active: dict[str, threading.Thread] = {}


def _start(run_id: str, request: dict) -> None:
    def work():
        try:
            run(request, run_id=run_id, store=store)
        except Exception as e:  # keep the error visible on the run
            store.finish_run(run_id, "failed", {"run_id": run_id, "error": str(e)})
        finally:
            _active.pop(run_id, None)
    t = threading.Thread(target=work, daemon=True)
    _active[run_id] = t
    t.start()


def _executor_loop() -> None:
    while True:
        try:
            act.execute_approved(store)
        except Exception:
            pass
        time.sleep(1.5)


@app.on_event("startup")
def _startup() -> None:
    # on hosts without a lasting disk the database starts empty: load the client's fixture vendor master
    if not store.q("SELECT 1 FROM vendor_master LIMIT 1"):
        fx = ROOT / "tests" / "fixtures" / "vendor_master.csv"
        if fx.exists():
            import_vendor_master_csv(store, fx.read_text())
    for r in store.q("SELECT run_id, request_json FROM runs WHERE status='running'"):
        _start(r["run_id"], json.loads(r["request_json"]))          # resume after a kill
    threading.Thread(target=_executor_loop, daemon=True).start()


# --------------------------------------------------------------------------- runs
class RunRequest(BaseModel):
    vendors: list[dict] | None = None
    vendor_name: str | None = None
    website: str | None = None
    cin: str | None = None
    gstin: str | None = None
    pan: str | None = None
    city: str | None = None
    directors: list[str] | None = None
    bank_account: str | None = None
    ifsc: str | None = None
    contact_email: str | None = None
    contact_name: str | None = None
    contact_designation: str | None = None
    account_holder: str | None = None
    entity_type: str | None = None
    llpin: str | None = None
    udyam: str | None = None
    claimed_since: str | None = None
    registered_address: str | None = None
    pincode: str | None = None
    text: str | None = None


def _start_sequence(items: list[tuple[str, dict]]) -> None:
    """Run a batch one vendor after another (kind to the per-minute rate limits)."""
    def work():
        for rid, body in items:
            try:
                run(body, run_id=rid, store=store)
            except Exception as e:
                store.finish_run(rid, "failed", {"run_id": rid, "error": str(e)})
    threading.Thread(target=work, daemon=True).start()


@app.post("/api/runs")
def create_run(req: RunRequest):
    from .batch import expand
    from .config import env
    body = {k: v for k, v in req.model_dump().items() if v}
    if not body:
        raise HTTPException(400, "send at least a vendor name, a website or free text")
    cap = int(env("MAX_RUNS_PER_HOUR", "0") or 0)
    if cap and store.q("SELECT COUNT(*) n FROM runs WHERE created_at > ?", (time.time() - 3600,))[0]["n"] >= cap:
        raise HTTPException(429, f"this demo allows {cap} checks an hour; try again shortly")
    from .privacy import protect_request
    batch_id, requests = expand(store, body)
    items = []
    for rq in requests:
        rq = protect_request(rq)
        rid = new_run_id()
        store.create_run(rid, rq)
        items.append((rid, rq))
    if len(items) == 1 and not batch_id:
        _start(*items[0])
        return {"run_id": items[0][0]}
    _start_sequence(items)
    return {"batch_id": batch_id, "run_ids": [i[0] for i in items]}


@app.get("/api/batches/{batch_id}")
def get_batch(batch_id: str):
    rows = store.q("SELECT run_id FROM runs WHERE request_json LIKE ? ORDER BY created_at", (f'%"batch_id": "{batch_id}"%',))
    out = []
    for r in rows:
        rec = store.get_run(r["run_id"]) or {}
        res = rec.get("result") or {}
        out.append({"run_id": r["run_id"], "status": rec.get("status"), "request": rec.get("request"),
                    "decision": res.get("decision"), "legal_name": res.get("legal_name"),
                    "answers": res.get("answers"), "cost": res.get("cost") or store.run_cost(r["run_id"])})
    if not out:
        raise HTTPException(404, "no such batch")
    return {"batch_id": batch_id, "runs": out}


@app.get("/api/runs")
def list_runs(limit: int = 50):
    out = []
    for r in store.list_runs(limit):
        rec = store.get_run(r["run_id"]) or {}
        res = rec.get("result") or {}
        out.append({**r, "decision": res.get("decision"), "vendor": res.get("vendor") or
                    r["request"].get("vendor_name") or r["request"].get("website"),
                    "cost": res.get("cost")})
    return out


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    rec = store.get_run(run_id)
    if not rec:
        raise HTTPException(404, "no such run")
    from .pipeline import STEPS
    done = {s["step"]: s for s in store.steps_for(run_id)}
    steps, marked = [], False
    for name, _ in STEPS:
        if name in done:
            steps.append({"step": name, "status": "done",
                          "seconds": round(done[name]["finished_at"] - done[name]["started_at"], 1)})
        elif rec["status"] == "running" and not marked:
            steps.append({"step": name, "status": "running", "seconds": None})
            marked = True
        else:
            steps.append({"step": name, "status": "pending", "seconds": None})
    return {**rec, "steps": steps, "cost_live": store.run_cost(run_id), "events": store.events_for(run_id),
            "actions": act.list_actions(store, run_id=run_id)}


@app.get("/api/runs/{run_id}/markdown")
def run_markdown(run_id: str):
    rec = store.get_run(run_id)
    if not rec or not rec.get("result"):
        raise HTTPException(404, "no result yet")
    return JSONResponse({"markdown": to_markdown(rec["result"])})


@app.get("/api/runs/{run_id}/log")
def run_log(run_id: str):
    from .config import LOG_DIR
    f = LOG_DIR / f"{run_id}.jsonl"
    if not f.exists():
        return {"lines": []}
    lines = []
    for ln in f.read_text().splitlines():
        try:
            lines.append(json.loads(ln))
        except Exception:
            pass
    return {"lines": lines}


@app.get("/api/runs/{run_id}/evidence")
def run_evidence(run_id: str, fmt: str = "md"):
    from fastapi.responses import HTMLResponse, PlainTextResponse
    from .evidence_file import evidence_html, evidence_markdown
    rec = store.get_run(run_id)
    if not rec or not rec.get("result"):
        raise HTTPException(404, "no result yet")
    acts = act.list_actions(store, run_id=run_id)
    ledger = store.calls_for(run_id)
    if fmt == "html":
        return HTMLResponse(evidence_html(rec, acts, ledger))
    name = (rec["result"].get("vendor") or run_id).replace(" ", "-")
    return PlainTextResponse(evidence_markdown(rec, acts, ledger), media_type="text/markdown",
                             headers={"Content-Disposition": f'attachment; filename="vetted-evidence-{name}-{run_id}.md"'})


@app.get("/api/runs/{run_id}/ledger")
def run_ledger(run_id: str):
    return {"summary": store.run_cost(run_id), "calls": store.calls_for(run_id)}


# --------------------------------------------------------------------------- approvals
class Verdict(BaseModel):
    approver: str
    pin: str = ""
    reason: str = ""


def _approvers() -> dict[str, str]:
    from .config import env
    out = {}
    for part in (env("APPROVERS") or "").split(","):
        if ":" in part:
            name, pin = part.rsplit(":", 1)
            out[name.strip()] = pin.strip()
    return out


@app.get("/api/approvers")
def approvers():
    return {"approvers": list(_approvers().keys())}


@app.get("/api/actions")
def get_actions(status: str | None = None):
    return act.list_actions(store, status=status)


@app.post("/api/actions/{action_id}/{verdict}")
def decide(action_id: str, verdict: str, v: Verdict):
    if verdict not in ("approve", "hold", "block"):
        raise HTTPException(400, "verdict must be approve, hold or block")
    if not v.approver.strip():
        raise HTTPException(400, "a named approver is required")
    known = _approvers()
    if known:
        if v.approver.strip() not in known:
            raise HTTPException(403, "this person is not an approver")
        if v.pin.strip() != known[v.approver.strip()]:
            raise HTTPException(403, "wrong PIN for this approver")
    if verdict == "block" and not v.reason.strip():
        raise HTTPException(400, "give a reason for blocking; the vendor is told why")
    a = act.decide_action(store, action_id, verdict, v.approver.strip(), v.reason)
    if not a:
        raise HTTPException(404, "no such action")
    return a


# --------------------------------------------------------------------------- client records
@app.get("/api/vendor-master")
def vendor_master():
    return [dict(r) for r in store.q("SELECT * FROM vendor_master ORDER BY added_at DESC")]


@app.post("/api/vendor-master/import")
async def import_master(file: UploadFile):
    text = (await file.read()).decode("utf-8", "ignore")
    n = import_vendor_master_csv(store, text)
    return {"imported": n}


def import_vendor_master_csv(st: Store, text: str) -> int:
    from .privacy import account_hash
    n = 0
    for row in csv.DictReader(io.StringIO(text)):
        row = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
        vid = row.get("vendor_id") or f"M-{n + 1:04d}"
        st.x("""INSERT OR REPLACE INTO vendor_master (vendor_id, legal_name, gstin, pan, cin, domain, bank_account,
                ifsc, city, status, added_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
             (vid, row.get("legal_name") or row.get("name"), row.get("gstin"), row.get("pan"), row.get("cin"),
              row.get("domain") or row.get("website"),
              row.get("bank_account") if str(row.get("bank_account") or "").startswith("h:") else account_hash(row.get("bank_account")),
              row.get("ifsc"), row.get("city"),
              row.get("status") or "active", time.time()))
        n += 1
    return n


# --------------------------------------------------------------------------- plans and billing
class CheckoutReq(BaseModel):
    plan: str


class ConfirmReq(BaseModel):
    order_id: str
    payment_id: str | None = None
    signature: str | None = None


@app.get("/api/plans")
def get_plans():
    from . import billing
    return {"plans": billing.plans(), "mode": billing.mode()}


@app.get("/api/billing")
def get_billing():
    from . import billing
    return {**billing.usage(store), "mode": billing.mode(), "history": billing.history(store)}


@app.post("/api/billing/checkout")
def checkout(req: CheckoutReq):
    from . import billing
    try:
        return billing.create_checkout(store, req.plan)
    except (ValueError, httpx.HTTPError) as e:
        raise HTTPException(400, str(e))


@app.post("/api/billing/confirm")
def confirm_payment(req: ConfirmReq):
    from . import billing
    try:
        return billing.confirm(store, req.order_id, req.payment_id, req.signature)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/summary")
def summary():
    runs = store.q("SELECT result_json FROM runs WHERE result_json IS NOT NULL")
    decisions: dict[str, int] = {}
    full, paid, secs = [], [], []
    for r in runs:
        res = json.loads(r["result_json"])
        if not res.get("decision"):
            continue
        decisions[res.get("decision", "?")] = decisions.get(res.get("decision", "?"), 0) + 1
        c = res.get("cost") or {}
        if c.get("full_inr"):
            full.append(c["full_inr"])
        paid.append(c.get("inr", 0))
        if c.get("calls") and not c.get("cached_calls") and res.get("seconds"):
            secs.append(res["seconds"])
    pol = load_policy()
    avg = lambda xs: round(sum(xs) / len(xs), 2) if xs else 0
    return {"decisions": decisions, "runs": sum(decisions.values()),
            "avg_cost_inr": avg(full),            # the cost of one check when nothing is cached
            "avg_paid_inr": avg(paid),            # what was actually spent per check (cache reuse included)
            "avg_seconds": avg(secs) or None,
            "price_per_vendor_inr": pol["pricing"]["price_per_vendor_inr"],
            "pending_approvals": len(act.list_actions(store, status="pending_approval"))}


# --------------------------------------------------------------------------- UI
UI_DIST = ROOT / "ui" / "dist"
if UI_DIST.exists():
    app.mount("/assets", StaticFiles(directory=UI_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = UI_DIST / path
        if path and f.exists() and f.is_file():
            return FileResponse(f)
        return FileResponse(UI_DIST / "index.html")
