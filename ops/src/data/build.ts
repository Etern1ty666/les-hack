// «Скрипт» сборки района: по координатам загружает реальные данные и превращает их в низкополигональную диораму.
import type { Geometry, Position } from 'geojson'
import { decide, generateSurvey, type Decision, type Survey } from '../ops/engine'
import { clamp, distToSegment, lerp, makeNoise, mulberry32, pointInPolygon, rand, type V2 } from '../lib/math'
import { GFC_Z, loadDem, loadLoss, loadTreeCover, loadVectors, type Progress } from './sources'
import { tileToLonLat, type Bbox } from './tiles'

export const UNIT_M = 60 // 1 ед. сцены = 60 м
export const EXAG = 3 // вертикальное преувеличение рельефа
export const RECENT_FROM = 2019 // свежие рубки (последние ~6 лет) — под решение о лесовосстановлении

export interface AreaSpec {
  lon: number
  lat: number
  widthKm: number
  heightKm: number
}

export type TreeKind = 'spruce' | 'pine' | 'birch'
export interface Tree {
  x: number
  z: number
  y: number
  kind: TreeKind
  s: number
  rot: number
  tint: number
}

export interface Site {
  id: string
  index: number
  name: string
  year: number
  center: V2
  lonlat: [number, number]
  poly: V2[]
  angle: number
  w: number
  h: number
  areaHa: number
  survey: Survey
  decision: Decision
  stumps: { x: number; z: number; s: number }[]
  saplings: { x: number; z: number; good: boolean; s: number }[]
  plantSpots: V2[]
}

export interface RoadLine {
  cls: string
  pts: V2[]
  width: number
  paved: boolean
}
export interface Building {
  x: number
  z: number
  w: number
  d: number
  rot: number
  roof: number
}
export interface Place {
  name: string
  cls: string
  pos: V2
}

export interface Area {
  spec: AreaSpec
  W: number
  D: number
  toLocal(lon: number, lat: number): V2
  toLonLat(x: number, z: number): [number, number]
  heightAt(x: number, z: number): number
  groundAt(x: number, z: number): number
  colorAt(x: number, z: number, h: number, slope: number): [number, number, number]
  water: { rings: V2[][]; level: number }[]
  streams: { pts: V2[]; width: number }[]
  roads: RoadLine[]
  buildings: Building[]
  places: Place[]
  base: { pos: V2; name: string; place: string }
  sites: Site[]
  trees: Tree[]
  route(to: V2): V2[]
  stats: { forestShare: number; recentLossHa: number; oldLossHa: number; elevMin: number; elevMax: number }
}

// классы растра
const OPEN = 0, FOREST = 1, FARM = 2, WET = 3, TOWN = 4, WATER = 5

const hex = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const COL = {
  forestA: hex('#5f7633'),
  forestB: hex('#4c6430'),
  grass: hex('#8e9c4c'),
  grassB: hex('#a3a957'),
  farmA: hex('#b3ad6a'),
  farmB: hex('#a39f5c'),
  wet: hex('#6d8768'),
  town: hex('#a39a6c'),
  soilA: hex('#7a5d40'),
  soilB: hex('#8d7a4f'),
  young: hex('#7a9440'),
  bed: hex('#4f6b60'),
  rock: hex('#8a7c64'),
}

