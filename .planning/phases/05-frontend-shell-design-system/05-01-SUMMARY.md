---
phase: 05-frontend-shell-design-system
plan: 01
subsystem: ui
tags: [react-19, vite, vitest-4, react-testing-library-16, happy-dom, tanstack-router, tanstack-query, framer-motion, radix-ui, cmdk, react-error-boundary, design-tokens, css-variables, jsdom]

# Dependency graph
requires:
  - phase: 01-foundation-database
    provides: Vite + React 19 + TanStack Router skeleton with /api proxy to FastAPI on :8765
  - phase: 03-read-only-apis
    provides: 23 GET endpoints (sessions, observability, MCP, skills) — typed by api.ts
  - phase: 04-stateful-apis
    provides: HITL/tasks/schedules/ESTOP endpoints — typed by api.ts
provides:
  - Full UI-SPEC token block (--cmc-* CSS variables) + radial-gradient body backdrop
  - Inter + JetBrains Mono Google Fonts loaded via index.html
  - AppShell + NavBar with brand 'Mission Control' + 3 routes (/, /activity, /skills) + Cmd+K trigger affordance
  - QueryClientProvider + ErrorBoundary mounted at route-tree root with shell error fallback (UI-SPEC §Copywriting verbatim)
  - lib/storage.ts (cmc.* prefixed localStorage wrapper, never throws)
  - lib/api.ts (fetchJson<T> + ApiError + api object covering every Phase 3/4 endpoint)
  - Vitest 4 + RTL 16 + happy-dom test harness with all 5 RESEARCH pitfalls pre-mitigated
  - Wave 1 entry contracts: render() helper at src/test/utils, MotionConfig wrapping, NODE_OPTIONS=--no-experimental-webstorage required for tests
affects: [05-02-layout-primitives, 05-03-interactive-primitives, 05-04-page-grids, 06-data-binding]

# Tech tracking
tech-stack:
  added:
    runtime:
      - "@tanstack/react-query@^5.100.5"
      - "framer-motion@^12.38.0"
      - "@radix-ui/react-dialog@^1.1.15"
      - "@radix-ui/react-tooltip@^1.2.8"
      - "@radix-ui/react-collapsible@^1.1.12"
      - "cmdk@^1.1.1"
      - "lucide-react@^1.11.0"
      - "react-error-boundary@^6.1.1"
    dev:
      - "vitest@^4.1.5"
      - "@vitest/coverage-v8@^4.1.5"
      - "@testing-library/react@^16.3.2"
      - "@testing-library/dom@^10.4.1"
      - "@testing-library/jest-dom@^6.9.1"
      - "@testing-library/user-event@^14.6.1"
      - "happy-dom@^20.9.0"
      - "jsdom@^29.0.2"
  patterns:
    - "Design tokens as CSS custom properties on :root (--cmc-* prefix) — NEVER inline color literals in components"
    - "Pure-presentational AppShell — providers (QueryClient/ErrorBoundary) mount in __root.tsx, not in AppShell, so AppShell stays trivially testable"
    - "TanStack file routes with createFileRoute — routeTree.gen.ts regenerated via vite build (router-plugin), committed (not gitignored)"
    - "Custom render() in src/test/utils wraps every component tree in MotionConfig reducedMotion='always' — Phase 5 component tests MUST import from this module, never directly from @testing-library/react"
    - "Async router bootstrap pattern in tests: await router.load() before assertions; getByText for elements present at first paint, findByText/findByRole for elements that appear after the router transition resolves"
    - "fetchJson<T>() + api object as a typed fetcher map — Phase 6 layers React Query on top via useQuery({ queryKey, queryFn: api.endpoint }) without router code changes"
    - "Namespaced storage wrapper (cmc.* prefix) with silent error handling — best-effort cache; never throws"

