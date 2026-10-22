// Карта-глобус (add-strategic-map, группа задач 1: спайк, сцена, звёзды, субъекты).
// Гексы, лесосеки, режимы, RTS-камера и миникарта — следующие группы задач этого change.
import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { Layer, Source, type MapLayerMouseEvent, type MapRef, type ViewStateChangeEvent } from 'react-map-gl/maplibre'
import { useAppStore } from '@/state/store'
import { GLOBE_VIEW, MAP_LIMITS } from './camera/presets'
import { useIntro } from './camera/useIntro'
import { DeckOverlay } from './deck/DeckOverlay'
import { REGION_HIT_LAYER, REGION_SELECTED_LAYER, RegionLayers } from './RegionLayers'
import { SPIKE_ENABLED, SPIKE_NATIVE_LAYER, spikeDeckLayers, spikeNativeSource } from './spike/spikeLayers'
import { Starfield, type StarfieldHandle } from './Starfield'
import { buildBaseStyle } from './style'
import './map.css'

const LABEL_LAYERS = ['place-city', 'place-town', 'water-name']

/** Звёзды видны вокруг глобуса и гаснут к зуму 5. */
const starsOpacity = (zoom: number) => Math.max(0, Math.min(1, (5 - zoom) / 1.5))

export default function MapScene() {
  const mapRef = useRef<MapRef>(null)
  const starsRef = useRef<StarfieldHandle>(null)
  const [mapReady, setMapReady] = useState(false)
  const mapStyle = useMemo(() => buildBaseStyle(), [])

  const phase = useAppStore((s) => s.phase)
  const dataset = useAppStore((s) => s.dataset)
  const decisions = useAppStore((s) => s.decisions)
  const layers = useAppStore((s) => s.layers)
  const selectedRegionId = useAppStore((s) => s.selectedRegionId)
  const selectRegion = useAppStore((s) => s.selectRegion)

  useIntro(mapRef, phase, mapReady)

  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    starsRef.current?.setOpacity(starsOpacity(map.getZoom()))
    setMapReady(true)
  }, [])

  const onMove = useCallback((e: ViewStateChangeEvent) => {
    starsRef.current?.setOpacity(starsOpacity(e.viewState.zoom))
  }, [])

  // Переключатели слоёв базового стиля: visibility без пересборки стиля
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !mapReady) return
    const set = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    set('hillshade', layers.hillshade)
    set('gfc', layers.forestLoss)
    for (const id of LABEL_LAYERS) set(id, layers.labels)
    const sky = map.getSky()
    map.setSky({ ...sky, 'atmosphere-blend': layers.atmosphere ? ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] : 0 })
  }, [mapReady, layers.hillshade, layers.forestLoss, layers.labels, layers.atmosphere])

  // «Дыхание» контура выбранного субъекта: прозрачность через setPaintProperty, без ререндера React
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !mapReady || !selectedRegionId) return
    let frame = 0
    const tick = (t: number) => {
      if (map.getLayer(REGION_SELECTED_LAYER)) {
        map.setPaintProperty(REGION_SELECTED_LAYER, 'line-opacity', 0.7 + 0.2 * Math.sin(t / 450))
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [mapReady, selectedRegionId])

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const region = e.features?.find((f) => f.layer.id === REGION_HIT_LAYER)
      selectRegion(region ? String(region.properties?.id) : null)
    },
    [selectRegion],
  )

  const deckLayers = useMemo(
    () => (SPIKE_ENABLED && dataset ? spikeDeckLayers(dataset.sites, decisions) : []),
    [dataset, decisions],
  )

  return (
    <div className="map-scene">
      <Starfield ref={starsRef} />
      <Map
        initialViewState={{
          longitude: GLOBE_VIEW.center[0],
          latitude: GLOBE_VIEW.center[1],
          zoom: GLOBE_VIEW.zoom,
          pitch: GLOBE_VIEW.pitch,
          bearing: GLOBE_VIEW.bearing,
        }}
        mapStyle={mapStyle}
        minZoom={MAP_LIMITS.minZoom}
        maxZoom={MAP_LIMITS.maxZoom}
        maxPitch={MAP_LIMITS.maxPitch}
        attributionControl={{ compact: true }}
        interactiveLayerIds={mapReady && dataset ? [REGION_HIT_LAYER] : []}
        onLoad={onLoad}
        ref={(instance) => {
          mapRef.current = instance
          // отладка из консоли: карта доступна сразу, не дожидаясь загрузки тайлов
          if (import.meta.env.DEV && instance) Object.assign(window, { __podrostMap: instance.getMap() })
        }}
        onMove={onMove}
        onClick={onClick}
        style={{ position: 'absolute', inset: 0 }}
      >
        {mapReady && dataset && (
          <RegionLayers dataset={dataset} selectedRegionId={selectedRegionId} visible={layers.regions} labelsVisible={layers.labels} />
        )}
        {SPIKE_ENABLED && mapReady && dataset && (
          <Source id="spike-native" {...spikeNativeSource(dataset.sites)}>
            <Layer {...SPIKE_NATIVE_LAYER} />
          </Source>
        )}
        <DeckOverlay layers={deckLayers} />
      </Map>
    </div>
  )
}
