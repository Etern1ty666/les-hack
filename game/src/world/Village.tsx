// Лесничество: контора с флагом, дома, гараж, склад, штабеля брёвен, пожарная вышка, питомник.
import { useMemo } from 'react'
import * as THREE from 'three'
import { world } from '../game/store'
import type { Building } from './generate'

const roofGeom = (() => {
  // треугольная призма вдоль X
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

function House({ w, d, h, wall, roof }: { w: number; d: number; h: number; wall: string; roof: string }) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={wall} roughness={0.95} flatShading />
      </mesh>
      <mesh geometry={roofGeom} position={[0, h, 0]} scale={[w * 1.08, d * 1.6, d * 1.12]} castShadow>
        <meshStandardMaterial color={roof} roughness={0.9} flatShading />
      </mesh>
      {/* окна */}
      {[-0.25, 0.25].map((f) => (
        <mesh key={f} position={[f * w, h * 0.55, d / 2 + 0.01]}>
          <planeGeometry args={[w * 0.16, h * 0.3]} />
          <meshStandardMaterial color="#f3d68a" emissive="#f0c060" emissiveIntensity={0.35} />
        </mesh>
      ))}
    </group>
  )
}

function BuildingMesh({ b }: { b: Building }) {
  const y = world.heightAt(b.x, b.z)
  const content = (() => {
    switch (b.kind) {
      case 'office':
        return (
          <group>
            <House w={4.6} d={3} h={2.6} wall="#e3d8bf" roof="#4f6b45" />
            <mesh position={[2.9, 2.2, 1.2]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 4.4]} />
              <meshStandardMaterial color="#d9d9d9" />
            </mesh>
            {['#ffffff', '#1f4ea8', '#c8202c'].map((c, i) => (
              <mesh key={c} position={[3.45, 4.15 - i * 0.22, 1.2]}>
                <boxGeometry args={[1.0, 0.22, 0.02]} />
                <meshStandardMaterial color={c} />
              </mesh>
            ))}
          </group>
        )
      case 'house':
        return <House w={3} d={2.4} h={1.6} wall={b.rot > 0 ? '#d9c79d' : '#c9b48c'} roof={b.rot > 0.3 ? '#8a3f2c' : '#6c3a2d'} />
      case 'garage':
        return (
          <group>
            <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
              <boxGeometry args={[5, 1.8, 2.8]} />
              <meshStandardMaterial color="#9aa08f" flatShading />
            </mesh>
            {[-1.6, 0, 1.6].map((x) => (
              <mesh key={x} position={[x, 0.7, 1.41]}>
                <planeGeometry args={[1.3, 1.3]} />
                <meshStandardMaterial color="#3d4a3a" />
              </mesh>
            ))}
          </group>
        )
      case 'shed':
        return <House w={4} d={2.2} h={1.3} wall="#8c6a48" roof="#5a4630" />
      case 'logs':
        return (
          <group>
            {[0, 1, 2].map((row) =>
              Array.from({ length: 4 - row }, (_, i) => (
                <mesh key={`${row}-${i}`} position={[0, 0.2 + row * 0.34, (i - (3 - row) / 2) * 0.4]} rotation-z={Math.PI / 2} castShadow>
                  <cylinderGeometry args={[0.18, 0.18, 2.6, 7]} />
                  <meshStandardMaterial color="#a77c52" flatShading />
                </mesh>
              )),
            )}
          </group>
        )
      case 'tower':
        return (
          <group>
            {[[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([dx, dz]) => (
              <mesh key={`${dx}${dz}`} position={[dx! * 0.7, 3, dz! * 0.7]} rotation={[dz! * 0.06, 0, -dx! * 0.06]} castShadow>
                <boxGeometry args={[0.12, 6, 0.12]} />
                <meshStandardMaterial color="#6d5a45" />
              </mesh>
            ))}
            <mesh position={[0, 6.3, 0]} castShadow>
              <boxGeometry args={[1.6, 0.9, 1.6]} />
              <meshStandardMaterial color="#c8b48a" flatShading />
            </mesh>
            <mesh position={[0, 7.0, 0]} rotation-y={Math.PI / 4} castShadow>
              <coneGeometry args={[1.35, 0.7, 4]} />
              <meshStandardMaterial color="#7a3b2e" flatShading />
            </mesh>
          </group>
        )
    }
  })()
  return (
    <group position={[b.x, y, b.z]} rotation-y={b.rot}>
      {content}
    </group>
  )
}

export function Village() {
  const beds = world.nurseryBeds
  const seedlings = useMemo(() => {
    const out: [number, number][] = []
    for (const bed of beds) {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 9; j++) out.push([bed.x - bed.w / 2 + 0.3 + i * 0.6, bed.z - bed.d / 2 + 0.3 + j * 0.55])
    }
    return out
  }, [beds])
  const seedMesh = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.45, 5), new THREE.MeshStandardMaterial({ color: '#4f8a3f', flatShading: true }), seedlings.length)
    const o = new THREE.Object3D()
    seedlings.forEach(([x, z], i) => {
      o.position.set(x, world.heightAt(x, z) + 0.42, z)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.castShadow = true
    return m
  }, [seedlings])

  return (
    <group>
      {world.buildings.map((b, i) => (
        <BuildingMesh key={i} b={b} />
      ))}
      {beds.map((bed, i) => (
        <mesh key={i} position={[bed.x, world.heightAt(bed.x, bed.z) + 0.1, bed.z]} receiveShadow>
          <boxGeometry args={[bed.w, 0.25, bed.d]} />
          <meshStandardMaterial color="#5b4532" roughness={1} />
        </mesh>
      ))}
      <primitive object={seedMesh} />
    </group>
  )
}
