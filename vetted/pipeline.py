"""The Vetted pipeline. Each step reads the state so far and returns its own output.

Steps are checkpointed by the runner, so a killed run resumes at the first unfinished step.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

from rapidfuzz import fuzz

from .clients.crustdata import CrustdataClient
from .clients.llm import LLM
from .clients.registry import RegistryClient, find_cins
from .context import RunContext
from .evidence import iso_day, make_fact

LEGAL_SUFFIXES = r"\b(private|pvt|limited|ltd|llp|inc|incorporated|co|company|corp|corporation|opc|the)\b\.?"


# --------------------------------------------------------------------------- helpers
def norm_name(name: str | None) -> str:
    n = (name or "").lower().replace("&", " and ")
    n = re.sub(LEGAL_SUFFIXES, " ", n)
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    return re.sub(r"\s+", " ", n).strip()


GENERIC_WORDS = {
    "logistics", "logistic", "express", "transport", "transports", "transporters", "transportation", "cargo",
    "carriers", "carrier", "roadlines", "roadways", "road", "lines", "movers", "packers", "freight", "services",
    "service", "solutions", "india", "indian", "supply", "chain", "couriers", "courier", "shipping", "global",
    "international", "enterprises", "enterprise", "trading", "traders", "group", "and", "of", "warehousing",
}


def brand_of(name: str | None) -> str:
    """Distinctive part of a business name: legal suffixes and generic trade words removed."""
    words = [w for w in norm_name(name).split() if w not in GENERIC_WORDS]
    return " ".join(words)


def full_legal(name: str | None) -> str:
    n = (name or "").lower()
    n = re.sub(r"\bpvt\b\.?", "private", n)
    n = re.sub(r"\bltd\b\.?", "limited", n)
    return re.sub(r"[^a-z0-9]", "", n)


def has_legal_suffix(name: str | None) -> bool:
    return bool(re.search(r"\b(private limited|pvt\.? ltd\.?|limited|ltd\.?|llp)\s*$", (name or "").lower()))


def domain_of(url: str | None) -> str | None:
    if not url:
        return None
    u = url.strip()
    if "://" not in u:
        u = "https://" + u
    host = (urlparse(u).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host or None


def parse_date(s: str | None) -> datetime | None:
    if not s:
        return None
    for fmt in ("%d-%m-%Y", "%d %B, %Y", "%d %B %Y", "%Y-%m-%d", "%d-%B-%Y", "%d %b %Y"):
        try:
            return datetime.strptime(s.strip(), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def days_ago(d: datetime | None) -> float | None:
    return None if d is None else (datetime.now(timezone.utc) - d).days


# --------------------------------------------------------------------------- step 0: intake
def step_intake(ctx: RunContext, state: dict) -> dict:
    """Read the request in the client's words and work out what is being asked."""
    req = dict(state["request"])
    text = req.get("text")
    parsed_by = "structured"
    if text and not req.get("vendor_name"):
        llm = LLM(ctx)
        out = llm.json_chat(
            "Extract vendor details from a client's request. Return JSON with keys: vendor_name, website, "
            "cin, gstin, pan, city, directors (list of names), bank_account, ifsc. Use null for anything not "
            "stated. Never guess or add facts that are not in the text.",
            text)
        if out:
            parsed_by = "llm"
            for k, v in out.items():
                if v and not req.get(k):
                    req[k] = v
        else:
            m = re.search(r"https?://\S+|\b[a-z0-9-]+\.(?:com|in|co\.in|net|org|io)\b", text, re.I)
            if m:
                req.setdefault("website", m.group(0))
            parsed_by = "pattern"
    name = (req.get("vendor_name") or "").strip()
    missing = []
    if not name and not req.get("website"):
        missing.append("vendor name or website")
    return {
        "vendor_name": name or None,
        "website": req.get("website"),
        "domain": domain_of(req.get("website")),
        "cin": (req.get("cin") or "").upper() or None,
        "gstin": (req.get("gstin") or "").upper() or None,
        "pan": (req.get("pan") or "").upper() or None,
        "city": req.get("city"),
        "directors": req.get("directors") or [],
        "bank_account": req.get("bank_account"),
        "ifsc": (req.get("ifsc") or "").upper() or None,
        "account_holder": req.get("account_holder"),
        "entity_type": (req.get("entity_type") or "").lower() or None,
        "llpin": (req.get("llpin") or "").upper() or None,
        "udyam": (req.get("udyam") or "").upper() or None,
        "claimed_since": str(req.get("claimed_since") or "").strip() or None,
        "registered_address": req.get("registered_address"),
        "pincode": str(req.get("pincode") or "").strip() or None,
        "contact_name": req.get("contact_name"),
        "contact_designation": req.get("contact_designation"),
        "contact_email": (req.get("contact_email") or "").strip().lower() or None,
        "parsed_by": parsed_by,
        "missing": missing,
    }


# --------------------------------------------------------------------------- step 1: duplicates
def step_duplicates(ctx: RunContext, state: dict) -> dict:
    v = state["intake"]
    th = ctx.policy["matching"]["duplicate_name_threshold"]
    rows = ctx.store.q("SELECT * FROM vendor_master")
    exact, possible, shared_bank = [], [], []
    for r in rows:
        r = dict(r)
        keys = []
        for k in ("gstin", "pan", "cin", "domain"):
            if v.get(k) and r.get(k) and str(v[k]).lower() == str(r[k]).lower():
                keys.append(k)
        if keys:
            exact.append({"vendor_id": r["vendor_id"], "legal_name": r["legal_name"], "matched_on": keys})
            continue
        if v.get("bank_account") and r.get("bank_account") and v["bank_account"] == r["bank_account"]:
            shared_bank.append({"vendor_id": r["vendor_id"], "legal_name": r["legal_name"]})
        # strict: every word must match, so "Blue Dart" is not a duplicate of "Blue Dart Aviation"
        score = fuzz.token_sort_ratio(norm_name(v.get("vendor_name")), norm_name(r.get("legal_name")))
        if v.get("vendor_name") and score >= th:
            possible.append({"vendor_id": r["vendor_id"], "legal_name": r["legal_name"], "score": score})
    return {"checked": len(rows), "exact": exact, "possible": possible, "shared_bank": shared_bank}


