// Оперативный центр: загрузка района, лента событий, бригады на реальных дорогах, решения ИИ на утверждение.
import { create } from 'zustand'
import { buildArea, type Area, type AreaSpec, type Site } from '../data/build'
import { polylineLength, type V2 } from '../lib/math'
import { KIND_RU, type Kind } from './engine'

// --- модельное время: стартует с реального, ускоряется для демонстрации ---
const START_MS = Date.now()
export const sim = { minutes: 0, speed: 120 }
let lastTick = performance.now()
export function advanceSim() {
  const t = performance.now()
  const dt = Math.min((t - lastTick) / 1000, 1)
  lastTick = t
  if (useOps.getState().status === 'ready') sim.minutes += (dt * sim.speed) / 60
}
export const simDate = (minutes: number) => new Date(START_MS + minutes * 60000)

export const TRUCK_UNITS_PER_MIN = 8.3 // ≈ 30 км/ч при 60 м/ед.

export type SiteStatus = 'detected' | 'inspection' | 'decision' | 'planned' | 'planting' | 'natural' | 'restored'

export interface SiteState {
  status: SiteStatus
  chosen?: Kind
  plantStart?: number
  plantEnd?: number
  restoredAt?: number
  auditAt?: number
  brigadeId?: string
}

export type EventKind = 'satellite' | 'dispatch' | 'inspection' | 'decision' | 'planting' | 'restored' | 'audit' | 'system'

export interface OpsEvent {
  id: string
  at: number
  kind: EventKind
  title: string
  text: string
  siteId?: string
}

export interface Brigade {
  id: string
  name: string
  lead: string
  seed: number
  female: boolean
  missionId?: string
}

export interface Mission {
  id: string
  brigadeId: string
  siteId: string
  task: 'inspection' | 'planting'
  path: V2[]
  departAt: number
  arriveAt: number
  workEnd: number
  returnAt: number
  phase: 'out' | 'work' | 'back'
}

export interface Focus {
  x: number
  z: number
  zoom?: number
  key: number
}

interface OpsState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  progress: Record<string, { done: number; total: number }>
  error: string | null
  area: Area | null
  label: { region: string; place: string }
  version: number
  now: number
  speed: number
  autoAssign: boolean
  sites: Record<string, SiteState>
  events: OpsEvent[]
  brigades: Brigade[]
  missions: Mission[]
  selectedSiteId: string | null
  focus: Focus | null
  overviewOpen: boolean

  loadArea(spec: AreaSpec, region?: string): Promise<void>
  step(): void
  setSpeed(v: number): void
  setAutoAssign(v: boolean): void
  dispatch(siteId: string): void
  approve(siteId: string, kind: Kind): void
  select(siteId: string | null): void
  focusOn(x: number, z: number, zoom?: number): void
  setOverview(open: boolean): void
}

const CREW: [string, boolean][] = [
  ['Ковалёв А. С.', false],
  ['Агеева Н. В.', true],
  ['Стоцкий П. И.', false],
  ['Ахмедов Р. Т.', false],
  ['Макарова Е. О.', true],
  ['Медведев Д. А.', false],
]

let uidN = 0
const uid = (p: string) => `${p}${++uidN}`

export const fmtTime = (minutes: number) => simDate(minutes).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
export const fmtDay = (minutes: number) => simDate(minutes).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
export const fmtCoord = ([lon, lat]: [number, number]) => `${lat.toFixed(4).replace('.', ',')}° с. ш. ${lon.toFixed(4).replace('.', ',')}° в. д.`

export const siteOf = (id: string): Site | undefined => useOps.getState().area?.sites.find((s) => s.id === id)

