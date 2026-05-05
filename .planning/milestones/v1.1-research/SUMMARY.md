# Research Summary — v1.1 Skills & Cost Intelligence

**Project:** Claude Mission Control v1.1
**Domain:** Skill observability + cost intelligence + alerting + session comparison (additions to v1.0)
**Researched:** 2026-05-02
**Confidence:** HIGH on architecture/stack/pitfall patterns; MEDIUM on pricing numbers (verification gate required)

---

## Executive Summary

Claude Mission Control v1.1 is an incremental milestone layered on top of a fully-shipped v1.0 (FastAPI + SQLModel + SQLite WAL + TanStack + recharts + Telegram bridge). The four new capability areas — skill observability, cost intelligence, alerting, and session comparison — are all reachable using the existing stack with zero new external dependencies. Every backend feature is achievable via new internal modules (`cmc/pricing.py`, `cmc/alerts/detector.py`) and one Alembic migration (two new tables: `alert_rules`, `alert_events`; one new indexed column: `otel_events.attrs_skill_name`). No pip packages, no npm packages.

The most important structural finding is that the OTEL spike is the hard gate for the entire milestone. Research confirms the canonical event name is `claude_code.skill_activated` (not `_invoked` as the v1.0 PROJECT.md placeholder assumed), and the event already flows through the existing `/v1/logs` ingest path. However, the literal attribute key name (`skill_name` vs `skill.name` vs `name`) must be verified by running a one-time SQL query against live data before the ingest schema is locked. Alongside the spike, the cost foundation (ANLYT-01 — `cmc/pricing.py` with Decimal math, model-keyed pricing table, and pricing-number verification against `https://www.anthropic.com/pricing`) must land before any cost numbers render in the UI. These two items are jointly P0.

The critical architectural decision — that the alert engine lives inside the existing 120 s dispatcher tick, not as a new daemon — eliminates an entire class of operational complexity. Alerts emit decisions into the existing HITL queue and Telegram via the existing notifier; no new scheduler, no new launchd plist, no new process to monitor. Session comparison is a single backend endpoint (`GET /api/sessions/compare?a=&b=`) that returns a paired-metrics diff payload, with cost computed by the same `cmc/cost/engine.py` reused everywhere. The skill timeline is the existing SSE firehose filtered to `event_name=claude_code.skill_activated` — no new SSE endpoint.

---

## Key Findings

### Stack — Zero New External Dependencies

The v1.0 stack covers approximately 90% of v1.1. Every new capability is delivered by new *internal* modules, not new external packages. Key conclusions:

- **`cmc/pricing.py`** (hand-rolled, ~80 LOC, stdlib `Decimal`): preferred over LiteLLM (5 MB, lags 2-8 weeks on new models) and `tokencost` (PyPI, similar lag). Pricing numbers are MEDIUM confidence — must be verified against `https://www.anthropic.com/pricing` at requirements freeze before any dollar figure renders.
- **`cmc/alerts/detector.py`** (hand-rolled, ~150 LOC, stdlib `math`): rolling z-score over EWMA baseline (~50 LOC) + threshold comparator (~50 LOC). scipy/numpy/pyod/river/prophet are all unjustified at 50-rules-per-tick scale.
- **`recharts@3.8.1`** (already pinned): covers session-compare side-by-side panels. No `react-diff-view` / `git-diff-view` / `diff-match-patch` — session comparison is structured tabular data, not a text diff. **Verify the `3.8.1` pin is correct** — Context7 reports latest as `v3.3.0`; this may be a typo for `3.3.1`. Confirm before any chart work.
- **No new npm packages**: specifically no `react-diff-viewer-continued`, `react-window`, `numeral`, `currency.js`, `dinero.js`.
- **Cost stored as tokens, computed at read time** using `Decimal` (stdlib). Storing $ in the DB is rejected because pricing changes would silently corrupt historical totals.

Four verification gates must be cleared before locked requirements:
1. Pricing numbers from `https://www.anthropic.com/pricing` for all Claude models
2. `recharts@3.8.1` pin confirmation (typo vs real version)
3. `OTEL_LOG_TOOL_DETAILS=1` set in user's Claude Code environment
4. One-shot `SELECT json_extract(body, ...) FROM otel_events WHERE event_name='claude_code.skill_activated' LIMIT 100` to confirm literal attribute key names

### Features — 7 Categories, 12 Anti-Features, Clear MVP

