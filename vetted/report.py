"""Builds the finished result: decision, the four answers, cited facts, cost, and what is missing."""
from __future__ import annotations

import time

from .context import RunContext
from .evidence import cite


def build_result(ctx: RunContext, state: dict, stopped: str | None) -> dict:
    d = state.get("decide") or {}
    facts = (state.get("facts") or {}).get("facts", [])
    cost = ctx.store.run_cost(ctx.run_id)
    missing = list(d.get("missing") or [])
    decision = d.get("decision", "CANNOT_VERIFY")
    if stopped:
        missing.append(f"run stopped early: {stopped}")
        if decision == "CLEARED":
            decision = "CANNOT_VERIFY"
    price = ctx.policy.get("pricing", {}).get("price_per_vendor_inr")
    result = {
        "run_id": ctx.run_id,
        "vendor": (state.get("intake") or {}).get("vendor_name") or (state.get("intake") or {}).get("domain"),
        "decision": decision,
        "legal_name": d.get("legal_name"),
        "registry_status": d.get("status"),
        "answers": d.get("answers", {}),
        "reasons": d.get("reasons", []),
        "flags": d.get("flags", []),
        "notes": d.get("notes", []),
        "missing": missing,
        "documents_to_request": d.get("documents_to_request", []),
        "personal_data": d.get("personal_data"),
        "events": ctx.store.events_for(ctx.run_id),
        "facts": [{**f, "citation": cite(f)} for f in facts if f["verified"]],
        "rejected_facts": [f for f in facts if not f["verified"]],
        "cost": {**cost, "price_inr": price,
                 "margin_inr": round(price - cost["inr"], 2) if price is not None else None},
        "seconds": round(time.time() - ctx.started_at, 1),
        "completed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    extra = [f for f in ctx.policy.get("output", {}).get("fields", []) if f not in result]
    for f in extra:
        result[f] = (state.get("decide") or {}).get(f)
    return result


def to_markdown(r: dict) -> str:
    a = r.get("answers", {})
    lines = [f"# Vetted: {r.get('vendor')}", "", f"**Decision: {r['decision']}**", ""]
    lines += ["| Question | Answer |", "|---|---|",
              f"| Real and trading? | {a.get('real_and_trading','')} |",
              f"| Who runs it? | {'; '.join(a.get('who_runs_it') or [])} |",
              f"| How long has it existed? | {a.get('how_long_it_has_existed','')} |",
              f"| Anything off? | {'; '.join(a.get('anything_off') or [])} |", ""]
    if r.get("reasons"):
        lines += ["## Why", *[f"- {x}" for x in r["reasons"]], ""]
    if r.get("missing"):
        lines += ["## Cannot verify / missing", *[f"- {x}" for x in r["missing"]], ""]
    lines += ["## Facts (each with its source)", ""]
    for f in r.get("facts", []):
        lines.append(f"- **{f['field']}**: {f['citation']}  \n  > {f['passage'][:240]}")
    c = r["cost"]
    lines += ["", f"_Cost: {c['credits']} credits, {c['tokens']} LLM tokens, Rs {c['inr']} "
                  f"({c['calls']} calls, {c['cached_calls']} cached). Time: {r['seconds']}s._"]
    return "\n".join(lines)
