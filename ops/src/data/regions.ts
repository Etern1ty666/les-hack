// Субъекты РФ (упрощённые границы Natural Earth) и пресеты районов для быстрого перехода.
import { pointInPolygon, type V2 } from '../lib/math'

type Ring = [number, number][]
export interface Region {
  name: string
  polys: Ring[][]
}

const norm = (lon: number) => (lon < 0 ? lon + 360 : lon)

let cache: Promise<Region[]> | null = null
export function loadRegions(): Promise<Region[]> {
  cache ??= fetch(`${import.meta.env.BASE_URL}russia.json`)
    .then((r) => r.json())
    .then((fc) => {
      type F = { properties: { name: string | null }; geometry: { type: string; coordinates: unknown } | null }
      return (fc.features as F[])
        .filter((f) => f.geometry && f.properties.name)
        .map((f) => ({
          name: f.properties.name!,
          polys: (f.geometry!.type === 'Polygon' ? [f.geometry!.coordinates] : f.geometry!.coordinates) as Ring[][],
        }))
    })
  return cache
}

export async function regionAt(lon: number, lat: number): Promise<string> {
  const regions = await loadRegions()
  for (const r of regions) for (const poly of r.polys) if (pointInPolygon(norm(lon), lat, poly[0]!.map(([x, y]) => [norm(x), y] as V2))) return r.name
  return ''
}

export interface Preset {
  title: string
  sub: string
  region: string
  lon: number
  lat: number
}

export const PRESETS: Preset[] = [
  { title: 'Ставрополь', sub: 'Таманская лесная дача, Мамайский лес', region: 'Ставропольский край', lon: 41.93, lat: 45.03 },
  { title: 'Кисловодск', sub: 'леса Кавказских Минеральных Вод', region: 'Ставропольский край', lon: 42.8, lat: 43.88 },
  { title: 'Пятигорск · Бештау', sub: 'леса горы Бештау и Машука', region: 'Ставропольский край', lon: 43.05, lat: 44.06 },
  { title: 'Варнавино', sub: 'пилотный регион', region: 'Нижегородская область', lon: 45.15, lat: 57.42 },
  { title: 'Мураши', sub: 'южная тайга', region: 'Кировская область', lon: 48.95, lat: 59.42 },
  { title: 'Плесецк', sub: 'северная тайга', region: 'Архангельская область', lon: 40.3, lat: 62.72 },
  { title: 'Сегежа', sub: 'северная тайга', region: 'Республика Карелия', lon: 34.35, lat: 63.73 },
  { title: 'Богучаны', sub: 'Ангарский лесной район', region: 'Красноярский край', lon: 97.47, lat: 58.4 },
  { title: 'Усть-Илимск', sub: 'Ангарский лесной район', region: 'Иркутская область', lon: 102.7, lat: 58.0 },
]

/** Стартовый вид карты — Ставрополь. */
export const START_VIEW = { lon: 41.915, lat: 45.035, zoom: 13.4, pitch: 58, bearing: -18 }
