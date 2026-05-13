// useRouteRange — Phase 26 Plan 08 (TIME-02 bridge consumer).
//
// Per-route adoption helper for time-anchored panels. Reads `time_from` /
// `time_to` from the URL via TanStack Router's useRouterState, coerces via
// rangeToVocab() to the existing backend `Range` vocab ('today' | '7d' | '30d'),
// and falls back to the per-route default WHEN the URL has no time params.
//
// CALL SITE PATTERN (verbatim — Plan 08 spec):
//
//   const [localRange, setLocalRange] = useState<Range | null>(null)
//   const globalRange = useRouteRange('today') // or '7d', '30d'
//   const effectiveRange = localRange ?? globalRange
//   const query = useTokens(effectiveRange)
//
// LOCAL OVERRIDE PRECEDENCE — once the user clicks the panel's local
// RangeToggle, `localRange` is set and wins over the URL-derived value.
// Reset-to-global is intentionally deferred (v1 trade-off — Plan 08 §Step C).
//
// WHY HERE (not in panels/ or in the validator):
//   - Pitfall 13 lock: per-route defaults must be applied at PANEL READ SITE,
//     NEVER inside validateSearch — defaulting in the validator defeats the
//     DefaultViewLoader bare-URL gate (Phase 25 lock).
//   - Centralising the read-site snippet keeps the 9 panel adoptions on /
//     and /activity uniform; a future change to the URL→vocab pipeline
//     touches one file instead of nine.
//
// WHY NOT GENERIC <Range> param: the helper is GENERIC in its return type but
// the default fallback must be a typed Range (the backend's closed-set vocab).
// Casting via `as Range` would shadow type errors; instead the caller passes
// the per-route default explicitly and we constrain the return type.

import { useRouterState } from '@tanstack/react-router'
import { rangeToVocab } from './rangeToVocab'
import type { Range } from '../api'

export function useRouteRange(routeDefault: Range): Range {
  const location = useRouterState({ select: (s) => s.location })
  const search = (location.search ?? {}) as Record<string, unknown>
  const timeFrom = typeof search.time_from === 'string' ? search.time_from : undefined
  const timeTo = typeof search.time_to === 'string' ? search.time_to : undefined
  if (!timeFrom || !timeTo) return routeDefault
  return rangeToVocab({ from: timeFrom, to: timeTo })
}
