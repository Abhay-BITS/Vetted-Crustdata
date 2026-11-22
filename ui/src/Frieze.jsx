/*
 * The Vetted quayside: original hand-drawn style line art of a 3PL dock.
 * A stage of sprites stands on the quay; a few of them move on their own
 * (walkers cross, a gull glides and rises as you scroll, a parcel hops, the crane hook swings).
 */

const INK = 'oklch(0.36 0.01 70)'
const PAPER = 'oklch(0.975 0.004 84)'
const T = {
  ochre: 'oklch(0.80 0.07 75)', rust: 'oklch(0.66 0.09 40)', slate: 'oklch(0.66 0.035 240)',
  sage: 'oklch(0.76 0.045 140)', sand: 'oklch(0.88 0.035 80)', stone: 'oklch(0.86 0.008 80)',
  denim: 'oklch(0.55 0.05 250)', cream: 'oklch(0.93 0.02 85)', olive: 'oklch(0.62 0.05 115)',
}
const st = { stroke: INK, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }
const thin = { stroke: INK, strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round' }

/* ---------- shared defs: a pencil wobble and hatching ---------- */
export function Defs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        <filter id="vt-sketch" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <pattern id="vt-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <line x1="0" y1="0" x2="0" y2="5" stroke={INK} strokeWidth=".7" opacity=".32" />
        </pattern>
        <pattern id="vt-hatch-fine" width="3.5" height="3.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <line x1="0" y1="0" x2="0" y2="3.5" stroke={INK} strokeWidth=".55" opacity=".25" />
        </pattern>
      </defs>
    </svg>
  )
}

