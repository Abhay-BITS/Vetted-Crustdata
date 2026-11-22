"""Requests that name several vendors: split them, then run one check per vendor."""
from __future__ import annotations

import re
import time
import uuid

from .config import load_policy
from .context import RunContext
from .clients.llm import LLM
from .store import Store

SPLIT_PROMPT = (
    "A client sent a request to clear one or more new vendors. Return JSON: {\"vendors\": [ {\"vendor_name\", "
    "\"website\", \"cin\", \"gstin\", \"pan\", \"city\", \"directors\" (list), \"bank_account\", \"ifsc\"} ]}. "
    "One object per vendor, in the order given. Use null for anything not stated. Never add facts that are not in the text."
)


def new_batch_id() -> str:
    return "B" + time.strftime("%H%M%S") + "-" + uuid.uuid4().hex[:4]


def split_text(store: Store, text: str, batch_id: str) -> list[dict]:
    """Ask the LLM to list the vendors in a free-text request. Falls back to one request with the text."""
    ctx = RunContext(run_id=batch_id, store=store, policy=load_policy(), step="split")
    out = LLM(ctx).json_chat(SPLIT_PROMPT, text, max_tokens=1200)
    vendors = (out or {}).get("vendors") if isinstance(out, dict) else None
    clean = []
    for v in vendors or []:
        v = {k: val for k, val in (v or {}).items() if val}
        if v.get("vendor_name") or v.get("website"):
            clean.append(v)
    if not clean:
        return [{"text": text}]
    for v in clean:
        v["source_text"] = text[:2000]
    return clean


def expand(store: Store, body: dict) -> tuple[str | None, list[dict]]:
    """Turn one API body into one or more run requests. Returns (batch_id or None, requests)."""
    vendors = body.get("vendors")
    shared = {k: v for k, v in body.items() if k in ("contact_email",) and v}
    if vendors:
        bid = new_batch_id()
        return bid, [{**shared, **v, "batch_id": bid} for v in vendors if v]
    if body.get("text") and not body.get("vendor_name"):
        bid = new_batch_id()
        reqs = split_text(store, body["text"], bid)
        if len(reqs) > 1:
            return bid, [{**shared, **r, "batch_id": bid} for r in reqs]
        return None, [{**shared, **reqs[0]}]
    return None, [body]
