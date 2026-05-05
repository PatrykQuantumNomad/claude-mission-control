---
phase: 16-session-comparison
plan: 02
subsystem: frontend-routes
tags: [tanstack-router, validateSearch, recharts, panel-card, decimal-string, file-based-routing]

# Dependency graph
requires:
  - phase: 16-session-comparison
    provides: GET /api/sessions/compare endpoint + SessionCompareResponse contract (Plan 16-01)
  - phase: 14-skills-analytics
    provides: trailing-underscore parent-layout opt-out file-based route precedent (skills_.$name.tsx) + Decimal-as-JSON-string display lock + kebab-prefix qk convention (Pitfall 5)
  - phase: 15-alerts
    provides: top-level file-based route precedent (alerts.tsx) + AlertEventsList.test.tsx setQueryData seeding pattern + 4-tier RangeToggle precedent
provides:
  - frontend/src/routes/sessions_.compare.tsx — file-based route /sessions/compare with hand-written validateSearch UUID validator (FIRST validateSearch use in the codebase)
  - frontend/src/components/panels/SessionCompareView.tsx — two-up KPI strip + side-by-side recharts BarChart + skill-set diff (3 columns) + tool-counts DataTable + over-cap EmptyState fallback
  - frontend/src/components/panels/__tests__/SessionCompareView.test.tsx — 6 atomic vitest cases (populated render, over-cap fallback, Decimal-string preservation, idle empty state, three-column diff, tabular-only constraint)
  - frontend/src/lib/api.ts — SessionCompareSide / SkillSetDiff / SessionCompareResponse interfaces + api.sessionCompare(a, b) fetcher
  - frontend/src/lib/queries.ts — qk.sessionCompare + useSessionCompare hook (60s/45s cadence, enabled: Boolean(a && b) idle-gate)
  - frontend/src/routeTree.gen.ts — auto-regenerated to include /sessions_/compare route entry
