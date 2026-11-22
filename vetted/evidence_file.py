"""The evidence file for one vendor: everything a client or an auditor needs to see why a decision was made."""
from __future__ import annotations

import html
import time

from .report import to_markdown


def _ts(t) -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t)) if t else "-"


def evidence_markdown(rec: dict, actions: list[dict], ledger: list[dict]) -> str:
    r = rec["result"]
    out = [f"<!-- Vetted evidence file · run {r['run_id']} · generated {_ts(time.time())} -->", to_markdown(r), ""]
    pd = r.get("personal_data") or {}
    out += ["## Personal data used", f"Deleted after {pd.get('retention_days', 30)} days. Not collected: {pd.get('not_collected', '-')}.", ""]
    for p in pd.get("people", []):
        out.append(f"- {p['name']} (DIN {p.get('din')}): {p['what']}, from {p['source']}, used for {p['why']}")
    if not pd.get("people"):
        out.append("- None")
    out += ["", "## Approvals and actions (audit trail)", "", "| Action | Status | Approver | Reason | Executed | Decided at |", "|---|---|---|---|---|---|"]
    for a in actions:
        out.append(f"| {a['kind']} | {a['status']} | {a.get('approver') or '-'} | {a.get('reason') or '-'} | {a.get('executed_count', 0)} | {_ts(a.get('updated_at'))} |")
    if not actions:
        out.append("| none | | | | | |")
    ev = r.get("events") or []
    if ev:
        out += ["", "## Restarts"] + [f"- {_ts(e['ts'])}: resumed from step {e.get('from_step')} with {e.get('completed_steps')} steps saved" for e in ev]
    return "\n".join(out) + "\n"


def evidence_html(rec: dict, actions: list[dict], ledger: list[dict]) -> str:
    r = rec["result"]
    e = html.escape
    a = r.get("answers", {})
    facts = "".join(
        f"<tr><td><b>{e(f['field'])}</b><br>{e(str(f['value']))}</td><td><q>{e(f['passage'][:300])}</q><br>"
        f"<small><a href='{e(f['url'])}'>{e(f['source'])}</a> · {e(f.get('locator') or '')}"
        f"{' · record dated ' + e(f['record_date']) if f.get('record_date') else ''} · retrieved {e(f['retrieved_at'])}</small></td></tr>"
        for f in r.get("facts", []))
    acts = "".join(f"<tr><td>{e(x['kind'])}</td><td>{e(x['status'])}</td><td>{e(x.get('approver') or '-')}</td>"
                   f"<td>{e(x.get('reason') or '-')}</td><td>{x.get('executed_count', 0)}</td><td>{_ts(x.get('updated_at'))}</td></tr>" for x in actions)
    people = "".join(f"<li>{e(p['name'])} (DIN {e(str(p.get('din')))}): {e(p['why'])}</li>" for p in (r.get("personal_data") or {}).get("people", [])) or "<li>None</li>"
    lst = lambda xs: "".join(f"<li>{e(x)}</li>" for x in xs) or "<li>-</li>"
    c = r.get("cost", {})
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Vetted evidence: {e(r.get('vendor') or '')}</title>
<style>body{{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#2b2b2b;max-width:860px;margin:40px auto;padding:0 20px}}
h1{{font-weight:500;letter-spacing:-.02em;margin:0}} h2{{font-weight:500;margin-top:28px;border-bottom:1px solid #e6e3dc;padding-bottom:4px}}
table{{width:100%;border-collapse:collapse;font-size:13px}} td,th{{border-bottom:1px solid #eee;padding:6px 8px;vertical-align:top;text-align:left}}
q{{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#555}} .tag{{display:inline-block;padding:2px 10px;border-radius:999px;background:#eef3ee;font-weight:600}}
small{{color:#777}} @media print{{a{{color:#2b2b2b}}}}</style></head><body>
<p><small>Vetted evidence file · run {e(r['run_id'])} · generated {_ts(time.time())}</small></p>
<h1>{e(r.get('vendor') or '')}</h1><p><span class="tag">{e(r['decision'])}</span> {e(r.get('legal_name') or '')} {('· ' + e(r['registry_status'])) if r.get('registry_status') else ''}</p>
<table><tr><th>Real and trading?</th><td>{e(a.get('real_and_trading',''))}</td></tr>
<tr><th>Who runs it?</th><td>{'<br>'.join(e(x) for x in a.get('who_runs_it') or [])}</td></tr>
<tr><th>How long has it existed?</th><td>{e(a.get('how_long_it_has_existed',''))}</td></tr>
<tr><th>Anything off?</th><td>{'<br>'.join(e(x) for x in a.get('anything_off') or [])}</td></tr></table>
<h2>Why</h2><ul>{lst(r.get('reasons') or [])}</ul>
<h2>Cannot verify: what is missing</h2><ul>{lst(r.get('missing') or [])}</ul>
<h2>Facts and their sources</h2><table>{facts}</table>
<h2>Personal data used</h2><ul>{people}</ul>
<h2>Approvals and actions</h2><table><tr><th>Action</th><th>Status</th><th>Approver</th><th>Reason</th><th>Executed</th><th>At</th></tr>{acts or '<tr><td colspan=6>None</td></tr>'}</table>
<h2>This check</h2><p>Completed in {r.get('seconds')} s · {len(r.get('facts') or [])} facts with a source · billed Rs {c.get('price_inr')}</p>
<script>if(location.search.includes('print'))window.print()</script></body></html>"""
