// frontend/src/lib/time/useRouteRangeVocab.ts — Phase 27 Plan 01.
//
// Vocab-parameterized expansion of Phase 26's useRouteRange. Returns a value
// from the caller-supplied vocab V, snapped from the URL's time_from/time_to
// window OR falling back to routeDefault.
//
// PHASE 26 useRouteRange STAYS UNCHANGED — this is an additive hook, not a
// refactor. The 9 Phase 26 call sites on / and /activity keep their narrow
// Range vocab.
//
// RESEARCH Pitfall 1: SkillRange / CostRange / AlertRange are NOT subsets
// of Range. Each tail-end route's panel hook signature uses a different
// closed-set Literal. This hook + the three pre-baked snappers below let
// adoption plans 27-04 / 27-05 / 27-06 wire the global time picker into
// panels without TS errors or silent runtime fallbacks.
//
// CONTRACT: returns routeDefault when EITHER time_from or time_to is missing
// or fails parsing — asymmetric coverage (one valid + one invalid does NOT
// silently degrade to a partial window).

import { useRouterState } from '@tanstack/react-router'
import { coerceToAbsolute } from './coerce'
import type { Range, SkillRange, CostRange, AlertRange } from '../api'

const HOUR_MS = 3_600_000

export function useRouteRangeVocab<V extends string>(
  routeDefault: V,
  snap: (windowHours: number) => V,
): V {
  const location = useRouterState({ select: (s) => s.location })
  const search = (location.search ?? {}) as Record<string, unknown>
  const timeFrom = typeof search.time_from === 'string' ? search.time_from : undefined
  const timeTo = typeof search.time_to === 'string' ? search.time_to : undefined
  if (!timeFrom || !timeTo) return routeDefault
  const fromDate = coerceToAbsolute(timeFrom)
  const toDate = coerceToAbsolute(timeTo)
  if (!fromDate || !toDate) return routeDefault
  const windowHours = (toDate.getTime() - fromDate.getTime()) / HOUR_MS
  if (windowHours <= 0) return routeDefault
  return snap(windowHours)
}

// ---- Pre-baked snappers — one per tail-end-route vocab ---------------------

/** Backend SkillRange Literal = '14d' | '30d'. ≤21 days → 14d, else 30d. */
export function snapToSkillRange(h: number): SkillRange {
  return h <= 24 * 21 ? '14d' : '30d'
}

/** CostRange = '1d' | '7d' | '14d' | '30d'. */
export function snapToCostRange(h: number): CostRange {
  if (h <= 24 * 2) return '1d'
  if (h <= 24 * 8) return '7d'
  if (h <= 24 * 21) return '14d'
  return '30d'
}

/** AlertRange = '1d' | '7d' | '14d' | '30d' (identical bands to CostRange). */
export function snapToAlertRange(h: number): AlertRange {
  if (h <= 24 * 2) return '1d'
  if (h <= 24 * 8) return '7d'
  if (h <= 24 * 21) return '14d'
  return '30d'
}

/** Mirror of Phase 26's Range vocab snap — re-exported for callers that
 *  want the generic form. Phase 26's useRouteRange is unchanged. */
export function snapToRange(h: number): Range {
  if (h <= 24) return 'today'
  if (h <= 24 * 8) return '7d'
  return '30d'
}
