// Процедурный лесной район: рельеф с горами по краям, река, озеро, дороги от лесничества, лесосеки, лес.
import { decide, generateSurvey, type Decision, type Survey } from '../game/engine'
import {
  clamp,
  distToPolyline,
  lerp,
  makeNoise,
  mulberry32,
  pointAlong,
  pointInPolygon,
  polylineLength,
  rand,
  randInt,
  smoothPath,
  smoothstep,
  type V2,
} from '../lib/math'

export const W = 180
export const D = 120
export const WATER_Y = -0.45
export const HA_PER_UNIT2 = 0.0625 // 1 ед. = 25 м → 625 м² = 0,0625 га

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

export interface Road {
  id: number
  points: V2[]
  parent: { road: number; index: number } | null
}

export interface Building {
  kind: 'office' | 'house' | 'garage' | 'shed' | 'tower' | 'logs'
  x: number
  z: number
  rot: number
}

export interface Site {
  id: string
  index: number
  name: string
  quarter: number
  plot: number
  center: V2
  poly: V2[]
  angle: number
  w: number
  h: number
  areaHa: number
  approach: V2[]
  survey: Survey
  decision: Decision
  stumps: { x: number; z: number; s: number }[]
  saplings: { x: number; z: number; good: boolean; s: number }[]
  plantSpots: V2[]
  burnt: boolean
}

export interface EventSpot {
  pos: V2
  approach: V2[]
}

export interface World {
  heightAt: (x: number, z: number) => number
  colorAt: (x: number, z: number, h: number, slope: number) => [number, number, number]
  river: V2[]
  roads: Road[]
  base: V2
  buildings: Building[]
  nurseryBeds: { x: number; z: number; w: number; d: number }[]
  sites: Site[]
  trees: Tree[]
  spots: EventSpot[]
  makeBurntSite: (spot: V2, index: number) => Site
}

const hex = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
]

const C = {
  waterBed: hex('#5d7466'),
  sand: hex('#b5a473'),
  grassA: hex('#6c7d3a'),
  grassB: hex('#56692f'),
  meadow: hex('#93a050'),
  soilA: hex('#7a5d40'),
  soilB: hex('#8d7a4f'),
  burnt: hex('#2d2925'),
  rockA: hex('#857660'),
  rockB: hex('#6f6454'),
  rockLight: hex('#a59c8b'),
  snow: hex('#eef0ea'),
  village: hex('#9b9264'),
}

