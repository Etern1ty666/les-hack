// Интерфейс данных (setup-app-foundation design D9). Сейчас — фикстура на 300 лесосек.
// Реализацию заменит change add-forest-dataset, сигнатуры не меняются.
import { DISTRICTS } from '@/domain/districts'
import { pointInLonLatRing, toMeters } from '@/domain/geo'
import { hashString, mulberry32, randInt } from '@/domain/random'
import type { CuttingSite, Dataset, SpeciesCode, SurveyPlot } from '@/domain/types'
import { FIXTURE_REGION_SHAPES } from '@/fixtures/regionShapes'
import { FIXTURE_REGIONS, buildFixtureSites } from '@/fixtures/sites'

export interface LoadProgress {
  step: string
  done: number
  total: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function loadDataset(onProgress?: (p: LoadProgress) => void): Promise<Dataset> {
  const steps = 6
  for (let i = 0; i <= steps; i++) {
    onProgress?.({ step: 'Загрузка данных', done: i, total: steps })
    await sleep(50) // имитация сети: в сумме ≈ 300 мс
  }
  const sites = buildFixtureSites()
  onProgress?.({ step: 'Подготовка лесосек', done: sites.length, total: sites.length })
  return {
    version: 'fixture-1',
    seed: 42,
    generatedAt: '2026-10-23',
    regions: FIXTURE_REGIONS.map((r) => r.meta),
    regionShapes: FIXTURE_REGION_SHAPES,
    districts: DISTRICTS,
    sites,
  }
}

const plotsCache = new Map<string, SurveyPlot[]>()

function dominantTarget(site: CuttingSite): SpeciesCode | null {
  let best: { species: SpeciesCode; n: number } | null = null
  for (const r of site.undergrowth) {
    const n = r.countPerHa * r.viableShare
    if (!best || n > best.n) best = { species: r.species, n }
  }
  return best?.species ?? null
}

/** Учётные площадки: детерминированно по site.id, доля непустых = встречаемость. */
export function getSurveyPlots(site: CuttingSite): SurveyPlot[] {
  if (site.surveyPlots.length > 0) return site.surveyPlots
  const cached = plotsCache.get(site.id)
  if (cached) return cached

  const rng = mulberry32(hashString(site.id))
  const n = Math.min(60, Math.max(12, Math.round(site.areaHa * 3)))
  const ring = site.polygon.map((p) => toMeters(site.centroid, p))
  const xs = ring.map((p) => p[0])
  const ys = ring.map((p) => p[1])
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const ringM = ring.map(([x, y]) => [x, y] as [number, number])

  // Сетка с джиттером, сгущаем шаг, пока не наберём n точек внутри контура
  const offsets: [number, number][] = []
  for (let side = Math.ceil(Math.sqrt(n * 1.6)); offsets.length < n && side < 200; side += 2) {
    offsets.length = 0
    const stepX = (maxX - minX) / side
    const stepY = (maxY - minY) / side
    for (let i = 0; i < side && offsets.length < n; i++) {
      for (let j = 0; j < side && offsets.length < n; j++) {
        const x = Math.round((minX + (i + 0.5 + (rng() - 0.5) * 0.6) * stepX) * 10) / 10
        const y = Math.round((minY + (j + 0.5 + (rng() - 0.5) * 0.6) * stepY) * 10) / 10
        if (pointInLonLatRing([x, y], ringM)) offsets.push([x, y])
      }
    }
  }

  const positive = Math.round((site.occurrence ?? 0.6) * offsets.length)
  const order = offsets.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  const positiveSet = new Set(order.slice(0, positive))
  const species = dominantTarget(site)
  const plots: SurveyPlot[] = offsets.map((offsetM, i) => {
    const has = positiveSet.has(i)
    return {
      id: `${site.id}-P${String(i + 1).padStart(2, '0')}`,
      offsetM,
      viableTargetCount: has ? randInt(rng, 1, 6) : 0,
      dominantSpecies: has ? species : null,
    }
  })
  plotsCache.set(site.id, plots)
  return plots
}
