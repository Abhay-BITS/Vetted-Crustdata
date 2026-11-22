import React from 'react'
import ReactDOM from 'react-dom/client'
import Lenis from 'lenis'
import App from './App.jsx'
import './index.css'

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true })
  window.__lenis = lenis
  const raf = t => { lenis.raf(t); requestAnimationFrame(raf) }
  requestAnimationFrame(raf)
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
