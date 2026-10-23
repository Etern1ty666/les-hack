// «Скрипт» 3D-леса поверх реальной карты: строим деревья только для тайлов в кадре (z14).
// Маска леса = OSM (wood) ∪ спутник (лесистость 2000) − дома, дороги, вода, свежие рубки; старые рубки → молодняк.
// Деревья — низкополигональные инстансы three.js в общем GL-контексте MapLibre; дальние тайлы прорежены.
import { VectorTile } from '@mapbox/vector-tile'
import maplibregl, { type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from 'maplibre-gl'
import { PbfReader } from 'pbf'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RECENT_FROM } from '../data/build'
import { template, tileBytes } from '../data/sources'
import { makeNoise, mulberry32, rand } from '../lib/math'
import { coverTile, demTile, lossTile } from './rasters'

export const TREES_MINZOOM = 13
export const TERRAIN_EXAG = 1.5
const TZ = 14 // зум тайлов леса (максимальный у OpenFreeMap)
const RZ = 12 // зум спутниковых растров и рельефа
const SPACING = 24 // м между деревьями
const MAX_TILES = 48
const CACHE_TILES = 140
const CONCURRENCY = 4
const K = 7 // модели деревьев в «единицах диорамы» → метры

type Kind = 'spruce' | 'pine' | 'birch' | 'oak'
const KINDS: Kind[] = ['spruce', 'pine', 'birch', 'oak']

// ---------- модели ----------
function part(g: THREE.BufferGeometry, color: string) {
  const ng = (g.index ? g.toNonIndexed() : g).clone()
  ng.deleteAttribute('uv')
  ng.computeVertexNormals()
  const c = new THREE.Color(color)
  const n = ng.getAttribute('position').count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return ng
}
const cone = (r: number, h: number, y: number) => new THREE.ConeGeometry(r, h, 6, 1, true).translate(0, y, 0)
const blob = (r: number, sx: number, sy: number, x: number, y: number, z: number) => new THREE.IcosahedronGeometry(r, 0).scale(sx, sy, sx).translate(x, y, z)
const trunk = (h: number, r: number) => new THREE.CylinderGeometry(r * 0.8, r, h, 5, 1, true).translate(0, h / 2, 0)
// тень — тёмный шестиугольник, смещённый от солнца (свет с северо-запада)
const shadow = (r: number) => new THREE.CircleGeometry(r, 6).rotateX(-Math.PI / 2).translate(0.35 * r, 0.06, 0.35 * r)

const MODELS: Record<Kind, { parts: [THREE.BufferGeometry, string][]; colors: string[] }> = {
  spruce: {
    parts: [
      [cone(1.05, 1.4, 1.0), '#2c5236'],
      [cone(0.82, 1.2, 1.75), '#2c5236'],
      [cone(0.55, 1.0, 2.45), '#2c5236'],
      [trunk(1.0, 0.13), '#5d4330'],
      [shadow(1.1), '#24301a'],
    ],
    colors: ['#2c5236', '#335c3b', '#284a31'],
  },
  pine: {
    parts: [
      [blob(0.85, 1.05, 0.75, 0, 2.35, 0), '#4b7038'],
      [blob(0.55, 1, 1, 0.35, 2.0, 0.2), '#4b7038'],
      [trunk(2.0, 0.11), '#8a5a3a'],
      [shadow(0.95), '#24301a'],
    ],
    colors: ['#4b7038', '#557a3c', '#436634'],
  },
  birch: {
    parts: [
      [blob(0.8, 0.95, 1.25, 0, 2.0, 0), '#b8b04a'],
      [trunk(1.6, 0.09), '#e3dfd2'],
      [shadow(0.85), '#24301a'],
    ],
    colors: ['#b8b04a', '#9fae47', '#c9a53e', '#86a043'],
  },
  oak: {
    parts: [
      [blob(1.0, 1.25, 0.8, 0, 1.95, 0), '#4f7330'],
      [blob(0.7, 1, 0.9, 0.55, 2.35, -0.3), '#4f7330'],
      [blob(0.6, 1, 0.9, -0.5, 2.2, 0.35), '#4f7330'],
      [trunk(1.5, 0.16), '#5a4331'],
      [shadow(1.3), '#24301a'],
    ],
    colors: ['#4f7330', '#5b7d33', '#46682c', '#7c8a36'],
  },
}

const MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true })
let geoms: Record<Kind, THREE.BufferGeometry> | null = null
function geometries() {
  geoms ??= Object.fromEntries(KINDS.map((k) => [k, mergeGeometries(MODELS[k].parts.map(([g, c]) => part(g, c)))!.scale(K, K, K)])) as Record<Kind, THREE.BufferGeometry>
  return geoms
}
// цвет инстанса — отношение варианта кроны к базовому цвету модели
const tints: Record<Kind, THREE.Color[]> = Object.fromEntries(
  KINDS.map((k) => {
    const base = new THREE.Color(MODELS[k].colors[0])
    return [k, MODELS[k].colors.map((c) => new THREE.Color(c).multiply(new THREE.Color(1 / base.r, 1 / base.g, 1 / base.b)))]
  }),
) as Record<Kind, THREE.Color[]>

// ---------- породы по зонам ----------
const grove = makeNoise(41)
function pickKind(lat: number, gx: number, gz: number, r: number, young: boolean): Kind {
  const n = grove(gx / 900, gz / 900)
  if (lat < 48) {
    // степь, предгорья Кавказа: дуб, граб, бук; сосновые посадки
    if (young) return r < 0.5 ? 'birch' : 'oak'
    return n > 0.5 ? 'pine' : 'oak'
  }
  if (lat < 55.5) {
    if (young) return r < 0.6 ? 'birch' : 'pine'
    return n > 0.4 ? 'pine' : n < -0.35 ? 'oak' : r < 0.55 ? 'birch' : 'spruce'
  }
  if (young) return r < 0.6 ? 'birch' : 'pine'
  return n > 0.35 ? (r < 0.75 ? 'birch' : 'spruce') : n < -0.3 ? 'pine' : r < 0.8 ? 'spruce' : 'birch'
}

// ---------- маска тайла ----------
const ROAD_PX: Record<string, number> = { motorway: 4.5, trunk: 4, primary: 3.5, secondary: 3, tertiary: 2.6, minor: 2, service: 1.4, track: 1.2, rail: 2 }
const BUILT = new Set(['residential', 'commercial', 'industrial', 'retail', 'railway', 'quarry', 'garages', 'military'])

let canvas: OffscreenCanvas | null = null

async function osmMask(x: number, y: number): Promise<Uint8Array> {
  const tpl = await template()
  const bytes = await tileBytes(tpl.replace('{z}', String(TZ)).replace('{x}', String(x)).replace('{y}', String(y)))
  canvas ??= new OffscreenCanvas(256, 256)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 256, 256)
  const mask = new Uint8Array(256 * 256) // бит 1 — лес OSM, бит 2 — исключение
  if (!bytes) return mask
  const tile = new VectorTile(new PbfReader(bytes))
  const path = (f: ReturnType<VectorTile['layers'][string]['feature']>, k: number) => {
    ctx.beginPath()
    for (const ring of f.loadGeometry()) {
      ring.forEach((p, i) => (i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k)))
      if (f.type === 3) ctx.closePath()
    }
  }
  const each = (name: string, fn: (f: ReturnType<VectorTile['layers'][string]['feature']>, k: number) => void) => {
    const layer = tile.layers[name]
    if (!layer) return
    const k = 256 / layer.extent
    for (let i = 0; i < layer.length; i++) fn(layer.feature(i), k)
  }
  ctx.fillStyle = '#f00'
  each('landcover', (f, k) => {
    if (f.properties.class !== 'wood' || f.type !== 3) return
    path(f, k)
    ctx.fill('evenodd')
  })
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = '#0f0'
  ctx.strokeStyle = '#0f0'
  ctx.lineCap = 'round'
  each('landuse', (f, k) => {
    if (f.type !== 3 || !BUILT.has(String(f.properties.class))) return
    path(f, k)
    ctx.fill('evenodd')
  })
  for (const name of ['water', 'building']) {
    each(name, (f, k) => {
      if (f.type !== 3) return
      path(f, k)
      ctx.fill('evenodd')
    })
  }
  each('transportation', (f, k) => {
    const w = ROAD_PX[String(f.properties.class)]
    if (!w || f.type !== 2) return
    path(f, k)
    ctx.lineWidth = w
    ctx.stroke()
  })
  each('waterway', (f, k) => {
    if (f.type !== 2) return
    path(f, k)
    ctx.lineWidth = f.properties.class === 'river' ? 3 : 1.2
    ctx.stroke()
  })
  const px = ctx.getImageData(0, 0, 256, 256).data
  for (let i = 0; i < mask.length; i++) mask[i] = (px[i * 4]! > 127 ? 1 : 0) | (px[i * 4 + 1]! > 127 ? 2 : 0)
  return mask
}

