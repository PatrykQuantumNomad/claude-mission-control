// Badge — UI-SPEC FESH-06. JetBrains Mono 12px, 8px radius. Five variants —
// neutral/info/success/warning/danger — each tinted via the corresponding
// status palette swatch. variant=neutral uses the surface palette (not status).

import { HTMLAttributes, forwardRef } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'neutral', className = '', ...rest }, ref) => (
    <span ref={ref} className={`cmc-badge cmc-badge--${variant} ${className}`.trim()} {...rest} />
  ),
)
Badge.displayName = 'Badge'