# --------------------------------------------------------------------------- step 2: resolve
def _match_rows(result) -> list[dict]:
    if not result.ok or not result.data:
        return []
    rows = []
    for entry in result.data if isinstance(result.data, list) else []:
        for m in entry.get("matches", []) or []:
            bi = (m.get("company_data") or {}).get("basic_info") or {}
            rows.append({"confidence": m.get("confidence_score"), "id": bi.get("crustdata_company_id"),
                         "name": bi.get("name"), "domain": bi.get("primary_domain"),
                         "all_domains": bi.get("all_domains") or [], "size": bi.get("employee_count_range"),
                         "profile": bi.get("professional_network_url")})
    return rows


def step_resolve(ctx: RunContext, state: dict) -> dict:
    v = state["intake"]
    cd = CrustdataClient(ctx)
    th = ctx.policy["matching"]["lookalike_name_threshold"]
    by_domain, by_name = [], []
    out = {"company": None, "candidates": [], "lookalike": None, "source_status": {}}
    if v.get("domain"):
        r = cd.company_identify(domain=v["domain"])
        out["source_status"]["identify_domain"] = r.outcome
        by_domain = [m for m in _match_rows(r) if v["domain"] in ([m["domain"]] + m["all_domains"])]
    if v.get("vendor_name"):
        r = cd.company_identify(name=v["vendor_name"])
        out["source_status"]["identify_name"] = r.outcome
        by_name = _match_rows(r)
        brand = brand_of(v["vendor_name"])
        if brand and brand != norm_name(v["vendor_name"]) and len(brand) >= 3:
            r2 = cd.company_identify(name=brand)
            out["source_status"]["identify_brand"] = r2.outcome
            seen = {m["id"] for m in by_name}
            by_name += [m for m in _match_rows(r2) if m["id"] not in seen]
    out["candidates"] = (by_domain + by_name)[:8]

    if by_domain:
        out["company"] = by_domain[0]
    elif by_name and not v.get("domain"):
        top = [m for m in by_name if m["confidence"] == by_name[0]["confidence"]]
        if len(top) == 1:
            out["company"] = top[0]
        else:
            out["ambiguous"] = [{"name": m["name"], "domain": m["domain"]} for m in top[:5]]

    # Lookalike: the claimed name resembles a company whose website is not the one supplied,
    # and the supplied website does not itself belong to a company with that name.
    own_domains = set()
    if out["company"]:
        own_domains = {out["company"].get("domain")} | set(out["company"].get("all_domains") or [])
    # The supplied website "backs" the claimed name when the company behind it carries that name
    # (token_set: "Blue Dart" backs "Blue Dart Express Limited").
    domain_backs_name = bool(out["company"]) and (
        fuzz.token_set_ratio(norm_name(v.get("vendor_name")), norm_name(out["company"].get("name"))) >= 90)
    out["domain_backs_name"] = domain_backs_name
    if v.get("vendor_name") and v.get("domain") and not domain_backs_name:
        best = None
        for m in by_name:
            if not m.get("domain"):
                continue
            score = fuzz.token_sort_ratio(norm_name(v["vendor_name"]), norm_name(m["name"]))
            b_v, b_m = brand_of(v["vendor_name"]).replace(" ", ""), brand_of(m["name"]).replace(" ", "")
            if b_v and b_m and len(b_v) >= 4:
                score = max(score, fuzz.ratio(b_v, b_m))
            same_site = v["domain"] in ([m["domain"]] + m["all_domains"])
            if score < max(th, 90) or same_site:
                continue
            if out["company"] and (out["company"].get("id") == m.get("id") or m["domain"] in own_domains):
                continue
            if best is None or score > best[0]:
                best = (score, m)
        if best:
            score, m = best
            lab_v, lab_m = v["domain"].split(".")[0], m["domain"].split(".")[0]
            dsim = fuzz.ratio(lab_v, lab_m)
            out["lookalike"] = {"resembles": m["name"], "their_domain": m["domain"],
                                "supplied_domain": v["domain"], "name_similarity": round(score),
                                "domain_similarity": round(dsim), "typo_domain": bool(dsim >= 80 and lab_v != lab_m),
                                "their_size": m.get("size")}
    return out


# --------------------------------------------------------------------------- step 3: company profile
def step_profile(ctx: RunContext, state: dict) -> dict:
    comp = state["resolve"].get("company")
    if not comp:
        return {"found": False}
    cd = CrustdataClient(ctx)
    r = cd.company_enrich(company_id=comp["id"])
    if not r.ok or not r.data:
        return {"found": False, "source_status": r.outcome}
    entry = r.data[0] if isinstance(r.data, list) and r.data else {}
    matches = entry.get("matches") or []
    if not matches:
        return {"found": False, "source_status": "not_found"}
    c = matches[0]["company_data"]
    bi, loc, hc, hiring = c.get("basic_info") or {}, c.get("locations") or {}, c.get("headcount") or {}, c.get("hiring") or {}
    ts = hc.get("timeseries") or []
    last_hc = ts[-1] if ts else None
    news = [n for n in (c.get("news") or []) if n.get("article_publish_date")]
    news.sort(key=lambda n: n["article_publish_date"], reverse=True)
    people = c.get("people") or {}

    def person(p: dict, group: str) -> dict:
        bp = p.get("basic_profile") or {}
        cur = ((p.get("experience") or {}).get("employment_details") or {}).get("current") or []
        return {"name": bp.get("name"), "title": bp.get("current_title"), "group": group,
                "person_id": p.get("crustdata_person_id"), "updated_at": p.get("updated_at"),
                "current_employers": [e.get("employer_name") for e in cur][:5],
                "location": (bp.get("location") or {}).get("raw")}

    leaders = []
    for group in ("founders", "cxos"):
        leaders += [person(p, group) for p in (people.get(group) or [])[:15]]
    return {
        "found": True,
        "retrieved_at": r.retrieved_at,
        "company_id": comp["id"],
        "name": bi.get("name"),
        "domain": bi.get("primary_domain"),
        "website": bi.get("website"),
        "status": bi.get("status"),
        "year_founded": bi.get("year_founded"),
        "company_type": bi.get("company_type"),
        "employee_range": bi.get("employee_count_range"),
        "headcount": last_hc,
        "hq": loc.get("headquarters"),
        "city": loc.get("city"),
        "openings": hiring.get("openings_count"),
        "recent_titles": (hiring.get("recent_titles_csv") or "")[:300],
        "news": news[:5],
        "leaders": leaders,
    }


