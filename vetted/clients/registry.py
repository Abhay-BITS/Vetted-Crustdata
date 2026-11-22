"""Company-registry records (Indian MCA data) via public mirror pages, fetched by our own crawler.

Given a CIN, both InstaFinancials and Tofler serve the record as plain HTML:
  - InstaFinancials: legal name, status, incorporation date, address, website, "Last Updated" date
  - Tofler: legal name, directors with DIN and tenure

A timeout or block is reported as UNAVAILABLE, never as "no record".
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

import httpx
from bs4 import BeautifulSoup

from ..context import RunContext
from ..store import hash_request

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
CIN_RE = re.compile(r"\b([LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6})\b")
LLPIN_RE = re.compile(r"\b([A-Z]{3}-[0-9]{4})\b")


@dataclass
class RegistryPage:
    source: str
    url: str
    outcome: str                         # ok | not_found | unavailable
    retrieved_at: float = 0.0
    text: str = ""
    fields: dict = field(default_factory=dict)     # field -> {"value":..., "passage":...}
    directors: list = field(default_factory=list)  # [{"name","din","designation","tenure","passage"}]
    record_date: str | None = None


def _clean(html: str) -> tuple[BeautifulSoup, str]:
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript"]):
        t.decompose()
    text = re.sub(r"\s+", " ", soup.get_text(" ")).strip()
    return soup, text


def _passage(text: str, start: int, end: int, pad: int = 60) -> str:
    return text[max(0, start - pad): min(len(text), end + pad)].strip()


class RegistryClient:
    def __init__(self, ctx: RunContext, timeout: float = 25.0, retries: int = 2):
        self.ctx = ctx
        self.timeout = timeout
        self.retries = retries

    def _get(self, source: str, url: str) -> tuple[str, str | None, float]:
        key = hash_request("registry", url)
        cached = self.ctx.store.cache_get(key)
        if cached is not None:
            self.ctx.store.record_call(run_id=self.ctx.run_id, step=self.ctx.step, provider=source,
                                       endpoint=url, request_hash=key, status_code=cached["status_code"],
                                       outcome="cached", duration_ms=0)
            return ("ok" if cached["status_code"] == 200 else "not_found", cached["body"],
                    float(cached["headers"].get("_retrieved_at", time.time())))
        self.ctx.check_budget()
        for attempt in range(1, self.retries + 2):
            t0 = time.time()
            try:
                r = httpx.get(url, headers={"User-Agent": UA}, timeout=self.timeout, follow_redirects=True)
            except (httpx.TimeoutException, httpx.TransportError) as e:
                self.ctx.store.record_call(run_id=self.ctx.run_id, step=self.ctx.step, provider=source,
                                           endpoint=url, request_hash=key, outcome="unavailable",
                                           duration_ms=int((time.time() - t0) * 1000))
                self.ctx.log("registry_unavailable", url=url, attempt=attempt, error=str(e))
                time.sleep(2 * attempt)
                continue
            dur = int((time.time() - t0) * 1000)
            blocked = r.status_code in (403, 429, 503) or "Just a moment" in r.text[:3000]
            if blocked or r.status_code >= 500:
                self.ctx.store.record_call(run_id=self.ctx.run_id, step=self.ctx.step, provider=source,
                                           endpoint=url, request_hash=key, status_code=r.status_code,
                                           outcome="unavailable", duration_ms=dur)
                time.sleep(2 * attempt)
                continue
            outcome = "ok" if r.status_code == 200 else "not_found"
            now = time.time()
            self.ctx.store.cache_put(key, source, r.status_code, r.text, {"_retrieved_at": now})
            self.ctx.store.record_call(run_id=self.ctx.run_id, step=self.ctx.step, provider=source,
                                       endpoint=url, request_hash=key, status_code=r.status_code,
                                       outcome=outcome, duration_ms=dur)
            return outcome, r.text, now
        return "unavailable", None, time.time()

    # ---- InstaFinancials ------------------------------------------------
    def instafinancials(self, cin: str) -> RegistryPage:
        url = f"https://www.instafinancials.com/company/x-{cin}"
        outcome, html, ts = self._get("instafinancials", url)
        page = RegistryPage("instafinancials", url, outcome, ts)
        if outcome != "ok" or not html:
            return page
        soup, text = _clean(html)
        page.text = text
        if cin not in text:
            page.outcome = "not_found"
            return page
        title = soup.title.get_text(strip=True) if soup.title else ""
        m = re.match(r"(.+?)\s+-\s+" + cin, title)
        if m:
            name = m.group(1).strip()
            i = text.find(name)
            page.fields["legal_name"] = {"value": name, "passage": _passage(text, i, i + len(name)) if i >= 0 else title}
        m = re.search(r"Company Status\s+([A-Za-z ]+?)\s+As on", text)
        if m:
            page.fields["status"] = {"value": m.group(1).strip(), "passage": _passage(text, m.start(), m.end())}
        m = re.search(r"Incorp\. Date\s+(\d{2}-\d{2}-\d{4})", text)
        if m:
            page.fields["incorporation_date"] = {"value": m.group(1), "passage": _passage(text, m.start(), m.end())}
        m = re.search(r"registered address of .+? is (.+?\bIndia)\b", text) or \
            re.search(r"\bAddress\s+(.{10,220}?\bIndia)\b", text)
        if m:
            page.fields["registered_address"] = {"value": m.group(1).strip(), "passage": _passage(text, m.start(), m.end(), 0)}
        m = re.search(r"Website\s+((?:https?://)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,})", text, re.I)
        if m:
            page.fields["website"] = {"value": m.group(1), "passage": _passage(text, m.start(), m.end())}
        m = re.search(r"Last Updated:\s*(\d{1,2}-[A-Za-z]+-\d{4})", text)
        if m:
            page.record_date = m.group(1)
        page.fields["cin"] = {"value": cin, "passage": _passage(text, text.find(cin), text.find(cin) + len(cin))}
        return page

    # ---- Tofler -----------------------------------------------------------
    def tofler(self, cin: str) -> RegistryPage:
        url = f"https://www.tofler.in/x/company/{cin}"
        outcome, html, ts = self._get("tofler", url)
        page = RegistryPage("tofler", url, outcome, ts)
        if outcome != "ok" or not html:
            return page
        soup, text = _clean(html)
        page.text = text
        if cin not in text:
            page.outcome = "not_found"
            return page
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(" ", strip=True)
            page.fields["legal_name"] = {"value": name, "passage": name}
        m = re.search(r"incorporated on (\d{1,2} [A-Za-z]+,? \d{4})", text)
        if m:
            page.fields["incorporation_date"] = {"value": m.group(1), "passage": _passage(text, m.start(), m.end())}
        for table in soup.find_all("table"):
            rows = [[c.get_text(" ", strip=True) for c in r.find_all(["td", "th"])] for r in table.find_all("tr")]
            if rows and rows[0][:2] == ["Designation", "Name"]:
                for row in rows[1:]:
                    if len(row) >= 3:
                        name = re.sub(r"\s+Shareholder$", "", row[1]).strip()
                        page.directors.append({"designation": row[0], "name": name, "din": row[2],
                                               "tenure": row[3] if len(row) > 3 else "",
                                               "passage": " | ".join(row)})
                break
        return page


    # ---- companydetails.in: find a CIN from a legal-name slug ---------------
    def cin_from_name(self, name: str) -> list[dict]:
        """Try legal-name slugs; return [{"cin","legal_name","url"}] for pages that state a CIN."""
        base = re.sub(r"[^a-z0-9 ]", " ", name.lower().replace("&", " and "))
        base = re.sub(r"\b(pvt|private)\b", "private", base)
        base = re.sub(r"\bltd\b", "limited", base)
        base = re.sub(r"\s+", " ", base).strip()
        variants = [base]
        if not re.search(r"\b(limited|llp)$", base):
            variants += [base + " private limited", base + " limited", base + " llp"]
        found, seen = [], set()
        for v in variants[:4]:
            slug = v.replace(" ", "-")
            url = f"https://www.companydetails.in/company/{slug}"
            outcome, html, ts = self._get("companydetails", url)
            if outcome != "ok" or not html:
                continue
            _, text = _clean(html)
            m = re.search(r"CIN \(Corporate Identification Number\) of (.+?) is ([LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6})", text)
            if m and m.group(2) not in seen:
                seen.add(m.group(2))
                found.append({"cin": m.group(2), "legal_name": m.group(1).strip(), "url": url})
        return found


def find_cins(text: str) -> list[str]:
    seen, out = set(), []
    for c in CIN_RE.findall(text or ""):
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out
