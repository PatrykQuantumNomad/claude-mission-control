---
phase: 05-frontend-shell-design-system
plan: 02
subsystem: ui
tags: [react-19, radix-ui, react-tooltip, react-error-boundary, framer-motion, css-variables, design-tokens, skeleton, intl-relativetime, layout-primitives, vitest-4, react-testing-library-16, happy-dom]

# Dependency graph
requires:
  - phase: 05-frontend-shell-design-system
    plan: 01
    provides: Design tokens on :root (--cmc-* CSS variables), Inter/JetBrains Mono fonts, AppShell + 3 routes, Vitest 4 + RTL 16 + happy-dom test harness with all 5 RESEARCH pitfalls pre-mitigated, render() helper at src/test/utils.tsx with MotionConfig wrapper, lib/storage.ts (cmc.* prefix), lib/api.ts (40+ endpoint typed fetcher map)
provides:
  - "9 layout primitives in frontend/src/components/ui/: Card family (Card+Header+Title+Description+Content+Footer), Button (variant=primary|secondary|ghost, size=sm|md, iconLeft/iconRight), Badge (5 variants), StatePill (5 states), Tooltip (Radix wrapper, 200ms delay), Skeleton (text/rect/circle, multi-line text stack), EmptyState (heading+body+icon?+action?), RelativeTime (Intl.RelativeTimeFormat + 30s tick + Tooltip wrap), ShellErrorBoundary + ShellErrorFallback (react-error-boundary v6 + UI-SPEC verbatim copy)"
  - "frontend/src/components/ui/index.ts barrel re-exports all 9 primitives + formatRelative pure helper"
  - "styles.css: 9 new primitive class blocks under '/* Layout primitives — Phase 5 Plan 02 */' section header — all variables-driven (no inline color literals); 3 new keyframes (cmc-pulse, cmc-tooltip-in, cmc-skeleton-pulse)"
  - "30 new test cases (10 Task 1 + 20 Task 2) bringing the frontend suite from 12 → 42 green"
  - "Wave 2 entry contracts: Plan 05-03 (Sheet/CollapsibleSection/CommandPalette) appends to components/ui/index.ts (TODO marker present); Plan 05-04 imports primitives from this barrel for page-grid composition; Phase 6/7 import every primitive from frontend/src/components/ui"
affects: [05-03-interactive-primitives, 05-04-page-grids, 06-data-binding, 07-stateful-ui]

# Tech tracking
tech-stack:
  added:
    runtime: []  # No new dependencies — Plan 05-01 pre-installed @radix-ui/react-tooltip + react-error-boundary
    dev: []
  patterns:
    - "Layout primitive shape: forwardRef + className passthrough + presentational ARIA — every primitive accepts {className, ...rest}, default-merged with the cmc-<name> base class so callers can extend without dropping baseline styles"
    - "Compound component API: Card.tsx exports 6 sibling components (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter) — same pattern shadcn uses; Phase 6 panels declare structure via the compound, never the underlying div tree"
    - "Article landmark on Card root: each panel-style card is announced as a region by screen readers without an explicit aria-label — heading inside CardTitle (h2) provides the accessible name"
    - "default type='button' on Button avoids the form-submit footgun — callers pass type='submit' explicitly; documented inline so future contributors don't re-introduce the bug"
    - "Status colors NEVER substitute for the accent gradient: --cmc-status-{green,amber,red,cyan} render only inside StatePill (and future AttentionBar/EmergencyStop in Phase 7); accent --cmc-gradient-hero renders only on Button variant=primary, active nav links, and the brand text"
    - "Each Tooltip mounts its own Radix Provider — simpler than a global shell-level Provider, and Radix de-dupes pointer state internally per docs"
    - "Tooltip on focus reveals immediately (Radix keyboard fast-path); 200ms delayDuration applies only to mouse hover — keyboard users never wait"
    - "Skeleton aria contract: aria-busy + aria-label='Loading' on the SINGLE skeleton element (or on the wrapper for multi-line text variant) — never both at the same time, never injected as text — preserves UI-SPEC §Copywriting 'never use Loading… text'"
    - "RelativeTime split: pure formatRelative(target, now) is exported for deterministic unit tests; the component wrapper handles the 30s tick + Tooltip absolute-on-hover concerns"
    - "react-error-boundary v6: FallbackProps.error is `unknown` (not Error) since v6 — defensive narrowing (instanceof Error / typeof string / JSON.stringify) keeps the rendered detail row a string regardless of throw shape"

