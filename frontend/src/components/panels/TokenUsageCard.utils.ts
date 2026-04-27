// Pure helper for TokenUsageCard — collapses per-(day, model, source) rows
// from /api/usage/tokens into a per-day summary keyed by token TYPE
// (input/output/cache_read/cache_create). Model/source-axis stacking is a v2
// affordance per 06-RESEARCH; v1 stacks token types only.

import type { TokenUsageDailyRow } from '../../lib/api'

export interface DailyTokenBuckets {
  day: string
  input: number
  output: number
  cache_read: number
  cache_create: number
}

export function groupTokensByDay(items: TokenUsageDailyRow[]): DailyTokenBuckets[] {
  const map = new Map<string, DailyTokenBuckets>()
  for (const row of items) {
    const existing = map.get(row.day) ?? {
      day: row.day,
      input: 0,
      output: 0,
      cache_read: 0,
      cache_create: 0,
    }
    existing.input += row.tokens_input
    existing.output += row.tokens_output
    existing.cache_read += row.tokens_cache_read
    existing.cache_create += row.tokens_cache_create
    map.set(row.day, existing)
  }
  return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day))
}
