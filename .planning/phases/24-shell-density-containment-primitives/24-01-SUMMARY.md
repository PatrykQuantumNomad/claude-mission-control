---
phase: 24-shell-density-containment-primitives
plan: 01
subsystem: ui
tags: [css-tokens, density, z-index-ladder, radix-portal, containment, react-19, vite]

# Dependency graph
requires:
  - phase: 18-fab-keyboard-skeletons
    provides: "Phase 18 vitest baseline (326 tests) preserved as v1.3 regression target"
  - phase: 23-v1.2-frontend-fab-keyboard-skeletons (synthesis)
    provides: "lib/theme.ts pattern (applyTheme/getTheme/setTheme/SSR-guarded) that lib/density.ts mirrors"
provides:
  - "Density token system on :root (23 vars) + [data-density='compact'|'cozy'] override blocks"
  - "Z-index ladder on :root (--cmc-z-base..--cmc-z-banner) replacing 6 raw integers"
  - "lib/density.ts (Density tier type, getDensity/setDensity/applyDensity, KEY=cmc.density, default=comfortable)"
  - "applyDensity() boot wiring in main.tsx (runs BEFORE applyTheme)"
  - "CONT-02 mitigation: .cmc-btn:hover position/top/box-shadow swap (no transform containing-block trap for Portal descendants)"
  - "CONT-03 mitigation: min-width: 0 on .cmc-card (grid tracks shrink for unbreakable strings)"
  - "CONT-05 mitigation: ladder vars resolve Tooltip/CommandPalette z=50 collision"
  - ".cmc-density-toggle + .cmc-dropdown + .cmc-dropdown__item CSS skeleton consumed by plan 02"
  - "4 locked v1.3 deps installed: @radix-ui/react-popover@1.1.15, @radix-ui/react-dropdown-menu@2.1.16, @lhci/cli@0.15.1, @axe-core/playwright@4.11.3"
affects: [phase-24-plan-02-density-toggle, phase-24-plan-03-bounded-panel-card, phase-24-plan-04-shell-redesign, phase-24-plan-05-saved-views, phase-24-plan-06-docs, phase-24-plan-07-quality-gates, phase-25, phase-26, phase-27, phase-28]

# Tech tracking
tech-stack:
  added:
    - "@radix-ui/react-popover@1.1.15 (runtime — plan 04+ shell)"
    - "@radix-ui/react-dropdown-menu@2.1.16 (runtime — plan 02 DensityToggle, plan 04 row actions)"
    - "@lhci/cli@0.15.1 (dev — plan 07 Lighthouse CI quality gate)"
    - "@axe-core/playwright@4.11.3 (dev — plan 07 a11y gate)"
  patterns:
    - "Density tokens MUST live on :root (DENS-02 invariant — Radix Portal cascade)"
    - "Density mirrors theme.ts: SSR-guarded getX/setX/applyX, localStorage KEY=cmc.density, dataset attribute on documentElement"
    - "applyDensity() BEFORE applyTheme() in main.tsx (density tokens resolve before theme overrides depend on them)"
    - "Z-index ladder via CSS vars (--cmc-z-*) spaced by 10; calc(--cmc-z-X + 1) for sibling layers above same family overlay"
    - "New --cmc-* token namespace coexists with legacy --space-*/--size-*; per-route migration is Phase 26/27 work — no mid-phase rule rewrites"
    - "Hover lift via top/box-shadow, NOT transform (avoids containing block for Portal descendants)"

key-files:
  created:
    - "frontend/src/lib/density.ts (50 lines, exports Density/DEFAULT_DENSITY/getDensity/setDensity/applyDensity)"
  modified:
    - "frontend/src/main.tsx (added applyDensity import + call before applyTheme)"
    - "frontend/src/styles.css (token block lines 53-100, density tier overrides lines 129-181, 6 z-index swaps, .cmc-card min-width:0, .cmc-btn:hover non-transform lift, density-toggle/dropdown skeleton lines 1983-2009)"
    - "frontend/package.json (4 new deps under dependencies + devDependencies)"
    - "frontend/pnpm-lock.yaml (lockfile regenerated, +6 runtime + 283 dev tree resolved entries)"

