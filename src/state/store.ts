// Глобальный стор (КОНТРАКТ, setup-app-foundation design D10). Только сериализуемые значения.
import { create } from 'zustand'
import { DECISION_KINDS } from '@/domain/constants'
import type {
  CameraRequest,
  CuttingSite,
  Dataset,
  DecisionDiff,
  DecisionKind,
  DecisionResult,
  FeedEvent,
  FellingType,
  LonLat,
  MapMode,
  NormsConfig,
  SpeciesCode,
} from '@/domain/types'
import { DEFAULT_NORMS, diffDecisions, evaluateAll, evaluateSite } from '@/engine'

export type AppPhase = 'boot' | 'loading' | 'intro' | 'ready' | 'error'
export type ViewId = 'map' | 'analytics' | 'norms'

export interface Filters {
  kinds: DecisionKind[]        // по умолчанию все 4
  regionIds: string[]          // [] = все
  species: SpeciesCode[]       // по главной целевой породе; [] = все
  fellingTypes: FellingType[]  // [] = все
  minConfidence: number        // 0..1
}

export interface LayerToggles {
  hexes: boolean
  sites: boolean
  regions: boolean
  labels: boolean
  hillshade: boolean
  forestLoss: boolean
  atmosphere: boolean
  edgeScroll: boolean
}

export interface CameraState {
  center: LonLat
  zoom: number
  pitch: number
  bearing: number
  bounds: [LonLat, LonLat] | null // [юго-запад, северо-восток]
}

export interface WhatIfState {
  siteId: string
  draft: CuttingSite
  result: DecisionResult
}

export interface UiState {
  leftPanelCollapsed: boolean
  feedCollapsed: boolean
  hotkeysHelpOpen: boolean
  hudHidden: boolean
}

export interface AppState {
  phase: AppPhase
  loadingProgress: { step: string; done: number; total: number }
  error: string | null
  dataset: Dataset | null
  sitesById: Record<string, CuttingSite>
  norms: NormsConfig
  decisions: Record<string, DecisionResult>
  lastDiff: DecisionDiff | null
  view: ViewId
  mapMode: MapMode
  filters: Filters
  layers: LayerToggles
  selectedSiteId: string | null
  selectedRegionId: string | null
  hoveredSiteId: string | null
  camera: CameraState
  cameraRequest: CameraRequest | null
  whatIf: WhatIfState | null
  feed: FeedEvent[]
  ui: UiState

  setPhase(phase: AppPhase): void
  setLoadingProgress(p: AppState['loadingProgress']): void
  setError(message: string | null): void
  setDataset(ds: Dataset, decisions: Record<string, DecisionResult>): void
  setNorms(norms: NormsConfig): void
  addSites(sites: CuttingSite[]): void
  setView(view: ViewId): void
  setMapMode(mode: MapMode): void
  setFilters(patch: Partial<Filters>): void
  resetFilters(): void
  toggleLayer(key: keyof LayerToggles): void
  selectSite(id: string | null, opts?: { fly?: boolean }): void
  selectRegion(id: string | null, opts?: { fly?: boolean }): void
  setHoveredSite(id: string | null): void
  requestCamera(req: Omit<CameraRequest, 'id'>): void
  setCamera(camera: CameraState): void
  startWhatIf(siteId: string): void
  updateWhatIf(draft: CuttingSite): void
  endWhatIf(): void
  pushFeed(e: Omit<FeedEvent, 'id' | 'ts'>): void
  setUi(patch: Partial<UiState>): void
}

export const DEFAULT_FILTERS: Filters = {
  kinds: [...DECISION_KINDS],
  regionIds: [],
  species: [],
  fellingTypes: [],
  minConfidence: 0,
}

export const DEFAULT_LAYERS: LayerToggles = {
  hexes: true,
  sites: true,
  regions: true,
  labels: true,
  hillshade: true,
  forestLoss: false,
  atmosphere: true,
  edgeScroll: false,
}

export const INITIAL_CAMERA: CameraState = { center: [70, 40], zoom: 1.15, pitch: 0, bearing: 0, bounds: null }

