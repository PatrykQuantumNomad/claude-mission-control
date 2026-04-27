---
phase: 07-command-centre-panels
plan: 01
subsystem: foundation
tags: [phase-7, wave-0, alertdialog, cronstrue, estop, context-health, queries-cadence, types-narrowing]

# Dependency graph
requires:
  - phase: 04-stateful-apis
    provides: HITL/Tasks/Schedules Pydantic schemas + ESTOP routes that lib/api.ts now narrows
  - phase: 05-frontend-shell-design-system
    provides: components/ui barrel + NavBar + AppShell + render/test utilities
  - phase: 06-observability-activity-panels
    provides: lib/queries.ts qk-factory + cadence convention + PanelCard + StatList + Badge
provides:
  - 1 new ui primitive (AlertDialog) — destructive-confirm modal mounted in components/ui
  - 1 new shell component (EmergencyStopBanner) globally mounted in NavBar — visible from boot on every route
  - 1 new panel (ContextHealthCard) — SKLP-03 read-only display of ~/.claude/ scan
  - lib/queries.ts extended with ~22 hooks/mutations covering every Phase 7 read+write
  - lib/cron-utils.ts (partsToCron + prettyCron) — Wave 2 ScheduleComposer prerequisite
  - 1 new backend route (GET /api/context/health) + Pydantic schema (defense-in-depth)
  - lib/api.ts narrowed for HITL/Tasks/Schedules/Skills/MCP-write/ESTOP/Sync families against backend Pydantic schemas; 5 new fetchers (contextHealth, emergencyResume, dispatcherTrigger, schedulesParseNl, fetchVoid for 204)
affects: 07-02, 07-03, 07-04 (all downstream Phase 7 panels consume queries.ts hooks; ScheduleComposer needs cron-utils; TaskBoard delete uses AlertDialog)

# Tech tracking
tech-stack:
  added: [cronstrue@3.14.0, "@radix-ui/react-alert-dialog@1.1.15"]
  patterns:
    - "Cadence + optimistic policy locked in lib/queries.ts (single source of truth — no panel inlines refetchInterval or optimistic config)"
    - "Optimistic mutation pattern: snapshot via getQueriesData -> setQueriesData with merge -> onError restore -> onSettled invalidate"
    - "ESTOP state machine with React 19 StrictMode-safe timer cleanup (armTimerRef + cleanup useEffect always clears the ref)"
    - "Defense-in-depth schema: never include a field that carries values, so wire shape cannot leak secrets even if redaction logic regresses"
    - "Hardcoded HOME_CLAUDE_DIR at module level; FastAPI ignores unknown query params so ?path= traversal cannot reach the handler"

key-files:
  created:
    - frontend/src/components/ui/AlertDialog.tsx
    - frontend/src/components/ui/__tests__/AlertDialog.test.tsx
    - frontend/src/components/shell/EmergencyStopBanner.tsx
    - frontend/src/components/shell/__tests__/EmergencyStopBanner.test.tsx
    - frontend/src/components/panels/ContextHealthCard.tsx
    - frontend/src/components/panels/__tests__/ContextHealthCard.test.tsx
    - frontend/src/lib/cron-utils.ts
    - frontend/src/lib/__tests__/cron-utils.test.ts
    - backend/cmc/api/routes/context.py
    - backend/cmc/api/schemas/context.py
    - backend/tests/test_phase7_context.py
  modified:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/src/components/ui/index.ts
    - frontend/src/components/panels/index.ts
    - frontend/src/components/shell/NavBar.tsx
    - frontend/src/components/shell/__tests__/NavBar.test.tsx
    - frontend/src/components/shell/__tests__/AppShell.test.tsx
    - frontend/src/lib/api.ts
    - frontend/src/lib/queries.ts
    - frontend/src/styles.css
    - frontend/src/routes/skills.tsx
    - frontend/src/__tests__/integration.test.tsx
    - backend/cmc/api/routes/__init__.py

