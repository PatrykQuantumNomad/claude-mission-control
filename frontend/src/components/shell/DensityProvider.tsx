// DensityProvider — Phase 24 Plan 02 (DENS-03).
//
// Mount-time density re-apply for hot-reload safety.
//
// applyDensity() is also called from main.tsx BEFORE ReactDOM.createRoot to
// avoid a flash of wrong density on cold load. This Provider re-applies on
// mount so HMR doesn't reset the data-density attribute mid-session.
//
// INTENTIONALLY NOT A CONTEXT. Consumers read CSS variables (via styles.css
// cascade), not React state. Adding a context here would break the
// zero-rerender invariant (POLI-11) — every consumer would re-render on every
// toggle. The only stateful component is DensityToggle itself, which keeps a
// local useState purely to drive its own check-mark indicator.

import { useEffect, type ReactNode } from 'react'
import { applyDensity } from '../../lib/density'

export function DensityProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyDensity()
  }, [])
  return <>{children}</>
}