key-files:
  created:
    - "frontend/src/components/ui/Card.tsx — 6 forwardRef compound components"
    - "frontend/src/components/ui/Button.tsx — variant/size/icon slots forwardRef"
    - "frontend/src/components/ui/Badge.tsx — 5 variant tints"
    - "frontend/src/components/ui/StatePill.tsx — 5 state colored-dot pills with role=status"
    - "frontend/src/components/ui/Tooltip.tsx — Radix wrapper with locked 200ms delay"
    - "frontend/src/components/ui/Skeleton.tsx — variant + multi-line stack"
    - "frontend/src/components/ui/EmptyState.tsx — heading+body+icon?+action? structural primitive"
    - "frontend/src/components/ui/RelativeTime.tsx — Intl.RelativeTimeFormat + 30s tick + Tooltip absolute-on-hover; exports formatRelative pure helper"
    - "frontend/src/components/ui/ErrorBoundary.tsx — ShellErrorBoundary + ShellErrorFallback (UI-SPEC verbatim copy + defensive error narrowing)"
    - "frontend/src/components/ui/index.ts — barrel re-export"
    - "frontend/src/components/ui/__tests__/Card.test.tsx — 2 tests (compound render + ref/className merge)"
    - "frontend/src/components/ui/__tests__/Button.test.tsx — 4 tests (3 variants + icon slots + default type=button + disabled/onClick)"
    - "frontend/src/components/ui/__tests__/Badge.test.tsx — 2 tests (5 variants + default neutral)"
    - "frontend/src/components/ui/__tests__/StatePill.test.tsx — 2 tests (5 states + visible label)"
    - "frontend/src/components/ui/__tests__/Tooltip.test.tsx — 2 tests (focus reveal + asChild)"
    - "frontend/src/components/ui/__tests__/Skeleton.test.tsx — 5 tests (rect default + text + multi-line stack + circle + aria query)"
    - "frontend/src/components/ui/__tests__/EmptyState.test.tsx — 3 tests (no slots + icon slot + action slot)"
    - "frontend/src/components/ui/__tests__/RelativeTime.test.tsx — 8 tests (5 formatRelative pure + 3 component fake-timer)"
    - "frontend/src/components/ui/__tests__/ErrorBoundary.test.tsx — 2 tests (throw renders verbatim copy + Retry resets boundary)"
  modified:
    - "frontend/src/styles.css — appended 9 primitive CSS class blocks + 3 keyframes (cmc-pulse, cmc-tooltip-in, cmc-skeleton-pulse) under '/* Layout primitives — Phase 5 Plan 02 */' section header"

key-decisions:
  - "Tooltip test asserts BOTH visible content AND role=tooltip element — Radix renders the tooltip text twice (once as visible content via cmc-tooltip className, once in a screen-reader-accessible role=tooltip span). findByText fails on multiple matches, so we use findAllByText for a count assertion and getByRole('tooltip') for the canonical accessibility surface. Pattern reusable for any future Radix popover content tests."
  - "RelativeTime tests use vi.useFakeTimers() + vi.setSystemTime — not vi.advanceTimersByTime — because the component computes diff via 'new Date()' inside render, not via setTimeout. Pinning system time to a known instant lets formatRelative + the component agree on the 'now' value and produces deterministic 'N minutes ago' strings."
  - "ErrorBoundary tests silence console.error via vi.spyOn — react-error-boundary v6 forwards the caught error to console.error during render (React semantics) which would clutter test output. The spy is installed in beforeAll and restored in afterAll so other tests aren't affected."
  - "StatePill role='status' with aria-label combining label and machine state — 'Telegram (running)' — gives screen readers BOTH the human label and the state classification in one announcement; the colored dot is aria-hidden because the state is already encoded in the label."
  - "Each Tooltip instance mounts its own Radix Provider — shell-level global Provider deferred. Reasons: (1) keeps each primitive self-contained for unit tests, (2) Radix internally de-dupes pointer-state across nested Providers per docs, (3) avoids tying tooltip behavior to AppShell which would force tests to mount through AppShell."
  - "Skeleton variants render a span (single block) OR a div wrapper containing N spans (multi-line text). The aria-busy/aria-label move from the leaf span to the wrapper for multi-line — preserves UI-SPEC §Accessibility 'aria-busy on parent + aria-label on first skeleton block only' rule by collapsing 'parent' and 'first block' into the wrapper for the stack case (announces once, not N times)."
  - "ShellErrorBoundary v0 keeps __root.tsx's inline ShellErrorFallback unchanged — Plan 05-04 may consolidate. Rationale: __root.tsx already uses inline narrowing logic that diverges slightly from the new ErrorBoundary.tsx wrapper (no <code> styling, no .cmc-error-fallback class wrapper). Replacing it now risks regressing the shell error path; the new wrapper is intended for downstream panel-level boundaries (Phase 6 LiveSessionsCard, etc.) and as a target for the consolidation."

