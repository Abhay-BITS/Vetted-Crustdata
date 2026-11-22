import { useEffect, useState } from 'react'
import { ArrowDownRight, ArrowRight } from 'lucide-react'
import { api } from '../api'
import Frieze from '../Frieze'
import { useReveal, scrollToId } from '../motion'
import { DecisionBadge, DECISIONS, Section, inr } from '../ui'

const EMPTY = { vendor_name: '', website: '', cin: '', gstin: '', city: '', directors: '', contact_email: '' }

export default function NewCheck() {
  const [stats, setStats] = useState(null)
  const [sample, setSample] = useState(null)
  const ref = useReveal([sample, stats])

  useEffect(() => {
    api.summary().then(setStats).catch(() => {})
    api.runs().then(async runs => {
      const cleared = runs.find(r => r.decision === 'CLEARED')
      if (cleared) setSample((await api.run(cleared.run_id)).result)
    }).catch(() => {})
  }, [])

  return (
    <div ref={ref}>
      {/* hero: fills the first screen, the quay along its bottom */}
      <div className="min-h-[calc(100svh-7rem)] md:min-h-[calc(100svh-8rem)] flex flex-col">
        <Section enter titleAs="h1" className="w-full pt-6 md:pt-10" lead="For 3PL vendor desks," leadRest="see who a new carrier really is before the first rupee moves."
                 title="Vendor and carrier clearance, with a source for every fact"
                 body="Give Vetted a vendor's name and website. It checks the company registry, staff, hiring and news, screens the directors and clears namesakes, then hands a person the decision and the evidence.">
          <div className="md:grid md:grid-cols-12 gap-x-8">
            <div className="md:col-start-5 md:col-span-8 mt-7 flex flex-wrap gap-2 enter enter-4">
              <button className="btn-dark" onClick={() => scrollToId('check')}>Check a vendor <ArrowDownRight size={16} aria-hidden="true" /></button>
              <a className="btn-soft" href="#/approvals">See the approvals <ArrowDownRight size={16} aria-hidden="true" /></a>
            </div>
          </div>
        </Section>
        <Frieze className="w-full mt-auto pt-10 enter enter-5" />
      </div>

      {/* the form */}
      <Section id="check" className="mt-24 md:mt-32" lead="New check," leadRest="a name and a website are enough. Add a CIN, GSTIN or IFSC when you have them."
               title="Check a new vendor"
               body="The check usually takes 20 to 90 seconds. Nothing is sent and nothing is added to the vendor master until a person approves it.">
        <div className="panel mt-10 p-3 md:p-12 reveal">
          <div className="frame max-w-3xl mx-auto"><CheckForm /></div>
        </div>
      </Section>

      {/* unit economics */}
      {stats && <Economics stats={stats} />}

      {/* features */}
      <Section className="mt-24 md:mt-32" lead="Registry first," leadRest="then staff, hiring and news from Crustdata."
               title="Every fact links to the record it came from"
               body="Legal name, status, incorporation date and directors come from the MCA company record. A fact whose value is not in its own quoted passage is dropped, so nothing comes from a model's memory.">
        <div className="panel mt-10 p-3 md:p-12 reveal">
          <div className="frame max-w-3xl mx-auto divide-y divide-line">
            {(sample?.facts || []).filter(f => ['legal_name', 'status', 'incorporation_date', 'headcount', 'director'].includes(f.field)).slice(0, 5).map((f, i) => (
              <div key={i} className="px-5 py-4 grid sm:grid-cols-[150px_1fr] gap-x-5 gap-y-1">
                <p className="eyebrow pt-0.5">{f.field.replace('_', ' ')}</p>
                <div className="min-w-0">
                  <p className="font-medium">{String(f.value)}</p>
                  <p className="mono text-muted mt-1 truncate">{f.passage}</p>
                  <p className="text-xs text-muted mt-1">{f.source}{f.record_date ? ` · record dated ${f.record_date}` : ''} · retrieved {f.retrieved_at}</p>
                </div>
              </div>
            ))}
            {!sample && <p className="px-5 py-8 text-muted text-sm">Run a check and its facts appear here.</p>}
          </div>
        </div>
      </Section>

      <Section className="mt-24 md:mt-32" lead="Namesakes cleared," leadRest="nobody is flagged on a name alone."
               title="Fronts caught, honest firms and namesakes pass"
               body="An adverse article counts only when it also names the company, the director's DIN or the company's city. A small transporter with little online presence gets a document request, never a rejection.">
        <div className="panel mt-10 p-3 md:p-12 reveal">
          <div className="frame max-w-3xl mx-auto p-5 grid sm:grid-cols-2 gap-3">
            {Object.entries(DECISIONS).map(([k, d]) => (
              <div key={k} className="rounded bg-bg p-4">
                <DecisionBadge decision={k} />
                <p className="text-sm text-muted mt-2.5">{d.line}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section className="mt-24 md:mt-32" lead="Exactly once," leadRest="even when the process is killed halfway."
               title="A person approves anything that cannot be undone"
               body="Emails to vendors and changes to the vendor master wait for a named approver. Each step is saved as it finishes, so a restart picks up where it stopped and no action runs twice.">
        <div className="panel mt-10 p-3 md:p-12 reveal">
          <div className="frame max-w-3xl mx-auto p-6">
            <ol className="grid sm:grid-cols-4 gap-3 text-sm">
              {[['Proposed', 'pending approval'], ['Approved', 'by a named person'], ['Running', 'claimed once'], ['Done', 'executed 1 time']].map(([t, d], i) => (
                <li key={t} className="rounded bg-bg p-4">
                  <p className="mono text-muted">0{i + 1}</p>
                  <p className="font-medium mt-2">{t}</p>
                  <p className="text-muted mt-0.5">{d}</p>
                </li>
              ))}
            </ol>
            <a href="#/approvals" className="textlink mt-6">Open the approval queue <ArrowDownRight size={16} aria-hidden="true" /></a>
          </div>
        </div>
      </Section>
    </div>
  )
}

function CheckForm() {
  const [mode, setMode] = useState('form')
  const [f, setF] = useState(() => {
    try {
      const pre = JSON.parse(sessionStorage.getItem('vetted.prefill') || 'null')
      if (pre) { sessionStorage.removeItem('vetted.prefill'); setTimeout(() => scrollToId('check'), 400); return { ...EMPTY, ...pre, directors: (pre.directors || []).join(', ') } }
    } catch {}
    return EMPTY
  })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = k => e => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setErr('')
    const body = mode === 'text'
      ? { text }
      : Object.fromEntries(Object.entries({ ...f, directors: f.directors ? f.directors.split(',').map(s => s.trim()).filter(Boolean) : null }).filter(([, v]) => v && (!Array.isArray(v) || v.length)))
    if (mode === 'form' && !body.vendor_name && !body.website) { setErr('Give the vendor name or its website.'); return }
    if (mode === 'text' && !text.trim()) { setErr('Paste the request first.'); return }
    setBusy(true)
    try {
      const res = await api.startRun(body)
      window.location.hash = res.batch_id ? `#/batch/${res.batch_id}` : `#/run/${res.run_id}`
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line">
        <div className="flex gap-1.5" aria-hidden="true"><span className="w-2.5 h-2.5 rounded-full bg-line" /><span className="w-2.5 h-2.5 rounded-full bg-line" /><span className="w-2.5 h-2.5 rounded-full bg-line" /></div>
        <div role="tablist" aria-label="Request format" className="inline-flex p-0.5 rounded-[9px] bg-soft">
          {[['form', 'Vendor details'], ['text', 'Paste a request (one or several vendors)']].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                    className={`h-8 px-3 rounded-[8px] text-[13px] font-medium transition ${mode === k ? 'bg-card text-ink shadow-[0_1px_2px_oklch(0.289_0_0/.08)]' : 'text-muted hover:text-ink'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="p-5 md:p-7">
        {mode === 'form' ? (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="vendor_name" label="Vendor name" span placeholder="Blue Dart Express Limited" value={f.vendor_name} onChange={set('vendor_name')} />
            <Field id="website" label="Website" placeholder="bluedart.com" value={f.website} onChange={set('website')} />
            <Field id="city" label="City" placeholder="Mumbai" value={f.city} onChange={set('city')} />
            <Field id="cin" label="CIN" hint="if known" mono placeholder="L61074MH1991PLC061074" value={f.cin} onChange={set('cin')} />
            <Field id="gstin" label="GSTIN" hint="if known" mono placeholder="27AAACB0446L1ZS" value={f.gstin} onChange={set('gstin')} />
            <Field id="directors" label="Directors named on the vendor's application" hint="optional, comma separated: checked against the official record" span placeholder="Balfour John Manuel" value={f.directors} onChange={set('directors')} />
            <Field id="contact_email" label="Vendor contact email" hint="a teammate's inbox in the demo" span type="email" placeholder="vendor-desk@example.test" value={f.contact_email} onChange={set('contact_email')} />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="text">The client's request, as written</label>
            <textarea id="text" rows={6} className="field" value={text} onChange={e => setText(e.target.value)}
                      placeholder="Please clear these new carriers before Monday: Delhivery Limited (delhivery.com) and Blue Dart Express Limited, bluedart.com. Tell me whether each is a real, trading business, who runs it, how long it has existed, and anything that looks off." />
            <p className="text-sm text-muted mt-2">Several vendors in one request are split and checked one after another.</p>
          </div>
        )}
        {err && <p role="alert" className="mt-4 text-sm text-bad">{err}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button className="btn-dark" disabled={busy}>{busy ? 'Starting' : 'Run the check'} <ArrowRight size={16} aria-hidden="true" /></button>
          <span className="text-sm text-muted">Nothing is sent until a person approves it.</span>
        </div>
      </div>
    </form>
  )
}

function Field({ id, label, hint, span, mono, ...rest }) {
  return (
    <div className={span ? 'sm:col-span-2' : ''}>
      <label className="label" htmlFor={id}>{label}{hint && <span className="text-muted font-normal"> ({hint})</span>}</label>
      <input id={id} className={`field ${mono ? 'font-mono text-[13px] uppercase' : ''}`} {...rest} />
    </div>
  )
}

function Economics({ stats }) {
  const price = stats.price_per_vendor_inr || 0
  const cost = stats.avg_cost_inr || 0
  const margin = price ? Math.round(((price - cost) / price) * 100) : 0
  return (
    <Section className="mt-24 md:mt-32" lead="The numbers," leadRest="measured from the cost ledger of every check run here."
             title="₹999 a vendor, about ₹30 to run"
             body="The client pays a flat fee per vendor processed, whatever the outcome. The cost is what Crustdata credits and every other call actually add up to when nothing is cached.">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-10">
        {[
          ['Price per vendor', inr(price), 'flat, paid when the job is done'],
          ['Cost per check', inr(cost), 'measured, nothing cached'],
          ['Gross margin', `${margin}%`, 'price minus measured cost'],
          ['Time per check', stats.avg_seconds ? `${Math.round(stats.avg_seconds)}s` : '60–95s', stats.avg_seconds ? 'against days of manual checks' : 'measured on fresh checks, against days by hand'],
        ].map(([k, v, d], i) => (
          <div key={k} className="panel p-5 reveal" style={{ transitionDelay: `${i * 60}ms` }}>
            <p className="text-sm font-medium">{k}</p>
            <p className="text-[40px] leading-none font-medium tracking-tight mt-5 tabular-nums">{v}</p>
            <p className="text-sm text-muted mt-3">{d}</p>
          </div>
        ))}
      </div>
      <div className="panel mt-3 p-2 md:p-3 reveal">
        <div className="frame overflow-x-auto" data-lenis-prevent>
          <table className="w-full text-[15px]">
            <thead className="text-left text-sm text-muted border-b border-line">
              <tr>{['New vendors a month', 'Client pays', 'Our cost', 'Gross profit'].map(h => <th key={h} className="px-5 py-3.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {[25, 50, 200].map(n => (
                <tr key={n} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 font-medium">{n}</td>
                  <td className="px-5 py-3.5 mono">{inr(n * price)}</td>
                  <td className="px-5 py-3.5 mono">{inr(Math.round(n * cost))}</td>
                  <td className="px-5 py-3.5 mono">{inr(Math.round(n * (price - cost)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  )
}