Features map to 7 categories with a P0 spike gating all skill panels and a P0 cost foundation gating all cost panels. The dependency chain is:

```
Spike (claude_code.skill_activated confirmed)
    └──gates──> Categories 1-5 (all skill panels + alerts)

Category 7 (Cost Foundation, ANLYT-01)
    └──enables──> Categories 2, 5, 6, and firehose inline cost
```

**Must-have for v1.1 (table stakes):**
- Top-N skills by invocation count + range toggle + drill-in (closes ACTV-04)
- Skill cost: tokens + dollars + input/output split + cache context + 14-day trend (closes SKLP-02)
- Per-skill p50/p95/max latency + error rate + sortable + low-sample badge
- Skill timeline: SSE stream filtered to skill events + project context + filters + pause
- Threshold alerts (cost / error rate / latency) with Telegram + decisions queue + dedup/cooldown + UI composer
- Session comparison: two-up layout, skill-set diff, token/cost delta, outcome row, sessions-table selection
- Cost estimation foundation: `cmc/pricing.py`, `compute_cost()`, seed data, doctor check

**Defer to v1.2 (differentiators):**
- Per-project breakdown in skill rows, period-over-period deltas, "new this week" / "dormant" badges
- Anomaly detection (rolling mean +/- stddev) — goes after threshold alerts prove out
- Per-skill latency delta in session comparison, Cmd+K compare shortcut
- Monthly cost forecast

**The 12 anti-features (hard no, not scope creep):**
1. No multi-user / leaderboard features
2. No hard cost caps that block invocation — alerts only, user decides
3. No auto-pause / auto-remediation — decisions queue handles human action
4. No multi-channel notifications (Telegram + decisions queue only)
5. No 3+ way session comparison — pairwise only
6. No sub-30s polling — 30s lockstep; firehose is SSE
7. No auto-fetch of model pricing — manual seed + doctor warning
8. No SLO / error budget tracking — threshold alerts cover the legitimate need
9. No per-skill alert message templates — single plain-text format
10. No saved-comparison bookmarks — URL state is sufficient
11. No raw LLM message diff in comparison — metadata only
12. No post-hoc annotation / tagging of OTEL events — events are immutable

### Architecture — Maximize Reuse of Existing Patterns

The dominant architectural theme is extension without new primitives:

**Alert engine lives in the dispatcher:**
`cmc/dispatcher/alerts.py` exports `evaluate_alerts(db)`, called after `stamp_tick` in `run_one_cycle()`. Wrapped in `try/except` so alert failure never kills the dispatcher cycle. Zero new launchd jobs, zero new processes. Alert delivery reuses `notification_log` (new `kind='alert'`) and the existing notifier loop.

**Cost computed at read time:**
`cmc/cost/engine.py` joins `token_usage x pricing` using `effective_from`/`effective_until` window logic. No cost stamping at ingest (ingest must always return 200; adding a price lookup creates a new failure surface). Historical totals self-correct when pricing rows are updated.

**Skill timeline reuses the existing SSE firehose:**
`GET /api/firehose?event_name=claude_code.skill_activated` — the `event_name` filter is already implemented in `api/routes/system.py:336`. No new SSE endpoint.

**Session comparison is one backend endpoint:**
`GET /api/sessions/compare?a=&b=` returns a paired-metrics payload with diff computed server-side by `cmc/cost/engine.py`. URL params make links shareable and deep-linkable.

**Schema additions are minimal:**
- `alert_rules` table (NEW)
- `alert_events` table (NEW)
- `otel_events.attrs_skill_name` column + index (NEW, mirrors existing `attrs_mcp_server` pattern)
- No changes to the 15 existing tables

**New files (backend):** `cmc/cost/engine.py`, `cmc/pricing.py`, `cmc/dispatcher/alerts.py`, `cmc/api/routes/alerts.py`, `cmc/api/routes/cost.py`

**New files (frontend):** `routes/alerts.tsx`, `routes/sessions.compare.tsx`, `routes/skills.$name.tsx`, `components/panels/SessionCompareView.tsx`, `components/panels/SkillTimeline.tsx`

**Modified files (frontend):** `components/panels/SkillCostCard.tsx`, `components/panels/TopSkills.tsx` (replace existing v2 placeholders with real data)

### Critical Pitfalls — 19 Identified Across 7 Groups

