---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Surface Redesign
status: milestone_shipped
last_updated: "2026-05-17T18:00:00Z"
last_activity: 2026-05-17 — v1.3 Surface Redesign milestone SHIPPED (5/5 phases, 42 plans, 45/45 active requirements satisfied). Git tag v1.3 created. Archives written to .planning/milestones/v1.3-{ROADMAP,REQUIREMENTS,MILESTONE-AUDIT,INTEGRATION-REPORT}.md. PROJECT.md fully evolved (v1.3 requirements moved to Validated; v1.3 locked invariants added to Out of Scope; 16 new Key Decisions); ROADMAP.md collapsed v1.3 phases into <details> block; REQUIREMENTS.md deleted (fresh one for v1.4 milestone). Ready for /gsd:new-milestone.
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 42
  completed_plans: 42
  percent: 100
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-17 after v1.3 milestone shipped)

**Core value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, what each skill costs and how often it fails, queue and approve tasks, compare two sessions side-by-side, get paged when metrics breach thresholds, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

**Current focus:** Planning next milestone (v1.4 — TBD). Define via `/gsd:new-milestone`.

## Current Position

Phase: None — milestone v1.3 closed; awaiting v1.4 milestone definition
Plan: Not started
Status: `milestone_shipped` — ready to plan next milestone
Last activity: 2026-05-17 — v1.3 Surface Redesign milestone complete (5/5 phases, 42 plans, 45/45 active requirements satisfied, git tag `v1.3` created)

Progress (v1.3 milestone): [██████████] 100% (5/5 phases complete — Phases 24+25+26+27+28 all closed; v1.3 Surface Redesign milestone SHIPPED 2026-05-17 with 45/45 active requirements satisfied)

## v1.3 Close Evidence Summary

**Git range:** `faaa23e` (v1.2 ship) → `1614f4d` (Phase 28-06 operator verdict PASS)
**Tag:** `v1.3`
**Timeline:** 2026-05-09 → 2026-05-17 (8 days)
**Phases:** 24 / 25 / 26 / 27 / 28 (all closed with operator verdict PASS)
**Plans:** 7 + 11 + 9 + 9 + 6 = 42 plans
**Requirements:** 45 / 45 active satisfied (100%) — see `milestones/v1.3-REQUIREMENTS.md`

**Test suites at ship:**

- Backend pytest: 690 / 0 / 0 (vs v1.2 baseline 661; +29)
- Frontend vitest: 754 / 0 / 0 (vs v1.2 baseline 326; +428)
- Playwright e2e: 320 tests in 19 spec files (vs v1.2 baseline 13 specs)
- Lighthouse CWV: 9 / 9 PASS at median (LCP 559-586ms, CLS 0-0.003, performance 1.0)
- axe: 0 phase-attributable violations across 13 close-gate scans
- Portal containment: 7 / 7 PASS
- URL contract pytest: 2 / 2 PASS at every phase close (Pitfall 13 lock)
- Visual capture matrix: 138 PNGs total across 5 phase close gates (36 + 30 + 30 + 24 + 18)
- ResponsiveContainer count: 8 (Phase 26 consolidation; held across Phases 27 + 28)

**Dependencies added (6 frontend at exact pins, 0 Python, 1 Alembic migration):**

- `@radix-ui/react-popover@1.1.15` (Phase 24)
- `@radix-ui/react-dropdown-menu@2.1.16` (Phase 24)
- `sonner@2.0.7` (Phase 26)
- `react-day-picker@10.0.0` (Phase 26)
- `date-fns@4.1.0` (Phase 26)
- `react-resizable-panels@4.11.0` (Phase 28; blocking-human npmjs.com legitimacy gate)
- Alembic migration `0004_saved_views` (Phase 25; auto-applies on next `cmc start` via lifespan)

**Files / lines:** 994 files changed vs v1.2; +177,800 / -7,268 lines; ~87,531 LOC at close (~41,187 Python + ~46,344 TypeScript/TSX)
**Commits:** 184 total (69 feat / 71 docs / 26 test / 10 fix / 1 chore)