/* ---------- people ---------- */
// pivot points in user units (view-box origin is the 0,0 of the drawing, not its corner)
const HIP = { transformBox: 'view-box', transformOrigin: '0px -42px' }
const SHOULDER = { transformBox: 'view-box', transformOrigin: '0px -75px' }
export function Person({ coat = T.slate, trousers = T.denim, hat = 'none', pose = 'stand', flip = false, prop = null, skin = T.sand }) {
  const walk = pose === 'walk'
  const legL = walk ? 'M-4 -42 L-10 -3' : 'M-4 -42 L-5 -2'
  const legR = walk ? 'M4 -42 L9 -2' : 'M4 -42 L5 -2'
  let armL = 'M-9 -74 Q-14 -60 -12 -48'
  let armR = 'M9 -74 Q14 -60 12 -48'
  if (prop === 'clipboard') armR = 'M9 -74 Q16 -66 8 -58'
  if (prop === 'magnifier') armR = 'M9 -74 Q20 -70 24 -62'
  if (prop === 'box') { armL = 'M-9 -74 Q-4 -64 0 -64'; armR = 'M9 -74 Q4 -64 0 -64' }
  if (prop === 'wave') armR = 'M9 -74 Q16 -84 18 -96'
  if (prop === 'papers') armR = 'M9 -74 Q18 -68 22 -66'
  if (prop === 'trolley') { armL = 'M-9 -74 Q2 -66 14 -62'; armR = 'M9 -74 Q12 -66 16 -62' }
  return (
    <svg viewBox="-30 -112 60 116" className="w-full h-auto overflow-visible">
      <g transform={flip ? 'scale(-1,1)' : undefined} filter="url(#vt-sketch)">
        <ellipse cx="0" cy="0" rx="14" ry="2.6" fill="url(#vt-hatch)" opacity=".7" />
        {/* legs + shoes */}
        {walk ? (
          <>
            <g className="vt-leg" style={HIP}>
              <path d="M-1 -42 L-1 -3" {...st} fill="none" strokeWidth="5.2" stroke={trousers} />
              <path d="M-1 -42 L-1 -3" {...thin} fill="none" opacity=".55" />
              <path d="M-4 -1.5 h8" {...st} strokeWidth="3" />
            </g>
            <g className="vt-leg vt-leg-b" style={HIP}>
              <path d="M1 -42 L1 -3" {...st} fill="none" strokeWidth="5.2" stroke={trousers} />
              <path d="M1 -42 L1 -3" {...thin} fill="none" opacity=".55" />
              <path d="M-2 -1.5 h8" {...st} strokeWidth="3" />
            </g>
          </>
        ) : (
          <>
            <path d={legL} {...st} fill="none" strokeWidth="5.2" stroke={trousers} />
            <path d={legR} {...st} fill="none" strokeWidth="5.2" stroke={trousers} />
            <path d={legL} {...thin} fill="none" opacity=".55" />
            <path d={legR} {...thin} fill="none" opacity=".55" />
            <path d="M-9 -1 h7" {...st} strokeWidth="3" />
            <path d="M2 -1 h7" {...st} strokeWidth="3" />
          </>
        )}
        {/* coat */}
        <path d="M-10 -76 Q-13 -60 -12 -40 L12 -40 Q13 -60 10 -76 Q0 -80 -10 -76 Z" fill={coat} {...st} />
        <path d="M-12 -40 L12 -40 L10 -44 L-10 -44 Z" fill="url(#vt-hatch)" />
        <path d="M0 -77 V-42" {...thin} opacity=".45" />
        {/* arms */}
        <g className={walk && !prop ? 'vt-arm' : undefined} style={SHOULDER}>
          <path d={armL} {...st} fill="none" strokeWidth="4.4" stroke={coat} />
          <path d={armL} {...thin} fill="none" opacity=".6" />
        </g>
        <g className={walk && !prop ? 'vt-arm vt-arm-b' : undefined} style={SHOULDER}>
          <path d={armR} {...st} fill="none" strokeWidth="4.4" stroke={coat} />
          <path d={armR} {...thin} fill="none" opacity=".6" />
        </g>
        {/* head */}
        <path d="M-2.5 -80 v-4 h5 v4" fill={skin} {...thin} />
        <circle cx="0" cy="-90" r="7" fill={skin} {...st} />
        {hat === 'cap' && <path d="M-7.5 -92 Q0 -101 7.5 -92 Z M5 -92.5 h6" fill={T.olive} {...st} />}
        {hat === 'hard' && <path d="M-8.5 -91 Q-8 -101 0 -101 Q8 -101 8.5 -91 Z M-10 -91 h20" fill={T.ochre} {...st} />}
        {hat === 'hair' && <path d="M-7 -90 Q-7 -98 0 -98 Q7 -98 7 -90 Q4 -94 -2 -94 Q-5 -93 -7 -90 Z" fill={INK} opacity=".75" />}
        {hat === 'bun' && <><path d="M-7 -90 Q-7 -98 0 -98 Q7 -98 7 -90 Q3 -94 -7 -90 Z" fill={INK} opacity=".75" /><circle cx="5" cy="-97" r="3" fill={INK} opacity=".75" /></>}
        {/* props */}
        {prop === 'clipboard' && <g><rect x="4" y="-66" width="10" height="13" rx="1" fill={PAPER} {...st} /><path d="M6 -62 h6 M6 -59 h6 M6 -56 h4" {...thin} /></g>}
        {prop === 'magnifier' && <g><circle cx="27" cy="-58" r="5" fill={T.cream} {...st} /><path d="M24 -62 l-3 -4" {...st} /></g>}
        {prop === 'box' && <g><rect x="-9" y="-72" width="18" height="14" fill={T.sand} {...st} /><path d="M-9 -66 h18" {...thin} opacity=".5" /></g>}
        {prop === 'papers' && <g><rect x="20" y="-71" width="9" height="11" fill={PAPER} {...st} transform="rotate(12 24 -65)" /></g>}
      </g>
    </svg>
  )
}

