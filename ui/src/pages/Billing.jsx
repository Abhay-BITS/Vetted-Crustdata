import { useEffect, useState } from 'react'
import { ArrowDownRight, Check, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { api } from '../api'
import { Section, inr, when } from '../ui'

export function PlanCards({ current, compact = false }) {
  const [data, setData] = useState(null)
  useEffect(() => { api.plans().then(setData).catch(() => {}) }, [])
  if (!data) return null
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {data.plans.map((p, i) => {
        const isCurrent = current === p.id
        const featured = p.id === 'growth'
        return (
          <div key={p.id} className={`panel p-6 flex flex-col reveal in ${featured ? 'ring-2 ring-ink' : ''}`} style={{ transitionDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between">
              <p className="font-medium">{p.name}</p>
              {featured && <span className="text-xs px-2 py-0.5 rounded-full bg-ink text-bg">Most chosen</span>}
            </div>
            <p className="mt-4"><span className="text-[36px] leading-none font-medium tracking-tight">{p.monthly_inr ? inr(p.monthly_inr) : inr(p.extra_check_inr)}</span>
              <span className="text-muted text-sm"> {p.monthly_inr ? '/ month' : '/ vendor'}</span></p>
            <p className="text-sm text-muted mt-2">{p.note}</p>
            {!compact && (
              <ul className="mt-5 space-y-2 text-sm flex-1">
                {[p.included_checks ? `${p.included_checks} vendor checks included` : 'Pay only for vendors you check',
                  p.monthly_inr ? `${inr(p.extra_check_inr)} per extra check` : 'Evidence file and approvals included',
                  p.monitored_vendors ? `Monthly re-screening of ${p.monitored_vendors} active vendors` : 'No contract, no seats',
                  'Every fact sourced, every action approved'].map(t => (
                  <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />{t}</li>
                ))}
              </ul>
            )}
            <a href={`#/checkout/${p.id}`} className={`${featured ? 'btn-dark' : 'btn-soft'} mt-6 w-full ${isCurrent ? 'pointer-events-none opacity-60' : ''}`}>
              {isCurrent ? 'Your current plan' : p.monthly_inr ? `Choose ${p.name}` : 'Top up one check'} {!isCurrent && <ArrowDownRight size={16} aria-hidden="true" />}
            </a>
          </div>
        )
      })}
    </div>
  )
}

export default function Billing() {
  const [b, setB] = useState(null)
  useEffect(() => { api.billing().then(setB) }, [])
  return (
    <Section enter titleAs="h1" lead="Billing," leadRest="your plan, this month's checks and payments."
             title="Plan and billing"
             body="You are charged for finished checks only, whatever the outcome. Payments run in test mode during the event; no real money moves.">
      {!b ? <p className="text-muted mt-10 flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Loading</p> : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-12 stagger">
            {[['Current plan', b.plan.name], ['Checks this month', b.checks_this_month], ['Included in plan', b.included || '—'], [`Invoice preview, ${b.period}`, inr(b.invoice_preview_inr)]].map(([k, v]) => (
              <div key={k} className="panel p-5"><p className="text-sm font-medium">{k}</p><p className="text-[32px] leading-none font-medium tracking-tight mt-4">{v}</p></div>
            ))}
          </div>
          <p className="text-sm text-muted mt-3">{b.extra_checks ? `${b.extra_checks} checks above your plan at ${inr(b.plan.extra_check_inr)} each. ` : ''}Payments: {b.mode === 'razorpay_test' ? 'Razorpay test mode' : 'simulated test payments (no payment provider connected)'}.</p>
          <h2 className="h-sec !text-[28px] mt-14 mb-5">Change plan</h2>
          <PlanCards current={b.plan.id} />
          {b.history.length > 0 && (
            <section className="mt-14">
              <h2 className="text-xl mb-4">Payments</h2>
              <div className="panel p-2"><div className="frame overflow-x-auto" data-lenis-prevent>
                <table className="w-full text-sm">
                  <thead className="text-left text-muted border-b border-line"><tr>{['Date', 'Plan', 'Amount', 'Status', 'Reference'].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{b.history.map(o => (
                    <tr key={o.order_id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">{when(o.paid_at || o.created_at)}</td><td className="px-4 py-3">{o.plan}</td><td className="px-4 py-3 mono">{inr(o.amount_inr)}</td>
                      <td className="px-4 py-3">{o.status === 'paid' ? <span className="text-ok font-medium">Paid</span> : 'Not paid'}</td>
                      <td className="px-4 py-3 mono text-muted">{o.payment_id || o.order_id}</td>
                    </tr>))}</tbody>
                </table>
              </div></div>
            </section>
          )}
        </>
      )}
    </Section>
  )
}

export function Checkout({ planId }) {
  const [order, setOrder] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  useEffect(() => { api.checkout(planId).then(setOrder).catch(e => setErr(e.message)) }, [planId])

  async function pay() {
    setErr(''); setBusy(true)
    try {
      if (order.mode === 'razorpay_test') {
        await new Promise((res, rej) => {
          if (window.Razorpay) return res()
          const sc = document.createElement('script'); sc.src = 'https://checkout.razorpay.com/v1/checkout.js'; sc.onload = res; sc.onerror = rej; document.body.appendChild(sc)
        })
        const rz = new window.Razorpay({
          key: order.key_id, order_id: order.order_id, amount: Math.round(order.amount_inr * 100), currency: 'INR',
          name: 'Vetted', description: `${order.plan.name} plan (test mode)`, theme: { color: '#2b2b2b' },
          handler: async resp => {
            try { setDone(await api.confirm({ order_id: resp.razorpay_order_id, payment_id: resp.razorpay_payment_id, signature: resp.razorpay_signature })) }
            catch (e) { setErr(e.message) } finally { setBusy(false) }
          },
          modal: { ondismiss: () => setBusy(false) },
        })
        rz.open()
      } else {
        setDone(await api.confirm({ order_id: order.order_id }))
        setBusy(false)
      }
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <Section enter titleAs="h1" lead="Checkout," leadRest="test mode: no real money moves during the event."
             title={order ? `${order.plan.name} plan` : 'Checkout'}
             body={order ? order.plan.note : ''}>
      <div className="md:grid md:grid-cols-12 gap-x-8 mt-10">
        <div className="md:col-start-5 md:col-span-8 max-w-xl">
          {err && <p role="alert" className="text-sm text-bad mb-4">{err}</p>}
          {!order && !err && <p className="text-muted flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Preparing your order</p>}
          {order && !done && (
            <div className="frame p-6 pop">
              <div className="flex items-baseline justify-between">
                <p className="font-medium">{order.plan.name} {order.plan.monthly_inr ? '(monthly)' : '(one vendor check)'}</p>
                <p className="text-2xl font-medium tracking-tight">{inr(order.amount_inr)}</p>
              </div>
              <p className="mono text-muted mt-1">Order {order.order_id}</p>
              <div className="mt-5 rounded bg-warn-bg text-warn px-4 py-3 text-sm flex gap-2">
                <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                {order.mode === 'razorpay_test'
                  ? <span>Razorpay <b className="font-medium">test mode</b>. Use a Razorpay test card, for example 4111 1111 1111 1111, any future date, any CVV.</span>
                  : <span><b className="font-medium">Simulated test payment.</b> No payment provider is connected, no card is charged and no money moves. Add Razorpay test keys to switch to Razorpay test mode.</span>}
              </div>
              <button className="btn-dark btn-lg w-full mt-5" onClick={pay} disabled={busy}>
                <Lock size={16} aria-hidden="true" />{busy ? 'Processing' : `Pay ${inr(order.amount_inr)} (test)`}
              </button>
              <p className="text-xs text-muted mt-3 text-center">Each order can be paid only once. Paying again never charges twice.</p>
            </div>
          )}
          {done && (
            <div className="frame p-6 pop">
              <p className="text-ok font-medium flex items-center gap-2"><Check size={18} aria-hidden="true" />Payment confirmed{done.already_paid ? ' (already paid earlier)' : ''}</p>
              <p className="mt-2">You are now on the <b className="font-medium">{order.plan.name}</b> plan.</p>
              <p className="mono text-muted mt-1">Reference {done.payment_id}</p>
              <div className="flex gap-2 mt-5"><a className="btn-dark" href="#/billing">Go to billing <ArrowDownRight size={16} aria-hidden="true" /></a><a className="btn-soft" href="#/">Check a vendor</a></div>
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}
