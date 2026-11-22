"""Plans, usage and checkout. Payments run only in a provider's test mode (Razorpay), or as a clearly labelled
simulated test payment when no provider keys are configured. A checkout is paid exactly once."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime

import httpx

from .config import env, load_policy
from .store import Store


def plans() -> list[dict]:
    return load_policy().get("plans", [])


def plan_by_id(pid: str) -> dict | None:
    return next((p for p in plans() if p["id"] == pid), None)


def current_plan(store: Store) -> dict:
    rows = store.q("SELECT value FROM account WHERE key='plan'")
    return plan_by_id(rows[0]["value"] if rows else "payg") or plans()[0]


def month_start() -> float:
    n = datetime.now()
    return datetime(n.year, n.month, 1).timestamp()


def usage(store: Store) -> dict:
    checks = store.q("SELECT COUNT(*) n FROM runs WHERE created_at >= ? AND result_json IS NOT NULL", (month_start(),))[0]["n"]
    p = current_plan(store)
    extra = max(0, checks - p["included_checks"])
    amount = p["monthly_inr"] + extra * p["extra_check_inr"]
    return {"plan": p, "checks_this_month": checks, "included": p["included_checks"], "extra_checks": extra,
            "invoice_preview_inr": amount, "period": datetime.now().strftime("%B %Y")}


def mode() -> str:
    return "razorpay_test" if env("RAZORPAY_KEY_ID") and env("RAZORPAY_KEY_SECRET") else "simulated_test"


def create_checkout(store: Store, plan_id: str) -> dict:
    p = plan_by_id(plan_id)
    if not p:
        raise ValueError("unknown plan")
    amount = p["monthly_inr"] or p["extra_check_inr"]  # pay-as-you-go: a one-check top-up
    m = mode()
    if m == "razorpay_test":
        if not env("RAZORPAY_KEY_ID", "").startswith("rzp_test_"):
            raise ValueError("only Razorpay test keys (rzp_test_...) are allowed")
        auth = base64.b64encode(f"{env('RAZORPAY_KEY_ID')}:{env('RAZORPAY_KEY_SECRET')}".encode()).decode()
        r = httpx.post("https://api.razorpay.com/v1/orders", timeout=20,
                       headers={"Authorization": f"Basic {auth}"},
                       json={"amount": int(amount * 100), "currency": "INR", "receipt": f"vetted-{plan_id}-{int(time.time())}",
                             "notes": {"plan": plan_id}})
        r.raise_for_status()
        order_id = r.json()["id"]
    else:
        order_id = "sim_" + uuid.uuid4().hex[:16]
    store.x("INSERT INTO billing_orders VALUES (?,?,?,?, 'created', NULL, ?, NULL)", (order_id, plan_id, amount, m, time.time()))
    return {"order_id": order_id, "plan": p, "amount_inr": amount, "mode": m, "key_id": env("RAZORPAY_KEY_ID") if m == "razorpay_test" else None}


def confirm(store: Store, order_id: str, payment_id: str | None, signature: str | None) -> dict:
    rows = store.q("SELECT * FROM billing_orders WHERE order_id=?", (order_id,))
    if not rows:
        raise ValueError("unknown order")
    o = dict(rows[0])
    if o["status"] == "paid":  # idempotent: a repeated confirmation never charges or changes anything twice
        return {**o, "already_paid": True}
    if o["provider"] == "razorpay_test":
        expected = hmac.new(env("RAZORPAY_KEY_SECRET").encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
        if not signature or not hmac.compare_digest(expected, signature):
            raise ValueError("payment signature does not verify")
    else:
        payment_id = payment_id or ("simpay_" + uuid.uuid4().hex[:12])
    with store.conn:
        cur = store.conn.execute("UPDATE billing_orders SET status='paid', payment_id=?, paid_at=? WHERE order_id=? AND status='created'",
                                 (payment_id, time.time(), order_id))
    if cur.rowcount == 1:
        store.x("INSERT OR REPLACE INTO account VALUES ('plan', ?)", (o["plan"],))
    return dict(store.q("SELECT * FROM billing_orders WHERE order_id=?", (order_id,))[0])


def history(store: Store) -> list[dict]:
    return [dict(r) for r in store.q("SELECT * FROM billing_orders ORDER BY created_at DESC LIMIT 20")]
