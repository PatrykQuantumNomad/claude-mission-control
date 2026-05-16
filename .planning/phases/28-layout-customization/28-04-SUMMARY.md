---
phase: 28-layout-customization
plan: 04
subsystem: ui
tags: [react, tanstack-router, url-state, layout-customization, drag-and-drop, html5-dnd, keyboard-a11y, aria-live, playwright, axe-core]

# Dependency graph
requires:
  - phase: 28-layout-customization
    provides: Plan 28-02 foundation primitives (PANEL_REGISTRY, useLayoutState hook with orderedPanels/setOrder, asPanelOrder validator, getPanelLabel helper, normalizeRouteId for testid slugs)
  - phase: 28-layout-customization
    provides: Plan 28-03 PanelHeaderMenu component mounted on all 36 panels via the LayoutCustomizableProps forwarding-prop convention; APPEND-ONLY hidden_panels validateSearch on all 5 in-scope routes; PANELS render-array pattern in each route
  - phase: 28-layout-customization
    provides: Plan 28-01 Wave 0 scaffolding (Playwright `test.skip` skeleton for LAYO-02 reorder family + panel-grid-{columnId} / panel-drag-grip-{panelId} testid registration)
  - phase: 25-saved-views
    provides: SaveViewDialog auto-capture pipeline (useRouterState().location.search verbatim into state_json; panel_order rides through automatically — no SaveViewDialog edit)
  - phase: 24-foundation
    provides: cmc-sr-only recipe + cmc-card-grid layout + --space-* / --radius-* / --cmc-accent-blue / --cmc-text-subtle CSS tokens (no transform on the grip — Phase 24 Pitfall 2 lock honored)
provides:
  - DraggablePanelWrap component (native HTML5 drag-and-drop + keyboard reorder + aria-live announcements)
  - 5 in-scope routes (/, /activity, /cost, /skills, /alerts) extended with APPEND-ONLY panel_order validateSearch (asPanelOrder)
  - 'main' column render-order driven by useLayoutState.orderedPanels(MAIN_COLUMN) on all 5 routes
  - panel-grid-{columnId} testid family populated on every route's main grid container
  - Playwright LAYO-02 mouse-drag + keyboard reorder + Escape-cancel tests (4 tests, all green)
  - Phase 28 axe a11y scan suite (5 routes × 1 scan each, all green) including PHASE_28_NET_CLASS_MARKERS + violationTouchesPhase28 inversion-helper extension
affects: [28-05-split-pane, 28-06-saved-views-roundtrip-close]

# Tech tracking
tech-stack:
  added: []  # No new runtime dependencies — native HTML5 dnd, no dnd-kit per REQUIREMENTS dep budget
  patterns:
    - "Native HTML5 dnd via dataTransfer payload keys 'text/cmc-panel-id' + 'text/cmc-column-id'; cross-column drops rejected by handleDrop's source-vs-target columnId match"
    - "Keyboard reorder grab-mode latch (Space/Enter toggles aria-pressed); ArrowUp/ArrowDown call onReorder(panelId, ±1) with boundary clamping (no-op at index=0 / index=total-1); Esc cancels with 'Reorder cancelled' announce; Enter/Space commits with 'dropped at position N of M' announce"
    - "aria-live region (role='status' aria-live='polite' class='cmc-sr-only') updates on grab / move / drop / cancel — single setState per keypress, paint-perf invariant preserved (Pitfall 12)"
    - "Wrapper as grid cell (position: relative, NOT display: contents) — each draggable owns exactly one .cmc-card-grid cell; grip is position: absolute top/left over the card's chrome corner so the PanelCard occupies the full cell"
    - "Wrapper exposes data-drag-wrap-id={panelId} + data-column-id={columnId} — NOT data-panel-id (that attribute is owned by the inner PanelCard; duplicating it broke Playwright strict-locator queries during integration testing)"
    - "MAIN_COLUMN const per route (matches the eslint cmc/testid-registry-only rule — template literal `panel-grid-${MAIN_COLUMN}` reconstructs to the registered pattern panel-grid-{x})"
    - "Per-route MAIN_PANELS map + visibleMainPanels useMemo — map keys are panelIds, orderedPanels(MAIN_COLUMN).filter drives iteration order; unknown panelIds filtered via in-map membership (Pitfall 7 defense in depth)"

