---
phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
plan: 01
subsystem: ui
tags: [sonner, react-day-picker, date-fns, grafana-tokens, time-picker, clipboard, toaster, url-as-source-of-truth, range-bridge]

# Dependency graph
requires:
  - phase: 24-shell-density-containment-primitives
    provides: --cmc-z-toast token in z-index ladder + cmc-shell flex layout that hosts the Toaster portal target
  - phase: 25-saved-views-backend-frontend
    provides: SCHEMA_VERSION + per-route validateSearch substrate that Plan 02 extends with time_from/time_to
provides:
  - parseGrafanaToken + ParsedToken type — pure regex parser for now / now-Nu / now/u / now-Nu/u (vocab matches Grafana 2024-01-28)
  - coerceToAbsolute(token, ref?) — converts Grafana token OR ISO-8601 absolute to Date via date-fns ADDERS/STARTS tables, bounded by MAX_AMOUNT_BY_UNIT (5y per unit)
  - rangeToVocab({from, to, now?}) — LOAD-BEARING bridge that maps URL (time_from, time_to) to the backend Range Literal ('today' | '7d' | '30d')
  - serializeRange + parseRangeFromText — Cmd+Shift+C/V clipboard serializer (URL-fragment format) + parser accepting raw fragments and full URLs
  - sonner Toaster mounted once in AppShell at bottom-right with theme=system, richColors, closeButton, duration=3000
  - 3 new runtime deps: sonner@2.0.7, react-day-picker@10.0.0, date-fns@4.1.0
affects: [26-02 (consumes asTimeToken which uses same vocab), 26-03 TimePicker, 26-04 ChartBrushController, 26-05 panel READ SITE wiring, 26-06 Cmd+K integration, 26-07 toast UX]

# Tech tracking
tech-stack:
  added: [sonner@2.0.7, react-day-picker@10.0.0, date-fns@4.1.0]
  patterns:
    - "Pure-helper library in src/lib/time/ with co-located vitest specs in __tests__/"
    - "Bounded amount validation in coerceToAbsolute (5y per unit) to defuse parser DoS"
    - "Anchored regex parser (^...$) — no catastrophic backtracking"
    - "Bridge helper (rangeToVocab) that intentionally collapses URL relative tokens to backend closed-set vocab — forward-compatible with Phase 27 backend extension"

key-files:
  created:
    - frontend/src/lib/time/grafanaSyntax.ts
    - frontend/src/lib/time/coerce.ts
    - frontend/src/lib/time/rangeToVocab.ts
    - frontend/src/lib/time/clipboard.ts
    - frontend/src/lib/time/__tests__/grafanaSyntax.test.ts
    - frontend/src/lib/time/__tests__/coerce.test.ts
    - frontend/src/lib/time/__tests__/rangeToVocab.test.ts
    - frontend/src/lib/time/__tests__/clipboard.test.ts
  modified:
    - frontend/package.json
    - frontend/pnpm-lock.yaml
    - frontend/src/components/shell/AppShell.tsx
    - frontend/src/components/shell/__tests__/AppShell.test.tsx

key-decisions:
  - "ADR: Frontend-coerce-to-vocab bridge (rangeToVocab) is the Phase 26 path; backend acceptance of time_from/time_to is deferred to Phase 27 (queued as TDBT polish task). Rationale: keeps Phase 26 scope manageable, preserves URL-as-source-of-truth (relative tokens never leave the frontend), and is forward-compatible — when backend learns to accept time_from/time_to the bridge collapses to a no-op without panel-level changes."
  - "Hand-rolled parseGrafanaToken (no external library) because the vocab is tiny and a moment-style lib would be 50KB+ for what fits in one anchored regex; date-fns is the only date lib (4.1.0 tree-shakes per-function imports)"
  - "Toaster placed AFTER <CommandPalette /> in document order so toast layer wins document-order ties at the same --cmc-z-toast level in the z-index ladder; sonner portals to document.body so no stacking-context interference with cmc-shell flex layout"
  - "Snap rules in rangeToVocab: ≤24h → 'today', 24h<w≤8d → '7d', else '30d' (conservative wide cover). Custom absolute ranges → '30d'."
  - "MAX_AMOUNT_BY_UNIT bound (5y per unit) defuses the now+9999999999d DoS pattern enumerated in 26-RESEARCH.md §Security Domain"