/* ---------- objects ---------- */
export function Crates() {
  return (
    <svg viewBox="0 0 70 56" className="w-full h-auto overflow-visible">
      <g filter="url(#vt-sketch)">
        <ellipse cx="35" cy="55" rx="34" ry="2.5" fill="url(#vt-hatch)" opacity=".7" />
        <rect x="2" y="26" width="30" height="28" fill={T.sand} {...st} /><path d="M2 26 L32 54 M32 26 L2 54" {...thin} opacity=".4" />
        <rect x="34" y="30" width="26" height="24" fill={T.cream} {...st} /><path d="M34 38 h26 M34 46 h26" {...thin} opacity=".5" />
        <rect x="14" y="4" width="24" height="22" fill={T.sand} {...st} /><rect x="14" y="4" width="24" height="22" fill="url(#vt-hatch-fine)" />
        <path d="M20 12 h12" {...thin} />
      </g>
    </svg>
  )
}

export function Containers() {
  const box = (x, y, w, c, k) => (
    <g key={k}>
      <rect x={x} y={y} width={w} height="22" fill={c} {...st} />
      {[...Array(Math.floor(w / 6))].map((_, i) => <path key={i} d={`M${x + 4 + i * 6} ${y + 3} v16`} {...thin} opacity=".35" />)}
    </g>
  )
  return (
    <svg viewBox="0 0 120 70" className="w-full h-auto overflow-visible">
      <g filter="url(#vt-sketch)">
        <ellipse cx="60" cy="69" rx="58" ry="2.5" fill="url(#vt-hatch)" opacity=".7" />
        {box(2, 46, 58, T.rust, 'a')}{box(60, 46, 58, T.slate, 'b')}{box(28, 24, 60, T.sage, 'c')}
        <rect x="28" y="24" width="60" height="22" fill="url(#vt-hatch-fine)" />
      </g>
    </svg>
  )
}

export function Truck({ puff = true }) {
  return (
    <svg viewBox="0 0 170 78" className="w-full h-auto overflow-visible">
      {puff && (
        <g aria-hidden="true">
          {[0, 1, 2].map(i => <circle key={i} className="vt-puff" style={{ animationDelay: `${i * 0.9}s` }} cx="166" cy="56" r="4" fill="oklch(0.9 0.004 84)" stroke={INK} strokeWidth=".8" opacity="0" />)}
        </g>
      )}
      <g filter="url(#vt-sketch)">
        <ellipse cx="85" cy="76" rx="82" ry="2.6" fill="url(#vt-hatch)" opacity=".75" />
        <rect x="2" y="10" width="118" height="52" rx="2" fill={T.cream} {...st} />
        {[...Array(9)].map((_, i) => <path key={i} d={`M${14 + i * 12} 14 v44`} {...thin} opacity=".35" />)}
        <rect x="2" y="50" width="118" height="12" fill="url(#vt-hatch-fine)" />
        <text x="61" y="38" textAnchor="middle" fontFamily="Switzer, sans-serif" fontSize="11" fontWeight="500" fill={INK} opacity=".7">VETTED 3PL</text>
        <path d="M124 62 V30 q0-6 6-6 h18 l14 18 v20 z" fill={T.rust} {...st} />
        <path d="M132 30 h14 l9 12 h-23 z" fill={T.cream} {...st} />
        <path d="M120 62 h46" {...st} />
        <path d="M162 60 h6 v-3" fill="none" {...st} />
        {[24, 98, 148].map(cx => (
          <g key={cx}>
            <circle cx={cx} cy="64" r="10" fill={PAPER} {...st} /><circle cx={cx} cy="64" r="3" fill={INK} opacity=".7" />
            <path d={`M${cx - 7} 64 h14 M${cx} 57 v14`} {...thin} opacity=".5" />
          </g>
        ))}
      </g>
    </svg>
  )
}

export function Forklift() {
  return (
    <svg viewBox="0 0 90 80" className="w-full h-auto overflow-visible">
      <g filter="url(#vt-sketch)">
        <ellipse cx="45" cy="78" rx="42" ry="2.4" fill="url(#vt-hatch)" opacity=".7" />
        <path d="M8 22 V72 M14 22 V72" {...st} />
        <g className="vt-lift">
          <path d="M14 66 H-2 M14 60 H-2" {...st} />
          <rect x="-4" y="40" width="18" height="18" fill={T.sand} {...st} /><path d="M-4 49 h18" {...thin} opacity=".5" />
        </g>
        <path d="M16 70 V40 h30 l12 -18 h12 V70 Z" fill={T.ochre} {...st} />
        <path d="M46 40 l12 -18" {...thin} />
        <rect x="60" y="48" width="18" height="22" fill="url(#vt-hatch)" />
        <circle cx="28" cy="70" r="8" fill={PAPER} {...st} /><circle cx="64" cy="70" r="8" fill={PAPER} {...st} />
        <circle cx="28" cy="70" r="2.5" fill={INK} opacity=".7" /><circle cx="64" cy="70" r="2.5" fill={INK} opacity=".7" />
        <circle cx="52" cy="30" r="5" fill={T.sand} {...st} />
      </g>
    </svg>
  )
}

