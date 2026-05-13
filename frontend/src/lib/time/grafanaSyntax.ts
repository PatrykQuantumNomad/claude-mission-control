// frontend/src/lib/time/grafanaSyntax.ts — Phase 26 Plan 01 (TIME-01).
//
// Pure regex parser for Grafana-style relative time tokens. The vocab is
// fixed and small: `now`, `now-Nu`, `now/u`, `now-Nu/u` where u is the
// time unit (s|m|h|d|w|M|y). Anchored regex — no catastrophic backtracking
// (RESEARCH §"Security Domain", line "Time-token regex DoS").
//
// Output is the parsed STRUCTURE only — date arithmetic lives in coerce.ts
// (which depends on date-fns for DST-correct day/week/month boundaries).
//
// EXAMPLES (verified by tests):
//   parseGrafanaToken('now')        → { sign: 1, amount: 0, unit: null, snap: null }
//   parseGrafanaToken('now-7d')     → { sign: -1, amount: 7, unit: 'd', snap: null }
//   parseGrafanaToken('now+1h')     → { sign: 1, amount: 1, unit: 'h', snap: null }
//   parseGrafanaToken('now/d')      → { sign: 1, amount: 0, unit: null, snap: 'd' }
//   parseGrafanaToken('now-1d/d')   → { sign: -1, amount: 1, unit: 'd', snap: 'd' }
//   parseGrafanaToken('bogus')      → null

const TOKEN_RE = /^now(?:([-+])(\d+)([smhdwMy]))?(?:\/([dwMy]))?$/

export interface ParsedToken {
  sign: -1 | 1
  amount: number
  unit: 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'y' | null
  snap: 'd' | 'w' | 'M' | 'y' | null
}

export function parseGrafanaToken(t: string): ParsedToken | null {
  if (t === 'now') return { sign: 1, amount: 0, unit: null, snap: null }
  const m = TOKEN_RE.exec(t)
  if (!m) return null
  const [, signRaw, amountRaw, unitRaw, snapRaw] = m
  return {
    sign: signRaw === '-' ? -1 : 1,
    amount: amountRaw ? Number(amountRaw) : 0,
    unit: (unitRaw as ParsedToken['unit']) ?? null,
    snap: (snapRaw as ParsedToken['snap']) ?? null,
  }
}