export const useOps = create<OpsState>()((set, get) => {
  const log = (e: Omit<OpsEvent, 'id' | 'at'>) =>
    set((s) => ({ events: [{ ...e, id: uid('e'), at: sim.minutes }, ...s.events].slice(0, 60) }))
  const setSite = (id: string, patch: Partial<SiteState>) => set((s) => ({ sites: { ...s.sites, [id]: { ...s.sites[id]!, ...patch } } }))

  let nextAuto = 0

  const startMission = (siteId: string, task: Mission['task'], brigade: Brigade) => {
    const area = get().area!
    const site = siteOf(siteId)!
    const path = area.route(site.center)
    const travel = polylineLength(path) / TRUCK_UNITS_PER_MIN
    const st = get().sites[siteId]!
    const work = task === 'inspection' ? 70 + site.areaHa * 6 : 40 + site.decision.options[st.chosen ?? 'artificial'].areaToPlant * 35
    const now = sim.minutes
    const m: Mission = {
      id: uid('m'),
      brigadeId: brigade.id,
      siteId,
      task,
      path,
      departAt: now,
      arriveAt: now + travel,
      workEnd: now + travel + work,
      returnAt: now + travel * 2 + work,
      phase: 'out',
    }
    set((s) => ({
      missions: [...s.missions, m],
      brigades: s.brigades.map((b) => (b.id === brigade.id ? { ...b, missionId: m.id } : b)),
    }))
    setSite(siteId, { status: task === 'inspection' ? 'inspection' : 'planting', brigadeId: brigade.id })
    const km = (polylineLength(path) * 60) / 1000
    log({
      kind: 'dispatch',
      title: `${brigade.name} выехала`,
      text: `${task === 'inspection' ? 'Заключительный осмотр' : 'Посадка лесных культур'}: ${site.name}. Маршрут ${km.toFixed(1).replace('.', ',')} км по дорогам, прибытие ≈ ${fmtTime(m.arriveAt)}.`,
      siteId,
    })
  }

  const freeBrigade = () => get().brigades.find((b) => !b.missionId)

  return {
    status: 'idle',
    progress: {},
    error: null,
    area: null,
    label: { region: '', place: '' },
    version: 0,
    now: 0,
    speed: sim.speed,
    autoAssign: true,
    sites: {},
    events: [],
    brigades: CREW.map(([lead, female], i) => ({ id: `b${i}`, name: `Бригада № ${i + 1}`, lead, female, seed: 1000 + i * 37 })),
    missions: [],
    selectedSiteId: null,
    focus: null,
    overviewOpen: false,

    async loadArea(spec, region) {
      set({ status: 'loading', progress: {}, error: null, overviewOpen: false })
      try {
        const area = await buildArea(spec, (step, done, total) => set((s) => ({ progress: { ...s.progress, [step]: { done, total } } })))
        const placeName = area.base.place
        sim.minutes = 0
        nextAuto = 8
        set((s) => ({
          status: 'ready',
          area,
          version: s.version + 1,
          label: { region: region ?? '', place: placeName },
          sites: Object.fromEntries(area.sites.map((st) => [st.id, { status: 'detected' as SiteStatus }])),
          events: [],
          missions: [],
          brigades: s.brigades.map((b) => ({ ...b, missionId: undefined })),
          selectedSiteId: null,
          focus: { x: 0, z: 0, zoom: Math.max(area.W, area.D) * 0.95, key: (s.focus?.key ?? 0) + 1 },
          now: 0,
        }))
        const recent = Math.round(area.stats.recentLossHa)
        log({
          kind: 'satellite',
          title: 'Спутниковый мониторинг',
          text: `Hansen GFC: в районе ${recent.toLocaleString('ru-RU')} га рубок за 2019–2024 гг. На контроль поставлено ${area.sites.length} лесосек — по ним нужны заключительные осмотры и решения о лесовосстановлении.`,
        })
        log({ kind: 'system', title: 'Район загружен', text: `${area.base.name}. Лесистость (OSM + спутник) — ${Math.round(area.stats.forestShare * 100)} % территории. Бригад на линии: ${get().brigades.length}.` })
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    },

    step() {
      const s = get()
      if (s.status !== 'ready' || !s.area) return
      const now = sim.minutes

      // автоназначение: свободная бригада едет на ближайший необследованный участок
      if (s.autoAssign && now >= nextAuto) {
        nextAuto = now + 25
        const b = freeBrigade()
        const planned = s.area.sites.find((st) => s.sites[st.id]?.status === 'planned')
        const detected = s.area.sites.filter((st) => s.sites[st.id]?.status === 'detected')
        if (b && planned) startMission(planned.id, 'planting', b)
        else if (b && detected.length) {
          const site = detected.sort((a, c) => Math.hypot(a.center[0] - s.area!.base.pos[0], a.center[1] - s.area!.base.pos[1]) - Math.hypot(c.center[0] - s.area!.base.pos[0], c.center[1] - s.area!.base.pos[1]))[0]!
          startMission(site.id, 'inspection', b)
        }
      }

      for (const m of s.missions) {
        const site = siteOf(m.siteId)!
        const brigade = s.brigades.find((b) => b.id === m.brigadeId)!
        if (m.phase === 'out' && now >= m.arriveAt) {
          set((g) => ({ missions: g.missions.map((x) => (x.id === m.id ? { ...x, phase: 'work' as const } : x)) }))
          if (m.task === 'planting') setSite(m.siteId, { plantStart: m.arriveAt, plantEnd: m.workEnd })
        } else if (m.phase === 'work' && now >= m.workEnd) {
          set((g) => ({ missions: g.missions.map((x) => (x.id === m.id ? { ...x, phase: 'back' as const } : x)) }))
          if (m.task === 'inspection') {
            const d = site.decision
            setSite(m.siteId, { status: 'decision', brigadeId: undefined })
            log({
              kind: 'inspection',
              title: `Осмотр завершён · ${site.name}`,
              text: `Подрост ${Math.round(d.normalized).toLocaleString('ru-RU')} шт/га (${Math.round(d.ratio * 100)} % норматива), встречаемость ${Math.round(d.occurrence * 100)} %. ИИ рекомендует: ${KIND_RU[d.kind].toLowerCase()} (${Math.round(d.confidence * 100)} %). Требуется утверждение.`,
              siteId: m.siteId,
            })
          } else {
            const st = get().sites[m.siteId]!
            const opt = site.decision.options[st.chosen ?? 'artificial']
            setSite(m.siteId, { status: 'restored', restoredAt: now, brigadeId: undefined })
            log({
              kind: 'restored',
              title: `Посадка выполнена · ${site.name}`,
              text: `${brigade.name}: ${opt.seedlings.toLocaleString('ru-RU')} сеянцев (${opt.composition}) на ${opt.areaToPlant.toLocaleString('ru-RU')} га.`,
              siteId: m.siteId,
            })
          }
        } else if (m.phase === 'back' && now >= m.returnAt) {
          set((g) => ({
            missions: g.missions.filter((x) => x.id !== m.id),
            brigades: g.brigades.map((b) => (b.id === m.brigadeId ? { ...b, missionId: undefined } : b)),
          }))
        }
      }

      // контроль естественного возобновления
      for (const [id, st] of Object.entries(get().sites)) {
        if (st.status !== 'natural' || st.auditAt === undefined || now < st.auditAt) continue
        const site = siteOf(id)!
        if (site.decision.kind === 'natural') {
          setSite(id, { status: 'restored', restoredAt: now, auditAt: undefined })
          log({ kind: 'audit', title: `Контроль · ${site.name}`, text: 'Подрост сохранился, естественное лесовосстановление обеспечено.', siteId: id })
        } else {
          setSite(id, { status: 'planned', chosen: site.decision.kind, auditAt: undefined })
          log({ kind: 'audit', title: `Контроль · ${site.name}`, text: `Подроста недостаточно — назначена посадка (${KIND_RU[site.decision.kind].toLowerCase()}).`, siteId: id })
        }
      }
      set({ now })
    },

    setSpeed(v) {
      sim.speed = v
      set({ speed: v })
    },
    setAutoAssign(v) {
      set({ autoAssign: v })
    },

    dispatch(siteId) {
      const st = get().sites[siteId]
      const b = freeBrigade()
      if (!st || !b) return
      if (st.status === 'detected') startMission(siteId, 'inspection', b)
      else if (st.status === 'planned') startMission(siteId, 'planting', b)
    },

    approve(siteId, kind) {
      const site = siteOf(siteId)!
      const d = site.decision
      if (kind === 'natural') {
        setSite(siteId, { status: 'natural', chosen: kind, auditAt: sim.minutes + 24 * 60 })
      } else {
        setSite(siteId, { status: 'planned', chosen: kind })
      }
      const opt = d.options[kind]
      log({
        kind: 'decision',
        title: `Решение утверждено · ${site.name}`,
        text: `${KIND_RU[kind]}${kind === d.kind ? ' (по рекомендации ИИ)' : ' (вопреки рекомендации ИИ)'}. ${opt.measures}. Оценка ${Math.round(opt.cost / 1000).toLocaleString('ru-RU')} тыс. ₽.`,
        siteId,
      })
    },

    select(siteId) {
      set({ selectedSiteId: siteId })
      const site = siteId ? siteOf(siteId) : undefined
      if (site) get().focusOn(site.center[0], site.center[1], 70)
    },
    focusOn(x, z, zoom) {
      set((s) => ({ focus: { x, z, zoom, key: (s.focus?.key ?? 0) + 1 } }))
    },
    setOverview(open) {
      set({ overviewOpen: open })
    },
  }
})
