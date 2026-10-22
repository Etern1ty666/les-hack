// Витрина примитивов: открывается по ?ui=1. Нужна, чтобы проверять визуал без карты.
import { Crosshair, Layers, Pause } from 'lucide-react'
import { useState } from 'react'
import { DECISIONS, DECISION_KINDS, MAP_MODES, colorForModeValue } from '@/domain/constants'
import { fmtCompact, fmtHa, fmtPct, fmtPerHa, fmtRub } from '@/domain/format'
import type { DecisionKind } from '@/domain/types'
import { Button, Chip, DecisionBadge, IconButton, Kbd, Meter, Panel, Slider, Stat, Tabs, Toggle, Tooltip } from './index'

const rgb = ([r, g, b]: number[]) => `rgb(${r}, ${g}, ${b})`

export default function Showcase() {
  const [tab, setTab] = useState<'map' | 'analytics' | 'norms'>('map')
  const [kinds, setKinds] = useState<DecisionKind[]>([...DECISION_KINDS])
  const [toggle, setToggle] = useState(true)
  const [slider, setSlider] = useState(0.65)
  const [value, setValue] = useState(60000)

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 32, background: 'radial-gradient(ellipse at 30% 0%, #0b2a24 0%, var(--space) 60%)' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '0.04em', margin: '0 0 4px' }}>
        ПОДРОСТ · UI-витрина
      </h1>
      <p style={{ color: 'var(--text-1)', marginTop: 0 }}>
        Примитивы из <span className="mono">src/ui</span>. Кириллица: Unbounded, Exo 2, JetBrains Mono — «Съешь же ещё этих мягких французских булок».
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20, marginTop: 24 }}>
        <Panel title="Кнопки" actions={<IconButton label="Пауза"><Pause size={14} /></IconButton>}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary">Начать</Button>
            <Button>Что если?</Button>
            <Button variant="ghost">Закрыть</Button>
            <Button variant="danger">Сбросить</Button>
            <Button size="sm">Мелкая</Button>
            <Button disabled>Недоступна</Button>
          </div>
        </Panel>

        <Panel title="Решения">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {DECISION_KINDS.map((k) => (
              <DecisionBadge key={k} kind={k} />
            ))}
          </div>
          <DecisionBadge kind="combined" size="lg" />
        </Panel>

        <Panel title="Чипы-фильтры">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DECISION_KINDS.map((k, i) => (
              <Chip
                key={k}
                active={kinds.includes(k)}
                color={DECISIONS[k].color}
                count={[27120, 16300, 13250, 3330][i]}
                onToggle={() => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]))}
              >
                {DECISIONS[k].shortRu}
              </Chip>
            ))}
          </div>
        </Panel>

        <Panel title="Показатели">
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Stat label="Лесосек" value={value} delta={1240} />
            <Stat label="Площадь" value={612_345} format={fmtCompact} unit="га" />
            <Stat label="Бюджет" value={3.8e10} format={(x) => fmtRub(x)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <Button size="sm" onClick={() => setValue((v) => v + Math.round(Math.random() * 5000))}>
              Пересчитать
            </Button>
          </div>
        </Panel>

        <Panel title="Вкладки и клавиши">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { id: 'map', label: 'Карта' },
              { id: 'analytics', label: 'Аналитика' },
              { id: 'norms', label: 'Нормативы' },
            ]}
          />
          <p style={{ color: 'var(--text-1)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd> панорама · <Kbd>Q</Kbd><Kbd>E</Kbd> поворот · <Kbd>1</Kbd>–<Kbd>5</Kbd> режимы
          </p>
        </Panel>

        <Panel title="Переключатели и слайдер">
          <div style={{ display: 'grid', gap: 12 }}>
            <Toggle checked={toggle} onChange={setToggle} label={<><Layers size={14} style={{ verticalAlign: -2 }} /> Гексы</>} />
            <Toggle checked={!toggle} onChange={(v) => setToggle(!v)} label="Потеря лесного покрова (GFC)" />
            <Slider label="Минимальная встречаемость" value={slider} min={0} max={1} step={0.01} onChange={setSlider} format={(v) => fmtPct(v)} />
          </div>
        </Panel>

        <Panel title="Индикаторы">
          <div style={{ display: 'grid', gap: 14 }}>
            <Meter
              label="Подрост / норматив"
              valueLabel={`${fmtPerHa(1840)} / 2 500`}
              value={0.736}
              max={2}
              ticks={[0.5, 1]}
              color={rgb(colorForModeValue('sufficiency', 0.736))}
            />
            <Meter label="Встречаемость" valueLabel={fmtPct(0.72)} value={0.72} ticks={[0.65]} color="var(--natural)" />
            <Meter label="Площадь посадки" valueLabel={fmtHa(3)} value={3} max={10} />
          </div>
        </Panel>

        <Panel title="Шкалы режимов карты">
          <div style={{ display: 'grid', gap: 10 }}>
            {MAP_MODES.map((m) => (
              <div key={m.id}>
                <div className="label" style={{ marginBottom: 4 }}>
                  <Kbd>{m.hotkey}</Kbd> {m.labelRu}
                </div>
                <div style={{ display: 'flex', height: 10, borderRadius: 2, overflow: 'hidden' }}>
                  {m.legend.type === 'categorical'
                    ? m.legend.stops.map((s) => <span key={String(s.value)} style={{ flex: 1, background: s.color }} title={s.label} />)
                    : Array.from({ length: 40 }, (_, i) => {
                        const stops = m.legend.stops
                        const a = Number(stops[0]!.value)
                        const b = Number(stops[stops.length - 1]!.value)
                        return <span key={i} style={{ flex: 1, background: rgb(colorForModeValue(m.id, a + ((b - a) * i) / 39)) }} />
                      })}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Подсказки" dense>
          <Tooltip content="Оценка по демо-тарифам, не норматив">
            <span style={{ borderBottom: '1px dashed var(--text-2)', cursor: 'help' }}>Бюджет ≈ 38 млрд ₽</span>
          </Tooltip>{' '}
          · <IconButton label="К выбранному объекту"><Crosshair size={14} /></IconButton>
        </Panel>
      </div>
    </div>
  )
}
