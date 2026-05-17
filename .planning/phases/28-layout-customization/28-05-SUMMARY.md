---
phase: 28-layout-customization
plan: 05
subsystem: ui
tags: [react, react-resizable-panels, v4-api, tanstack-router, url-state, split-pane, resize, layout-customization, playwright, axe-core]

# Dependency graph
requires:
  - phase: 28-layout-customization
    provides: Plan 28-02 foundation primitives (useLayoutState.splitSizes + setSplit with `null`-passing prune semantics; asSplitSizes validator; SPLIT_SIZES_RE regex anchor on `<groupId>:<int1>,<int2>,…` shape)
  - phase: 28-layout-customization
    provides: Plan 28-01 Wave 0 scaffolding (Playwright test.skip skeletons for LAYO-03 + chart-DOM-identity perf probe; resize-handle-{groupId} testid family registered in docs/testid-registry.md)
  - phase: 25-saved-views
    provides: SaveViewDialog auto-capture pipeline (useRouterState().location.search verbatim into state_json; split_sizes rides through automatically — no SaveViewDialog edit needed, Pitfall 3 lock honored)
  - phase: 24-foundation
    provides: --space-xs / --cmc-border / --cmc-accent-blue CSS tokens for separator chrome; .cmc-page--bounded + .cmc-card--bounded flex-ladder primitives (CONT-04) so wrapper's `min-height: 0` propagates correctly (Pitfall 13)
provides:
  - ResizablePanelGroup component — thin wrapper around react-resizable-panels@4 Group/Panel/Separator with URL bridge through useLayoutState.setSplit
  - APPEND-ONLY split_sizes validateSearch on /sessions/compare (asSplitSizes; default undefined)
  - SessionCompareView refactor: per-side (id + KPIs + bar chart) → Panel; shared diff sections stay below resizable region
  - 4 Playwright e2e tests on /sessions/compare (pointer-drag URL write, refresh restore, double-click prune, chart-svg DOM identity across drag)
  - Phase 28 axe scan extension covering split-pane Separator surface (role=separator + aria-orientation + aria-valuemin/max/now)
affects: [28-06-saved-views-roundtrip-close]

# Tech tracking
tech-stack:
  added:
    - "react-resizable-panels@4.11.0 (exact pin) — single new runtime dep this phase; legitimacy gated via slopcheck [OK] + blocking-human npmjs.com verification (maintainer bvaughn, weekly downloads 32M+, no postinstall script, peer deps react ^18 || ^19 compatible with React 19.2.5)"
  patterns:
    - "v4 vocabulary verbatim: Group + Panel + Separator + orientation prop (NOT pre-v4 PanelGroup / PanelResizeHandle / direction) — Pitfall 1 grep gate in <verify> blocks any future regression"
    - "URL writes on onLayoutChanged (release-only) — NOT onLayoutChange (per-pointer-tick) — Pitfall 6 perf gate; the wrapper does not subscribe to onLayoutChange at all"
    - "Layout map ↔ positional CSV bridge via panelIds prop — v4's Layout type is `{[panelId: string]: number}`, not number[] as RESEARCH.md §1 stated; the wrapper accepts an ordered panelIds array and converts between the URL's positional CSV (`compare:50,50`) and the library's id-keyed map (`{side-a: 50, side-b: 50}`)"
    - "Double-click reset prune: when onLayoutChanged fires with sizes matching defaultSizes (±1% tolerance for flex-basis float drift), wrapper calls setSplit(groupId, null) — Plan 28-02's documented prune path drops the group entry and (when no groups remain) removes the URL param entirely (Pitfall 2 bare-URL gate preserved)"
    - "Separator id-prop emits data-testid — v4 Separator's spread order overrides any caller-supplied data-testid (verified in dist/react-resizable-panels.js line 2179); to get the registered `resize-handle-{groupId}` testid we pass it via the `id` prop"
    - "Panel defaultSize as STRING '50%' (NOT numeric 50) — v4 docs: 'Numeric values are assumed to be pixels'; the library's Separator dblclick handler calls panel.resize(defaultSize) and numeric 50 = 50px = collapsed pane. String '50%' is the only path that produces a clean 50/50 dblclick reset"
    - "min-height: 0 on .cmc-resizable-group — Pitfall 13 fix; lets the wrapper participate in the .cmc-page--bounded flex ladder without overflowing the viewport"

