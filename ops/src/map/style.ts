// Стиль реальной карты в палитре оперативного центра: OSM (OpenFreeMap) + рельеф + спутниковые лес и рубки.
// Всё бесключевое; тайлы грузятся только для видимой области.
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'
import { DEM_TILES } from '../data/sources'
import { RASTER_COLORS } from './rasters'
import { TERRAIN_EXAG } from './trees'

export const MAP_COLORS = {
  land: '#bdb67c',
  farm: '#d0c58b',
  farmLine: '#b9ac70',
  grass: '#a9b265',
  wet: '#8fa07a',
  sand: '#dccf98',
  forest: RASTER_COLORS.cover,
  town: '#ddd0a6',
  townLine: '#b7a679',
  industry: '#cbbd9d',
  water: '#5b95a3',
  roadCase: '#7b6a4a',
  roadMajor: '#f5d891',
  road: '#fbf1d3',
  track: '#8c7a56',
  rail: '#6b6458',
  building: '#eee4c8',
  border: '#7b4d6b',
  label: '#ffffff',
  halo: '#1b1e1c',
  sky: '#a7ae98',
}

const C = MAP_COLORS
const name: ExpressionSpecification = ['coalesce', ['get', 'name:ru'], ['get', 'name']]
const cls = (...v: string[]): ExpressionSpecification => ['match', ['get', 'class'], v, true, false]
const zw = (pairs: [number, number][]): ExpressionSpecification => ['interpolate', ['exponential', 1.6], ['zoom'], ...pairs.flat()]

const ROADS: { id: string; classes: string[]; color: string; w: [number, number][]; minzoom: number }[] = [
  { id: 'minor', classes: ['minor', 'service'], color: C.road, w: [[12, 0.6], [14, 2.2], [17, 9]], minzoom: 12 },
  { id: 'secondary', classes: ['secondary', 'tertiary'], color: C.road, w: [[8, 0.6], [12, 1.8], [14, 4], [17, 14]], minzoom: 8 },
  { id: 'primary', classes: ['primary'], color: C.roadMajor, w: [[6, 0.7], [10, 1.6], [14, 5], [17, 16]], minzoom: 6 },
  { id: 'major', classes: ['motorway', 'trunk'], color: C.roadMajor, w: [[5, 0.8], [10, 2], [14, 6], [17, 18]], minzoom: 5 },
]