export const FEED_LIMIT = 50

let cameraRequestId = 0
let feedCounter = 0

export const useAppStore = create<AppState>()((set, get) => ({
  phase: 'boot',
  loadingProgress: { step: '', done: 0, total: 0 },
  error: null,
  dataset: null,
  sitesById: {},
  norms: DEFAULT_NORMS,
  decisions: {},
  lastDiff: null,
  view: 'map',
  mapMode: 'decision',
  filters: DEFAULT_FILTERS,
  layers: DEFAULT_LAYERS,
  selectedSiteId: null,
  selectedRegionId: null,
  hoveredSiteId: null,
  camera: INITIAL_CAMERA,
  cameraRequest: null,
  whatIf: null,
  feed: [],
  ui: { leftPanelCollapsed: false, feedCollapsed: false, hotkeysHelpOpen: false, hudHidden: false },

  setPhase: (phase) => set({ phase }),
  setLoadingProgress: (loadingProgress) => set({ loadingProgress }),
  setError: (error) => set({ error }),

  setDataset: (dataset, decisions) =>
    set({
      dataset,
      decisions,
      sitesById: Object.fromEntries(dataset.sites.map((s) => [s.id, s])),
      lastDiff: null,
    }),

  setNorms: (norms) => {
    const { dataset, decisions: prev, whatIf } = get()
    const next = dataset ? evaluateAll(dataset.sites, norms) : {}
    set({
      norms,
      decisions: next,
      lastDiff: diffDecisions(prev, next),
      whatIf: whatIf ? { ...whatIf, result: evaluateSite(whatIf.draft, norms) } : null,
    })
  },

  addSites: (sites) => {
    const { dataset, sitesById, decisions, norms } = get()
    if (!dataset || sites.length === 0) return
    const added = evaluateAll(sites, norms)
    set({
      dataset: { ...dataset, sites: [...dataset.sites, ...sites] },
      sitesById: { ...sitesById, ...Object.fromEntries(sites.map((s) => [s.id, s])) },
      decisions: { ...decisions, ...added },
    })
  },

  setView: (view) => set({ view }),
  setMapMode: (mapMode) => set({ mapMode }),
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  toggleLayer: (key) => set({ layers: { ...get().layers, [key]: !get().layers[key] } }),

  selectSite: (id, opts) => {
    const { whatIf, sitesById } = get()
    set({ selectedSiteId: id, whatIf: whatIf && whatIf.siteId !== id ? null : whatIf })
    const site = id ? sitesById[id] : undefined
    if (site && opts?.fly) get().requestCamera({ center: site.centroid, zoom: 13.5, pitch: 55 })
  },

  selectRegion: (id, opts) => {
    set({ selectedRegionId: id })
    const region = id ? get().dataset?.regions.find((r) => r.id === id) : undefined
    if (region && opts?.fly) get().requestCamera({ center: region.centroid, zoom: 5, pitch: 40 })
  },

  setHoveredSite: (hoveredSiteId) => set({ hoveredSiteId }),
  requestCamera: (req) => set({ cameraRequest: { ...req, id: ++cameraRequestId } }),
  setCamera: (camera) => set({ camera }),

  startWhatIf: (siteId) => {
    const { sitesById, norms } = get()
    const site = sitesById[siteId]
    if (!site) return
    const draft = structuredClone(site)
    set({ whatIf: { siteId, draft, result: evaluateSite(draft, norms) } })
  },

  updateWhatIf: (draft) => {
    const { whatIf, norms } = get()
    if (!whatIf) return
    set({ whatIf: { ...whatIf, draft, result: evaluateSite(draft, norms) } })
  },

  endWhatIf: () => set({ whatIf: null }),

  pushFeed: (e) => {
    const ts = Date.now()
    const event: FeedEvent = { ...e, id: `${ts}-${++feedCounter}`, ts }
    set({ feed: [event, ...get().feed].slice(0, FEED_LIMIT) })
  },

  setUi: (patch) => set({ ui: { ...get().ui, ...patch } }),
}))
