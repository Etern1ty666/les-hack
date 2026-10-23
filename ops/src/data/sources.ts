// Реальные источники: рельеф (terrarium DEM), OSM-векторы (OpenFreeMap), потеря леса по годам (Hansen GFC v1.12).
import { VectorTile } from '@mapbox/vector-tile'
import type { Geometry } from 'geojson'
import { PbfReader } from 'pbf'
import { loadPixels, lonLatToTile, pool, tilesFor, type Bbox } from './tiles'

export type Progress = (step: string, done: number, total: number) => void

export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
export const demUrl = (z: number, x: number, y: number) => DEM_TILES.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
export const coverUrl = (z: number, x: number, y: number) => `https://tiles.globalforestwatch.org/umd_tree_cover_density_2000/v1.8/tcd_30/${z}/${x}/${y}.png`
export const lossUrl = (z: number, x: number, y: number) => `https://storage.googleapis.com/earthenginepartners-hansen/tiles/gfc_v1.12/loss_year/${z}/${x}/${y}.png`

/** Год рубки по пикселю тайла Hansen loss_year: 0 — нет потери (серый 64,64,64 — вода/нет данных). */
export function lossYearOf(px: Uint8ClampedArray, i: number): number {
  const r = px[i * 4]!
  if (r === 0 || px[i * 4 + 2]! > 0) return 0
  return 2000 + Math.round((24 * px[i * 4 + 1]!) / r)
}

// ---------- Рельеф ----------
export const DEM_Z = 12

export interface Dem {
  /** Высота над уровнем моря, м. */
  sample(lon: number, lat: number): number
}

export async function loadDem(b: Bbox, progress: Progress): Promise<Dem> {
  const tiles = tilesFor(b, DEM_Z)
  const data = new Map<string, Float32Array>()
  await pool(
    tiles,
    6,
    async ([x, y]) => {
      const px = await loadPixels(demUrl(DEM_Z, x, y))
      const h = new Float32Array(256 * 256)
      if (px) for (let i = 0; i < h.length; i++) h[i] = px[i * 4]! * 256 + px[i * 4 + 1]! + px[i * 4 + 2]! / 256 - 32768
      data.set(`${x}/${y}`, h)
    },
    (n) => progress('Рельеф', n, tiles.length),
  )
  const at = (gx: number, gy: number) => {
    const tx = Math.floor(gx / 256)
    const ty = Math.floor(gy / 256)
    const t = data.get(`${tx}/${ty}`)
    if (!t) return 0
    return t[(gy - ty * 256) * 256 + (gx - tx * 256)]!
  }
  return {
    sample(lon, lat) {
      const [fx, fy] = lonLatToTile(lon, lat, DEM_Z)
      const gx = fx * 256 - 0.5
      const gy = fy * 256 - 0.5
      const x0 = Math.floor(gx)
      const y0 = Math.floor(gy)
      const tx = gx - x0
      const ty = gy - y0
      const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx
      const c = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx
      return a * (1 - ty) + c * ty
    },
  }
}

// ---------- Лесистость (спутник): UMD tree cover density 2000 ≥ 30 %, тайлы Global Forest Watch ----------
export interface TreeCover {
  has(lon: number, lat: number): boolean
}

export async function loadTreeCover(b: Bbox, progress: Progress): Promise<TreeCover> {
  const z = 12
  const tiles = tilesFor(b, z)
  const data = new Map<string, Uint8Array>()
  await pool(
    tiles,
    6,
    async ([x, y]) => {
      const px = await loadPixels(coverUrl(z, x, y))
      const m = new Uint8Array(256 * 256)
      if (px) for (let i = 0; i < m.length; i++) m[i] = px[i * 4 + 3]! > 0 ? 1 : 0
      data.set(`${x}/${y}`, m)
    },
    (n) => progress('Лесистость со спутника', n, tiles.length),
  )
  return {
    has(lon, lat) {
      const [fx, fy] = lonLatToTile(lon, lat, z)
      const tx = Math.floor(fx)
      const ty = Math.floor(fy)
      const m = data.get(`${tx}/${ty}`)
      if (!m) return false
      return m[Math.floor((fy - ty) * 256) * 256 + Math.floor((fx - tx) * 256)] === 1
    },
  }
}

// ---------- Потеря леса (год рубки) ----------
export const GFC_Z = 12

export interface LossPixel {
  gx: number
  gy: number
  year: number
}

export async function loadLoss(b: Bbox, progress: Progress): Promise<LossPixel[]> {
  const tiles = tilesFor(b, GFC_Z)
  const [bx0, by0] = lonLatToTile(b.west, b.north, GFC_Z)
  const [bx1, by1] = lonLatToTile(b.east, b.south, GFC_Z)
  const out: LossPixel[] = []
  await pool(
    tiles,
    6,
    async ([x, y]) => {
      const px = await loadPixels(lossUrl(GFC_Z, x, y))
      if (!px) return
      for (let i = 0; i < 256 * 256; i++) {
        // красный — интенсивность, зелёный/красный × 24 — год после 2000
        const year = lossYearOf(px, i)
        if (!year) continue
        const gx = x * 256 + (i % 256)
        const gy = y * 256 + Math.floor(i / 256)
        if (gx < bx0 * 256 || gx > bx1 * 256 || gy < by0 * 256 || gy > by1 * 256) continue
        out.push({ gx, gy, year })
      }
    },
    (n) => progress('Вырубки со спутника', n, tiles.length),
  )
  return out
}

// ---------- OSM-векторы ----------
export const VEC_Z = 13

export interface VecFeature {
  layer: string
  cls: string
  name?: string
  geometry: Geometry
}

let tileTemplate: string | null = null

export async function template(): Promise<string> {
  if (tileTemplate) return tileTemplate
  const tj = await (await fetch('https://tiles.openfreemap.org/planet')).json()
  tileTemplate = tj.tiles[0] as string
  return tileTemplate
}

export async function tileBytes(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url)
  if (!res.ok) return null
  let buf = new Uint8Array(await res.arrayBuffer())
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
    buf = new Uint8Array(await new Response(stream).arrayBuffer())
  }
  return buf
}

const LAYERS = new Set(['landcover', 'landuse', 'water', 'waterway', 'transportation', 'building', 'place'])

export async function loadVectors(b: Bbox, progress: Progress): Promise<VecFeature[]> {
  const tpl = await template()
  const tiles = tilesFor(b, VEC_Z)
  const out: VecFeature[] = []
  await pool(
    tiles,
    6,
    async ([x, y]) => {
      const bytes = await tileBytes(tpl.replace('{z}', String(VEC_Z)).replace('{x}', String(x)).replace('{y}', String(y)))
      if (!bytes) return
      const tile = new VectorTile(new PbfReader(bytes))
      for (const [name, layer] of Object.entries(tile.layers)) {
        if (!LAYERS.has(name)) continue
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i)
          const p = f.properties
          out.push({
            layer: name,
            cls: String(p.class ?? p.subclass ?? ''),
            name: (p['name:ru'] ?? p.name) as string | undefined,
            geometry: f.toGeoJSON(x, y, VEC_Z).geometry,
          })
        }
      }
    },
    (n) => progress('Леса, реки и дороги OSM', n, tiles.length),
  )
  return out
}
