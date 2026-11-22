import { useState } from 'react'
import { Check, Pause, Ban } from 'lucide-react'
import { api } from './api'
import { ACTION_LABEL, StatusPill, when } from './ui'

export function useApprover() {
  const [name, setName] = useState(localStorage.getItem('vetted.approver') || '')
  const save = v => { setName(v); localStorage.setItem('vetted.approver', v) }
  return [name, save]
}

export default function ActionCard({ action, approver, onChange, context }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const p = action.payload || {}
  const open = action.status === 'pending_approval' || action.status === 'held'

  async function decide(verdict) {
    setErr('')
    if (!approver.trim()) { setErr('Type your name as the approver first.'); return }
    setBusy(verdict)
    try { await api.decide(action.action_id, verdict, approver, ''); onChange && onChange() }
    catch (e) { setErr(e.message) } finally { setBusy('') }
  }

  return (
    <article className="frame p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-1.5">It plans to</p>
          <h3 className="text-lg">{ACTION_LABEL[action.kind] || action.kind}</h3>
        </div>
        <StatusPill status={action.status} />
      </div>

      {context}

      {action.kind === 'email_vendor' && (
        <div className="mt-4 rounded bg-bg">
          <div className="px-4 py-3 border-b border-line text-sm space-y-0.5">
            <p><span className="text-muted">To</span> <span className="mono">{p.to}</span></p>
            <p><span className="text-muted">Subject</span> {p.subject}</p>
          </div>
          <pre className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap font-sans text-[oklch(0.37_0_0)] max-h-56 overflow-auto" data-lenis-prevent>{p.body}</pre>
        </div>
      )}
      {action.kind === 'activate_vendor' && (
        <dl className="mt-4 grid sm:grid-cols-3 gap-2 text-sm">
          {[['Legal name', p.legal_name], ['CIN', p.cin], ['Website', p.domain]].map(([k, v]) => (
            <div key={k} className="rounded bg-bg px-3.5 py-2.5">
              <dt className="text-muted text-xs">{k}</dt><dd className="mono break-all mt-0.5">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      )}

      {open ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn-dark" onClick={() => decide('approve')} disabled={!!busy}><Check size={16} aria-hidden="true" />{busy === 'approve' ? 'Approving' : 'Approve'}</button>
          {action.status !== 'held' && <button className="btn-soft" onClick={() => decide('hold')} disabled={!!busy}><Pause size={16} aria-hidden="true" />Hold</button>}
          <button className="btn-bad" onClick={() => decide('block')} disabled={!!busy}><Ban size={16} aria-hidden="true" />Block</button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          {action.approver ? <>Decided by <span className="font-medium text-ink">{action.approver}</span> · {when(action.updated_at)}</> : null}
          {action.status === 'done' && <> · executed <span className="font-medium text-ink">{action.executed_count} time{action.executed_count === 1 ? '' : 's'}</span></>}
        </p>
      )}
      {err && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
    </article>
  )
}
