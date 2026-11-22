import { Scene, Person, Crates, Containers, Truck, Forklift, Bollard, Parcel, Trolley, Warehouse, Crane, TONES as T } from './Frieze'

const H = 'h-[190px] md:h-[220px]'

const porter = { el: <div className="flex items-end"><div className="w-[60%]"><Person coat={T.rust} trousers={T.slate} hat="cap" pose="walk" prop="trolley" /></div><div className="w-[40%] -ml-[6%]"><Trolley /></div></div>, w: 76, dur: '44s', delay: '-18s' }
const boxCarrier = { el: <Person coat={T.sage} hat="hard" pose="walk" prop="box" flip />, w: 46, dur: '56s', delay: '-30s', rtl: true }
const gulls = [{ w: 40, top: '6%', dur: '46s', delay: '-22s' }, { w: 28, top: '20%', dur: '62s', delay: '-8s', glideDelay: '-1.2s' }]

export function ApprovalsScene() {
  return (
    <Scene height={H} walkers={[boxCarrier]} flyers={gulls} sprites={[
      { el: <Crates />, x: 6, w: 86 },
      { el: <Person coat={T.ochre} hat="hard" prop="clipboard" />, x: 16, w: 46 },
      { el: <Bollard />, x: 24, w: 26 },
      { el: <Person coat={T.slate} hat="cap" prop="papers" flip />, x: 40, w: 46 },
      { el: <Person coat={T.rust} hat="bun" prop="papers" />, x: 43.2, w: 46 },
      { el: <Parcel />, x: 50, w: 24, cls: 'vt-hop' },
      { el: <Person coat={T.sage} hat="hair" prop="magnifier" />, x: 62, w: 52 },
      { el: <Containers />, x: 70, w: 140 },
      { el: <Person coat={T.olive} hat="hair" prop="wave" />, x: 85, w: 46 },
      { el: <Crates />, x: 90, w: 80 },
    ]} />
  )
}

export function ChecksScene() {
  return (
    <Scene height={H} flyers={gulls} walkers={[
      { el: <Truck />, w: 200, dur: '38s', delay: '-6s' },
      porter,
    ]} sprites={[
      { el: <Crane />, x: 2, w: 110 },
      { el: <Containers />, x: 14, w: 150 },
      { el: <Forklift />, x: 30, w: 96 },
      { el: <Parcel />, x: 37, w: 24, cls: 'vt-hop' },
      { el: <Person coat={T.ochre} hat="hard" prop="clipboard" />, x: 46, w: 46 },
      { el: <Crates />, x: 58, w: 86 },
      { el: <Bollard />, x: 68, w: 26 },
      { el: <Containers />, x: 76, w: 130 },
      { el: <Person coat={T.denim} trousers={T.slate} hat="hard" prop="box" />, x: 90, w: 46 },
    ]} />
  )
}

export function VendorsScene() {
  return (
    <Scene height={H} flyers={gulls} walkers={[{ el: <Truck />, w: 200, dur: '42s', delay: '-26s', rtl: true }, porter]} sprites={[
      { el: <Warehouse />, x: 3, w: 160 },
      { el: <Person coat={T.ochre} hat="hard" prop="clipboard" />, x: 15.5, w: 46 },
      { el: <Crates />, x: 21, w: 86 },
      { el: <Forklift />, x: 33, w: 96, cls: 'vt-hop-slow' },
      { el: <Warehouse />, x: 50, w: 150 },
      { el: <Person coat={T.slate} hat="cap" prop="wave" />, x: 62, w: 46 },
      { el: <Containers />, x: 70, w: 140 },
      { el: <Bollard />, x: 82, w: 26 },
      { el: <Warehouse />, x: 86, w: 140 },
    ]} />
  )
}

/** The run page: the truck drives along the quay as the steps finish. */
export function RunScene({ progress = 0, running = true, decision = null }) {
  const x = 13 + Math.min(1, Math.max(0, progress)) * 50
  return (
    <Scene height="h-[170px] md:h-[200px]" walkers={running ? [porter] : []} flyers={running ? gulls : gulls.slice(0, 1)} sprites={[
      { el: <Warehouse />, x: 0, w: 150 },
      { el: <Truck />, x, w: 200, move: true },
      { el: <Crates />, x: 80, w: 80 },
      { el: <Person coat={T.sage} hat="hair" prop={running ? 'magnifier' : decision === 'CLEARED' ? 'wave' : 'clipboard'} flip />, x: 88, w: 52 },
      ...(decision === 'CLEARED' ? [{ el: <Parcel />, x: 94.5, w: 24, cls: 'vt-hop' }] : []),
    ]} />
  )
}
