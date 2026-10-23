// Обзор России: клик в любую точку — сборка диорамы района по реальным данным. Проекция Альберса.
import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { pointInPolygon, type V2 } from '../lib/math'
import { useOps } from '../ops/store'

type Ring = [number, number][]
interface Region {
  name: string
  polys: Ring[][]
}

const P1 = (50 * Math.PI) / 180, P2 = (70 * Math.PI) / 180, P0 = (56 * Math.PI) / 180, L0 = 100
const N = (Math.sin(P1) + Math.sin(P2)) / 2
const CC = Math.cos(P1) ** 2 + 2 * N * Math.sin(P1)
const R0 = Math.sqrt(CC - 2 * N * Math.sin(P0)) / N
const norm = (lon: number) => (lon < 0 ? lon + 360 : lon)
function project(lon: number, lat: number): V2 {
  const th = N * (((norm(lon) - L0) * Math.PI) / 180)
  const r = Math.sqrt(CC - 2 * N * Math.sin((lat * Math.PI) / 180)) / N
  return [r * Math.sin(th) * 1000, -(R0 - r * Math.cos(th)) * 1000]
}
function unproject(x: number, y: number): [number, number] {
  const px = x / 1000, py = -y / 1000
  const r = Math.hypot(px, R0 - py)
  const th = Math.atan2(px, R0 - py)
  const lat = (Math.asin((CC - r * r * N * N) / (2 * N)) * 180) / Math.PI
  let lon = L0 + ((th / N) * 180) / Math.PI
  if (lon > 180) lon -= 360
  return [lon, lat]
}

let cache: Region[] | null = null
async function loadRegions(): Promise<Region[]> {
  if (cache) return cache
  const fc = await (await fetch(`${import.meta.env.BASE_URL}russia.json`)).json()
  type F = { properties: { name: string | null }; geometry: { type: string; coordinates: unknown } | null }
  cache = (fc.features as F[])
    .filter((f) => f.geometry && f.properties.name)
    .map((f) => ({
      name: f.properties.name!,
      polys: (f.geometry!.type === 'Polygon' ? [f.geometry!.coordinates] : f.geometry!.coordinates) as Ring[][],
    }))
  return cache!
}

export async function regionAt(lon: number, lat: number): Promise<string> {
  const regions = await loadRegions()
  for (const r of regions) for (const poly of r.polys) if (pointInPolygon(norm(lon), lat, poly[0]!.map(([x, y]) => [norm(x), y] as V2))) return r.name
  return ''
}

export const PRESETS: { title: string; sub: string; lon: number; lat: number }[] = [
  { title: 'Варнавино', sub: 'Нижегородская область · пилотный регион', lon: 45.15, lat: 57.42 },
  { title: 'Мураши', sub: 'Кировская область', lon: 48.95, lat: 59.42 },
  { title: 'Плесецк', sub: 'Архангельская область', lon: 40.3, lat: 62.72 },
  { title: 'Сегежа', sub: 'Республика Карелия', lon: 34.35, lat: 63.73 },
  { title: 'Богучаны', sub: 'Красноярский край', lon: 97.47, lat: 58.4 },
  { title: 'Усть-Илимск', sub: 'Иркутская область', lon: 102.7, lat: 58.0 },
]

export function Overview() {
  const open = useOps((s) => s.overviewOpen)
  const setOverview = useOps((s) => s.setOverview)
  const loadArea = useOps((s) => s.loadArea)
  const current = useOps((s) => s.area?.spec)
  const [regions, setRegions] = useState<Region[]>([])
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null)
  const svg = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (open) void loadRegions().then(setRegions)
  }, [open])

  const { paths, viewBox } = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    const paths = regions.map((r) => {
      const d = r.polys
        .map((poly) =>
          poly
            .map((ring) =>
              ring
                .map(([lon, lat], i) => {
                  const [x, y] = project(lon, lat)
                  x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
                  return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
                })
                .join('') + 'Z',
            )
            .join(''),
        )
        .join('')
      return { name: r.name, d }
    })
    return { paths, viewBox: Number.isFinite(x0) ? `${x0 - 10} ${y0 - 10} ${x1 - x0 + 20} ${y1 - y0 + 20}` : '0 0 100 100' }
  }, [regions])

  if (!open) return null

  const pick = async (lon: number, lat: number) => {
    const region = await regionAt(lon, lat)
    void loadArea({ lon, lat, widthKm: 12, heightKm: 8 }, region)
  }

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const s = svg.current
    if (!s) return
    const pt = s.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(s.getScreenCTM()!.inverse())
    const [lon, lat] = unproject(p.x, p.y)
    void pick(lon, lat)
  }

  const cur = current ? project(current.lon, current.lat) : null
  return (
    <div className="overview">
      <div className="overview__head">
        <span className="overview__title">Выбор района</span>
        <span className="overview__hint">Кликните в любую точку России — диорама района 12×8 км соберётся из реальных данных: рельеф, леса и дороги OSM, вырубки Hansen GFC.</span>
        {current && (
          <button type="button" className="overview__close" onClick={() => setOverview(false)} title="Закрыть">
            <X size={22} />
          </button>
        )}
      </div>
      <div className="overview__body">
        <div style={{ position: 'relative', minHeight: 0 }}>
          <svg ref={svg} viewBox={viewBox} onClick={onClick} onMouseLeave={() => setHover(null)}>
            {paths.map((p) => (
              <path key={p.name} className="region" d={p.d} onMouseMove={(e) => setHover({ name: p.name, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })} />
            ))}
            {PRESETS.map((pr) => {
              const [x, y] = project(pr.lon, pr.lat)
              return <circle key={pr.title} cx={x} cy={y} r={7} fill="#f2b33d" stroke="#1b1e1c" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            })}
            {cur && <circle cx={cur[0]} cy={cur[1]} r={11} fill="none" stroke="#fff" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />}
          </svg>
          {hover && (
            <div className="overview__label" style={{ left: hover.x + 14, top: hover.y + 10 }}>
              {hover.name}
            </div>
          )}
        </div>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.title} type="button" className="preset" onClick={() => void pick(p.lon, p.lat)}>
              <b>{p.title}</b>
              <span>{p.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