export function Crane() {
  return (
    <svg viewBox="0 0 120 190" className="w-full h-auto overflow-visible">
      <g filter="url(#vt-sketch)">
        <ellipse cx="30" cy="188" rx="26" ry="2.4" fill="url(#vt-hatch)" opacity=".7" />
        <path d="M20 188 V20 M40 188 V20" {...st} />
        {[...Array(14)].map((_, i) => <path key={i} d={`M20 ${188 - i * 12} L40 ${176 - i * 12}`} {...thin} opacity=".55" />)}
        <path d="M10 20 H118 M10 30 H118" {...st} />
        {[...Array(9)].map((_, i) => <path key={i} d={`M${14 + i * 12} 30 L${20 + i * 12} 20`} {...thin} opacity=".55" />)}
        <rect x="2" y="12" width="16" height="22" fill={T.rust} {...st} />
        <rect x="24" y="34" width="14" height="12" fill={T.cream} {...st} />
      </g>
      <g className="vt-swing" style={{ transformOrigin: '100px 30px' }} filter="url(#vt-sketch)">
        <path d="M100 30 V86" {...thin} />
        <path d="M96 86 h8 v4 q0 6 -4 6" fill="none" {...st} />
        <rect x="84" y="96" width="32" height="20" fill={T.slate} {...st} />
        {[...Array(5)].map((_, i) => <path key={i} d={`M${89 + i * 6} 99 v14`} {...thin} opacity=".4" />)}
      </g>
    </svg>
  )
}

export function Bollard() {
  return (
    <svg viewBox="0 0 30 34" className="w-full h-auto overflow-visible">
      <g filter="url(#vt-sketch)">
        <path d="M6 32 V14 q0-8 9-8 q9 0 9 8 V32 Z" fill={T.stone} {...st} /><path d="M3 12 h24" {...st} />
        <path d="M6 22 h18" fill="none" {...thin} opacity=".5" />
      </g>
    </svg>
  )
}

export function Parcel() {
  return (
    <svg viewBox="0 0 26 24" className="w-full h-auto overflow-visible">
      <g filter="url(#vt-sketch)"><rect x="2" y="4" width="22" height="18" fill={T.sand} {...st} /><path d="M2 10 h22 M13 4 v6" {...thin} /></g>
    </svg>
  )
}

export function Trolley() {
  return (
    <svg viewBox="0 0 34 60" className="w-full h-auto overflow-visible">
      <g filter="url(#vt-sketch)">
        <path d="M4 2 L10 52 H30" fill="none" {...st} />
        <rect x="11" y="30" width="18" height="20" fill={T.sand} {...st} /><rect x="13" y="14" width="15" height="16" fill={T.cream} {...st} />
        <circle cx="12" cy="54" r="5" fill={PAPER} {...st} />
      </g>
    </svg>
  )
}

export function Gull() {
  return (
    <svg viewBox="0 0 44 18" className="w-full h-auto overflow-visible">
      <g filter="url(#vt-sketch)">
        <path className="vt-wing" style={{ transformBox: 'view-box', transformOrigin: '21px 9px' }} d="M2 8 Q12 0 21 9 Q30 0 42 6" fill="none" {...st} strokeWidth="1.8" />
        <ellipse cx="21" cy="10" rx="5" ry="2.6" fill={PAPER} {...st} />
        <path d="M25 10 l4 1" {...st} stroke={T.ochre} strokeWidth="2" />
      </g>
    </svg>
  )
}

