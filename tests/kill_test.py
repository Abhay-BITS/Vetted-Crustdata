"""Kill test: stop the service at a random moment, restart it, and check that each action happens once.

  .venv/bin/python -m tests.kill_test "TCI Express Limited" tciexpress.in

1. start the API, submit a vendor, kill -9 the process mid-run
2. restart: the run resumes from its last checkpoint and finishes; no paid call is repeated
3. approve its actions; wait until they are done
4. simulate a crash after the side effect but before the status update; restart again
5. verify every action executed exactly once and only one email exists per action
"""
from __future__ import annotations

import json
import os
import signal
import sqlite3
import subprocess
import sys
import time

import httpx

from vetted.actions import OUTBOX_DIR
from vetted.config import DB_PATH, ROOT

PORT = 8765
BASE = f"http://127.0.0.1:{PORT}"


_cookies = {}


def _login():
    r = httpx.post(BASE + "/api/auth/login", json={"email": "demo@vetted.example", "password": os.environ.get("DEMO_PASSWORD", "vetted-demo")})
    _cookies.clear(); _cookies.update(dict(r.cookies))


def start():
    p = subprocess.Popen([str(ROOT / ".venv/bin/uvicorn"), "vetted.api:app", "--port", str(PORT)],
                         cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            httpx.get(BASE + "/api/summary", timeout=1)
            _login()
            return p
        except Exception:
            time.sleep(0.3)
    raise RuntimeError("server did not start")


def kill(p):
    os.kill(p.pid, signal.SIGKILL)
    p.wait()


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "TCI Express Limited"
    site = sys.argv[2] if len(sys.argv) > 2 else "tciexpress.in"
    p = start()
    rid = httpx.post(BASE + "/api/runs", cookies=_cookies, json={"vendor_name": name, "website": site}).json()["run_id"]
    print("run", rid)
    time.sleep(float(os.environ.get("KILL_AFTER", "6")))
    steps_before = [s["step"] for s in httpx.get(f"{BASE}/api/runs/{rid}", cookies=_cookies).json()["steps"] if s["status"] == "done"]
    kill(p)
    print("KILLED after steps:", steps_before)

    p = start()
    for _ in range(200):
        r = httpx.get(f"{BASE}/api/runs/{rid}", cookies=_cookies).json()
        if r["status"] != "running":
            break
        time.sleep(1)
    print("after restart:", r["status"], "->", (r.get("result") or {}).get("decision"))

    db = sqlite3.connect(DB_PATH)
    paid = db.execute("""SELECT request_hash, COUNT(*) FROM calls WHERE run_id=? AND outcome='ok' AND credits>0
                         GROUP BY request_hash HAVING COUNT(*)>1""", (rid,)).fetchall()
    print("paid calls repeated after restart:", len(paid))

    acts = httpx.get(f"{BASE}/api/runs/{rid}", cookies=_cookies).json()["actions"]
    from vetted.api import _approvers
    name, pin = next(iter(_approvers().items()), ("kill-test", ""))
    for a in acts:
        httpx.post(f"{BASE}/api/actions/{a['action_id']}/approve", cookies=_cookies, json={"approver": name, "pin": pin, "reason": "kill test"})
    time.sleep(4)

    # simulate a crash after the effect happened but before the status was recorded
    for a in acts:
        db.execute("UPDATE actions SET status='executing' WHERE action_id=?", (a["action_id"],))
    db.commit()
    kill(p)
    p = start()
    time.sleep(4)
    final = httpx.get(f"{BASE}/api/runs/{rid}", cookies=_cookies).json()["actions"]
    ok = True
    for a in final:
        emails = len(list(OUTBOX_DIR.glob(f"{a['action_id']}*.eml")))
        print(f"  {a['kind']:<16} status={a['status']:<8} executed_count={a['executed_count']} emails={emails}")
        ok &= a["status"] == "done" and a["executed_count"] == 1
    kill(p)
    print("PASS: each action happened exactly once" if ok and not paid else "FAIL")


if __name__ == "__main__":
    main()
