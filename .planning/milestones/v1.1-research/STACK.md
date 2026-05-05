# Stack Research — v1.1 Skills & Cost Intelligence

**Domain:** Skill observability + cost intelligence + alerting + session comparison (additions to Claude Mission Control v1.0)
**Researched:** 2026-05-02
**Confidence:** HIGH on OTEL spike, recharts, diff approach, alert-engine approach, scheduler approach. MEDIUM on pricing numbers (verified-against-Anthropic-docs gate required at requirements phase).

---

## TL;DR for v1.1

The existing v1.0 stack (FastAPI, SQLAlchemy 2.0 async + SQLModel, aiosqlite WAL, Pydantic v2, recharts, framer-motion, locked-cadence TanStack Query, SSE firehose, Telegram notifier with dedup ledger, SQLite 3.47+ window-function p50/p95 pattern in `mcp/aggregator.py`) **already covers ~90 % of v1.1**. The genuine new dependencies are zero — every v1.1 feature is reachable by:

1. Adding **one new SQLModel table** (`alerts` / `alert_rules`) and **two columns** on `otel_events` for skill name + outcome (or none, if we keep skill data inside the existing `body` JSON column with a `claude_code.skill_activated` event-name index).
2. Hand-rolling a **single-file pricing module** (`cmc/pricing.py`) keyed by model id, used by both the new skill cost card and the existing `token_usage` / `OPNL-05` paths.
3. Hand-rolling a **single-file anomaly module** (`cmc/alerts/detector.py`) using rolling z-score + EWMA — both are ~50 LOC of pure stdlib math, no library justified.
4. Reusing the **existing 120 s dispatcher tick** as the alert evaluator (no new scheduler primitive).
5. Hand-rolling the session-comparison view as **two side-by-side panels with shared y-axes**, not a code-diff library.

No heavy deps (pandas, numpy, scipy, statsmodels, react-diff-view, react-window) are needed. **The OTEL spike is resolved: `claude_code.skill_activated` is the canonical event name** (see Section 1).

---

## 1. OTEL Spike — Skill Event Source Decision (HIGH confidence)

### Findings

| Question | Answer | Source |
|----------|--------|--------|
| Does Claude Code emit a skill event? | **Yes — `claude_code.skill_activated`** (logs/events stream, NOT metrics). The PROJECT.md placeholder name `claude_code.skill_invoked` is slightly off; the docs use the past participle "activated". | `ericbuess/claude-code-docs` Context7 mirror, `monitoring-usage.md` — "Skill activated event" section |
| What attributes? | **skill name, invocation trigger, skill source.** Plugin name and marketplace name are added when `OTEL_LOG_TOOL_DETAILS=1`. Standard correlation attrs (`session_id`, `prompt.id`, `event.timestamp`, `event.sequence`) are present on every event. | Same source |
| Is there a skill-specific metric counter? | **No.** The exhaustive metrics list is `claude_code.session.count`, `claude_code.lines_of_code.count`, `claude_code.pull_request.count`, `claude_code.commit.count`, `claude_code.cost.usage`, `claude_code.token.usage`, `claude_code.code_edit_tool.decision`, `claude_code.active_time.total`. Skills are events-only. | Same source, "Metrics" section |
| Does the event carry duration / latency? | **No** — the activation event marks the moment of invocation, not completion. There's no paired `skill_completed`. | Same source |
| Does the event carry tokens / cost? | **No** — the event is small. Token/cost attribution to a skill must be **derived** by joining `claude_code.skill_activated` to the subsequent `claude_code.api_request` events within the same `prompt.id`. | Same source + `claude_code.api_request` event docs |
| What error / outcome signal exists? | **Indirect.** Per `claude_code.tool_result` event: when a Skill-tool invocation fails, that event carries `success=false` and an error category. The Skill tool itself is a tool, so its tool_result is the failure signal. | `monitoring-usage.md` "Tool result event" + "claude_code.tool.execution span" |
| Is the event behind a beta/feature flag? | The base event is shipped under `OTEL_LOGS_EXPORTER` (the existing `/v1/logs` ingest path). **Plugin / marketplace / source attributes only appear with `OTEL_LOG_TOOL_DETAILS=1`** (which the user must already have set for current MCP attribute extraction at INGST-08 to work). | Same source + repo `cmc/ingest/otel_parser.py:62-66` |

### Decision: hybrid (OTEL primary, JSONL never)

**Use the `claude_code.skill_activated` OTEL log event as the primary signal.** Reasons:

