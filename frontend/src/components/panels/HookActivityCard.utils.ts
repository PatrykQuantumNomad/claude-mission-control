// Pure helper for HookActivityCard — pivots /api/hooks/activity rows from
// long form (one row per (day, hook_name)) into wide form (one row per day,
// hook_name keys hold counts) suitable for a stacked Recharts BarChart.

import type { HookActivityRow } from '../../lib/api'

export interface PivotedHookDay {
  day: string
  // Indexer for hook_name -> fires count.
  [hookName: string]: number | string
}

export function pivotHooksByDay(items: HookActivityRow[]): {
  rows: PivotedHookDay[]
  hookNames: string[]
} {
  const dayMap = new Map<string, PivotedHookDay>()
  const hookSet = new Set<string>()
  for (const row of items) {
    hookSet.add(row.hook_name)
    const existing = dayMap.get(row.day) ?? ({ day: row.day } as PivotedHookDay)
    existing[row.hook_name] = ((existing[row.hook_name] as number | undefined) ?? 0) + row.fires
    dayMap.set(row.day, existing)
  }
  const rows = Array.from(dayMap.values()).sort((a, b) =>
    String(a.day).localeCompare(String(b.day)),
  )
  const hookNames = Array.from(hookSet).sort()
  return { rows, hookNames }
}

/**
 * Aggregates p50 paired duration per hook_name across all days. Returns the
 * mean p50 (sample-size-weighted by fires) so a hook fired 100× on day1 and
 * 1× on day2 is dominated by day1's p50 — matches operator intuition.
 */
export interface HookP50Summary {
  hook_name: string
  p50_ms: number | null
}

export function aggregateP50ByHook(items: HookActivityRow[]): HookP50Summary[] {
  const acc = new Map<string, { weighted: number; total: number }>()
  for (const row of items) {
    if (row.paired_duration_ms_p50 === null) continue
    const existing = acc.get(row.hook_name) ?? { weighted: 0, total: 0 }
    existing.weighted += row.paired_duration_ms_p50 * row.fires
    existing.total += row.fires
    acc.set(row.hook_name, existing)
  }
  const out: HookP50Summary[] = []
  for (const [hook_name, { weighted, total }] of acc) {
    out.push({ hook_name, p50_ms: total > 0 ? Math.round(weighted / total) : null })
  }
  return out.sort((a, b) => a.hook_name.localeCompare(b.hook_name))
}

// Reusable token-palette indices for stacking up to 5 hook names without
// inline hex literals. Falls back to --cmc-text-dim past index 4.
export const HOOK_PALETTE: string[] = [
  'var(--cmc-accent-blue)',
  'var(--cmc-accent-purple)',
  'var(--cmc-status-cyan)',
  'var(--cmc-status-green)',
  'var(--cmc-status-amber)',
]

export function colorForHook(idx: number): string {
  return HOOK_PALETTE[idx] ?? 'var(--cmc-text-dim)'
}
