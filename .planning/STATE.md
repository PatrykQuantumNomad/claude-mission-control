---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Surface Redesign
status: defining_requirements
stopped_at: v1.3 Surface Redesign started — defining requirements
last_updated: "2026-05-10T00:00:00.000Z"
last_activity: 2026-05-10
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-10 after v1.3 milestone start)

**Core value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, what each skill costs and how often it fails, queue and approve tasks, compare two sessions side-by-side, get paged when metrics breach thresholds, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

**Current focus:** v1.3 Surface Redesign — defining requirements (full UX rebuild + dashboard-product aesthetic + targeted new capabilities)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-05-10 — Milestone v1.3 Surface Redesign started

Progress: [          ] 0% (requirements + roadmap pending)

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

### Resolved Blockers

(Cleared at milestone close — see `.planning/milestones/v1.2-MILESTONE-AUDIT.md` for the full v1.2 issues-resolved log.)

### Open Blockers / Carried Items

**Operational (non-blocking, one-time apply on next `cmc start`):**

- Apply Alembic migration 0003 to live `data/cmc.db` (auto-applies on lifespan boot via `command.upgrade(alembic_cfg, "head")`)

**Tech debt (carried into v1.3 scoping):**

- Wire APIs (`SessionListItemFull`, `SessionCompareSide`) don't expose `project_key` — Phase 23 frontend compare picker uses `cwd` as proxy. v1.3 should expose `project_key` on those wire shapes for picker correctness in edge cases.
- KNOWN_METRICS frontend constant still exists as fallback path despite `useAlertMetrics` hook + `test_alerts_metrics_sync.py` regex guard. v1.3 could finish removing the constant entirely.
- Phase 21-03 frontend NL input couples to a 503 collapse on `POST /api/alerts/parse-nl` (no graceful retry/queue UX) — lower priority since the failure mode is honest.
- 3 `_utcnow_naive()` local helpers in `cmc/dispatcher/alerts.py:73`, `cmc/api/routes/alerts.py:77`, `tests/test_doctor.py:20` — duplicate `now_utc()` logic but use the correct API; stylistic redundancy only.
- REQUIREMENTS.md doc-drift in archived v1.2: line 30 said CMPR-07 endpoint resolves "most-recent same-cwd session" — code uses `project_key` correctly. Audit-noted; archived as-is.
- Two pre-existing Playwright skips at v1.2 close (`alerts.spec.ts:40 TEST-05a`, `skills-detail.spec.ts:25 SKLP-08/09/10`) — both dev-DB-state-dependent. v1.3 baseline should re-record after seed refresh.
- Cosmetic: `TO_BE_UPDATED_BY_SUMMARY` placeholder in `22-01-SPIKE-FINDINGS.md` line 26 (commit SHA verifiable from `git log`).

**Honestly deferred (ROADMAP-contemplated):**

- SKLP-11 — per-skill body/subagent/tool latency overhead breakdown — deferred to v1.3 per Phase 22 spike negative finding (`22-01-SPIKE-FINDINGS.md` commit `07abcfa`). Unblock condition: upstream OTEL data availability change making `duration_ms` decomposition reliable.

## Next Step

Continuing `/gsd:new-milestone` workflow — research decision → requirements definition → roadmap creation. After roadmap approval, the next user-facing step will be `/gsd:discuss-phase 24` (or `/gsd:plan-phase 24` to skip discussion).
