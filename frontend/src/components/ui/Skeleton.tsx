// Skeleton — UI-SPEC FESH-08. Subtle 1.5s ease-in-out pulse, inherits parent
// border-radius. Three variants — text/rect/circle.
//
// Accessibility (UI-SPEC §Accessibility): aria-busy + aria-label="Loading"
// applied to the skeleton element so screen readers announce the loading
// state without injecting "Loading…" text into the visual shell. For the
// multi-line text variant we apply the busy/label to the outer wrapper so the
// announcement happens once for the entire stack.

import { CSSProperties } from 'react'

interface SkeletonProps {
  variant?: 'text' | 'rect' | 'circle'
  width?: string | number
  height?: string | number
  lines?: number
  className?: string
  style?: CSSProperties
}

export function Skeleton({
  variant = 'rect',
  width,
  height,
  lines = 1,
  className = '',
  style,
}: SkeletonProps) {
  if (variant === 'text' && lines > 1) {
    return (
      <div
        className={`cmc-skeleton-stack ${className}`.trim()}
        aria-busy
        aria-label="Loading"
      >
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className="cmc-skeleton cmc-skeleton--text"
            style={{ width: i === lines - 1 ? '60%' : '100%' }}
          />
        ))}
      </div>
    )
  }
  return (
    <span
      className={`cmc-skeleton cmc-skeleton--${variant} ${className}`.trim()}
      style={{ width, height, ...style }}
      aria-busy
      aria-label="Loading"
    />
  )
}
