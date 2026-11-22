import { useEffect, useState } from 'react'
import { api } from '../api'
import ActionCard, { useApprover } from '../ActionCard'
import { DecisionBadge, Section } from '../ui'

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
      <div className="md:grid md:grid-cols-12 gap-x-8 mt-8">
        <div className="md:col-start-5 md:col-span-8">
          <label className="flex items-center gap-3 max-w-md enter enter-4">
            <span className="text-sm font-medium whitespace-nowrap">Approver</span>
            <input className="field" value={approver} onChange={e => setApprover(e.target.value)} placeholder="Your name, recorded with every decision" aria-label="Approver name" />
          </label>
          <div className="mt-6 space-y-3">
            {items === null ? <p className="text-muted">Loading</p> : items.length === 0 ? (
              <div className="panel p-10 text-center text-muted">No actions are waiting. Run a check to create one.</div>
            ) : items.map(a => <ActionCard key={a.action_id} action={a} approver={approver} onChange={load} context={<RunContext runId={a.run_id} />} />)}
          </div>
          {done.length > 0 && (
            <section className="mt-14" aria-labelledby="done-h">
              <h2 id="done-h" className="text-xl mb-4">Recently decided</h2>
              <div className="panel p-2"><div className="frame divide-y divide-line">
                {done.map(a => (
                  <div key={a.action_id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <a href={`#/run/${a.run_id}`} className="font-medium hover:underline underline-offset-4">{a.payload?.legal_name || a.payload?.subject || a.kind}</a>
                    <span className="text-muted">{a.kind.replace('_', ' ')}</span>
                    <span className="ml-auto text-muted">{a.status}{a.status === 'done' ? `, executed ${a.executed_count} time${a.executed_count === 1 ? '' : 's'}` : ''}{a.approver ? ` · ${a.approver}` : ''}</span>
                  </div>
                ))}
              </div></div>
            </section>
          )}
        </div>
      </div>
    </Section>
  )
}