key-files:
  created:
    - "frontend/vitest.config.ts (flat config — does NOT mergeConfig with vite.config to avoid tanstackRouter regen during tests)"
    - "frontend/src/test/setup.ts (act bridge + Radix shims + per-test cleanup)"
    - "frontend/src/test/utils.tsx (render with MotionConfig wrapper)"
    - "frontend/src/test/__tests__/setup.test.ts (5 harness smoke tests)"
    - "frontend/src/lib/storage.ts (cmc.* localStorage wrapper)"
    - "frontend/src/lib/api.ts (typed fetcher infra + 40+ endpoint entries)"
    - "frontend/src/lib/__tests__/storage.test.ts (5 storage tests)"
    - "frontend/src/components/shell/AppShell.tsx"
    - "frontend/src/components/shell/NavBar.tsx"
    - "frontend/src/components/shell/__tests__/AppShell.test.tsx"
    - "frontend/src/components/shell/__tests__/NavBar.test.tsx"
    - "frontend/src/routes/activity.tsx"
    - "frontend/src/routes/skills.tsx"
  modified:
    - "frontend/package.json (16 new deps + 4 new scripts incl. NODE_OPTIONS=--no-experimental-webstorage)"
    - "frontend/package-lock.json (lockfile updates)"
    - "frontend/tsconfig.json (types: ['vitest/globals'] + include vitest.config.ts)"
    - "frontend/index.html (preconnect + Google Fonts CDN link for Inter + JetBrains Mono)"
    - "frontend/src/styles.css (replaced Phase 1 stub with full UI-SPEC token block + radial-gradient body + .cmc-shell/navbar/main classes)"
    - "frontend/src/main.tsx (wrap RouterProvider in <StrictMode>)"
    - "frontend/src/routes/__root.tsx (replaced Phase 1 stub with QueryClientProvider + ErrorBoundary + AppShell + Outlet)"
    - "frontend/src/routes/index.tsx (replaced 'Mission Control online' stub with Command page placeholder)"
    - "frontend/src/routeTree.gen.ts (regenerated by vite build to include /activity + /skills routes)"

key-decisions:
  - "Phase 5 deviation (Rule 3): test scripts run with NODE_OPTIONS=--no-experimental-webstorage. Node 25.x exposes a bare globalThis.localStorage = {} (no methods!) by default, which shadows happy-dom's Storage Proxy that Vitest's populateGlobal injects — leaves window.localStorage.setItem undefined. Disabling the experimental flag restores happy-dom's full Storage. Documented in vitest.config.ts comment. Wave 1+2 plans can take this for granted; jsdom 29 is also installed as a backup if happy-dom 21+ fixes integration."
  - "vitest.config.ts is FLAT (does NOT mergeConfig with vite.config). Reason: vite.config pulls tanstackRouter plugin which regenerates routeTree.gen.ts on every Vite invocation — undesirable during test runs. We explicitly opt back into @vitejs/plugin-react for JSX/TSX transform."
  - "AppShell does NOT mount QueryClientProvider/ErrorBoundary directly. Those mount one level up at the route-tree root in routes/__root.tsx so AppShell is trivially unit-testable without provider scaffolding. Wave 1 layout primitives can render against AppShell in isolation."
  - "lib/api.ts uses unknown for response bodies whose Pydantic shapes Phase 6 will narrow per-endpoint. Only HealthResponse + SessionListResponse have full types in v1 (most likely first consumers). Phase 6 tightens field-by-field as it consumes endpoints — avoids speculative typing under tsconfig strict mode."
  - "react-error-boundary v6 changed FallbackProps.error from Error to unknown. ShellErrorFallback narrows defensively with instanceof Error / typeof string / JSON.stringify fallback so non-Error throws still produce a readable message string."
  - "IS_REACT_ACT_ENVIRONMENT bridge in src/test/setup.ts uses ONE shared property descriptor on globalThis with a backing variable (not a setter that re-writes globalThis.self). In happy-dom + Node, globalThis.self === globalThis, so a setter pattern recurses to stack overflow. Defensive guard: only install on self if it is a distinct object reference (other env shapes)."
  - "Component test pattern locked: in-memory routers via createRoute + createMemoryHistory, await router.load() BEFORE render to settle async transitions, use findByText for the first assertion (waits for paint) and getBy* for follow-ups. Wave 1+ component tests should follow this shape."

