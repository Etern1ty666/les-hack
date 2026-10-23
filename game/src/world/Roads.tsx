// Грунтовые дороги лентами по рельефу и мосты через реку.
import { useMemo } from 'react'
import * as THREE from 'three'
import { distToPolyline, type V2 } from '../lib/math'
import { world } from '../game/store'
import { WATER_Y } from './generate'

const HALF = 0.85
const BRIDGE_Y = WATER_Y + 0.6

export function roadY(x: number, z: number) {
  if (distToPolyline(x, z, world.river) < 3.8) return BRIDGE_Y
  return Math.max(world.heightAt(x, z), WATER_Y + 0.3) + 0.07
}

function ribbon(points: V2[]): THREE.BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  points.forEach((p, i) => {
    const q = points[Math.min(i + 1, points.length - 1)]!
    const o = points[Math.max(i - 1, 0)]!
    const dx = q[0] - o[0]
    const dz = q[1] - o[1]
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz = dx / len
    const y = roadY(p[0], p[1])
    pos.push(p[0] + nx * HALF, y, p[1] + nz * HALF, p[0] - nx * HALF, y, p[1] - nz * HALF)
    if (i < points.length - 1) {
      const k = i * 2
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function Roads() {
  const { geoms, bridges } = useMemo(() => {
    const geoms = world.roads.map((r) => ribbon(r.points))
    // мосты: точки дороги над руслом
    const bridges: { x: number; z: number; rot: number; len: number }[] = []
    for (const r of world.roads) {
      let start = -1
      r.points.forEach((p, i) => {
        const over = distToPolyline(p[0], p[1], world.river) < 3.8
        if (over && start < 0) start = i
        if ((!over || i === r.points.length - 1) && start >= 0) {
          const a = r.points[start]!
          const b = r.points[i]!
          bridges.push({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, rot: -Math.atan2(b[1] - a[1], b[0] - a[0]), len: Math.hypot(b[0] - a[0], b[1] - a[1]) + 1 })
          start = -1
        }
      })
    }
    return { geoms, bridges }
  }, [])

  return (
    <group>
      {geoms.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshStandardMaterial color="#b49a6a" roughness={1} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
      {bridges.map((b, i) => (
        <group key={i} position={[b.x, BRIDGE_Y - 0.05, b.z]} rotation-y={b.rot}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[b.len, 0.18, 2.1]} />
            <meshStandardMaterial color="#7a5a3a" roughness={1} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0.35, s * 1.02]} castShadow>
              <boxGeometry args={[b.len, 0.1, 0.1]} />
              <meshStandardMaterial color="#5b4129" />
            </mesh>
          ))}
          {[-0.35, 0, 0.35].map((f) => (
            <mesh key={f} position={[f * b.len, -0.7, 0]} castShadow>
              <boxGeometry args={[0.3, 1.4, 1.9]} />
              <meshStandardMaterial color="#6b5a48" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}
