// frontend/src/lib/time/clipboard.ts — Phase 26 Plan 01 (TIME-03).
//
// serializeRange(timeFrom, timeTo): URL-fragment-shaped string. Format
// chosen for legibility in Slack / GitHub issues paste (CONTEXT decision:
// "human-readable clipboard format").
//
// parseRangeFromText(text): accepts both a raw fragment ('?time_from=...&time_to=...')
// AND a full URL containing the fragment ('https://cmc.local/activity?time_from=...').
// Returns null on missing fields or malformed input.

export function serializeRange(timeFrom: string, timeTo: string): string {
  const params = new URLSearchParams({ time_from: timeFrom, time_to: timeTo })
  return `?${params.toString()}`
}

export function parseRangeFromText(
  text: string,
): { time_from: string; time_to: string } | null {
  const idx = text.indexOf('?')
  if (idx < 0) return null
  try {
    const params = new URLSearchParams(text.slice(idx + 1))
    const f = params.get('time_from')
    const t = params.get('time_to')
    if (!f || !t) return null
    return { time_from: f, time_to: t }
  } catch {
    return null
  }
}
