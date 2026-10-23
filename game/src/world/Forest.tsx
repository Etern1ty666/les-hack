// Лес: тысячи низкополигональных деревьев инстансами (ель, сосна, берёза). Гари прячут деревья.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useGame, world } from '../game/store'
import type { TreeKind } from './generate'

function spruceCrown() {
  const parts = [
    [1.05, 1.4, 1.0],
    [0.82, 1.2, 1.75],
    [0.55, 1.0, 2.45],
  ].map(([r, h, y]) => {
    const g = new THREE.ConeGeometry(r, h, 6)
    g.translate(0, y!, 0)
    return g
  })
  return mergeGeometries(parts)!
}

function pineCrown() {
  const a = new THREE.IcosahedronGeometry(0.85, 0)
  a.scale(1.05, 0.75, 1.05)
  a.translate(0, 2.35, 0)
  const b = new THREE.IcosahedronGeometry(0.55, 0)
  b.translate(0.35, 2.0, 0.2)
  return mergeGeometries([a, b])!
}

function birchCrown() {
  const g = new THREE.IcosahedronGeometry(0.8, 0)
  g.scale(0.95, 1.25, 0.95)
  g.translate(0, 2.0, 0)
  return g
}

function trunk(h: number, r: number) {
  const g = new THREE.CylinderGeometry(r * 0.8, r, h, 5)
  g.translate(0, h / 2, 0)
  return g
}

const SPEC: Record<TreeKind, { crown: () => THREE.BufferGeometry; trunk: THREE.BufferGeometry; crownColors: string[]; trunkColor: string }> = {
  spruce: { crown: spruceCrown, trunk: trunk(1.0, 0.13), crownColors: ['#2c5236', '#335c3b', '#284a31'], trunkColor: '#5d4330' },
  pine: { crown: pineCrown, trunk: trunk(2.0, 0.11), crownColors: ['#4b7038', '#557a3c', '#436634'], trunkColor: '#8a5a3a' },
  birch: { crown: birchCrown, trunk: trunk(1.6, 0.09), crownColors: ['#b8b04a', '#9fae47', '#c9a53e', '#86a043'], trunkColor: '#e3dfd2' },
}

function useTreeMeshes(kind: TreeKind) {
  return useMemo(() => {
    const trees = world.trees.filter((t) => t.kind === kind)
    const spec = SPEC[kind]
    const crown = new THREE.InstancedMesh(spec.crown(), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), trees.length)
    const trk = new THREE.InstancedMesh(spec.trunk, new THREE.MeshStandardMaterial({ color: spec.trunkColor, flatShading: true, roughness: 1 }), trees.length)
    crown.castShadow = true
    crown.receiveShadow = true
    trk.castShadow = true
    const color = new THREE.Color()
    trees.forEach((t, i) => {
      const base = spec.crownColors[Math.floor(((t.tint + 1) / 2) * spec.crownColors.length) % spec.crownColors.length]!
      color.set(base).offsetHSL(0, 0, t.tint * 0.03)
      crown.setColorAt(i, color)
    })
    return { trees, crown, trunk: trk }
  }, [kind])
}

function TreeLayer({ kind }: { kind: TreeKind }) {
  const { trees, crown, trunk } = useTreeMeshes(kind)
  const burnZones = useGame((s) => s.burnZones)

  useEffect(() => {
    const o = new THREE.Object3D()
    trees.forEach((t, i) => {
      const burnt = burnZones.some((b) => Math.hypot(b.x - t.x, b.z - t.z) < b.r)
      o.position.set(t.x, t.y - 0.05, t.z)
      o.rotation.set(0, t.rot, 0)
      o.scale.setScalar(burnt ? 0 : t.s)
      o.updateMatrix()
      crown.setMatrixAt(i, o.matrix)
      trunk.setMatrixAt(i, o.matrix)
    })
    crown.instanceMatrix.needsUpdate = true
    trunk.instanceMatrix.needsUpdate = true
    crown.computeBoundingSphere()
    trunk.computeBoundingSphere()
  }, [trees, crown, trunk, burnZones])

  return (
    <>
      <primitive object={crown} />
      <primitive object={trunk} />
    </>
  )
}

export function Forest() {
  return (
    <group>
      <TreeLayer kind="spruce" />
      <TreeLayer kind="pine" />
      <TreeLayer kind="birch" />
    </group>
  )
}
