// Цвета карточек и меток — как в референсе: насыщенные плоские плашки.
import type { CallType } from '../game/store'

export const CALL_STYLE: Record<CallType, { color: string; label: string }> = {
  inspection: { color: '#2e6b57', label: 'Осмотр' },
  decision: { color: '#b8862a', label: 'Решение' },
  planting: { color: '#5d7a2e', label: 'Посадка' },
  fire: { color: '#c9252f', label: 'Пожар' },
  illegal: { color: '#6e2b84', label: 'Нарушение' },
}

export const fmtRub = (x: number) => `${Math.round(x).toLocaleString('ru-RU')} ₽`
export const fmtRubShort = (x: number) =>
  Math.abs(x) >= 1e6 ? `${(x / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн ₽` : `${Math.round(x / 1000).toLocaleString('ru-RU')} тыс. ₽`