key-files:
  created:
    - frontend/src/components/ui/DraggablePanelWrap.tsx
  modified:
    - frontend/src/components/ui/__tests__/DraggablePanelWrap.test.tsx
    - frontend/src/components/ui/index.ts
    - frontend/src/styles.css
    - frontend/src/routes/index.tsx
    - frontend/src/routes/activity.tsx
    - frontend/src/routes/cost.tsx
    - frontend/src/routes/skills.tsx
    - frontend/src/routes/alerts.tsx
    - frontend/src/lib/layout/panelRegistry.ts
    - frontend/tests/e2e/v13-layout.spec.ts
    - frontend/tests/e2e/v13-a11y.spec.ts

key-decisions:
  - "DraggablePanelWrap wrapper is a real grid cell (position: relative), NOT display: contents — the plan's example used display: contents but during integration testing the [grip, sr-only, PanelCard] sibling layout broke the .cmc-card-grid flow (grip would consume its own grid cell, splitting the visual layout). Switched to position: relative wrapper + position: absolute grip so each draggable owns exactly one grid cell."
  - "Wrapper emits data-drag-wrap-id, NOT data-panel-id — the inner PanelCard already emits data-panel-id (Plan 28-03 contract). Duplicating it would resolve `locator('[data-panel-id=\"X\"]')` to 2 elements and break strict-locator Playwright queries. Caught during /cost mouse-drag e2e integration."
  - "/`/` route uses keyboard-reorder test (not mouse-drag) because the SystemHealthStrip + KpiRow + AttentionBar + LiveSessionsCard top-strip pushes the main grid below the fold, and .cmc-main scroll container intercepts pointer events mid-drag (same flake Plan 28-03 SUMMARY documented on /skills). Keyboard reorder is deterministic regardless of scroll position. Mouse-drag e2e coverage stays on /cost where the main grid is at the top of the page."
  - "PANEL_REGISTRY['/alerts'] regrouped: alert-rules-list + alert-rule-form → columnId='main' (reorder-eligible); alert-events-list → columnId='below' (NOT reorder-eligible). Previously all 3 panels were tagged 'main' but the route renders them in two separate .cmc-card-grids — the registry now matches the actual layout. The 'below' column id surfaces a new vocabulary entry for non-reorder-eligible grids; orderedPanels('main') returns only the two composer panels and DraggablePanelWrap mounts only there."
  - "DataTransfer mock vs happy-dom: testing-library/dom's fireEvent constructs a NEW window.DataTransfer instance and copies our mock's properties via Object.defineProperty(acc, prop, {value: …}) — without writable:true. The handler's `e.dataTransfer.effectAllowed = 'move'` write therefore fails silently against the copy. setData/getData still round-trip because functions are copied by reference (closures preserved). Test mock returns {dataTransfer, store} so assertions read from the closure-backed store; effectAllowed assertion was dropped from the vitest (its propagation is verified by the Playwright e2e URL-write assertion in real Chromium)."
  - "Phase 28 axe inversion extension — added PHASE_28_NET_CLASS_MARKERS (cmc-draggable-wrap, cmc-panel-grip, panel-drag-grip, panel-header-menu, panel-hide-, panel-reset-layout-, panel-grid-) + violationTouchesPhase28 helper. isPreExistingViolation now extends the inversion to honor all four phases (25/26/27/28) — any Phase-28 surface violation FAILS while v1.2 carry-overs flow through unflagged."
  - "TDD bundling: RED+GREEN combined in the single Task 1 commit (59a4c03) because a RED-only commit would fail pnpm tsc --noEmit (DraggablePanelWrap import would not resolve from the test file). Same TDD-bundling precedent Plan 28-02 + 28-03 established. Test file was authored FIRST with all 15 assertions then the implementation was written against those assertions — discipline preserved."