key-files:
  created:
    - frontend/src/components/ui/ResizablePanelGroup.tsx
  modified:
    - frontend/package.json
    - frontend/pnpm-lock.yaml
    - frontend/src/components/ui/__tests__/ResizablePanelGroup.test.tsx
    - frontend/src/components/panels/SessionCompareView.tsx
    - frontend/src/routes/sessions_.compare.tsx
    - frontend/src/styles.css
    - frontend/tests/e2e/v13-layout.spec.ts
    - frontend/tests/e2e/v13-a11y.spec.ts

key-decisions:
  - "Wrapper API extended with `panelIds` prop (NOT in plan's interface) — v4's Layout type is `{[panelId]: number}` so positional URL CSV needs an id map. The plan's `ResizablePanelGroupProps` interface omitted this; the actual signature is `{ groupId, panelIds, defaultSizes, orientation?, className?, children }`. Documented Rule 1 deviation."
  - "Panel sizes passed as STRINGS '50%' / '20%', not numbers — discovered during Playwright Test 3 (double-click reset). With numeric `defaultSize={50}` the library treated 50 as PIXELS, dblclick resized side-a to 50px (~5% width) and URL stored compare:5,95 instead of dropping the param. Fix is documented inline in SessionCompareView with a fat warning comment so future Panel additions don't regress."
  - "data-testid passed via Separator `id` prop, NOT data-testid prop — v4 Separator's attribute spread order overrides caller-supplied data-testid with `{id}`. The library's design assumes the consumer wants `id={x} data-testid={x}` symmetry; the wrapper goes along with that contract."
  - "CompareBody refactored to two-column shape — per-side content (SessionId + KPIs + BarChart) now lives inside Panel; shared diff sections (skill-diff, skill-latency, tool-counts, rates-as-of caption) stay BELOW the resizable region (unchanged). The plan's original layout had A/B side-by-side INSIDE each section; the resize wrapper sensibly applies to the per-side column boundary, so the refactor was natural."
  - "Vitest mock for `react-resizable-panels` mirrors the real library's attribute spread order — Separator's mock writes `{...rest, id, data-testid: id}` so vitest exercises the same code path as the real DOM. Without this mirroring the wrapper's `id`-prop strategy would silently pass vitest but fail Playwright."
  - "NO PanelHeaderMenu on SessionCompareView — `/sessions/compare` is a single-panel route (out of LAYO-01 hide-and-persist scope). Adding hide-self chrome would render the page meaningless. Verified absent."

# Metrics
metrics:
  duration: "22 minutes"
  completed: "2026-05-17T10:46:18Z"
  bundle_delta: "+10.4 KB gzipped (SessionCompareView chunk: 106.74 → 117.16 KB gz). Within the 15 KB budget per success_criteria."
  tasks_completed: "4 of 4 (Task 0 checkpoint cleared by operator; Tasks 1-4 executed atomically)"
  vitest: "754/754 green (added 6 new tests to ResizablePanelGroup suite; full suite remains 112 files)"
  playwright_layo03: "4/4 green (pointer-drag URL write, refresh-restore 70/30 layout, dblclick prune, chart-svg DOM identity across drag)"
  playwright_layout_total: "15/16 (1 skipped — Plan 28-02 SavedViewMenu Reset Layout chrome test, out of scope for this plan)"
  playwright_a11y: "1 new scan green (split-pane Separator surface on /sessions/compare with ?split_sizes=70,30)"
  backend_pytest: "2/2 green (tests/test_url_contract.py)"
  responsivecontainer_count: "8 (unchanged from Phase 24/26/27 lock)"
---

# Phase 28 Plan 05: Split-pane resize on /sessions/compare (LAYO-03) Summary

