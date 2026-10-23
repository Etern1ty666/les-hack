// Интерфейс оператора: верхняя полоса, оперативная лента, досье лесосеки с решением ИИ, бригады, загрузка.
import { AlertTriangle, Bot, Check, ClipboardList, Globe2, MapIcon, Satellite, Send, Sprout, TreePine, Truck } from 'lucide-react'
import { HEIGHT_RU, KIND_COLOR, KIND_ORDER, KIND_RU, SPECIES_RU } from '../ops/engine'
import { fmtCoord, fmtDay, fmtTime, siteOf, useOps, type EventKind, type SiteStatus } from '../ops/store'
import { Portrait } from './Portrait'

const STATUS: Record<SiteStatus, { label: string; color: string }> = {
  detected: { label: 'Ждёт осмотра', color: '#55606a' },
  inspection: { label: 'Идёт осмотр', color: '#2e6b57' },
  decision: { label: 'Нужно решение', color: '#b8862a' },
  planned: { label: 'Посадка запланирована', color: '#8a6d2a' },
  planting: { label: 'Идёт посадка', color: '#5d7a2e' },
  natural: { label: 'Естественное (контроль)', color: '#3f9a5b' },
  restored: { label: 'Лесовосстановление выполнено', color: '#3f9a5b' },
}
const EV: Record<EventKind, { color: string; Icon: typeof Truck }> = {
  satellite: { color: '#8fb4d9', Icon: Satellite },
  dispatch: { color: '#b3b8ae', Icon: Truck },
  inspection: { color: '#3fc79a', Icon: Bot },
  decision: { color: '#f2b33d', Icon: ClipboardList },
  planting: { color: '#9fe07a', Icon: Sprout },
  restored: { color: '#7ccf5a', Icon: TreePine },
  audit: { color: '#c9c26a', Icon: Check },
  system: { color: '#b3b8ae', Icon: Globe2 },
}
const SPEEDS: [number, string][] = [
  [1, 'Реальное'],
  [60, '×60'],
  [120, '×120'],
  [480, '×480'],
]
const rub = (x: number) => (x >= 1e6 ? `${(x / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн ₽` : `${Math.round(x / 1000).toLocaleString('ru-RU')} тыс. ₽`)

function Top() {
  const now = useOps((s) => s.now)
  const label = useOps((s) => s.label)
  const area = useOps((s) => s.area)
  const speed = useOps((s) => s.speed)
  const setSpeed = useOps((s) => s.setSpeed)
  const auto = useOps((s) => s.autoAssign)
  const setAuto = useOps((s) => s.setAutoAssign)
  const mode = useOps((s) => s.mode)
  const setMode = useOps((s) => s.setMode)
  return (
    <div className="top">
      <span className="brand">
        <TreePine size={20} color="#3fc79a" /> ПОДРОСТ <small>ОПЕРАТИВНЫЙ ЦЕНТР</small>
      </span>
      {mode === 'map' && (
        <span className="top__area">
          <b>Карта лесов России</b>
          <span>OpenStreetMap · рельеф · лесистость и рубки Hansen GFC</span>
        </span>
      )}
      {mode === 'area' && area && (
        <span className="top__area">
          <b>
            {label.region || 'Район'}
            {label.place ? ` · ${label.place}` : ''}
          </b>
          <span>
            {fmtCoord([area.spec.lon, area.spec.lat])} · {area.spec.widthKm}×{area.spec.heightKm} км
          </span>
        </span>
      )}
      <span className="top__spacer" />
      {mode === 'area' && (
        <>
          <label className="toggle">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Автоназначение бригад
          </label>
          <span className="seg" title="Ускорение модельного времени для демонстрации">
            {SPEEDS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={speed === v} onClick={() => setSpeed(v)}>
                {l}
              </button>
            ))}
          </span>
          <span className="top__clock">{fmtTime(now)}</span>
          <span className="top__date">{fmtDay(now)}</span>
        </>
      )}
      <span className="seg seg--mode">
        <button type="button" aria-pressed={mode === 'map'} onClick={() => setMode('map')}>
          <MapIcon size={15} /> Карта
        </button>
        <button type="button" aria-pressed={mode === 'area'} disabled={!area} title={area ? undefined : 'Выберите район на карте'} onClick={() => setMode('area')}>
          <TreePine size={15} /> Район
        </button>
      </span>
    </div>
  )
}