# --------------------------------------------------------------------------- step 4: registry
def step_registry(ctx: RunContext, state: dict) -> dict:
    v, prof = state["intake"], state.get("profile") or {}
    cd, reg = CrustdataClient(ctx), RegistryClient(ctx)
    names = [n for n in [v.get("vendor_name"), prof.get("name")] if n]
    out: dict = {"cin": None, "candidates": [], "pages": {}, "search_status": None, "unavailable": []}

    cins = [v["cin"]] if v.get("cin") else []
    if not cins and names:
        # free route first: legal-name slug pages that state the CIN
        for n in names[:2]:
            for hit in reg.cin_from_name(n):
                if hit["cin"] not in cins:
                    cins.append(hit["cin"])
    want_domain = v.get("domain") or prof.get("domain")
    best, scored, checked = None, [], set()

    def consider(cin_list):
        nonlocal best
        for cin in cin_list:
            if cin in checked or len(checked) >= 8:
                continue
            checked.add(cin)
            page = reg.instafinancials(cin)
            if page.outcome == "unavailable":
                out["unavailable"].append(f"instafinancials:{cin}")
                continue
            if page.outcome != "ok":
                continue
            legal = (page.fields.get("legal_name") or {}).get("value", "")
            # strict name similarity: extra words ("Freight Services") lower the score
            name_score = max([fuzz.token_sort_ratio(norm_name(n), norm_name(legal)) for n in names] or [0])
            site = domain_of((page.fields.get("website") or {}).get("value", "").split(":")[0])
            site_bonus = 10 if (want_domain and site and site == want_domain) else 0
            scored.append({"cin": cin, "legal_name": legal, "name_score": name_score, "site_match": bool(site_bonus)})
            if v.get("cin") == cin or name_score >= 85:
                if best is None or name_score + site_bonus > best[0]:
                    best = (name_score + site_bonus, cin, page)

    consider(cins)
    if best is None and names:
        # search phrasings that tend to surface the CIN in annual reports and registry pages
        queries = []
        for n in dict.fromkeys(names):
            queries += [f"{n} CIN instafinancials", f"{n} CIN annual report"]
        for q in queries[:3]:
            r = cd.web_search(q)
            out["search_status"] = r.outcome
            if r.ok and r.data:
                blob = " ".join(f"{x.get('title','')} {x.get('snippet','')}" for x in r.data.get("results", []))
                found = find_cins(blob)
                cins += [c for c in found if c not in cins]
                consider(found)
            if best is not None:
                break
    out["candidates"] = cins[:8]
    out["scored"] = scored
    if best:
        # A registry record is only accepted when something besides a loose name ties it to this vendor:
        # the supplied CIN, the supplied website, the exact full legal name, or the supplied city.
        _, cin, page = best
        legal = (page.fields.get("legal_name") or {}).get("value", "")
        addr = (page.fields.get("registered_address") or {}).get("value", "")
        site = domain_of((page.fields.get("website") or {}).get("value", "").split(":")[0])
        ties = []
        if v.get("cin") == cin:
            ties.append("supplied CIN")
        if want_domain and site == want_domain:
            ties.append("website on the record matches")
        if v.get("vendor_name") and has_legal_suffix(v["vendor_name"]) and full_legal(v["vendor_name"]) == full_legal(legal):
            ties.append("exact legal name")
        if v.get("city") and v["city"].lower() in addr.lower():
            ties.append("city matches the registered address")
        if prof.get("found") and full_legal(legal).startswith(full_legal(prof.get("name"))) and want_domain:
            ties.append("same company as the profile resolved from the website")
        out["ties"] = ties
        if not ties:
            out["possible_match"] = {"cin": cin, "legal_name": legal,
                                     "status": (page.fields.get("status") or {}).get("value"), "url": page.url}
            best = None
    if best:
        _, cin, page = best
        out["cin"] = cin
        out["pages"]["instafinancials"] = {"url": page.url, "fields": page.fields, "record_date": page.record_date,
                                           "retrieved_at": page.retrieved_at}
        t = reg.tofler(cin)
        if t.outcome == "ok":
            out["pages"]["tofler"] = {"url": t.url, "fields": t.fields, "directors": t.directors,
                                      "retrieved_at": t.retrieved_at}
        elif t.outcome == "unavailable":
            out["unavailable"].append("tofler")
    return out


# --------------------------------------------------------------------------- step 5: website live
def step_website(ctx: RunContext, state: dict) -> dict:
    v, prof = state["intake"], state.get("profile") or {}
    site = v.get("website") or prof.get("website")
    if not site:
        return {"checked": False}
    dom = domain_of(site)
    urls = [f"https://{dom}", f"https://www.{dom}"] if dom else [site]
    # 1) our own direct fetch first: free and fast
    import httpx
    blocked = False
    for u in urls:
        try:
            resp = httpx.get(u, timeout=12, follow_redirects=True,
                             headers={"User-Agent": "Mozilla/5.0 (Macintosh) Chrome/130.0"})
        except Exception:
            continue
        ctx.store.record_call(run_id=ctx.run_id, step=ctx.step, provider="direct_fetch", endpoint=u,
                              status_code=resp.status_code, outcome="ok" if resp.status_code < 400 else "error")
        if resp.status_code < 400:
            m = re.search(r"<title[^>]*>(.*?)</title>", resp.text, re.S | re.I)
            return {"checked": True, "live": True, "via": "direct", "url": str(resp.url),
                    "title": (m.group(1).strip() if m else "")[:200], "retrieved_at": time.time()}
        blocked = blocked or resp.status_code in (403, 429, 503)
    # 2) blocked or unreachable from here: ask Crustdata's fetcher (1 credit)
    r = CrustdataClient(ctx).web_fetch(urls[:1])
    if r.ok and isinstance(r.data, list):
        ok = [e for e in r.data if e.get("success")]
        if ok:
            e = ok[0]
            return {"checked": True, "live": True, "via": "crustdata", "url": e.get("url") or urls[0],
                    "title": (e.get("title") or "")[:200], "timestamp": e.get("timestamp"),
                    "retrieved_at": r.retrieved_at}
    if blocked or not r.ok:
        return {"checked": True, "live": None, "url": urls[0], "note": "site blocked automated access; not counted either way"}
    return {"checked": True, "live": False, "url": urls[0], "retrieved_at": time.time()}


# --------------------------------------------------------------------------- step 5b: tax id and bank
def step_ids(ctx: RunContext, state: dict) -> dict:
    from .idchecks import check_gstin, lookup_ifsc
    v, reg = state["intake"], state.get("registry") or {}
    insta = ((reg.get("pages") or {}).get("instafinancials") or {}).get("fields") or {}
    legal = (insta.get("legal_name") or {}).get("value") or v.get("vendor_name")
    addr = (insta.get("registered_address") or {}).get("value")
    out: dict = {"flags": [], "notes": []}
    if v.get("gstin"):
        g = check_gstin(v["gstin"], v.get("pan"), legal, addr)
        out["gstin"] = {k: g[k] for k in g if k != "checks"} | {"checks": [list(c) for c in g["checks"]]}
        out["flags"] += g["flags"]
    if v.get("ifsc"):
        b = lookup_ifsc(ctx, v["ifsc"])
        out["ifsc"] = b
        out["flags"] += b.get("flags", [])
        if b.get("outcome") == "ok" and addr and b.get("state") and b["state"].lower() not in addr.lower():
            out["notes"].append(f"Bank branch is in {b['city']}, {b['state']}; the registered office is elsewhere "
                                f"(common for multi-city firms, worth a look)")
    return out