// ---------- тайл с деревьями ----------
interface TreeTile {
  key: string
  ox: number // меркатор, северо-западный угол
  oy: number
  s: number // единиц Меркатора в метре
  group: THREE.Group
  meshes: THREE.InstancedMesh[]
  trees: number
  used: number
}

const tileLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI

async function buildTile(x: number, y: number, exag: number): Promise<TreeTile> {
  const px = x >> (TZ - RZ)
  const py = y >> (TZ - RZ)
  const sub = 256 >> (TZ - RZ) // 64 пикселя растра на тайл
  const sx = (x - (px << (TZ - RZ))) * sub
  const sy = (y - (py << (TZ - RZ))) * sub
  const [osm, cover, loss, dem] = await Promise.all([osmMask(x, y), coverTile(RZ, px, py), lossTile(RZ, px, py), demTile(RZ, px, py)])

  const n = 2 ** TZ
  const ox = x / n
  const oy = y / n
  const lat = tileLat(y + 0.5, TZ)
  const tileM = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / n
  const s = 1 / n / tileM
  const at = (u: number, v: number) => Math.min(sy + Math.floor(v / 4), 255) * 256 + Math.min(sx + Math.floor(u / 4), 255)
  const elev = (u: number, v: number) => {
    if (!dem) return 0
    const gx = Math.min(sx + u / 4 - 0.5, 254.999)
    const gy = Math.min(sy + v / 4 - 0.5, 254.999)
    const x0 = Math.max(0, Math.floor(gx))
    const y0 = Math.max(0, Math.floor(gy))
    const tx = Math.max(0, gx - x0)
    const ty = Math.max(0, gy - y0)
    const a = dem[y0 * 256 + x0]! * (1 - tx) + dem[y0 * 256 + x0 + 1]! * tx
    const b = dem[(y0 + 1) * 256 + x0]! * (1 - tx) + dem[(y0 + 1) * 256 + x0 + 1]! * tx
    return a * (1 - ty) + b * ty
  }

  const rng = mulberry32((x * 73856093) ^ (y * 19349663))
  const cells = Math.floor(tileM / SPACING)
  const step = tileM / cells
  const lists: Record<Kind, number[]> = { spruce: [], pine: [], birch: [], oak: [] }
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const lx = (i + 0.5 + rand(rng, -0.4, 0.4)) * step
      const lz = (j + 0.5 + rand(rng, -0.4, 0.4)) * step
      const u = (lx / tileM) * 256
      const v = (lz / tileM) * 256
      const m = osm[Math.min(255, Math.floor(v)) * 256 + Math.min(255, Math.floor(u))]!
      if (m & 2) continue
      const k = at(u, v)
      if (!(m & 1) && !cover?.[k]) continue
      const ly = loss?.[k] ?? 0
      if (ly && ly + 2000 >= RECENT_FROM) continue // свежая рубка — поляна
      const young = ly > 0
      const r = rng()
      const kind = pickKind(lat, x * tileM + lx, y * tileM + lz, r, young)
      const sc = young ? rand(rng, 0.45, 0.7) : rand(rng, 0.8, 1.2)
      // на полтора метра в землю — чтобы на склонах не было зазора
      lists[kind].push(lx, elev(u, v) * exag - 1.5, lz, rand(rng, 0, Math.PI * 2), sc, Math.floor(rng() * 16))
    }
  }

  const group = new THREE.Group()
  group.matrixAutoUpdate = false
  const meshes: THREE.InstancedMesh[] = []
  const g = geometries()
  const o = new THREE.Object3D()
  let trees = 0
  for (const kind of KINDS) {
    const L = lists[kind]
    const count = L.length / 6
    if (!count) continue
    // перемешиваем порядок: усечение count прореживает лес равномерно
    const order = Array.from({ length: count }, (_, i) => i)
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[order[i], order[j]] = [order[j]!, order[i]!]
    }
    const mesh = new THREE.InstancedMesh(g[kind], MATERIAL, count)
    order.forEach((src, i) => {
      o.position.set(L[src * 6]!, L[src * 6 + 1]!, L[src * 6 + 2]!)
      o.rotation.set(0, L[src * 6 + 3]!, 0)
      o.scale.setScalar(L[src * 6 + 4]!)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      const t = tints[kind]
      mesh.setColorAt(i, t[L[src * 6 + 5]! % t.length]!)
    })
    mesh.userData.full = count
    mesh.computeBoundingSphere()
    mesh.matrixAutoUpdate = false
    group.add(mesh)
    meshes.push(mesh)
    trees += count
  }
  return { key: `${x}/${y}`, ox, oy, s, group, meshes, trees, used: 0 }
}