function Feed() {
  const events = useOps((s) => s.events)
  const select = useOps((s) => s.select)
  return (
    <div className="feed">
      <span className="tab-title">ОПЕРАТИВНАЯ ЛЕНТА</span>
      <div className="feed__list">
        {events.map((e) => {
          const { color, Icon } = EV[e.kind]
          return (
            <button key={e.id} type="button" className="ev" style={{ ['--ev' as string]: color }} onClick={() => e.siteId && select(e.siteId)}>
              <div className="ev__head">
                <Icon size={14} /> {e.title}
                <span className="ev__time">{fmtTime(e.at)}</span>
              </div>
              <div className="ev__text">{e.text}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Dossier({ siteId }: { siteId: string }) {
  const site = siteOf(siteId)!
  const st = useOps((s) => s.sites[siteId])!
  const now = useOps((s) => s.now)
  const brigade = useOps((s) => s.brigades.find((b) => b.id === st.brigadeId))
  const mission = useOps((s) => s.missions.find((m) => m.siteId === siteId))
  const free = useOps((s) => s.brigades.some((b) => !b.missionId))
  const dispatch = useOps((s) => s.dispatch)
  const approve = useOps((s) => s.approve)
  const d = site.decision
  const sv = site.survey
  const status = STATUS[st.status]
  const inspected = !['detected', 'inspection'].includes(st.status)
  return (
    <div className="card">
      <div className="card__head" style={{ ['--head' as string]: status.color }}>
        <div className="card__title">
          {site.name} <span className="chip" style={{ ['--chip' as string]: 'rgba(0,0,0,0.25)' }}>{status.label}</span>
        </div>
        <div className="card__sub">
          Вырубка {site.year} г. · {site.areaHa.toLocaleString('ru-RU')} га · спутник Hansen GFC
        </div>
      </div>
      <div className="card__body">
        <div className="row">
          <span>Координаты</span>
          <span>{fmtCoord(site.lonlat)}</span>
        </div>
        {inspected && (
          <div className="row">
            <span>Тип леса / ТЛУ</span>
            <span>
              {sv.forestType} · {sv.tlu}
            </span>
          </div>
        )}
        {mission && brigade && (
          <div className="row">
            <span>{brigade.name}</span>
            <span>{mission.phase === 'out' ? `в пути, прибытие ${fmtTime(mission.arriveAt)}` : mission.phase === 'work' ? `на участке до ${fmtTime(mission.workEnd)}` : 'возвращается'}</span>
          </div>
        )}
        {st.status === 'detected' && (
          <button type="button" className="action" disabled={!free} onClick={() => dispatch(siteId)}>
            <Send size={16} /> Направить бригаду на осмотр
          </button>
        )}
        {inspected && (
          <>
            <div className="h4">Подрост (заключительный осмотр)</div>
            {sv.undergrowth.length === 0 ? (
              <div style={{ color: '#e8b7b0' }}>Жизнеспособный подрост не обнаружен</div>
            ) : (
              <table className="ug">
                <tbody>
                  {sv.undergrowth.map((u, i) => (
                    <tr key={i} className={sv.targets.includes(u.species) ? '' : 'bad'}>
                      <td>{SPECIES_RU[u.species]}</td>
                      <td>{HEIGHT_RU[u.height]}</td>
                      <td>{u.count.toLocaleString('ru-RU')} шт/га</td>
                      <td>{Math.round(u.viable * 100)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="ai">
              <div className="ai__head">
                <Bot size={15} /> ИИ «Подрост» · достоверность {Math.round(d.confidence * 100)} %
              </div>
              <div className="ai__kind" style={{ color: KIND_COLOR[d.kind] }}>
                {KIND_RU[d.kind]}
              </div>
              <ul className="reasons">
                {d.reasons.map((r, i) => (
                  <li key={i}>
                    {r.ok === null ? <ClipboardList size={13} color="#b3b8ae" /> : r.ok ? <Check size={13} color="#7ccf5a" /> : <AlertTriangle size={13} color="#ffb547" />}
                    <span>{r.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        {st.status === 'decision' && (
          <div className="opts">
            {KIND_ORDER.map((k) => {
              const o = d.options[k]
              return (
                <button key={k} type="button" className={`opt${k === d.kind ? ' opt--rec' : ''}`} style={{ ['--opt' as string]: KIND_COLOR[k] }} onClick={() => approve(siteId, k)}>
                  <span>
                    Утвердить: {KIND_RU[k].toLowerCase()}
                    <small>{o.seedlings ? `${o.composition} · ${o.seedlings.toLocaleString('ru-RU')} сеянцев · ${o.areaToPlant.toLocaleString('ru-RU')} га` : o.measures}</small>
                  </span>
                  <span>{rub(o.cost)}</span>
                </button>
              )
            })}
          </div>
        )}
        {st.chosen && st.status !== 'decision' && (
          <div className="row" style={{ marginTop: 8 }}>
            <span>Утверждено</span>
            <span className="chip" style={{ ['--chip' as string]: KIND_COLOR[st.chosen] }}>
              {KIND_RU[st.chosen]}
            </span>
          </div>
        )}
        {st.status === 'planned' && (
          <button type="button" className="action" disabled={!free} onClick={() => dispatch(siteId)}>
            <Sprout size={16} /> Направить бригаду на посадку
          </button>
        )}
        {st.status === 'natural' && st.auditAt !== undefined && (
          <div className="row">
            <span>Контрольный осмотр</span>
            <span>{fmtDay(st.auditAt)}, {fmtTime(st.auditAt)}</span>
          </div>
        )}
        {st.status === 'planting' && st.plantEnd !== undefined && st.plantStart !== undefined && (
          <div className="row">
            <span>Посадка</span>
            <span>{Math.round(Math.min(1, Math.max(0, (now - st.plantStart) / (st.plantEnd - st.plantStart))) * 100)} %</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Summary() {
  const area = useOps((s) => s.area)!
  const sites = useOps((s) => s.sites)
  const counts: Record<string, number> = {}
  let plan = 0
  let seedlings = 0
  for (const [id, st] of Object.entries(sites)) {
    counts[st.status] = (counts[st.status] ?? 0) + 1
    if (st.chosen) {
      const o = siteOf(id)!.decision.options[st.chosen]
      plan += o.cost
      seedlings += o.seedlings
    }
  }
  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title">Сводка по району</div>
        <div className="card__sub">{area.base.name}</div>
      </div>
      <div className="card__body">
        <div className="stats">
          <div className="stat">
            <b>{Math.round(area.stats.forestShare * 100)} %</b>
            <span>лесистость (OSM + спутник)</span>
          </div>
          <div className="stat">
            <b>{Math.round(area.stats.recentLossHa).toLocaleString('ru-RU')} га</b>
            <span>рубки 2019–2024 (GFC)</span>
          </div>
          <div className="stat">
            <b>{area.sites.length}</b>
            <span>лесосек на контроле</span>
          </div>
          <div className="stat">
            <b>{(counts.decision ?? 0) + (counts.planned ?? 0)}</b>
            <span>ждут решения / посадки</span>
          </div>
        </div>
        <div className="h4">Статусы</div>
        {(Object.keys(STATUS) as SiteStatus[]).map((k) => (
          <div className="row" key={k}>
            <span>
              <span className="chip" style={{ ['--chip' as string]: STATUS[k].color, marginRight: 6 }}>
                &nbsp;
              </span>
              {STATUS[k].label}
            </span>
            <span>{counts[k] ?? 0}</span>
          </div>
        ))}
        <div className="h4">План лесовосстановления</div>
        <div className="row">
          <span>Сеянцев</span>
          <span>{seedlings.toLocaleString('ru-RU')} шт</span>
        </div>
        <div className="row">
          <span>Оценочная стоимость</span>
          <span>{rub(plan)}</span>
        </div>
        <div className="src">
          Рельеф: AWS Terrain Tiles · Леса, реки, дороги, постройки: © OpenStreetMap (OpenFreeMap) · Лесистость 2000 и вырубки 2001–2024: Hansen/UMD/Google/USGS/NASA (GFC v1.12, Global Forest Watch) · Подрост — демо-данные осмотров.
        </div>
      </div>
    </div>
  )
}

function Side() {
  const selected = useOps((s) => s.selectedSiteId)
  return <div className="side">{selected ? <Dossier key={selected} siteId={selected} /> : <Summary />}</div>
}

function Crew() {
  const brigades = useOps((s) => s.brigades)
  const missions = useOps((s) => s.missions)
  const now = useOps((s) => s.now)
  const select = useOps((s) => s.select)
  return (
    <div className="crew">
      <span className="crew__title">БРИГАДЫ</span>
      {brigades.map((b) => {
        const m = missions.find((x) => x.id === b.missionId)
        const site = m ? siteOf(m.siteId) : undefined
        const prog = m ? Math.min(1, Math.max(0, (now - m.departAt) / (m.returnAt - m.departAt))) : 0
        const text = !m
          ? 'На базе, готова'
          : m.phase === 'out'
            ? `→ ${site?.name}, прибытие ${fmtTime(m.arriveAt)}`
            : m.phase === 'work'
              ? `${m.task === 'inspection' ? 'Осмотр' : 'Посадка'}: ${site?.name}`
              : 'Возвращается на базу'
        return (
          <button key={b.id} type="button" className="mate" onClick={() => m && select(m.siteId)}>
            <Portrait seed={b.seed} female={b.female} size={56} />
            <span className="mate__info">
              <span className="mate__name">{b.name}</span>
              <span className="mate__lead">{b.lead}</span>
              <span className="mate__status">
                {!m ? <span className="mate__dot" /> : <Truck size={13} />} {text}
              </span>
              {m && (
                <span className="mate__bar">
                  <div style={{ width: `${prog * 100}%` }} />
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Loading() {
  const status = useOps((s) => s.status)
  const progress = useOps((s) => s.progress)
  const error = useOps((s) => s.error)
  if (status !== 'loading' && status !== 'error') return null
  const steps = ['Рельеф', 'Леса, реки и дороги OSM', 'Лесистость со спутника', 'Вырубки со спутника', 'Сборка диорамы']
  return (
    <div className="loading">
      <div className="loading__card">
        <div className="loading__title">Сборка района</div>
        <div className="loading__sub">Загружаем реальные данные и строим низкополигональную диораму</div>
        {steps.map((k) => {
          const p = progress[k]
          const pct = p ? (p.done / Math.max(1, p.total)) * 100 : 0
          return (
            <div className="lstep" key={k}>
              {k} {p ? `· ${p.done}/${p.total}` : ''}
              <div className="lstep__bar">
                <div style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
        {error && <div className="err">Ошибка: {error}</div>}
      </div>
    </div>
  )
}

export function Hud() {
  const status = useOps((s) => s.status)
  const mode = useOps((s) => s.mode)

  return (
    <>
      <Top />
      {mode === 'area' && status === 'ready' && (
        <>
          <Feed />
          <Side />
          <Crew />
        </>
      )}
      {mode === 'area' && <Loading />}
    </>
  )
}