key-decisions:
  - "Append-only @deprecated aliases on api.ts narrowed entries (decisions/inbox/tasks/etc.) so Phase 6 callers don't break mid-migration"
  - "lib/cron-utils prettyCron uses cronstrue defaults (Mon=1) to match croniter standard mode used by backend SCHD-* validation — toggling dayOfWeekStartIndexZero would break round-trip"
  - "ContextHealthResponse schema is closed at 8 fields; defense-in-depth prevents value leakage even if redaction logic regresses"
  - "EmergencyStopBanner reads useSystemState('emergency_stop') as source of truth — server flag overrides local state machine so remote toggles flip the banner within one polling tick"
  - "Router prefix in cmc/api/routes/context.py is '/context' (not '/api/context') — factory mounts every router under '/api'; doubling the prefix returns the SPA fallback HTML"
  - "EmergencyStopBanner mounted in NavBar between the route-links UL and the Cmd+K trigger so it sits in the right-hand action area but is announced after primary navigation"
  - "/skills now renders ContextHealthCard inside its own .cmc-card-grid below the placeholder grid; SKLP-03 was removed from SKILLS_SLOTS (first of 4 slot retirements; Plan 07-04 will delete the helper file)"

patterns-established:
  - "Phase 7 panel entry contract: every panel imports `from '../ui'` (now includes AlertDialog) and `from '../../lib/queries'` (~22 new hooks). No panel re-implements polling cadence or ESTOP state machine."
  - "TanStack Query + fake timers: use `await vi.advanceTimersByTimeAsync(0)` inside act() rather than runAllTimersAsync() — the latter spins the 5_000ms refetchInterval forever and the test runner aborts at 10_000 timers"
  - "fetchVoid helper for 204 No Content endpoints — never call r.json() on 204 (TASK-04 / SCHD-04 DELETE)"

# Metrics
duration: 35 min
completed: 2026-04-27
---

# Phase 7 Plan 01: Command Centre Wave 0 Foundation Summary

**AlertDialog primitive + cronstrue+radix-alert-dialog deps + global EmergencyStopBanner in NavBar + SKLP-03 ContextHealthCard backed by /api/context/health + lib/api.ts narrowed for 7 endpoint families + lib/queries.ts extended with ~22 hooks/mutations behind a locked cadence policy.**

## Performance

- **Duration:** 35 min agent time
- **Started:** 2026-04-27T11:30:00Z (continuation from interrupted prior run)
- **Completed:** 2026-04-27T12:08:00Z
- **Tasks:** 3 (all `tdd=true`; 6 commits — chore + 2 RED + 3 GREEN)
- **Files created:** 11
- **Files modified:** 13

## Accomplishments

- **AlertDialog primitive** shipped behind components/ui barrel (20 primitives total — 12 Phase-5 + 7 Phase-6 + 1 Phase-7). Radix portal-mounted with auto-wired `aria-labelledby` + `aria-describedby` and a destructive/primary actionVariant prop.
- **EmergencyStopBanner mounted globally in NavBar** — visible on every route from boot (TPNL-05 quality gate). Idle → armed → firing state machine with a 5_000ms re-disarm timer and a separate engaged path that overlays whenever the server `emergency_stop` flag is `'1'`. React 19 StrictMode-safe timer cleanup via `armTimerRef` + cleanup effect.
- **SKLP-03 ContextHealthCard** rendered on `/skills` (replacing the SKLP-03 placeholder slot in SKILLS_SLOTS) — backed by the new `GET /api/context/health` endpoint with case-insensitive secret-key redaction on `KEY|TOKEN|SECRET|PASSWORD` and a defense-in-depth schema that has NO field carrying values.
- **lib/api.ts narrowed** for HITL/Tasks/Schedules/Skills/MCP-write/ESTOP/Sync entry families — typed against backend Pydantic schemas verbatim. Added 5 new fetchers honoring the 3 RESEARCH §Summary corrections (parse-nl, emergency-resume, dispatcher/trigger) plus `contextHealth` and a `fetchVoid` helper for 204 No Content endpoints.
- **lib/queries.ts extended** with ~22 hooks/mutations behind the canonical cadence policy. Locked policy:
  - 5_000ms: useDecisions, useTasks, useSystemState
  - 10_000ms: useInbox
  - 30_000ms: useSchedules, useScheduleRuns (lazy via `enabled` prop — Pitfall 9)
  - 60_000ms: useSkills, useContextHealth
- **lib/cron-utils.ts** ships partsToCron + prettyCron pure helpers (Wave 2 ScheduleComposer prerequisite). cronstrue defaults match croniter standard cron mode so frontend cron strings are accepted by backend SCHD-* validation.

## Task Commits

