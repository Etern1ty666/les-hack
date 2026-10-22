// ПЛЕЙСХОЛДЕР HUD: показывает, что данные, движок и стор работают.
// Настоящий HUD делает change add-command-hud, заменяя этот файл.
import { motion } from 'motion/react'
import { DECISIONS, DECISION_KINDS } from '@/domain/constants'
import { fmtCompact, fmtPct, fmtRub } from '@/domain/format'
import { selectKpis } from '@/state/selectors'
import { useAppStore, type ViewId } from '@/state/store'
import { BrandMark } from '@/shell/BrandMark'
import { Chip, Panel, Stat, Tabs } from '@/ui'

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'map', label: 'Карта' },
  { id: 'analytics', label: 'Аналитика' },
  { id: 'norms', label: 'Нормативы' },
]

export default function Hud() {
  const phase = useAppStore((s) => s.phase)
  const kpis = useAppStore(selectKpis)
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const filters = useAppStore((s) => s.filters)
  const setFilters = useAppStore((s) => s.setFilters)
  if (phase !== 'ready') return null

  const share = (k: (typeof DECISION_KINDS)[number]) => (kpis.areaHa > 0 ? kpis.byKind[k].areaHa / kpis.areaHa : 0)
  const toggleKind = (k: (typeof DECISION_KINDS)[number]) => {
    const has = filters.kinds.includes(k)
    if (has && filters.kinds.length === 1) return // хотя бы одно решение включено
    setFilters({ kinds: has ? filters.kinds.filter((x) => x !== k) : [...filters.kinds, k] })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.6 }}
      style={{ position: 'absolute', top: 'var(--gap)', left: 'var(--gap)', right: 'var(--gap)', pointerEvents: 'auto' }}
    >
      <Panel style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
        <BrandMark />
        <Stat label="Лесосек" value={kpis.sites} />
        <Stat label="Площадь" value={kpis.areaHa} format={fmtCompact} unit="га" />
        <Stat label="Сеянцев" value={kpis.seedlingsTotal} format={fmtCompact} unit="шт" />
        <Stat label="Бюджет" value={kpis.costRub} format={fmtRub} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DECISION_KINDS.map((k) => (
            <Chip key={k} active={filters.kinds.includes(k)} color={DECISIONS[k].color} count={fmtPct(share(k))} onToggle={() => toggleKind(k)}>
              {DECISIONS[k].shortRu}
            </Chip>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Tabs items={VIEWS} value={view} onChange={setView} ariaLabel="Вид" />
        </div>
      </Panel>
      <Panel dense style={{ marginTop: 'var(--gap)', width: 'fit-content', color: 'var(--text-1)' }}>
        Волна 0 готова: данные, заглушка движка и стор работают. Карта появится в <span className="mono">add-strategic-map</span>, интерфейс — в{' '}
        <span className="mono">add-command-hud</span>.
      </Panel>
    </motion.div>
  )
}
