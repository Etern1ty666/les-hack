// Тайловая математика и загрузка растров (рельеф, вырубки) с декодированием пикселей.

export function lonLatToTile(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z
  const x = ((lon + 180) / 360) * n
  const r = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  return [x, y]
}

export function tileToLonLat(x: number, y: number, z: number): [number, number] {
  const n = 2 ** z
  const lon = (x / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  return [lon, lat]
}

export interface Bbox {
  west: number
  south: number
  east: number
  north: number
}

/** Все тайлы уровня z, покрывающие bbox. */
export function tilesFor(b: Bbox, z: number): [number, number][] {
  const [x0, y0] = lonLatToTile(b.west, b.north, z)
  const [x1, y1] = lonLatToTile(b.east, b.south, z)
  const out: [number, number][] = []
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) out.push([x, y])
  return out
}

/** Пиксели PNG/JPG тайла (CORS у источников открыт). null — тайла нет. */
export async function loadPixels(url: string): Promise<Uint8ClampedArray | null> {
  const res = await fetch(url)
  if (!res.ok) return null
  const bmp = await createImageBitmap(await res.blob())
  const c = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  return ctx.getImageData(0, 0, bmp.width, bmp.height).data
}

/** Параллельная обработка с ограничением одновременных запросов. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, onDone?: (n: number) => void): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
      onDone?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
