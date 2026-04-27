// Phase 7 Plan 01 (Wave 0) — pure helpers for the ScheduleComposer Wave 2
// will land. partsToCron renders a 5-field POSIX cron from a discrete
// {minute, hour, days[]} composer state; prettyCron wraps cronstrue so the
// Composer can render a human-readable preview without try/catch noise at
// the call site.
//
// Pitfall 12 (RESEARCH §): cronstrue defaults assume Mon=1 / Sun=0 (matches
// croniter's `standard` mode used by backend SCHD-* validation), so we do
// NOT toggle `dayOfWeekStartIndexZero`. Toggling it would create a frontend
// cron string that backend croniter rejects.
//
// Canonical form rule: empty `days` and the full 7-day set BOTH render as `*`
// in the day-of-week field. Anything else is sorted ascending and joined by
// commas. This keeps the wire shape stable across the Composer's "every day"
// toggle and a 7/7 manual selection.

import cronstrue from 'cronstrue'

export function partsToCron({
  minute,
  hour,
  days,
}: {
  minute: number
  hour: number
  days: ReadonlyArray<0 | 1 | 2 | 3 | 4 | 5 | 6>
}): string {
  const dow =
    days.length === 0 || days.length === 7
      ? '*'
      : [...days].sort((a, b) => a - b).join(',')
  return `${minute} ${hour} * * ${dow}`
}

export function prettyCron(
  cron: string,
): { ok: true; text: string } | { ok: false; error: string } {
  try {
    const text = cronstrue.toString(cron, {
      throwExceptionOnParseError: true,
      use24HourTimeFormat: true,
    })
    return { ok: true, text }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid cron' }
  }
}
