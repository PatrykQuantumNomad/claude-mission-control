# Architecture Research — v1.2 Depth & Polish

**Domain:** Local single-user observability dashboard (FastAPI + SQLAlchemy 2.0 async + SQLite WAL backend; React + TanStack Router + recharts frontend; launchd-managed dispatcher; Telegram bridge).
**Researched:** 2026-05-05
**Confidence:** HIGH (all integration points verified by reading the v1.1 source files; no v1.2 code exists yet).

## Scope of This Document

This is a **subsequent-milestone** architecture study — the v1.0/v1.1 architecture is already shipped and stable; v1.2 is a depth-pass adding 10 differentiator REQs across 4 lanes plus a polish phase. This document maps each v1.2 feature to existing modules, identifies the smallest correct extension, and proposes a buildable phase decomposition. Anti-patterns are called out where v1.0/v1.1 conventions could be violated.

## v1.1 Layered Overview (carry-over context)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Frontend (React + Vite)                          │
│  Routes (file-based, parent-layout opt-out via trailing-underscore):      │
│  /  /activity  /skills  /skills/$name  /alerts  /sessions/compare         │
│  Panels: 21 v1.0 + 6 v1.1 = 27 total                                      │
│  State: React Query (cadence buckets in lib/queries.ts) + useFirehose SSE │
│  Cmd+K: cmdk Command.Dialog mounted in <AppShell> (context-aware)         │
├──────────────────────────────────────────────────────────────────────────┤
│                            FastAPI Application                            │
│  Routers (cmc/api/routes/): activities sessions skills cost alerts        │
│   schedules tasks decisions inbox observability mcp system + 5 more       │
│  Schemas (cmc/api/schemas/): UTCDatetime PlainSerializer; Decimal as str  │
│  SSE: /api/firehose (otel) + /api/sessions/live/{sid}/stream              │
├──────────────────────────────────────────────────────────────────────────┤
│            Domain modules                  │   Dispatcher (launchd 120s)  │
│  cmc/pricing.py         (compute_cost)     │  cmc/dispatcher/heartbeat.py │
│  cmc/alerts/detector.py (threshold/EWMA)   │   1. stamp_tick              │
│  cmc/alerts/scopes.py   (_SCOPE_EXTRACTORS)│   2. e-stop check            │
│  cmc/skills/scanner.py  (registry sync)    │   3. evaluate_alerts (ALRT)  │
│  cmc/schedules/nlcron.py (NL→cron Haiku)   │   4. sweep / materialize     │
│  cmc/dispatcher/skill_router.py (NL→skill) │   5. claim + run             │
├──────────────────────────────────────────────────────────────────────────┤
│                    SQLAlchemy 2.0 async + SQLModel                        │
│  18+ tables. Key for v1.2:                                                │
│    sessions (cwd, model, started_at, tokens_*, tool_call_count)           │
│    otel_events (event_name, attrs_skill_name idx, body JSON, session_id)  │
│    tools (session_id, tool_name, started_at, ended_at, duration_ms)       │
│    alert_rules / alert_state (rule_id+scope_key, EWMA in params_json)     │
│    skills (name PK, autonomy, frontmatter, path)                          │
│    pricing (model, effective_from/until)  token_usage (daily rollup)      │
│    notification_log decisions  (UNIQUE dedup_key WHERE status='pending')  │
├──────────────────────────────────────────────────────────────────────────┤
│                  SQLite (data/cmc.db) — WAL mode, single writer          │
│              Alembic migrations: 0001_initial, 0002_v1_1_*               │
└──────────────────────────────────────────────────────────────────────────┘
```

### Established Conventions (must be honored by v1.2)

| Convention | Where | Implication for v1.2 |
|---|---|---|
| Cost is **read-time computed**, never stored as $ | `cmc/pricing.py::compute_cost` | ANLY-06 forecast is also read-time; never persist a forecasted dollar amount |
| Decimal-as-JSON-string (frontend template-literal display) | `cmc/api/schemas/*.py` (`cost_usd: Decimal`) | All v1.2 cost fields use `Decimal`, never `float` |
| `_RANGE_TO_DAYS` is **copied verbatim** between routers | `cost.py`, `skills.py`, `alerts.py` | New routers/extensions follow same precedent (don't centralize) |
| SQL via `sqlalchemy.text` + named binding (no ORM joins for analytics CTEs) | `_BREAKDOWN_BY_*_SQL`, `_USAGE_TOP_SQL`, etc. | v1.2 SQL extensions use the same `text()` pattern with named params |
| Tool-counts use **denormalized** `sessions.tool_call_count` (Pitfall 11 — never `COUNT(tools.*)`) | `sessions.py::_build_compare_side` | CMPR-06 must NOT introduce `COUNT(tools.*)` in compare path |
| Stable dedup key for alerts: `f"alert:{rule_id}:{scope_key}"` | `dispatcher/alerts.py::_emit_firing` | ALRT-13 anomaly extension reuses the same key; no new format |
| ALRT-12 invariant: alert engine NEVER imports `cmc.dispatcher.tasks` | AST audit in `test_alerts_dispatcher.py` | ALRT-13/14 must keep audit green |
| Routers copy `_RANGE_TO_DAYS` (not central import) | All Phase 14/15 routers | New routers continue this pattern |
| TanStack parent-layout opt-out via trailing-underscore filenames | `skills_.$name.tsx`, `sessions_.compare.tsx` | New full-page routes use the same naming |
| Hand-written `validateSearch` UUID validator (no zod added) | `routes/sessions_.compare.tsx` | Reuse the helper if more search-param routes added |
| KNOWN_METRICS constant on frontend mirrors backend `_SCOPE_EXTRACTORS` keys | `AlertRuleForm.tsx:35` | When ALRT-13 adds metrics, both lists must change in lockstep |

## Per-Feature Integration Map

For each REQ, "Confidence" reflects how confident the integration approach is given the source files inspected.

### Skills polish lane

#### SKLP-08 — Per-project skill breakdown

**What:** Show a per-skill table broken out by `cwd` (project) so operators see which project drives each skill's invocations / cost.

**Existing module to extend:** `backend/cmc/api/routes/skills.py` (the file that hosts `/api/skills/usage`, `/api/skills/{name}/cost|latency|runs`).

**Approach:**
- Extend `_USAGE_TOP_SQL` (skills.py:230) with an optional `cwd` LEFT JOIN to `sessions` and a new `dim` query parameter, OR add a sibling endpoint `/api/skills/{name}/projects?range=` mirroring the `_BREAKDOWN_BY_PROJECT_SQL` shape from `cost.py:160`.
- **Recommendation:** sibling endpoint (`/api/skills/{name}/projects`). Reasons:
  1. Per-skill detail page already has cost/latency/runs siblings — projects fits cleanly alongside.
  2. Adding a `cwd` dimension to `/api/skills/usage` complicates the sparkline shape (sparkline is per-skill per-day; per-skill per-cwd per-day would balloon the response).
  3. New endpoint avoids breaking the SkillUsageRow contract used by `TopSkills.tsx`.
- **SQL pattern:** Mirror `_BREAKDOWN_BY_SKILL_SQL` (cost.py:147) — JOIN `otel_events o` to `sessions s` on `session_id`, GROUP BY `COALESCE(s.cwd, '<unknown>')`, filter `event_name='skill_activated' AND attrs_skill_name=:name`. Read-time cost via `compute_cost`.
- Optional: also expose `dim=project` on the existing breakdown endpoint (already exists at `cost.py::cost_breakdown` with `BreakdownDim = model|skill|project`, but currently project is not skill-filtered) — **defer**, that's a different aggregation.

**DB impact:** None. `sessions.cwd` column already exists with `idx_sessions_cwd` index.

**Frontend:** New panel `SkillProjectsTable.tsx` rendered on `/skills/$name`. New query hook `useSkillProjects(name, range)` in `lib/queries.ts` (30s cadence, matches other skill panels).

**Confidence:** HIGH.

#### SKLP-09 — Period-over-period delta

**What:** Show "this period vs previous period" arrows/percentages on skill totals (e.g., 7d vs prior 7d).

**Existing module to extend:** Same file (`skills.py`), same endpoints.

**Approach:**
- Add a previous-period CTE alongside the current-period CTE in `_USAGE_TOP_SQL` and the per-skill cost/latency SQL. Pattern:

```sql
WITH curr AS (
  SELECT ... WHERE ts >= datetime(:since)
),
prev AS (
  SELECT ... WHERE ts >= datetime(:prev_since) AND ts < datetime(:since)
)
SELECT curr.skill_name, curr.total AS curr_total, prev.total AS prev_total
FROM curr LEFT JOIN prev USING (skill_name);
```

- Add `prev_total: int | None`, `delta_pct: float | None` (or `Decimal | None`) to `SkillUsageRow` / `SkillCostResponse`. None-when-no-prior-window matches existing nullable patterns.
- Range stays unchanged (`SkillRange = "14d" | "30d"`); the prior-window length matches the current window.

**DB impact:** None. Same indexes.

**Frontend:** Extend `TopSkills.tsx` and `SkillCostCard.tsx` to show a delta badge (↑12% / ↓4%). Existing `Decimal`-as-string convention applies if delta is `Decimal`; `float` is acceptable here because percent precision is display-only.

**Confidence:** HIGH.

#### SKLP-10 — "New" / "Dormant" badges

**What:** "New" = first seen within current period. "Dormant" = last seen ≥30d ago.

**Decision: backend-computed.** Reasons:
1. Frontend doesn't have full per-skill first/last-seen data (`SkillsRegistry` only has `updated_at` from registry sync, NOT first activation event).
2. Backend already has the data via `MIN(ts)` / `MAX(ts)` on `otel_events WHERE event_name='skill_activated' AND attrs_skill_name=...` — single CTE.

**Approach:**
- Add a `first_activated_at`, `last_activated_at: datetime | None` field to `SkillRow` / `SkillUsageRow` (response only — NOT stored on the `skills` table).
- Computed via a small CTE on `otel_events`:

```sql
SELECT
  attrs_skill_name AS skill_name,
  MIN(ts) AS first_activated_at,
  MAX(ts) AS last_activated_at
FROM otel_events
WHERE event_name = 'skill_activated' AND attrs_skill_name IS NOT NULL
GROUP BY skill_name;
```

- "New"/"dormant" classification happens **on the frontend** (display logic) — backend just returns the timestamps, frontend compares to `now - range` for "new" and `now - 30d` for "dormant". This keeps the badge thresholds tweakable without API changes.

**Alternative considered:** Store `first_seen_at` on the `skills` table (would require migration 0003 and a backfill). **Rejected** — registry rows can predate first activation (skill installed but never run), so derived-from-events is more honest.

**Frontend:** Update `SkillsRegistry.tsx` and `TopSkills.tsx` with two new badge components. Add to existing index file `panels/index.ts`.

**Confidence:** HIGH.

#### SKLP-11 — Latency overhead breakdown

**What:** "Where is the time going inside a skill invocation?" — split skill duration into tool-call time vs LLM time vs other.

**This one is the hardest of the lane.** Worth flagging.

**Existing data audit:**
- `otel_events` has `skill_activated` rows with `duration_ms` in attributes (extracted via `json_each`). This is the **outer** skill duration.
- `otel_events` also has `api_request` rows with token counts and (per Phase 14 dual-path attribution work) request_id linkage.
- `tools` table has individual tool calls with `started_at`, `ended_at`, `duration_ms`. Linkable to a session but **not** linkable to a single skill activation event without a request_id JOIN.
- There is **no** existing OTEL span hierarchy that decomposes a skill invocation. Phase 12's SPIKE explicitly noted skill events are **not** spans — they are point events with a duration attribute.

**Decision: derive, don't add new spans.**

**Approach:**
- For each `skill_activated` event in window:
  - Total = `duration_ms` from event attributes.
  - Tool time = SUM(`duration_ms`) on `tools` rows in same `session_id` whose `started_at` falls within `[skill_event.ts, skill_event.ts + total_ms]`.
  - LLM time = SUM(`duration_ms`) on `otel_events` `event_name='api_request'` matching the dual-path request_id pattern from `skills.py:380` (Path R) when available; fallback Path S = best-effort approximation.
  - Other = total − tool − llm (clamp to ≥0).
- Aggregate across the window (median or mean of per-event splits).
- New endpoint: `GET /api/skills/{name}/overhead?range=` returning `{tool_ms, llm_ms, other_ms, total_ms, sample_count, low_sample: bool}`.

**Caveats / risks:**
- Tool-call temporal containment is approximate — concurrent tool calls in nested skill invocations could double-count. Document this limitation in the response model docstring.
- This is the one feature that may benefit from a research spike before plan-out (similar to Phase 12 OTEL skill spike).

**DB impact:** None.

**Frontend:** New panel `SkillOverheadCard.tsx` on `/skills/$name`. Render as a stacked horizontal bar (recharts BarChart, like `ChartsStrip.tsx` precedent) with three segments + a low-sample badge.

**Confidence:** MEDIUM — derivation approach is sound but temporal-containment heuristics need a small validation spike.

### Cost differentiators lane

#### ANLY-06 — Monthly cost forecast

**What:** Project end-of-month cost based on month-to-date burn rate.

**Existing module to extend vs new module:** The existing module `cmc/pricing.py` is pure compute (`compute_cost(model, tokens, rates)`) — strictly stateless math. The forecast adds a **time-series projection layer**, which is a different responsibility.

**Recommendation:** Add a new module `cmc/cost/forecast.py` (creating the directory `cmc/cost/`). This is the right boundary — `cmc/pricing.py` stays pure unit-cost math; `cmc/cost/forecast.py` consumes pricing + reads `token_usage` history for projections. Mirrors the `cmc/alerts/{detector,scopes}.py` split where pure functions sit beside data-coupled extractors.

**Approach:**
- `forecast.py::project_monthly_cost(db, *, today: date) -> dict`. Reads `token_usage` for current month (1st → today), aggregates to a daily Decimal, multiplies by days-in-month / day-of-month for naive linear projection.
- Optional refinement: simple weighted average over last 7 days × remaining days. Keep stdlib-only (no statsmodels / numpy) — same discipline as `cmc/alerts/detector.py`.
- Endpoint: `GET /api/cost/forecast?month=YYYY-MM` (default current month).

**DB impact:** None. `token_usage.day` is already DATE-indexed.

**Frontend:** Extend `TokenUsageCard.tsx` with a forecast row, OR new `CostForecastCard.tsx` panel. **Recommend:** new panel — TokenUsageCard is dense already.

**Anti-pattern to avoid:** Don't store the forecast result in a table. Like cost itself, forecast must be read-time so a corrected pricing row backdates the forecast (consistent with the `effective_from`/`effective_until` self-correcting story).

**Confidence:** HIGH.

#### ANLY-07 — Per-project cost card

**What:** Surface cost grouped by `cwd` as a top-level activity-page card.

**Existing module to extend:** `cmc/api/routes/cost.py::cost_breakdown` already supports `dim=project` — the SQL is `_BREAKDOWN_BY_PROJECT_SQL` at `cost.py:160`.

**Recommendation:** No new endpoint. Frontend-only addition.

**Frontend:**
- New panel `ProjectCostCard.tsx` querying the existing `/api/cost/breakdown?dim=project&range=7d` endpoint.
- Pattern after existing `ProjectBreakdownCard.tsx` (which already does cwd grouping for tokens).
- Add to `/activity` page composition.

**DB impact:** None.

**Confidence:** HIGH (the heavy lifting was already done in Phase 13 as foresight).

### Alert differentiators lane

#### ALRT-13 — Full anomaly detection

**What:** v1.1 shipped EWMA z-score anomaly detection. ALRT-13 is the "full" version — additional detector(s) and richer params.

**Existing module to extend:** `cmc/alerts/detector.py` already has `evaluate_anomaly` returning `(AlertSignal, dict)` and persisting EWMA state in `alert_state.params_json`.

**Recommendation:** Extend `cmc/alerts/detector.py` with one or more additional detector functions (e.g., `evaluate_seasonal_anomaly`, `evaluate_change_point`) AND extend the rule's `params_json` schema to discriminate by `params_json.detector` ("ewma_zscore" | "seasonal" | "change_point"). Dispatch in `dispatcher/alerts.py::evaluate_alerts` based on `params_json.detector` (default = "ewma_zscore" for back-compat).

**Anti-pattern to avoid:** **Don't** introduce a third top-level `kind` value (current values are `threshold | anomaly`). Adding "seasonal" at the kind level would force a state machine fork in `evaluate_alerts`. Keeping it under `params_json.detector` is consistent with the v1.1 lock that EWMA-specific config (`window_n`) lives in `params_json`.

**Stdlib-only constraint:** `cmc/alerts/detector.py` v1.1 imports only `math`. Maintain this — no scipy / numpy. Seasonal detection can be done with a rolling window of same-day-last-week values.

**DB impact:** None — `alert_rules.params_json` is JSON.

**Frontend:** Extend `AlertRuleForm.tsx` discriminated-union UI to render new detector-specific param fields when `kind=anomaly` and `params_json.detector` is selected.

**Confidence:** HIGH for the integration approach. MEDIUM for which specific second detector to add — depends on requirements.

#### ALRT-14 — NL-authored alert rules

**What:** Operator types "alert me when daily cost exceeds $10" — system parses to `AlertRuleCreate`.

**Existing pattern:** Two existing NL-Haiku integrations.
1. `cmc/schedules/nlcron.py` — NL → cron string. Used by `POST /api/schedules/parse-nl` returning `{cron, description}`. Strict JSON mode, croniter validation, returns None on graceful-degradation paths.
2. `cmc/dispatcher/skill_router.py` — NL task → skill name. Same lazy-import pattern, validates against registry.

**Recommendation:** New module `cmc/alerts/nl_parser.py` mirroring `nlcron.py` exactly (same code shape — see decision below).

**Endpoint placement decision (the question raised in the prompt):**

| Option | Description | Verdict |
|---|---|---|
| A | **Pre-validate endpoint**: `POST /api/alerts/parse-nl` returns a draft `AlertRuleCreate` shape; frontend submits that to `POST /api/alerts/rules` after user confirms. | ✓ **Recommended** |
| B | **Inline in submit**: extend `POST /api/alerts/rules` to accept either an `AlertRuleCreate` body OR a `{prompt: str}` body. | ✗ Conflates two concerns; mirrors the rejected pattern from schedules where `/api/schedules/parse-nl` is its own endpoint |
| C | **Frontend Haiku call** | ✗ Leaks ANTHROPIC_API_KEY to browser; also breaks the dispatcher-only Haiku discipline |

Option A wins on three grounds:
1. **Mirrors `parse-nl` precedent** for schedules — consistent UX (user sees the parsed rule before committing, can edit) and consistent backend module shape.
2. **Server validates twice**: NL parser asserts parse success + returns valid `AlertRuleCreate`-shaped JSON; user confirms; `POST /api/alerts/rules` re-runs `is_known_metric`, `model_validator` thresholds, etc.
3. **Single 503 graceful-degradation point** when `ANTHROPIC_API_KEY` is unset (matches `nlcron.py` exactly).

**Module shape:**
```python
# cmc/alerts/nl_parser.py
async def parse_nl_alert(prompt: str) -> dict | None:
    """NL → AlertRuleCreate-shaped dict via Claude Haiku 4.5.
    Returns None on missing API key, malformed JSON, unknown metric.
    Caller wraps as AlertRuleCreate(**result) for full Pydantic validation.
    """
```

System prompt is much richer than `nlcron.py` because output is a JSON object with 7+ fields (kind, metric, threshold_fire, etc.) — but the discipline is identical: strict JSON output, validate against `is_known_metric`, return None on hallucination.

**Endpoint:** `POST /api/alerts/parse-nl` taking `{prompt: str}`, returning `{rule: AlertRuleRowDraft, description: str}` or 503. Mounted in `cmc/api/routes/alerts.py` alongside CRUD.

**DB impact:** None.

**Frontend:** Extend `AlertRuleForm.tsx` with an NL-input field above the form. On submit, call `POST /api/alerts/parse-nl`, populate the form fields with the result, let user confirm/edit, then submit via the existing `useCreateAlertRule` mutation.

**Confidence:** HIGH — direct code-shape parallel to a working v1.0 pattern.

### Compare differentiators lane

#### CMPR-06 — Per-skill latency delta

**What:** In the compare view, for skills that fired in BOTH sessions, show the latency delta side-by-side.

**Existing endpoint:** `GET /api/sessions/compare?a=&b=` returns `SessionCompareSide` per side with `skills_used: list[str]` (just names) and `tool_counts: dict[str, int]` (per-tool counts) — but **NO per-skill latency or per-skill metrics**.

**Recommendation:** Extend the existing endpoint, not a new endpoint. Reasons:
1. Phase 16 invariant: compare is a **single round-trip**. Adding a second endpoint forces the frontend to make N requests.
2. The existing handler `_build_compare_side` already runs per-side SQL helpers (`_COMPARE_SKILLS_SQL`, `_COMPARE_OUTCOME_SQL`, `_COMPARE_TOOL_COUNTS_SQL`) — adding one more (`_COMPARE_SKILL_LATENCIES_SQL`) keeps the same shape.

**Approach:**
- Add a new SQL CTE on `otel_events WHERE event_name='skill_activated' AND session_id=:sid AND attrs_skill_name IN (skills_used)`, GROUP BY `attrs_skill_name`, computing `MEDIAN(duration_ms)` (or just `AVG` for v1) via the percentile pattern from `skills.py::_LATENCY_SQL`.
- Add field `skill_latencies: dict[str, int]` (skill_name → median_ms) to `SessionCompareSide`.
- Frontend computes the delta client-side (`a.skill_latencies[name] - b.skill_latencies[name]`) — keeps the wire payload minimal.
- Defensive: skip skills with sample_count < (something low like 3) — emit None instead.

**Over-cap interaction:** When `over_cap=true` on a side, skip the latency CTE on that side (set `skill_latencies={}`). Mirrors how `tool_counts` is treated (existing precedent at `sessions.py:165`).

**DB impact:** None.

**Frontend:** Extend `SessionCompareView.tsx` skill-set diff block to render a small two-column latency delta table for the `shared` skills (top of the diff). Display as `aMedian` vs `bMedian` with delta badge.

**Confidence:** HIGH.

#### CMPR-07 — Cmd+K "Compare with previous" shortcut

**What:** When viewing a session, Cmd+K offers "Compare with previous session" — auto-picks the prior session in same `cwd`.

**Existing pattern:** `CommandPalette.tsx:50-115` already has context-aware "Compare with…" (when `currentA` set, opens picker Sheet). CMPR-07 adds a "previous in cwd" shortcut.

**Decision: frontend-only, but needs ONE small new endpoint.**

Reasons:
1. The frontend doesn't have the data to find "previous session in same cwd" — `/api/sessions` lists sessions but the frontend would have to fetch, sort by `started_at`, find the one before `currentA`. That's a 50-row payload to find one ID.
2. The cleanest thing is a tiny endpoint: `GET /api/sessions/{session_id}/previous` returning `{session_id: str | null}` — looks up the row immediately preceding `:session_id` ordered by `started_at DESC` matching the same `cwd`.
3. Alternative — `GET /api/sessions?cwd=<encoded>&limit=2&before=<sid>` extending the existing list endpoint — works but **the existing list endpoint doesn't support `before` and adding it for this single use is over-broad**.

**Recommendation:** Add the dedicated `/api/sessions/{session_id}/previous` endpoint. Tiny SQL: `SELECT session_id FROM sessions WHERE cwd = (SELECT cwd FROM sessions WHERE session_id = :sid) AND started_at < (SELECT started_at FROM sessions WHERE session_id = :sid) ORDER BY started_at DESC LIMIT 1`. Returns 200 with `{session_id: null}` when none exists (NOT 404 — empty case is normal, like the empty-string result from `nlcron`).

**DB impact:** None — `sessions.cwd` and `sessions.started_at` already indexed.

**Frontend:**
- New Cmd+K item "Compare with previous (same project)" — visible only when on a session-detail surface.
- On select: fetch `/api/sessions/{currentSessionId}/previous`, navigate to `/sessions/compare?a=<currentSid>&b=<prevSid>`. Empty result → toast "No previous session in this project" (use existing toast infrastructure if present, else inline message).

**Confidence:** HIGH.

### Polish lane

These are not architectural extensions — they fix carried tech debt. Architecture impact is mostly "where to make the edit, all in one phase."

| Item | File | Change |
|---|---|---|
| `Field(default_factory=datetime.utcnow)` deprecation | 8 schemas (search: `default_factory=datetime.utcnow`) | Replace with `default_factory=lambda: datetime.now(UTC).replace(tzinfo=None)` (preserves naive-UTC convention used by SQLite columns) |
| `SchedulesCard.test.tsx > stale row` flake | `frontend/src/components/panels/__tests__/SchedulesCard.test.tsx` | Stub `Date.now()` or `vi.useFakeTimers()` for time-of-day assertion |
| `schedule-composer.spec.ts` aria-label collision with Phase 14 firehose `Filter skill name` filter | Playwright spec | Tighten selector to scope by parent `[data-testid="schedule-composer"]` (or similar) |
| KNOWN_METRICS sync | `frontend/src/components/panels/AlertRuleForm.tsx:35` | When ALRT-13 adds metrics, this list must update in lockstep — call out in PHASE-N goals |

## Suggested Build Order (dependency-driven)

```
                 ┌────────────────────────────┐
                 │ Phase 18: Polish & Cleanup │  ← starts clean, no blockers, fast win
                 │  (carried debt + flakes)   │
                 └─────────────┬──────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
  │ Phase 19:    │      │ Phase 20:    │      │ Phase 21:    │
  │ Skills polish│      │ Cost depth  │      │ Alerts depth │
  │ SKLP-08..10 │      │ ANLY-06,07   │      │ ALRT-13      │
  │              │      │              │      │ ALRT-14      │
  └──────┬───────┘      └──────────────┘      └──────────────┘
         │
         ▼ (uses CTE + display patterns from 19)
  ┌──────────────┐
  │ Phase 22:    │
  │ Skills depth │
  │ SKLP-11      │ (the latency-overhead one — needs spike)
  └──────────────┘
                               │
                               ▼
                       ┌──────────────┐
                       │ Phase 23:    │
                       │ Compare depth│
                       │ CMPR-06,07   │
                       └──────────────┘
```

### Why this order?

1. **Phase 18 polish first.** Every other phase will write tests and ship features; doing the flakes + deprecation cleanup first means the rest of the milestone runs against green CI without false-positive failures on `SchedulesCard.test.tsx`. Cheap, high-leverage, no dependencies.

2. **Phase 19 (SKLP-08/09/10) before Phase 22 (SKLP-11).** SKLP-08/09/10 are pure SQL CTE extensions — mechanical and pattern-matched against existing `_USAGE_TOP_SQL`. SKLP-11 needs derivation logic and arguably a small validation spike (Phase 12-style). Building 19 first establishes the panel-rendering and badge-component patterns that 22 reuses.

3. **Phase 20 (cost depth) is independent** of skills work — its CTEs touch `token_usage` and `sessions`, not `otel_events`. Can run in parallel with 19/21/22 if desired (they touch different routers + different frontend panels).

4. **Phase 21 (ALRT-13 → ALRT-14).** ALRT-13 ships first because:
   - ALRT-14's NL parser needs to **emit** valid AlertRuleCreate JSON. Validating against the latest detector vocabulary (from ALRT-13) before NL goes live ensures the parser doesn't suggest legacy-only fields.
   - ALRT-14 expands `params_json` shape; doing 13 first locks the shape.
   - Both can fit in one phase if scoped tightly. **Recommendation:** combined phase, ALRT-13 plan first, ALRT-14 plan second.

5. **Phase 22 (SKLP-11) after 19** for shared SQL CTE patterns.

6. **Phase 23 (CMPR-06/07) last.** CMPR-06 extends a SQL helper inside `_build_compare_side`. CMPR-07 adds one tiny endpoint + a Cmd+K item. Together they fit cleanly in one phase. They don't depend on 19/20/21/22 architecturally, but going last means:
   - CMPR-06's per-skill latency delta benefits from SKLP-11's overhead logic if reusable.
   - CMPR-07 benefits from any URL-state polish in earlier phases.

## Suggested Phase Decomposition

**Six phases continuing from 18.** Each phase is sized to one architectural seam + a coherent UX deliverable.

### Phase 18 — Polish & Carry-Forward Cleanup
**Goal sentence:** Eliminate carried tech debt (deprecated `datetime.utcnow` in 8 schemas, two test flakes, two doc-citation drifts) so the v1.2 work runs against a clean baseline.
**Plans:** 1 plan covering the trifecta (datetime deprecation, test stabilization, doc fixes). Single-day phase.

### Phase 19 — Skills Per-Project & Period Deltas (SKLP-08, SKLP-09, SKLP-10)
**Goal sentence:** Add per-project skill breakdown, period-over-period deltas, and "new"/"dormant" classification to existing skill panels — all read-time, all in `cmc/api/routes/skills.py` + new sibling endpoint.
**Plans:** 3 plans (one per REQ) plus a small frontend integration plan. Architectural seams: extend existing CTEs + new SQL endpoint + 1 new panel + delta badges across existing panels.

### Phase 20 — Cost Forecast & Per-Project Card (ANLY-06, ANLY-07)
**Goal sentence:** Project end-of-month cost via `cmc/cost/forecast.py` and surface per-project cost via the existing `cost_breakdown` endpoint with a new `ProjectCostCard.tsx` panel.
**Plans:** 2 plans. ANLY-06 ships forecast module + endpoint + panel; ANLY-07 is frontend-only (existing endpoint).

### Phase 21 — Alert Anomaly Depth & NL Authoring (ALRT-13, ALRT-14)
**Goal sentence:** Extend the alert detector with a second anomaly detector (params_json-discriminated, stdlib-math only) and add Haiku-backed natural-language rule authoring via a new `cmc/alerts/nl_parser.py` mirroring the `nlcron.py` shape.
**Plans:** 2 plans. ALRT-13 first (detector + scope additions + KNOWN_METRICS sync), then ALRT-14 (NL parser + `/api/alerts/parse-nl` endpoint + form integration).

### Phase 22 — Skill Latency Overhead (SKLP-11)
**Goal sentence:** Decompose skill duration into tool / LLM / other time via temporal-containment derivation on existing `otel_events` and `tools` data (no new spans).
**Plans:** 2 plans recommended — first a small SPIKE-style validation plan (verify the temporal-containment math against real ingest data, similar to Phase 12 OTEL spike), then the implementation plan + new `SkillOverheadCard.tsx` panel.

### Phase 23 — Compare Depth (CMPR-06, CMPR-07)
**Goal sentence:** Add per-skill latency delta to the session-compare payload (single round-trip extension of `_build_compare_side`) and a Cmd+K "Compare with previous (same project)" shortcut backed by a new `/api/sessions/{sid}/previous` endpoint.
**Plans:** 2 plans, one per REQ. Together close the v1.2 milestone.

## Anti-Patterns Called Out

### Anti-Pattern 1 — Storing forecasted dollars

**What people do:** Create a `cost_forecast` table that gets written each night.
**Why it's wrong:** Breaks the v1.1 lock — cost is **always** computed from `tokens × rates(effective_window)`. Storing $ means a corrected pricing row would NOT backdate the forecast.
**Do this instead:** `cmc/cost/forecast.py` is a pure read-time function. Re-projects on every request.

### Anti-Pattern 2 — Adding a third `kind` for new anomaly detectors

**What people do:** ALRT-13 adds `kind = "seasonal"` to `alert_rules`.
**Why it's wrong:** Forces a state-machine fork in `dispatcher/alerts.py::evaluate_alerts`. The v1.1 lock is `kind: threshold | anomaly` — anomaly is a **family** of detectors discriminated by `params_json.detector`.
**Do this instead:** Stay inside `kind="anomaly"`; add `params_json.detector = "ewma_zscore" | "seasonal" | ...` discriminator.

### Anti-Pattern 3 — Inline NL parsing on the create endpoint

**What people do:** ALRT-14 extends `POST /api/alerts/rules` to accept `{prompt: str}` as an alternative body.
**Why it's wrong:** Conflates "parse NL" (LLM call, can fail with 503) with "persist a rule" (DB write, no Haiku dependency). Makes the create endpoint's failure modes less predictable.
**Do this instead:** `POST /api/alerts/parse-nl` is a separate read-only endpoint that returns a draft. User confirms; frontend calls existing `POST /api/alerts/rules`. Mirrors `POST /api/schedules/parse-nl`.

### Anti-Pattern 4 — Using `COUNT(tools.*)` for over-cap check on the new compare extension

**What people do:** CMPR-06's per-skill latency CTE adds a new `COUNT(tools.*)` somewhere "for safety."
**Why it's wrong:** Pitfall 11 (Phase 16) — never `COUNT(tools.*)`; always use the denormalized `sessions.tool_call_count`. Adding any new `COUNT(tools.*)` regresses that lock.
**Do this instead:** Reuse the `over_cap = sess.tool_call_count > 500` check already in `_build_compare_side`. Skip the per-skill latency CTE on over-cap sides.

### Anti-Pattern 5 — Storing `first_seen_at` on the `skills` table

**What people do:** Add a `first_seen_at: datetime` column to `skills` for SKLP-10 and backfill it.
**Why it's wrong:** A skill row in `skills` is "the registry knows about this skill" — that row can predate first activation (skill installed but never run). Confounding "registered at" with "first activated" misleads operators.
**Do this instead:** Compute first/last activation from `otel_events` at read time. Same pattern as cost — derived, not stored.

### Anti-Pattern 6 — Centralizing `_RANGE_TO_DAYS`

**What people do:** "Refactor" `_RANGE_TO_DAYS` to a shared constant module while touching cost/skills/alerts.
**Why it's wrong:** Phase 14 P02 + Phase 15 explicitly chose **copy** over centralize ("each Phase 14/15 router copies the constant verbatim per Phase 14 P02 precedent"). Routers stay independent — refactoring during a depth-pass adds churn for zero behaviour change.
**Do this instead:** New routers (if any) copy the same constant. Polish phase only renames if there's a defect.

## Integration Points Summary Table

| Feature | New module(s) | Modified module(s) | New endpoint? | DB migration? | Frontend impact |
|---|---|---|---|---|---|
| SKLP-08 | — | `cmc/api/routes/skills.py` (new SQL CTE) | + `/api/skills/{name}/projects` | No | New `SkillProjectsTable.tsx` on `/skills/$name` |
| SKLP-09 | — | `cmc/api/routes/skills.py` (CTE adds prev-period) | Extension | No | Delta badges in `TopSkills`, `SkillCostCard` |
| SKLP-10 | — | `cmc/api/routes/skills.py` (CTE adds MIN/MAX(ts)) | Extension (response field) | No | Badges in `SkillsRegistry`, `TopSkills` |
| SKLP-11 | — (deferred new module) | `cmc/api/routes/skills.py` | + `/api/skills/{name}/overhead` | No | New `SkillOverheadCard.tsx` |
| ANLY-06 | `cmc/cost/forecast.py` (new directory) | `cmc/api/routes/cost.py` (mounts endpoint) | + `/api/cost/forecast` | No | New `CostForecastCard.tsx` |
| ANLY-07 | — | — | No (reuse `dim=project`) | No | New `ProjectCostCard.tsx` |
| ALRT-13 | — | `cmc/alerts/detector.py`, `cmc/alerts/scopes.py` (new metric(s)?) | No (CRUD same) | No | KNOWN_METRICS sync; AlertRuleForm params UI |
| ALRT-14 | `cmc/alerts/nl_parser.py` | `cmc/api/routes/alerts.py` (mount endpoint) | + `/api/alerts/parse-nl` | No | NL input on `AlertRuleForm.tsx` |
| CMPR-06 | — | `cmc/api/routes/sessions.py` (`_build_compare_side` + new CTE) | Extension (response field) | No | Latency-delta block in `SessionCompareView.tsx` |
| CMPR-07 | — | `cmc/api/routes/sessions.py` | + `/api/sessions/{sid}/previous` | No | Cmd+K item in `CommandPalette.tsx` |
| Polish | — | 8 schemas + 2 tests | No | No | Tests + Playwright spec |

**Net new modules:** 2 (`cmc/cost/forecast.py`, `cmc/alerts/nl_parser.py`).
**Net new endpoints:** 4 (`/api/skills/{name}/projects`, `/api/skills/{name}/overhead`, `/api/cost/forecast`, `/api/alerts/parse-nl`, `/api/sessions/{sid}/previous`).
Wait — that is 5 endpoints. Recount: skills/projects, skills/overhead, cost/forecast, alerts/parse-nl, sessions/{sid}/previous = **5 new endpoints**.
**Extensions of existing endpoints:** 3 (`/api/skills/usage` and the per-skill cost/latency add prev-period + first/last; `/api/sessions/compare` adds `skill_latencies`).
**Migrations needed:** **0** — every v1.2 feature is read-time on existing schema. (This is by design — the v1.1 schema was built with v1.2 lookahead.)
**New frontend panels:** 4 (`SkillProjectsTable`, `SkillOverheadCard`, `CostForecastCard`, `ProjectCostCard`).
**New frontend routes:** 0 — all extensions of existing pages (`/skills/$name`, `/activity`, `/alerts`, `/sessions/compare`).

## Data Flow Changes

**Read paths (all 10 differentiator REQs):** No change to ingest or dispatcher write paths. Every feature is a read-time SQL extension or a new analytic module. The dispatcher tick gains nothing new; alert evaluation continues to call `_SCOPE_EXTRACTORS` (ALRT-13 just adds entries; ALRT-14 doesn't touch the dispatcher at all).

**One subtlety:** ALRT-14's NL parser runs in the API request path (not the dispatcher) — same as `nlcron`. It calls Anthropic Haiku 4.5 directly via `AsyncAnthropic` lazy import. Latency budget for the parse endpoint should match `parse-nl` schedules (≤2s typical, 5s p99 — Haiku is fast).

**Forecast caching:** ANLY-06 forecast is recomputed on every request (no cache). With v1.0 single-user load, this is fine — `token_usage` daily rollups are already small (≤30 rows/month).

## Scaling Considerations

This is a **single-user localhost dashboard**. Scale axis is "more sessions / more skill events over time," not "more users."

| Scale point | What happens | Architectural response |
|---|---|---|
| 30 days, ~50 skill events/day | All v1.2 SQL CTEs are sub-50ms on indexed columns | None |
| 90 days, ~500 skill events/day | Per-skill latency CTE on compare may hit 200ms | If observed, add a `(session_id, attrs_skill_name)` composite index — currently only `attrs_skill_name` is indexed solo |
| 1 year, archival | `otel_events` row count ~200k+ | Out of scope for v1.2 — same architecture, possibly a v2 archival concern |

**No premature optimization for v1.2.** The carried v1.1 indexes cover everything in this milestone.

## Sources

- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/routes/skills.py` — verified Phase 14 read-time SQL CTE patterns, dual-path attribution
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/routes/cost.py` — verified `_BREAKDOWN_BY_PROJECT_SQL` already exists, `dim=project` already supported
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/routes/alerts.py` — verified CRUD shape, dedup_key contract, ALRT-12 invariant
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/routes/sessions.py` — verified `_build_compare_side` composition (skills/outcome/tool_counts SQL helpers)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/alerts/detector.py` — verified stdlib-math-only, pure-function pattern, EWMA state in `params_json`
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/alerts/scopes.py` — verified `_SCOPE_EXTRACTORS` registry, `is_known_metric`
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/dispatcher/alerts.py` — verified dispatcher hook in heartbeat, dedup_key, auto-resolve
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/dispatcher/skill_router.py` and `cmc/schedules/nlcron.py` — verified Haiku NL pattern (lazy import, strict JSON, registry validation)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/pricing.py` — verified `compute_cost` Decimal-only purity
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/db/models/sessions.py`, `otel_events.py`, `tools.py`, `skills.py`, `alert_rules.py` — verified column shapes, indexes, no `first_seen_at` exists
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/ui/CommandPalette.tsx` — verified context-aware "Compare with…" already implemented
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/panels/AlertRuleForm.tsx` — verified KNOWN_METRICS frontend constant + sync warning convention
- `/Users/patrykattc/work/git/claude-mission-control/.planning/STATE.md`, `MILESTONES.md` — milestone scope + carried-debt list

---
*Architecture research for: v1.2 Depth & Polish (subsequent milestone — extension of v1.1 architecture)*
*Researched: 2026-05-05*