export function mapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenStreetMap · OpenFreeMap' },
      dem: { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 12, attribution: 'Terrain Tiles (AWS)' },
      hill: { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 13 },
      cover: { type: 'raster', tiles: ['podrost-cover://{z}/{x}/{y}'], tileSize: 256, maxzoom: 12, attribution: 'Лесистость 2000: Hansen/UMD (Global Forest Watch)' },
      loss: { type: 'raster', tiles: ['podrost-loss://{z}/{x}/{y}'], tileSize: 256, maxzoom: 12, attribution: 'Рубки 2001–2024: Hansen GFC v1.12' },
      frame: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    terrain: { source: 'dem', exaggeration: TERRAIN_EXAG },
    sky: {
      'sky-color': C.sky,
      'horizon-color': '#dfe2cf',
      'fog-color': '#c9ccb5',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.75,
      'atmosphere-blend': 0,
    },
    light: { anchor: 'map', position: [1.3, 300, 50], color: '#fff3dc', intensity: 0.35 },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': C.land } },
      {
        id: 'farmland',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: cls('farmland'),
        paint: { 'fill-color': C.farm, 'fill-outline-color': C.farmLine },
      },
      { id: 'grass', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: cls('grass'), paint: { 'fill-color': C.grass } },
      { id: 'wetland', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: cls('wetland'), paint: { 'fill-color': C.wet } },
      { id: 'sand', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: cls('sand', 'rock'), paint: { 'fill-color': C.sand } },
      // лес: спутник (сомкнутость ≥ 30 % в 2000 г.) ∪ OSM
      { id: 'forest-sat', type: 'raster', source: 'cover', paint: { 'raster-opacity': 0.92, 'raster-resampling': 'linear', 'raster-fade-duration': 150 } },
      { id: 'forest-osm', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: cls('wood'), paint: { 'fill-color': C.forest, 'fill-antialias': false } },
      { id: 'cuttings', type: 'raster', source: 'loss', paint: { 'raster-opacity': 0.95, 'raster-resampling': 'nearest', 'raster-fade-duration': 150 } },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'hill',
        paint: { 'hillshade-shadow-color': '#2c2a14', 'hillshade-highlight-color': '#fff8dc', 'hillshade-accent-color': '#4a4628', 'hillshade-exaggeration': 0.42 },
      },
      // города схематично: кварталы застройки
      {
        id: 'town',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        filter: cls('residential', 'suburb', 'quarter', 'neighbourhood'),
        paint: { 'fill-color': C.town, 'fill-outline-color': C.townLine },
      },
      {
        id: 'industry',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        filter: cls('industrial', 'commercial', 'retail', 'railway', 'garages'),
        paint: { 'fill-color': C.industry },
      },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': C.water } },
      {
        id: 'waterway',
        type: 'line',
        source: 'omt',
        'source-layer': 'waterway',
        paint: {
          'line-color': C.water,
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 8, ['match', ['get', 'class'], 'river', 0.8, 0], 12, ['match', ['get', 'class'], 'river', 2, 0.6], 16, ['match', ['get', 'class'], 'river', 8, 2.4]],
        },
      },
      {
        id: 'track',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: cls('track'),
        paint: { 'line-color': C.track, 'line-width': zw([[12, 0.6], [16, 2]]), 'line-dasharray': [3, 2] },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 9,
        filter: cls('rail'),
        paint: { 'line-color': C.rail, 'line-width': zw([[9, 0.8], [16, 2.5]]), 'line-dasharray': [4, 2] },
      },
      ...ROADS.map(
        (r) =>
          ({
            id: `road-case-${r.id}`,
            type: 'line',
            source: 'omt',
            'source-layer': 'transportation',
            minzoom: r.minzoom,
            filter: cls(...r.classes),
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': C.roadCase, 'line-width': zw(r.w.map(([z, w]) => [z, w * 1.6 + 0.8])) },
          }) as const,
      ),
      ...ROADS.map(
        (r) =>
          ({
            id: `road-${r.id}`,
            type: 'line',
            source: 'omt',
            'source-layer': 'transportation',
            minzoom: r.minzoom,
            filter: cls(...r.classes),
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': r.color, 'line-width': zw(r.w) },
          }) as const,
      ),
      {
        id: 'border-region',
        type: 'line',
        source: 'omt',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': C.border, 'line-width': zw([[3, 0.6], [8, 1.4], [12, 2.4]]), 'line-dasharray': [3, 1.5], 'line-opacity': 0.85 },
      },
      {
        id: 'border-country',
        type: 'line',
        source: 'omt',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': C.border, 'line-width': zw([[2, 1.2], [8, 2.6], [12, 4]]) },
      },
      // рамка выбранного района
      { id: 'frame-fill', type: 'fill', source: 'frame', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.1 } },
      { id: 'frame-line', type: 'line', source: 'frame', paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-dasharray': [2, 1.2] } },
      // схематичные кварталы на средних зумах, настоящие здания — вблизи
      {
        id: 'town-blocks',
        type: 'fill-extrusion',
        source: 'omt',
        'source-layer': 'landuse',
        minzoom: 11,
        maxzoom: 14,
        filter: cls('residential', 'industrial', 'commercial', 'retail'),
        paint: {
          'fill-extrusion-color': ['match', ['get', 'class'], 'residential', C.town, C.industry],
          'fill-extrusion-height': ['match', ['get', 'class'], 'residential', 14, 20],
          'fill-extrusion-opacity': 0.92,
        },
      },
      {
        id: 'buildings',
        type: 'fill-extrusion',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 14,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 4, C.building, 30, '#dcd6c8'],
          'fill-extrusion-height': ['max', ['coalesce', ['get', 'render_height'], 6], 4],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 1,
        },
      },
      {
        id: 'peaks',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'mountain_peak',
        minzoom: 10,
        filter: ['has', 'ele'],
        layout: {
          'text-field': ['format', '▲ ', {}, name, {}, '\n', {}, ['concat', ['to-string', ['get', 'ele']], ' м'], { 'font-scale': 0.85 }],
          'text-font': ['Noto Sans Italic'],
          'text-size': 12,
          'text-anchor': 'top',
        },
        paint: { 'text-color': '#2b2a1c', 'text-halo-color': '#f3efd9', 'text-halo-width': 1.4 },
      },
      {
        id: 'water-name',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'water_name',
        minzoom: 9,
        layout: { 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-size': 12 },
        paint: { 'text-color': '#eaf5f7', 'text-halo-color': '#2f5b66', 'text-halo-width': 1.2 },
      },
      {
        id: 'places-small',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 10,
        filter: cls('village', 'hamlet', 'suburb'),
        layout: { 'text-field': name, 'text-font': ['Noto Sans Bold'], 'text-size': zw([[10, 10.5], [14, 14]]), 'text-padding': 4 },
        paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.5 },
      },
      {
        id: 'places',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        filter: cls('city', 'town'),
        layout: {
          'text-field': name,
          'text-font': ['Noto Sans Bold'],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.06,
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, ['match', ['get', 'class'], 'city', 12, 10], 10, ['match', ['get', 'class'], 'city', 18, 14], 14, ['match', ['get', 'class'], 'city', 24, 18]],
          'text-padding': 6,
        },
        paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.8 },
      },
    ],
  }
}
