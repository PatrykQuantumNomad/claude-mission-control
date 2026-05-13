// AutoRefreshController — Phase 26 Plan 03 (TIME-01).
//
// Zero-render effect: subscribes to the cmc.autoRefresh.interval localStorage
// key + URL absolute-window state. On each tick, calls
// queryClient.invalidateQueries({ predicate: matchTimeAnchoredKey }).
//
// Pause logic: when time_from is absolute (ISO_RE.test(token)), the
// brush-zoom has committed a frozen window — auto-refresh is meaningless
// in this state. Effect skips invalidation but the interval handle stays
// alive (we don't tear down so the user can resume by clearing the zoom).
//
// Storage subscription: listens to 'storage' events (for cross-tab consistency)
// AND a custom 'cmc:auto-refresh-changed' event (RefreshDropdown emits this
// on choose() — same-tab updates).

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { isTimeAnchoredKey } from '../../lib/queries'

const KEY = 'cmc.autoRefresh.interval'

function readIntervalMs(): number {
  if (typeof window === 'undefined') return 0
  try {
    const v = window.localStorage.getItem(KEY)
    if (v === '30s') return 30_000
    if (v === '1m') return 60_000
    if (v === '5m') return 300_000
    return 0
  } catch {
    return 0
  }
}

function isAbsolute(token: string | undefined): boolean {
  return typeof token === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(token)
}

export function AutoRefreshController() {
  const queryClient = useQueryClient()
  const location = useRouterState({ select: (s) => s.location })
  const search = (location.search ?? {}) as Record<string, unknown>
  const timeFrom = typeof search.time_from === 'string' ? search.time_from : undefined

  // Re-fires the effect when the interval-changed event lands. Using a tick
  // counter keeps the dep list explicit (no stale closures).
  const [tick, setTick] = useState(0)
  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    window.addEventListener('storage', bump)
    window.addEventListener('cmc:auto-refresh-changed', bump)
    return () => {
      window.removeEventListener('storage', bump)
      window.removeEventListener('cmc:auto-refresh-changed', bump)
    }
  }, [])

  useEffect(() => {
    const ms = readIntervalMs()
    const paused = isAbsolute(timeFrom)
    if (ms === 0 || paused) return

    const handle = window.setInterval(() => {
      queryClient.invalidateQueries({
        predicate: (q) => isTimeAnchoredKey(q.queryKey),
      })
    }, ms)

    return () => {
      window.clearInterval(handle)
    }
  }, [timeFrom, queryClient, tick])

  return null
}
