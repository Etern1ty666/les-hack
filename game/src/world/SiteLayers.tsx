// Лесосеки: пни, подрост (густота = данные осмотра), посадка рядами с ростом, контуры, клик.
import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { clock, useGame, world, type SiteStatus } from '../game/store'
import type { Site } from './generate'
import { plantProgress, plantSpotsFor } from './planting'

const STATUS_COLOR: Record<SiteStatus, string> = {
  fresh: '#efe8d2',
  called: '#ffffff',
  inspecting: '#ffffff',
  decision: '#f2b33d',
  natural: '#5fd08a',
  awaiting_planting: '#f2b33d',
  planting: '#f2b33d',
  restored: '#5fd08a',
}

const stumpGeom = new THREE.CylinderGeometry(0.2, 0.24, 0.3, 6).translate(0, 0.15, 0)
const saplingGeom = new THREE.ConeGeometry(0.3, 0.8, 5).translate(0, 0.4, 0)
const birchSaplingGeom = new THREE.IcosahedronGeometry(0.3, 0).scale(1, 1.3, 1).translate(0, 0.45, 0)
const plantGeom = new THREE.ConeGeometry(0.24, 0.7, 5).translate(0, 0.35, 0)
const furrowGeom = new THREE.BoxGeometry(0.9, 0.07, 0.34)

function makeInstanced(geom: THREE.BufferGeometry, color: string, count: number) {
  const m = new THREE.InstancedMesh(geom, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95 }), Math.max(1, count))
  m.castShadow = true
  m.receiveShadow = true
  m.count = count
  return m
}

/** Пни и стартовый подрост всех участков (пересобираются при появлении гарей). */
function StaticSiteProps({ sites }: { sites: Site[] }) {
  const meshes = useMemo(() => {
    const stumps = sites.flatMap((s) => s.stumps.map((p) => ({ ...p, burnt: s.burnt })))
    const good = sites.flatMap((s) => s.saplings.filter((p) => p.good))
    const bad = sites.flatMap((s) => s.saplings.filter((p) => !p.good))
    const stumpMesh = makeInstanced(stumpGeom, '#ffffff', stumps.length)
    const goodMesh = makeInstanced(saplingGeom, '#4f8b3d', good.length)
    const badMesh = makeInstanced(birchSaplingGeom, '#c4c45a', bad.length)
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    stumps.forEach((p, i) => {
      o.position.set(p.x, world.heightAt(p.x, p.z) - 0.03, p.z)
      o.scale.set(p.s, p.burnt ? p.s * 2.4 : p.s, p.s)
      o.rotation.set(0, i, 0)
      o.updateMatrix()
      stumpMesh.setMatrixAt(i, o.matrix)
      stumpMesh.setColorAt(i, c.set(p.burnt ? '#2b2420' : i % 3 ? '#a27a52' : '#8c6a47'))
    })
    const place = (mesh: THREE.InstancedMesh, list: { x: number; z: number; s: number }[]) =>
      list.forEach((p, i) => {
        o.position.set(p.x, world.heightAt(p.x, p.z) - 0.03, p.z)
        o.scale.setScalar(p.s)
        o.rotation.set(0, i * 1.7, 0)
        o.updateMatrix()
        mesh.setMatrixAt(i, o.matrix)
      })
    place(goodMesh, good)
    place(badMesh, bad)
    return [stumpMesh, goodMesh, badMesh]
  }, [sites])
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

/** Посаженные культуры: борозды и яркие сеянцы появляются ряд за рядом, затем подрастают. */
function Plantings({ sites }: { sites: Site[] }) {
  const capacity = useMemo(() => sites.reduce((n, s) => n + s.plantSpots.length, 0) + 10, [sites])
  const mesh = useMemo(() => makeInstanced(plantGeom, '#7cc95a', capacity), [capacity])
  const furrows = useMemo(() => {
    const m = makeInstanced(furrowGeom, '#5a3f2a', capacity)
    m.castShadow = false
    return m
  }, [capacity])
  const statuses = useGame((s) => s.sites)
  const acc = useRef(0)
  const o = useMemo(() => new THREE.Object3D(), [])

  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current < 0.1) return
    acc.current = 0
    const now = clock.minutes
    let n = 0
    for (const site of sites) {
      const st = statuses[site.id]
      if (!st || (st.status !== 'planting' && st.status !== 'restored') || st.chosen === 'natural' || !st.chosen) continue
      const spots = plantSpotsFor(site, st.chosen === 'combined')
      const planting = st.status === 'planting'
      const shown = planting ? Math.floor(spots.length * plantProgress(now, st.plantStart, st.plantEnd)) : spots.length
      const grow = planting || st.restoredAt === undefined ? 0.6 : 0.6 + 0.8 * Math.min(1, (now - st.restoredAt) / (36 * 60))
      for (let i = 0; i < shown && n < capacity; i++, n++) {
        const [x, z] = spots[i]!
        const y = world.heightAt(x, z)
        // борозда под сеянцем — вместе образуют ряды
        o.position.set(x, y + 0.02, z)
        o.rotation.set(0, -site.angle, 0)
        o.scale.setScalar(1)
        o.updateMatrix()
        furrows.setMatrixAt(n, o.matrix)
        o.position.set(x, y - 0.03, z)
        o.rotation.set(0, i, 0)
        // свежепосаженный сеянец «выскакивает»
        const pop = planting && i > shown - 6 ? 0.5 + 0.1 * (shown - i) : 1
        o.scale.setScalar(grow * pop * (0.85 + ((i * 37) % 10) / 30))
        o.updateMatrix()
        mesh.setMatrixAt(n, o.matrix)
      }
    }
    mesh.count = n
    furrows.count = n
    mesh.instanceMatrix.needsUpdate = true
    furrows.instanceMatrix.needsUpdate = true
    if (n > 0) {
      mesh.computeBoundingSphere()
      furrows.computeBoundingSphere()
    }
  })

  return (
    <>
      <primitive object={furrows} />
      <primitive object={mesh} />
    </>
  )
}

