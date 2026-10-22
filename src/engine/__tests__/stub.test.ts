import { describe, expect, it } from 'vitest'
import { DISTRICTS } from '@/domain/districts'
import type { CuttingSite, SiteConditionCode } from '@/domain/types'
import { DEFAULT_NORMS, diffDecisions, evaluateAll, evaluateSite } from '../index'

const base: CuttingSite = {
  id: 'T-1',
  regionId: 'RU-NIZ',
  forestry: 'Семёновское',
  subForestry: 'Лесное участковое',
  quarter: 1,
  plot: 1,
  areaHa: 10,
  centroid: [44.5, 56.8],
  polygon: [[44.5, 56.8], [44.51, 56.8], [44.51, 56.81], [44.5, 56.8]],
  districtId: 'south_taiga_eu',
  siteCondition: 'B2',
  forestType: 'Сосняк черничный',
  preFellingComposition: '6С3Е1Б',
  fellingType: 'clear',
  fellingYear: 2024,
  inspectionDate: '2025-06-01',
  undergrowthSurveyed: true,
  undergrowth: [],
  occurrence: 0.7,
  surveyPlots: [],
  dataSource: 'synthetic',
}

const withLarge = (count: number): CuttingSite => ({
  ...base,
  undergrowth: [{ species: 'spruce', heightClass: 'large', countPerHa: count, viableShare: 1 }],
})

describe('заглушка движка', () => {
  it('4 типовые лесосеки дают 4 разных решения', () => {
    const kinds = [
      evaluateSite(withLarge(3000), DEFAULT_NORMS).kind,
      evaluateSite(withLarge(1400), DEFAULT_NORMS).kind,
      evaluateSite(withLarge(200), DEFAULT_NORMS).kind,
      evaluateSite({ ...base, undergrowthSurveyed: false }, DEFAULT_NORMS).kind,
    ]
    expect(kinds).toEqual(['natural', 'combined', 'artificial', 'insufficient_data'])
  })

  it('evaluateAll и diffDecisions', () => {
    const sites = [withLarge(3000), { ...withLarge(200), id: 'T-2' }]
    const before = evaluateAll(sites, DEFAULT_NORMS)
    const after = evaluateAll([{ ...withLarge(200) }, { ...withLarge(200), id: 'T-2' }], DEFAULT_NORMS)
    expect(diffDecisions(before, after)).toEqual({ changed: 1, transitions: { 'natural->artificial': 1 } })
  })
})

describe('DEFAULT_NORMS', () => {
  it('для каждого района есть норма по всем трём группам', () => {
    for (const d of DISTRICTS) {
      const n = DEFAULT_NORMS.districts[d.id]
      expect(n, d.id).toBeDefined()
      expect(n!.requiredPerHa.conifer).toBeGreaterThan(0)
      expect(n!.requiredPerHa.hardwood).toBeGreaterThan(0)
      expect(n!.requiredPerHa.softwood).toBeGreaterThan(0)
      expect(n!.source.verified).toBe(false)
    }
  })

  it('для каждого ТЛУ и района есть непустой список целевых пород', () => {
    const tlu = Object.keys(DEFAULT_NORMS.targetSpeciesByCondition) as SiteConditionCode[]
    expect(tlu).toHaveLength(15)
    for (const d of DISTRICTS) {
      for (const c of tlu) {
        const targets = DEFAULT_NORMS.targetOverridesByDistrict[d.id]?.[c] ?? DEFAULT_NORMS.targetSpeciesByCondition[c]
        expect(targets.length, `${d.id}/${c}`).toBeGreaterThan(0)
      }
    }
  })

  it('переопределения сливаются по порядку правил', () => {
    expect(DEFAULT_NORMS.targetOverridesByDistrict.csib_plateau_taiga?.C2).toEqual(['cedar', 'spruce', 'fir'])
    expect(DEFAULT_NORMS.targetOverridesByDistrict.csib_plateau_taiga?.D2).toEqual(['spruce', 'pine'])
    expect(DEFAULT_NORMS.targetOverridesByDistrict.esib_permafrost_taiga?.B2).toEqual(['larch', 'pine'])
    expect(DEFAULT_NORMS.targetOverridesByDistrict.south_taiga_eu).toBeUndefined()
  })
})
