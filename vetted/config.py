"""Configuration: environment keys and policy.yaml (re-read on every run)."""
from __future__ import annotations

import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
LOG_DIR = ROOT / "logs"
DATA_DIR.mkdir(exist_ok=True)
LOG_DIR.mkdir(exist_ok=True)

load_dotenv(ROOT / ".env", override=True)


def env(name: str, default: str | None = None) -> str | None:
    """Read a setting; stray surrounding quotes (common when pasting into a hosting dashboard) are removed."""
    v = os.environ.get(name, default)
    if isinstance(v, str):
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1].strip()
    return v


def load_policy(path: Path | None = None) -> dict:
    """Policy is loaded fresh for each run so mid-event rule changes apply immediately."""
    p = path or Path(env("VETTED_POLICY", str(ROOT / "policy.yaml")))
    with open(p, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


DB_PATH = Path(env("VETTED_DB", str(DATA_DIR / "vetted.db")))