affects: [16-03-frontend-extension-points, 16-04-cleanup, phase-17-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First `validateSearch` usage in the codebase — hand-written UUID validator (no zod, no valibot — verified absent from package.json). Both `a` and `b` query params strip to `undefined` on non-canonical UUID, so the page never sends bad params to the backend."
    - "Trailing-underscore parent-layout opt-out (sessions_.compare.tsx) — second use of the convention after skills_.$name.tsx. Decision §1 keeps it for forward compat even though no `routes/sessions.tsx` parent exists today."
    - "Idle-state Card-shell render branch when either UUID is undefined — bypasses PanelCard whose `isPending` branch would render a skeleton on a disabled query (`enabled: Boolean(a && b)`). Card chrome is reproduced inline so visuals match the populated state."
    - "Decimal-string display via template literal: `$${side.cost_usd}` — NEVER Number-coerce (Pitfall 1). Tests assert verbatim render of `$0.00009` and `$0.123456789` to lock the contract."
    - "Tool-counts diff sort: largest absolute delta first, alphabetical tie-break (deterministic ordering for snapshot-friendly tests + user scan)."
    - "Over-cap fallback render branch on a 200 response — when over_cap=true on either side, replace the tool-counts DataTable with an EmptyState. KPI strip + skill diff still render (CMPR-04)."
    - "Per-test in-memory router (createMemoryHistory + createRouter) so SkillLink renders without throwing 'useRouterState requires a Router' — pattern reusable for any future panel test that mounts a TanStack Link."

key-files:
  created:
    - frontend/src/routes/sessions_.compare.tsx
    - frontend/src/components/panels/SessionCompareView.tsx
    - frontend/src/components/panels/__tests__/SessionCompareView.test.tsx
  modified:
    - frontend/src/lib/api.ts
    - frontend/src/lib/queries.ts
    - frontend/src/lib/__tests__/queries.test.ts
    - frontend/src/components/panels/index.ts
    - frontend/src/routeTree.gen.ts

key-decisions:
  - "Route filename `routes/sessions_.compare.tsx` (trailing-underscore opt-out) — Plan 16-02 decisions §1, mirrors skills_.$name.tsx Phase 14 Plan 05 precedent."
  - "Hand-written validateSearch — Plan 16-02 decisions §2. NO zod, NO valibot installed. Setting the precedent for future search-param routes."
  - "cost_usd display via template literal `$${side.cost_usd}` — Plan 16-02 decisions §3. Tests assert verbatim Decimal-string render."
  - "Over-cap fallback as EmptyState INSIDE the panel (KPI strip + skill diff still visible) — Plan 16-02 decisions §4 + CMPR-04 contract from Plan 16-01."
  - "NO NavBar entry — Plan 16-02 decisions §5. /sessions/compare is contextual (parallels /skills/$name, not /alerts)."
  - "NO text-diff library, NO raw LLM message rendering — Plan 16-02 decisions §6 + CMPR-05 hard constraint."
  - "Idle gate uses Card-shell bypass (not PanelCard) — Plan 16-02 idle empty state needed deterministic 'Pick two sessions' copy without PanelCard's pending skeleton."

patterns-established:
  - "Hand-written `validateSearch` UUID validator (no schema lib) — surface area paid once, reusable for any future search-param route in the project."
  - "Per-side compose helper functions (SideKpiColumn, SideBarChart) accept `{ label, side }` so both sides render through the same code path. Eliminates duplicate JSX between A and B."
  - "buildToolDiffRows over the union of `tool_counts` keys with deterministic abs-delta-then-alphabetical sort — pattern reusable for any future paired set-diff DataTable."
  - "Per-test makeRouter helper for panels that mount TanStack <Link> — establishes the pattern for SkillRunsTable / TopSkills / future routed panels."

# Metrics
duration: 7m08s
completed: 2026-05-05
---

# Phase 16 Plan 02: Frontend `/sessions/compare` Route + SessionCompareView Panel Summary

**Deep-linkable `/sessions/compare?a={uuid}&b={uuid}` route with hand-written validateSearch + two-up SessionCompareView panel rendering Decimal-safe paired metrics, side-by-side recharts bars, three-column skill diff, tool-counts DataTable, and CMPR-04 over-cap fallback.**

## Performance

- **Duration:** 7m08s
- **Started:** 2026-05-05T10:47:11Z
- **Completed:** 2026-05-05T10:54:19Z
- **Tasks:** 3 (all sequential, all passed verify on first run)
- **Files modified:** 8 (3 created, 5 modified — including auto-regenerated `routeTree.gen.ts`)

## Accomplishments

- Shipped the frontend lib plumbing for Plan 16-01's compare endpoint: `SessionCompareSide` / `SkillSetDiff` / `SessionCompareResponse` interfaces in `lib/api.ts`, `api.sessionCompare(a, b)` fetcher, `qk.sessionCompare` kebab-prefix key, `useSessionCompare` hook with 60s/45s cadence and `enabled: Boolean(a && b)` idle-gate.
- Extracted `SessionCompareView` into the `panels/` directory (testability — Plan 14 Plan 05 precedent). Panel composes two-up KPI strip (cost/duration/tokens/tools/messages/model/outcome StatePill), side-by-side recharts BarChart with explicit `height={220}` (Pitfall 8), three-column skill-set diff with `<Link to="/skills/$name">` cells, and a tool-counts DataTable with sorted `Δ (B−A)` column.
- Hard-locked CMPR-04 over-cap fallback: when `over_cap=true` on either side or top-level, the tool-counts DataTable is replaced with an `EmptyState` while the KPI strip + skill diff still render (no refusal, no loss of summary metrics).
- Hard-locked CMPR-05 tabular-only constraint: NO `react-diff-viewer`, NO `jsdiff`, NO markdown-message rendering, NO additional fetch beyond `useSessionCompare`. Verified via `grep -rn 'react-diff-viewer\|jsdiff\|"diff"' frontend/src` — only the constraint comment in `SessionCompareView.tsx` matches.
- First `validateSearch` use in the codebase: hand-written UUID validator in `routes/sessions_.compare.tsx` strips non-canonical query params to `undefined`. Trailing-underscore filename (`sessions_.compare.tsx`) opts out of any future `routes/sessions.tsx` parent layout (decisions §1).
- Six atomic vitest cases covering: populated render (CMPR-02), over-cap fallback (CMPR-04), Decimal-string preservation (Pitfall 1 — verbatim assertion of `$0.00009` and `$0.123456789`), idle empty state, three-column skill diff, and tabular-only constraint (CMPR-05).
- queries.test.ts surface-area pin bumped 31 → 32 (added `useSessionCompare`).
- Frontend full-suite: 284/285 vitest cases pass (1 pre-existing SchedulesCard wall-clock-dependent test fails on clean main — verified via `git stash` checkpoint; tracked in deferred-items.md).
- `pnpm build` succeeds; `routeTree.gen.ts` auto-regenerated with `/sessions_/compare` (id) → `/sessions/compare` (path).

## Task Commits

1. **Task 1: api.sessionCompare fetcher + useSessionCompare hook + extend types** — `ed9a0fb` (feat) — interfaces, fetcher, hook, surface-area bump.
2. **Task 2: Build SessionCompareView panel + 6 vitest cases** — `920c09f` (feat) — panel + tests + barrel export.
3. **Task 3: Create file-based route + validateSearch + regen route tree** — `db7622a` (feat) — route file + auto-regenerated routeTree.gen.ts.

## Files Created/Modified

### Created

- `frontend/src/routes/sessions_.compare.tsx` — File-based route `/sessions/compare` with `createFileRoute('/sessions_/compare')`. Trailing-underscore parent-layout opt-out. Hand-written `validateSearch` UUID validator (`UUID_RE` regex + `typeof raw.a === 'string'` strict check). Renders `<SessionCompareView a={a} b={b} />` inside a `cmc-page` shell with breadcrumb back to `/activity`. +69 lines.
- `frontend/src/components/panels/SessionCompareView.tsx` — Two-up paired-metrics panel. Composition: idle Card-shell empty state (when `!a || !b`), `PanelCard` wrapper otherwise; body composes `SideKpiColumn` × 2 → `SideBarChart` × 2 → `SkillDiffRow` (3 columns) → `ToolCountsDiff` (DataTable or EmptyState). Per-side helper functions accept `{ label, side }` so both sides render through the same code path. `buildToolDiffRows` returns rows sorted by `|delta|` desc with alphabetical tie-break. cost_usd is rendered via template literal `$${side.cost_usd}` — NEVER Number-coerced. +432 lines.
- `frontend/src/components/panels/__tests__/SessionCompareView.test.tsx` — 6 vitest cases. Helpers: `makeClient()`, `makeRouter(children)` (per-test in-memory router so `<Link>` mounts), `Wrap`, `makeSide(overrides)`, `makeFixture(a, b, topLevel)`. Defaults: side A `cost_usd='0.0247'`, side B `cost_usd='0.0512'`, both under cap. Tests pin: populated render, over-cap fallback (KPIs survive), Decimal-string verbatim (`$0.00009` would round to `$0.00` if Number-coerced + toFixed(2)), idle pick-two empty state, three-column skill diff, tabular-only structured render. All 6 pass on first run. +302 lines.

### Modified

- `frontend/src/lib/api.ts` — Added `SessionCompareSide`, `SkillSetDiff`, `SessionCompareResponse` interfaces (mirror Plan 16-01 backend Pydantic schemas; `cost_usd: string` Decimal-as-JSON-string). Added `api.sessionCompare(a, b)` fetcher next to `api.sessionDetails`. +43 lines.
- `frontend/src/lib/queries.ts` — Added `SessionCompareResponse` to import block. Added `qk.sessionCompare(a, b) => ['session-compare', a, b]` (kebab-prefix per Pitfall 5). Added `useSessionCompare(a, b)` hook with 60s/45s cadence and `enabled: Boolean(a && b)`. +25 lines.
- `frontend/src/lib/__tests__/queries.test.ts` — Surface-area pin bumped 31 → 32. Added `useSessionCompare` to the imported names list and the `exported` array. +4 lines, -3.
- `frontend/src/components/panels/index.ts` — Added barrel export `export { SessionCompareView } from './SessionCompareView'` with Phase 16 Plan 02 comment. +3 lines.
- `frontend/src/routeTree.gen.ts` — Auto-regenerated by `@tanstack/router-plugin/vite` on `pnpm build`. Added `SessionsCompareRouteImport`, `SessionsCompareRoute`, three `'/sessions/compare' | '/sessions_/compare'` entries across the `FileRoutesByFullPath` / `FileRoutesByTo` / `FileRoutesById` interfaces, and a new `'/sessions_/compare'` entry in `FileRouteTypes`. +18 lines, 0 -. NO hand edits.

## Decisions Made

All 7 locked decisions came from the plan's `<decisions>` block + Plan 16-01 SUMMARY's "Next Phase Readiness". Two surfaced in implementation:

- **Idle-state render bypasses `PanelCard`.** PanelCard's `isPending` branch renders a skeleton, which would surface incorrectly when the query is `enabled: false` (the `useSessionCompare` idle state). Implemented an explicit Card-shell early return when `!a || !b` that reproduces PanelCard's chrome (CardHeader + reqId label + CardTitle + CardDescription) and renders an `EmptyState heading="Pick two sessions"`. Visual continuity with the populated state, deterministic copy, no skeleton flash.
- **Per-test in-memory router.** Component tests must mount inside a TanStack Router context because `SessionCompareView` renders `<Link to="/skills/$name">` cells. Pattern: `createRootRoute({ component: () => children })` + `createMemoryHistory({ initialEntries: ['/'] })` + `createRouter()` per `Wrap`, wrapped in `<RouterProvider>` inside `QueryClientProvider`. RouterProvider mounts asynchronously, so synchronous `getByText` calls on the very first render fail; tests use `waitFor(() => screen.getByText(...))` for the initial assertions. Pattern is reusable for any future panel test that mounts a Link.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] First test run failed because RouterProvider mounts asynchronously**
- **Found during:** Task 2 (vitest run after panel + initial test write)
- **Issue:** Two of six tests (`renders both sides + skill-set three-column diff` and `renders the pick-two empty state when either UUID is undefined`) failed with `Unable to find an element with the text: CMPR-02 ... <body><div /></body>`. Root cause: my `Wrap` component mounts `<RouterProvider>` which renders its tree asynchronously; the synchronous `screen.getByText('CMPR-02')` ran before the first commit landed. The other four tests passed because they already wrapped early assertions in `waitFor`.
- **Fix:** Wrapped the initial `screen.getByText('CMPR-02')` assertion in `waitFor` for both failing tests. Subsequent assertions in the same test stay synchronous (the tree is hydrated by then). No production-code change.
- **Files modified:** `frontend/src/components/panels/__tests__/SessionCompareView.test.tsx`
- **Verification:** All 6 tests pass on second run (`pnpm vitest run src/components/panels/__tests__/SessionCompareView.test.tsx` — `Tests 6 passed (6)` in 800ms).
- **Committed in:** `920c09f` (Task 2 commit, after fix).

