# Roadmap: Claude Mission Control

## Milestones

- ✅ **v1.0 MVP** — Phases 1–11, 47 plans (shipped 2026-04-28) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Skills & Cost Intelligence** — Phases 12–17 (in progress, started 2026-05-02)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–11) — SHIPPED 2026-04-28</summary>

- [x] Phase 1: Foundation & Database (7/7 plans) — completed 2026-04-25
- [x] Phase 2: Data Ingestion (6/6 plans) — completed 2026-04-26
- [x] Phase 3: Read-Only APIs (5/5 plans) — completed 2026-04-26
- [x] Phase 4: Stateful APIs (5/5 plans) — completed 2026-04-26
- [x] Phase 5: Frontend Shell & Design System (4/4 plans) — completed 2026-04-27
- [x] Phase 6: Observability & Activity Panels (5/5 plans) — completed 2026-04-27
- [x] Phase 7: Command Centre Panels (4/4 plans) — completed 2026-04-27
- [x] Phase 8: Mission Control Dispatcher (4/4 plans) — completed 2026-04-27
- [x] Phase 9: Telegram, Setup & Testing (5/5 plans) — completed 2026-04-28
- [x] Phase 10: Telegram Wiring Fixes (gap closure, 1/1 plan) — completed 2026-04-28
- [x] Phase 11: v1.0 Documentation & Env Polish (gap closure, 1/1 plan) — completed 2026-04-28

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### 🚧 v1.1 Skills & Cost Intelligence (In Progress)

**Milestone Goal:** Close v1 deferred skill panels (ACTV-04 / SKLP-02), light up the full skills observability suite (frequency, cost, latency, timeline), add skill-level alerts + session comparison, and lay the ANLYT-01 cost-estimation foundation.

- [x] **Phase 12: OTEL Skill Event Spike** - Verbatim live-data capture of `claude_code.skill_activated` event shape (P0 hard gate) (completed 2026-05-02)
- [ ] **Phase 13: Cost Foundation & Skill Ingest** - Pricing module, `pricing` table, cost engine, cost API, skill-name ingest column (backend-only, no UI)
- [ ] **Phase 14: Skills API & Page Panels** - Skills aggregation endpoints + four reactivated/new skill panels (TopSkills, SkillCostCard, SkillLatencyTable, SkillTimeline) + per-skill detail route
- [ ] **Phase 15: Alert Engine & UI** - Hysteresis-aware threshold + z-score detector, dispatcher hook, decisions/Telegram delivery, ack flow, CRUD + composer UI
- [ ] **Phase 16: Session Comparison** - Single-endpoint paired-metrics diff, two-up compare view, Cmd+K + sessions-table picker
- [ ] **Phase 17: Polish, Doctor & Tests** - Doctor warnings, parse_mode CI guard, callback round-trips, alert integration test, Playwright e2e, upgrade docs

## Phase Details

### Phase 12: OTEL Skill Event Spike
**Goal**: Confirm the literal OTEL skill event shape from real ingest data so all downstream phases lock against verified attribute keys, not docs paraphrase.
**Depends on**: Phase 11 (v1.0 close)
**Requirements**: SPIK-01
**Success Criteria** (what must be TRUE):
  1. User can read `.planning/research/SPIKE.md` and see verbatim SQL output of `SELECT event_name, body FROM otel_events WHERE event_name LIKE '%skill%' LIMIT 50` from a real Claude Code session.
  2. User can identify the literal attribute key for skill name (`skill_name` vs `skill.name` vs `name`) from the captured payload.
  3. User can confirm whether `duration_ms` is present on `claude_code.skill_activated` events and whether the JSONL `usage` block carries the cache TTL split (5m vs 1h).
  4. User can rely on the spike doc as the single reference cited by every downstream v1.1 phase plan — no further docs guessing.
**Plans:** 2/2 plans complete
Plans:
- [x] 12-01-PLAN.md — Wave 0/Wave 1 verbatim capture (otel_events + JSONL usage block) into SPIKE.md raw appendix _(complete 2026-05-02; Wave 1 yielded a negative finding — skill body fired, zero OTEL events landed; Plan 02 must author skill-scoped locks as TENTATIVE)_
- [x] 12-02-PLAN.md — Author SPIKE.md locks, pitfalls, cross-references, and changelog from raw appendix

