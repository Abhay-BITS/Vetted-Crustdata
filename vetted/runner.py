"""Checkpointed runner. A killed run resumes at the first unfinished step; cached calls cost nothing."""
from __future__ import annotations

import time
import uuid

from .config import load_policy
from .context import BudgetExceeded, OutOfCredits, RunContext
from .pipeline import STEPS
from .report import build_result
from .store import Store


def new_run_id() -> str:
    return time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]


def run(request: dict, run_id: str | None = None, store: Store | None = None, on_step=None) -> dict:
    store = store or Store()
    run_id = run_id or new_run_id()
    existing = store.get_run(run_id)
    if existing is None:
        store.create_run(run_id, request)
    else:
        request = existing["request"]
        if existing["status"] == "done" and existing.get("result"):
            return existing["result"]

    ctx = RunContext(run_id=run_id, store=store, policy=load_policy())
    first = store.q("SELECT MIN(started_at) s FROM steps WHERE run_id=?", (run_id,))[0]["s"]
    if first:
        # time limit counts from the original start, minus nothing: a resumed run keeps its clock
        ctx.started_at = min(ctx.started_at, first)
    state: dict = {"request": request}
    stopped = None
    ctx.log("run_start", resumed=bool(existing))
    for name, fn in STEPS:
        ctx.step = name
        saved = store.get_step(run_id, name)
        if saved is not None:
            state[name] = saved
            ctx.log("step_resumed_from_checkpoint")
            if on_step:
                on_step(name, "resumed", saved)
            continue
        if stopped and name not in ("facts", "decide"):
            state[name] = {"skipped": stopped}
            continue
        started = time.time()
        try:
            out = fn(ctx, state)
        except BudgetExceeded as e:
            stopped = str(e)
            ctx.log("budget_stop", reason=stopped)
            state[name] = {"skipped": stopped}
            continue
        except OutOfCredits as e:
            stopped = str(e)
            ctx.log("out_of_credits", reason=stopped)
            state[name] = {"skipped": stopped}
            continue
        state[name] = out
        store.save_step(run_id, name, out, started)
        ctx.log("step_done", seconds=round(time.time() - started, 2))
        if on_step:
            on_step(name, "done", out)

    result = build_result(ctx, state, stopped)
    store.finish_run(run_id, "stopped" if stopped else "done", result)
    from .actions import propose_actions
    result["actions"] = [{"action_id": a["action_id"], "kind": a["kind"], "status": a["status"]}
                         for a in propose_actions(store, result, request)]
    store.finish_run(run_id, "stopped" if stopped else "done", result)
    ctx.log("run_end", decision=result["decision"], cost=result["cost"])
    return result
