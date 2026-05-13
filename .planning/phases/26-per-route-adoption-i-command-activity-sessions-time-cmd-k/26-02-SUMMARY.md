---
phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
plan: 02
subsystem: ui
tags: [tanstack-router, validateSearch, url-contract, time-tokens, grafana, localStorage, fifo-ring]

# Dependency graph
requires:
  - phase: 25-saved-views
    provides: "SCHEMA_VERSION + coerceSchemaVersion shared validator pattern; DefaultViewLoader bare-URL gate (Pitfall 13 anchor)"
  - phase: 24-shell-density-containment-primitives
    provides: "cmc.* localStorage namespace; storage.ts wrapper pattern"
provides:
  - "Shared asTimeToken validator (Grafana relative + ISO absolute) in lib/searchSchemas.ts"
  - "validateSearch on /, /activity, /sessions/compare ACCEPTS ?time_from + ?time_to (append-only, defaults undefined)"
  - "cmc.recents.routes FIFO ring (cap 20, head-dedupe, newest-first) in lib/recents.ts"
  - "pushRecentRoute + getRecentRoutes + clearRecentRoutes + RecentRoute type"
  - "docs/url-contract.md Phase 26 section + per-route shape rows updated"
affects: [26-03, 26-04, 26-05, 26-06, 26-07, 26-08, 26-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared validator helper (asTimeToken) imported by all three Phase 26 routes — single regex source of truth"
    - "Append-only validateSearch extension with `undefined` default (preserves DefaultViewLoader bare-URL gate / Pitfall 13)"
    - "cmc.* localStorage FIFO ring with head-dedupe (mirrors savedViews.ts pushRecentState pattern; structural-key dedupe replaced with route-key dedupe)"
    - "Shape-invalid storage blob defense-in-depth via per-entry type-narrowing filter in readRing"

key-files:
  created:
    - frontend/src/lib/recents.ts
    - frontend/src/lib/__tests__/recents.test.ts
  modified:
    - frontend/src/lib/searchSchemas.ts
    - frontend/src/routes/index.tsx
    - frontend/src/routes/activity.tsx
    - frontend/src/routes/sessions_.compare.tsx
    - frontend/src/lib/__tests__/searchSchemas.test.ts
    - docs/url-contract.md

key-decisions:
  - "asTimeToken regexes are inline literals in searchSchemas.ts (no separate token-parser file); Plan 01's Grafana token parser is at lib/time/* and serves a different purpose (resolving tokens → Date objects; this validator just shape-checks the string for URL preservation)"
  - "time_from + time_to default to `undefined` in the validator (Pitfall 13 invariant) — per-route fallback (24h / 1h / 7d) deferred to Wave 3 panel READ sites"
  - "RecentRoute interface is intentionally minimal ({ route: string, visitedAt: number }) — no search-state snapshot (that pipeline already exists in savedViews.ts:pushRecentState); recents.ts answers the cross-route question only"
  - "Cap = 20 entries (sidebar's 3 + Cmd+K's 5 + 12 headroom)"
  - "Head-dedupe (route-key, not structural-key) — simpler than savedViews.ts JSON.stringify path because routes are short strings; ring shrinks when a non-head dupe is collapsed"

patterns-established:
  - "Pattern: shared validator helper at lib/searchSchemas.ts — append new helpers (asTimeToken, coerceSchemaVersion) here as URL params expand"
  - "Pattern: validators are pure shape-checkers, never default to a per-route fallback (Pitfall 13 lock)"
  - "Pattern: cmc.* ring data shape — interface + readRing + writeRing + push (head-dedupe) + get + clear + per-entry filter"

# Metrics
duration: 9min
completed: 2026-05-13
---

# Phase 26 Plan 02: Per-Route validateSearch extension + cmc.recents.routes ring Summary

**Append-only acceptance of `?time_from` + `?time_to` Grafana tokens on `/`, `/activity`, `/sessions/compare` (defaulting to `undefined` so DefaultViewLoader's bare-URL gate keeps firing per Pitfall 13), plus the `cmc.recents.routes` FIFO ring that Wave 2's RecentRoutesTracker and Cmd+K Recents group consume.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-13T10:33:25Z
- **Completed:** 2026-05-13T10:42:22Z
- **Tasks:** 2
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- Shared `asTimeToken` validator (Grafana `now`/`now-Nu`/`now/u`/`now-Nu/u` + ISO-8601 absolute) in `lib/searchSchemas.ts`.
- Three Phase 26 routes (`/`, `/activity`, `/sessions/compare`) extend their `validateSearch` APPEND-ONLY with `time_from?` + `time_to?` returning the input verbatim or `undefined`.
- `SCHEMA_VERSION` stays at `1` (locked invariant — `docs/url-contract.md:21`).
- `lib/recents.ts` ships the cross-route FIFO ring (`cmc.recents.routes`, cap 20, head-dedupe, newest-first read).
- 14 new vitest cases for `asTimeToken` (Grafana + ISO + rejections + edge cases) + 6 new route-validator cases (round-trip + bogus-strip + ISO on `/activity` + UUID + time on `/sessions/compare`) + 11 new recents cases (push/dedupe/cap/clear/malformed).
- `docs/url-contract.md` updated: time_from/time_to listed as PRESENT on the three Phase 26 routes; new Phase 26 effects section documents append-only contract + Pitfall 13 invariant + `cmc.recents.routes` localStorage key.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add shared asTimeToken validator + extend three routes' validateSearch (append-only)** — `80c126c` (feat)
2. **Task 2: Ship cmc.recents.routes FIFO ring + update url-contract.md docs** — `b68eb55` (feat)

**Plan metadata commit:** _(forthcoming — STATE.md + ROADMAP.md final commit)_

## Files Created/Modified

**Created:**
- `frontend/src/lib/recents.ts` — `cmc.recents.routes` FIFO ring (~80 LOC). Exports `pushRecentRoute`, `getRecentRoutes`, `clearRecentRoutes`, `RecentRoute` type. Cap 20, head-dedupe, tolerant of malformed JSON / non-array blobs / shape-invalid entries.
- `frontend/src/lib/__tests__/recents.test.ts` — 11 vitest cases covering all ring semantics + defense-in-depth filters.

**Modified:**
- `frontend/src/lib/searchSchemas.ts` — added `asTimeToken` + `GRAFANA_REL` + `ISO_ABS` regex constants. ~28 LOC append.
- `frontend/src/routes/index.tsx` — `IndexSearch` + `validateSearch` extended with optional `time_from` + `time_to`; import widened to include `asTimeToken`.
- `frontend/src/routes/activity.tsx` — `ActivitySearch` + `validateSearch` extended identically.
- `frontend/src/routes/sessions_.compare.tsx` — `CompareSearch` + `validateSearch` extended; existing UUID coercion of `a`/`b` preserved verbatim.
- `frontend/src/lib/__tests__/searchSchemas.test.ts` — existing assertions for the three Phase 26 routes updated to include `time_from: undefined, time_to: undefined`; 14 new `asTimeToken` describe + 6 new Phase 26 route-extension describe cases appended.
- `docs/url-contract.md` — table rows for `/`, `/activity`, `/sessions/compare` updated with explicit `validateSearch` shape mentioning `time_from`/`time_to` PRESENT; new Phase 26 effects section.

## Decisions Made

1. **Two regex constants, not three:** `GRAFANA_REL` covers `now`, `now-Nu`, `now/u`, `now-Nu/u`. `ISO_ABS` covers ISO-8601 absolute strings (anchored to `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}`). No third regex for "epoch milliseconds" — the URL contract is string-only and the URL never carries numeric timestamps directly.
2. **No coupling to Plan 01's `lib/time/*` parser:** Plan 01 ships a Grafana token → Date resolver. This plan ships a Grafana token → URL string SHAPE validator. The two layers are intentionally disjoint: panels in Wave 3 will resolve tokens via Plan 01's parser; URL preservation flows through this plan's `asTimeToken`. Keeping them disjoint means `asTimeToken` has no runtime time dependency (handy for SSR + tests).
3. **Plan 01's `lib/time/*` import not added to validators:** Validators must remain pure (no I/O, no clock reads). Re-using Plan 01's parser would have introduced a clock-dependency through `Date.now()` in the resolver path. Sidestepped by keeping the regex inline.
4. **`docs/url-contract.md` edits limited to the three Phase 26 routes:** Resisted the temptation to backfill `schemaVersion: 1` rows for all 7 routes. Phase 26's scope is the three routes named in the plan; tightening the doc rows for `/skills`, `/skills/$name`, `/cost`, `/alerts` would create scope creep and risk inaccurate shape descriptions (e.g., `/skills/$name`'s `range` field has its own non-trivial enum). The `backend/tests/test_url_contract.py` gate is bidirectional doc⇄route name presence — it does NOT validate the shape column text, so unchanged rows continue to pass.
5. **Head-dedupe semantics (route-key) chosen over structural-key dedupe:** `savedViews.ts:pushRecentState` uses JSON.stringify-based structural dedupe because its entries carry full search blobs that can drift in ordering. `recents.ts` entries are simple `{ route, visitedAt }` records; the route is the dedupe identity. Same route navigated twice in a row → replace head; same route navigated non-consecutively → surface to head, drop earlier occurrence (ring shrinks by 1).

## Deviations from Plan

None — plan executed exactly as written.

The plan's Task 1 action specified updating existing route test assertions to match the new return shape; I did so (the existing `/`, `/activity`, `/sessions/compare` `validateSearch` test cases needed `time_from: undefined, time_to: undefined` added). This is a literal application of the plan's "PROBLEM" pattern, not a deviation.

The plan asked to add `≥10` `asTimeToken` cases + 3 route-validator cases; I shipped 14 + 6 = 20 new cases to give the regex a tight regression net (including ISO-with-offset, `now+1h`, day-snap variants, and `now-7` malformed-rejection coverage).

## Issues Encountered

None. Both task verifications passed on the first run.

A momentary scope check on `docs/url-contract.md`: I started to add `range` to `/skills/$name`'s shape column, realized the validator there is mandatory-with-default (not optional), reverted to the literal Phase 26 scope. Logged as decision #4 above.

## User Setup Required

None — no external service configuration required. All changes are URL-contract + localStorage layers, fully client-side.

## Next Phase Readiness

**Ready for Wave 2 (Plans 03-05):**
- `pushRecentRoute({ route, visitedAt })` is the contract for Wave 2's RecentRoutesTracker (mounted in AppShell, fires on every routerState location change).
- `getRecentRoutes()` is the contract for Wave 2's `RecentlyVisitedSection` (sidebar, slice(0, 3) + filter out active route per Pitfall 8) AND Wave 3's Cmd+K Recents group (slice(0, 5)).
- `time_from`/`time_to` on the three routes survives a full URL → validator → `useSearch()` round-trip. Wave 3 panels read via `Route.useSearch()` and apply per-route fallback (24h / 1h / 7d).

**No blockers.** Plan 01 (Grafana parser + sonner toast install) committed earlier in the wave (`6df78d9`); my plan has zero file overlap with it.

## Verification Results

- frontend vitest: **533/533 PASS** (baseline 452 + Plan 01 additions + 31 new from this plan).
- frontend tsc --noEmit: **clean** (TypeScript propagates the optional fields into `Route.useSearch()` consumers without explicit casts).
- frontend lint (eslint --max-warnings 0): **clean.**
- backend pytest: **686/686 PASS** (zero backend changes — baseline preserved).
- `backend/tests/test_url_contract.py`: **2/2 PASS** (doc⇄route bidirectional gate intact).
- `grep "SCHEMA_VERSION = 1" frontend/src` → 1 hit at `searchSchemas.ts:40` (locked invariant preserved).

## Self-Check: PASSED

Files exist:
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/lib/searchSchemas.ts` — FOUND (asTimeToken exported)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/lib/recents.ts` — FOUND
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/lib/__tests__/recents.test.ts` — FOUND
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/lib/__tests__/searchSchemas.test.ts` — FOUND
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/routes/index.tsx` — FOUND (extended)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/routes/activity.tsx` — FOUND (extended)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/routes/sessions_.compare.tsx` — FOUND (extended)
- `/Users/patrykattc/work/git/claude-mission-control/docs/url-contract.md` — FOUND (Phase 26 section added)

Commits exist:
- `80c126c` — FOUND (Task 1: feat 26-02 time validators)
- `b68eb55` — FOUND (Task 2: feat 26-02 recents ring + url-contract docs)

---
*Phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k*
*Completed: 2026-05-13*
