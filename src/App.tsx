// Компоновка слоёв (setup-app-foundation design D1): карта → HUD → рабочие области → оверлеи → экраны оболочки.
import { lazy, Suspense, useEffect } from 'react'
import Hud from '@/hud'
import MapScene from '@/map'
import { ShellOverlays } from '@/shell/ShellOverlays'
import { ShellScreens } from '@/shell/ShellScreens'
import '@/shell/shell.css'
import { bootstrap } from '@/state/bootstrap'
import { useAppStore } from '@/state/store'
import Workspace from '@/workspace'

const Showcase = lazy(() => import('@/ui/Showcase'))

export default function App() {
  useEffect(() => {
    // StrictMode вызывает эффект дважды — запускаем загрузку только из фазы boot
    if (useAppStore.getState().phase === 'boot') void bootstrap()
  }, [])

  return (
    <div className="app">
      <div className="layer layer--map">
        <MapScene />
      </div>
      <div className="layer layer--hud">
        <Hud />
      </div>
      <div className="layer layer--workspace">
        <Workspace />
      </div>
      <div className="layer layer--overlays">
        <ShellOverlays />
      </div>
      <ShellScreens />
    </div>
  )
}

export function Root() {
  const showcase = new URLSearchParams(window.location.search).get('ui') === '1'
  if (showcase) {
    return (
      <Suspense fallback={null}>
        <Showcase />
      </Suspense>
    )
  }
  return <App />
}
