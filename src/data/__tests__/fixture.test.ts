import { describe, expect, it } from 'vitest'
import { pointInGeometry, pointInLonLatRing, ringAreaHa, toMeters } from '@/domain/geo'
import { DEFAULT_NORMS, evaluateAll } from '@/engine'
import { getSurveyPlots, loadDataset } from '../index'

describe('фикстурный набор', () => {
  it('300 лесосек, 6 регионов, ровно один пилотный', async () => {
    const ds = await loadDataset()
    expect(ds.sites).toHaveLength(300)
    expect(ds.regions).toHaveLength(6)
    expect(ds.regions.filter((r) => r.isPilot).map((r) => r.id)).toEqual(['RU-NIZ'])
  })

  it('полигоны замкнуты, площадь совпадает, центроиды внутри субъектов', async () => {
    const ds = await loadDataset()
    for (const s of ds.sites) {
      expect(s.polygon[0]).toEqual(s.polygon[s.polygon.length - 1])
      expect(Math.abs(ringAreaHa(s.polygon) - s.areaHa) / s.areaHa).toBeLessThan(0.1)
      const shape = ds.regionShapes.features.find((f) => f.properties.id === s.regionId)!
      expect(pointInGeometry(s.centroid, shape.geometry), s.id).toBe(true)
    }
  })

  it('детерминирован при повторной загрузке', async () => {
    const [a, b] = await Promise.all([loadDataset(), loadDataset()])
    expect(a.sites).toEqual(b.sites)
  })

  it('распределение решений близко к 45/25/25/5 на заглушке', async () => {
    const ds = await loadDataset()
    const decisions = Object.values(evaluateAll(ds.sites, DEFAULT_NORMS))
    const share = (k: string) => decisions.filter((d) => d.kind === k).length / decisions.length
    expect(share('natural')).toBeGreaterThan(0.35)
    expect(share('combined')).toBeGreaterThan(0.15)
    expect(share('artificial')).toBeGreaterThan(0.15)
    expect(share('insufficient_data')).toBeLessThan(0.12)
  })

  it('getSurveyPlots: 12–60 площадок внутри контура, доля непустых = встречаемость', async () => {
    const ds = await loadDataset()
    for (const s of ds.sites.slice(0, 120)) {
      const plots = getSurveyPlots(s)
      expect(plots.length).toBeGreaterThanOrEqual(12)
      expect(plots.length).toBeLessThanOrEqual(60)
      const ring = s.polygon.map((p) => toMeters(s.centroid, p))
      for (const p of plots) expect(pointInLonLatRing(p.offsetM, ring)).toBe(true)
      const positive = plots.filter((p) => p.viableTargetCount > 0).length
      expect(positive).toBe(Math.round((s.occurrence ?? 0.6) * plots.length))
      expect(getSurveyPlots(s)).toBe(plots) // кэш
    }
  })
})
