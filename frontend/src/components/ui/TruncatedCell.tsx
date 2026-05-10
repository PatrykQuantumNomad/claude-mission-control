// TruncatedCell — Phase 24 Plan 03 (CONT-03).
//
// Lazy detection of cell-content overflow via ResizeObserver-driven
// scrollWidth > clientWidth check on the inline span. When overflowing, wraps
// the span in a Tooltip so hovering reveals the full value. Optional `copyable`
// flag adds a hover-revealed CopyIconButton for known-long fields (session-id,
// cwd, skill-name).
//
// Rendering matrix:
//   short value, no copy   -> bare <span class=cmc-cell--truncate>
//   long  value, no copy   -> <Tooltip><span class=cmc-cell--truncate></Tooltip>
//   short value, copy=on   -> <span class=cmc-cell--copyable>{span}{btn}</span>
//   long  value, copy=on   -> <Tooltip><span class=cmc-cell--copyable>...</span></Tooltip>
//
// The bare-span path is the no-overhead default — DataTable wraps every
// string-valued non-render-fn cell, so the cost must be a single span + a
// ResizeObserver that disconnects on unmount. No setInterval / no rAF.

import { useEffect, useRef, useState } from 'react'
import { Tooltip } from './Tooltip'
import { CopyIconButton } from './CopyIconButton'

interface TruncatedCellProps {
  value: string
  copyable?: boolean
  onCopy?: () => void
}

export function TruncatedCell({ value, copyable, onCopy }: TruncatedCellProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      // scrollWidth > clientWidth is the canonical overflow test. clientWidth
      // is the rendered (post-truncation) width; scrollWidth is the natural
      // width of the content. Strict greater-than avoids flap on equal values.
      setIsOverflowing(el.scrollWidth > el.clientWidth)
    }
    measure()
    // ResizeObserver fires when the SPAN's box changes (column resize, density
    // toggle changes padding, viewport resize via parent reflow). We never
    // observe window directly — the parent observable reflows the span.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [value])

  const span = (
    <span ref={ref} className="cmc-cell--truncate">
      {value}
    </span>
  )

  // Fast path: no copy affordance + content fits = render bare span. This is
  // the dominant case for short cells (UUIDs that fit, integer counters, etc.).
  if (!copyable && !isOverflowing) return span

  const inner = copyable ? (
    <span className="cmc-cell--copyable">
      {span}
      <CopyIconButton value={value} onCopy={onCopy} />
    </span>
  ) : (
    span
  )

  return isOverflowing ? <Tooltip content={value}>{inner}</Tooltip> : inner
}
