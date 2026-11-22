import { useEffect, useState } from 'react'
import { ArrowDownRight } from 'lucide-react'
import { api } from '../api'
import { DecisionBadge, Section, inr, when } from '../ui'
import { ChecksScene } from '../scenes'
import { useCountUp } from '../motion'

function Stat({ label, value, money }) {
  const v = useCountUp(value)
  return <div className="panel p-5"><p className="text-sm font-medium">{label}</p><p className="text-[36px] leading-none font-medium tracking-tight mt-4 tabular-nums">{money ? inr(Math.round(v * 100) / 100) : Math.round(v)}</p></div>
}

export default function Checks() {
  const [runs, setRuns] = useState(null)
  const [sum, setSum] = useState(null)
  useEffect(() => {
    const load = () => { api.runs().then(setRuns); api.summary().then(setSum) }
    load(); const t = setInterval(load, 3000); return () => clearInterval(t)
  }, [])
  return (
    <Section enter titleAs="h1" lead="Checks," leadRest="every vendor the desk has run, newest first."
             title="Every vendor checked"
             body="Each row is one finished job, with its decision and the measured cost of running it.">
      <div className="vt-bleed mt-10 enter enter-4"><ChecksScene /></div>
      {sum && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-12 stagger">
          <Stat label="Checks run" value={sum.runs} />
          <Stat label="Cost per check, nothing cached" value={sum.avg_cost_inr} money />
          <Stat label="Price per vendor" value={sum.price_per_vendor_inr} money />
          <Stat label="Waiting for approval" value={sum.pending_approvals} />
        </div>
      )}
      <div className="panel p-2 md:p-3 mt-3 enter enter-5">
        <div className="frame overflow-x-auto" data-lenis-prevent>
          <table className="w-full text-[15px]">
            <thead className="text-left text-sm text-muted border-b border-line">
              <tr>{['Vendor', 'Decision', 'Cost', 'Started', ''].map(h => <th key={h} className="px-5 py-3.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="stagger">
              {(runs || []).map(r => (
                <tr key={r.run_id} className="group border-b border-line last:border-0 hover:bg-bg transition-colors cursor-pointer" onClick={() => { window.location.hash = `#/run/${r.run_id}` }}>
                  <td className="px-5 py-3.5"><a className="font-medium" href={`#/run/${r.run_id}`} onClick={e => e.stopPropagation()}>{r.vendor || r.run_id}</a></td>
                  <td className="px-5 py-3.5"><DecisionBadge decision={r.decision} /></td>
                  <td className="px-5 py-3.5 mono">{r.cost ? `${inr(r.cost.full_inr ?? r.cost.inr)} · ${r.cost.full_credits ?? r.cost.credits} cr` : '—'}</td>
                  <td className="px-5 py-3.5 text-muted text-sm">{when(r.created_at)}</td>
                  <td className="px-5 py-3.5 text-right"><ArrowDownRight size={16} className="inline text-muted transition-transform group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:text-ink" aria-hidden="true" /></td>
                </tr>
              ))}
              {runs && runs.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">No checks yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  )
}
