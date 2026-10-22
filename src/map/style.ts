// Базовый стиль MapLibre (add-strategic-map design D2): глобус, приглушённый Sentinel-2, отмывка, вода, подписи.
import type { StyleSpecification } from 'maplibre-gl'

export const SOURCES = {
  s2: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg', // WMTS EOX: {z}/{y}/{x}
  dem: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  ofm: 'https://tiles.openfreemap.org/planet',
  gfc: 'https://storage.googleapis.com/earthenginepartners-hansen/tiles/gfc_v1.12/loss_alpha/{z}/{x}/{y}.png',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
} as const

const ATTRIBUTION = {
  s2: 'Sentinel-2 cloudless 2024 © <a href="https://s2maps.eu" target="_blank">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0',
  dem: 'Terrain Tiles: Mapzen / AWS Open Data',
  ofm: '© <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
  gfc: 'Hansen/UMD/Google/USGS/NASA, Global Forest Change 2000–2024 v1.12, CC BY 4.0',
  regions: 'Natural Earth (public domain)',
} as const

const NAME_RU = ['coalesce', ['get', 'name:ru'], ['get', 'name']] as const

export function buildBaseStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'podrost-strategic',
    glyphs: SOURCES.glyphs,
    projection: { type: 'globe' },
    sky: {
      'sky-color': '#03060A',
      'horizon-color': '#0B2A26',
      'fog-color': '#03060A',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.9,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
    },
    sources: {
      s2: { type: 'raster', tiles: [SOURCES.s2], tileSize: 256, maxzoom: 15, attribution: ATTRIBUTION.s2 },
      dem: { type: 'raster-dem', tiles: [SOURCES.dem], tileSize: 256, maxzoom: 14, encoding: 'terrarium', attribution: ATTRIBUTION.dem },
      ofm: { type: 'vector', url: SOURCES.ofm, attribution: ATTRIBUTION.ofm },
      gfc: { type: 'raster', tiles: [SOURCES.gfc], tileSize: 256, maxzoom: 12, attribution: ATTRIBUTION.gfc },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#03060A' } },
      {
        id: 's2',
        type: 'raster',
        source: 's2',
        paint: {
          'raster-saturation': -0.35,
          'raster-contrast': 0.15,
          'raster-brightness-max': 0.55,
          'raster-fade-duration': 200,
        },
      },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'dem',
        paint: {
          'hillshade-exaggeration': 0.35,
          'hillshade-shadow-color': '#000000',
          'hillshade-highlight-color': 'rgba(159, 255, 224, 0.15)',
          'hillshade-accent-color': '#000000',
        },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'water',
        paint: { 'fill-color': '#031016', 'fill-opacity': 0.55 },
      },
      {
        id: 'gfc',
        type: 'raster',
        source: 'gfc',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.85 },
      },
      {
        id: 'water-name',
        type: 'symbol',
        source: 'ofm',
        'source-layer': 'water_name',
        minzoom: 2.5,
        filter: ['in', ['get', 'class'], ['literal', ['ocean', 'sea', 'lake']]],
        layout: {
          'text-field': NAME_RU as unknown as string,
          'text-font': ['Noto Sans Italic'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 8, 13],
          'text-letter-spacing': 0.2,
          'text-max-width': 8,
        },
        paint: { 'text-color': '#4F7F86', 'text-halo-color': '#000000', 'text-halo-width': 1 },
      },
      {
        id: 'place-town',
        type: 'symbol',
        source: 'ofm',
        'source-layer': 'place',
        minzoom: 7.5,
        filter: ['==', ['get', 'class'], 'town'],
        layout: {
          'text-field': NAME_RU as unknown as string,
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
        },
        paint: { 'text-color': '#7E948F', 'text-halo-color': '#000000', 'text-halo-width': 1 },
      },
      {
        id: 'place-city',
        type: 'symbol',
        source: 'ofm',
        'source-layer': 'place',
        minzoom: 3.5,
        filter: ['==', ['get', 'class'], 'city'],
        layout: {
          'text-field': NAME_RU as unknown as string,
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 10, 15],
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: { 'text-color': '#9DB5AE', 'text-halo-color': '#000000', 'text-halo-width': 1.2 },
      },
    ],
  }
}

export const REGION_ATTRIBUTION = ATTRIBUTION.regions