key-decisions:
  - "Used actual class names .cmc-alertdialog-overlay / .cmc-alertdialog (singular, no BEM panel suffix) for Edit C z-index swaps; plan doc text speculatively wrote __overlay/__panel — variable assignment unchanged, only target selectors corrected against tree"
  - "Preserved existing box-shadow color/opacity in .cmc-btn:hover when reducing from 0 4px 12px rgba(0,0,0,0.4) to 0 2px 8px rgba(0,0,0,0.15) per plan spec — visual lift retained, no removal of any non-transform property"
  - "Did NOT migrate any existing --space-*/--size-* token references (e.g., .cmc-card padding: var(--space-lg)) to new --cmc-* names — plan explicitly defers per-route migration to Phase 26/27 to keep v1.2 vitest baseline (326) intact"
  - ".cmc-btn:disabled `transform: none` line left in place — harmless since hover no longer sets a transform; removing it would be unrelated cleanup"

patterns-established:
  - "Pattern: density.ts clone of theme.ts — any future :root-scoped UX preference (e.g., motion=normal|reduced) should follow same shape (typed string tier + 5-symbol module + boot apply)"
  - "Pattern: z-index ladder vars allow `calc(var(--cmc-z-X) + 1)` for sibling-above without polluting the named ladder"
  - "Pattern: token block additions in :root preserve existing (legacy) tokens; new --cmc-* prefix flags v1.3-era namespace"

# Metrics
duration: ~12min
completed: 2026-05-10
---

# Phase 24 Plan 01: Shell + Density + Containment Primitives Foundation Summary

**Density token system (23 :root vars + Compact/Cozy overrides) + 11-rung z-index ladder + 3 surgical CSS overflow-trap fixes (CONT-02/03/05) + lib/density.ts boot wiring + 4 locked v1.3 deps — every later plan in Phase 24 builds on a stable substrate.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-10T13:33:00Z (approx — first dep install)
- **Completed:** 2026-05-10T13:45:11Z
- **Tasks:** 2 (both atomic, both passing automated verify)
- **Files modified:** 4 created/changed (1 new: density.ts; 3 modified: main.tsx, styles.css, package.json) + pnpm-lock.yaml regenerated

## Accomplishments

- 23 density tokens on `:root` (Comfortable defaults), with [data-density="compact"] and [data-density="cozy"] override blocks — ready for plan 02 DensityToggle to flip the attribute, plan 04+ shell to consume them.
- 11-rung z-index ladder (`--cmc-z-base`..`--cmc-z-banner`, spaced by 10) replacing 6 raw integer z-indexes scattered across Tooltip/Sheet/CommandPalette/AlertDialog rules. Resolves the prior Tooltip/CommandPalette `50` collision (Tooltip now 30, CommandPalette now 80) and reorders AlertDialog (70) above Sheet (60) and DropdownMenu (50).
- CONT-02 fixed at the CSS layer: `.cmc-btn:hover` no longer uses `transform: translateY(-2px)` — switched to `position: relative; top: -2px; box-shadow: 0 2px 8px rgba(0,0,0,0.15)`. Hovered buttons no longer become the containing block for `position: fixed` Radix Portal descendants. Visual lift preserved.
- CONT-03 fixed at the CSS layer: `min-width: 0` appended to `.cmc-card` so grid tracks shrink correctly when a card holds an unbreakable string (session-id, cwd path, skill-name).
- CONT-05 fixed at the CSS layer: every overlay rule now reads `var(--cmc-z-*)` from the ladder, not raw integers.
- `frontend/src/lib/density.ts` shipped as a near-exact clone of `lib/theme.ts` — same SSR guards, same JSDoc shape, same 5-symbol export surface (`Density`, `DEFAULT_DENSITY`, `getDensity`, `setDensity`, `applyDensity`).
- `main.tsx` calls `applyDensity()` before `applyTheme()` so the `data-density` attribute is set during first paint and density tokens resolve before any theme override depends on them.
- 4 locked v1.3 deps installed inside the budget: `@radix-ui/react-popover@1.1.15`, `@radix-ui/react-dropdown-menu@2.1.16`, `@lhci/cli@0.15.1`, `@axe-core/playwright@4.11.3`. React 19.2 peerDeps resolved without warnings.
- `.cmc-density-toggle` + `.cmc-dropdown` + `.cmc-dropdown__item` CSS skeleton appended for plan 02 to consume without further token work.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install locked deps + write lib/density.ts** — `396c092` (feat)
2. **Task 2: z-index ladder + density tokens + transform-mitigation + min-width fix in styles.css** — `2e064cc` (feat)

