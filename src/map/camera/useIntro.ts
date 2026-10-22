// Интро (add-strategic-map design D6, без роста гексов — он появится вместе со слоем гексов).
// intro: глобус медленно вращается; ready: перелёт к России.
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, type RefObject } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import type { AppPhase } from '@/state/store'
import { russiaView } from './presets'

const ROTATION_DEG_PER_SEC = 4

export function useIntro(mapRef: RefObject<MapRef | null>, phase: AppPhase, mapReady: boolean) {
  const reduced = useReducedMotion()
  const flown = useRef(false)

  // Вращение глобуса в фазе intro
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !mapReady || phase !== 'intro' || reduced) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      if (!map.isMoving()) {
        const c = map.getCenter()
        map.setCenter([c.lng + ROTATION_DEG_PER_SEC * dt, c.lat])
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [mapRef, mapReady, phase, reduced])

  // Перелёт к России при старте (один раз; если карта догрузилась уже после «Начать» — летим по её готовности)
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !mapReady || phase !== 'ready' || flown.current) return
    flown.current = true
    const target = russiaView()
    if (reduced) map.jumpTo(target)
    else map.flyTo({ ...target, duration: 4500, curve: 1.8, essential: true })
  }, [mapRef, mapReady, phase, reduced])
}
