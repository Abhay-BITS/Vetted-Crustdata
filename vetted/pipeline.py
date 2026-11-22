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
        score = fuzz.token_set_ratio(norm_name(v.get("vendor_name")), norm_name(r.get("legal_name")))
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
    out["candidates"] = (by_domain + by_name)[:8]

    if by_domain:
        out["company"] = by_domain[0]
    elif by_name and not v.get("domain"):
        top = [m for m in by_name if m["confidence"] == by_name[0]["confidence"]]
        if len(top) == 1:
            out["company"] = top[0]
        else:
            out["ambiguous"] = [{"name": m["name"], "domain": m["domain"]} for m in top[:5]]

    # Lookalike: the claimed name resembles a company whose domain is not the one supplied.
    if v.get("vendor_name") and v.get("domain"):
        for m in by_name:
            if not m.get("domain"):
                continue
            score = fuzz.token_set_ratio(norm_name(v["vendor_name"]), norm_name(m["name"]))
            same_site = v["domain"] in ([m["domain"]] + m["all_domains"])
            if score >= th and not same_site:
                if out["company"] and out["company"].get("id") == m.get("id"):
                    continue
                out["lookalike"] = {"resembles": m["name"], "their_domain": m["domain"],
                                    "supplied_domain": v["domain"], "name_similarity": score,
                                    "their_size": m.get("size")}
                break
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
        q = f"{names[0]} CIN company registration India"
        r = cd.web_search(q)
        out["search_status"] = r.outcome
        if r.ok and r.data:
            blob = " ".join(f"{x.get('title','')} {x.get('snippet','')}" for x in r.data.get("results", []))
            cins = find_cins(blob)
    out["candidates"] = cins[:4]

    best = None
    for cin in cins[:4]:
        page = reg.instafinancials(cin)
        if page.outcome == "unavailable":
            out["unavailable"].append(f"instafinancials:{cin}")
            continue
        if page.outcome != "ok":
            continue
        legal = (page.fields.get("legal_name") or {}).get("value", "")
        score = max([fuzz.token_set_ratio(norm_name(n), norm_name(legal)) for n in names] or [0])
        if v.get("cin") == cin or score >= 80:
            if best is None or score > best[0]:
                best = (score, cin, page)
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
    if "://" not in site:
        site = "https://" + site
    r = CrustdataClient(ctx).web_fetch([site])
    if not r.ok or not isinstance(r.data, list):
        return {"checked": True, "live": None, "outcome": r.outcome, "url": site}
    ok = [e for e in r.data if e.get("success")]
    if not ok:
        return {"checked": True, "live": False, "url": site, "retrieved_at": r.retrieved_at}
    e = ok[0]
    return {"checked": True, "live": True, "url": e.get("url") or site, "title": (e.get("title") or "")[:200],
            "timestamp": e.get("timestamp"), "retrieved_at": r.retrieved_at}


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
    claimed_check = []
    for c in claimed:
        on_record = any(fuzz.token_sort_ratio(c.lower(), d["name"].lower()) >= th for d in directors)
        claimed_check.append({"name": c, "on_registry": on_record if directors else None})
    return {"directors": rows, "claimed": claimed_check, "registry_has_directors": bool(directors)}


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
            m = d.get("crustdata_match")
            if m:
                facts.append(make_fact(subject=d["name"], field="current_role", value=m.get("title") or "",
                                       source=api, url="https://api.crustdata.com/company/enrich",
                                       locator=f"people.{m['group']} (person id {m.get('person_id')})",
                                       passage=f"name: {m['name']}; current_title: {m.get('title')}; current employers: {', '.join(m.get('current_employers') or [])}",
                                       record_date=(m.get("updated_at") or "")[:10] or None, retrieved_at=ret))
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
        flags.append(f"Name resembles {lk['resembles']} ({lk['their_domain']}), but the supplied website is "
                     f"{lk['supplied_domain']}: possible lookalike")
    if res.get("ambiguous"):
        flags.append("Several companies share this name: " + "; ".join(f"{a['name']} ({a['domain']})" for a in res["ambiguous"]))
        missing.append("the vendor's website or CIN to tell them apart")
    if dup.get("shared_bank"):
        flags.append("Bank account already belongs to another vendor in the master: " +
                     ", ".join(d["legal_name"] for d in dup["shared_bank"]))
    reg_dirs = dirs.get("directors") or []
    if reg_dirs and not any(d["confirmed_at_company"] for d in reg_dirs) and prof.get("found"):
        flags.append("None of the registry directors could be matched to the company's people in Crustdata")
    for c in dirs.get("claimed") or []:
        if c["on_registry"] is False:
            flags.append(f"Claimed director {c['name']} is not on the registry record")
    if prof.get("found") and v.get("domain") and prof.get("domain") and v["domain"] != prof["domain"]:
        flags.append(f"Supplied website {v['domain']} differs from the company's primary domain {prof['domain']}")

    # missing records
    if not reg.get("cin"):
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
    elif res.get("lookalike") or dup.get("shared_bank"):
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
    who = [f"{d['name']} ({d['designation']}, DIN {d['din']})" + (" — confirmed at the company" if d["confirmed_at_company"] else "")
           for d in reg_dirs] or (["Cannot verify: no director record found"])
    if inc:
        d = parse_date(inc)
        age = f" (about {days_ago(d) // 365} years)" if d else ""
        how_long = f"Incorporated {inc}{age}"
    elif prof.get("year_founded"):
        how_long = f"Founded {prof['year_founded']} (company profile; no registry date found)"
    else:
        how_long = "Cannot verify"

    return {"decision": decision, "reasons": reasons, "flags": flags, "missing": missing, "signals": signals,
            "legal_name": legal, "status": status,
            "answers": {"real_and_trading": real, "who_runs_it": who, "how_long_it_has_existed": how_long,
                        "anything_off": flags or ["Nothing found"]}}


STEPS = [
    ("intake", step_intake),
    ("duplicates", step_duplicates),
    ("resolve", step_resolve),
    ("profile", step_profile),
    ("registry", step_registry),
    ("website", step_website),
    ("directors", step_directors),
    ("facts", step_facts),
    ("decide", step_decide),
]