patterns-established:
  - "CSS variable design tokens (Pattern 1): UI-SPEC §Token Map fully expressed on :root in styles.css. Components reference var(--cmc-*) — never inline literals."
  - "AppShell vs providers (Pattern 2): AppShell is layout-only; providers (QueryClient, ErrorBoundary, future Tooltip.Provider) mount in __root.tsx around <Outlet />."
  - "Async router test bootstrap (Pattern 3): in-memory router with createMemoryHistory + await router.load() + findByText for first assertion."
  - "Custom render helper (Pattern 4): src/test/utils.tsx is the canonical RTL render with MotionConfig wrapper. All component tests import from here, NOT from @testing-library/react directly."
  - "Typed fetcher map (Pattern 5): api.ts exports an `as const` object whose keys are endpoint nicknames and values are typed async fns. Phase 6 layers React Query without touching this file."
  - "Namespaced silent storage (Pattern 6): cmc.* prefix on localStorage; try/catch on every read/write/remove; never throws to caller."

# Metrics
duration: 11min
completed: 2026-04-26
---

# Phase 5 Plan 01: Frontend Shell Foundation Summary

**Vite + React 19 dashboard shell with full UI-SPEC token system, QueryClient/ErrorBoundary mounted on the route-tree root, three navigable file routes, lib/storage + lib/api Wave-1 entry contracts, and a Vitest 4 + happy-dom + RTL 16 test harness with all 5 RESEARCH pitfalls pre-mitigated (12 tests green, zero act() warnings).**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-26T23:51:55Z
- **Completed:** 2026-04-26T~20:04Z (local)
- **Tasks:** 3 / 3 (all autonomous)
- **Files created:** 13
- **Files modified:** 9

## Accomplishments

- 16 deps installed at locked versions (8 runtime + 8 dev) with explicit Radix Dialog dedupe at ^1.1.15 (Pitfall 4 mitigated; npm ls shows ONE entry plus a `deduped` reference under cmdk)
- @emotion/is-prop-valid is absent transitively (Pitfall 7 clean — no override needed in v1)
- styles.css fully replaced with UI-SPEC tokens + radial-gradient body backdrop + accessibility/motion-contract media queries; Phase 1 utility classes (cmc-shell/cmc-header/cmc-main) deleted, html/body/#root sizing preserved per UI-SPEC carve-out
- Inter + JetBrains Mono loaded via Google Fonts CDN with preconnect hints
- AppShell + NavBar + 3 routes (/, /activity, /skills) — TanStack Router routeTree.gen.ts regenerated by router-plugin and committed
- QueryClientProvider (staleTime 30s, refetchOnWindowFocus false) + ErrorBoundary with UI-SPEC verbatim "Couldn't reach the dashboard server. / cc start / cc doctor" copy mounted at route-tree root
- main.tsx wraps RouterProvider in <StrictMode> (Pitfall 3 — Plan 05-03 useEffect cleanup will be surfaced)
- lib/storage.ts (cmc.* prefixed localStorage wrapper, never throws) — 5/5 tests green
- lib/api.ts typed fetcher infrastructure exposing fetchJson<T>, ApiError class, and an `api` const map covering 40+ Phase 3/4 endpoints (system, sessions, observability, MCP, skills, HITL, tasks, schedules, ESTOP, sync)
- Vitest 4 + happy-dom + RTL 16 test harness with all 5 RESEARCH pitfalls pre-mitigated:
  - Pitfall 1: HTMLElement.prototype.{has,release,set}PointerCapture, scrollIntoView, ResizeObserver, matchMedia shims
  - Pitfall 2: src/test/utils.tsx render() wraps MotionConfig reducedMotion='always'
  - Pitfall 4: dedupe verified
  - Pitfall 5: IS_REACT_ACT_ENVIRONMENT bridge (zero act() warnings observed)
  - Pitfall 8: afterEach cleanup() + window.localStorage.clear()
- 12 tests passing (5 storage + 5 setup-harness + 1 NavBar + 1 AppShell). `npm run test`, `npm run typecheck`, `npm run build` all exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Phase 5 deps + Vitest config + global test setup** — `0e7076f` (chore)
2. **Task 2: Land UI-SPEC tokens + Google Fonts + lib/storage + lib/api** — `10e6c44` (feat)
3. **Task 3: Build AppShell + NavBar + 3 file routes; QueryClientProvider + ErrorBoundary** — `4e46078` (feat)

