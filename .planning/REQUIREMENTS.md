# Requirements: Claude Mission Control v1.1 Skills & Cost Intelligence

**Defined:** 2026-05-02
**Core Value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, queue and approve tasks, and kill runaway sessions — all from one browser tab.
**Milestone goal:** Close v1 deferred skill panels (ACTV-04 / SKLP-02), light up the full skills observability suite (frequency, cost, latency, timeline), add skill-level alerts + session comparison, and lay the ANLYT-01 cost-estimation foundation.

## v1.1 Requirements

### Spike (P0 hard gate)

- [x] **SPIK-01**: User can confirm via `.planning/research/SPIKE.md` the literal `claude_code.skill_activated` event name + attribute key (`skill_name` vs `skill.name` vs `name`) + presence/absence of `duration_ms` + JSONL cache TTL split (5m vs 1h) — captured from real OTEL data via `SELECT event_name, body FROM otel_events WHERE event_name LIKE '%skill%' LIMIT 50`. Verbatim SQL output, not paraphrased.

### Cost Foundation (ANLYT-01)

- [x] **ANLY-01**: User can rely on `cmc/pricing.py` exposing `compute_cost(model, input, output, cache_read, cache_create_5m, cache_create_1h) -> Decimal` with stdlib math (no float drift) and pricing seeded from `data/pricing.json` (delivered Phase 13 Plan 01 + verified Plan 06 — REPL-import smoke `test_phase13_repl_import_compute_cost`)
- [x] **ANLY-02**: User can verify all 5 model SKUs (`claude-opus-4-7`, `claude-opus-4-7[1m]`, `claude-sonnet-4-6`, `claude-sonnet-4-6[1m]`, `claude-haiku-4-5`) seeded with input/output/cache-tier rates fetched from `https://www.anthropic.com/pricing` on 2026-05-02 (or freeze date) (delivered Phase 13 Plan 01; idempotency proven Plan 06 — `test_seed_loader_round_trip`)
- [x] **ANLY-03**: User can rely on a `pricing` table with `effective_from` / `effective_until` columns so historical cost totals self-correct when pricing rows are added; never store cost as $ in derived tables (delivered Phase 13 Plan 01 + Plan 02 schema; window self-correction proven Plan 06 — `test_pricing_window_self_correcting`)
- [x] **ANLY-04**: User can hit `GET /api/cost/summary?range=` and `GET /api/cost/breakdown?dim=model|skill|project&range=` for read-time-computed cost figures with consistent cache-tier accounting
- [x] **ANLY-05**: User can see "Rates as of YYYY-MM-DD" caption on every cost figure rendered in the UI; doctor.py warns when pricing rows are >30 days old or `unpriced_tokens > 0` (backend portion delivered Phase 13 Plan 04 freshness endpoint + Plan 05 doctor sensors; UI caption deferred to Phase 14 panels)

### Skill Ingest Extension

- [x] **INGST-11**: User can rely on the existing `/v1/logs` OTLP endpoint to extract `attrs_skill_name` from `claude_code.skill_activated` events into a new indexed column on `otel_events`, mirroring the existing `attrs_mcp_server` / `attrs_mcp_tool` pattern (delivered Phase 13 Plan 03; e2e proven Plan 06 — `test_phase13_full_trace`)
- [x] **INGST-12**: User can rely on a single Alembic migration (`0002_v1_1_alerts_and_skills.py`) that adds `otel_events.attrs_skill_name` column + index in the same change as the new alert tables (delivered Phase 13 Plan 02, 2026-05-03 — commit 2f30a66)
- [x] **INGST-13**: User can rely on idempotent skill-event ingestion via `(session_id, otel_event_id)` UNIQUE constraint with `INSERT OR IGNORE`; cross-midnight late arrivals absorbed by 00:30 re-aggregation (delivered Phase 13 Plan 02 UNIQUE + Plan 03 on_conflict_do_nothing; e2e dedup proven Plan 06 — `test_phase13_full_trace` step 4)

### Skills API

- [ ] **SKIL-04**: User can hit `GET /api/skills/usage?range=14d|30d` returning top-N skills by invocation count + sparkline data (deviation D-01: avoid collision with existing catalog endpoint /api/skills consumed by SkillsRegistry.tsx)
- [ ] **SKIL-05**: User can hit `GET /api/skills/{name}/cost?range=` returning tokens (input/output/cache split) + computed dollars + 14-day trend
- [ ] **SKIL-06**: User can hit `GET /api/skills/{name}/latency?range=` returning p50/p95/max latency + error rate + sample count, computed via Pattern 4 SQL CTEs (window functions)
- [ ] **SKIL-07**: User can hit `GET /api/skills/{name}/runs?limit=` returning recent invocations with project/session context

