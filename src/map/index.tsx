// ПЛЕЙСХОЛДЕР карты: звёздное небо и стилизованный «глобус».
// Настоящую сцену (MapLibre globe + deck.gl) делает change add-strategic-map, заменяя этот файл.
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useAppStore } from '@/state/store'
import './placeholder.css'

function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const canvas = ref.current
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
        tw: i % 20 === 0 ? Math.random() * Math.PI * 2 : -1, // ≈5 % мерцают
      }))
    }

    let frame = 0
    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const s of stars) {
        const a = s.tw >= 0 && !reduced ? s.a * (0.6 + 0.4 * Math.sin(t / 700 + s.tw)) : s.a
        ctx.fillStyle = `rgba(214, 240, 232, ${a})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      if (!reduced && document.visibilityState === 'visible') frame = requestAnimationFrame(draw)
    }

    resize()
    frame = requestAnimationFrame(draw)
    const onResize = () => {
      resize()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    const onVisibility = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reduced])

  return <canvas ref={ref} className="starfield" />
}

export default function MapScene() {
  const phase = useAppStore((s) => s.phase)
  useEffect(() => {
    if (import.meta.env.DEV) console.info('[MapScene] mounted') // проверка: монтируется один раз
  }, [])
  return (
    <div className="map-placeholder">
      <div className="nebula" />
      <Starfield />
      <div className={`planet${phase === 'ready' ? ' planet--ready' : ''}`}>
        <div className="planet__atmosphere" />
        <div className="planet__body" />
      </div>
    </div>
  )
}
