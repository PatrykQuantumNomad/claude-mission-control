---
phase: 06-observability-activity-panels
plan: 01
subsystem: observability-foundation
tags: [phase-6, wave-1, foundation, ui-primitives, queries, sse, observability]
dependency_graph:
  requires:
    - .planning/phases/05-frontend-shell-design-system/05-04-SUMMARY.md  # 12-primitive ui barrel + lib/api.ts + lib/storage
    - backend/cmc/api/routes/observability.py                            # OBSV-01..10 (Phase 3)
    - backend/cmc/api/routes/sessions.py                                 # SESS-01..07 (Phase 3)
    - backend/cmc/api/routes/system.py                                   # SAPI-02..05 (Phase 3)
  provides:
    - frontend/src/components/ui/PanelCard.tsx           # Loading/empty/error/data branch owner
    - frontend/src/components/ui/RangeToggle.tsx         # Segmented today/7d/30d
    - frontend/src/components/ui/DataTable.tsx           # Generic sortable + paginated table
    - frontend/src/components/ui/HeatmapGrid.tsx         # 30-cell hand-rolled grid
    - frontend/src/components/ui/StatList.tsx            # Icon + label + value rows
    - frontend/src/components/ui/KpiTile.tsx             # Display-size KPI tile
    - frontend/src/components/ui/ErrorState.tsx          # In-card retry block
    - frontend/src/lib/queries.ts                        # qk + 20 hooks + useFollowUpMessage
    - frontend/src/lib/useFirehose.ts                    # Bespoke SSE hook
    - GET /api/activity/heatmap?range={today|7d|30d}     # ACTV-01
    - GET /api/sessions/failures?range={today|7d|30d}    # ACTV-05
  affects:
    - frontend/src/lib/api.ts        # tightened response types + 2 new fetchers + systemState bug fix
    - frontend/src/styles.css        # Phase 6 primitive CSS section appended
    - frontend/src/components/ui/index.ts  # 7 new named exports + 5 supporting types
    - backend/cmc/api/schemas/observability.py  # 4 new Pydantic models
tech_stack:
  added:
    - recharts@3.8.1                  # Chart-rendering precondition for plans 06-02..05
  patterns:
    - PanelCard owns the four canonical render branches (skeleton/error/empty/data) keyed off TanStack Query result — every Phase 6/7 panel composes this so the render-branch copy lives at exactly one observable site
    - lib/queries.ts is the single writer of refetchInterval / staleTime per panel — panels never inline cadence
    - Cadence buckets locked: 5s live, 10s attention, 15s today, 30s pressure/latency/failures/list, 60s daily aggregates, 120s slow rollups, 300s heatmap
    - Native EventSource subscription with explicit removeEventListener + close() cleanup so React 19 StrictMode double-invoke stays idempotent
    - Backend ACTV-05 derives outcome inline (CASE on otel_events EXISTS) rather than relying on sessions.outcome ingest population, mirroring OBSV-03 read-time fallback (Pitfall 9)
key_files:
  created:
    - frontend/src/components/ui/PanelCard.tsx
    - frontend/src/components/ui/RangeToggle.tsx
    - frontend/src/components/ui/DataTable.tsx
    - frontend/src/components/ui/HeatmapGrid.tsx
    - frontend/src/components/ui/StatList.tsx
    - frontend/src/components/ui/KpiTile.tsx
    - frontend/src/components/ui/ErrorState.tsx
    - frontend/src/components/ui/__tests__/PanelCard.test.tsx
    - frontend/src/components/ui/__tests__/RangeToggle.test.tsx
    - frontend/src/components/ui/__tests__/DataTable.test.tsx
    - frontend/src/components/ui/__tests__/HeatmapGrid.test.tsx
    - frontend/src/components/ui/__tests__/StatList.test.tsx
    - frontend/src/components/ui/__tests__/KpiTile.test.tsx
    - frontend/src/components/ui/__tests__/ErrorState.test.tsx
    - frontend/src/lib/queries.ts
    - frontend/src/lib/useFirehose.ts
    - frontend/src/lib/__tests__/queries.test.ts
    - frontend/src/lib/__tests__/useFirehose.test.ts
    - backend/tests/test_phase6_obsv_extensions.py
  modified:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/src/lib/api.ts
    - frontend/src/styles.css
    - frontend/src/components/ui/index.ts
    - backend/cmc/api/routes/observability.py
    - backend/cmc/api/schemas/observability.py
