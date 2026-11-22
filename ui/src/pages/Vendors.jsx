import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { api } from '../api'
import { PageHeader, when } from '../ui'

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
    <>
      <PageHeader eyebrow="Client records" title="Vendor master">
        The vendors the client already pays. Every new check is compared against this list for duplicates and shared bank accounts.
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <label className="btn-secondary cursor-pointer">
          <Upload size={16} aria-hidden="true" />Import a CSV
          <input type="file" accept=".csv" className="sr-only" onChange={onFile} />
        </label>
        <span className="text-sm text-muted">Columns: vendor_id, legal_name, gstin, pan, cin, domain, bank_account, ifsc, city</span>
        {msg && <span role="status" className="text-sm">{msg}</span>}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead className="text-left text-sm text-muted border-b border-line">
            <tr>{['Vendor', 'CIN', 'GSTIN', 'Website', 'City', 'Added'].map(h => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.vendor_id} className="border-b border-line last:border-0">
                <td className="px-5 py-3 font-medium">{r.legal_name}</td>
                <td className="px-5 py-3 mono">{r.cin || '—'}</td>
                <td className="px-5 py-3 mono">{r.gstin || '—'}</td>
                <td className="px-5 py-3">{r.domain || '—'}</td>
                <td className="px-5 py-3">{r.city || '—'}</td>
                <td className="px-5 py-3 text-muted">{when(r.added_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-muted">No vendors yet. Import the client's list or approve a cleared check.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
