// Игровой интерфейс: верхняя полоса, заявки, сообщения, бригады, окно решения, сводка, интро.
import { Bot, Building2, Check, ClipboardList, Pause, Play, Radio, Star, Trees, Truck, X, AlertTriangle, Landmark, Sprout } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { HEIGHT_RU, KIND_COLOR, KIND_ORDER, KIND_RU, SPECIES_RU } from '../game/engine'
import { clock, fmtClock, fmtDate, fmtLeft, siteById, useGame, world, type Brigade, type Call, type Message } from '../game/store'
import { Portrait } from './Portrait'
import { CardArt } from './Silhouettes'
import { CALL_STYLE, fmtRub, fmtRubShort } from './theme'

const SPEEDS = [1, 2, 4]

function TopBar({ summaryOpen, toggleSummary }: { summaryOpen: boolean; toggleSummary: () => void }) {
  const now = useGame((s) => s.now)
  const budget = useGame((s) => s.budget)
  const rep = useGame((s) => s.reputation)
  const restored = useGame((s) => s.restoredHa)
  const speed = useGame((s) => s.speed)
  const setSpeed = useGame((s) => s.setSpeed)
  const focusOn = useGame((s) => s.focusOn)
  return (
    <>
      <div className="topbar">
        <span className="topbar__money">{fmtRub(budget)}</span>
        <span className="topbar__time">{fmtClock(now)}</span>
        <span className="topbar__date">{fmtDate(now)}</span>
        <span className="topbar__spacer" />
        <span className="topbar__stat">
          <Trees size={16} /> {restored.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} <small>га восстановлено</small>
        </span>
        <span className="topbar__stat">
          <Star size={16} fill="#f2c94c" color="#f2c94c" /> {rep} <small>рейтинг</small>
        </span>
        <span className="topbar__speed">
          <button type="button" aria-pressed={speed === 0} onClick={() => setSpeed(0)} title="Пауза (Пробел)">
            <Pause size={14} />
          </button>
          {SPEEDS.map((v, i) => (
            <button key={v} type="button" aria-pressed={speed === v} onClick={() => setSpeed(v)} title={`Скорость ×${v} (${i + 1})`}>
              {i === 0 ? <Play size={14} /> : `×${v}`}
            </button>
          ))}
        </span>
      </div>
      <div className="hub">
        <button type="button" aria-pressed={summaryOpen} onClick={toggleSummary} title="Сводка">
          <Star size={22} fill="#fff" />
        </button>
        <button type="button" onClick={() => focusOn(world.base[0], world.base[1], 70)} title="Лесничество">
          <Building2 size={22} />
        </button>
        <button type="button" onClick={() => focusOn(-6, 2, 165)} title="Весь район">
          <Trees size={22} />
        </button>
      </div>
    </>
  )
}

function CallCard({ call }: { call: Call }) {
  const now = useGame((s) => s.now)
  const selected = useGame((s) => s.selectedCallId === call.id)
  const brigade = useGame((s) => s.brigades.find((b) => b.id === call.brigadeId))
  const mission = useGame((s) => s.missions.find((m) => m.callId === call.id))
  const selectCall = useGame((s) => s.selectCall)
  const dispatch = useGame((s) => s.dispatch)
  const [drop, setDrop] = useState(false)
  const left = call.deadline !== null ? call.deadline - now : null
  const status = !brigade
    ? null
    : mission?.phase === 'out'
      ? `в пути ${Math.max(1, Math.round(mission.arriveAt - now))} мин`
      : 'на месте'
  return (
    <button
      type="button"
      className={`card${selected ? ' card--selected' : ''}${drop ? ' card--drop' : ''}`}
      style={{ ['--card' as string]: CALL_STYLE[call.type].color }}
      onClick={() => selectCall(call.id)}
      onDragOver={(e) => {
        if (call.brigadeId || call.type === 'decision') return
        e.preventDefault()
        setDrop(true)
      }}
      onDragLeave={() => setDrop(false)}
      onDrop={(e) => {
        setDrop(false)
        const id = e.dataTransfer.getData('text/brigade')
        if (id) dispatch(call.id, id)
      }}
    >
      <CardArt type={call.type} />
      <div className="card__title">{call.title}</div>
      {left !== null && !brigade && <div className={`card__timer${left < 30 ? ' card__timer--urgent' : ''}`}>{fmtLeft(left)}</div>}
      <div className="card__place">{call.place}</div>
      {brigade && (
        <div className="card__crew">
          <Truck size={13} /> {brigade.name}: {status}
        </div>
      )}
      {call.type === 'decision' && (
        <div className="card__crew">
          <ClipboardList size={13} /> Открыть решение
        </div>
      )}
    </button>
  )
}

