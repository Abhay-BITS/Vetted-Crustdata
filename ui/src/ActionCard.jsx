import { useEffect, useState } from 'react'
import { Check, Pause, Ban, Lock } from 'lucide-react'
import { api } from './api'
import { ACTION_LABEL, StatusPill, when } from './ui'

let _pin = ''  // kept in memory only, never stored

export function useApprover() {
  const [name, setName] = useState(localStorage.getItem('vetted.approver') || '')
  const save = v => { setName(v); localStorage.setItem('vetted.approver', v) }
  return [name, save]
}

/** Approver sign-in: pick a named approver and enter their PIN. */
export function ApproverPicker({ approver, setApprover }) {
  const [list, setList] = useState([])
  const [pin, setPin] = useState(_pin)
  useEffect(() => { api.approvers().then(d => { setList(d.approvers); if (!d.approvers.includes(approver) && d.approvers.length) setApprover(d.approvers[0]) }).catch(() => {}) }, [])
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="approver-sel">Approver</label>
      <select id="approver-sel" className="field !h-10 !w-auto pr-8" value={approver} onChange={e => setApprover(e.target.value)}>
        {list.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <label className="relative">
        <span className="sr-only">PIN</span>
        <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input type="password" inputMode="numeric" className="field !h-10 !w-28 pl-8 font-mono" placeholder="PIN" value={pin}
               onChange={e => { setPin(e.target.value); _pin = e.target.value }} aria-label="Approver PIN" />
      </label>
    </div>
  )
}

export default function ActionCard({ action, approver, onChange, context }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [blocking, setBlocking] = useState(false)
  const [fullEmail, setFullEmail] = useState(false)
  const [reason, setReason] = useState('')
  const p = action.payload || {}
  const open = action.status === 'pending_approval' || action.status === 'held'

  async function decide(verdict) {
    setErr('')
    if (!approver.trim()) { setErr('Pick the approver first.'); return }
    if (!_pin) { setErr('Enter the approver PIN first.'); return }
    if (verdict === 'block' && !reason.trim()) { setBlocking(true); setErr('Say why you are blocking it. The vendor is told the reason.'); return }
    setBusy(verdict)
    try { await api.decide(action.action_id, verdict, approver, verdict === 'block' ? reason : '', _pin); setBlocking(false); onChange && onChange() }
    catch (e) { setErr(e.message) } finally { setBusy('') }
  }

  return (
    <article className="frame p-5 md:p-6 relative overflow-hidden">
      {['approved', 'executing', 'done', 'blocked', 'held'].includes(action.status) && (
        <span key={action.status} aria-hidden="true"
              className={`vt-stamp pointer-events-none absolute right-5 bottom-5 px-3 py-1.5 rounded-[8px] border-2 text-xs font-semibold uppercase tracking-[0.12em] ${action.status === 'blocked' ? 'border-bad text-bad' : action.status === 'held' ? 'border-unk text-unk' : 'border-ok text-ok'}`}
              style={{ opacity: .85 }}>
          {action.status === 'blocked' ? 'Blocked' : action.status === 'held' ? 'On hold' : action.status === 'done' ? `Done · ${action.executed_count}x` : 'Approved'}
        </span>
      )}
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
          <div className="relative">
            <pre className={`px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap font-sans text-[oklch(0.37_0_0)] ${fullEmail ? '' : 'max-h-[7.5rem] overflow-hidden'}`}>{p.body}</pre>
            {!fullEmail && (p.body || '').split('\n').length > 6 && <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[oklch(0.982_0.002_84.559)] to-transparent pointer-events-none" />}
          </div>
          {(p.body || '').split('\n').length > 6 && (
            <button className="px-4 pb-3 text-[13px] font-medium text-ink hover:underline underline-offset-4" onClick={() => setFullEmail(v => !v)}>
              {fullEmail ? 'Show less' : 'Show full email'}
            </button>
          )}
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
          <button className="btn-bad" onClick={() => decide('block')} disabled={!!busy}><Ban size={16} aria-hidden="true" />{blocking ? 'Block with this reason' : 'Block'}</button>
          {blocking && (
            <input className="field basis-full pop" autoFocus value={reason} onChange={e => setReason(e.target.value)}
                   placeholder="Reason for blocking, recorded and shared with the vendor" aria-label="Reason for blocking" />
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          {action.approver ? <>Decided by <span className="font-medium text-ink">{action.approver}</span> · {when(action.updated_at)}{action.reason ? <> · “{action.reason}”</> : null}</> : null}
          {action.status === 'done' && <> · executed <span className="font-medium text-ink">{action.executed_count} time{action.executed_count === 1 ? '' : 's'}</span></>}
        </p>
      )}
      {err && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
    </article>
  )
}
