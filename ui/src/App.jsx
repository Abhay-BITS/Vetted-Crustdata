import { useEffect, useState } from 'react'
import { ArrowDownRight } from 'lucide-react'
import { api } from './api'
import { Mark, Ship } from './Art'
import NewCheck from './pages/NewCheck'
import RunView from './pages/RunView'
import Approvals from './pages/Approvals'
import Checks from './pages/Checks'
import Vendors from './pages/Vendors'
import Batch from './pages/Batch'

function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const on = () => { setHash(window.location.hash || '#/'); window.__lenis ? window.__lenis.scrollTo(0, { immediate: true }) : window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()
  const [pending, setPending] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    let alive = true
    const tick = () => api.summary().then(s => alive && setPending(s.pending_approvals)).catch(() => {})
    tick()
    const t = setInterval(tick, 3000)
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { alive = false; clearInterval(t); window.removeEventListener('scroll', onScroll) }
  }, [])

  const [, route, arg] = hash.split('/')
  const nav = [
    { href: '#/approvals', key: 'approvals', label: 'Approvals', count: pending },
    { href: '#/checks', key: 'checks', label: 'Checks' },
    { href: '#/vendors', key: 'vendors', label: 'Vendor master', short: 'Vendors' },
  ]
  const active = route === 'run' || route === 'batch' ? 'checks' : route

  let page
  if (route === 'run' && arg) page = <RunView key={arg} runId={arg} />
  else if (route === 'batch' && arg) page = <Batch key={arg} batchId={arg} />
  else if (route === 'approvals') page = <Approvals />
  else if (route === 'checks') page = <Checks />
  else if (route === 'vendors') page = <Vendors />
  else page = <NewCheck />

  return (
    <div className="min-h-svh flex flex-col">
      <header className="fixed top-0 inset-x-0 z-40 pointer-events-none">
        <div className="wrap flex items-center justify-between gap-3 pt-2.5">
          <a href="#/" className={`pointer-events-auto flex items-center gap-2.5 rounded p-1 pr-3.5 bg-soft transition-shadow ${scrolled ? 'shadow-float' : ''}`} aria-label="Vetted, home">
            <span className="w-8 h-8 rounded-[8px] bg-card grid place-items-center text-ink shadow-[0_1px_2px_oklch(0.289_0_0/.08)]"><Mark size={20} /></span>
            <span className="text-sm lg:text-[15px] font-medium">Vetted</span>
          </a>
          <nav aria-label="Main" className={`pointer-events-auto flex items-center gap-0.5 rounded p-1 bg-soft overflow-x-auto transition-shadow ${scrolled ? 'shadow-float' : ''}`}>
            {nav.map(n => (
              <a key={n.key} href={n.href} aria-current={active === n.key ? 'page' : undefined}
                 className={`relative flex items-center gap-1.5 h-9 lg:h-10 px-3 lg:px-3.5 rounded-[8px] text-sm lg:text-[15px] whitespace-nowrap transition-colors ${active === n.key ? 'bg-card text-ink font-medium shadow-[0_1px_2px_oklch(0.289_0_0/.06)]' : 'text-ink hover:bg-line'}`}>
                {n.short ? <><span className="hidden sm:inline">{n.label}</span><span className="sm:hidden">{n.short}</span></> : n.label}
                {n.count > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-ink text-bg text-[11px] font-medium grid place-items-center pop">{n.count}</span>}
              </a>
            ))}
            <a href="#/" className="btn-dark !h-9 lg:!h-10 !min-h-0 lg:!text-[15px] ml-1 hidden sm:inline-flex">Check a vendor <ArrowDownRight size={15} aria-hidden="true" /></a>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1 pt-[clamp(76px,11.5vh,128px)]">{page}</main>

      <footer className="mt-28 border-t border-line">
        <div className="wrap py-10 grid md:grid-cols-12 gap-8 items-end">
          <div className="md:col-span-4">
            <div className="flex items-center gap-2 mb-3"><Mark size={22} /><span className="font-medium">Vetted</span></div>
            <p className="lead">Vendor and carrier clearance for a 3PL. Every fact links to the record it came from.</p>
          </div>
          <div className="md:col-span-5 text-sm text-muted space-y-1">
            <p>Company data: Crustdata API · MCA company records · Razorpay IFSC directory</p>
            <p>ContextCon 05 · BITS Pilani · Trust and compliance</p>
          </div>
          <div className="md:col-span-3 flex md:justify-end"><Ship className="w-40 text-ink" /></div>
        </div>
      </footer>
    </div>
  )
}
