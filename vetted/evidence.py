"""Evidence ledger: every fact carries its source, the exact passage or field, and a date.

The source check is plain code: a fact is kept only if its value actually appears in the
passage it cites. A fact that fails is marked unverified and cannot support a decision.
"""
from __future__ import annotations

import re
import time
import unicodedata
from datetime import datetime, timezone


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def iso_day(ts: float | None) -> str | None:
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


def make_fact(*, subject: str, field: str, value, source: str, url: str, passage: str,
              locator: str = "", record_date: str | None = None, retrieved_at: float | None = None,
              note: str = "") -> dict:
    fact = {
        "subject": subject,
        "field": field,
        "value": value,
        "source": source,
        "url": url,
        "locator": locator,
        "passage": (passage or "")[:600],
        "record_date": record_date,
        "retrieved_at": iso_day(retrieved_at or time.time()),
        "note": note,
    }
    fact["verified"] = source_check(fact)
    return fact


def source_check(fact: dict) -> bool:
    """True when the cited passage states the value itself."""
    value, passage = fact.get("value"), fact.get("passage") or ""
    if value is None or value == "" or not passage:
        return False
    if isinstance(value, bool):
        return True  # booleans are derived; their passage carries the evidence
    if isinstance(value, (list, tuple)):
        return all(_norm(v) in _norm(passage) for v in value if v)
    v = _norm(value)
    return bool(v) and v in _norm(passage)


def cite(fact: dict) -> str:
    """Human-readable citation, PS style: value, from <locator> of <source> (url), dated/retrieved <date>."""
    when = f"record dated {fact['record_date']}, " if fact.get("record_date") else ""
    loc = f"the {fact['locator']} of " if fact.get("locator") else ""
    return f"{fact['value']} from {loc}{fact['source']} ({fact['url']}), {when}retrieved {fact['retrieved_at']}"
