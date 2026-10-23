// Процедурные портреты лесников в плоском стиле: фуражка/шляпа/шапка, борода, очки, цвет кожи и волос.
import { mulberry32 } from '../lib/math'

const SKIN = ['#efc9a4', '#e2b08a', '#c98f66', '#a8714d', '#f3d3b5']
const HAIR = ['#2b2420', '#5a3a26', '#8a6a44', '#b9b3a8', '#1d1b1a', '#a65a2c']

export function Portrait({ seed, female = false, jacket, size = 64 }: { seed: number; female?: boolean; jacket?: string; size?: number }) {
  const r = mulberry32(seed)
  const skin = SKIN[Math.floor(r() * SKIN.length)]!
  const hair = HAIR[Math.floor(r() * HAIR.length)]!
  const hat = Math.floor(r() * 4) // 0 фуражка, 1 широкополая шляпа, 2 шапка, 3 без головного убора
  const beard = !female && r() < 0.45 ? Math.floor(r() * 3) : -1 // 0 борода, 1 усы, 2 щетина
  const glasses = r() < 0.25
  const faceW = 11 + r() * 2.5
  const uniform = jacket ?? '#3d5a3a'
  const h = size * 1.25
  return (
    <svg viewBox="0 0 64 80" width={size} height={h} className="crew__portrait" aria-hidden>
      <defs>
        <linearGradient id={`bg${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d4d6d1" />
          <stop offset="1" stopColor="#a9ada6" />
        </linearGradient>
      </defs>
      <rect width="64" height="80" fill={`url(#bg${seed})`} />
      {/* волосы сзади (длинные) */}
      {female && hat !== 2 && <path d={`M${32 - faceW - 2} 34 Q32 ${hat === 1 ? 16 : 14} ${32 + faceW + 2} 34 L${34 + faceW} 60 L${30 - faceW} 60 Z`} fill={hair} />}
      {/* плечи и форма */}
      <path d="M4 80 Q6 60 22 56 L42 56 Q58 60 60 80 Z" fill={uniform} />
      <path d="M22 56 L32 68 L42 56 L38 55 L32 62 L26 55 Z" fill="#e9e6da" opacity="0.85" />
      <path d="M26 55 L32 62 L38 55" fill="none" stroke="#1f2a1f" strokeWidth="1.2" />
      <rect x="44" y="64" width="6" height="4" rx="1" fill="#d8b43a" />
      {/* шея */}
      <rect x="27" y="46" width="10" height="12" fill={skin} />
      <rect x="27" y="52" width="10" height="5" fill="#000" opacity="0.12" />
      {/* уши и голова */}
      <ellipse cx={32 - faceW} cy="38" rx="2.4" ry="3.6" fill={skin} />
      <ellipse cx={32 + faceW} cy="38" rx="2.4" ry="3.6" fill={skin} />
      <ellipse cx="32" cy="36" rx={faceW} ry="14.5" fill={skin} />
      <path d={`M${32 + faceW * 0.2} 22 Q${32 + faceW} 28 ${32 + faceW} 38 Q${32 + faceW * 0.8} 48 32 50.5 L32 22 Z`} fill="#000" opacity="0.07" />
      {/* волосы спереди (если нет шапки) */}
      {hat === 3 && <path d={`M${32 - faceW - 0.5} 34 Q${32 - faceW} 19 32 20 Q${32 + faceW} 19 ${32 + faceW + 0.5} 34 Q${36} 25 ${26} 27 Z`} fill={hair} />}
      {/* брови, глаза, нос, рот */}
      <rect x="23.5" y="31" width="6" height="1.6" fill={hair} opacity="0.9" />
      <rect x="34.5" y="31" width="6" height="1.6" fill={hair} opacity="0.9" />
      <ellipse cx="27" cy="35.5" rx="1.4" ry="1.2" fill="#1d1d1d" />
      <ellipse cx="37" cy="35.5" rx="1.4" ry="1.2" fill="#1d1d1d" />
      <path d="M32 36 L30 42.5 L33.5 42.5" fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="1.1" />
      <path d="M28.5 46 Q32 47.5 35.5 46" fill="none" stroke="#5a2e22" strokeWidth="1.2" />
      {glasses && (
        <g fill="none" stroke="#202020" strokeWidth="1.1">
          <circle cx="27" cy="35.5" r="3.3" />
          <circle cx="37" cy="35.5" r="3.3" />
          <path d="M30.3 35.5 L33.7 35.5" />
        </g>
      )}
      {beard === 0 && <path d={`M${32 - faceW + 1} 39 Q${32 - faceW + 2} 52 32 53 Q${32 + faceW - 2} 52 ${32 + faceW - 1} 39 Q36 45 32 44.5 Q28 45 ${32 - faceW + 1} 39 Z`} fill={hair} />}
      {beard === 1 && <path d="M27 44.2 Q32 42 37 44.2 L36 45.6 Q32 44.2 28 45.6 Z" fill={hair} />}
      {beard === 2 && <path d={`M${32 - faceW + 2} 41 Q32 54 ${32 + faceW - 2} 41 Q32 49 ${32 - faceW + 2} 41 Z`} fill="#000" opacity="0.15" />}
      {/* головные уборы */}
      {hat === 0 && (
        <g>
          <path d={`M${32 - faceW - 2} 27 Q32 13 ${32 + faceW + 2} 27 Z`} fill="#2d4a33" />
          <rect x={32 - faceW - 1} y="25" width={faceW * 2 + 2} height="4" fill="#1f3324" />
          <path d={`M${32 - faceW} 29 Q32 33 ${32 + faceW} 29 L${32 + faceW - 2} 27 L${32 - faceW + 2} 27 Z`} fill="#121212" />
          <circle cx="32" cy="23" r="1.8" fill="#d8b43a" />
        </g>
      )}
      {hat === 1 && (
        <g>
          <ellipse cx="32" cy="26" rx={faceW + 9} ry="3.6" fill="#8b7752" />
          <path d={`M${32 - faceW + 1} 26 L${32 - faceW + 3} 15 Q32 11 ${32 + faceW - 3} 15 L${32 + faceW - 1} 26 Z`} fill="#9a865e" />
          <path d="M28 14 L32 18 L36 14" fill="none" stroke="#6e5d3e" strokeWidth="1.2" />
          <rect x={32 - faceW + 1} y="22.5" width={faceW * 2 - 2} height="2.4" fill="#4a3d27" />
        </g>
      )}
      {hat === 2 && (
        <g>
          <path d={`M${32 - faceW - 1.5} 30 Q${32 - faceW} 14 32 14 Q${32 + faceW} 14 ${32 + faceW + 1.5} 30 Z`} fill="#37423a" />
          <rect x={32 - faceW - 1.5} y="26" width={faceW * 2 + 3} height="5" fill="#2a332c" />
        </g>
      )}
    </svg>
  )
}