# --------------------------------------------------------------------------- step 6: who runs it
def step_directors(ctx: RunContext, state: dict) -> dict:
    reg = state.get("registry") or {}
    prof = state.get("profile") or {}
    th = ctx.policy["matching"]["person_name_threshold"]
    directors = ((reg.get("pages") or {}).get("tofler") or {}).get("directors") or []
    claimed = state["intake"].get("directors") or []
    leaders = prof.get("leaders") or []
    rows = []
    for d in directors:
        best, score = None, 0
        for p in leaders:
            s = fuzz.token_sort_ratio((d["name"] or "").lower(), (p.get("name") or "").lower())
            if s > score:
                best, score = p, s
        confirmed = bool(best and score >= th)
        rows.append({**d, "crustdata_match": best if confirmed else None, "match_score": score,
                     "confirmed_at_company": confirmed})
    # Confirm the people who run it with Crustdata Person Search (+ Person Enrich for the top director):
    # is the director's CURRENT role at this company?
    cid = prof.get("company_id")
    if cid and rows:
        cd = CrustdataClient(ctx)
        ranked = sorted(range(len(rows)), key=lambda i: DESIGNATION_RANK.get((rows[i].get("designation") or "").lower(), 3))
        looked = 0
        for i in ranked:
            if looked >= 2:
                break
            d = rows[i]
            looked += 1
            r = cd.person_at_company(d["name"], cid)
            profs = (r.data or {}).get("profiles", []) if r.ok and isinstance(r.data, dict) else []
            best = None
            for p_ in profs:
                nm = (p_.get("basic_profile") or {}).get("name") or ""
                if fuzz.token_sort_ratio(nm.lower(), d["name"].lower()) >= th or fuzz.token_set_ratio(nm.lower(), d["name"].lower()) >= 95:
                    best = p_
                    break
            if not best:
                d["person_search"] = "not found at the company" if r.ok else f"source {r.outcome}"
                continue
            cur = [e for e in ((best.get("experience") or {}).get("employment_details") or {}).get("current", [])
                   if e.get("crustdata_company_id") == cid]
            role = cur[0] if cur else {}
            url = ((best.get("social_handles") or {}).get("professional_network_identifier") or {}).get("profile_url")
            d["confirmed_at_company"] = True
            d["person"] = {"name": (best.get("basic_profile") or {}).get("name"), "title": role.get("title"),
                           "employer": role.get("name"), "start_date": (role.get("start_date") or "")[:10],
                           "profile_url": url, "retrieved_at": r.retrieved_at}
        # Person Enrich on the top confirmed director for the profile's own record date
        top = next((rows[i] for i in ranked if rows[i].get("person", {}).get("profile_url")), None)
        if top:
            e = cd.person_enrich([top["person"]["profile_url"]])
            try:
                pdata = e.data[0]["matches"][0]["person_data"] if e.ok and isinstance(e.data, list) else None
            except (KeyError, IndexError, TypeError):
                pdata = None
            if pdata is None and e.ok and isinstance(e.data, list) and e.data:
                pdata = e.data[0].get("person_data") or (e.data[0].get("matches") or [{}])[0].get("person_data")
            if pdata:
                bp = pdata.get("basic_profile") or {}
                top["person"]["record_date"] = (bp.get("last_updated") or pdata.get("updated_at") or "")[:10] or None
                top["person"]["enriched"] = True

    claimed_check = []
    for c in claimed:
        on_record = any(fuzz.token_sort_ratio(c.lower(), d["name"].lower()) >= th for d in directors)
        claimed_check.append({"name": c, "on_registry": on_record if directors else None})
    return {"directors": rows, "claimed": claimed_check, "registry_has_directors": bool(directors)}


# --------------------------------------------------------------------------- step 6a: what the vendor claims vs the record
FREE_MAIL = {"gmail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "rediffmail.com", "icloud.com",
             "proton.me", "protonmail.com", "aol.com", "live.com", "ymail.com", "zoho.com"}
UDYAM_RE = re.compile(r"^UDYAM-[A-Z]{2}-\d{2}-\d{7}$")