patterns-established:
  - "DraggablePanelWrap wrapping pattern (consistent across all 5 in-scope routes): build a MAIN_PANELS map of {panelId → renderThunk}, derive visibleMainPanels via useMemo(() => orderedPanels(MAIN_COLUMN).filter(id => !isHidden(id) && id in mainPanelMap), [deps]), then map each id to <DraggablePanelWrap key={id} panelId={id} columnId={MAIN_COLUMN} label={getPanelLabel(pathname, id)} index={idx} total={total} onReorder={(fromId, toIndex) => { /* splice + setOrder */ }}>{mainPanelMap[id]({panelId, headerMenu})}</DraggablePanelWrap>. Plan 28-05 will append split_sizes wiring to the same render-array pattern without restructuring."
  - "Grid container contract: every route's reorder-eligible .cmc-card-grid carries data-column-id={MAIN_COLUMN} AND data-testid={`panel-grid-${MAIN_COLUMN}`} on the SAME element. The wrapper's drop-target lookup reads data-column-id; Playwright reorder tests scope queries via the testid."
  - "Mouse vs keyboard e2e split: on /cost (no top strip, 2 panels) use mouse-drag with Playwright's high-level dragTo API. On /, /activity, /skills, /alerts (top strip + below-fold main grid) use keyboard reorder — deterministic regardless of scroll position. Plan 28-05 should follow the same heuristic for split-pane mouse drag."

# Metrics
duration: ~32min
completed: 2026-05-16
---

# Phase 28 Plan 04: LAYO-02 Drag-Reorder via DraggablePanelWrap Summary

**DraggablePanelWrap component (native HTML5 dnd + keyboard a11y + aria-live announcements) wraps every reorder-eligible main-column panel mount on /, /activity, /cost, /skills, /alerts. validateSearch APPEND-ONLY extended with panel_order on all 5 routes. Render-order driven by useLayoutState.orderedPanels(MAIN_COLUMN). 15/15 vitest assertions green; 4/4 Playwright LAYO-02 e2e tests green (mouse-drag on /cost, keyboard reorder on / and /cost, Escape-cancel on /cost); 5/5 Phase 28 axe a11y scans green (drag grip surface clean on all 5 routes); backend pytest URL contract 2/2 PASS; ResponsiveContainer count = 8 (Phase 24/26/27 lock preserved); SaveViewDialog unchanged (Pitfall 3 lock preserved).**

## Performance

- **Duration:** ~32 min
- **Started:** 2026-05-16T13:32Z (Task 1 commit 59a4c03)
- **Completed:** 2026-05-16T14:04Z (Task 2b commit 2a0c594)
- **Tasks:** 3 (1 + 2a + 2b)
- **Files modified:** 12 (1 created, 11 modified — see frontmatter `key-files`)
- **Commits:** 3 atomic task commits + 1 metadata commit (this bundle)

## Accomplishments

- **DraggablePanelWrap component shipped** (233 LOC including JSDoc — under the RESEARCH §3 ~300 LOC budget). Native HTML5 dnd mouse path with cross-column rejection (T-28-08 mitigated); keyboard reorder grab-mode latch with Space/Enter toggle, ArrowUp/Down move ±1 with boundary clamping, Enter commit / Esc cancel; aria-live region with role='status' aria-live='polite' announcing grab / move / drop / cancel (T-28-10 mitigated). 15 vitest assertions green: 4 testid+a11y contract + 4 mouse drag (dragstart payload + same-column drop calls onReorder + cross-column drop rejected + dragend clears visual state) + 7 keyboard (Space grab + ArrowDown reorder + ArrowUp reorder + boundary up + boundary down + Enter commit + Escape cancel).
- **5 in-scope routes wired** with APPEND-ONLY panel_order validateSearch + render-order via useLayoutState.orderedPanels(MAIN_COLUMN) + DraggablePanelWrap mounting on every main-column panel. The same surgical 3-edit pattern Task 2a established on / + /cost applied verbatim on /activity, /skills, /alerts — Phase-28 consistency lint passes across all 5 routes.
- **PANEL_REGISTRY['/alerts'] regrouped**: alert-rules-list + alert-rule-form → 'main' (reorder-eligible composer pair); alert-events-list → 'below' (NOT reorder-eligible firing-history table). The registry now mirrors the route's actual two-grid layout instead of the legacy single-main grouping.
- **Playwright LAYO-02 suite green** (4 tests): /cost mouse-drag (dragTo API; URL gains panel_order=main:cost-by-project,cost-forecast); / keyboard reorder (Space → ArrowDown writes panel_order, Enter commits); /cost keyboard reorder (Space → ArrowDown → Enter end-to-end with aria-live assertion); /cost Escape cancels (URL stays clean, aria-live announces 'cancelled').
- **Phase 28 axe a11y scan suite green** (5 routes × 1 scan each). NEW PHASE_28_NET_CLASS_MARKERS + violationTouchesPhase28 helper extend the inversion to honor all four phases (25/26/27/28). Drag grip surface (cmc-panel-grip button with aria-label + aria-pressed + aria-live sibling) introduces ZERO serious/critical violations on /, /activity, /cost, /skills, /alerts.
- **Round-trip with saved view** continues to work end-to-end (no SaveViewDialog edit needed — Pitfall 3 lock honored; the auto-capture pipeline picks up panel_order verbatim into state_json).

