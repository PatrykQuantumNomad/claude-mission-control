---
phase: 28-layout-customization
plan: 01
subsystem: testing
tags: [vitest, playwright, eslint-rule, url-contract, testid-registry, panel-registry, layout-customization]

# Dependency graph
requires:
  - phase: 24-shell-primitives
    provides: POLI-13 url-contract pytest gate + POLI-14 testid-registry eslint rule
  - phase: 25-saved-views
    provides: SCHEMA_VERSION + DefaultViewLoader bare-URL gate (Pitfall 2 anchor)
  - phase: 26-time-picker
    provides: asTimeToken / asComparePanels validator pattern (mirrored for Phase 28 layout validators)
  - phase: 27-per-route-adoption
    provides: useRouteRangeVocab read-site fallback pattern (mirrored for Phase 28 panel-id read-site filter)
provides:
  - 5 vitest skeleton files + 1 extended vitest file (52 it.todo placeholders enumerate every Wave 1-3 assertion downstream plans must implement)
  - 1 Playwright spec skeleton with 16 test.skip placeholders mapped 1:1 to LAYO-01..04 + saved-view round-trip + ResponsiveContainer perf gate
  - docs/url-contract.md Phase 28 effects section + Locked invariants subsection (3 new APPEND-ONLY search params: hidden_panels / panel_order / split_sizes; Pitfall 2 default-undefined contract; Pitfall 9 panel-id append-only invariant; Pitfall 11 reset semantics; Pitfall 12 /skills/$name out-of-scope rationale)
  - docs/testid-registry.md Phase 28 section: 5 dynamic testid families + 1 exact-match testid (panel-header-menu-{panelId}, panel-hide-{panelId}, panel-drag-grip-{panelId}, panel-reset-layout-{route}, resize-handle-{groupId}, panel-grid-{columnId})
