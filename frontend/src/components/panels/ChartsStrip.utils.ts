// Pure helper for ChartsStrip — slices /api/usage/tokens?range=30d down to
// the most recent 14 distinct days, preserving stack segments. Backend
// observability.py Range Literal does not accept '14d' (06-design notes)
// so the panel overfetches 30d and slices client-side.
//
// Reuses the same per-day collapse shape as TokenUsageCard (input / output /
// cache_read / cache_create). Multi-axis stacking on (model, source) is a
// v2 affordance.

import type { TokenUsageDailyRow } from '../../lib/api'
import type { DailyTokenBuckets } from './TokenUsageCard.utils'
import { groupTokensByDay } from './TokenUsageCard.utils'

/**
 * Group rows by day, then keep only the last 14 distinct days
 * (lexicographic / ISO date order). If fewer than 14 days exist in the
 * payload, returns all of them.
 */
export function sliceLast14Days(items: TokenUsageDailyRow[]): DailyTokenBuckets[] {
  const grouped = groupTokensByDay(items)
  if (grouped.length <= 14) return grouped
  return grouped.slice(grouped.length - 14)
}
