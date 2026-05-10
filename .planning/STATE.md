---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Surface Redesign
status: roadmap_complete
stopped_at: v1.3 Surface Redesign roadmap created — 5 phases (24-28), 45 active requirements mapped
last_updated: "2026-05-10T00:00:00.000Z"
last_activity: 2026-05-10
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-10 after v1.3 milestone start)

**Core value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, what each skill costs and how often it fails, queue and approve tasks, compare two sessions side-by-side, get paged when metrics breach thresholds, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

**Current focus:** v1.3 Surface Redesign — full UX rebuild + dashboard-product aesthetic + targeted new capabilities. Roadmap created (Phases 24-28, 45 active requirements). Awaiting Phase 24 plan authoring.

## Current Position

Phase: 24 — Shell + Density + Containment Primitives (not started)
Plan: —
Status: Roadmap complete; ready for `/gsd:discuss-phase 24` (or `/gsd:plan-phase 24` to skip discussion)
Last activity: 2026-05-10 — v1.3 roadmap authored, REQUIREMENTS.md traceability filled (45/45 mapped)

Progress: [          ] 0% of v1.3 (0/5 phases complete)

## Performance Metrics

**v1.2 close baselines (verifier targets for v1.3 phases):**
- Backend pytest: 661 / 0 / 0 (passed/failed/skipped)
- Frontend vitest: 326 / 0 / 0
- Playwright e2e: 13 specs (11 passing + 2 dev-DB-state-dependent skips: `alerts.spec.ts:40 TEST-05a`, `skills-detail.spec.ts:25 SKLP-08/09/10`)
- LOC: ~62,883 (~40,071 Python + ~22,812 TypeScript/TSX)
- Deprecation warnings: 0 (POLI-06 baseline)

**v1.3 net new dependency budget (locked at requirements):**
- Frontend (3): `@radix-ui/react-popover@1.1.15`, `@radix-ui/react-dropdown-menu@2.1.16`, `react-resizable-panels@4.11.0`
- Backend: 1 Alembic migration (`0004_saved_views`); 0 Python deps

## Accumulated Context

### Decisions

Cumulative decision log lives in `.planning/PROJECT.md` Key Decisions table. v1.2 ship-time additions (full inventory in Key Decisions table):

- `cmc/core/time::now_utc` is the canonical naive-UTC factory across the codebase
- `project_key = sha1[:12](realpath(cwd))` is the project-identity normalization (migration 0003)
- `_resolve_alpha` helper inside single `evaluate_anomaly` (no parallel detector; ALRT-13)
- NL alert parser returns `None` on hallucination — no fallback rule (ALRT-14)
- Decimal-only OLS in `cmc/cost/forecast.py` — no numpy/scipy
- `/cost` is the only new top-level v1.2 route (sole exception to "extend existing pages")
- CMPR-06 single-rollup-SQL-per-side preserves CMPR-04's 9-SQL-per-request budget
- `ActiveSessionContext` lives in React Context, not a route parameter
- Spike-gated phase pattern: mandatory data-availability spike with binary YES/NO outcome banner (Phase 22 first use)
- `BASELINE.md` lives in the phase directory, not at `.planning/` root, with verifier rules embedded as prose-with-bounds

**v1.3 roadmap-time decisions:**

- Phase 24 establishes ALL primitives (containment, density, shell chrome, quality-gate scaffolding) BEFORE any per-route adoption. Anti-pattern explicitly avoided: do not adopt primitives mid-phase per route.
- Saved views are server-persisted (SQLite `saved_views` table) — chosen over localStorage-only for durability + future export/import; chosen over cloud-sync (out of scope; localhost-only).
- `validateSearch` schemas are append-only (locked invariant) — non-additive changes break Telegram deep-links and browser bookmarks.
- Density variables MUST be on `:root` (locked invariant) — never on a subtree (Radix Portal cascade requirement).
- Density toggle MUST be CSS-only (locked invariant) — `[data-density]` attribute on `<html>`, no React re-renders, no chart re-mounts.
- BoundedPanelCard MUST be opt-in via `bounded` prop (locked invariant) — backward compatibility for legacy "scroll whole page" behavior on routes that don't opt in.
- Saved view `state_json` MUST be opaque to backend (locked invariant) — schema validation lives in route's `validateSearch` on read.
- All Sheet/Popover/DropdownMenu content MUST go through Radix Portal (locked invariant) — no bare positioning.
- `data-testid` MUST come from registry (`docs/testid-registry.md`) — Playwright selector stability invariant.
- 50-view cap on saved views per route + 50-state cap on recent ad-hoc states — bounded localStorage growth.
- Formal per-phase visual checkpoint pattern (POLI-09) — each phase ends with operator-driven visual review at `.planning/phases/{N}/VISUAL-CHECK.md`. Verifier gates on visual checkpoint pass.
- Phase 28 (Layout Customization) ships LAST — depends on stable `validateSearch` shapes (Phase 25) and saved-view `state_json` (Phase 25). Layout state piggybacks on `state_json` (no new DB table).
- Tech debt closure (TDBT-01..03) lives in Phase 27 — bundled with `/skills`/`/cost`/`/alerts` per-route adoption because the shell rework makes the fixes natural.

