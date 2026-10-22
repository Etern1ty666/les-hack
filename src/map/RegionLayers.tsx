// Субъекты РФ нативными слоями MapLibre (add-strategic-map design D2): контуры, подписи, подсветка выбранного.
import type { FeatureCollection, Point } from 'geojson'
import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { Dataset } from '@/domain/types'
import { REGION_ATTRIBUTION } from './style'

export const REGION_HIT_LAYER = 'regions-hit'
export const REGION_SELECTED_LAYER = 'regions-line-selected'

export function RegionLayers({ dataset, selectedRegionId, visible, labelsVisible }: {
  dataset: Dataset
  selectedRegionId: string | null
  visible: boolean
  labelsVisible: boolean
}) {
  const labels = useMemo<FeatureCollection<Point, { id: string; name: string }>>(
    () => ({
      type: 'FeatureCollection',
      features: dataset.regions.map((r) => ({
        type: 'Feature',
        properties: { id: r.id, name: r.shortRu },
        geometry: { type: 'Point', coordinates: r.centroid },
      })),
    }),
    [dataset.regions],
  )
  const visibility = visible ? 'visible' : 'none'
  const selectedFilter = ['==', ['get', 'id'], selectedRegionId ?? ''] as const

  return (
    <>
      <Source id="regions" type="geojson" data={dataset.regionShapes} promoteId="id" attribution={REGION_ATTRIBUTION}>
        <Layer id={REGION_HIT_LAYER} type="fill" beforeId="water-name" layout={{ visibility }} paint={{ 'fill-color': '#000', 'fill-opacity': 0 }} />
        <Layer
          id="regions-line"
          type="line"
          beforeId="water-name"
          layout={{ visibility, 'line-join': 'round' }}
          paint={{
            'line-color': '#36F1C2',
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.35, 5, 0.25],
            'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.8, 8, 1.4],
            'line-blur': 0.4,
          }}
        />
        <Layer
          id="regions-line-glow"
          type="line"
          beforeId="water-name"
          filter={selectedFilter as never}
          layout={{ visibility, 'line-join': 'round' }}
          paint={{ 'line-color': '#36F1C2', 'line-width': 9, 'line-blur': 7, 'line-opacity': 0.35 }}
        />
        <Layer
          id={REGION_SELECTED_LAYER}
          type="line"
          beforeId="water-name"
          filter={selectedFilter as never}
          layout={{ visibility, 'line-join': 'round' }}
          paint={{ 'line-color': '#36F1C2', 'line-width': 2.5, 'line-opacity': 0.9 }}
        />
      </Source>
      <Source id="region-labels" type="geojson" data={labels}>
        <Layer
          id="regions-label"
          type="symbol"
          minzoom={2.8}
          maxzoom={6.5}
          layout={{
            visibility: visible && labelsVisible ? 'visible' : 'none',
            'text-field': ['upcase', ['get', 'name']],
            'text-font': ['Noto Sans Bold'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 2.8, 11, 6, 16],
            'text-letter-spacing': 0.4,
            'text-max-width': 12,
          }}
          paint={{
            'text-color': '#9DB5AE',
            'text-opacity': 0.8,
            'text-halo-color': '#000000',
            'text-halo-width': 1.4,
          }}
        />
      </Source>
    </>
  )
}