key_decisions:
  - "ACTV-04 TopSkills scoped to v2 — no new backend route shipped. Plan 06-05 will ship a 'coming soon' EmptyState card with the correct reqId kicker. Rationale: there is no claude_code.skill_invoked OTEL event in current ingest, and the cwd heuristic (rendering session count by cwd) is insufficient because sessions run from project cwd, not skill folder. Punting to v2 is preferred over speculative ingest changes that would require a Phase 2 follow-up."
  - "Recharts 3.8.1 installed (peer-deps include react ^19) — tree-shaking eliminates it from the current bundle since no Plan 06-01 file imports it; the bundle delta materializes when plans 06-02..05 add chart panels (TokenUsageCard, OutcomesCard, etc.)"
  - "lib/api.ts systemState bug fixed: replaced path-style /api/system/state/{key} with query-string /api/system/state?key={key} matching backend SAPI-03 route shape"
  - "lib/api.ts response types tightened for the 19 Phase-6-consumed endpoints; Phase-7 endpoints (decisions/inbox/tasks/schedules/skills/emergency-stop/sync) intentionally left as `unknown` for Phase 7 to narrow when it consumes them — avoids speculative typing under tsconfig strict"
  - "PanelCard hiddenWhenEmpty prop returns null when empty so AttentionBar can disappear entirely from the layout when there are no attention items (instead of rendering a stub EmptyState)"
  - "ACTV-05 outcome derivation uses inline CASE on otel_events EXISTS (Pitfall 9 fallback) NOT sessions.outcome column — matches OBSV-03; works regardless of whether Phase 2 ingest populates sessions.outcome (currently it does not)"
  - "DataTable has no virtualization in v1 — sufficient for ≤200-row workloads (06-RESEARCH §risk register). Revisit if a panel needs >500 rows"
  - "useFirehose uses native EventSource (not fetch-EventSource polyfill) — same-origin dashboard sends session cookie; auto-reconnect baked into EventSource is sufficient for the SAPI-05 frame format"
metrics:
  duration_min: ~16
  tasks_completed: 3
  files_changed: 22  # 19 created + 3 modified by edit
  frontend_tests: 97       # 62 baseline + 35 new
  backend_tests: 202       # 193 baseline + 9 new
  completed_date: 2026-04-27
---

# Phase 6 Plan 01: Wave 1 Foundation Summary

Phase 6 Wave 1 foundation landed: 7 new ui primitives behind the components/ui barrel; lib/queries.ts with 20 typed query hooks + 1 mutation and locked polling cadences; useFirehose SSE hook with ring-buffered events; lib/api.ts tightened with typed responses for every Phase-6-consumed endpoint; the systemState path-vs-query bug fixed; Recharts 3.8.1 installed; two new backend GET routes (ACTV-01 heatmap, ACTV-05 unified failures) plus 4 Pydantic models and 9 backend tests. Frontend test count: 62 → 97. Backend test count: 193 → 202.

## What Shipped

### Recharts dependency

- Installed `recharts@3.8.1`; React 19 satisfies the peer-dependency line `react ^16.8 || ^17 || ^18 || ^19` (verified via `node -e "console.log(JSON.stringify(require('recharts/package.json').peerDependencies))"`).
- `npm run build` succeeds; current dist/ does NOT contain recharts in the vendor chunk because no source file imports it yet — Vite 8 tree-shakes unimported packages. The bundle delta will appear when plans 06-02 (TokenUsageCard, OutcomesCard) and 06-04 (HeatmapStrip + ProductivityCard) introduce chart panels. This is expected behavior; no action needed.

### Frontend ui primitives (7 new)

All 7 primitives use the locked Phase 5 className-passthrough shape with `cmc-<base>` classes + variant modifiers + token-driven colors (`var(--cmc-*)`, `var(--space-*)`).

- **PanelCard**: generic shell wrapping `Card` that owns the four canonical render branches keyed off a `UseQueryResult<TData, Error>`:
  - `query.isPending` → custom or default 4-line `Skeleton`
  - `query.isError` → `ErrorState` with retry
  - `query.data && empty(data)` → `EmptyState` with the UI-SPEC noun-substituted body
  - otherwise → `children(data)`
  - Empty detection defaults to `data.items.length === 0`; callers override with `empty.when: (data) => boolean`. `hiddenWhenEmpty` short-circuits to `null` (used by AttentionBar).
- **RangeToggle**: segmented today/7d/30d (configurable options); `persistKey` round-trips through lib/storage under `cmc.filter.<key>.range`; mounts hydrate the controller from storage on first render.
- **DataTable<T>**: generic sortable + paginated table with opt-in client-side substring filter on `searchKeys`. v1 has no virtualization; sufficient for ≤200-row panel workloads.
- **HeatmapGrid**: hand-rolled CSS grid; per-cell Tooltip; `colorScale(value, max)` returns the per-cell `background` token name; `--heatmap-cell` CSS var feeds `grid-template-columns`.
- **StatList**: icon + label + value rows with optional `trend` glyph in status colors (NOT accent — UI-SPEC §Color reserves accent).
- **KpiTile**: display-size value + uppercase mono label + optional sublabel; `mono` adds tabular-nums modifier.
- **ErrorState**: in-card error block with UI-SPEC copy "Couldn't load {dataNoun}. Refresh or check `cc doctor`." plus optional Retry button.

