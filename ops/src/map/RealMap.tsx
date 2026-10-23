// Реальная карта: OSM + рельеф + спутниковые лес и рубки, 3D-лес и схематичные города только в видимой области.
// Клик — рамка района 12×8 км и сборка оперативной диорамы по тем же данным.
import { Boxes, Crosshair, Layers, MapPin, Mountain, X } from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { PRESETS, START_VIEW, regionAt, type Preset } from '../data/regions'
import { fmtCoord, useOps } from '../ops/store'
import { frameStats, RASTER_COLORS, registerProtocols, type FrameStats } from './rasters'
import { MAP_COLORS, mapStyle } from './style'
import { ForestLayer, TERRAIN_EXAG, TREES_MINZOOM, type TreeStats } from './trees'

const AREA = { widthKm: 12, heightKm: 8 }

const LOCALE: Record<string, string> = {
  'AttributionControl.ToggleAttribution': 'Источники данных',
  'NavigationControl.ResetBearing': 'Потяните, чтобы повернуть карту; клик — север вверх',
  'NavigationControl.ZoomIn': 'Приблизить',
  'NavigationControl.ZoomOut': 'Отдалить',
  'ScaleControl.Meters': 'м',
  'ScaleControl.Kilometers': 'км',
  'Map.Title': 'Карта',
}

interface Pick {
  lon: number
  lat: number
  region?: string
  stats?: FrameStats
}

/** Вид из ссылки #map=zoom/lat/lon/bearing/pitch (её же пишет MapLibre при движении карты).
 *  Читаем при загрузке модуля: удаление карты (StrictMode, HMR) стирает параметр из адреса. */
function viewFromHash() {
  const m = /map=([\d.-]+)\/([\d.-]+)\/([\d.-]+)(?:\/([\d.-]+))?(?:\/([\d.-]+))?/.exec(location.hash)
  if (!m) return START_VIEW
  return { zoom: Number(m[1]), lat: Number(m[2]), lon: Number(m[3]), bearing: Number(m[4] ?? 0), pitch: Number(m[5] ?? 0) }
}

let lastView = viewFromHash()

function frame(lon: number, lat: number): GeoJSON.FeatureCollection {
  const dLon = AREA.widthKm / 2 / (111.32 * Math.cos((lat * Math.PI) / 180))
  const dLat = AREA.heightKm / 2 / 110.54
  const ring = [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ]
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] }
}

const ha = (x: number) => `${(x < 10 ? Math.round(x * 10) / 10 : Math.round(x)).toLocaleString('ru-RU')} га`

