// Детерминированный PRNG и хэш строк — общие для фикстуры, генератора данных и 3D-вида.

export type Rng = () => number

/** mulberry32: быстрый 32-битный PRNG, значения в [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a хэш строки → uint32. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const randRange = (rng: Rng, min: number, max: number) => min + (max - min) * rng()
export const randInt = (rng: Rng, min: number, max: number) => Math.floor(randRange(rng, min, max + 1))
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!

/** Нормальное распределение (Бокс — Мюллер). */
export function randNormal(rng: Rng, mean = 0, sd = 1): number {
  const u = Math.max(rng(), 1e-12)
  const v = rng()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Выбор по весам: weights — массив пар [значение, вес]. */
export function pickWeighted<T>(rng: Rng, weights: readonly (readonly [T, number])[]): T {
  const total = weights.reduce((a, [, w]) => a + w, 0)
  let r = rng() * total
  for (const [value, w] of weights) {
    r -= w
    if (r <= 0) return value
  }
  return weights[weights.length - 1]![0]
}
