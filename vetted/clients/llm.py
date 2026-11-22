"""Optional LLM helper (Groq, OpenAI-compatible API).

Used only to (a) turn a free-text request into structured fields and (b) write a plain-language
summary from facts that already passed the source check. Facts never come from the model.
If Groq is unavailable the service still works.
"""
from __future__ import annotations

import json
import time

import httpx

from ..config import env
from ..context import RunContext
from ..store import hash_request

URL = "https://api.groq.com/openai/v1/chat/completions"


class LLM:
    def __init__(self, ctx: RunContext):
        self.ctx = ctx
        cfg = ctx.policy.get("groq", {})
        self.enabled = bool(cfg.get("enabled", True) and env("GROQ_API_KEY"))
        self.models = [cfg.get("model", "openai/gpt-oss-120b"), cfg.get("fallback_model", "openai/gpt-oss-20b")]

    def json_chat(self, system: str, user: str, max_tokens: int = 800) -> dict | None:
        if not self.enabled:
            return None
        body_base = {"messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                     "temperature": 0, "max_tokens": max_tokens, "response_format": {"type": "json_object"}}
        key = hash_request("groq", body_base)
        cached = self.ctx.store.cache_get(key)
        if cached is not None:
            self.ctx.store.record_call(run_id=self.ctx.run_id, step=self.ctx.step, provider="groq",
                                       endpoint="chat", request_hash=key, outcome="cached")
            try:
                return json.loads(cached["body"])
            except Exception:
                return None
        for model in self.models:
            t0 = time.time()
            try:
                r = httpx.post(URL, headers={"Authorization": f"Bearer {env('GROQ_API_KEY')}"},
                               json={**body_base, "model": model}, timeout=40)
            except (httpx.TimeoutException, httpx.TransportError):
                self.ctx.store.record_call(run_id=self.ctx.run_id, step=self.ctx.step, provider="groq",
                                           endpoint=model, request_hash=key, outcome="unavailable",
                                           duration_ms=int((time.time() - t0) * 1000))
                continue
            usage = (r.json().get("usage") or {}) if r.status_code == 200 else {}
            tokens = int(usage.get("total_tokens", 0))
            rate = float(self.ctx.policy.get("pricing", {}).get("groq_inr_per_1k_tokens", 0))
            self.ctx.store.record_call(run_id=self.ctx.run_id, step=self.ctx.step, provider="groq",
                                       endpoint=model, request_hash=key, status_code=r.status_code,
                                       outcome="ok" if r.status_code == 200 else "error",
                                       tokens=tokens, inr=round(tokens / 1000 * rate, 4),
                                       duration_ms=int((time.time() - t0) * 1000))
            if r.status_code != 200:
                continue
            try:
                content = r.json()["choices"][0]["message"]["content"]
                parsed = json.loads(content)
            except Exception:
                continue
            self.ctx.store.cache_put(key, "groq", 200, json.dumps(parsed), {})
            return parsed
        return None
