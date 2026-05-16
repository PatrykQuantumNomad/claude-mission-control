---
phase: 28-layout-customization
plan: 02
subsystem: ui
tags: [react, tanstack-router, url-state, layout-customization, validators, dropdown-menu, sonner]

# Dependency graph
requires:
  - phase: 28-layout-customization
    provides: Plan 28-01 Wave 0 vitest skeletons (it.todo placeholders for asHiddenPanels/asPanelOrder/asSplitSizes, panelRegistry, useLayoutState, PanelHeaderMenu, DraggablePanelWrap, ResizablePanelGroup) + url-contract.md Phase 28 effects section + testid-registry.md Phase 28 families
  - phase: 25-saved-views
    provides: SavedViewMenu DropdownMenu structure, normalizeRouteId (route id coercion), SaveViewDialog state_json capture pipeline
  - phase: 26-time-controls
    provides: asComparePanels validator pattern (CSV regex shape lifted to shared CSV_ID_RE), sonner toast library, useNavigate({ search: prev => ... }) function-form precedent
  - phase: 27-per-route-adoption-ii
    provides: URL-as-single-source-of-truth invariant (per-panel state OFF localStorage), useRouterState({ select }) read pattern
provides:
  - 3 URL validators in searchSchemas.ts (asHiddenPanels, asPanelOrder, asSplitSizes) returning string | undefined — never empty string
  - panelRegistry.ts NEW (PanelDescriptor interface + PANEL_REGISTRY const enumerating 39 panels across 6 in-scope routes + isValidPanelId + normalizeRouteId pathname→slug + getPanelLabel with panelId fallback)
  - useLayoutState hook NEW with 7 functions ({ isHidden, setHidden, orderedPanels, setOrder, splitSizes, setSplit (null/empty prune), reset (preserves non-layout) })
  - PanelCard.panelId? optional prop (data-panel-id attribute emission) + PanelCard.headerMenu? optional slot (trailing chrome for Plan 28-03 PanelHeaderMenu mount)
  - SavedViewMenu Reset Layout DropdownMenu.Item (LAYO-04 corrupt-state-lock-in escape hatch) with panel-reset-layout-{route} testid + sonner toast.success feedback
affects: [28-03-panel-show-hide, 28-04-panel-reorder, 28-05-split-pane, 28-06-saved-views-roundtrip-close]

# Tech tracking
tech-stack:
  added: []  # No new runtime dependencies — react-resizable-panels lands in Wave 3 Plan 28-05
  patterns:
    - "Central PANEL_REGISTRY map (single source of truth for layout-customizable panels per route) — Pitfall 9 append-only id vocabulary"
    - "URL-bridge hook via useNavigate({ search: prev => ({ ...prev, key: nextOrUndefined }) }) with `as never` cast — Phase 26 TimePicker precedent"
    - "Destructuring-delete reset pattern (`delete next.key`) — append-only-safe against future search keys; preferred over whitelist-spread"
    - "safeRouteSlug() wrapper around normalizeRouteId — try/catch the throw so SavedViewMenu can mount on out-of-scope routes (`/skills/foo`) without breaking; Reset Layout simply does not render"
    - "Two-surface coverage of LAYO-04 reset (per-panel in Plan 28-03 PanelHeaderMenu + chrome-level in SavedViewMenu) — corrupt-state-lock-in escape hatch even when all panels are hidden"

key-files:
  created:
    - frontend/src/lib/layout/panelRegistry.ts
    - frontend/src/lib/layout/useLayoutState.ts
  modified:
    - frontend/src/lib/searchSchemas.ts
    - frontend/src/lib/__tests__/searchSchemas.test.ts
    - frontend/src/lib/__tests__/panelRegistry.test.ts
    - frontend/src/lib/layout/__tests__/useLayoutState.test.ts
    - frontend/src/components/ui/PanelCard.tsx
    - frontend/src/components/ui/BoundedPanelCard.tsx
    - frontend/src/components/savedviews/SavedViewMenu.tsx
    - frontend/src/components/savedviews/__tests__/SavedViewMenu.test.tsx

