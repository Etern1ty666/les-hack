// Низкополигональный рельеф: плоские грани, цвет на треугольник. Перекрашивается при восстановлении участков и гарях.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { pointInPolygon } from '../lib/math'
import { useGame, world } from '../game/store'
import { D, W, WATER_Y } from './generate'

const CELL = 1.5
const GRASS = new THREE.Color('#5f7a35')

interface TerrainData {
  geometry: THREE.BufferGeometry
  centroids: Float32Array // x, z, h, slope на треугольник
}

function buildTerrain(): TerrainData {
  const nx = Math.round(W / CELL)
  const nz = Math.round(D / CELL)
  const hgt = new Float32Array((nx + 1) * (nz + 1))
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) hgt[i * (nz + 1) + j] = world.heightAt(-W / 2 + i * CELL, -D / 2 + j * CELL)
  }
  const tris = nx * nz * 2
  const pos = new Float32Array(tris * 9)
  const col = new Float32Array(tris * 9)
  const centroids = new Float32Array(tris * 4)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const ab = new THREE.Vector3(), ac = new THREE.Vector3()
  let t = 0
  const pushTri = (pts: [number, number][]) => {
    const v = pts.map(([i, j]) => [-W / 2 + i * CELL, hgt[i * (nz + 1) + j]!, -D / 2 + j * CELL] as const)
    a.set(...v[0]!); b.set(...v[1]!); c.set(...v[2]!)
    ab.subVectors(b, a); ac.subVectors(c, a)
    const n = ab.cross(ac).normalize()
    const slope = 1 - Math.abs(n.y)
    const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3
    const [r, g, bl] = world.colorAt(cx, cz, cy, slope)
    for (let k = 0; k < 3; k++) {
      pos.set(v[k]!, t * 9 + k * 3)
      col.set([r, g, bl], t * 9 + k * 3)
    }
    centroids.set([cx, cz, cy, slope], t * 4)
    t++
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      // чередуем диагональ — меньше «полосатости»
      if ((i + j) % 2 === 0) {
        pushTri([[i, j], [i, j + 1], [i + 1, j]])
        pushTri([[i + 1, j], [i, j + 1], [i + 1, j + 1]])
      } else {
        pushTri([[i, j], [i, j + 1], [i + 1, j + 1]])
        pushTri([[i, j], [i + 1, j + 1], [i + 1, j]])
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geometry.computeVertexNormals()
  return { geometry, centroids }
}

export function Terrain() {
  const data = useMemo(buildTerrain, [])
  const version = useGame((s) => s.version)
  const sites = useGame((s) => s.sites)

  // Перекраска участков: гари (новые лесосеки) и зелень на восстановленных
  useEffect(() => {
    const col = data.geometry.getAttribute('color') as THREE.BufferAttribute
    const c = data.centroids
    const tmp = new THREE.Color()
    let changed = false
    for (const site of world.sites) {
      const st = sites[site.id]
      const greenT = st?.status === 'restored' ? 0.7 : st?.status === 'natural' ? 0.35 : 0
      const xs = site.poly.map((p) => p[0])
      const zs = site.poly.map((p) => p[1])
      const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
      for (let t = 0; t < c.length / 4; t++) {
        const x = c[t * 4]!, z = c[t * 4 + 1]!
        if (x < x0 || x > x1 || z < z0 || z > z1 || !pointInPolygon(x, z, site.poly)) continue
        const [r, g, b] = world.colorAt(x, z, c[t * 4 + 2]!, c[t * 4 + 3]!)
        tmp.setRGB(r, g, b).lerp(GRASS, greenT)
        for (let k = 0; k < 3; k++) col.setXYZ(t * 3 + k, tmp.r, tmp.g, tmp.b)
        changed = true
      }
    }
    if (changed) col.needsUpdate = true
  }, [data, version, sites])

  return (
    <mesh geometry={data.geometry} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={1} metalness={0} />
    </mesh>
  )
}

export function Water() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, WATER_Y, 0]} receiveShadow>
      <planeGeometry args={[W, D]} />
      <meshStandardMaterial color="#4f8d99" transparent opacity={0.82} roughness={0.25} metalness={0.05} />
    </mesh>
  )
}

/** Подложка вокруг карты — «стол», на котором стоит диорама. */
export function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -2.2, 0]}>
      <planeGeometry args={[W * 4, D * 4]} />
      <meshStandardMaterial color="#9aa38a" roughness={1} />
    </mesh>
  )
}
