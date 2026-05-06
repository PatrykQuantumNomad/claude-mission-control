---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Depth & Polish
status: Phase 19 in progress (2/4 plans shipped — SKLP-08 per-project endpoint live); Phase 18 BASELINE.md verifier rules preserved (pytest 586/0/32, datetime.utcnow=0).
stopped_at: Phase 19 Plan 02 (skills-projects-endpoint) complete; ready for Phase 19 Plan 03 (skills-deltas-and-badges, SKLP-09/10).
last_updated: "2026-05-06T12:00:39Z"
last_activity: 2026-05-06 — Plan 19-02 executed (commits b6d73a7 schemas + 056141b endpoint+7tests); pytest 586/0/32 (+7 vs 19-01, +20 vs Phase 18 baseline); 0 datetime.utcnow warnings; ruff clean. SUMMARY at .planning/phases/19-skills-per-project-deltas-badges/19-02-SUMMARY.md
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 9
  completed_plans: 7
  percent: 78
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05 after v1.1 ship)

**Core value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, what each skill costs and how often it fails, queue and approve tasks, compare two sessions side-by-side, get paged when metrics breach thresholds, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

**Current focus:** v1.2 Depth & Polish — roadmap written 2026-05-05. 6 phases (18–23) covering 13 requirements across 4 v1.1 lanes (skills polish, cost differentiators, alert differentiators, compare differentiators) plus polish/cleanup. Phase 22 is spike-gated for SKLP-11; descopes cleanly to v1.3 if `tools` temporal-JOIN derivation proves unreliable.

## Current Position

Phase: 19 — Skills Per-Project, Deltas & Badges (in progress, 2/4 plans shipped)
Plan: 19-03 (skills-deltas-and-badges, SKLP-09/10) is next
Status: Phase 19 Plan 02 complete (SKLP-08: GET /api/skills/{name}/projects + path-leakage-resistant DTOs); Phase 18 BASELINE.md verifier rules preserved
Last activity: 2026-05-06 — Plan 19-02 executed (commits b6d73a7 schemas + 056141b endpoint+7tests); pytest 586/0/32 (+7 vs 19-01, +20 vs baseline); SUMMARY at .planning/phases/19-skills-per-project-deltas-badges/19-02-SUMMARY.md

Progress: [████████░░] 78%

## Accumulated Context

### Decisions

Cumulative decision log lives in `.planning/PROJECT.md` Key Decisions table. v1.2 plan-execution decisions (Phase 18 Plan 01):

- **`cmc.core.time` is the canonical home for naive-UTC time concerns.** `now_utc()` returns `datetime.now(UTC).replace(tzinfo=None)`; `UTCDatetime` PlainSerializer is colocated. `cmc.api.schemas.common` re-exports `UTCDatetime` (one-line, `# noqa: F401`) so the 8 existing schema importers keep working without an 8-file cosmetic sweep (D-Pitfall-9). `cmc.core` re-exports `now_utc` for ergonomic access.
- **No speculative time helpers.** Only `now_utc` and `UTCDatetime` ship in Phase 18 (D-Module-shape). Future helpers (`today_utc`, `parse_iso_utc`) promote inline if/when Plan 02's sweep finds 3+ uses of a pattern.
- **Two-commit migration enforced.** Plan 01 creates the helper; Plan 02 owns the 22-site mechanical replace. Bisect-friendly; the sweep commit can be uniform mechanical.

Phase 18 Plan 02 (utcnow sweep, POLI-06):

