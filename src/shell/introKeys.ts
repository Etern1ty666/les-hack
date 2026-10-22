// Клавиши «Начать» на интро (foundation D13: Enter — shell; Space допускается спецификацией app-shell).
import type { AppPhase } from '@/state/store'

export function isIntroStartKey(phase: AppPhase, key: string): boolean {
  return phase === 'intro' && (key === 'Enter' || key === ' ')
}