def step_claims(ctx: RunContext, state: dict) -> dict:
    """Compare each thing the vendor claimed with the record. Mismatches become flags; matches become facts."""
    v, prof, reg = state["intake"], state.get("profile") or {}, state.get("registry") or {}
    insta = ((reg.get("pages") or {}).get("instafinancials") or {}).get("fields") or {}
    legal = (insta.get("legal_name") or {}).get("value") or prof.get("name")
    addr = (insta.get("registered_address") or {}).get("value") or ""
    inc = (insta.get("incorporation_date") or {}).get("value")
    th = ctx.policy["matching"]["person_name_threshold"]
    rows, flags, notes = [], [], []

    def row(field, claimed, record, source, match):
        rows.append({"field": field, "claimed": claimed, "record": record, "source": source, "match": match})

    # contact email: free mail, or a domain that is not the company's
    if v.get("contact_email") and "@" in v["contact_email"]:
        dom = v["contact_email"].split("@")[-1]
        company_domains = {d for d in [v.get("domain"), prof.get("domain"), domain_of((insta.get("website") or {}).get("value", "").split(":")[0])] if d}
        company_domains |= set(((state.get("resolve") or {}).get("company") or {}).get("all_domains") or [])
        is_company = (v.get("entity_type") or "company") not in ("proprietorship", "partnership")
        if dom in FREE_MAIL and is_company:
            row("Contact email", v["contact_email"], ", ".join(sorted(company_domains)) or "company domain unknown", "domain comparison", False)
            flags.append(f"The contact email {v['contact_email']} is a free mailbox, not an address at the company")
        elif company_domains and dom not in company_domains and not any(dom.endswith("." + d) for d in company_domains):
            team = [d.lower() for d in ctx.policy.get("email", {}).get("allow_domains", [])]
            if dom not in team:  # the demo routes vendor mail to a teammate's inbox; do not flag that
                row("Contact email", v["contact_email"], ", ".join(sorted(company_domains)), "domain comparison", False)
                flags.append(f"The contact email domain {dom} does not match the company's website ({', '.join(sorted(company_domains))})")
        elif company_domains:
            row("Contact email", v["contact_email"], ", ".join(sorted(company_domains)), "domain comparison", True)

    # contact person: do they work at the company? (Crustdata Person Search)
    if v.get("contact_name") and prof.get("company_id"):
        r = CrustdataClient(ctx).person_at_company(v["contact_name"], prof["company_id"])
        profs = (r.data or {}).get("profiles", []) if r.ok and isinstance(r.data, dict) else []
        hit = next((p_ for p_ in profs if fuzz.token_sort_ratio(((p_.get("basic_profile") or {}).get("name") or "").lower(),
                                                                v["contact_name"].lower()) >= th), None)
        if hit:
            title = (hit.get("basic_profile") or {}).get("current_title")
            row("Contact person", f"{v['contact_name']}{', ' + v['contact_designation'] if v.get('contact_designation') else ''}",
                f"{(hit.get('basic_profile') or {}).get('name')}, {title} at the company", "Crustdata /person/search", True)
        elif r.ok:
            row("Contact person", v["contact_name"], "not found among the company's people", "Crustdata /person/search", None)
            notes.append(f"The contact person {v['contact_name']} was not found among the company's people in Crustdata "
                         f"(common for small teams; a person should confirm)")

    # "in business since" vs incorporation
    if v.get("claimed_since") and inc and parse_date(inc):
        try:
            claimed = int(re.findall(r"\d{4}", v["claimed_since"])[0])
            inc_year = parse_date(inc).year
            ok = claimed >= inc_year - 1
            row("In business since", str(claimed), f"incorporated {inc}", "MCA company record", ok)
            if not ok:
                flags.append(f"Claims to be in business since {claimed}, but the company was incorporated on {inc}")
        except (IndexError, ValueError):
            pass

    # registered address / PIN code vs the MCA record
    if (v.get("pincode") or v.get("registered_address")) and addr:
        rec_pins = re.findall(r"\b\d{6}\b", addr)
        if v.get("pincode") and rec_pins:
            ok = v["pincode"] in rec_pins
            row("Registered office PIN code", v["pincode"], rec_pins[0], "MCA company record", ok)
            if not ok:
                flags.append(f"Registered office PIN code {v['pincode']} does not match the MCA record ({rec_pins[0]})")
        elif v.get("registered_address"):
            sim = fuzz.token_set_ratio(v["registered_address"].lower(), addr.lower())
            row("Registered office", v["registered_address"], addr, "MCA company record", sim >= 70)
            if sim < 50:
                flags.append("The registered office address given does not match the MCA record")

    # account holder vs legal name
    if v.get("account_holder") and legal:
        sim = fuzz.token_sort_ratio(norm_name(v["account_holder"]), norm_name(legal))
        row("Bank account holder", v["account_holder"], legal, "MCA company record (legal name)", sim >= 85)
        if sim < 85:
            flags.append(f"The bank account holder '{v['account_holder']}' is not the company's legal name ({legal})")

    # PAN vs GSTIN (the GSTIN structure check itself lives in step_ids)
    if v.get("pan") and v.get("gstin") and len(v["gstin"]) == 15:
        row("PAN", v["pan"], f"{v['gstin'][2:12]} (inside the GSTIN)", "GSTIN structure", v["pan"] == v["gstin"][2:12])

    # MSME (Udyam): format check + the payment-terms note
    if v.get("udyam"):
        ok = bool(UDYAM_RE.match(v["udyam"]))
        row("Udyam (MSME) number", v["udyam"], "valid format" if ok else "not a valid Udyam number", "format check", ok)
        if ok:
            notes.append("MSME vendor: under the MSMED Act it must be paid within 45 days of acceptance")
        else:
            flags.append(f"{v['udyam']} is not a valid Udyam (MSME) registration number")

    return {"rows": rows, "flags": flags, "notes": notes}


# --------------------------------------------------------------------------- step 6b: adverse media
ADVERSE_WORDS = ["fraud", "arrest", "arrested", "scam", "cheating", "cheated", "fir ", "f.i.r", "money laundering",
                 "raid", "raided", "absconding", "default", "defaulter", "wilful", "embezzle", "forgery", "fake",
                 "ponzi", "seized", "chargesheet", "charge sheet", "evasion", "bribe", "convicted", "booked", "held for"]
DESIGNATION_RANK = {"managing director": 0, "whole-time director": 1, "whole time director": 1, "director": 2}


def _contains_all_tokens(text: str, name: str) -> bool:
    t = " " + re.sub(r"[^a-z0-9 ]", " ", text.lower()) + " "
    toks = [w for w in re.sub(r"[^a-z0-9 ]", " ", name.lower()).split() if len(w) > 1]
    return bool(toks) and all(f" {w} " in t for w in toks)


def step_adverse(ctx: RunContext, state: dict) -> dict:
    """Screen the people who run the vendor against the news; clear namesakes (2-identifier rule)."""
    reg = state.get("registry") or {}
    prof = state.get("profile") or {}
    v = state["intake"]
    need = int(ctx.policy.get("namesake", {}).get("identifiers_required", 2))
    dirs = ((reg.get("pages") or {}).get("tofler") or {}).get("directors") or []
    dirs = sorted(dirs, key=lambda d: DESIGNATION_RANK.get((d.get("designation") or "").lower(), 3))
    people = [{"name": d["name"], "din": d.get("din")} for d in dirs[:3]]
    for c in v.get("directors") or []:
        if not any(fuzz.token_sort_ratio(c.lower(), p["name"].lower()) >= 88 for p in people):
            people.append({"name": c, "din": None})
    people = people[:4]
    if not people:
        return {"screened": [], "note": "no directors known, so no one could be screened"}

    insta = (reg.get("pages") or {}).get("instafinancials") or {}
    legal = ((insta.get("fields") or {}).get("legal_name") or {}).get("value") or v.get("vendor_name") or ""
    addr = ((insta.get("fields") or {}).get("registered_address") or {}).get("value") or ""
    brand_words = [w for w in brand_of(legal).split() if len(w) > 2]
    cities = [c for c in {prof.get("city"), v.get("city")} if c]
    for part in addr.split(",")[-3:]:
        part = re.sub(r"\d+", "", part).strip()
        if part and part.lower() not in ("india", "na") and len(part) > 2:
            cities.append(part)

    cd = CrustdataClient(ctx)
    screened = []
    for p in people:
        r = cd.web_search(f"{p['name']} fraud arrested scam", sources=["news"])
        entry = {"name": p["name"], "din": p.get("din"), "searched": r.outcome, "results": 0,
                 "confirmed": [], "namesakes_cleared": [], "retrieved_at": r.retrieved_at}
        if not r.ok:
            entry["note"] = "news source did not respond; not screened (this is not a clean result)"
            screened.append(entry)
            continue
        results = (r.data or {}).get("results", []) if isinstance(r.data, dict) else []
        entry["results"] = len(results)
        for item in results:
            text = f"{item.get('title','')}. {item.get('snippet','')}"
            low = text.lower()
            if not _contains_all_tokens(text, p["name"]):
                continue
            if not any(w in low for w in ADVERSE_WORDS):
                continue
            ids = ["name"]
            if brand_words and all(w in low for w in brand_words):
                ids.append(f"company ({legal})")
            if p.get("din") and p["din"] in text:
                ids.append(f"DIN {p['din']}")
            for c in cities:
                if c.lower() in low:
                    ids.append(f"city ({c})")
                    break
            hit = {"title": item.get("title"), "snippet": item.get("snippet"), "url": item.get("url"),
                   "identifiers": ids}
            if len(ids) >= need:
                entry["confirmed"].append(hit)
            else:
                hit["why_cleared"] = (f"The article names {p['name']} but not {legal}, the DIN or the company's city, "
                                      f"so it is treated as a namesake")
                entry["namesakes_cleared"].append(hit)
        screened.append(entry)
    return {"screened": screened, "identifiers_required": need}


