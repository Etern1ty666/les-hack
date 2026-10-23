import { useEffect } from 'react'
import { advanceClock, clock, useGame } from './game/store'
import { Hud } from './ui/Hud'
import { Scene } from './world/Scene'

export function App() {
  // логика смены — 10 раз в секунду; часы двигаются в кадре рендера
  useEffect(() => {
    const id = window.setInterval(() => {
      advanceClock()
      useGame.getState().step()
    }, 100)
    if (import.meta.env.DEV) Object.assign(window, { useGame, gameClock: clock })
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="game">
      <Scene />
      <Hud />
    </div>
  )
}
