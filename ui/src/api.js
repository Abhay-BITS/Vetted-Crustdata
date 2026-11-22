async function req(path, opts = {}) {
  const r = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts })
  if (!r.ok) {
    let msg = r.statusText
    try { msg = (await r.json()).detail || msg } catch {}
    throw new Error(msg)
  }
  return r.json()
}
export const api = {
  startRun: (body) => req('/api/runs', { method: 'POST', body: JSON.stringify(body) }),
  runs: () => req('/api/runs'),
  run: (id) => req(`/api/runs/${id}`),
  ledger: (id) => req(`/api/runs/${id}/ledger`),
  actions: (status) => req(`/api/actions${status ? `?status=${status}` : ''}`),
  decide: (id, verdict, approver, reason) =>
    req(`/api/actions/${id}/${verdict}`, { method: 'POST', body: JSON.stringify({ approver, reason }) }),
  vendors: () => req('/api/vendor-master'),
  importVendors: async (file) => {
    const fd = new FormData(); fd.append('file', file)
    const r = await fetch('/api/vendor-master/import', { method: 'POST', body: fd })
    if (!r.ok) throw new Error('import failed')
    return r.json()
  },
  summary: () => req('/api/summary'),
  batch: (id) => req(`/api/batches/${id}`),
}