function convexHull(pts: V2[]): V2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: V2[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: V2[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop()
    upper.push(q)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function polygonsOf(g: Geometry): Position[][][] {
  if (g.type === 'Polygon') return [g.coordinates]
  if (g.type === 'MultiPolygon') return g.coordinates
  return []
}
function linesOf(g: Geometry): Position[][] {
  if (g.type === 'LineString') return [g.coordinates]
  if (g.type === 'MultiLineString') return g.coordinates
  return []
}

const ROAD_STYLE: Record<string, { width: number; paved: boolean }> = {
  motorway: { width: 1.5, paved: true },
  trunk: { width: 1.4, paved: true },
  primary: { width: 1.3, paved: true },
  secondary: { width: 1.15, paved: true },
  tertiary: { width: 1.0, paved: true },
  minor: { width: 0.8, paved: false },
  service: { width: 0.55, paved: false },
  track: { width: 0.6, paved: false },
}

export async function buildArea(spec: AreaSpec, progress: Progress): Promise<Area> {
  const W = Math.round((spec.widthKm * 1000) / UNIT_M)
  const D = Math.round((spec.heightKm * 1000) / UNIT_M)
  const cosLat = Math.cos((spec.lat * Math.PI) / 180)
  const toLocal = (lon: number, lat: number): V2 => [((lon - spec.lon) * 111320 * cosLat) / UNIT_M, (-(lat - spec.lat) * 110540) / UNIT_M]
  const toLonLat = (x: number, z: number): [number, number] => [spec.lon + (x * UNIT_M) / (111320 * cosLat), spec.lat - (z * UNIT_M) / 110540]
  const [west, north] = toLonLat(-W / 2 - 2, -D / 2 - 2)
  const [east, south] = toLonLat(W / 2 + 2, D / 2 + 2)
  const bbox: Bbox = { west, south, east, north }

  const [dem, loss, vec, cover] = await Promise.all([loadDem(bbox, progress), loadLoss(bbox, progress), loadVectors(bbox, progress), loadTreeCover(bbox, progress)])
  progress('Сборка диорамы', 0, 1)
  await new Promise((r) => setTimeout(r, 0))

  const rng = mulberry32(Math.round(spec.lon * 1000) * 7919 + Math.round(spec.lat * 1000))
  const n1 = makeNoise(11)
  const n2 = makeNoise(12)

  // --- растр 1×1 ед. ---
  const nx = W + 1
  const nz = D + 1
  const cls = new Uint8Array(nx * nz)
  const lossYear = new Uint16Array(nx * nz)
  const waterLevel = new Float32Array(nx * nz).fill(Number.NaN)
  const hRaw = new Float32Array(nx * nz)
  const idx = (x: number, z: number) => {
    const ix = clamp(Math.round(x + W / 2), 0, nx - 1)
    const iz = clamp(Math.round(z + D / 2), 0, nz - 1)
    return iz * nx + ix
  }
  let elevMin = Infinity
  let elevMax = -Infinity
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const [lon, lat] = toLonLat(ix - W / 2, iz - D / 2)
      const h = dem.sample(lon, lat)
      hRaw[iz * nx + ix] = h
      elevMin = Math.min(elevMin, h)
      elevMax = Math.max(elevMax, h)
    }
  }
  const toY = (m: number) => ((m - elevMin) / UNIT_M) * EXAG

  const localRings = (poly: Position[][]) => poly.map((ring) => ring.map(([lon, lat]) => toLocal(lon!, lat!)))
  const paint = (rings: V2[][], value: number, extra?: (i: number) => void) => {
    const outer = rings[0]!
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const [x, z] of outer) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z)
    }
    for (let iz = Math.max(0, Math.floor(z0 + D / 2)); iz <= Math.min(nz - 1, Math.ceil(z1 + D / 2)); iz++) {
      for (let ix = Math.max(0, Math.floor(x0 + W / 2)); ix <= Math.min(nx - 1, Math.ceil(x1 + W / 2)); ix++) {
        const x = ix - W / 2
        const z = iz - D / 2
        if (!pointInPolygon(x, z, outer) || rings.slice(1).some((h) => pointInPolygon(x, z, h))) continue
        cls[iz * nx + ix] = value
        extra?.(iz * nx + ix)
      }
    }
  }

  // порядок закраски: поля/луга → лес → посёлки → вода
  const LC: Record<string, number> = { farmland: FARM, grass: OPEN, wetland: WET, wood: FOREST }
  for (const pass of [[FARM, OPEN, WET], [FOREST]] as number[][]) {
    for (const f of vec) {
      if (f.layer !== 'landcover') continue
      const v = LC[f.cls]
      if (v === undefined || !pass.includes(v)) continue
      for (const poly of polygonsOf(f.geometry)) paint(localRings(poly), v)
    }
  }
  // спутниковая маска леса (2000 г.) дополняет OSM — в Сибири OSM-лес нарисован далеко не везде
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix
      if (cls[i] === FOREST || cls[i] === FARM) continue
      const [lon, lat] = toLonLat(ix - W / 2, iz - D / 2)
      if (cover.has(lon, lat)) cls[i] = FOREST
    }
  for (const f of vec) {
    if (f.layer === 'landuse' && (f.cls === 'residential' || f.cls === 'industrial' || f.cls === 'commercial')) {
      for (const poly of polygonsOf(f.geometry)) paint(localRings(poly), TOWN)
    }
  }
  const water: Area['water'] = []
  for (const f of vec) {
    if (f.layer !== 'water') continue
    for (const poly of polygonsOf(f.geometry)) {
      const rings = localRings(poly)
        .map((r) => clipRing(r, W / 2, D / 2))
        .filter((r) => r.length >= 3)
      if (rings.length === 0) continue
      const inside = rings[0]!
      const level = toY(Math.min(...inside.map(([x, z]) => hRaw[idx(x, z)]!)))
      water.push({ rings, level })
      paint(rings, WATER, (i) => {
        waterLevel[i] = Number.isNaN(waterLevel[i]!) ? level : Math.min(waterLevel[i]!, level)
      })
    }
  }

  // --- вырубки со спутника ---
  const pxM = (40075016.686 * cosLat) / (256 * 2 ** GFC_Z)
  const pxHa = (pxM * pxM) / 10000
  const lossPos = new Map<string, { pos: V2; year: number }>()
  let recentLossHa = 0
  let oldLossHa = 0
  for (const p of loss) {
    const [lon, lat] = tileToLonLat((p.gx + 0.5) / 256, (p.gy + 0.5) / 256, GFC_Z)
    const pos = toLocal(lon, lat)
    if (Math.abs(pos[0]) > W / 2 || Math.abs(pos[1]) > D / 2) continue
    const i = idx(pos[0], pos[1])
    lossYear[i] = Math.max(lossYear[i]!, p.year)
    lossPos.set(`${p.gx},${p.gy}`, { pos, year: p.year })
    if (p.year >= RECENT_FROM) recentLossHa += pxHa
    else oldLossHa += pxHa
  }

  // кластеры свежих рубок (8-связность) → лесосеки
  const seen = new Set<string>()
  const clusters: { pts: V2[]; years: number[] }[] = []
  for (const [key, v] of lossPos) {
    if (v.year < RECENT_FROM || seen.has(key)) continue
    const stack = [key]
    seen.add(key)
    const pts: V2[] = []
    const years: number[] = []
    while (stack.length) {
      const k = stack.pop()!
      const cur = lossPos.get(k)!
      pts.push(cur.pos)
      years.push(cur.year)
      const [gx, gy] = k.split(',').map(Number) as [number, number]
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const nk = `${gx + dx},${gy + dy}`
          const nv = lossPos.get(nk)
          if (nv && nv.year >= RECENT_FROM && !seen.has(nk)) {
            seen.add(nk)
            stack.push(nk)
          }
        }
    }
    clusters.push({ pts, years })
  }
  // крупные массивы рубок (в Сибири — сотни га) режем сеткой ≈ 700 м на отдельные лесосеки
  const maxPx = Math.round(45 / pxHa)
  const groups: { pts: V2[]; years: number[] }[] = []
  for (const c of clusters) {
    if (c.pts.length <= maxPx) {
      groups.push(c)
      continue
    }
    const cells = new Map<string, { pts: V2[]; years: number[] }>()
    c.pts.forEach((p, i) => {
      const k = `${Math.floor(p[0] / 12)},${Math.floor(p[1] / 12)}`
      const g = cells.get(k) ?? { pts: [], years: [] }
      g.pts.push(p)
      g.years.push(c.years[i]!)
      cells.set(k, g)
    })
    groups.push(...cells.values())
  }
  groups.sort((a, b) => b.pts.length - a.pts.length)
  clusters.length = 0
  clusters.push(...groups)

  const sites: Site[] = []
  const halfPx = pxM / UNIT_M / 2
  for (const c of clusters) {
    const areaHa = Math.round(c.pts.length * pxHa * 10) / 10
    if (areaHa < 1.5 || sites.length >= 32) break
    const inForest = c.pts.filter(([x, z]) => cls[idx(x, z)] === FOREST || cls[idx(x + 1, z)] === FOREST || cls[idx(x - 1, z)] === FOREST).length
    if (inForest < c.pts.length * 0.5) continue
    const expanded = c.pts.flatMap(([x, z]) => [[x - halfPx, z - halfPx], [x + halfPx, z - halfPx], [x + halfPx, z + halfPx], [x - halfPx, z + halfPx]] as V2[])
    const poly = convexHull(expanded)
    const cx = c.pts.reduce((s, p) => s + p[0], 0) / c.pts.length
    const cz = c.pts.reduce((s, p) => s + p[1], 0) / c.pts.length
    if (Math.abs(cx) > W / 2 - 3 || Math.abs(cz) > D / 2 - 3) continue
    // ориентация — главная ось облака пикселей
    let sxx = 0, szz = 0, sxz = 0
    for (const [x, z] of c.pts) {
      sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz)
    }
    const angle = 0.5 * Math.atan2(2 * sxz, sxx - szz)
    const ca = Math.cos(angle), sa = Math.sin(angle)
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const [x, z] of poly) {
      const u = (x - cx) * ca + (z - cz) * sa
      const v = -(x - cx) * sa + (z - cz) * ca
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
    }
    const year = c.years.sort((a, b) => a - b)[Math.floor(c.years.length / 2)]!
    const index = sites.length + 1
    const survey = generateSurvey(mulberry32(index * 7717 + Math.round(cx * 31)), false, (year - 2022) * 0.08)
    const site: Site = {
      id: `S${index}`,
      index,
      name: `Лесосека ${index}`,
      year,
      center: [cx, cz],
      lonlat: toLonLat(cx, cz),
      poly,
      angle,
      w: u1 - u0,
      h: v1 - v0,
      areaHa,
      survey,
      decision: decide(survey, areaHa),
      stumps: [],
      saplings: [],
      plantSpots: [],
    }
    decorateSite(site, [cx + ((u0 + u1) / 2) * ca - ((v0 + v1) / 2) * sa, cz + ((u0 + u1) / 2) * sa + ((v0 + v1) / 2) * ca], rng)
    sites.push(site)
  }

  // --- дороги, реки-линии, постройки, населённые пункты ---
  const within = ([x, z]: V2) => Math.abs(x) <= W / 2 + 1 && Math.abs(z) <= D / 2 + 1
  const clipLine = (pts: V2[]) => clipPolyline(pts, W / 2 - 0.3, D / 2 - 0.3)
  const roads: RoadLine[] = []
  const streams: Area['streams'] = []
  const buildings: Building[] = []
  const placesMap = new Map<string, Place>()
  for (const f of vec) {
    if (f.layer === 'transportation') {
      const st = ROAD_STYLE[f.cls]
      if (!st) continue
      for (const line of linesOf(f.geometry)) {
        const pts = line.map(([lon, lat]) => toLocal(lon!, lat!))
        for (const part of clipLine(pts)) roads.push({ cls: f.cls, pts: part, ...st })
      }
    } else if (f.layer === 'waterway') {
      const width = f.cls === 'river' ? 1.3 : f.cls === 'canal' ? 0.9 : f.cls === 'stream' ? 0.45 : 0
      if (!width) continue
      for (const line of linesOf(f.geometry)) {
        const pts = line.map(([lon, lat]) => toLocal(lon!, lat!))
        for (const part of clipLine(pts)) streams.push({ pts: part, width })
      }
    } else if (f.layer === 'building' && buildings.length < 1600) {
      for (const poly of polygonsOf(f.geometry)) {
        const ring = poly[0]!.map(([lon, lat]) => toLocal(lon!, lat!))
        const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
        const cz = ring.reduce((s, p) => s + p[1], 0) / ring.length
        if (!within([cx, cz])) continue
        let best = 0, rot = 0
        for (let i = 0; i < ring.length - 1; i++) {
          const l = Math.hypot(ring[i + 1]![0] - ring[i]![0], ring[i + 1]![1] - ring[i]![1])
          if (l > best) {
            best = l
            rot = Math.atan2(ring[i + 1]![1] - ring[i]![1], ring[i + 1]![0] - ring[i]![0])
          }
        }
        const c = Math.cos(rot), s = Math.sin(rot)
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
        for (const [x, z] of ring) {
          const a = (x - cx) * c + (z - cz) * s
          const b = -(x - cx) * s + (z - cz) * c
          a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b)
        }
        // дома в масштабе 60 м/ед. крошечные — стилизованно увеличиваем
        buildings.push({ x: cx, z: cz, w: Math.max(0.42, (a1 - a0) * 2.2), d: Math.max(0.34, (b1 - b0) * 2.2), rot, roof: Math.floor(rng() * 4) })
      }
    } else if (f.layer === 'place' && f.name && f.geometry.type === 'Point') {
      if (!['city', 'town', 'village', 'hamlet', 'suburb'].includes(f.cls)) continue
      const pos = toLocal(f.geometry.coordinates[0]!, f.geometry.coordinates[1]!)
      if (within(pos)) placesMap.set(f.name, { name: f.name, cls: f.cls, pos })
    }
  }
  const places = [...placesMap.values()]
  const rank = (c: string) => (c === 'city' ? 0 : c === 'town' ? 1 : c === 'village' ? 2 : 3)
  const baseHost = [...places].sort((a, b) => rank(a.cls) - rank(b.cls) || Math.hypot(...a.pos) - Math.hypot(...b.pos))[0]
  const base = { pos: baseHost?.pos ?? ([0, 0] as V2), name: baseHost ? `Лесничество · ${baseHost.name}` : 'Лесничество', place: baseHost?.name ?? '' }

  // --- высоты и цвета ---
  const bilinear = (arr: Float32Array, x: number, z: number) => {
    const gx = clamp(x + W / 2, 0, nx - 1.001)
    const gz = clamp(z + D / 2, 0, nz - 1.001)
    const x0 = Math.floor(gx), z0 = Math.floor(gz)
    const tx = gx - x0, tz = gz - z0
    const a = arr[z0 * nx + x0]! * (1 - tx) + arr[z0 * nx + x0 + 1]! * tx
    const b = arr[(z0 + 1) * nx + x0]! * (1 - tx) + arr[(z0 + 1) * nx + x0 + 1]! * tx
    return a * (1 - tz) + b * tz
  }
  const groundAt = (x: number, z: number) => toY(bilinear(hRaw, x, z))
  const heightAt = (x: number, z: number) => {
    const g = groundAt(x, z)
    const wl = waterLevel[idx(x, z)]!
    return Number.isNaN(wl) ? g : Math.min(g, wl - 0.3)
  }
  const siteAt = (x: number, z: number) => sites.find((s) => Math.hypot(s.center[0] - x, s.center[1] - z) < Math.max(s.w, s.h) && pointInPolygon(x, z, s.poly))
  const colorAt = (x: number, z: number, _h: number, slope: number): [number, number, number] => {
    const i = idx(x, z)
    const c = cls[i]!
    if (c === WATER) return COL.bed
    if (siteAt(x, z)) return mix(COL.soilA, COL.soilB, (n2(x * 0.4, z * 0.4) + 1) / 2)
    const ly = lossYear[i]!
    if (ly && c === FOREST) return ly >= RECENT_FROM ? mix(COL.soilA, COL.young, 0.45) : COL.young
    if (slope > 0.35) return COL.rock
    if (c === FOREST) return mix(COL.forestA, COL.forestB, (n2(x * 0.15, z * 0.15) + 1) / 2)
    if (c === FARM) return mix(COL.farmA, COL.farmB, (n1(x * 0.3, z * 0.05) + 1) / 2)
    if (c === WET) return COL.wet
    if (c === TOWN) return COL.town
    return mix(COL.grass, COL.grassB, (n1(x * 0.08, z * 0.08) + 1) / 2)
  }

  // --- маска дорог для леса ---
  const roadMask = new Uint8Array(nx * nz)
  for (const r of roads) {
    const reach = r.width / 2 + 1.0
    for (let k = 0; k < r.pts.length - 1; k++) {
      const a = r.pts[k]!, b = r.pts[k + 1]!
      for (let iz = Math.max(0, Math.floor(Math.min(a[1], b[1]) - reach + D / 2)); iz <= Math.min(nz - 1, Math.ceil(Math.max(a[1], b[1]) + reach + D / 2)); iz++)
        for (let ix = Math.max(0, Math.floor(Math.min(a[0], b[0]) - reach + W / 2)); ix <= Math.min(nx - 1, Math.ceil(Math.max(a[0], b[0]) + reach + W / 2)); ix++)
          if (distToSegment(ix - W / 2, iz - D / 2, a, b) < reach) roadMask[iz * nx + ix] = 1
    }
  }

  // --- лес по реальным границам ---
  const trees: Tree[] = []
  const step = 1.45
  let forestCells = 0
  for (let i = 0; i < cls.length; i++) if (cls[i] === FOREST) forestCells++
  for (let x = -W / 2 + 0.5; x <= W / 2 - 0.5; x += step) {
    for (let z = -D / 2 + 0.5; z <= D / 2 - 0.5; z += step) {
      const px = x + rand(rng, -0.6, 0.6)
      const pz = z + rand(rng, -0.6, 0.6)
      const i = idx(px, pz)
      const c = cls[i]!
      if (c === WATER || c === TOWN || roadMask[i]) continue
      const ly = lossYear[i]!
      if (ly >= RECENT_FROM) continue // свежая вырубка — поляна
      if (siteAt(px, pz)) continue
      let young = false
      if (c !== FOREST) {
        if (!(c === OPEN || c === WET) || rng() > 0.05) continue // редкие деревья на лугах
      } else if (ly) young = true // старая рубка → молодняк
      const grove = n2(px * 0.05 - 40, pz * 0.05)
      const kind: TreeKind = young ? (rng() < 0.6 ? 'birch' : 'pine') : grove > 0.35 ? (rng() < 0.75 ? 'birch' : 'spruce') : grove < -0.3 ? 'pine' : rng() < 0.8 ? 'spruce' : 'birch'
      const s = young ? rand(rng, 0.45, 0.75) : rand(rng, 0.8, 1.25)
      trees.push({ x: px, z: pz, y: heightAt(px, pz), kind, s, rot: rand(rng, 0, Math.PI * 2), tint: rand(rng, -1, 1) })
    }
  }

  // --- граф дорог для маршрутов бригад ---
  const key = ([x, z]: V2) => `${Math.round(x * 3)},${Math.round(z * 3)}`
  const nodes = new Map<string, { p: V2; edges: { to: string; w: number }[] }>()
  const node = (p: V2) => {
    const k = key(p)
    if (!nodes.has(k)) nodes.set(k, { p, edges: [] })
    return k
  }
  for (const r of roads) {
    for (let k = 0; k < r.pts.length - 1; k++) {
      const a = node(r.pts[k]!)
      const b = node(r.pts[k + 1]!)
      const w = Math.hypot(r.pts[k + 1]![0] - r.pts[k]![0], r.pts[k + 1]![1] - r.pts[k]![1]) * (r.paved ? 0.8 : 1)
      nodes.get(a)!.edges.push({ to: b, w })
      nodes.get(b)!.edges.push({ to: a, w })
    }
  }
  let startKey: string | null = null
  let bestD = Infinity
  for (const [k, n] of nodes) {
    const d = Math.hypot(n.p[0] - base.pos[0], n.p[1] - base.pos[1])
    if (d < bestD) {
      bestD = d
      startKey = k
    }
  }
  // Дейкстра от базы (простая куча)
  const dist = new Map<string, number>()
  const prev = new Map<string, string>()
  if (startKey) {
    dist.set(startKey, 0)
    const heap = new MinHeap()
    heap.push(0, startKey)
    while (heap.size) {
      const [d, k] = heap.pop()
      if (d > (dist.get(k) ?? Infinity)) continue
      for (const e of nodes.get(k)!.edges) {
        const nd = d + e.w
        if (nd < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, nd)
          prev.set(e.to, k)
          heap.push(nd, e.to)
        }
      }
    }
  }
  const route = (to: V2): V2[] => {
    let best: string | null = null
    let bd = Infinity
    for (const k of dist.keys()) {
      const p = nodes.get(k)!.p
      const d = Math.hypot(p[0] - to[0], p[1] - to[1])
      if (d < bd) {
        bd = d
        best = k
      }
    }
    if (!best) return [base.pos, to]
    const path: V2[] = []
    for (let k: string | undefined = best; k; k = prev.get(k)) path.push(nodes.get(k)!.p)
    path.reverse()
    return [base.pos, ...path, to]
  }

  progress('Сборка диорамы', 1, 1)
  return {
    spec,
    W,
    D,
    toLocal,
    toLonLat,
    heightAt,
    groundAt,
    colorAt,
    water,
    streams,
    roads,
    buildings,
    places,
    base,
    sites,
    trees,
    route,
    stats: { forestShare: forestCells / cls.length, recentLossHa, oldLossHa, elevMin, elevMax },
  }
}

