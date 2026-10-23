// УАЗы бригад по реальным дорогам (маршрут Дейкстрой по графу OSM) и рабочие на фронте посадки.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Area } from '../data/build'
import { pointAlong, polylineLength, type V2 } from '../lib/math'
import { TRUCK_UNITS_PER_MIN, sim, siteOf, useOps, type Mission } from '../ops/store'
import { plantSpots, progressOf } from './Sites'

function Uaz({ beacon }: { beacon: React.RefObject<THREE.MeshStandardMaterial | null> }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.5, 0.72, 0.78]} />
        <meshStandardMaterial color="#d6d9c9" flatShading />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[1.52, 0.14, 0.8]} />
        <meshStandardMaterial color="#2f6b4a" />
      </mesh>
      <mesh position={[0.55, 0.7, 0]}>
        <boxGeometry args={[0.42, 0.26, 0.8]} />
        <meshStandardMaterial color="#26343a" />
      </mesh>
      {[[-0.45, 0.42], [0.45, 0.42], [-0.45, -0.42], [0.45, -0.42]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x!, 0.2, z!]} rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.14, 8]} />
          <meshStandardMaterial color="#1d1f1e" />
        </mesh>
      ))}
      <mesh position={[0.25, 0.97, 0]}>
        <boxGeometry args={[0.18, 0.12, 0.18]} />
        <meshStandardMaterial ref={beacon} color="#ff9a2e" emissive="#ff8a1e" emissiveIntensity={1.5} />
      </mesh>
    </group>
  )
}

function Worker({ offset, phase, plant }: { offset: [number, number]; phase: number; plant: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 3 + phase
    ref.current.position.y = plant ? Math.max(0, Math.sin(t)) * 0.12 : Math.abs(Math.sin(t)) * 0.05
    ref.current.rotation.z = plant ? Math.sin(t) * 0.35 : 0
  })
  return (
    <group position={[offset[0], 0, offset[1]]}>
      <group ref={ref}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <capsuleGeometry args={[0.13, 0.35, 3, 6]} />
          <meshStandardMaterial color="#f07c1e" />
        </mesh>
        <mesh position={[0, 0.72, 0]} castShadow>
          <sphereGeometry args={[0.11, 6, 5]} />
          <meshStandardMaterial color="#e8c3a0" />
        </mesh>
      </group>
    </group>
  )
}

function Truck({ area, mission }: { area: Area; mission: Mission }) {
  const group = useRef<THREE.Group>(null)
  const beacon = useRef<THREE.MeshStandardMaterial>(null)
  const workers = useRef<THREE.Group>(null)
  const L = useMemo(() => polylineLength(mission.path), [mission.path])
  const end = mission.path[mission.path.length - 1]!

  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const now = sim.minutes
    let s: number
    let working = false
    if (now < mission.arriveAt) s = Math.min(L, (now - mission.departAt) * TRUCK_UNITS_PER_MIN)
    else if (now < mission.workEnd) {
      s = L - 1.4
      working = true
    } else s = Math.max(0, L - (now - mission.workEnd) * TRUCK_UNITS_PER_MIN)
    const { p, dir } = pointAlong(mission.path, Math.max(0, s))
    const back = now >= mission.workEnd
    g.position.set(p[0], area.groundAt(p[0], p[1]) + 0.08, p[1])
    const d = back ? [-dir[0], -dir[1]] : dir
    const target = Math.atan2(-d[1]!, d[0]!)
    g.rotation.y += Math.atan2(Math.sin(target - g.rotation.y), Math.cos(target - g.rotation.y)) * 0.25
    if (beacon.current) beacon.current.emissiveIntensity = working ? 0.3 : 1 + Math.sin(clock.elapsedTime * 10) * 0.9
    const w = workers.current
    if (!w) return
    w.visible = working
    if (!working) return
    let at: V2 = end
    if (mission.task === 'planting') {
      const site = siteOf(mission.siteId)
      const st = useOps.getState().sites[mission.siteId]
      if (site && st) {
        const spots = plantSpots(site, st.chosen === 'combined')
        if (spots.length) at = spots[Math.min(spots.length - 1, Math.floor(spots.length * progressOf(now, st.plantStart, st.plantEnd)))]!
      }
    }
    w.position.set(at[0], area.heightAt(at[0], at[1]), at[1])
  })

  const plant = mission.task === 'planting'
  return (
    <>
      <group ref={group} scale={1.25}>
        <Uaz beacon={beacon} />
      </group>
      <group ref={workers} visible={false} scale={1.5}>
        <Worker offset={[0.8, 0.6]} phase={0} plant={plant} />
        <Worker offset={[-0.7, 1.1]} phase={1.3} plant={plant} />
        <Worker offset={[0.2, -1.0]} phase={2.4} plant={plant} />
      </group>
    </>
  )
}

export function Trucks({ area }: { area: Area }) {
  const missions = useOps((s) => s.missions)
  return (
    <group>
      {missions.map((m) => (
        <Truck key={m.id} area={area} mission={m} />
      ))}
    </group>
  )
}