/* ---------- the quay ---------- */
export function Quay() {
  return (
    <svg viewBox="0 0 1440 70" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-full h-[70px]" aria-hidden="true">
      <g filter="url(#vt-sketch)">
        {/* back edge where things stand */}
        <path d="M0 4 H1440" {...st} />
        {/* paved walkway: the front lane people walk along */}
        <rect x="0" y="4" width="1440" height="16" fill={T.cream} />
        {[...Array(60)].map((_, i) => <path key={'p' + i} d={`M${i * 24 + (i % 2) * 8} 7 l-3 11`} {...thin} opacity=".22" />)}
        <path d="M0 20 H1440" {...st} />
        {/* stone quay wall */}
        <rect x="0" y="20" width="1440" height="20" fill={T.stone} />
        {[...Array(48)].map((_, i) => <path key={i} d={`M${i * 30 + (i % 2) * 12} 20 v20`} {...thin} opacity=".35" />)}
        <path d="M0 30 H1440" {...thin} opacity=".3" />
        <rect x="0" y="30" width="1440" height="10" fill="url(#vt-hatch)" />
        <path d="M0 40 H1440" {...st} />
        {[...Array(30)].map((_, i) => <path key={'w' + i} d={`M${i * 52 + (i % 3) * 9} ${49 + (i % 3) * 7} q8 -3 16 0 t16 0`} fill="none" {...thin} opacity=".35" />)}
      </g>
    </svg>
  )
}

export function Warehouse() {
  return (
    <svg viewBox="0 0 150 110" className="w-full h-auto overflow-visible">
      <g filter="url(#vt-sketch)">
        <ellipse cx="75" cy="108" rx="72" ry="2.6" fill="url(#vt-hatch)" opacity=".7" />
        <path d="M4 108 V44 L75 10 L146 44 V108 Z" fill={T.stone} {...st} />
        <path d="M4 44 L75 10 L146 44" fill="none" {...st} />
        <path d="M4 44 L75 10 L146 44 L146 52 L75 18 L4 52 Z" fill="url(#vt-hatch)" />
        <rect x="40" y="58" width="70" height="50" fill={T.cream} {...st} />
        {[...Array(6)].map((_, i) => <path key={i} d={`M40 ${66 + i * 7} h70`} {...thin} opacity=".45" />)}
        <rect x="14" y="62" width="16" height="14" fill={T.sand} {...st} /><rect x="120" y="62" width="16" height="14" fill={T.sand} {...st} />
        <text x="75" y="44" textAnchor="middle" fontFamily="Switzer, sans-serif" fontSize="10" fontWeight="500" fill={INK} opacity=".65">BAY 03</text>
      </g>
    </svg>
  )
}

/**
 * A quayside scene. sprites: [{el, x (% of stage), w (px at a 1440 stage), cls}]
 * walkers / flyers: [{el, w, dur, delay, top, rtl}]
 */
export function Scene({ sprites = [], walkers = [], flyers = [], height = 'h-[250px] md:h-[290px]', className = '', children }) {
  return (
    <div className={`vt-frieze relative ${height} select-none ${className}`} aria-hidden="true">
      <Defs />
      <Quay />
      <div className="vt-stage">
        {sprites.map((s, i) => (
          <div key={i} className="vt-sprite" style={{ left: `${s.x}%`, width: `${(s.w / 14.4).toFixed(3)}%`, transition: s.move ? 'left 1.1s cubic-bezier(.4,0,.2,1)' : undefined, ...(s.style || {}) }}>
            <div className={`vt-inner ${s.cls || ''}`}>{s.el}</div>
          </div>
        ))}
        {walkers.map((w, i) => (
          <div key={'w' + i} className={`vt-sprite vt-walker ${w.rtl ? 'vt-rtl' : ''}`} style={{ '--dur': w.dur || '50s', '--delay': w.delay || '-10s', width: `${(w.w / 14.4).toFixed(3)}%` }}>
            <div className="vt-inner vt-step"><div className={w.rtl ? 'vt-mirror' : undefined}>{w.el}</div></div>
          </div>
        ))}
        {flyers.map((f, i) => (
          <div key={'f' + i} className="vt-sprite vt-flyer" style={{ top: f.top || '10%', '--dur': f.dur || '50s', '--delay': f.delay || '-12s', width: `${(f.w / 14.4).toFixed(3)}%` }}>
            <div className="vt-inner vt-glide" style={{ animationDelay: f.glideDelay || '0s' }}><Gull /></div>
          </div>
        ))}
        {children}
      </div>
    </div>
  )
}

