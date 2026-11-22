import { useEffect, useState } from 'react'
import { ArrowDownRight } from 'lucide-react'
import { api } from '../api'
import { Section, when } from '../ui'
import { VendorsScene } from '../scenes'

export default function Vendors() {
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState('')
  const load = () => api.vendors().then(setRows)
  useEffect(() => { load() }, [])

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try { const r = await api.importVendors(file); setMsg(`${r.imported} vendors imported.`); load() }
    catch (err) { setMsg(err.message) }
    e.target.value = ''
  }

  return (
    <Section enter titleAs="h1" lead="Your vendor master," leadRest="the vendors you already pay."
             title="Your vendors"
             body="Every new check is compared with this list for duplicates and shared bank accounts. Vendors you approve are added here, once.">
      <div className="vt-bleed mt-10 enter enter-4"><VendorsScene /></div>
      <div className="md:grid md:grid-cols-12 gap-x-8 mt-12">
        <div className="md:col-start-5 md:col-span-8 flex flex-wrap items-center gap-3 enter enter-4">
          <label className="btn-dark cursor-pointer">
            Import a CSV <ArrowDownRight size={16} aria-hidden="true" />
            <input type="file" accept=".csv" className="sr-only" onChange={onFile} />
          </label>
          <span className="text-sm text-muted">vendor_id, legal_name, gstin, pan, cin, domain, bank_account, ifsc, city</span>
          {msg && <span role="status" className="text-sm">{msg}</span>}
        </div>
      </div>
      <div className="panel p-2 md:p-3 mt-10 enter enter-5">
        <div className="frame overflow-x-auto" data-lenis-prevent>
          <table className="w-full text-[15px]">
            <thead className="text-left text-sm text-muted border-b border-line">
              <tr>{['Vendor', 'CIN', 'GSTIN', 'Website', 'City', 'Added'].map(h => <th key={h} className="px-5 py-3.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="stagger">
              {rows.map(r => (
                <tr key={r.vendor_id} className="border-b border-line last:border-0 hover:bg-bg transition-colors">
                  <td className="px-5 py-3.5 font-medium">{r.legal_name}</td>
                  <td className="px-5 py-3.5 mono">{r.cin || '—'}</td>
                  <td className="px-5 py-3.5 mono">{r.gstin || '—'}</td>
                  <td className="px-5 py-3.5">{r.domain || '—'}</td>
                  <td className="px-5 py-3.5">{r.city || '—'}</td>
                  <td className="px-5 py-3.5 text-muted text-sm">{when(r.added_at)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">No vendors yet. Import the client's list or approve a cleared check.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  )
}
