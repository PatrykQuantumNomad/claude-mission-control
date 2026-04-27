// RelativeTime — UI-SPEC FESH-10. Body shows "Nm ago" / "Nh ago" via
// Intl.RelativeTimeFormat; absolute ISO timestamp lives in a Tooltip on hover
// (the canonical absolute-on-hover pattern declared in the UI-SPEC).
//
// formatRelative is exported for unit tests so deterministic time-arithmetic
// assertions can run without re-rendering the component or mocking Tooltip's
// hover behavior. The component itself re-renders every 30s so the relative
// string drifts forward over an open dashboard tab.

import { useEffect, useState } from 'react'
import { Tooltip } from './Tooltip'

interface RelativeTimeProps {
  value: Date | string
  absoluteTooltip?: boolean
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatRelative(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime()
  const diffS = Math.round(diffMs / 1000)
  if (Math.abs(diffS) < 60) return rtf.format(diffS, 'second')
  const diffMin = Math.round(diffMs / 60_000)
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute')
  const diffHr = Math.round(diffMs / 3_600_000)
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour')
  const diffDay = Math.round(diffMs / 86_400_000)
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day')
  const diffMonth = Math.round(diffDay / 30)
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, 'month')
  return rtf.format(Math.round(diffMonth / 12), 'year')
}

export function RelativeTime({ value, absoluteTooltip = true }: RelativeTimeProps) {
  const target = typeof value === 'string' ? new Date(value) : value
  const [, force] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const display = formatRelative(target, new Date())
  const node = <span className="cmc-relative-time cmc-numeric">{display}</span>
  if (!absoluteTooltip) return node
  return <Tooltip content={target.toISOString()}>{node}</Tooltip>
}
