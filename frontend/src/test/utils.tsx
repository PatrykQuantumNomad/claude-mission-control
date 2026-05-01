// Custom RTL render that wraps every component tree in <MotionConfig reducedMotion="always">.
// component tests MUST import { render, userEvent } from this module — never directly
// from @testing-library/react — to keep framer-motion deterministic in tests (Pitfall 2).

import { MotionConfig } from 'framer-motion'
import { render as rtlRender, RenderOptions } from '@testing-library/react'
import { ReactElement, ReactNode } from 'react'

function MotionWrapper({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="always">{children}</MotionConfig>
}

export function render(ui: ReactElement, options?: RenderOptions) {
  return rtlRender(ui, {
    wrapper: MotionWrapper,
    ...options,
  })
}

export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
