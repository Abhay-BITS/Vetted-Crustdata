import { useEffect, useState } from 'react'
import { ShieldCheck, Plus, Inbox, ListChecks, Building2 } from 'lucide-react'
import { api } from './api'
import NewCheck from './pages/NewCheck'
import RunView from './pages/RunView'
import Approvals from './pages/Approvals'
import Checks from './pages/Checks'
import Vendors from './pages/Vendors'

function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/new')
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/new')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()
  const [pending, setPending] = useState(0)
  useEffect(() => {
    let alive = true
    const tick = () => api.summary().then(s => alive && setPending(s.pending_approvals)).catch(() => {})
    tick()
    const t = setInterval(tick, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const [, route, arg] = hash.split('/')
  const nav = [
    { href: '#/new', key: 'new', label: 'New check', Icon: Plus },
    { href: '#/approvals', key: 'approvals', label: 'Approvals', Icon: Inbox, count: pending },
    { href: '#/checks', key: 'checks', label: 'Checks', Icon: ListChecks },
    { href: '#/vendors', key: 'vendors', label: 'Vendor master', Icon: Building2 },
  ]
  const active = route === 'run' ? 'checks' : route

  let page
  if (route === 'run' && arg) page = <RunView runId={arg} />
  else if (route === 'approvals') page = <Approvals />
  else if (route === 'checks') page = <Checks />
  else if (route === 'vendors') page = <Vendors />
  else page = <NewCheck />

  return (
    <div className="min-h-screen md:flex">
      <aside className="md:w-60 md:min-h-screen md:fixed md:inset-y-0 border-b md:border-b-0 md:border-r border-line bg-surface">
        <div className="px-5 h-16 flex items-center gap-2.5 border-b border-line">
          <span className="w-8 h-8 rounded bg-accent text-white grid place-items-center"><ShieldCheck size={18} aria-hidden="true" /></span>
          <span className="font-semibold text-[17px]">Vetted</span>
        </div>
        <nav aria-label="Main" className="p-3 flex md:flex-col gap-1 overflow-x-auto">
          {nav.map(n => (
            <a key={n.key} href={n.href} aria-current={active === n.key ? 'page' : undefined}
               className={`flex items-center gap-2.5 min-h-[44px] px-3 rounded text-[15px] whitespace-nowrap transition ${active === n.key ? 'bg-accent-soft text-accent-ink font-semibold' : 'text-ink hover:bg-paper'}`}>
              <n.Icon size={18} aria-hidden="true" />
              <span className="flex-1">{n.label}</span>
              {n.count > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-warn text-white text-xs font-semibold grid place-items-center">{n.count}</span>}
            </a>
          ))}
        </nav>
        <p className="hidden md:block absolute bottom-0 p-5 text-xs text-muted leading-relaxed">
          Vendor and carrier clearance for a 3PL. Every fact links to its record.
        </p>
      </aside>
      <main id="main" className="flex-1 md:ml-60">
        <div className="max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-10">{page}</div>
      </main>
    </div>
  )
}
