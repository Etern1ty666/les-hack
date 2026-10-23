// Игровое состояние и логика смены: заявки, бригады, выезды, решения, бюджет, рейтинг.
import { create } from 'zustand'
import { mulberry32, polylineLength, rand, type V2 } from '../lib/math'
import { generateWorld, type Site } from '../world/generate'
import { KIND_ORDER, KIND_RU, type Kind } from './engine'

export const world = generateWorld(7)

// --- Часы: мутабельные, двигаются в кадре рендера; стор получает снимок 10 раз в секунду ---
export const clock = { minutes: 8 * 60 + 30, speed: 1 }
export const GAME_MIN_PER_SEC = 2
export const TRUCK_SPEED = 1.7 // ед./игровую минуту

let lastAdvance = performance.now()
/** Двигает игровые часы по реальному времени. Вызывается и из кадра рендера (плавно), и из таймера логики (если вкладка в фоне). */
export function advanceClock() {
  const t = performance.now()
  const dt = Math.min((t - lastAdvance) / 1000, 1)
  lastAdvance = t
  if (useGame.getState().started) clock.minutes += dt * GAME_MIN_PER_SEC * clock.speed
}

export type SiteStatus = 'fresh' | 'called' | 'inspecting' | 'decision' | 'natural' | 'awaiting_planting' | 'planting' | 'restored'
export type CallType = 'inspection' | 'decision' | 'planting' | 'fire' | 'illegal'

export interface SiteState {
  status: SiteStatus
  chosen?: Kind
  plantStart?: number
  plantEnd?: number
  restoredAt?: number
  auditAt?: number
}

export interface Call {
  id: string
  type: CallType
  siteId?: string
  spot?: V2
  title: string
  place: string
  createdAt: number
  deadline: number | null
  brigadeId?: string
  approach: V2[]
}

export interface Brigade {
  id: string
  name: string
  genitive: string
  rating: number
  seed: number
  female: boolean
  status: 'free' | 'out'
  missionId?: string
}

export interface Mission {
  id: string
  brigadeId: string
  callId: string
  kind: CallType
  siteId?: string
  path: V2[]
  departAt: number
  arriveAt: number
  workEnd: number
  returnAt: number
  phase: 'out' | 'work' | 'back'
}

export interface Fire {
  id: string
  pos: V2
  callId: string
}

export interface Message {
  id: string
  at: number
  from: 'ai' | 'dispatch' | 'rosleshoz' | 'nursery' | 'brigade'
  title: string
  text: string
  tone: 'info' | 'good' | 'bad' | 'ai'
  siteId?: string
}

export interface Focus {
  x: number
  z: number
  key: number
  zoom?: number
}

interface GameState {
  started: boolean
  now: number
  speed: number
  budget: number
  reputation: number
  restoredHa: number
  sites: Record<string, SiteState>
  calls: Call[]
  brigades: Brigade[]
  missions: Mission[]
  fires: Fire[]
  burnZones: { x: number; z: number; r: number }[]
  messages: Message[]
  selectedCallId: string | null
  selectedBrigadeId: string | null
  selectedSiteId: string | null
  decisionSiteId: string | null
  focus: Focus | null
  version: number // меняется при изменении геометрии мира (гари) — для перерисовки леса и рельефа

  start(): void
  setSpeed(speed: number): void
  step(): void
  selectCall(id: string | null): void
  selectBrigade(id: string | null): void
  selectSite(id: string | null): void
  dispatch(callId: string, brigadeId: string): void
  openDecision(siteId: string | null): void
  choose(siteId: string, kind: Kind): void
  focusOn(x: number, z: number, zoom?: number): void
}

