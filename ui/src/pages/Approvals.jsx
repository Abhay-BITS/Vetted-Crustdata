import { useEffect, useState } from 'react'
import { api } from '../api'
import ActionCard, { useApprover } from '../ActionCard'
import { Mail, Building2 } from 'lucide-react'
import { DecisionBadge, Section, StatusPill, prettyName, when } from '../ui'
import { ApprovalsScene } from '../scenes'

function RunContext({ runId }) {
  const [run, setRun] = useState(null)
  useEffect(() => { api.run(runId).then(setRun).catch(() => {}) }, [runId])
  const r = run?.result
  if (!r) return null
  return (
    <div className="mt-4 rounded bg-bg px-4 py-3.5">
      <p className="eyebrow mb-2">What it found</p>
      <div className="flex flex-wrap items-center gap-2">
        <a href={`#/run/${runId}`} className="font-medium underline decoration-line underline-offset-4 hover:decoration-ink transition">{r.vendor}</a>
        <DecisionBadge decision={r.decision} />
      </div>
      <p className="eyebrow mt-4 mb-1.5">Why</p>
      <ul className="text-sm text-muted space-y-1">{(r.reasons || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  )
}

export default function Approvals() {
  const [items, setItems] = useState(null)
  const [done, setDone] = useState([])
  const [approver, setApprover] = useApprover()
  const load = () => api.actions().then(all => {
    setItems(all.filter(a => ['pending_approval', 'held'].includes(a.status)))
    setDone(all.filter(a => !['pending_approval', 'held'].includes(a.status)).slice(0, 10))
  })
  useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t) }, [])

  return (
    <Section enter titleAs="h1" lead="Approvals," leadRest="the only part a person has to do."
             title="Actions waiting for a person"
             body="Nothing that cannot be undone happens on its own. Each action shows what Vetted found, what it plans to do and why, and runs once even if the service restarts.">
      <div className="vt-bleed mt-10 enter enter-5"><ApprovalsScene /></div>
      <div className="md:grid md:grid-cols-12 gap-x-8 mt-12">
        <div className="md:col-start-5 md:col-span-8">
          <label className="flex items-center gap-3 max-w-md enter enter-4">
            <span className="text-sm font-medium whitespace-nowrap">Approver</span>
            <input className="field" value={approver} onChange={e => setApprover(e.target.value)} placeholder="Your name, recorded with every decision" aria-label="Approver name" />
          </label>
          <div className="mt-6 space-y-3 stagger">
            {items === null ? <p className="text-muted">Loading</p> : items.length === 0 ? (
              <div className="panel p-10 text-center text-muted">No actions are waiting. Run a check to create one.</div>
            ) : items.map(a => <ActionCard key={a.action_id} action={a} approver={approver} onChange={load} context={<RunContext runId={a.run_id} />} />)}
          </div>
          {done.length > 0 && (
            <section className="mt-14" aria-labelledby="done-h">
              <div className="flex items-baseline justify-between mb-4">
                <h2 id="done-h" className="text-xl">Recently decided</h2>
                <span className="text-sm text-muted">Last {done.length}</span>
              </div>
              <div className="panel p-2 md:p-3">
                <div className="frame overflow-x-auto" data-lenis-prevent>
                  <table className="w-full text-sm table-fixed min-w-[680px]">
                    <colgroup>
                      <col className="w-[31%]" /><col className="w-[21%]" /><col className="w-[15%]" /><col className="w-[14%]" /><col className="w-[19%]" />
                    </colgroup>
                    <thead className="text-left text-muted border-b border-line">
                      <tr>{['Vendor', 'Action', 'Result', 'Approver', 'When'].map(h => <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr>
                    </thead>
                    <tbody className="stagger">
                      {done.map(a => {
                        const email = a.kind === 'email_vendor'
                        const vendor = prettyName(a.payload?.legal_name || (a.payload?.subject || '').split(': ').slice(1).join(': ')) || 'Vendor'
                        return (
                          <tr key={a.action_id} className="border-b border-line last:border-0 hover:bg-bg transition-colors align-top">
                            <td className="px-4 py-3">
                              <a href={`#/run/${a.run_id}`} className="font-medium block truncate hover:underline underline-offset-4" title={vendor}>{vendor}</a>
                              {email && <span className="block text-muted truncate" title={a.payload?.subject}>{(a.payload?.subject || '').split(':')[0]}</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1.5 min-w-0">
                                {email ? <Mail size={14} className="text-muted shrink-0" aria-hidden="true" /> : <Building2 size={14} className="text-muted shrink-0" aria-hidden="true" />}
                                <span className="truncate">{email ? 'Email sent' : 'Vendor added'}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                                <StatusPill status={a.status} />
                                {a.status === 'done' && <span className="mono text-muted">{a.executed_count}×</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 truncate" title={a.approver || ''}>{a.approver || '—'}{a.reason ? <span className="block text-muted truncate" title={a.reason}>{a.reason}</span> : null}</td>
                            <td className="px-4 py-3 text-muted whitespace-nowrap">{new Date(a.updated_at * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </Section>
  )
}
