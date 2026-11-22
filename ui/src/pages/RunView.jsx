import { useEffect, useState } from 'react'
import { Check, Loader2, ArrowUpRight, ArrowDownRight, FileDown, Printer, ChevronDown } from 'lucide-react'
import { api } from '../api'
import ActionCard, { useApprover, ApproverPicker } from '../ActionCard'
import { DecisionBadge, DECISIONS, inr } from '../ui'
import { RunScene } from '../scenes'
import { useCountUp } from '../motion'

const STEP_LABEL = {
  intake: 'Read the request', duplicates: 'Check the vendor master', resolve: 'Find the company',
  profile: 'Company profile', registry: 'Registry record', website: 'Website check', ids: 'Tax ID and bank',
  directors: 'Who runs it', claims: 'Claims vs record', adverse: 'News screen', facts: 'Source check', decide: 'Decision',
}
const FIELD_LABEL = {
  legal_name: 'Legal name', cin: 'CIN', status: 'Company status', incorporation_date: 'Incorporated',
  registered_address: 'Registered address', website: 'Website on record', director: 'Director',
  company_profile_name: 'Profile name', headcount: 'Employees', year_founded: 'Founded', open_jobs: 'Open jobs',
  recent_news: 'Recent news', current_role: 'Current role', website_live: 'Website live', bank_branch: 'Bank branch',
  adverse_media: 'Adverse news', namesake_cleared: 'Namesake cleared',
}
const FACT_GROUPS = [
  { key: 'registry', title: 'Registry record', fields: ['legal_name', 'cin', 'status', 'incorporation_date', 'registered_address', 'website'] },
  { key: 'activity', title: 'Is it trading?', fields: ['company_profile_name', 'headcount', 'year_founded', 'open_jobs', 'website_live', 'recent_news'] },
  { key: 'people', title: 'Who runs it', fields: ['director', 'current_role'] },
  { key: 'money', title: 'Bank and tax', fields: ['bank_branch'] },
  { key: 'news', title: 'News screen', fields: ['adverse_media', 'namesake_cleared'] },
]