### Skills Page Panels

- [ ] **ACTV-04** (reactivated from v1.0 placeholder): User can see TopSkills activity-page panel with top-N skills by invocation count, range toggle (14d/30d), sparkline, and drill-in to `/skills/$name`
- [ ] **SKLP-02** (reactivated from v1.0 placeholder): User can see SkillCostCard on Skills page with tokens + dollars + input/output split + cache context + 14-day trend + "Rates as of" caption
- [ ] **SKLP-05**: User can see SkillLatencyTable with p50/p95/max + error rate per skill, sortable by p95, with `<Badge variant="warning">Low sample</Badge>` (mirrors `CacheEfficiencyCard.tsx:55`) when sample count below `MIN_LATENCY_SAMPLES=30`
- [ ] **SKLP-06**: User can see SkillTimeline panel as a live stream of skill invocations with project/session context, filter by skill name, and pause/resume control — reuses `useFirehose({ event_name: 'claude_code.skill_activated' })` (no new SSE channel)
- [ ] **SKLP-07**: User can navigate to `/skills/$name` file-based route showing per-skill detail (cost + latency + recent runs) with linked sessions

### Alert Engine

- [ ] **ALRT-01**: User can rely on a new `alert_rules` SQLModel table with structural columns (`rule_id`, `name`, `kind`, `metric`, `threshold_fire`, `threshold_clear`, `min_dwell_seconds`, `min_samples`, `cooldown_seconds`, `enabled`, `spec_version`) plus `params_json` overflow for kind-specific config
- [ ] **ALRT-02**: User can rely on a new `alert_state` table tracking `(rule_id, scope_key)` lifecycle (`firing` / `clear` / `acked` / `insufficient_data`) for hysteresis and dedup
- [ ] **ALRT-03**: User can rely on `cmc/alerts/detector.py` exposing `evaluate(rule, db) -> AlertSignal` with hand-rolled threshold comparator (~50 LOC) and rolling z-score over EWMA baseline (~50 LOC, stdlib `math` only)
- [ ] **ALRT-04**: User can rely on `cmc/dispatcher/alerts.py::evaluate_alerts(db)` invoked once per dispatcher tick from `cmc/dispatcher/heartbeat.py::run_one_cycle()` after `stamp_tick`, wrapped in `try/except` so alert failures never kill the dispatcher cycle
- [ ] **ALRT-05**: User can trust that anomaly rules in `insufficient_data` state (sample count < `min_samples`) suppress notifications during a 24h warm-up window after rule creation
- [ ] **ALRT-06**: User can trust that one firing condition produces at most one decision row + one Telegram message regardless of evaluation cycles, via stable `dedup_key = f"alert:{rule_id}:{scope_key}"` (no timestamps in key) reusing the existing `notification_log` UNIQUE(kind, entity_id, chat_id) constraint
- [ ] **ALRT-07**: User can trust that alerts auto-resolve when the underlying metric clears: dispatcher writes `decisions.status='answered'` with `answered_by='alert_engine'`; reuses HITL queue lifecycle
- [ ] **ALRT-08**: User can ack an alert via Telegram callback verb `ack_alert` (registered in `cmc/telegram/callback_verbs.py` central enum) which suppresses re-notification for 1h without clearing the underlying condition
- [ ] **ALRT-09**: User can hit `GET /api/alerts/rules` + `POST /api/alerts/rules` + `PATCH /api/alerts/rules/{id}` + `DELETE /api/alerts/rules/{id}` for full CRUD, plus `GET /api/alerts/events?range=` for firing history
- [ ] **ALRT-10**: User can navigate to `/alerts` route showing `AlertRulesList` + `AlertRuleForm` (composer with hysteresis fields exposed) with 30s polling cadence
- [ ] **ALRT-11**: User can trust that alert Telegram messages are plain-text only (NO `parse_mode=`); enforced by extending the existing `inspect.signature()` grep test from Phase 9-01 to cover `cmc/telegram/messages.py` alert paths
- [ ] **ALRT-12**: User can trust that the alert engine NEVER imports `cmc.dispatcher.tasks` or creates dispatcher tasks directly — alerts emit decisions only, the user gates action via existing autonomy controls

### Session Comparison