## Files Created/Modified

### Created (13)
- `frontend/vitest.config.ts` — flat Vitest 4 config (happy-dom env + setupFiles + v8 coverage). Comment explains why we don't mergeConfig with vite.config.
- `frontend/src/test/setup.ts` — act() bridge (Pitfall 5 with happy-dom self===globalThis recursion guard), Radix/jsdom shims (Pitfall 1+2), per-test cleanup (Pitfall 8), jest-dom matchers
- `frontend/src/test/utils.tsx` — render() with MotionConfig wrapper; re-exports RTL + userEvent
- `frontend/src/test/__tests__/setup.test.ts` — 5 harness smoke tests
- `frontend/src/lib/storage.ts` — cmc.* localStorage wrapper
- `frontend/src/lib/api.ts` — fetchJson<T> + ApiError + api object (Phase 3/4 coverage)
- `frontend/src/lib/__tests__/storage.test.ts` — 5 storage tests
- `frontend/src/components/shell/AppShell.tsx` — pure-presentational shell
- `frontend/src/components/shell/NavBar.tsx` — Primary nav with brand + 3 Links + Cmd+K trigger
- `frontend/src/components/shell/__tests__/AppShell.test.tsx` — async-router-bootstrap test
- `frontend/src/components/shell/__tests__/NavBar.test.tsx` — async-router-bootstrap test
- `frontend/src/routes/activity.tsx` — placeholder file route
- `frontend/src/routes/skills.tsx` — placeholder file route

### Modified (9)
- `frontend/package.json` — 16 new deps; scripts now include test/test:watch/test:coverage/typecheck (all NODE_OPTIONS=--no-experimental-webstorage prefixed)
- `frontend/package-lock.json` — lockfile updates
- `frontend/tsconfig.json` — types: ['vitest/globals'] + include vitest.config.ts
- `frontend/index.html` — preconnect + Google Fonts CDN link
- `frontend/src/styles.css` — full UI-SPEC token block + body radial gradients + .cmc-shell/navbar/brand/navlink/cmdk-trigger/main classes; Phase 1 stub classes deleted
- `frontend/src/main.tsx` — StrictMode wrapper around RouterProvider
- `frontend/src/routes/__root.tsx` — replaced stub with QueryClientProvider + ErrorBoundary + AppShell + Outlet
- `frontend/src/routes/index.tsx` — replaced "Mission Control online." stub with Command page placeholder
- `frontend/src/routeTree.gen.ts` — regenerated by vite build to include /activity + /skills routes

## Resolved Versions (from version verification step)

All 16 packages resolved EXACTLY at the floor of the RESEARCH range — no patch drift:

| Package | Resolved |
|---|---|
| @tanstack/react-query | 5.100.5 |
| framer-motion | 12.38.0 |
| @radix-ui/react-dialog | 1.1.15 |
| @radix-ui/react-tooltip | 1.2.8 |
| @radix-ui/react-collapsible | 1.1.12 |
| cmdk | 1.1.1 |
| lucide-react | 1.11.0 |
| react-error-boundary | 6.1.1 |
| vitest | 4.1.5 |
| @vitest/coverage-v8 | 4.1.5 |
| @testing-library/react | 16.3.2 |
| @testing-library/dom | 10.4.1 |
| @testing-library/jest-dom | 6.9.1 |
| @testing-library/user-event | 14.6.1 |
| happy-dom | 20.9.0 |
| jsdom | 29.0.2 |

## Pitfall Status