---

**Total deviations:** 1 auto-fixed (1 blocking — test scaffolding only).
**Impact on plan:** Zero scope creep. The auto-fix was test-scaffolding hygiene, not a behavior change. No production code touched.

## Issues Encountered

- **Pre-existing test failure surfaced in full-suite run.** `frontend/src/components/panels/__tests__/SchedulesCard.test.tsx > stale row (last_run_at > 48h ago) gets cmc-schedules-row--stale class` fails with `expected true to be false` on a clean main-branch tree (verified via `git stash && pnpm vitest run` on `ed9a0fb`). The assertion compares a freshness boundary against wall-clock time and is time-of-day-dependent. NOT caused by Phase 16 changes; logged in `.planning/phases/16-session-comparison/deferred-items.md`. Out-of-scope for 16-02 per Rule 3 scope boundary.

## User Setup Required

None — no external service configuration required. The route is auto-registered via `@tanstack/router-plugin/vite` on `pnpm build`.

## Verification Receipts

- `cd frontend && pnpm tsc --noEmit` → clean (no output) on every task commit + final state.
- `cd frontend && pnpm vitest run src/lib/__tests__/queries.test.ts` → **15 passed** (surface area 32 confirmed).
- `cd frontend && pnpm vitest run src/components/panels/__tests__/SessionCompareView.test.tsx` → **6 passed** (all CMPR-02 / CMPR-04 / CMPR-05 / Pitfall 1 cases green).
- `cd frontend && pnpm vitest run src/components/panels/__tests__/SessionCompareView.test.tsx src/lib/__tests__/queries.test.ts` → **21 passed** (combined plan-relevant suite).
- `cd frontend && pnpm vitest run` (full suite) → 284/285 passed; 1 pre-existing SchedulesCard wall-clock failure (verified pre-existing on clean tree).
- `cd frontend && pnpm build` → builds cleanly; `dist/assets/sessions_.compare-*.js` chunk emitted; `routeTree.gen.ts` auto-regenerated.
- `grep -n "/sessions/compare\|sessions_/compare" frontend/src/routeTree.gen.ts` → 5 hits (id, path, fullPath, fileRoutesByFullPath, fileRoutesById entries).
- `grep -rn 'react-diff-viewer\|jsdiff\|"diff"\|from .diff.' frontend/src` → only the constraint comment in `SessionCompareView.tsx` matches (CMPR-05 enforced — no diff library imported).
- pre-commit hooks (frontend tsc) green on all three task commits (`ed9a0fb`, `920c09f`, `db7622a`).