patterns-established:
  - "ForwardRef + className-passthrough primitive shape (locked across Card/Button/Badge/StatePill) — Phase 5 Plan 03 should follow the same shape for Sheet/CollapsibleSection/CommandPalette"
  - "Compound API via sibling exports from one file (Card.tsx) — replaces shadcn-style child component file split; lets Phase 6 destructure-import the entire family in one statement"
  - "Pure helper export pattern (formatRelative from RelativeTime.tsx) — applied wherever a primitive contains a deterministic transformation that benefits from unit tests without DOM bootstrapping"
  - "Test idiom: findAllByText + getByRole for Radix portaled content — handles the visible-text + sr-only-role-text duplicate-render Radix emits"
  - "Test idiom: vi.useFakeTimers() + vi.setSystemTime + vi.useRealTimers in afterEach — Phase 5 component tests with time-dependent rendering should follow this pattern"

# Metrics
duration: 5min
completed: 2026-04-27
---

# Phase 5 Plan 02: Layout Primitives Summary

**Nine layout-only primitives — Card family, Button, Badge, StatePill, Tooltip (Radix-200ms), Skeleton, EmptyState, RelativeTime, ShellErrorBoundary — landed in frontend/src/components/ui/ with co-located tests; CSS appended to styles.css under a single Layout primitives section; barrel index.ts ready for Plan 05-03 to append Sheet/CollapsibleSection/CommandPalette; full test suite grows 12 → 42 green.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-27T00:09:30Z
- **Completed:** 2026-04-27T00:14:58Z
- **Tasks:** 2 / 2 (all autonomous)
- **Files created:** 19 (9 primitives + 9 test files + 1 barrel)
- **Files modified:** 1 (styles.css)

## Accomplishments

- 9 layout primitives shipped with the agreed UI-SPEC contracts:
  - **Card family** (compound API): `<article>` landmark root, 6 forwardRef'd sub-components, 14px radius, 24px padding, surface bg
  - **Button**: 3 variants (primary uses --cmc-gradient-hero exclusively), 2 sizes, icon slots, default type=button, hover lift -2px via 150ms CSS transition (reduced-motion respected)
  - **Badge**: 5 variants (neutral + info/success/warning/danger tints), JetBrains Mono 12px, 8px radius
  - **StatePill**: 5 states with colored dots (running pulses 1.5s), role=status, aria-label combines label + state
  - **Tooltip**: Radix wrapper with locked delayDuration=200ms + 150ms ease-out cmc-tooltip-in keyframe; renders via Portal, asChild trigger
  - **Skeleton**: 3 variants (text/rect/circle); multi-line text wraps in cmc-skeleton-stack with aria-busy on the wrapper; 1.5s ease-in-out cmc-skeleton-pulse keyframe; inherits parent border-radius
  - **EmptyState**: heading + body + icon (aria-hidden) + action; 48px lucide icon slot via CSS, --cmc-text-dim
  - **RelativeTime**: Intl.RelativeTimeFormat with auto numeric ('N minutes ago' style); 30s tick refresh; Tooltip wrap showing absolute ISO when absoluteTooltip default true; formatRelative exported as pure helper
  - **ShellErrorBoundary + ShellErrorFallback**: react-error-boundary v6 wrapper; UI-SPEC verbatim "Couldn't reach the dashboard server. / Check that cc start is running, then refresh. / cc doctor"; defensive error: unknown narrowing
- **components/ui/index.ts** barrel re-exports all 9 primitives + formatRelative — single import path for Plan 05-04 + Phase 6/7
- **styles.css** appended 9 primitive blocks + 3 keyframes under a single new section header `/* Layout primitives — Phase 5 Plan 02 */` — all variables-driven, zero inline color literals
- **30 new test cases** (Task 1: 10; Task 2: 20) — variant + ARIA + class + ref forwarding + ref + disabled + type override + asChild + multi-line stack + slot rendering + fake-timer + throw/recover; full suite **42/42 green** (Wave 0 baseline 12 + 30 new)
- `npm run test`, `npm run typecheck` both exit 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Card family + Button + Badge + StatePill (presentational primitives)** — `c384c84` (feat)
   - 4 components + 4 test files + styles.css extension (4 primitive CSS blocks)
   - 10 new tests; verify checks pass (primary uses --cmc-gradient-hero via class binding)