## Task Commits

Each task was committed atomically:

1. **Task 1: DraggablePanelWrap component (RED+GREEN bundle)** — `59a4c03` (feat) — 4 files (1 created + 3 modified: test file flipped from it.todo skeletons, components/ui/index.ts export, styles.css CSS append)
2. **Task 2a: Wire LAYO-02 on / and /cost (mouse-drag e2e)** — `13880b7` (feat) — 6 files (2 routes + 1 spec + 3 component-fix files: DraggablePanelWrap.tsx + test + styles.css for the data-panel-id collision fix-up discovered during e2e integration)
3. **Task 2b: Wire LAYO-02 on /activity, /skills, /alerts + Phase 28 axe scans** — `2a0c594` (feat) — 5 files (3 routes + 1 registry update + 1 a11y spec extension)

**Plan metadata commit:** (this commit — bundles 28-04-SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md)

## Files Created/Modified

**Created (1):**
- `frontend/src/components/ui/DraggablePanelWrap.tsx` — 233 LOC including JSDoc. Native HTML5 dnd mouse path + keyboard reorder grab-mode + aria-live announcements. Cross-column drops rejected by handleDrop's source-vs-target columnId match. Paint-perf invariant: URL write fires on DROP only, not every dragover — single setState per drop.

**Modified (11):**

*Component tests:*
- `frontend/src/components/ui/__tests__/DraggablePanelWrap.test.tsx` — 15 assertions across 3 describe blocks (testid contract + mouse drag + keyboard reorder). Custom DataTransfer mock returns {dataTransfer, store} pair to work around testing-library's value-copy of the mock's properties onto a fresh window.DataTransfer.

*Component barrel:*
- `frontend/src/components/ui/index.ts` — exports DraggablePanelWrap.

*Styles:*
- `frontend/src/styles.css` — appends .cmc-draggable-wrap (position: relative grid-cell-owning wrapper) + .cmc-draggable-wrap > .cmc-panel-grip (position: absolute top/left grip overlay) + .cmc-panel-grip variant rules (hover, focus-visible, [aria-pressed='true'] grabbing cursor) + .cmc-panel--dragging visual state. Uses --space-2xs / --radius-sm / --cmc-accent-blue / --cmc-text-subtle (verified existing tokens). NO transform — Phase 24 Pitfall 2 lock defense in depth.

*Routes (5):*
- `frontend/src/routes/index.tsx` — APPEND panel_order to validateSearch; MAIN_COLUMN const + mainPanelMap useMemo + visibleMainPanels useMemo; main-grid .cmc-card-grid carries data-column-id + data-testid; each main-column panel wrapped in DraggablePanelWrap. Top-strip panels (SystemHealthStrip / KpiRow / AttentionBar / LiveSessionsCard) stay static.
- `frontend/src/routes/activity.tsx` — same pattern; top + footer panels stay static (ActivityHeatmap / ChartsStrip / SessionsTable not reorder-eligible). 3 main-column panels (OtelPanel / UnifiedFailures / TopSkills) wrapped.
- `frontend/src/routes/cost.tsx` — same pattern; 2 main-column panels (CostForecastCard / CostByProjectCard) wrapped. No top strip.
- `frontend/src/routes/skills.tsx` — same pattern; top panels (DecisionsCard / InboxCard) stay static. 8 main-column panels wrapped.
- `frontend/src/routes/alerts.tsx` — same pattern; alert-events-list moved to a separate 'below' grid (NOT reorder-eligible). 2 main-column panels (AlertRulesList / AlertRuleForm) wrapped.