| Pitfall | Mitigation | Status |
|---|---|---|
| 1: jsdom/happy-dom missing pointer capture, ResizeObserver, matchMedia | Shims in src/test/setup.ts guarded by `if (typeof window !== 'undefined')` | Active |
| 2: framer-motion non-determinism in tests | render() in src/test/utils.tsx wraps MotionConfig reducedMotion='always' | Active |
| 3: missing useEffect cleanup surfaces in StrictMode | main.tsx wraps RouterProvider in StrictMode | Active |
| 4: Radix Dialog double-bundling via cmdk | Direct ^1.1.15 install — npm ls shows ONE entry deduped from cmdk | Verified |
| 5: act() warnings from IS_REACT_ACT_ENVIRONMENT split between globalThis and self | Single Object.defineProperty bridge with shared backing variable + recursion guard | Active (zero warnings observed) |
| 6: stale routeTree.gen.ts after adding routes | vite build runs router-plugin which regenerates the file; routeTree committed | Verified |
| 7: @emotion/is-prop-valid hoisted via framer-motion | Absent transitively — no override needed | Clean |
| 8: RTL leaks DOM nodes between tests | afterEach cleanup() + window.localStorage.clear() | Active |

## Decisions Made

(See `key-decisions` in frontmatter — copied here for narrative readability.)

1. **NODE_OPTIONS=--no-experimental-webstorage on test scripts (Rule 3 deviation).** Node 25.x exposes a bare `globalThis.localStorage = {}` (zero methods!) by default via experimental Web Storage. That bare object shadows happy-dom's Storage Proxy that Vitest's `populateGlobal` would otherwise inject — leaving `window.localStorage.setItem` undefined inside tests and crashing every Phase 5+ test that touches storage. Disabling the experimental flag restores happy-dom's full Storage. Documented inline in `vitest.config.ts`. Wave 1+2 take this for granted; the npm scripts already carry the flag.
2. **Flat vitest.config.ts (does NOT mergeConfig vite.config).** Reason: vite.config pulls tanstackRouter plugin which regenerates routeTree.gen.ts on every Vite invocation. Test runs touching disk on a generated file is undesirable. We explicitly opt back into `@vitejs/plugin-react()` for JSX/TSX transform.
3. **AppShell is pure-presentational.** QueryClientProvider + ErrorBoundary mount one level up at the route-tree root so AppShell is unit-testable without provider scaffolding. Wave 1 layout primitives can render against AppShell in isolation.
4. **lib/api.ts uses `unknown` for response bodies** whose Pydantic shapes Phase 6 will narrow per-endpoint. Only HealthResponse + SessionListResponse have full types in v1.
5. **react-error-boundary v6 FallbackProps.error is `unknown`** — narrowed defensively in ShellErrorFallback (instanceof Error / typeof string / JSON.stringify fallback).
6. **IS_REACT_ACT_ENVIRONMENT bridge** uses ONE shared property descriptor with a backing variable (not a setter that re-writes `globalThis.self`). In happy-dom + Node, `globalThis.self === globalThis`, so a setter pattern recurses to stack overflow. The recursion guard (`globalThis.self !== globalThis`) is defensive for other env shapes.
7. **Component test pattern:** in-memory routers via `createRoute` + `createMemoryHistory`, `await router.load()` BEFORE render, `findByText` for the first assertion. Wave 1+ component tests should follow this shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Node 25.x experimental Web Storage shadows happy-dom localStorage**
- **Found during:** Task 1 (running first smoke test of harness)
- **Issue:** Node v25.9.0 ships `--webstorage` enabled by default. It plants a bare `globalThis.localStorage = {}` (no Storage methods at all) before Vitest can populate the global from happy-dom's Window. Result: `window.localStorage.setItem` was `undefined`, breaking every test that touched storage (immediate failures: storage.test.ts, AppShell tests, NavBar tests, AND the per-test `afterEach(cleanup + localStorage.clear)` itself — the entire harness DOA).
- **Diagnosis path:** First saw `window.localStorage.clear is not a function`, suspected happy-dom 20 regression. Ran `node -e "console.log(typeof globalThis.localStorage)"` — returned `'object {}'` BEFORE any test code loaded. Confirmed with `node --no-experimental-webstorage -e "..."` returning `undefined undefined`. Root cause: Node 25 default experimental flag.
- **Fix:** Prefixed every test-related npm script with `NODE_OPTIONS=--no-experimental-webstorage`. Tested with happy-dom — all green.
- **Files modified:** frontend/package.json (test/test:watch/test:coverage scripts), frontend/vitest.config.ts (inline comment documenting why)
- **Verification:** `npm run test` runs 12/12 green, `window.localStorage.setItem` is now a function inside tests
- **Committed in:** 0e7076f (Task 1 commit)

