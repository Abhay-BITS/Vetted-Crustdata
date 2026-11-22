import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Copy, Loader2 } from 'lucide-react'

export const DECISIONS = {
  CLEARED: { label: 'Cleared', tone: 'ok', Icon: CheckCircle2, line: 'Real, active and trading. Ready to activate once a person approves.' },
  REFER: { label: 'Refer to a person', tone: 'warn', Icon: AlertTriangle, line: 'Something needs a person to look before money moves.' },
  REJECTED: { label: 'Rejected', tone: 'bad', Icon: XCircle, line: 'The record says no. A person confirms before the vendor is told.' },
  CANNOT_VERIFY: { label: 'Cannot verify', tone: 'unk', Icon: HelpCircle, line: 'No source settles it. The missing records are listed below.' },
  DUPLICATE_HELD: { label: 'Duplicate, held', tone: 'dup', Icon: Copy, line: 'This vendor already exists in the vendor master.' },
}

const TONE = {
  ok: 'bg-ok-bg text-ok border-ok/20',
  warn: 'bg-warn-bg text-warn border-warn/20',
  bad: 'bg-bad-bg text-bad border-bad/20',
  unk: 'bg-unk-bg text-unk border-unk/20',
  dup: 'bg-dup-bg text-dup border-dup/20',
}

export function DecisionBadge({ decision, size = 'sm' }) {
  if (!decision) return <span className="inline-flex items-center gap-1.5 text-muted text-sm"><Loader2 size={14} className="animate-spin" />Running</span>
  const d = DECISIONS[decision] || { label: decision, tone: 'unk', Icon: HelpCircle }
  const big = size === 'lg'
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded font-semibold ${TONE[d.tone]} ${big ? 'px-3 py-1.5 text-base' : 'px-2 py-0.5 text-[13px]'}`}>
      <d.Icon size={big ? 18 : 14} aria-hidden="true" />{d.label}
    </span>
  )
}

export function StatusPill({ status }) {
  const map = {
    pending_approval: ['Waiting for approval', 'warn'], approved: ['Approved', 'ok'], executing: ['Running', 'unk'],
    done: ['Done', 'ok'], held: ['Held', 'unk'], blocked: ['Blocked', 'bad'], failed: ['Failed', 'bad'],
  }
  const [label, tone] = map[status] || [status, 'unk']
  return <span className={`inline-flex px-2 py-0.5 border rounded text-[13px] font-medium ${TONE[tone]}`}>{label}</span>
}

export function PageHeader({ eyebrow, title, children }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="text-[28px] leading-tight font-semibold">{title}</h1>
      {children && <p className="mt-2 text-muted max-w-2xl">{children}</p>}
    </header>
  )
}

export function inr(n) {
  if (n === null || n === undefined) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

export function when(ts) {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export const ACTION_LABEL = {
  activate_vendor: 'Add the vendor to the vendor master',
  email_vendor: 'Send an email to the vendor',
  test_payment: 'Send a test-mode payment',
}
