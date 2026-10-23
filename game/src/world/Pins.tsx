// Метки над картой: заявки с таймерами (как в референсе) и маркеры статуса участков.
import { Html } from '@react-three/drei'
import { Axe, ClipboardCheck, Flame, HelpCircle, Sprout, TreePine, Truck } from 'lucide-react'
import { useMemo } from 'react'
import { fmtLeft, siteById, useGame, world, type Call } from '../game/store'
import { CALL_STYLE } from '../ui/theme'

const ICON = { inspection: ClipboardCheck, decision: HelpCircle, planting: Sprout, fire: Flame, illegal: Axe } as const

function CallPin({ call }: { call: Call }) {
  const now = useGame((s) => s.now)
  const selected = useGame((s) => s.selectedCallId === call.id)
  const selectCall = useGame((s) => s.selectCall)
  const p = call.siteId ? siteById(call.siteId).center : call.spot!
  const y = world.heightAt(p[0], p[1]) + 4.5
  const Icon = call.brigadeId ? Truck : ICON[call.type]
  const left = call.deadline !== null ? call.deadline - now : null
  const urgent = left !== null && left < 30 && !call.brigadeId
  return (
    <Html position={[p[0], y, p[1]]} center zIndexRange={[30, 10]}>
      <button
        type="button"
        className={`pin${selected ? ' pin--selected' : ''}${urgent ? ' pin--urgent' : ''}`}
        style={{ ['--pin' as string]: CALL_STYLE[call.type].color }}
        onClick={() => selectCall(call.id)}
      >
        <span className="pin__crown" />
        <span className="pin__body">
          {left !== null && !call.brigadeId ? <span className="pin__time">{fmtLeft(left)}</span> : <Icon size={22} strokeWidth={2.4} />}
        </span>
      </button>
    </Html>
  )
}

function SiteMarker({ siteId }: { siteId: string }) {
  const st = useGame((s) => s.sites[siteId])
  const select = useGame((s) => s.selectSite)
  const site = siteById(siteId)
  if (!st) return null
  const green = st.status === 'restored' || st.status === 'natural'
  const y = world.heightAt(site.center[0], site.center[1]) + 2.6
  return (
    <Html position={[site.center[0], y, site.center[1]]} center zIndexRange={[9, 0]}>
      <button type="button" className={`marker${green ? ' marker--green' : ''}`} onClick={() => select(siteId)} title={site.name}>
        {green ? <TreePine size={13} strokeWidth={2.6} /> : <Sprout size={13} strokeWidth={2.6} />}
      </button>
    </Html>
  )
}

export function Pins() {
  const calls = useGame((s) => s.calls)
  const sites = useGame((s) => s.sites)
  const markers = useMemo(() => {
    const withCall = new Set(calls.map((c) => c.siteId).filter(Boolean))
    return Object.entries(sites)
      .filter(([id, st]) => !withCall.has(id) && ['natural', 'awaiting_planting', 'planting', 'restored'].includes(st.status))
      .map(([id]) => id)
  }, [calls, sites])
  return (
    <group>
      {calls.map((c) => (
        <CallPin key={c.id} call={c} />
      ))}
      {markers.map((id) => (
        <SiteMarker key={id} siteId={id} />
      ))}
    </group>
  )
}