/** Обрезка ломаной прямоугольником |x|≤hx, |z|≤hz: части внутри (концы на границе). */
function clipPolyline(pts: V2[], hx: number, hz: number): V2[][] {
  const out: V2[][] = []
  let cur: V2[] = []
  const inside = ([x, z]: V2) => Math.abs(x) <= hx && Math.abs(z) <= hz
  const cut = (a: V2, b: V2): V2 => {
    // точка пересечения отрезка a→b с границей (a внутри, b снаружи или наоборот)
    let t = 1
    for (const [ax, bx, lim] of [[a[0], b[0], hx], [a[1], b[1], hz]] as const) {
      for (const L of [lim, -lim]) {
        if ((ax - L) * (bx - L) < 0) t = Math.min(t, (L - ax) / (bx - ax))
      }
    }
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const prev = pts[i - 1]
    if (inside(p)) {
      if (prev && !inside(prev)) cur.push(cut(p, prev))
      cur.push(p)
    } else if (prev && inside(prev)) {
      cur.push(cut(prev, p))
      if (cur.length > 1) out.push(cur)
      cur = []
    }
  }
  if (cur.length > 1) out.push(cur)
  return out
}

/** Сазерленд — Ходжман: кольцо полигона, обрезанное прямоугольником. */
function clipRing(ring: V2[], hx: number, hz: number): V2[] {
  let pts = ring
  const edges: [(p: V2) => boolean, (a: V2, b: V2) => V2][] = [
    [(p) => p[0] >= -hx, (a, b) => [-hx, a[1] + ((b[1] - a[1]) * (-hx - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= hx, (a, b) => [hx, a[1] + ((b[1] - a[1]) * (hx - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= -hz, (a, b) => [a[0] + ((b[0] - a[0]) * (-hz - a[1])) / (b[1] - a[1]), -hz]],
    [(p) => p[1] <= hz, (a, b) => [a[0] + ((b[0] - a[0]) * (hz - a[1])) / (b[1] - a[1]), hz]],
  ]
  for (const [ins, inter] of edges) {
    const res: V2[] = []
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i]!
      const prev = pts[(i + pts.length - 1) % pts.length]!
      if (ins(cur)) {
        if (!ins(prev)) res.push(inter(prev, cur))
        res.push(cur)
      } else if (ins(prev)) res.push(inter(prev, cur))
    }
    pts = res
    if (!pts.length) break
  }
  return pts
}

class MinHeap {
  private a: [number, string][] = []
  get size() {
    return this.a.length
  }
  push(p: number, v: string) {
    const a = this.a
    a.push([p, v])
    let i = a.length - 1
    while (i > 0) {
      const j = (i - 1) >> 1
      if (a[j]![0] <= a[i]![0]) break
      ;[a[i], a[j]] = [a[j]!, a[i]!]
      i = j
    }
  }
  pop(): [number, string] {
    const a = this.a
    const top = a[0]!
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l]![0] < a[m]![0]) m = l
        if (r < a.length && a[r]![0] < a[m]![0]) m = r
        if (m === i) break
        ;[a[i], a[m]] = [a[m]!, a[i]!]
        i = m
      }
    }
    return top
  }
}

