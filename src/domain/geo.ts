// Простая геометрия в локальной метрике (equirectangular по широте). Достаточно для лесосек в десятки гектаров.
import type * as GeoJSON from 'geojson'
import type { LonLat } from './types'

const M_PER_DEG_LAT = 110_540
const M_PER_DEG_LON_EQ = 111_320

/** Смещение в метрах от точки → координаты. */
export function offsetMeters([lon, lat]: LonLat, dx: number, dy: number): LonLat {
  return [lon + dx / (M_PER_DEG_LON_EQ * Math.cos((lat * Math.PI) / 180)), lat + dy / M_PER_DEG_LAT]
}

/** Координаты → смещение в метрах от origin. */
export function toMeters(origin: LonLat, [lon, lat]: LonLat): [number, number] {
  return [
    (lon - origin[0]) * M_PER_DEG_LON_EQ * Math.cos((origin[1] * Math.PI) / 180),
    (lat - origin[1]) * M_PER_DEG_LAT,
  ]
}

/** Площадь замкнутого кольца в гектарах. */
export function ringAreaHa(ring: LonLat[]): number {
  if (ring.length < 4) return 0
  const origin = ring[0]!
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = toMeters(origin, ring[i]!)
    const [x2, y2] = toMeters(origin, ring[i + 1]!)
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2 / 10_000
}

/** Повёрнутый прямоугольник площадью areaHa вокруг центра. aspect = длина / ширина. */
export function rectanglePolygon(center: LonLat, areaHa: number, aspect = 1.6, angleRad = 0): LonLat[] {
  const areaM2 = areaHa * 10_000
  const w = Math.sqrt(areaM2 / aspect)
  const h = w * aspect
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  const corners: [number, number][] = [
    [-h / 2, -w / 2],
    [h / 2, -w / 2],
    [h / 2, w / 2],
    [-h / 2, w / 2],
  ]
  const ring = corners.map(([x, y]) => offsetMeters(center, x * cos - y * sin, x * sin + y * cos))
  ring.push(ring[0]!)
  return ring
}

function pointInRing([x, y]: LonLat, ring: GeoJSON.Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!
    const yi = ring[i]![1]!
    const xj = ring[j]![0]!
    const yj = ring[j]![1]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Точка внутри Polygon/MultiPolygon (с учётом дыр). */
export function pointInGeometry(p: LonLat, geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  for (const poly of polys) {
    const [outer, ...holes] = poly
    if (outer && pointInRing(p, outer) && !holes.some((h) => pointInRing(p, h))) return true
  }
  return false
}

/** Точка внутри простого кольца лесосеки. */
export function pointInLonLatRing(p: LonLat, ring: LonLat[]): boolean {
  return pointInRing(p, ring)
}
