import { useEffect, useState } from 'react'
import { ArrowDownRight, Loader2 } from 'lucide-react'
import { api } from '../api'
import { DecisionBadge, Section, inr } from '../ui'
import { ChecksScene } from '../scenes'

export default function Batch({ batchId }) {
  const [b, setB] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const load = () => api.batch(batchId).then(setB).catch(e => setErr(e.message))
    load(); const t = setInterval(load, 1500); return () => clearInterval(t)
  }, [batchId])
  if (err) return <p role="alert" className="wrap text-bad">{err}</p>
  const runs = b?.runs || []
  const done = runs.filter(r => r.status !== 'running').length
  return (
    <Section enter titleAs="h1" lead="One request," leadRest={`${runs.length || 'several'} vendors, checked one after another.`}
             title={done === runs.length && runs.length ? 'Every vendor in the request is checked' : 'Checking every vendor in the request'}
             body="Each vendor gets its own full check and its own decision. Open one to see the facts, the sources and the actions waiting for approval.">
      <div className="vt-bleed mt-10 enter enter-4"><ChecksScene /></div>
      <div className="md:grid md:grid-cols-12 gap-x-8 mt-12">
        <div className="md:col-start-5 md:col-span-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium">Progress</h2><span className="mono text-muted">{done}/{runs.length}</span>
          </div>
          <div className="h-1 rounded-full bg-soft overflow-hidden mb-6"><div className="h-full bg-ink transition-all duration-500" style={{ width: `${runs.length ? (done / runs.length) * 100 : 0}%` }} /></div>
          <div className="space-y-3 stagger">
            {runs.map(r => (
              <a key={r.run_id} href={`#/run/${r.run_id}`} className="frame p-5 block group transition hover:-translate-y-0.5 hover:shadow-float">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg">{r.request?.vendor_name || r.request?.website || r.run_id}</p>
                    <p className="text-sm text-muted">{r.legal_name || r.request?.website || ''}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.status === 'running' ? <span className="inline-flex items-center gap-1.5 text-sm"><Loader2 size={14} className="animate-spin text-muted" /><span className="shimmer font-medium">Checking</span></span> : <DecisionBadge decision={r.decision} />}
                    <ArrowDownRight size={16} className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:translate-y-0.5" aria-hidden="true" />
                  </div>
                </div>
                {r.answers && (
                  <p className="text-sm text-muted mt-3">{r.answers.real_and_trading} · {r.answers.how_long_it_has_existed} · {(r.answers.anything_off || []).slice(0, 1).join('')}</p>
                )}
              </a>
            ))}
          </div>
        </div>
      </div>
    </Section>
  )
}
