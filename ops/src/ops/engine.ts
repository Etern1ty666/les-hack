// ИИ-модель поддержки решений (упрощённая версия правил из спеки): подрост → норматив → способ лесовосстановления.
import { rand, randInt, type Rng } from '../lib/math'

export type Species = 'pine' | 'spruce' | 'birch' | 'aspen'
export type HeightClass = 'small' | 'medium' | 'large'
export type Kind = 'natural' | 'combined' | 'artificial'

export interface Undergrowth {
  species: Species
  height: HeightClass
  count: number // шт/га
  viable: number // 0..1
}

export interface Survey {
  tlu: string
  tluName: string
  forestType: string
  targets: Species[]
  norm: number // норматив приведённого подроста, шт/га
  undergrowth: Undergrowth[]
  occurrence: number // встречаемость 0..1
}

export interface Option {
  kind: Kind
  cost: number
  areaToPlant: number
  seedlings: number
  density: number | null
  composition: string
  stock: string
  measures: string
}

export interface Decision {
  kind: Kind
  normalized: number
  ratio: number
  occurrence: number
  undesired: number
  confidence: number
  reasons: { ok: boolean | null; text: string }[]
  options: Record<Kind, Option>
}

export const SPECIES_RU: Record<Species, string> = { pine: 'Сосна', spruce: 'Ель', birch: 'Берёза', aspen: 'Осина' }
export const SPECIES_SHORT: Record<Species, string> = { pine: 'С', spruce: 'Е', birch: 'Б', aspen: 'Ос' }
export const HEIGHT_RU: Record<HeightClass, string> = { small: 'до 0,5 м', medium: '0,6–1,5 м', large: '> 1,5 м' }
export const KIND_RU: Record<Kind, string> = { natural: 'Естественное', combined: 'Комбинированное', artificial: 'Искусственное' }
export const KIND_COLOR: Record<Kind, string> = { natural: '#3f9a5b', combined: '#c8902c', artificial: '#c2333a' }

const COEF: Record<HeightClass, number> = { small: 0.5, medium: 0.8, large: 1.0 }
const MIN_OCCURRENCE = 0.65
const COMBINED_LOWER = 0.5
const MAX_UNDESIRED = 0.6
const DENSITY: Record<'pine' | 'spruce', number> = { pine: 3500, spruce: 3000 }

const TLU: { code: string; name: string; type: string; targets: Species[] }[] = [
  { code: 'A2', name: 'Свежий бор', type: 'Сосняк брусничный', targets: ['pine'] },
  { code: 'B2', name: 'Свежая суборь', type: 'Сосняк черничный', targets: ['pine', 'spruce'] },
  { code: 'B3', name: 'Влажная суборь', type: 'Ельник долгомошный', targets: ['spruce', 'pine'] },
  { code: 'C2', name: 'Свежий сугрудок', type: 'Ельник кисличный', targets: ['spruce', 'pine'] },
]

const fmt = (x: number) => Math.round(x).toLocaleString('ru-RU')

/** Генерирует «правду» заключительного осмотра для лесосеки. */
export function generateSurvey(rng: Rng, burnt = false, bias = 0): Survey {
  const tlu = TLU[Math.floor(rng() * TLU.length)]!
  const norm = 2500
  if (burnt) {
    return { tlu: tlu.code, tluName: tlu.name, forestType: tlu.type, targets: tlu.targets, norm, undergrowth: [], occurrence: 0.05 }
  }
  // латентное «качество» возобновления → коэффициент достаточности; bias < 0 — старые рубки (больше подроста)
  const u = Math.min(0.999, Math.max(0, rng() + bias))
  const ratio = u < 0.4 ? rand(rng, 1.05, 1.9) : u < 0.73 ? rand(rng, 0.55, 0.95) : rand(rng, 0.05, 0.45)
  const total = ratio * norm
  const species = tlu.targets.slice(0, randInt(rng, 1, tlu.targets.length))
  const shares = species.length === 2 ? [0.65, 0.35] : [1]
  const heights: HeightClass[] = ['small', 'medium', 'large']
  const undergrowth: Undergrowth[] = species.map((s, i) => {
    const height = heights[Math.floor(rng() * 3)]!
    const viable = Math.round(rand(rng, 0.68, 0.95) * 100) / 100
    const count = Math.max(100, Math.round((total * shares[i]!) / (viable * COEF[height]) / 50) * 50)
    return { species: s, height, count, viable }
  })
  // нежелательные мягколиственные — чаще на бедных подростом участках
  if (rng() < (ratio < 0.5 ? 0.7 : 0.35)) {
    undergrowth.push({
      species: rng() < 0.7 ? 'birch' : 'aspen',
      height: rng() < 0.5 ? 'large' : 'medium',
      count: Math.round(rand(rng, 1500, 8000) / 100) * 100,
      viable: Math.round(rand(rng, 0.8, 0.95) * 100) / 100,
    })
  }
  const occurrence = Math.round(Math.min(0.97, Math.max(0.15, 0.35 + 0.35 * Math.min(ratio, 1.6) + rand(rng, -0.12, 0.12))) * 100) / 100
  return { tlu: tlu.code, tluName: tlu.name, forestType: tlu.type, targets: tlu.targets, norm, undergrowth, occurrence }
}