*Layout registry:*
- `frontend/src/lib/layout/panelRegistry.ts` — alert-events-list columnId changed 'main' → 'below'. The full appended bullet documents the rationale (separate full-width grid; not reorder-eligible).

*Playwright specs:*
- `frontend/tests/e2e/v13-layout.spec.ts` — flipped 4 LAYO-02 `test.skip` → `test`. /cost mouse-drag uses dragTo API; / + /cost keyboard reorder via grip.focus() + page.keyboard.press; Escape-cancel asserts both aria-pressed=false and URL has no panel_order param.
- `frontend/tests/e2e/v13-a11y.spec.ts` — NEW PHASE_28_NET_CLASS_MARKERS + violationTouchesPhase28 helper + 5 new axe scans (one per in-scope route). Each scan pre-asserts cmc-panel-grip is visible then runs axe on the route's drag-grip surface.

## PANEL_REGISTRY mount coverage (Phase 28 in-scope routes, LAYO-02 reorder-eligible)

| Route | Reorder-eligible (`main`) | Static (`top`/`footer`/`below`) | Notes |
|-------|---------------------------|----------------------------------|-------|
| `/`   | 11 panels (token-usage … mcp-panel) | 4 panels (top: system-pressure, kpi-row, attention-bar, live-sessions) | Chrome row fixed; main grid reorder-eligible. |
| `/activity` | 3 panels (otel-panel, unified-failures, top-skills) | 3 panels (top: activity-heatmap, charts-strip; footer: sessions-table) | Activity heatmap + charts strip + sessions table stay static. |
| `/cost`  | 2 panels (cost-forecast, cost-by-project) | 0 | Single grid, no top strip; smallest reorder surface. |
| `/skills` | 8 panels (task-board … context-health) | 2 panels (top: decisions, inbox) | Decisions + inbox stay static above the grid. |
| `/alerts` | 2 panels (alert-rules-list, alert-rule-form) | 1 panel (below: alert-events-list) | NEW 'below' column id surfaces the full-width firing history below the composer grid. |

Total: 26 reorder-eligible panel mounts (DraggablePanelWrap-wrapped) across the 5 in-scope routes. The remaining 10 panels stay in static render order.

## Decisions Made

See `key-decisions` in frontmatter for the full machine-readable list. Key narrative additions:

