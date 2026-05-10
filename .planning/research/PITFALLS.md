# Pitfalls Research

**Domain:** Claude Mission Control v1.3 — Surface Redesign (full UX rebuild on top of a mature single-user observability dashboard at v1.2 close).
**Researched:** 2026-05-10
**Confidence:** HIGH for codebase-anchored pitfalls (every fingerprint cites a real file/component or a v1.2 invariant), MEDIUM for industry parallels (Datadog/Grafana/Honeycomb/PostHog redesign references are illustrative — verified at the level of "this category of regression is documented in those products," not exact line-numbered post-mortems).

**Research scope note:** This is a SUBSEQUENT-MILESTONE pitfall pass for a *full UX rebuild*, not a feature-add pass. Existing v1.0–v1.2 pitfalls (alert engine isolation, anomaly detector unification, stable `dedup_key`, `project_key` migration, Welford variance, datetime hygiene, idempotent skill ingest, read-time cost compute) are NOT re-researched here. Each pitfall below is specific to the act of *replacing every visible surface* while keeping URLs, API contracts, and the green-test invariant intact. The user reports three concrete symptoms ("panels exceed viewport / Sheets escape parent bounds / data overflows card edges") that anchor Pitfall 1; the rest are the failure modes that typically *re-introduce* those symptoms (or create new ones) mid-rebuild.

**The shape of this document:** 10 critical pitfalls (one per requested category) with the standard fingerprint structure (what / why / avoid / warning signs / phase / audit hook), then condensed roll-up sections (technical debt, performance traps, UX pitfalls, "looks done but isn't" checklist, recovery, phase mapping).

---

## Critical Pitfalls

### Pitfall 1: Re-introducing the three reported overflow bugs mid-rebuild

**What goes wrong:**
The user reports three failure modes that ship in v1.2 today and must NOT re-appear in v1.3:
1. **Panel-exceeds-viewport.** A page-level container drops `min-h-0` (or its `flex-1 min-h-0` sibling pair) on a flex child, causing the inner panel to expand to its content height and push the page taller than the viewport. Symptom: outer scrollbar instead of inner-panel scroll; sticky headers float away from the top of the panel.
2. **Sheet/Popover-escapes-parent.** A redesigned `Sheet`, `Popover`, or `DropdownMenu` is mounted inline (no `<Portal>`) or has its z-index controlled with Tailwind `z-50` instead of inheriting from Radix's portal layer. Symptom: dropdown clipped by `overflow-hidden` ancestor; Sheet content rendered behind the modal overlay; popover shifts when the parent card has `position: relative`.
3. **Data-overflows-card-edges.** A new responsive table or KPI strip uses `overflow-visible` (to expose sticky-column box-shadow or to let tooltips escape), and horizontal data overflow now bleeds out of the card. Symptom: long session IDs/skill names extend past the card's right edge; right-rule of the card no longer aligns with cards above/below in the same column.

These three failure modes are independent in their CSS but identical in their *cause shape*: a refactor changes the constraint propagation chain (flex `min-h-0` ladder, portal+z-index contract, or `overflow-clip` boundary) and the regression goes unnoticed because Storybook/unit tests don't exercise the page-level layout.

