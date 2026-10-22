// ПЛЕЙСХОЛДЕР рабочих областей. Настоящие «Аналитика» и «Нормативы» — change add-analytics-workspace.
import { AnimatePresence, motion } from 'motion/react'
import { useAppStore } from '@/state/store'
import { Button, Panel } from '@/ui'

const TITLES = { analytics: 'Аналитика', norms: 'Нормативы' } as const

export default function Workspace() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  return (
    <AnimatePresence>
      {view !== 'map' && (
        <motion.div
          key="workspace"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(3, 6, 10, 0.55)',
            backdropFilter: 'blur(6px)',
            pointerEvents: 'auto',
          }}
        >
          <Panel title={TITLES[view]} style={{ width: 'min(520px, 90vw)' }}>
            <p style={{ color: 'var(--text-1)', marginTop: 0 }}>
              Здесь будет рабочая область «{TITLES[view]}» (change <span className="mono">add-analytics-workspace</span>). Карта под ней не
              размонтируется.
            </p>
            <Button onClick={() => setView('map')}>Вернуться к карте</Button>
          </Panel>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
