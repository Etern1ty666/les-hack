// Постоянные оверлеи: виньетка с шумом и бейдж демо-данных.
import { useAppStore } from '@/state/store'
import { Tooltip } from '@/ui'

function DemoBadge() {
  const synthetic = useAppStore((s) => s.dataset?.sites.some((x) => x.dataSource === 'synthetic') ?? false)
  if (!synthetic) return null
  return (
    <div className="demo-badge">
      <Tooltip
        placement="left"
        content="Лесосеки сгенерированы для демонстрации: реальных данных заключительных осмотров нет. Нормативы — демонстрационные, помечены «не сверено»."
      >
        <span className="demo-badge__chip" tabIndex={0}>
          Демо-данные · синтетика
        </span>
      </Tooltip>
    </div>
  )
}

export function ShellOverlays() {
  return (
    <>
      <div className="vignette" />
      <DemoBadge />
    </>
  )
}
