import { useEffect, useRef, useState } from 'react'

/** Adds .in to every .reveal element inside the returned ref once it scrolls into view. */
export function useReveal(deps = []) {
  const ref = useRef(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const els = root.querySelectorAll('.reveal:not(.in)')
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, deps)
  return ref
}

export function scrollToId(id) {
  const el = document.getElementById(id)
  if (!el) return
  if (window.__lenis) window.__lenis.scrollTo(el, { offset: -90 })
  else el.scrollIntoView({ behavior: 'smooth' })
}

/** Counts a number up from 0 when it first renders. Non-numbers are returned as they are. */
export function useCountUp(target, ms = 900) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const n = Number(target)
    if (!Number.isFinite(n)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(n); return }
    let raf, t0
    const tick = t => {
      if (!t0) t0 = t
      const k = Math.min(1, (t - t0) / ms)
      setV(n * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}
