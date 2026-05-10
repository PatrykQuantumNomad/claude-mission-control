---
phase: 24-shell-density-containment-primitives
plan: 02
subsystem: ui
tags: [density, radix-dropdown-menu, lucide-react, react-19, vitest, happy-dom, css-cascade, zero-rerender]

requires:
  - phase: 24-shell-density-containment-primitives
    provides: ":root density tokens (compact/comfortable/cozy --cmc-padding-card etc.); .cmc-density-toggle / .cmc-dropdown / .cmc-dropdown__item CSS skeletons; lib/density.ts (getDensity/setDensity/applyDensity); @radix-ui/react-dropdown-menu@2.1.16 installed"
provides:
  - "DensityToggle.tsx — single-button DropdownMenu density picker (3 tiers, check-mark on current)"
  - "DensityProvider.tsx — pass-through wrapper that re-applies density on mount for HMR safety (NO React Context)"
  - "Vitest cascade test pinning :root --cmc-padding-card per tier (16/24/32 px)"
  - "Vitest persistence test pinning click → setDensity → localStorage + dataset.density round-trip"
  - "Documented happy-dom limitation: Portal-descendant cascade verification belongs to Plan 05's Playwright fixture"
affects: [phase 24 plan 04 (shell wires DensityToggle into header), phase 24 plan 05 (Playwright cascade gate uses these primitives)]

tech-stack:
  added: []
  patterns:
    - "Density toggle is a CSS-only swap by architecture (no React Context for density tokens) — POLI-11 zero-rerender invariant locked at design time, not enforced by discipline"
    - "Mirrored ThemeToggle pattern: local useState only drives the toggle's own indicator; round-trip to lib/density.ts handles persistence + DOM mutation; consumers read CSS variables only"
    - "DensityProvider as a thin pass-through (NOT a context provider) — mount-time useEffect re-applies density attribute for HMR safety"

key-files:
  created:
    - frontend/src/components/shell/DensityToggle.tsx
    - frontend/src/components/shell/DensityProvider.tsx
    - frontend/src/components/shell/__tests__/DensityProvider.test.tsx
    - frontend/src/components/shell/__tests__/DensityToggle.test.tsx
  modified: []

key-decisions:
  - "DensityProvider is NOT a React Context — keeping density consumers off React subscriptions is what makes POLI-11's zero-rerender gate achievable by architecture, not by discipline"
  - "happy-dom does NOT propagate :root CSS variables through getComputedStyle on descendants — full Portal-cascade verification (DENS-02) is delegated to Plan 05's Playwright fixture; vitest verifies the contract at the html-element level"
  - "Vitest config sets css:false (styles.css doesn't load) — DensityProvider test injects a minimal subset of [data-density='…'] rules to verify the cascade flip without depending on the global stylesheet"
  - "Sliders icon (not SlidersHorizontal/Vertical) is the locked density-toggle glyph per Phase 24 research — no substitution"

patterns-established:
  - "Pre-mount apply pattern: lib/density.ts (DENS-03) calls applyDensity() in main.tsx BEFORE React mount + DensityProvider re-applies in useEffect; avoids both cold-load flash and HMR drift"
  - "CSS-only preference flip: any future :root-scoped UX preference (motion, contrast, etc.) follows the lib/density.ts + Toggle + non-Context-Provider triad established here"

duration: 9min
completed: 2026-05-10
---

# Phase 24 Plan 02: Density UX primitives Summary

**Radix DropdownMenu density picker (3 tiers) + non-Context provider + vitest persistence/cascade tests, locking POLI-11's zero-rerender invariant by architecture (no React subscribers for density).**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-10T13:51:25Z
- **Completed:** 2026-05-10T14:00:14Z
- **Tasks:** 2
- **Files created:** 4 (2 components + 2 test files)
- **Files modified:** 0
- **Commits:** 2 atomic (49c135a, b9d5e2e)

## Accomplishments

- DENS-01: 3-tier DensityToggle shipped — single-button DropdownMenu, check-mark on current tier, 4 testids per registry contract.
- DENS-02 (vitest scope): :root cascade flips for compact/comfortable/cozy verified at html-element level; full Portal-descendant resolution delegated to Plan 05's Playwright fixture (documented limitation).
- DENS-03: localStorage persistence + dataset.density round-trip pinned by vitest; remount/page-refresh simulation confirms persisted value loads on cold-mount.
- Architectural invariant locked: zero `createContext` calls in either component file — density consumers MUST read CSS variables, not React state. POLI-11 zero-rerender becomes a design-time guarantee.
- Vitest count: 326 → 345 (+19 total, of which +7 from this plan; +12 from parallel plan-03).

## Task Commits

Each task was committed atomically:

