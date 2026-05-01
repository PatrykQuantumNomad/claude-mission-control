// Tooltip — UI-SPEC FESH-06 + Motion Contract. Wraps Radix react-tooltip with
// a locked 200ms delayDuration and the locked 150ms ease-out open animation.
// Each instance mounts its own Provider — simpler than a global Provider in
// AppShell, and Radix de-dupes pointer-state internally per the docs.
//
// The trigger uses Radix's `asChild` pattern, so the supplied child renders as
// the actual trigger element. callers can pass an icon button, a
// span, or a forwardRef'd custom component.

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content side={side} className="cmc-tooltip" sideOffset={6}>
            {content}
            <TooltipPrimitive.Arrow className="cmc-tooltip__arrow" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