### Phase 13: Cost Foundation & Skill Ingest
**Goal**: Stand up the cost-math primitive and skill-name ingest column so every subsequent panel computes dollars consistently from token counts and queries skills by indexed column, not JSON path.
**Depends on**: Phase 12 (spike output drives the literal ingest column key)
**Requirements**: ANLY-01, ANLY-02, ANLY-03, ANLY-04, ANLY-05, INGST-11, INGST-12, INGST-13
**Success Criteria** (what must be TRUE):
  1. User can call `cmc.pricing.compute_cost(model, input, output, cache_read, cache_create_5m, cache_create_1h)` from the Python REPL and receive a `Decimal` with no float drift, computed from `data/pricing.json` rates current as of the freeze date.
  2. User can hit `GET /api/cost/summary?range=` and `GET /api/cost/breakdown?dim=model|skill|project&range=` and receive read-time-computed cost figures that consistently account for cache tiers across all five seeded model SKUs.
  3. User can see "Rates as of YYYY-MM-DD" caption render on every cost figure, and `cmc doctor` warns when pricing rows are >30 days old or `unpriced_tokens > 0`.
  4. User can rely on `claude_code.skill_activated` events landing in `otel_events.attrs_skill_name` (indexed) via the existing `/v1/logs` endpoint — idempotent under cross-midnight re-ingest via `(session_id, otel_event_id)` UNIQUE constraint, in the same Alembic migration that adds the alert tables.
  5. User can trust that historical cost totals self-correct when pricing rows are added (effective_from / effective_until window logic) — no $ values stored in derived tables.
**Plans**: TBD

### Phase 14: Skills API & Page Panels
**Goal**: Reactivate v1.0 placeholder skill panels with real data and ship the full skills observability suite (frequency, cost, latency, timeline) plus a per-skill detail route.
**Depends on**: Phase 13 (cost engine + indexed skill column)
**Requirements**: SKIL-04, SKIL-05, SKIL-06, SKIL-07, ACTV-04, SKLP-02, SKLP-05, SKLP-06, SKLP-07
**Success Criteria** (what must be TRUE):
  1. User can hit `GET /api/skills?range=14d|30d`, `GET /api/skills/{name}/cost?range=`, `GET /api/skills/{name}/latency?range=`, and `GET /api/skills/{name}/runs?limit=` and receive top-N rollups, cost split, p50/p95/max latency + error rate (Pattern 4 SQL CTEs), and recent invocations with project/session context.
  2. User can see the TopSkills panel on the Activity page with top-N skills ranked by invocation count, 14d/30d range toggle, sparkline, and click-row drill-in to `/skills/$name` (closes ACTV-04 v1.0 placeholder).
  3. User can see the SkillCostCard on the Skills page rendering tokens (input/output/cache split) + dollars + cache context + 14-day trend with the "Rates as of" caption (closes SKLP-02 v1.0 placeholder).
  4. User can see the SkillLatencyTable sortable by p95 desc with `<Badge variant="warning">Low sample</Badge>` for skills below `MIN_LATENCY_SAMPLES=30`, and the SkillTimeline live stream filtered via `useFirehose({ event_name: 'claude_code.skill_activated' })` with skill-name filter and pause/resume control.
  5. User can navigate to `/skills/$name` (file-based dynamic route) and see per-skill cost + latency + recent runs with linked sessions on a single page.
**Plans**: TBD
**UI hint**: yes

### Phase 15: Alert Engine & UI
**Goal**: Ship a hysteresis-aware alert engine that runs inside the existing dispatcher tick, emits decisions + Telegram messages with stable dedup, auto-resolves when conditions clear, and is fully composable from a `/alerts` UI.
**Depends on**: Phase 14 (alert metrics need real skill rollups to test against)
**Requirements**: ALRT-01, ALRT-02, ALRT-03, ALRT-04, ALRT-05, ALRT-06, ALRT-07, ALRT-08, ALRT-09, ALRT-10, ALRT-11, ALRT-12
**Success Criteria** (what must be TRUE):
  1. User can create an alert rule (threshold or z-score) via `POST /api/alerts/rules`, see it persisted with first-class hysteresis fields (`threshold_fire`, `threshold_clear`, `min_dwell_seconds`, `min_samples`, `cooldown_seconds`, `spec_version`) + `params_json` overflow, and trust that `cmc/dispatcher/alerts.py::evaluate_alerts(db)` runs once per dispatcher tick after `stamp_tick` (try/except guarded so alert failures never kill the cycle).
  2. User can trust that one firing condition produces exactly one decision row + one Telegram message regardless of evaluation cycles, via the stable `dedup_key = f"alert:{rule_id}:{scope_key}"` reusing the existing `notification_log` UNIQUE(kind, entity_id, chat_id) constraint — and that anomaly rules in `insufficient_data` state suppress notifications during the 24h warm-up window after rule creation.
  3. User can ack an alert via the Telegram `ack_alert` callback verb (registered in `cmc/telegram/callback_verbs.py` central enum) and trust the suppression lasts 1h without clearing the underlying condition; alerts auto-resolve when the underlying metric clears via `decisions.status='answered'` with `answered_by='alert_engine'`.
  4. User can navigate to `/alerts` and see `AlertRulesList` + `AlertRuleForm` (composer with hysteresis fields exposed) at the locked 30s polling cadence, and hit the full CRUD endpoints (`GET/POST/PATCH/DELETE /api/alerts/rules`, `GET /api/alerts/events?range=`) for rules and firing history.
  5. User can trust that alert Telegram messages are plain-text only (no `parse_mode=`) and that the alert engine NEVER imports `cmc.dispatcher.tasks` or creates dispatcher tasks — alerts emit decisions only, the user gates action via existing autonomy controls.
