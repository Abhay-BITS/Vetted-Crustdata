"""Data minimisation helpers."""
from __future__ import annotations

import hashlib
import re


def account_hash(number: str | None) -> str | None:
    digits = re.sub(r"\D", "", number or "")
    if not digits:
        return None
    return "h:" + hashlib.sha256(("vetted-acct|" + digits).encode()).hexdigest()[:24]


def protect_request(req: dict) -> dict:
    """Replace a full bank account number with a one-way hash (for duplicate checks) and its last 4 digits."""
    r = dict(req)
    num = r.pop("bank_account", None)
    if num:
        digits = re.sub(r"\D", "", str(num))
        r["bank_account_hash"] = account_hash(digits)
        r["bank_account_last4"] = digits[-4:]
    return r