Ship split-pane resize on `/sessions/compare` using `react-resizable-panels@4.11.0`'s v4 API (Group/Panel/Separator), bridged to the URL `split_sizes` CSV param via the Plan 28-02 `useLayoutState.setSplit` contract. Drag the Separator to write percentages on release; refresh restores the layout from the URL; double-click resets to 50/50 and drops the param entirely.

## What Shipped

- **`react-resizable-panels@4.11.0`** installed at EXACT pin (no caret) — single new runtime dep this phase; legitimacy gated by slopcheck + blocking-human npmjs.com verification before install.
- **`frontend/src/components/ui/ResizablePanelGroup.tsx`** — 200-line wrapper that:
  - Reads `splitSizes(groupId)` from URL on mount; falls back to `defaultSizes` prop when URL has no override.
  - Subscribes ONLY to `onLayoutChanged` (release-only — Pitfall 6 perf gate).
  - Detects when release-end layout matches `defaultSizes` (±1% tolerance for float drift) and calls `setSplit(groupId, null)` — Plan 28-02's documented prune path that drops the group from `split_sizes` (and removes the URL param when no groups remain).
  - Auto-inserts a Separator (testid `resize-handle-{groupId}`) between every adjacent pair of Panel children.
- **`frontend/src/routes/sessions_.compare.tsx`** — APPEND-ONLY validateSearch extension: `split_sizes: asSplitSizes(raw.split_sizes)` (default `undefined` — Pitfall 2 bare-URL gate preserved).
- **`frontend/src/components/panels/SessionCompareView.tsx`** — CompareBody refactored:
  - Per-side content (SessionId + KPIs + BarChart) bundled into a new `CompareSide` helper rendered inside a `<Panel>`.
  - Shared diff sections (skill-diff, skill-latency, tool-counts, rates-as-of caption) stay BELOW the resizable region (unchanged).
  - Panels pass `defaultSize="50%"` + `minSize="20%"` as STRINGS (critical — see Deviations).
- **`frontend/src/styles.css`** — `.cmc-resizable-group` with `min-height: 0` (Pitfall 13 bounded-flex-ladder); `.cmc-resizable-separator` with hover/focus chrome.
- **Playwright tests** — unskipped 4 tests in `v13-layout.spec.ts`:
  1. Pointer drag on resize-handle writes `?split_sizes=compare:<a>,<b>` (URL gained encoded `%3A` / `%2C`).
  2. Refresh with `?split_sizes=compare:70,30` restores 70/30 layout (bounding-box ratio 0.65 < r < 0.75).
  3. Double-click on resize-handle resets to 50/50 — URL drops `split_sizes` entirely.
  4. Chart `<svg>` DOM identity preserved across 3 drag-cycles (data-test-marker survives — proves no re-mount).
- **axe scan extension** — new `Phase 28 axe a11y — ResizablePanelGroup Separator (LAYO-03)` describe block in `v13-a11y.spec.ts`; scans `/sessions/compare?split_sizes=compare:70,30` with no Phase-28-attributable serious/critical violations.

## How URL ↔ Library Sizes Flow Through

```
URL search:  ?split_sizes=compare:70,30
  ↓ TanStack validateSearch → asSplitSizes shape regex
URL state:   { split_sizes: 'compare:70,30' }
  ↓ useLayoutState.splitSizes('compare') → parseSplitSizes
positional:  [70, 30]
  ↓ ResizablePanelGroup.toLayoutMap(panelIds, sizes)
v4 Layout:   { side-a: 70, side-b: 30 }
  ↓ Group defaultLayout prop (one-shot seed)
DOM state:   <div id="side-a" style="flex-grow: 70"> | sep | <div id="side-b" style="flex-grow: 30">

[user drags separator]
  ↓ library's internal pointer pipeline
  ↓ pointerup → onLayoutChanged({ side-a: 60, side-b: 40 })
  ↓ wrapper.fromLayoutMap(panelIds, layout) → roundLayout → [60, 40]
  ↓ matchesDefaults([60,40], [50,50])? NO
  ↓ setSplit('compare', [60, 40])
  ↓ useLayoutState serializes → 'compare:60,40' → navigate replace
URL search:  ?split_sizes=compare:60,40   ✅

[user double-clicks separator]
  ↓ library's built-in dblclick → panel.resize('50%')  ← STRING, not 50
  ↓ onLayoutChanged({ side-a: 50, side-b: 50 })
  ↓ wrapper.fromLayoutMap → [50, 50]
  ↓ matchesDefaults([50,50], [50,50])? YES
  ↓ setSplit('compare', null)  ← PRUNE
  ↓ no other groups remain → URL param removed entirely
URL search:  (no split_sizes param)   ✅
```

