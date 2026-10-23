// Мелкая математика: PRNG, шум, геометрия на плоскости XZ.
import { createNoise2D } from 'simplex-noise'

export type V2 = [number, number]

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export type Rng = ReturnType<typeof mulberry32>

export const rand = (rng: Rng, a: number, b: number) => a + (b - a) * rng()
export const randInt = (rng: Rng, a: number, b: number) => Math.floor(rand(rng, a, b + 1))
export const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!

export function makeNoise(seed: number) {
  return createNoise2D(mulberry32(seed))
}

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (t: number) => t * t * (3 - 2 * t)

export function distToSegment(px: number, pz: number, a: V2, b: V2): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz
  const t = len2 > 0 ? clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / len2, 0, 1) : 0
  const x = a[0] + dx * t
  const z = a[1] + dz * t
  return Math.hypot(px - x, pz - z)
}

export function distToPolyline(px: number, pz: number, pts: V2[]): number {
  let d = Infinity
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(px, pz, pts[i]!, pts[i + 1]!))
  return d
}

export function pointInPolygon(px: number, pz: number, poly: V2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!
    const [xj, zj] = poly[j]!
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

export function polylineLength(pts: V2[]): number {
  let L = 0
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1])
  return L
}

/** Точка и направление на расстоянии s вдоль ломаной. */
export function pointAlong(pts: V2[], s: number): { p: V2; dir: V2 } {
  let left = s
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (left <= seg || i === pts.length - 2) {
      const t = seg > 0 ? clamp(left / seg, 0, 1) : 0
      return { p: [lerp(a[0], b[0], t), lerp(a[1], b[1], t)], dir: seg > 0 ? [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg] : [1, 0] }
    }
    left -= seg
  }
  const last = pts[pts.length - 1]!
  return { p: last, dir: [1, 0] }
}

/** Ломаная через контрольные точки (Catmull-Rom), шаг ≈ step. */
export function smoothPath(ctrl: V2[], step = 1.5): V2[] {
  const out: V2[] = []
  const P = (i: number) => ctrl[clamp(i, 0, ctrl.length - 1)]!
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2)
    const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    const n = Math.max(2, Math.ceil(seg / step))
    for (let k = 0; k < n; k++) {
      const t = k / n
      const t2 = t * t, t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(ctrl[ctrl.length - 1]!)
  return out
}