**Plan metadata commit:** to follow this SUMMARY (state + roadmap update commit).

## Files Created/Modified

**Created:**
- `frontend/src/lib/density.ts` — Density type + DEFAULT_DENSITY + 3 SSR-guarded helpers (getDensity / setDensity / applyDensity), KEY=`cmc.density`, mirror of `lib/theme.ts`.

**Modified:**
- `frontend/src/main.tsx` — added `import { applyDensity } from './lib/density'` and call `applyDensity()` immediately before `applyTheme()`.
- `frontend/src/styles.css` — five edit blocks (Edit A: density tokens on :root, Edit B: Compact + Cozy override selectors, Edit C: 6 z-index swaps in .cmc-tooltip/.cmc-sheet__overlay/.cmc-sheet__panel/.cmc-cmdk/.cmc-alertdialog-overlay/.cmc-alertdialog, Edit D: min-width:0 on .cmc-card, Edit E: .cmc-btn:hover transform→top/box-shadow swap, Edit F: density-toggle + dropdown skeleton at EOF).
- `frontend/package.json` — added @radix-ui/react-popover@^1.1.15 + @radix-ui/react-dropdown-menu@^2.1.16 (deps), @lhci/cli@^0.15.1 + @axe-core/playwright@^4.11.2 (devDeps).
- `frontend/pnpm-lock.yaml` — regenerated to include the 4 deps and their transitive trees.

## Final pnpm-lock.yaml dep versions (pinned)

| Package | Spec | Resolved |
|---|---|---|
| @radix-ui/react-popover | ^1.1.15 | 1.1.15 |
| @radix-ui/react-dropdown-menu | ^2.1.16 | 2.1.16 |
| @lhci/cli | ^0.15.1 | 0.15.1 |
| @axe-core/playwright | ^4.11.2 | 4.11.3 |

`pnpm install --frozen-lockfile` clean. React 19.2 peerDeps resolved without warnings.

## styles.css line ranges (for plan 06 z-index-ladder.md cross-reference)

| Block | Lines |
|---|---|
| `:root` density tokens (23 vars) | 53–84 |
| `:root` z-index ladder (11 vars) | 86–100 |
| `[data-density="compact"]` overrides | 129–153 |
| `[data-density="cozy"]` overrides | 155–181 |
| `.cmc-tooltip` z-index swap | 437 |
| `.cmc-sheet__overlay` / `.cmc-sheet__panel` z-index swaps | 503, 511 |
| `.cmc-cmdk` z-index swap | 573 |
| `.cmc-alertdialog-overlay` / `.cmc-alertdialog` z-index swaps | 1475, 1492 |
| `.cmc-card` `min-width: 0` | inside .cmc-card block |
| `.cmc-btn:hover:not(:disabled)` non-transform lift | inside .cmc-btn block |
| `.cmc-density-toggle` / `.cmc-dropdown` / `.cmc-dropdown__item` skeleton | 1983–2009 |

## Z-index ladder integer values (canonical reference for plan 06)

| Var | Value | Used by |
|---|---|---|
| `--cmc-z-base` | 0 | (default flow) |
| `--cmc-z-sticky` | 10 | (reserved for sticky table headers) |
| `--cmc-z-sidebar` | 20 | (plan 04 Sidebar) |
| `--cmc-z-header` | 20 | (plan 04 NavBar — same layer as sidebar) |
| `--cmc-z-tooltip` | 30 | `.cmc-tooltip` (was 50, lowered to resolve cmdk collision) |
| `--cmc-z-popover` | 40 | (reserved — plan 02/04 Popover) |
| `--cmc-z-dropdown` | 50 | `.cmc-dropdown` (plan 02 DensityToggle menu, plan 04 row actions) |
| `--cmc-z-sheet` | 60 | `.cmc-sheet__overlay` (60), `.cmc-sheet__panel` (61) — was 40/41 |
| `--cmc-z-dialog` | 70 | `.cmc-alertdialog-overlay` (70), `.cmc-alertdialog` (71) — was 45/46 |
| `--cmc-z-cmdk` | 80 | `.cmc-cmdk` (was 50, raised to top of overlay stack) |
| `--cmc-z-toast` | 90 | (reserved — toast layer) |
| `--cmc-z-banner` | 100 | (reserved — top-of-viewport banner) |

