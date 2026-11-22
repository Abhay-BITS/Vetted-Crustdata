/*
 * Extra hand-drawn elements for the home hero, in the same style as the quayside frieze:
 * a self-ticking checklist with a stamp, a magnifier scanning a document, drifting clouds and a cargo plane.
 * Uses the frieze's shared SVG defs (#vt-sketch, #vt-hatch), which are on the same page.
 */
import { useEffect, useState } from 'react'
import { TONES as T } from './Frieze'

const INK = 'oklch(0.36 0.01 70)'
const PAPER = 'oklch(0.975 0.004 84)'
const st = { stroke: INK, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }
const thin = { stroke: INK, strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }

const ITEMS = ['Registry record', 'Is it trading?', 'Who runs it', 'Bank and tax', 'News screen']

/** A clipboard whose items tick off one by one, then a CLEARED stamp lands; it loops. */
export function Checklist() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setStep(ITEMS.length + 1); return }
    const t = setInterval(() => setStep(s => (s >= ITEMS.length + 3 ? 0 : s + 1)), 900)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="bob-slow" aria-hidden="true">
      <svg viewBox="0 0 220 270" className="w-full h-auto overflow-visible">
        <g filter="url(#vt-sketch)">
          <rect x="14" y="22" width="192" height="240" rx="10" fill={T.sand} {...st} />
          <rect x="14" y="22" width="192" height="240" rx="10" fill="url(#vt-hatch-fine)" />
          <rect x="28" y="40" width="164" height="210" rx="4" fill={PAPER} {...st} />
          <rect x="78" y="12" width="64" height="22" rx="5" fill={T.stone} {...st} />
          <circle cx="110" cy="20" r="3" fill={INK} opacity=".6" />
          <path d="M44 62 h96" {...st} />
          <path d="M44 74 h60" {...thin} opacity=".5" />
          {ITEMS.map((label, i) => {
            const y = 102 + i * 28
            const done = step > i
            return (
              <g key={label}>
                <rect x="44" y={y - 10} width="14" height="14" rx="2" fill={PAPER} {...st} />
                {done && <path className="vt-draw" d={`M46.5 ${y - 3} l4 4 l7 -9`} {...st} strokeWidth="2.2" stroke={T.olive} />}
                <text x="66" y={y + 1.5} fontFamily="Switzer, sans-serif" fontSize="11" fill={INK} opacity={done ? 0.9 : 0.45}>{label}</text>
                <path d={`M66 ${y + 6} h${70 - i * 6}`} {...thin} opacity=".18" />
              </g>
            )
          })}
        </g>
        {step > ITEMS.length && (
          <g className="vt-stamp" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
            <g transform="rotate(-12 150 225)">
              <rect x="104" y="208" width="96" height="32" rx="5" fill="none" stroke={T.olive} strokeWidth="2.4" opacity=".85" />
              <text x="152" y="230" textAnchor="middle" fontFamily="Switzer, sans-serif" fontSize="14" fontWeight="600" letterSpacing="2" fill={T.olive} opacity=".85">CLEARED</text>
            </g>
          </g>
        )}
      </svg>
    </div>
  )
}

/** A sheet of a company record with a magnifying glass scanning across it. */
export function Scanner() {
  return (
    <div aria-hidden="true" className="relative">
      <svg viewBox="0 0 200 170" className="w-full h-auto overflow-visible">
        <g filter="url(#vt-sketch)">
          <path d="M30 20 h110 l26 26 v110 h-136 z" fill={PAPER} {...st} />
          <path d="M140 20 v26 h26" {...st} />
          <path d="M44 40 h70" {...st} />
          {[58, 72, 86, 100, 114, 128, 142].map((y, i) => <path key={y} d={`M44 ${y} h${[96, 80, 104, 70, 92, 60, 84][i]}`} {...thin} opacity=".35" />)}
          <rect x="44" y="52" width="40" height="10" fill={T.ochre} opacity=".25" />
        </g>
        <g className="vt-scan">
          <g filter="url(#vt-sketch)">
            <circle cx="96" cy="90" r="22" fill="oklch(0.96 0.02 85 / .55)" {...st} strokeWidth="2.2" />
            <path d="M112 106 l22 22" {...st} strokeWidth="5" stroke={T.rust} />
            <path d="M112 106 l22 22" {...thin} />
            <path d="M84 80 q6 -6 14 -4" {...thin} opacity=".5" />
          </g>
        </g>
      </svg>
    </div>
  )
}

function Cloud({ w = 160 }) {
  return (
    <svg viewBox="0 0 160 60" width={w} className="h-auto overflow-visible">
      <g filter="url(#vt-sketch)">
        <path d="M18 48 q-14 0 -12 -12 q2 -11 16 -9 q2 -15 20 -15 q10 -14 28 -6 q14 -10 30 2 q20 -2 22 16 q16 2 14 16 q-2 8 -14 8 z" fill={PAPER} {...st} />
        <path d="M24 44 q30 6 104 0" {...thin} opacity=".25" />
        <path d="M30 48 h96" stroke="url(#vt-hatch)" />
      </g>
    </svg>
  )
}

function Plane() {
  return (
    <svg viewBox="0 0 120 40" width="96" className="h-auto overflow-visible">
      <g filter="url(#vt-sketch)">
        <path d="M-160 22 h150" {...thin} strokeDasharray="4 6" opacity=".35" />
        <path d="M8 22 q0 -6 10 -6 h70 q14 0 22 6 q-8 6 -22 6 h-70 q-10 0 -10 -6 z" fill={T.cream} {...st} />
        <path d="M40 16 l14 -12 h8 l-6 12" fill={T.stone} {...st} />
        <path d="M44 28 l12 10 h7 l-5 -10" fill={T.stone} {...st} />
        <path d="M10 16 l-4 -9 h7 l6 9" fill={T.rust} {...st} />
        {[64, 72, 80].map(x => <circle key={x} cx={x} cy="21" r="1.6" fill={INK} opacity=".55" />)}
      </g>
    </svg>
  )
}

/** Clouds drifting at different speeds and a cargo plane that crosses now and then. Full width. */
export function Sky() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-x-clip">
      <div className="vt-cloud" style={{ top: '6%', '--dur': '110s', '--delay': '-30s', opacity: 0.9 }}><Cloud w={170} /></div>
      <div className="vt-cloud" style={{ top: '30%', '--dur': '150s', '--delay': '-95s', opacity: 0.75 }}><Cloud w={120} /></div>
      <div className="vt-cloud" style={{ top: '38%', '--dur': '130s', '--delay': '-60s', opacity: 0.85 }}><Cloud w={140} /></div>
      <div className="vt-cloud" style={{ top: '18%', '--dur': '170s', '--delay': '-140s', opacity: 0.6 }}><Cloud w={96} /></div>
      <div className="vt-plane" style={{ top: '40%' }}><div className="vt-glide"><Plane /></div></div>
    </div>
  )
}