All 19 pitfalls are mapped to phases. The top 8 with the highest implementation risk:

1. **Spike must produce verbatim event data (P0)** — building panels before actual attribute key names are confirmed causes cascading rewrites. Spike deliverable is a SQL result pasted verbatim; paraphrased names are insufficient. P1 ingest schema must not be locked until this doc exists.

2. **Skill name needs a canonical key of `(environment, name)`, not bare `name` (P1)** — personal and project skills can share the same bare name. Without the environment dimension, TopSkills rollups double-count. This must be in the original migration; retrofitting requires backfill.

3. **Pricing numbers externalized from day one (P2)** — inline Python constants like `MODEL_PRICES = {...}` silently go stale after every Anthropic pricing update. Externalize to `data/pricing.json`, surface an "as-of YYYY-MM-DD" caption on every cost figure, expose an `unpriced_tokens` counter in `doctor.py`.

4. **Cache token tiers must not be conflated (P1 + P2)** — `cache_create` covers both 5m (1.25x input rate) and 1h (2x input rate) writes. The P0 spike must answer whether the JSONL payload contains the TTL split. If yes, add `tokens_cache_create_5m` / `tokens_cache_create_1h` columns. If no, document the approximation.

5. **Alert flapping via single-threshold rules (P4)** — a threshold oscillating around the breakpoint fires repeatedly. Prevention: separate fire/clear thresholds (hysteresis), minimum re-fire interval (15 min), minimum dwell time (120 s default). The rule schema must include these fields from day one.

6. **Cold-start anomaly rules fire false alerts on day 1 (P4)** — z-score on 4 data points is meaningless. Every anomaly rule requires a `min_samples` field; rules in `insufficient_data` state are suppressed. 24h warm-up window on newly-created rules prevents trust-destroying false alerts on install day.

7. **Alert dedup must use a stable dedup_key without timestamps (P4)** — encoding `now()` into the dedup_key means `INSERT OR IGNORE` never blocks the second insert. Correct key is `alert:{rule_id}:{scope_key}`. One firing condition produces one decision row and one Telegram message regardless of how many evaluation ticks pass.

8. **Alert lifecycle must include auto-resolve and ack (P4)** — the v1.0 decisions queue accumulates without auto-resolve. When the underlying metric clears, the dispatcher writes `decisions.status='answered'` with `answered_by='alert_engine'`. The Telegram `ack_alert` callback suppresses re-notification for 1h without clearing the condition.

---

## Implications for Roadmap

### Suggested Build Order

**Phase 0 — OTEL Skill Event Spike** (hard prerequisite, ~1 day)
Run a real Claude Code session with skills enabled. Capture `/v1/logs` payloads and run `SELECT event_name, body FROM otel_events WHERE event_name LIKE '%skill%' LIMIT 50`. Paste verbatim results into `.planning/research/SPIKE.md`. Record the literal attribute key for skill name, the presence or absence of `duration_ms`, and whether the cache TTL split exists in the JSONL `usage` block. This doc is referenced by name in every downstream phase. Without it, P1 ingest schema is speculation.

**Phase 1 — Cost Foundation + Ingest Extension** (P0 capabilities, no UI yet)
Parallel track using Phase 0's output:
- `cmc/pricing.py` with Decimal math; verify pricing numbers against Anthropic pricing page before merge
- `pricing` table + Alembic migration with `effective_from`/`effective_until` support
- `cmc/cost/engine.py` (pure module, unit-testable in isolation)
- `GET /api/cost/summary` and `GET /api/cost/breakdown` (read-only endpoints)
- Extend `otel_events` ingest to extract `attrs_skill_name` with canonical `(environment, name)` key
- `otel_events.attrs_skill_name` column + index in the same migration
- Idempotent insert with `(session_id, otel_event_id)` UNIQUE key
- Addresses Pitfalls 2, 3, 4, 19

**Phase 2 — Four Skill Panels** (parallel-shippable once Phase 1 is done)
All four panels can be built simultaneously as they share the same ingest path and query pattern:
- TopSkills (closes ACTV-04): top-N by invocation count, range toggle, sparkline, drill-in
- SkillCostCard (closes SKLP-02): tokens + dollars + split + cache context + trend + "as-of" caption
- Per-skill latency + error rate: p50/p95/max (Pattern 4 SQL from `cmc/mcp/aggregator.py`), error %, low-sample badge (Pitfall 10), overhead vs total (Pitfall 11)
- SkillTimeline: `useFirehose({ event_name: 'claude_code.skill_activated' })`, existing SSE filter, no new endpoint
- Polling cadences in `lib/queries.ts`: 60s for rollups, SSE for timeline (Pitfall 15)
- Replace existing v2 placeholders in `TopSkills.tsx` and `SkillCostCard.tsx`
- Perf-validation gate: measure `/api/skills/{name}/runs` p95 on 30-day dataset; if >100ms, add materialized `skill_runs` table

