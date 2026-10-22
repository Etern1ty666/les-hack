// Пресеты камеры (add-strategic-map design D5).
import type { LonLat } from '@/domain/types'

export interface CameraPreset {
  center: LonLat
  zoom: number
  pitch: number
  bearing: number
}

export const GLOBE_VIEW: CameraPreset = { center: [70, 40], zoom: 1.15, pitch: 0, bearing: 0 }

export function russiaView(viewportWidth = window.innerWidth): CameraPreset {
  return { center: [96, 61], zoom: viewportWidth < 1400 ? 2.4 : 2.7, pitch: 35, bearing: 0 }
}

export const MAP_LIMITS = { minZoom: 0.8, maxZoom: 17, maxPitch: 75 } as const