- **D-Sweep atomic commit (c3d792f).** Tasks 1+2 merged into a single bisect-friendly mechanical-replacement commit. The 22-site replacement either fully reverts or fully applies — no half-migrated intermediate state on the bisect timeline. Per the locked two-commit migration: Plan 01 created the helper, Plan 02 adopts it across the codebase.
- **Docstring substring discipline.** When a verify gate uses `git grep`, prose mentioning the banned API must paraphrase. Three docstring blocks in `cmc/core/time.py` and one in `tests/test_core_time.py` were reworded ("the deprecated stdlib naive-UTC factory") to clear the POLI-06 structural verify gate while preserving explanatory intent.
- **Adjacent lint cleanup folds into the sweep when the same file is already touched.** Pre-existing I001 import-sort errors in `tests/test_core_time.py` (Plan 18-01 carry-over) blocked the pre-commit ruff hook on the sweep commit; auto-fixed via `ruff check --select I --fix` and folded into the same commit (vs. a separate "lint" commit on a single file already in the sweep's modification set).
- **Did not activate ruff DTZ** (Open-Question 3 deferred — would surface 38 unrelated DTZ findings out of POLI-06 scope).
- **Did not introduce a Field constants module / NOW_UTC sentinel.** Kept all 19 default_factory= references as direct function imports — matches D-Field-factories.

Phase 18 Plan 03 (SchedulesCard determinism, POLI-07):

- **`vi.spyOn(Date, 'now')` is the locked clock-pin mechanism for boundary-threshold tests** (NOT `vi.useFakeTimers`). Narrowest blast radius — targets exactly the one `Date.now()` call the production code reads, no interaction with React-Query or userEvent timer scheduling. Used describe-scoped in `SchedulesCard.test.tsx` with `NOW_MS = 2026-05-05T23:55:00Z`.
- **Test factories MUST default time-dependent fields to a sentinel ('never run' = `null`), never a hard-coded ISO string.** Hard-coded ISO defaults age with calendar time and silently flip "fresh" fixtures to "stale" — exactly the bit-rot that broke `SchedulesCard.test.tsx > stale row` 8 days after the original timestamp was written.
- **No cleanup-sweep migrations beyond SchedulesCard.** Audited 9 other component tests using `Date.now()`; all use it for relative timestamps without threshold/boundary assertions, so no flake risk. `RelativeTime.test.tsx` and `EmergencyStopBanner.test.tsx` left untouched per Pitfall 3 (load-bearing useFakeTimers usage).

Phase 18 Plan 04 (Playwright strict-mode + e2e README, POLI-08):

- **`data-testid` lives on the source React component, not test-only wrappers.** `data-testid="schedule-composer-name"` ships on `ScheduleComposer.tsx:193`. Specs reach it via `page.getByTestId('feature-component-element')`. Test wrappers were rejected to avoid render-layer maintenance burden.
- **`feature-component-element` kebab-case path-style is the locked testid convention** (e.g., `schedule-composer-name`, `alerts-firehose-skill-filter`, `skills-detail-projects-table`). Documented in `frontend/tests/e2e/README.md` (NOT `CONTRIBUTING.md`) per CONTEXT D-Documentation-location lock — rule lives next to the tooling that enforces it.
- **Decorate only when strict mode collides — pre-decoration is anti-pattern.** Full-suite strict-mode run found exactly one collision (`getByLabel('Name')` matched both ScheduleComposer wrap and SkillTimeline aria-label). Only that selector got a testid; `getByLabel('Advanced cron')`, `getByRole('button', {name: 'Create schedule'})`, `getByRole('button', {name: '+ New'})` all stayed as-is.
- **Steady-state alerts.spec.ts skip preserved (Pitfall 6).** README documents that "1 skipped" (alerts TEST-05a) is the baseline so verifiers don't regress on it.

Phase 18 Plan 05 (baseline-and-phase-close, phase-exit artifact):

- **BASELINE.md lives in the phase directory, not at `.planning/` root.** Per CONTEXT D-Verifier-baseline. A future "Phase 24 Polish v2" or similar would write its own baseline in *its* phase directory rather than mutating Phase 18's frozen baseline.
- **Verifier rules embedded as prose-with-bounds inside BASELINE.md** (e.g., `passed >= 566 → pass`, `warnings_datetime_utcnow > 0 → fail`, `total_warnings > 132 → warn`). Single source of truth: a downstream verifier reads one file and gets both the baseline counts AND the comparison thresholds.
- **Warning-delta is a load-bearing baseline metric.** Pytest total warnings (32) AND `datetime.utcnow`-specific warnings (0) are both recorded; the second is the load-bearing POLI-06 reverse-direction signal; the first gives a 100-warning headroom before flagging an investigation.
- **Dev-DB context capture for state-dependent skips.** Recorded `failed_tasks_total=1` and `failed_tasks_recent_5min=0` to explain the alerts.spec.ts steady-state skip. Lets future verifiers distinguish "baseline preserved" from "state drifted" (skipped >= 2 → human review).
- **Even ad-hoc inspection scripts respect the POLI-06 ban.** The dev-DB capture script uses `cmc.core.time.now_utc` (not `datetime.utcnow`) — structural enforcement is across the codebase, not just shipped code.

Phase 19 Plan 01 (migration 0003_project_key + project_key helper + ingest wiring, SKLP-08 foundation):

- **Migration 0003 INLINES the sha1[:12] backfill logic instead of importing `compute_project_key`.** Defensive against future helper refactors — Alembic migrations must remain runnable against historical revisions even if `cmc.core.project_key` is renamed/moved/restructured. Mirrors how 0002 inlined `json_extract` for session_id backfill instead of importing from `cmc.ingest.parser`. The unit test `test_matches_inline_sha1_logic` in `test_core_project_key.py` pins the formula equality so the helper and the migration cannot silently diverge.
- **Empty-string sentinel for `compute_project_key(None)` and `compute_project_key('')`.** Both return `''` (never raises). The `sessions.project_key` column is NOT NULL, so the empty string is the natural "no canonical project" marker — queries naturally exclude `WHERE project_key != ''`. Mirrors the COALESCE pattern in cost.py:168.
- **Python-loop backfill for filesystem-aware migrations.** SQLite has no `realpath` builtin, so the migration iterates rows in Python and calls `os.path.realpath` per row. Pure-SQL backfill (the 0002 idiom for session_id) was unavailable because the canonicalization crosses into the filesystem layer.
- **`_SESSION_MUTABLE_COLS` includes `project_key`.** Pitfall 9 — the migration is one-shot; ingest must keep the column fresh on every re-sync, including rows where the cwd value arrives or is corrected later. Without this, a session with cwd corrected after first sync would never get re-keyed.
- **Helper-first / wiring-second commit split (53fe578 + 95bd1df).** Two atomic commits on `main`: Task 1 lands compute_project_key + 11 unit tests in isolation; Task 2 lands the migration + sessions model + scheduler/repository wiring + 2 migration tests as one unit. Bisect-friendly: a regression in either layer is attributable to one commit.
- **Test count grew from 7 (plan) to 11 (delivered).** Each addition pins an invariant the original 7 didn't: re-export shape (`test_reexport_via_cmc_core`), formula equality vs inlined migration code (`test_matches_inline_sha1_logic`, drift guard), parametric falsy-input coverage. No deviation cost — pure-function tests run in 0.02s combined.

Phase 19 Plan 02 (SKLP-08 per-project endpoint, GET /api/skills/{name}/projects):

- **Path-leakage prohibition is enforced TWICE — schema + runtime test.** `SkillProjectRow` enumerates exactly 7 fields (`project_key`, `count`, `p50_ms`, `p95_ms`, `cost_usd`, `cost_attribution`, `low_sample`); no `cwd`/`path`/`display_path` exists, ever. The `test_skill_projects_no_path_leakage` test programmatically scans every row's keys AND values for filesystem-shape leakage (no `/`-prefixed string, no occurrence of the seeded secret cwd, no segment substring). LOAD-BEARING for ROADMAP success criterion #1. New project-keyed responses elsewhere in cmc.api SHOULD ship the same dual guard.
- **Per-project endpoint is session-scoped only — no Path R / request-scoped fallback.** Per-project rollups aggregate across many sessions, so the request-scoped JOIN (Path R in `skill_cost`) buys no meaningful precision at the project granularity but doubles SQL cost. `cost_attribution` literal is `"session" | "approximate"` (priced vs. unpriced model), distinct from `skill_cost`'s `"request" | "session"` pair.
- **Two-CTE split (`_PROJECTS_PERCENTILE_SQL` + `_PROJECTS_TOKEN_SQL`) instead of a single mega-query.** Mixing window-function percentiles (PARTITION BY project_key for p50/p95) with SUM aggregation (GROUP BY project_key for tokens) in one CTE would force awkward double-aggregation. The split keeps each query single-purpose and reuses `_LATENCY_SQL`'s proven window pattern verbatim. Python merges the two row-sets keyed by project_key. Reusable pattern for any future per-project skill rollup (e.g. Plan 22's SKLP-11 if the spike clears).
- **Skill registry existence check (404) is layered ON TOP of the regex+`..` check (400) — divergent from `/skills/{name}/cost`.** The plan's must_have explicitly says "rejects unknown skills with 404"; `/cost` does not check the registry, but that's a pre-existing inconsistency, not something this plan was scoped to fix. New endpoint, stricter discipline.
- **Range Literal `"14d"|"30d"` only — `"7d"` reserved for Plan 19-03 delta CTE.** Pitfall 2 from STATE.md is honored at the schema level (`SkillRange` already narrows correctly). The dedicated `test_skill_projects_invalid_range_returns_422` exercises both `7d` and `2d` to lock the rejection contract.
- **Test count: 7 vs. plan's 5.** Two extras (`invalid_range_returns_422` + `path_traversal_rejected`) mirror the canonical guards every existing SKIL-* router endpoint ships with — omitting them would leave a structural hole that a future verifier might flag. Pure-edge-case tests; no deviation cost.