2. **Task 2: Tooltip + Skeleton + EmptyState + RelativeTime + ErrorBoundary + barrel index** — `ceb1a5f` (feat)
   - 5 components + 1 barrel + 5 test files + styles.css extension (5 primitive CSS blocks + 2 keyframes)
   - 20 new tests; verify checks pass (delayDuration={200} present in Tooltip.tsx; "Couldn't reach the dashboard server." present in ErrorBoundary.tsx)

## Public API Surface (for Plan 05-04 + Phase 6/7)

```ts
// frontend/src/components/ui/index.ts (post-Plan-05-02)
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card'
export { Button } from './Button'
export { Badge } from './Badge'
export { StatePill } from './StatePill'
export { Tooltip } from './Tooltip'
export { Skeleton } from './Skeleton'
export { EmptyState } from './EmptyState'
export { RelativeTime, formatRelative } from './RelativeTime'
export { ShellErrorBoundary, ShellErrorFallback } from './ErrorBoundary'
// Sheet, CollapsibleSection, CommandPalette land in Plan 05-03 — append exports there.
```

Plan 05-04 (page grids) imports primitives via `import { Card, CardHeader, CardTitle, EmptyState, Skeleton } from '../components/ui'`.

## CSS Class Surface (for Plan 05-04 to compose against)

| Primitive | Base class | Modifier classes |
|---|---|---|
| Card | `.cmc-card` | `.cmc-card__header`, `.cmc-card__title`, `.cmc-card__description`, `.cmc-card__content`, `.cmc-card__footer` |
| Button | `.cmc-btn` | `.cmc-btn--primary`, `.cmc-btn--secondary`, `.cmc-btn--ghost`, `.cmc-btn--sm`, `.cmc-btn--md`, `.cmc-btn__icon-left`, `.cmc-btn__label`, `.cmc-btn__icon-right` |
| Badge | `.cmc-badge` | `.cmc-badge--neutral`, `.cmc-badge--info`, `.cmc-badge--success`, `.cmc-badge--warning`, `.cmc-badge--danger` |
| StatePill | `.cmc-state-pill` | `.cmc-state-pill--ok`, `.cmc-state-pill--running`, `.cmc-state-pill--pending`, `.cmc-state-pill--stale`, `.cmc-state-pill--error`, `.cmc-state-pill__dot`, `.cmc-state-pill__label` |
| Tooltip | `.cmc-tooltip` | `.cmc-tooltip__arrow` |
| Skeleton | `.cmc-skeleton` | `.cmc-skeleton--text`, `.cmc-skeleton--rect`, `.cmc-skeleton--circle`, `.cmc-skeleton-stack` |
| EmptyState | `.cmc-empty-state` | `.cmc-empty-state__icon`, `.cmc-empty-state__heading`, `.cmc-empty-state__body`, `.cmc-empty-state__action` |
| RelativeTime | `.cmc-relative-time` | (inherits color from parent) |
| ErrorBoundary fallback | `.cmc-error-fallback` | `.cmc-error-fallback__heading`, `.cmc-error-fallback__body`, `.cmc-error-fallback__detail` |

Keyframes added: `cmc-pulse` (StatePill running 1.5s), `cmc-tooltip-in` (Tooltip 150ms), `cmc-skeleton-pulse` (Skeleton 1.5s).

## RTL/Radix Patterns That Needed Adjustment for happy-dom

**One adjustment needed:** Radix Tooltip renders the tooltip text TWICE in the DOM — once as visible content (className=cmc-tooltip) and once in a screen-reader-accessible role="tooltip" sr-only span. RTL's `findByText` throws on multiple matches by default, so the test was rewritten to use `findAllByText` for a count assertion plus `getByRole('tooltip')` for the canonical accessibility surface check. This is the correct shape for any future Radix popover content tests (Sheet, CommandPalette in Plan 05-03 will likely need the same idiom).