1. **Task 1: DensityToggle + DensityProvider components** — `49c135a` (feat)
2. **Task 2: Vitest cascade + persistence tests** — `b9d5e2e` (test)

## Files Created/Modified

- `frontend/src/components/shell/DensityToggle.tsx` — Radix DropdownMenu density picker. testids `density-toggle-trigger`, `density-option-{compact,comfortable,cozy}`. Sliders icon trigger. Selecting an item calls `setDensity(t.value)` + local `setLocal(t.value)` (only to drive the check-mark; no other React state moves).
- `frontend/src/components/shell/DensityProvider.tsx` — `({ children }) => { useEffect(() => applyDensity(), []); return <>{children}</> }`. Zero `createContext`, zero subscribers. Mount-time HMR safety only.
- `frontend/src/components/shell/__tests__/DensityProvider.test.tsx` — 3 tests: provider renders children with no wrapper; :root cascade flips per tier; Sheet via Portal mounts under provider with html dataset/cascade flipping correctly.
- `frontend/src/components/shell/__tests__/DensityToggle.test.tsx` — 4 tests: aria-label reflects persisted density after useEffect; click → localStorage + dataset round-trip; remount picks up persisted value; all 3 menu options render.

## Decisions Made

1. **No React Context for density** (locked by plan, re-affirmed): every consumer that subscribed via context would re-render on toggle. By keeping density purely in CSS + localStorage, the only React state movement on toggle is DensityToggle's own check-mark. POLI-11 enforced by architecture.
2. **Cascade test scope split between vitest and Playwright**: happy-dom does NOT propagate `:root` CSS variables through `getComputedStyle` on descendants (verified empirically — see Issues Encountered). vitest pins the html-element-level cascade and the data-density attribute flip; Plan 05's Playwright fixture pins the runtime cascade through Portal subtrees.
3. **Inject minimal stylesheet in DensityProvider test** (not import styles.css): `vitest.config.ts` sets `css: false`, so styles.css never loads in unit tests. The test injects only the three `--cmc-padding-card` rules under test — keeps the test focused on the cascade contract, not the full token surface, and avoids coupling unit tests to styles.css drift.

## Deviations from Plan

### Environmental issues (parallel-execution coordination)

**1. [Rule 3 - Blocking] Pre-commit tsc hook collided with parallel plan-03 agent's intermediate state**
- **Found during:** Task 1 commit attempt
- **Issue:** A parallel plan-03 agent was mid-TDD-cycle on Phase 24 Plan 03 (containment primitives). Its RED-phase commit `dddae8d` landed `BoundedPanelCard.test.tsx` referencing a `bounded` prop that didn't yet exist on `PanelCardProps`. The pre-commit hook stashes unstaged files before running tsc, which removed the parallel agent's local `PanelCard.tsx` fix and exposed the broken intermediate state. tsc failed with TS2322 errors on out-of-scope files.
- **Fix:** No code change. Polled `pnpm tsc --noEmit` until plan-03's GREEN commit `eb43306 feat(24-03): implement TruncatedCell + CopyIconButton + BoundedPanelCard (GREEN)` landed and the workspace stabilized. Then retried commit successfully.
- **Files modified:** none (waited)
- **Verification:** Final `pnpm tsc --noEmit` exits 0; pre-commit hook tsc gate passes for both my commits (49c135a, b9d5e2e).
- **Note:** This is parallel-execution scheduling friction, not a defect in plan 02 itself. Logged for future orchestrator awareness — plans whose pre-commit hooks run project-wide tsc must tolerate transient red states from parallel TDD-RED commits in other plans.

**2. [Rule 3 - Blocking] Restored accidentally-deleted `frontend/src/__tests__/integration.test.tsx`**
- **Found during:** Pre-commit status check after parallel agent activity
- **Issue:** Working tree showed ` D frontend/src/__tests__/integration.test.tsx` (deletion against HEAD). The file was present in HEAD blob `607fe8d` but missing from the working tree. Plausible cause: parallel plan-03 agent's pre-commit stash/pop sequence misfired (#3097-style), or a `git clean` in a sibling agent's worktree, removed it from the shared filesystem. The deletion is OUT of plan-02 scope.
- **Fix:** `git checkout HEAD -- frontend/src/__tests__/integration.test.tsx` — single-file restore, no blanket reset. This is a defensive recovery from external interference, not a destructive op on my own work.
- **Files modified:** restored 1 file from HEAD
- **Verification:** `ls frontend/src/__tests__/integration.test.tsx` → file present; full vitest suite (75 files, 345 tests) passes after restore.
- **Note:** Surfaced for orchestrator awareness — parallel agents in the same git worktree CAN cause cross-agent file deletions via pre-commit stash interactions or `git clean`-class operations. Plan 02 did not perform any destructive op.

### Substantive deviations