v1.2 roadmap-time decisions:

- **Phase 22 is spike-gated for SKLP-11.** Phase opens with a mandatory feasibility spike (`tools` temporal JOIN against `skill_activated.duration_ms`); negative finding descopes SKLP-11 to v1.3 cleanly without blocking Phase 23. No fake decomposition ships under any circumstance (PITFALLS Pitfall 10).
- **Migration `0003_project_key` is owned by Phase 19.** Both SKLP-08 (Phase 19) and ANLY-07 (Phase 20) need `project_key` normalization (sha1[:12] of `realpath(cwd.rstrip('/'))`); migration ships in Phase 19 since it runs first (PITFALLS Pitfall 7 prevails over ARCHITECTURE's "zero migrations" claim).
- **ALRT-13 extends `evaluate_anomaly` via `params_json.window_kind`.** No third `kind` value, no parallel detector function, no second dispatch branch — single-detector invariant carried from v1.1 (PITFALLS Pitfall 1; SUMMARY Conflict 1 resolution).
- **ALRT-14 returns `None` on Haiku hallucination.** No fallback rule, no "best-guess" save path; UI surfaces honest "could not parse" message. Hard-validation against `_SCOPE_EXTRACTORS.keys()` via `is_known_metric()`.
- **Phase ordering follows ARCHITECTURE: 18 → 19 → (20 ‖ 21) → 22 → 23.** Phase 18 first for green CI baseline; Phase 19 before Phase 22 to establish CTE patterns SKLP-11 reuses; Phase 23 last to close the milestone.
- **Zero net-new dependencies.** Every v1.2 feature implementable with existing tools (stdlib `math`/`Decimal` for OLS + Welford, SQLAlchemy CTEs, existing `cmdk` + `anthropic` SDK 0.97, vitest + Playwright). STACK research confirmed.

v1.1 carried decisions (still active):

- Cost stored as tokens, $ computed at read time (window logic via `effective_from`/`effective_until`)
- ALRT-12 invariant: alert engine NEVER imports `cmc.dispatcher.tasks`
- Stable `dedup_key = f"alert:{rule_id}:{scope_key}"` reusing `notification_log` UNIQUE
- `UTCDatetime` PlainSerializer with `when_used='json'` gate
- CMPR-04 over-cap = render branch (HTTP 200 + `over_cap=true`), not error branch
- CMPR-05 tabular-only compare (no diff library, no raw message rendering)
- Wave-1/wave-2 single-writer convention for REQUIREMENTS.md

### Pending Todos

- ~~Phase 19 plan owns migration `0003_project_key`~~ — **landed in Phase 19 Plan 01 (commit 95bd1df, 2026-05-06)**. `sessions.project_key VARCHAR(12) NOT NULL DEFAULT ''` + `idx_sessions_project_key` + Python-loop backfill; ingest path keeps it fresh via scheduler.py and repository.py. Phase 20 ANLY-07 unblocked.
- ~~Phase 19 Plan 02 (SKLP-08 endpoint, per-project rollup)~~ — **landed in Phase 19 Plan 02 (commits b6d73a7 schemas + 056141b endpoint+7tests, 2026-05-06)**. `GET /api/skills/{name}/projects` returns the path-leakage-resistant per-project rollup; ROADMAP success criterion #1 satisfied on the backend side.
- Phase 19 Plans 03/04 still to execute: SKLP-09/10 prev-period CTE + badges with DST spring-forward unit test, frontend wiring (DeltaPill primitive, SkillProjectsTable panel, badges on TopSkills + SkillsRegistry).
- Phase 22 plan front-matter MUST cite SQL columns or temporal-JOIN derivation source for body_ms / subagent_ms / tool_ms before any UI work begins (Pitfall 10 acceptance criterion).
- Phase 23 closes the milestone — audit hooks (full pytest + vitest + playwright green; `cmc doctor` clean; REQUIREMENTS.md traceability 13/13 or honest 12/13 + descope) belong in the final phase plan.
- v1.2 verifiers (Phase 19+) MUST read `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` at phase-close time and apply the embedded per-suite verifier rules (pytest >= 566, vitest >= 293, playwright >= 7, `warnings_datetime_utcnow > 0` → fail).

### Blockers/Concerns

None blocking roadmap → planning. Risk register:

- **SKLP-11 feasibility unknown until Phase 22 spike.** Roadmap accommodates "spike-only, descope to v1.3" outcome; Phase 23 has no hard dependency on SKLP-11.
- **NL grammar edge cases (ALRT-14).** Unit ambiguity, implicit metrics, nested conditions, time-window vs duration confusion — all need explicit system-prompt handling. MEDIUM confidence until tested against real prompts in Phase 21.
- **KNOWN_METRICS sync drift.** Phase 21 plan must lock either `GET /api/alerts/metrics` dynamic endpoint or CI sync test before merging.

Two operational human-verify items still carry forward (non-blocking, auto-discharging):

- Apply Alembic migrations 0002 and 0003 to live `data/cmc.db` — auto-applies on next `cmc start` via `lifespan.py:98-100`. `0003_project_key` (Phase 19 Plan 01) will backfill existing sessions on first boot post-merge.
- Phase 14 visual checkpoint per Plan 14-05 (visual rendering on `/activity` TopSkills, `/skills` 3 panels, `/skills/$name` detail) — operator-driven dashboard navigation.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Skills (v1.3+) | SKLP-12 percentile-split overhead breakdown (only if SKLP-11 ships) | v1.3 candidate | 2026-05-05 |
| Skills (v1.3+) | SKLP-13 heatmap toggle on per-project breakdown | v1.3 candidate | 2026-05-05 |
| Cost (v1.3+) | ANLY-08 confidence band on monthly forecast | v1.3 candidate | 2026-05-05 |
| Cost (v1.3+) | ANLY-09 per-project cost budgets with alert integration | v1.3 candidate | 2026-05-05 |
| Alerts (v1.3+) | ALRT-15 predictive alerts (forecast × anomaly combination) | v1.3 candidate | 2026-05-05 |
| Alerts (v1.3+) | ALRT-16 NL queries beyond AlertRule schema (NL2SQL) | v1.3 candidate | 2026-05-05 |
| Compare (v1.3+) | CMPR-08 sessions-table right-click "compare with previous" | v1.3 candidate | 2026-05-05 |
| Compare (v1.3+) | CMPR-09 per-skill cost delta in compare | v1.3 candidate | 2026-05-05 |
| Platform | PLAT-01 (Linux/systemd) | v2 | 2026-04-28 (carried from v1.0) |
| Automation | AUTO-01..03 (NL schedules beyond cron, auto-retry, task dependencies) | v2 | 2026-04-28 (carried from v1.0) |

## Performance Metrics

**v1.0 baseline:** 47 plans, 4 days (2026-04-25 → 2026-04-28), ~39,800 LOC.
**v1.1:** 28 plans, 4 days (2026-05-02 → 2026-05-05), +81,397 / -13,435 lines vs v1.0, ~56,232 LOC at close.
**v1.2:** Phases 18–23 defined (6 phases, 13 requirements). **Phase 18 complete (5/5 plans, 2026-05-05)**: Plan 01 ~10 min (cmc.core.time helper + 5 unit tests), Plan 02 ~42 min (atomic 22-site sweep `datetime.utcnow` → `now_utc`, commit c3d792f), Plan 03 ~3 min (`vi.spyOn(Date, 'now')` pin in SchedulesCard.test.tsx), Plan 04 ~5 min (Playwright strict-mode disambiguation + e2e/README.md), Plan 05 ~9 min (BASELINE.md phase-exit artifact). Final phase-18 baseline: backend pytest 566 passed / 0 failed / 32 warnings / 0 datetime.utcnow lines; frontend vitest 293 passed / 66 files; Playwright 7 passed / 1 skipped (alerts steady-state) / 0 failed. Pytest deprecation-warning delta ~1429 → 0. Net-zero dependency change across the phase. POLI-06/POLI-07/POLI-08 all green; BASELINE.md (`.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md`) is the canonical reference for v1.2 phases 19+ verifiers. **Phase 19 in progress (2/4 plans, 2026-05-06)**: Plan 01 ~8 min (commits 53fe578 helper + 95bd1df migration/wiring): `cmc.core.project_key.compute_project_key` helper (11 unit tests), Alembic migration `0003_project_key` (sessions.project_key VARCHAR(12) NOT NULL DEFAULT '' + indexed + Python-loop backfill via realpath), sessions model field, scheduler.py + repository.py wiring; pytest 579 passed / 0 failed / 32 warnings / 0 datetime.utcnow (+13 vs baseline), ruff clean. Plan 02 ~16 min (commits b6d73a7 schemas + 056141b endpoint+7tests): `SkillProjectRow` + `SkillProjectsResponse` DTOs (path-leakage-resistant by enumeration), `GET /api/skills/{name}/projects` endpoint with two-CTE rollup (`_PROJECTS_PERCENTILE_SQL` window-CTE adapted from `_LATENCY_SQL` + `_PROJECTS_TOKEN_SQL` per-project token sums), 7 tests including the LOAD-BEARING `test_skill_projects_no_path_leakage` programmatic key+value scan; pytest 586 passed / 0 failed / 32 warnings / 0 datetime.utcnow (+7 vs 19-01, +20 vs Phase 18 baseline), ruff clean.
**Cumulative:** 75 plans across 17 phases (11 v1.0 + 6 v1.1) over 8 calendar days of active development pre-v1.2.

## Session Continuity

Last session: 2026-05-06T12:00:39Z
Stopped at: Phase 19 Plan 02 (skills-projects-endpoint, SKLP-08) complete; ready for Phase 19 Plan 03 (skills-deltas-and-badges, SKLP-09/10).
Resume file: None

---

*v1.0 shipped 2026-04-28 — see `.planning/milestones/v1.0-ROADMAP.md` for full phase history.*
*v1.1 shipped 2026-05-05 — see `.planning/milestones/v1.1-ROADMAP.md` for full phase history.*
*v1.2 active — see `.planning/ROADMAP.md` Phase Details section for current milestone scope.*
