---
phase: 16-session-comparison
plan: 03
subsystem: frontend-pickers
tags: [cmdk-Command.Item, tanstack-useRouterState, sheet-drawer, validateSearch, useNavigate, DataTable-actions-column]

# Dependency graph
requires:
  - phase: 16-session-comparison
    provides: /sessions/compare file-based route + hand-written validateSearch UUID validator + SessionCompareView panel + useSessionCompare hook (Plan 16-02)
  - phase: 16-session-comparison
    provides: GET /api/sessions/compare endpoint + 400 a==b guard (Plan 16-01)
  - phase: 13-cost-foundation
    provides: useSessionsList hook + SessionListItemFull type (carried via Phase 14 chain)
provides:
  - frontend/src/components/ui/CommandPalette.tsx — context-aware "Compare with…" / "Compare sessions" / "Pick a different session B" Command.Item under <Command.Group heading="Actions">; first useRouterState({ select: (s) => s.location }) usage in the codebase
  - frontend/src/components/ui/CommandPalette.tsx — ComparePicker subcomponent (in-file): mounts ui/Sheet + lists useSessionsList({ range: '7d', limit: 50 }) rows with self-compare guard (button disabled when row.session_id === currentA)
  - frontend/src/components/panels/SessionsTable.tsx — 7th 'actions' column with per-row <Button variant="ghost" size="sm">Compare</Button>; default navigate to /sessions/compare?a={sid}, optional onCompareClick prop overrides default
  - frontend/src/components/ui/__tests__/CommandPalette.test.tsx — 6 new vitest cases (11 total) covering default/context-aware label + picker open + function-form `b` set + self-compare guard + both-set label
  - frontend/src/components/panels/__tests__/SessionsTable.test.tsx — 3 new vitest cases (9 total) covering Compare button per row + default navigate + onCompareClick prop override
