import { useEffect } from 'react'
import { advanceSim, sim, useOps } from './ops/store'
import { Hud } from './ui/Hud'
import { PRESETS, regionAt } from './ui/Overview'
import { Scene } from './world/Scene'

export function App() {
  useEffect(() => {
    // стартовый район — Варнавино (пилотная Нижегородская область); ?lon=&lat= — любая точка
    const q = new URLSearchParams(location.search)
    const lon = Number(q.get('lon') ?? PRESETS[0]!.lon)
    const lat = Number(q.get('lat') ?? PRESETS[0]!.lat)
    if (useOps.getState().status === 'idle') {
      void regionAt(lon, lat)
        .catch(() => '')
        .then((r) => useOps.getState().loadArea({ lon, lat, widthKm: 12, heightKm: 8 }, r))
    }
    // логика — 10 раз в секунду; модельное время идёт и в фоновой вкладке
    const id = window.setInterval(() => {
      advanceSim()
      useOps.getState().step()
    }, 100)
    if (import.meta.env.DEV) Object.assign(window, { useOps, sim })
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="app">
      <Scene />
      <Hud />
    </div>
  )
}