- [ ] **CMPR-01**: User can hit `GET /api/sessions/compare?a={sid}&b={sid}` returning paired metrics payload (skill set diff, tool counts, token totals, computed cost from `cmc/cost/engine.py`, outcome row, duration) — single round-trip, no client-side aggregation
- [ ] **CMPR-02**: User can navigate to `/sessions/compare?a=&b=` (URL state as source of truth, deep-linkable) showing a two-up `SessionCompareView` with summary metrics + skill-set diff
- [ ] **CMPR-03**: User can pick the comparison target via Cmd+K "Compare with…" action (extends existing `CommandPalette`) and via a "Compare with…" row action on the sessions table
- [ ] **CMPR-04**: User can compare sessions up to 500 tool calls each; sessions exceeding the cap show a "session too long for full diff" fallback with summary metrics only
- [ ] **CMPR-05**: User can see structured tabular comparison only — recharts side-by-side panels, NOT a text/code diff library; raw LLM message content is excluded by design

### Polish, Doctor, Tests

- [ ] **POLI-01**: User can run `cmc doctor` and see warnings for stale pricing rows (>30 days), `unpriced_tokens > 0`, and `OTEL_LOG_TOOL_DETAILS` env var unset (which would mask plugin/marketplace skill attrs)
- [ ] **POLI-02**: User can rely on a CI grep test that fails on any `parse_mode=` occurrence anywhere in `cmc/telegram/` (extends Phase 9-01 enforcement to alert paths)
- [ ] **POLI-03**: User can rely on round-trip unit tests for every Telegram callback verb in `cmc/telegram/callback_verbs.py` (covers new `ack_alert` verb)
- [ ] **POLI-04**: User can rely on an integration test that creates an always-firing alert rule, runs the dispatcher one-shot, and asserts exactly one decision row + one notification_log row exist (covers Pitfalls 5/6/7)
- [ ] **TEST-05**: User can rely on Playwright e2e coverage for `/alerts` (create rule → fire → ack) and `/sessions/compare?a=&b=` (pick two sessions → see diff)
- [ ] **POLI-05**: User can rely on updated docs (`build-your-own-dashboard-guide.html`, env-var reference) covering pricing seed workflow, OTEL spike findings, and v1.1 panels

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Skill Differentiators (v1.2 polish)

- **SKLP-08**: Per-project breakdown nested in skill rows ("This skill ran 14× across 3 projects, mostly mission-control")
- **SKLP-09**: Period-over-period delta arrows ("Top skill +47%/−12% vs prior 14d")
- **SKLP-10**: "New this week" / "Dormant" badges on skill rows
- **SKLP-11**: Per-skill latency overhead breakdown (skill-only vs total = sum of underlying tool durations)

### Cost Differentiators

