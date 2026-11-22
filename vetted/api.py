"""HTTP API for the UI.

  .venv/bin/uvicorn vetted.api:app --port 8000

On start-up it resumes every run left `running` (e.g. after a kill) and starts the action executor,
which reconciles anything a crash left half-done before running newly approved actions.
"""
from __future__ import annotations

import csv
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
    for r in store.q("SELECT run_id, request_json FROM runs WHERE status='running'"):
        _start(r["run_id"], json.loads(r["request_json"]))          # resume after a kill
    threading.Thread(target=_executor_loop, daemon=True).start()


# --------------------------------------------------------------------------- runs
class RunRequest(BaseModel):
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
    text: str | None = None


@app.post("/api/runs")
def create_run(req: RunRequest):
    body = {k: v for k, v in req.model_dump().items() if v}
    if not body:
        raise HTTPException(400, "send at least a vendor name, a website or free text")
    rid = new_run_id()
    store.create_run(rid, body)
    _start(rid, body)
    return {"run_id": rid}


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
    return {**rec, "steps": steps, "cost_live": store.run_cost(run_id),
            "actions": act.list_actions(store, run_id=run_id)}


@app.get("/api/runs/{run_id}/markdown")
def run_markdown(run_id: str):
    rec = store.get_run(run_id)
    if not rec or not rec.get("result"):
        raise HTTPException(404, "no result yet")
    return JSONResponse({"markdown": to_markdown(rec["result"])})


@app.get("/api/runs/{run_id}/ledger")
def run_ledger(run_id: str):
    return {"summary": store.run_cost(run_id), "calls": store.calls_for(run_id)}


# --------------------------------------------------------------------------- approvals
class Verdict(BaseModel):
    approver: str
    reason: str = ""


@app.get("/api/actions")
def get_actions(status: str | None = None):
    return act.list_actions(store, status=status)


@app.post("/api/actions/{action_id}/{verdict}")
def decide(action_id: str, verdict: str, v: Verdict):
    if verdict not in ("approve", "hold", "block"):
        raise HTTPException(400, "verdict must be approve, hold or block")
    if not v.approver.strip():
        raise HTTPException(400, "a named approver is required")
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
    n = 0
    for row in csv.DictReader(io.StringIO(text)):
        row = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
        vid = row.get("vendor_id") or f"M-{n + 1:04d}"
        st.x("""INSERT OR REPLACE INTO vendor_master (vendor_id, legal_name, gstin, pan, cin, domain, bank_account,
                ifsc, city, status, added_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
             (vid, row.get("legal_name") or row.get("name"), row.get("gstin"), row.get("pan"), row.get("cin"),
              row.get("domain") or row.get("website"), row.get("bank_account"), row.get("ifsc"), row.get("city"),
              row.get("status") or "active", time.time()))
        n += 1
    return n


@app.get("/api/summary")
def summary():
    runs = store.q("SELECT result_json FROM runs WHERE result_json IS NOT NULL")
    decisions: dict[str, int] = {}
    total_inr, n = 0.0, 0
    for r in runs:
        res = json.loads(r["result_json"])
        decisions[res.get("decision", "?")] = decisions.get(res.get("decision", "?"), 0) + 1
        if res.get("cost", {}).get("calls"):
            total_inr += res["cost"].get("inr", 0)
            n += 1
    pol = load_policy()
    return {"decisions": decisions, "runs": len(runs), "avg_cost_inr": round(total_inr / n, 2) if n else 0,
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
