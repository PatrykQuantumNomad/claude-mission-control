---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Depth & Polish
status: Phase 18 complete (5/5 plans shipped); BASELINE.md is the canonical reference for v1.2 phases 19+ verifiers
stopped_at: Phase 18 (Polish & Carry-Forward Cleanup) complete; ready for Phase 19.
last_updated: "2026-05-05T21:17:41.139Z"
last_activity: 2026-05-05 — Plan 05 executed (commit eb65e1c BASELINE.md recorded: pytest 566/0/32, vitest 293/0, playwright 7/1/0, datetime.utcnow warnings ~1429 → 0, net-zero deps); SUMMARY written; all 4 ROADMAP success criteria green
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05 after v1.1 ship)

**Core value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, what each skill costs and how often it fails, queue and approve tasks, compare two sessions side-by-side, get paged when metrics breach thresholds, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

**Current focus:** v1.2 Depth & Polish — roadmap written 2026-05-05. 6 phases (18–23) covering 13 requirements across 4 v1.1 lanes (skills polish, cost differentiators, alert differentiators, compare differentiators) plus polish/cleanup. Phase 22 is spike-gated for SKLP-11; descopes cleanly to v1.3 if `tools` temporal-JOIN derivation proves unreliable.

## Current Position

Phase: 18 — Polish & Carry-Forward Cleanup (complete, 5/5 plans shipped)
Plan: All Phase 18 plans complete; Phase 19 is next
Status: Phase 18 complete; BASELINE.md is the canonical reference for v1.2 phases 19+ verifiers
Last activity: 2026-05-05 — Plan 05 executed (commit eb65e1c BASELINE.md recorded: pytest 566/0/32, vitest 293/0, playwright 7/1/0, datetime.utcnow warnings ~1429 → 0, net-zero deps); SUMMARY written; all 4 ROADMAP success criteria green

Progress: [██████████] 100%

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

- Phase 19 plan owns migration `0003_project_key` (sessions.project_key VARCHAR(12), backfill, index).
- Phase 22 plan front-matter MUST cite SQL columns or temporal-JOIN derivation source for body_ms / subagent_ms / tool_ms before any UI work begins (Pitfall 10 acceptance criterion).
- Phase 23 closes the milestone — audit hooks (full pytest + vitest + playwright green; `cmc doctor` clean; REQUIREMENTS.md traceability 13/13 or honest 12/13 + descope) belong in the final phase plan.
- v1.2 verifiers (Phase 19+) MUST read `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` at phase-close time and apply the embedded per-suite verifier rules (pytest >= 566, vitest >= 293, playwright >= 7, `warnings_datetime_utcnow > 0` → fail).

### Blockers/Concerns

None blocking roadmap → planning. Risk register:

- **SKLP-11 feasibility unknown until Phase 22 spike.** Roadmap accommodates "spike-only, descope to v1.3" outcome; Phase 23 has no hard dependency on SKLP-11.
- **NL grammar edge cases (ALRT-14).** Unit ambiguity, implicit metrics, nested conditions, time-window vs duration confusion — all need explicit system-prompt handling. MEDIUM confidence until tested against real prompts in Phase 21.
- **KNOWN_METRICS sync drift.** Phase 21 plan must lock either `GET /api/alerts/metrics` dynamic endpoint or CI sync test before merging.

Two operational human-verify items still carry forward (non-blocking, auto-discharging):

- Apply Alembic migration 0002 to live `data/cmc.db` — auto-applies on next `cmc start` via `lifespan.py:98-100` (will be joined by `0003_project_key` in Phase 19).
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
**v1.2:** Phases 18–23 defined (6 phases, 13 requirements). **Phase 18 complete (5/5 plans, 2026-05-05)**: Plan 01 ~10 min (cmc.core.time helper + 5 unit tests), Plan 02 ~42 min (atomic 22-site sweep `datetime.utcnow` → `now_utc`, commit c3d792f), Plan 03 ~3 min (`vi.spyOn(Date, 'now')` pin in SchedulesCard.test.tsx), Plan 04 ~5 min (Playwright strict-mode disambiguation + e2e/README.md), Plan 05 ~9 min (BASELINE.md phase-exit artifact). Final phase-18 baseline: backend pytest 566 passed / 0 failed / 32 warnings / 0 datetime.utcnow lines; frontend vitest 293 passed / 66 files; Playwright 7 passed / 1 skipped (alerts steady-state) / 0 failed. Pytest deprecation-warning delta ~1429 → 0. Net-zero dependency change across the phase. POLI-06/POLI-07/POLI-08 all green; BASELINE.md (`.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md`) is the canonical reference for v1.2 phases 19+ verifiers.
**Cumulative:** 75 plans across 17 phases (11 v1.0 + 6 v1.1) over 8 calendar days of active development pre-v1.2.

## Session Continuity

Last session: 2026-05-05T21:17:38.092Z
Stopped at: Phase 18 (Polish & Carry-Forward Cleanup) complete; ready for Phase 19. BASELINE.md is canonical reference for v1.2 phases 19+ regressions.
Resume file: None

---

*v1.0 shipped 2026-04-28 — see `.planning/milestones/v1.0-ROADMAP.md` for full phase history.*
*v1.1 shipped 2026-05-05 — see `.planning/milestones/v1.1-ROADMAP.md` for full phase history.*
*v1.2 active — see `.planning/ROADMAP.md` Phase Details section for current milestone scope.*