**Tooltip 200ms delay handling:** The Wave 1 plan flagged a potential `findByText` flakiness from the 200ms delay. In practice Radix opens the tooltip immediately on focus (the keyboard fast path) — `userEvent.tab()` to the trigger reveals the content without waiting the 200ms hover delay. No timeout tuning was needed beyond a generous 1000ms `findByText` ceiling for happy-dom rAF jitter (which never actually fired in tests).

**No other Radix/RTL/happy-dom adjustments needed.** The 5 Wave 0 pitfall mitigations (HTMLElement pointer-capture shims, ResizeObserver stub, matchMedia stub, IS_REACT_ACT_ENVIRONMENT bridge, MotionConfig reducedMotion='always' wrapper) handled every primitive without modification.

## Deviations from Plan

None — plan executed exactly as written.

The Tooltip test assertion change (findByText → findAllByText + getByRole('tooltip')) was an in-test refinement to match Radix's actual DOM output, not a deviation from the plan's prescribed component implementation. The plan said "If the 200ms delay makes tests flaky, use `findByText` with a 500ms timeout — DO NOT mock setTimeout"; we did not need timeout tuning, only a duplicate-match handler.

## Threat Flags

None — this plan ships layout-only presentational primitives. No new network endpoints, auth surface, file access patterns, or schema changes at trust boundaries.

## Issues Encountered

- Initial Tooltip test used `findByText('Hello tooltip')` which threw "Found multiple elements" because Radix renders the tooltip content in two places (visible cmc-tooltip + sr-only role=tooltip span). Resolved within the same task by switching to `findAllByText` + `getByRole('tooltip')`. Documented as a pattern for future Radix portaled-content tests in Plan 05-03.
- No environmental/infrastructure issues. happy-dom + Vitest 4 + RTL 16 harness from Plan 05-01 worked unmodified for all 9 primitives.

## Next Plan Readiness

**Plan 05-03 (Wave 2 — interactive primitives) entry contract:**
- All 9 layout primitives are import-ready from `frontend/src/components/ui` barrel
- Plan 05-03 will append Sheet / CollapsibleSection / CommandPalette exports to `index.ts` (TODO marker present)
- Plan 05-03 must append CSS class blocks under a new section header in `styles.css` (do NOT modify the Layout primitives section — Plan 05-02 owns those classes)
- Plan 05-03 may reuse the in-test patterns: forwardRef + className passthrough, findAllByText for portaled Radix content, vi.useFakeTimers for time-dependent rendering, defensive error: unknown narrowing for any react-error-boundary v6 consumers

**Plan 05-04 (page grids) consumes:**
- `import { Card, CardHeader, CardTitle, CardDescription, CardContent, EmptyState, Skeleton, RelativeTime } from '../components/ui'` covers most of the page-grid composition surface
- ShellErrorBoundary wrapper available as a panel-level boundary (Plan 05-04 may consolidate it into __root.tsx if appropriate)

**Phase 6/7 consumes:**
- Every primitive plus formatRelative pure helper for any custom relative-time rendering outside the RelativeTime component
- Status palette (Badge variant=danger, StatePill state=error) reserved for state communication only — never substitute for the accent gradient

NO blockers; NO open questions for Wave 2.

## Self-Check: PASSED

Verified before submission:

- [x] frontend/src/components/ui/Card.tsx exists
- [x] frontend/src/components/ui/Button.tsx exists
- [x] frontend/src/components/ui/Badge.tsx exists
- [x] frontend/src/components/ui/StatePill.tsx exists
- [x] frontend/src/components/ui/Tooltip.tsx exists
- [x] frontend/src/components/ui/Skeleton.tsx exists
- [x] frontend/src/components/ui/EmptyState.tsx exists
- [x] frontend/src/components/ui/RelativeTime.tsx exists
- [x] frontend/src/components/ui/ErrorBoundary.tsx exists
- [x] frontend/src/components/ui/index.ts exists and re-exports 9 primitives + formatRelative
- [x] All 9 corresponding __tests__ files exist
- [x] styles.css contains "/* Layout primitives — Phase 5 Plan 02 */" section header
- [x] Tooltip.tsx contains literal `delayDuration={200}`
- [x] ErrorBoundary.tsx quotes "Couldn't reach the dashboard server." verbatim
- [x] Commit c384c84 (Task 1) exists in git log
- [x] Commit ceb1a5f (Task 2) exists in git log
- [x] `npm run test` exits 0 with 42/42 passing
- [x] `npm run typecheck` exits 0

---
*Phase: 05-frontend-shell-design-system*
*Completed: 2026-04-27*
