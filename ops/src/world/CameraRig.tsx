// Камера как в стратегиях: перетаскивание — панорама, правая кнопка — поворот, колесо — зум, WASD/QE, плавный перелёт.
import { MapControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { MapControls as MapControlsImpl } from 'three-stdlib'
import type { Area } from '../data/build'
import { useOps } from '../ops/store'
import { clamp } from '../lib/math'

const UP = new THREE.Vector3(0, 1, 0)

export function CameraRig({ area }: { area: Area }) {
  const controls = useRef<MapControlsImpl>(null)
  const keys = useRef(new Set<string>())
  const fly = useRef<{ x: number; z: number; zoom?: number } | null>(null)
  const focus = useOps((s) => s.focus)
  const { camera } = useThree()

  useEffect(() => {
    if (focus) fly.current = { x: focus.x, z: focus.z, zoom: focus.zoom }
  }, [focus])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      keys.current.add(e.code)
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  useFrame((_, rawDt) => {
    const c = controls.current
    if (!c) return
    const dt = Math.min(rawDt, 0.05)
    const k = keys.current
    const dist = camera.position.distanceTo(c.target)
    const fwd = new THREE.Vector3()
    camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()
    const right = new THREE.Vector3().crossVectors(fwd, UP)
    const move = new THREE.Vector3()
    const speed = dist * 0.8 * dt
    if (k.has('KeyW') || k.has('ArrowUp')) move.addScaledVector(fwd, speed)
    if (k.has('KeyS') || k.has('ArrowDown')) move.addScaledVector(fwd, -speed)
    if (k.has('KeyD') || k.has('ArrowRight')) move.addScaledVector(right, speed)
    if (k.has('KeyA') || k.has('ArrowLeft')) move.addScaledVector(right, -speed)
    if (move.lengthSq() > 0) {
      fly.current = null
      c.target.add(move)
      camera.position.add(move)
    }
    const rot = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0)
    if (rot) {
      const offset = camera.position.clone().sub(c.target).applyAxisAngle(UP, rot * dt * 1.2)
      camera.position.copy(c.target).add(offset)
    }

    if (fly.current) {
      const f = fly.current
      const goal = new THREE.Vector3(f.x, Math.max(0, area.groundAt(f.x, f.z)), f.z)
      const delta = goal.sub(c.target).multiplyScalar(1 - Math.exp(-dt * 4))
      c.target.add(delta)
      camera.position.add(delta)
      let zoomLeft = 0
      if (f.zoom) {
        const off = camera.position.clone().sub(c.target)
        const len = off.length()
        zoomLeft = Math.abs(f.zoom - len)
        off.setLength(len + (f.zoom - len) * (1 - Math.exp(-dt * 3)))
        camera.position.copy(c.target).add(off)
      }
      if (delta.length() < 0.01 && zoomLeft < 0.1) fly.current = null
    }

    // не даём уехать за край диорамы
    const tx = clamp(c.target.x, -area.W / 2, area.W / 2)
    const tz = clamp(c.target.z, -area.D / 2, area.D / 2)
    const shift = new THREE.Vector3(tx - c.target.x, 0, tz - c.target.z)
    if (shift.lengthSq() > 0) {
      c.target.add(shift)
      camera.position.add(shift)
    }
    c.update()
  })

  return (
    <MapControls
      ref={controls}
      makeDefault
      target={[0, 0, 0]}
      enableDamping
      dampingFactor={0.12}
      minDistance={32}
      maxDistance={Math.max(area.W, area.D) * 1.25}
      minPolarAngle={0.55}
      maxPolarAngle={1.05}
      screenSpacePanning={false}
      zoomSpeed={0.9}
    />
  )
}