**Phase 3 — Alerts Engine** (after Phase 1 + 2 data is present to test against)
Alerts need real data to be meaningful and tested:
- `alert_rules` + `alert_events` tables + migration
- `cmc/dispatcher/alerts.py` with `evaluate_alerts(db)` function
- Hook into `heartbeat.run_one_cycle()` after `stamp_tick` with `try/except` guard
- Rule schema: structural fields as first-class columns, `spec_version` for forward-compat (Pitfall 9)
- Hysteresis (separate fire/clear thresholds), minimum dwell time, `min_samples` gating for anomaly rules (Pitfalls 5, 6)
- Stable `dedup_key = alert:{rule_id}:{scope_key}` (Pitfall 7)
- Auto-resolve on metric-clear with `answered_by='alert_engine'` (Pitfall 8)
- `ack_alert` verb in `cmc/telegram/callback_verbs.py` central enum (Pitfall 17)
- Alert templates in `cmc/telegram/messages.py`, plain text only, no `parse_mode` (Pitfall 16)
- Alerts NEVER import `cmc.dispatcher` or `cmc.tasks` (Pitfall 18)
- Frontend: `routes/alerts.tsx`, `AlertRulesList`, `AlertRuleForm`, `useAlerts()` at 30s cadence

**Phase 3 (parallel) — Session Comparison**
Independent of alert work; only requires Phase 1 cost engine:
- `GET /api/sessions/compare?a=&b=` endpoint
- `SessionCompareView` + `routes/sessions.compare.tsx`
- URL state as source of truth; `?a=&b=` deep-linkable (Pitfall 13)
- Summary-by-default, row diff opt-in, hard cap at 500 tool calls (Pitfall 12)
- Cmd+K "Compare with..." palette action
- `useSessionCompare(a, b)` hook with no polling (fetch-on-demand)

**Phase 4 — Polish + Verification**
- Doctor checks: stale pricing warning, `unpriced_tokens > 0`, `OTEL_LOG_TOOL_DETAILS` not set
- CI grep test: `parse_mode=` anywhere in `cmc/telegram/` must fail (Pitfall 16)
- Round-trip unit test for every Telegram callback verb (Pitfall 17)
- Integration test: create a rule that always fires, run dispatcher oneshot, assert one decision row exists
- Upgrade docs, env-var reference for pricing seed, screenshot refresh

### Phase Ordering Rationale

- Phase 0 must be the literal first action because the attribute key name drives the ingest schema column name. Two researchers independently flagged this as the highest risk item.
- Phase 1 must precede Phase 2 because SkillCostCard depends on `cmc/cost/engine.py` and the `pricing` table. Building cost UI before the engine means rebuilding it.
- Phase 2 panels can be built in parallel because they share the same ingest path but don't depend on each other's output.
- Phase 3 alerts are explicitly last because anomaly detection requires a baseline (14-day history); threshold alerts are testable immediately but verification against real data is only possible once Phase 2 panels show real numbers.
- Session comparison is independent of the skill panels (uses existing session data + Phase 1 cost engine) and can be built in parallel with Phase 3 alert work.

### Research Flags

Phases needing deeper research during planning:
- **Phase 0 (Spike):** Literal attribute key names and JSONL cache TTL split must come from a live data capture. No further research can substitute for running the actual exporter.
- **Phase 1 (Pricing numbers):** The pricing constants in `cmc/pricing.py` require a live web lookup against `https://www.anthropic.com/pricing`. This MUST happen before the pricing module is merged.