const BRIGADES: [string, string, number, boolean][] = [
  ['Ковалёв', 'Ковалёва', 1270, false],
  ['Агеева', 'Агеевой', 1220, true],
  ['Стоцкий', 'Стоцкого', 980, false],
  ['Ахмедов', 'Ахмедова', 970, false],
  ['Алиев', 'Алиева', 920, false],
  ['Макарова', 'Макаровой', 775, true],
  ['Медведев', 'Медведева', 675, false],
  ['Фролов', 'Фролова', 580, false],
  ['Волкова', 'Волковой', 565, true],
  ['Маршалов', 'Маршалова', 480, false],
  ['Хорошев', 'Хорошева', 450, false],
  ['Рокотов', 'Рокотова', 440, false],
  ['Лунёва', 'Лунёвой', 300, true],
  ['Фрязин', 'Фрязина', 290, false],
]

const rng = mulberry32(2026)
let idCounter = 0
const uid = (p: string) => `${p}${++idCounter}`

const DEADLINE: Record<Exclude<CallType, 'decision'>, [number, number]> = {
  inspection: [160, 240],
  planting: [600, 900],
  fire: [70, 95],
  illegal: [140, 200],
}
const WORK_MIN: Record<Exclude<CallType, 'decision'>, number> = { inspection: 45, planting: 20, fire: 30, illegal: 35 }

export const siteById = (id: string): Site => world.sites.find((s) => s.id === id)!
export const sitePlace = (s: Site) => `${s.name} · кв. ${s.quarter} выд. ${s.plot}`

const intensity = (k: Kind) => KIND_ORDER.indexOf(k)
const fmtRub = (x: number) => `${Math.round(x / 1000).toLocaleString('ru-RU')} тыс. ₽`

