import { beforeEach, describe, expect, it } from 'vitest'
import { loadDataset } from '@/data'
import { DEFAULT_NORMS, evaluateAll } from '@/engine'
import { bootstrap } from '../bootstrap'
import { selectEffectiveDecision, selectKpis, selectRegionStats, selectVisibleSiteIds } from '../selectors'
import { DEFAULT_FILTERS, FEED_LIMIT, useAppStore } from '../store'

const initial = useAppStore.getState()

async function loaded() {
  const ds = await loadDataset()
  useAppStore.getState().setDataset(ds, evaluateAll(ds.sites, DEFAULT_NORMS))
  return ds
}

beforeEach(() => {
  useAppStore.setState(initial, true)
})

describe('store', () => {
  it('selectSite с fly создаёт cameraRequest с новым id', async () => {
    const ds = await loaded()
    const site = ds.sites[0]!
    useAppStore.getState().selectSite(site.id, { fly: true })
    const first = useAppStore.getState().cameraRequest
    expect(first?.center).toEqual(site.centroid)
    expect(first?.zoom).toBe(13.5)
    useAppStore.getState().selectSite(ds.sites[1]!.id, { fly: true })
    expect(useAppStore.getState().cameraRequest!.id).toBeGreaterThan(first!.id)
  })

  it('selectSite сбрасывает whatIf другой лесосеки', async () => {
    const ds = await loaded()
    const [a, b] = ds.sites
    useAppStore.getState().selectSite(a!.id)
    useAppStore.getState().startWhatIf(a!.id)
    expect(useAppStore.getState().whatIf?.siteId).toBe(a!.id)
    useAppStore.getState().selectSite(b!.id)
    expect(useAppStore.getState().whatIf).toBeNull()
  })

  it('setNorms пересчитывает decisions и lastDiff', async () => {
    await loaded()
    const before = useAppStore.getState().decisions
    // огромные коэффициенты высоты → всё естественное
    useAppStore.getState().setNorms({ ...DEFAULT_NORMS, heightCoefficients: { small: 50, medium: 50, large: 50 } })
    const { decisions, lastDiff } = useAppStore.getState()
    expect(decisions).not.toBe(before)
    expect(lastDiff!.changed).toBeGreaterThan(0)
    expect(lastDiff!.transitions['artificial->natural']).toBeGreaterThan(0)
  })

  it('updateWhatIf пересчитывает результат черновика', async () => {
    const ds = await loaded()
    const site = ds.sites.find((s) => useAppStore.getState().decisions[s.id]!.kind === 'artificial')!
    useAppStore.getState().startWhatIf(site.id)
    const draft = structuredClone(useAppStore.getState().whatIf!.draft)
    draft.undergrowth = [{ species: 'spruce', heightClass: 'large', countPerHa: 9000, viableShare: 1 }]
    useAppStore.getState().updateWhatIf(draft)
    const s = useAppStore.getState()
    expect(s.whatIf!.result.kind).toBe('natural')
    expect(selectEffectiveDecision(s, site.id)!.kind).toBe('natural')
    expect(s.decisions[site.id]!.kind).toBe('artificial') // исходное не тронуто
  })

  it('addSites добавляет и оценивает только новые', async () => {
    const ds = await loaded()
    const copy = { ...ds.sites[0]!, id: 'IMP-0001', dataSource: 'imported' as const }
    useAppStore.getState().addSites([copy])
    const s = useAppStore.getState()
    expect(s.dataset!.sites).toHaveLength(301)
    expect(s.sitesById['IMP-0001']).toBeDefined()
    expect(s.decisions['IMP-0001']).toBeDefined()
  })

  it('pushFeed ограничивает ленту и кладёт новые сверху', () => {
    for (let i = 0; i < 60; i++) useAppStore.getState().pushFeed({ type: 'inspection', title: `событие ${i}` })
    const feed = useAppStore.getState().feed
    expect(feed).toHaveLength(FEED_LIMIT)
    expect(feed[0]!.title).toBe('событие 59')
    expect(new Set(feed.map((e) => e.id)).size).toBe(FEED_LIMIT)
  })
})

describe('selectors', () => {
  it('фильтр по решениям уменьшает KPI, мемоизация держит ссылку', async () => {
    await loaded()
    const all = selectKpis(useAppStore.getState())
    expect(all.sites).toBe(300)
    expect(selectKpis(useAppStore.getState())).toBe(all)
    useAppStore.getState().setFilters({ kinds: ['artificial'] })
    const only = selectKpis(useAppStore.getState())
    expect(only.sites).toBeLessThan(all.sites)
    expect(only.sites).toBe(only.byKind.artificial.count)
    expect(selectVisibleSiteIds(useAppStore.getState())).toHaveLength(only.sites)
  })

  it('фильтр по субъекту и статистика субъектов', async () => {
    await loaded()
    useAppStore.getState().setFilters({ regionIds: ['RU-NIZ'] })
    const stats = selectRegionStats(useAppStore.getState())
    expect(stats.map((s) => s.regionId)).toEqual(['RU-NIZ'])
    expect(stats[0]!.sites).toBe(50)
    useAppStore.getState().resetFilters()
    expect(useAppStore.getState().filters).toEqual(DEFAULT_FILTERS)
    expect(selectRegionStats(useAppStore.getState())).toHaveLength(6)
  })
})

describe('bootstrap', () => {
  it('loading → intro, решения посчитаны', async () => {
    const phases: string[] = []
    const unsub = useAppStore.subscribe((s, prev) => {
      if (s.phase !== prev.phase) phases.push(s.phase)
    })
    await bootstrap()
    unsub()
    expect(phases).toEqual(['loading', 'intro'])
    expect(Object.keys(useAppStore.getState().decisions)).toHaveLength(300)
    expect(useAppStore.getState().loadingProgress).toMatchObject({ step: 'Анализ лесосек', done: 300, total: 300 })
  })

  it('исключение → фаза error с текстом', async () => {
    await bootstrap({
      loadDataset: () => Promise.reject(new Error('Не удалось загрузить sites.json')),
      evaluateAll,
    })
    expect(useAppStore.getState().phase).toBe('error')
    expect(useAppStore.getState().error).toBe('Не удалось загрузить sites.json')
  })
})
