import { BRAND } from './brand'

export function BrandMark({ size = 'md' }: { size?: 'md' | 'xl' }) {
  return (
    <div className={`brand${size === 'xl' ? ' brand--xl' : ''}`}>
      <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden>
        <path d="M16 2 30 16 16 30 2 16Z" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
        <path d="M16 9 23 16 16 23 9 16Z" fill="var(--accent)" />
        <path d="M16 2v5M16 25v5M2 16h5M25 16h5" stroke="var(--accent)" strokeWidth="1" opacity="0.5" />
      </svg>
      <span className="brand__name">{BRAND.name}</span>
    </div>
  )
}