# --------------------------------------------------------------------------- step 7: facts
def step_facts(ctx: RunContext, state: dict) -> dict:
    """Turn everything gathered into cited facts and run the source check on each."""
    facts: list[dict] = []
    v, res, prof = state["intake"], state["resolve"], state.get("profile") or {}
    reg, web, dirs = state.get("registry") or {}, state.get("website") or {}, state.get("directors") or {}
    subject = v.get("vendor_name") or v.get("domain")

    insta = (reg.get("pages") or {}).get("instafinancials")
    if insta:
        rd = insta.get("record_date")
        for fld, label in (("legal_name", "company name field"), ("cin", "CIN field"),
                           ("status", "company status field"), ("incorporation_date", "incorporation date field"),
                           ("registered_address", "registered address field"), ("website", "website field")):
            f = insta["fields"].get(fld)
            if f:
                facts.append(make_fact(subject=subject, field=fld, value=f["value"], source="MCA company record (InstaFinancials)",
                                       url=insta["url"], passage=f["passage"], locator=label, record_date=rd,
                                       retrieved_at=insta.get("retrieved_at")))
    tof = (reg.get("pages") or {}).get("tofler")
    if tof:
        for d in dirs.get("directors") or []:
            facts.append(make_fact(subject=subject, field="director", value=d["name"],
                                   source="MCA company record (Tofler)", url=tof["url"], passage=d["passage"],
                                   locator=f"directors table, DIN {d['din']}", retrieved_at=tof.get("retrieved_at")))
    if prof.get("found"):
        api = f"Crustdata /company/enrich (company id {prof['company_id']})"
        ret = prof.get("retrieved_at")
        if prof.get("name"):
            facts.append(make_fact(subject=subject, field="company_profile_name", value=prof["name"], source=api,
                                   url="https://api.crustdata.com/company/enrich", locator="basic_info.name",
                                   passage=f"basic_info.name: {prof['name']}", retrieved_at=ret))
        if prof.get("headcount"):
            h = prof["headcount"]
            facts.append(make_fact(subject=subject, field="headcount", value=str(h["employee_count"]), source=api,
                                   url="https://api.crustdata.com/company/enrich", locator="headcount.timeseries (latest)",
                                   passage=f"headcount.timeseries[-1]: date {h['date']}, employee_count {h['employee_count']}",
                                   record_date=h["date"], retrieved_at=ret))
        if prof.get("year_founded"):
            facts.append(make_fact(subject=subject, field="year_founded", value=str(prof["year_founded"]), source=api,
                                   url="https://api.crustdata.com/company/enrich", locator="basic_info.year_founded",
                                   passage=f"basic_info.year_founded: {prof['year_founded']}", retrieved_at=ret))
        if prof.get("openings"):
            facts.append(make_fact(subject=subject, field="open_jobs", value=str(prof["openings"]), source=api,
                                   url="https://api.crustdata.com/company/enrich", locator="hiring.openings_count",
                                   passage=f"hiring.openings_count: {prof['openings']}", retrieved_at=ret))
        for n in (prof.get("news") or [])[:2]:
            facts.append(make_fact(subject=subject, field="recent_news", value=n["article_title"], source=n.get("article_publisher_name") or "news",
                                   url=n["article_url"], locator="article title", passage=n["article_title"],
                                   record_date=n["article_publish_date"], retrieved_at=ret))
        for d in dirs.get("directors") or []:
            pp = d.get("person")
            if pp and pp.get("title"):
                facts.append(make_fact(subject=d["name"], field="current_role", value=pp["title"],
                                       source="Crustdata /person/search" + (" + /person/enrich" if pp.get("enriched") else ""),
                                       url=pp.get("profile_url") or "https://api.crustdata.com/person/search",
                                       locator="experience.employment_details.current",
                                       passage=f"name: {pp['name']}; current employer: {pp['employer']}; title: {pp['title']}; start_date: {pp['start_date']}",
                                       record_date=pp.get("record_date"), retrieved_at=pp.get("retrieved_at")))
                continue
            m = d.get("crustdata_match")
            if m:
                facts.append(make_fact(subject=d["name"], field="current_role", value=m.get("title") or "",
                                       source=api, url="https://api.crustdata.com/company/enrich",
                                       locator=f"people.{m['group']} (person id {m.get('person_id')})",
                                       passage=f"name: {m['name']}; current_title: {m.get('title')}; current employers: {', '.join(m.get('current_employers') or [])}",
                                       record_date=(m.get("updated_at") or "")[:10] or None, retrieved_at=ret))
    b = (state.get("ids") or {}).get("ifsc") or {}
    if b.get("outcome") == "ok":
        facts.append(make_fact(subject=b["ifsc"], field="bank_branch", value=b["bank"],
                               source="Razorpay IFSC directory", url=b["url"], locator="BANK, BRANCH, CITY, STATE fields",
                               passage=b["passage"], retrieved_at=b.get("retrieved_at")))
    for s in (state.get("adverse") or {}).get("screened", []):
        for hit in s.get("confirmed", []):
            facts.append(make_fact(subject=s["name"], field="adverse_media", value=s["name"],
                                   source="news (Crustdata /web/search/live, news source)", url=hit["url"],
                                   locator="news result title and snippet",
                                   passage=f"{hit['title']}. {hit['snippet']}",
                                   note="matched on: " + ", ".join(hit["identifiers"]),
                                   retrieved_at=s.get("retrieved_at")))
        for hit in s.get("namesakes_cleared", [])[:2]:
            facts.append(make_fact(subject=s["name"], field="namesake_cleared", value=s["name"],
                                   source="news (Crustdata /web/search/live, news source)", url=hit["url"],
                                   locator="news result title and snippet",
                                   passage=f"{hit['title']}. {hit['snippet']}", note=hit["why_cleared"],
                                   retrieved_at=s.get("retrieved_at")))
    if web.get("live"):
        facts.append(make_fact(subject=subject, field="website_live", value=True, source="Crustdata /web/enrich/live",
                               url=web["url"], locator="page title", passage=f"HTTP fetch succeeded; title: {web.get('title')}",
                               record_date=iso_day(web.get("timestamp")), retrieved_at=web.get("retrieved_at")))
    return {"facts": facts, "unverified": [f for f in facts if not f["verified"]]}


