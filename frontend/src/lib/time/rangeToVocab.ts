// frontend/src/lib/time/rangeToVocab.ts — Phase 26 Plan 01 (TIME-01).
//
// LOAD-BEARING BRIDGE. Maps a URL-form (time_from, time_to) to the closest
// backend `Range` Literal ('today' | '7d' | '30d'). The backend today
// accepts ONLY this closed-set vocab (verified: backend/cmc/api/routes/
// alerts.py:267, sessions.py:262, skills.py:91 — Pydantic `Literal[...]`).
// Frontend coerces relative tokens to absolute via date-fns, then snaps to
// the closest vocab bucket.
//
// This is an INTENTIONAL Phase 26 limitation (RESEARCH §"Bridge strategy",
// Pitfall 1, ADR in 26-01-PLAN.md objective). When backend learns
// time_from/time_to (Phase 27 TDBT), this helper degrades to a no-op:
// callers stop using it.
//
// Snap rules (windows in HOURS):
//   - window ≤ 24h        → 'today'
//   - 24h < window ≤ 8d   → '7d'
//   - 8d < window         → '30d' (conservative wide cover)
//
// Custom absolute ranges (brush-zoom commits) → '30d' (widest cover; the
// panel still gets the full dataset and the chart already slices to the
// brushed window client-side).

import { coerceToAbsolute } from './coerce'
import type { Range } from '../api'

const HOUR_MS = 3600 * 1000

export function rangeToVocab({
  from,
  to,
  now = new Date(),
}: {
  from: string | undefined
  to: string | undefined
  now?: Date
}): Range {
  // Default when URL has neither — caller decides per-route default.
  if (!from || !to) return '7d'

  const fromDate = coerceToAbsolute(from, now)
  const toDate = coerceToAbsolute(to, now)
  if (!fromDate || !toDate) return '7d'

  const windowMs = toDate.getTime() - fromDate.getTime()
  const windowHours = windowMs / HOUR_MS

  if (windowHours <= 24) return 'today'
  if (windowHours <= 24 * 8) return '7d'
  return '30d'
}
