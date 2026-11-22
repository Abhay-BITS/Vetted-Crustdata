"""Per-run context: identity, policy, budget guard and structured logging."""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field

from .config import LOG_DIR
from .store import Store


class BudgetExceeded(Exception):
    """Raised before a call that would break the run's time or cost limit."""


class OutOfCredits(Exception):
    """Crustdata returned 402: retrying will not help."""


@dataclass
class RunContext:
    run_id: str
    store: Store
    policy: dict
    started_at: float = field(default_factory=time.time)
    step: str = "init"

    # ---- limits --------------------------------------------------------
    def check_budget(self) -> None:
        lim = self.policy.get("limits", {})
        elapsed = time.time() - self.started_at
        if elapsed > lim.get("max_seconds_per_run", 1e9):
            raise BudgetExceeded(f"time limit reached ({elapsed:.0f}s > {lim['max_seconds_per_run']}s)")
        cost = self.store.run_cost(self.run_id)
        if cost["credits"] >= lim.get("max_credits_per_run", 1e9):
            raise BudgetExceeded(f"credit limit reached ({cost['credits']} >= {lim['max_credits_per_run']})")
        if cost["inr"] >= lim.get("max_inr_per_run", 1e9):
            raise BudgetExceeded(f"cost limit reached (Rs {cost['inr']} >= Rs {lim['max_inr_per_run']})")

    def credits_to_inr(self, credits: float) -> float:
        return round(credits * float(self.policy.get("pricing", {}).get("inr_per_credit", 0)), 4)

    # ---- logging -------------------------------------------------------
    def log(self, event: str, **data) -> None:
        rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "run_id": self.run_id, "step": self.step, "event": event, **data}
        with open(LOG_DIR / f"{self.run_id}.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, default=str) + "\n")
