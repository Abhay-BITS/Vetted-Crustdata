import { useEffect, useState } from 'react'
import { Check, Loader2, ArrowUpRight, ArrowDownRight, FileDown, Printer, ScrollText } from 'lucide-react'
import { api } from '../api'
import ActionCard, { useApprover, ApproverPicker } from '../ActionCard'
import { DecisionBadge, DECISIONS, inr } from '../ui'
import { RunScene } from '../scenes'
import { useCountUp } from '../motion'

const STEP_LABEL = {
  intake: 'Read the request', duplicates: 'Check the vendor master', resolve: 'Find the company',
  profile: 'Company profile', registry: 'Registry record', website: 'Website check', ids: 'Tax ID and bank',
  directors: 'Who runs it', adverse: 'News screen', facts: 'Source check', decide: 'Decision',
}
const FIELD_LABEL = {
  legal_name: 'Legal name', cin: 'CIN', status: 'Company status', incorporation_date: 'Incorporated',
  registered_address: 'Registered address', website: 'Website on record', director: 'Director',
  company_profile_name: 'Profile name', headcount: 'Employees', year_founded: 'Founded', open_jobs: 'Open jobs',
  recent_news: 'Recent news', current_role: 'Current role', website_live: 'Website live', bank_branch: 'Bank branch',
  adverse_media: 'Adverse news', namesake_cleared: 'Namesake cleared',
}