function SiteOutline({ site }: { site: Site }) {
  const status = useGame((s) => s.sites[site.id]?.status ?? 'fresh')
  const selected = useGame((s) => s.selectedSiteId === site.id)
  const [hover, setHover] = useState(false)
  const select = useGame((s) => s.selectSite)

  const points = useMemo(() => {
    const out: [number, number, number][] = []
    const ring = [...site.poly, site.poly[0]!]
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]!, b = ring[i + 1]!
      const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.2))
      for (let k = 0; k < n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n
        const z = a[1] + ((b[1] - a[1]) * k) / n
        out.push([x, world.heightAt(x, z) + 0.25, z])
      }
    }
    out.push(out[0]!)
    return out
  }, [site])

  const hit = useMemo(() => {
    const shape = new THREE.Shape(site.poly.map(([x, z]) => new THREE.Vector2(x, -z)))
    const g = new THREE.ShapeGeometry(shape)
    g.rotateX(-Math.PI / 2)
    return g
  }, [site])
  const avgY = useMemo(() => site.poly.reduce((s, [x, z]) => s + world.heightAt(x, z), 0) / site.poly.length, [site])

  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
  }, [hover])

  const color = STATUS_COLOR[status]
  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={selected ? 3.2 : hover ? 2.4 : 1.6}
        dashed={status === 'fresh'}
        dashSize={0.8}
        gapSize={0.5}
        transparent
        opacity={status === 'fresh' && !hover && !selected ? 0.55 : 0.95}
      />
      <mesh
        geometry={hit}
        position-y={avgY + 0.4}
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

export function SiteLayers() {
  const version = useGame((s) => s.version)
  // world.sites мутабелен (гари добавляются) — снимок пересобирается по version
  const sites = useMemo(() => [...world.sites], [version])
  return (
    <group>
      <StaticSiteProps sites={sites} />
      <Plantings sites={sites} />
      {sites.map((s) => (
        <SiteOutline key={s.id} site={s} />
      ))}
    </group>
  )
}