**3. [Rule 1 - Bug] Cascade test assertion downgraded from Portal-descendant to html-element scope**
- **Found during:** Task 2 (DensityProvider.test.tsx) initial run
- **Issue:** Plan-text speculated jsdom might or might not propagate `:root` CSS variables through Portal subtrees. happy-dom (the actual env) does NOT propagate to descendants — `getComputedStyle(div).getPropertyValue('--foo')` returns `''` even when `:root { --foo: 16px }` is in the stylesheet. Verified empirically with a probe test against a bare `<div>` appended to `document.body`. The original test's assertion `expect(readPaddingCard(panel)).toBe('16px')` failed with `expected '' to be '16px'`.
- **Fix:** Updated the Portal cascade test to verify (a) Portal panel actually mounts under DensityProvider, (b) `document.documentElement.dataset.density` flips per tier, and (c) `:root`'s own computed `--cmc-padding-card` flips per tier (which happy-dom DOES compute). The full Portal-descendant cascade is verified at runtime by Plan 05's Playwright fixture (DENS-02 e2e gate). Updated file header to document the limitation clearly so plan 05 author knows what to verify.
- **Files modified:** frontend/src/components/shell/__tests__/DensityProvider.test.tsx
- **Verification:** All 3 DensityProvider tests pass (`pnpm vitest run src/components/shell/__tests__/DensityProvider.test.tsx`).
- **Committed in:** b9d5e2e

---

**Total deviations:** 3 (2 environmental — parallel-agent coordination + file restore; 1 substantive — cascade test scope adjustment)
**Impact on plan:** Substantive deviation #3 narrows the vitest assertion to what happy-dom can compute; Plan 05's Playwright already owns the full Portal-cascade verification (called out in plan 02's task 2 fallback note), so DENS-02's coverage is unchanged at the gate level. Environmental deviations did not modify code; logged for orchestrator awareness about parallel-execution friction.

## Issues Encountered

- **happy-dom Portal-descendant cascade limitation** (resolved by deviation #3 above) — verified with a one-off probe test against a bare `<div>` appended to `document.body`; happy-dom resolves `:root` vars on `document.documentElement` itself but does NOT propagate through `getComputedStyle` to any descendant. Same limitation exists in jsdom; this is a documented test-env gap, not a regression in DensityProvider.
- **Parallel-agent commit history rewrite** (resolved by waiting) — at one point during execution, the git log briefly showed `d2a0713 feat(24-03)` containing my DensityToggle/DensityProvider files swept up by a sibling agent's `git add`. That commit was subsequently rewritten by the same sibling agent into `939cd3e + dddae8d`, leaving my files untracked again. Verified files-on-disk byte-equal to my writes via `diff`, then re-staged and committed cleanly under my own attribution.

## User Setup Required

None — no external service configuration required. DensityToggle + DensityProvider are pure-frontend, no env vars, no migrations.

## Next Phase Readiness

- Plan 03 (containment primitives) is already in-flight as a parallel wave (`939cd3e + dddae8d + eb43306` landed during plan 02 execution). DensityToggle does not depend on Plan 03; Plan 03 does not depend on plan 02. Wave 2 effectively complete.
- Plan 04 (shell redesign) consumes DensityToggle: import path is `frontend/src/components/shell/DensityToggle` (named export). Mount it inside the shell's right-side action area alongside ThemeToggle. Stack DensityProvider + ThemeProvider near the AppShell root for HMR safety.
- Plan 05 (saved views) is unaffected; Plan 05's Playwright fixture should ALSO add a `density-cascade.spec.ts` (or extend an existing spec) to cover the runtime Portal cascade that happy-dom can't verify — DENS-02 e2e gate. Test name suggestion: "Sheet panel inherits compact density tokens — `--cmc-padding-card` resolves to 16px on Portal subtree."
- POLI-11 zero-rerender invariant: future React DevTools profiler check (mount `<DensityToggle />`, click through tiers, observe ZERO commits below the toggle) belongs to plan 04's first visual checkpoint or plan 07's quality gates.

## Self-Check: PASSED

- Files exist on disk: `DensityToggle.tsx`, `DensityProvider.tsx`, `DensityProvider.test.tsx`, `DensityToggle.test.tsx` — all FOUND.
- Commits in git log: `49c135a` (Task 1) FOUND, `b9d5e2e` (Task 2) FOUND.
- Architectural invariant: `grep -c createContext` on both component files returns 0 — POLI-11 zero-rerender contract preserved at the source level.
- TypeScript: `pnpm tsc --noEmit` exits 0.
- Vitest: 75 files / 345 tests pass (326 baseline + 19 new across plan 02 and parallel plan 03 — plan 02 contributes +7).

---
*Phase: 24-shell-density-containment-primitives*
*Completed: 2026-05-10*
