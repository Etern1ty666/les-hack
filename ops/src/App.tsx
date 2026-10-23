import { useEffect } from 'react'
import { regionAt } from './data/regions'
import { RealMap } from './map/RealMap'
import { advanceSim, sim, useOps } from './ops/store'
import { Hud } from './ui/Hud'
import { Scene } from './world/Scene'

export function App() {
  const mode = useOps((s) => s.mode)
  useEffect(() => {
    // старт — реальная карта (Ставрополь); ?lon=&lat= — сразу диорама района в этой точке
    const q = new URLSearchParams(location.search)
    if (q.has('lon') && q.has('lat') && useOps.getState().status === 'idle') {
      const lon = Number(q.get('lon'))
      const lat = Number(q.get('lat'))
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
      <div className={`stage${mode === 'map' ? ' stage--hidden' : ''}`}>
        <Scene />
      </div>
      <RealMap />
      <Hud />
    </div>
  )
}