function CallsPanel() {
  const calls = useGame((s) => s.calls)
  return (
    <div className="calls">
      <span className="tab-title">ЗАЯВКИ</span>
      <div className="calls__list">
        {calls.slice(0, 7).map((c) => (
          <CallCard key={c.id} call={c} />
        ))}
      </div>
    </div>
  )
}

const MSG_TONE: Record<Message['tone'], string> = { ai: '#3fc79a', good: '#7ccf5a', bad: '#ff6b5b', info: '#b9bcb3' }
const MSG_ICON: Record<Message['from'], typeof Bot> = { ai: Bot, dispatch: Radio, rosleshoz: Landmark, nursery: Sprout, brigade: Truck }

function MessagesPanel() {
  const messages = useGame((s) => s.messages)
  const selectSite = useGame((s) => s.selectSite)
  return (
    <div className="messages">
      <span className="tab-title tab-title--right">СООБЩЕНИЯ</span>
      <div className="messages__list">
        {messages.slice(0, 5).map((m) => {
          const Icon = MSG_ICON[m.from]
          return (
            <button key={m.id} type="button" className="msg" style={{ ['--tone' as string]: MSG_TONE[m.tone] }} onClick={() => m.siteId && selectSite(m.siteId)}>
              <div className="msg__head">
                <Icon size={14} /> {m.title}
                <span className="msg__time">{fmtClock(m.at)}</span>
              </div>
              <div className="msg__text">{m.text}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CrewCard({ b }: { b: Brigade }) {
  const now = useGame((s) => s.now)
  const mission = useGame((s) => s.missions.find((m) => m.id === b.missionId))
  const selected = useGame((s) => s.selectedBrigadeId === b.id)
  const select = useGame((s) => s.selectBrigade)
  const busy = b.status !== 'free'
  const progress = mission ? Math.min(1, Math.max(0, (now - mission.departAt) / (mission.returnAt - mission.departAt))) : 0
  const label = !mission ? '' : mission.phase === 'out' ? 'в пути' : mission.phase === 'work' ? 'работа' : 'возврат'
  return (
    <button
      type="button"
      className={`crew__card${busy ? ' crew__card--busy' : ''}${selected ? ' crew__card--selected' : ''}`}
      draggable={!busy}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/brigade', b.id)
        select(b.id)
      }}
      onClick={() => select(selected ? null : b.id)}
      title={busy ? `Бригада ${b.genitive}: ${label}` : `Бригада ${b.genitive} — свободна. Перетащите на заявку.`}
    >
      {!busy && <span className="crew__lamp" />}
      <div className="crew__name">{b.name}</div>
      <div className="crew__rating">★{b.rating}</div>
      <Portrait seed={b.seed} female={b.female} />
      {busy && (
        <div className="crew__busy">
          <Truck size={11} /> {label}
        </div>
      )}
      <div className={`crew__status${busy ? ' crew__status--out' : ''}`}>
        {busy && <div className="crew__status-fill" style={{ width: `${progress * 100}%` }} />}
      </div>
    </button>
  )
}

function CrewBar() {
  const brigades = useGame((s) => s.brigades)
  return (
    <div className="crew">
      {brigades.map((b) => (
        <CrewCard key={b.id} b={b} />
      ))}
      <span className="crew__spacer" />
      <div className="crew__me">
        <div className="crew__name">Вы</div>
        <div className="crew__rating">Лесничий</div>
        <Portrait seed={4242} jacket="#c4372f" size={92} />
      </div>
    </div>
  )
}

function DecisionPanel() {
  const siteId = useGame((s) => s.decisionSiteId)
  const open = useGame((s) => s.openDecision)
  const choose = useGame((s) => s.choose)
  if (!siteId) return null
  const site = siteById(siteId)
  const d = site.decision
  const sv = site.survey
  const ratioPct = Math.min(2, d.ratio) / 2
  return (
    <div className="dialog">
      <div className="dialog__head">
        <span className="dialog__title">Решение: {site.name}</span>
        <span className="dialog__sub">
          кв. {site.quarter} выд. {site.plot} · {site.areaHa.toLocaleString('ru-RU')} га · {sv.forestType}
        </span>
        <button type="button" className="dialog__close" onClick={() => open(null)} title="Закрыть (Esc)">
          <X size={18} />
        </button>
      </div>
      <div className="dialog__body">
        <div>
          <h4>Подрост по данным осмотра</h4>
          {sv.undergrowth.length === 0 ? (
            <div style={{ fontSize: 14, color: '#e8b7b0' }}>Жизнеспособный подрост не обнаружен (гарь)</div>
          ) : (
            <table className="ug">
              <tbody>
                {sv.undergrowth.map((u, i) => (
                  <tr key={i} className={sv.targets.includes(u.species) ? '' : 'bad'}>
                    <td>{SPECIES_RU[u.species]}{sv.targets.includes(u.species) ? '' : ' (нецелевая)'}</td>
                    <td>{HEIGHT_RU[u.height]}</td>
                    <td>{u.count.toLocaleString('ru-RU')} шт/га</td>
                    <td>{Math.round(u.viable * 100)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h4 style={{ marginTop: 10 }}>Подрост / норматив</h4>
          <div className="meter">
            <div className="meter__fill" style={{ width: `${ratioPct * 100}%`, background: KIND_COLOR[d.ratio >= 1 ? 'natural' : d.ratio >= 0.5 ? 'combined' : 'artificial'] }} />
            <span className="meter__tick" style={{ left: '25%' }} />
            <span className="meter__tick" style={{ left: '50%' }} />
          </div>
          <div style={{ fontSize: 13, color: '#cfd3ca' }}>
            {Math.round(d.normalized).toLocaleString('ru-RU')} из {sv.norm.toLocaleString('ru-RU')} шт/га · встречаемость {Math.round(d.occurrence * 100)} %
          </div>
        </div>
        <div>
          <div className="ai-box">
            <div className="ai-box__head">
              <Bot size={15} /> ИИ «Подрост» рекомендует · достоверность {Math.round(d.confidence * 100)} %
            </div>
            <div className="ai-box__kind" style={{ color: KIND_COLOR[d.kind] }}>
              {KIND_RU[d.kind]}
            </div>
          </div>
          <h4>Почему</h4>
          <ul className="reasons">
            {d.reasons.map((r, i) => (
              <li key={i}>
                {r.ok === null ? <ClipboardList size={14} color="#b9bcb3" /> : r.ok ? <Check size={14} color="#7ccf5a" /> : <AlertTriangle size={14} color="#ffb547" />}
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="options">
        {KIND_ORDER.map((k) => {
          const o = d.options[k]
          return (
            <button key={k} type="button" className={`option${k === d.kind ? ' option--rec' : ''}`} style={{ ['--opt' as string]: KIND_COLOR[k] }} onClick={() => choose(siteId, k)}>
              {k === d.kind && <span className="option__badge">ИИ</span>}
              <div className="option__kind">{KIND_RU[k]}</div>
              <div className="option__cost">{fmtRubShort(o.cost)}</div>
              <div className="option__meta">
                {o.measures}
                {o.seedlings > 0 && (
                  <>
                    <br />
                    {o.composition} · {o.density?.toLocaleString('ru-RU')} шт/га · {o.seedlings.toLocaleString('ru-RU')} сеянцев
                  </>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const STATUS_RU: Record<string, string> = {
  fresh: 'Ожидает заключительного осмотра',
  called: 'Заявка на осмотр',
  inspecting: 'Идёт осмотр',
  decision: 'Ждёт решения',
  natural: 'Естественное возобновление (на контроле)',
  awaiting_planting: 'Ждёт посадки',
  planting: 'Идёт посадка',
  restored: 'Лесовосстановление выполнено',
}

function SiteInfo() {
  const siteId = useGame((s) => s.selectedSiteId)
  const decisionOpen = useGame((s) => s.decisionSiteId)
  const hasCall = useGame((s) => s.calls.some((c) => c.siteId === siteId))
  const st = useGame((s) => (siteId ? s.sites[siteId] : undefined))
  if (!siteId || decisionOpen || hasCall || !st) return null
  const site = siteById(siteId)
  const known = ['natural', 'awaiting_planting', 'planting', 'restored'].includes(st.status)
  return (
    <div className="panel siteinfo">
      <div className="siteinfo__title">{site.name}</div>
      <div className="siteinfo__row">
        <span>Квартал / выдел</span>
        <span>
          {site.quarter} / {site.plot}
        </span>
      </div>
      <div className="siteinfo__row">
        <span>Площадь</span>
        <span>{site.areaHa.toLocaleString('ru-RU')} га</span>
      </div>
      <div className="siteinfo__row">
        <span>Статус</span>
        <span>{STATUS_RU[st.status]}</span>
      </div>
      {known && st.chosen && (
        <div className="siteinfo__row">
          <span>Способ</span>
          <span className="chip" style={{ ['--chip' as string]: KIND_COLOR[st.chosen] }}>
            {KIND_RU[st.chosen]}
          </span>
        </div>
      )}
    </div>
  )
}

function Summary() {
  const s = useGame()
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const st of Object.values(s.sites)) c[st.status] = (c[st.status] ?? 0) + 1
    return c
  }, [s.sites])
  return (
    <div className="panel summary">
      <div style={{ fontWeight: 700, fontSize: 18 }}>Сводка лесничества</div>
      <div className="summary__grid">
        <div>
          <div className="summary__k">Лесосек</div>
          <div className="summary__v">{world.sites.length}</div>
        </div>
        <div>
          <div className="summary__k">Восстановлено</div>
          <div className="summary__v">{counts.restored ?? 0}</div>
        </div>
        <div>
          <div className="summary__k">Ждут решения</div>
          <div className="summary__v">{(counts.decision ?? 0) + (counts.awaiting_planting ?? 0)}</div>
        </div>
      </div>
      <div className="legend">
        <div><span style={{ background: CALL_STYLE.inspection.color }} />Заключительный осмотр</div>
        <div><span style={{ background: CALL_STYLE.decision.color }} />Нужно решение</div>
        <div><span style={{ background: CALL_STYLE.planting.color }} />Посадка культур</div>
        <div><span style={{ background: CALL_STYLE.fire.color }} />Пожар</div>
        <div><span style={{ background: CALL_STYLE.illegal.color }} />Самовольная рубка</div>
        <div><span style={{ background: KIND_COLOR.natural }} />Лес восстановлен</div>
      </div>
    </div>
  )
}

function Intro() {
  const started = useGame((s) => s.started)
  const start = useGame((s) => s.start)
  if (started) return null
  return (
    <div className="intro">
      <div className="intro__card">
        <div className="intro__head">
          <div className="intro__title">ПОДРОСТ</div>
          <div className="intro__sub">Лесничий · поддержка решений о лесовосстановлении</div>
        </div>
        <div className="intro__body">
          Вы — лесничий. После рубок на лесосеках нужно решить, как восстанавливать лес: сохранить подрост, досадить или сажать заново.
          <ol className="intro__steps">
            <li>Заявка на <b>заключительный осмотр</b> — перетащите свободную бригаду на карточку (или кликните бригаду, затем заявку).</li>
            <li>Бригада едет, считает подрост. <b>ИИ «Подрост»</b> сверяет его с нормативами и рекомендует способ.</li>
            <li>Примите решение и отправьте бригаду сажать. Следите за бюджетом, сроками, пожарами и самовольными рубками.</li>
          </ol>
          <button type="button" className="btn" onClick={start} autoFocus>
            <Play size={18} /> Начать смену
          </button>
          <div className="keys">
            <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> камера · <kbd>Q</kbd><kbd>E</kbd> поворот · колесо — зум · <kbd>Пробел</kbd> пауза · <kbd>1</kbd>–<kbd>3</kbd> скорость · <kbd>Esc</kbd> отмена
          </div>
        </div>
      </div>
    </div>
  )
}

export function Hud() {
  const started = useGame((s) => s.started)
  const speed = useGame((s) => s.speed)
  const selectedBrigade = useGame((s) => s.brigades.find((b) => b.id === s.selectedBrigadeId))
  const [summary, setSummary] = useState(false)

  useEffect(() => {
    let last = 1
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      const g = useGame.getState()
      if (e.code === 'Space' && g.started) {
        e.preventDefault()
        if (clock.speed === 0) g.setSpeed(last)
        else {
          last = clock.speed
          g.setSpeed(0)
        }
      }
      if (e.key === '1' || e.key === '2' || e.key === '3') g.setSpeed(SPEEDS[Number(e.key) - 1]!)
      if (e.key === 'Escape') {
        if (g.decisionSiteId) g.openDecision(null)
        else useGame.setState({ selectedCallId: null, selectedBrigadeId: null, selectedSiteId: null })
        setSummary(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <TopBar summaryOpen={summary} toggleSummary={() => setSummary((v) => !v)} />
      {started && (
        <>
          <CallsPanel />
          <MessagesPanel />
          <DecisionPanel />
          <SiteInfo />
          {summary && <Summary />}
          {speed === 0 && <div className="paused">ПАУЗА</div>}
          {selectedBrigade && <div className="hint">Бригада {selectedBrigade.genitive}: выберите заявку</div>}
        </>
      )}
      <CrewBar />
      <Intro />
    </>
  )
}
