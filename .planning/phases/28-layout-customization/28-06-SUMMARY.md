---
phase: 28-layout-customization
plan: 06
subsystem: testing
tags: [playwright, axe-core, visual-capture, operator-checkpoint, v1.3-milestone-close, poli-09, poli-10, layout-customization]

# Dependency graph
requires:
  - phase: 28-layout-customization
    provides: Plans 28-01..05 — LAYO-01 (PanelHeaderMenu show/hide on 5 routes), LAYO-02 (DraggablePanelWrap 1D reorder on 5 routes), LAYO-03 (ResizablePanelGroup split-pane on /sessions/compare), LAYO-04 (per-panel + SavedViewMenu Reset Layout), foundation primitives (asHiddenPanels/asPanelOrder/asSplitSizes validators + panelRegistry + useLayoutState hook + PanelCard.panelId/headerMenu slots), scaffolding (v13-layout.spec.ts 16-test skeleton + testid registry + url-contract.md Phase 28 effects section)
  - phase: 24-shell-density-containment
    provides: POLI-09 formal per-phase visual checkpoint pattern (.planning/phases/XX/VISUAL-CHECK.md) + POLI-10 axe-core inversion-filter discipline + URL contract pytest contract + ResponsiveContainer count lock (= 8 across 8 panel files)
  - phase: 25-saved-views
    provides: SaveViewDialog auto-capture pipeline — hidden_panels / panel_order / split_sizes ride through state_json verbatim via useRouterState().location.search capture (Pitfall 3 lock — SaveViewDialog UNTOUCHED across all Phase 28 plans)
  - phase: 26-per-route-adoption-i
    provides: PHASE_26_NET_CLASS_MARKERS inversion filter pattern + 30 visual capture PNG matrix scaffolding (3 surfaces × 3 densities × 2 themes pattern) inherited verbatim
  - phase: 27-per-route-adoption-ii
    provides: PHASE_27_NET_CLASS_MARKERS additive inversion + 24-PNG visual capture extension pattern + Plan 27-09 close-gate verification protocol (live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001)
provides:
  - 18 NEW Phase 28 visual capture PNGs (3 surfaces × 3 densities × 2 themes — layout-default / layout-customized / compare-resized × compact/comfortable/cozy × light/dark) — Pitfall 10 cap of 18 honored exactly; cumulative v1.3 PNG total = 138 (36 + 30 + 30 + 24 + 18)
  - 7 NEW Phase 28 close-gate axe scans (5 layout-customized URL variants on /, /activity, /cost, /skills, /alerts + 1 split-pane resized /sessions/compare + 1 drag-grip aria attribute contract scan)
  - 28-VISUAL-CHECK.md with all 9 required sections per RESEARCH.md §8 + operator-signed PASS verdict
  - v1.3 Surface Redesign milestone closed — 5/5 phases complete, 45/45 active requirements satisfied