Phases with well-documented patterns (skip research):
- **Phase 2 (Skill panels):** All patterns copy directly from v1.0 equivalents (Pattern 4 SQL, low-sample badge, polling cadences). No research phase needed.
- **Phase 3 (Alerts):** Alert engine antipatterns are fully specified in PITFALLS.md. Use the "looks done but isn't" checklist there as the acceptance criterion.
- **Phase 3 (Session comparison):** Side-by-side panels are direct recharts composition. Langfuse's Nov 2025 compare view is the validated reference.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero-new-deps conclusion verified against v1.0 codebase. Pricing shape HIGH; pricing numbers MEDIUM (verification gate required). recharts pin needs confirmation. |
| Features | HIGH | 4 reference dashboards (Datadog, Honeycomb, Langfuse, Vercel) + direct comparison against v1.0 conventions. Anti-feature list is explicit and complete. |
| Architecture | HIGH | Verified against fresh codebase map. Dispatcher integration, SSE reuse, and cost-at-read-time all verified against actual file line numbers. |
| Pitfalls (v1-integration) | HIGH | All integration pitfalls anchored to in-repo code (notifier.py, hitl.py, autonomy_gate.py, sse.py, queries.ts, CacheEfficiencyCard.tsx). |
| Pitfalls (skill ingest + cost math) | MEDIUM | OTEL event structure confirmed from docs mirror; literal attribute key names unverified against live data. Cache TTL split unverified. Pricing rates unverified. |

**Overall confidence:** HIGH on structure and approach, with three MEDIUM items requiring concrete verification gates before requirements freeze.

### Gaps to Address

- **Attribute key names** — resolve via P0 spike SQL query. If the key differs from `skill_name`, every downstream `attrs_skill_name` column reference changes.
- **JSONL cache TTL split** — resolve via P0 spike. If absent, document the cost approximation and add a MEDIUM confidence caption to the cost card.
- **Pricing numbers** — all five model SKUs must be fetched from `https://www.anthropic.com/pricing` before any dollar figure is shown to the user.
- **recharts pin correctness** — confirm with `cat frontend/package-lock.json | grep recharts`. If it's a typo for `3.3.1`, plan a controlled bump as part of v1.1 prep.
- **`OTEL_LOG_TOOL_DETAILS=1` environment variable** — confirm the user's local Claude Code has this set. Add a `cmc doctor` check.

---

## Sources

### Primary (HIGH confidence)
- `Context7 /ericbuess/claude-code-docs` — `monitoring-usage.md`: confirmed `claude_code.skill_activated` event name, attributes, `OTEL_LOG_TOOL_DETAILS=1` requirement, `claude_code.tool_result` as failure signal, `prompt.id` correlation attribute
- `Context7 /anthropics/claude-code` — verified complete metrics list (no skill metric counter exists; skills are events-only)
- `Context7 /anthropics/anthropic-sdk-python` — confirmed no `models.pricing` API; hand-rolled pricing is the only path
- `backend/cmc/dispatcher/heartbeat.py` — confirmed 120s tick is the right hook point for alert evaluation
- `backend/cmc/api/routes/system.py:336` — confirmed `event_name` query param already supported on `/api/firehose`
- `backend/cmc/db/models/otel_events.py:36` — confirmed `idx_otel_events_event_name_ts` index already in place
- `backend/cmc/ingest/otel_parser.py` — confirmed `iter_attrs` + `extract_mcp_attrs` pattern for indexed-attribute extraction
- `frontend/src/lib/queries.ts` — confirmed polling cadence ladder (5/10/15/30/60/120/300s)
- `frontend/src/components/panels/CacheEfficiencyCard.tsx:55` — confirmed low-sample badge convention
- `backend/cmc/telegram/notifier.py` — confirmed `kind` field is open-text; dedup via UNIQUE(kind, entity_id, chat_id)

### Secondary (MEDIUM confidence)
- `Context7 /ericbuess/claude-code-docs` `agent-sdk__cost-tracking.md` — confirmed `ModelUsage.costUSD` is a "client-side estimate"; pricing shape confirmed; exact numbers NOT confirmed
- `.planning/codebase/CONCERNS.md` — confirmed v1.0 tech debt items that v1.1 must not worsen

### Verification gates (not yet resolved)
- `https://www.anthropic.com/pricing` — pricing numbers for all Claude model SKUs (web access not available during research)
- Live `otel_events` SQL query — literal attribute key names for `claude_code.skill_activated`
- `frontend/package-lock.json` — recharts `3.8.1` pin confirmation

---

*Research completed: 2026-05-02*
*Ready for roadmap: yes, pending four verification gates (pricing numbers, recharts pin, OTEL attribute key names, OTEL_LOG_TOOL_DETAILS env var)*