**Why it happens during a rebuild specifically:**
- A rewritten `PanelCard` or `Card` component is built in isolation and looks correct at any single viewport, but its containing pages no longer enforce the `min-h-0` ladder up to the route root. Tailwind's `h-screen` + nested `flex-col` layouts require *every* flex child between the screen root and the scroll container to have `min-h-0` (or `min-height: 0`); dropping it on any one rung breaks the ladder. The Mozilla/MDN flex-child default `min-height: auto` is the trap. ([Modus Create — flex overflow fixes](https://moduscreate.com/blog/how-to-fix-overflow-issues-in-css-flex-layouts/), [flexbugs #1](https://github.com/philipwalton/flexbugs/issues/241))
- A redesigned Sheet drops `<Sheet.Portal>` because the rebuild moves the trigger inside a card that already uses Radix `Tooltip.Provider`, and the dev assumes nested Radix primitives auto-portal. They don't — each primitive's `Content` must be wrapped explicitly. Radix v2+ also stopped managing z-index entirely, so Tailwind `z-50` collides with shipped Radix `radix-portal` z-indices (some legacy primitives still set `z-index: 2147483647`, others set nothing). ([Radix issue #1317 — z-index conflicts](https://github.com/radix-ui/primitives/issues/1317), [Radix issue #1253 — non-portalled positioning broken when parent is `position: relative`](https://github.com/radix-ui/primitives/issues/1253))
- A redesigned table drops `overflow-x-clip` on the card wrapper because the new sticky-column shadow needs to escape vertically. Horizontal containment quietly evaporates. The fix is to use *axis-specific* `overflow-x-clip overflow-y-visible` rather than blanket `overflow-visible`.

**How to avoid:**
1. **Encode the `min-h-0` ladder as a single shared shell component, not as a per-page convention.** The route shell (e.g. `<RouteFrame>`) declares the `flex-col h-screen min-h-0` chain once; pages mount inside it and inherit. Add a Vitest unit test on the shell that asserts each layer's computed `min-height: 0px` via JSDOM (or a Playwright DOM-snapshot test that asserts inner-panel scroll, outer-page no-scroll on a tall fixture).
2. **Wrap every Sheet/Popover/DropdownMenu/Tooltip in its `*.Portal` explicitly** and document the rule in `frontend/src/components/ui/AGENTS.md`. Add an ESLint rule (custom or `eslint-plugin-react`) that forbids `<Sheet.Content>` not preceded by `<Sheet.Portal>` in the same JSX subtree.
3. **Define a single `--cmc-z-*` z-index token scale** (e.g. `--cmc-z-popover: 60`, `--cmc-z-sheet: 70`, `--cmc-z-toast: 80`) in `globals.css`, applied in component CSS via `style={{ zIndex: 'var(--cmc-z-popover)' }}` or a small Tailwind plugin. Forbid raw `z-` Tailwind classes via ESLint regex on `className`.
4. **Use axis-specific overflow on cards.** `overflow-x-clip` for horizontal data; `overflow-y-visible` only when a sticky shadow needs to escape. Add a Playwright snapshot test that loads `/sessions`, `/skills`, `/cost`, `/alerts`, `/activity` on a 1280×720 viewport AND a 1024×600 viewport, asserts `document.documentElement.scrollWidth === clientWidth` (no horizontal page scroll) and that each card's right edge aligns within 1px of the column gutter.
5. **A "containment trio" Playwright fixture** that deliberately stresses all three bugs in one test:
   - Open a Sheet from inside a Card with `position: relative` → assert Sheet covers viewport, click-outside closes it.
   - Resize viewport from 1440 to 1024 mid-test → assert no horizontal scroll on body, all cards still aligned.
   - Open a tall data table inside a panel → assert inner-panel scroll, panel's outer height === viewport - shell-chrome.

**Warning signs:**
- A PR diff shows `min-h-0` removed from any flex child without an explicit replacement.
- Any new `<Sheet.Content>` / `<Popover.Content>` not preceded by its `*.Portal` in the same file.
- `className` containing `z-10`, `z-20`, …, `z-50` on a Sheet, Popover, DropdownMenu, or Toast.
- A card-style component using `overflow-visible` (blanket) rather than axis-specific.
- Visual diff: outer `<body>` shows a scrollbar on a route that previously had only inner-panel scroll.
- User-facing: long strings (session IDs, project paths) extending past the right edge of a card on the v1.3 build.

**Phase to address:**
Earliest possible — the **Shell + Containment** phase (typically Phase 24, the first v1.3 phase). The route shell, z-index scale, axis-specific overflow utilities, and Portal-discipline ESLint rule must all land before any page-level redesign begins. Every later phase inherits the discipline.

**Audit hook (verifier rules):**
- Playwright: `tests/e2e/v13-containment.spec.ts` covering the three named failure modes against every top-level route.
- ESLint custom rule: `cmc/no-bare-radix-content` (forbid `<X.Content>` without `<X.Portal>` parent in the same component).
- ESLint regex rule: forbid `className=` strings containing `\bz-(10|20|30|40|50)\b` on files matching `Sheet|Popover|Dropdown|Tooltip|Toast`.
- Vitest: a `min-h-0` ladder unit test on `RouteFrame` using `getComputedStyle`.

---

### Pitfall 2: Tailwind class churn in shared components silently regresses unrelated screens

**What goes wrong:**
A refactor of a shared primitive — `Card`, `PanelCard`, `KpiTile`, `DataTable`, `Sheet` header, the route header — changes Tailwind utility composition (e.g. `p-4` → `p-5`, `gap-2` → `gap-3`, `rounded-lg` → `rounded-xl`, color tokens swap). The component is verified on the page that motivated the change, but four other pages that consume the same component regress: KPI strips lose vertical rhythm, the Cost dashboard's `CostByProjectCard` no longer aligns with the `CostForecastCard` next to it, the Sheet header's title now collides with the close button on narrow viewports. The regression is visual, not functional, so unit tests pass and the change ships.

This is the *single most common* failure mode in observability-product redesigns (Grafana 9 navigation refresh, Datadog v2 dashboard chrome, PostHog Insights 2024 — all shipped public regressions of this exact shape). It compounds in v1.3 because the rebuild touches every primitive, so every page is downstream of the churn.

**Why it happens:**
- Tailwind utility-first style means component contracts are *implicit* — a card declares `p-4` and pages assume the inner content area is `inherent_height - 32px - 32px`. Change to `p-5`, every page that hard-codes a fixed-height inner element (chart, KPI tile) overflows or under-fills by 8px.
- Shared component changes are reviewed by a single reviewer who looks at the PR's screenshots — only of the pages the author tested. Pages the author didn't open are invisible to review.
- Vitest snapshot tests record `className` strings in serialized JSX; any reorder of utilities (Prettier `prettier-plugin-tailwindcss` re-sorts on save) creates a snapshot diff that gets reflexively `--update`'d, hiding real regressions in the noise.

**How to avoid:**
1. **Component-contract isolation via Storybook.** Every shared primitive in `frontend/src/components/ui/` gets a `*.stories.tsx` with a "kitchen sink" story that exercises: small/medium/large content, with/without title, with/without action, narrow/wide container, light/dark theme. Visual regression on Storybook stories (Chromatic, Lost Pixel, or self-hosted Playwright + `expect(page).toHaveScreenshot()`) catches churn at the primitive level before it reaches pages. ([Storybook visual testing](https://storybook.js.org/docs/writing-tests/visual-testing), [Lost Pixel + shadcn](https://www.lost-pixel.com/blog/visual-regression-testing-of-shadcn-ui-with-storybook))
2. **Per-page Playwright screenshot diffs at the route level.** Every top-level route gets a Playwright screenshot test at 1280×720 and 1024×600 dark theme. CI fails on > 0.1% pixel diff. The author intentionally regenerates baselines as part of the design phase, then the baseline is locked.
3. **Forbid prettier-plugin-tailwindcss-induced snapshot churn.** Either remove vitest snapshot tests of `className` strings (prefer Testing Library queries) or run Prettier in CI before snapshot generation so order is canonical.
4. **Density-aware spacing tokens, not raw Tailwind utilities.** `p-comfortable`, `gap-comfortable`, `text-comfortable` resolve to CSS variables that cascade with the density-mode root class (see Pitfall 7). Refactoring `Card` then means changing one token, not 40 page-side spacings.

**Warning signs:**
- A PR titled "redesign Card" touches one file but changes the visual diff baseline on > 3 routes.
- A reviewer asks "did you test on /cost?" and the author says "no, it doesn't use Card"… and is wrong.
- Snapshot test diff shows only `className` strings reordered.
- A user-reported bug describes "the sessions page got 8px shorter" with no functional change.

**Phase to address:**
**Shell + Containment** phase (Phase 24) installs the Storybook + visual-regression infra and the route-level screenshot tests. **Each per-page phase** thereafter is gated on no unauthorized screenshot diffs on routes other than the one being redesigned. The polish phase performs a full visual audit.

**Audit hook (verifier rules):**
- Storybook coverage rule: every component in `frontend/src/components/ui/` has a `.stories.tsx` and at least one "kitchen sink" story.
- Playwright `tests/e2e/v13-route-screenshots.spec.ts` covering all 8 routes in dark theme at 2 viewports.
- CI step: per-PR diff comment posting Storybook + Playwright screenshot deltas.
- Vitest config: remove or freeze snapshot tests of JSX `className` after Prettier canonicalization.

---

### Pitfall 3: Accessibility regressions during the dark-theme refresh

**What goes wrong:**
A "Honeycomb/Datadog/PostHog/Grafana family" aesthetic shift means moving away from the high-contrast v1.2 dark theme toward a more designed palette: muted greys, blue-grey instead of pure black, accent colors with reduced saturation. The visual result is what the user wants. The accessibility result is: text/background pairs drop below WCAG AA 4.5:1 for normal text or 3:1 for large text and UI components; focus rings disappear against the new accent color; data-table header text fails contrast against the new card background; status pills (`StatePill`) using semantic colors (`text-emerald-400` on `bg-emerald-950`) re-test below 4.5:1; dense-mode rows shrink below the 24px target size for keyboard activation. ([WCAG AA contrast](https://www.makethingsaccessible.com/guides/contrast-requirements-for-wcag-2-2-level-aa/), [dark mode accessibility](https://www.accessibilitychecker.org/blog/dark-mode-accessibility/))

Specific failure modes documented in dashboard dark-theme redesigns:
- **Pure black backgrounds.** The "Honeycomb-y" instinct is `#000` or `#0a0a0a`; pure black on light text causes halation (text shimmer) and exceeds healthy contrast. Recommended is a dark-grey base (`#0f1115`–`#181a20` range).
- **Status colors below threshold.** A semantic palette like `text-emerald-400 bg-emerald-950` looks "right" but tests at ~3.8:1 against the card background. Fails AA for normal text.
- **Focus rings on accent backgrounds.** `ring-blue-500` on `bg-blue-600` button: the ring is the same hue as its parent and disappears for keyboard users.
- **Cmd+K palette focused-item highlight.** Existing `cmdk` 1.1.x ships a default `[data-selected="true"]` style; redesigned versions often drop the explicit selection background in favor of a left-border accent that fails 3:1 against the palette base.
- **Sheet/drawer keyboard nav.** A redesigned Sheet that handles its own focus trap (vs. delegating to Radix) often forgets `Escape` close, `Tab`-cycle, return-focus-to-trigger, or initial-focus-on-first-input. Radix gives these for free; bespoke replacements usually don't.
- **Screen-reader semantics on dense data tables.** A redesigned `<DataTable>` that uses `<div role="table">` instead of `<table>` for layout flexibility loses VoiceOver column-header announcement unless `aria-rowindex`/`aria-colindex`/`aria-rowcount` are wired *exhaustively* — easy to miss on virtualized tables.

**Why it happens:**
- Designers iterate on aesthetic before measuring contrast; engineers translate Figma colors directly to CSS variables; nobody runs an audit until polish phase.
- Radix primitives' a11y is invisible-by-default (focus traps, ARIA wiring, return-focus); replacing a Radix Sheet with a bespoke drawer "to control the animation" silently drops 6+ a11y guarantees.
- macOS Safari and Chrome render `outline` rings differently; a focus ring tested in Chrome dev looks fine, in Safari it's offset 1px and clipped by the parent's `overflow-hidden`.
- Single-user macOS-only deployment makes a11y feel skippable, but the user still benefits from keyboard nav (Cmd+K, Esc, Tab) and reasonable contrast at low brightness.

**How to avoid:**
1. **Lock the color palette as design tokens with measured contrast** before any component redesign. Each token pair (text-on-card, accent-on-card, status-on-card-at-each-severity) gets a contrast ratio annotation in `tokens.md`. Below 4.5:1 → ban for body text; below 3:1 → ban for UI components.
2. **Automated contrast testing in CI.** A small script that walks the design-token JSON and asserts ratios for the documented pairs. Bonus: an `axe-core` Playwright integration that runs on every screenshot test (`@axe-core/playwright`) to catch dynamic regressions on actual rendered pages.
3. **Keep Radix primitives for Sheet, Dialog, Popover, DropdownMenu, Tooltip.** Restyle, do not replace. Bespoke drawers are the single biggest a11y regression vector in dashboard redesigns.
4. **Focus-ring contract.** A single `--cmc-focus-ring` CSS variable (e.g. `box-shadow: 0 0 0 2px var(--cmc-bg) , 0 0 0 4px var(--cmc-focus-ring)` for the double-ring inset trick) used everywhere; never `ring-blue-500` directly. Verify the focus ring on an accent button passes 3:1 against the *button's own background*, not just the page background.
5. **Density mode lower bound.** Compact density doesn't shrink interactive targets below 24×24 logical px (WCAG 2.5.8 target size at AA). Compact tables can shrink row text but *not* interactive control hit areas.
6. **Keyboard-nav Playwright test.** Tab-walk every route, assert each focusable element gets a visible focus ring (screenshot diff against an unfocused baseline).

**Warning signs:**
- A design token doc exists without contrast-ratio annotations.
- A redesigned `Sheet`/`Dialog` no longer wraps Radix.
- Tab-key navigation skips focusable elements (focus rings invisible) or a focused element is below the viewport with no scroll-into-view.
- `Cmd+K` palette items don't visually highlight when navigated by arrow keys.
- A status pill in the redesigned `StatePill` is announced by VoiceOver as a generic span (no `role="status"` or visible label).
- Any new `<div role="...">` replacing a semantic HTML element without a stated reason.

**Phase to address:**
- **Shell + Containment** phase (Phase 24): install design tokens with contrast ratios, focus-ring CSS variable, axe-core Playwright integration.
- **Each per-page phase**: page-specific a11y check (tab-walk, screen-reader pass on the changed route) at phase close.
- **Polish phase** (final v1.3 phase): full audit (axe-core full sweep, keyboard nav across all routes, contrast audit on all token pairs).

**Audit hook (verifier rules):**
- CI script `scripts/check-contrast.ts` parses design tokens, asserts ratios.
- Playwright fixture wraps `@axe-core/playwright` on every route screenshot test.
- ESLint rule forbidding `role="table|button|dialog|menu"` on a `<div>` (require semantic element or document an exception).
- A "Sheet must wrap Radix" code search test in CI: `rg "function .*Sheet" frontend/src/components/ui/Sheet.tsx | rg -v "@radix-ui"` should return zero matches.

---

### Pitfall 4: Performance regressions from new chart libraries, grid layouts, and density modes

**What goes wrong:**
v1.2 ships fast: pages poll at 30s intervals, recharts panels render in <50ms, density toggles are instantaneous (because they don't exist yet). v1.3 introduces three independent perf risks that compound:

1. **Density-toggle full re-render.** A naive density-mode implementation toggles a React Context value (e.g. `densityMode: 'comfortable' | 'compact'`); every consumer re-renders, every recharts panel re-mounts (chart libraries that key off props re-mount on prop change ([recharts perf optimization](https://recharts.github.io/en-US/guide/performance/), [recharts issue #1624](https://github.com/recharts/recharts/issues/1624))). What should be a CSS-only swap (root class → CSS variables → spacing changes) becomes a tree-wide React reconciliation + chart remount. User-visible: 200–400ms jank when toggling density.
2. **react-grid-layout drag thrash.** If "customizable layouts" is scoped, react-grid-layout's drag adds `react-draggable-transparent-selection` to body, disabling text-select globally, which causes a 100ms+ paint delay per drag tick on dense panels ([RGL issue #2066](https://github.com/react-grid-layout/react-grid-layout/issues/2066), [RGL issue #83](https://github.com/react-grid-layout/react-grid-layout/issues/83)). On a layout with 12 panels, dragging one panel re-runs `onLayoutChange` on every tick, which (if naively wired to localStorage persistence) writes localStorage 30+ times per second.
3. **CSS variable change forces layout recalc on every panel.** Setting `--cmc-density-row-height` on `:root` invalidates layout for every descendant that uses it, causing a full-document reflow even when only one panel is visible. Combined with recharts' `ResponsiveContainer` (which re-measures on every parent reflow), one density toggle can trigger 12 chart re-measurements + 12 chart re-paints.
4. **Chart library re-mount on prop change.** A redesigned chart wrapper that passes a new object literal as `data={[...]}` on every render (forgetting `useMemo`) causes recharts' deep-compare path to think every render is a real data change, triggering redraw with animation ([recharts issue #281](https://github.com/recharts/recharts/issues/281)). Polling at 30s now means a 200ms freeze every 30 seconds.

**Why it happens:**
- Density-mode is conceptually simple (one CSS variable) but engineers default to React state + Context because it composes with the rest of the app's state model. Tree-wide Context re-render is the trap.
- react-grid-layout's perf knobs (`useCSSTransforms`, throttling `onLayoutChange`, separating drag-state from persist-state) aren't on by default and aren't documented as required.
- `ResponsiveContainer` is convenient but is a perf trap on dense pages — it uses `ResizeObserver` and re-measures aggressively.
- Polling intervals are invisible until something becomes slow; a page that polls 30s and re-renders 8 panels is fine, the same page after wrapping each panel in a new `<motion.div>` for the redesign is not fine.

**How to avoid:**
1. **Density mode is CSS-only.** Toggle `data-density="compact"` on `<html>`; all spacing tokens cascade via `:root[data-density="compact"] { --cmc-row-h: 24px; ... }`. React state for the *toggle UI* (which option is selected); no React state for the *applied density* — only the DOM attribute. Components consume via CSS variables, not via Context. Toggle is instantaneous, no re-renders, no chart re-mounts.
2. **Memoize chart data and config.** Every recharts component receives `data` and `config` props from `useMemo` upstream. Add a Vitest test or React Profiler integration that asserts no chart re-renders on density toggle.
3. **Throttle react-grid-layout persistence.** Persist layout to localStorage on `onLayoutChange` *only* via `requestIdleCallback` or a 500ms debounce. Drag state lives in component state; only the *final* layout writes to storage. ([RGL drag perf docs](https://github.com/react-grid-layout/react-grid-layout))
4. **Avoid `ResponsiveContainer` on grids of charts.** Use a single `useMeasure` at the panel level + pass explicit `width`/`height` to recharts. One ResizeObserver instead of N.
5. **Polling stays at 30s but stagger across panels.** Don't poll all panels in lockstep. Stagger initial fetches by 250ms so re-renders don't pile up.
6. **Performance budget per phase.** First Contentful Paint < 1s on 1024×600 dark-theme cold load; density toggle < 50ms (no jank); panel update on poll tick < 100ms. Measured via Playwright trace at every phase close.

**Warning signs:**
- React DevTools Profiler shows > 50 component re-renders per density toggle.
- Chrome Performance tab shows a > 100ms scripting block on every poll tick.
- localStorage write count exceeds 5/sec during a layout drag.
- Recharts' `Animation` plays on every poll tick (data didn't change, animation shouldn't fire).

**Phase to address:**
- **Shell + Containment** phase (Phase 24): density-mode mechanism is CSS-only by construction.
- **Customizable layouts** phase (if scoped): react-grid-layout perf knobs locked at phase open.
- **Polish phase**: full perf audit including 30s-poll stability, density toggle, layout drag.

**Audit hook (verifier rules):**
- Playwright trace assertion: density toggle creates < 5 React reconciliations (use React DevTools profiling API).
- Vitest: any `recharts` consumer must memoize `data` and `config` (lint rule: `<LineChart` requires `data={memoizedXyz}` not `data={[...]}` literal).
- Playwright trace: open `/cost`, wait 60s (two poll ticks), assert no chart `<Line>` element re-mounts (compare DOM stable).
- Lighthouse CI as a soft gate at phase close: `total-blocking-time < 200ms` cold-load.

---

### Pitfall 5: Test-suite stability during the mass rewrite

**What goes wrong:**
v1.2 ships 661 backend + 326 frontend + 13 Playwright tests green. The constraint says tests must stay green at every v1.3 phase close, and there must NOT be a "big-bang test rewrite phase." Three failure modes break this:

1. **Playwright selector churn.** Existing e2e tests use a mix of `getByRole`, `getByText`, and `getByTestId`. A redesigned page renames a button ("Save" → "Apply"), and `getByText('Save')` selectors break across 3 specs. Worse: tests keyed on Tailwind class names (`page.locator('.bg-blue-600')`) break on every theme refresh. v1.3 has 13 specs; if the redesign breaks 4 specs per phase and each takes 30 minutes to repair, that's a 4-hour test-debt tax per phase. ([Playwright best practices on selectors](https://playwright.dev/docs/best-practices), [data-testid stability](https://www.sourcefuse.com/resources/blog/zero-maintenance-playwright-tests-how-centralized-data-testid-makes-ui-automation-robust/))
2. **Vitest snapshot flake.** Snapshot tests of rendered components include `className` strings; Prettier's tailwind plugin reorders utilities; snapshots diff; engineer runs `--update`; real visual regressions hide in the noise.
3. **Backend test fixtures break on URL changes.** The constraint says URLs are preserved externally, but *internal* test fixtures might hard-code old paths. If the rebuild moves an admin page (which has no external bookmarks, so URL preservation doesn't apply) and an integration test posts to its old URL, the test breaks silently if the route returns 404 *and* the test doesn't assert status.

**Why it happens:**
- The 13 Playwright specs were written across v1.0–v1.2 by different authors with no enforced selector convention. `data-testid` is added inconsistently (alerts.spec.ts uses some, sessions-compare uses very few).
- Vitest snapshots feel "free" but they bind tests to implementation detail (class strings) instead of behavior.
- The mass-rewrite mindset says "rewrite tests when the code changes," but the constraint forbids that. The hidden cost is paying it incrementally per phase, where it's individually small but cumulatively large.

**How to avoid:**
1. **Pre-rebuild Playwright hardening (Phase 24, day 1).** Walk every existing spec, replace text/class/role selectors with `getByTestId` where the test asserts identity (a button named "Save" is identified by `data-testid="alert-save"`, not by its text). Keep `getByRole` only where role is the contract being tested. Document the convention in `frontend/tests/e2e/AGENTS.md`. Establish a `data-testid` registry (`frontend/src/lib/testIds.ts`) to centralize; lint rule forbidding bare string `data-testid`s elsewhere. ([centralized data-testid](https://www.sourcefuse.com/resources/blog/zero-maintenance-playwright-tests-how-centralized-data-testid-makes-ui-automation-robust/))
2. **Rewrite tests around stable contracts.** Tests assert "clicking the Save button submits the form" not "clicking the button labeled Save submits the form." `data-testid` first, `getByRole` second, never `getByText` for actions.
3. **Ban `className` in Vitest snapshots.** Configure `serializers` to strip `className` props before snapshot. Or remove snapshot tests in favor of explicit `expect(...).toBeVisible()` assertions.
4. **Backend URL preservation test** — add a dedicated `tests/test_url_contract.py` that GETs every URL listed in `docs/url-contract.md` (a new file enumerating all preserved external URLs) and asserts 200 (or 200 + redirect for known redirects). Run on every PR.
5. **Phase-close test-green gate.** Each phase plan has a verifier rule "all backend tests green; all frontend tests green; all Playwright tests green; the 2 known skips remain skipped at the same line numbers." A diff in skip count or skip location is a phase-close failure.
6. **Pre-existing Playwright skips.** The 2 dev-DB-state-dependent skips (`alerts.spec.ts:40 TEST-05a`, `skills-detail.spec.ts:25 SKLP-08/09/10`) need a tracking decision in v1.3: either fix them with deterministic fixtures (preferred) or leave them and gate phase close on "skip count == 2 and at original line numbers." Don't accidentally re-introduce them as new skips.

**Warning signs:**
- A PR diff in a Playwright spec shows > 10 line changes (likely selector churn rather than intentional change).
- Vitest snapshot diff is 100% `className` reorder.
- A backend test silently passes against a 404 (`response.status_code == 404` not asserted).
- Phase close ships with skip count > 2 or new `.skip` markers added.

**Phase to address:**
- **Phase 24 (Shell + Containment), day 1**: Playwright hardening pass; `data-testid` registry; ban className snapshots; URL contract test scaffolded.
- **Each phase close**: green-test gate verified by automation, not by author claim.
- **Final polish phase**: re-run skipped tests with deterministic fixtures, attempt to lift skips.

**Audit hook (verifier rules):**
- ESLint rule: `data-testid="..."` literal forbidden in JSX; must come from `testIds.someKey`.
- Vitest config: snapshot serializer strips `className`.
- CI: `tests/test_url_contract.py` failing fails CI.
- Phase-close verifier: `pytest --co -q | grep skip | wc -l == 2` (or whatever the exact count is); locations match registry.

---

### Pitfall 6: URL preservation traps with TanStack Router file-based routing

**What goes wrong:**
The constraint says external URLs are preserved (Telegram deep-links, schedule composer share links, bookmarks). TanStack Router's file-based routing makes refactoring tempting: rename a route file from `sessions.tsx` to `sessions/index.tsx`, change the URL from `/sessions` to `/sessions/`. Add a parent layout file `sessions.tsx` (now a layout) and child `sessions/$id.tsx`, the deep-link `/sessions/abc-123` works… but `/sessions` now redirects unexpectedly. Or change the `validateSearch` Zod shape from `{ a?: string }` to `{ a?: string, b?: string }` with a *required* default — share-links from `/sessions/compare?a=foo` parse with `b=undefined` and fail validation, redirecting to a clean URL and losing the user's compared session.

Specific named traps:

1. **`sessions.tsx` → `sessions/index.tsx` URL drift.** TanStack auto-generates the `routeTree.gen.ts`; rename a flat route to a directory route and the URL sometimes gains a trailing slash, sometimes loses an alias. ([TanStack file-based routing](https://tanstack.com/router/latest/docs/routing/file-based-routing), [TanStack issue #3282](https://github.com/TanStack/router/issues/3282))
2. **Adding a layout breaks deep-link bookmark.** Inserting `_layout.tsx` between root and `sessions.tsx` re-runs `beforeLoad` on every page nav inside `/sessions/*`; if `beforeLoad` redirects or throws on missing query params, deep-links from Telegram's `/sessions/compare?a=...&b=...` lose their search params.
3. **`validateSearch` shape change.** Changing the Zod schema for compare's search params from `z.object({ a, b })` to `z.object({ a, b, mode: z.enum(...).default('split') })` looks backward compatible — but TanStack issue #3120 documents that "search params get stripped if validateSearch throws and beforeLoad redirects" ([issue #3120](https://github.com/TanStack/router/issues/3120)). Old links that don't include `mode` may parse, but if any field is renamed, the URL is rewritten on first load and all share-links degrade.
4. **`validateSearch` running twice.** TanStack issue #2878 documents `validateSearch` transformations running twice; if the redesign adds a transform (e.g. coerce comma-separated string → array), the URL state can drift on first navigation. ([issue #2878](https://github.com/TanStack/router/issues/2878))
5. **Trailing-slash policy.** v1.2 has the trailing-underscore opt-out convention for routes like `sessions_.compare.tsx`. A rebuild that "cleans up" file names risks renaming `sessions_.compare.tsx` to `sessions/compare.tsx`, which is a different URL pattern.
6. **API URLs.** The constraint mentions URLs (frontend) but the same logic applies to backend API URLs. Tests live behind `/api/sessions/{id}/compare` etc. — moving `/api/skills/{name}/projects` to `/api/skills/projects/{name}` would break Telegram and the schedule composer (which call backend endpoints directly). The "extend not break" API constraint covers this, but TanStack's file-based naming temptation does NOT apply to backend.

**Why it happens:**
- TanStack's file-based routing makes URL-from-filename derivation invisible; a file rename feels safe.
- Designers think in terms of page structure ("sessions has a sub-page"), not URL strings; the engineer translates and the URL changes.
- `validateSearch` is treated as a frontend-only schema, not as a published contract for share-link compatibility.

**How to avoid:**
1. **Lock external URLs in a contract file (`docs/url-contract.md`).** Every URL externally referenced (Telegram callbacks, schedule composer share links, bookmark prefixes) is enumerated. Each URL has a "do-not-change" status. The URL contract test (Pitfall 5) verifies live.
2. **Preserve every existing route filename.** Renames forbidden in v1.3 unless the URL contract is updated AND a redirect is added. Redirects via TanStack's `redirect()` function on a new alias route, NEVER via filename change.
3. **`validateSearch` schemas are append-only.** New optional fields with defaults are fine; renaming, removing, type-narrowing existing fields is forbidden. Add a unit test for `validateSearch` that asserts every documented "old URL" parses cleanly into the current schema.
4. **No new layout files between root and existing leaves.** If a layout is needed, mount the layout *inside* the leaf route or compose at the component level, never via a filename refactor.
5. **Backend API URL contract file (`docs/api-contract.md`)** lists every URL pattern (`GET /api/sessions/{id}`) with frozen status. Lints/CI fails on changes.
6. **Trailing-underscore opt-out preserved.** v1.2's `sessions_.compare.tsx` filename convention stays; document it in `frontend/AGENTS.md` so a rebuild engineer doesn't "fix" it.
7. **Telegram link compat test.** A Playwright test that constructs a URL identical to a known-shipped Telegram callback and asserts it loads to the right session, with the right tab, with the right filters.

**Warning signs:**
- A PR renames any file under `frontend/src/routes/`.
- A PR adds a new file under `frontend/src/routes/` whose path corresponds to an existing URL prefix.
- `validateSearch` schema diff shows non-additive changes.
- Any change to a `routeTree.gen.ts`-derived URL pattern.
- Telegram callback test fails.

**Phase to address:**
- **Shell + Containment** phase (Phase 24): URL contract files created and tests scaffolded.
- **Density + Saved Views** phase: search-param schema additions verified non-breaking.
- **Customizable layouts** phase: layout state goes in localStorage, NOT in the URL (avoid URL bloat — see Pitfall 8).
- **Every phase close**: URL contract test must pass.

**Audit hook (verifier rules):**
- CI test `tests/test_url_contract.py` parses `docs/url-contract.md` and asserts every URL returns 200 (or documented redirect).
- Frontend Playwright spec `tests/e2e/v13-url-contract.spec.ts` loads every documented frontend URL and asserts route resolves.
- Lint rule: `frontend/src/routes/*` filename diff blocked unless `docs/url-contract.md` is also touched.
- Vitest test on each route's `validateSearch`: feed it 5 historical URL examples (curated from Telegram dispatch fixtures), assert each parses to a non-throwing result.

---

### Pitfall 7: Density-mode CSS variable design pitfalls

**What goes wrong:**
The density-mode toggle sounds simple — add a class on `<html>`, use CSS variables, done. In practice five subtle failures emerge:

1. **Variables don't cascade into portaled content.** `Sheet.Content` and `Popover.Content` mount in `document.body` (via Radix Portal), outside the `<html data-density>` cascade if you scope variables to a specific subtree like `.app-root`. Sheet content shows comfortable spacing while the page shows compact. Fix: scope variables to `:root` (which IS the `<html>`) so portaled content inherits.
2. **Density toggles work on the page but break Sheet content.** Even with `:root` scoping, Sheet content often has *bespoke* paddings (the Sheet header has `p-6` hard-coded) that don't honor the density variable. The density toggle silently has no effect inside Sheets.
3. **Hard-coded pixel values survive the toggle.** A redesigned `KpiTile` has `min-h-[120px]` Tailwind; density-compact wants `min-h-[88px]` but the hard-coded value wins. The tile doesn't shrink. Visual rhythm breaks.
4. **Density-aware spacing conflicts with existing Tailwind tokens.** A page uses `gap-2` (8px from Tailwind) and `--cmc-row-gap` (also 8px in comfortable, 4px in compact); developer expects them to feel the same in compact mode. `gap-2` doesn't shrink. Either ban raw `gap-N` or define a Tailwind plugin that aliases `gap-token-row` to `var(--cmc-row-gap)`.
5. **Cmd+K palette and other floating UI use their own spacing scale.** `cmdk` ships with its own internal padding; restyling has to override these explicitly per density mode.

**Why it happens:**
- Tailwind utilities and CSS variables are usually independent in dev's mental model; the rebuild blurs the line and conflicts emerge.
- Radix portals are documented but the implication for CSS-variable cascade is not.
- "Density mode" is treated as a single toggle; in reality every component needs to opt in and the audit cost is page-by-page.

**How to avoid:**
1. **Scope density variables at `:root`** — never at a subtree. Portaled content inherits.
2. **Density-aware Tailwind plugin.** Define `p-token-card`, `gap-token-row`, `text-token-body`, `min-h-token-row` etc. as Tailwind plugin utilities that resolve to `var(--cmc-*)`. Ban raw `p-N`, `gap-N`, `min-h-[N]` on any layout-bearing component (allowed inside a primitive's internal styling).
3. **Density audit checklist per phase.** Each per-page phase verifies: page renders correctly in compact AND comfortable; portaled UI (Sheets, Popovers, Cmd+K) reflects density; no hard-coded pixel values for layout-bearing dimensions.
4. **Density toggle is `<html data-density>`, NOT a React Context value.** See Pitfall 4.
5. **Density token doc.** A single `docs/density-tokens.md` enumerates `--cmc-row-h`, `--cmc-row-gap`, `--cmc-card-p`, `--cmc-text-size-row`, etc. with `compact` and `comfortable` values. New tokens must be added here before use.
6. **Per-page Playwright screenshot test in BOTH densities.** Compact rendering is part of every page's visual baseline.

**Warning signs:**
- Sheet content visually mismatches page density.
- A PR adds `p-4` or `gap-3` to a card-level component.
- Density toggle has no visible effect on a specific page.
- A KPI tile, table row, or chart container has a hard-coded `min-h-[*]` value.

**Phase to address:**
- **Density + Saved Views** phase: density-mode mechanism, token plugin, audit checklist.
- **Each per-page phase before density phase**: components must consume `--cmc-*` tokens in anticipation.
- **Polish phase**: full audit across all pages and portaled UI.

**Audit hook (verifier rules):**
- ESLint rule on `frontend/src/{routes,components/panels}/**`: forbid `min-h-\[`, `p-[1-9]`, `gap-[1-9]` className substrings (use density tokens).
- Playwright: every page screenshot in compact + comfortable.
- A Vitest unit test that mounts a Sheet, sets `<html data-density="compact">`, asserts `getComputedStyle(sheet-content).padding` reflects compact tokens.

---

### Pitfall 8: Saved-views URL/state design pitfalls

**What goes wrong:**
"Saved views" — capture the current filter/sort/range/density state as a named, reloadable view — is a feature with five subtle traps:

1. **URL bloat.** Naive implementation puts every filter in querystring: `?range=7d&projects=p1,p2,p3,p4,p5&kinds=read,write,glob&minLatency=200&maxLatency=5000&groupBy=project&sortBy=-cost&page=2&density=compact`. URL becomes 200+ chars; Telegram link previews truncate; bookmarking fails on some browsers (URL > 2048 chars). Worst: the URL becomes unstable on every UI interaction, breaking back-button and history.
2. **URL state conflicts with `validateSearch`.** Adding a `view` param means `validateSearch` must accept either a saved-view ID OR an explicit filter set. If the schema is "either OR" (`view: string` XOR `range: string`), stale links break. If the schema accepts both, ambiguity: which wins?
3. **Saved-view "default" semantics ambiguity.** Does the user's "Default Sessions View" auto-apply on visiting `/sessions`, or only when explicitly chosen? Either choice has surprises:
   - Auto-apply: shared links no longer reflect what the recipient sees.
   - Explicit-only: user wonders why the "Default" they set doesn't apply.
4. **Mid-edit navigation.** User is editing filters (filter sheet open), navigates away (clicks a link), filters lost. Or worse: filters auto-saved as a draft, and the next visit has unintended state.
5. **Saved view schema versioning.** v1.3 ships saved views with N filter fields. v1.4 renames a field. Existing saved views break silently.

**Why it happens:**
- Saved views are usually shipped as "URL-driven first, then maybe localStorage" — but URL-driven alone is bloat-prone, and localStorage alone breaks share-links.
- Default semantics aren't decided in design; engineering picks one and it's "wrong" for half the users.
- The schema isn't versioned because at v1.3 there's only one version.

**How to avoid:**
1. **Two-tier state model.**
   - **Active filter state** lives in URL via `validateSearch` (existing pattern; shareable via copy-link).
   - **Saved views** live in localStorage as named snapshots (not in URL). Selecting a saved view *populates* the URL state, doesn't replace it. The URL still reflects current active state for share-link compatibility.
   - **No `view` param in URL.** Selecting a saved view writes the view's full filter set to the URL.
2. **Saved-view default = explicit-only, opt-in via marker.** The user can mark one saved view as "auto-apply on cold load." On cold load (no querystring), apply the marked view; on warm load (querystring present), querystring wins. Document explicitly.
3. **Mid-edit confirmation.** If filter sheet has unsaved changes and user navigates away, show a "Discard?" toast (auto-confirm after 5s). No automatic draft saving.
4. **Saved view schema versioned.** Each saved view stores `{ schemaVersion: 1, filters: {...}, density: 'compact' }`. On read, if `schemaVersion < CURRENT`, run a migration; if migration not available, mark view as "needs review" and surface in UI rather than silently dropping.
5. **localStorage size cap on saved views.** Limit to 50 saved views; warn at 40; refuse new saves at 50 (with delete-old prompt). Prevents the "5MB localStorage quota exceeded" error. ([localStorage quotas — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria))
6. **Saved view CRUD must be testable.** Playwright spec creates → saves → reloads → applies → deletes a view.

**Warning signs:**
- URL length exceeds 1500 chars on a "deep" filter state.
- `validateSearch` schema for a route has a `view: string` field next to filter fields.
- Saved-view auto-apply behavior is undocumented.
- localStorage `cmc.savedViews` payload exceeds 1MB.
- Any saved-view payload missing `schemaVersion`.

**Phase to address:**
- **Density + Saved Views** phase: full design + implementation.
- **Customizable Layouts** phase (if separate): same patterns apply to layout state — same two-tier model.

**Audit hook (verifier rules):**
- Lint check: `validateSearch` schemas in route files don't contain a `view` field.
- Playwright e2e spec for saved-views CRUD lifecycle.
- Vitest unit test: saved view without `schemaVersion` triggers migration path.
- localStorage size budget asserted in Playwright (<2MB total across all `cmc.*` keys).

---

### Pitfall 9: Customizable-layouts persistence pitfalls

**What goes wrong:**
"Customizable dashboards" — let the user re-arrange and resize panels, persist across reloads — has six failure modes specific to single-user macOS-only deployments:

1. **Corrupt layout state crashes the page.** A bug in v1.3.1 saves an invalid layout (e.g. negative `w`, missing `i`); on next reload react-grid-layout throws and the dashboard is unrecoverable without manually clearing localStorage.
2. **Stale layout references removed panels.** v1.4 deletes a panel (e.g. an obsolete chart); user's saved layout still references it by `i: "obsolete-chart"`. react-grid-layout renders an empty box or throws.
3. **Reset-to-default missing.** No UI to recover from a bad layout. User has to know about devtools and manually `localStorage.removeItem('cmc.layout')`.
4. **localStorage size bloat.** A layout has 12 panels × ~120 bytes each = ~1.5KB; saved across N pages × M density modes × user history of edits = potentially 100KB+. The 5MB localStorage quota is far away but the *parsing cost* on cold load grows. ([localStorage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria))
5. **Density toggle invalidates saved layout.** Compact mode wants different `rowHeight`; if the saved layout is `{ rowHeight: 60 }` and compact density wants `36`, the saved layout looks weird in compact, or breaks visually.
6. **Drag persistence races with poll updates.** While dragging a panel, a poll tick fires, the parent re-renders, the dragged panel re-mounts mid-drag.

(SSR mismatch is N/A — Mission Control is a Vite SPA.)

**Why it happens:**
- react-grid-layout is permissive about input; it doesn't validate the layout array on mount, just renders best-effort.
- "Reset to default" feels like an edge-case until users hit it once and lose their work.
- Density and customization are usually scoped together in design but built separately in code; the interaction is not modeled.

**How to avoid:**
1. **Validate layout on read.** A Zod schema for the layout array; on parse failure, fall back to default layout AND surface a toast: "Saved layout corrupted; reset to default. [Restore from backup]" (where backup = the previous valid layout, also persisted).
2. **Panel registry with ID validation.** A central `panelRegistry` lists all known panel IDs. On layout read, filter out unknown IDs (panels that were removed in code); on layout save, validate every ID exists. Add a Vitest test that loads a fixture layout with an unknown ID and asserts graceful fallback.
3. **Reset-to-default UI affordance.** A "Reset layout" button in the page menu (Cmd+K command also). Keyboard shortcut documented.
4. **Layout state is per-page-per-density.** `localStorage.cmc.layout.sessions.compact` separate from `localStorage.cmc.layout.sessions.comfortable`. Density toggle doesn't reflow a layout that wasn't built for the new density; instead loads the matching saved layout (or default for that density if none).
5. **Drag persistence throttled.** During drag, layout updates flow through component state only; on `onLayoutComplete` (drag end), persist to localStorage.
6. **Backup layout retained.** Persist the previous layout as `cmc.layout.<page>.<density>.backup`; "Restore from backup" affordance reads it.
7. **Pause poll during drag.** While drag is active, suspend the page's poll loop (and the dispatcher's WebSocket if any). Resume on drag end. Prevents mid-drag re-mount.

**Warning signs:**
- A user-reported "white screen" on a dashboard route after editing layout.
- localStorage payload for layout > 50KB on any single page.
- No UI affordance to reset layout (search the UI for "reset" — should find it).
- Density toggle visibly breaks a customized layout.
- React DevTools shows panel re-mount during drag.

**Phase to address:**
- **Customizable Layouts** phase (if scoped). If not scoped to v1.3, defer entirely.

**Audit hook (verifier rules):**
- Vitest: corrupt layout fixture triggers fallback + toast.
- Vitest: unknown panel ID filtered out gracefully.
- Playwright: reset-to-default affordance discoverable from UI.
- localStorage budget asserted in Playwright (<2MB total).
- Vitest: drag→persist throttle (mock `setItem`, count calls during simulated drag, < 5).

---

### Pitfall 10: Cmd+K / Sheet / Drawer affordances vanishing during shell redesign

**What goes wrong:**
v1.2 ships a list of small but cumulatively important keyboard/UX affordances. A shell rewrite easily drops one or more without anyone noticing because each is rare and the user has built muscle memory rather than checking after every release. The named affordances at risk:

1. **Cmd+K palette.** The `cmdk` palette is wired in v1.2 (`CommandPalette.tsx`); a redesigned shell that re-implements navigation might forget to mount it, or breaks the keybind.
2. **Cmd+K context-aware commands.** Specifically: "Compare with previous" command shows only on a session route (CMPR-07). A shell rewrite that centralizes Cmd+K commands might lose context-awareness.
3. **Click-outside-to-close.** Sheets, Popovers, DropdownMenus all close on outside click via Radix. A bespoke replacement (or wrapping with a `stopPropagation` handler on the Sheet content for some unrelated reason) breaks this.
4. **Esc-to-close.** Same — Radix gives Esc-to-close; a bespoke drawer doesn't.
5. **Drag handles.** If customizable layouts ship, drag handles need a clear visual affordance (cursor change on hover). Easy to lose in a stylistic minimal redesign.
6. **Scroll-position-restore on Sheet close.** When a Sheet closes, focus and scroll position should return to the trigger. Radix gives this; bespoke drawers lose it.
7. **Tab-cycle within Sheet.** Focus trap inside a Sheet — Radix gives it; bespoke drawers usually skip it.
8. **Return-focus-to-trigger.** When a Sheet/Dialog closes, focus returns to the element that opened it. Radix gives it; bespoke replacements lose it.
9. **Initial-focus-on-first-input.** When a Sheet opens with a form, first input is auto-focused. Easy to forget when wrapping with custom animation.
10. **Theme toggle.** v1.2 has a theme toggle (e2e test `theme-toggle.spec.ts`). A shell rewrite might lose it.
11. **Schedule composer entry point.** Schedule composer is a Sheet; the entry button must remain reachable in the new shell.
12. **Telegram alerts inbox indicator.** v1.2 surfaces alerts; a redesigned shell must still show the unread count or surface it via Cmd+K.
13. **Breadcrumbs / route header context.** v1.2's route headers show context (session ID, skill name); a redesigned route header must retain this.
14. **Navigation collapse state persistence.** If the new shell has a collapsible sidebar, collapse state should persist.
15. **Reduced motion.** `prefers-reduced-motion` honored on all animations.

**Why it happens:**
- Affordances accrete over time; nobody has the comprehensive list.
- Radix gives many of these for free; replacing Radix loses the bundle silently.
- e2e tests cover happy paths, not "Sheet closes on outside click."

**How to avoid:**
1. **Affordance inventory document (`docs/affordance-checklist.md`)** enumerates all 15 above. Each has a "verified in v1.3" checkbox per phase close.
2. **Keep Radix for Sheets, Dialogs, Popovers, DropdownMenus, Tooltips.** (Same rule as Pitfall 3.)
3. **Cmd+K as the single command surface.** All Cmd+K commands registered via a central `commandRegistry`; the shell mounts the palette once, registers context-aware commands per route. Add a Vitest test for the registry: exact set of commands per route.
4. **Per-affordance Playwright assertion.** Add a Playwright test per affordance: opens a Sheet, asserts Esc closes, asserts click-outside closes, asserts focus returns to trigger. Reuses the centralized `data-testid` registry.
5. **`prefers-reduced-motion` honored.** Use Tailwind's `motion-reduce:` variants for animations; verify with Playwright's `emulateMedia({ reducedMotion: 'reduce' })`.
6. **Scroll-position-restore tested.** Open a Sheet from mid-scroll, close it, assert window scroll position unchanged.

**Warning signs:**
- A redesigned Sheet doesn't wrap Radix.
- Cmd+K palette not mounted in the new shell, or keybind doesn't fire.
- "Compare with previous" absent on session route.
- A Sheet close doesn't return focus to the trigger (visible on Tab key after close).
- Theme toggle e2e test fails on the new shell.
- An animation plays despite `prefers-reduced-motion: reduce`.

**Phase to address:**
- **Shell + Containment** phase (Phase 24): affordance inventory checked at phase close; Cmd+K command registry established.
- **Each per-page phase**: phase-specific affordances re-verified.
- **Polish phase**: full inventory walk; no checkbox skipped.

**Audit hook (verifier rules):**
- `tests/e2e/v13-affordances.spec.ts` covers all 15 inventoried affordances.
- Vitest: Cmd+K command registry has expected command set per route.
- Playwright: `emulateMedia({ reducedMotion: 'reduce' })` test asserts no motion on key transitions.
- ESLint rule: any `<Sheet>` / `<Dialog>` import path must come from `frontend/src/components/ui/Sheet.tsx` (not bespoke).

---

## Technical Debt Patterns

Shortcuts that may seem reasonable mid-rebuild but create long-term cost.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Re-implement a Sheet/Drawer to control animation | Aesthetic flexibility | Loses 8 a11y/keyboard affordances; future maintenance per primitive | Never. Restyle Radix instead. |
| Density mode via React Context | Composes with rest of app | Tree-wide re-render on toggle; chart re-mount; jank | Never for density itself; OK for the *toggle UI* only. |
| Saved views purely via URL | One state surface | URL bloat; share-links break on schema drift | Never alone — combine with localStorage. |
| Tailwind raw `p-N`/`gap-N` on layout-bearing components | Velocity | Density mode is silently a no-op; component churn cascades | Inside primitives' internal styling only. |
| `getByText('Save')` Playwright selectors | Reads naturally | Breaks on every label change | Only when label IS the contract being tested. |
| Snapshot tests of `className` strings | Free regression coverage | Prettier reorder noise hides real diffs | Never — use Storybook visual diffs. |
| Bespoke focus ring per component | Per-component customizability | Inconsistent ring; a11y regression risk | Never — use `--cmc-focus-ring` token. |
| Hard-coded `min-h-[120px]` on tile | Quick rhythm fix | Density mode broken on that tile | Never on layout-bearing dimensions; OK on icon/avatar fixed sizes. |
| Carry KNOWN_METRICS frontend constant from v1.2 | No new endpoint required | Drift between FE and BE list; v1.2 known debt | Only until ALRT-13/14 polish (Phase 21 backlog item, may carry into v1.3). |
| Use `cwd` as project-key proxy in compare picker | Wire APIs already exist | Frontend re-derives path-key → fragile | Only until SessionListItemFull/SessionCompareSide expose `project_key` (extension to Pitfall 7's API contract). |
| New Playwright `.skip` markers for redesign-broken tests | Phase-close green | Skip count drifts from 2 baseline; loss of regression coverage | Never — fix or repair selectors instead. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Density mode via React Context | 200–400ms jank on toggle | CSS-only via `<html data-density>` | First toggle on any page with > 4 charts |
| Recharts data prop literal | 200ms freeze every poll tick | `useMemo` for `data` and `config` | After redesign of any chart wrapper |
| `ResponsiveContainer` on grid of charts | Cumulative layout shift > 0.1 | Single `useMeasure` at panel level, explicit `width`/`height` to chart | After 4+ charts on one route |
| react-grid-layout drag without throttle | localStorage write storm; 100ms paint per drag tick | Persist on `onLayoutComplete` only; debounce `onLayoutChange` 500ms | First drag with poll loop active |
| CSS variable change on `:root` | Full-document reflow | Use density tokens only on layout-bearing dims; not on text-color/etc that don't trigger reflow | When toggle is fast (>1/s) |
| Polling all panels in lockstep | Periodic 100ms+ scripting block | Stagger initial fetches by 250ms | At 8+ panels per page |
| localStorage write per filter change | Slow keystroke in filter input | Debounce localStorage writes (saved views) by 300ms | When user types in a filter input |
| Tab key re-renders every focusable | Slow Tab-walk | `<Tooltip>` with `delayDuration` not 0 | After polishing tooltips on dense tables |
| Chart animation on poll tick | Periodic visual noise | Set `isAnimationActive={false}` on poll-driven charts | Always |
| Re-running Storybook visual on every PR | CI minutes balloon | Snapshot only changed stories per PR (Chromatic does this) | At Storybook story count > 50 |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Density toggle has no visible effect on Sheets/Popovers | Confusion: "did it apply?" | Sheet content must consume density tokens; Playwright per-portal screenshot |
| Saved view "default" auto-applies, share-links don't reflect | Recipient sees different state than sender | Default applies on cold-load only; querystring wins |
| Layout edit mode looks like view mode | User accidentally drags panels | Distinct edit mode with explicit toggle and visual chrome (dashed borders, drag handles visible) |
| Cmd+K palette doesn't surface unread alerts | User checks alerts inbox manually | Cmd+K ranks unread alerts at top; badge in palette title |
| Reset-to-default layout requires devtools | User loses customization to bug, can't recover | Visible "Reset" affordance; backup of last valid layout |
| New aesthetic loses information density | Page feels sparse, user scrolls more | Compact density mode is the *default*; comfortable is opt-in |
| Compare picker uses CWD as project proxy | Cross-project compare seems broken | Wire `project_key` through compare APIs (extension, not breaking) |
| Mid-edit navigation loses filter state | Frustration on accidental click | "Discard?" toast with 5s confirm |
| Schedule composer 503 collapse with no retry UI | User can't author NL alerts | Graceful retry/queue UX on POST `/api/alerts/parse-nl` (carry-over from Phase 21-03) |
| Theme toggle hidden in new shell | User can't switch themes; muscle memory broken | Theme toggle in a discoverable location; Cmd+K command registered |

## "Looks Done But Isn't" Checklist

Per-phase verification — items that often appear complete but are missing critical pieces.

- [ ] **Sheet redesign:** Esc closes, click-outside closes, focus returns to trigger, focus traps within, initial focus on first input. Verify with Playwright.
- [ ] **Density mode:** Tested in BOTH compact and comfortable on every page, including portaled UI (Sheets, Popovers, Cmd+K). Toggle latency < 50ms.
- [ ] **Saved view CRUD:** Create, save, reload page, apply, edit, delete — all work. Schema versioned. Default semantics documented.
- [ ] **Customizable layout:** Reset-to-default discoverable. Corrupt state recovers gracefully. Density-aware. Per-page-per-density storage.
- [ ] **URL preservation:** Every URL in `docs/url-contract.md` returns 200. Telegram callback test passes. Schedule composer share link round-trips.
- [ ] **Accessibility:** axe-core clean on every route. Tab-walk has no invisible focus rings. Contrast ratios documented and ≥ AA. Reduced-motion honored.
- [ ] **Performance:** Cold-load FCP < 1s. Density toggle < 50ms. Poll tick re-render < 100ms. localStorage budget < 2MB.
- [ ] **Test stability:** All Playwright tests green. Skip count == 2 (or v1.3-locked baseline). No new `.skip`s. URL contract test passes.
- [ ] **Containment:** No outer `<body>` scroll on any route at 1024×600. No card right-edge bleed. Sheets/Popovers in correct portal layer.
- [ ] **Affordances:** All 15 in `docs/affordance-checklist.md` verified.
- [ ] **API contract:** No breaking changes. Wire APIs additive only. `project_key` exposed through compare APIs (extension).
- [ ] **Cmd+K:** Palette mounts, opens, closes, registers context-aware commands per route, surfaces unread alerts.
- [ ] **Visual regression:** Storybook + Playwright screenshot baselines locked at phase close, intentional diffs reviewed.

## Recovery Strategies

When pitfalls occur despite prevention.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Re-introduced overflow bug | LOW | Find missing `min-h-0` / missing Portal / blanket `overflow-visible`; add Playwright reproduction; fix; baseline. |
| Tailwind class churn regression | MEDIUM | Storybook visual diff identifies primitive; fix at primitive level; re-baseline page screenshots. |
| A11y regression | MEDIUM | Run axe-core full sweep; restore Radix-based primitive; re-test focus rings against tokens. |
| Density jank | MEDIUM | Profile with React DevTools; convert Context-based density to `<html data-density>`; memoize chart props. |
| Test flake or selector churn | LOW | Replace text selectors with `data-testid`; add to registry. |
| URL drift | HIGH | Add a redirect from old URL; revert filename rename; audit `validateSearch` schema; add URL contract test for the missed URL. |
| Density variable doesn't cascade | LOW | Move tokens from subtree to `:root`; re-test in Sheet content. |
| Saved view schema break | MEDIUM | Add migration in `savedViews.read()`; surface "needs review" UI; backfill. |
| Corrupt layout | LOW | "Reset to default" affordance handles user recovery; engineering: find the bug that wrote invalid state. |
| Lost affordance | LOW | Affordance checklist test catches; restore from `frontend/src/components/ui/` Radix-backed primitive. |
| Performance regression | MEDIUM | Lighthouse trace + React Profiler; usually traces to a missing memo or a Context re-render. |
| Storybook not catching primitive regression | LOW | Add a "kitchen sink" story that exercises the missed prop combination. |

## Pitfall-to-Phase Mapping

How v1.3's roadmap phases prevent each pitfall.

| Pitfall | Prevention Phase | Verification at Phase Close |
|---------|------------------|----------------------------|
| 1. Overflow trio re-introduced | Phase 24 (Shell + Containment) | `tests/e2e/v13-containment.spec.ts` green; ESLint rules pass |
| 2. Tailwind class churn | Phase 24 (Shell + Containment) for infra; every per-page phase for diffs | Storybook + Playwright screenshot diffs reviewed and accepted |
| 3. A11y regressions | Phase 24 (infra) + per-page phase (page-specific) + Polish phase (full audit) | axe-core clean; Tab-walk Playwright passes; contrast ratios ≥ AA |
| 4. Perf regressions | Phase 24 (CSS-only density) + Customizable Layouts (RGL knobs) + Polish (full audit) | Density toggle < 50ms; chart no re-mount on poll; Lighthouse total-blocking-time < 200ms |
| 5. Test stability | Phase 24, day 1 (hardening) + every phase close (green-test gate) | Skip count locked; `data-testid` registry consumed |
| 6. URL preservation | Phase 24 (contract files) + every phase close | `docs/url-contract.md` test passes; `validateSearch` historical fixtures parse |
| 7. Density CSS variable | Density + Saved Views phase | Density Playwright tests in both modes; Sheet/Popover content reflects density |
| 8. Saved view design | Density + Saved Views phase | CRUD Playwright spec; URL stays clean; schema versioned |
| 9. Customizable layout | Customizable Layouts phase (if scoped) | Corrupt state graceful; reset affordance discoverable; localStorage budget |
| 10. Affordance loss | Phase 24 (inventory) + every phase close | `tests/e2e/v13-affordances.spec.ts` covers 15 named affordances |

**Cross-cutting verifier rules suitable for every phase plan front-matter:**
- `playwright tests/e2e/v13-containment.spec.ts` green
- `playwright tests/e2e/v13-affordances.spec.ts` green
- `playwright tests/e2e/v13-url-contract.spec.ts` green
- `pytest tests/test_url_contract.py` green
- `npm run test` green; skip count == 2 (or locked baseline)
- `pytest` green; no new `.skip` markers
- ESLint custom rules (`no-bare-radix-content`, density-token-only, testid-registry-only) pass
- Storybook visual diffs reviewed; no unintended page-level screenshot diffs

## Mature-Codebase Tech Debt v1.3 Should NOT Amplify

| Existing Debt (from v1.2 close) | Risk During v1.3 | v1.3 Stance |
|-----|-----|-----|
| `KNOWN_METRICS` frontend fallback exists despite `useAlertMetrics` hook | Re-introducing the constant in redesigned AlertRuleForm | Remove the fallback during ALRT redesign phase; rely on the hook only. |
| 3 `_utcnow_naive()` local helpers duplicate `now_utc()` | Stylistic churn but fragmenting on every new module | If a v1.3 backend module needs naive-UTC, import `now_utc()` ONLY. Add a CI grep guard. |
| 2 pre-existing Playwright skips (alerts:40, skills-detail:25) | Drift to 3+ skips during redesign | Lock count in phase verifier. Attempt to lift in Polish phase via deterministic fixtures. |
| Phase 21-03 NL composer 503 collapse, no retry/queue UX | Easy to forget during redesign of AlertRuleForm | Specifically address in the alerts-page redesign phase plan; don't carry forward as-is. |
| Wire APIs don't expose `project_key` (compare picker uses `cwd` proxy) | A redesigned compare picker that "just uses what's there" continues the proxy | Extend SessionListItemFull/SessionCompareSide to include `project_key` (additive, non-breaking). Compare picker uses `project_key` directly. |
| Pre-existing visual quality bar checkpoints (Phase 5/6/7) | v1.3 invents its own ad-hoc checkpoint, drifts | Establish v1.3 visual quality bar pattern in Phase 24; reuse the same checklist shape. |

## Sources

### Primary (HIGH confidence — codebase or core upstream documentation)
- v1.0–v1.2 codebase at `frontend/src/components/ui/` (Sheet.tsx, Card.tsx, CommandPalette.tsx, etc.) — verified by file listings; v1.2 PITFALLS.md research; STATE.md decisions log.
- TanStack Router file-based routing docs — [tanstack.com/router file-based routing](https://tanstack.com/router/latest/docs/routing/file-based-routing), [validateSearch with schemas](https://tanstack.com/router/latest/docs/how-to/validate-search-params)
- TanStack Router known issues — [issue #3120 search params stripped](https://github.com/TanStack/router/issues/3120), [issue #2878 validateSearch runs twice](https://github.com/TanStack/router/issues/2878), [issue #3282 file-based routing edge cases](https://github.com/TanStack/router/issues/3282)
- Radix Primitives behavior — [issue #1317 z-index conflicts](https://github.com/radix-ui/primitives/issues/1317), [issue #1253 non-portalled positioning broken with `position: relative`](https://github.com/radix-ui/primitives/issues/1253), [issue #1596 popover overflow](https://github.com/radix-ui/primitives/issues/1596), [issue #3492 popover overflows screen](https://github.com/radix-ui/primitives/issues/3492)
- Recharts perf — [official perf guide](https://recharts.github.io/en-US/guide/performance/), [issue #281 deep-compare re-renders](https://github.com/recharts/recharts/issues/281), [issue #1624 redrawing](https://github.com/recharts/recharts/issues/1624)
- react-grid-layout perf — [issue #2066 CSS perf during drag](https://github.com/react-grid-layout/react-grid-layout/issues/2066), [issue #83 low perf during drag/resize](https://github.com/react-grid-layout/react-grid-layout/issues/83)
- Flexbox + min-h-0 behavior — [Modus Create — Flex overflow fixes](https://moduscreate.com/blog/how-to-fix-overflow-issues-in-css-flex-layouts/), [flexbugs #241](https://github.com/philipwalton/flexbugs/issues/241)
- WCAG AA contrast — [Make Things Accessible — WCAG 2.2 AA contrast](https://www.makethingsaccessible.com/guides/contrast-requirements-for-wcag-2-2-level-aa/), [Dark mode accessibility](https://www.accessibilitychecker.org/blog/dark-mode-accessibility/)
- Playwright selector best practices — [Playwright best practices](https://playwright.dev/docs/best-practices), [getByTestId with custom attribute](https://playwrightsolutions.com/getbytestid/), [centralized data-testid pattern](https://www.sourcefuse.com/resources/blog/zero-maintenance-playwright-tests-how-centralized-data-testid-makes-ui-automation-robust/)
- localStorage quotas — [MDN Storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [Resolving QuotaExceeded errors](https://medium.com/@zahidbashirkhan/understanding-and-resolving-localstorage-quota-exceeded-errors-5ce72b1d577a)
- Storybook visual testing — [Storybook visual tests docs](https://storybook.js.org/docs/writing-tests/visual-testing), [Lost Pixel + shadcn-ui](https://www.lost-pixel.com/blog/visual-regression-testing-of-shadcn-ui-with-storybook)
- Grafana redesign reference — [Grafana 9.5 navigation refresh](https://grafana.com/docs/grafana/latest/whatsnew/whats-new-in-v9-5/), [Grafana breaking changes index](https://grafana.com/docs/grafana/latest/breaking-changes/)

### Secondary (MEDIUM confidence — illustrative industry parallels)
- Datadog dashboard design best practices — [GitHub: DataDog/effective-dashboards](https://github.com/DataDog/effective-dashboards) (archived), [Datadog Dashboards docs](https://docs.datadoghq.com/dashboards/) — referenced for "this category of regression is documented in the family"; specific Datadog v2 redesign post-mortems not directly indexed.
- Honeycomb / PostHog navigation refreshes — referenced as aesthetic-family targets only; specific failure documentation not surfaced in this research pass.
- Recharts deep-compare performance discussions — referenced for the "memoize prop literals" prevention pattern.

### In-repository (HIGH confidence — verified by listing or prior research)
- `frontend/src/components/ui/` (Card, Sheet, PanelCard, CommandPalette, DataTable, etc.)
- `frontend/src/components/panels/` (CostByProjectCard, CostForecastCard, AlertRuleForm, ScheduleComposer, SessionCompareView, etc.)
- `frontend/src/routes/` (alerts.tsx, cost.tsx, sessions_.compare.tsx, skills_.$name.tsx, etc.)
- `frontend/tests/e2e/` (alerts.spec.ts, cost-dashboard.spec.ts, command-palette.spec.ts, schedule-composer.spec.ts, sessions-compare.spec.ts, skills-detail.spec.ts, theme-toggle.spec.ts, routes.spec.ts)
- `.planning/research/SUMMARY.md` (v1.2 close), `.planning/STATE.md` (v1.2 invariants log)

---
*Pitfalls research for: Claude Mission Control v1.3 — Surface Redesign (full UX rebuild)*
*Researched: 2026-05-10*