export function generateWorld(seed = 7): World {
  const rng = mulberry32(seed)
  const n1 = makeNoise(seed + 1)
  const n2 = makeNoise(seed + 2)
  const n3 = makeNoise(seed + 3)

  // --- река, озеро, база ---
  const river: V2[] = []
  for (let z = -D / 2 - 6; z <= D / 2 + 6; z += 2) {
    river.push([26 + 14 * Math.sin(z * 0.05) + 5 * Math.sin(z * 0.13 + 1), z])
  }
  const lake: V2 = [-36, 25]
  const base: V2 = [-54, 4]

  const rimWidth = (x: number, z: number) => 24 + 6 * n3(x * 0.03, z * 0.03)
  const edgeDist = (x: number, z: number) => Math.min(W / 2 - Math.abs(x), D / 2 - Math.abs(z))

  const heightAt = (x: number, z: number) => {
    let h = 1.2 + n1(x * 0.025, z * 0.025) * 1.2 + n2(x * 0.07 + 100, z * 0.07) * 0.4
    const e = edgeDist(x, z)
    const rw = rimWidth(x, z)
    if (e < rw) {
      const t = (rw - e) / rw
      h += Math.pow(t, 1.7) * (20 + 10 * n2(x * 0.04 + 50, z * 0.04))
    }
    const dr = distToPolyline(x, z, river)
    if (dr < 3.4) h = lerp(h, -1.4, smoothstep(1 - dr / 3.4))
    // озеро с неровным берегом
    const dl = Math.hypot(x - lake[0], z - lake[1]) * (1 + 0.3 * n3(x * 0.12 + 7, z * 0.12))
    if (dl < 9) h = lerp(h, -1.3, smoothstep(clamp((9 - dl) / 2.5, 0, 1)))
    const dv = Math.hypot(x - base[0], z - base[1])
    if (dv < 15) h = lerp(h, 0.7, smoothstep(clamp((15 - dv) / 5, 0, 1)))
    return h
  }

  // --- дороги (дерево веток от лесничества) ---
  const ctrl: { pts: V2[]; parent: { road: number; at: V2 } | null }[] = [
    { pts: [[-46, 4], [-24, 2], [-4, 6], [14, 2], [32, -2], [50, 2], [64, -4]], parent: null },
    { pts: [[-24, 2], [-22, -12], [-30, -26], [-44, -33]], parent: { road: 0, at: [-24, 2] } },
    { pts: [[-4, 6], [-2, 18], [-14, 29], [-26, 35]], parent: { road: 0, at: [-4, 6] } },
    { pts: [[32, -2], [37, -15], [50, -26], [61, -33]], parent: { road: 0, at: [32, -2] } },
    { pts: [[14, 2], [19, 15], [31, 26], [50, 33]], parent: { road: 0, at: [14, 2] } },
    { pts: [[-46, 4], [-56, 16], [-62, 30]], parent: { road: 0, at: [-46, 4] } },
    { pts: [[-14, 29], [-6, 34], [6, 37]], parent: { road: 2, at: [-14, 29] } },
  ]
  const roads: Road[] = []
  ctrl.forEach((c, id) => {
    const wiggled = c.pts.map((p, i) =>
      i === 0 ? p : ([p[0] + n3(p[0] * 0.2, p[1] * 0.2) * 2, p[1] + n3(p[1] * 0.2, p[0] * 0.2) * 2] as V2),
    )
    const points = smoothPath(wiggled, 1.2)
    let parent: Road['parent'] = null
    if (c.parent) {
      const pr = roads[c.parent.road]!
      let best = 0
      let bestD = Infinity
      pr.points.forEach((p, i) => {
        const d = Math.hypot(p[0] - c.parent!.at[0], p[1] - c.parent!.at[1])
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      parent = { road: c.parent.road, index: best }
      points[0] = pr.points[best]!
    }
    roads.push({ id, points, parent })
  })

  const pathTo = (roadId: number, index: number): V2[] => {
    const r = roads[roadId]!
    const own = r.points.slice(0, index + 1)
    if (!r.parent) return own
    return [...pathTo(r.parent.road, r.parent.index), ...own.slice(1)]
  }

  const roadDist = (x: number, z: number) => {
    let d = Infinity
    for (const r of roads) d = Math.min(d, distToPolyline(x, z, r.points))
    return d
  }

  // --- постройки лесничества ---
  const buildings: Building[] = [
    { kind: 'office', x: base[0] - 1, z: base[1] - 5, rot: 0 },
    { kind: 'house', x: base[0] - 8, z: base[1] - 3, rot: 0.2 },
    { kind: 'house', x: base[0] - 7, z: base[1] + 4, rot: -0.1 },
    { kind: 'house', x: base[0] + 3, z: base[1] - 9, rot: 0.4 },
    { kind: 'garage', x: base[0] + 5, z: base[1] - 4, rot: 0 },
    { kind: 'shed', x: base[0] - 2, z: base[1] + 7, rot: Math.PI / 2 },
    { kind: 'logs', x: base[0] + 2, z: base[1] + 9, rot: 0.3 },
    { kind: 'logs', x: base[0] + 5, z: base[1] + 8, rot: -0.2 },
    { kind: 'tower', x: base[0] - 11, z: base[1] - 10, rot: 0 },
  ]
  const nurseryBeds = Array.from({ length: 4 }, (_, i) => ({ x: base[0] - 10 + i * 3.2, z: base[1] + 11, w: 2.4, d: 5 }))

  // --- лесосеки вдоль дорог ---
  const sites: Site[] = []
  const surveyRng = mulberry32(seed + 99)
  const tryPlaceSite = (roadId: number, s: number, side: number): boolean => {
    const r = roads[roadId]!
    const { p, dir } = pointAlong(r.points, s)
    const nx = -dir[1] * side
    const nz = dir[0] * side
    const w = rand(rng, 9, 14)
    const h = rand(rng, 6, 9)
    const off = h / 2 + rand(rng, 2.6, 4.5)
    const center: V2 = [p[0] + nx * off, p[1] + nz * off]
    const angle = Math.atan2(dir[1], dir[0])
    const corners: V2[] = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([lx, lz]) => [center[0] + lx! * dir[0] - lz! * dir[1], center[1] + lx! * dir[1] + lz! * dir[0]] as V2)
    const probe = [center, ...corners]
    for (const [x, z] of probe) {
      if (edgeDist(x, z) < rimWidth(x, z) + 2) return false
      if (heightAt(x, z) < WATER_Y + 0.7) return false
      if (Math.hypot(x - base[0], z - base[1]) < 20) return false
      if (roadDist(x, z) < 1.4) return false
    }
    for (const o of sites) if (Math.hypot(o.center[0] - center[0], o.center[1] - center[1]) < 15) return false

    const index = sites.length + 1
    const survey = generateSurvey(surveyRng)
    const areaHa = Math.round(w * h * HA_PER_UNIT2 * 10) / 10
    // ближайшая точка дороги — точка съезда
    let attach = 0
    let bestD = Infinity
    r.points.forEach((q, i) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1])
      if (d < bestD) {
        bestD = d
        attach = i
      }
    })
    const approach = [...pathTo(roadId, attach), center]
    const site: Site = {
      id: `S${index}`,
      index,
      name: `Лесосека ${index}`,
      quarter: randInt(rng, 12, 148),
      plot: randInt(rng, 1, 34),
      center,
      poly: corners,
      angle,
      w,
      h,
      areaHa,
      approach,
      survey,
      decision: decide(survey, areaHa),
      stumps: [],
      saplings: [],
      plantSpots: [],
      burnt: false,
    }
    decorateSite(site, rng)
    sites.push(site)
    return true
  }

  roads.forEach((r, id) => {
    const L = polylineLength(r.points)
    for (let s = 8; s < L - 4; s += rand(rng, 10, 16)) {
      tryPlaceSite(id, s, rng() < 0.5 ? 1 : -1) || tryPlaceSite(id, s, 1) || tryPlaceSite(id, s, -1)
    }
  })

  // --- лес ---
  const trees: Tree[] = []
  const step = 1.45
  for (let x = -W / 2; x <= W / 2; x += step) {
    for (let z = -D / 2; z <= D / 2; z += step) {
      const px = x + rand(rng, -0.6, 0.6)
      const pz = z + rand(rng, -0.6, 0.6)
      const h = heightAt(px, pz)
      if (h < WATER_Y + 0.35) continue
      const e = edgeDist(px, pz)
      const rw = rimWidth(px, pz)
      if (e < 3) continue
      if (h > 17) continue // голые вершины
      const meadow = n1(px * 0.06 + 30, pz * 0.06)
      if (meadow < -0.55 && e > rw) continue
      if (e < rw && rng() < 0.35 + 0.5 * ((rw - e) / rw)) continue // на склонах реже
      if (Math.hypot(px - base[0], pz - base[1]) < 15) continue
      if (Math.hypot(px - lake[0], pz - lake[1]) < 10) continue
      const rd = roadDist(px, pz)
      if (rd < 2.5) continue // кроны не должны закрывать дорогу и УАЗы на ней
      if (sites.some((st) => insideExpanded(px, pz, st, 0.8))) continue
      const grove = n2(px * 0.05 - 40, pz * 0.05)
      const kind: TreeKind = e < rw ? (rng() < 0.6 ? 'spruce' : 'pine') : grove > 0.35 ? (rng() < 0.75 ? 'birch' : 'spruce') : grove < -0.3 ? 'pine' : rng() < 0.82 ? 'spruce' : 'birch'
      const near = rd < 4 ? 0.85 : 1 // у дороги деревья ниже
      trees.push({ x: px, z: pz, y: h, kind, s: rand(rng, 0.8, 1.3) * near, rot: rand(rng, 0, Math.PI * 2), tint: rand(rng, -1, 1) })
    }
  }

  // --- точки для случайных событий (пожары, самовольные рубки) ---
  const spots: EventSpot[] = []
  roads.forEach((r, id) => {
    for (let i = 6; i < r.points.length - 2; i += 9) {
      const p = r.points[i]!
      const q = r.points[i + 1]!
      const dir: V2 = [q[0] - p[0], q[1] - p[1]]
      const len = Math.hypot(dir[0], dir[1]) || 1
      const side = rng() < 0.5 ? 1 : -1
      const off = rand(rng, 7, 11)
      const pos: V2 = [p[0] - (dir[1] / len) * side * off, p[1] + (dir[0] / len) * side * off]
      if (heightAt(pos[0], pos[1]) < WATER_Y + 0.6) continue
      if (edgeDist(pos[0], pos[1]) < rimWidth(pos[0], pos[1])) continue
      if (sites.some((st) => Math.hypot(st.center[0] - pos[0], st.center[1] - pos[1]) < 11)) continue
      spots.push({ pos, approach: [...pathTo(id, i), pos] })
    }
  })

  const colorAt = (x: number, z: number, h: number, slope: number): [number, number, number] => {
    if (h < WATER_Y - 0.1) return C.waterBed
    if (h < WATER_Y + 0.4) return C.sand
    const e = edgeDist(x, z)
    if (h > 19 + n2(x * 0.1, z * 0.1) * 2) return C.snow
    if (h > 7 || slope > 0.3) return h > 13 ? C.rockLight : mix(C.rockA, C.rockB, (n3(x * 0.2, z * 0.2) + 1) / 2)
    if (Math.hypot(x - base[0], z - base[1]) < 13) return C.village
    for (const st of sites) {
      if (pointInPolygon(x, z, st.poly)) return st.burnt ? C.burnt : mix(C.soilA, C.soilB, (n3(x * 0.4, z * 0.4) + 1) / 2)
    }
    const m = n1(x * 0.06 + 30, z * 0.06)
    if (m < -0.55 && e > rimWidth(x, z)) return mix(C.meadow, C.grassA, 0.3)
    return mix(C.grassA, C.grassB, (n2(x * 0.15, z * 0.15) + 1) / 2)
  }

  const makeBurntSite = (spot: V2, index: number): Site => {
    const rngB = mulberry32(seed * 31 + index)
    const r = 5.5
    const poly: V2[] = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2
      const rr = r * rand(rngB, 0.8, 1.15)
      return [spot[0] + Math.cos(a) * rr, spot[1] + Math.sin(a) * rr] as V2
    })
    const survey = generateSurvey(rngB, true)
    const areaHa = Math.round(Math.PI * r * r * HA_PER_UNIT2 * 10) / 10
    const s = spots.find((sp) => sp.pos[0] === spot[0] && sp.pos[1] === spot[1])
    const site: Site = {
      id: `S${index}`,
      index,
      name: `Гарь ${index}`,
      quarter: randInt(rngB, 12, 148),
      plot: randInt(rngB, 1, 34),
      center: spot,
      poly,
      angle: 0,
      w: r * 2,
      h: r * 2,
      areaHa,
      approach: s?.approach ?? [base, spot],
      survey,
      decision: decide(survey, areaHa),
      stumps: [],
      saplings: [],
      plantSpots: [],
      burnt: true,
    }
    decorateSite(site, rngB)
    return site
  }

  return { heightAt, colorAt, river, roads, base, buildings, nurseryBeds, sites, trees, spots, makeBurntSite }
}

