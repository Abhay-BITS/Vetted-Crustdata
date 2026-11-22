"""Smoke run: a handful of vendors end to end, printing the decision and the four answers.

  .venv/bin/python -m tests.smoke                # default cases
  .venv/bin/python -m tests.smoke cases.json     # your own list of requests
"""
from __future__ import annotations

import json
import sys

from vetted.runner import run

DEFAULT_CASES = [
    {"vendor_name": "Delhivery Limited", "website": "delhivery.com"},
    {"vendor_name": "Blue Dart Express Limited", "website": "bluedart.com"},
    {"vendor_name": "Bluedart Logistics Pvt Ltd", "website": "bluedart-logistics.in"},
    {"vendor_name": "Sharma Roadlines"},
]


def main() -> None:
    cases = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else DEFAULT_CASES
    for req in cases:
        r = run(req)
        a = r.get("answers", {})
        print(f"===== {r['vendor']} -> {r['decision']} | {r.get('legal_name')} | {r.get('registry_status')}")
        print("  real:   ", a.get("real_and_trading"))
        print("  who:    ", a.get("who_runs_it"))
        print("  age:    ", a.get("how_long_it_has_existed"))
        print("  off:    ", a.get("anything_off"))
        print("  missing:", r.get("missing"))
        c = r["cost"]
        print(f"  facts: {len(r['facts'])} (rejected {len(r['rejected_facts'])}) | {c['credits']} credits, "
              f"Rs {c['inr']} | {r['seconds']}s | run {r['run_id']}")


if __name__ == "__main__":
    main()