1. JSONL transcripts at `~/.claude/projects/<hash>/<session>.jsonl` do **not** mark skill activations — they show only the resulting `tool_use` blocks for tools the skill chose to invoke. There is no `compactMetadata`-style record for skill scope. Trying to derive skills from JSONL would require fragile heuristic matching against `Skill` tool calls, which is itself only one of many activation paths (slash commands, auto-invocation, plugin namespace).
2. The OTEL event is already flowing through `/v1/logs` — the receiver in `cmc/api/routes/ingest.py` already persists every `logRecords[]` row to `otel_events` with `event_name` indexed. **No ingest code change is needed to start collecting these rows** the moment a skill activates with telemetry on. We only need to read them out.
3. Cost / latency / outcome must be derived (Section 2). Doing the join in SQL on `otel_events` is straightforward; doing it across two parsers (JSONL parser + OTEL parser) would double the surface area for nothing.

### What to add to the ingest path

- **No new endpoint, no new parser.** The receiver is already accept-everything.
- **One new index** on `otel_events`: `(event_name, session_id, ts)` is already present. The skill-name attribute lives inside `body.record.attributes` JSON. Add a **generated SQLite column** or a **dedicated indexed column** for skill name — see Section 4 for the schema decision.

### Consequence for ACTV-04 / SKLP-02 reactivation

Both panels were deferred at v1.0 specifically pending this signal. The signal is confirmed live. **Reactivation is unblocked.** The placeholder UI components (`frontend/src/components/panels/TopSkills.tsx`, `frontend/src/components/panels/SkillCostCard.tsx`) already exist, just need wiring to a real `/api/skills/*` aggregation endpoint backed by `otel_events`.

---

## 2. Cost Math Foundation (ANLYT-01)

### Pricing source

There is **no programmatic pricing API** from Anthropic — the canonical reference is the public pricing page at `https://www.anthropic.com/pricing` (or `claude.com/pricing`). Pricing is published as $-per-million-tokens by model and by token kind (input / output / cache-read / cache-create / 1h-cache-write). The Claude Code SDK's `ModelUsage.costUSD` field is itself a **client-side estimate** — confirmed by the official type doc: *"The `costUSD` value is a client-side estimate. See [Track cost and usage] for billing caveats."* (Source: `agent-sdk__cost-tracking.md` via Context7).

### Recommended approach (HIGH confidence on shape, MEDIUM on exact numbers)

**Hand-rolled `cmc/pricing.py`** — a pure module with a model-keyed dict and a `cost_for(model_id, tokens_input, tokens_output, tokens_cache_read, tokens_cache_create) -> Decimal` helper.

Why hand-rolled rather than a library:

- LiteLLM has a price catalog, but pulling LiteLLM (~5 MB, hundreds of transitive deps) for a 30-line lookup table is misaligned with the project's "minimum addition" constraint.
- `tokencost` (PyPI) bundles a pricing JSON but lags behind Anthropic releases by 2–8 weeks historically.
- The pricing table is small (~6 rows for the Claude family) and changes ~quarterly. A hand-maintained dict is the right grain.

**Schema:**

```python
# cmc/pricing.py
from decimal import Decimal
from typing import TypedDict

class ModelPrice(TypedDict):
    input_per_mtok: Decimal       # $ per 1M input tokens
    output_per_mtok: Decimal      # $ per 1M output tokens
    cache_read_per_mtok: Decimal  # typically 10% of input
    cache_write_5m_per_mtok: Decimal  # typically 1.25x input
    cache_write_1h_per_mtok: Decimal  # typically 2x input
    context_tier: str             # "200k" or "1m"

# Verify these numbers against https://www.anthropic.com/pricing at REQ time.
PRICES: dict[str, ModelPrice] = {
    "claude-opus-4-7": { ... },
    "claude-opus-4-7[1m]": { ... },     # 1M-context tier (different, higher rate)
    "claude-sonnet-4-6": { ... },
    "claude-sonnet-4-6[1m]": { ... },
    "claude-haiku-4-5": { ... },
}

def normalize_model_id(model: str) -> str: ...   # strip dates, map aliases
def cost_for(model: str, *, tokens_input: int, tokens_output: int, ...) -> Decimal: ...
```

**Confidence flags:**

- **HIGH**: shape, location, integration with existing `token_usage` table.
- **MEDIUM**: exact $/Mtok numbers — these MUST be verified against the Anthropic pricing page at requirements freeze. Do **not** ship the numbers from training data without that verification step. The roadmap should include a "pricing-table verification" checkbox before any cost is rendered to the user.
- The "Cost Tracking" doc confirms that the cache-read multiplier is ~10 % and the 1h cache-write is ~2× input — these *ratios* are stable across models even when the absolute numbers change.

