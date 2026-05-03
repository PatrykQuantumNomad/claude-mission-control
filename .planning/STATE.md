---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Skills & Cost Intelligence
status: in_progress
stopped_at: Phase 14 Plan 01 complete (Skills API endpoints) — ready for Plan 02 (frontend api.ts + queries)
last_updated: "2026-05-03T22:09:00Z"
last_activity: 2026-05-03 — Phase 14 Plan 01 complete (4 read-time-computed skills endpoints + dual-path attribution + SSE payload extension); 25 new tests, 463 passed
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 13
  completed_plans: 9
  percent: 69
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-02 — v1.1 Skills & Cost Intelligence roadmap created)

**Core value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, queue and approve tasks, and kill runaway sessions — all from one browser tab.

**Current focus:** v1.1 Skills & Cost Intelligence — Phase 14 (Skills API & Page Panels) IN PROGRESS — Plan 01 (backend endpoints) complete; Plans 02-05 (frontend) pending.

## Current Position

Phase: 14 of 17 (Skills API & Page Panels) — Plan 01 of 5 complete
Plan: 14-01 (c913e6a + a2735a4 + f20b5aa) — 4 new path operations (/api/skills/usage, /api/skills/{name}/cost, /api/skills/{name}/latency, /api/skills/{name}/runs) + SSE payload extension. Plans 02-05 pending.
Status: Phase 14 Plan 01 complete — SKIL-04..07 endpoints landed with dual-path skill cost attribution (Path R: request-scoped JOIN to api_request via session_id+request_id; Path S: session-scoped fallback using sessions.tokens_*). cost_attribution: "request"|"session" field surfaces the chosen branch on every response. SQLite window-CTE percentile pattern adapted from observability._TOOL_LATENCY_SQL — 100 events at duration_ms=1..100 yields p50=50, p95=95, max=100 with the MAX(CAST(n*p AS INTEGER), 1) clamp. Trend SQL has TWO variants (_COST_TREND_REQUEST_SCOPED_SQL + _COST_TREND_SESSION_SCOPED_SQL) — the handler picks based on cost_attribution so the Decimal sum invariant `sum(trend.daily_cost) == cost_usd` holds (regression test on BOTH paths). MIN_LATENCY_SAMPLES=30 surfaced as server-side low_sample bool (SKLP-05/D-04 — server is source of truth, frontend re-asserts for defense-in-depth). SSE tail_otel_events payload extended with attrs_skill_name (one-line addition) — Plan 04 SkillTimeline can label firehose events. D-01: SKIL-04 lives at /api/skills/usage (NOT /api/skills?range=) to preserve the catalog endpoint consumed by SkillsRegistry.tsx — REQUIREMENTS.md SKIL-04 + ROADMAP.md Phase 14 SC#1 carry the deviation annotation. Decimal-as-JSON-string locked (Pydantic v2 default; jsonable_encoder forbidden). 25 new tests in test_skills_router.py (2 schema/SSE + 8 usage/runs + 15 cost/latency). Full backend suite: 463 passed, 0 failed (was 438 baseline; net +25).
Last activity: 2026-05-03 — Phase 14 Plan 01 complete; ready for Plan 02 (frontend api.ts + queries)

Progress: [███████░░░] 69%

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent v1.1 architectural decisions surfaced in research:

- Phase 12 (Spike): OTEL `claude_code.skill_activated` is the canonical event (NOT `_invoked` as the v1.0 placeholder assumed) — verbatim live-data capture before any ingest schema lock.
- Phase 12 Plan 01 (executed 2026-05-02): Wave 0 confirmed empirical zero `event_name LIKE '%skill%'` rows in 6,392 production otel_events. Wave 1 live invocation produced a NEGATIVE FINDING — skill body fired (`/tmp/spike-skill-fired.txt` written) but ZERO OTEL events of any kind landed. Plan 02 must author skill-scoped attribute locks (skill_name, duration_ms, status, token, session.id) as TENTATIVE with STACK.md / Context7 fallback citations. Ingest-side schema locks (json_each pattern, attributes-array shape, prefix-strip event_name) remain HIGH-confidence — anchored on the 6,392 production rows. Service version of record stamped: claude-code 2.1.116.
- Phase 12 Plan 01 → Phase 13 follow-up: re-run live invocation with explicit OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_LOGS_ENDPOINT env vars in the spawned `claude` session to disambiguate two non-exclusive root causes for the negative finding: (a) Claude Code 2.1.116 may not emit skill events at all; (b) endpoint mis-config in the spawned session. Cause (b) is favored on current evidence (zero events of ANY type landed in the scope window).
- Phase 12 Plan 02 (executed 2026-05-02): SPIKE.md composed with 10 locks (LOCK-1 through LOCK-10). 5 HIGH-confidence VERIFIED (LOCK-4 cache TTL split surface — JSONL-only at 2.1.116; LOCK-5 session.id dotted; LOCK-6 no project.* attribute exists at 2.1.116; LOCK-9 token attribution via JOIN to api_request; LOCK-10 service.version 2.1.116). 5 TENTATIVE/CITED to STACK.md §1 → Context7 /ericbuess/claude-code-docs (LOCK-1 event name; LOCK-2 skill_name attribute key; LOCK-3 duration_ms presence; LOCK-7 multi-skill turn batching; LOCK-8 error/cancel/failure status). Two latent bugs flagged for Phase 13 INGST-11 fix: BUG-A (`cmc/api/routes/observability.py:535` flat json_extract returns NULL silently for 1,406 tool_decision rows) and BUG-B (`cmc/api/routes/ingest.py:103` reads `session_id` underscore; emitted key is `session.id` dotted; all 6,392 production rows have NULL session_id column). Cross-references table maps every lock to a specific consuming artifact (file:line / function / column / endpoint precision). Phase 12 P0 hard gate satisfied; Phase 13 unblocked.
- Phase 13 (Cost): hand-rolled `cmc/pricing.py` + `Decimal` math, read-time cost compute (no $ stored in DB), `effective_from`/`effective_until` on pricing table for self-correcting historical totals.
- Phase 13 (Ingest): one Alembic migration adds `otel_events.attrs_skill_name` index + alert tables together (mirrors existing `attrs_mcp_*` pattern).
- Phase 13 Plan 01 (executed 2026-05-03): cmc.pricing module landed; `compute_cost` is pure stdlib Decimal (verified $5.00, $37.50, $46.75 exact — no float drift); 5 SKUs in data/pricing.json (all rates as JSON strings per Pitfall 1); PricingRow registered in SQLModel.metadata; lifespan auto-seed wraps load_seed in try/except so malformed JSON cannot block boot. cmc/pricing.py added to pyright exclude list (matches existing project convention for SQLAlchemy-heavy modules — cmc/db, cmc/api, cmc/dispatcher, cmc/ingest/repository.py).
- Phase 13 Plan 02 (executed 2026-05-03): Single 0002_v1_1_alerts_and_skills Alembic revision lands all 7 Phase 13 schema mutations atomically (otel_events.attrs_skill_name + otel_event_id + (session_id, otel_event_id) UNIQUE; sessions/token_usage tokens_cache_create_5m/_1h split; pricing table with seed_hash matching PricingRow exactly; alert_rules + alert_state final ALRT-01/02 shape — Phase 15 ships zero migration). BUG-B SQL backfill in upgrade() re-extracts session.id (dotted) from body.record.attributes via json_each — recovered 13,998 of 14,000 production NULL session_id rows. BUG-A read-side fix at observability.py:_EDIT_DECISIONS_OTEL_SQL replaces flat json_extract with json_each over body.record.attributes and flips event_name to bare 'tool_decision' (post prefix-strip per LOCK-1). 3 new migration tests (upgrade, downgrade, BUG-B backfill) + full backend suite (399 tests) all green. Test alembic config requires sqlite+aiosqlite:// URL because env.py runs async engine. test_foundation_boot table-count assertions bumped 15 → 18 to match Plan 01's pricing + Plan 02's alert tables (drift fix).
- Phase 15 (Alerts): alert engine lives inside the existing 120s dispatcher tick (no new launchd job), emits decisions only (`ALRT-12` — never imports `cmc.dispatcher.tasks`), stable `dedup_key = alert:{rule_id}:{scope_key}` (no timestamps).
- Phase 16 (Compare): single backend endpoint with cost computed via shared `cmc/cost/engine.py`; URL state as source of truth; structured tabular only (no text-diff library).
- Phase 13 Plan 04 (executed 2026-05-03): cost router shipped — `/api/cost/summary`, `/api/cost/breakdown`, `/api/pricing/freshness`. Decimal-as-JSON-string locked (Pydantic v2 default; `jsonable_encoder` forbidden). Range enum locked (`Literal["1d","7d","14d","30d"]` -> 422 on mismatch). `breakdown(dim=model).total == summary.total` by Decimal equality (no float drift). Skill attribution session-scoped per SPIKE.md LOCK-9 — Phase 14 owns request-scoped refinement via `api_request` JOIN. Project breakdown keys on `sessions.cwd` (project_hash column doesn't exist in sessions schema). `MAX(s.model)` as pricing-key for skill/project breakdowns. 8 tests pass; full backend suite 432/432.
- [Phase ?]: Phase 13 Plan 03 (executed 2026-05-03): extract_skill_attr + extract_event_sequence pure-function helpers added next to extract_mcp_attrs; /v1/logs router reads session.id (dotted) per SPIKE.md LOCK-5 (BUG-B prospective fix), populates attrs_skill_name + otel_event_id, and uses sqlite_insert(...).on_conflict_do_nothing(index_elements=['session_id','otel_event_id']) for INGST-13 idempotency. JSONL parse_session_file extracts cache_creation.ephemeral_5m/1h_input_tokens; legacy aggregate fallback lands entirely in 1h tier (CONTEXT.md pessimistic rule, direction-honest). Repository upserts wired through both Session and TokenUsage with the new TTL columns. 5 new tests in test_ingest.py + 7 new pure-function tests in test_otel_parser.py — all 48 pass. Pre-commit ruff hook surfaced 6 lint violations in Plan 04's untracked cost.py; applied minimal fixes under deviation Rule 3 to unblock commits (cost.py NOT staged in either Plan 03 commit).
- Phase 13 Plan 05 (executed 2026-05-03): `cmc doctor` expanded 8 → 14 checks. Six new sensors land covering ANLY-05 (pricing freshness #9, unpriced tokens #10, pricing.json hash drift #11 — REAL check via PricingRow.seed_hash, not paraphrase; unmapped otel models #13), BUG-B regression (#12 session_id NULL count), and POLI-01 carry-forward (#14 OTEL_LOG_TOOL_DETAILS). Pitfall 5 fully enforced: status='warn' for all drift, status='fail' reserved for the three true unblockers (empty pricing table, missing pricing.json, invalid JSON). DB queries via stdlib sqlite3 (no SQLAlchemy session) for cwd-independence. 15 hermetic unit tests in tests/test_doctor.py with per-test ephemeral SQLite + monkeypatched `cmc.pricing._PRICING_JSON`. Drift fix: `test_telegram_setup.py::test_doctor_run_checks_returns_eight` → `_returns_fourteen`. Full backend suite 434 passed, 2 skipped, 0 failed. Pre-commit hook scope (lints entire `cmc tests` tree) clashed with parallel-wave-3 untracked cost.py from Plan 04; resolved by parking unrelated untracked files outside the tree during commit.
- Phase 13 Plan 06 (executed 2026-05-03): Phase 13 closed. Plan 01's two deferred async test stubs (test_seed_loader_round_trip, test_pricing_window_self_correcting) finalized — both pass against the lifespan-seeded pricing table without any pytest.skip. New tests/test_phase13_e2e.py (179 lines, 2 tests) provides a single end-to-end trace: lifespan auto-seed loaded 5 SKUs → pre-create sessions row → POST /v1/logs with skill_activated body using dotted `session.id` (LOCK-5/BUG-B) → re-POST returns 200 with no second row (UNIQUE(session_id, otel_event_id) + on_conflict_do_nothing — INGST-13) → GET /api/cost/summary returns total_usd="35" exact (2M @ $5/Mtok + 1M @ $25/Mtok) with rates_as_of="2026-05-03" → GET /api/cost/breakdown?dim=skill exposes data:analyze. Plus REPL-import smoke (`from cmc.pricing import compute_cost`, no app boot, returns Decimal("5") on 1M input — locks roadmap success criterion #1). conftest gained `db_session` + `seed_pricing` fixtures with client-coexistence handling (when test requests BOTH `client` AND `db_session`, client owns the lifespan entry; db_session detects via request.fixturenames and just opens a session on the running engine — avoids the `_AsyncGeneratorContextManager.args` consumption error from double-entering the same `cm`). All 8 Phase 13 requirements trace to passing tests (matrix in 13-06-SUMMARY.md). Full backend suite 438 passed, 0 skipped, 0 failed (net +4 from baseline 434+2skipped — the 2 stubs now run + 2 new e2e tests).
- Phase 14 Plan 01 (executed 2026-05-03): 4 new read-time-computed skill endpoints landed on the existing /api/skills router. (1) `/skills/usage?range=14d|30d&limit=10` returns top-N skills + per-day sparkline via two-CTE pattern (per_day → totals LIMIT :limit → LEFT JOIN per_day). D-01: lives at `/skills/usage` NOT `/skills?range=` to preserve the catalog endpoint consumed by SkillsRegistry.tsx; REQUIREMENTS.md SKIL-04 + ROADMAP.md Phase 14 SC#1 carry the deviation annotation. (2) `/skills/{name}/cost` ships **dual-path attribution** per D-02 — Path R: self-JOIN otel_events skill_activated ↔ api_request on (session_id, request_id) extracted via json_each + stringValue + CAST INTEGER (Pitfall 3). Path S: session-scoped fallback (SUM sessions.tokens_*). cost_attribution: "request"|"session" field on every response (even empty case → 'session' conservative branch). Trend SQL has TWO variants (_COST_TREND_REQUEST_SCOPED_SQL + _COST_TREND_SESSION_SCOPED_SQL) so the Decimal sum invariant `sum(trend.daily_cost) == cost_usd` holds — running independent dual-path tests per bucket would let different days land on different branches and break the invariant. (3) `/skills/{name}/latency` adapts the SQLite window-CTE percentile pattern from observability._TOOL_LATENCY_SQL to per-skill latency. duration_ms extracted via json_each + stringValue + CAST INTEGER; WHERE duration_ms IS NOT NULL handles D-03 LOCK-3 TENTATIVE. error_count counts status IN ('error','failure','cancel') per LOCK-8 union. MIN_LATENCY_SAMPLES=30 module-level constant; low_sample bool surfaces server-side per SKLP-05/D-04 (server is source of truth — Plan 04 SkillLatencyTable reads response.low_sample, frontend re-asserts for defense-in-depth, prevents constant-drift). (4) `/skills/{name}/runs` returns recent invocations ordered ts DESC with cwd LEFT JOIN sessions; orphan events surface cwd='<unknown>'. (5) cmc/api/sse.py tail_otel_events payload extended with attrs_skill_name (one-line addition; column landed Phase 13 P02) — enables Plan 04 SkillTimeline to label firehose events. Decimal-as-JSON-string locked (Pydantic v2 default; jsonable_encoder forbidden). _RANGE_TO_DAYS / _range_start COPIED (not imported) from cost.py to keep router files independent. 25 new tests in test_skills_router.py: 2 schema/SSE + 8 usage/runs + 15 cost/latency including the critical Decimal sum invariant on BOTH paths (test_skill_cost_trend_shape_session_path + test_skill_cost_trend_sum_equals_total_cost_usd_request_path) and the percentile correctness test (100 events at 1..100 → p50=50, p95=95, max=100). Inline `_seed_otel_event(session_id=None)` helper avoids the soft-FK constraint to sessions when the test only needs the otel_events row. Full backend suite 463 passed, 0 failed (net +25 from baseline 438).

### Pending Todos

None yet.

### Blockers/Concerns

- **Phase 13 verification gates** (carry into plan-phase): pricing numbers must be fetched from `https://www.anthropic.com/pricing` and seeded before any dollar figure renders; `recharts@3.8.1` pin needs version-correctness check; `OTEL_LOG_TOOL_DETAILS=1` must be set in user's Claude Code environment.
- **REQUIREMENTS.md coverage line says 38**, actual v1.1 requirement count is **41** (verified by grep). Roadmap maps all 41. Update REQUIREMENTS.md coverage block to 41 during traceability update.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Skill differentiators | SKLP-08..11 (per-project breakdown, period-over-period delta, badges, latency overhead) | v1.2 | 2026-05-02 |
| Cost differentiators | ANLY-06..07 (monthly forecast, per-project cost card) | v1.2 | 2026-05-02 |
| Alert differentiators | ALRT-13..14 (anomaly detection refinement, NL-authored rules) | v1.2 | 2026-05-02 |
| Compare differentiators | CMPR-06..07 (per-skill latency delta, Cmd+K previous-session shortcut) | v1.2 | 2026-05-02 |
| Platform | PLAT-01 (Linux/systemd) | v2 | 2026-04-28 (carried from v1.0) |
| Automation | AUTO-01..03 (NL schedules beyond cron, auto-retry, task dependencies) | v2 | 2026-04-28 (carried from v1.0) |

## Performance Metrics

**Velocity (v1.0 baseline):**

- Total plans completed (v1.0): 47
- v1.0 ship: 4 days (2026-04-25 → 2026-04-28)

**v1.1 metrics:**

| Phase | Plan | Duration | Tasks | Files | Date |
|-------|------|----------|-------|-------|------|
| 12 | 01 | ~37 min (excl. checkpoint pause) | 2 | 1 created (`SPIKE.md`, 762 lines) + 1 SUMMARY | 2026-05-02 |
| 12 | 02 | ~4 min | 1 | 1 modified (`SPIKE.md`, +339/-2 lines → 1,097 total) + 1 SUMMARY | 2026-05-02 |
| 13 | 01 | ~11 min | 2 | 4 created (`pricing.json`, `pricing.py`, `db/models/pricing.py`, `test_pricing.py`) + 3 modified (`db/models/__init__.py`, `app/lifespan.py`, `pyproject.toml`) + 1 SUMMARY | 2026-05-03 |
| 13 | 02 | ~17 min | 2 | 4 created (`alert_rules.py`, `alert_state.py`, `0002_v1_1_alerts_and_skills.py`, `test_migrations.py`) + 7 modified (`otel_events.py`, `sessions.py`, `token_usage.py`, `db/models/__init__.py`, `observability.py`, `test_observability_router.py`, `test_foundation_boot.py`) + 1 SUMMARY | 2026-05-03 |
| 13 | 04 | ~17 min | 2 | 3 created (`schemas/cost.py`, `routes/cost.py`, `tests/test_cost_router.py`) + 1 modified (`routes/__init__.py`) + 1 SUMMARY | 2026-05-03 |
| 13 | 05 | ~30 min | 2 | 1 created (`tests/test_doctor.py`, 344 lines, 15 tests) + 2 modified (`cli/doctor.py` +289 lines for 6 new checks; `tests/test_telegram_setup.py` 8 → 14 drift fix) + 1 SUMMARY | 2026-05-03 |
| 13 | 06 | ~25 min | 2 | 1 created (`tests/test_phase13_e2e.py`, 179 lines, 2 tests) + 2 modified (`tests/test_pricing.py` replaced 2 pytest.skip stubs with working async tests; `tests/conftest.py` added db_session + seed_pricing fixtures with client-coexistence) + 1 SUMMARY | 2026-05-03 |
| Phase 13 P03 | 25min | 2 tasks | 6 files |
| 14 | 01 | ~19 min | 3 | 4 modified (`schemas/skills.py` +5 response models; `routes/skills.py` +4 path operations + 6 SQL constants + dual-path handler; `sse.py` +1 line; `tests/test_skills_router.py` +25 tests/+540 lines) + 2 planning doc verifications (`REQUIREMENTS.md` SKIL-04 + `ROADMAP.md` Phase 14 SC#1 — D-01 annotations) + 1 SUMMARY | 2026-05-03 |

## Session Continuity

Last session: 2026-05-03T22:09:00Z — Phase 14 Plan 01 complete (4 read-time-computed skill endpoints + dual-path attribution + SSE payload extension)
Stopped at: Phase 14 Plan 01 complete (Skills API endpoints) — ready for Plan 02 (frontend api.ts + queries)
Resume file: `.planning/phases/14-skills-api-page-panels/14-02-PLAN.md`

---

*v1.0 shipped 2026-04-28 — see `.planning/milestones/v1.0-ROADMAP.md` for full phase history.*
*v1.1 Skills & Cost Intelligence started 2026-05-02; roadmap drafted same day.*