**2. [Rule 1 - Bug] Stack overflow in IS_REACT_ACT_ENVIRONMENT setter (initial implementation)**
- **Found during:** Task 1 (first run after creating setup.ts per RESEARCH §Pitfall 5 verbatim)
- **Issue:** RESEARCH-prescribed setter wrote `globalThis.self.IS_REACT_ACT_ENVIRONMENT = v` from inside the setter, but in happy-dom + Node `globalThis.self === globalThis` — so the assignment re-fired the same setter, recursing until "Maximum call stack size exceeded".
- **Fix:** Replaced the setter with a single Object.defineProperty descriptor backed by a private variable `_actEnv`. Both `globalThis` and (only if distinct) `globalThis.self` install the same descriptor. No nested write-through.
- **Files modified:** frontend/src/test/setup.ts (sections (a) IS_REACT_ACT_ENVIRONMENT bridge)
- **Verification:** Setup smoke test asserts `globalThis.IS_REACT_ACT_ENVIRONMENT === true && globalThis.self.IS_REACT_ACT_ENVIRONMENT === true` — both pass without recursion.
- **Committed in:** 0e7076f (Task 1 commit)

**3. [Rule 1 - Bug] react-error-boundary v6 typed error as unknown (not Error)**
- **Found during:** Task 3 (`npm run build` typecheck)
- **Issue:** RESEARCH-prescribed ShellErrorFallback signature `{ error: Error; resetErrorBoundary }` mismatched react-error-boundary v6's `FallbackProps` where `error: unknown`. tsc -b errored with "Type 'unknown' is not assignable to type 'Error'".
- **Fix:** Imported `type FallbackProps` from react-error-boundary and used it as the function param type. Narrowed `error` defensively with instanceof Error / typeof string / JSON.stringify fallback so the rendered message stays a string regardless of what was thrown.
- **Files modified:** frontend/src/routes/__root.tsx
- **Verification:** `npm run typecheck` exits 0
- **Committed in:** 4e46078 (Task 3 commit)

**4. [Rule 1 - Bug] Async router bootstrap not waited in initial test pattern**
- **Found during:** Task 3 (first test run of NavBar.test.tsx + AppShell.test.tsx)
- **Issue:** RESEARCH test pattern called `render(<RouterProvider router={router} />)` and immediately assertion'd `getByText('Mission Control')`. Result: `<body><div /></body>` — the router hadn't completed its first transition synchronously. TanStack Router 1.x bootstrap is async.
- **Fix:** Test now: (a) await `router.load()` before render to settle the first transition, (b) use `findByText` for the first assertion (waits for the next paint), (c) follow-up assertions use `getByText` because by that point the tree is settled. Documented as pattern for future Wave 1+ component tests.
- **Files modified:** frontend/src/components/shell/__tests__/NavBar.test.tsx, frontend/src/components/shell/__tests__/AppShell.test.tsx
- **Verification:** Both tests green; full suite 12/12
- **Committed in:** 4e46078 (Task 3 commit)

**5. [Rule 1 - Bug] tsc -b ran BEFORE router-plugin regenerated routeTree.gen.ts**
- **Found during:** Task 3 (`npm run build`)
- **Issue:** `npm run build` is `tsc -b && vite build`. Adding /activity + /skills routes broke typecheck because routeTree.gen.ts (committed from Phase 1) only knew about `/`. tsc -b errored with `Type '"/activity"' is not assignable to type '"/"'`. The router-plugin only runs as part of `vite build`, which executes AFTER tsc -b.
- **Fix:** Ran `npx vite build` first to regenerate routeTree.gen.ts, then `npm run build` succeeded. The regenerated file is committed. Future plans adding routes should run `vite build` once before relying on `npm run build` to typecheck the new routes.
- **Files modified:** frontend/src/routeTree.gen.ts (regenerated to include /activity + /skills)
- **Verification:** `npm run build` exits 0 with chunks for routes/activity/skills emitted
- **Committed in:** 4e46078 (Task 3 commit)

---

