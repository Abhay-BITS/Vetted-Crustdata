"""Tax-ID and bank-detail checks.

GSTIN structure is checked in code (state code, embedded PAN, check digit). These are consistency
checks and are labelled as computed, never presented as facts from a record. The IFSC is looked up
live in Razorpay's public IFSC service, which is a record and is cited as one.
"""
from __future__ import annotations

import re
import time

import httpx

from .context import RunContext
from .store import hash_request

GST_STATES = {
    "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
    "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
    "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
    "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh",
    "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra",
    "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
    "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
}
PAN_TYPES = {"C": "company", "P": "individual", "F": "firm / LLP", "H": "HUF", "A": "association of persons",
             "T": "trust", "B": "body of individuals", "L": "local authority", "J": "artificial juridical person",
             "G": "government"}
ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


def gstin_check_digit(first14: str) -> str:
    total = 0
    for i, ch in enumerate(first14):
        v = ALNUM.index(ch) * (1 if i % 2 == 0 else 2)
        total += v // 36 + v % 36
    return ALNUM[(36 - total % 36) % 36]


def check_gstin(gstin: str, pan: str | None, legal_name: str | None, address: str | None) -> dict:
    g = gstin.strip().upper()
    out = {"gstin": g, "checks": [], "flags": []}
    if not GSTIN_RE.match(g):
        out["flags"].append(f"GSTIN {g} is not in the valid 15-character format")
        return out
    ok_digit = gstin_check_digit(g[:14]) == g[14]
    out["checks"].append(("check digit", ok_digit))
    if not ok_digit:
        out["flags"].append(f"GSTIN {g} fails its check digit (likely mistyped or made up)")
    state = GST_STATES.get(g[:2])
    out["state"] = state
    if not state:
        out["flags"].append(f"GSTIN {g} starts with an unknown state code {g[:2]}")
    elif address and state.lower() not in address.lower() and not (state == "Delhi" and "new delhi" in address.lower()):
        out["flags"].append(f"GSTIN {g} is registered in {state}, but the registered address is elsewhere ({address[-60:]})")
    embedded = g[2:12]
    out["embedded_pan"] = embedded
    if pan and pan.upper() != embedded:
        out["flags"].append(f"The PAN inside GSTIN {g} ({embedded}) does not match the PAN supplied ({pan.upper()})")
    kind = PAN_TYPES.get(embedded[3])
    out["pan_holder_type"] = kind
    if legal_name and re.search(r"\b(private limited|limited|pvt|ltd)\b", legal_name.lower()) and embedded[3] != "C":
        out["flags"].append(f"GSTIN {g} belongs to a PAN of type '{kind}', but {legal_name} is a company")
    return out


def lookup_ifsc(ctx: RunContext, ifsc: str) -> dict:
    code = ifsc.strip().upper()
    if not IFSC_RE.match(code):
        return {"ifsc": code, "outcome": "invalid", "flags": [f"IFSC {code} is not in the valid 11-character format"]}
    url = f"https://ifsc.razorpay.com/{code}"
    key = hash_request("ifsc", url)
    cached = ctx.store.cache_get(key)
    if cached is not None:
        import json
        ctx.store.record_call(run_id=ctx.run_id, step=ctx.step, provider="razorpay_ifsc", endpoint=url,
                              request_hash=key, outcome="cached", status_code=cached["status_code"])
        data = json.loads(cached["body"]) if cached["status_code"] == 200 else None
        return _ifsc_result(code, url, data, cached["status_code"], cached["headers"].get("_retrieved_at"))
    t0 = time.time()
    try:
        r = httpx.get(url, timeout=12)
    except Exception:
        ctx.store.record_call(run_id=ctx.run_id, step=ctx.step, provider="razorpay_ifsc", endpoint=url,
                              request_hash=key, outcome="unavailable", duration_ms=int((time.time() - t0) * 1000))
        return {"ifsc": code, "outcome": "unavailable", "flags": [], "url": url}
    now = time.time()
    ctx.store.cache_put(key, "razorpay_ifsc", r.status_code, r.text, {"_retrieved_at": now})
    ctx.store.record_call(run_id=ctx.run_id, step=ctx.step, provider="razorpay_ifsc", endpoint=url, request_hash=key,
                          status_code=r.status_code, outcome="ok" if r.status_code == 200 else "not_found",
                          duration_ms=int((now - t0) * 1000))
    return _ifsc_result(code, url, r.json() if r.status_code == 200 else None, r.status_code, now)


def _ifsc_result(code, url, data, status, ts) -> dict:
    if status == 404 or not data:
        return {"ifsc": code, "outcome": "not_found", "url": url, "retrieved_at": ts,
                "flags": [f"IFSC {code} does not exist in the bank branch directory"]}
    return {"ifsc": code, "outcome": "ok", "url": url, "retrieved_at": ts, "flags": [],
            "bank": data.get("BANK"), "branch": data.get("BRANCH"), "city": data.get("CITY"),
            "state": data.get("STATE"), "passage": f"BANK: {data.get('BANK')}; BRANCH: {data.get('BRANCH')}; "
                                                 f"CITY: {data.get('CITY')}; STATE: {data.get('STATE')}"}
