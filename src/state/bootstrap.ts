// Загрузка данных и пакетная оценка (setup-app-foundation design D12).
import { loadDataset as defaultLoadDataset, type LoadProgress } from '@/data'
import type { Dataset, DecisionResult } from '@/domain/types'
import { evaluateAll as defaultEvaluateAll } from '@/engine'
import { useAppStore } from './store'

const CHUNK = 5000
const yieldToUi = () => new Promise((r) => setTimeout(r, 0))

export interface BootstrapDeps {
  loadDataset: (onProgress?: (p: LoadProgress) => void) => Promise<Dataset>
  evaluateAll: typeof defaultEvaluateAll
}

export async function bootstrap(deps: BootstrapDeps = { loadDataset: defaultLoadDataset, evaluateAll: defaultEvaluateAll }) {
  const store = useAppStore.getState()
  store.setError(null)
  store.setPhase('loading')
  try {
    const dataset = await deps.loadDataset((p) => store.setLoadingProgress(p))
    const norms = useAppStore.getState().norms
    const total = dataset.sites.length
    const decisions: Record<string, DecisionResult> = {}
    const started = performance.now()
    for (let i = 0; i < total; i += CHUNK) {
      store.setLoadingProgress({ step: 'Анализ лесосек', done: i, total })
      await yieldToUi() // даём прогресс-бару отрисоваться
      Object.assign(decisions, deps.evaluateAll(dataset.sites.slice(i, i + CHUNK), norms))
    }
    if (import.meta.env.DEV) console.info(`[bootstrap] evaluateAll ${total}: ${Math.round(performance.now() - started)} мс`)
    store.setLoadingProgress({ step: 'Анализ лесосек', done: total, total })
    store.setDataset(dataset, decisions)
    store.setPhase('intro')
  } catch (err) {
    store.setError(err instanceof Error ? err.message : String(err))
    store.setPhase('error')
  }
}