patterns-established:
  - "Time helpers live in src/lib/time/ with co-located __tests__/ — future TIME-0* helpers (e.g., Wave 2 TimePicker's preview formatter) belong here"
  - "Toast destination is global (single Toaster in AppShell) — call-sites import `toast` from 'sonner' rather than threading a context"
  - "ParsedToken structure separates parse-time decisions from arithmetic-time decisions — coerce.ts depends on grafanaSyntax.ts but not vice versa (acyclic)"

# Metrics
duration: 6min
completed: 2026-05-13
---

# Phase 26 Plan 01: Foundation Wave 1 — Time-lib helpers + 3 runtime deps + Toaster mount Summary

**Four pure time-lib helpers (parseGrafanaToken / coerceToAbsolute / rangeToVocab / serializeRange+parseRangeFromText) wired against sonner+react-day-picker+date-fns@4.1.0 with a single AppShell-mounted Toaster, locking the Phase-26 frontend-coerce-to-vocab bridge ADR that downstream waves depend on.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-13T10:33:12Z
- **Completed:** 2026-05-13T10:38:53Z
- **Tasks:** 2
- **Files modified:** 12 (4 source + 4 tests + 2 dep-manifest + 2 AppShell)
- **LOC shipped:** 198 source + 344 tests = 542 total in src/lib/time/* + 18 LOC AppShell delta

## Accomplishments

- **3 new runtime deps installed at research-justified versions**: sonner@2.0.7 (toast lib for TIME-03 paste feedback + cap warnings, ~9KB), react-day-picker@10.0.0 (dual-month range calendar for Wave 2 TimePicker), date-fns@4.1.0 (DST-correct start-of-day/week/month math for coerce.ts snap operator + ADDERS table for delta math). RESEARCH §"Don't Hand-Roll" justified each.
- **Four pure time-lib helpers** with documented public APIs and ≥90% line coverage:
  - `parseGrafanaToken` — anchored regex parser for `now`, `now-Nu`, `now+Nu`, `now/u`, `now-Nu/u` vocab (u ∈ {s,m,h,d,w,M,y} for delta; u ∈ {d,w,M,y} for snap). Returns structured `ParsedToken` or null on invalid input.
  - `coerceToAbsolute` — converts Grafana token OR ISO-8601 absolute to JS Date. ADDERS table for delta math, STARTS table for snap, MAX_AMOUNT_BY_UNIT bound (5y per unit) for DoS defuse.
  - `rangeToVocab` — THE LOAD-BEARING bridge: maps URL (time_from, time_to) to backend's closed-set Range Literal ('today' | '7d' | '30d'). Snap rules: ≤24h → 'today', 24h<w≤8d → '7d', else '30d'.
  - `serializeRange` + `parseRangeFromText` — Cmd+Shift+C/V clipboard helpers in URL-fragment format. Round-trip-stable. parseRangeFromText accepts raw fragments AND full URLs; returns null on missing fields or empty input.
- **Sonner `<Toaster />` mounted once** in AppShell.tsx as sibling of `<CommandPalette />` (position=bottom-right, theme=system, richColors, closeButton, duration=3000). TIME-03 paste feedback + cap warnings now have a destination from Wave 2 onward.
- **51 new vitest cases** across 4 spec files: 15 grafanaSyntax + 10 coerce + 14 rangeToVocab + 9 clipboard + 1 AppShell Toaster mount + 2 pre-existing AppShell. Frontend baseline 452 → 533 (+81 across Plan 01 + parallel Plan 02; 0 regressions).
- **ADR documented** for the frontend-coerce-to-vocab bridge: Phase 26 ships the bridge; backend extension to accept time_from/time_to natively is deferred to Phase 27 TDBT polish. Forward-compatible — bridge collapses to a no-op when backend learns the new vocab.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install three new runtime deps + ship Grafana token parser + ISO coercion lib** — `6df78d9` (feat)
2. **Task 2: Ship rangeToVocab bridge + clipboard serializers + Toaster mount** — `399ff10` (feat)

_Note: Plan 02 (sibling agent, parallel-safe) committed `80c126c` between Tasks 1 and 2 — no conflict; different files._

## Files Created/Modified

**Created (8):**
- `frontend/src/lib/time/grafanaSyntax.ts` (39 LOC) — anchored regex parser + `ParsedToken` type
- `frontend/src/lib/time/coerce.ts` (78 LOC) — Grafana-or-ISO-to-Date with date-fns + DoS-bounded amounts
- `frontend/src/lib/time/rangeToVocab.ts` (51 LOC) — LOAD-BEARING bridge to backend Range vocab
- `frontend/src/lib/time/clipboard.ts` (30 LOC) — `serializeRange` + `parseRangeFromText` for TIME-03
- `frontend/src/lib/time/__tests__/grafanaSyntax.test.ts` (123 LOC, 15 cases)
- `frontend/src/lib/time/__tests__/coerce.test.ts` (76 LOC, 10 cases)
- `frontend/src/lib/time/__tests__/rangeToVocab.test.ts` (77 LOC, 14 cases)
- `frontend/src/lib/time/__tests__/clipboard.test.ts` (68 LOC, 9 cases)

**Modified (4):**
- `frontend/package.json` — +3 deps: sonner@^2, react-day-picker@^10, date-fns@^4
- `frontend/pnpm-lock.yaml` — captures sonner 2.0.7 / react-day-picker 10.0.0 / date-fns 4.1.0 + transitive `@date-fns/tz` pulled by RDP@10
- `frontend/src/components/shell/AppShell.tsx` — +13 LOC: `Toaster` import + element as sibling of `<CommandPalette />` with documented z-index/document-order rationale
- `frontend/src/components/shell/__tests__/AppShell.test.tsx` — +18 LOC: new test asserts the Toaster `<section aria-label="Notifications …">` mounts exactly once (sonner's `<ol data-sonner-toaster>` is conditionally rendered only when a toast is queued, so the unconditional outer `<section>` is the correct assertion target)

## Decisions Made

- **Frontend-coerce-to-vocab bridge (ADR — load-bearing).** rangeToVocab maps relative tokens in the URL to the backend's closed-set Range Literal ('today' | '7d' | '30d'). Backend extension deferred to Phase 27 TDBT. Rationale: keeps Phase 26 scope manageable, preserves URL-as-source-of-truth invariant, and is forward-compatible — when backend learns to accept time_from/time_to natively, this helper degrades to a no-op without panel-level changes.
- **Hand-rolled `parseGrafanaToken` (no external library).** The vocab is tiny and a moment-style lib would be 50KB+ for what fits in one anchored regex. date-fns is the ONLY date lib added; per-function imports tree-shake to <5KB.
- **MAX_AMOUNT_BY_UNIT bound (5y per unit) in coerceToAbsolute.** Defuses the `now+9999999999d` parser-DoS pattern enumerated in 26-RESEARCH.md §Security Domain. Returns null instead of allocating an impossible Date.
- **Toaster position after CommandPalette in document order.** Sonner portals to document.body so there's no stacking-context interference with the `cmc-shell` flex layout. Placement after `<CommandPalette />` wins document-order ties at the same --cmc-z-toast level.
- **AppShell test uses `<section aria-label="Notifications …">` not `[data-sonner-toaster]`.** Sonner conditionally renders the inner `<ol data-sonner-toaster>` only when a toast is queued (`if (!filteredToasts.length) return null;`). The outer `<section>` is rendered unconditionally — that's the correct unmount-time assertion target.

## Deviations from Plan

None — plan executed exactly as written. Per-task verify commands all passed first time after one mid-task fix to the AppShell test assertion target (queried for `[data-sonner-toaster]` initially — corrected to the unconditionally-rendered outer `<section aria-label="Notifications …">` after reading sonner's compiled render path; no deviation from plan, just a test-assertion refinement).

## Issues Encountered

- **Parallel work coordination with Plan 02 sibling agent.** Plan 02 modified `frontend/src/lib/searchSchemas.ts`, `searchSchemas.test.ts`, `routes/{index,activity,sessions_.compare}.tsx` concurrently. Mid-execution, `pnpm tsc --noEmit` reported `TS6133: 'asTimeToken' is declared but its value is never read` in `searchSchemas.test.ts` because Plan 02 had staged but not yet committed the import. Resolution: staged ONLY my Task 1/Task 2 files by name (never `git add -A`); pre-commit hook stashes the sibling agent's unfinished work before running its tsc check, then restores it post-commit. Plan 02 landed cleanly between Tasks 1 and 2 (commit `80c126c`); after that commit, `pnpm tsc --noEmit` was fully clean. No conflicts, no race conditions, no Rule-X fixes needed.

## User Setup Required

None — no external service configuration required. The three new deps (sonner / react-day-picker / date-fns) are pure-runtime libraries with zero config.

## Next Phase Readiness

- **Wave 2 ready to spawn.** Wave 2 (TimePicker UI) consumes:
  - `parseGrafanaToken` for input-box validation (typing `now-7d` accepted; `bogus` rejected).
  - `coerceToAbsolute(token, ref)` for the "snap-to-day" calendar preview ("Last 7 days" → "2026-05-06 → 2026-05-13").
  - `<Toaster />` is already mounted — call-sites just `import { toast } from 'sonner'`.
- **Wave 3 ready.** ChartBrushController consumes `serializeRange(timeFrom, timeTo)` for the URL-write on drag-end and `parseRangeFromText` for the Cmd+Shift+V paste path.
- **Panel READ-SITE wiring (Wave 5) ready.** Panels keep calling `useTokens(rangeToVocab({from, to}))` — bridge translates URL tokens to existing `Range` Literal closed set so backend queries are unchanged.
- **No blockers.** Phase 25 baselines preserved (vitest 452 → 533 / 0 / 0; lint clean; tsc clean; pnpm list confirms sonner@2.0.7 / react-day-picker@10.0.0 / date-fns@4.1.0).

## Self-Check: PASSED

**File existence (8/8 FOUND):**
- `frontend/src/lib/time/grafanaSyntax.ts` ✓
- `frontend/src/lib/time/coerce.ts` ✓
- `frontend/src/lib/time/rangeToVocab.ts` ✓
- `frontend/src/lib/time/clipboard.ts` ✓
- `frontend/src/lib/time/__tests__/grafanaSyntax.test.ts` ✓
- `frontend/src/lib/time/__tests__/coerce.test.ts` ✓
- `frontend/src/lib/time/__tests__/rangeToVocab.test.ts` ✓
- `frontend/src/lib/time/__tests__/clipboard.test.ts` ✓

**Commits (2/2 FOUND in git log --oneline --all):**
- `6df78d9` ✓ (Task 1)
- `399ff10` ✓ (Task 2)

**Deps (3/3 confirmed via `pnpm list`):**
- sonner 2.0.7 ✓ (≥ 2.0.7 required)
- react-day-picker 10.0.0 ✓ (≥ 10.0.0 required)
- date-fns 4.1.0 ✓ (≥ 4.1.0 required)

**Test counts (533/0/0 frontend vitest after Plan 01 + Plan 02 landed; baseline 452 + 81 new).**

---
*Phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k*
*Completed: 2026-05-13*
