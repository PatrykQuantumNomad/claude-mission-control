// StatePill — UI-SPEC FESH-06 + Color palette. Colored dot + label using the
// status palette. ok→green, running→cyan (animated pulse), pending+stale→amber,
// error→red. Emits role=status + aria-label that combines the human label with
// the machine state for screen readers ("Live (running)").

import { HTMLAttributes, forwardRef } from 'react'

type State = 'ok' | 'running' | 'pending' | 'stale' | 'error'

interface StatePillProps extends HTMLAttributes<HTMLSpanElement> {
  state: State
  label: string
}

export const StatePill = forwardRef<HTMLSpanElement, StatePillProps>(
  ({ state, label, className = '', ...rest }, ref) => (
    <span
      ref={ref}
      className={`cmc-state-pill cmc-state-pill--${state} ${className}`.trim()}
      role="status"
      aria-label={`${label} (${state})`}
      {...rest}
    >
      <span className="cmc-state-pill__dot" aria-hidden />
      <span className="cmc-state-pill__label">{label}</span>
    </span>
  ),
)
StatePill.displayName = 'StatePill'