export default function RunView({ runId }) {
  const [run, setRun] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [showLedger, setShowLedger] = useState(false)
  const [log, setLog] = useState(null)
  const [approver, setApprover] = useApprover()
  const [err, setErr] = useState('')

  const load = () => api.run(runId).then(setRun).catch(e => setErr(e.message))
  useEffect(() => { load(); const t = setInterval(load, 1200); return () => clearInterval(t) }, [runId])
  useEffect(() => { if (showLedger) api.ledger(runId).then(setLedger) }, [showLedger, run?.status])

  if (err) return <p role="alert" className="wrap text-bad">{err}</p>
  if (!run) return <p className="wrap text-muted flex items-center gap-2"><Loader2 className="animate-spin" size={16} />Loading</p>

  const r = run.result
  const req = run.request || {}
  const cost = run.cost_live || {}
  const running = run.status === 'running'
  const doneCount = run.steps.filter(s => s.status === 'done').length

  return (
    <div className="wrap">
      <div className="vt-bleed enter mb-10"><RunScene progress={doneCount / run.steps.length} running={running} decision={r?.decision} /></div>
      <div className="grid md:grid-cols-12 gap-x-8 gap-y-10">
        <aside className="md:col-span-4 md:sticky md:top-28 self-start space-y-8 enter">
          <div>
            <p className="lead"><b>Vendor check,</b> {running ? 'gathering the facts now.' : 'finished. Every step was saved as it ran.'}</p>
            <p className="mono text-muted mt-2">{run.run_id}</p>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-medium">Steps</h2>
              <span className="mono text-muted">{doneCount}/{run.steps.length}</span>
            </div>
            <div className="h-1 rounded-full bg-soft overflow-hidden mb-4"><div className="h-full bg-ink transition-all duration-500" style={{ width: `${(doneCount / run.steps.length) * 100}%` }} /></div>
            <ol className="space-y-2 stagger">
              {run.steps.map(s => (
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
              <dt className="text-muted">LLM tokens</dt><dd className="text-right mono">{cost.tokens ?? 0}</dd>
              <dt className="text-muted">Calls, cached</dt><dd className="text-right mono">{cost.calls ?? 0}, {cost.cached_calls ?? 0}</dd>
              {r?.cost?.price_inr != null && <><dt className="text-muted">Price to client</dt><dd className="text-right mono">{inr(r.cost.price_inr)}</dd></>}
              {r?.seconds != null && <><dt className="text-muted">Time</dt><dd className="text-right mono">{r.seconds}s</dd></>}
            </dl>
            <button className="btn-ghost w-full mt-3 !justify-between" onClick={() => setShowLedger(v => !v)}>
              {showLedger ? 'Hide the call ledger' : 'Show the call ledger'} <ArrowDownRight size={16} aria-hidden="true" />
            </button>
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
          {r ? <Report r={{ ...r, request: req }} /> : (
            <p className="body-lg mt-3 enter enter-2" aria-live="polite"><span className="shimmer">Checking the registry, staff, hiring and news.</span> Each step is saved, so a restart picks up where it stopped.</p>
          )}

          {r && (
            <div className="flex flex-wrap gap-2 mt-8">
              <a className="btn-dark" href={`/api/runs/${runId}/evidence`}><FileDown size={16} aria-hidden="true" />Download evidence file</a>
              <a className="btn-soft" href={`/api/runs/${runId}/evidence?fmt=html&print=1`} target="_blank" rel="noreferrer"><Printer size={16} aria-hidden="true" />Print as PDF</a>
              <button className="btn-soft" onClick={() => log ? setLog(null) : api.log(runId).then(setLog)}><ScrollText size={16} aria-hidden="true" />{log ? 'Hide the log' : 'Show the log'}</button>
            </div>
          )}

          {log && (
            <section className="frame mt-4 p-4 max-h-80 overflow-auto pop" aria-label="Run log" data-lenis-prevent>
              <ol className="mono text-[12px] space-y-1">
                {log.lines.map((l, i) => (
                  <li key={i} className="grid grid-cols-[72px_90px_1fr] gap-3">
                    <span className="text-muted">{(l.ts || '').slice(11)}</span><span>{l.step}</span>
                    <span className="truncate" title={JSON.stringify(l)}>{l.event}{l.reason ? `: ${l.reason}` : ''}{l.seconds != null ? ` (${l.seconds}s)` : ''}{l.wait_s ? ` wait ${l.wait_s}s` : ''}{l.endpoint ? ` ${l.endpoint}` : ''}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {showLedger && ledger && (
            <section className="frame mt-10 overflow-x-auto pop" aria-label="Call ledger" data-lenis-prevent>
              <table className="w-full text-sm">
                <thead className="text-left text-muted border-b border-line">
                  <tr>{['Step', 'Provider', 'Endpoint', 'Result', 'Credits', '₹', 'ms'].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {ledger.calls.map(c => (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">{c.step}</td><td className="px-4 py-2.5">{c.provider}</td>
                      <td className="px-4 py-2.5 mono max-w-[260px] truncate" title={c.endpoint}>{c.endpoint}</td>
                      <td className="px-4 py-2.5">{c.outcome}</td><td className="px-4 py-2.5 mono">{c.credits}</td>
                      <td className="px-4 py-2.5 mono">{c.inr}</td><td className="px-4 py-2.5 mono">{c.duration_ms ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {run.actions?.length > 0 && (
            <section className="mt-14" aria-labelledby="actions-h">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <h2 id="actions-h" className="h-sec !text-[28px]">Waiting for a person</h2>
                <ApproverPicker approver={approver} setApprover={setApprover} />
              </div>
              <div className="space-y-3 stagger">{run.actions.map(a => <ActionCard key={a.action_id} action={a} approver={approver} onChange={load} />)}</div>
            </section>
          )}

          {(run.actions?.some(a => a.approver) || run.events?.length > 0) && (
            <section className="mt-12" aria-labelledby="audit-h">
              <h2 id="audit-h" className="text-xl mb-3">Audit trail</h2>
              <ol className="border-l border-line pl-5 space-y-3 text-sm stagger">
                <li><span className="mono text-muted">{new Date(run.created_at * 1000).toLocaleTimeString('en-IN')}</span> Check requested</li>
                {(run.events || []).map((e, i) => <li key={'e' + i}><span className="mono text-muted">{new Date(e.ts * 1000).toLocaleTimeString('en-IN')}</span> Service restarted; resumed from step {e.from_step}</li>)}
                {run.actions.filter(a => a.approver).map(a => (
                  <li key={a.action_id}><span className="mono text-muted">{new Date(a.updated_at * 1000).toLocaleTimeString('en-IN')}</span> {a.approver} chose <b className="font-medium">{a.status === 'blocked' ? 'block' : a.status === 'held' ? 'hold' : 'approve'}</b> on “{a.kind.replace('_', ' ')}”{a.reason ? `, reason: ${a.reason}` : ''}{a.status === 'done' ? `; executed ${a.executed_count} time${a.executed_count === 1 ? '' : 's'}` : ''}{a.result?.via ? ` (${a.result.via})` : ''}</li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </div>
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
    <div className="pop">
      <div className="flex flex-wrap items-center gap-3 mt-5">
        <DecisionBadge decision={r.decision} size="lg" />
        {r.legal_name && <span className="text-sm text-muted">{r.legal_name}{r.registry_status ? ` · ${r.registry_status}` : ''}</span>}
      </div>
      <p className="body-lg mt-3">{d.line}</p>

      <dl className="mt-8 border-t border-line">
        {rows.map(([q, ans]) => (
          <div key={q} className="py-4 grid sm:grid-cols-[210px_1fr] gap-2 border-b border-line">
            <dt className="text-sm font-medium pt-0.5">{q}</dt>
            <dd className="whitespace-pre-line text-[15px] leading-relaxed">{ans || '—'}</dd>
          </div>
        ))}
      </dl>

      {['CANNOT_VERIFY', 'REFER'].includes(r.decision) && (
        <button className="btn-soft mt-6" onClick={() => {
          const q = r.request || {}
          sessionStorage.setItem('vetted.prefill', JSON.stringify({ vendor_name: q.vendor_name || r.vendor || '', website: q.website || '', cin: q.cin || '', gstin: q.gstin || '', city: q.city || '', directors: q.directors || [], contact_email: q.contact_email || '' }))
          window.location.hash = '#/'
        }}>Add the missing details and check again <ArrowDownRight size={16} aria-hidden="true" /></button>
      )}

      {(r.reasons?.length > 0 || r.missing?.length > 0 || r.notes?.length > 0) && (
        <div className="mt-8 grid md:grid-cols-2 gap-x-8 gap-y-6">
          {r.reasons?.length > 0 && <List title="Why" items={r.reasons} />}
          {r.missing?.length > 0 && <List title="Cannot verify: what is missing" items={r.missing} />}
          {r.notes?.length > 0 && <List title="Notes" items={r.notes} />}
        </div>
      )}

      {r.personal_data && (
        <section className="panel mt-12 p-5 md:p-6" aria-labelledby="pd-h">
          <h2 id="pd-h" className="text-xl">Personal data used</h2>
          <p className="text-sm text-muted mt-1">Only what the job needs, from public company records. Deleted after {r.personal_data.retention_days} days. Not collected: {r.personal_data.not_collected}.</p>
          {r.personal_data.people?.length ? (
            <ul className="mt-4 grid sm:grid-cols-2 gap-2 stagger">
              {r.personal_data.people.map((p, i) => (
                <li key={i} className="rounded bg-card px-4 py-3 text-sm">
                  <p className="font-medium">{p.name} <span className="mono text-muted">DIN {p.din}</span></p>
                  <p className="text-muted">{p.what} · {p.source} · used for {p.why}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted mt-3">No personal data was used for this check.</p>}
        </section>
      )}

      <section className="panel mt-3 p-2 md:p-3" aria-labelledby="facts-h">
        <div className="px-4 pt-4 pb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="facts-h" className="text-xl">Facts and their sources</h2>
          <span className="text-sm text-muted">{r.facts?.length || 0} passed the source check{r.rejected_facts?.length ? `, ${r.rejected_facts.length} dropped` : ''}</span>
        </div>
        <ul className="frame divide-y divide-line stagger">
          {(r.facts || []).map((f, i) => (
            <li key={i} className="px-5 py-4 grid md:grid-cols-[170px_1fr] gap-x-6 gap-y-2">
              <div>
                <p className="eyebrow">{FIELD_LABEL[f.field] || f.field}</p>
                <p className="font-medium mt-1 break-words">{String(f.value)}</p>
              </div>
              <div className="min-w-0">
                <blockquote className="mono text-[oklch(0.37_0_0)] bg-bg rounded px-3 py-2 break-words">{f.passage}</blockquote>
                <p className="mt-2 text-[13px] text-muted flex flex-wrap gap-x-3 gap-y-1">
                  <a href={f.url} target="_blank" rel="noreferrer" className="textlink !font-medium !text-ink">{f.source}<ArrowUpRight size={13} aria-hidden="true" /></a>
                  {f.locator && <span>{f.locator}</span>}
                  {f.record_date && <span>record dated {f.record_date}</span>}
                  <span>retrieved {f.retrieved_at}</span>
                </p>
                {f.note && <p className="mt-1 text-[13px] text-muted">{f.note}</p>}
              </div>
            </li>
          ))}
          {!r.facts?.length && <li className="px-5 py-6 text-muted">No fact could be tied to a record.</li>}
        </ul>
      </section>
    </div>
  )
}

function List({ title, items }) {
  return (
    <div>
      <h3 className="text-sm font-medium mb-2">{title}</h3>
      <ul className="space-y-1.5 text-[15px] text-muted">{items.map((x, i) => <li key={i} className="pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[0.6em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-line">{x}</li>)}</ul>
    </div>
  )
}

function CostFigure({ inr: value }) {
  const v = useCountUp(value || 0, 700)
  return <p className="text-[40px] leading-none font-medium tracking-tight mt-4 tabular-nums">{inr(Math.round(v * 100) / 100)}</p>
}
