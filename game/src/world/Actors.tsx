// Подвижное: УАЗы бригад едут по дорогам, рабочие на участке, пожары с дымом.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TRUCK_SPEED, clock, siteById, useGame, world, type Mission } from '../game/store'
import { pointAlong, polylineLength, type V2 } from '../lib/math'
import { plantProgress, plantSpotsFor } from './planting'
import { roadY } from './Roads'

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
  useFrame(({ clock: c }) => {
    if (!ref.current) return
    const t = c.elapsedTime * 3 + phase
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
        <mesh position={[0, 0.83, 0]}>
          <cylinderGeometry args={[0.12, 0.13, 0.06, 6]} />
          <meshStandardMaterial color="#2f6b4a" />
        </mesh>
      </group>
    </group>
  )
}

function Truck({ mission }: { mission: Mission }) {
  const group = useRef<THREE.Group>(null)
  const beacon = useRef<THREE.MeshStandardMaterial>(null)
  const workers = useRef<THREE.Group>(null)
  const L = useMemo(() => polylineLength(mission.path), [mission.path])
  const end = mission.path[mission.path.length - 1]!

  useFrame(({ clock: c }) => {
    const g = group.current
    if (!g) return
    const now = clock.minutes
    let s: number
    let working = false
    if (now < mission.arriveAt) s = Math.min(L, (now - mission.departAt) * TRUCK_SPEED)
    else if (now < mission.workEnd) {
      s = L - 1.6
      working = true
    } else s = Math.max(0, L - (now - mission.workEnd) * TRUCK_SPEED)
    const { p, dir } = pointAlong(mission.path, Math.max(0, s))
    const back = now >= mission.workEnd
    g.position.set(p[0], roadY(p[0], p[1]), p[1])
    const d = back ? [-dir[0], -dir[1]] : dir
    const target = Math.atan2(-d[1]!, d[0]!)
    g.rotation.y += Math.atan2(Math.sin(target - g.rotation.y), Math.cos(target - g.rotation.y)) * 0.25
    if (beacon.current) beacon.current.emissiveIntensity = working ? 0.3 : 1 + Math.sin(c.elapsedTime * 10) * 0.9
    const w = workers.current
    if (!w) return
    w.visible = working && mission.kind !== 'fire'
    if (!w.visible) return
    // при посадке бригада идёт фронтом по рядам
    let at: V2 = end
    if (mission.kind === 'planting' && mission.siteId) {
      const site = siteById(mission.siteId)
      const st = useGame.getState().sites[mission.siteId]
      const spots = plantSpotsFor(site, st?.chosen === 'combined')
      if (spots.length > 0) at = spots[Math.min(spots.length - 1, Math.floor(spots.length * plantProgress(now, st?.plantStart, st?.plantEnd)))]!
    }
    w.position.set(at[0], world.heightAt(at[0], at[1]), at[1])
  })

  const plant = mission.kind === 'planting'
  return (
    <>
      <group ref={group} scale={1.25}>
        <Uaz beacon={beacon} />
      </group>
      <group ref={workers} position={[end[0], world.heightAt(end[0], end[1]), end[1]]} visible={false} scale={1.5}>
        <Worker offset={[0.8, 0.6]} phase={0} plant={plant} />
        <Worker offset={[-0.7, 1.1]} phase={1.3} plant={plant} />
        <Worker offset={[0.2, -1.0]} phase={2.4} plant={plant} />
      </group>
    </>
  )
}

export function Trucks() {
  const missions = useGame((s) => s.missions)
  return (
    <group>
      {missions.map((m) => (
        <Truck key={m.id} mission={m} />
      ))}
    </group>
  )
}

const flameGeom = new THREE.ConeGeometry(0.5, 1.6, 5).translate(0, 0.8, 0)
const smokeGeom = new THREE.IcosahedronGeometry(0.8, 0)
const SMOKE_PUFFS = 12

function FireFx({ pos }: { pos: V2 }) {
  const flames = useRef<THREE.Group>(null)
  const smoke = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const y = world.heightAt(pos[0], pos[1])
  const layout = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const r = 0.4 + (i % 4) * 0.65
        return { x: Math.cos(i * 2.4) * r, z: Math.sin(i * 2.4) * r, s: 1.1 - (i % 4) * 0.18 }
      }),
    [],
  )
  useFrame(({ clock: c }) => {
    const t = c.elapsedTime
    flames.current?.children.forEach((f, i) => {
      const k = 0.7 + Math.abs(Math.sin(t * 7 + i * 1.7)) * 0.6
      f.scale.set(layout[i]!.s, layout[i]!.s * k * 1.5, layout[i]!.s)
    })
    // дым: клубы поднимаются, растут и сносятся ветром
    smoke.current?.children.forEach((sm, i) => {
      const life = (t * 0.22 + i / SMOKE_PUFFS) % 1
      sm.position.set(Math.sin(i * 3.1) * 0.9 + life * 4.5, 1.5 + life * 10, Math.cos(i * 2.3) * 0.9 - life * 2)
      sm.scale.setScalar(0.9 + life * 3.2)
      ;((sm as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.8 * Math.min(1, life * 6) * (1 - life)
    })
    if (light.current) light.current.intensity = 40 + Math.sin(t * 13) * 14
  })
  return (
    <group position={[pos[0], y, pos[1]]}>
      {/* выжженная земля */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.12}>
        <circleGeometry args={[3.6, 10]} />
        <meshStandardMaterial color="#2a2522" transparent opacity={0.75} depthWrite={false} />
      </mesh>
      <group ref={flames}>
        {layout.map((l, i) => (
          <mesh key={i} geometry={flameGeom} position={[l.x, 0, l.z]}>
            <meshStandardMaterial color={i % 2 ? '#ffb02e' : '#ff5a1f'} emissive={i % 2 ? '#ff9a1e' : '#ff3d0a'} emissiveIntensity={2.4} flatShading />
          </mesh>
        ))}
      </group>
      <group ref={smoke}>
        {Array.from({ length: SMOKE_PUFFS }, (_, i) => (
          <mesh key={i} geometry={smokeGeom}>
            <meshStandardMaterial color={i % 3 ? '#8f8a83' : '#6d6862'} transparent opacity={0.6} depthWrite={false} flatShading />
          </mesh>
        ))}
      </group>
      <pointLight ref={light} position={[0, 2, 0]} color="#ff7a2a" distance={14} decay={1.5} />
    </group>
  )
}

export function Fires() {
  const fires = useGame((s) => s.fires)
  return (
    <group>
      {fires.map((f) => (
        <FireFx key={f.id} pos={f.pos} />
      ))}
    </group>
  )
}