function insideExpanded(x: number, z: number, st: Site, margin: number) {
  // перевод в локальные координаты прямоугольника/круга
  if (st.burnt) return Math.hypot(x - st.center[0], z - st.center[1]) < st.w / 2 + margin
  const dx = x - st.center[0]
  const dz = z - st.center[1]
  const c = Math.cos(st.angle)
  const s = Math.sin(st.angle)
  const lx = dx * c + dz * s
  const lz = -dx * s + dz * c
  return Math.abs(lx) < st.w / 2 + margin && Math.abs(lz) < st.h / 2 + margin
}

/** Пни, подрост (по данным осмотра) и места будущей посадки рядами. */
function decorateSite(site: Site, rng: () => number) {
  const inside = (x: number, z: number) => pointInPolygon(x, z, site.poly)
  const area = site.w * site.h
  const samplePoint = (): V2 => {
    for (let i = 0; i < 30; i++) {
      const p: V2 = [site.center[0] + (rng() - 0.5) * site.w * 1.1, site.center[1] + (rng() - 0.5) * site.h * 1.1]
      if (inside(p[0], p[1])) return p
    }
    return site.center
  }
  const stumps = Math.round(area * (site.burnt ? 0.45 : 0.3))
  for (let i = 0; i < stumps; i++) {
    const [x, z] = samplePoint()
    site.stumps.push({ x, z, s: 0.7 + rng() * 0.6 })
  }
  // подрост кучнее при низкой встречаемости: занимаем долю occurrence клеток 2×2
  const d = site.decision
  const cells: V2[] = []
  for (let gx = -site.w / 2; gx < site.w / 2; gx += 2) {
    for (let gz = -site.h / 2; gz < site.h / 2; gz += 2) {
      const c = Math.cos(site.angle)
      const s = Math.sin(site.angle)
      const cx = site.center[0] + (gx + 1) * c - (gz + 1) * s
      const cz = site.center[1] + (gx + 1) * s + (gz + 1) * c
      if (inside(cx, cz) && rng() < d.occurrence) cells.push([cx, cz])
    }
  }
  const goodCount = Math.round(area * 0.28 * Math.min(d.ratio, 1.6))
  for (let i = 0; i < goodCount && cells.length > 0; i++) {
    const cell = cells[Math.floor(rng() * cells.length)]!
    const x = cell[0] + (rng() - 0.5) * 1.8
    const z = cell[1] + (rng() - 0.5) * 1.8
    if (inside(x, z)) site.saplings.push({ x, z, good: true, s: 0.6 + rng() * 0.7 })
  }
  const badCount = Math.round(area * 0.35 * d.undesired)
  for (let i = 0; i < badCount; i++) {
    const [x, z] = samplePoint()
    site.saplings.push({ x, z, good: false, s: 0.6 + rng() * 0.8 })
  }
  // ряды посадки вдоль длинной стороны
  const c = Math.cos(site.angle)
  const s = Math.sin(site.angle)
  for (let lz = -site.h / 2 + 0.7; lz < site.h / 2 - 0.4; lz += 1.05) {
    for (let lx = -site.w / 2 + 0.6; lx < site.w / 2 - 0.4; lx += 0.85) {
      const x = site.center[0] + lx * c - lz * s
      const z = site.center[1] + lx * s + lz * c
      if (inside(x, z)) site.plantSpots.push([x, z])
    }
  }
}
