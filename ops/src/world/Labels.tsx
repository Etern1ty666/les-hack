// Подписи населённых пунктов, маркер лесничества и метки лесосек по статусу.
import { Html } from '@react-three/drei'
import { ClipboardCheck, HelpCircle, Satellite, Sprout, TreePine, Truck } from 'lucide-react'
import type { Area } from '../data/build'
import { useOps, type SiteStatus } from '../ops/store'

const PIN: Record<SiteStatus, { color: string; Icon: typeof Truck }> = {
  detected: { color: '#55606a', Icon: Satellite },
  inspection: { color: '#2e6b57', Icon: Truck },
  decision: { color: '#b8862a', Icon: HelpCircle },
  planned: { color: '#8a6d2a', Icon: ClipboardCheck },
  planting: { color: '#5d7a2e', Icon: Sprout },
  natural: { color: '#3f9a5b', Icon: TreePine },
  restored: { color: '#3f9a5b', Icon: TreePine },
}

function SitePin({ area, siteId }: { area: Area; siteId: string }) {
  const site = area.sites.find((s) => s.id === siteId)!
  const status = useOps((s) => s.sites[siteId]?.status ?? 'detected')
  const selected = useOps((s) => s.selectedSiteId === siteId)
  const select = useOps((s) => s.select)
  const { color, Icon } = PIN[status]
  const y = Math.max(...site.poly.map(([x, z]) => area.heightAt(x, z))) + 3.2
  return (
    <Html position={[site.center[0], y, site.center[1]]} center zIndexRange={[30, 10]}>
      <button
        type="button"
        className={`pin${selected ? ' pin--selected' : ''}${status === 'decision' ? ' pin--attention' : ''}`}
        style={{ ['--pin' as string]: color }}
        onClick={() => select(siteId)}
        title={site.name}
      >
        <span className="pin__body">
          <Icon size={15} strokeWidth={2.4} />
          <span className="pin__num">{site.index}</span>
        </span>
      </button>
    </Html>
  )
}

export function Labels({ area }: { area: Area }) {
  const places = area.places.filter((p) => p.cls !== 'hamlet' && p.cls !== 'suburb')
  return (
    <group>
      {places.map((p) => (
        <Html key={p.name} position={[p.pos[0], area.groundAt(p.pos[0], p.pos[1]) + 1.2, p.pos[1]]} center zIndexRange={[8, 0]}>
          <div className={`place place--${p.cls}`}>{p.name}</div>
        </Html>
      ))}
      <Html position={[area.base.pos[0], area.groundAt(area.base.pos[0], area.base.pos[1]) + 3.4, area.base.pos[1]]} center zIndexRange={[9, 0]}>
        <div className="base-marker">
          <TreePine size={14} /> {area.base.name}
        </div>
      </Html>
      {area.sites.map((s) => (
        <SitePin key={s.id} area={area} siteId={s.id} />
      ))}
    </group>
  )
}