affects: [v1.4-future-milestone-planning, future-layout-customization-extensions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "18-PNG Phase-close visual capture matrix — 3 surfaces × 3 densities × 2 themes (Pitfall 10 cap honored)"
    - "Operator-signed verdict at section 9 of VISUAL-CHECK.md as canonical phase-close gate per POLI-09 — established by Phase 24 plan 07, replicated by Phases 25/26/27/28 close-gate plans verbatim"
    - "Atomic close commit pattern — bundle SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md + VISUAL-CHECK.md in ONE docs() commit (no --no-verify; pre-commit hooks pass clean because no source edits)"

key-files:
  created:
    - .planning/phases/28-layout-customization/28-VISUAL-CHECK.md
    - .planning/phases/28-layout-customization/28-06-SUMMARY.md
  modified:
    - frontend/tests/e2e/v13-visual-capture.spec.ts
    - frontend/tests/e2e/v13-a11y.spec.ts
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "18 NEW PNGs is the Pitfall 10 cap — not 12 (env-skip-adjusted) — because the dev DB had 2 valid sessions for compare-resized cells; all 18 cells generated successfully. Cumulative v1.3 visual capture matrix lands at 138 PNGs exactly."
  - "Portal containment stays 7/7 PASS (not 8/8 as Plan 06 frontmatter anticipated) — PanelHeaderMenu's Radix DropdownMenu portal landing transitively reuses the existing cmc-dropdown class family covered by Plan 24/25's portal-containment fixtures. Documented as Accepted Exception #4 in 28-VISUAL-CHECK.md; operator acknowledged."
  - "Zero close-gate Rule-1 self-heals discovered during the live walkthrough — unlike Phase 26 e838135 (TIME-04 click hit-test patch) and Phase 27 d76a95b (SkillLatencySnapshot success-state cmc-card--bounded). Phase 28's 5-implementation-plan cascade landed clean enough that the operator walkthrough surfaced no NEW regressions. Accepted Exception #7 placeholder remains intentionally N/A."
  - "Operator-signed verdict 2026-05-17 PASS via live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001 — same protocol as Phase 24/25/26/27 close gates."
  - "v1.3 Surface Redesign milestone closes 5/5 phases — 45/45 active requirements satisfied; CONT-01..05 + SHEL-01..06 + DENS-01..03 + VIEW-01..09 + TIME-01..05 + LAYO-01..04 + CMDK-01..04 + POLI-09..14 + TDBT-01..03 all complete."

patterns-established:
  - "v1.3 milestone close: atomic close commit bundles SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md + VISUAL-CHECK.md in a SINGLE docs() commit (no source edits → pre-commit hooks pass clean → no --no-verify). Forkable verbatim for v1.4."
  - "5-implementation-plan cascade (Plans 28-01 scaffolding → 28-02 primitives → 28-03 LAYO-01 + LAYO-04 per-panel → 28-04 LAYO-02 → 28-05 LAYO-03) followed by a single close-gate plan (28-06) producing the 18-PNG matrix + 7 a11y scans + operator-signed VISUAL-CHECK.md is the canonical pattern for any future single-feature-domain phase (locked since Phase 24-27 followed the same 1-N implementation + 1 close-gate split)."

# Metrics
metrics:
  duration: "~3h (Tasks 1-3 prior agent ~1.5h + operator walkthrough ~1h + close commit ~0.5h)"
  completed: "2026-05-17"
  tasks_completed: "4 of 4 (Tasks 1-3 prior agent commits + Task 4 operator-verdict checkpoint cleared 2026-05-17)"
  visual_capture_pngs: "18 (Pitfall 10 cap honored exactly; cumulative v1.3 = 138)"
  axe_close_gate_scans: "7 (5 layout-customized URL variants + 1 close-gate split-pane + 1 drag-grip aria) — all PASS Phase-28-attributable check"
  backend_pytest: "690/0/0 (= Phase 27 close baseline — zero backend changes in Phase 28; expected)"
  frontend_vitest: "754/0/0 (+92 vs Phase 27 close 662 — across Plans 28-02..05)"
  playwright_total: "320 tests / 19 files (+77 net vs Phase 27 close ~243)"
  playwright_layout_spec: "15 pass + 1 skip (Plan 28-02 SavedViewMenu Reset Layout chrome out of scope)"
  url_contract_pytest: "2/2 PASS (Pitfall 13 lock honored — Phase 28 search-param extensions APPEND-ONLY)"
  portal_containment: "7/7 PASS (Accepted Exception #4 — PanelHeaderMenu reuses cmc-dropdown fixtures)"
  bundle_delta: "+10.4 KB gzipped on SessionCompareView chunk (Plan 28-05 measured; ≤15 KB budget honored)"
  responsivecontainer_count: "8 (Phase 24/26/27 lock preserved — Phase 28 added zero charts)"
---

# Phase 28 Plan 06: v1.3 Milestone Close Gate Summary

**Operator-signed verdict PASS closes Phase 28 + v1.3 Surface Redesign milestone — 18 NEW visual capture PNGs (Pitfall 10 cap honored; cumulative v1.3 = 138) + 7 NEW close-gate axe scans + 28-VISUAL-CHECK.md with all 9 required sections per RESEARCH.md §8 ship clean; v1.3 closes 5/5 phases + 45/45 active requirements.**

## Performance

- **Duration:** ~3h end-to-end (Tasks 1-3 prior agent ~1.5h + operator live walkthrough ~1h + atomic close commit ~0.5h)
- **Started:** 2026-05-17 (Task 1 — visual capture PNG generation)
- **Completed:** 2026-05-17 (atomic close commit landing)
- **Tasks:** 4 of 4 (Tasks 1-3 implementation + Task 4 operator-verdict checkpoint cleared)
- **Files modified:** 5 (28-VISUAL-CHECK.md + 28-06-SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md — close commit only; Tasks 1-3 modified frontend/tests/e2e/v13-visual-capture.spec.ts + frontend/tests/e2e/v13-a11y.spec.ts in prior commits)

## Accomplishments

- **18 NEW Phase 28 visual capture PNGs** generated under `.planning/phases/28-layout-customization/visual-check/` covering 3 surfaces (layout-default / layout-customized / compare-resized) × 3 densities (compact / comfortable / cozy) × 2 themes (light / dark) — Pitfall 10 cap honored exactly. Cumulative v1.3 visual capture matrix lands at **138 PNGs** (36 Phase 24 + 30 Phase 25 + 30 Phase 26 + 24 Phase 27 + 18 Phase 28).
- **7 NEW Phase 28 close-gate axe scans** appended to `v13-a11y.spec.ts` covering 5 layout-customized URL variants (one per in-scope route) + 1 split-pane resized `/sessions/compare?split_sizes=compare:70,30` + 1 drag-grip aria attribute contract scan; all PASS the PHASE_28_NET_CLASS_MARKERS inversion check established by Plan 28-04.
- **28-VISUAL-CHECK.md authored with all 9 required sections per RESEARCH.md §8** — (1) front matter, (2) capture commands, (3) captured PNGs directory + count, (4) ROADMAP SC mapping (5 rows SC#1..SC#5), (5) REQ-ID closure (4 rows LAYO-01..04), (6) automated evidence summary (10-metric table), (7) visual capture verdict (18 rows), (8) Accepted Exceptions (7 entries), (9) operator-signed PASS verdict line.
- **Operator verdict PASS signed 2026-05-17** by Patryk Golabek via live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001 — same protocol as Phase 24/25/26/27 close gates. All 18 PNGs marked PASS, all 16 interactive LAYO-01..04 steps verified end-to-end including round-trip via saved view.
- **v1.3 Surface Redesign milestone closed** — 5/5 phases complete (24 + 25 + 26 + 27 + 28); 45/45 active requirements satisfied (CONT-01..05 + SHEL-01..06 + DENS-01..03 + VIEW-01..09 + TIME-01..05 + LAYO-01..04 + CMDK-01..04 + POLI-09..14 + TDBT-01..03); single agreed runtime dep this milestone (`react-resizable-panels@4.11.0` at exact pin); APPEND-ONLY URL contract preserved across all v1.3 phases (Pitfall 13 lock honored).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend v13-visual-capture.spec.ts with 18 Phase 28 PNGs** — `3224b73` (test)
2. **Task 2: Extend v13-a11y.spec.ts with 7 Phase 28 close-gate scans** — `d29dda9` (test)
3. **Task 3: Author 28-VISUAL-CHECK.md with all 9 close-gate sections** — `2369850` (docs)
4. **Task 4: Operator live walkthrough + verdict signing** — operator checkpoint cleared 2026-05-17 (verdict PASS signed in section 9 of 28-VISUAL-CHECK.md; bundled into the atomic close commit below)

**Plan metadata + close-gate atomic commit:** bundles 28-06-SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md + 28-VISUAL-CHECK.md (operator-signed) in a SINGLE `docs(28-06): complete Phase 28 close gate — operator verdict PASS` commit. No `--no-verify`; pre-commit hooks pass clean because no source edits in this commit.

## Files Created/Modified

**Created (close-commit):**
- `.planning/phases/28-layout-customization/28-VISUAL-CHECK.md` — 9-section close-gate document with operator-signed PASS verdict (Tasks 3 + 4)
- `.planning/phases/28-layout-customization/28-06-SUMMARY.md` — this file (close-commit)

**Modified (Tasks 1-2 prior commits):**
- `frontend/tests/e2e/v13-visual-capture.spec.ts` — extended with 18 NEW Phase 28 PNG-generating tests in commit `3224b73`
- `frontend/tests/e2e/v13-a11y.spec.ts` — extended with 7 NEW Phase 28 close-gate axe scans in commit `d29dda9`

**Modified (close-commit):**
- `.planning/STATE.md` — Phase 28 close: status → phase_complete; completed_phases 4 → 5; completed_plans 42 → 43; LAYO-01..04 satisfied; v1.3 milestone 4/5 → 5/5 (100%)
- `.planning/ROADMAP.md` — Phase 28 row marked [x] 6/6 Complete 2026-05-17; v1.3 milestone marked SHIPPED 2026-05-17
- `.planning/REQUIREMENTS.md` — LAYO-01..04 traceability table rows updated (already Complete from Plans 02-05 — close-gate adds the milestone roll-up); progress block updated 41/45 → 45/45 (96% → 100%)

## Automated Gate Results

All Phase 27 close-gate baselines preserved + Phase 28 deltas measured:

| Gate | Phase 27 close baseline | Phase 28 close measured | Delta | Status |
|------|-------------------------|-------------------------|-------|--------|
| Backend pytest | 690 / 0 / 0 | 690 / 0 / 0 | 0 | PASS (zero backend changes in Phase 28 — expected) |
| Frontend vitest | 662 / 0 / 0 | 754 / 0 / 0 | +92 | PASS (across Plans 28-02..05; Plan 28-06 e2e-only) |
| Playwright e2e | ~243 tests (Phase 27 close) | 320 tests in 19 files | +77 net | PASS (Plan 28-01 +16 LAYO scaffolds + Plan 28-04/05 default-state scans + Plan 28-06 close-gate +18 visual capture + +7 a11y) |
| Playwright v13-layout.spec.ts | n/a (NEW Phase 28) | 15 pass + 1 skip | +16 | PASS (1 skip = SavedViewMenu Reset Layout chrome out of scope per Plan 28-02) |
| Playwright Phase 28 visual capture | n/a | 18 / 18 PASS | +18 | PASS (Pitfall 10 cap honored exactly) |
| Playwright Phase 28 a11y close-gate | n/a | 7 / 7 PASS | +7 | PASS (5 layout-customized routes + 1 split-pane + 1 drag-grip aria) |
| Portal containment | 7 / 7 PASS | 7 / 7 PASS | 0 | PASS (Accepted Exception #4 — PanelHeaderMenu reuses cmc-dropdown fixtures) |
| URL contract pytest | 2 / 2 PASS | 2 / 2 PASS | 0 | PASS (Phase 28 search-param extensions APPEND-ONLY per Pitfall 13) |
| Vite build | clean | clean (built in 369ms) | — | PASS (SessionCompareView chunk +10.4 KB gzipped over Phase 27 baseline; ≤15 KB budget honored) |
| ResponsiveContainer count | 8 across 8 panel files | 8 across 8 panel files | 0 | PASS (Phase 24/26/27 lock preserved — Phase 28 added zero charts) |
| Frontend tsc --noEmit | clean | clean | — | PASS |
| Frontend eslint --max-warnings 0 | clean | clean | — | PASS |

**Visual capture matrix:** 120 (Phase 27 close) → 138 (Phase 28 close) = +18 NEW (Pitfall 10 cap honored exactly).

## Decisions Made

- **18 NEW PNGs at the Pitfall 10 cap** — not env-skip-adjusted to 12 because the dev DB had 2 valid sessions for the compare-resized cells; all 18 generated successfully. Cumulative v1.3 visual capture matrix lands at 138 PNGs exactly per the close-gate budget.
- **Portal containment stays 7/7 PASS** (not 8/8 as Plan 06 frontmatter anticipated) — PanelHeaderMenu's Radix DropdownMenu portal landing transitively reuses the existing cmc-dropdown class family covered by Plan 24/25's portal-containment fixtures. Documented as Accepted Exception #4 in 28-VISUAL-CHECK.md; operator acknowledged.
- **Zero close-gate Rule-1 self-heals** discovered during the live walkthrough — unlike Phase 26 e838135 (TIME-04 click hit-test patch) and Phase 27 d76a95b (SkillLatencySnapshot success-state cmc-card--bounded). Phase 28's 5-implementation-plan cascade (Plans 02 + 03 + 04 + 05 carrying their own Rule-1 self-heals during their RED+GREEN landing) absorbed every defect before the close gate, so the operator walkthrough surfaced no NEW regressions. Accepted Exception #7 placeholder remains N/A.
- **Operator verdict PASS** signed 2026-05-17 by Patryk Golabek via live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001 — same protocol as Phase 24/25/26/27 close gates. All 18 visual capture PNGs marked PASS, all 16 interactive LAYO-01..04 steps verified end-to-end including round-trip via saved view.
- **v1.3 Surface Redesign milestone closes 5/5 phases** — 45/45 active requirements satisfied. Single new runtime dep this milestone: `react-resizable-panels@4.11.0` at exact pin (Plan 28-05). All other 44 requirements landed via the existing Phase 24 baseline (`@radix-ui/react-popover@1.1.15` + `@radix-ui/react-dropdown-menu@2.1.16`) + Phase 25 Alembic migration (`0004_saved_views`) + zero Python deps added across the full milestone.

## Deviations from Plan

**None for Plan 28-06 close-gate execution** — Tasks 1-3 landed clean in the prior agent's commits (`3224b73`, `d29dda9`, `2369850`); the operator-verdict checkpoint (Task 4) cleared PASS without surfacing any verification-discovered fixes; this close-commit bundles the 5 metadata artifacts atomically with no source edits.

### Pre-positioned Accepted Exceptions (operator-acknowledged 2026-05-17)

The 7 Accepted Exceptions documented in section 8 of 28-VISUAL-CHECK.md are pre-positioned (not deviations during execution) and operator-acknowledged at close:

1. **`/skills/$name` show/hide deferred to v1.4** — single-column-stack route out of `PANEL_REGISTRY` (RESEARCH §5 A3 + Pitfall 12).
2. **LAYO-05 (full 2D grid via `react-grid-layout`) deferred to v1.4+** — blocked by GitHub Issue #2045 (React 19.2 key-prop warnings); show/hide + 1D reorder + split-pane cover the v1.3 success criteria.
3. **CMPR-10 (3+ way compare) OUT OF SCOPE for v1.3** — no reference product ships >2-way; documented in REQUIREMENTS.md v1.4+ Future Requirements.
4. **Portal containment stays 7/7 PASS** — PanelHeaderMenu Radix DropdownMenu portal landing transitively covered by existing cmc-dropdown class fixtures from Plans 24/25.
5. **6 Plan 28-05 Rule-1 deviations carried over** — v4 Layout shape `{[panelId]: number}` not `number[]`; Separator data-testid override via `id` prop; Panel sizes as STRINGS `'50%'` not numeric `50`; data-panel boolean marker switched to `#side-a` id selector; URL-encoded `%3A`/`%2C` regex acceptance; eslint-disable for mock-internal `rrp-*` testids.
6. **3 Plan 28-04 Rule-1 deviations carried over** — data-panel-id collision (wrapper attribute renamed to data-drag-wrap-id); display: contents grid collision (switched to position: relative + absolute grip overlay); `/alerts` registry vocabulary fix (alert-events-list `'main'` → `'below'`).
7. **Verification-discovered fix placeholder** — N/A this phase (no Rule-1 self-heals surfaced during the operator walkthrough).

**Total deviations:** 0 plan-execution deviations; 9 carry-over Rule-1 deviations from Plans 28-04/05 already documented in their respective SUMMARYs.
**Impact on plan:** None — Plan 28-06 executed exactly as written; close-gate cascade clean.

## Issues Encountered

None. The 5-implementation-plan cascade (Plans 28-01 → 28-05) absorbed every defect before the close gate, so the operator's live walkthrough produced PASS on the first run without any verification-discovered Rule-1 self-heals (contrast with Phase 26's `e838135` and Phase 27's `d76a95b`, both of which surfaced during the live walkthrough and were folded into the close-gate commit cascade).

## User Setup Required

None — no external service configuration required for Phase 28.

## Next Phase Readiness

**v1.3 Surface Redesign milestone is closed.** v1.4 planning may now spawn.

Backlog reference for v1.4 candidates carried over from v1.3:

- **LAYO-05** — full 2D drag-resize grid via `react-grid-layout`; unblock when React 19.2 key-prop Issue #2045 resolves AND show/hide + 1D reorder + split-pane prove insufficient.
- **CMPR-10** — 3+ way compare; unblock only if a user names a concrete triangulation workflow (currently no reference product ships >2-way).
- **Pitfall 7 rebalance window for v1.2-baseline contrast carry-overs** — 8 contrast classes accepted-exception-deferred since Phase 24; v1.4 is the candidate window for a coordinated `--cmc-text-subtle` rebalance.
- **`/skills/$name` show/hide** — defer until the route grows multi-column.
- **SKLP-11..13 / ANLY-08..09 / ALRT-15..16 / CMPR-08..09 / PLAT-01 / AUTO-01..03** — full v1.4+ backlog list lives in REQUIREMENTS.md.

## Self-Check: PASSED

**Created files verified:**
- `.planning/phases/28-layout-customization/28-VISUAL-CHECK.md` — FOUND
- `.planning/phases/28-layout-customization/28-06-SUMMARY.md` — FOUND (this file)

**Commits verified:**
- `3224b73` — FOUND (test: 18 Phase 28 PNGs)
- `d29dda9` — FOUND (test: 7 Phase 28 close-gate scans)
- `2369850` — FOUND (docs: 28-VISUAL-CHECK.md authored)

**Visual capture PNG count verified:**
- `ls .planning/phases/28-layout-customization/visual-check/*.png | wc -l` → 18 (Pitfall 10 cap honored exactly)

**Operator verdict line verified:**
- Section 9 of 28-VISUAL-CHECK.md contains: `**Operator verdict:** PASS — signed 2026-05-17 by Patryk Golabek via live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001.`

---
*Phase: 28-layout-customization*
*Completed: 2026-05-17*