function composition(targets: Species[]): { text: string; density: number } {
  const [a, b] = targets as ('pine' | 'spruce')[]
  if (!b) return { text: `10${SPECIES_SHORT[a!]}`, density: DENSITY[a!] }
  return { text: `7${SPECIES_SHORT[a!]}3${SPECIES_SHORT[b]}`, density: Math.round((0.7 * DENSITY[a!] + 0.3 * DENSITY[b]) / 50) * 50 }
}

/** Решение и стоимость вариантов для лесосеки площадью areaHa. */
export function decide(s: Survey, areaHa: number): Decision {
  const normalized = s.undergrowth
    .filter((r) => s.targets.includes(r.species))
    .reduce((sum, r) => sum + r.count * r.viable * COEF[r.height], 0)
  const viableAll = s.undergrowth.reduce((sum, r) => sum + r.count * r.viable, 0)
  const viableBad = s.undergrowth.filter((r) => !s.targets.includes(r.species)).reduce((sum, r) => sum + r.count * r.viable, 0)
  const undesired = viableAll > 0 ? viableBad / viableAll : 0
  const ratio = normalized / s.norm
  const occOk = s.occurrence >= MIN_OCCURRENCE

  let kind: Kind
  if (ratio >= 1 && occOk) kind = 'natural'
  else if (ratio >= 1) kind = 'combined'
  else if (ratio >= COMBINED_LOWER) kind = undesired > MAX_UNDESIRED ? 'artificial' : 'combined'
  else kind = 'artificial'

  const reasons: Decision['reasons'] = [
    { ok: null, text: `${s.tluName} (${s.tlu}): целевые — ${s.targets.map((t) => SPECIES_RU[t].toLowerCase()).join(', ')}` },
    {
      ok: ratio >= 1,
      text: `Приведённый подрост ${fmt(normalized)} шт/га ${ratio >= 1 ? '≥' : '<'} норматива ${fmt(s.norm)} (${Math.round(ratio * 100)} %)`,
    },
    { ok: occOk, text: `Встречаемость ${Math.round(s.occurrence * 100)} % ${occOk ? '≥' : '<'} ${Math.round(MIN_OCCURRENCE * 100)} %` },
  ]
  if (undesired > 0.05) {
    reasons.push({
      ok: undesired <= MAX_UNDESIRED,
      text: `Мягколиственные ${Math.round(undesired * 100)} % ${undesired > MAX_UNDESIRED ? '— риск смены пород' : ''}`.trim(),
    })
  }

  // достоверность: ниже у самых порогов
  const margin = Math.min(Math.abs(ratio - 1), Math.abs(ratio - COMBINED_LOWER))
  const confidence = Math.max(0.55, Math.min(0.97, 0.95 - (margin < 0.1 ? 0.25 : margin < 0.2 ? 0.12 : 0) - (Math.abs(s.occurrence - MIN_OCCURRENCE) < 0.05 ? 0.1 : 0)))

  const comp = composition(s.targets)
  const plantCostPerHa = 7000 + 15000 + 3 * 6000
  const combinedShare = Math.min(0.8, Math.max(0.2, Math.max(1 - ratio, 1 - s.occurrence)))
  const option = (k: Kind): Option => {
    if (k === 'natural') {
      return {
        kind: k,
        cost: Math.round(areaHa * 8000),
        areaToPlant: 0,
        seedlings: 0,
        density: null,
        composition: '—',
        stock: '—',
        measures: 'Сохранение подроста, минерализация почвы',
      }
    }
    const area = k === 'artificial' ? areaHa : Math.round(areaHa * combinedShare * 10) / 10
    const seedlings = Math.round(area * comp.density)
    return {
      kind: k,
      cost: Math.round(area * plantCostPerHa + seedlings * 6 + (k === 'combined' ? areaHa * 3000 : 0)),
      areaToPlant: area,
      seedlings,
      density: comp.density,
      composition: comp.text,
      stock: 'Сеянцы ОКС',
      measures: k === 'combined' ? 'Сохранение подроста + посадка в «окна»' : 'Обработка почвы, посадка, уходы 3 года',
    }
  }

  return {
    kind,
    normalized,
    ratio,
    occurrence: s.occurrence,
    undesired,
    confidence,
    reasons,
    options: { natural: option('natural'), combined: option('combined'), artificial: option('artificial') },
  }
}

export const KIND_ORDER: Kind[] = ['natural', 'combined', 'artificial']