## Decisions Made

- **Used actual class names `.cmc-alertdialog-overlay` and `.cmc-alertdialog` (no underscore-BEM `__overlay`/`__panel` variants)** for Edit C z-index swaps. Plan doc text used speculative BEM names; the source tree uses singular `.cmc-alertdialog`. Variable assignment (`var(--cmc-z-dialog)` and `calc(... + 1)`) unchanged — only target selectors verified against the actual file before swap.
- **Preserved the `.cmc-btn:disabled` `transform: none` reset.** Even though hover no longer sets a transform, removing the disabled reset would be unrelated cleanup and risks regressing some pre-existing `.cmc-btn--disabled` test. Left in place.
- **Did NOT migrate legacy `--space-*` / `--size-*` references to new `--cmc-*` namespace.** Plan explicitly forbids mid-phase rule rewrites; per-route adoption is Phase 26/27 work. The two namespaces coexist: legacy tokens stay untouched, new `--cmc-*` tokens are reserved for primitives shipped in plans 03+.
- **Slightly bigger box-shadow alpha than plan example (`rgba(0,0,0,0.15)` matches plan spec)** — adopted plan spec verbatim despite the original line having `rgba(0,0,0,0.4)`. The visual lift is preserved by `top: -2px`; the larger drop-shadow is no longer needed since we're no longer compensating for transform-Z elevation.

## Deviations from Plan

None substantive — plan executed exactly as written.

Two minor adjustments (documented above as Decisions, not deviations):
1. Class-name verification for AlertDialog rules (`.cmc-alertdialog-overlay` / `.cmc-alertdialog`) — plan used speculative BEM, source uses singular form. The intended selector targets and z-index assignments were unchanged.
2. Preserved `.cmc-btn:disabled { transform: none }` — out of plan scope, leaving alone is safer than an unrelated cleanup.

## Issues Encountered

None.

## Threat Flags

None — this plan ships CSS tokens, a localStorage-backed density helper (no network, no user data), and lockfile additions. No new trust boundaries crossed.

## User Setup Required

None — no external service configuration required for this plan.

## Verification Results

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | clean |
| `pnpm tsc --noEmit` | exit 0 (no errors) |
| `pnpm vitest run --reporter=dot` | **326/326 passed** (Phase 18 baseline preserved) |
| `pnpm list @radix-ui/react-popover @radix-ui/react-dropdown-menu @lhci/cli @axe-core/playwright` | all 4 resolved at locked versions |
| `grep` audit (12 plan-level success criteria) | all 12 pass — see Task 2 verify output |

## Self-Check: PASSED

- `frontend/src/lib/density.ts` — exists.
- `frontend/src/main.tsx` — `applyDensity()` call present before `applyTheme()`.
- `frontend/src/styles.css` — density token block, density override blocks, z-index ladder, 6 z-index swaps, `.cmc-card` `min-width: 0`, `.cmc-btn:hover` non-transform lift, density-toggle/dropdown skeleton — all confirmed via grep.
- Commit `396c092` (Task 1) — present in `git log`.
- Commit `2e064cc` (Task 2) — present in `git log`.
- All 4 deps confirmed in `pnpm list` at locked versions.

## Next Phase Readiness

**Ready for plan 02 (DensityToggle component):**
- All density tokens are on `:root` and cascade through Radix Portal.
- `.cmc-density-toggle` + `.cmc-dropdown__item` CSS pre-shipped — plan 02 is ~80 lines of TSX.
- `setDensity()` from `lib/density.ts` is the only state-write API needed.

**Ready for plan 03 (BoundedPanelCard):**
- `--cmc-padding-card`, `--cmc-padding-cell`, `--cmc-row-height-*` tokens available.

**Ready for plan 04 (Shell redesign):**
- `--cmc-z-sidebar`, `--cmc-z-header`, `--cmc-z-popover`, `--cmc-z-dropdown` slots reserved.
- CONT-02/03 mitigations land before any new portal-mounted UI ships.

**Ready for plan 07 (Quality gates):**
- `@lhci/cli` and `@axe-core/playwright` installed; CI scaffolding can wire them up without a separate dep PR.

No blockers. No concerns.

---
*Phase: 24-shell-density-containment-primitives*
*Plan: 01*
*Completed: 2026-05-10*
