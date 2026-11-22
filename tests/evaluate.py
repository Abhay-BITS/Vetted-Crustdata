"""Evaluate the service on a set of requests with known right answers.

  .venv/bin/python -m tests.evaluate tests/cases.json

Loads the client's vendor-master fixture (mock data, for tests only), runs every case and prints
the pass rate, wrong answers (worse than "cannot verify") and the measured cost per job.
"""
from __future__ import annotations

import json
import sys

from vetted.api import import_vendor_master_csv
from vetted.config import ROOT
from vetted.runner import run
from vetted.store import Store


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "tests" / "cases.json")
    st = Store()
    import_vendor_master_csv(st, open(ROOT / "tests" / "fixtures" / "vendor_master.csv").read())
    cases = json.load(open(path))
    passed, wrong, rows, inr, credits = 0, 0, [], 0.0, 0.0
    for c in cases:
        r = run(c["request"], store=st)
        ok = r["decision"] in c["expect"]
        passed += ok
        # a wrong clearance is the worst outcome; "cannot verify" where a decision was expected is safer
        if not ok and (r["decision"] == "CLEARED" or "CANNOT_VERIFY" not in (r["decision"],)):
            wrong += 1
        inr += r["cost"]["inr"]
        credits += r["cost"]["credits"]
        rows.append((c["id"], r["decision"], "/".join(c["expect"]), "PASS" if ok else "FAIL", r["run_id"]))
    w = max(len(x[0]) for x in rows)
    for row in rows:
        print(f"{row[3]}  {row[0]:<{w}}  got {row[1]:<15} expected {row[2]:<22} {row[4]}")
    n = len(cases)
    print(f"\n{passed}/{n} passed ({passed / n:.0%}); wrong answers: {wrong}; "
          f"cost this run: {credits:.2f} credits, Rs {inr:.2f} (cached calls cost 0)")


if __name__ == "__main__":
    main()
