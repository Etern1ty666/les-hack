// Форматирование чисел и дат для интерфейса. Без Intl в горячих путях: функции вызываются тысячи раз.
import { SPECIES } from './constants'
import type { LonLat, SpeciesCode } from './types'

export const NBSP = ' '

function groupThousands(intPart: string): string {
  let out = ''
  for (let i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 === 0) out += NBSP
    out += intPart[i]
  }
  return out
}

/** 1234567 → '1 234 567' (неразрывные пробелы). Округляет до целого. */
export function fmtInt(x: number): string {
  if (!Number.isFinite(x)) return '—'
  const r = Math.round(x)
  const s = groupThousands(String(Math.abs(r)))
  return r < 0 ? `−${s}` : s
}

/** Число с фиксированными знаками после запятой: fmtDecimal(8.25, 1) → '8,3'. */
export function fmtDecimal(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '—'
  const fixed = Math.abs(x).toFixed(digits)
  const [int = '0', frac] = fixed.split('.')
  const body = frac ? `${groupThousands(int)},${frac}` : groupThousands(int)
  return x < 0 && Number(fixed) !== 0 ? `−${body}` : body
}

const COMPACT_UNITS: [number, string][] = [
  [1e9, 'млрд'],
  [1e6, 'млн'],
  [1e3, 'тыс.'],
]

/** 612345 → '612 тыс.', 412e6 → '412 млн', 3.8e10 → '38 млрд', 1.25e6 → '1,3 млн'. */
export function fmtCompact(x: number): string {
  if (!Number.isFinite(x)) return '—'
  const abs = Math.abs(x)
  for (const [base, unit] of COMPACT_UNITS) {
    if (abs >= base) {
      const v = x / base
      const digits = Math.abs(v) < 10 ? 1 : 0
      let s = fmtDecimal(v, digits)
      if (s.endsWith(',0')) s = s.slice(0, -2)
      return `${s}${NBSP}${unit}`
    }
  }
  return fmtInt(x)
}

/** Площадь: '8,3 га', '2 450 га', '612 тыс. га'. */
export function fmtHa(x: number): string {
  const abs = Math.abs(x)
  const body = abs < 100 ? fmtDecimal(x, 1) : abs < 1e4 ? fmtInt(x) : fmtCompact(x)
  return `${body}${NBSP}га`
}

/** '2 500 шт/га'. */
export function fmtPerHa(x: number): string {
  return `${fmtInt(x)}${NBSP}шт/га`
}

/** Оценочная сумма: '≈ 412 тыс. ₽'. */
export function fmtRub(x: number): string {
  return `≈${NBSP}${fmtCompact(x)}${NBSP}₽`
}

/** 0.723 → '72 %'. */
export function fmtPct(share: number, digits = 0): string {
  if (!Number.isFinite(share)) return '—'
  const v = share * 100
  return `${digits === 0 ? fmtInt(v) : fmtDecimal(v, digits)}${NBSP}%`
}

/** '2025-06-14' → '14.06.2025'; null → '—'. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return '—'
  return `${d}.${m}.${y}`
}

/** [44.1, 57.3] → '57,30° с. ш. 44,10° в. д.' */
export function fmtLonLat([lon, lat]: LonLat): string {
  const ns = lat >= 0 ? 'с.' : 'ю.'
  const ew = lon >= 0 ? 'в.' : 'з.'
  return `${fmtDecimal(Math.abs(lat), 2)}°${NBSP}${ns}${NBSP}ш. ${fmtDecimal(Math.abs(lon), 2)}°${NBSP}${ew}${NBSP}д.`
}

/** pluralRu(5, ['лесосека', 'лесосеки', 'лесосек']) → 'лесосек'. */
export function pluralRu(n: number, forms: [one: string, few: string, many: string]): string {
  const abs = Math.abs(Math.trunc(n))
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

/** [{pine,70},{spruce,30}] → '7С3Е'. Доли округляются до единиц из 10, сумма — 10. */
export function compositionFormula(parts: { species: SpeciesCode; sharePct: number }[]): string {
  if (parts.length === 0) return '—'
  const units = parts.map((p) => ({ species: p.species, n: Math.round(p.sharePct / 10) }))
  const sum = units.reduce((a, u) => a + u.n, 0)
  if (sum !== 10 && units.length > 0) {
    const largest = units.reduce((a, u) => (u.n > a.n ? u : a))
    largest.n += 10 - sum
  }
  return units
    .filter((u) => u.n > 0)
    .map((u) => `${u.n}${SPECIES[u.species].short}`)
    .join('')
}
