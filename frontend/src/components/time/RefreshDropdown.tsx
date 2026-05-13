// RefreshDropdown — Phase 26 Plan 03 (TIME-01).
//
// Adjacent dropdown in AppShellHeader, right of TimePicker. Persists last
// chosen interval to cmc.autoRefresh.interval (chrome state — does NOT
// round-trip through URL, saved views, or Cmd+Shift+C/V clipboard).
//
// When time_from is absolute (brush-zoom commit), the visual shows "paused"
// — AutoRefreshController detects the same condition and skips the tick.
// Two components observing the same URL state independently keeps them
// decoupled (no shared state needed).

import { useEffect, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { RefreshCw } from 'lucide-react'
import { useRouterState } from '@tanstack/react-router'

const KEY = 'cmc.autoRefresh.interval'
type Interval = 'off' | '30s' | '1m' | '5m'
const INTERVALS: { value: Interval; label: string; ms: number }[] = [
  { value: 'off', label: 'Off', ms: 0 },
  { value: '30s', label: '30 seconds', ms: 30_000 },
  { value: '1m', label: '1 minute', ms: 60_000 },
  { value: '5m', label: '5 minutes', ms: 300_000 },
]

function readInterval(): Interval {
  if (typeof window === 'undefined') return 'off'
  try {
    const v = window.localStorage.getItem(KEY)
    return v === '30s' || v === '1m' || v === '5m' ? v : 'off'
  } catch {
    return 'off'
  }
}
function writeInterval(v: Interval): void {
  try {
    window.localStorage.setItem(KEY, v)
  } catch {
    /* ignore */
  }
}

function isAbsolute(token: string | undefined): boolean {
  return typeof token === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(token)
}

export function RefreshDropdown() {
  const [interval, setIntervalState] = useState<Interval>('off')
  useEffect(() => {
    setIntervalState(readInterval())
  }, [])
  const location = useRouterState({ select: (s) => s.location })
  const search = (location.search ?? {}) as Record<string, unknown>
  const paused = isAbsolute(
    typeof search.time_from === 'string' ? search.time_from : undefined,
  )
  const active = interval !== 'off' && !paused

  function choose(v: Interval) {
    setIntervalState(v)
    writeInterval(v)
    // Same-tab notification so AutoRefreshController re-evaluates without
    // a full reload (storage events do not fire in the same tab that wrote
    // them — see MDN Window: storage event).
    window.dispatchEvent(new Event('cmc:auto-refresh-changed'))
  }

  const label = paused
    ? 'Paused'
    : INTERVALS.find((i) => i.value === interval)?.label ?? 'Off'

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={`cmc-refresh-dropdown__trigger cmc-btn${
            active ? ' cmc-refresh-dropdown__trigger--active' : ''
          }`}
          data-testid="refresh-dropdown-trigger"
          aria-label={`Auto-refresh: ${label}`}
        >
          <RefreshCw size={14} aria-hidden />
          <span>{label}</span>
          {active ? (
            <span
              className="cmc-refresh-dropdown__pulse"
              data-testid="refresh-active-indicator"
              aria-live="polite"
              aria-label="Auto-refresh active"
            />
          ) : null}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="cmc-dropdown-menu"
          align="end"
          sideOffset={6}
        >
          {INTERVALS.map((i) => (
            <DropdownMenu.Item
              key={i.value}
              data-testid={`refresh-option-${i.value}`}
              onSelect={() => choose(i.value)}
              className="cmc-dropdown-menu__item"
            >
              {i.value === interval ? '✓ ' : ''}
              {i.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
