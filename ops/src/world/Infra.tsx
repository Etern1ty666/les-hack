// Дороги (асфальт/грунт) лентами по рельефу и постройки из OSM — инстансами в стиле игры.
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Area, RoadLine } from '../data/build'

function ribbon(area: Area, r: RoadLine): THREE.BufferGeometry {
  const pos: number[] = []
  const half = r.width / 2
  for (let i = 0; i < r.pts.length - 1; i++) {
    const [x0, z0] = r.pts[i]!, [x1, z1] = r.pts[i + 1]!
    const len = Math.hypot(x1 - x0, z1 - z0) || 1
    const nx = (-(z1 - z0) / len) * half
    const nz = ((x1 - x0) / len) * half
    const y0 = area.groundAt(x0, z0) + 0.07, y1 = area.groundAt(x1, z1) + 0.07
    pos.push(x0 + nx, y0, z0 + nz, x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz, x1 + nx, y1, z1 + nz, x0 - nx, y0, z0 - nz, x1 - nx, y1, z1 - nz)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

export function Roads({ area }: { area: Area }) {
  const { paved, dirt } = useMemo(() => {
    const merge = (list: RoadLine[]) => {
      const parts = list.filter((r) => r.pts.length > 1).map((r) => ribbon(area, r))
      if (!parts.length) return null
      const g = mergeGeometries(parts)!
      g.computeVertexNormals()
      return g
    }
    // сначала грунтовки, сверху асфальт
    return { dirt: merge(area.roads.filter((r) => !r.paved)), paved: merge(area.roads.filter((r) => r.paved)) }
  }, [area])
  return (
    <group>
      {dirt && (
        <mesh geometry={dirt} receiveShadow>
          <meshStandardMaterial color="#b49a6a" roughness={1} polygonOffset polygonOffsetFactor={-2} side={THREE.DoubleSide} />
        </mesh>
      )}
      {paved && (
        <mesh geometry={paved} receiveShadow>
          <meshStandardMaterial color="#8e897c" roughness={0.95} polygonOffset polygonOffsetFactor={-4} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

const roofGeom = (() => {
  const shape = new THREE.Shape()
  shape.moveTo(-0.5, 0)
  shape.lineTo(0.5, 0)
  shape.lineTo(0, 0.55)
  shape.lineTo(-0.5, 0)
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false })
  g.translate(0, 0, -0.5)
  g.rotateY(Math.PI / 2)
  return g
})()
const wallGeom = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const WALLS = ['#e2d6bb', '#d8c49c', '#cdbb98', '#e6dfcc']
const ROOFS = ['#8a3f2c', '#4f6b45', '#6c3a2d', '#5a6470']

export function Buildings({ area }: { area: Area }) {
  const meshes = useMemo(() => {
    const n = area.buildings.length
    if (!n) return null
    const walls = new THREE.InstancedMesh(wallGeom, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }), n)
    const roofs = new THREE.InstancedMesh(roofGeom, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), n)
    walls.castShadow = roofs.castShadow = true
    walls.receiveShadow = true
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    area.buildings.forEach((b, i) => {
      const y = area.groundAt(b.x, b.z)
      const h = 0.35 + Math.min(b.w, b.d) * 0.35
      o.position.set(b.x, y, b.z)
      o.rotation.set(0, -b.rot, 0)
      o.scale.set(b.w, h, b.d)
      o.updateMatrix()
      walls.setMatrixAt(i, o.matrix)
      walls.setColorAt(i, c.set(WALLS[i % WALLS.length]!))
      o.position.set(b.x, y + h, b.z)
      o.scale.set(b.w * 1.08, b.d * 1.2, b.d * 1.12)
      o.updateMatrix()
      roofs.setMatrixAt(i, o.matrix)
      roofs.setColorAt(i, c.set(ROOFS[b.roof]!))
    })
    return [walls, roofs]
  }, [area])
  if (!meshes) return null
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}
