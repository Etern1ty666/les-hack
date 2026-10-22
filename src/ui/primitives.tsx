// UI-примитивы (setup-app-foundation design D15). Без внешних UI-библиотек.
import { useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { DECISIONS } from '@/domain/constants'
import { fmtInt } from '@/domain/format'
import type { DecisionKind } from '@/domain/types'
import './ui.css'

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

// --- Panel ---------------------------------------------------------------

export function Panel(props: {
  title?: ReactNode
  actions?: ReactNode
  dense?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const { title, actions, dense, className, style, children } = props
  return (
    <section className={cx('ui-panel', dense && 'ui-panel--dense', className)} style={style}>
      <span className="ui-corner ui-corner--tl" />
      <span className="ui-corner ui-corner--tr" />
      <span className="ui-corner ui-corner--bl" />
      <span className="ui-corner ui-corner--br" />
      {(title || actions) && (
        <header className="ui-panel__head">
          {title && <span className="ui-panel__title label">{title}</span>}
          <span className="ui-panel__rule" />
          {actions && <span className="ui-panel__actions">{actions}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

// --- Button --------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'default'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'default', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={cx('ui-btn', `ui-btn--${size}`, variant !== 'default' && `ui-btn--${variant}`, className)} {...rest} />
}

export function IconButton({ label, className, ...rest }: ButtonProps & { label: string }) {
  return (
    <Tooltip content={label}>
      <Button aria-label={label} size="sm" className={cx('ui-icon-btn', className)} {...rest} />
    </Tooltip>
  )
}

// --- Chip ----------------------------------------------------------------

export function Chip(props: {
  active: boolean
  onToggle?: () => void
  color?: string
  count?: ReactNode
  children: ReactNode
}) {
  const { active, onToggle, color, count, children } = props
  return (
    <button
      type="button"
      className="ui-chip"
      aria-pressed={active}
      onClick={onToggle}
      style={color ? ({ '--chip-color': color } as CSSProperties) : undefined}
    >
      {color && <span className="ui-chip__dot" />}
      {children}
      {count !== undefined && <span className="ui-chip__count">{count}</span>}
    </button>
  )
}

// --- DecisionBadge -------------------------------------------------------

export function DecisionBadge({ kind, size = 'sm' }: { kind: DecisionKind; size?: 'sm' | 'lg' }) {
  const info = DECISIONS[kind]
  return (
    <span className={cx('ui-badge', `ui-badge--${size}`)} style={{ '--badge-color': `var(${info.cssVar})` } as CSSProperties}>
      <span className="ui-badge__dot" />
      {info.labelRu}
    </span>
  )
}

// --- AnimatedNumber / Stat -----------------------------------------------

/** Count-up без ререндеров: пишет прямо в textContent. При reduced motion — сразу финальное значение. */
export function AnimatedNumber({
  value,
  format = fmtInt,
  durationMs = 900,
  className,
}: {
  value: number
  format?: (x: number) => string
  durationMs?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(0)
  const reduced = useReducedMotion()

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const from = shown.current
    if (reduced || durationMs <= 0 || from === value) {
      shown.current = value
      el.textContent = format(value)
      return
    }
    el.textContent = format(from)
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      shown.current = from + (value - from) * eased
      el.textContent = format(shown.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, format, durationMs, reduced])

  // Текст пишет только эффект: React не управляет содержимым и не перетирает анимацию
  return <span ref={ref} className={className} />
}

export function Stat(props: {
  label: ReactNode
  value: number
  unit?: ReactNode
  format?: (x: number) => string
  delta?: number
  formatDelta?: (x: number) => string
}) {
  const { label, value, unit, format, delta, formatDelta = (x) => fmtInt(x) } = props
  return (
    <div className="ui-stat">
      <span className="label">{label}</span>
      <span className="ui-stat__value">
        <AnimatedNumber value={value} format={format} />
        {unit && <span className="ui-stat__unit">{unit}</span>}
      </span>
      {delta !== undefined && delta !== 0 && (
        <span className={cx('ui-stat__delta', delta > 0 ? 'ui-stat__delta--up' : 'ui-stat__delta--down')}>
          {delta > 0 ? '▲' : '▼'} {formatDelta(Math.abs(delta))}
        </span>
      )}
    </div>
  )
}

// --- Kbd / Tabs / Toggle / Slider / Meter / Tooltip ----------------------

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ui-kbd">{children}</kbd>
}

export function Tabs<T extends string>(props: {
  items: { id: T; label: ReactNode }[]
  value: T
  onChange: (id: T) => void
  ariaLabel?: string
}) {
  const { items, value, onChange, ariaLabel } = props
  return (
    <div className="ui-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" className="ui-tab" aria-selected={it.id === value} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="ui-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ui-toggle__track" />
    </label>
  )
}

export function Slider(props: {
  label: ReactNode
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  const { label, value, min, max, step = 1, onChange, format = String } = props
  const fill = `${((value - min) / (max - min)) * 100}%`
  return (
    <label className="ui-slider">
      <span className="ui-slider__head">
        <span>{label}</span>
        <span className="ui-slider__value">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': fill } as CSSProperties}
      />
    </label>
  )
}

/** Индикатор значения со шкалой 0..max и отметками порогов. */
export function Meter(props: {
  label?: ReactNode
  valueLabel?: ReactNode
  value: number
  max?: number
  ticks?: number[]
  color?: string
}) {
  const { label, valueLabel, value, max = 1, ticks = [], color } = props
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / max) * 100))}%`
  return (
    <div className="ui-meter" style={color ? ({ '--meter-color': color } as CSSProperties) : undefined}>
      {(label || valueLabel) && (
        <div className="ui-meter__head">
          <span className="label">{label}</span>
          <span className="ui-meter__value">{valueLabel}</span>
        </div>
      )}
      <div className="ui-meter__track">
        <div className="ui-meter__fill" style={{ width: pct(value) }} />
        {ticks.map((t) => (
          <span key={t} className="ui-meter__tick" style={{ left: pct(t) }} />
        ))}
      </div>
    </div>
  )
}

export function Tooltip(props: { content: ReactNode; children: ReactNode; placement?: 'above' | 'below' | 'left' }) {
  const { content, children, placement = 'above' } = props
  return (
    <span className={cx('ui-tooltip', placement === 'below' && 'ui-tooltip--below', placement === 'left' && 'ui-tooltip--left')}>
      {children}
      <span className="ui-tooltip__bubble" role="tooltip">
        {content}
      </span>
    </span>
  )
}