**Plans**: TBD
**UI hint**: yes

### Phase 16: Session Comparison
**Goal**: Ship a single-round-trip paired-metrics session diff with deep-linkable URL state, a two-up compare view, and Cmd+K / sessions-table pickers — structured tabular only, no text-diff or raw-message exposure.
**Depends on**: Phase 13 (cost engine for token/cost delta)
**Requirements**: CMPR-01, CMPR-02, CMPR-03, CMPR-04, CMPR-05
**Success Criteria** (what must be TRUE):
  1. User can hit `GET /api/sessions/compare?a={sid}&b={sid}` and receive a single paired-metrics payload (skill-set diff, tool counts, token totals, computed cost from `cmc/cost/engine.py`, outcome row, duration) with no client-side aggregation.
  2. User can navigate to `/sessions/compare?a=&b=` (URL state as the source of truth, deep-linkable) and see a two-up `SessionCompareView` rendering summary metrics + skill-set diff via recharts side-by-side panels.
  3. User can pick the second session via Cmd+K "Compare with…" action (extends existing `CommandPalette`) or via a "Compare with…" row action on the sessions table.
  4. User can compare sessions up to 500 tool calls each; sessions exceeding the cap render a "session too long for full diff" fallback with summary metrics only.
  5. User can trust that comparison shows structured tabular data only — no text/code diff library, no raw LLM message content rendered.
**Plans**: TBD
**UI hint**: yes

### Phase 17: Polish, Doctor & Tests
**Goal**: Close v1.1 with the operational guarantees that keep the milestone honest — doctor checks, CI guards, integration coverage, e2e tests, and upgraded docs.
**Depends on**: Phase 15, Phase 16
**Requirements**: POLI-01, POLI-02, POLI-03, POLI-04, POLI-05, TEST-05
**Success Criteria** (what must be TRUE):
  1. User can run `cmc doctor` and see warnings for stale pricing rows (>30 days), `unpriced_tokens > 0`, and `OTEL_LOG_TOOL_DETAILS` env var unset.
  2. User can rely on a CI grep test that fails on any `parse_mode=` occurrence anywhere in `cmc/telegram/` (extends Phase 9-01 enforcement to alert paths) and on round-trip unit tests for every Telegram callback verb in `cmc/telegram/callback_verbs.py` (including the new `ack_alert`).
  3. User can rely on an integration test that creates an always-firing alert rule, runs the dispatcher one-shot, and asserts exactly one decision row + one notification_log row exist.
  4. User can rely on Playwright e2e coverage for `/alerts` (create rule → fire → ack) and `/sessions/compare?a=&b=` (pick two sessions → see diff).
  5. User can read updated `build-your-own-dashboard-guide.html` and the env-var reference covering pricing seed workflow, OTEL spike findings, and v1.1 panels.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 12 → 13 → 14 → 15 → 16 → 17 (Phase 16 may run in parallel with Phase 15 since both depend only on Phase 13/14).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Database | v1.0 | 7/7 | Complete | 2026-04-25 |
| 2. Data Ingestion | v1.0 | 6/6 | Complete | 2026-04-26 |
| 3. Read-Only APIs | v1.0 | 5/5 | Complete | 2026-04-26 |
| 4. Stateful APIs | v1.0 | 5/5 | Complete | 2026-04-26 |
| 5. Frontend Shell & Design System | v1.0 | 4/4 | Complete | 2026-04-27 |
| 6. Observability & Activity Panels | v1.0 | 5/5 | Complete | 2026-04-27 |
| 7. Command Centre Panels | v1.0 | 4/4 | Complete | 2026-04-27 |
| 8. Mission Control Dispatcher | v1.0 | 4/4 | Complete | 2026-04-27 |
| 9. Telegram, Setup & Testing | v1.0 | 5/5 | Complete | 2026-04-28 |
| 10. Telegram Wiring Fixes (gap closure) | v1.0 | 1/1 | Complete | 2026-04-28 |
| 11. v1.0 Documentation & Env Polish (gap closure) | v1.0 | 1/1 | Complete | 2026-04-28 |
| 12. OTEL Skill Event Spike | v1.1 | 2/2 | Complete   | 2026-05-02 |
| 13. Cost Foundation & Skill Ingest | v1.1 | 0/TBD | Not started | - |
| 14. Skills API & Page Panels | v1.1 | 0/TBD | Not started | - |
| 15. Alert Engine & UI | v1.1 | 0/TBD | Not started | - |
| 16. Session Comparison | v1.1 | 0/TBD | Not started | - |
| 17. Polish, Doctor & Tests | v1.1 | 0/TBD | Not started | - |

**v1.0 milestone shipped: 47/47 plans, 11/11 phases verified (9 base + 2 audit gap-closure).**
**v1.1 milestone in progress: 0/41 requirements implemented across 6 phases.**