**Total deviations:** 5 auto-fixed (1 Rule 3 environment blocking + 4 Rule 1 bugs)
**Impact on plan:** All deviations were pre-existing environmental quirks (Node 25 default flag, happy-dom 20 globalThis aliasing, react-error-boundary v6 type bump, TanStack Router async bootstrap, build-step ordering) rather than scope creep. No additional features or files added beyond the plan's prescribed set. Wave 1+2 inherit a clean test harness with documented mitigations.

## Issues Encountered

- happy-dom 20.9.0's localStorage broke until the Node 25 experimental Web Storage flag was disabled (auto-fix #1). Initial diagnosis required tracing Node native globals vs Vitest populateGlobal vs happy-dom Window — the `--localstorage-file` warning printed by Node 25 was the smoking gun.
- routeTree.gen.ts regeneration required a one-shot `npx vite build` before `npm run build` could succeed (auto-fix #5). Going forward the file lives in HEAD and only gets regenerated when routes change.

## Wave 1 Entry Contracts

For Plan 05-02 (layout primitives) + Plan 05-03 (interactive primitives) — both ship in Wave 1:

- **Render helper:** `import { render, userEvent } from '../../../test/utils'` (relative path from src/components/*/__tests__/*.test.tsx) — provides RTL render with MotionConfig reducedMotion='always' and userEvent re-export. NEVER import directly from `@testing-library/react`.
- **Vitest setup:** `frontend/src/test/setup.ts` is loaded automatically. All Radix shims, act() bridge, and per-test cleanup are active.
- **Storage:** `import { storage } from '../../lib/storage'` — Wave 1 CollapsibleSection consumes this for collapsed-state persistence.
- **API fetchers:** `import { api, fetchJson, ApiError, type SessionListResponse, type HealthResponse } from '../../lib/api'`. Phase 6 layers React Query on top via `useQuery({ queryFn: api.health })`.
- **Design tokens:** All colors, spacing, radii, typography weights/sizes are CSS variables on `:root`. Reference via `var(--cmc-*)` / `var(--space-*)` / `var(--radius-*)` / `var(--size-*)` / `var(--weight-*)`. NEVER inline literals.
- **AppShell mounting:** Already wired in `routes/__root.tsx` with QueryClientProvider + ErrorBoundary. New routes just need to register their file route under `src/routes/` and the router-plugin picks them up on `npm run build`.
- **Test scripts:** Use `npm run test` / `npm run typecheck` — both already include `NODE_OPTIONS=--no-experimental-webstorage`. Do NOT call `vitest run` directly without that flag, or localStorage tests will break.

## User Setup Required

None - no external service configuration required.

## Next Plan Readiness

- All Wave 0 dependencies installed at locked versions; downstream plans can `import` immediately.
- Test harness is green and primed: 12-test baseline; Wave 1 adds layout-primitive tests on top.
- Shell + routes mounted; Wave 1 can drop layout primitives directly into the existing AppShell + route bodies.
- lib/api.ts covers every Phase 3/4 endpoint Phase 6 will consume; no further fetcher infrastructure needed in Wave 1+2.
- NO blockers; NO open questions for Wave 1.

## Self-Check: PASSED

Verified before submission:

- [x] frontend/vitest.config.ts exists
- [x] frontend/src/test/setup.ts exists
- [x] frontend/src/test/utils.tsx exists
- [x] frontend/src/lib/storage.ts exists
- [x] frontend/src/lib/api.ts exists
- [x] frontend/src/components/shell/AppShell.tsx exists
- [x] frontend/src/components/shell/NavBar.tsx exists
- [x] frontend/src/routes/activity.tsx exists
- [x] frontend/src/routes/skills.tsx exists
- [x] frontend/src/routeTree.gen.ts contains '/activity' and '/skills' paths
- [x] Commit 0e7076f exists
- [x] Commit 10e6c44 exists
- [x] Commit 4e46078 exists
- [x] `npm run test` exits 0 with 12/12 passing
- [x] `npm run typecheck` exits 0
- [x] `npm run build` exits 0
- [x] `npm ls @radix-ui/react-dialog` shows exactly one resolved version (1.1.15) with cmdk's copy deduped

---
*Phase: 05-frontend-shell-design-system*
*Completed: 2026-04-26*