## Deviations from Plan

### Rule 1 — Auto-fixed Bugs

**1. [Rule 1 - Bug] v4 `Layout` type is `{[panelId]: number}`, NOT `number[]`**
- **Found during:** Task 2 (implementation) — checked the dist d.ts file before writing the wrapper.
- **Issue:** RESEARCH.md §1 stated `type Layout = number[]`. The actual library type is a map keyed by Panel `id` props. URL CSV is positional; library is id-keyed.
- **Fix:** Extended the wrapper API with a `panelIds: string[]` prop. Wrapper converts URL positional `[a, b]` ↔ library id-keyed `{ side-a: a, side-b: b }` via `toLayoutMap` / `fromLayoutMap` helpers.
- **Files modified:** `frontend/src/components/ui/ResizablePanelGroup.tsx`, `frontend/src/components/ui/__tests__/ResizablePanelGroup.test.tsx`
- **Commit:** 8af2cae

**2. [Rule 1 - Bug] Separator `data-testid` overridden by library's `id` prop**
- **Found during:** Task 4 (Playwright test execution).
- **Issue:** First Playwright run found 0 elements matching `[data-testid="resize-handle-compare"]`. Investigation: v4's Separator spreads `...rest` FIRST then writes `data-testid={id}` last — the library overrides any caller-supplied data-testid (dist/react-resizable-panels.js line 2179).
- **Fix:** Pass the testid via the `id` prop instead (the library emits `data-testid={id}` AND `id={id}`). Vitest mock updated to mirror the real spread order.
- **Files modified:** `frontend/src/components/ui/ResizablePanelGroup.tsx`, `frontend/src/components/ui/__tests__/ResizablePanelGroup.test.tsx`
- **Commit:** e908f0d