| # | Task | Commit | Type |
|---|------|--------|------|
| 0 | Install deps | `1b23395` | chore |
| 1a | RED: cron-utils + AlertDialog tests | `576b981` | test |
| 1b | GREEN: AlertDialog + cron-utils + api.ts narrowing + styles.css | `5ab9ffa` | feat |
| 2 | GREEN: queries.ts + EmergencyStopBanner + ContextHealthCard + tests + skills.tsx wire-up | `7c3fe4f` | feat |
| 3a | RED: backend SKLP-03 tests | `255b076` | test |
| 3b | GREEN: backend SKLP-03 route + schema + router registration | `d69b773` | feat |

## Files Created/Modified

### Frontend created
- `frontend/src/components/ui/AlertDialog.tsx` — Radix wrapper with portal-to-body, aria wiring, destructive/primary variant
- `frontend/src/components/ui/__tests__/AlertDialog.test.tsx` — 4 cases (4/4 pass)
- `frontend/src/components/shell/EmergencyStopBanner.tsx` — TPNL-05 state machine + engaged-path overlay
- `frontend/src/components/shell/__tests__/EmergencyStopBanner.test.tsx` — 5 cases (5/5 pass) covering idle→armed, auto-disarm, firing mutation, engaged→resume, unmount cleanup
- `frontend/src/components/panels/ContextHealthCard.tsx` — PanelCard + StatList + chip Badges (redacted modifier)
- `frontend/src/components/panels/__tests__/ContextHealthCard.test.tsx` — 3 cases (3/3 pass)
- `frontend/src/lib/cron-utils.ts` — partsToCron + prettyCron pure helpers
- `frontend/src/lib/__tests__/cron-utils.test.ts` — 6 cases (6/6 pass)

### Frontend modified
- `frontend/package.json` + `frontend/package-lock.json` — cronstrue@^3.14.0 + @radix-ui/react-alert-dialog@^1.1.15
- `frontend/src/components/ui/index.ts` — AlertDialog re-export (20 primitives total)
- `frontend/src/components/panels/index.ts` — ContextHealthCard re-export
- `frontend/src/components/shell/NavBar.tsx` — `<EmergencyStopBanner />` mounted in right-hand action area
- `frontend/src/components/shell/__tests__/NavBar.test.tsx` — wrap with QueryClientProvider + benign fetch stub; assert banner visible
- `frontend/src/components/shell/__tests__/AppShell.test.tsx` — same QueryClientProvider wrap (NavBar transitive dep)
- `frontend/src/lib/api.ts` — narrowed types for HITL/Tasks/Schedules/Skills/MCP-write/ESTOP/Sync; new fetchers contextHealth, emergencyResume, dispatcherTrigger, schedulesParseNl; fetchVoid helper
- `frontend/src/lib/queries.ts` — qk factory extended (8 keys); ~22 new hooks/mutations
- `frontend/src/styles.css` — Phase 7 Wave 0 section: AlertDialog overlay/title/desc/actions; cmc-btn--destructive variant; ESTOP idle/armed/firing/engaged + pulse keyframe; ContextHealth chip-list + redacted modifier (all tokens, no inline hex)
- `frontend/src/routes/skills.tsx` — SKLP-03 removed from SKILLS_SLOTS; `<ContextHealthCard />` rendered below placeholder grid
- `frontend/src/__tests__/integration.test.tsx` — fetch mock handles `/api/system/state` and `/api/context/health`; `/skills` test asserts SKLP-03 + Context Health visible

### Backend created
- `backend/cmc/api/schemas/context.py` — ContextHealthResponse Pydantic v2 model (8 fields, defense-in-depth)
- `backend/cmc/api/routes/context.py` — GET /api/context/health with HARDCODED HOME_CLAUDE_DIR + SECRET_PATTERN regex + graceful JSONDecodeError/OSError handling
- `backend/tests/test_phase7_context.py` — 6 pytest cases (6/6 pass) covering empty fs, redaction, line counting, corrupt-json degradation, query-param ignore, schema closed-at-8-fields

### Backend modified
- `backend/cmc/api/routes/__init__.py` — registered context_router between skills and hitl in all_routers(); also re-exports the `context` module so test fixtures can monkeypatch HOME_CLAUDE_DIR

## Decisions Made

