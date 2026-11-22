import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Loader2, ExternalLink, Receipt } from 'lucide-react'
import { api } from '../api'
import ActionCard, { useApprover } from '../ActionCard'
import { DecisionBadge, DECISIONS, PageHeader, inr } from '../ui'

const STEP_LABEL = {
  intake: 'Read the request', duplicates: 'Check the vendor master', resolve: 'Find the company',
  profile: 'Company profile', registry: 'Registry record', website: 'Website check',
  directors: 'Who runs it', adverse: 'News screen', facts: 'Source check', decide: 'Decision',
}
const FIELD_LABEL = {
  legal_name: 'Legal name', cin: 'CIN', status: 'Company status', incorporation_date: 'Incorporated',
  registered_address: 'Registered address', website: 'Website on record', director: 'Director',
  company_profile_name: 'Profile name', headcount: 'Employees', year_founded: 'Founded', open_jobs: 'Open jobs',
  recent_news: 'Recent news', current_role: 'Current role', website_live: 'Website live',
  adverse_media: 'Adverse news', namesake_cleared: 'Namesake cleared',
}

export default function RunView({ runId }) {
  const [run, setRun] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [showLedger, setShowLedger] = useState(false)
  const [approver, setApprover] = useApprover()
  const [err, setErr] = useState('')

  const load = () => api.run(runId).then(setRun).catch(e => setErr(e.message))
  useEffect(() => {
    load()
    const t = setInterval(() => { load() }, 1200)
    return () => clearInterval(t)
  }, [runId])
  useEffect(() => { if (showLedger) api.ledger(runId).then(setLedger) }, [showLedger, run?.status])

  if (err) return <p role="alert" className="text-bad">{err}</p>
  if (!run) return <p className="text-muted flex items-center gap-2"><Loader2 className="animate-spin" size={16} />Loading</p>

  const r = run.result
  const req = run.request || {}
  const cost = run.cost_live || {}
  const running = run.status === 'running'

  return (
    <>
      <PageHeader eyebrow={`Check ${run.run_id}`} title={req.vendor_name || req.website || 'Vendor check'} />

      <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {r ? <Report r={r} /> : (
            <section className="card p-6" aria-live="polite">
              <h2 className="font-semibold mb-1">Gathering the facts</h2>
              <p className="text-muted text-sm">Each step is saved as it finishes, so a restart picks up where it stopped.</p>
            </section>
          )}

          {run.actions?.length > 0 && (
            <section aria-labelledby="actions-h">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                <h2 id="actions-h" className="text-xl font-semibold">Actions waiting for a person</h2>
                <label className="text-sm flex items-center gap-2">
                  <span className="text-muted">Approver</span>
                  <input className="field !min-h-[40px] w-48" value={approver} onChange={e => setApprover(e.target.value)} placeholder="Your name" aria-label="Approver name" />
                </label>
              </div>
              <div className="space-y-4">
                {run.actions.map(a => <ActionCard key={a.action_id} action={a} approver={approver} onChange={load} />)}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-8">
          <section className="card p-5" aria-label="Progress">
            <h2 className="font-semibold mb-4">Steps</h2>
            <ol className="space-y-2.5">
              {run.steps.map(s => (
                <li key={s.step} className="flex items-center gap-2.5 text-[15px]">
                  {s.status === 'done' ? <CheckCircle2 size={18} className="text-ok shrink-0" aria-hidden="true" />
                    : s.status === 'running' ? <Loader2 size={18} className="text-accent animate-spin shrink-0" aria-hidden="true" />
                    : <Circle size={18} className="text-line shrink-0" aria-hidden="true" />}
                  <span className={`flex-1 ${s.status === 'pending' ? 'text-muted' : ''}`}>{STEP_LABEL[s.step] || s.step}</span>
                  {s.seconds !== null && <span className="mono text-muted">{s.seconds}s</span>}
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-5" aria-label="Cost of this check">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Cost of this check</h2>
              {running && <Loader2 size={16} className="animate-spin text-muted" aria-hidden="true" />}
            </div>
            <p className="text-[32px] font-semibold leading-none">{inr(cost.inr)}</p>
            <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">Crustdata credits</dt><dd className="text-right mono">{cost.credits ?? 0}</dd>
              <dt className="text-muted">LLM tokens</dt><dd className="text-right mono">{cost.tokens ?? 0}</dd>
              <dt className="text-muted">Calls (cached)</dt><dd className="text-right mono">{cost.calls ?? 0} ({cost.cached_calls ?? 0})</dd>
              {r?.cost?.price_inr != null && <><dt className="text-muted">Price to client</dt><dd className="text-right mono">{inr(r.cost.price_inr)}</dd></>}
              {r?.seconds != null && <><dt className="text-muted">Time</dt><dd className="text-right mono">{r.seconds}s</dd></>}
            </dl>
            <button className="btn-secondary w-full mt-4" onClick={() => setShowLedger(v => !v)}>
              <Receipt size={16} aria-hidden="true" />{showLedger ? 'Hide the call ledger' : 'Show the call ledger'}
            </button>
          </section>
        </aside>
      </div>

      {showLedger && ledger && (
        <section className="card mt-6 overflow-x-auto" aria-label="Call ledger">
          <table className="w-full text-sm">
            <thead className="text-left text-muted border-b border-line">
              <tr>{['Step', 'Provider', 'Endpoint', 'Result', 'Credits', '₹', 'ms'].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {ledger.calls.map(c => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">{c.step}</td><td className="px-4 py-2.5">{c.provider}</td>
                  <td className="px-4 py-2.5 mono max-w-[320px] truncate" title={c.endpoint}>{c.endpoint}</td>
                  <td className="px-4 py-2.5">{c.outcome}</td><td className="px-4 py-2.5 mono">{c.credits}</td>
                  <td className="px-4 py-2.5 mono">{c.inr}</td><td className="px-4 py-2.5 mono">{c.duration_ms ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}

function Report({ r }) {
  const d = DECISIONS[r.decision] || {}
  const a = r.answers || {}
  const rows = [
    ['Is it a real, trading business?', a.real_and_trading],
    ['Who runs it?', (a.who_runs_it || []).join('\n')],
    ['How long has it existed?', a.how_long_it_has_existed],
    ['Anything off?', (a.anything_off || []).join('\n')],
  ]
  return (
    <>
      <section className="card p-6">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <DecisionBadge decision={r.decision} size="lg" />
          {r.legal_name && <span className="text-muted">{r.legal_name}{r.registry_status ? ` · ${r.registry_status}` : ''}</span>}
        </div>
        <p className="text-muted">{d.line}</p>
        <dl className="mt-6 divide-y divide-line border-y border-line">
          {rows.map(([q, ans]) => (
            <div key={q} className="py-4 grid sm:grid-cols-[220px_1fr] gap-2">
              <dt className="font-medium">{q}</dt>
              <dd className="whitespace-pre-line">{ans || '—'}</dd>
            </div>
          ))}
        </dl>
        {(r.reasons?.length > 0 || r.missing?.length > 0 || r.notes?.length > 0) && (
          <div className="mt-6 grid md:grid-cols-2 gap-6 text-[15px]">
            {r.reasons?.length > 0 && <List title="Why" items={r.reasons} />}
            {r.missing?.length > 0 && <List title="Cannot verify: what is missing" items={r.missing} tone="text-unk" />}
            {r.notes?.length > 0 && <List title="Notes" items={r.notes} />}
          </div>
        )}
      </section>

      <section className="card overflow-hidden" aria-labelledby="facts-h">
        <div className="px-6 pt-6 pb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="facts-h" className="text-xl font-semibold">Facts and their sources</h2>
          <span className="text-sm text-muted">{r.facts?.length || 0} facts passed the source check{r.rejected_facts?.length ? `, ${r.rejected_facts.length} dropped` : ''}</span>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {(r.facts || []).map((f, i) => (
            <li key={i} className="px-6 py-4 grid md:grid-cols-[180px_1fr] gap-x-6 gap-y-2">
              <div>
                <p className="eyebrow">{FIELD_LABEL[f.field] || f.field}</p>
                <p className="font-medium mt-1 break-words">{String(f.value)}</p>
              </div>
              <div className="min-w-0">
                <blockquote className="mono text-ink/80 bg-paper border-l-2 border-accent/40 px-3 py-2 rounded-r break-words">{f.passage}</blockquote>
                <p className="mt-2 text-sm text-muted flex flex-wrap gap-x-3 gap-y-1">
                  <a href={f.url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">{f.source}<ExternalLink size={13} aria-hidden="true" /></a>
                  {f.locator && <span>{f.locator}</span>}
                  {f.record_date && <span>record dated {f.record_date}</span>}
                  <span>retrieved {f.retrieved_at}</span>
                </p>
                {f.note && <p className="mt-1 text-sm text-muted">{f.note}</p>}
              </div>
            </li>
          ))}
          {!r.facts?.length && <li className="px-6 py-6 text-muted">No fact could be tied to a record.</li>}
        </ul>
      </section>
    </>
  )
}

function List({ title, items, tone = '' }) {
  return (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <ul className={`space-y-1.5 list-disc pl-5 ${tone}`}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  )
}
