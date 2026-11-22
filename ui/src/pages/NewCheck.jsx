import { useState } from 'react'
import { ArrowRight, Building, Globe, FileText } from 'lucide-react'
import { api } from '../api'
import { PageHeader } from '../ui'

const EMPTY = { vendor_name: '', website: '', cin: '', gstin: '', city: '', directors: '', contact_email: '' }

export default function NewCheck() {
  const [mode, setMode] = useState('form')
  const [f, setF] = useState(EMPTY)
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
      const { run_id } = await api.startRun(body)
      window.location.hash = `#/run/${run_id}`
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader eyebrow="Vendor and carrier clearance" title="Check a new vendor">
        Give a name and a website. Vetted proves the business is registered and trading, finds who runs it,
        screens them against the news and cites the record behind every fact.
      </PageHeader>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <form onSubmit={submit} className="card p-6" noValidate>
          <div role="tablist" aria-label="Request format" className="inline-flex p-1 rounded bg-paper border border-line mb-6">
            {[['form', 'Vendor details'], ['text', 'Paste a request']].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                      className={`min-h-[40px] px-4 rounded text-sm font-medium transition ${mode === k ? 'bg-surface shadow-card text-ink' : 'text-muted hover:text-ink'}`}>{l}</button>
            ))}
          </div>

          {mode === 'form' ? (
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="vendor_name">Vendor name</label>
                <input id="vendor_name" className="field" placeholder="Blue Dart Express Limited" value={f.vendor_name} onChange={set('vendor_name')} />
              </div>
              <div>
                <label className="label" htmlFor="website">Website</label>
                <input id="website" className="field" placeholder="bluedart.com" value={f.website} onChange={set('website')} />
              </div>
              <div>
                <label className="label" htmlFor="city">City</label>
                <input id="city" className="field" placeholder="Mumbai" value={f.city} onChange={set('city')} />
              </div>
              <div>
                <label className="label" htmlFor="cin">CIN <span className="text-muted font-normal">(if known)</span></label>
                <input id="cin" className="field mono uppercase" placeholder="L61074MH1991PLC061074" value={f.cin} onChange={set('cin')} />
              </div>
              <div>
                <label className="label" htmlFor="gstin">GSTIN <span className="text-muted font-normal">(if known)</span></label>
                <input id="gstin" className="field mono uppercase" placeholder="27AAACB0446L1ZS" value={f.gstin} onChange={set('gstin')} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="directors">Directors the vendor named <span className="text-muted font-normal">(comma separated)</span></label>
                <input id="directors" className="field" placeholder="Balfour Manuel" value={f.directors} onChange={set('directors')} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="contact_email">Vendor contact email <span className="text-muted font-normal">(your teammate's inbox during the demo)</span></label>
                <input id="contact_email" type="email" className="field" placeholder="vendor-desk@example.test" value={f.contact_email} onChange={set('contact_email')} />
              </div>
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="text">The client's request, as written</label>
              <textarea id="text" rows={6} className="field py-3" value={text} onChange={e => setText(e.target.value)}
                        placeholder="Here is a new vendor's name and website: Sharma Roadlines, sharmaroadlines.com. Tell me whether it is a real, trading business: who runs it, how long it has existed, and anything that looks off." />
            </div>
          )}

          {err && <p role="alert" className="mt-4 text-sm text-bad">{err}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={busy}>
              {busy ? 'Starting…' : 'Run the check'} <ArrowRight size={18} aria-hidden="true" />
            </button>
            <span className="text-sm text-muted">Usually 20 to 90 seconds. Nothing is sent until a person approves it.</span>
          </div>
        </form>

        <aside className="card p-6">
          <h2 className="font-semibold mb-4">What every check answers</h2>
          <ol className="space-y-4 text-[15px]">
            {[
              [Building, 'Is it a real, trading business?', 'Registry status, staff, hiring and a live website.'],
              [FileText, 'Who runs it, and for how long?', 'Directors with their DIN, and the incorporation date.'],
              [Globe, 'Does anything look off?', 'Lookalike names, duplicates, adverse news. Namesakes are cleared, not flagged.'],
            ].map(([I, t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 w-8 h-8 shrink-0 rounded bg-accent-soft text-accent grid place-items-center"><I size={16} aria-hidden="true" /></span>
                <span><span className="block font-medium">{t}</span><span className="text-muted text-sm">{d}</span></span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  )
}