- **ANLY-06**: Monthly cost forecast (linear extrapolation from current month's run-rate)
- **ANLY-07**: Per-project cost breakdown card on Activity page

### Alert Differentiators

- **ALRT-13**: Anomaly detection (rolling mean ± stddev with `min_samples` gate) — ships after threshold alerts prove out
- **ALRT-14**: NL-authored alert rules ("alert me when daily cost exceeds $20") via Haiku, mirroring existing NL-cron pattern

### Compare Differentiators

- **CMPR-06**: Per-skill latency delta in compare view
- **CMPR-07**: Cmd+K "Compare with previous session" shortcut

### Other v2 Backlog (carried from v1.0)

- **PLAT-01**: Linux/systemd support (currently macOS-only)
- **AUTO-01..03**: NL schedules beyond cron, auto-retry, task dependencies

## Out of Scope

Explicitly excluded. Documented to prevent scope creep. (Anti-features from research, locked.)

| Feature | Reason |
|---------|--------|
| Multi-user / leaderboard skills | Single-user tool by design — community-style features off-mission |
| Hard cost caps that block invocation | Alerts only; user owns the budget decision, dashboard is a sensor not an actuator |
| Auto-pause / auto-remediation on alert | Decisions queue handles human action; "alerts are sensors, not actuators" — alert engine never imports dispatcher.tasks |
| Multi-channel notifications (Slack, email, SMS) | Telegram + decisions queue only — keeps notifier surface tight |
| 3+ way session comparison | Layout collapses; Linear/Honeycomb/Langfuse all stop at 2 |
| Sub-30s polling for skill panels | 30s lockstep with existing observability cadence; firehose covers live needs |
| Auto-fetch of model pricing from Anthropic page | Manual seed + doctor warning — auto-scraping a marketing page is fragile |
| SLO / error budget tracking | Threshold alerts cover the legitimate single-user need; SLO machinery is multi-team scope |
| Per-skill alert message templates | Single plain-text format — keeps notifier simple, avoids parse_mode regression risk |
| Saved-comparison bookmarks | URL state is sufficient; bookmarking adds storage + UI for low value |
| Raw LLM message diff in comparison | Metadata only — full message diff is privacy-leaky and visually overwhelming |
| Post-hoc annotation / tagging of OTEL events | Events are immutable; annotations belong on derived rollups, not raw telemetry |
| Cost stamping at ingest time | Read-time only — `/v1/logs` MUST always return 200 (Pitfall 4); price-lookup adds failure surface; pricing edits would force backfill |
| Cost stored as $ in DB | Tokens stored, $ computed at read time — pricing changes self-correct historical totals |

## Traceability

Which phases cover which requirements. Populated by gsd-roadmapper on 2026-05-02.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SPIK-01 | Phase 12 | Complete |
| ANLY-01 | Phase 13 | Complete (Plan 01 + Plan 06 REPL smoke — 2026-05-03) |
| ANLY-02 | Phase 13 | Complete (Plan 01 + Plan 06 round-trip test — 2026-05-03) |
| ANLY-03 | Phase 13 | Complete (Plan 01 + Plan 02 schema + Plan 06 window self-correction test — 2026-05-03) |
| ANLY-04 | Phase 13 | Complete |
| ANLY-05 | Phase 13 | Complete backend (Plan 04 freshness + Plan 05 doctor; UI caption deferred to Phase 14) |
| INGST-11 | Phase 13 | Complete (Plan 03 + Plan 06 e2e — 2026-05-03) |
| INGST-12 | Phase 13 | Complete (Plan 02 — 2f30a66, 2026-05-03) |
| INGST-13 | Phase 13 | Complete (Plan 02 UNIQUE + Plan 03 on_conflict_do_nothing + Plan 06 e2e dedup — 2026-05-03) |
| SKIL-04 | Phase 14 | Pending |
| SKIL-05 | Phase 14 | Pending |
| SKIL-06 | Phase 14 | Pending |
| SKIL-07 | Phase 14 | Pending |
| ACTV-04 | Phase 14 | Pending |
| SKLP-02 | Phase 14 | Pending |
| SKLP-05 | Phase 14 | Pending |
| SKLP-06 | Phase 14 | Pending |
| SKLP-07 | Phase 14 | Pending |
| ALRT-01 | Phase 15 | Pending |
| ALRT-02 | Phase 15 | Pending |
| ALRT-03 | Phase 15 | Pending |
| ALRT-04 | Phase 15 | Pending |
| ALRT-05 | Phase 15 | Pending |
| ALRT-06 | Phase 15 | Pending |
| ALRT-07 | Phase 15 | Pending |
| ALRT-08 | Phase 15 | Pending |
| ALRT-09 | Phase 15 | Pending |
| ALRT-10 | Phase 15 | Pending |
| ALRT-11 | Phase 15 | Pending |
| ALRT-12 | Phase 15 | Pending |
| CMPR-01 | Phase 16 | Pending |
| CMPR-02 | Phase 16 | Pending |
| CMPR-03 | Phase 16 | Pending |
| CMPR-04 | Phase 16 | Pending |
| CMPR-05 | Phase 16 | Pending |
| POLI-01 | Phase 17 | Pending |
| POLI-02 | Phase 17 | Pending |
| POLI-03 | Phase 17 | Pending |
| POLI-04 | Phase 17 | Pending |
| POLI-05 | Phase 17 | Pending |
| TEST-05 | Phase 17 | Pending |

**Coverage:**
- v1.1 requirements: **41 total** (initial REQUIREMENTS.md header said 38; verified count by REQ-ID grep is 41 — header corrected during roadmap creation)
- Mapped to phases: **41**
- Unmapped: **0** ✓

**Per-phase requirement count:**

| Phase | Reqs | Categories |
|-------|------|------------|
| Phase 12: OTEL Skill Event Spike | 1 | Spike |
| Phase 13: Cost Foundation & Skill Ingest | 8 | Cost Foundation (5) + Skill Ingest (3) |
| Phase 14: Skills API & Page Panels | 9 | Skills API (4) + Skills Page Panels (5) |
| Phase 15: Alert Engine & UI | 12 | Alert Engine (12) |
| Phase 16: Session Comparison | 5 | Session Comparison (5) |
| Phase 17: Polish, Doctor & Tests | 6 | Polish (5) + TEST-05 (1) |
| **Total** | **41** | |

---

*Requirements defined: 2026-05-02*
*Last updated: 2026-05-02 — traceability section populated by gsd-roadmapper (41/41 mapped)*
