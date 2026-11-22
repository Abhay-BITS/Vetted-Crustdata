"""Crustdata API client.

- required headers on every call
- response cache keyed by request (a resumed run never pays twice)
- 429: waits x-ratelimit-reset, then retries
- 402: stops the run (out of credits)
- timeouts / 5xx: retried, then reported as UNAVAILABLE (never as "no record")
- every call is written to the cost ledger with X-Credits-Used
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..config import env
from ..context import OutOfCredits, RunContext
from ..store import hash_request

BASE = "https://api.crustdata.com"
API_VERSION = "2025-11-01"


@dataclass
class ApiResult:
    ok: bool                    # True when the source answered (even with zero matches)
    outcome: str                # ok | not_found | unavailable | denied | error
    data: Any = None
    status_code: int | None = None
    credits: float = 0.0
    retrieved_at: float = 0.0
    cached: bool = False
    error: str | None = None


class CrustdataClient:
    def __init__(self, ctx: RunContext, timeout: float = 45.0, max_retries: int = 3):
        self.ctx = ctx
        self.key = env("CRUSTDATA_API_KEY")
        self.timeout = timeout
        self.max_retries = max_retries

    def _headers(self) -> dict:
        return {"authorization": f"Bearer {self.key}", "x-api-version": API_VERSION,
                "content-type": "application/json"}

    def post(self, path: str, body: dict) -> ApiResult:
        key = hash_request("crustdata", path, body)
        cached = self.ctx.store.cache_get(key)
        if cached is not None:
            self.ctx.store.record_call(run_id=self.ctx.run_id, step=self.ctx.step, provider="crustdata",
                                       endpoint=path, request_hash=key, status_code=cached["status_code"],
                                       outcome="cached", credits=0, inr=0, duration_ms=0)
            data = json.loads(cached["body"]) if cached["body"] else None
            return ApiResult(ok=True, outcome="ok" if data else "not_found", data=data,
                             status_code=cached["status_code"], cached=True,
                             retrieved_at=float(cached["headers"].get("_retrieved_at", time.time())))

        self.ctx.check_budget()
        last_err = None
        for attempt in range(1, self.max_retries + 1):
            t0 = time.time()
            try:
                r = httpx.post(BASE + path, headers=self._headers(), json=body, timeout=self.timeout)
            except (httpx.TimeoutException, httpx.TransportError) as e:
                last_err = f"{type(e).__name__}: {e}"
                self._ledger(path, key, None, "unavailable", 0, t0)
                self.ctx.log("source_unavailable", endpoint=path, attempt=attempt, error=last_err)
                time.sleep(min(2 ** attempt, 8))
                continue

            credits = float(r.headers.get("x-credits-used", 0) or 0)
            if r.status_code == 429:
                wait = min(float(r.headers.get("x-ratelimit-reset", 10) or 10), 65)
                self._ledger(path, key, 429, "rate_limited", credits, t0)
                self.ctx.log("rate_limited", endpoint=path, wait_s=wait, attempt=attempt)
                time.sleep(wait)
                continue
            if r.status_code == 402:
                self._ledger(path, key, 402, "error", credits, t0)
                raise OutOfCredits("Crustdata credits exhausted (402); check GET /account/credits")
            if r.status_code in (401, 403):
                self._ledger(path, key, r.status_code, "denied", credits, t0)
                return ApiResult(ok=False, outcome="denied", status_code=r.status_code, error=r.text[:300])
            if r.status_code >= 500:
                last_err = f"HTTP {r.status_code}"
                self._ledger(path, key, r.status_code, "unavailable", credits, t0)
                time.sleep(min(2 ** attempt, 8))
                continue
            if r.status_code == 404:
                self._ledger(path, key, 404, "not_found", credits, t0)
                return ApiResult(ok=True, outcome="not_found", data=None, status_code=404, retrieved_at=time.time())
            if r.status_code >= 400:
                self._ledger(path, key, r.status_code, "error", credits, t0)
                return ApiResult(ok=False, outcome="error", status_code=r.status_code, error=r.text[:300])

            now = time.time()
            self.ctx.store.cache_put(key, "crustdata", r.status_code, r.text, {"_retrieved_at": now})
            self._ledger(path, key, r.status_code, "ok", credits, t0)
            return ApiResult(ok=True, outcome="ok", data=r.json(), status_code=r.status_code,
                             credits=credits, retrieved_at=now)

        return ApiResult(ok=False, outcome="unavailable", error=last_err or "retries exhausted")

    def _ledger(self, path: str, key: str, code: int | None, outcome: str, credits: float, t0: float) -> None:
        self.ctx.store.record_call(run_id=self.ctx.run_id, step=self.ctx.step, provider="crustdata",
                                   endpoint=path, request_hash=key, status_code=code, outcome=outcome,
                                   credits=credits, inr=self.ctx.credits_to_inr(credits),
                                   duration_ms=int((time.time() - t0) * 1000))

    # ---- convenience wrappers -----------------------------------------
    def company_identify(self, *, domain: str | None = None, name: str | None = None) -> ApiResult:
        body = {"domains": [domain]} if domain else {"names": [name]}
        return self.post("/company/identify", body)

    def company_enrich(self, *, company_id: int | None = None, domain: str | None = None,
                       fields: list[str] | None = None) -> ApiResult:
        body: dict = {"crustdata_company_ids": [company_id]} if company_id else {"domains": [domain]}
        body["fields"] = fields or ["basic_info", "headcount", "locations", "people", "news", "hiring"]
        return self.post("/company/enrich", body)

    def web_search(self, query: str, *, sources: list[str] | None = None, location: str | None = "IN",
                   start_date: int | None = None) -> ApiResult:
        body: dict = {"query": query, "sources": sources or ["web"]}
        if location:
            body["location"] = location
        if start_date:
            body["start_date"] = start_date
        return self.post("/web/search/live", body)

    def web_fetch(self, urls: list[str]) -> ApiResult:
        return self.post("/web/enrich/live", {"urls": urls[:10]})

    def person_search(self, filters: dict, limit: int = 5, fields: list[str] | None = None) -> ApiResult:
        body: dict = {"filters": filters, "limit": limit}
        if fields:
            body["fields"] = fields
        return self.post("/person/search", body)
