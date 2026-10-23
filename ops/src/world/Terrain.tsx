// Реальный рельеф низкополигональной «доской»-диорамой: плоские грани, цвет по классу земель, срезы по краям.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Area } from '../data/build'
import { pointInPolygon } from '../lib/math'
import { useOps } from '../ops/store'

const CELL = 1.25
const BASE_Y = -4
const GRASS = new THREE.Color('#5f7a35')

function buildTerrain(area: Area) {
  const { W, D } = area
  const nx = Math.round(W / CELL)
  const nz = Math.round(D / CELL)
  const hx = (i: number) => -W / 2 + (i * W) / nx
  const hz = (j: number) => -D / 2 + (j * D) / nz
  const hgt = new Float32Array((nx + 1) * (nz + 1))
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) hgt[i * (nz + 1) + j] = area.heightAt(hx(i), hz(j))
  const tris = nx * nz * 2
  const pos = new Float32Array(tris * 9)
  const col = new Float32Array(tris * 9)
  const centroids = new Float32Array(tris * 4)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3()
  let t = 0
  const tri = (pts: [number, number][]) => {
    const v = pts.map(([i, j]) => [hx(i), hgt[i * (nz + 1) + j]!, hz(j)] as const)
    a.set(...v[0]!); b.set(...v[1]!); c.set(...v[2]!)
    ab.subVectors(b, a); ac.subVectors(c, a)
    const n = ab.cross(ac).normalize()
    const slope = 1 - Math.abs(n.y)
    const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3
    const [r, g, bl] = area.colorAt(cx, cz, cy, slope)
    for (let k = 0; k < 3; k++) {
      pos.set(v[k]!, t * 9 + k * 3)
      col.set([r, g, bl], t * 9 + k * 3)
    }
    centroids.set([cx, cz, cy, slope], t * 4)
    t++
  }
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      if ((i + j) % 2 === 0) {
        tri([[i, j], [i, j + 1], [i + 1, j]])
        tri([[i + 1, j], [i, j + 1], [i + 1, j + 1]])
      } else {
        tri([[i, j], [i, j + 1], [i + 1, j + 1]])
        tri([[i, j], [i + 1, j + 1], [i + 1, j]])
      }
    }
  const top = new THREE.BufferGeometry()
  top.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  top.setAttribute('color', new THREE.BufferAttribute(col, 3))
  top.computeVertexNormals()

  // срезы по периметру — как у макета на столе
  const skirtPos: number[] = []
  const edge = (pts: [number, number][]) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, z0] = pts[k]!, [x1, z1] = pts[k + 1]!
      const y0 = area.heightAt(x0, z0), y1 = area.heightAt(x1, z1)
      skirtPos.push(x0, y0, z0, x0, BASE_Y, z0, x1, y1, z1, x1, y1, z1, x0, BASE_Y, z0, x1, BASE_Y, z1)
    }
  }
  const line = (n: number, f: (k: number) => [number, number]) => Array.from({ length: n + 1 }, (_, k) => f(k))
  edge(line(nx, (k) => [hx(k), -D / 2]).reverse())
  edge(line(nx, (k) => [hx(k), D / 2]))
  edge(line(nz, (k) => [-W / 2, hz(k)]))
  edge(line(nz, (k) => [W / 2, hz(k)]).reverse())
  const skirt = new THREE.BufferGeometry()
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(skirtPos, 3))
  skirt.computeVertexNormals()
  return { top, skirt, centroids }
}

export function Terrain({ area }: { area: Area }) {
  const data = useMemo(() => buildTerrain(area), [area])
  const sites = useOps((s) => s.sites)

  // восстановленные и оставленные под естественное возобновление участки зеленеют
  useEffect(() => {
    const col = data.top.getAttribute('color') as THREE.BufferAttribute
    const c = data.centroids
    const tmp = new THREE.Color()
    let changed = false
    for (const site of area.sites) {
      const st = sites[site.id]
      const greenT = st?.status === 'restored' ? 0.7 : st?.status === 'natural' ? 0.35 : 0
      if (!greenT) continue
      const r = Math.max(site.w, site.h)
      for (let t = 0; t < c.length / 4; t++) {
        const x = c[t * 4]!, z = c[t * 4 + 1]!
        if (Math.abs(x - site.center[0]) > r || Math.abs(z - site.center[1]) > r || !pointInPolygon(x, z, site.poly)) continue
        const [rr, g, b] = area.colorAt(x, z, c[t * 4 + 2]!, c[t * 4 + 3]!)
        tmp.setRGB(rr, g, b).lerp(GRASS, greenT)
        for (let k = 0; k < 3; k++) col.setXYZ(t * 3 + k, tmp.r, tmp.g, tmp.b)
        changed = true
      }
    }
    if (changed) col.needsUpdate = true
  }, [area, data, sites])

  return (
    <group>
      <mesh geometry={data.top} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      <mesh geometry={data.skirt}>
        <meshStandardMaterial color="#5b4634" flatShading roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={BASE_Y - 0.01}>
        <planeGeometry args={[area.W * 6, area.D * 6]} />
        <meshStandardMaterial color="#a7ae98" roughness={1} />
      </mesh>
    </group>
  )
}

/** Реки и озёра (полигоны OSM) и ручьи (линии). */
export function Water({ area }: { area: Area }) {
  const geom = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (const w of area.water) {
      const shape = new THREE.Shape(w.rings[0]!.map(([x, z]) => new THREE.Vector2(x, -z)))
      for (const hole of w.rings.slice(1)) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))))
      const g = new THREE.ShapeGeometry(shape)
      g.rotateX(-Math.PI / 2)
      g.translate(0, w.level + 0.06, 0)
      parts.push(g.toNonIndexed())
    }
    for (const s of area.streams) {
      const pos: number[] = []
      for (let i = 0; i < s.pts.length - 1; i++) {
        const [x0, z0] = s.pts[i]!, [x1, z1] = s.pts[i + 1]!
        const len = Math.hypot(x1 - x0, z1 - z0) || 1
        const nx = (-(z1 - z0) / len) * (s.width / 2)
        const nz = ((x1 - x0) / len) * (s.width / 2)
        const y0 = area.heightAt(x0, z0) + 0.05, y1 = area.heightAt(x1, z1) + 0.05
        pos.push(x0 + nx, y0, z0 + nz, x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz, x1 + nx, y1, z1 + nz, x0 - nx, y0, z0 - nz, x1 - nx, y1, z1 - nz)
      }
      if (pos.length) {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        parts.push(g)
      }
    }
    if (!parts.length) return null
    for (const p of parts) {
      for (const name of Object.keys(p.attributes)) if (name !== 'position') p.deleteAttribute(name)
    }
    const merged = mergeGeometries(parts)!
    merged.computeVertexNormals()
    return merged
  }, [area])
  if (!geom) return null
  return (
    <mesh geometry={geom} receiveShadow>
      <meshStandardMaterial color="#4f8d99" transparent opacity={0.9} roughness={0.3} side={THREE.DoubleSide} />
    </mesh>
  )
}
