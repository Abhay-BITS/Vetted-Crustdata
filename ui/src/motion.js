import { useEffect, useRef } from 'react'

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