**3. [Rule 1 - Bug] Panel `defaultSize={50}` interpreted as 50 PIXELS, not 50 percent**
- **Found during:** Task 4 (Playwright Test 3 — double-click reset).
- **Issue:** Probe revealed double-click resulted in URL `split_sizes=compare:5,95` (not 50/50). Investigation: v4 docs say "Numeric values are assumed to be pixels". The library's dblclick handler calls `panel.resize(defaultSize)` — passing `50` resized side-a to 50px (~5% width). The library's pipeline then clamped the other panel to ~95%.
- **Fix:** Pass Panel size props as STRINGS — `defaultSize="50%"` and `minSize="20%"`. Strings without explicit units are treated as percentages.
- **Files modified:** `frontend/src/components/panels/SessionCompareView.tsx` (with fat inline warning comment so future Panel additions don't regress)
- **Commit:** e908f0d

**4. [Rule 1 - Bug] `data-panel` attribute is boolean marker, NOT value-bearing**
- **Found during:** Task 4 (Playwright Test 2 — refresh restore).
- **Issue:** Test used `[data-panel="side-a"]` selector — 0 matches. Investigation: library emits `data-panel=""` (boolean) plus `id={id}` + `data-testid={id}`.
- **Fix:** Switched Playwright selectors to `#side-a` / `#side-b` (id selector).
- **Files modified:** `frontend/tests/e2e/v13-layout.spec.ts`
- **Commit:** e908f0d

**5. [Rule 1 - Bug] URL search params arrive URL-encoded (`%3A` / `%2C`)**
- **Found during:** Task 4 (Playwright Tests 1 and 3 — URL regex).
- **Issue:** Plan's example regex `/split_sizes=compare:70,30/` rejected the actual URL `split_sizes=compare%3A70%2C30`.
- **Fix:** Updated regex to accept both encoded and unencoded forms: `/split_sizes=compare(?::|%3A)\d+(?:,|%2C)\d+/`. URL.searchParams.get() still returns the DECODED value (`compare:70,30`) so the value-extraction part of the test is unchanged.
- **Files modified:** `frontend/tests/e2e/v13-layout.spec.ts`
- **Commit:** e908f0d

### Rule 2 — Auto-added Critical Functionality

**[Rule 2 - Critical] eslint-disable for vitest mock-internal `rrp-*` testids**
- **Found during:** Task 3 (ESLint sweep).
- **Issue:** ESLint's `cmc/testid-registry-only` rule flagged the vitest mock's `data-testid="rrp-group"` / `rrp-panel-{x}` / `rrp-separator` literals (not in docs/testid-registry.md).
- **Fix:** Added `/* eslint-disable cmc/testid-registry-only */` ... `/* eslint-enable */` block around the vi.mock() call with a comment explaining these testids are MOCK-INTERNAL fixtures that never reach the production DOM or Playwright (which uses the real library).
- **Files modified:** `frontend/src/components/ui/__tests__/ResizablePanelGroup.test.tsx`
- **Commit:** 8bde9d9

### No Architectural Changes (Rule 4)

No checkpoint:decision invocations — every adjustment was a small, contained bug fix or environmental quirk handled inline.

## Verification

| Gate | Status |
|------|--------|
| `cd frontend && pnpm test --run` | 754/754 green (112 files) |
| `cd frontend && pnpm exec tsc --noEmit` | clean |
| `cd frontend && pnpm exec eslint 'src/**/*.{ts,tsx}' 'tests/**/*.{ts,tsx}'` | clean |
| `cd frontend && pnpm exec playwright test tests/e2e/v13-layout.spec.ts -g "split-pane\|chart svg"` | 4/4 green |
| `cd frontend && pnpm exec playwright test tests/e2e/v13-layout.spec.ts` | 15 passed, 1 skipped (Plan 28-02 SavedViewMenu Reset — out of scope) |
| `cd frontend && pnpm exec playwright test tests/e2e/v13-a11y.spec.ts -g "ResizablePanelGroup"` | 1/1 green |
| `cd backend && uv run pytest tests/test_url_contract.py` | 2/2 green |
| `grep -E "PanelGroup\|PanelResizeHandle\|direction=" ResizablePanelGroup.tsx` (word-boundary) | 0 matches (Pitfall 1 grep gate) |
| `grep -rE "^[[:space:]]*<ResponsiveContainer" frontend/src/components/panels/*.tsx \| wc -l` | 8 (Phase 24/26/27 lock) |
| `grep -c "react-resizable-panels" frontend/package.json` | 1 |
| `git diff --stat frontend/src/components/savedviews/SaveViewDialog.tsx` | empty (Pitfall 3 auto-capture lock) |
| Bundle delta | +10.4 KB gzipped on SessionCompareView chunk (≤15 KB budget) |

## Authentication Gates

None. Task 0 was a `checkpoint:human-verify` (package legitimacy), not an auth gate; operator approved via the prior agent.

## Known Stubs

None. The wrapper is a fully wired component with real URL bridge, real library backing, and real Playwright coverage. No mock data, no placeholder behaviour.

## Self-Check: PASSED

**Files exist (checked via `[ -f "..." ]`):**
- FOUND: `frontend/src/components/ui/ResizablePanelGroup.tsx`
- FOUND: `frontend/src/components/ui/__tests__/ResizablePanelGroup.test.tsx`

**Commits exist (checked via `git log --oneline --all`):**
- FOUND: 5e26a5c — `chore(28-05): install react-resizable-panels@4.11.0 (LAYO-03)` (Task 1)
- FOUND: 8af2cae — `feat(28-05): ResizablePanelGroup wrapper with URL bridge (LAYO-03)` (Task 2)
- FOUND: 8bde9d9 — `feat(28-05): wire ResizablePanelGroup into SessionCompareView (LAYO-03)` (Task 3)
- FOUND: e908f0d — `test(28-05): Playwright LAYO-03 + perf probe + axe scan; Rule 1 fixes` (Task 4)
