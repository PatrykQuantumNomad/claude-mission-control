// CopyIconButton — Phase 24 Plan 03 (CONT-03).
//
// Copy-icon affordance for known-long cell values (session-id, cwd, skill-name).
// Hover-revealed via parent .cmc-cell--copyable:hover rule in styles.css.
// stopPropagation preserves row-click semantics — tables that open a Sheet on
// row-click (LiveSessionsCard, SkillRunsTable) MUST NOT fire the row-click when
// the copy icon is clicked.
//
// data-state attribute: "idle" | "copied". The "copied" state lasts 1200ms
// after a successful clipboard write, then reverts to "idle". Tests + the
// CSS opacity rule both key off this attribute.

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Check, Copy } from 'lucide-react'

interface CopyIconButtonProps {
  value: string
  onCopy?: () => void
}

export function CopyIconButton({ value, onCopy }: CopyIconButtonProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear pending timer on unmount so a late setCopied(false) does not run on
  // an unmounted component (React 19 logs the warning loudly).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // stopPropagation MUST run BEFORE the async clipboard write — by the time
    // the await resolves, the synthetic event has already bubbled.
    e.stopPropagation()
    void (async () => {
      try {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        onCopy?.()
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), 1200)
      } catch {
        // Clipboard write rejected (no permission / not supported). Stay idle.
        // Intentional silent — no UI surface for clipboard errors in v1.3.
      }
    })()
  }

  const Icon = copied ? Check : Copy

  return (
    <button
      type="button"
      className="cmc-cell__copy-btn"
      data-testid="cell-copy-btn"
      data-state={copied ? 'copied' : 'idle'}
      aria-label={copied ? 'Copied value to clipboard' : 'Copy value to clipboard'}
      onClick={handleClick}
    >
      <Icon size={14} aria-hidden="true" />
    </button>
  )
}