export interface TreeStats {
  tiles: number
  trees: number
  loading: number
}

/** Пользовательский слой MapLibre: 3D-лес только для видимой области. */
export class ForestLayer implements CustomLayerInterface {
  readonly id = 'podrost-trees'
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const
  private map!: MlMap
  private renderer!: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.Camera()
  private tiles = new Map<string, TreeTile>()
  private pending = new Map<string, number>() // ключ → приоритет
  private inflight = new Set<string>()
  private wanted: string[] = []
  private dirty = true
  private frame = 0
  private tmp = new THREE.Matrix4()
  enabled = true
  private exag = TERRAIN_EXAG
  onStats?: (s: TreeStats) => void

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true })
    this.renderer.autoClear = false
    this.camera.matrixAutoUpdate = false
    // ось Z «мира» — вверх, Y — на юг (Меркатор): свет с северо-запада, сверху
    const sun = new THREE.DirectionalLight('#fff3dc', 2.4)
    sun.position.set(-0.55, -0.75, 1.2)
    const sky = new THREE.HemisphereLight('#eef4e6', '#5a5842', 1.5)
    sky.position.set(0, 0, 1)
    this.scene.add(sun, sky)
    map.on('move', this.markDirty)
    map.on('resize', this.markDirty)
  }

  onRemove() {
    window.clearTimeout(this.reportTimer)
    this.map.off('move', this.markDirty)
    this.map.off('resize', this.markDirty)
    for (const t of this.tiles.values()) for (const m of t.meshes) m.dispose()
    this.tiles.clear()
    this.renderer.dispose()
  }

  setEnabled(v: boolean) {
    this.enabled = v
    this.dirty = true
    this.map?.triggerRepaint()
  }

  /** Рельеф включён/выключен: высоты деревьев запечены в инстансы — пересобираем тайлы (растры в кэше). */
  setTerrain(on: boolean) {
    this.exag = on ? TERRAIN_EXAG : 0
    for (const t of this.tiles.values()) for (const m of t.meshes) m.dispose()
    this.tiles.clear()
    this.dirty = true
    this.map?.triggerRepaint()
  }

  private markDirty = () => {
    this.dirty = true
  }

  private update() {
    this.dirty = false
    const map = this.map
    if (!this.enabled || map.getZoom() < TREES_MINZOOM) {
      this.wanted = []
      this.pending.clear()
      this.report()
      return
    }
    const c = maplibregl.MercatorCoordinate.fromLngLat(map.getCenter())
    const n = 2 ** TZ
    // с рельефом видимость тайлов считаем по реальным высотам, иначе ближние тайлы у подножия камеры теряются
    const ids = map.coveringTiles({ tileSize: 256, minzoom: TZ, maxzoom: TZ, terrain: map.terrain ?? undefined } as Parameters<MlMap['coveringTiles']>[0])
    const seen = new Set<string>()
    const list: { key: string; x: number; y: number; d: number }[] = []
    for (const id of ids) {
      const { x, y } = id.canonical
      const key = `${x}/${y}`
      if (seen.has(key)) continue
      seen.add(key)
      list.push({ key, x, y, d: Math.hypot(x + 0.5 - c.x * n, y + 0.5 - c.y * n) })
    }
    list.sort((a, b) => a.d - b.d)
    const top = list.slice(0, MAX_TILES)
    this.wanted = top.map((t) => t.key)
    this.pending.clear()
    top.forEach((t, i) => {
      if (!this.tiles.has(t.key) && !this.inflight.has(t.key)) this.pending.set(t.key, i)
    })
    this.pump()
    this.report()
  }

  private pump() {
    while (this.inflight.size < CONCURRENCY && this.pending.size) {
      let best: string | null = null
      let bp = Infinity
      for (const [k, p] of this.pending) if (p < bp) [best, bp] = [k, p]
      this.pending.delete(best!)
      this.inflight.add(best!)
      const [x, y] = best!.split('/').map(Number) as [number, number]
      const exag = this.exag
      void buildTile(x, y, exag)
        .then((t) => {
          if (exag !== this.exag) {
            this.dirty = true
            return
          }
          this.tiles.set(t.key, t)
          this.evict()
        })
        .catch(() => {
          // сетевой сбой: повторим, когда карта снова попросит этот тайл
          window.setTimeout(() => {
            this.dirty = true
            this.map.triggerRepaint()
          }, 3000)
        })
        .finally(() => {
          this.inflight.delete(best!)
          this.pump()
          this.report()
          this.map.triggerRepaint()
        })
    }
  }

  private evict() {
    if (this.tiles.size <= CACHE_TILES) return
    const want = new Set(this.wanted)
    const old = [...this.tiles.values()].filter((t) => !want.has(t.key)).sort((a, b) => a.used - b.used)
    for (const t of old.slice(0, this.tiles.size - CACHE_TILES)) {
      for (const m of t.meshes) m.dispose()
      this.tiles.delete(t.key)
    }
  }

  private reportTimer = 0
  // статистика для интерфейса — не чаще 4 раз в секунду
  private report() {
    if (this.reportTimer) return
    this.reportTimer = window.setTimeout(() => {
      this.reportTimer = 0
      this.emitStats()
    }, 250)
  }

  private emitStats() {
    let trees = 0
    let tiles = 0
    for (const k of this.wanted) {
      const t = this.tiles.get(k)
      if (!t) continue
      tiles++
      trees += t.trees
    }
    this.onStats?.({ tiles, trees, loading: this.inflight.size + this.pending.size })
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (this.dirty) this.update()
    if (!this.wanted.length) return
    this.frame++
    // матрица проекции «относительно центра кадра» — без потери точности float32 на крупных зумах
    const c = maplibregl.MercatorCoordinate.fromLngLat(this.map.getCenter())
    this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix as ArrayLike<number>).multiply(this.tmp.makeTranslation(c.x, c.y, 0))
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()
    this.scene.children.filter((o) => o instanceof THREE.Group).forEach((o) => this.scene.remove(o))
    this.wanted.forEach((key, rank) => {
      const t = this.tiles.get(key)
      if (!t) return
      t.used = this.frame
      // дальние тайлы прорежены
      const frac = rank < 14 ? 1 : rank < 28 ? 0.55 : 0.3
      for (const m of t.meshes) m.count = Math.ceil((m.userData.full as number) * frac)
      // локальные оси тайла: x — восток, y — вверх, z — юг (метры) → Меркатор
      t.group.matrix.set(t.s, 0, 0, t.ox - c.x, 0, 0, t.s, t.oy - c.y, 0, t.s, 0, 0, 0, 0, 0, 1)
      t.group.matrixWorldNeedsUpdate = true
      this.scene.add(t.group)
    })
    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)
  }
}