export const useGame = create<GameState>()((set, get) => {
  const msg = (m: Omit<Message, 'id' | 'at'>) => {
    set((s) => ({ messages: [{ ...m, id: uid('m'), at: clock.minutes }, ...s.messages].slice(0, 30) }))
  }

  const addCall = (c: Omit<Call, 'id' | 'createdAt'>) => {
    const call: Call = { ...c, id: uid('c'), createdAt: clock.minutes }
    set((s) => ({ calls: [call, ...s.calls] }))
    return call
  }

  const setSite = (id: string, patch: Partial<SiteState>) =>
    set((s) => ({ sites: { ...s.sites, [id]: { ...s.sites[id]!, ...patch } } }))

  const deadlineFor = (t: Exclude<CallType, 'decision'>) => clock.minutes + rand(rng, ...DEADLINE[t])

  const spawnInspection = (): boolean => {
    const fresh = world.sites.filter((st) => get().sites[st.id]?.status === 'fresh')
    if (fresh.length === 0) return false
    const site = fresh[Math.floor(rng() * fresh.length)]!
    setSite(site.id, { status: 'called' })
    addCall({
      type: 'inspection',
      siteId: site.id,
      title: 'Заключительный осмотр',
      place: sitePlace(site),
      deadline: deadlineFor('inspection'),
      approach: site.approach,
    })
    return true
  }

  const spawnSpotEvent = (type: 'fire' | 'illegal') => {
    const busy = new Set(get().calls.filter((c) => c.spot).map((c) => `${c.spot![0]},${c.spot![1]}`))
    const free = world.spots.filter(
      (sp) =>
        !busy.has(`${sp.pos[0]},${sp.pos[1]}`) &&
        !get().burnZones.some((b) => Math.hypot(b.x - sp.pos[0], b.z - sp.pos[1]) < b.r + 3),
    )
    if (free.length === 0) return
    const spot = free[Math.floor(rng() * free.length)]!
    const q = 10 + Math.floor(rng() * 140)
    const call = addCall({
      type,
      spot: spot.pos,
      title: type === 'fire' ? 'Возгорание' : 'Самовольная рубка',
      place: `Квартал ${q}`,
      deadline: deadlineFor(type),
      approach: spot.approach,
    })
    if (type === 'fire') {
      set((s) => ({ fires: [...s.fires, { id: uid('f'), pos: spot.pos, callId: call.id }] }))
      msg({ from: 'dispatch', title: 'Диспетчер', text: `Дым в квартале ${q}. Нужна бригада, пока огонь не ушёл в кроны.`, tone: 'bad' })
    } else {
      msg({ from: 'dispatch', title: 'Диспетчер', text: `Сигнал с камеры: техника и свежие пни в квартале ${q}. Билета на рубку нет.`, tone: 'info' })
    }
  }

  let nextSpawn = clock.minutes + 25
  let lastDay = Math.floor(clock.minutes / 1440)

  const completeMission = (m: Mission) => {
    const s = get()
    const b = s.brigades.find((x) => x.id === m.brigadeId)!
    const call = s.calls.find((c) => c.id === m.callId)
    if (m.kind === 'inspection' && m.siteId) {
      const site = siteById(m.siteId)
      const d = site.decision
      setSite(site.id, { status: 'decision' })
      set((st) => ({
        calls: st.calls.map((c) =>
          c.id === m.callId
            ? { ...c, type: 'decision' as const, title: 'Требуется решение', deadline: null, brigadeId: undefined, createdAt: clock.minutes }
            : c,
        ),
      }))
      msg({
        from: 'ai',
        title: 'ИИ «Подрост»',
        text: `${site.name}: приведённый подрост ${Math.round(d.normalized).toLocaleString('ru-RU')} шт/га (${Math.round(d.ratio * 100)} % нормы), встречаемость ${Math.round(d.occurrence * 100)} %. Рекомендую: ${KIND_RU[d.kind].toLowerCase()} (${Math.round(d.confidence * 100)} %).`,
        tone: 'ai',
        siteId: site.id,
      })
      return
    }
    if (m.kind === 'planting' && m.siteId) {
      const site = siteById(m.siteId)
      const st = s.sites[site.id]!
      const opt = site.decision.options[st.chosen ?? 'artificial']
      setSite(site.id, { status: 'restored', restoredAt: clock.minutes })
      set((g) => ({ restoredHa: g.restoredHa + site.areaHa, reputation: g.reputation + 2, calls: g.calls.filter((c) => c.id !== m.callId) }))
      msg({
        from: 'brigade',
        title: `Бригада ${b.genitive}`,
        text: `${site.name}: посажено ${opt.seedlings.toLocaleString('ru-RU')} сеянцев (${opt.composition}) на ${opt.areaToPlant.toLocaleString('ru-RU')} га.`,
        tone: 'good',
        siteId: site.id,
      })
      return
    }
    if (m.kind === 'illegal' && call) {
      const fine = Math.round(rand(rng, 0.8, 2.4) * 1e6 / 1000) * 1000
      set((g) => ({ budget: g.budget + fine, reputation: g.reputation + 3, calls: g.calls.filter((c) => c.id !== m.callId) }))
      msg({ from: 'brigade', title: `Бригада ${b.genitive}`, text: `${call.place}: составлен протокол, ущерб ${fmtRub(fine)} взыскан в бюджет.`, tone: 'good' })
      return
    }
    if (m.kind === 'fire' && call) {
      set((g) => ({ reputation: g.reputation + 3, calls: g.calls.filter((c) => c.id !== m.callId) }))
      msg({ from: 'brigade', title: `Бригада ${b.genitive}`, text: `${call.place}: возгорание локализовано, лес спасён.`, tone: 'good' })
    }
  }

  const expireCall = (c: Call) => {
    if (c.type === 'inspection' && c.siteId) {
      setSite(c.siteId, { status: 'fresh' })
      set((g) => ({ reputation: g.reputation - 3, calls: g.calls.filter((x) => x.id !== c.id) }))
      msg({ from: 'rosleshoz', title: 'Рослесхоз', text: `Срок заключительного осмотра нарушен: ${c.place}.`, tone: 'bad' })
    } else if (c.type === 'illegal') {
      set((g) => ({ reputation: g.reputation - 4, calls: g.calls.filter((x) => x.id !== c.id) }))
      msg({ from: 'rosleshoz', title: 'Рослесхоз', text: `${c.place}: нарушители скрылись, ущерб не возмещён.`, tone: 'bad' })
    } else if (c.type === 'planting') {
      set((g) => ({ reputation: g.reputation - 3, calls: g.calls.map((x) => (x.id === c.id ? { ...x, deadline: null } : x)) }))
      msg({ from: 'rosleshoz', title: 'Рослесхоз', text: `${c.place}: сорван срок посадки. Сеянцы подсыхают.`, tone: 'bad' })
    } else if (c.type === 'fire' && c.spot) {
      // огонь не потушен → гарь: новый участок под лесовосстановление
      const index = world.sites.length + 1
      const site = world.makeBurntSite(c.spot, index)
      world.sites.push(site)
      set((g) => ({
        reputation: g.reputation - 6,
        calls: g.calls.filter((x) => x.id !== c.id),
        fires: g.fires.filter((f) => f.callId !== c.id),
        burnZones: [...g.burnZones, { x: c.spot![0], z: c.spot![1], r: site.w / 2 + 0.8 }],
        sites: { ...g.sites, [site.id]: { status: 'fresh' } },
        version: g.version + 1,
      }))
      msg({ from: 'rosleshoz', title: 'Рослесхоз', text: `${c.place}: пожар не остановлен, сгорело ${site.areaHa.toLocaleString('ru-RU')} га. Появилась гарь под лесовосстановление.`, tone: 'bad', siteId: site.id })
    }
  }

  return {
    started: false,
    now: clock.minutes,
    speed: 1,
    budget: 15_618_000,
    reputation: 50,
    restoredHa: 0,
    sites: Object.fromEntries(world.sites.map((s) => [s.id, { status: 'fresh' as SiteStatus }])),
    calls: [],
    brigades: BRIGADES.map(([name, genitive, rating, female], i) => ({
      id: `b${i}`,
      name,
      genitive,
      rating,
      female,
      seed: 1000 + i * 37,
      status: 'free',
    })),
    missions: [],
    fires: [],
    burnZones: [],
    messages: [],
    selectedCallId: null,
    selectedBrigadeId: null,
    selectedSiteId: null,
    decisionSiteId: null,
    focus: null,
    version: 0,

    start() {
      set({ started: true })
      spawnInspection()
      spawnInspection()
      spawnInspection()
      spawnSpotEvent('illegal')
      msg({
        from: 'rosleshoz',
        title: 'Рослесхоз',
        text: 'Смена началась. Проведите заключительные осмотры лесосек и примите решения о лесовосстановлении.',
        tone: 'info',
      })
      msg({
        from: 'ai',
        title: 'ИИ «Подрост»',
        text: 'Я оцениваю подрост по нормативам и подскажу способ: естественное, комбинированное или искусственное.',
        tone: 'ai',
      })
    },

    setSpeed(speed) {
      clock.speed = speed
      set({ speed })
    },

    step() {
      const s = get()
      if (!s.started) return
      const now = clock.minutes

      // ежедневная субсидия
      const day = Math.floor(now / 1440)
      if (day !== lastDay) {
        lastDay = day
        set((g) => ({ budget: g.budget + 1_200_000 }))
        msg({ from: 'rosleshoz', title: 'Рослесхоз', text: 'Поступило финансирование на лесовосстановление: 1 200 тыс. ₽.', tone: 'good' })
      }

      // новые заявки
      if (now >= nextSpawn && s.calls.filter((c) => c.type !== 'decision').length < 7) {
        const r = rng()
        if (r < 0.62) {
          if (!spawnInspection()) spawnSpotEvent(rng() < 0.5 ? 'fire' : 'illegal')
        } else spawnSpotEvent(r < 0.8 ? 'fire' : 'illegal')
        nextSpawn = now + rand(rng, 28, 60)
      }

      // выезды
      for (const m of s.missions) {
        if (m.phase === 'out' && now >= m.arriveAt) {
          set((g) => ({ missions: g.missions.map((x) => (x.id === m.id ? { ...x, phase: 'work' as const } : x)) }))
          if (m.kind === 'planting' && m.siteId) setSite(m.siteId, { status: 'planting', plantStart: m.arriveAt, plantEnd: m.workEnd })
          if (m.kind === 'inspection' && m.siteId) setSite(m.siteId, { status: 'inspecting' })
          if (m.kind === 'fire') set((g) => ({ fires: g.fires.filter((f) => f.callId !== m.callId) }))
        } else if (m.phase === 'work' && now >= m.workEnd) {
          set((g) => ({ missions: g.missions.map((x) => (x.id === m.id ? { ...x, phase: 'back' as const } : x)) }))
          completeMission(m)
        } else if (m.phase === 'back' && now >= m.returnAt) {
          set((g) => ({
            missions: g.missions.filter((x) => x.id !== m.id),
            brigades: g.brigades.map((b) => (b.id === m.brigadeId ? { ...b, status: 'free' as const, missionId: undefined } : b)),
          }))
        }
      }

      // просрочки (только неназначенные)
      for (const c of get().calls) {
        if (c.deadline !== null && !c.brigadeId && now > c.deadline) expireCall(c)
      }

      // проверки участков, оставленных под естественное возобновление
      for (const [id, st] of Object.entries(get().sites)) {
        if (st.status !== 'natural' || st.auditAt === undefined || now < st.auditAt) continue
        const site = siteById(id)
        if (site.decision.kind === 'natural') {
          setSite(id, { status: 'restored', restoredAt: now, auditAt: undefined })
          set((g) => ({ reputation: g.reputation + 2, restoredHa: g.restoredHa + site.areaHa }))
          msg({ from: 'rosleshoz', title: 'Рослесхоз', text: `${site.name}: подрост сохранён, лесовосстановление обеспечено.`, tone: 'good', siteId: id })
        } else {
          setSite(id, { status: 'awaiting_planting', chosen: site.decision.kind, auditAt: undefined })
          set((g) => ({ reputation: g.reputation - 6, budget: g.budget - 500_000 }))
          addCall({ type: 'planting', siteId: id, title: 'Посадка (повторно)', place: sitePlace(site), deadline: deadlineFor('planting'), approach: site.approach })
          msg({
            from: 'rosleshoz',
            title: 'Рослесхоз',
            text: `${site.name}: подроста недостаточно, лесовосстановление не обеспечено. Штраф 500 тыс. ₽, нужна посадка.`,
            tone: 'bad',
            siteId: id,
          })
        }
      }

      set({ now })
    },

    selectCall(id) {
      const call = id ? get().calls.find((c) => c.id === id) : undefined
      set({ selectedCallId: id, selectedSiteId: call?.siteId ?? null })
      if (call) {
        const p = call.siteId ? siteById(call.siteId).center : call.spot!
        get().focusOn(p[0], p[1])
        const b = get().selectedBrigadeId
        if (call.type === 'decision' && call.siteId) set({ decisionSiteId: call.siteId })
        else if (b && !call.brigadeId) get().dispatch(call.id, b)
      }
    },

    selectBrigade(id) {
      const b = id ? get().brigades.find((x) => x.id === id) : undefined
      if (b && b.status !== 'free') {
        const m = get().missions.find((x) => x.id === b.missionId)
        const target = m?.path[m.path.length - 1]
        if (target) get().focusOn(target[0], target[1])
        set({ selectedBrigadeId: null })
        return
      }
      set({ selectedBrigadeId: id })
      const call = get().calls.find((c) => c.id === get().selectedCallId)
      if (id && call && !call.brigadeId && call.type !== 'decision') get().dispatch(call.id, id)
    },

    selectSite(id) {
      set({ selectedSiteId: id })
      if (!id) return
      const call = get().calls.find((c) => c.siteId === id)
      if (call) get().selectCall(call.id)
      else {
        const site = siteById(id)
        get().focusOn(site.center[0], site.center[1])
      }
    },

    dispatch(callId, brigadeId) {
      const s = get()
      const call = s.calls.find((c) => c.id === callId)
      const b = s.brigades.find((x) => x.id === brigadeId)
      if (!call || !b || b.status !== 'free' || call.brigadeId || call.type === 'decision') return
      const now = clock.minutes
      const travel = polylineLength(call.approach) / TRUCK_SPEED
      let work = WORK_MIN[call.type as Exclude<CallType, 'decision'>]
      if (call.type === 'inspection') work *= 1.3 - b.rating / 2000
      if (call.type === 'planting' && call.siteId) {
        const st = s.sites[call.siteId]!
        work += siteById(call.siteId).decision.options[st.chosen ?? 'artificial'].areaToPlant * 10
      }
      const mission: Mission = {
        id: uid('mi'),
        brigadeId,
        callId,
        kind: call.type,
        siteId: call.siteId,
        path: call.approach,
        departAt: now,
        arriveAt: now + travel,
        workEnd: now + travel + work,
        returnAt: now + travel * 2 + work,
        phase: 'out',
      }
      set((g) => ({
        missions: [...g.missions, mission],
        brigades: g.brigades.map((x) => (x.id === brigadeId ? { ...x, status: 'out' as const, missionId: mission.id } : x)),
        calls: g.calls.map((c) => (c.id === callId ? { ...c, brigadeId } : c)),
        budget: g.budget - 20_000,
        selectedBrigadeId: null,
      }))
      msg({ from: 'dispatch', title: 'Диспетчер', text: `Бригада ${b.genitive} выехала: ${call.place}. В пути ≈ ${Math.round(travel)} мин.`, tone: 'info' })
    },

    openDecision(siteId) {
      set({ decisionSiteId: siteId })
    },

    choose(siteId, kind) {
      const site = siteById(siteId)
      const d = site.decision
      const opt = d.options[kind]
      const call = get().calls.find((c) => c.siteId === siteId && c.type === 'decision')
      set((g) => ({
        budget: g.budget - opt.cost,
        calls: g.calls.filter((c) => c.id !== call?.id),
        decisionSiteId: null,
        selectedCallId: null,
      }))
      if (kind === 'natural') {
        setSite(siteId, { status: 'natural', chosen: kind, auditAt: clock.minutes + 18 * 60 })
      } else {
        setSite(siteId, { status: 'awaiting_planting', chosen: kind })
        addCall({ type: 'planting', siteId, title: 'Посадка лесных культур', place: sitePlace(site), deadline: deadlineFor('planting'), approach: site.approach })
      }
      const diff = intensity(kind) - intensity(d.kind)
      if (diff === 0) {
        set((g) => ({ reputation: g.reputation + 3 }))
        msg({ from: 'ai', title: 'ИИ «Подрост»', text: `${site.name}: решение «${KIND_RU[kind]}» соответствует нормативам. ${kind === 'natural' ? 'Проверка через 18 ч.' : 'Назначьте бригаду на посадку.'}`, tone: 'ai', siteId })
      } else if (diff > 0) {
        set((g) => ({ reputation: g.reputation - 1 }))
        msg({ from: 'ai', title: 'ИИ «Подрост»', text: `${site.name}: можно было обойтись мерами дешевле — перерасход ${fmtRub(opt.cost - d.options[d.kind].cost)}.`, tone: 'bad', siteId })
      } else {
        msg({ from: 'ai', title: 'ИИ «Подрост»', text: `${site.name}: принято вопреки рекомендации. Риск, что лесовосстановление не будет обеспечено.`, tone: 'bad', siteId })
      }
    },

    focusOn(x, z, zoom) {
      set((g) => ({ focus: { x, z, zoom, key: (g.focus?.key ?? 0) + 1 } }))
    },
  }
})

export function fmtClock(minutes: number) {
  const m = Math.floor(minutes) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
export function fmtDate(minutes: number) {
  const d = new Date(2026, 4, 16 + Math.floor(minutes / 1440))
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function fmtLeft(minutes: number) {
  const m = Math.max(0, Math.ceil(minutes))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