export const TONES = T

/* Sprite placement: x is % of the stage width, w is px at 1440 (scaled by the stage). */
const SPRITES = [
  { el: <Crane />, x: 1.5, w: 118 },
  { el: <Person coat={T.ochre} hat="hard" prop="clipboard" />, x: 11, w: 46 },
  { el: <Containers />, x: 15.5, w: 150 },
  { el: <Person coat={T.slate} hat="cap" prop="papers" flip />, x: 27.5, w: 46 },
  { el: <Person coat={T.rust} hat="bun" prop="papers" />, x: 30.6, w: 46 },
  { el: <Bollard />, x: 35, w: 26 },
  { el: <Forklift />, x: 39, w: 100 },
  { el: <Parcel />, x: 47.4, w: 24, cls: 'vt-hop' },
  { el: <Truck />, x: 52, w: 210 },
  { el: <Person coat={T.sage} hat="hair" prop="magnifier" />, x: 67.5, w: 52 },
  { el: <Crates />, x: 71.6, w: 86 },
  { el: <Person coat={T.denim} trousers={T.slate} hat="hard" prop="box" />, x: 79, w: 46 },
  { el: <Person coat={T.olive} hat="hair" prop="wave" />, x: 85, w: 46 },
  { el: <Bollard />, x: 89.4, w: 26 },
  { el: <Containers />, x: 92, w: 130 },
]

export default function Frieze({ className = '' }) {
  return (
    <div className={`vt-frieze relative h-[clamp(170px,26vh,290px)] select-none ${className}`} aria-hidden="true">
      <Defs />
      <Quay />
      <div className="vt-stage">
        {SPRITES.map((s, i) => (
          <div key={i} className="vt-sprite" style={{ left: `${s.x}%`, width: `${(s.w / 14.4).toFixed(3)}%` }}>
            <div className={`vt-inner ${s.cls || ''}`}>{s.el}</div>
          </div>
        ))}
        {/* walkers cross the quay in the front lane */}
        <div className="vt-sprite vt-walker" style={{ '--dur': '46s', '--delay': '-14s', width: '5.278%' }}>
          <div className="vt-inner vt-step flex items-end"><div className="w-[60%]"><Person coat={T.rust} trousers={T.slate} hat="cap" pose="walk" prop="trolley" /></div><div className="w-[40%] -ml-[6%]"><Trolley /></div></div>
        </div>
        <div className="vt-sprite vt-walker vt-rtl" style={{ '--dur': '58s', '--delay': '-40s', width: '3.194%' }}>
          <div className="vt-inner vt-step"><div className="vt-mirror"><Person coat={T.sage} hat="hard" pose="walk" prop="box" /></div></div>
        </div>
        <div className="vt-sprite vt-walker" style={{ '--dur': '70s', '--delay': '-55s', width: '3.194%' }}>
          <div className="vt-inner vt-step"><Person coat={T.slate} hat="hair" pose="walk" /></div>
        </div>
        {/* gulls */}
        <div className="vt-sprite vt-flyer" style={{ top: '8%', '--dur': '48s', '--delay': '-20s', width: '3.056%' }}>
          <div className="vt-inner vt-glide"><Gull /></div>
        </div>
        <div className="vt-sprite vt-flyer" style={{ top: '22%', '--dur': '64s', '--delay': '-5s', width: '2.222%' }}>
          <div className="vt-inner vt-glide" style={{ animationDelay: '-1.3s' }}><Gull /></div>
        </div>
      </div>
    </div>
  )
}
