// Лесосеки на реальных вырубках: пни, подрост, посадка рядами с бороздами, контуры по статусу, клик.
import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Area, Site } from '../data/build'
import type { V2 } from '../lib/math'
import { sim, useOps, type SiteStatus } from '../ops/store'

export const STATUS_COLOR: Record<SiteStatus, string> = {
  detected: '#f1ead4',
  inspection: '#ffffff',
  decision: '#f2b33d',
  planned: '#f2b33d',
  planting: '#9fe07a',
  natural: '#5fd08a',
  restored: '#5fd08a',
}

const stumpGeom = new THREE.CylinderGeometry(0.2, 0.24, 0.3, 6).translate(0, 0.15, 0)
const saplingGeom = new THREE.ConeGeometry(0.3, 0.8, 5).translate(0, 0.4, 0)
const birchGeom = new THREE.IcosahedronGeometry(0.3, 0).scale(1, 1.3, 1).translate(0, 0.45, 0)
const plantGeom = new THREE.ConeGeometry(0.22, 0.65, 5).translate(0, 0.32, 0)
const furrowGeom = new THREE.BoxGeometry(0.72, 0.07, 0.3)

function instanced(geom: THREE.BufferGeometry, color: string, count: number) {
  const m = new THREE.InstancedMesh(geom, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95 }), Math.max(1, count))
  m.castShadow = true
  m.receiveShadow = true
  m.count = count
  return m
}

const spotsCache = new Map<string, V2[]>()
export function plantSpots(site: Site, combined: boolean): V2[] {
  const k = `${site.id}:${combined}`
  const hit = spotsCache.get(k)
  if (hit) return hit
  const good = site.saplings.filter((p) => p.good)
  const spots = combined ? site.plantSpots.filter(([x, z]) => good.every((p) => Math.hypot(p.x - x, p.z - z) > 1.2)) : site.plantSpots
  spotsCache.set(k, spots)
  return spots
}
export const progressOf = (now: number, a?: number, b?: number) => (a === undefined || b === undefined ? 1 : Math.min(1, Math.max(0, (now - a) / (b - a))))

function StaticProps({ area }: { area: Area }) {
  const meshes = useMemo(() => {
    const stumps = area.sites.flatMap((s) => s.stumps)
    const good = area.sites.flatMap((s) => s.saplings.filter((p) => p.good))
    const bad = area.sites.flatMap((s) => s.saplings.filter((p) => !p.good))
    const m1 = instanced(stumpGeom, '#a27a52', stumps.length)
    const m2 = instanced(saplingGeom, '#4f8b3d', good.length)
    const m3 = instanced(birchGeom, '#c4c45a', bad.length)
    const o = new THREE.Object3D()
    const place = (m: THREE.InstancedMesh, list: { x: number; z: number; s: number }[]) =>
      list.forEach((p, i) => {
        o.position.set(p.x, area.heightAt(p.x, p.z) - 0.03, p.z)
        o.scale.setScalar(p.s)
        o.rotation.set(0, i * 1.7, 0)
        o.updateMatrix()
        m.setMatrixAt(i, o.matrix)
      })
    place(m1, stumps)
    place(m2, good)
    place(m3, bad)
    return [m1, m2, m3]
  }, [area])
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

function Plantings({ area }: { area: Area }) {
  const cap = useMemo(() => area.sites.reduce((n, s) => n + s.plantSpots.length, 0) + 10, [area])
  const seedlings = useMemo(() => instanced(plantGeom, '#7cc95a', cap), [cap])
  const furrows = useMemo(() => instanced(furrowGeom, '#5a3f2a', cap), [cap])
  const statuses = useOps((s) => s.sites)
  const acc = useRef(0)
  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current < 0.1) return
    acc.current = 0
    const now = sim.minutes
    let n = 0
    for (const site of area.sites) {
      const st = statuses[site.id]
      const planting = st?.status === 'planting' && st.plantStart !== undefined
      if (!st || !(planting || (st.status === 'restored' && st.chosen && st.chosen !== 'natural'))) continue
      const spots = plantSpots(site, st.chosen === 'combined')
      const shown = planting ? Math.floor(spots.length * progressOf(now, st.plantStart, st.plantEnd)) : spots.length
      const grow = planting || st.restoredAt === undefined ? 0.6 : 0.6 + 0.8 * Math.min(1, (now - st.restoredAt) / (14 * 1440))
      for (let i = 0; i < shown && n < cap; i++, n++) {
        const [x, z] = spots[i]!
        const y = area.heightAt(x, z)
        o.position.set(x, y + 0.02, z)
        o.rotation.set(0, -site.angle, 0)
        o.scale.setScalar(1)
        o.updateMatrix()
        furrows.setMatrixAt(n, o.matrix)
        o.position.set(x, y - 0.03, z)
        o.rotation.set(0, i, 0)
        o.scale.setScalar(grow * (0.85 + ((i * 37) % 10) / 30))
        o.updateMatrix()
        seedlings.setMatrixAt(n, o.matrix)
      }
    }
    seedlings.count = furrows.count = n
    seedlings.instanceMatrix.needsUpdate = furrows.instanceMatrix.needsUpdate = true
    if (n) {
      seedlings.computeBoundingSphere()
      furrows.computeBoundingSphere()
    }
  })
  return (
    <>
      <primitive object={furrows} />
      <primitive object={seedlings} />
    </>
  )
}

function Outline({ area, site }: { area: Area; site: Site }) {
  const status = useOps((s) => s.sites[site.id]?.status ?? 'detected')
  const selected = useOps((s) => s.selectedSiteId === site.id)
  const select = useOps((s) => s.select)
  const [hover, setHover] = useState(false)
  const points = useMemo(() => {
    const out: [number, number, number][] = []
    const ring = [...site.poly, site.poly[0]!]
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]!, b = ring[i + 1]!
      const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.0))
      for (let k = 0; k < n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n
        const z = a[1] + ((b[1] - a[1]) * k) / n
        out.push([x, area.heightAt(x, z) + 0.25, z])
      }
    }
    out.push(out[0]!)
    return out
  }, [area, site])
  const hit = useMemo(() => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(site.poly.map(([x, z]) => new THREE.Vector2(x, -z))))
    g.rotateX(-Math.PI / 2)
    return g
  }, [site])
  const y = useMemo(() => Math.max(...site.poly.map(([x, z]) => area.heightAt(x, z))) + 0.3, [area, site])
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
  }, [hover])
  return (
    <group>
      <Line
        points={points}
        color={STATUS_COLOR[status]}
        lineWidth={selected ? 3.4 : hover ? 2.4 : 1.6}
        dashed={status === 'detected'}
        dashSize={0.7}
        gapSize={0.45}
        transparent
        opacity={status === 'detected' && !hover && !selected ? 0.6 : 0.95}
      />
      <mesh
        geometry={hit}
        position-y={y}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
        }}
        onPointerOut={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation()
          select(site.id)
        }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function Sites({ area }: { area: Area }) {
  return (
    <group>
      <StaticProps area={area} />
      <Plantings area={area} />
      {area.sites.map((s) => (
        <Outline key={s.id} area={area} site={s} />
      ))}
    </group>
  )
}

