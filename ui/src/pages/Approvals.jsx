import { useEffect, useState } from 'react'
import { api } from '../api'
import ActionCard, { useApprover } from '../ActionCard'
import { DecisionBadge, PageHeader } from '../ui'

function RunContext({ runId }) {
  const [run, setRun] = useState(null)
  useEffect(() => { api.run(runId).then(setRun).catch(() => {}) }, [runId])
  const r = run?.result
  if (!r) return null
  return (
    <div className="mt-4 rounded border border-line px-4 py-3">
      <p className="eyebrow mb-2">What it found</p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <a href={`#/run/${runId}`} className="link font-medium">{r.vendor}</a>
        <DecisionBadge decision={r.decision} />
      </div>
      <p className="eyebrow mt-3 mb-1">Why</p>
      <ul className="list-disc pl-5 text-sm space-y-1">{(r.reasons || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  )
}

export default function Approvals() {
  const [items, setItems] = useState(null)
  const [done, setDone] = useState([])
  const [approver, setApprover] = useApprover()
  const load = () => {
    api.actions().then(all => {
      setItems(all.filter(a => ['pending_approval', 'held'].includes(a.status)))
      setDone(all.filter(a => !['pending_approval', 'held'].includes(a.status)).slice(0, 10))
    })
  }
  useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t) }, [])

  return (
    <>
      <PageHeader eyebrow="Approvals" title="Actions waiting for a person">
        Nothing that cannot be undone happens on its own. Each action shows what Vetted found, what it plans to do and why.
        It runs once, even if the service restarts.
      </PageHeader>
      <label className="flex items-center gap-3 mb-6 max-w-md">
        <span className="text-sm font-medium whitespace-nowrap">Approver</span>
        <input className="field" value={approver} onChange={e => setApprover(e.target.value)} placeholder="Your name, recorded with every decision" aria-label="Approver name" />
      </label>
      {items === null ? <p className="text-muted">Loading</p> : items.length === 0 ? (
        <div className="card p-8 text-center text-muted">No actions are waiting. Run a check to create one.</div>
      ) : (
        <div className="space-y-4">
          {items.map(a => <ActionCard key={a.action_id} action={a} approver={approver} onChange={load} context={<RunContext runId={a.run_id} />} />)}
        </div>
      )}
      {done.length > 0 && (
        <section className="mt-10" aria-labelledby="done-h">
          <h2 id="done-h" className="text-xl font-semibold mb-3">Recently decided</h2>
          <div className="card divide-y divide-line">
            {done.map(a => (
              <div key={a.action_id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <a href={`#/run/${a.run_id}`} className="link">{a.payload?.legal_name || a.payload?.subject || a.kind}</a>
                <span className="text-muted">{a.kind.replace('_', ' ')}</span>
                <span className="ml-auto">{a.status}{a.status === 'done' ? ` · executed ${a.executed_count}×` : ''}{a.approver ? ` · ${a.approver}` : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
