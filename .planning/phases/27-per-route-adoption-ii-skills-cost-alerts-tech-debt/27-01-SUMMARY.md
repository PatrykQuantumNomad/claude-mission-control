---
phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
plan: 01
subsystem: time
tags: [react, tanstack-router, vitest, type-safety, vocab-bridge, time-picker]

# Dependency graph
requires:
  - phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
    provides: "useRouteRange URL→Range bridge + coerceToAbsolute + Range/SkillRange/CostRange/AlertRange Literal types (lib/api.ts)"
provides:
  - "useRouteRangeVocab<V> generic URL→Vocab bridge hook"
  - "snapToSkillRange / snapToCostRange / snapToAlertRange pre-baked vocab snappers"
  - "snapToRange — Phase 26 vocab mirror in the generic form"
affects:
  - 27-04-skills-panels
  - 27-05-cost-by-project
  - 27-06-alert-events
  - 27-09-close-gate

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vocab-parameterized hook: generic <V extends string> + caller-supplied snap fn maps URL window hours to a closed-set Literal"
    - "Asymmetric URL coverage: missing OR unparseable EITHER side → routeDefault (no silent partial-window fallback)"
    - "Pure snap helpers exported next to the hook — adoption plans import the hook + snapper from one module"

key-files:
  created:
    - "frontend/src/lib/time/useRouteRangeVocab.ts (73 LOC) — generic hook + 4 snappers"
    - "frontend/src/lib/time/__tests__/useRouteRangeVocab.test.ts (211 LOC) — 31 vitest cases"
  modified: []

key-decisions:
  - "Additive expansion, not refactor — Phase 26 useRouteRange.ts stays UNCHANGED (zero-refactor invariant verified via empty git diff --stat)"
  - "Inverted/zero-window guard (windowHours <= 0 → routeDefault) — defends against future paste-clipboard edge cases the validateSearch coercer might let through"
  - "Snap helpers live in the SAME module as the hook (not split) — adoption plans consume {useRouteRangeVocab, snapToCostRange} from one import, matching the Phase 26 ergonomic of useRouteRange next to rangeToVocab"
  - "Re-exported snapToRange in the generic form even though Phase 26's useRouteRange is preserved verbatim — Phase 28+ callers wanting the generic + Range vocab combo don't need to thread two hooks"

patterns-established:
  - "Pure snappers exhaustively covered at band boundaries via (h, h+1) pairs — proves edge inclusivity without ambiguity"
  - "Module-level vi.mock('@tanstack/react-router', ...) closure over mutable mockSearch — single mock factory drives all hook scenarios via beforeEach setSearch(...)"

# Metrics
duration: 1 min
completed: 2026-05-15
---

# Phase 27 Plan 01: useRouteRangeVocab Foundation Summary

**Vocab-parameterized URL→Range bridge hook + 3 pre-baked snappers (SkillRange / CostRange / AlertRange) unblocking Phase 27 tail-end-route panel adoption without refactoring Phase 26's narrow-vocab useRouteRange.**

## Performance

- **Duration:** 1 min (116s wall-clock)
- **Started:** 2026-05-15T19:32:31Z
- **Completed:** 2026-05-15T19:34:27Z
- **Tasks:** 1
- **Files created:** 2 (1 source + 1 test)
- **Files modified:** 0
- **LOC added:** 284 (73 source + 211 test)

## Accomplishments

- Shipped `useRouteRangeVocab<V extends string>(routeDefault, snap): V` — generic hook reading `time_from`/`time_to` from URL search via TanStack Router's `useRouterState`, coercing both sides via Phase 26's `coerceToAbsolute`, falling back to `routeDefault` on missing/unparseable/inverted input
- Shipped three pre-baked snappers — `snapToSkillRange` (2-tier '14d'|'30d' boundary at 21d), `snapToCostRange` (4-tier '1d'|'7d'|'14d'|'30d' at 48h/192h/504h), `snapToAlertRange` (identical bands to CostRange)
- Re-exported `snapToRange` (Phase 26 'today'|'7d'|'30d' bands) for future generic-form callers
- 31 vitest cases pass — covers each snapper at band boundaries via (h, h+1) pairs + hook contract: empty search, parseable, asymmetric invalid, missing either side, inverted window, alt-vocab usage with snapToCostRange + snapToAlertRange
- **ZERO-REFACTOR INVARIANT PRESERVED** — `git diff --stat frontend/src/lib/time/useRouteRange.ts` returns empty; Phase 26's 9 panel call sites on `/` and `/activity` continue to consume the narrow Range vocab verbatim

## Task Commits

1. **Task 1: Ship useRouteRangeVocab generic hook + 3 snap helpers + vitest coverage** — `ed96343` (feat)

_All in a single atomic commit — task includes both source and test files as the plan's `<files>` declaration scopes them together._

## Files Created

- `frontend/src/lib/time/useRouteRangeVocab.ts` (73 LOC) — generic hook + 4 snappers (snapToSkillRange, snapToCostRange, snapToAlertRange, snapToRange)
- `frontend/src/lib/time/__tests__/useRouteRangeVocab.test.ts` (211 LOC) — 31 vitest cases:
  - snapToRange — 5 cases (1h, 24h boundary, 25h, 192h boundary, 193h)
  - snapToCostRange — 7 cases (1h, 48h boundary, 49h, 192h boundary, 193h, 504h boundary, 505h)
  - snapToAlertRange — 7 cases (paste-asserted identical to snapToCostRange)
  - snapToSkillRange — 3 cases (1h, 504h boundary, 505h)
  - useRouteRangeVocab hook — 9 cases (empty search, parseable both, asymmetric bogus from-side, asymmetric bogus to-side, missing to, missing from, inverted window, snapToCostRange + 2-day window, snapToAlertRange + 14-day window)

