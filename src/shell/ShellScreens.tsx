// Полноэкранные состояния оболочки: загрузка, интро, ошибка (спецификация app-shell).
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect } from 'react'
import { fmtInt, pluralRu } from '@/domain/format'
import { bootstrap } from '@/state/bootstrap'
import { useAppStore } from '@/state/store'
import { Button, Kbd, Panel } from '@/ui'
import { BRAND } from './brand'
import { BrandMark } from './BrandMark'
import { isIntroStartKey } from './introKeys'

function LoadingScreen() {
  const progress = useAppStore((s) => s.loadingProgress)
  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0
  const analysed = progress.step === 'Анализ лесосек' && progress.done === progress.total && progress.total > 0
  return (
    <div className="loading">
      <BrandMark size="xl" />
      <div className="loading__tagline">{BRAND.tagline}</div>
      <div className="loading__bar">
        <div className="loading__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="loading__step">
        <span className="label">{analysed ? 'Готово' : progress.step || 'Подготовка'}</span>
        <span className="loading__count">
          {analysed
            ? `Проанализировано ${fmtInt(progress.total)} ${pluralRu(progress.total, ['лесосека', 'лесосеки', 'лесосек'])}`
            : progress.total > 0
              ? `${fmtInt(progress.done)} / ${fmtInt(progress.total)}`
              : '…'}
        </span>
      </div>
    </div>
  )
}

function IntroCard() {
  const dataset = useAppStore((s) => s.dataset)
  const setPhase = useAppStore((s) => s.setPhase)
  const sites = dataset?.sites.length ?? 0
  const regions = dataset?.regions.length ?? 0
  return (
    <Panel className="intro">
      <span className="label intro__event">{BRAND.event}</span>
      <BrandMark size="xl" />
      <p className="intro__tagline">{BRAND.tagline}</p>
      <div className="intro__stats">
        <div>
          <div className="label">Лесосек</div>
          <div className="mono" style={{ fontSize: 22 }}>{fmtInt(sites)}</div>
        </div>
        <div>
          <div className="label">Субъектов</div>
          <div className="mono" style={{ fontSize: 22 }}>{fmtInt(regions)}</div>
        </div>
      </div>
      <div className="intro__actions">
        <Button variant="primary" onClick={() => setPhase('ready')} autoFocus>
          Начать
        </Button>
        <span className="intro__hint">
          или <Kbd>Enter</Kbd>
        </span>
      </div>
    </Panel>
  )
}

function ErrorScreen() {
  const error = useAppStore((s) => s.error)
  return (
    <Panel className="error">
      <h2 className="error__title">Не удалось загрузить данные</h2>
      <div className="error__message">{error ?? 'Неизвестная ошибка'}</div>
      <div>
        <Button variant="primary" onClick={() => void bootstrap()}>
          Повторить
        </Button>
      </div>
    </Panel>
  )
}

export function ShellScreens() {
  const phase = useAppStore((s) => s.phase)
  const reduced = useReducedMotion()
  const fade = { duration: reduced ? 0.08 : 0.45 }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.closest('input, textarea, select, [contenteditable]') || target.tagName === 'BUTTON')) return
      if (isIntroStartKey(useAppStore.getState().phase, e.key)) {
        e.preventDefault()
        useAppStore.getState().setPhase('ready')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <AnimatePresence>
      {(phase === 'boot' || phase === 'loading') && (
        <motion.div key="loading" className="screen screen--opaque layer--screens" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
          <LoadingScreen />
        </motion.div>
      )}
      {phase === 'intro' && (
        <motion.div
          key="intro"
          className="screen layer--screens"
          initial={{ opacity: 0, scale: reduced ? 1 : 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reduced ? 1 : 1.03 }}
          transition={fade}
        >
          <IntroCard />
        </motion.div>
      )}
      {phase === 'error' && (
        <motion.div key="error" className="screen screen--opaque layer--screens" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
          <ErrorScreen />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
