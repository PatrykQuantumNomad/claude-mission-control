# Phase 14: Skills API & Page Panels — Research

**Researched:** 2026-05-03
**Domain:** FastAPI router on top of `otel_events` indexed columns + bespoke React/Recharts UI on TanStack Router/Query — wires the v1.0 placeholder skill panels with real data, and adds a per-skill detail route.
**Confidence:** **HIGH** for backend SQL/router pattern (Phase 13 cost router + observability percentile pattern are direct templates), HIGH for frontend panel/chart conventions (CacheEfficiencyCard / ToolLatencyCard are line-by-line analogs), MEDIUM for the request-scoped skill-cost refinement (the `(session.id, request_id)` JOIN to `api_request` is correct in shape but the `request_id` attribute presence on `skill_activated` events is TENTATIVE per SPIKE.md LOCK-9).

## Summary

Phase 14 is two halves glued by the `attrs_skill_name` indexed column Phase 13 P02/P03 already landed:

1. **Backend: 4 new `/api/skills/*` endpoints** added to the existing `cmc/api/routes/skills.py` (which already serves SKIL-01..03 catalog/sync/autonomy). The new endpoints reuse the Phase 13 cost-router patterns 1:1 — same `Literal["1d","7d","14d","30d"]` range enum, same `Decimal`-as-JSON-string serialization, same `compute_cost(...)` reader from `cmc.pricing`. The percentile latency endpoint (SKIL-06) is a textbook copy of `cmc/api/routes/observability.py::_TOOL_LATENCY_SQL` (Pattern-4 window-function CTE — `ROW_NUMBER() OVER (PARTITION BY skill ORDER BY duration_ms)` + `MAX(CAST(n*p AS INTEGER), 1)` offset) substituting `tools` → `otel_events WHERE event_name='skill_activated'`. Latency duration is read from `body.record.attributes` via the canonical `json_each(json_extract(body, '$.record.attributes'))` pattern (BUG-A-corrected — see `observability.py:535`).