### Resolved Blockers

(Cleared at milestone close — see `.planning/milestones/v1.2-MILESTONE-AUDIT.md` for the full v1.2 issues-resolved log.)

### Open Blockers / Carried Items

**Operational (non-blocking, one-time apply on next `cmc start`):**

- Apply Alembic migration 0003 to live `data/cmc.db` (auto-applies on lifespan boot via `command.upgrade(alembic_cfg, "head")`)

**Tech debt (mapped into v1.3 Phase 27 as TDBT-01..03):**

- TDBT-01: Wire APIs (`SessionListItemFull`, `SessionCompareSide`) don't expose `project_key` — Phase 23 frontend compare picker uses `cwd` as proxy. Phase 27 exposes `project_key` on those wire shapes for picker correctness in edge cases.
- TDBT-02: KNOWN_METRICS frontend constant still exists as fallback path despite `useAlertMetrics` hook + `test_alerts_metrics_sync.py` regex guard. Phase 27 finishes removing the constant entirely.
- TDBT-03: Phase 21-03 frontend NL input couples to a 503 collapse on `POST /api/alerts/parse-nl` (no graceful retry/queue UX). Phase 27 surfaces honest "credentials missing — retry" affordance.

**Tech debt (NOT in v1.3 scope, carried forward):**

- 3 `_utcnow_naive()` local helpers in `cmc/dispatcher/alerts.py:73`, `cmc/api/routes/alerts.py:77`, `tests/test_doctor.py:20` — duplicate `now_utc()` logic but use the correct API; stylistic redundancy only.
- REQUIREMENTS.md doc-drift in archived v1.2: line 30 said CMPR-07 endpoint resolves "most-recent same-cwd session" — code uses `project_key` correctly. Audit-noted; archived as-is.
- Two pre-existing Playwright skips at v1.2 close (`alerts.spec.ts:40 TEST-05a`, `skills-detail.spec.ts:25 SKLP-08/09/10`) — both dev-DB-state-dependent. v1.3 baseline should re-record after seed refresh (operational, not in scope).
- Cosmetic: `TO_BE_UPDATED_BY_SUMMARY` placeholder in `22-01-SPIKE-FINDINGS.md` line 26 (commit SHA verifiable from `git log`).

**Honestly deferred (carried to v1.4+ unless re-evaluated):**

- SKLP-11 — per-skill body/subagent/tool latency overhead breakdown — deferred to v1.4+ (Phase 22 spike negative finding still holds; unblock condition: upstream OTEL data availability change making `duration_ms` decomposition reliable).
- LAYO-05 — full 2D drag-resize grid via `react-grid-layout` — deferred (React 19.2 key-prop warnings open per GitHub Issue #2045).
- CMPR-10 — 3+ way session compare — defaulted OUT for v1.3 (no reference product ships >2-way; layout collapses below 1024px).

## Session Continuity

**v1.3 milestone progression:**

1. ✅ Project context update (PROJECT.md updated 2026-05-10)
2. ✅ Research (SUMMARY/STACK/FEATURES/ARCHITECTURE/PITFALLS authored 2026-05-10)
3. ✅ Requirements definition (REQUIREMENTS.md authored 2026-05-10 — 45 active across 9 categories)
4. ✅ Roadmap creation (ROADMAP.md authored 2026-05-10 — Phases 24-28, 45/45 mapped)
5. ⏳ Phase 24 discussion / plan authoring (next user step)
6. Phase 24 → 25 → 26 → 27 → 28 execution
7. v1.3 milestone audit + close

## Next Step

Run `/gsd:discuss-phase 24` (or `/gsd:plan-phase 24` to skip discussion and go straight to planning).
