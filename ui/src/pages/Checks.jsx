import { useEffect, useState } from 'react'
import { api } from '../api'
import { DecisionBadge, PageHeader, inr, when } from '../ui'

export default function Checks() {
  const [runs, setRuns] = useState(null)
  const [sum, setSum] = useState(null)
  useEffect(() => {
    const load = () => { api.runs().then(setRuns); api.summary().then(setSum) }
    load(); const t = setInterval(load, 3000); return () => clearInterval(t)
  }, [])
  return (
    <>
      <PageHeader eyebrow="Checks" title="Every vendor checked">
        Each row is one finished job, with its decision and what it cost to run.
      </PageHeader>
      {sum && (
        <div className="grid sm:grid-cols-4 gap-4 mb-6">
          {[['Checks run', sum.runs], ['Average cost per check', inr(sum.avg_cost_inr)], ['Price per vendor', inr(sum.price_per_vendor_inr)], ['Waiting for approval', sum.pending_approvals]].map(([k, v]) => (
            <div key={k} className="card p-4"><p className="text-sm text-muted">{k}</p><p className="text-2xl font-semibold mt-1">{v}</p></div>
          ))}
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead className="text-left text-sm text-muted border-b border-line">
            <tr>{['Vendor', 'Decision', 'Cost', 'Started'].map(h => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {(runs || []).map(r => (
              <tr key={r.run_id} className="border-b border-line last:border-0 hover:bg-paper transition">
                <td className="px-5 py-3"><a className="link font-medium" href={`#/run/${r.run_id}`}>{r.vendor || r.run_id}</a></td>
                <td className="px-5 py-3"><DecisionBadge decision={r.decision} /></td>
                <td className="px-5 py-3 mono">{r.cost ? `${inr(r.cost.inr)} · ${r.cost.credits} cr` : '—'}</td>
                <td className="px-5 py-3 text-muted">{when(r.created_at)}</td>
              </tr>
            ))}
            {runs && runs.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-muted">No checks yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