key-decisions:
  - "Lifted Pitfall 2 (undefined-default) into all 3 new validators via the established `typeof !== 'string' || v === '' → undefined; regex.test → v : undefined` shape; reused existing pattern from asComparePanels"
  - "PANEL_REGISTRY columnId vocabulary: `top` for panels rendered ABOVE the .cmc-card-grid container (full-width strips like SystemHealthStrip/KpiRow/AttentionBar/ActivityHeatmap/ChartsStrip/SessionsTable/DecisionsCard/InboxCard); `main` for panels INSIDE .cmc-card-grid"
  - "39 panel ids registered across 6 in-scope routes — derived from each route file's JSX render tree (verified via Read of routes/*.tsx). Naming convention: kebab-case slug of the user-visible label, NOT the component file name (e.g. SystemHealthStrip → `system-pressure`, SessionCompareView → `session-compare`)"
  - "normalizeRouteId throws on unknown pathnames (defense in depth) — caller surfaces typo immediately. SavedViewMenu wraps this in safeRouteSlug() with try/catch since the menu mounts on EVERY route including out-of-scope ones (`/skills/foo`)"
  - "setSplit accepts `number[] | null` (null OR empty array prunes the group; if no groups remain, split_sizes is removed from URL entirely — Pitfall 2 lock). Plan 28-05's ResizablePanelGroup double-click reset will consume this exact overload"
  - "reset() implementation uses destructuring-delete (NOT whitelist-spread) to preserve future search keys without an explicit allowlist update; explicit vitest assertion walks all 7 non-layout keys (schemaVersion, time_from, time_to, compare_panels, range, a, b)"
  - "PanelCard.headerMenu? is a separate optional slot from existing `trailing?` — kept distinct so per-panel chrome (RangeToggle, CompareToggle) and the layout-customization menu can coexist without one trampling the other"
  - "SavedViewMenu Reset Layout item rendered only when safeRouteSlug returns non-null — out-of-scope routes (`/skills/foo`) hide the affordance because they have no layout state to reset"

patterns-established:
  - "Phase 28 URL validator shape: `function asXxx(v: unknown): string | undefined { if (typeof v !== 'string' || v === '') return undefined; return REGEX.test(v) ? v : undefined }` — 3 instances reusable as templates if Wave 2-4 plans add more"
  - "useLayoutState as the single URL ↔ layout-state bridge. Every Wave 2-4 plan that needs to read/write layout URL params consumes this hook; no direct useNavigate calls for layout."
  - "Append-only PanelCard prop ergonomic: when adding an optional prop, leave existing call sites untouched by passing undefined; reserve a `data-{prop}` attribute on the rendered DOM root so Playwright can scope queries"
  - "safeRouteSlug() try/catch wrapper for normalizeRouteId in components that mount on out-of-scope routes — chrome layer renders conditionally instead of crashing on unknown pathnames"

# Metrics
duration: ~25min
completed: 2026-05-16
---

# Phase 28 Plan 02: Foundation Primitives Summary

**Three URL validators (asHiddenPanels/asPanelOrder/asSplitSizes) + 39-panel central registry (PANEL_REGISTRY) + useLayoutState hook bridging URL to { isHidden, setHidden, orderedPanels, setOrder, splitSizes, setSplit, reset } + PanelCard.panelId optional prop + SavedViewMenu Reset Layout escape hatch — all the contracts Wave 2-4 plans (28-03 panel show/hide, 28-04 reorder, 28-05 split-pane) consume directly without inventing URL serialization themselves.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-16T08:30Z
- **Completed:** 2026-05-16T08:55Z
- **Tasks:** 3
- **Files modified:** 9 (2 created, 7 modified — see frontmatter `key-files`)
- **Commits:** 3 atomic task commits + 1 metadata commit