affects: [16-04-cleanup, phase-17-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First `useRouterState({ select: (s) => s.location })` usage in the codebase. Selector-form keeps the subscription tight — re-renders only when pathname/search actually change, never on every router internal tick. Pattern reusable for any future Cmd+K item that branches on the current route."
    - "Context-aware Cmd+K item: single Command.Item whose label + onSelect branch on `location.pathname` and parsed search params (a/b). Three branches: default → navigate, picker mode → open Sheet. Sets the precedent for future contextual cmdk items."
    - "Picker drawer pattern (ComparePicker): Sheet + useSessionsList list + per-row button with aria-label `Compare with session {sid}`. Each row button is `disabled` when sid === currentA (self-compare guard, defensive — backend already 400s on a==b)."
    - "Function-form search update: navigate({ to: '/sessions/compare', search: (prev) => ({ ...prev, b: chosenSid }) }) — Pitfall 4 from 16-RESEARCH.md. Object-form would risk stale-closure render loops."
    - "Optional callback prop pattern (onCompareClick) on SessionsTable: lets a parent override default per-row click behaviour without forking the component. Mirrors React's controlled-component lift-up convention. Used by the Cmd+K picker drawer to set `b` rather than navigate fresh."
    - "DataTable column array moved from module-level const to component-level useMemo so callbacks (navigate, onCompareClick) are in scope while preserving DataTable's referential-equality fast path. No perf regression at the ≤50-row workload."

key-files:
  modified:
    - frontend/src/components/ui/CommandPalette.tsx
    - frontend/src/components/ui/__tests__/CommandPalette.test.tsx
    - frontend/src/components/panels/SessionsTable.tsx
    - frontend/src/components/panels/__tests__/SessionsTable.test.tsx

key-decisions:
  - "Cmd+K item shape: Option B (context-aware) per CMPR-03 wording. Three branches based on current location: 'Compare sessions' default / 'Compare with…' on /sessions/compare?a=X with no b / 'Pick a different session B' when both set."
  - "Picker drawer uses ui/Sheet primitive + useSessionsList({ range: '7d', limit: 50 }) — mirrors SkillRunsTable.tsx:273-280 precedent. Lightweight <ul>+<button> list, NOT DataTable (overkill for 50 rows in a drawer)."
  - "Self-compare guard implemented as `disabled` button (simpler than navigate-with-fallback). Backend already 400-rejects a==b per Plan 16-01; the UI guard is defensive."
  - "SessionsTable adds optional `onCompareClick` prop for picker reuse (NOT a generic onRowClick on DataTable — out of scope per SkillRunsTable.tsx:11-15 deferral)."
  - "Default SessionsTable Compare-button click navigates to /sessions/compare?a={sid} (Plan 16-02 route). Object-form `search: { a }` is safe here — no prev to merge, fresh navigation."

patterns-established:
  - "Pattern 1: useRouterState selector form — establishes the subscription idiom for any future Cmd+K / panel that needs to branch on current route."
  - "Pattern 2: Picker drawer (Sheet + useSessionsList list) — reusable for any future 'pick second item' UX (e.g. compare two skills, link two sessions)."
  - "Pattern 3: Context-aware Command.Item — first cmdk item that mutates label + onSelect based on router state; pattern documented in the file header."
  - "Pattern 4: Optional callback prop on a panel (onCompareClick) — lets one panel reuse another in a different mode without forking."
  - "Pattern 5: Test fixture for routed panels — SessionsTable.test.tsx now demonstrates the createMemoryHistory + validateSearch UUID validator pattern for asserting router navigation effects without mounting the full route tree."

# Metrics
duration: ~7 min
completed: 2026-05-05
---

# Phase 16 Plan 03: Cmd+K Context-Aware Compare + SessionsTable Per-Row Compare Button Summary

**Two CMPR-03 picker entry points wired: a context-aware Cmd+K Command.Item that branches on `useRouterState` location (Compare sessions / Compare with… / Pick a different session B) plus a 7th SessionsTable column rendering a per-row Compare button — both navigate to `/sessions/compare?a={sid}` with a function-form search update for the picker's `b` selection and a defensive self-compare guard.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-05T11:03:39Z
- **Completed:** 2026-05-05T11:10:24Z
- **Tasks:** 2 (both auto, both passed verify on first run after one test-fixture fix)
- **Files modified:** 4 (2 production + 2 test files; ZERO new files — all extensions to existing modules)

## Accomplishments

- **CMPR-03 closed end-to-end** — both picker entry points required by the requirement are wired and tested. After this plan, only Plan 16-04 (browser human-verify checkpoint) remains for Phase 16.
- **First `useRouterState` selector usage in the codebase** — the Cmd+K Compare item branches on `location.pathname === '/sessions/compare'` + parsed search.a/search.b. Selector form `(s) => s.location` keeps the subscription tight. Sets the pattern for any future contextual cmdk item.
- **Picker drawer (ComparePicker) ships in CommandPalette.tsx as an in-file subcomponent.** Mounts `<Sheet>` + lists `useSessionsList({ range: '7d', limit: 50 })` rows, each as a `<Button>` with aria-label `Compare with session {session_id}`. Self-compare guard: button is `disabled` when row.session_id === currentA.
- **Three Cmd+K label branches** per decisions §1: "Compare sessions" (default), "Compare with…" (on `/sessions/compare?a=X` with no `b`), "Pick a different session B" (both set).
- **SessionsTable extended with a 7th `actions` column** — per-row `<Button variant="ghost" size="sm">Compare</Button>`. Default click navigates to `/sessions/compare?a={r.session_id}` via `useNavigate`. Optional `onCompareClick` prop lets a parent override (used by the picker drawer to call `navigate({ search: (prev) => ({ ...prev, b: sid }) })` instead).
- **Function-form search update locked** — picker selection uses `navigate({ to: '/sessions/compare', search: (prev) => ({ ...prev, b: chosenSid }) })` per Pitfall 4 from 16-RESEARCH.md. No stale-closure render-loop risk.
- **SessionsTable COLUMNS moved from module-level const to component-level useMemo** so callbacks are in scope. Stable referential identity preserved (no DataTable perf regression).
- **6 new vitest cases for CommandPalette** (5 → 11 total): default-label "Compare sessions" navigate, context-aware "Compare with…" on `?a={uuid}`, picker Sheet open, picker selection sets `b` via function-form, self-compare guard disables matching row, "Pick a different session B" label when both set. fetch mock added in `beforeEach` to silence the picker's background `useSessionsList` network call (was emitting ECONNREFUSED noise without affecting pass count).
- **3 new vitest cases for SessionsTable** (6 → 9 total): one Compare button per data row (matched by aria-label `Compare session {sid}` regex), default-navigate target via memory-history router (uses canonical UUIDs because the test router mirrors production validateSearch UUID stripping), `onCompareClick` prop override (handler called, NO navigate).
- **Plan-relevant suite green** — `pnpm vitest run CommandPalette.test.tsx SessionsTable.test.tsx` → 20 passed (20). Full vitest: 292/293 pass; 1 pre-existing SchedulesCard wall-clock failure unchanged from Plan 16-02.
- **`pnpm tsc --noEmit` clean.** `pnpm build` succeeds; CommandPalette and SessionCompareView chunks emit unchanged in size class. No new TypeScript errors.

## Task Commits

1. **Task 1: Extend CommandPalette with context-aware Compare action + test** — `1a16ae6` (feat) — added Compare Command.Item with three label branches, ComparePicker subcomponent, useRouterState location subscription, useCallback wrapping, fetch mock in test beforeEach, 6 new test cases.
2. **Task 2: Add 'actions' column to SessionsTable + test** — `206c9f4` (feat) — 7th 'actions' column with Compare button, useNavigate import, optional onCompareClick prop, COLUMNS moved to useMemo, 3 new test cases including memory-history router navigation assertion.

## Files Created/Modified

### Modified

- `frontend/src/components/ui/CommandPalette.tsx` — +180/-22 net. Added `useRouterState` import + `useSessionsList` + `Sheet` + `useCallback` imports. New ComparePicker subcomponent (≈45 lines). Three label branches per current location. fetch mock-friendly (always-mounts `useSessionsList` regardless of picker open state, so tests can pre-seed via setQueryData).
- `frontend/src/components/ui/__tests__/CommandPalette.test.tsx` — full rewrite (5 → 11 tests). New shared `makeQueryClient()` / `makeRouter({ initialEntries, client })` helpers. Test router now registers `/sessions/compare` with hand-written validateSearch UUID validator mirroring production. Three canonical UUID constants (UUID_A / UUID_OTHER / UUID_PICKER_PRIMARY). beforeEach fetch mock returns empty session-list page to silence picker background refetch.
- `frontend/src/components/panels/SessionsTable.tsx` — +88/-21 net. Added `useNavigate` + `useMemo` imports. New `SessionsTableProps { onCompareClick? }` interface. COLUMNS const → component-level useMemo with [navigate, onCompareClick] deps. New 7th column id='actions' rendering a `<Button>Compare</Button>` with aria-label `Compare session {session_id}` and `e.stopPropagation()` on click.
- `frontend/src/components/panels/__tests__/SessionsTable.test.tsx` — full rewrite (6 → 9 tests). Added memory-history router with hand-written validateSearch UUID validator (mirrors CommandPalette.test.tsx pattern). New makeRouter helper takes the rendered UI tree and a QueryClient, wraps both in a root-route component. Two new tests use canonical UUIDs (`aaaaaaaa-...` / `bbbbbbbb-...`); the onCompareClick override test uses non-UUID `sid00000001` because no router navigation is asserted (only the handler-call shape).

## Decisions Made

All 5 locked decisions came from the plan's `<decisions>` block + the prompt context. Two surfaced during implementation:

- **fetch mock in CommandPalette.test.tsx beforeEach (was implicit, made explicit).** The picker's `useSessionsList` query mounts on every CommandPalette render, not just when the Sheet is open. Without a fetch mock, vitest emitted ECONNREFUSED noise for every test (tests still passed, but stderr was polluted). Added a `beforeEach` mock returning `{ items: [], total: 0, offset: 0, limit: 50 }`. Tests that need rows pre-seed via `client.setQueryData(qk.sessionsList(...), ...)` and the cached value wins over the mocked fetch result. Pattern reusable for any future panel test that mounts a hook with default-enabled refetch.
- **Test router validateSearch must mirror production.** First implementation of the SessionsTable navigate-default test used `session_id='sid00000001'` (non-UUID). The router's `validateSearch` correctly stripped `a=sid00000001` to `undefined`, breaking the assertion. Fix: use canonical UUIDs in the navigate-assertion test. The onCompareClick override test still uses non-UUID because no navigate occurs there. Documented in inline test comments — future tests that exercise the compare URL must seed UUID-shaped session_ids.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] First navigate-target test failed because non-UUID session_id was stripped by test router validateSearch**
- **Found during:** Task 2 (vitest run after SessionsTable + initial test write)
- **Issue:** The test "clicking the row Compare button navigates to /sessions/compare?a={session_id}" failed with `expected undefined to be 'sid00000001'`. Root cause: the test router mirrors the production `/sessions/compare` validateSearch which strips `a` to `undefined` when the value isn't a canonical UUID. My initial fixture used `sid00000001` which the validator (correctly) rejected. The pathname assertion was correct (router did navigate to `/sessions/compare`), only the search.a assertion failed. Production behavior is unchanged — this was test-fixture mismatch, not a SessionsTable bug.
- **Fix:** Use canonical UUIDs (`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`) for the two rows in the navigate-target test. The onCompareClick override test still uses non-UUID `sid00000001` because no navigate occurs there. Documented in inline comments.
- **Files modified:** `frontend/src/components/panels/__tests__/SessionsTable.test.tsx`
- **Verification:** Re-ran vitest, all 9 tests pass. Fixed in-place before task commit.
- **Committed in:** `206c9f4` (Task 2 commit, after fix).

---

**Total deviations:** 1 auto-fixed (1 blocking — test-fixture only).
**Impact on plan:** Zero scope creep. The auto-fix was test-fixture hygiene, not a behavior change. No production code touched after the fix.

## Issues Encountered

- **Pre-existing test failure surfaced in full-suite run (unchanged).** `frontend/src/components/panels/__tests__/SchedulesCard.test.tsx > stale row (last_run_at > 48h ago) gets cmc-schedules-row--stale class` continues to fail — exactly the same wall-clock-dependent assertion documented in Plan 16-02 SUMMARY's `deferred-items.md` entry. Verified pre-existing on the Plan 16-02 final commit (`1506083`). Not introduced by Plan 16-03; out-of-scope per Rule 3 scope boundary.

## User Setup Required

None — no external service configuration required. Both extension points are pure UI changes.

## Verification Receipts

- `cd frontend && pnpm tsc --noEmit` → clean (no output) on both task commits + final state.
- `cd frontend && pnpm vitest run src/components/ui/__tests__/CommandPalette.test.tsx` → **11 passed (11)** in 891ms.
- `cd frontend && pnpm vitest run src/components/panels/__tests__/SessionsTable.test.tsx` → **9 passed (9)** in 1.19s.
- `cd frontend && pnpm vitest run src/components/ui/__tests__/CommandPalette.test.tsx src/components/panels/__tests__/SessionsTable.test.tsx` → **20 passed (20)** combined plan-relevant suite.
- `cd frontend && pnpm vitest run` (full suite) → 292/293 passed; 1 pre-existing SchedulesCard wall-clock failure (verified pre-existing on Plan 16-02 final commit).
- `cd frontend && pnpm build` → builds cleanly; `dist/assets/CommandPalette-*.js` and `dist/assets/SessionCompareView-*.js` chunks emit; no new chunks.
- `grep -c "id: '" frontend/src/components/panels/SessionsTable.tsx` → **7** (was 6, confirms 7-column count matches plan acceptance — `session_id`, `cwd`, `model`, `started_at`, `tokens_input`, `tokens_output`, `actions`).
- `grep -n "Compare" frontend/src/components/ui/CommandPalette.tsx` → 14 hits, includes label constants ("Compare with…" / "Compare sessions" / "Pick a different session B") + ComparePicker subcomponent name + aria-label template.
- pre-commit hooks (frontend tsc) green on both task commits (`1a16ae6`, `206c9f4`).

## Self-Check: PASSED

- Files exist:
  - `frontend/src/components/ui/CommandPalette.tsx` ✓ (modified)
  - `frontend/src/components/ui/__tests__/CommandPalette.test.tsx` ✓ (modified)
  - `frontend/src/components/panels/SessionsTable.tsx` ✓ (modified)
  - `frontend/src/components/panels/__tests__/SessionsTable.test.tsx` ✓ (modified)
- Commits exist:
  - `1a16ae6` ✓ (`feat(16-03): extend CommandPalette with context-aware Compare action`)
  - `206c9f4` ✓ (`feat(16-03): add per-row Compare button to SessionsTable`)
- Acceptance constraints satisfied:
  - Cmd+K Compare item appears under Actions group with three context-aware labels ✓
  - SessionsTable has 7 columns (was 6) — `id: 'actions'` confirmed via grep ✓
  - Click on Cmd+K item navigates to /sessions/compare (default) or opens picker Sheet (context-aware) ✓
  - Click on SessionsTable row Compare navigates to /sessions/compare?a={sid} (default) ✓
  - Self-compare guard: picker row button disabled when row.session_id === currentA ✓
  - vitest coverage: 6 new CommandPalette + 3 new SessionsTable cases ✓
  - `pnpm tsc --noEmit` clean ✓
  - Full vitest 292/293 (only the pre-existing SchedulesCard wall-clock failure remains) ✓

## Next Phase Readiness

- **Plan 16-04 (browser human-verify checkpoint) ready.** All four CMPR requirements (CMPR-01 through CMPR-04 plus CMPR-05) now have wired UX. Plan 16-04 will browser-verify the full flow: open `/activity` → click Compare on a session row → land on `/sessions/compare?a=X` → press Cmd+K → click "Compare with…" → pick session B from the drawer → confirm the two-up SessionCompareView renders.
- **No blockers.** CMPR-03 closed end-to-end (Cmd+K + SessionsTable picker entry points wired and tested).
- **Threat surface unchanged.** Both extension points are pure UI changes — no new network endpoints, no new auth paths, no new file access patterns. The picker reuses an existing read-only endpoint (`useSessionsList` → `GET /api/sessions`). Self-compare guard is defensive UX, not a security boundary (backend already 400s on a==b per Plan 16-01).
- **Phase 17 polish unblocked along this axis.** The Playwright e2e for `/sessions/compare?a=&b=` (POLI-04 success criterion #4) can now use the SessionsTable Compare button as the picker entry point.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The picker reuses `GET /api/sessions` which has been live since Phase 6. Both extension points navigate to the existing `/sessions/compare` route whose validateSearch (Plan 16-02) and backend `/api/sessions/compare` (Plan 16-01) both 400-reject malformed UUIDs and a==b — defense-in-depth is preserved.

---
*Phase: 16-session-comparison*
*Completed: 2026-05-05*