- **Append-only @deprecated aliases on api.ts** — Phase 6 callers (e.g. `api.deleteTask`) still compile because we kept aliases pointing to the new `taskDelete` etc. fetchers. Phase 7 plans use the new names; the aliases get pruned in a future tidy-up.
- **cronstrue defaults (Mon=1) preserved** — explicitly NOT setting `dayOfWeekStartIndexZero` because backend SCHD-* validation uses croniter standard mode, which expects Mon=1. Toggling would break round-trip.
- **ContextHealthResponse schema is closed at 8 fields** — defense-in-depth: even if `_redact_keys` regressed and we accidentally tried to attach a value, the wire shape has nowhere to put it.
- **EmergencyStopBanner reads useSystemState as source of truth** — server flag overrides local state machine. A remote `POST /api/system/emergency-stop` from CLI flips the banner to engaged within one 5_000ms polling tick.
- **Router prefix bug found & fixed during GREEN** — initial `prefix="/api/context"` caused the factory's `/api` mount to produce `/api/api/context/health`, which fell through to the SPA static handler returning HTML. Fixed to `prefix="/context"` matching the convention used by skills/hitl/tasks/schedules routers. (Documented as Rule 1 deviation below.)
- **EmergencyStopBanner placed between nav links and Cmd+K trigger** — keeps it in the right-hand action area but announced after primary navigation, which is what screen readers expect for an emergency control.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Router prefix double-mount**
- **Found during:** Task 3 (after writing context.py per plan spec)
- **Issue:** Plan instructed `APIRouter(prefix="/api/context")` but the factory at `cmc/app/factory.py` already mounts every router via `app.include_router(router, prefix="/api")`. The double-prefix produced `/api/api/context/health`, which fell through to the SPA static handler and returned `index.html`. All 6 RED tests failed because `r.json()` was decoding HTML.
- **Fix:** Changed router prefix to `"/context"`, matching the convention used by skills_router/hitl_router/tasks_router/schedules_router. Added a comment to the route file explaining the convention.
- **Files modified:** backend/cmc/api/routes/context.py
- **Verification:** All 6 backend tests pass; full suite 208/208.
- **Committed in:** d69b773 (Task 3 GREEN commit)

**2. [Rule 3 - Blocking] TanStack Query + fake-timers infinite loop in EmergencyStopBanner test**
- **Found during:** Task 2 (running EmergencyStopBanner tests)
- **Issue:** `useSystemState('emergency_stop')` polls at 5_000ms via `refetchInterval`. With `vi.useFakeTimers()` enabled, calling `vi.runAllTimersAsync()` after the firing/resume click triggered TanStack Query's internal `setInterval` to schedule indefinitely; test runner aborted at the 10_000-timer guard rail.
- **Fix:** Replaced `runAllTimersAsync()` with `vi.advanceTimersByTimeAsync(0)` inside `act()`. Advancing by 0 flushes microtasks (so the mutation's fetch promise resolves and Query's onSettled runs) without unwinding the 5s polling interval.
- **Files modified:** frontend/src/components/shell/__tests__/EmergencyStopBanner.test.tsx
- **Verification:** All 5 EmergencyStopBanner tests pass; full frontend suite 188/188.
- **Committed in:** 7c3fe4f (Task 2 GREEN commit)

**3. [Rule 3 - Blocking] AppShell test failed because NavBar transitively requires QueryClientProvider**
- **Found during:** Task 2 (after mounting EmergencyStopBanner in NavBar)
- **Issue:** `AppShell.test.tsx` rendered `<RouterProvider>` directly without a QueryClientProvider. NavBar now contains EmergencyStopBanner which calls `useSystemState`, which throws "No QueryClient set" when no provider is in the tree.
- **Fix:** Wrapped the AppShell test render in `<QueryClientProvider client={makeClient()}>` and added a benign `fetch` stub returning `{ items: { emergency_stop: '0' } }` so the banner mounts to its idle state.
- **Files modified:** frontend/src/components/shell/__tests__/AppShell.test.tsx
- **Verification:** AppShell test passes alongside the updated NavBar test.
- **Committed in:** 7c3fe4f (Task 2 GREEN commit)