**Audit:** `milestones/v1.3-MILESTONE-AUDIT.md` (status: passed; 45/45 requirements; 5/5 phases; 6/7 integration wiring claims (1 documentation WARNING, no functional break); 4/5 E2E flows + 1 documented Accepted Exception (TIME-04 DeltaPill column deferred to v1.4+))
**Integration report:** `milestones/v1.3-INTEGRATION-REPORT.md`

## Accumulated Context

**Decisions log:** Full v1.3 decision history (16 new entries) lives in `.planning/PROJECT.md` Key Decisions table. Highlights:

- APPEND-ONLY `validateSearch` enforced by `tests/test_url_contract.py` + `docs/url-contract.md` bidirectional gate (Pitfall 13)
- Density tokens scoped to `:root` (Radix Portal cascade requirement)
- `DensityProvider` intentionally NOT a React Context (POLI-11 zero-rerender architectural backing)
- All Sheet/Popover/DropdownMenu content goes through Radix Portal
- `BoundedPanelCard` opt-in via `bounded` prop (backward-compatible)
- Saved view `state_json` opaque to backend (schema validation in `validateSearch` on read)
- `SaveViewDialog` UNTOUCHED across Phase 28 per Pitfall 3 lock (opaque-capture pipeline round-trips all 6 v1.3 search params)
- URL is the single persistence layer for navigation/layout/range/density-anchored state (URL-as-broadcast-bus)
- `useRouteRangeVocab<V extends string>` ships alongside Phase 26's `useRouteRange` (ZERO-REFACTOR INVARIANT)
- `project_key` authoritative project identity on wire shapes; `cwd` is display label
- `KNOWN_METRICS` runtime API-contract test replaces build-time grep
- V11 collapsed-failure-mode lock preserved verbatim (TDBT-03; backend route UNCHANGED, Queue UX NOT shipped)
- Two-surface Reset Layout coverage (chrome-level + per-panel)
- `react-resizable-panels@4.11.0` v4 vocabulary lock (`Group/Panel/Separator/orientation`)
- Layout state piggybacks on saved-view `state_json` (no new DB table)
- `PHASE_NN_NET_CLASS_MARKERS` axe inversion filter pattern
- Formal per-phase visual checkpoint (POLI-09) with 9-section operator-signed `VISUAL-CHECK.md`
- `sonner@2.0.7` toast library lock-in (Radix portal compat)

**Open blockers carried to v1.4:** 13 Accepted Exceptions operator-acknowledged as forward-compatible tech debt (see `milestones/v1.3-MILESTONE-AUDIT.md` Tech Debt Summary). Highlights:

- LAYO-05 (full 2D grid) blocked by GitHub Issue #2045 (React 19.2 key-prop warnings in `react-grid-layout`)
- `CostByProjectCard` DeltaPill column needs backend bucketed-cost endpoint
- `CostForecastCard` MTD-only — needs `range` param on `/api/cost/forecast` for explicit re-query
- `DefaultViewLoader` v1 limitation on `/skills/$name` (Pitfall 8 deep-link-wins short-circuits because `range=14d` default populates URL search)
- Same-tab `PinnedViewsSection` write needs page reload (deferred to v1.4+ via custom event or Zustand-style store)
- SKLP-11 retry still gated on upstream OTEL data availability change (carried from v1.2)
- REQUIREMENTS.md doc-drift on dep-count constraint text (3 baseline deps → 6 actual; doc inaccuracy only)
- No standalone `28-VERIFICATION.md` from gsd-verifier (functional substitute via `28-VISUAL-CHECK.md` + operator-signed `28-06-SUMMARY.md`)

**Phase numbering:** Continuous (1.0 phases 1-11, 1.1 phases 12-17, 1.2 phases 18-23, 1.3 phases 24-28). Next milestone starts at Phase 29.

## Next Steps

1. `/clear` to drop accumulated context for next milestone
2. `/gsd:new-milestone` to define v1.4 (research → requirements → roadmap)