# --------------------------------------------------------------------------- step 8: decide
def step_decide(ctx: RunContext, state: dict) -> dict:
    pol = ctx.policy
    v, dup, res = state["intake"], state.get("duplicates") or {}, state.get("resolve") or {}
    prof, reg = state.get("profile") or {}, state.get("registry") or {}
    web, dirs = state.get("website") or {}, state.get("directors") or {}
    facts = [f for f in (state.get("facts") or {}).get("facts", []) if f["verified"]]
    fact_by = {}
    for f in facts:
        fact_by.setdefault(f["field"], []).append(f)

    flags, missing, reasons = [], list(v.get("missing") or []), []
    insta = (reg.get("pages") or {}).get("instafinancials") or {}
    status = ((insta.get("fields") or {}).get("status") or {}).get("value")
    inc = ((insta.get("fields") or {}).get("incorporation_date") or {}).get("value")
    legal = ((insta.get("fields") or {}).get("legal_name") or {}).get("value")

    # trading signals
    signals = []
    win = pol["activity"]["window_days"]
    h = prof.get("headcount")
    if h and h.get("employee_count", 0) > 0 and (days_ago(parse_date(h["date"])) or 1e9) <= win:
        signals.append(f"{h['employee_count']} employees on record as of {h['date']}")
    if prof.get("openings"):
        signals.append(f"{prof['openings']} open job postings")
    news = prof.get("news") or []
    if news and (days_ago(parse_date(news[0]["article_publish_date"])) or 1e9) <= win:
        signals.append(f"news coverage dated {news[0]['article_publish_date']}")
    if web.get("live"):
        signals.append("company website is live")

    # flags
    if res.get("lookalike"):
        lk = res["lookalike"]
        if lk.get("typo_domain"):
            flags.append(f"The website {lk['supplied_domain']} is a near-copy of {lk['their_domain']}, the website of "
                         f"{lk['resembles']}: possible impersonation")
        else:
            flags.append(f"Name resembles {lk['resembles']} ({lk['their_domain']}), but the supplied website is "
                         f"{lk['supplied_domain']}: possible lookalike")
    if res.get("ambiguous"):
        flags.append("Several companies share this name: " + "; ".join(f"{a['name']} ({a['domain']})" for a in res["ambiguous"]))
        missing.append("the vendor's website or CIN to tell them apart")
    if dup.get("shared_bank"):
        flags.append("Bank account already belongs to another vendor in the master: " +
                     ", ".join(d["legal_name"] for d in dup["shared_bank"]))
    notes = []
    reg_dirs = dirs.get("directors") or []
    if reg_dirs and not any(d["confirmed_at_company"] for d in reg_dirs) and prof.get("found"):
        notes.append("Registry directors were not found among the company's founders/CXOs in Crustdata "
                     "(common for board-run companies; not treated as a red flag)")
    for c in dirs.get("claimed") or []:
        if c["on_registry"] is False:
            flags.append(f"Claimed director {c['name']} is not on the registry record")
    id_flags = (state.get("ids") or {}).get("flags") or []
    flags += id_flags
    claim_flags = (state.get("claims") or {}).get("flags") or []
    flags += claim_flags
    notes += (state.get("claims") or {}).get("notes") or []
    notes += (state.get("ids") or {}).get("notes") or []
    adverse_confirmed = []
    for s in (state.get("adverse") or {}).get("screened", []):
        for hit in s.get("confirmed", []):
            adverse_confirmed.append(s["name"])
            flags.append(f"Adverse news names director {s['name']} together with "
                         f"{', '.join(i for i in hit['identifiers'] if i != 'name')}: \"{hit['title']}\"")
        if s.get("namesakes_cleared"):
            notes.append(f"{len(s['namesakes_cleared'])} adverse article(s) about a different {s['name']} were "
                         f"cleared as namesakes (no second identifier)")
        if s.get("searched") != "ok":
            missing.append(f"news screening for {s['name']} (news source did not respond)")
    scr = (state.get("adverse") or {}).get("screened", [])
    if scr and not adverse_confirmed and all(x.get("searched") == "ok" for x in scr):
        notes.append(f"Adverse-media screen: {len(scr)} director(s) searched in the news ({', '.join(x['name'] for x in scr)}); "
                     f"nothing adverse found that names the director together with the company")
    if prof.get("found") and v.get("domain") and prof.get("domain") and v["domain"] != prof["domain"]:
        flags.append(f"Supplied website {v['domain']} differs from the company's primary domain {prof['domain']}")

    if inc and parse_date(inc):
        age_days = days_ago(parse_date(inc)) or 0
        if age_days < 30.4 * float(pol.get("front", {}).get("min_age_months", 6)):
            flags.append(f"Incorporated {inc}, less than {pol['front']['min_age_months']} months ago: "
                         f"a new company needs a person to look before money moves")

    # missing records
    pm = reg.get("possible_match")
    if not reg.get("cin") and pm:
        missing.append(f"the vendor's CIN, website or city, to confirm it is {pm['legal_name']} (CIN {pm['cin']}, "
                       f"registry status {pm.get('status')}) and not another business with a similar name")
        notes.append(f"Possible registry match, not confirmed: {pm['legal_name']} (CIN {pm['cin']}, status {pm.get('status')})")
    elif not reg.get("cin") and v.get("entity_type") in ("proprietorship", "partnership"):
        missing.append(f"a GST registration record (a {v['entity_type']} is not on the MCA company register)")
    elif not reg.get("cin"):
        if reg.get("unavailable"):
            missing.append("company-registry record (registry source did not respond; this is not proof it is missing)")
        else:
            missing.append("company-registry record (no CIN found for this name)")
    if not prof.get("found"):
        missing.append("company profile in Crustdata")

    # decision
    reject_statuses = [s.lower() for s in pol["decision"]["reject_statuses"]]
    if dup.get("exact"):
        decision = "DUPLICATE_HELD"
        reasons.append("Already in the vendor master: " + ", ".join(f"{d['legal_name']} (matched on {', '.join(d['matched_on'])})" for d in dup["exact"]))
    elif dup.get("possible"):
        decision = "DUPLICATE_HELD"
        reasons.append("Possible duplicate of: " + ", ".join(f"{d['legal_name']} (name similarity {d['score']})" for d in dup["possible"]))
    elif status and status.lower() in reject_statuses:
        decision = "REJECTED"
        reasons.append(f"Registry status is '{status}'")
    elif status and status.lower() != "active":
        decision = "REFER"
        reasons.append(f"Registry status is '{status}', not Active: a person decides")
    elif res.get("lookalike") or dup.get("shared_bank") or id_flags or claim_flags or (adverse_confirmed and pol["decision"]["refer_on_adverse_media"]):
        decision = "REFER"
        reasons.append("Red flags need a person: " + "; ".join(flags))
    elif not reg.get("cin") and pol["decision"]["cannot_verify_without_registry"]:
        decision = "CANNOT_VERIFY"
        reasons.append("No registry record settles whether this is a registered business")
    elif status and status.lower() == "active" and len(signals) >= pol["activity"]["min_signals_for_trading"]:
        decision = "CLEARED" if not flags else "REFER"
        reasons.append(f"Registry status Active; trading signals: {'; '.join(signals)}")
        if flags:
            reasons.append("Flags for a person to review: " + "; ".join(flags))
    elif status and status.lower() == "active":
        decision = "REFER"
        reasons.append("Registered and Active, but no sign that it is actually trading (possible front)")
    else:
        decision = "CANNOT_VERIFY"
        reasons.append("The registry record does not state a usable company status")

    # the four answers
    if decision == "CLEARED":
        real = "Yes"
    elif status and status.lower() in reject_statuses:
        real = f"No: registry status is {status}"
    elif not reg.get("cin"):
        real = "Cannot verify"
    elif signals:
        real = "Registered and showing activity, but needs review"
    else:
        real = "Registered, but no evidence of trading"
    def who_line(d):
        base = f"{d['name']} ({d['designation']}, DIN {d['din']})"
        pp = d.get("person")
        if pp and pp.get("title"):
            since = f" since {pp['start_date'][:7]}" if pp.get("start_date") else ""
            return f"{base}: {pp['title']} at the company{since}, confirmed"
        return base + (": confirmed at the company" if d["confirmed_at_company"] else "")
    who = [who_line(d) for d in reg_dirs] or ["Cannot verify: no director record found"]
    if inc:
        d = parse_date(inc)
        age = f" (about {days_ago(d) // 365} years)" if d else ""
        how_long = f"Incorporated {inc}{age}"
    elif prof.get("year_founded"):
        how_long = f"Founded {prof['year_founded']} (company profile; no registry date found)"
    else:
        how_long = "Cannot verify"

    # What the VENDOR can be asked for. Internal gaps (our data sources, news screening) never go to the vendor.
    docs = []
    def ask(x):
        if x not in docs:
            docs.append(x)
    if not reg.get("cin"):
        ask("Your company's CIN (Corporate Identification Number) or certificate of incorporation. "
            "If you are a proprietorship, partnership or LLP, your GST registration certificate or LLP deed")
    if res.get("ambiguous") or (not v.get("domain") and not prof.get("found")):
        ask("Your company's official website")
    if res.get("lookalike"):
        ask("Your official website and CIN, so we can confirm we are dealing with the right company")
    if any("GSTIN" in f for f in flags):
        ask("A copy of your GST registration certificate")
    if any("contact email" in f.lower() for f in flags):
        ask("A letter on company letterhead naming your contact person, sent from an address at your company's domain")
    if any("IFSC" in f for f in flags) or dup.get("shared_bank") or any("account holder" in f for f in flags):
        ask("A cancelled cheque or a bank letter confirming the account number, IFSC and account holder name")
    if any("PIN code" in f or "registered office address" in f for f in flags):
        ask("Your registered office address as filed with the Ministry of Corporate Affairs")
    if any("not on the registry record" in f for f in flags):
        ask("The current list of directors as filed with the Ministry of Corporate Affairs")
    if not res.get("lookalike") and (any("less than" in f and "months ago" in f for f in flags)
                                     or (status and status.lower() == "active" and not signals)):
        ask("Proof that the business is trading: two recent invoices, or a recent GST return")
    if status and status.lower() not in ("active",) and status.lower() not in [x.lower() for x in pol["decision"]["reject_statuses"]]:
        ask("An explanation of the current company status shown on the MCA record")

    keep = int(pol.get("privacy", {}).get("retention_days", 30))
    personal = []
    for d in reg_dirs:
        personal.append({"name": d["name"], "din": d.get("din"), "what": "name, DIN, designation",
                         "source": "MCA company record (public)", "why": "who runs the vendor"})
    for s_ in (state.get("adverse") or {}).get("screened", []):
        for p_ in personal:
            if p_["name"] == s_["name"]:
                p_["why"] += "; news screening"
    personal_data = {"people": personal, "retention_days": keep,
                     "not_collected": "personal emails, phone numbers, home addresses, photos"}

    return {"decision": decision, "reasons": reasons, "flags": flags, "notes": notes, "missing": missing,
            "documents_to_request": docs, "claims": (state.get("claims") or {}).get("rows", []),
            "signals": signals, "legal_name": legal, "status": status, "personal_data": personal_data,
            "answers": {"real_and_trading": real, "who_runs_it": who, "how_long_it_has_existed": how_long,
                        "anything_off": flags or ["Nothing found"]}}


STEPS = [
    ("intake", step_intake),
    ("duplicates", step_duplicates),
    ("resolve", step_resolve),
    ("profile", step_profile),
    ("registry", step_registry),
    ("website", step_website),
    ("ids", step_ids),
    ("directors", step_directors),
    ("claims", step_claims),
    ("adverse", step_adverse),
    ("facts", step_facts),
    ("decide", step_decide),
]