### Where the math gets used

1. **Skill cost card** (SKLP-02) — sum cost across all `claude_code.api_request` events whose `prompt.id` matches a `claude_code.skill_activated` event in the window.
2. **OPNL-05 token usage panel** — already showing token deltas; can layer dollar overlay using the same module.
3. **Session comparison** — total session cost via the same `prompt.id`-bucketed sum.
4. **Attribution to source** — the existing `token_usage.source` column already separates `claude-code` / `agent-sdk` / `unknown`. Pricing module is source-agnostic.

### Why Decimal not float

Float math drifts on $ aggregations across thousands of API requests. Use `Decimal` (Python stdlib, no dep) with `quantize` to 4dp at boundary; keep raw token counts as ints in DB. SQLite stores as TEXT for Decimal — already handled by SQLAlchemy's `Numeric` type.

---

## 3. Anomaly Detection / Alert Engine

### Decision: hand-rolled, two strategies, ~150 LOC

No new library. The existing dispatcher heartbeat runs every 120 s — that's the alert evaluator tick. Add `cmc/alerts/detector.py` with two complementary strategies:

| Strategy | When to use | Math |
|----------|-------------|------|
| **Threshold rule** | "cost-per-skill-per-day > $5", "error rate > 5 %" — explicit user-defined ceilings | Direct `value > threshold` comparison; trivial. |
| **Rolling z-score over EWMA baseline** | "skill X usage suddenly spikes", "skill Y error rate suddenly climbs" — implicit anomaly | EWMA mean + EWMA variance with α=0.2; alert when `|x - μ| / σ > k` where k is a per-rule sensitivity (default 3.0). Both EWMA mean and variance are O(1) updates. |

Both require ~50 lines each in pure stdlib. Pulling `scipy.stats`, `pyod`, `prophet`, or even `numpy` is unjustified for this scale (one rule per skill × one tick per 120 s = ~50 evaluations per tick, all trivial scalar math).

### Why z-score over EWMA baseline (not a library)

- **scipy** (~30 MB transitive) for `zscore()` is overkill for a one-line formula.
- **pyod** is for high-dimensional outlier detection on ML features — wrong tool.
- **prophet** is forecasting, also wrong tool.
- **river** (online ML) is closest but still ~1 MB and adds a maintained dep for nothing — the math is shorter than the import statement.
- The MCP aggregator pattern in `cmc/mcp/aggregator.py` already shows the team's preferred shape: SQL CTEs + window functions for the heavy lift, Python for orchestration.

### Schema (one new table, plus reuse of existing tables)

```python
# cmc/db/models/alerts.py
class AlertRule(SQLModel, table=True):
    __tablename__ = "alert_rules"
    id: int | None = Field(default=None, primary_key=True)
    kind: str           # "skill_cost_threshold" | "skill_error_rate" | "skill_anomaly_zscore" | ...
    target: str         # skill name, or "*" for all
    params: dict        # JSON: {"threshold": 5.00, "window_hours": 24, "sensitivity_k": 3.0}
    enabled: bool = True
    created_at: datetime
    updated_at: datetime

class AlertEvent(SQLModel, table=True):  # firing history
    __tablename__ = "alert_events"
    id: int | None = Field(default=None, primary_key=True)
    rule_id: int = ForeignKey("alert_rules.id")
    fired_at: datetime
    value: float        # what the metric was
    baseline: float | None  # EWMA mean at the time, for z-score rules
    deviation: float | None # (value - baseline) / sigma, for z-score rules
    state: str          # "firing" | "resolved"
    decision_id: int | None  # optional FK to decisions if pushed to HITL queue
    notification_log_id: int | None  # FK back to existing notification_log

    __table_args__ = (Index("idx_alert_events_rule_fired", "rule_id", "fired_at"),)
```

### Reuse of existing dispatcher tick (CRITICAL — no new scheduler)

The 120 s heartbeat (`cmc/dispatcher/heartbeat.py:run_one_cycle`) is already a scheduled tick that runs cheap work. Add **one call** at the end of `run_one_cycle`:

```python
# After existing claim → autonomy gate → fan-out:
await evaluate_alert_rules(db, settings)
```

