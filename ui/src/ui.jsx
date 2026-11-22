import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Copy, Loader2 } from 'lucide-react'

export const DECISIONS = {
  CLEARED: { label: 'Cleared', tone: 'ok', Icon: CheckCircle2, line: 'Registered, active and trading. Ready to activate once a person approves.' },
  REFER: { label: 'Refer to a person', tone: 'warn', Icon: AlertTriangle, line: 'Something needs a person to look before money moves.' },
  REJECTED: { label: 'Rejected', tone: 'bad', Icon: XCircle, line: 'The record says no. A person confirms before the vendor is told.' },
  CANNOT_VERIFY: { label: 'Cannot verify', tone: 'unk', Icon: HelpCircle, line: 'No record settles it. What is missing is listed below.' },
  DUPLICATE_HELD: { label: 'Duplicate, held', tone: 'dup', Icon: Copy, line: 'This vendor is already in the vendor master.' },
}

const TONE = {
  ok: 'bg-ok-bg text-ok', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad', unk: 'bg-unk-bg text-unk', dup: 'bg-dup-bg text-dup',
}

export function DecisionBadge({ decision, size = 'sm' }) {
  if (!decision) return <span className="inline-flex items-center gap-1.5 text-sm"><Loader2 size={14} className="animate-spin text-muted" /><span className="shimmer font-medium">Running</span></span>
  const d = DECISIONS[decision] || { label: decision, tone: 'unk', Icon: HelpCircle }
  const big = size === 'lg'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${TONE[d.tone]} ${big ? 'px-3.5 py-1.5 text-[15px]' : 'px-2.5 py-0.5 text-[13px]'}`}>
      <d.Icon size={big ? 16 : 13} aria-hidden="true" />{d.label}
    </span>
  )
}

export function StatusPill({ status }) {
  const map = {
    pending_approval: ['Waiting for approval', 'warn'], approved: ['Approved', 'ok'], executing: ['Running', 'unk'],
    done: ['Done', 'ok'], held: ['Held', 'unk'], blocked: ['Blocked', 'bad'], failed: ['Failed', 'bad'],
  }
  const [label, tone] = map[status] || [status, 'unk']
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[13px] font-medium ${TONE[tone]}`}>{label}</span>
}

/** The two-column rhythm: a bold lead-in on the left, the heading and copy on the right. */
export function Section({ id, lead, leadRest, title, body, children, className = '', titleAs = 'h2', enter = false }) {
  const T = titleAs
  const anim = enter ? 'enter' : 'reveal'
  return (
    <section id={id} className={`wrap ${className}`}>
      <div className="grid md:grid-cols-12 gap-x-8 gap-y-4">
        <p className={`md:col-span-4 lead pt-2 ${anim} ${enter ? 'enter-1' : ''}`}><b>{lead}</b>{leadRest ? <> {leadRest}</> : null}</p>
        <div className="md:col-span-8 max-w-[560px] lg:max-w-[620px]">
          <T className={`${titleAs === 'h1' ? 'h-hero' : 'h-sec'} ${anim} ${enter ? 'enter-2' : ''}`}>{title}</T>
          {body && <p className={`mt-3 body-lg ${anim} ${enter ? 'enter-3' : ''}`}>{body}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

export function inr(n) {
  if (n === null || n === undefined) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

export function when(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export const ACTION_LABEL = {
  activate_vendor: 'Add the vendor to the vendor master',
  email_vendor: 'Send an email to the vendor',
  test_payment: 'Send a test-mode payment',
}

/** "DELHIVERY LIMITED" -> "Delhivery Limited"; leaves mixed-case names alone. */
export function prettyName(name) {
  if (!name) return ''
  if (name !== name.toUpperCase()) return name
  const keep = new Set(['LLP', 'OPC', 'TCI', 'VRL', 'DHL', 'UPS', 'II', 'III'])
  return name.toLowerCase().split(/(\s+|-)/).map(w => {
    const up = w.toUpperCase()
    if (keep.has(up)) return up
    return w.charAt(0).toUpperCase() + w.slice(1)
  }).join('')
}
