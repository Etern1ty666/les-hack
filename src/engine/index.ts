// ЗАГЛУШКА движка (setup-app-foundation design D7). Сигнатуры — контракт.
// Настоящую логику пишет change add-reforestation-decision-engine, не меняя экспортов.
import { SITE_CONDITIONS } from '@/domain/constants'
import type {
  CuttingSite,
  DecisionDiff,
  DecisionKind,
  DecisionResult,
  EvaluateOptions,
  NormsConfig,
  Recommendation,
  SpeciesCode,
} from '@/domain/types'

export { DEFAULT_NORMS } from './defaultNorms'

const STUB_REQUIRED = 2000

function targetsFor(site: CuttingSite, norms: NormsConfig): SpeciesCode[] {
  return (
    norms.targetOverridesByDistrict[site.districtId]?.[site.siteCondition] ??
    norms.targetSpeciesByCondition[site.siteCondition]
  )
}

function stubRecommendation(site: CuttingSite, kind: DecisionKind, targets: SpeciesCode[], ratio: number, norms: NormsConfig): Recommendation {
  const planting = kind === 'combined' || kind === 'artificial'
  const primary = targets[0] ?? 'pine'
  const secondary = targets[1]
  const composition = !planting
    ? []
    : secondary
      ? [{ species: primary, sharePct: 70 }, { species: secondary, sharePct: 30 }]
      : [{ species: primary, sharePct: 100 }]
  const density = planting ? (norms.plantingDensity[primary]?.bare_root ?? 3000) : null
  const areaToPlantHa = kind === 'artificial' ? site.areaHa : kind === 'combined' ? site.areaHa * Math.min(0.8, Math.max(0.2, 1 - ratio)) : 0
  const seedlingsTotal = density ? Math.round(areaToPlantHa * density) : 0
  const c = norms.unitCostsRub
  const careYears = planting ? 3 : 0
  return {
    measures: kind === 'natural' ? ['preserve_undergrowth'] : kind === 'combined' ? ['preserve_undergrowth', 'gap_planting', 'agrotech_care'] : kind === 'artificial' ? ['planting', 'agrotech_care'] : [],
    composition,
    densityPerHa: density,
    plantingStock: planting ? 'bare_root' : null,
    soilPreparation: planting ? (SITE_CONDITIONS[site.siteCondition].moisture >= 4 ? 'mounds' : 'furrows') : 'none',
    season: planting ? 'spring' : null,
    careYears,
    areaToPlantHa,
    seedlingsTotal,
    estimatedCostRub: Math.round(areaToPlantHa * (c.soilPrepPerHa + c.plantingPerHaBareRoot + careYears * c.carePerHaPerYear) + seedlingsTotal * c.seedlingBareRoot),
    expectedTransferYears: kind === 'insufficient_data' ? null : kind === 'natural' ? 4 : 7,
    notes: kind === 'insufficient_data' ? ['Провести учёт подроста на учётных площадках'] : ['Расчёт заглушки движка — заменится настоящим'],
  }
}

export function evaluateSite(site: CuttingSite, norms: NormsConfig, _opts?: EvaluateOptions): DecisionResult {
  const targets = targetsFor(site, norms)
  const normalized = site.undergrowth.reduce(
    (sum, r) => sum + r.countPerHa * r.viableShare * norms.heightCoefficients[r.heightClass],
    0,
  )
  const ratio = normalized / STUB_REQUIRED
  const kind: DecisionKind = !site.undergrowthSurveyed
    ? 'insufficient_data'
    : ratio >= 1
      ? 'natural'
      : ratio >= 0.5
        ? 'combined'
        : 'artificial'

  return {
    siteId: site.id,
    kind,
    needsActiveMeasures: kind === 'combined' || kind === 'artificial',
    confidence: kind === 'insufficient_data' ? 0.3 : 0.8,
    successProbability: kind === 'insufficient_data' ? 0.5 : Math.min(0.95, 0.4 + ratio * 0.3),
    successFactors: [
      { label: `Достаточность подроста ${Math.round(ratio * 100)} %`, contribution: ratio - 1 },
      { label: 'Заглушка движка', contribution: 0 },
    ],
    metrics: {
      targetSpecies: targets,
      normalizedViableCount: Math.round(normalized),
      requiredCount: STUB_REQUIRED,
      sufficiencyRatio: ratio,
      occurrence: site.occurrence,
      undesiredShare: 0,
    },
    explanation: [
      {
        ruleId: 'STUB',
        title: 'Заглушка движка',
        outcome: 'info',
        detail: `Упрощённый расчёт: приведённое ${Math.round(normalized)} шт/га / ${STUB_REQUIRED}. Настоящие правила — change add-reforestation-decision-engine.`,
      },
    ],
    recommendation: stubRecommendation(site, kind, targets, ratio, norms),
    normsVersion: norms.version,
  }
}

export function evaluateAll(sites: CuttingSite[], norms: NormsConfig, opts?: EvaluateOptions): Record<string, DecisionResult> {
  const out: Record<string, DecisionResult> = {}
  for (const site of sites) out[site.id] = evaluateSite(site, norms, opts)
  return out
}

export function diffDecisions(prev: Record<string, DecisionResult>, next: Record<string, DecisionResult>): DecisionDiff {
  const diff: DecisionDiff = { changed: 0, transitions: {} }
  for (const [id, n] of Object.entries(next)) {
    const p = prev[id]
    if (!p || p.kind === n.kind) continue
    diff.changed++
    const key = `${p.kind}->${n.kind}` as const
    diff.transitions[key] = (diff.transitions[key] ?? 0) + 1
  }
  return diff
}