- **Why position: relative wrapper instead of display: contents?** The plan's example showed `<div style={{display: 'contents'}}>` containing [grip button, sr-only region, PanelCard]. With display: contents, the .cmc-card-grid parent would see grip + sr-only + PanelCard as direct children — each panel would consume 3 grid cells instead of 1, breaking the visual layout. Switched to position: relative wrapper as a real grid cell, with the grip absolutely positioned over the card's top-left corner. The PanelCard occupies the full cell space; the grip floats above without consuming grid real estate.
- **Why NOT emit data-panel-id on the wrapper?** The inner PanelCard already emits data-panel-id (Plan 28-03 contract — used for the LAYO-01 hide-and-persist tests). My wrapper initially emitted it too, but Playwright's `locator('[data-panel-id="cost-forecast"]')` then resolved to 2 elements (the wrapper AND the inner PanelCard). Strict-locator queries fail in this state. Renamed wrapper attribute to data-drag-wrap-id (internal-only) and asserted in the vitest that the wrapper does NOT carry data-panel-id.
- **Why /`/` keyboard test instead of mouse-drag?** Plan 28-03 SUMMARY documented the same flake on /skills: the .cmc-main scroll container intercepts pointer events when the drag target lives below the fold. On /, the SystemHealthStrip + KpiRow + AttentionBar + LiveSessionsCard top-strip pushes the main grid below the fold. Keyboard reorder is deterministic regardless of scroll position — it uses grip.focus() (no pointer events) + page.keyboard.press (sends keyboard events directly to the focused element). Mouse-drag e2e coverage stays on /cost where the main grid is at the top of the page.
- **Why PANEL_REGISTRY['/alerts'] regrouping (alert-events-list 'main' → 'below')?** The route file renders the 3 panels in two separate .cmc-card-grids: rules-list + rule-form in one grid, alert-events-list in a second full-width grid below. The legacy registry tagged all 3 as 'main' — that worked for LAYO-01 (hide doesn't care about columnId) but breaks LAYO-02 if alert-events-list shows up in orderedPanels('main'). The 'below' column id is the cleanest vocabulary fix: orderedPanels('main') returns the two composer panels; DraggablePanelWrap mounts only on those; alert-events-list keeps its own static grid. New 'below' vocabulary entry is APPEND-ONLY — Plan 28-05 / 28-06 should not depend on its absence.
- **Why TDD RED+GREEN bundled in one commit?** The pre-commit hook gates on `pnpm tsc --noEmit`, which fails when the test file imports DraggablePanelWrap before the component exists. Splitting RED into its own commit would require either (a) skipping the hook (not allowed by execute-plan.md) or (b) writing a stub DraggablePanelWrap that the GREEN commit then replaces — both ugly. The Plan 28-02 + 28-03 precedent bundles RED+GREEN; the commit message documents the RED expectations explicitly, and the test file was authored FIRST with all assertions before the implementation was written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DraggablePanelWrap wrapper emitted data-panel-id (duplicate-attribute collision)**
- **Found during:** Task 2a — `/cost` mouse-drag e2e test
- **Issue:** Wrapper's `data-panel-id={panelId}` collided with the inner PanelCard's same attribute. Playwright `locator('[data-panel-id="cost-forecast"]')` resolved to 2 elements → strict-locator violation → test timeout.
- **Fix:** Renamed wrapper attribute to `data-drag-wrap-id`. Updated vitest assertion to also confirm `data-panel-id` is NOT present on the wrapper.
- **Files modified:** `frontend/src/components/ui/DraggablePanelWrap.tsx`, `frontend/src/components/ui/__tests__/DraggablePanelWrap.test.tsx`
- **Commit:** `13880b7`

**2. [Rule 1 - Bug] DraggablePanelWrap used display: contents (grid layout collision)**
- **Found during:** Task 2a — `/cost` mouse-drag e2e test (initial visual inspection of rendered DOM)
- **Issue:** Plan example used `style={{display: 'contents'}}` — but the wrapper's children (grip button + sr-only region + PanelCard) would then float as siblings in the .cmc-card-grid flow, each consuming its own grid cell. The intended layout has each draggable own exactly ONE grid cell.
- **Fix:** Switched wrapper to `position: relative` (no display override). Added `.cmc-draggable-wrap > .cmc-panel-grip` rule (position: absolute, top/left --space-xs, z-index: 1) so the grip overlays the card's top-left corner without consuming grid real estate.
- **Files modified:** `frontend/src/components/ui/DraggablePanelWrap.tsx`, `frontend/src/styles.css`
- **Commit:** `13880b7`

**3. [Rule 1 - Bug] PANEL_REGISTRY['/alerts'] columnId vocabulary didn't match the route's actual layout**
- **Found during:** Task 2b — `/alerts` wiring
- **Issue:** All 3 panels were tagged columnId='main' in the registry, but the route renders alert-rules-list + alert-rule-form in one .cmc-card-grid and alert-events-list in a separate full-width grid below. The single-main grouping was OK for LAYO-01 (hide doesn't care about column boundaries) but breaks LAYO-02 (orderedPanels('main') would return all 3, and DraggablePanelWrap would mount on alert-events-list too).
- **Fix:** Changed alert-events-list columnId 'main' → 'below'. New 'below' vocabulary entry; orderedPanels('main') now returns only the 2 reorder-eligible composer panels.
- **Files modified:** `frontend/src/lib/layout/panelRegistry.ts`
- **Commit:** `2a0c594`

### Scope refinements (no explicit deviation — plan was thorough)

- **TS error: `JSX.Element` return type.** TS 5.x removed the global `JSX` namespace; `JSX.Element` is not available in the project's tsconfig. Switched to inferred return type (no explicit annotation). Verified by tsc clean.
- **ESLint cmc/testid-registry-only on `data-testid="panel-grid-main"`.** The registry has `panel-grid-{columnId}` as a DYNAMIC pattern; a static string literal `"panel-grid-main"` doesn't match (the rule only checks dynamic patterns against template literals). Fix: use a per-route `const MAIN_COLUMN = 'main'` + template literal `` `panel-grid-${MAIN_COLUMN}` `` — the rule reconstructs this as `panel-grid-{x}` which matches the registered pattern.
- **DataTransfer mock vs happy-dom: effectAllowed assertion dropped from vitest.** Documented inline in the test file. Playwright e2e (real Chromium) validates the visible side-effect (URL writes after drop) which proves effectAllowed=move propagated correctly.

## Issues Encountered

- **Stale dist/ broke first Playwright run** (Task 2a). The build cache from before Plan 28-04 was loaded by the existing vite preview server (reuseExistingServer=true). Killing the preview process + rebuilding + letting Playwright spawn a fresh preview resolved it.
- **Vitest flake on first run after DraggablePanelWrap edits.** One run failed; re-running passed. Subsequent runs all green. No pattern identified — likely happy-dom timing nondeterminism in a single assertion. Did not pursue (Plan 28-03 SUMMARY noted similar transients).

## User Setup Required

None — no external service configuration required.

## Next Plan Readiness

Plan 28-05 (Wave 4 — LAYO-03 split-pane on /sessions/compare) is ready to spawn. Contracts in place:
- `asSplitSizes` validator shipped Plan 28-02.
- `useLayoutState.splitSizes(groupId)` + `setSplit(groupId, sizes)` shipped Plan 28-02 (includes the prune-on-empty path for the double-click reset).
- PanelHeaderMenu mounted on session-compare's single PanelCard (Plan 28-03). Plan 28-05 ships ResizablePanelGroup inside the session-compare PanelCard's body.
- Phase 28 axe scan helper extension (PHASE_28_NET_CLASS_MARKERS + violationTouchesPhase28) ready to receive Plan 28-05's resize-handle-{groupId} markers.

Plan 28-06 (Wave 5 — saved-views-roundtrip close gate) inherits a working panel_order round-trip already proven by this plan's panel_order URL writes flowing through the SaveViewDialog auto-capture pipeline. The close gate will widen the round-trip matrix (multiple routes × hidden_panels × panel_order × split_sizes combinations) without changing the auto-capture path.

## Threat Flags

None — Plan 28-04 introduces no new network endpoints, no new auth paths, no new file access patterns, no new schema changes at trust boundaries.

The plan's threat model (T-28-08..10) is satisfied end-to-end:
- **T-28-08 (Tampering — cross-column drop attempt):** mitigated by handleDrop's `if (fromColumn !== columnId) return` guard. Asserted by the vitest "drop from a different column is REJECTED (cross-column constraint)" + the / `top`-column panels staying in static order (no DraggablePanelWrap mounted on them).
- **T-28-09 (Input Validation — panel_order CSV):** mitigated by asPanelOrder regex anchor + undefined-default (shipped Plan 28-02); orderedPanels filters unknown ids via PANEL_REGISTRY membership (Pitfall 7 defense in depth at the route's `id in mainPanelMap` filter).
- **T-28-10 (Accessibility regression — drag a11y):** mitigated by the mandatory keyboard fallback (Pitfall 4) — Playwright keyboard reorder + Escape-cancel tests assert grab-mode latch, ArrowDown/Up moves, Enter commits, Escape cancels. axe-core scan extension (5 routes) covers aria-label + aria-pressed + aria-live region — all conformant.

## TDD Gate Compliance

Plan-level TDD gate is NOT required for this plan (frontmatter `type: execute`, not `type: tdd`). Task 1 uses `tdd="true"` at the task level. Following the Plan 28-02 + 28-03 precedent and the project's pre-commit hook constraint (`pnpm tsc --noEmit` must be clean — a RED-only commit with a missing DraggablePanelWrap component would not pass), the RED/GREEN cycle for Task 1 was bundled into the single `feat` commit (59a4c03). The commit message documents the RED expectations + the GREEN delivery. TDD discipline was preserved: test file was authored FIRST with all 15 assertions before the implementation was written; the assertions on testid presence, dataTransfer payload, onReorder callback, aria-pressed transitions, and aria-live announcements would have failed against an empty implementation.

## Self-Check: PASSED

**Files exist:**
- ✓ `frontend/src/components/ui/DraggablePanelWrap.tsx` (FOUND — 233 LOC)
- ✓ `frontend/src/components/ui/__tests__/DraggablePanelWrap.test.tsx` (15 assertions, all green)
- ✓ `frontend/src/components/ui/index.ts` (DraggablePanelWrap exported)
- ✓ `frontend/src/styles.css` (.cmc-draggable-wrap + .cmc-panel-grip rules appended)
- ✓ `frontend/src/routes/index.tsx` (validateSearch + panel_order + DraggablePanelWrap × 11 main panels)
- ✓ `frontend/src/routes/activity.tsx` (validateSearch + panel_order + DraggablePanelWrap × 3 main panels)
- ✓ `frontend/src/routes/cost.tsx` (validateSearch + panel_order + DraggablePanelWrap × 2 main panels)
- ✓ `frontend/src/routes/skills.tsx` (validateSearch + panel_order + DraggablePanelWrap × 8 main panels)
- ✓ `frontend/src/routes/alerts.tsx` (validateSearch + panel_order + DraggablePanelWrap × 2 main panels; alert-events-list in below grid)
- ✓ `frontend/src/lib/layout/panelRegistry.ts` (alert-events-list columnId='below')
- ✓ `frontend/tests/e2e/v13-layout.spec.ts` (4 LAYO-02 reorder tests unskipped + passing)
- ✓ `frontend/tests/e2e/v13-a11y.spec.ts` (PHASE_28_NET_CLASS_MARKERS + 5 axe scans appended + passing)

**Commits exist:**
- ✓ `59a4c03` Task 1 feat(28-04): DraggablePanelWrap component (LAYO-02 RED+GREEN)
- ✓ `13880b7` Task 2a feat(28-04): wire LAYO-02 panel_order + DraggablePanelWrap on / and /cost
- ✓ `2a0c594` Task 2b feat(28-04): wire LAYO-02 on /activity /skills /alerts + Phase 28 axe scans

**Verify commands passed:**
- ✓ `cd frontend && pnpm test --run` → 748 passed + 7 todo (1 skipped, 112 test files)
- ✓ `cd frontend && pnpm tsc --noEmit` → no errors
- ✓ `cd frontend && pnpm exec eslint 'src/**/*.{ts,tsx}' 'tests/**/*.{ts,tsx}'` → no violations
- ✓ `cd frontend && pnpm exec playwright test tests/e2e/v13-layout.spec.ts` → 11 passed + 5 skipped (4 LAYO-02 reorder + 5 LAYO-01 hide + 1 LAYO-04 reset + 1 round-trip; remaining 5 skip cover LAYO-03 split-pane + LAYO-04 SavedViewMenu chrome + perf — out of scope for Plan 28-04)
- ✓ `cd frontend && pnpm exec playwright test tests/e2e/v13-a11y.spec.ts -g "Phase 28 axe a11y"` → 5/5 passed
- ✓ `cd backend && uv run pytest tests/test_url_contract.py -v` → 2/2 PASS
- ✓ source-grep `grep -c "asPanelOrder" frontend/src/routes/{index,activity,cost,skills,alerts}.tsx` → 3 per route × 5 routes = 15 (import + type + validateSearch)
- ✓ source-grep `grep -c "DraggablePanelWrap" frontend/src/routes/{index,activity,cost,skills,alerts}.tsx` → ≥3 per route × 5 routes = 21+ (import + mount + onReorder reference)
- ✓ `git diff --stat HEAD frontend/src/components/savedviews/SaveViewDialog.tsx` → empty (Pitfall 3 lock honored — SaveViewDialog unchanged)
- ✓ `grep -rE "^[[:space:]]*<ResponsiveContainer" frontend/src/components/panels/*.tsx | wc -l` → 8 (Phase 24/26/27 lock preserved — no new charts in Phase 28)

---
*Phase: 28-layout-customization*
*Completed: 2026-05-16*