affects: [28-02-saved-view-reset-chrome, 28-03-hide-and-reset-menu, 28-04-reorder, 28-05-split-pane, 28-06-close-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 skeleton-green test files: every downstream Wave 1-3 task lands assertions in pre-existing files instead of creating new ones (Nyquist-rule gate)"
    - "it.todo / test.skip placeholders enumerate the full assertion surface at Wave 0 commit time without importing source modules that do not yet exist"
    - "URL-contract APPEND-ONLY pattern extended to 3 new layout search params with the same default-undefined contract as Phase 26/27 (Pitfall 2 — DefaultViewLoader bare-URL gate)"
    - "Testid-registry append-only registration before source mounts (Wave 0 docs registration unlocks Wave 2/3 source commits without ESLint blocking)"

key-files:
  created:
    - frontend/src/lib/layout/__tests__/useLayoutState.test.ts
    - frontend/src/lib/__tests__/panelRegistry.test.ts
    - frontend/src/components/ui/__tests__/PanelHeaderMenu.test.tsx
    - frontend/src/components/ui/__tests__/DraggablePanelWrap.test.tsx
    - frontend/src/components/ui/__tests__/ResizablePanelGroup.test.tsx
    - frontend/tests/e2e/v13-layout.spec.ts
  modified:
    - frontend/src/lib/__tests__/searchSchemas.test.ts
    - docs/url-contract.md
    - docs/testid-registry.md

key-decisions:
  - "Skeleton tests stay green via it.todo (vitest) and test.skip (Playwright); NO source modules imported pre-implementation — Wave 1-3 executors flip placeholders into real assertions"
  - "16 Playwright test.skip placeholders authored (exceeds plan threshold of ≥15) — full coverage of LAYO-01 (5 routes × hide-and-persist) + LAYO-02 (4 reorder cases) + LAYO-03 (3 split-pane) + LAYO-04 (2 reset) + 1 saved-view round-trip + 1 ResponsiveContainer perf gate"
  - "URL-contract per-route table appends Phase 28 tags rather than rewriting existing cells (POLI-13 append-only invariant preserved; test_url_contract.py 2/2 PASS maintained)"
  - "Testid-registry Phase 28 section documents that panel-reset-layout-{route} is mounted in BOTH PanelHeaderMenu (per-panel; Plan 28-03) AND SavedViewMenu chrome (escape hatch; Plan 28-02) — the registry is the single source of truth for the mount-site duality before either site exists in source"
  - "panel-grid-{columnId} registered as a dynamic-pattern testid despite the section heading 'Phase 28 exact-match testids' — clarified inline in the registry that the columnId vocabulary is route-defined and the eslint rule's template-literal normalization covers it"

patterns-established:
  - "Wave 0 scaffolding plan: ship test skeletons + doc extensions before any source lands, so downstream waves have known landing sites for assertions and pre-registered testids that ESLint accepts"
  - "Validator-undefined-default + read-site-fallback contract extended to layout params (matches Phase 26 time_from/time_to + Phase 27 compare_panels pattern)"
  - "Panel-id append-only vocabulary documented as a locked invariant alongside the existing route-rename / search-param-rename invariants (POLI-13 scope expansion)"

requirements-completed: []  # No requirements satisfied — Wave 0 scaffolding only. LAYO-01..04 land across Plans 28-02..28-05.

# Metrics
duration: ~10min
completed: 2026-05-16
---

# Phase 28 Plan 01: Wave 0 Scaffolding — Test Skeletons + Doc Extensions Summary

**6 vitest/Playwright test skeletons + docs/url-contract.md Phase 28 effects section + docs/testid-registry.md 5 dynamic + 1 exact testid families registered — every Wave 1-3 plan can extend these files without creating them.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-16T12:15:00Z
- **Completed:** 2026-05-16T12:25:24Z
- **Tasks:** 3 (all `type="auto"`, all autonomous)
- **Files modified:** 9 (6 created + 3 modified)

## Accomplishments

- 6 vitest skeleton files + 1 Playwright spec skeleton authored — 52 `it.todo` placeholders + 16 `test.skip` placeholders enumerate every assertion Wave 1-3 plans must implement
- docs/url-contract.md extended with Phase 28 effects section + Locked invariants subsection — 3 new APPEND-ONLY search params (`hidden_panels`, `panel_order`, `split_sizes`) registered with Pitfall 2 default-undefined contract; per-route table rows appended for all 5 in-scope routes + `/sessions/compare`; `/skills/$name` out-of-scope rationale documented (Pitfall 12)
- docs/testid-registry.md extended with Phase 28 section — 5 dynamic testid families (`panel-header-menu-{panelId}`, `panel-hide-{panelId}`, `panel-drag-grip-{panelId}`, `panel-reset-layout-{route}`, `resize-handle-{groupId}`) + 1 exact-match testid family (`panel-grid-{columnId}`) registered before any source mounts them
- All Phase 27 close-gate baselines preserved: backend `tests/test_url_contract.py` 2/2 PASS; frontend `pnpm test --run` 662 passed + 52 new todo; ESLint `cmc/testid-registry-only` rule clean across `src/**/*.{ts,tsx}`

## Task Commits

Each task was committed atomically (single-repo; no sub_repos configured):

1. **Task 1: Author vitest skeletons + Playwright spec skeleton** — `7ab32a7` (test)
2. **Task 2: Extend docs/url-contract.md with Phase 28 effects section** — `8442e16` (docs)
3. **Task 3: Extend docs/testid-registry.md with Phase 28 testid families** — `26e19d3` (docs)

**Plan metadata commit:** pending (this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md bundled atomically)

## Files Created/Modified

**Created:**
- `frontend/src/lib/layout/__tests__/useLayoutState.test.ts` — 47 lines; 11 `it.todo` placeholders covering `isHidden` / `orderedPanels` / `splitSizes` / `reset` + LAYO-04 SC#3 preservation guard (Pitfall 11) + Pitfall 7 unknown-id filter
- `frontend/src/lib/__tests__/panelRegistry.test.ts` — 35 lines; 10 `it.todo` placeholders covering `isValidPanelId(route, panelId)` + per-route registry shape lock for all 6 in-scope routes + Pitfall 9 lowercase-ASCII vocabulary guard
- `frontend/src/components/ui/__tests__/PanelHeaderMenu.test.tsx` — 27 lines; 5 `it.todo` placeholders covering menu trigger render / open / hide / reset / Pitfall 11 preservation
- `frontend/src/components/ui/__tests__/DraggablePanelWrap.test.tsx` — 31 lines; 9 `it.todo` placeholders covering HTML5 mouse drag + keyboard grab-mode + testid contract
- `frontend/src/components/ui/__tests__/ResizablePanelGroup.test.tsx` — 32 lines; 8 `it.todo` placeholders covering URL round-trip + double-click reset + Pitfall 1 (onLayoutChanged vs onLayoutChange) + a11y / perf
- `frontend/tests/e2e/v13-layout.spec.ts` — 201 lines; 16 `test.skip` placeholders across 6 `test.describe` blocks (LAYO-01 hide-and-persist × 5 routes; LAYO-02 reorder × 4; LAYO-03 split-pane × 3; LAYO-04 reset × 2; saved-view round-trip × 1; ResponsiveContainer perf gate × 1)

**Modified:**
- `frontend/src/lib/__tests__/searchSchemas.test.ts` — appended `describe('Phase 28 layout validators', ...)` block with 3 child describes (`asHiddenPanels` / `asPanelOrder` / `asSplitSizes`) × 3 `it.todo` each = 9 new placeholders. Existing Phase 25/26/27 tests untouched.
- `docs/url-contract.md` — per-route table rows appended for `/`, `/activity`, `/cost`, `/skills`, `/alerts`, `/sessions/compare`, `/skills/$name`; new "## Phase 28 effects on URL contract" section; new "## Locked invariants (Phase 28)" subsection
- `docs/testid-registry.md` — new "## Phase 28 — Layout Customization" section with 5 dynamic + 1 exact-match testid bullets + locked dynamic-vs-exact note + Wave-0 verification-scope caveat

## Decisions Made

- **All `it.todo` / `test.skip`; zero source imports at Wave 0.** Skeleton files MUST be green at commit time so `pnpm test --run` continues to pass — Wave 1 will fail-fast if a downstream executor accidentally lands an import for a module that does not yet exist. The verification commands in Plan 28-01 are meaningful as written because the test runner accepts `it.todo` as green and Playwright's `--list` mode does not execute test bodies.
- **`panel-reset-layout-{route}` mounted in TWO sites.** The testid-registry bullet explicitly documents the dual mount (PanelHeaderMenu per-panel + SavedViewMenu chrome). This was promoted from a Plan 28-02 / Plan 28-03 implementation detail into a registry-level contract so downstream waves cannot lose the escape-hatch (RESEARCH §7 A2: needed when all panels on a route are hidden).
- **`panel-grid-{columnId}` registered as a dynamic testid despite the "exact-match" heading.** Clarified inline in the registry — the columnId vocabulary is route-defined (lowercase ASCII per panelRegistry conventions) so the ESLint rule's template-literal normalization covers it. Avoids forcing Wave 2 (Plan 28-04) to register every route's column slugs individually.
- **`/skills/$name` out-of-scope rationale documented in BOTH the per-route table AND the Phase 28 effects section.** Per-route table cell says "Phase 28 OUT OF SCOPE — see Phase 28 effects below"; effects section gives the full rationale (single-column stack; no grid; no meaningful split-pane). Double-documentation is intentional — the table is the first place a future-phase planner looks.

## Deviations from Plan

None — plan executed exactly as written. All three tasks ran in sequence; all verify commands passed first try; no Rule 1-4 deviations triggered.

The Plan 28-01 `<files>` frontmatter listed 9 files; this Wave 0 plan delivered all 9 with their intended green-skeleton shape. The Playwright spec lists 16 tests (exceeds the plan's `≥15` threshold). The vitest suite grew from 662 → 662 passed + 52 todo (zero regressions; net additive).

## Issues Encountered

None.

## User Setup Required

None — Wave 0 is docs + test scaffolding only. No external services, no env vars, no new runtime dependencies.

## Next Phase Readiness

- **Wave 1 (Plan 28-02 — SavedViewMenu reset chrome) ready to spawn.** Depends on this plan's `panel-reset-layout-{route}` testid registration + the Phase 28 effects section documenting reset semantics. The Playwright `test.skip` placeholder at `v13-layout.spec.ts:154:10` ("SavedViewMenu Reset Layout chrome clears the same three keys and preserves time/compare") is the e2e landing site.
- **Wave 1 (Plan 28-02 — panelRegistry + useLayoutState + searchSchemas validators) ready to spawn.** Three vitest landing sites pre-authored: `panelRegistry.test.ts` / `useLayoutState.test.ts` / `searchSchemas.test.ts` (new `describe` block). Plan 28-02 task list will flip the relevant `it.todo` → real assertions.
- **Wave 2 (Plans 28-03 hide + 28-04 reorder) ready to spawn.** Five testid families registered; `PanelHeaderMenu.test.tsx` + `DraggablePanelWrap.test.tsx` skeletons ready to extend.
- **Wave 3 (Plan 28-05 split-pane) ready to spawn.** `resize-handle-{groupId}` testid registered; `ResizablePanelGroup.test.tsx` skeleton + Pitfall 1 (onLayoutChanged vs onLayoutChange) regression net pre-authored.

No blockers. No concerns.

## Self-Check: PASSED

- `frontend/src/lib/layout/__tests__/useLayoutState.test.ts` — FOUND
- `frontend/src/lib/__tests__/panelRegistry.test.ts` — FOUND
- `frontend/src/components/ui/__tests__/PanelHeaderMenu.test.tsx` — FOUND
- `frontend/src/components/ui/__tests__/DraggablePanelWrap.test.tsx` — FOUND
- `frontend/src/components/ui/__tests__/ResizablePanelGroup.test.tsx` — FOUND
- `frontend/tests/e2e/v13-layout.spec.ts` — FOUND
- Commit `7ab32a7` (Task 1) — FOUND in `git log --all`
- Commit `8442e16` (Task 2) — FOUND in `git log --all`
- Commit `26e19d3` (Task 3) — FOUND in `git log --all`

---

*Phase: 28-layout-customization*
*Completed: 2026-05-16*