2. **Frontend: 3 panels reactivate, 2 panels arrive new, 1 file-based dynamic route is born.** TopSkills (ACTV-04) and SkillCostCard (SKLP-02) currently render `<EmptyState heading="Coming in v2"/>` cards (`TopSkills.tsx:35`, `SkillCostCard.tsx:30`); reactivation strips the EmptyState and wires the new endpoints behind `useQuery` hooks following the existing `useCache(range)` / `useLatency(range)` 60s-cadence pattern in `lib/queries.ts`. SkillLatencyTable (SKLP-05) is a clone of `ToolLatencyCard.tsx` with the `Low sample` badge gated on `MIN_LATENCY_SAMPLES=30` (the `<Badge variant="warning">` reference at `CacheEfficiencyCard.tsx:55` is the canon). SkillTimeline (SKLP-06) is a clone of `OtelPanel.tsx` that calls `useFirehose({ eventName: 'skill_activated' })` (note: the hook prop is **camelCase `eventName`**, not `event_name` as the roadmap text reads — and per D-06 / Pitfall 1 / Pitfall 8, the BARE form `'skill_activated'` is correct because ingest strips the `claude_code.` prefix on write and `tail_otel_events` filters on the post-strip column value — see Plan 14-04 Task 3). The dynamic route `/skills/$name` arrives as `frontend/src/routes/skills.$name.tsx` (TanStack Router flat-file naming so it doesn't fold the existing `routes/skills.tsx` into a parent layout).

**Primary recommendation:** Build endpoints first (Wave 1 — 4 routes share one new router file), wire frontend panels in Wave 2 (4 panels share `lib/api.ts` + `lib/queries.ts` types), ship `/skills/$name` route last (Wave 3 — depends on all four endpoints + composes existing panels). The skill-cost refinement should land as a Wave-1 sub-task that JOINs `otel_events e_skill (event_name='skill_activated') ↔ otel_events e_req (event_name='api_request')` on `(session_id, attrs_request_id)` — see Open Question #1 because the `request_id` attribute on skill events is TENTATIVE; recommended fallback is `(session_id, otel_event_id BETWEEN ±1)` adjacency window with explicit graceful degradation to session-scoped attribution.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Skill rollup SQL (top-N, percentile, cost) | API / Backend (FastAPI router) | Database (read-only) | Mirrors Phase 13 cost router + observability tool-latency patterns. All aggregation is SQL; Python only iterates result rows + computes `Decimal` cost via `compute_cost()`. |
| Per-request skill→token attribution refinement | API / Backend (SQL JOIN) | Database (`otel_events` index on `attrs_skill_name`) | LOCK-9 deferred to Phase 14. JOIN `skill_activated` ↔ `api_request` events on `(session_id, request_id)` extracted from `body.record.attributes`. |
| Sparkline + daily-bucket trend | API / Backend (returns time-bucketed series) | Frontend (renders LineChart) | Server-side bucketing keeps the contract identical to existing `CacheTrendRow` shape — UI just renders. |
| TopSkills row click → drill-in | Frontend (TanStack Router `<Link>`) | — | Pure client-side navigation. |
| `/skills/$name` detail route | Frontend (file-based dynamic route) | API (3 endpoint calls per render) | TanStack Router `routes/skills.$name.tsx` (flat naming) loads `useParams().name`, fans out to skill cost / latency / runs hooks. |
| SkillTimeline live stream | Frontend (existing `useFirehose` hook) | API (existing SAPI-05 SSE — extended to forward `attrs_skill_name`) | Reuse the firehose; backend SSE payload needs one extra field (see "Files modified — backend"). |
| "Rates as of" caption | Frontend (renders `rates_as_of` from response) | API (already returned by skill cost endpoint) | Phase 13 cost responses already carry `rates_as_of` — Phase 14 just renders. |
| Low-sample badge | Frontend (component-local threshold check) | API (returns `sample_count`/`call_count`) | Same pattern as `CacheEfficiencyCard.tsx:55` (`<Badge variant="warning">Low sample</Badge>`). |

## Standard Stack

### Core (already pinned — no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fastapi` | 0.136.1 [VERIFIED: backend/.venv import] | Router + Pydantic v2 response models | Project default; Phase 13 cost router is the template. |
| `sqlalchemy` | 2.0.49 [VERIFIED: backend/.venv import] | `text()` SQL + window functions | Already used by every observability endpoint; SQLite 3.47 supports `ROW_NUMBER OVER` natively. |
| `pydantic` | 2.13.3 [VERIFIED: backend/.venv import] | Response model with `Decimal` → JSON string default | Phase 13 locked the Decimal-as-string contract; Phase 14 inherits. |
| `recharts` | 3.8.1 [VERIFIED: npm view recharts version → 3.8.1] | LineChart for sparklines + 14-day trend | Pinned current latest. STATE.md flagged this as a verification gate; verified — no bump needed. |
| `@tanstack/react-router` | ^1.168.24 [VERIFIED: frontend/package.json:24] | File-based routing including `$param` dynamic segments | Project router; flat-file naming (`skills.$name.tsx`) avoids folding the existing leaf route into a parent layout. |
| `@tanstack/react-query` | ^5.100.5 [VERIFIED: frontend/package.json:23] | Per-panel `useQuery`/`useMutation` hooks | Cadence policy lives in `lib/queries.ts` — never inlined in panels. |
| Decimal (Python stdlib) | 3.13 | Per-skill cost compute via `cmc.pricing.compute_cost` | Phase 13 ANLY-01 contract — Pitfall 1 (no `Decimal(float)`). |

### Supporting / Not Required
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline LineChart in each panel | Reusable `<Sparkline>` UI primitive | No existing `<Sparkline>` component (verified by grep). `CacheEfficiencyCard.tsx:60` ships its own inline `<ResponsiveContainer><LineChart>...`. Phase 14 follows that established pattern; do NOT introduce a new primitive — the planner should treat "two panels ship inline LineCharts" as the standard, not as duplication. |
| New SSE channel for skill events | Reuse existing `/api/firehose` with `?event_name=` filter | Roadmap and SKLP-06 are EXPLICIT — reuse the existing channel via `useFirehose({ eventName: 'skill_activated' })` (BARE event name + camelCase prop per D-06 / Pitfall 1 / Pitfall 8). NO new endpoint. |
| Move catalog `GET /api/skills` to `/api/skills/catalog` | Keep catalog endpoint, add new top-N endpoint at a different path | See Open Question #2 — preserves the existing `useSkills()` consumer (`SkillsRegistry.tsx:25`) without a coupled frontend rename. |

**Installation:** No new pip or npm dependencies. All existing.

**Version verification (2026-05-03):**
- `recharts 3.8.1` — current latest [VERIFIED: `npm view recharts version` → 3.8.1].
- Backend stack: `fastapi 0.136.1`, `sqlalchemy 2.0.49`, `pydantic 2.13.3` [VERIFIED: `.venv/bin/python -c "import …; print(__version__)"`].
- SQLite runtime: `3.47.1` [VERIFIED: `python -c "import sqlite3; print(sqlite3.sqlite_version)"`] — window functions HIGH-confidence supported.

## Architecture Patterns

### System Architecture Diagram

```
                                        ┌─────────────────────────────┐
                                        │ Phase 13 deliverables       │
                                        │  - cmc.pricing.compute_cost │
                                        │  - data/pricing.json        │
                                        │  - PricingRow + load_seed   │
                                        │  - otel_events.attrs_skill_ │
                                        │    name (indexed, populated)│
                                        │  - otel_events_id +         │
                                        │    UNIQUE(session_id,       │
                                        │    otel_event_id)           │
                                        └────────────┬────────────────┘
                                                     │
            ┌────────────────────┬───────────────────┼───────────────────┐
            ▼                    ▼                   ▼                   ▼
   ┌──────────────────┐ ┌────────────────────┐ ┌──────────────────┐ ┌──────────────────┐
   │ /api/skills/usage│ │ /api/skills/{name}/│ │ /api/skills/     │ │ /api/skills/     │
   │ (or /api/skills  │ │ cost?range=        │ │ {name}/latency?  │ │ {name}/runs?     │
   │ ?range= top-N)   │ │ - tokens via JOIN  │ │ range=           │ │ limit=           │
   │                  │ │   skill→api_request│ │ - p50/p95/max via│ │ - JOIN sessions  │
   │ - GROUP BY       │ │ - compute_cost()   │ │   ROW_NUMBER     │ │   for cwd ⇒ proj │
   │   attrs_skill_   │ │ - sparkline daily  │ │   window CTE     │ │ - sorted ts DESC │
   │   name           │ │ - rates_as_of      │ │ - error_rate via │ │   LIMIT          │
   │ - sparkline      │ │                    │ │   tool_result    │ │                  │
   │   buckets        │ │                    │ │   is_error JOIN  │ │                  │
   └────────┬─────────┘ └──────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘
            │                      │                    │                    │
            ▼                      ▼                    ▼                    ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │                       FRONTEND (apps/web /frontend)                           │
   │                                                                                │
   │  Activity page (routes/activity.tsx)                                          │
   │   └─ TopSkills.tsx (reactivated)                                              │
   │       └─ <Link to="/skills/$name" params={{name}}>...</Link>                  │
   │                                                                                │
   │  Skills page (routes/skills.tsx)                                              │
   │   ├─ SkillCostCard.tsx (reactivated)        ─── /api/skills/{name}/cost      │
   │   │                                              (per Plan 14-04 Task 1)       │
   │   ├─ SkillLatencyTable.tsx (NEW)            ─── /api/skills (top-N) + per-row │
   │   │                                              /api/skills/{name}/latency   │
   │   └─ SkillTimeline.tsx (NEW)                ─── useFirehose({ eventName:      │
   │                                                  'skill_activated' })          │
   │                                                                                │
   │  Detail route (routes/skills.$name.tsx — NEW file-based dynamic)              │
   │   ├─ useParams().name → 4 useQuery calls                                      │
   │   ├─ Cost section, Latency section, Recent runs (linked sessions)             │
   └──────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (file delta from current main)

```
backend/cmc/api/
├── routes/
│   └── skills.py                  ← MODIFIED: +4 endpoints (or +1 router file
│                                     and import via __init__.py — see Open Q #2)
└── schemas/
    └── skills.py                   ← MODIFIED: +SkillUsageResponse, SkillCostResponse,
                                       SkillLatencyResponse, SkillRunsResponse,
                                       SkillSparklineRow

backend/cmc/api/sse.py              ← MODIFIED: extend tail_otel_events payload to
                                       include attrs_skill_name (1 line +1 dict key)

backend/tests/
├── test_skills_router.py           ← MODIFIED: +tests for the 4 new endpoints
                                       (use existing client + db_session fixtures)

frontend/src/lib/
├── api.ts                          ← MODIFIED: +SkillUsage*, +SkillCost*,
│                                     +SkillLatency*, +SkillRuns* types & fetchers;
│                                     extend Range type to include '14d' (or add
│                                     a SkillRange alias) — see Open Q #3
└── queries.ts                      ← MODIFIED: +useSkillUsage, +useSkillCost,
│                                     +useSkillLatency, +useSkillRuns hooks at
│                                     60s cadence
└── useFirehose.ts                  ← MODIFIED: payload type adds attrs_skill_name
                                       (mirrors backend sse.py change)

frontend/src/components/panels/
├── TopSkills.tsx                   ← REWRITE: replace EmptyState with real card
                                       (sparkline + table + RangeToggle + Link)
├── SkillCostCard.tsx               ← REWRITE: replace EmptyState with KpiTiles +
                                       sparkline + "Rates as of" caption
├── SkillLatencyTable.tsx           ← NEW: ToolLatencyCard.tsx clone, reqId SKLP-05
├── SkillTimeline.tsx               ← NEW: OtelPanel.tsx clone, reqId SKLP-06
├── index.ts                        ← MODIFIED: export {SkillLatencyTable, SkillTimeline}

frontend/src/routes/
├── skills.tsx                       ← MODIFIED: add SkillLatencyTable +
                                        SkillTimeline to the .cmc-card-grid
├── skills.$name.tsx                 ← NEW: file-based dynamic detail route

frontend/src/components/panels/__tests__/
├── TopSkills.test.tsx               ← MODIFIED: replace v2-placeholder assertion
                                        with real-data render test
├── SkillCostCard.test.tsx           ← MODIFIED: same
├── SkillLatencyTable.test.tsx       ← NEW (clone of ToolLatencyCard.test.tsx)
├── SkillTimeline.test.tsx           ← NEW (clone of OtelPanel.test.tsx)
```

### Pattern 1: Add new routes to existing `skills.py` router

`cmc/api/routes/skills.py` already mounts under `/api` per the existing router-aggregator (`cmc/api/routes/__init__.py:48`). Since it's already in `all_routers()`, **no import wiring is needed** when adding new path operations to the existing router — they pick up the `/api` prefix automatically. This is the same pattern as Phase 13 P04 cost router.

```python
# Source: cmc/api/routes/skills.py (existing) — append new operations
# below the existing patch_autonomy at line 162.

@router.get("/skills/usage", response_model=SkillUsageResponse)
async def skills_usage(
    db: AsyncSession = Depends(get_session),
    range_: SkillRange = Query("14d", alias="range"),
    limit: int = Query(10, ge=1, le=50),
) -> SkillUsageResponse:
    """SKIL-04: top-N skills by invocation count + sparkline data."""
    ...
```

### Pattern 2: SQLite percentile via window CTE (Pattern 4)

`cmc/api/routes/observability.py:215` has the canonical implementation. Phase 14 SKIL-06 SQL substitutes `tools` → `otel_events e WHERE event_name='skill_activated' AND attrs_skill_name = :name` and reads `duration_ms` from `body.record.attributes` via `json_each` (LOCK-3 says `duration_ms` presence on skill events is TENTATIVE — see Pitfall 2 below for the defensive branch).

```sql
-- Source: pattern from cmc/api/routes/observability.py:215 (_TOOL_LATENCY_SQL)
-- Adapted for skill latency from otel_events.body attributes (json_each pattern)

WITH events AS (
  SELECT
    o.attrs_skill_name AS skill_name,
    CAST(
      (SELECT json_extract(value, '$.value.stringValue')
         FROM json_each(json_extract(body, '$.record.attributes'))
        WHERE json_extract(value, '$.key') = 'duration_ms'
        LIMIT 1)
      AS INTEGER
    ) AS duration_ms,
    o.session_id,
    o.otel_event_id
  FROM otel_events o
  WHERE o.event_name = 'skill_activated'
    AND o.attrs_skill_name = :name        -- per-skill detail
    AND o.ts >= datetime(:since)
    AND o.attrs_skill_name IS NOT NULL
),
ranked AS (
  SELECT skill_name, duration_ms,
    ROW_NUMBER() OVER (PARTITION BY skill_name ORDER BY duration_ms) AS rnk,
    COUNT(*) OVER (PARTITION BY skill_name) AS n
  FROM events
  WHERE duration_ms IS NOT NULL
),
agg AS (
  SELECT
    skill_name,
    COUNT(*) AS sample_count,
    MAX(duration_ms) AS max_ms
  FROM events
  WHERE duration_ms IS NOT NULL
  GROUP BY skill_name
),
p50 AS (
  SELECT skill_name, duration_ms AS p50_ms
  FROM ranked
  WHERE rnk = MAX(CAST(n * 0.5 AS INTEGER), 1)
),
p95 AS (
  SELECT skill_name, duration_ms AS p95_ms
  FROM ranked
  WHERE rnk = MAX(CAST(n * 0.95 AS INTEGER), 1)
)
SELECT a.skill_name, a.sample_count, a.max_ms, p50.p50_ms, p95.p95_ms
FROM agg a
LEFT JOIN p50 ON p50.skill_name = a.skill_name
LEFT JOIN p95 ON p95.skill_name = a.skill_name
ORDER BY p95.p95_ms DESC
```

### Pattern 3: Per-request skill→token attribution (LOCK-9 refinement)

The existing `_BREAKDOWN_BY_SKILL_SQL` in `cmc/api/routes/cost.py:147` is **session-scoped** — it sums `sessions.tokens_*` for any session that fired skill X. Phase 14 must refine to **request-scoped**: extract token totals from the **adjacent `api_request` event's body attributes** keyed by `(session.id, request_id)`. Per SPIKE.md LOCK-9 evidence (Q13 lines 745-783): `api_request` body carries `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `request_id` — all as `stringValue` (string-typed even when numeric — string-to-int parse required at the SQL CAST layer, NOT in Python).

```sql
-- Pattern: skill→api_request JOIN inside otel_events (self-JOIN on session_id +
-- request_id extracted from body.record.attributes). Tokens are stringValues
-- on api_request — CAST to INTEGER inline.

WITH skill_events AS (
  SELECT
    o.id AS skill_event_id,
    o.session_id,
    o.attrs_skill_name AS skill_name,
    o.otel_event_id AS skill_seq,
    (SELECT json_extract(value, '$.value.stringValue')
       FROM json_each(json_extract(body, '$.record.attributes'))
      WHERE json_extract(value, '$.key') = 'request_id'
      LIMIT 1) AS request_id
  FROM otel_events o
  WHERE o.event_name = 'skill_activated'
    AND o.attrs_skill_name = :name
    AND o.ts >= datetime(:since)
),
api_req_events AS (
  SELECT
    o.session_id,
    (SELECT json_extract(value, '$.value.stringValue')
       FROM json_each(json_extract(body, '$.record.attributes'))
      WHERE json_extract(value, '$.key') = 'request_id'
      LIMIT 1) AS request_id,
    CAST((SELECT json_extract(value, '$.value.stringValue')
          FROM json_each(json_extract(body, '$.record.attributes'))
         WHERE json_extract(value, '$.key') = 'input_tokens') AS INTEGER) AS input_tokens,
    CAST((SELECT json_extract(value, '$.value.stringValue')
          FROM json_each(json_extract(body, '$.record.attributes'))
         WHERE json_extract(value, '$.key') = 'output_tokens') AS INTEGER) AS output_tokens,
    CAST((SELECT json_extract(value, '$.value.stringValue')
          FROM json_each(json_extract(body, '$.record.attributes'))
         WHERE json_extract(value, '$.key') = 'cache_read_tokens') AS INTEGER) AS cache_read,
    CAST((SELECT json_extract(value, '$.value.stringValue')
          FROM json_each(json_extract(body, '$.record.attributes'))
         WHERE json_extract(value, '$.key') = 'cache_creation_tokens') AS INTEGER) AS cache_create,
    (SELECT json_extract(value, '$.value.stringValue')
       FROM json_each(json_extract(body, '$.record.attributes'))
      WHERE json_extract(value, '$.key') = 'model'
      LIMIT 1) AS model
  FROM otel_events o
  WHERE o.event_name = 'api_request'
    AND o.ts >= datetime(:since)
)
SELECT
  s.skill_name,
  COALESCE(SUM(r.input_tokens), 0)  AS tokens_input,
  COALESCE(SUM(r.output_tokens), 0) AS tokens_output,
  COALESCE(SUM(r.cache_read), 0)    AS tokens_cache_read,
  0 AS tokens_cache_create_5m,    -- 5m/1h split is JSONL-only (LOCK-4)
  COALESCE(SUM(r.cache_create), 0) AS tokens_cache_create_1h,  -- legacy fallback
  MAX(r.model) AS model
FROM skill_events s
LEFT JOIN api_req_events r
  ON r.session_id = s.session_id
 AND r.request_id IS NOT NULL
 AND r.request_id = s.request_id
GROUP BY s.skill_name
```

Then call `compute_cost(model, input, output, cache_read, 0, cache_create_1h, rates)` per row — same Decimal-as-string contract as the cost router. **If `request_id` on `skill_activated` is empty (TENTATIVE per LOCK-9)**, the `LEFT JOIN` collapses tokens to 0, and the row's cost reads as `Decimal(0)`. Defensive branch (see Pitfall 2): when ALL skill events for a `(session_id, name)` slice have NULL `request_id`, fall back to session-scoped attribution by SUMing `sessions.tokens_*` filtered to those session_ids — and surface this in the response (e.g., `cost_attribution: "request" | "session"`).

### Pattern 4: Range enum reuse from Phase 13

```python
# Source: cmc/api/schemas/cost.py:19
CostRange = Literal["1d", "7d", "14d", "30d"]  # 1d not used by Phase 14 endpoints
```

Phase 14 endpoints accept the same enum (so `?range=2d` still 422s). Recommendation: import `CostRange` directly OR define an identical alias `SkillRange = Literal["1d", "7d", "14d", "30d"]` in `schemas/skills.py`. Either works; importing avoids duplication.

### Pattern 5: Decimal-as-JSON-string serialization (Phase 13 lock)

```python
# Source: cmc/api/schemas/cost.py:30
class SkillCostResponse(BaseModel):
    range: SkillRange
    name: str
    rates_as_of: date | None
    tokens_input: int = 0
    tokens_output: int = 0
    tokens_cache_read: int = 0
    tokens_cache_create_5m: int = 0
    tokens_cache_create_1h: int = 0
    cost_usd: Decimal              # Pydantic v2 serializes as JSON string
    trend: list[SkillSparklineRow] # daily buckets
```

**NEVER** pipe Decimal through `fastapi.encoders.jsonable_encoder` — silent float coercion (Anti-Pattern from Phase 13).

### Pattern 6: Sparkline / daily-bucket data shape

Existing `CacheTrendRow` (`cmc/api/schemas/observability.py:36`) is the template:

```python
class SkillSparklineRow(BaseModel):
    day: str             # YYYY-MM-DD
    invocations: int     # for SkillUsageResponse / TopSkills sparkline
    cost_usd: Decimal | None = None  # for SkillCostResponse 14-day trend
```

SQL bucketing: `STRFTIME('%Y-%m-%d', ts, 'localtime') AS day` matches the local-day convention used by every observability endpoint.

### Pattern 7: SSE payload extension for SkillTimeline

`cmc/api/sse.py:60` currently emits `{id, ts, event_name, session_id, attrs_mcp_server, attrs_mcp_tool}`. SkillTimeline panel needs `attrs_skill_name` to label each event row with the skill that fired. Add one line:

```python
# In cmc/api/sse.py, line ~60 — add to the json.dumps payload:
"attrs_skill_name": row.attrs_skill_name,
```

…and mirror in `frontend/src/lib/useFirehose.ts:22` `OtelEvent` interface:

```ts
export interface OtelEvent {
  id: number
  ts: string
  event_name: string
  session_id: string | null
  attrs_mcp_server: string | null
  attrs_mcp_tool: string | null
  attrs_skill_name: string | null   // NEW (Phase 14 SKLP-06)
}
```

### Pattern 8: TanStack Router file-based dynamic route

Source: `tanstack.com/router/v1/docs/framework/react/routing/file-naming-conventions`. **Flat-file naming preserves the existing `routes/skills.tsx` leaf** — DON'T convert to `routes/skills/` folder, that would fold `skills.tsx` into a parent layout and require non-trivial rewiring of the existing Skills page.

```tsx
// File: frontend/src/routes/skills.$name.tsx (NEW)
import { createFileRoute, useParams } from '@tanstack/react-router'
import { useSkillCost, useSkillLatency, useSkillRuns } from '../lib/queries'

function SkillDetailPage() {
  const { name } = useParams({ from: '/skills/$name' })
  // Compose three useQuery hooks; render KpiTiles + DataTable + sparkline.
  return <section className="cmc-page" aria-labelledby={`skill-${name}-heading`}>...</section>
}

export const Route = createFileRoute('/skills/$name')({ component: SkillDetailPage })
```

The existing `frontend/src/routeTree.gen.ts` is auto-generated by `@tanstack/router-plugin/vite` (verified `vite.config.ts:11`); after adding the file the plugin regenerates the tree on next dev build — no manual edit required.

### Pattern 9: TopSkills row click → drill-in via `<Link>`

```tsx
// Inside TopSkills.tsx DataTable cell renderer
import { Link } from '@tanstack/react-router'

cell: (r) => (
  <Link to="/skills/$name" params={{ name: r.skill_name }} className="cmc-link">
    {r.skill_name}
  </Link>
)
```

### Anti-Patterns to Avoid

- **Don't introduce a new SSE channel for skill events.** SKLP-06 explicitly reuses `useFirehose`; the existing `/api/firehose?event_name=skill_activated` filter is the contract (BARE form per D-06 / Pitfall 1 — the column stores the bare value).
- **Don't import `fastapi.encoders.jsonable_encoder` near a `Decimal`.** Silent float coercion. Phase 13 lock.
- **Don't fold `routes/skills.tsx` into a folder route.** Use flat-file `routes/skills.$name.tsx` to keep both routes as siblings; folder structure (`routes/skills/index.tsx` + `routes/skills/$name.tsx`) requires rewriting `routes/skills.tsx` and re-exporting all panels.
- **Don't store `cost_usd` from `api_request.body`.** Phase 13 ANLY-03 contract: dollar values are read-time-computed via `compute_cost()`. The `cost_usd` attribute on `api_request` events is informational only — discard it.
- **Don't read `event_name='claude_code.skill_activated'` in SQL.** Ingest strips the `claude_code.` prefix on write (see SPIKE.md LOCK-1). The DB column reads `skill_activated` (bare). The frontend SSE filter passes the full `claude_code.skill_activated` because firehose filters BEFORE strip — verify against `tail_otel_events` (`cmc/api/sse.py:51`): `stmt.where(OtelEvent.event_name == event_name)` — it filters on the post-strip column value, so the **frontend prop must be `eventName: 'skill_activated'`** (bare), NOT `'claude_code.skill_activated'` as the roadmap text reads. **This is a bug in the roadmap text** — see Open Question #4.
- **Don't hand-roll percentile math in Python.** Use the SQL window-function CTE in `observability.py:215`. SQLite 3.47 supports it; Python pre-aggregation is wasteful and the latency endpoint matches the existing `tools/latency` shape.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-skill p50/p95/max latency | Python sort + index math | SQLite window CTE pattern at `observability.py:215` | One round-trip; clamps to `MAX(CAST(n*p AS INTEGER), 1)` for N=1 sample sizes (proven at `observability.py:244`); already understood by reviewers. |
| Per-skill cost compute | Inline price math | `cmc.pricing.compute_cost(model, input, output, cache_read, cache_create_5m, cache_create_1h, rates)` | Phase 13 ANLY-01 — Decimal precision, lookup-miss counter side-effect, idempotent. |
| OTLP attribute extraction | Flat `json_extract(body, '$.<key>')` | `json_each(json_extract(body, '$.record.attributes'))` | BUG-A in v1.0 — flat extraction returned NULL silently on 1,406 production rows. The `json_each` pattern is the post-BUG-A canon (`observability.py:541`, `doctor.py:586`). |
| Sparkline / time-series chart | Custom SVG rendering | Inline `<ResponsiveContainer><LineChart>` like `CacheEfficiencyCard.tsx:60` | Recharts already shipped; renders on top of project's CSS variables (`var(--cmc-accent-blue)` etc.). |
| Range toggle | Custom segmented control | `<RangeToggle>` from `components/ui/RangeToggle.tsx` with `persistKey` | Already supports custom `options` prop for non-default ranges (extension to `'14d'` / `'30d'` via the prop — no component change). |
| Drill-in routing | `window.location` assignment | `<Link to="/skills/$name" params={{ name }} />` from `@tanstack/react-router` | TanStack Router type-checks the `params` and the route exists in `routeTree.gen.ts`. |
| SSE consumer for live skill events | Build a new SSE channel | Existing `useFirehose({ eventName: 'skill_activated' })` | Roadmap explicit: NO new channel. The existing `/api/firehose` already supports `?event_name=` filter. |
| Pause/resume on `useFirehose` | Component state ON/OFF gate | `useFirehose({ enabled: paused ? false : true })` | The hook already supports an `enabled` prop (`useFirehose.ts:42`). The pause button just toggles a `paused` boolean state. |

**Key insight:** Phase 14 is a structurally derivative phase — every backend SQL pattern, every frontend panel pattern, every test idiom already exists in the codebase. The plan should READ as "wire X following Y existing pattern" with very few greenfield decisions. The two genuinely new things are: (a) the per-request `(session_id, request_id)` JOIN (refining LOCK-9), and (b) the first file-based dynamic route in the project.

## Common Pitfalls

### Pitfall 1: `event_name` column stores the BARE form (post prefix-strip)
**What goes wrong:** SQL filters on `event_name = 'claude_code.skill_activated'` return zero rows.
**Why it happens:** Ingest strips the `claude_code.` prefix per SPIKE.md LOCK-1. The DB column reads `skill_activated`. The roadmap text and Phase 14 description text both write `claude_code.skill_activated` — that's the OTLP wire form, not the storage form.
**How to avoid:** All SQL `WHERE event_name = ?` clauses use the BARE form (`'skill_activated'`, `'api_request'`, `'tool_result'`). Frontend SSE filter (`useFirehose({ eventName: ... })`) ALSO uses the bare form because the backend `tail_otel_events` filters on the same column post-strip.
**Warning signs:** "Endpoint returns empty list" with healthy ingest signal (verify via `cmc doctor` — Check #12 surfaces NULL session_id; if zero alarm, ingest is healthy → confirm filter form).

### Pitfall 2: `request_id` and `duration_ms` on `skill_activated` are TENTATIVE (LOCK-3, LOCK-9)
**What goes wrong:** Skill cost JOIN to `api_request` returns zero matches; latency endpoint shows all NULLs.
**Why it happens:** Wave 1 of Phase 12 produced ZERO live `skill_activated` events — the attributes are CITED to Context7, not VERIFIED at 2.1.116. The `api_request` event's `request_id` IS verified (Q13 line 783); the same key on `skill_activated` is assumed by analogy.
**How to avoid:** Implement defensively. Skill cost endpoint MUST include a fallback branch: when `request_id` is empty on the matched skill_activated rows, fall back to session-scoped attribution (SUM `sessions.tokens_*` for affected sessions, divide by skill-event count or attribute fully — Phase 13 chose "fully attribute"). Surface attribution mode in the response (e.g., `cost_attribution: "request" | "session"`). Latency endpoint SQL includes `WHERE duration_ms IS NOT NULL` so absent values don't pollute the percentile bucket; if `sample_count=0` for the entire range, return the empty-state row with low_sample=true. **gsd-verifier should check**: `cost_attribution` field in response, NOT a hardcoded value test.
**Warning signs:** All tested skill-cost responses show `cost_attribution: "session"` and there exist any `api_request` rows with `request_id IS NOT NULL` from the same time window — means the JOIN logic is wrong (mismatched keys or stringValue parsing).

### Pitfall 3: `input_tokens` etc. on `api_request` body are stringValue (NOT intValue)
**What goes wrong:** SQL `json_extract(value, '$.value.intValue')` returns NULL; percentile/cost math sees zeros.
**Why it happens:** SPIKE.md Q13 lines 745-783 verbatim: `"value": {"stringValue": "1"}` — even for ostensibly numeric attributes. OTLP int64 wire safety encoded these as strings.
**How to avoid:** All extraction SQL uses `json_extract(value, '$.value.stringValue')` THEN `CAST(... AS INTEGER)`. Pattern is in `cmc/cli/doctor.py:586` for the `model` attribute (which is also stringValue) — copy exactly.
**Warning signs:** Cost numbers come out as $0 even with non-empty `api_request` rows in the window → check the JSON path in the extractor.

### Pitfall 4: SSE payload omits `attrs_skill_name` (current main)
**What goes wrong:** SkillTimeline can't filter or label events.
**Why it happens:** `cmc/api/sse.py:60` is from the v1.0 era; OPNL/ACTV-03 OtelPanel only needed event name + session_id.
**How to avoid:** Extend the SSE JSON payload (one extra dict key) and the `OtelEvent` TS interface in lockstep. Test both backend (assert `attrs_skill_name` in response when row has it) and frontend (assert `e.attrs_skill_name` is readable). This is the SOLE backend-level coupling the SkillTimeline panel needs.
**Warning signs:** SkillTimeline rows show `'—'` for skill name even when the upstream `event_name='skill_activated'` row clearly has `attrs_skill_name` populated in DB.

### Pitfall 5: Frontend `Range` type is `'today' | '7d' | '30d'`, NOT `'1d' | '7d' | '14d' | '30d'`
**What goes wrong:** TS error when binding the SkillCostCard 14d toggle to existing `useCache(range)` consumers; query-key cache pollution if you reuse `qk.cache` for skills.
**Why it happens:** `frontend/src/lib/api.ts:10` defines `Range` for the observability endpoints (which take `today`/`7d`/`30d`). Phase 13 cost router accepts `1d`/`7d`/`14d`/`30d` but the frontend has not yet consumed it.
**How to avoid:** Add a NEW alias: `export type SkillRange = '14d' | '30d'` (or `'1d' | '7d' | '14d' | '30d'` if useful) in `frontend/src/lib/api.ts`. RangeToggle generic param `<V extends string>` already supports custom V — just pass new `RANGE_OPTIONS = [{value:'14d',label:'14d'},{value:'30d',label:'30d'}]`. Query-key factory must add new entries (`skillUsage(range)`, `skillCost(name, range)`, etc.) — never reuse existing keys.
**Warning signs:** TanStack Query devtools shows `['cache', '14d']` (wrong) instead of `['skill-cost', name, '14d']`.

### Pitfall 6: `MIN_LATENCY_SAMPLES=30` is a REQUIREMENT, not a default
**What goes wrong:** Devs guess a different threshold; LowSample badge doesn't match REQUIREMENTS.md.
**Why it happens:** It's a frontend-only constant. Easy to drift.
**How to avoid:** Define `MIN_LATENCY_SAMPLES = 30` once in `frontend/src/components/panels/SkillLatencyTable.tsx` as a module-level const (matching the `_HOOK_PAIR_CAP_MS = 60_000` style in `observability.py:314`). Reference SKLP-05 in a code comment. Could ALSO surface from backend response (`low_sample: bool`) following `CacheEfficiencyCard.tsx` pattern — preferred because it makes the policy server-side observable.
**Warning signs:** PR review flag if the constant lives in two files.

### Pitfall 7: Skills with zero invocations in the range — empty-state handling
**What goes wrong:** Backend returns 200 with empty array; frontend shows blank panel without explanation.
**Why it happens:** Empty result is normal on a fresh install or when filters exclude all skills.
**How to avoid:** Use `<PanelCard>`'s built-in `empty.when` callback (see `CacheEfficiencyCard.tsx:39`). Returns empty array → shows "Once skill invocations arrive it will appear here. Run sync from the header to refresh." without panel-level error state.
**Warning signs:** PanelCard's empty branch is not exercised by tests.

### Pitfall 8: `useFirehose` prop is `eventName` (camelCase), not `event_name`
**What goes wrong:** TS error: `Property 'event_name' does not exist on type 'FirehoseOptions'.`
**Why it happens:** The roadmap text uses `event_name: 'claude_code.skill_activated'`. The actual hook signature is `eventName?: string` (`useFirehose.ts:34`).
**How to avoid:** Use `useFirehose({ eventName: 'skill_activated' })` (camelCase + bare event name — see Pitfall 1 for the bare-form rationale).
**Warning signs:** Compile error on the SkillTimeline panel.

### Pitfall 9: Existing `GET /api/skills` returns SkillListResponse — not top-N
**What goes wrong:** Adding `range` param to existing endpoint shape-breaks the catalog response, breaking `SkillsRegistry.tsx` (and `useSkills()` consumer).
**Why it happens:** Phase 14 success-criterion text says `GET /api/skills?range=14d|30d` returns "top-N skills by invocation count" — but `GET /api/skills` ALREADY returns the full skill catalog (per `cmc/api/routes/skills.py:48`).
**How to avoid:** See Open Question #2 — recommended path: ADD a new endpoint at `GET /api/skills/usage` with the rollup contract; document that the literal URL in the success criterion deviates from the spec to preserve the catalog endpoint.
**Warning signs:** SkillsRegistry panel renders empty after Phase 14 ships.

## Runtime State Inventory

> Phase 14 is a NEW-feature phase, not a rename/refactor. State inventory mostly N/A. One subtle case below.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 14 reads existing `otel_events` rows; no new persistent data is written by these endpoints. | None. |
| Live service config | `data/pricing.json` already auto-loaded by the existing lifespan hook (Phase 13 P01). Phase 14 cost endpoint just calls `load_rates(db)`. | None. |
| OS-registered state | None — no scheduled jobs or new launchd/systemd plists. | None. |
| Secrets/env vars | None — no new keys, no new external auth. The existing `OTEL_LOG_TOOL_DETAILS=1` recommendation (Phase 13 P05 doctor #14) still applies and is a doctor warning, not an unblocker. | None for Phase 14; doctor surfaces if absent. |
| Build artifacts | TanStack Router's auto-generated `frontend/src/routeTree.gen.ts` will pick up the new `routes/skills.$name.tsx` on next dev build (verified vite.config.ts uses `tanstackRouter()` plugin with `autoCodeSplitting: true`). | None — automatic. The file MUST be committed because the plugin regenerates it (it's a code artifact, not a runtime artifact). Pre-commit may or may not regenerate; the plan should include a `pnpm dev` (or `pnpm build`) step in the Wave-3 verification to confirm `routeTree.gen.ts` is up-to-date. |

## Code Examples

### SKIL-04 — `GET /api/skills/usage?range=14d|30d&limit=10`

```python
# Source: pattern from cmc/api/routes/cost.py + cmc/api/routes/observability.py

_USAGE_TOP_SQL = text("""
    WITH per_day AS (
      SELECT
        attrs_skill_name AS skill_name,
        STRFTIME('%Y-%m-%d', ts, 'localtime') AS day,
        COUNT(*) AS invocations
      FROM otel_events
      WHERE event_name = 'skill_activated'
        AND attrs_skill_name IS NOT NULL
        AND ts >= datetime(:since)
      GROUP BY skill_name, day
    ),
    totals AS (
      SELECT skill_name, SUM(invocations) AS total
      FROM per_day
      GROUP BY skill_name
      ORDER BY total DESC
      LIMIT :limit
    )
    SELECT
      t.skill_name,
      t.total,
      p.day,
      p.invocations
    FROM totals t
    LEFT JOIN per_day p ON p.skill_name = t.skill_name
    ORDER BY t.total DESC, p.day ASC
""")
```

### SKIL-07 — `GET /api/skills/{name}/runs?limit=`

```python
# Source: pattern from cmc/api/routes/cost.py and observability.py
_RUNS_SQL = text("""
    SELECT
      o.ts,
      o.session_id,
      COALESCE(s.cwd, '<unknown>') AS cwd,
      o.attrs_skill_name AS skill_name,
      (SELECT json_extract(value, '$.value.stringValue')
         FROM json_each(json_extract(o.body, '$.record.attributes'))
        WHERE json_extract(value, '$.key') = 'request_id'
        LIMIT 1) AS request_id
    FROM otel_events o
    LEFT JOIN sessions s ON s.session_id = o.session_id
    WHERE o.event_name = 'skill_activated'
      AND o.attrs_skill_name = :name
    ORDER BY o.ts DESC
    LIMIT :limit
""")
```

Response row shape (`SkillRunRow`): `ts, session_id, cwd, request_id` — the `cwd` is the project surrogate per the OBSV-06 convention (`observability.py:451`). Frontend renders linked sessions via existing `Link to="/sessions/$sid"` pattern (NOTE: that route doesn't exist yet either — see Open Question #5).

### Frontend — SkillCostCard reactivation (replace EmptyState)

```tsx
// File: frontend/src/components/panels/SkillCostCard.tsx
// REPLACES current v2-placeholder body (lines 21-36).
// Pattern: PanelCard + KpiTile (cost_usd big number) + inline LineChart sparkline
// + RangeToggle (14d / 30d).

import { useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import { KpiTile, PanelCard, RangeToggle } from '../ui'
import { useSkillCost } from '../../lib/queries'
import type { SkillCostResponse, SkillRange } from '../../lib/api'

const RANGE_OPTIONS = [
  { value: '14d' as const, label: '14d' },
  { value: '30d' as const, label: '30d' },
]

export function SkillCostCard({ name }: { name: string }) {
  const [range, setRange] = useState<SkillRange>('14d')
  const query = useSkillCost(name, range)

  return (
    <PanelCard<SkillCostResponse>
      reqId="SKLP-02"
      title={`Skill Cost — ${name}`}
      query={query}
      empty={{ dataNoun: 'skill cost data', when: (d) => d.trend.length === 0 }}
      trailing={
        <RangeToggle<SkillRange>
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          persistKey={`skill-cost-${name}`}
        />
      }
    >
      {(data) => (
        <div>
          <KpiTile label="Total cost" value={`$${data.cost_usd}`} mono />
          <div>
            <KpiTile label="Input"  value={data.tokens_input.toLocaleString()} mono />
            <KpiTile label="Output" value={data.tokens_output.toLocaleString()} mono />
            <KpiTile label="Cache"  value={(data.tokens_cache_read + data.tokens_cache_create_5m + data.tokens_cache_create_1h).toLocaleString()} mono />
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={data.trend}>
              <XAxis dataKey="day" />
              <YAxis />
              <RechartsTooltip />
              <Line dataKey="cost_usd" stroke="var(--cmc-accent-blue)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          {data.rates_as_of ? (
            <p className="cmc-caption">Rates as of {data.rates_as_of}</p>
          ) : null}
        </div>
      )}
    </PanelCard>
  )
}
```

Note: SkillCostCard takes a `name` prop because the SKLP-02 spec is per-skill. On the Skills page (`routes/skills.tsx`), the card needs to know WHICH skill — easy options: (a) default to the top-1 skill from `useSkillUsage('14d', limit=1)`, or (b) show a small `<select>` to pick. **Recommended: (a) — default top-1 with caption "Showing top skill: {name}"** — keeps the page card-grid uniform without adding a control.

### Frontend — SkillTimeline reactivation (clone of OtelPanel)

```tsx
// File: frontend/src/components/panels/SkillTimeline.tsx (NEW — SKLP-06)
import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatePill, RelativeTime } from '../ui'
import { useFirehose } from '../../lib/useFirehose'

export function SkillTimeline() {
  const [paused, setPaused] = useState(false)
  const [skillFilter, setSkillFilter] = useState('')
  // BARE event name — see Pitfall 1
  const { events, status } = useFirehose({
    eventName: 'skill_activated',
    enabled: !paused,
  })

  const filtered = useMemo(() => {
    const trimmed = skillFilter.trim().toLowerCase()
    if (!trimmed) return events
    return events.filter((e) =>
      (e.attrs_skill_name ?? '').toLowerCase().includes(trimmed)
    )
  }, [events, skillFilter])

  // Render: header with reqId SKLP-06, pause/resume button, filter input,
  // status pill; body shows newest events at top with skill name + session_id.
  return (
    <Card>
      <CardHeader>{/* ... like OtelPanel.tsx:48-71 */}</CardHeader>
      <CardContent>
        <div className="cmc-otel-feed" role="log" aria-live="polite">
          {[...filtered].reverse().map((e) => (
            <div key={e.id} className="cmc-otel-row">
              <span className="cmc-otel-row__ts cmc-mono"><RelativeTime value={e.ts} /></span>
              <span className="cmc-otel-row__name cmc-mono">{e.attrs_skill_name ?? '—'}</span>
              <span className="cmc-otel-row__sid cmc-mono">{e.session_id?.slice(0, 8) ?? '—'}…</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `TopSkills` returns `<EmptyState heading="Coming in v2"/>` | `TopSkills` calls `useSkillUsage(range, limit)` and renders top-N + sparkline | Phase 14 | The card finally shows real data; closes ACTV-04 v1.0 deferral. |
| `SkillCostCard` returns `<EmptyState heading="Coming in v2"/>` | `SkillCostCard` calls `useSkillCost(name, range)` with sparkline + "Rates as of" | Phase 14 | Closes SKLP-02 v1.0 deferral. |
| Skill cost is session-scoped (Phase 13 LOCK-9 / `cost.py:147`) | Skill cost JOINs `skill_activated ↔ api_request` on `(session_id, request_id)` | Phase 14 SKIL-05 | Two skills in one session no longer show identical cost (when `request_id` is present on skill events — TENTATIVE per SPIKE.md). |
| No file-based dynamic routes | `routes/skills.$name.tsx` is the first | Phase 14 SKLP-07 | Establishes the pattern for future detail routes (sessions, projects, etc.). |
| SSE payload omits `attrs_skill_name` | SSE forwards `attrs_skill_name` for SkillTimeline filtering | Phase 14 SKLP-06 (1-line backend change) | Doesn't break existing OtelPanel consumer. |

**Deprecated/outdated:**
- The `claude_code.skill_invoked` event name (v1.0 placeholder TopSkills comment line 7-8) — never landed in production; the canonical name is `claude_code.skill_activated` (Phase 12 SPIKE.md LOCK-1).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `request_id` attribute is present on `skill_activated` events at 2.1.116 | Pattern 3, Pitfall 2 | Skill cost JOIN returns zero matches → cost endpoint falls back to session-scoped attribution (defensive branch handles this; cost numbers are still emitted, just with `cost_attribution: "session"`). [ASSUMED — TENTATIVE per SPIKE.md LOCK-9, not VERIFIED at 2.1.116 because Phase 12 Wave 1 produced zero live skill events.] |
| A2 | `duration_ms` attribute is present on `skill_activated` events at 2.1.116 | Pattern 2, Pitfall 2 | SkillLatencyTable shows all-NULL p50/p95 → frontend shows `<Badge variant="warning">Low sample</Badge>` for everything. SQL handles via `WHERE duration_ms IS NOT NULL` — no error, just empty data. Defensive fallback: derive latency from `(skill_activated.ts) - (next event in same session.ts)` if a `skill_completed` event exists. [ASSUMED — CITED to STACK.md/Context7 per SPIKE.md LOCK-3, not VERIFIED at 2.1.116.] |
| A3 | Recharts `<LineChart>` with single `<Line>` is the standard project sparkline pattern | Pattern 6, Code Examples | None — `CacheEfficiencyCard.tsx:60` is direct precedent. [VERIFIED via repo grep — no other sparkline component exists.] |
| A4 | Frontend `Range` type extension is the right path (vs creating a SkillRange) | Pitfall 5 | Bikeshed only — a separate alias is also fine. [ASSUMED — discussion welcome in plan-check.] |
| A5 | TanStack Router auto-regenerates `routeTree.gen.ts` on dev build with `autoCodeSplitting: true` | Pattern 8, Runtime State Inventory | If false, the new route doesn't show up until manual regen — adds a Wave-3 manual `pnpm dev` (or `pnpm build`) step. [VERIFIED via vite.config.ts:11 — `autoCodeSplitting: true` confirmed.] |
| A6 | `Skill detail page (/skills/$name)` should compose existing panels rather than introduce new ones | Recommended Project Structure | Bikeshed only. Composing existing panels is cheaper and DRYer. [ASSUMED — Phase 14 success criterion #5 says "per-skill detail (cost + latency + recent runs)"; composition satisfies.] |
| A7 | `cwd` is the canonical project surrogate (not `project_hash`) | SKIL-07 SQL, code example | None — `sessions.project_hash` exists in the model but per `cost.py:166-178` and `observability.py:451`, every existing endpoint keys on `cwd`. [VERIFIED via cost.py + observability.py grep.] |
| A8 | `MIN_LATENCY_SAMPLES=30` is best surfaced server-side as `low_sample: bool` (not just a frontend constant) | Pitfall 6 | Bikeshed — frontend-only constant works too, but server-side surfacing matches `CacheEfficiencyCard.tsx`/CacheResponse pattern. [ASSUMED — REQUIREMENTS.md SKLP-05 leaves this unspecified.] |

## Open Questions (RESOLVED)

1. **`request_id` on `skill_activated` events at 2.1.116 — present or not?**
   - **What we know:** SPIKE.md LOCK-9 evidence verifies `request_id` IS on `api_request` events (Q13 line 783); presence on `skill_activated` is CITED, not VERIFIED.
   - **What's unclear:** Whether Phase 14 ships a "request-scoped" skill-cost JOIN that actually finds matches in production data, OR whether it always falls back to session-scoped attribution.
   - **Recommendation:** Implement BOTH paths in the cost endpoint with explicit `cost_attribution: "request" | "session"` in the response. Plan-checker should verify the response field exists. As a hedge: a 5-minute live-data probe at the start of Phase 14 (similar to Phase 12 Wave 1) — fire a real skill, query `SELECT body FROM otel_events WHERE event_name='skill_activated' LIMIT 1` and inspect for `request_id`. If absent, the endpoint quietly falls back; if present, the planner can drop the fallback branch.

2. **`GET /api/skills?range=14d|30d` — is the path literal or interpretive?**
   - **What we know:** `cmc/api/routes/skills.py:48` already serves `GET /api/skills` returning the full skill catalog (`SkillListResponse`). `SkillsRegistry.tsx:25` consumes this. The Phase 14 success-criterion text says `GET /api/skills?range=14d|30d` returns "top-N skills by invocation count + sparkline".
   - **What's unclear:** Three options:
     - (a) Reshape the existing endpoint: when `?range=` is present, return rollup; when absent, return catalog. **Two response models from one path** — code-smell, breaks OpenAPI clarity.
     - (b) Move the catalog to `/api/skills/catalog`, repurpose `/api/skills?range=` as the rollup. Touches `useSkills()` consumer.
     - (c) Add a NEW endpoint at `GET /api/skills/usage?range=&limit=` with the rollup contract; document deviation from the literal URL in the success criterion. Preserves existing endpoint and consumer.
   - **Recommendation:** **(c)** — add `/api/skills/usage`. Lowest blast radius. Requires updating REQUIREMENTS.md SKIL-04 text or accepting a documented deviation.

3. **Frontend `Range` type — extend or alias?**
   - **What we know:** `frontend/src/lib/api.ts:10` exports `type Range = 'today' | '7d' | '30d'`; cost-router-style ranges (`'1d'|'7d'|'14d'|'30d'`) are not yet typed in the frontend.
   - **What's unclear:** Whether to add `'14d'` to the existing `Range` type (broader impact: every consumer becomes assignable from `'14d'`) or define a new alias `SkillRange = '14d' | '30d'`.
   - **Recommendation:** New alias `SkillRange = '14d' | '30d'` (or `'1d'|'7d'|'14d'|'30d'` if `useSkillCost` could ever take `'1d'`). Tightest types. Lower-impact than touching `Range`.

4. **Roadmap text writes `event_name: 'claude_code.skill_activated'` — is that the storage form or the wire form?**
   - **What we know:** Ingest strips the `claude_code.` prefix on write (SPIKE.md LOCK-1; `_BREAKDOWN_BY_SKILL_SQL` filters on `event_name='skill_activated'` bare). The frontend SSE filter `?event_name=` is matched against the same bare column value.
   - **What's unclear:** Whether the roadmap text is loose ("the event Anthropic emits") or strict ("the value to pass to useFirehose").
   - **Recommendation:** Treat the roadmap text as the wire form (informative). The actual code MUST use `useFirehose({ eventName: 'skill_activated' })` (camelCase prop, bare event name). Plan-checker verifies the bare form in code.

5. **Recent runs link to `/sessions/$sid` — does that route exist?**
   - **What we know:** No such route file exists in `frontend/src/routes/`. The closest existing affordance is the `LiveSessionsCard` and `SessionsTable` panels which open a drawer (`useSessionDetails(sid)`).
   - **What's unclear:** Whether SKIL-07 "linked sessions" should:
     - (a) link to the existing drawer-on-click pattern (programmatically open the session details Sheet), OR
     - (b) navigate to a yet-to-exist `/sessions/$sid` route.
   - **Recommendation:** **(a)** for Phase 14 — clicking a session_id in the SkillRunsTable opens the `SessionsDetailsSheet` (whatever that's called) at the session ID. Linking to a non-existent route is incoherent. The `/sessions/$sid` route is out of scope for Phase 14 (no requirement ID covers it); document as v1.2 follow-up.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.13 | Backend tests + dev | ✓ | 3.13.x (.venv) | — |
| `pytest` + `pytest-asyncio` | Backend tests | ✓ | per pyproject | — |
| `node` + `pnpm` | Frontend tests + build | ✓ | per package.json (pnpm 10.26.2) | — |
| `recharts` | Frontend sparkline | ✓ | 3.8.1 (latest) | — |
| `@tanstack/react-router` | Frontend routing + dynamic route | ✓ | ^1.168.24 | — |
| `data/pricing.json` | Skill cost compute | ✓ | published_at: 2026-05-03 | If absent, doctor #9 fails; cost responses return `cost_usd: "0"` (compute_cost lookup miss) — not crash. |
| Live `skill_activated` events for testing | Verifying SKIL-04..07 produce non-empty responses | ✗ | Production currently has 0 `skill_activated` rows (per Phase 12 Plan 01 Wave 0/1) | All tests use synthetic OTLP fixtures (Phase 13 P03 pattern in `test_ingest.py`). The endpoints work on test data immediately; live production shake-out happens after merge. |
| `OTEL_LOG_TOOL_DETAILS=1` | Future skill-event richness (Doctor #14 warning) | unknown — env-dependent | — | Doctor warns; skill ingest still works via the bare `skill_name` attribute (Phase 13 P03 contract). |

**Missing dependencies with no fallback:** None block the Phase 14 implementation. Live skill events absent in production is a known UX gap — addressed by the test fixtures.

**Missing dependencies with fallback:** `OTEL_LOG_TOOL_DETAILS` is a doctor warning, not an unblocker.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `pytest` 8.x + `pytest-asyncio` (backend); `vitest` 4.1.5 + `happy-dom` (frontend) |
| Config file | `backend/pyproject.toml` (pytest config); `frontend/vitest.config.ts` |
| Quick run command | `cd backend && pytest tests/test_skills_router.py -x -v` |
| Full suite command | `cd backend && pytest && cd ../frontend && pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SKIL-04 | `GET /api/skills/usage?range=14d&limit=10` returns top-N rows + sparkline buckets | integration | `pytest backend/tests/test_skills_router.py::test_skills_usage_top_n_with_sparkline -x` | ❌ Wave 0 |
| SKIL-04 | Range validation: `?range=2d` returns 422 | integration | `pytest backend/tests/test_skills_router.py::test_skills_usage_invalid_range_returns_422 -x` | ❌ Wave 0 |
| SKIL-04 | `limit` clamps to ≤50, defaults 10 | integration | `pytest backend/tests/test_skills_router.py::test_skills_usage_limit_clamping -x` | ❌ Wave 0 |
| SKIL-05 | `GET /api/skills/{name}/cost?range=14d` returns Decimal-as-string `cost_usd` + tokens split + 14-day trend + `rates_as_of` | integration | `pytest backend/tests/test_skills_router.py::test_skill_cost_request_scoped -x` | ❌ Wave 0 |
| SKIL-05 | `cost_attribution` field present in response | integration | `pytest backend/tests/test_skills_router.py::test_skill_cost_attribution_field -x` | ❌ Wave 0 |
| SKIL-05 | Decimal NOT serialized as float | integration | `pytest backend/tests/test_skills_router.py::test_skill_cost_decimal_as_string -x` | ❌ Wave 0 |
| SKIL-06 | `GET /api/skills/{name}/latency?range=` returns p50/p95/max + error_rate + sample_count | integration | `pytest backend/tests/test_skills_router.py::test_skill_latency_percentiles -x` | ❌ Wave 0 |
| SKIL-06 | Window-CTE handles N=1 sample (rnk=1 fallback) | integration | `pytest backend/tests/test_skills_router.py::test_skill_latency_single_sample -x` | ❌ Wave 0 |
| SKIL-06 | `low_sample: true` when sample_count < 30 | integration | `pytest backend/tests/test_skills_router.py::test_skill_latency_low_sample_under_30 -x` | ❌ Wave 0 |
| SKIL-07 | `GET /api/skills/{name}/runs?limit=` returns recent invocations w/ session_id + cwd | integration | `pytest backend/tests/test_skills_router.py::test_skill_runs_recent -x` | ❌ Wave 0 |
| ACTV-04 | TopSkills renders top-N + sparkline + range toggle | unit (vitest) | `pnpm vitest run components/panels/__tests__/TopSkills.test.tsx` | ⚠️ Exists but tests v2-placeholder body — Wave 0 to rewrite |
| SKLP-02 | SkillCostCard renders cost + tokens + sparkline + "Rates as of" caption | unit (vitest) | `pnpm vitest run components/panels/__tests__/SkillCostCard.test.tsx` | ⚠️ Exists but tests v2-placeholder body — Wave 0 to rewrite |
| SKLP-05 | SkillLatencyTable renders sortable rows + Low-sample badge under 30 samples | unit (vitest) | `pnpm vitest run components/panels/__tests__/SkillLatencyTable.test.tsx` | ❌ Wave 0 |
| SKLP-06 | SkillTimeline renders firehose events filtered by skill name + pause toggles useFirehose enabled | unit (vitest) | `pnpm vitest run components/panels/__tests__/SkillTimeline.test.tsx` | ❌ Wave 0 |
| SKLP-07 | `/skills/$name` route renders cost + latency + runs sections | unit (vitest, optional e2e in Playwright) | `pnpm vitest run routes/__tests__/skills.$name.test.tsx` (or `pnpm test:e2e tests/skills-detail.spec.ts`) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && pytest tests/test_skills_router.py -x` AND `cd frontend && pnpm vitest run`
- **Per wave merge:** `cd backend && pytest` AND `cd frontend && pnpm test`
- **Phase gate:** Full backend suite green (was 438 at Phase 13 close; Phase 14 should be 438 + ~15 new tests = ~453) + full frontend suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `backend/tests/test_skills_router.py` — extend with new fixture-driven tests for SKIL-04..07 (file exists; section to add)
- [ ] `frontend/src/components/panels/__tests__/SkillLatencyTable.test.tsx` — covers SKLP-05 (clone of `ToolLatencyCard.test.tsx`)
- [ ] `frontend/src/components/panels/__tests__/SkillTimeline.test.tsx` — covers SKLP-06 (clone of `OtelPanel.test.tsx`)
- [ ] Optional: `frontend/src/routes/__tests__/skills.$name.test.tsx` — covers SKLP-07 (currently no `routes/__tests__/` dir exists; can be skipped if Playwright e2e covers it)
- [ ] Test fixture: synthetic `api_request` OTLP body with token attributes + `request_id` for SKIL-05 cost JOIN tests (extend `conftest.py` `otlp_log_payload` or add `make_api_request_otel_event` helper)
- [ ] Test fixture: synthetic `skill_activated` OTLP body with `duration_ms` + `request_id` (extend Phase 13 Plan 03 fixture)

*If any panel test rewrite is non-trivial, Wave 0 also includes deleting and rewriting `__tests__/TopSkills.test.tsx` + `__tests__/SkillCostCard.test.tsx` to test real-data render paths instead of the v2 EmptyState.*

## Sources

### Primary (HIGH confidence)
- `backend/cmc/api/routes/observability.py` (lines 215-262) — canonical SQLite percentile via window CTE pattern (`_TOOL_LATENCY_SQL`)
- `backend/cmc/api/routes/cost.py` (lines 1-265) — Phase 13 cost-router template: range enum, Decimal-as-string, breakdown shape, `compute_cost` integration
- `backend/cmc/api/routes/cost.py` (lines 147-162) — current session-scoped skill breakdown SQL (the thing Phase 14 refines)
- `backend/cmc/api/routes/skills.py` (lines 1-187) — existing SKIL-01..03 router (where new endpoints append)
- `backend/cmc/api/sse.py` (lines 25-72) — current SSE payload shape (Phase 14 extends with `attrs_skill_name`)
- `backend/cmc/pricing.py` (lines 55-126) — `compute_cost` signature + `load_rates` async loader
- `backend/cmc/cli/doctor.py` (lines 583-598) — canonical `json_each` pattern for extracting OTEL stringValue attributes
- `frontend/src/components/panels/CacheEfficiencyCard.tsx` (full file) — sparkline + Low-sample badge canon
- `frontend/src/components/panels/ToolLatencyCard.tsx` (full file) — sortable DataTable canon (template for SkillLatencyTable)
- `frontend/src/components/panels/OtelPanel.tsx` (full file) — useFirehose consumer canon (template for SkillTimeline)
- `frontend/src/lib/useFirehose.ts` (full file) — hook signature: `eventName` camelCase, `enabled` for pause/resume
- `frontend/src/lib/queries.ts` (lines 280+) — cadence policy (60s for slow rollups), optimistic patterns
- `frontend/src/components/ui/PanelCard.tsx` (full file) — generic skeleton/error/empty branching
- `frontend/src/components/ui/RangeToggle.tsx` (full file) — generic over `<V extends string>`, supports custom options
- `.planning/research/SPIKE.md` LOCK-1, LOCK-2, LOCK-3, LOCK-9 — skill event attribute locks (TENTATIVE / VERIFIED status)
- `.planning/phases/13-cost-foundation-skill-ingest/13-04-SUMMARY.md` (lines 90-105) — Phase 13 cost router decisions inherited by Phase 14
- `.planning/phases/13-cost-foundation-skill-ingest/13-RESEARCH.md` — full Phase 13 architecture context
- `.planning/STATE.md` (lines 38-65) — Phase 13 closeout decisions and Phase 14 carry-forward gates

### Secondary (MEDIUM confidence)
- `tanstack.com/router/v1/docs/framework/react/routing/file-naming-conventions` [WebSearch 2026-05-03] — flat-file `$param` convention rationale
- `npm view recharts version` → 3.8.1 (current latest, matches pin)

### Tertiary (LOW confidence)
- The `request_id` and `duration_ms` attributes on `skill_activated` events are CITED to STACK.md/Context7 by SPIKE.md LOCK-3/LOCK-9, NOT VERIFIED at 2.1.116 because Phase 12 Wave 1 captured zero live skill events. Cost endpoint MUST defensively fall back to session-scoped attribution.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all dependencies pinned and verified, recharts confirmed current latest
- Architecture: **HIGH** — every backend SQL and frontend panel pattern has a direct in-codebase template
- Pitfalls: **HIGH** — Phase 13 RESEARCH.md and SPIKE.md catalog the foot-guns thoroughly
- Skill cost request-scoped JOIN: **MEDIUM** — `request_id` presence on skill events is TENTATIVE; defensive fallback is mandatory
- File-based dynamic route: **MEDIUM-HIGH** — first one in the project, but TanStack Router patterns are well-documented and the plugin auto-generates the tree

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (30 days for stable patterns; if `request_id` empirical verification reverses Open Q #1 sooner, the cost-endpoint shape changes)