/** Пни, подрост по данным осмотра и ряды будущей посадки внутри контура лесосеки. */
function decorateSite(site: Site, boxCenter: V2, rng: () => number) {
  const inside = (x: number, z: number) => pointInPolygon(x, z, site.poly)
  const c = Math.cos(site.angle), s = Math.sin(site.angle)
  const local = (u: number, v: number): V2 => [boxCenter[0] + u * c - v * s, boxCenter[1] + u * s + v * c]
  const sample = (): V2 | null => {
    for (let i = 0; i < 25; i++) {
      const p = local((rng() - 0.5) * site.w, (rng() - 0.5) * site.h)
      if (inside(p[0], p[1])) return p
    }
    return null
  }
  const area = Math.max(4, site.areaHa / 0.36) // ед.² (1 ед.² = 0,36 га)
  for (let i = 0; i < Math.round(area * 0.35); i++) {
    const p = sample()
    if (p) site.stumps.push({ x: p[0], z: p[1], s: 0.6 + rng() * 0.5 })
  }
  const d = site.decision
  const cells: V2[] = []
  for (let u = -site.w / 2; u < site.w / 2; u += 1.5)
    for (let v = -site.h / 2; v < site.h / 2; v += 1.5) {
      const p = local(u + 0.75, v + 0.75)
      if (inside(p[0], p[1]) && rng() < d.occurrence) cells.push(p)
    }
  for (let i = 0; i < Math.round(area * 0.3 * Math.min(d.ratio, 1.6)) && cells.length; i++) {
    const cell = cells[Math.floor(rng() * cells.length)]!
    const p: V2 = [cell[0] + (rng() - 0.5) * 1.4, cell[1] + (rng() - 0.5) * 1.4]
    if (inside(p[0], p[1])) site.saplings.push({ x: p[0], z: p[1], good: true, s: 0.5 + rng() * 0.6 })
  }
  for (let i = 0; i < Math.round(area * 0.35 * d.undesired); i++) {
    const p = sample()
    if (p) site.saplings.push({ x: p[0], z: p[1], good: false, s: 0.5 + rng() * 0.7 })
  }
  for (let v = -site.h / 2 + 0.5; v < site.h / 2 - 0.3; v += 0.9)
    for (let u = -site.w / 2 + 0.4; u < site.w / 2 - 0.3; u += 0.7) {
      const p = local(u, v)
      if (inside(p[0], p[1])) site.plantSpots.push(p)
    }
}