function MapView() {
  const mode = useOps((s) => s.mode)
  const area = useOps((s) => s.area)
  const version = useOps((s) => s.version)
  const loadArea = useOps((s) => s.loadArea)
  const box = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const forestRef = useRef<ForestLayer | null>(null)
  const pickRef = useRef<Pick | null>(null)
  const shownVersion = useRef(0)
  const [pick, setPick] = useState<Pick | null>(null)
  const [stats, setStats] = useState<TreeStats>({ tiles: 0, trees: 0, loading: 0 })
  const [center, setCenter] = useState<{ region: string; lon: number; lat: number; zoom: number }>({ region: '', lon: START_VIEW.lon, lat: START_VIEW.lat, zoom: START_VIEW.zoom })
  const [layers, setLayers] = useState({ trees: true, cuttings: true, terrain: true })

  // попап следует за точкой без setState на каждом кадре
  const place = () => {
    const map = mapRef.current
    const p = pickRef.current
    const el = pop.current
    if (!map || !p || !el) return
    const pt = map.project([p.lon, p.lat])
    el.style.transform = `translate(${Math.round(pt.x)}px, ${Math.round(pt.y)}px)`
  }

  const select = (lon: number, lat: number) => {
    const p: Pick = { lon, lat }
    pickRef.current = p
    setPick(p)
    ;(mapRef.current?.getSource('frame') as maplibregl.GeoJSONSource | undefined)?.setData(frame(lon, lat))
    void Promise.all([regionAt(lon, lat).catch(() => ''), frameStats(lon, lat, AREA.widthKm, AREA.heightKm).catch(() => undefined)]).then(([region, st]) => {
      if (pickRef.current !== p) return
      const next = { ...p, region, stats: st }
      pickRef.current = next
      setPick(next)
    })
  }

  const clear = () => {
    pickRef.current = null
    setPick(null)
    ;(mapRef.current?.getSource('frame') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] })
  }

  useEffect(() => {
    registerProtocols()
    const view = lastView
    const map = new maplibregl.Map({
      container: box.current!,
      style: mapStyle(),
      center: [view.lon, view.lat],
      zoom: view.zoom,
      pitch: view.pitch,
      bearing: view.bearing,
      maxPitch: 70,
      hash: 'map',
      locale: LOCALE,
      canvasContextAttributes: { antialias: true },
      attributionControl: { compact: true, customAttribution: 'Рубки и лесистость: Hansen/UMD/Google/USGS/NASA' },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    const forest = new ForestLayer()
    forest.onStats = setStats
    forestRef.current = forest
    map.on('load', () => map.addLayer(forest, 'peaks'))
    map.on('click', (e) => select(e.lngLat.lng, e.lngLat.lat))
    map.on('move', place)
    const onMoveEnd = () => {
      const c = map.getCenter()
      void regionAt(c.lng, c.lat).then((region) => setCenter({ region, lon: c.lng, lat: c.lat, zoom: map.getZoom() }))
    }
    map.on('moveend', onMoveEnd)
    onMoveEnd()
    if (import.meta.env.DEV) Object.assign(window, { map, forest })
    return () => {
      const c = map.getCenter()
      lastView = { lon: c.lng, lat: c.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }
      map.remove()
      mapRef.current = null
    }
    // карта создаётся один раз; select/place работают через ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // возврат с диорамы: карта показывает собранный район
  useEffect(() => {
    const map = mapRef.current
    if (mode !== 'map' || !map) return
    map.resize()
    if (area && shownVersion.current !== version) {
      shownVersion.current = version
      map.jumpTo({ center: [area.spec.lon, area.spec.lat], zoom: 13.3, pitch: 58 })
      select(area.spec.lon, area.spec.lat)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, area, version])

  useEffect(() => place())

  const toggle = (k: keyof typeof layers) => {
    const map = mapRef.current
    const v = !layers[k]
    setLayers({ ...layers, [k]: v })
    if (!map) return
    if (k === 'trees') forestRef.current?.setEnabled(v)
    if (k === 'cuttings') map.setLayoutProperty('cuttings', 'visibility', v ? 'visible' : 'none')
    if (k === 'terrain') {
      map.setTerrain(v ? { source: 'dem', exaggeration: TERRAIN_EXAG } : null)
      forestRef.current?.setTerrain(v)
    }
  }

  const goto = (p: Preset) => {
    mapRef.current?.flyTo({ center: [p.lon, p.lat], zoom: 13.3, pitch: 58, bearing: -15, duration: 2600, essential: true })
    select(p.lon, p.lat)
  }

  const assemble = () => {
    if (!pick) return
    void loadArea({ lon: pick.lon, lat: pick.lat, ...AREA }, pick.region)
  }

  const groups = [...new Set(PRESETS.map((p) => p.region))]
  const tooFar = center.zoom < TREES_MINZOOM

  return (
    <div className={`map${mode === 'map' ? '' : ' map--hidden'}`}>
      <div ref={box} className="map__canvas" />

      <div className="map-head">
        <b>{center.region || 'Россия'}</b>
        <span>{fmtCoord([center.lon, center.lat])}</span>
      </div>

      <div className="map-hint">Клик по карте — выбрать район {AREA.widthKm}×{AREA.heightKm} км · правая кнопка — наклон и поворот</div>

      <div className="map-presets">
        <span className="tab-title">РАЙОНЫ</span>
        {groups.map((g) => (
          <div key={g} className="map-presets__group">
            <div className="h4">{g}</div>
            {PRESETS.filter((p) => p.region === g).map((p) => (
              <button key={p.title} type="button" className="preset" onClick={() => goto(p)}>
                <b>{p.title}</b>
                <span>{p.sub}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="map-legend">
        <div className="h4" style={{ marginTop: 0 }}>
          <Layers size={12} /> Слои
        </div>
        <div className="lg">
          <i style={{ background: MAP_COLORS.forest }} /> Лес: OSM + спутник (2000)
        </div>
        <div className="lg">
          <i style={{ background: MAP_COLORS.town }} /> Населённые пункты (схема)
        </div>
        <label className="lg lg--toggle">
          <input type="checkbox" checked={layers.cuttings} onChange={() => toggle('cuttings')} />
          <i style={{ background: RASTER_COLORS.fresh }} /> Рубки 2019–2024
        </label>
        <div className="lg lg--sub">
          <i style={{ background: RASTER_COLORS.mid }} /> 2011–2018 <i style={{ background: RASTER_COLORS.old, marginLeft: 8 }} /> 2001–2010
        </div>
        <label className="lg lg--toggle">
          <input type="checkbox" checked={layers.trees} onChange={() => toggle('trees')} />
          <Boxes size={13} /> 3D-деревья и здания
        </label>
        <label className="lg lg--toggle">
          <input type="checkbox" checked={layers.terrain} onChange={() => toggle('terrain')} />
          <Mountain size={13} /> Рельеф 3D
        </label>
        <div className="map-stats">
          {!layers.trees
            ? '3D-лес выключен'
            : tooFar
              ? 'Приблизьте карту — 3D-лес строится вблизи'
              : `В кадре ${stats.tiles} тайл. · ${stats.trees.toLocaleString('ru-RU')} деревьев${stats.loading ? ` · догружаем ${stats.loading}` : ''}`}
          <small>Загружается только видимая область</small>
        </div>
      </div>

      {pick && (
        <div ref={pop} className="map-pop">
          <div className="map-pop__card">
            <button type="button" className="map-pop__close" onClick={clear} title="Закрыть">
              <X size={16} />
            </button>
            <div className="map-pop__title">
              <MapPin size={15} /> {pick.region || 'Район'}
            </div>
            <div className="map-pop__coord">{fmtCoord([pick.lon, pick.lat])}</div>
            {pick.stats ? (
              <div className="stats">
                <div className="stat">
                  <b>{Math.round(pick.stats.forestShare * 100)} %</b>
                  <span>лесистость (спутник)</span>
                </div>
                <div className="stat">
                  <b>{ha(pick.stats.freshHa)}</b>
                  <span>рубки 2019–2024</span>
                </div>
              </div>
            ) : (
              <div className="map-pop__wait">Считаем лес и рубки в рамке…</div>
            )}
            <button type="button" className="action" onClick={assemble}>
              <Crosshair size={16} /> Собрать район {AREA.widthKm}×{AREA.heightKm} км
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Карта монтируется при первом открытии и дальше живёт скрытой — без повторной загрузки тайлов. */
export function RealMap() {
  const mode = useOps((s) => s.mode)
  const [mounted, setMounted] = useState(mode === 'map')
  useEffect(() => {
    if (mode === 'map') setMounted(true)
  }, [mode])
  return mounted ? <MapView /> : null
}
