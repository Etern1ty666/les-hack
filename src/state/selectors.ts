// Общие производные данные (setup-app-foundation design D11). Мемоизированы по ссылкам входов.
import type { CuttingSite, DecisionKind, DecisionResult } from '@/domain/types'
import type { AppState } from './store'

/** Мемоизация последнего вызова по ссылочному равенству входов. */
function memoLast<I extends readonly unknown[], O>(compute: (...inputs: I) => O) {
  let lastInputs: I | null = null
  let lastOutput: O
  return (...inputs: I): O => {
    if (lastInputs && inputs.length === lastInputs.length && inputs.every((v, i) => v === lastInputs![i])) {
      return lastOutput
    }
    lastInputs = inputs
    lastOutput = compute(...inputs)
    return lastOutput
  }
}

const emptyByKind = <T>(make: () => T): Record<DecisionKind, T> => ({
  natural: make(),
  combined: make(),
  artificial: make(),
  insufficient_data: make(),
})

const computeVisibleIds = memoLast(
  (sites: CuttingSite[], decisions: AppState['decisions'], filters: AppState['filters']): string[] => {
    const kinds = new Set(filters.kinds)
    const regions = filters.regionIds.length ? new Set(filters.regionIds) : null
    const species = filters.species.length ? new Set(filters.species) : null
    const felling = filters.fellingTypes.length ? new Set(filters.fellingTypes) : null
    const out: string[] = []
    for (const site of sites) {
      const d = decisions[site.id]
      if (!d || !kinds.has(d.kind)) continue
      if (regions && !regions.has(site.regionId)) continue
      if (felling && !felling.has(site.fellingType)) continue
      if (species) {
        const main = d.metrics.targetSpecies[0]
        if (!main || !species.has(main)) continue
      }
      if (d.confidence < filters.minConfidence) continue
      out.push(site.id)
    }
    return out
  },
)

const NO_SITES: CuttingSite[] = []

/** Id лесосек, прошедших фильтры. */
export function selectVisibleSiteIds(s: AppState): string[] {
  return computeVisibleIds(s.dataset?.sites ?? NO_SITES, s.decisions, s.filters)
}

export interface Kpis {
  sites: number
  areaHa: number
  byKind: Record<DecisionKind, { count: number; areaHa: number }>
  seedlingsTotal: number
  costRub: number
}

const computeKpis = memoLast((ids: string[], sitesById: AppState['sitesById'], decisions: AppState['decisions']): Kpis => {
  const kpis: Kpis = { sites: 0, areaHa: 0, byKind: emptyByKind(() => ({ count: 0, areaHa: 0 })), seedlingsTotal: 0, costRub: 0 }
  for (const id of ids) {
    const site = sitesById[id]
    const d = decisions[id]
    if (!site || !d) continue
    kpis.sites++
    kpis.areaHa += site.areaHa
    kpis.byKind[d.kind].count++
    kpis.byKind[d.kind].areaHa += site.areaHa
    kpis.seedlingsTotal += d.recommendation.seedlingsTotal
    kpis.costRub += d.recommendation.estimatedCostRub
  }
  return kpis
})

/** KPI по видимым лесосекам. */
export function selectKpis(s: AppState): Kpis {
  return computeKpis(selectVisibleSiteIds(s), s.sitesById, s.decisions)
}

export interface RegionStat {
  regionId: string
  sites: number
  areaHa: number
  byKindArea: Record<DecisionKind, number>
  artificialAreaShare: number
  seedlingsTotal: number
  costRub: number
}

const computeRegionStats = memoLast(
  (ids: string[], sitesById: AppState['sitesById'], decisions: AppState['decisions']): RegionStat[] => {
    const byRegion = new Map<string, RegionStat>()
    for (const id of ids) {
      const site = sitesById[id]
      const d = decisions[id]
      if (!site || !d) continue
      let stat = byRegion.get(site.regionId)
      if (!stat) {
        stat = {
          regionId: site.regionId,
          sites: 0,
          areaHa: 0,
          byKindArea: emptyByKind(() => 0),
          artificialAreaShare: 0,
          seedlingsTotal: 0,
          costRub: 0,
        }
        byRegion.set(site.regionId, stat)
      }
      stat.sites++
      stat.areaHa += site.areaHa
      stat.byKindArea[d.kind] += site.areaHa
      stat.seedlingsTotal += d.recommendation.seedlingsTotal
      stat.costRub += d.recommendation.estimatedCostRub
    }
    const stats = [...byRegion.values()]
    for (const st of stats) st.artificialAreaShare = st.areaHa > 0 ? st.byKindArea.artificial / st.areaHa : 0
    return stats
  },
)

/** Статистика по субъектам (по видимым лесосекам). */
export function selectRegionStats(s: AppState): RegionStat[] {
  return computeRegionStats(selectVisibleSiteIds(s), s.sitesById, s.decisions)
}

/** Решение с учётом черновика «Что если?». */
export function selectEffectiveDecision(s: AppState, siteId: string): DecisionResult | undefined {
  return s.whatIf?.siteId === siteId ? s.whatIf.result : s.decisions[siteId]
}