## Verifications

| Check | Command | Result |
|-------|---------|--------|
| Vitest passes | `cd frontend && pnpm test --run src/lib/time/__tests__/useRouteRangeVocab.test.ts` | **31/31 pass** (≥18 required) |
| TypeScript compiles | `cd frontend && pnpm tsc --noEmit` | **clean** (no output / exit 0) |
| ESLint passes | `cd frontend && pnpm lint --max-warnings 0` | **exit 0** |
| Zero-refactor invariant | `git diff --stat frontend/src/lib/time/useRouteRange.ts` | **empty** (Phase 26 file untouched) |
| Pre-commit hooks | `git commit` triggers frontend typecheck (tsc) | **Passed** |

## Decisions Made

1. **Additive, not refactor** — keep Phase 26's `useRouteRange.ts` byte-identical. The 9 Phase 26 call sites on `/` and `/activity` already type-check against the narrow `Range = 'today' | '7d' | '30d'`. Refactoring the hook to be generic would have rippled through all 9 sites for zero gain. The new generic lives in a sibling file.
2. **Inverted/zero-window guard** — added `if (windowHours <= 0) return routeDefault` even though the plan's spec listed it as a single test case. Defends against future clipboard-paste edge cases the `validateSearch` coercer might let through (e.g. user pastes `time_from=now&time_to=now-1h`).
3. **Snappers co-located with hook** — kept all 4 snap helpers in `useRouteRangeVocab.ts` rather than splitting into `snapToCostRange.ts` etc. Adoption plans (27-04 / 27-05 / 27-06) consume both the hook + their vocab's snapper from one import, mirroring Phase 26's `useRouteRange` next to `rangeToVocab` ergonomic.
4. **Pure-snapper boundary coverage via (h, h+1) pairs** — tests assert the value at the band-edge AND the first value of the next band. This proves edge inclusivity without ambiguity (a single value test can't distinguish `<=` from `<`).
5. **Mock-state pattern: module-level closure over mutable `mockSearch`** — single `vi.mock('@tanstack/react-router', ...)` factory closes over a mutable variable, mutated via `setSearch(...)` in `beforeEach` and inline before each `renderHook`. Avoids re-doing the mock per test while letting each test drive different search shapes.

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` block prescribed exact source contents which were used verbatim. Test coverage exceeds the plan's required ≥18 cases (shipped 31), which is additive and within the plan's spirit ("Cover the four pure snappers exhaustively (each band boundary + the next-band first value)").

The plan's spec listed only `vi` not explicitly in the test import list, but the existing Phase 26 mock pattern (`UnifiedFailures.test.tsx`) imports `vi` from `'vitest'` even though `globals: true` is set in `vitest.config.ts`. Mirroring that convention is a style choice, not a deviation — the test compiles and runs identically either way.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Plan 27-01 ships clean. Foundation complete for Wave-1 dependents:**

- Plan **27-04** (`/skills` + `/skills/$name` panel global-picker adoption) can now `import { useRouteRangeVocab, snapToSkillRange } from '@/lib/time/useRouteRangeVocab'` and write `const range = useRouteRangeVocab('14d', snapToSkillRange)` — return type narrows to `SkillRange` and feeds `useSkillUsage(range, limit)` without any cast.
- Plan **27-05** (`CostByProjectCard` global-picker adoption) consumes `useRouteRangeVocab('7d', snapToCostRange)` returning `CostRange`.
- Plan **27-06** (`AlertEventsList` global-picker adoption) consumes `useRouteRangeVocab('7d', snapToAlertRange)` returning `AlertRange`.
- Plan **27-09** (close gate) verifies the three adoptions don't break TIME-* requirements via Playwright + axe + Lighthouse re-runs.

**Parallel-safety note honored:** Plan 27-02 (running concurrently in sibling agent) touches only backend Python files (`backend/cmc/api/schemas/sessions.py`, `backend/cmc/api/routes/sessions.py`, `backend/tests/test_sessions_router.py`); this plan touched only frontend TypeScript. Pre-commit hooks confirmed zero overlap — backend typecheck and lint hooks reported "no files to check" for this commit.

**Phase 27 SC mapping:** This plan does NOT directly satisfy a Phase 27 SC — it is FOUNDATIONAL for SC#1 (`/skills/$name` re-anchor via global picker) and SC#2 (`/cost` 7d/30d picker re-query). Direct verification is downstream in Plans 27-04 / 27-05 / 27-06 / 27-09.

## Self-Check: PASSED

- `[ -f frontend/src/lib/time/useRouteRangeVocab.ts ]` → FOUND
- `[ -f frontend/src/lib/time/__tests__/useRouteRangeVocab.test.ts ]` → FOUND
- `git log --oneline --all | grep ed96343` → FOUND (`feat(27-01): add useRouteRangeVocab generic hook + 3 vocab snappers`)
- `git diff --stat HEAD~1 HEAD -- frontend/src/lib/time/useRouteRange.ts` → empty (zero-refactor invariant)

---
*Phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt*
*Completed: 2026-05-15*