## Accomplishments

- **3 URL validators land in searchSchemas.ts** with anchored regex (`/^[a-z0-9_-]+...$/` and group-CSV variants) — `asHiddenPanels` (single CSV), `asPanelOrder` (group CSV `col:p1,p2;col2:p3`), `asSplitSizes` (group CSV of percentages, ≥2 values per group). All three return `undefined` for empty-string + malformed + non-string input (Pitfall 2 lock — DefaultViewLoader bare-URL gate stays intact).
- **panelRegistry.ts NEW** with 39 panels across 6 in-scope routes (`/`, `/activity`, `/cost`, `/skills`, `/alerts`, `/sessions/compare`), `isValidPanelId` (with cross-route + unknown-route guards), `normalizeRouteId` (pathname → testid slug — throws on unknown), `getPanelLabel` (with panelId fallback for Pitfall 7 graceful drift).
- **useLayoutState hook NEW** wiring all three layout URL params via a single `useNavigate` + `useRouterState` consumer. 7 functions exported. `reset()` clears ONLY the 3 layout keys (LAYO-04 SC#3) via destructuring-delete pattern (append-only-safe against future search keys). `setSplit` accepts `null` OR empty array to prune (consumed by Plan 28-05's double-click reset).
- **PanelCard.tsx + BoundedPanelCard.tsx** extended with optional `panelId?` (emits `data-panel-id` attribute) + optional `headerMenu?` (trailing chrome slot for Plan 28-03's PanelHeaderMenu mount). Both append-only — zero behavioral change at the ~48 existing call sites.
- **SavedViewMenu Reset Layout escape hatch** lands as the LAYO-04 corrupt-state-lock-in prevention surface. Renders only on Phase-28 in-scope routes (`safeRouteSlug` returns null for out-of-scope `/skills/foo`). RotateCcw icon + `panel-reset-layout-{route}` testid + `aria-label="Reset layout to default"` + sonner `toast.success('Layout reset')` feedback.
- **Vitest expansion**: 749 total tests (728 passed + 21 todo). Plan 28-02 contributes 65 new green assertions: 24 panelRegistry + 12 searchSchemas layout validators + 29 useLayoutState (every behavior bullet → one `it`) + 2 SavedViewMenu new cases. Wave 0 it.todo skeletons for the three Plan-28-02 surfaces (asHiddenPanels/asPanelOrder/asSplitSizes, panelRegistry, useLayoutState) all flipped to real assertions — remaining 21 todo are PanelHeaderMenu / DraggablePanelWrap / ResizablePanelGroup placeholders awaiting Wave 2-4 plans (28-03/04/05).

## Task Commits

Each task was committed atomically:

1. **Task 1: Validators (asHiddenPanels / asPanelOrder / asSplitSizes) + panelRegistry** — `951cc92` (feat)
2. **Task 2: useLayoutState hook with reset preserving non-layout params** — `0b48595` (feat)
3. **Task 3: Extend PanelCard.panelId prop + add SavedViewMenu Reset Layout item** — `e042402` (feat)

_Note: TDD-style RED/GREEN bundling was used for Tasks 1 + 2 because the project's pre-commit hook enforces `tsc --noEmit` clean — a pure RED commit would not have passed typecheck since the validator/hook symbols did not yet exist. Each task commit message documents the RED expectations + the GREEN delivery._

**Plan metadata commit:** (this commit — bundles 28-02-SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md)

## PANEL_REGISTRY Enumeration

Authoritative listing per in-scope route (39 panels total). Wave 2-4 executors consume this directly — DO NOT re-derive from route JSX. Panel ids are append-only (Pitfall 9 lock).

**`/` (15 panels):**
- `top` column: system-pressure, kpi-row, attention-bar, live-sessions
- `main` column: token-usage, cache-efficiency, session-outcomes, tool-latency, hook-activity, project-breakdown, agent-fanout, edit-acceptance, productivity, pressure-panel, mcp-panel

**`/activity` (6 panels):**
- `top` column: activity-heatmap, charts-strip, sessions-table
- `main` column: otel-panel, unified-failures, top-skills

**`/cost` (2 panels):**
- `main` column: cost-forecast, cost-by-project

**`/skills` (10 panels):**
- `top` column: decisions, inbox
- `main` column: task-board, schedules, skills-registry, mcp-servers, skill-cost, skill-latency, skill-timeline, context-health

**`/alerts` (3 panels):**
- `main` column: alert-rules-list, alert-rule-form, alert-events-list

**`/sessions/compare` (1 panel):**
- `main` column: session-compare

**Panel id deviations from planner draft (per A1 — kebab-case label was the heuristic):**

The plan's Task 1 prose suggested draft ids that the executor confirmed by reading each route file. Final ids match the kebab-case-user-visible-label convention. Notable choices where multiple slugs could apply:
- `SystemHealthStrip` → `system-pressure` (operator-facing label per AttentionBar context, NOT `system-health` after the component file). Plan draft also used `system-pressure`.
- `McpPanel` on `/` → `mcp-panel`; on `/skills` (reused via `reqId="SKLP-01"`) → `mcp-servers`. Same component, different operator context, different id — registry treats them as distinct panels because they're per-route.
- `SkillCostCardForTopSkill` → `skill-cost` (the user-visible card heading, ignoring the wrapper-component name).
- `SessionCompareView` → `session-compare` (operator-visible card title).

**`normalizeRouteId` slug vocabulary (testid family):**
- `/` → `home`
- `/activity` → `activity`
- `/cost` → `cost`
- `/skills` → `skills`
- `/alerts` → `alerts`
- `/sessions/compare` → `sessions-compare`

Out-of-scope routes (`/skills/$name`, future dynamic routes) throw — SavedViewMenu wraps in `safeRouteSlug()` try/catch.

## Files Created/Modified

**Created (2):**
- `frontend/src/lib/layout/panelRegistry.ts` — 39-panel central registry + 4 helpers (PANEL_REGISTRY, isValidPanelId, normalizeRouteId, getPanelLabel)
- `frontend/src/lib/layout/useLayoutState.ts` — URL ↔ layout-state bridge hook with 7 exports

**Modified (7):**
- `frontend/src/lib/searchSchemas.ts` — APPENDED asHiddenPanels + asPanelOrder + asSplitSizes (+3 regex anchors CSV_ID_RE / PANEL_ORDER_RE / SPLIT_SIZES_RE)
- `frontend/src/lib/__tests__/searchSchemas.test.ts` — replaced 9 Plan-28-01 it.todo placeholders with 16 real assertions covering the 3 validators
- `frontend/src/lib/__tests__/panelRegistry.test.ts` — replaced 11 Plan-28-01 it.todo placeholders with 24 real assertions covering all 4 helpers
- `frontend/src/lib/layout/__tests__/useLayoutState.test.ts` — replaced 12 Plan-28-01 it.todo placeholders with 29 real assertions covering all 7 hook functions
- `frontend/src/components/ui/PanelCard.tsx` — APPEND-ONLY optional `panelId?` + `headerMenu?` props; emits `data-panel-id` attribute when set
- `frontend/src/components/ui/BoundedPanelCard.tsx` — APPEND-ONLY mirror of the 2 new props for type pass-through via `<PanelCard {...props} bounded />`
- `frontend/src/components/savedviews/SavedViewMenu.tsx` — APPENDED Reset Layout DropdownMenu.Item with `panel-reset-layout-{route}` testid + sonner toast.success
- `frontend/src/components/savedviews/__tests__/SavedViewMenu.test.tsx` — +2 assertions on top of the 4 existing (sonner mock added at module scope)

## Decisions Made

See `key-decisions` in frontmatter for the full machine-readable list. Key narrative additions:

- **Why not a per-panel `Reset layout` shipping in Plan 28-02?** Per-panel Reset Layout lives in `PanelHeaderMenu` (Plan 28-03). Plan 28-02 only ships the chrome-level SavedViewMenu surface — that's the "all panels hidden" escape hatch (RESEARCH §7 + A2). Two-surface coverage is the design.
- **Why `as never` cast in useLayoutState's navigate calls?** TanStack Router's per-route `useNavigate` types reject the generic `Record<string, unknown>` mutator. The hook is intentionally route-agnostic (each route's `validateSearch` drops unknown fields), so the cast bypasses the route-type constraint per the established Phase 26 TimePicker pattern. Alternative considered: parameterize the hook by route type — rejected as over-engineering for a primitive that is supposed to be drop-in across all 6 routes.
- **Why throw in `normalizeRouteId` for unknown pathnames?** Defense in depth — a typo at a call site surfaces immediately as a runtime error rather than silently producing a malformed testid (e.g. `panel-reset-layout-undefined`) that Playwright would then fail to locate with a less-actionable error. SavedViewMenu wraps in `safeRouteSlug` because it mounts on EVERY route including out-of-scope ones.
- **Why store panel ids per-route instead of globally?** Same component can render on multiple routes with different operator contexts (e.g. `McpPanel` on `/` is "MCP servers"; same panel on `/skills` is also "MCP servers" but registered as `mcp-servers` for the skills route). Per-route registry lets each route define its own panel vocabulary without cross-route collisions.

## Deviations from Plan

None - plan executed exactly as written.

The plan was thorough enough that no Rule 1/2/3 auto-fixes were needed. A few minor refinements emerged:

- **TDD bundling instead of separate RED/GREEN commits**: The project's pre-commit hook enforces `pnpm tsc --noEmit` clean, which would have rejected a RED-only commit (the test imports would fail with "module not found" or "no exported member"). Per execute-plan.md `<tdd_execution>` guidance, this is documented as a workflow-driven adaptation rather than a deviation — each task commit message explicitly states the RED expectations + the GREEN delivery in a single atomic commit. The TDD discipline was preserved (write tests first that fail without the impl, then ship the impl) — only the commit granularity changed.
- **`getPanelLabel` not in original Plan 28-01 skeleton**: The plan's Task 1 action explicitly added `getPanelLabel` to the panelRegistry exports (for Plan 28-04 `DraggablePanelWrap label={...}` consumer). The Plan 28-01 vitest skeleton did not have an `it.todo` for `getPanelLabel` — the Plan 28-02 plan called for it. Added 3 new test cases (known panel / unknown panel / unknown route) in addition to flipping the existing 11 it.todos. No deviation from the Plan 28-02 spec.

## Issues Encountered

- **TypeScript route-typed `useNavigate` rejected `Record<string, unknown>` mutator** (Task 2): TanStack Router infers per-route Search types from each route's `validateSearch` return shape, so passing a `(prev: Record<string, unknown>) => { hidden_panels: string | undefined }` function is type-incompatible with the route-typed mutator signature. Resolution: cast through `as never` per the established Phase 26 TimePicker precedent (verified at `frontend/src/components/time/TimePicker.tsx:57-61`). The cast is intentional and documented inline in the hook's source. No alternative considered viable for a route-agnostic primitive.

## User Setup Required

None - no external service configuration required.

## Next Plan Readiness

Plan 28-03 (Wave 2 — LAYO-01 per-panel show/hide via PanelHeaderMenu) is ready to spawn. All contracts it consumes are now in place:
- `PANEL_REGISTRY` for enumerating valid panel ids on each route
- `useLayoutState(route).isHidden` + `setHidden` for the menu's toggle action
- `useLayoutState(route).reset` for the per-panel Reset Layout footer item
- `getPanelLabel` for the PanelHeaderMenu's aria-label
- `PanelCard.panelId` + `PanelCard.headerMenu` slot for mounting the menu

Plan 28-04 (Wave 3 — LAYO-02 drag reorder) consumes the same registry + `useLayoutState(route).orderedPanels` + `setOrder`. Plan 28-05 (Wave 4 — LAYO-03 split-pane) consumes `splitSizes` + `setSplit(group, null)` for double-click reset.

The Wave 1 close gate is implicitly green (vitest 728 passed, eslint clean, tsc clean, backend pytest 2/2 PASS, no localStorage writes for layout state anywhere in new code).

## Threat Flags

None — Plan 28-02 introduces no new network endpoints, no new auth paths, no new file access patterns, no new schema changes at trust boundaries. The plan's threat model (T-28-01..04) is satisfied: anchored regex validators return `undefined` on shape mismatch (T-28-01); PANEL_REGISTRY membership filter drops unknown panel ids (T-28-02); regex is non-nested + bounded `\d{1,3}` → no catastrophic backtracking (T-28-03 accepted); reset() uses destructuring-delete preserving non-layout keys with explicit vitest assertion (T-28-04 mitigated).

## TDD Gate Compliance

Plan-level TDD gate is NOT required for this plan (frontmatter `type: execute`, not `type: tdd`). Tasks 1 and 2 use `tdd="true"` at the task level. Per-task RED/GREEN discipline was preserved but bundled into single `feat` commits due to pre-commit hook constraints (see Deviations section above). Each commit message documents both phases of the cycle.

## Self-Check: PASSED

**Files exist:**
- ✓ `frontend/src/lib/layout/panelRegistry.ts` (FOUND)
- ✓ `frontend/src/lib/layout/useLayoutState.ts` (FOUND)
- ✓ `frontend/src/lib/searchSchemas.ts` (MODIFIED — 3 new validators)
- ✓ `frontend/src/lib/__tests__/panelRegistry.test.ts` (24 assertions green)
- ✓ `frontend/src/lib/__tests__/searchSchemas.test.ts` (12 new validator assertions green)
- ✓ `frontend/src/lib/layout/__tests__/useLayoutState.test.ts` (29 assertions green)
- ✓ `frontend/src/components/ui/PanelCard.tsx` (panelId + headerMenu props added)
- ✓ `frontend/src/components/ui/BoundedPanelCard.tsx` (props pass-through)
- ✓ `frontend/src/components/savedviews/SavedViewMenu.tsx` (Reset Layout item added)
- ✓ `frontend/src/components/savedviews/__tests__/SavedViewMenu.test.tsx` (+2 assertions, sonner mock added)

**Commits exist:**
- ✓ `951cc92` Task 1 feat(28-02): add asHiddenPanels/asPanelOrder/asSplitSizes validators + panelRegistry foundation
- ✓ `0b48595` Task 2 feat(28-02): add useLayoutState hook with reset preserving non-layout params
- ✓ `e042402` Task 3 feat(28-02): extend PanelCard.panelId + SavedViewMenu Reset Layout escape hatch

**Verify commands passed:**
- ✓ `cd frontend && pnpm vitest run` → 728 passed + 21 todo (3 skipped), 109 test files
- ✓ `cd frontend && pnpm tsc --noEmit` → no errors
- ✓ `cd frontend && pnpm exec eslint 'src/**/*.{ts,tsx}'` → no violations
- ✓ `cd backend && uv run pytest tests/test_url_contract.py` → 2/2 PASS
- ✓ source-grep `grep -c "PANEL_REGISTRY|isValidPanelId|normalizeRouteId|getPanelLabel" panelRegistry.ts` → 14 (≥4 required)
- ✓ source-grep `grep -c "DropdownMenu.Item" SavedViewMenu.tsx` → 16 (≥3 required, existing items + Reset Layout)
- ✓ No localStorage writes for layout state — verified by absence of `localStorage` mentions in any plan-touched file (only sonner toast + URL navigate)

---
*Phase: 28-layout-customization*
*Completed: 2026-05-16*
