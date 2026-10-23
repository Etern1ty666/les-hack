// Спутниковые растры для карты: декодирование тайлов с общим LRU-кэшем (подложка и 3D-лес берут одни данные)
// и протоколы podrost-cover:// и podrost-loss:// — перекраска лесистости и рубок в палитру оперативного центра.
import maplibregl from 'maplibre-gl'
import { RECENT_FROM } from '../data/build'
import { coverUrl, demUrl, lossUrl, lossYearOf } from '../data/sources'
import { decodePixels } from '../data/tiles'

class Lru<T> {
  private m = new Map<string, Promise<T>>()
  private max: number
  constructor(max: number) {
    this.max = max
  }
  get(key: string, load: () => Promise<T>): Promise<T> {
    let v = this.m.get(key)
    if (v) {
      this.m.delete(key)
      this.m.set(key, v)
      return v
    }
    v = load()
    // сетевой сбой не запоминаем — тайл запросится снова
    v.catch(() => this.m.get(key) === v && this.m.delete(key))
    this.m.set(key, v)
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value!)
    return v
  }
}

/** null — тайла у источника нет (404); прочие ошибки — исключение, чтобы повторить запрос позже. */
async function pixels(url: string): Promise<Uint8ClampedArray | null> {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return decodePixels(await res.blob())
}

const covers = new Lru<Uint8Array | null>(400)
const losses = new Lru<Uint8Array | null>(400)
const dems = new Lru<Float32Array | null>(160)

/** Маска лесистости 2000 г. (≥ 30 % сомкнутости): 1 — лес. */
export function coverTile(z: number, x: number, y: number) {
  return covers.get(`${z}/${x}/${y}`, async () => {
    const px = await pixels(coverUrl(z, x, y))
    if (!px) return null
    const m = new Uint8Array(256 * 256)
    for (let i = 0; i < m.length; i++) m[i] = px[i * 4 + 3]! > 0 ? 1 : 0
    return m
  })
}

/** Год рубки − 2000 по пикселям (0 — потери леса нет). */
export function lossTile(z: number, x: number, y: number) {
  return losses.get(`${z}/${x}/${y}`, async () => {
    const px = await pixels(lossUrl(z, x, y))
    if (!px) return null
    const m = new Uint8Array(256 * 256)
    for (let i = 0; i < m.length; i++) {
      const year = lossYearOf(px, i)
      if (year) m[i] = year - 2000
    }
    return m
  })
}

/** Высоты, м (terrarium). */
export function demTile(z: number, x: number, y: number) {
  return dems.get(`${z}/${x}/${y}`, async () => {
    const px = await pixels(demUrl(z, x, y))
    if (!px) return null
    const h = new Float32Array(256 * 256)
    for (let i = 0; i < h.length; i++) h[i] = px[i * 4]! * 256 + px[i * 4 + 1]! + px[i * 4 + 2]! / 256 - 32768
    return h
  })
}

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const RASTER_COLORS = {
  cover: '#56702e',
  fresh: '#e2772c',
  mid: '#c8b84e',
  old: '#9db654',
}

function parse(url: string): [number, number, number] {
  const [z, x, y] = url.replace(/^[a-z-]+:\/\//, '').split('/').map(Number) as [number, number, number]
  return [z, x, y]
}

async function paint(m: Uint8Array | null, color: (v: number) => [number, number, number, number] | null): Promise<ImageBitmap> {
  const img = new ImageData(256, 256)
  if (m) {
    const d = img.data
    for (let i = 0; i < m.length; i++) {
      if (!m[i]) continue
      const c = color(m[i]!)
      if (!c) continue
      d[i * 4] = c[0]
      d[i * 4 + 1] = c[1]
      d[i * 4 + 2] = c[2]
      d[i * 4 + 3] = c[3]
    }
  }
  return createImageBitmap(img)
}

let registered = false
export function registerProtocols() {
  if (registered) return
  registered = true
  const cover = [...rgb(RASTER_COLORS.cover), 255] as [number, number, number, number]
  const fresh = [...rgb(RASTER_COLORS.fresh), 255] as [number, number, number, number]
  const mid = [...rgb(RASTER_COLORS.mid), 235] as [number, number, number, number]
  const old = [...rgb(RASTER_COLORS.old), 220] as [number, number, number, number]
  maplibregl.addProtocol('podrost-cover', async (p) => ({ data: await paint(await coverTile(...parse(p.url)), () => cover) }))
  // свежие рубки 2019–2024 — оранжевые (под решение о лесовосстановлении), 2011–2018 — жёлтые, 2001–2010 — молодняк
  maplibregl.addProtocol('podrost-loss', async (p) => ({
    data: await paint(await lossTile(...parse(p.url)), (v) => (v + 2000 >= RECENT_FROM ? fresh : v > 10 ? mid : old)),
  }))
}

export interface FrameStats {
  forestShare: number
  freshHa: number
  oldHa: number
}

/** Лесистость и площадь рубок в рамке района (по растрам z12, те же данные, что и у диорамы). */
export async function frameStats(lon: number, lat: number, widthKm: number, heightKm: number): Promise<FrameStats> {
  const z = 12
  const n = 2 ** z
  const cos = Math.cos((lat * Math.PI) / 180)
  const dLon = widthKm / 2 / (111.32 * cos)
  const dLat = heightKm / 2 / 110.54
  const tx = (lo: number) => ((lo + 180) / 360) * n
  const ty = (la: number) => {
    const r = (la * Math.PI) / 180
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  }
  const [x0, x1, y0, y1] = [tx(lon - dLon), tx(lon + dLon), ty(lat + dLat), ty(lat - dLat)]
  const pxHa = ((40075016.686 * cos) / (256 * n)) ** 2 / 10000
  let total = 0
  let forest = 0
  let fresh = 0
  let old = 0
  const jobs: Promise<void>[] = []
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++)
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++)
      jobs.push(
        Promise.all([coverTile(z, x, y), lossTile(z, x, y)]).then(([c, l]) => {
          const u0 = Math.max(0, Math.floor((x0 - x) * 256))
          const u1 = Math.min(256, Math.ceil((x1 - x) * 256))
          const v0 = Math.max(0, Math.floor((y0 - y) * 256))
          const v1 = Math.min(256, Math.ceil((y1 - y) * 256))
          for (let v = v0; v < v1; v++)
            for (let u = u0; u < u1; u++) {
              const i = v * 256 + u
              total++
              if (c?.[i]) forest++
              const ly = l?.[i] ?? 0
              if (ly && ly + 2000 >= RECENT_FROM) fresh++
              else if (ly) old++
            }
        }, () => undefined),
      )
  await Promise.all(jobs)
  return { forestShare: total ? forest / total : 0, freshHa: fresh * pxHa, oldHa: old * pxHa }
}
