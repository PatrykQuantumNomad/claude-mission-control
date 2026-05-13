// frontend/src/lib/time/coerce.ts — Phase 26 Plan 01 (TIME-01).
//
// Convert a Grafana token (parseGrafanaToken) OR an ISO-8601 absolute
// timestamp into a JS Date. Used by:
//   - TimePicker preview ("Last 7 days" → '2026-05-05 → 2026-05-12')
//   - ChartBrushController (commit absolute timestamps on drag end)
//   - validateSearch coerce path (clipboard paste validates input)
//   - rangeToVocab (compute the time window in ms for best-fit bucketing)
//
// date-fns is used for DST-correct boundary math. Hand-rolled
// Date.getTime() arithmetic works for `now-Nu` but is brittle for `now/u`
// (start of local day/week/month — DST transitions break naive maths).
//
// Bound: amounts > 5 years' worth of the unit are rejected to defuse the
// `now+9999999999d` DoS pattern enumerated in RESEARCH §"Security Domain".

import {
  addSeconds,
  addMinutes,
  addHours,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
} from 'date-fns'
import { parseGrafanaToken } from './grafanaSyntax'

const ADDERS = {
  s: addSeconds,
  m: addMinutes,
  h: addHours,
  d: addDays,
  w: addWeeks,
  M: addMonths,
  y: addYears,
} as const

const STARTS = {
  d: startOfDay,
  w: startOfWeek,
  M: startOfMonth,
  y: startOfYear,
} as const

// 5 years' worth of the smallest unit — bound the amount to defuse DoS.
const MAX_AMOUNT_BY_UNIT = {
  s: 5 * 365 * 86400,
  m: 5 * 365 * 1440,
  h: 5 * 365 * 24,
  d: 5 * 365,
  w: 5 * 52,
  M: 5 * 12,
  y: 5,
} as const

const ISO_RE = /^\d{4}-\d{2}-\d{2}T/

export function coerceToAbsolute(token: string, ref: Date = new Date()): Date | null {
  if (ISO_RE.test(token)) {
    const d = new Date(token)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const parsed = parseGrafanaToken(token)
  if (!parsed) return null
  let d = ref
  if (parsed.unit && parsed.amount > 0) {
    if (parsed.amount > MAX_AMOUNT_BY_UNIT[parsed.unit]) return null
    d = ADDERS[parsed.unit](d, parsed.sign * parsed.amount)
  }
  if (parsed.snap) {
    d = STARTS[parsed.snap](d)
  }
  return d
}
