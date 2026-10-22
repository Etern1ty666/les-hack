// Звёзды под прозрачным канвасом карты (add-strategic-map design D8a). ≈5 % звёзд мерцают.
import { useReducedMotion } from 'motion/react'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export interface StarfieldHandle {
  /** Прозрачность слоя: на зуме ≥ 5 звёзды не видны за небом. Пишется в DOM напрямую, без ререндера. */
  setOpacity(opacity: number): void
}

export const Starfield = forwardRef<StarfieldHandle>(function Starfield(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useImperativeHandle(ref, () => ({
    setOpacity(opacity) {
      if (wrapRef.current) wrapRef.current.style.opacity = String(opacity)
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let stars: { x: number; y: number; r: number; a: number; tw: number }[] = []

    const resize = () => {
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      stars = Array.from({ length: 1500 }, (_, i) => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: (Math.random() ** 3 * 1.4 + 0.3) * dpr,
        a: Math.random() * 0.7 + 0.15,
        tw: i % 20 === 0 ? Math.random() * Math.PI * 2 : -1,
      }))
    }

    let frame = 0
    const draw = (t: number) => {
      if (!reduced && document.visibilityState === 'visible') frame = requestAnimationFrame(draw)
      if (wrapRef.current?.style.opacity === '0') return // скрыты на крупном зуме — не рисуем
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const s of stars) {
        const a = s.tw >= 0 && !reduced ? s.a * (0.6 + 0.4 * Math.sin(t / 700 + s.tw)) : s.a
        ctx.fillStyle = `rgba(214, 240, 232, ${a})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const restart = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    resize()
    restart()
    const onResize = () => {
      resize()
      restart()
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', restart)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', restart)
    }
  }, [reduced])

  return (
    <div ref={wrapRef} className="starfield">
      <div className="starfield__nebula" />
      <canvas ref={canvasRef} className="starfield__canvas" />
    </div>
  )
})