## Self-Check: PASSED

- Files exist:
  - `frontend/src/routes/sessions_.compare.tsx` ✓ (created)
  - `frontend/src/components/panels/SessionCompareView.tsx` ✓ (created)
  - `frontend/src/components/panels/__tests__/SessionCompareView.test.tsx` ✓ (created)
  - `frontend/src/lib/api.ts` ✓ (modified — SessionCompare* interfaces + fetcher)
  - `frontend/src/lib/queries.ts` ✓ (modified — qk.sessionCompare + useSessionCompare)
  - `frontend/src/lib/__tests__/queries.test.ts` ✓ (modified — surface-area bumped to 32)
  - `frontend/src/components/panels/index.ts` ✓ (modified — SessionCompareView barrel export)
  - `frontend/src/routeTree.gen.ts` ✓ (auto-regenerated)
- Commits exist:
  - `ed9a0fb` ✓ (`feat(16-02): add api.sessionCompare fetcher + useSessionCompare hook`)
  - `920c09f` ✓ (`feat(16-02): add SessionCompareView panel + 6 vitest cases`)
  - `db7622a` ✓ (`feat(16-02): add /sessions/compare file-based route + validateSearch`)

## Next Phase Readiness

- **Plan 16-03 (frontend extension points) ready:** the route + panel + hook are live. Plan 16-03 will extend `SessionsTable.tsx` with a "Compare" row action that navigates to `/sessions/compare?a={sid}` (recommended by 16-RESEARCH §SessionsTable row action) and add a "Compare with…" item to `CommandPalette.tsx` (16-RESEARCH §Cmd+K extension Option B). The TanStack Link form to use is `navigate({ to: '/sessions/compare', search: (prev) => ({ ...prev, b: chosenSid }) })` per Pitfall 4 (function-form to avoid stale-closure render loops).
- **Plan 16-04 (docs cleanup) ready:** the cost-module path drift documented in Plan 16-01 SUMMARY (REQUIREMENTS.md / ROADMAP.md still cite `cmc/cost/engine.py` which doesn't exist) is unchanged by this plan. 16-04 cleans up the citation.
- **Threat surface:** the new `validateSearch` precedent is defense-in-depth — the backend already 400-rejects malformed UUIDs (Plan 16-01 error contract). Both layers strip / reject; no new threat surface.
- **Deferred:** pre-existing SchedulesCard wall-clock test failure logged for Phase 17 polish.
- **No blockers.**

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The route is a read-only GET deep-link with both query params strip-validated client-side AND server-side.

---
*Phase: 16-session-comparison*
*Completed: 2026-05-05*
