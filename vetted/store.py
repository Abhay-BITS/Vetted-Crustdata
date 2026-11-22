"""SQLite store: runs, checkpointed steps, response cache, cost ledger, actions outbox."""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    status TEXT NOT NULL,              -- running | done | stopped | failed
    request_json TEXT NOT NULL,
    result_json TEXT
);
CREATE TABLE IF NOT EXISTS steps (
    run_id TEXT NOT NULL,
    step TEXT NOT NULL,
    status TEXT NOT NULL,              -- done | failed
    output_json TEXT,
    started_at REAL,
    finished_at REAL,
    PRIMARY KEY (run_id, step)
);
CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    status_code INTEGER,
    body TEXT,
    headers_json TEXT,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS calls (               -- the cost ledger
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    step TEXT,
    provider TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_hash TEXT,
    status_code INTEGER,
    outcome TEXT,                       -- ok | cached | not_found | unavailable | denied | error
    credits REAL DEFAULT 0,
    tokens INTEGER DEFAULT 0,
    inr REAL DEFAULT 0,
    duration_ms INTEGER,
    ts REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS actions (             -- the outbox for irreversible actions
    action_id TEXT PRIMARY KEY,         -- idempotency key
    run_id TEXT NOT NULL,
    kind TEXT NOT NULL,                 -- activate_vendor | email_vendor | test_payment
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,               -- pending_approval | approved | executing | done | held | blocked | failed
    executed_count INTEGER DEFAULT 0,
    approver TEXT,
    reason TEXT,
    result_json TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    ts REAL NOT NULL,
    kind TEXT NOT NULL,
    data_json TEXT
);
CREATE TABLE IF NOT EXISTS vendor_master (
    vendor_id TEXT PRIMARY KEY,
    legal_name TEXT,
    gstin TEXT, pan TEXT, cin TEXT,
    domain TEXT, bank_account TEXT, ifsc TEXT,
    city TEXT, status TEXT,
    added_at REAL
);
"""

_lock = threading.Lock()


def hash_request(*parts: Any) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


class Store:
    def __init__(self, path: Path | str = DB_PATH):
        self.path = str(path)
        self.conn = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=FULL")
        self.conn.executescript(SCHEMA)
        for col in ("list_credits REAL DEFAULT 0", "list_inr REAL DEFAULT 0"):
            try:
                self.conn.execute(f"ALTER TABLE calls ADD COLUMN {col}")
            except sqlite3.OperationalError:
                pass

    # ---- generic -------------------------------------------------------
    def q(self, sql: str, args: tuple = ()) -> list[sqlite3.Row]:
        with _lock:
            return list(self.conn.execute(sql, args))

    def x(self, sql: str, args: tuple = ()) -> None:
        with _lock:
            self.conn.execute(sql, args)

    # ---- runs ----------------------------------------------------------
    def create_run(self, run_id: str, request: dict) -> None:
        now = time.time()
        self.x("INSERT OR IGNORE INTO runs VALUES (?,?,?,?,?,NULL)",
               (run_id, now, now, "running", json.dumps(request)))

    def get_run(self, run_id: str) -> dict | None:
        rows = self.q("SELECT * FROM runs WHERE run_id=?", (run_id,))
        if not rows:
            return None
        r = dict(rows[0])
        r["request"] = json.loads(r.pop("request_json"))
        r["result"] = json.loads(r["result_json"]) if r.get("result_json") else None
        r.pop("result_json", None)
        return r

    def finish_run(self, run_id: str, status: str, result: dict | None) -> None:
        self.x("UPDATE runs SET status=?, result_json=?, updated_at=? WHERE run_id=?",
               (status, json.dumps(result, default=str) if result else None, time.time(), run_id))

    def list_runs(self, limit: int = 50) -> list[dict]:
        rows = self.q("SELECT run_id, created_at, status, request_json FROM runs ORDER BY created_at DESC LIMIT ?", (limit,))
        return [{"run_id": r["run_id"], "created_at": r["created_at"], "status": r["status"],
                 "request": json.loads(r["request_json"])} for r in rows]

    # ---- steps (checkpoints) ------------------------------------------
    def get_step(self, run_id: str, step: str) -> dict | None:
        rows = self.q("SELECT output_json FROM steps WHERE run_id=? AND step=? AND status='done'", (run_id, step))
        return json.loads(rows[0]["output_json"]) if rows else None

    def save_step(self, run_id: str, step: str, output: dict, started: float) -> None:
        self.x("INSERT OR REPLACE INTO steps VALUES (?,?,?,?,?,?)",
               (run_id, step, "done", json.dumps(output, default=str), started, time.time()))

    def steps_for(self, run_id: str) -> list[dict]:
        rows = self.q("SELECT step, status, started_at, finished_at FROM steps WHERE run_id=? ORDER BY started_at", (run_id,))
        return [dict(r) for r in rows]

    # ---- cache ---------------------------------------------------------
    def cache_get(self, key: str, max_age_s: float | None = None) -> dict | None:
        rows = self.q("SELECT status_code, body, headers_json, created_at FROM cache WHERE key=?", (key,))
        if not rows:
            return None
        r = rows[0]
        if max_age_s is not None and time.time() - r["created_at"] > max_age_s:
            return None
        return {"status_code": r["status_code"], "body": r["body"], "headers": json.loads(r["headers_json"] or "{}")}

    def cache_put(self, key: str, provider: str, status_code: int, body: str, headers: dict) -> None:
        self.x("INSERT OR REPLACE INTO cache VALUES (?,?,?,?,?,?)",
               (key, provider, status_code, body, json.dumps(headers), time.time()))

    # ---- cost ledger ---------------------------------------------------
    def record_call(self, **kw: Any) -> None:
        self.x("""INSERT INTO calls (run_id, step, provider, endpoint, request_hash, status_code, outcome,
                  credits, tokens, inr, duration_ms, ts, list_credits, list_inr) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
               (kw.get("run_id"), kw.get("step"), kw["provider"], kw["endpoint"], kw.get("request_hash"),
                kw.get("status_code"), kw.get("outcome"), kw.get("credits", 0), kw.get("tokens", 0),
                kw.get("inr", 0), kw.get("duration_ms"), time.time(),
                kw.get("list_credits", kw.get("credits", 0)), kw.get("list_inr", kw.get("inr", 0))))

    def run_cost(self, run_id: str) -> dict:
        r = self.q("""SELECT COALESCE(SUM(credits),0) c, COALESCE(SUM(tokens),0) t, COALESCE(SUM(inr),0) i,
                      COALESCE(SUM(list_credits),0) lc, COALESCE(SUM(list_inr),0) li,
                      COUNT(*) n, SUM(CASE WHEN outcome='cached' THEN 1 ELSE 0 END) cached
                      FROM calls WHERE run_id=?""", (run_id,))[0]
        return {"credits": round(r["c"], 3), "tokens": r["t"], "inr": round(r["i"], 2),
                "calls": r["n"], "cached_calls": r["cached"] or 0,
                # what this job costs when nothing is cached: the honest unit cost
                "full_credits": round(max(r["lc"], r["c"]), 3), "full_inr": round(max(r["li"], r["i"]), 2)}

    # ---- events (resumes, outages) -----------------------------------
    def add_event(self, run_id: str, kind: str, data: dict | None = None) -> None:
        self.x("INSERT INTO events (run_id, ts, kind, data_json) VALUES (?,?,?,?)",
               (run_id, time.time(), kind, json.dumps(data or {}, default=str)))

    def events_for(self, run_id: str) -> list[dict]:
        rows = self.q("SELECT ts, kind, data_json FROM events WHERE run_id=? ORDER BY id", (run_id,))
        return [{"ts": r["ts"], "kind": r["kind"], **json.loads(r["data_json"] or "{}")} for r in rows]

    # ---- housekeeping ----------------------------------------------------
    def reset_demo(self, keep_cache: bool = True) -> None:
        for t in ("runs", "steps", "calls", "actions", "events"):
            self.x(f"DELETE FROM {t}")
        self.x("DELETE FROM vendor_master WHERE vendor_id NOT LIKE 'FX-%'")
        if not keep_cache:
            self.x("DELETE FROM cache")

    def purge_older_than(self, days: float) -> dict:
        """Delete runs (and the personal data in them) older than the retention period."""
        cutoff = time.time() - days * 86400
        old = [r["run_id"] for r in self.q("SELECT run_id FROM runs WHERE created_at < ?", (cutoff,))]
        for rid in old:
            for t in ("steps", "calls", "events"):
                self.x(f"DELETE FROM {t} WHERE run_id=?", (rid,))
            self.x("DELETE FROM actions WHERE run_id=? AND status NOT IN ('pending_approval','approved','executing')", (rid,))
            self.x("DELETE FROM runs WHERE run_id=?", (rid,))
        self.x("DELETE FROM cache WHERE created_at < ?", (cutoff,))
        return {"runs_deleted": len(old)}

    def calls_for(self, run_id: str) -> list[dict]:
        return [dict(r) for r in self.q("SELECT * FROM calls WHERE run_id=? ORDER BY id", (run_id,))]