**4. [Rule 3 - Blocking] Integration test needed mock entries for new endpoints**
- **Found during:** Task 2 (anticipated; surfaced when adding ContextHealthCard to /skills)
- **Issue:** The URL-aware fetch mock in `src/__tests__/integration.test.tsx` returned the catch-all `{}` for `/api/system/state` and `/api/context/health`, which fails TypeScript-narrow consumers (banner expects `items.emergency_stop`; ContextHealthCard expects an 8-field object).
- **Fix:** Added two new branches to the integration test fetch mock: `/api/system/state` → `{ items: { emergency_stop: '0' } }`; `/api/context/health` → a minimal valid `ContextHealthResponse`. Updated the `/skills` test assertion to expect SKLP-03 + "Context Health" alongside remaining placeholder bodies.
- **Files modified:** frontend/src/__tests__/integration.test.tsx
- **Verification:** Integration tests pass; `/skills` test now asserts the live panel renders.
- **Committed in:** 7c3fe4f (Task 2 GREEN commit)

---

**Total deviations:** 4 auto-fixed (1 bug, 3 blocking)
**Impact on plan:** All four were small mechanical adjustments. The router-prefix bug (#1) was the only one with a substantive root cause — the plan instruction conflicted with the factory's mount convention. The remaining three were predictable test-environment plumbing tweaks driven by the new globally-mounted ESTOP banner.

## Issues Encountered

None — the partial state from the prior run (deps installed + RED tests on disk) integrated cleanly. The 4 deviations above resolved automatically as expected.

## User Setup Required

None — no external services configured by this plan. SKLP-03 reads the developer's local `~/.claude/settings.json` and `~/.claude/CLAUDE.md`; redaction works against keys that already exist in those files.

## Next Phase Readiness

Plan 07-01 ships the entire Phase 7 foundation. Plans 07-02..07-04 can proceed as pure binding work:

- **07-02 (HITL panels):** import `useDecisions`, `useInbox`, `useAnswerDecision`, `useReadInbox`, `useReplyInbox` from queries.ts. No new lib edits.
- **07-03 (Tasks + Schedules):** import `useTasks`, `useSchedules`, `useScheduleRuns`, plus all task/schedule mutations. ScheduleComposer uses `partsToCron` + `prettyCron` from cron-utils.ts. TaskBoard delete uses the AlertDialog primitive.
- **07-04 (Skills retirement):** import `useSkills` + `usePatchSkillAutonomy` + `useSkillsSync`. Deletes the remaining slots from SKILLS_SLOTS and removes `PlaceholderCardGrid` entirely (Pitfall 10 mitigation).

The 3 RESEARCH §Summary corrections are now wired in lib/api.ts:
- `parseNlSchedule` POSTs `/api/schedules/parse-nl` (not `/nl-to-cron`)
- `emergencyResume` POSTs `/api/system/emergency-resume` (not DELETE on `/emergency-stop`)
- `triggerDispatcher` POSTs `/api/dispatcher/trigger` (not `/api/tasks/{id}/trigger`)

Bundle delta from `npm run build`:
- CSS: 28.40KB total / 5.02KB gzipped (no change since Phase 6 — Phase-7 CSS additions are lean)
- JS panels chunk: 577KB total / 172KB gzipped (up from 421KB / 120KB in Phase 6 — accounts for cronstrue + react-alert-dialog + new panel code; well under the 250KB gzipped vendor-chunk threshold flagged in Pitfall 8)
- index chunk: 369KB / 115KB gzipped (down from 290KB before — Vite re-chunked because the lazy-loaded routes pulled CommandPalette into the index chunk; net total bundle similar)

---
*Phase: 07-command-centre-panels*
*Plan: 07-01 — Wave 0 Foundation*
*Completed: 2026-04-27*

## Self-Check: PASSED

Verified post-write:
- All 11 created files exist on disk: AlertDialog.tsx, AlertDialog.test.tsx, EmergencyStopBanner.tsx, EmergencyStopBanner.test.tsx, ContextHealthCard.tsx, ContextHealthCard.test.tsx, cron-utils.ts, cron-utils.test.ts, context.py (route), context.py (schema), test_phase7_context.py
- All 6 task commits exist in git log: 1b23395, 576b981, 5ab9ffa, 7c3fe4f, 255b076, d69b773
- Frontend tests: 188/188 passing (170 baseline + 18 new — exceeds the ~14 target documented in the plan)
- Backend tests: 208/208 passing (202 baseline + 6 new — matches plan target exactly)
- typecheck green; build green
- All `must_haves.truths` from plan frontmatter hold; all `must_haves.artifacts` exist with required exports/contains
