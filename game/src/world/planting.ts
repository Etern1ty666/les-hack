// Общие расчёты посадки: места рядами и фронт посадки (для анимации рядов и рабочих).
import type { V2 } from '../lib/math'
import type { Site } from './generate'

const cache = new Map<string, V2[]>()

/** Места посадки: для комбинированного — только «окна» вдали от подроста. */
export function plantSpotsFor(site: Site, combined: boolean): V2[] {
  const key = `${site.id}:${combined ? 1 : 0}`
  const hit = cache.get(key)
  if (hit) return hit
  let spots = site.plantSpots
  if (combined) {
    const good = site.saplings.filter((p) => p.good)
    spots = site.plantSpots.filter(([x, z]) => good.every((p) => Math.hypot(p.x - x, p.z - z) > 1.3))
  }
  cache.set(key, spots)
  return spots
}

export function plantProgress(now: number, start?: number, end?: number) {
  if (start === undefined || end === undefined) return 1
  return Math.min(1, Math.max(0, (now - start) / (end - start)))
}
