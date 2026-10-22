// Спайк совместимости (add-strategic-map design D9): ?spike=1.
// deck.gl-гексы и точки поверх глобуса + нативные кружки MapLibre в тех же координатах.
// Если пурпурные точки deck.gl совпадают с голубыми кружками MapLibre при вращении и наклоне — совмещение корректно.
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import { ScatterplotLayer } from '@deck.gl/layers'
import { latLngToCell } from 'h3-js'
import type { CircleLayerSpecification, GeoJSONSourceSpecification } from 'maplibre-gl'
import { DECISIONS } from '@/domain/constants'
import type { CuttingSite, DecisionKind, DecisionResult } from '@/domain/types'

const SPIKE_PARAM = new URLSearchParams(window.location.search).get('spike')
export const SPIKE_ENABLED = SPIKE_PARAM === '1' || SPIKE_PARAM === 'points'
const SPIKE_HEXES = SPIKE_PARAM === '1' // ?spike=points — только точки, без гексов (проверка совмещения на крупном зуме)

interface SpikeHex {
  h3: string
  areaHa: number
  kind: DecisionKind
}

function aggregate(sites: CuttingSite[], decisions: Record<string, DecisionResult>, res: number): SpikeHex[] {
  const cells = new Map<string, { areaHa: number; byKind: Record<string, number> }>()
  for (const s of sites) {
    const h3 = latLngToCell(s.centroid[1], s.centroid[0], res)
    const cell = cells.get(h3) ?? { areaHa: 0, byKind: {} }
    const kind = decisions[s.id]?.kind ?? 'insufficient_data'
    cell.areaHa += s.areaHa
    cell.byKind[kind] = (cell.byKind[kind] ?? 0) + s.areaHa
    cells.set(h3, cell)
  }
  return [...cells].map(([h3, c]) => ({
    h3,
    areaHa: c.areaHa,
    kind: Object.entries(c.byKind).sort((a, b) => b[1] - a[1])[0]![0] as DecisionKind,
  }))
}

export function spikeDeckLayers(sites: CuttingSite[], decisions: Record<string, DecisionResult>) {
  const hexes = aggregate(sites, decisions, 3)
  const maxArea = Math.max(1, ...hexes.map((h) => h.areaHa))
  return [
    SPIKE_HEXES && new H3HexagonLayer<SpikeHex>({
      id: 'spike-hexes',
      data: hexes,
      getHexagon: (d) => d.h3,
      extruded: true,
      coverage: 0.86,
      getElevation: (d) => 170_000 * Math.sqrt(d.areaHa / maxArea),
      getFillColor: (d) => [...DECISIONS[d.kind].rgb, 200],
      material: { ambient: 0.45, diffuse: 0.65, shininess: 32 },
      pickable: true,
    }),
    new ScatterplotLayer<CuttingSite>({
      id: 'spike-points',
      data: sites,
      getPosition: (d) => d.centroid,
      getRadius: 4,
      radiusUnits: 'pixels',
      getFillColor: [255, 0, 200, 230],
      pickable: true,
      // Плоские слои рисуем без теста глубины: иначе на глобусе с наклоном их закрывает глубина поверхности MapLibre
      parameters: { depthCompare: 'always', depthWriteEnabled: false },
    }),
  ]
}

export function spikeNativeSource(sites: CuttingSite[]): GeoJSONSourceSpecification {
  return {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: sites.map((s) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: s.centroid } })),
    },
  }
}

export const SPIKE_NATIVE_LAYER: CircleLayerSpecification = {
  id: 'spike-native-circles',
  type: 'circle',
  source: 'spike-native',
  paint: { 'circle-radius': 7, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#00E5FF', 'circle-stroke-width': 1.5 },
}