`evaluate_alert_rules` reads enabled rules, runs each one, inserts `AlertEvent` rows for fires, calls the existing `cmc.telegram.notifier` paths for delivery (Section 5), and creates a `Decision` row when the rule says `push_to_hitl=true`. This is the **same pattern** as the `cleanup_rerun_failures` housekeeping that already lives in the notifier — proven shape.

### Why not a separate scheduler

- APScheduler / Celery / Dramatiq / RQ all imply a broker or persistent worker — orthogonal to the localhost-single-machine model.
- The 120 s cadence is fine for "skill cost spiked" alerts; this isn't sub-second SLA territory.
- Reusing the dispatcher tick means **zero new processes, zero new launchd plists, zero new lifecycle bugs**.

---

## 4. Schema additions (existing 15-table SQLite)

### One new table or two, no column churn on existing tables

| Table | Purpose | Status |
|-------|---------|--------|
| `alert_rules` | User-defined rules | NEW |
| `alert_events` | Fired alert history (one row per fire) | NEW |
| `otel_events` | (existing) | **No new columns required** — skill name lives in `body.record.attributes`. Read it via JSON1 extension (always-on in stock SQLite ≥ 3.38). Filter via `event_name = 'claude_code.skill_activated'` (already indexed). |
| `token_usage` | (existing) | No change — pricing module computes USD on-the-fly from rows; we don't store $ anywhere. |
| `notification_log` | (existing) | Add new `kind` enum value: `'skill_alert'`. The schema is `kind: str` so this is **zero migration cost** — just a new value. |
| `decisions` | (existing) | Reused for "alert that requires user ack" — new rule param `push_to_hitl=true` writes a Decision row exactly like the dispatcher does. |

### JSON1 vs dedicated column

Two options, recommended one:

**Option A (recommended — zero migration cost):** Use SQLite JSON1 functions in queries:

```sql
SELECT
  json_extract(body, '$.record.attributes[?(@.key="skill_name")].value.stringValue') AS skill,
  COUNT(*) AS invocations
FROM otel_events
WHERE event_name = 'claude_code.skill_activated' AND ts >= ?
GROUP BY skill
```

