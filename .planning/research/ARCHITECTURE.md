# Architecture Research — v1.1 Skills & Cost Intelligence

**Domain:** Local Claude Code dashboard — adding skill observability, cost intelligence, alerting, and session comparison to a shipped FastAPI + SQLModel + TanStack monolith
**Researched:** 2026-05-02
**Confidence:** HIGH for integration with existing patterns (verified against fresh codebase map). MEDIUM for skill event source (depends on a Phase 0 spike — Claude Code's `claude_code.skill_invoked` event was confirmed absent at v1.0 ship time; whether it exists today is the spike question).

---

## TL;DR

- **No new tables for skill events.** Reuse `otel_events` (extend `ingest.py` recognition) and add a derived/materialized `skill_runs` view-or-table only if rollup queries on `otel_events` JSON prove too slow under measured load — defer that decision until Phase 1 spike measures it.
- **Two new tables required** — `pricing` (model-source unit prices) and `alert_rules` (user-authored thresholds). Plus one optional `alert_events` table for de-dup history (mirrors `notification_log`).
- **Cost is computed at read-time, with a stamping fast-path on the daily `token_usage` rollup.** Per-event stamping at ingest is rejected — pricing changes would require backfills, and OTLP ingest must stay fast and crash-tolerant (Pitfall 4).
- **Alert engine lives in the dispatcher process** as a new `cmc/dispatcher/alerts.py` module that runs at the start of every `run_one_cycle()` (already 120 s cadence, already has DB engine, already has a heartbeat). It emits `Decision` rows + Telegram via the existing `notifier`. **No new launchd job, no new daemon.**
- **Session comparison is backend-side** — new endpoint `GET /api/sessions/compare?a=...&b=...` returns a paired-metrics payload; client renders a two-column diff. Picker is **Cmd+K** reusing the existing `CommandPalette` shell, with `?compare=a,b` URL params for shareable links.
- **Skill timeline reuses the existing SSE firehose** with a server-side `event_name=claude_code.skill_invoked` filter (the firehose already accepts `event_name` as a query param — see `system.py:336`). No new SSE endpoint.

---

## System Overview (v1.1 deltas only)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                     React SPA (TanStack Router)                        │
│  /  CommandPage     /activity  ActivityPage                            │
│  /skills  SkillsPage   ←── existing                                    │
│  /skills/$name  SkillDetailPage           ←── NEW (file-based route)   │
│  /sessions/compare  SessionCompareView     ←── NEW (URL ?a=&b=)        │
│  /alerts  AlertRulesPage                  ←── NEW                      │
└──────────┬──────────────────────────────────────────────────┬──────────┘
           │  HTTP REST + SSE (event_name filter)             │
           ▼                                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│              FastAPI Application  `backend/cmc/app/factory.py`         │
│   /api/skills/{name}/runs          ←── NEW   (rollup)                  │
│   /api/skills/{name}/timeline      ←── NEW   (paginated event list)    │
│   /api/skills/{name}/cost          ←── NEW   (cost rollup)             │
│   /api/cost/summary                ←── NEW   (top-level KPIs)          │
│   /api/cost/breakdown              ←── NEW   (by model/source/skill)   │
│   /api/sessions/compare            ←── NEW   (a vs b diff payload)     │
│   /api/alerts                      ←── NEW   (CRUD rules)              │
│   /api/alerts/{id}/test            ←── NEW   (dry-run a rule)          │
│   /api/firehose?event_name=claude_code.skill_invoked  ←── REUSE        │
│   /v1/logs                         ←── EXTEND ingest.py for skills     │
└────────┬─────────────────────────┬──────────────────────────┬──────────┘
         │                         │                          │
         ▼                         ▼                          ▼
┌─────────────────┐  ┌──────────────────────┐  ┌──────────────────────────┐
│  SQLite DB      │  │  Ingest scheduler    │  │  Dispatcher (launchd)    │
│  +pricing       │  │  (no change for v1.1)│  │  + cmc/dispatcher/alerts │
│  +alert_rules   │  │                      │  │    runs FIRST in cycle,  │
│  +alert_events  │  │                      │  │    before claim/sweep    │
│  (optional)     │  │                      │  │  + writes Decision rows  │
└─────────────────┘  └──────────────────────┘  │    & lets notifier send  │
                                                └──────────────────────────┘
```

---

## Component Responsibilities (new + modified)

| Component | New / Modified | File | Responsibility |
|-----------|----------------|------|----------------|
| Skill event recognition | **MODIFIED** | `backend/cmc/api/routes/ingest.py` | When `event_name == "claude_code.skill_invoked"`, also extract `attrs.skill_name` into `OtelEvent.body` (already JSON; no schema change). Optionally promote `skill_name` to a dedicated indexed column in a follow-up if query latency demands. |
| `Pricing` model | **NEW** | `backend/cmc/db/models/pricing.py` | `(model, source, unit_kind, price_per_million_tokens, effective_from, effective_until)` — supports historical price changes without backfilling existing rows. |
| `AlertRule` model | **NEW** | `backend/cmc/db/models/alert_rules.py` | Row-per-user-rule. Columns: `name`, `metric` (enum-as-text), `comparator`, `threshold`, `window_minutes`, `severity`, `notify_telegram`, `notify_decision`, `enabled`, timestamps. |
| `AlertEvent` model | **NEW (optional)** | `backend/cmc/db/models/alert_events.py` | Append-only firing log + dedup ledger. Mirrors `notification_log` shape. Defer if `notification_log.kind='alert'` reuse turns out cleaner (see Phase 5). |
| Cost engine | **NEW** | `backend/cmc/cost/engine.py` | Pure module. Function `price_tokens(model, source, tokens, at: datetime) -> float`; `summarize(...)` aggregates over `token_usage`. Imported by routes; no I/O. |
| Cost router | **NEW** | `backend/cmc/api/routes/cost.py` | `/api/cost/summary`, `/api/cost/breakdown` — read-time SQL groupbys against `token_usage` joined with `pricing`. |
| Skills router (extended) | **MODIFIED** | `backend/cmc/api/routes/skills.py` | Add `GET /skills/{name}/runs`, `/timeline`, `/cost`. Path-traversal regex (`_SKILL_NAME_RE`) reuse — no new validation logic. |
| Sessions router (extended) | **MODIFIED** | `backend/cmc/api/routes/sessions.py` | Add `GET /sessions/compare?a=...&b=...`. Two `session_id` query params validated against existing 64-char primary-key shape. |
| Alerts router | **NEW** | `backend/cmc/api/routes/alerts.py` | CRUD on `alert_rules`. `POST /alerts/{id}/test` runs the rule once against current DB and returns whether it would fire (does NOT write a Decision/Telegram). |
| Alert engine | **NEW** | `backend/cmc/dispatcher/alerts.py` | Function `evaluate_alerts(db_session)` runs at the top of `run_one_cycle()`. For each enabled rule, executes the rule's metric query, checks threshold, writes `Decision` row + `notification_log` row (kind="alert", entity_id=rule_id+window_start) so the existing notifier loop sends it. Idempotent via `notification_log` UNIQUE constraint (Pitfall P6 — same write pattern). |
| Skill detail route | **NEW** | `frontend/src/routes/skills/$name.tsx` | TanStack file-based route. Renders `SkillDetailView` with cost, runs, timeline panels. |
| Session compare route | **NEW** | `frontend/src/routes/sessions.compare.tsx` | Reads `?a=&b=` from search params; renders `SessionCompareView`. |
| Alert rules route | **NEW** | `frontend/src/routes/alerts.tsx` | List + form for `alert_rules`. |
| Cost panels | **NEW** | `frontend/src/components/panels/CostSummary.tsx`, `CostBreakdown.tsx`, `CostPerSkill.tsx` | Read from `useCostSummary()` / `useCostBreakdown()` hooks. |
| Replace v2 placeholders | **MODIFIED** | `frontend/src/components/panels/SkillCostCard.tsx`, `TopSkills.tsx` | These already exist as placeholders (`SCOPED TO V2`); replace empty-state with real data once `/api/skills/{name}/cost` and `/api/skills/usage` are live. |
| Skill timeline panel | **NEW** | `frontend/src/components/panels/SkillTimeline.tsx` | Uses `useFirehose({ event_name: 'claude_code.skill_invoked' })`. The hook's existing query-string passthrough already supports the filter (`useFirehose.ts`). |
| Session compare picker | **MODIFIED** | `frontend/src/components/shell/CommandPalette.tsx` (extension) | Add a "Compare with…" action that opens a session search modal and routes to `/sessions/compare?a=current&b=picked`. |
| Cost / alert hooks | **MODIFIED** | `frontend/src/lib/queries.ts` | Add `useCostSummary` (60 s), `useCostBreakdown(range)` (60 s), `useSkillRuns(name, range)` (60 s), `useSkillTimeline(name)` (uses SSE — no polling), `useAlerts()` (30 s), `useAlertEvents()` (10 s — these are user-visible firings). Cadences match existing buckets. |

---

## Architectural Patterns

### Pattern 1: Read-time cost computation with cached pricing snapshots

**What:** Cost is never stamped onto `otel_events` or `token_usage` rows at ingest. Instead, the cost engine joins `token_usage` against `pricing` at query time, picking the price row valid for each `day` via `effective_from <= day AND (effective_until IS NULL OR effective_until > day)`.

**When to use:** Whenever pricing might change (it will — Anthropic adjusts prices) and the dataset is small enough to recompute on read. A single-user local dashboard with ≤ a few thousand `token_usage` rows per month qualifies.

**Trade-offs:**
- ✅ Pricing edits are immediately reflected with zero backfill.
- ✅ Ingest stays fast and crash-tolerant (Pitfall 4: `/v1/logs` MUST always 200).
- ✅ Aligns with the existing read-time pattern in `observability.py` (cache hit-rate, outcomes — both compute on read with `STRFTIME`).
- ❌ A bad price row affects historical reports retroactively. Mitigated by the `effective_from`/`effective_until` history.
- ❌ Slightly heavier read query. Negligible at this scale; SQLite handles the join in single-digit ms.

**Example:**
```python
# backend/cmc/cost/engine.py
_COST_SQL = text("""
    SELECT
      tu.day, tu.model, tu.source,
      tu.tokens_input, tu.tokens_output,
      tu.tokens_cache_read, tu.tokens_cache_create,
      pr_in.price_per_million  AS price_in,
      pr_out.price_per_million AS price_out,
      pr_cr.price_per_million  AS price_cache_read,
      pr_cw.price_per_million  AS price_cache_create
    FROM token_usage tu
    LEFT JOIN pricing pr_in
      ON pr_in.model = tu.model AND pr_in.source = tu.source
     AND pr_in.unit_kind = 'input'
     AND pr_in.effective_from <= tu.day
     AND (pr_in.effective_until IS NULL OR pr_in.effective_until > tu.day)
    -- repeat for output / cache_read / cache_create
    WHERE tu.day >= DATE('now', :since_clause, 'localtime')
""")
```

---

### Pattern 2: Alert engine as a dispatcher pre-cycle hook

**What:** `evaluate_alerts(db)` runs as the very first step of `run_one_cycle()`, before `stamp_tick`/`sweep`/`materialize`/`claim`. It is a pure function over the DB — it reads `alert_rules`, runs each rule's metric query, writes `Decision` + `notification_log(kind='alert')` rows when a rule fires.

**When to use:** Whenever you need periodic evaluation of background rules in a system that already has a 120 s heartbeat dispatcher with a DB connection. **Reuse the heartbeat — don't add a new one.**

**Trade-offs:**
- ✅ Zero new launchd jobs, zero new processes, zero new heartbeat infrastructure.
- ✅ Failures are observable through the existing `dispatcher_last_tick_at` system_state key — if alerts stop firing, the dispatcher is the failure mode operators already monitor.
- ✅ Alerts pipe into Decision queue + Telegram **for free** because both surfaces already poll those tables (`useDecisions` 5 s, `notifier` 30 s).
- ❌ Alert evaluation is bound to the dispatcher's 120 s cadence. For "burn rate" alerts this is more than fine; sub-minute alerts are out of scope (and not requested).
- ❌ A long-running alert query could slow the dispatcher cycle. Mitigation: cap each rule query at 500 ms via `db.execute(...)` with `asyncio.wait_for`, log+skip on timeout.

**Example skeleton:**
```python
# backend/cmc/dispatcher/alerts.py
async def evaluate_alerts(db: AsyncSession) -> int:
    rules = (await db.execute(select(AlertRule).where(AlertRule.enabled == True))).scalars().all()
    fired = 0
    for rule in rules:
        try:
            value = await asyncio.wait_for(_compute_metric(db, rule), timeout=0.5)
        except asyncio.TimeoutError:
            log.warning("alert.timeout", extra={"rule_id": rule.id})
            continue
        if not _crosses(rule, value):
            continue
        # Idempotent: notification_log UNIQUE(kind, entity_id, chat_id) blocks dupes
        # entity_id is rule.id + bucket-start ISO so re-firing in next bucket works
        await _insert_decision_and_log(db, rule, value)
        fired += 1
    return fired
```

And in `heartbeat.run_one_cycle()`:
```python
# Insert at the very top, BEFORE stamp_tick (no, wait — stamp_tick must
# come first per Pitfall P5: liveness must always be observable. Insert
# AFTER stamp_tick but BEFORE emergency_stop_check so a flooding alert
# doesn't block emergency stop.)
await stamp_tick(...)
try:
    await evaluate_alerts(db)
except Exception:
    log.exception("alerts.evaluate_failed")  # never let alerts kill the cycle
# ... existing flow continues
```

---

### Pattern 3: Skill timeline via firehose `event_name` filter (no new SSE endpoint)

**What:** `GET /api/firehose?event_name=claude_code.skill_invoked` already streams the right rows — the SSE generator (`api/sse.py:50`) already accepts an `event_name` filter. No backend work; only frontend wiring.

**When to use:** Whenever a per-event-name live timeline is needed. The existing primitive already covers it.

**Trade-offs:**
- ✅ Zero new backend code — even type definitions are already there.
- ✅ The 1-second poll cadence on `otel_events` already feeds the firehose; skill events appear in real time as soon as ingest persists them.
- ❌ Each filtered firehose connection holds an `AsyncSession` for up to 60 minutes. For a single-user local dashboard this is fine; plan to close any unused panel streams (the existing `useFirehose` hook already disconnects on unmount).

**Example:**
```ts
// frontend/src/components/panels/SkillTimeline.tsx
const events = useFirehose({ event_name: 'claude_code.skill_invoked' })
// existing hook already supports the query string; no new hook needed
```

---

### Pattern 4: Session comparison as a backend diff endpoint

**What:** `GET /api/sessions/compare?a={session_id_a}&b={session_id_b}` returns a single payload with paired metrics for both sessions:

```json
{
  "a": { "session_id": "...", "started_at": "...", "duration_seconds": 412,
         "tokens_input": 18234, "tokens_output": 4012, "cost_usd": 0.137,
         "tool_call_count": 23, "outcome": "ok", "skills_used": ["plan", "code"] },
  "b": { /* same shape */ },
  "diff": { "duration_seconds": -85, "tokens_input": 1240, "cost_usd": -0.041 }
}
```

The frontend renders side-by-side panels with delta callouts. The diff math is in the backend so the same numbers show up in URL-shared comparisons and Telegram quick-share (future hook).

**When to use:** Whenever you want a deterministic, server-computed view of two entities side by side. Doing this client-side would force three round-trips (a, b, and a denormalization step) and fragment the cost-computation logic.

**Trade-offs:**
- ✅ One round-trip; consistent numbers across surfaces.
- ✅ Cost computation reuses `cmc/cost/engine.py` — no duplicated price logic in TS.
- ❌ One more endpoint to test. Mitigated by sharing helpers with `GET /api/sessions/{sid}/details` (already shaped similarly).

**URL contract:** `?a=<sid>&b=<sid>` — both required. Picker UX is the existing `CommandPalette` (Cmd+K) plus a "Compare with…" action button on the live `LiveSessionsCard` rows. No new picker component.

---

### Pattern 5: Skill rollup via `otel_events` JSON queries — defer materialization

**What:** All skill rollups (frequency, latency, error rate, cost) start as ad-hoc SQL against `otel_events.body` JSON + `otel_events.event_name = 'claude_code.skill_invoked'`. The schema already has `idx_otel_events_event_name_ts` (verified `models/otel_events.py:36`), so name-filtered scans are cheap.

**When to use:** Phase 2 (Skill Rollups). Only consider materializing into a dedicated `skill_runs` table if measured query latency exceeds 100 ms p95 on a representative dataset.

**Trade-offs:**
- ✅ No migration churn for v1.1's first release; ship the panels fast.
- ✅ Pricing changes propagate automatically (read-time join).
- ❌ JSON path queries on SQLite are slower than columnar lookups. Tracked via Phase 2 perf-validation gate.
- ❌ If we DO materialize later, double-write hazard. Mitigation: build the materialized table from a single SQL `INSERT ... SELECT` triggered by the dispatcher (idempotent on `(event_id)` PK).

**Path forward (deferred):** If a `skill_runs` materialized table becomes necessary:
- Keep `otel_events` as the source of truth.
- `skill_runs` columns: `event_id PK FK→otel_events.id`, `skill_name`, `session_id`, `ts`, `model`, `tokens_in`, `tokens_out`, `duration_ms`, `error`. All derivable; ON CONFLICT DO NOTHING idempotency.
- Built by a new dispatcher step `materialize_skill_runs(db)` that processes events from `last_id_processed` (stored in `system_state`).

---

## Recommended Project Structure (deltas only)

```
backend/cmc/
├── api/routes/
│   ├── alerts.py            # NEW — CRUD + dry-run for alert_rules
│   ├── cost.py              # NEW — /api/cost/summary, /breakdown
│   ├── ingest.py            # MODIFIED — recognize claude_code.skill_invoked
│   ├── sessions.py          # MODIFIED — add /compare endpoint
│   └── skills.py            # MODIFIED — add /runs /timeline /cost subroutes
├── api/schemas/
│   ├── alerts.py            # NEW
│   ├── cost.py              # NEW
│   └── sessions.py          # MODIFIED — add SessionCompareResponse
├── cost/
│   ├── __init__.py          # NEW directory
│   └── engine.py            # NEW — pure pricing engine
├── db/models/
│   ├── alert_events.py      # NEW (optional — see Phase 5 decision)
│   ├── alert_rules.py       # NEW
│   └── pricing.py           # NEW
├── dispatcher/
│   ├── alerts.py            # NEW — evaluate_alerts() pre-cycle hook
│   └── heartbeat.py         # MODIFIED — call evaluate_alerts() near top
└── migrations/versions/
    ├── XXXX_add_pricing_table.py
    ├── XXXX_add_alert_rules_table.py
    └── XXXX_add_alert_events_table.py  # only if optional table chosen

frontend/src/
├── routes/
│   ├── alerts.tsx                # NEW
│   ├── sessions.compare.tsx      # NEW (handles ?a=&b=)
│   └── skills.$name.tsx          # NEW (file-based dynamic route)
├── components/panels/
│   ├── AlertRulesList.tsx        # NEW
│   ├── AlertRuleForm.tsx         # NEW
│   ├── CostBreakdown.tsx         # NEW
│   ├── CostSummary.tsx           # NEW
│   ├── SessionCompareView.tsx    # NEW
│   ├── SkillCostCard.tsx         # MODIFIED — replace placeholder with real data
│   ├── SkillDetailView.tsx       # NEW (composes Cost/Runs/Timeline panels)
│   ├── SkillRunsTable.tsx        # NEW
│   ├── SkillTimeline.tsx         # NEW (uses useFirehose with filter)
│   └── TopSkills.tsx             # MODIFIED — replace placeholder with real data
└── lib/
    ├── api.ts        # MODIFIED — types + fetchers for new endpoints
    └── queries.ts    # MODIFIED — useCostSummary, useAlerts, useSkillRuns, etc.
```

### Structure Rationale

- **`backend/cmc/cost/`:** Cost computation is a coherent domain; lives next to (not inside) `dispatcher/` because cost is consumed by routes AND alerts. Mirrors how `tasks/`, `schedules/`, `skills/`, `mcp/` are top-level domain directories.
- **`backend/cmc/dispatcher/alerts.py`:** Lives inside the dispatcher because it runs in the dispatcher process. Same pattern as `claim.py`, `autonomy_gate.py`, `materialize.py` — single-purpose modules called from `heartbeat.py`.
- **`frontend/src/routes/skills.$name.tsx`:** TanStack Router's file-based dynamic-segment convention. Auto-generates the `/skills/{name}` route entry into `routeTree.gen.ts`.
- **`frontend/src/routes/sessions.compare.tsx`:** Sibling of `sessions.tsx` (if it existed) — TanStack file-based routes use dot-notation for nested non-dynamic paths. The view reads `useSearch()` to get `a` / `b` from the URL.

---

## Data Flow

### Skill event → DB → panels

```
Claude Code subprocess emits OTLP log:
  event_name = "claude_code.skill_invoked"
  attrs: { skill_name, session_id, model, duration_ms, tokens_in, tokens_out, ok }
        ↓
POST /v1/logs (existing endpoint, NO change to handler)
        ↓
ingest.py extracts session_id + mcp attrs (already done) and stores entire
record in OtelEvent.body (JSON column — already done)
        ↓
otel_events row inserted; idx_otel_events_event_name_ts makes name lookup O(log n)
        ↓
GET /api/skills/{name}/runs queries:
  SELECT date(ts), count(*), avg(json_extract(body, '$.record.attributes.duration_ms'))
  FROM otel_events WHERE event_name='claude_code.skill_invoked'
    AND json_extract(body, '$.record.attributes.skill_name') = :name
        ↓
SkillDetailView renders rollup; SkillTimeline subscribes via firehose w/ filter
```

**Spike note:** The exact attribute path inside `OtelEvent.body` is determined by the Phase 0 spike. The structure above assumes the OTLP exporter shape from `iter_attrs()` (`backend/cmc/ingest/otel_parser.py`). If the spike reveals a different shape we adjust the `json_extract` paths, not the table schema.

### Cost summary read flow

```
useCostSummary() → GET /api/cost/summary?range=7d
        ↓
cost/engine.py.summarize(db, range='7d')
  → SQL JOIN token_usage × pricing (with effective_from window)
  → returns { total_usd, by_model: [...], by_source: [...], delta_vs_prev_period }
        ↓
CostSummary panel renders KPIs
```

### Alert flow (end-to-end)

```
Operator: POST /api/alerts → alert_rules row inserted (enabled=true)
        ↓
Dispatcher tick (120s):
  stamp_tick → evaluate_alerts → ... rest of cycle
        ↓
evaluate_alerts loop:
  per rule: compute metric, compare threshold
  if fires: INSERT decisions row + INSERT notification_log(kind='alert', ...)
  ON CONFLICT DO NOTHING blocks duplicate firing in same window
        ↓
Frontend: useDecisions() polls 5s → DecisionsCard surfaces it as a checkpoint
Telegram: notifier 30s loop sees notification_log row → sendMessage with
          Approve/Snooze/Reject inline buttons (existing pattern, kind='alert')
        ↓
Operator answers → file-then-DB write order (Pitfall HITL) → dispatcher
                   queue file unused for alerts (no subprocess waiting)
```

---

## State Management

**Frontend:** All new server state lands in `lib/queries.ts` with cadences from the existing buckets:

| Hook | Cadence | Bucket reason |
|------|---------|---------------|
| `useCostSummary` | 60 s | Daily aggregate bucket |
| `useCostBreakdown(range)` | 60 s | Same |
| `useSkillRuns(name, range)` | 60 s | Daily aggregate bucket |
| `useSkillCost(name, range)` | 60 s | Daily aggregate bucket |
| `useSkillTimeline(name)` | SSE (no polling) | Reuses firehose |
| `useSessionCompare(a, b)` | none (fetch on demand) | Manually invalidated; hub of comparison view |
| `useAlerts` | 30 s | Same as schedules — config-shaped |
| `useAlertEvents(limit)` | 10 s | User-visible firings — closer to attention-bar urgency |

No inlined `refetchInterval` anywhere; cadence policy stays auditable in `queries.ts`.

---

## Key Data Flows

1. **Skill event ingestion (existing path, zero code change):** OTLP exporter → `/v1/logs` → `OtelEvent` row. The Phase 0 spike validates that `event_name=claude_code.skill_invoked` actually arrives.
2. **Cost computation (read-time):** `token_usage` × `pricing` JOIN on every cost endpoint hit. Cached at the HTTP layer for 60 s by frontend `useQuery` staleness; backend does no caching.
3. **Alert firing (dispatcher-driven):** `alert_rules` → `evaluate_alerts` → `decisions` + `notification_log` → existing notifier + decisions surfaces.
4. **Session comparison (manual fetch):** User opens compare view → `GET /api/sessions/compare` → backend computes both rollups + diff in one transaction.
5. **Skill timeline (SSE):** Frontend subscribes to `/api/firehose?event_name=claude_code.skill_invoked` → ring-buffer in `useFirehose` → live timeline scroller.

---

## Anti-Patterns

### Don't add a new launchd job for the alert engine

**What people do:** "Alerts feel like a separate concern, let's give them their own daemon."
**Why it's wrong:** A new daemon means a new heartbeat to monitor (SAPI-04 already tracks three: dispatcher, telegram, jsonl_sync), a new PID file, a new install step, a new failure mode operators have to learn. The dispatcher already runs at the right cadence and already has a DB engine.
**Do this instead:** Insert `evaluate_alerts(db)` near the top of `run_one_cycle()` after `stamp_tick`. Wrap in `try/except` so alert failure never kills the dispatcher tick. Reuse `dispatcher_last_tick_at` as the alert engine's liveness signal.

### Don't stamp cost on every `otel_events` row at ingest

**What people do:** "Compute cost during `/v1/logs` so reads are cheap."
**Why it's wrong:** (1) Pitfall 4 — `/v1/logs` MUST always 200; adding a price lookup to ingest creates a new failure surface that could drop OTLP batches. (2) Pricing changes require re-stamping every historical row, which means writing a backfill migration on every Anthropic price update. (3) The `token_usage` table is already daily-aggregated; cost on it is already cheap.
**Do this instead:** Compute at read time using `cmc/cost/engine.py`. Pricing edits take effect immediately across all reports.

### Don't put a "skill_runs" table in v1.1

**What people do:** "Better make a denormalized skill_runs table now in case rollups get slow."
**Why it's wrong:** Premature; `otel_events` has the `idx_otel_events_event_name_ts` index already; SQLite JSON path lookups are fast enough at the dataset size of a single-user dashboard. Adding a table means a migration, a back-fill plan, a double-write hazard.
**Do this instead:** Phase 2 includes a perf-validation gate: measure p95 of `/api/skills/{name}/runs` on a 30-day dataset. Only if > 100 ms do we materialize.

### Don't add a parallel SSE endpoint for skills

**What people do:** "Skills deserve their own `/api/skills/firehose`."
**Why it's wrong:** The existing firehose already accepts `event_name` as a query parameter (`api/routes/system.py:336`). Adding a parallel endpoint duplicates the SSE generator logic, the disconnect handling, and the 60-min-cap pattern.
**Do this instead:** `GET /api/firehose?event_name=claude_code.skill_invoked`.

### Don't compute session-comparison diffs on the client

**What people do:** Fetch session A, fetch session B, subtract in JS.
**Why it's wrong:** Cost computation lives in `cmc/cost/engine.py` — duplicating it in TS means two sources of truth. Plus, three round-trips (A, B, denormalize).
**Do this instead:** One backend endpoint that returns both sessions plus the diff, computed using the same `cost/engine.py` helpers.

### Don't write DB before queue file in any HITL-shaped path

**Existing rule (`api/routes/hitl.py`).** Applies verbatim to alert engine: write `notification_log` row FIRST (it's the queue surrogate for the notifier), THEN insert `Decision`. Same crash-safety reasoning.

---

## Build Order (with dependencies & rationale)

> **Phase numbering is suggested, not mandated.** Roadmap may collapse phases or split.

### Phase 0 — Skill event spike (1 day, MUST GO FIRST)

**Goal:** Confirm whether Claude Code emits `claude_code.skill_invoked` (or a similarly-named event) and document the exact attribute shape.

**Why first:** Every downstream phase depends on the answer. If Claude Code does NOT emit a skill event, v1.1 must derive skill invocations from JSONL transcripts (`backend/cmc/ingest/jsonl_parser.py`) instead of OTLP — a fundamentally different ingest path with different latency characteristics.

**Deliverables:**
- A captured OTLP log batch from a real session showing the event (or proof of absence).
- A short note in `.planning/research/SKILL_EVENTS.md` documenting the attribute path.
- A go/no-go decision: OTLP path (default) vs JSONL-derived (fallback).

**Files touched:** None in production code. Possibly a one-off `backend/scripts/capture_skill_events.py`.

### Phase 1 — Cost foundation (no UI yet)

**Depends on:** Phase 0 if cost includes per-skill numbers (it does — Phase 4 needs them).

**Backend tasks:**
1. Add `pricing` table + Alembic migration. Seed with current Anthropic public prices.
2. Build `cmc/cost/engine.py` with `summarize`, `breakdown`, `cost_for_session`.
3. Wire `GET /api/cost/summary` and `GET /api/cost/breakdown` (read-only).
4. Unit test the price-window selection logic with `effective_from`/`effective_until`.

**Why before panels:** Panels depend on the engine; the engine is a small pure module; testable in isolation.

### Phase 2 — Skill ingestion + rollups

**Depends on:** Phase 0 (event shape confirmed), Phase 1 (cost engine available for skill cost).

**Tasks:**
1. Update `backend/cmc/api/routes/ingest.py` to recognize and (if needed) extract `attrs.skill_name` for indexing acceleration. **Defer adding a column until perf demands it.**
2. Add `GET /api/skills/{name}/runs` and `/cost`.
3. Perf-validate: run on representative dataset (30 days of events). If p95 > 100 ms, materialize `skill_runs` and reroute the endpoints.
4. Telemetry on the endpoints (existing OTLP auto-instrumentation handles this).

### Phase 3 — Frontend skill panels + skill detail route

**Depends on:** Phase 2 endpoints live.

**Tasks:**
1. Add `useSkillRuns`, `useSkillCost`, `useSkillTimeline` hooks in `lib/queries.ts`.
2. Replace `SkillCostCard.tsx` and `TopSkills.tsx` placeholders with real renderings.
3. New `SkillDetailView` + `routes/skills.$name.tsx`.
4. New `SkillTimeline.tsx` using existing `useFirehose` with filter.

### Phase 4 — Cost panels + activity-page wiring

**Depends on:** Phase 1 endpoints live.

**Tasks:**
1. New `CostSummary` and `CostBreakdown` panels.
2. Mount on `routes/activity.tsx` next to `TokenUsageCard` (cost is the natural sibling of tokens).
3. Add per-skill cost row to skill detail view.

### Phase 5 — Alert engine + rules CRUD

**Depends on:** Phase 1 (cost engine — many rules will be cost rules) + Phase 2 (skill rollups — some rules will be skill-frequency rules).

**Tasks:**
1. Add `alert_rules` table + migration. **Decision point:** add `alert_events` table? Recommended NO — reuse `notification_log` with `kind='alert'` and `entity_id={rule_id}:{bucket_iso}`. Mirrors existing dedup pattern. If audit trail becomes a requirement later, add `alert_events` then.
2. New `cmc/dispatcher/alerts.py` module.
3. Hook into `heartbeat.run_one_cycle()` after `stamp_tick` with `try/except` guard.
4. New `cmc/api/routes/alerts.py` (CRUD + `/test`).
5. New frontend route `routes/alerts.tsx` + `AlertRulesList` + `AlertRuleForm`.
6. Integration test: create a rule that always fires, run dispatcher oneshot, assert Decision row exists, assert `useDecisions` surfaces it.

### Phase 6 — Session comparison

**Depends on:** Phase 1 (cost-per-session helper). Independent of skill work.

**Tasks:**
1. New `GET /api/sessions/compare` endpoint.
2. New `SessionCompareView` component + `routes/sessions.compare.tsx`.
3. Extend `CommandPalette` with a "Compare with…" action that opens a session picker.
4. Add a "Compare" button on `LiveSessionsCard` rows that pre-fills `?a=` and opens the picker for `?b=`.

### Phase 7 — Polish + docs (existing v1 pattern)

Mirror the existing v1.0 pattern (Phase 11 in the v1.0 roadmap): write upgrade docs, env-var reference for `pricing` seeding, screenshots, etc.

---

## Scaling Considerations

This is a single-user, single-machine local dashboard. Realistic load: a few hundred sessions per week, a few thousand `otel_events` per day, a few dozen `alert_rules`.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current expected | All patterns above hold. SQLite WAL handles it. |
| 10× current | Validate p95 on `/api/skills/{name}/runs`; consider `skill_runs` materialization (Pattern 5 deferred branch). |
| 100× current | Add a daily-rollup table for skill events (mirroring `token_usage`). Move alert evaluation to a separate process if dispatcher cycle exceeds 10 s. Neither expected for v1.1. |

### Scaling priorities

1. **First bottleneck:** Skill rollup queries on `otel_events` JSON. Mitigation: deferred materialization (Pattern 5 fallback).
2. **Second bottleneck:** Alert query timeouts blocking dispatcher cycle. Mitigation: per-rule 500 ms timeout already specified.

---

## Integration Points

### External Services (no new ones for v1.1)

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Anthropic API | Already used by `nlcron.py` and `skill_router.py` | No new use in v1.1 unless alert engine adds NL-rule parsing later (out of scope) |
| Telegram | Already used by notifier | Alerts ride the existing notifier kind dispatch table — add `'alert'` to `_FORMATTER` in `telegram/notifier.py:217` |
| OTLP/HTTP `/v1/logs` | Already used | No new endpoints; only event-name recognition extension in ingest |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Cost engine ↔ routes | Direct function call | Pure module, no I/O at module scope |
| Cost engine ↔ session compare | Direct function call | Reuses `cost_for_session(sid)` helper |
| Alert engine ↔ notifier | Via `notification_log` table | Notifier already polls; add `'alert'` formatter |
| Alert engine ↔ decisions queue | Via `decisions` table | Existing 5 s polling on `useDecisions` surfaces it |
| Skill timeline ↔ ingest | Via `otel_events` table + firehose SSE | Existing `event_name` filter on `/api/firehose` |
| Session compare ↔ frontend | Via URL params `?a=&b=` | Shareable links; bookmarkable; Telegram-pasteable |

---

## Sources

- `.planning/codebase/ARCHITECTURE.md` (refreshed 2026-05-02)
- `.planning/codebase/STRUCTURE.md` (refreshed 2026-05-02)
- `.planning/codebase/INTEGRATIONS.md` (refreshed 2026-05-02)
- `.planning/codebase/CONCERNS.md` (refreshed 2026-05-02)
- `backend/cmc/api/routes/ingest.py` — Pitfall 4 (always-200) constraint
- `backend/cmc/api/routes/system.py:336` — firehose `event_name` filter already present
- `backend/cmc/api/sse.py:50` — SSE generator filter wiring
- `backend/cmc/db/models/otel_events.py:36` — `idx_otel_events_event_name_ts` index already in place
- `backend/cmc/db/models/notification_log.py` — UNIQUE(kind, entity_id, chat_id) dedup pattern (P6)
- `backend/cmc/dispatcher/heartbeat.py` — current `run_one_cycle()` ordering
- `backend/cmc/telegram/notifier.py:217` — `_FORMATTER` dispatch table for new `'alert'` kind
- `frontend/src/components/panels/SkillCostCard.tsx` and `TopSkills.tsx` — existing v2 placeholders explicitly waiting for `claude_code.skill_invoked`
- `frontend/src/lib/queries.ts` — locked cadence buckets

---

*Architecture research for: v1.1 Skills & Cost Intelligence milestone*
*Researched: 2026-05-02*