### Frontend lib layer

- **`lib/queries.ts`**: `qk` factory with 20 typed key builders (range-scoped where applicable so 'today'|'7d'|'30d' don't collide). 20 hooks + 1 mutation:
  - 5s: `useSystemHealth`, `useLiveSessions`
  - 10s: `useAttention`
  - 15s: `useSummary`
  - 30s: `usePressure`, `useLatency`, `useFailures`, `useSessionsList` (with `placeholderData: prev` to keep the prior page during refetch)
  - 60s: `useTokens`, `useCache`, `useOutcomes`, `useHooks`, `useEdits`
  - 120s: `useByProject`, `useFanout`, `useProductivity`, `useMcpServers`, `useMcpTools`
  - 300s: `useHeatmap`
  - drawer: `useSessionDetails(sid)` gates on `Boolean(sid)`
  - mutation: `useFollowUpMessage` invalidates `qk.liveSessions()` onSuccess
- **`lib/useFirehose.ts`**: native EventSource subscription to `/api/firehose` with optional `event_name` (server-side filter) + `since` (resume cursor) query params. Ring-buffered events array (default cap 500); FIFO slice on overflow. `enabled=false` short-circuits before construction. Cleanup: `removeEventListener` + `es.close()` so React 19 StrictMode double-effect-invocation stays idempotent.

### Frontend api.ts

- 24 new typed response interfaces for Phase-6-consumed endpoints (TokenUsageResponse, CacheResponse, OutcomesResponse, ToolLatencyResponse, HookActivityResponse, ProjectRollupResponse, AgentFanoutResponse, EditDecisionsResponse, ProductivityResponse, PressureResponse, McpServerListResponse, McpToolsResponse, AttentionResponse, SystemHealthResponse, TodaySummaryResponse, LiveSessionItem, SessionDetailsResponse, HeatmapResponse, FailuresResponse, etc.).
- Phase-7-only endpoints (decisions/inbox/tasks/schedules/skills/emergency-stop/sync) intentionally left as `unknown` for Phase 7 to narrow when it consumes them — avoids speculative typing under tsconfig strict.
- `Range` (`'today' | '7d' | '30d'`) and `RangeAll` (`Range | 'all'`) type aliases shared across range-aware fetchers.
- 4 fetchers gained range params: `toolsLatency`, `hooksActivity`, `toolsAgentFanout`, `toolsEditDecisions`. `sessionsByProject(range: RangeAll)` widens to include `'all'`. `sessions()` now accepts a typed `SessionsListParams` object.
- 2 new fetchers: `activityHeatmap(range)` + `sessionsFailures(range)`.
- **systemState bug fix**: replaced path-style `/api/system/state/${key}` with query-string `/api/system/state?key=${key}` matching the backend SAPI-03 route signature (`key` is a Query parameter).

### Frontend styles.css

Appended one consolidated `Phase 6 Plan 01 — Wave 1 panel primitives` section with class blocks for every new primitive. Every color/spacing/radius value uses an existing `var(--cmc-*)` / `var(--space-*)` / `var(--radius-*)` token; no inline hex.

### Backend routes (2 new)

Both routes follow the OBSV-* convention (`Literal["today", "7d", "30d"]` Query enum; `STRFTIME(..., 'localtime')` day buckets).

- **GET /api/activity/heatmap?range={today|7d|30d}** (ACTV-01):
  - Per-day session activity rollup — `{day, sessions, tokens_effective}[]` ordered ASC by day.
  - `tokens_effective = COALESCE(SUM(tokens_input + tokens_output + tokens_cache_read + tokens_cache_create), 0)` matching OBSV-06 by-project semantics.

- **GET /api/sessions/failures?range={today|7d|30d}** (ACTV-05):
  - Failed sessions (outcome `errored` or `rate_limited`) with their most-recent api_error message body.
  - Outcome computed inline via `CASE WHEN EXISTS (...api_error...) THEN 'errored' WHEN EXISTS (...api_retries_exhausted...) THEN 'rate_limited' ELSE NULL END` — mirrors OBSV-03's read-time fallback (Pitfall 9). Works regardless of whether Phase 2 ingest populates sessions.outcome (currently it does not).
  - `last_error_message` extracted from the most-recent `claude_code.api_error.body.message` per session (NULL when no api_error event yet).
  - Items ordered DESC by started_at so the freshest failure surfaces first.

### Backend schemas (4 new Pydantic models)

`HeatmapDayRow` + `HeatmapResponse`, `FailureRow` + `FailuresResponse` appended to `cmc/api/schemas/observability.py` with the same documentation conventions as OBSV-01..10 schemas.

## ACTV-04 TopSkills decision (v2 punt)

Scoped to v2 — NO backend route shipped this plan. Plan 06-05 will ship a "coming soon" EmptyState card with the correct reqId kicker. Rationale documented in the plan's success criteria #6:

1. There is no `claude_code.skill_invoked` OTEL event in current Claude Code ingest. Without an event we cannot count invocations.
2. The cwd-heuristic alternative (rolling sessions up by cwd to infer skill use) is insufficient because Claude Code sessions run from the project cwd, not the skill folder — every session would attribute to its project, not the skill it invoked.
3. Punting to v2 is preferred over speculative Phase 2 ingest changes that would require a follow-up plan to introduce the `claude_code.skill_invoked` event upstream and rebuild the parser.

## Phase 6 downstream entry contract

Every panel in plans 06-02..05 imports from exactly two modules:

```ts
import { PanelCard, RangeToggle, DataTable, HeatmapGrid, StatList, KpiTile, ErrorState } from '../ui'
import { useTokens, useCache, useOutcomes, /* ... */ useFollowUpMessage } from '../../lib/queries'
```

Panels do NOT inline `refetchInterval` / `staleTime` — those live in `queries.ts`. Panels do NOT re-implement loading/empty/error JSX — those live in `PanelCard`. The single observable site for cadence policy is `lib/queries.ts`; the single observable site for render-branch copy is `PanelCard.tsx`.

## Tightened api.ts surface — Phase-7 entries left as `unknown`

The following entries remain `unknown` and will be narrowed by Phase 7 when it consumes them:

- HITL: `decisions`, `createDecision`, `answerDecision`, `inbox`, `createInbox`, `readInbox`, `replyInbox`
- Tasks: `tasks`, `createTask`, `patchTask`, `deleteTask`, `approveTask`, `rerunTask`, `triggerDispatcher`
- Schedules: `schedules`, `createSchedule`, `patchSchedule`, `deleteSchedule`, `scheduleRuns`, `parseNlSchedule`
- Skills: `skills`, `skillsSync`, `skillAutonomy`
- Emergency stop: `emergencyStop`, `emergencyResume`
- Sync: `sync`
- MCP write: `mcpSync`, `mcpMeasure`

Rationale: speculative typing under tsconfig strict against backend schemas Phase 7 has not yet consumed risks misaligning with the actual UI contract. Each entry will gain its types in the same plan that adds the panel binding it.

## Backend route paths added with their exact response shapes

```jsonc
// GET /api/activity/heatmap?range=30d
{ "items": [ { "day": "2026-04-26", "sessions": 3, "tokens_effective": 12345 } ], "range": "30d" }

// GET /api/sessions/failures?range=30d
{
  "items": [
    {
      "session_id": "abc-...",
      "started_at": "2026-04-27T07:30:00+00:00",
      "outcome": "errored",
      "last_error_message": "rate boom"
    }
  ],
  "range": "30d"
}
```

## Self-Check: PASSED

Verified existence of every artifact listed in `key_files.created` + `key_files.modified` and per-task commits:

- frontend/src/components/ui/PanelCard.tsx — FOUND
- frontend/src/components/ui/RangeToggle.tsx — FOUND
- frontend/src/components/ui/DataTable.tsx — FOUND
- frontend/src/components/ui/HeatmapGrid.tsx — FOUND
- frontend/src/components/ui/StatList.tsx — FOUND
- frontend/src/components/ui/KpiTile.tsx — FOUND
- frontend/src/components/ui/ErrorState.tsx — FOUND
- frontend/src/lib/queries.ts — FOUND
- frontend/src/lib/useFirehose.ts — FOUND
- backend/tests/test_phase6_obsv_extensions.py — FOUND
- All 7 component test files in components/ui/__tests__/ — FOUND
- backend/cmc/api/routes/observability.py contains `/activity/heatmap` AND `/sessions/failures` — FOUND
- backend/cmc/api/schemas/observability.py contains `HeatmapResponse` AND `FailuresResponse` — FOUND
- frontend/src/lib/api.ts contains `/api/system/state?key=` (NOT path-style) — FOUND

Commit hashes:
- c27a2b5: Task 1a (Recharts + api.ts + styles.css)
- 99d1d8c: Task 1b (7 ui primitives + tests)
- d108fec: Task 2 (queries.ts + useFirehose + tests)
- 303bfb7: Task 3 (backend ACTV-01 + ACTV-05 + tests)

Verified via:
```
git log --oneline -4 main  # all 4 task commits present
[ -f frontend/src/lib/queries.ts ] && [ -f frontend/src/lib/useFirehose.ts ] && [ -f backend/tests/test_phase6_obsv_extensions.py ]
grep -q "/api/activity/heatmap" backend/cmc/api/routes/observability.py
grep -q "/api/system/state?key=" frontend/src/lib/api.ts
```
