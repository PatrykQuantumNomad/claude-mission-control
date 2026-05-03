---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Skills & Cost Intelligence
status: completed
stopped_at: "Phase 13 Plan 02 complete; ready to execute Plan 03 (ingest read-side BUG-B fix + JSONL parser cache split + INGST-13 dedup wiring)"
last_updated: "2026-05-03T12:34:19Z"
last_activity: 2026-05-03 — Phase 13 Plan 02 complete; ready for Plan 03 (ingest read-side fixes)
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 8
  completed_plans: 5
  percent: 63
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-02 — v1.1 Skills & Cost Intelligence roadmap created)

**Core value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, queue and approve tasks, and kill runaway sessions — all from one browser tab.

**Current focus:** v1.1 Skills & Cost Intelligence — Phase 13 underway (Plans 01 + 02 complete; cost-math primitive + 0002 migration landed).

## Current Position

Phase: 13 of 17 (Cost Foundation & Skill Ingest) — **IN PROGRESS**
Plan: 13-02 complete (commits ed6ec56 + 2f30a66); next plan is 13-03 (ingest read-side BUG-B fix + JSONL parser cache split + INGST-13 dedup wiring on the now-existing UNIQUE constraint)
Status: Phase 13 Plan 02 complete — single 0002_v1_1_alerts_and_skills Alembic migration shipped: otel_events.attrs_skill_name + otel_event_id + (session_id, otel_event_id) UNIQUE; sessions/token_usage cache TTL split cols; pricing table with seed_hash; alert_rules + alert_state final-shape (Phase 15 ships zero migration); BUG-A read-side json_each fix at observability.py; BUG-B backfill recovered 13,998 of 14,000 production session_id NULLs. 3 migration tests + full backend suite green (399/399, 2 skipped, 0 failed).
Last activity: 2026-05-03 — Phase 13 Plan 02 complete; ready for Plan 03 (ingest read-side fixes)

Progress: [██████░░░░] 63% (Plans 01-02 of 6 complete; Phase 12 fully complete + Phase 13 Plans 01 + 02)

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

## Session Continuity

Last session: 2026-05-03T12:34:19Z — Phase 13 Plan 02 complete (single 0002 Alembic migration + BUG-A read-side fix + BUG-B backfill recovering 13,998 of 14,000 production NULL session_id rows)
Stopped at: Phase 13 Plan 02 complete; ready to execute Plan 03 (ingest read-side BUG-B fix + JSONL parser cache split + INGST-13 dedup wiring)
Resume file: None — next action is `/gsd-execute-plan 13 03` — Plan 03 wires the prospective fixes against the now-existing schema (otel_events.attrs_skill_name + otel_event_id + UNIQUE constraint; sessions/token_usage cache TTL split columns; pricing table for cost-engine reads). The 0002 migration is the load-bearing contract — every subsequent Phase 13 plan reads against it.

---

*v1.0 shipped 2026-04-28 — see `.planning/milestones/v1.0-ROADMAP.md` for full phase history.*
*v1.1 Skills & Cost Intelligence started 2026-05-02; roadmap drafted same day.*