export default function RunView({ runId }) {
  const [run, setRun] = useState(null)
  const [tab, setTab] = useState('summary')
  const [approver, setApprover] = useApprover()
  const [err, setErr] = useState('')

  const load = () => api.run(runId).then(setRun).catch(e => setErr(e.message))
  useEffect(() => { load(); const t = setInterval(load, 1500); return () => clearInterval(t) }, [runId])

  if (err) return <p role="alert" className="wrap text-bad">{err}</p>
  if (!run) return <p className="wrap text-muted flex items-center gap-2"><Loader2 className="animate-spin" size={16} />Loading</p>

  const r = run.result
  const req = run.request || {}
  const cost = run.cost_live || {}
  const running = run.status === 'running'
  // a finished check lists only the steps it ran (older checks predate some steps)
  const steps = running ? run.steps : run.steps.filter(s => s.status === 'done')
  const doneCount = steps.filter(s => s.status === 'done').length
  const pending = (run.actions || []).filter(a => ['pending_approval', 'held'].includes(a.status)).length
  const tabs = [
    { key: 'summary', label: 'Summary' },
    { key: 'facts', label: 'Facts', count: r?.facts?.length },
    { key: 'approvals', label: 'Approvals', count: run.actions?.length, alert: pending },
    { key: 'data', label: 'Data and cost' },
  ]

  return (
    <div className="wrap">
      <div className="vt-bleed enter mb-10"><RunScene progress={steps.length ? doneCount / steps.length : 0} running={running} decision={r?.decision} /></div>
      <div className="grid md:grid-cols-12 gap-x-8 gap-y-10">
        <aside className="md:col-span-4 md:sticky md:top-28 self-start space-y-8 enter">
          <div>
            <p className="lead"><b>Vendor check,</b> {running ? 'gathering the facts now.' : 'finished. Every step was saved as it ran.'}</p>
            <p className="mono text-muted mt-2">{run.run_id}</p>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-medium">Steps</h2>
              <span className="mono text-muted">{doneCount}/{steps.length}</span>
            </div>
            <div className="h-1 rounded-full bg-soft overflow-hidden mb-4"><div className="h-full bg-ink transition-all duration-500" style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }} /></div>
            <ol className="space-y-2 stagger">
              {steps.map(s => (
                <li key={s.step} className="flex items-center gap-2.5 text-sm">
                  <span className={`w-5 h-5 rounded-full grid place-items-center shrink-0 ${s.status === 'done' ? 'bg-ink text-bg' : 'bg-soft'}`}>
                    {s.status === 'done' ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : s.status === 'running' ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : null}
                  </span>
                  <span className={`flex-1 ${s.status === 'pending' ? 'text-muted' : ''} ${s.status === 'running' ? 'shimmer font-medium' : ''}`}>{STEP_LABEL[s.step] || s.step}</span>
                  {s.seconds !== null && <span className="mono text-muted">{s.seconds}s</span>}
                </li>
              ))}
            </ol>
          </div>
          <div className="panel p-5">
            <h2 className="text-sm font-medium">Cost of this check</h2>
            <CostFigure inr={cost.full_inr ?? cost.inr} />
            <p className="text-xs text-muted mt-2">Full cost with nothing cached. Paid this time: {inr(cost.inr)}.</p>
            <dl className="mt-4 grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted">Crustdata credits</dt><dd className="text-right mono">{cost.full_credits ?? cost.credits ?? 0}</dd>
              {r?.cost?.price_inr != null && <><dt className="text-muted">Price to client</dt><dd className="text-right mono">{inr(r.cost.price_inr)}</dd></>}
              {r?.seconds != null && <><dt className="text-muted">Time</dt><dd className="text-right mono">{r.seconds}s</dd></>}
            </dl>
          </div>
        </aside>

        <div className="md:col-span-8 min-w-0">
          {(run.events || []).filter(e => e.kind === 'resumed').map((e, i) => (
            <div key={i} className="pop mb-6 rounded bg-ok-bg text-ok px-4 py-3 text-sm flex flex-wrap gap-x-2">
              <span className="font-medium">Resumed after a restart</span>
              <span>at {new Date(e.ts * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}, from step {e.from_step || 'decision'} with {e.completed_steps} steps already saved. Nothing already paid for was paid again.</span>
            </div>
          ))}
          <h1 className="h-hero enter enter-1">{req.vendor_name || req.website || 'Vendor check'}</h1>

          {!r ? (
            <p className="body-lg mt-3 enter enter-2" aria-live="polite"><span className="shimmer">Checking the registry, staff, hiring and news.</span> Each step is saved, so a restart picks up where it stopped.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 mt-5">
                <DecisionBadge decision={r.decision} size="lg" />
                {r.legal_name && <span className="text-sm text-muted">{r.legal_name}{r.registry_status ? ` · ${r.registry_status}` : ''}</span>}
              </div>
              <p className="body-lg mt-3">{DECISIONS[r.decision]?.line}</p>

              <div role="tablist" aria-label="Check details" className="mt-8 flex gap-1 p-1 rounded bg-soft overflow-x-auto sticky top-[72px] z-20">
                {tabs.map(t => (
                  <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                          className={`relative h-9 px-3.5 rounded-[8px] text-sm whitespace-nowrap transition ${tab === t.key ? 'bg-card text-ink font-medium shadow-[0_1px_2px_oklch(0.289_0_0/.08)]' : 'text-muted hover:text-ink'}`}>
                    {t.label}{t.count ? <span className="mono text-muted"> {t.count}</span> : null}
                    {t.alert > 0 && <span className="ml-1.5 inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-warn text-white text-[11px] font-medium pop">{t.alert}</span>}
                  </button>
                ))}
              </div>

              <div className="mt-6" key={tab}>
                {tab === 'summary' && <Summary r={r} req={req} onApprovals={() => setTab('approvals')} pending={pending} />}
                {tab === 'facts' && <Facts r={r} />}
                {tab === 'approvals' && <Approvals run={run} approver={approver} setApprover={setApprover} reload={load} />}
                {tab === 'data' && <DataAndCost r={r} runId={runId} />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ summary */
function Summary({ r, req, onApprovals, pending }) {
  const a = r.answers || {}
  const who = a.who_runs_it || []
  const [allWho, setAllWho] = useState(false)
  const shownWho = allWho ? who : who.slice(0, 3)
  const mismatches = (r.claims || []).filter(c => c.match === false).length
  return (
    <div className="pop">
      {pending > 0 && (
        <button onClick={onApprovals} className="w-full mb-6 rounded bg-warn-bg text-warn px-4 py-3 text-sm flex flex-wrap gap-2 items-center justify-between hover:brightness-[.98] transition">
          <span><b className="font-medium">{pending} action{pending > 1 ? 's' : ''} waiting for a person.</b> Nothing is sent until someone approves.</span>
          <span className="inline-flex items-center gap-1 font-medium">Review <ArrowDownRight size={15} aria-hidden="true" /></span>
        </button>
      )}

      <dl className="border-t border-line">
        <Row q="Is it a real, trading business?">{a.real_and_trading}</Row>
        <Row q="Who runs it?">
          <ul className="space-y-1">{shownWho.map((w, i) => <li key={i}>{w}</li>)}</ul>
          {who.length > 3 && (
            <button className="mt-2 text-sm font-medium inline-flex items-center gap-1 text-ink hover:underline underline-offset-4" onClick={() => setAllWho(v => !v)}>
              {allWho ? 'Show fewer' : `Show ${who.length - 3} more`} <ChevronDown size={14} className={allWho ? 'rotate-180' : ''} aria-hidden="true" />
            </button>
          )}
        </Row>
        <Row q="How long has it existed?">{a.how_long_it_has_existed}</Row>
        <Row q="Anything off?"><ul className="space-y-1">{(a.anything_off || []).map((x, i) => <li key={i}>{x}</li>)}</ul></Row>
      </dl>

      {['CANNOT_VERIFY', 'REFER'].includes(r.decision) && (
        <button className="btn-soft mt-6" onClick={() => {
          sessionStorage.setItem('vetted.prefill', JSON.stringify({ ...req, vendor_name: req.vendor_name || r.vendor || '', directors: req.directors || [] }))
          window.location.hash = '#/'
        }}>Add the missing details and check again <ArrowDownRight size={16} aria-hidden="true" /></button>
      )}

      <div className="mt-8 grid md:grid-cols-2 gap-x-8 gap-y-6">
        {r.reasons?.length > 0 && <List title="Why" items={r.reasons} />}
        {r.missing?.length > 0 && <List title="Cannot verify: what is missing" items={r.missing} />}
      </div>
      {r.notes?.length > 0 && <Collapsible title="Notes" badge={`${r.notes.length}`} className="mt-6"><div className="px-2 pb-1"><List items={r.notes} /></div></Collapsible>}

      {r.claims?.length > 0 && (
        <Collapsible title="What the vendor claimed, against the record" badge={mismatches ? `${mismatches} do not match` : 'all match'}
                     badgeTone={mismatches ? 'bad' : 'ok'} defaultOpen={mismatches > 0} className="mt-3">
          <ClaimsTable claims={r.claims} />
        </Collapsible>
      )}
    </div>
  )
}

function Row({ q, children }) {
  return (
    <div className="py-4 grid sm:grid-cols-[210px_1fr] gap-2 border-b border-line">
      <dt className="text-sm font-medium pt-0.5">{q}</dt>
      <dd className="text-[15px] leading-relaxed">{children || '—'}</dd>
    </div>
  )
}

function ClaimsTable({ claims }) {
  return (
    <div className="frame overflow-x-auto" data-lenis-prevent>
      <table className="w-full text-sm table-fixed min-w-[600px]">
        <colgroup><col className="w-[22%]" /><col className="w-[28%]" /><col className="w-[30%]" /><col className="w-[20%]" /></colgroup>
        <thead className="text-left text-muted border-b border-line"><tr>{['Field', 'Claimed', 'Record', 'Result'].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="stagger">
          {claims.map((c, i) => (
            <tr key={i} className={`border-b border-line last:border-0 align-top ${c.match === false ? 'bg-bad-bg' : ''}`}>
              <td className="px-4 py-3 font-medium">{c.field}</td>
              <td className="px-4 py-3 break-words">{c.claimed}</td>
              <td className="px-4 py-3 break-words">{c.record}<span className="block text-xs text-muted">{c.source}</span></td>
              <td className="px-4 py-3 whitespace-nowrap">{c.match === true ? <span className="text-ok font-medium">Matches</span> : c.match === false ? <span className="text-bad font-medium">Does not match</span> : <span className="text-muted">Could not confirm</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ facts */
function Facts({ r }) {
  const facts = r.facts || []
  const groups = FACT_GROUPS.map(g => ({ ...g, items: facts.filter(f => g.fields.includes(f.field)) })).filter(g => g.items.length)
  const other = facts.filter(f => !FACT_GROUPS.some(g => g.fields.includes(f.field)))
  if (other.length) groups.push({ key: 'other', title: 'Other', items: other })
  return (
    <div className="pop space-y-3">
      <p className="text-sm text-muted">{facts.length} facts passed the source check{r.rejected_facts?.length ? `, ${r.rejected_facts.length} dropped` : ''}. Each links to its record. Click a fact to see the exact passage.</p>
      {groups.map((g, i) => (
        <Collapsible key={g.key} title={g.title} badge={`${g.items.length}`} defaultOpen={i === 0}>
          <ul className="frame divide-y divide-line">{g.items.map((f, j) => <FactRow key={j} f={f} />)}</ul>
        </Collapsible>
      ))}
      {!facts.length && <p className="text-muted">No fact could be tied to a record.</p>}
    </div>
  )
}

function FactRow({ f }) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button className="w-full text-left px-4 py-3 grid grid-cols-[120px_1fr_auto] gap-3 items-start hover:bg-bg transition" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="eyebrow pt-0.5">{FIELD_LABEL[f.field] || f.field}</span>
        <span className="min-w-0">
          <span className="block font-medium truncate" title={String(f.value)}>{String(f.value)}</span>
          <span className="block text-xs text-muted truncate">{f.source}{f.record_date ? ` · dated ${f.record_date}` : ''} · retrieved {f.retrieved_at}</span>
        </span>
        <ChevronDown size={16} className={`mt-1 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="px-4 pb-4 -mt-1 pop">
          <blockquote className="mono text-[oklch(0.37_0_0)] bg-bg rounded px-3 py-2 break-words">{f.passage}</blockquote>
          <p className="mt-2 text-[13px] text-muted flex flex-wrap gap-x-3 gap-y-1">
            <a href={f.url} target="_blank" rel="noreferrer" className="textlink !font-medium !text-ink">Open the record<ArrowUpRight size={13} aria-hidden="true" /></a>
            {f.locator && <span>{f.locator}</span>}
            {f.note && <span>{f.note}</span>}
          </p>
        </div>
      )}
    </li>
  )
}

/* ------------------------------------------------------------------ approvals */
function Approvals({ run, approver, setApprover, reload }) {
  const acts = run.actions || []
  return (
    <div className="pop">
      {acts.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-sm text-muted">Sign in as an approver to decide.</p>
            <ApproverPicker approver={approver} setApprover={setApprover} />
          </div>
          <div className="space-y-3 stagger">{acts.map(a => <ActionCard key={a.action_id} action={a} approver={approver} onChange={reload} />)}</div>
        </>
      ) : <p className="text-muted">This check proposed no actions.</p>}

      {(acts.some(a => a.approver) || run.events?.length > 0) && (
        <Collapsible title="Audit trail" className="mt-8" defaultOpen>
          <ol className="border-l border-line ml-2 pl-5 py-1 space-y-3 text-sm">
            <li><span className="mono text-muted">{new Date(run.created_at * 1000).toLocaleTimeString('en-IN')}</span> Check requested</li>
            {(run.events || []).map((e, i) => <li key={'e' + i}><span className="mono text-muted">{new Date(e.ts * 1000).toLocaleTimeString('en-IN')}</span> Service restarted; resumed from step {e.from_step}</li>)}
            {acts.filter(a => a.approver).map(a => (
              <li key={a.action_id}><span className="mono text-muted">{new Date(a.updated_at * 1000).toLocaleTimeString('en-IN')}</span> {a.approver} chose <b className="font-medium">{a.status === 'blocked' ? 'block' : a.status === 'held' ? 'hold' : 'approve'}</b> on “{a.kind.replace('_', ' ')}”{a.reason ? `, reason: ${a.reason}` : ''}{a.status === 'done' ? `; executed ${a.executed_count} time${a.executed_count === 1 ? '' : 's'}` : ''}{a.result?.via ? ` (${a.result.via})` : ''}</li>
            ))}
          </ol>
        </Collapsible>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ data and cost */
function DataAndCost({ r, runId }) {
  const [ledger, setLedger] = useState(null)
  const [log, setLog] = useState(null)
  const pd = r.personal_data
  return (
    <div className="pop space-y-3">
      <div className="flex flex-wrap gap-2 mb-3">
        <a className="btn-dark" href={`/api/runs/${runId}/evidence`}><FileDown size={16} aria-hidden="true" />Download evidence file</a>
        <a className="btn-soft" href={`/api/runs/${runId}/evidence?fmt=html&print=1`} target="_blank" rel="noreferrer"><Printer size={16} aria-hidden="true" />Print as PDF</a>
      </div>

      {pd && (
        <Collapsible title="Personal data used" badge={`${pd.people?.length || 0} people · deleted after ${pd.retention_days} days`} defaultOpen>
          <p className="text-sm text-muted mb-3 px-2">Only what the job needs, from public company records. Not collected: {pd.not_collected}.</p>
          {pd.people?.length ? (
            <ul className="grid sm:grid-cols-2 gap-2">
              {pd.people.map((p, i) => (
                <li key={i} className="rounded bg-card px-4 py-3 text-sm">
                  <p className="font-medium">{p.name} <span className="mono text-muted">DIN {p.din}</span></p>
                  <p className="text-muted">used for {p.why}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted px-2">No personal data was used for this check.</p>}
        </Collapsible>
      )}

      <Collapsible title="Cost ledger" badge={`${r.cost?.calls ?? 0} calls · ${inr(r.cost?.full_inr ?? r.cost?.inr)}`} onOpen={() => !ledger && api.ledger(runId).then(setLedger)}>
        {!ledger ? <p className="text-sm text-muted flex items-center gap-2 px-2"><Loader2 size={14} className="animate-spin" />Loading</p> : (
          <div className="frame overflow-auto max-h-96" data-lenis-prevent>
            <table className="w-full text-sm">
              <thead className="text-left text-muted border-b border-line sticky top-0 bg-card"><tr>{['Step', 'Provider', 'Endpoint', 'Result', 'Credits', '₹'].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {ledger.calls.map(c => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">{c.step}</td><td className="px-4 py-2">{c.provider}</td>
                    <td className="px-4 py-2 mono max-w-[220px] truncate" title={c.endpoint}>{c.endpoint}</td>
                    <td className="px-4 py-2">{c.outcome}</td><td className="px-4 py-2 mono">{c.list_credits ?? c.credits}</td><td className="px-4 py-2 mono">{c.list_inr ?? c.inr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Collapsible>

      <Collapsible title="Run log" badge="every step and call" onOpen={() => !log && api.log(runId).then(setLog)}>
        {!log ? <p className="text-sm text-muted flex items-center gap-2 px-2"><Loader2 size={14} className="animate-spin" />Loading</p> : (
          <div className="frame p-4 max-h-80 overflow-auto" data-lenis-prevent>
            <ol className="mono text-[12px] space-y-1">
              {log.lines.map((l, i) => (
                <li key={i} className="grid grid-cols-[72px_90px_1fr] gap-3">
                  <span className="text-muted">{(l.ts || '').slice(11)}</span><span>{l.step}</span>
                  <span className="truncate" title={JSON.stringify(l)}>{l.event}{l.reason ? `: ${l.reason}` : ''}{l.seconds != null ? ` (${l.seconds}s)` : ''}{l.wait_s ? ` wait ${l.wait_s}s` : ''}{l.endpoint ? ` ${l.endpoint}` : ''}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Collapsible>
    </div>
  )
}

/* ------------------------------------------------------------------ shared */
function Collapsible({ title, badge, badgeTone, defaultOpen = false, onOpen, className = '', children }) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => { if (defaultOpen && onOpen) onOpen() }, [])
  const tone = badgeTone === 'bad' ? 'bg-bad-bg text-bad' : badgeTone === 'ok' ? 'bg-ok-bg text-ok' : 'bg-card text-muted'
  return (
    <section className={`panel ${className}`}>
      <button className="w-full flex items-center justify-between gap-3 px-4 h-12 text-left" aria-expanded={open}
              onClick={() => { const n = !open; setOpen(n); if (n && onOpen) onOpen() }}>
        <span className="font-medium text-[15px] truncate">{title}</span>
        <span className="flex items-center gap-2 shrink-0">
          {badge && <span className={`px-2 py-0.5 rounded-full text-xs ${tone}`}>{badge}</span>}
          <ChevronDown size={18} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      </button>
      {open && <div className="px-2 pb-2 md:px-3 md:pb-3 pop">{children}</div>}
    </section>
  )
}

function List({ title, items }) {
  return (
    <div>
      {title && <h3 className="text-sm font-medium mb-2">{title}</h3>}
      <ul className="space-y-1.5 text-[15px] text-muted">{items.map((x, i) => <li key={i} className="pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[0.6em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-line">{x}</li>)}</ul>
    </div>
  )
}

function CostFigure({ inr: value }) {
  const v = useCountUp(value || 0, 700)
  return <p className="text-[40px] leading-none font-medium tracking-tight mt-4 tabular-nums">{inr(Math.round(v * 100) / 100)}</p>
}
