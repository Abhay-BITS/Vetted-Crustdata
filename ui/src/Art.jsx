/* Original line art for Vetted: a quayside convoy of carriers, drawn in quiet grey strokes. */
const S = { stroke: 'oklch(0.45 0.005 84)', strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
const F = 'oklch(0.94 0.006 84)'

function Truck({ x, w = 120, tall = 46 }) {
  const cab = 34
  return (
    <g transform={`translate(${x},0)`}>
      <rect x="0" y={78 - tall} width={w} height={tall} rx="3" fill={F} {...S} />
      {[...Array(Math.floor(w / 24))].map((_, i) => <path key={i} {...S} d={`M${12 + i * 24} ${82 - tall} v${tall - 8}`} opacity=".45" />)}
      <path {...S} fill={F} d={`M${w + 4} 78 V54 q0-6 6-6 h${cab - 12} l10 14 v16 z`} />
      <path {...S} d={`M${w + 12} 52 h${cab - 18} l7 10 h-${cab - 11} z`} />
      <circle cx="22" cy="82" r="8" fill="oklch(0.982 0.002 84.559)" {...S} /><circle cx="22" cy="82" r="2.5" {...S} />
      <circle cx={w - 6} cy="82" r="8" fill="oklch(0.982 0.002 84.559)" {...S} /><circle cx={w - 6} cy="82" r="2.5" {...S} />
      <circle cx={w + cab - 4} cy="82" r="8" fill="oklch(0.982 0.002 84.559)" {...S} /><circle cx={w + cab - 4} cy="82" r="2.5" {...S} />
    </g>
  )
}

function Warehouse({ x }) {
  return (
    <g transform={`translate(${x},0)`}>
      <path {...S} fill={F} d="M0 90 V44 L50 22 L100 44 V90" />
      <path {...S} d="M28 90 V58 h44 v32 M28 66 h44 M28 74 h44 M28 82 h44" opacity=".6" />
      <path {...S} d="M38 40 h24" />
    </g>
  )
}

function Crates({ x }) {
  return (
    <g transform={`translate(${x},0)`}>
      <rect x="0" y="66" width="24" height="24" rx="2" fill={F} {...S} /><path {...S} d="M0 66 l24 24 M24 66 l-24 24" opacity=".35" />
      <rect x="26" y="70" width="20" height="20" rx="2" fill={F} {...S} />
      <rect x="10" y="44" width="22" height="22" rx="2" fill={F} {...S} />
    </g>
  )
}

function Scale({ x }) {
  return (
    <g transform={`translate(${x},0)`}>
      <path {...S} d="M30 90 V38 M14 90 h32 M8 46 h44" />
      <path {...S} d="M8 46 l-7 18 h14 z M52 46 l-7 18 h14 z" fill={F} />
      <circle cx="30" cy="36" r="3" {...S} fill={F} />
    </g>
  )
}

function Lamp({ x }) {
  return <g transform={`translate(${x},0)`}><path {...S} d="M6 90 V20 q0-8 10-8 h8" /><path {...S} fill={F} d="M22 10 h12 l-3 7 h-6 z" /></g>
}

function Row() {
  return (
    <g>
      <Warehouse x={20} /><Truck x={150} /><Crates x={330} /><Lamp x={400} /><Truck x={450} w={150} tall={52} />
      <Scale x={680} /><Truck x={770} w={96} tall={40} /><Warehouse x={940} /><Crates x={1060} /><Truck x={1130} w={130} />
      <Lamp x={1310} />
    </g>
  )
}

export function Convoy() {
  return (
    <div aria-hidden="true" className="relative overflow-hidden select-none pointer-events-none">
      <div className="drive flex w-[2880px]">
        {[0, 1].map(i => (
          <svg key={i} viewBox="0 0 1440 120" width="1440" height="120" className="shrink-0">
            <Row />
            <path {...S} d="M0 92 H1440" />
            {[...Array(36)].map((_, k) => <path key={k} {...S} opacity=".35" d={`M${k * 40 + 8} 102 h20`} />)}
            {[...Array(18)].map((_, k) => <path key={'w' + k} {...S} opacity=".2" d={`M${k * 80 + 30} 112 q10 -4 20 0 t20 0`} />)}
          </svg>
        ))}
      </div>
    </div>
  )
}

export function Ship({ className = '' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 160 70" className={`bob ${className}`}>
      <path {...S} fill={F} d="M8 44 h144 l-14 18 H22 z" />
      {[0, 1, 2, 3, 4].map(i => <rect key={i} x={30 + i * 20} y="28" width="18" height="16" rx="1.5" fill={F} {...S} />)}
      {[0, 1, 2].map(i => <rect key={'t' + i} x={40 + i * 20} y="14" width="18" height="14" rx="1.5" fill={F} {...S} />)}
      <path {...S} d="M128 44 V20 h12 v24 M131 26 h6 M131 32 h6" />
    </svg>
  )
}

export function Mark({ size = 20 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M9 8v16M12 7v18M15 6.5v19M18 7v18M21 8v16M24 10v12" /></g>
      <path d="M10 16.5l4 4 8-9" fill="none" stroke="oklch(0.992 0.001 84.559)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 16.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