(Note: SQLite's JSON path syntax is limited — actual implementation will use the helper `iter_attrs` already in `cmc/ingest/otel_parser.py` and pre-extract during ingest, see Option B.)

**Option B (recommended for write-once read-many):** Add **one** indexed column `attrs_skill_name TEXT` on `otel_events`, populated at ingest time by extending the existing `extract_mcp_attrs` pattern in `cmc/ingest/otel_parser.py`:

```python
def extract_skill_attr(record: dict) -> str | None:
    attrs = iter_attrs(record.get("attributes"))
    return (attrs.get("skill_name") or {}).get("stringValue")
```

Then a small Alembic migration adds the column + index `idx_otel_events_attrs_skill_name`. This mirrors what's already there for `attrs_mcp_server`/`attrs_mcp_tool` — same pattern, same indexing strategy.

**Recommendation: Option B.** Reasons:
- One Alembic migration is cheap.
- Indexed column queries are 10–100× faster than `json_extract`-in-WHERE on millions of rows.
- Pattern symmetry with existing MCP attribute extraction reduces cognitive load.
- The `body` JSON is preserved for forward-compat with future skill attrs.

### Window function reuse for p50/p95 latency

`cmc/mcp/aggregator.py` already has the canonical Pattern 4 (CTE + ROW_NUMBER ranking + MAX(CASE)) for SQLite p50/p95/max. Per-skill latency is the **same query shape with `attrs_skill_name` instead of `attrs_mcp_tool`**. The aggregator function can be parameterized over the partition column, or a sister function `cmc/skills/aggregator.py` can be written by direct copy-and-adapt — pick whichever the team prefers; both are ~120 LOC of pure SQL+Python.

**Caveat: the latency signal itself.** Since `claude_code.skill_activated` doesn't carry duration, latency rows must come from the `claude_code.tool_result` event for the `Skill` tool (or for tools dispatched within the skill, joined via `prompt.id`). Two approaches:

1. **Skill-tool latency**: filter `tool_result` events to `tool_name='Skill'`, use existing `duration_ms` attribute. This is the *gross* skill latency — invocation to completion.
2. **Skill-attributed inner-tool latency**: join skill activation events by `prompt.id` to subsequent `tool_result` events, sum or aggregate inner-tool durations. More expensive, more accurate "what work the skill did".

Recommend (1) for the v1.1 panel — simpler, faster, sufficient for "is skill X slow today?" UX. Reserve (2) for a possible follow-up.

---

## 5. Telegram alert delivery (zero new code paths required)

The v1.0 notifier (`cmc/telegram/notifier.py`) already handles:

- Plain-text messaging (no parse_mode — Pitfall P3)
- Dedup via `notification_log` UNIQUE(kind, entity_id, chat_id) — Pitfall P6
- Snooze — Phase 10
- Inline button callbacks (Approve / Reject / Snooze) — Phase 10

**Adding skill alerts is 100 % reuse**: a new `kind='skill_alert'` value in `notification_log`, a new template in `cmc/telegram/messages.py`, and a new branch in the existing notifier loop that reads `alert_events WHERE state='firing' AND notification_log_id IS NULL` and sends + records.

The "decisions queue" delivery path (PROJECT requirement: "skill-level alerts → Telegram + decisions queue") is also 100 % reuse — write a `Decision` row from `evaluate_alert_rules` when the rule has `push_to_hitl=true`, exactly like the dispatcher's HITL marker path, and the existing `/api/decisions/{id}/answer` flow handles ack. **No new HITL primitives.**

---

## 6. Session comparison view

### Decision: no diff library — hand-rolled side-by-side panels

The user task is "pick 2 sessions, diff their skill usage / cost / outcomes". This is **not** a code/text diff. It's structured tabular comparison:

- Session A: 12 skills used, $4.20 total, 3 errors, 2h 14m wall time
- Session B: 8 skills used, $1.80 total, 0 errors, 47m wall time
- Common skills: 5 (with side-by-side counts/$)
- A-only skills: 7 (listed)
- B-only skills: 3 (listed)

This is two side-by-side recharts BarCharts + two tables. **Zero library justification** for `react-diff-view`, `git-diff-view`, `diff-match-patch`, or `react-diff-viewer-continued` — those are for character/line/word diffs of text content.

### Where recharts handles this

The existing `recharts@3.8.1` (verified current via Context7 — latest is `v3.3.0`/`v3_2_1`; **the project is on `3.8.1` which appears to be ahead of the public Context7 release set, possibly a typo for `3.3.1` or a future version. Confirm before any upgrade**) supports:

- `BarChart` with side-by-side `Bar` series — done already in OPNL-05 stacked daily bars.
- `ComposedChart` for cost overlay on top of count bars.
- Shared `XAxis` / `YAxis` ranges — manually pin both panels' axes to `Math.max(a_value, b_value)`.

**No new chart library is justified.**

### What to add to the API

Two endpoints, both small:

- `GET /api/sessions/{a_id}/compare/{b_id}` → returns aligned skill rollups for both sessions, plus the diff (a-only / b-only / common).
- Optional: `GET /api/sessions/compare?ids=a,b,c` for future N-way comparison; defer until requested.

Backend logic: two `WHERE session_id IN (a,b)` aggregation queries on `otel_events` + `tool_calls` + `token_usage`, joined in Python (small result set, ~50 rows max per session). No new tables, no new columns.

### What to add to the frontend

One new route file `frontend/src/routes/sessions.compare.tsx` (TanStack Router file-based routing — auto-discovered, no manual register), one panel component `SessionCompareView.tsx`, one query hook in `lib/queries.ts` with a 60 s `refetchInterval` (matches existing slow-rolling observability cadence). Pattern is identical to existing panels.

---

## 7. Polling cadence assignments (lock in `frontend/src/lib/queries.ts`)

Existing cadence ladder: 5 s (HITL queue) → 10 s (inbox) → 15 s (live state) → 30 s (most observability) → 60 s (slow rollups) → 120 s (ACTV-01..05) → 300 s (system).

| New v1.1 query | Recommended cadence | Rationale |
|----------------|--------------------|----|
| `useTopSkills(window)` | **60 s** | Slow rollup; cost of recompute is a SQL aggregate; no UX value in faster polling. |
| `useSkillCost(window)` | **60 s** | Same shape as above. |
| `useSkillLatency(window)` | **60 s** | p50/p95 aggregations don't move fast. |
| `useSkillTimeline(filter)` | **SSE** via existing `/api/firehose` filtered to `event_name='claude_code.skill_activated'` | Reuse `useFirehose` ring buffer; no new SSE endpoint. |
| `useSkillAlerts()` | **30 s** | Want fresh alert state without hammering. |
| `useAlertRules()` | **on-demand** (no `refetchInterval`) | Mutation-driven only. |
| `useSessionCompare(a, b)` | **on-demand** (no polling once mounted) | Both sessions are usually historical/finished; live re-compare adds no value. |

---

## Recommended Stack — Additions ONLY (not the v1.0 baseline)

### Backend (Python)

| Addition | Version | Purpose | Why this and not X |
|----------|---------|---------|---------------------|
| `cmc.pricing` (new internal module, no external dep) | n/a | Model-keyed $/Mtok lookup + Decimal cost math | Hand-rolled is 80 LOC; LiteLLM is 5 MB and lags; tokencost JSON ages stale. |
| `cmc.alerts.detector` (new internal module, no external dep) | n/a | Threshold + rolling-z-score-over-EWMA detector | scipy/numpy/pyod/river/prophet/statsmodels all unjustified at 50-rules-per-tick scale. Pure stdlib `math` is enough. |
| `cmc.alerts.engine` (new internal module) | n/a | Iterates `alert_rules`, fires `alert_events`, writes `notification_log` + `decisions` | Reuses existing 120s dispatcher tick — no new scheduler. |
| `cmc.skills.aggregator` (new internal module) | n/a | Per-skill p50/p95/max latency, error rate, cost rollup | Cookie-cuts `cmc/mcp/aggregator.py` Pattern 4 SQL — identical shape, identical CTE structure. |
| **NO new pip dependencies** | — | — | Every v1.1 backend feature is reachable with the existing pinned set. |

### Frontend (TypeScript / React)

| Addition | Version | Purpose | Why this and not X |
|----------|---------|---------|---------------------|
| `recharts@3.8.1` (existing) | already pinned | Reused for skill bar/line + session-compare side-by-side | No upgrade. **NOTE:** Context7 latest = `v3.3.0`; verify `3.8.1` is real before any maintenance — possibly internal mirror or typo. |
| `framer-motion@12.38.0` (existing) | already pinned | Reused for skill timeline transitions | No new motion lib. |
| `@tanstack/react-query@5.100.5` (existing) | already pinned | New hooks added to `lib/queries.ts` only | Cadences locked there per Anti-Pattern in ARCHITECTURE.md. |
| **NO new npm dependencies** | — | — | Specifically NO `react-diff-view`, `git-diff-view`, `diff-match-patch`, `react-diff-viewer-continued`, `react-window`, `numeral`, `currency.js`, `dinero.js`. Session comparison is structured panels, not text-diff; cost is server-formatted strings. |

### Database

| Addition | Migration | Purpose |
|----------|-----------|---------|
| `alert_rules` table | `0002_v1.1_alerts.py` | User-defined alert rules |
| `alert_events` table | same migration | Fired alert history |
| `otel_events.attrs_skill_name` column + index | same migration | Skill-name fast filter (mirrors existing `attrs_mcp_server` pattern) |
| **No changes** to existing 15 tables otherwise | — | — |

---

## Alternatives Considered

| Recommended | Alternative | When alternative would be better |
|-------------|-------------|--------------------------------|
| Hand-rolled `pricing.py` Decimal lookup | LiteLLM's `model_cost` map | If we needed pricing for >50 models across providers (OpenAI, Google, Mistral). We need ~6 Anthropic SKUs. |
| Hand-rolled `pricing.py` Decimal lookup | `tokencost` (PyPI) | Acceptable if we tolerate ~4-week lag on new model launches; we need same-day for `claude-opus-4-7` etc. |
| Z-score over EWMA in stdlib | `river` (online ML) | If we add 5+ different anomaly types and need a unified API. Currently 1 type — overkill. |
| Z-score over EWMA in stdlib | `scipy.stats.zscore` + warehouse | If we kept >100M events and ran batch ML pipelines. Local SQLite single-user — not the workload. |
| Reuse 120s dispatcher tick | APScheduler in-process | If alerts needed sub-minute SLA or cron-style schedules per rule. The current grain is fine. |
| Side-by-side recharts panels for compare | `react-diff-viewer-continued` | If comparison were textual (e.g., diffing two CLAUDE.md files). It's tabular skill rollups — wrong tool. |
| `attrs_skill_name` indexed column on `otel_events` | JSON1 `json_extract` in WHERE | If we expected <50k events ever. We expect millions; index pays for itself in week 1. |
| `cmc/skills/aggregator.py` SQL CTEs | pandas DataFrame aggregations | If we left SQLite. We won't. CTE+window functions are faster and zero-deps. |
| OTEL event-only, not JSONL | JSONL parse + heuristic | Pure JSONL would require fragile pattern matching against `Skill` tool blocks; OTEL is canonical. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| pandas / numpy / scipy / statsmodels | 30–80 MB transitive, sets a precedent for "scientific stack" deps the project has explicitly avoided. The math here is scalar EWMA. | Pure stdlib `math` + a `dataclass` for state. |
| LiteLLM / tokencost | Lag, dep weight, scope mismatch. | Hand-rolled `pricing.py`. |
| react-diff-view / git-diff-view / diff-match-patch | Text-diff tools; session comparison is structured tabular. | Side-by-side recharts BarChart + table. |
| react-window / react-virtualized | Adds complexity to skill timeline; existing `useFirehose` ring buffer + 500-event cap is already the perf strategy. | Reuse `useFirehose`. |
| APScheduler / Celery / Dramatiq / RQ | Implies broker / worker / persistent state; orthogonal to localhost-single-machine model. | Reuse 120s `run_one_cycle`. |
| WebSockets for skill timeline | Project explicitly chose SSE-only at v1.0. | Reuse `/api/firehose` SSE with `event_name` filter. |
| float for $ math | Drift across thousands of events. | `Decimal` (stdlib) with `quantize` at boundaries. |
| Storing $ in DB | Pricing tables change; stored numbers go stale silently. | Compute on read; store tokens only. |
| JSON1 path queries on hot path | 10–100× slower than indexed column for skill name lookups. | Add `attrs_skill_name` indexed column at ingest. |
| New scheduler library | Existing dispatcher tick proven at v1.0. | Append `await evaluate_alert_rules()` to `run_one_cycle`. |
| New Telegram channel / new notification kind logic | TELE-04 dedup contract already proven. | New `kind='skill_alert'` value + new template only. |
| `numpy.histogram` for distributions | Stdlib `bisect` / `Counter` covers what the panels need. | Pure Python. |

---

## Stack Patterns by Variant

**If the user wants to A/B compare two skills (not two sessions):**
- Reuse the same `SessionCompareView` shell with `target_kind='skill'` instead of `session`.
- API endpoint shape is identical (filter by `attrs_skill_name IN (a, b)` instead of `session_id IN (a, b)`).

**If the user wants project-level skill rollups (cwd grouping):**
- Already feasible — the existing `OPNL-10` project breakdown joins `sessions.cwd` → display_path. Add `attrs_skill_name` to the GROUP BY.
- No new tables.

**If the user later wants forecast-style anomaly detection (seasonal trends):**
- That's when `prophet` or `river` would be justified. Defer until requested.
- Z-score-over-EWMA covers "yesterday vs today" without seasonality, which is the v1.1 ask.

**If `OTEL_LOG_TOOL_DETAILS=0` is set on the user's Claude Code:**
- The skill name attribute may be missing from some events. Fallback: log the gap, surface "n/a" in the UI panel, link to docs telling the user to enable the env var. This is the same defensive shape as INGST-08's MCP attribute fallback.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `aiosqlite==0.22.1` | SQLite ≥ 3.38 (JSON1 always-on) | Already required by existing `body: dict` JSON columns. |
| `aiosqlite==0.22.1` | SQLite ≥ 3.47 (window functions) | Already required by `cmc/mcp/aggregator.py` Pattern 4. macOS Sonoma ships 3.43 — check the bundled SQLite when packaging; aiosqlite uses the `sqlite3` stdlib module which uses the system lib **unless** the install target includes a newer pysqlite3 binary. Project already runs on this constraint at v1.0 — no new risk introduced by v1.1. |
| `recharts@3.8.1` (project pin) | React 19.2 | **Verify the `3.8.1` pin is correct** — Context7 mirror's latest is `v3.3.0`. Either the pin is internal/forked or it's a typo for `3.3.1`. Confirm before doing any chart work in v1.1; if it's a typo, the right action is to bump to actual current `recharts@3.3.x`. |
| `@tanstack/react-query@5.100.5` | React 19.2 | Existing pin holds; new hooks compose on the existing `QueryClient`. |
| Pydantic `2.13.3` + SQLModel `0.0.38` | each other | Existing combination — no change. New `AlertRule` / `AlertEvent` models follow the existing patterns in `cmc/db/models/`. |
| `croniter==6.2.2` (existing) | — | Optional: alert rules with cron-style schedules (e.g., "evaluate every Monday 9am") can reuse this; but **default cadence is the dispatcher tick**, no cron needed for v1.1 baseline. |

---

## Sources

- **Context7 `/anthropics/claude-code`** — verified absence of skill metric counter; confirmed metrics list (`session.count`, `lines_of_code.count`, `pull_request.count`, `commit.count`, `cost.usage`, `token.usage`, `code_edit_tool.decision`, `active_time.total`). HIGH confidence.
- **Context7 `/ericbuess/claude-code-docs`** mirror of `monitoring-usage.md` — confirmed `claude_code.skill_activated` event name, attributes (skill name, invocation trigger, skill source, plugin name + marketplace under `OTEL_LOG_TOOL_DETAILS=1`). Confirmed `claude_code.tool_result` carries `success`, `duration`, `tool_name='Skill'` for skill-tool failures. Confirmed `prompt.id` correlation attribute links activation → api_request → tool_result. HIGH confidence.
- **Context7 `/ericbuess/claude-code-docs`** `agent-sdk__cost-tracking.md` — confirmed `ModelUsage.costUSD` is a "client-side estimate" (Anthropic's own framing), confirmed model-keyed cost breakdown is the canonical shape. HIGH confidence on shape; pricing **numbers** must be verified at requirements freeze against `https://www.anthropic.com/pricing` (web access not available in this research session — flagged for requirements phase).
- **Context7 `/anthropics/anthropic-sdk-python`** — verified there is no `models.pricing` API; `models.list()` returns id/display_name/created_at only. Confirms hand-rolled pricing is the only path. HIGH confidence.
- **Context7 `/mrwangjusttodo/git-diff-view`** + `/otakustay/react-diff-view` — confirmed these are line/character diff tools for code; not appropriate for tabular session comparison. HIGH confidence on the negative recommendation.
- **Local repo `cmc/mcp/aggregator.py`** — confirmed Pattern 4 (SQLite 3.47+ window-function p50/p95) is the established shape, directly reusable for per-skill latency.
- **Local repo `cmc/ingest/otel_parser.py`** — confirmed the `iter_attrs` + `extract_mcp_attrs` pattern is the established shape for indexed-attribute extraction; `extract_skill_attr` slots in identically.
- **Local repo `cmc/dispatcher/heartbeat.py`** — confirmed the 120 s tick already does cheap end-of-cycle housekeeping; alert evaluation is a one-line addition.
- **Local repo `cmc/telegram/notifier.py`** + `notification_log.py` — confirmed the `kind` field is open-text and dedup is via UNIQUE(kind, entity_id, chat_id); `'skill_alert'` is a new value with zero migration cost.
- **Local repo `frontend/src/lib/queries.ts`** — confirmed cadence ladder (5s / 10s / 15s / 30s / 60s / 120s / 300s); v1.1 hooks slot into existing tiers.
- **PROJECT.md note** — placeholder `claude_code.skill_invoked` was the assumed name at v1.0 deferral; **confirmed adjusted to `claude_code.skill_activated`** as the canonical Anthropic name. Update PROJECT.md / REQs accordingly when defining requirements.

### Open verification flags for requirements phase

1. **Pricing numbers**: fetch from `https://www.anthropic.com/pricing` for `claude-opus-4-7`, `claude-opus-4-7[1m]`, `claude-sonnet-4-6`, `claude-sonnet-4-6[1m]`, `claude-haiku-4-5`. Capture: input, output, cache-read, 5m-cache-write, 1h-cache-write per Mtok. Drop into `cmc/pricing.py` PRICES dict. **Not optional** — without this verification, all dollar figures in the UI are guesses.
2. **`recharts@3.8.1` pin verification**: confirm whether this is a real version (forked / vendored) or a typo for `3.3.1`. If typo, plan a small bump to `recharts@3.3.x` as part of v1.1 prep.
3. **`OTEL_LOG_TOOL_DETAILS=1` user setup**: confirm the user's local Claude Code has this env var set. Without it, the skill_activated event name flows but the `skill_name` attribute may be missing on some invocation paths. Doctor CLI should be extended to check + warn.
4. **One-shot data spike before locking schema**: before the migration adds `attrs_skill_name`, run a one-time `SELECT json_extract(body, ...) FROM otel_events WHERE event_name='claude_code.skill_activated' LIMIT 100` to confirm the actual attribute key name (`skill_name` vs `skill.name` vs `name`) — Anthropic docs are sparse on the literal key. Adjust the extractor accordingly.

---

*Stack research for: v1.1 Skills & Cost Intelligence (Claude Mission Control)*
*Researched: 2026-05-02*
*Confidence: HIGH on architecture and OTEL spike, MEDIUM on pricing numbers (verification gate flagged)*
