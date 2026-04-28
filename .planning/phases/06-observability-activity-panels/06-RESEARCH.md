# Phase 6: Observability & Activity Panels — Research

**Researched:** 2026-04-27
**Domain:** React 19 SPA data-binding layer over FastAPI/SQLite read-only APIs (Phase 3) + SSE firehose (Phase 3 SAPI-05) + follow-up POST endpoint (Phase 3 SESS-06). 21 panels (15 OPNL + 6 ACTV) backed by 18 distinct backend endpoints. Charting (stacked bars, sparkline, heatmap), polling cadence (TanStack Query refetchInterval), SSE consumption pattern, panel composition, empty-state taxonomy.
**Confidence:** HIGH on backend endpoint contracts (every route file read in full + response schema verified against Pydantic models), HIGH on Phase 5 primitive surface (12-export barrel verified), HIGH on stack already on disk (TanStack Query 5.100.5, Radix, framer-motion 12.38, cmdk all installed and working — 62/62 tests green), MEDIUM on chart-library recommendation (Recharts is the documented project default in `.planning/research/STACK.md` but has not been installed yet — verification step required in Wave 0), HIGH on SSE pattern (Phase 3's `/api/firehose` already shipped with `EventSourceResponse` + 60-min cap + `request.is_disconnected()` semantics).

> **NO CONTEXT.md exists for Phase 6** — this RESEARCH operates with full Claude discretion subject to project-wide locked decisions in STATE.md / PROJECT.md / UI-SPEC. Two project-wide invariants frame everything below: **(1) no Tailwind, no inline hex — every color/spacing/radius is a `var(--cmc-*)` token from styles.css**, and **(2) SSE not WebSockets** for streaming.

## Summary

Phase 6 binds 21 named cards to existing read-only APIs (Phase 3) plus one SSE stream (`/api/firehose`) and one POST queue (`/api/sessions/live/{sid}/message` — the LiveSessionsCard drawer's follow-up). Every endpoint **already exists and ships in production code** [VERIFIED: `backend/cmc/api/routes/*.py` — 47 route declarations counted; full traceability table below]. The work is therefore overwhelmingly frontend: chart-library install, ~21 card components, panel-composition primitives (the existing 12-primitive barrel does not yet include `Drawer`/`Sheet` for tool-timeline, `<Table>` for SessionsTable, `<HeatmapGrid>`, `<StackedBarChart>`, or `<RangeToggle>`), TanStack Query wiring (currently only `<QueryClientProvider>` is mounted; no `useQuery` calls live yet), and a single SSE-aware hook for ACTV-03 + future SESS-05 reuse. Two **gaps** need explicit decisions before Wave 1:

1. **ACTV-01 (HeatmapGrid)** has NO matching backend endpoint. The `activities` table exists (Plan 01-05 created it) but is not populated and has no GET route. Phase 6 must either (a) add a thin compute-on-the-fly `/api/activity/heatmap?range=30d` route reading `sessions` directly (recommended — matches OPNL-13 pattern, avoids Phase 2 ingest changes), or (b) populate `activities` and add the route. Recommend (a): keep Phase 6 frontend-dominant; one new GET in `observability.py` deriving `(day, sessions_count, tokens_total)` from `sessions` table.
2. **ACTV-04 (TopSkills)** and **ACTV-05 (UnifiedFailures)** have NO matching endpoints either. TopSkills needs a `/api/skills/usage` rollup (skill name → token cost from sessions joined with — there is no skill_id on sessions today; **needs decision**). UnifiedFailures can derive from `OBSV-03 outcomes + OBSV-10 pressure` already, but the requirement says "crashed sessions with error messages" — recommend deriving inline from sessions WHERE outcome IN ('errored','rate_limited') joined to last `claude_code.api_error` event message. **Either add two thin endpoints in this phase or scope ACTV-04/05 to v2.** Recommendation: add the two endpoints in Plan 06-01 (Wave 0) since they're trivial reads — keeps Phase 6 a self-contained delivery.

**Primary recommendation:** Five-plan, three-wave structure (detail in §Plan Breakdown). Wave 0 lands shared infrastructure (chart library, panel-composition primitives `<PanelCard>` + `<RangeToggle>` + `<DataTable>` + `<HeatmapGrid>`, the SSE hook, two thin backend endpoints to close ACTV-01/04/05 gaps, and TanStack Query keys/hooks layer in `lib/queries.ts`). Wave 1 ships the Command-page panels in two parallel plans (KPI/health/attention/live-sessions vs the analytical cards OPNL-05..15). Wave 2 ships the Activity page (heatmap + token charts + firehose + sessions table). The seam between waves is the panel-shell primitive: every card consumes `<PanelCard kicker title trailing>{ ...hook returns + child render-prop }</PanelCard>`, and the loading/empty/error states are owned by that wrapper, not the cards. **Use Recharts 3.x for all charts** (project STACK.md default; covers stacked bars + sparkline + line-with-target; heatmap is hand-rolled CSS grid since it's just a 30-cell array). **Use a small bespoke `useFirehose` hook around native `EventSource`** rather than installing an SSE library — it's ~50 lines and lets us own reconnect / cursor / queryClient.setQueryData semantics; Phase 7 will not need a different shape.

## User Constraints (no CONTEXT.md — project-wide constraints from STATE.md / PROJECT.md / UI-SPEC)

### Locked decisions (project-wide — DO NOT revisit)
- **TanStack Router** for client routing [VERIFIED: `frontend/package.json` L20; `frontend/src/routes/*` already shipped]
- **TanStack Query 5.100.5** as the data-fetching layer [VERIFIED: `frontend/package.json` L19; `<QueryClientProvider>` mounted in `routes/__root.tsx` L6-13 with `staleTime: 30_000`, `refetchOnWindowFocus: false`]
- **Design tokens in shared CSS** — every panel MUST reference `var(--cmc-*)` / `var(--space-*)` / `var(--size-*)` / `var(--weight-*)`; no inline hex, no Tailwind. [VERIFIED: STATE.md L194; `frontend/src/styles.css` :root block]
- **SSE for streaming** — no WebSockets. ACTV-03 firehose subscribes to `/api/firehose`. [VERIFIED: REQUIREMENTS.md "Out of Scope" L317]
- **Backend stack frozen** — FastAPI + SQLAlchemy 2.0 async + SQLModel + Alembic; SQLite single-file. [VERIFIED: STATE.md L96]
- **No spinners, only skeletons** [VERIFIED: REQUIREMENTS.md FESH-08; `Skeleton.tsx` already shipped]
- **EmptyState heading "Nothing to show yet" + body template `Once {data-noun} arrives it will appear here. Run sync from the header to refresh.`** [VERIFIED: UI-SPEC L137-138]
- **Loading state copy: NONE** — skeleton blocks match final content shape; never "Loading…" text. [VERIFIED: UI-SPEC L140]
- **`lib/storage` cmc.\* prefix** is the canonical persistence carrier; Phase 6 reuses for filter persistence (e.g. `cmc.filter.activity-range`). [VERIFIED: STATE.md L195]
- **CommandPalette is mounted globally in AppShell** — Phase 6 adds palette items but does not re-mount. [VERIFIED: STATE.md L196]
- **PlaceholderCardGrid is the entry contract** — replace each `<Card>` slot by reqId; helper `frontend/src/components/PlaceholderCardGrid.tsx` is deleted when its last consumer is replaced. [VERIFIED: STATE.md L198]
- **DESG-04 grid recipe locked**: `repeat(auto-fit, minmax(320px, 1fr))` + `grid-auto-rows: 1fr`; no media-query breakpoints. Reuse for any Phase 6 multi-panel arrangement. [VERIFIED: STATE.md L199; `.cmc-card-grid` class in styles.css L474]
- **Page-level entrance animation** = `.cmc-page` wrapper (`cmc-page-in` 300ms ease-out); no per-card stagger. [VERIFIED: STATE.md L200]
- **OPNL-02 KpiRow** explicitly NOT in PlaceholderCardGrid — Phase 6 inserts the slot ABOVE `<PlaceholderCardGrid>` in `routes/index.tsx`. [VERIFIED: STATE.md L203; `routes/index.tsx` L7-10 comment]
- **Backend response handler emits `{error: detail}`** not FastAPI default `{detail: ...}` — `lib/api.ts` `ApiError.body` already round-trips this; UI surfaces should display body literal. [VERIFIED: STATE.md L154]

### Claude's discretion (Phase 6 owns these)
- **Chart library choice** — STACK.md lists Recharts as the default but it has not been installed; alternatives below.
- **Polling intervals per panel** — TanStack Query `refetchInterval` per data class.
- **SSE consumption pattern** — `EventSource` + manual `queryClient.setQueryData` vs library; recommend hand-rolled hook.
- **Panel composition shape** — `<PanelCard>` shell primitive vs `usePanel(queryKey)` hook; recommend the wrapper component.
- **Wave/plan breakdown** — see §Plan Breakdown.
- **Two thin backend endpoints** to close ACTV-01 / ACTV-04 / ACTV-05 gaps (or punt those requirements to v2 — strongly recommend NOT punting; thin reads).
- **TanStack Query staleTime/gcTime per query** — current root default is 30s staleTime, no gcTime override; per-query overrides land in the new `lib/queries.ts`.
- **Tightening response types** — `lib/api.ts` returns `unknown` for most endpoints; Phase 6 narrows to typed shapes copied from backend Pydantic models.

### Deferred ideas (OUT OF SCOPE for Phase 6)
- Composers (TaskComposer, ScheduleComposer) — Phase 7
- AttentionBar interactive state actions (the badge bar is here; resolution actions are Phase 7)
- HITL panels (DecisionsCard, InboxCard) — Phase 7 / HPNL-*
- Task panels (TaskBoard, TaskComposer, SchedulesCard, ScheduleComposer, EmergencyStop) — Phase 7 / TPNL-*
- Skills page panels (MCPPanel/SkillsRegistry/SkillCostCard/ContextHealthCard) — Phase 7 / SKLP-* (but Phase 6 ships the **Command page MCP panel OPNL-15**, which is a SUBSET of the Phase 7 SKLP-01)
- Theme toggle — v1 is dark-only
- Live SSE per-session stream UI (SESS-05) — surfaced via the LiveSessionsCard drawer in Phase 6 only as a passive last_activity_at; deeper streaming UI is Phase 7+ (per UI-SPEC drawer scope)

## Endpoint Traceability Table (the contract Phase 6 binds to)

Every endpoint below was verified by reading the actual route file (path, method, response model, query params). When the implementation diverged from a planning doc, code wins. Refresh cadence is the **recommendation** for TanStack Query `refetchInterval`; it is NOT enforced by the backend.

| Req | Card | Method + Path | Response (Pydantic) | Query params | Refresh | Notes |
|-----|------|---------------|---------------------|--------------|---------|-------|
| OPNL-01 | SystemHealthStrip | GET `/api/system/health` | `SystemHealthResponse` { status, uptime_seconds, memory_rss_mb, last_otel_event_age_seconds, daemon_ages: [{key, last_tick_at, age_seconds}], tzname } | none | **5s poll** | Strip rerenders every tick — uptime/memory drift visibly |
| OPNL-02 | KpiRow | GET `/api/summary` | `TodaySummaryResponse` { date, sessions_count, tokens_input_total, tokens_output_total, tokens_cache_read_total, tokens_cache_create_total, tool_call_count, error_count } | none | **15s poll** | Today's bucket; `date` is local-day key — display in mono |
| OPNL-03 | AttentionBar | GET `/api/attention` | `AttentionResponse` { items: [{kind, severity, count, detail}], pending_decisions, failed_tasks, stale_dispatcher_seconds, stuck_sessions } | none | **10s poll** | `pending_decisions`/`failed_tasks` are PHASE-4-AWARE 0 today — Phase 6 displays both as zero is fine; AttentionBar **HIDES** when `items.length === 0 && stuck_sessions === 0 && stale_dispatcher_seconds === null` |
| OPNL-04 | LiveSessionsCard | GET `/api/sessions/live` | `list[LiveSessionItem]` (note: not wrapped in `{ items: ... }`) — { session_id, started_at, last_activity_at, state, current_tool, model } | none | **5s poll** | Drawer details: GET `/api/sessions/{id}/details` → `SessionDetailsResponse` { session, tools: [ToolTimelineEntry] }. Follow-up: POST `/api/sessions/live/{sid}/message` body `{ message: str }` → 202 `{ queued, session_id, queue_path }`. Path-validation: backend rejects non-UUID with 400 |
| OPNL-05 | TokenUsageCard | GET `/api/usage/tokens?range={today\|7d\|30d}` | `TokenUsageResponse` { items: [{day, model, source, tokens_input, tokens_output, tokens_cache_read, tokens_cache_create, sessions_count}], range } | `range` (default 7d) | **60s poll on visible range** | UI groups by day for stacked bars; segments are 4 categories (input/output/cache_read/cache_create); also stack-by-model is a future affordance — keep response shape flexible. Total computed client-side |
| OPNL-06 | CacheEfficiencyCard | GET `/api/usage/cache?range={today\|7d\|30d}` | `CacheResponse` { hit_rate, trend: [{day, hit_rate, billable_tokens, low_sample}], range, low_sample } | `range` (default 7d) | **60s poll** | Big number = `hit_rate` (×100 for %); sparkline = `trend` `hit_rate`; horizontal target line at 0.7; show "Low sample" badge when `low_sample === true` (per-day or overall) |
| OPNL-07 | SessionOutcomesCard | GET `/api/sessions/outcomes?range={today\|7d\|30d}` | `OutcomesResponse` { items: [{day, errored, rate_limited, truncated, unfinished, ok, total}], range } | `range` (default 7d) | **60s poll** | Stacked bars; **buckets are mutually exclusive** (priority errored>rate_limited>truncated>unfinished>ok per OBSV-03); `total = sum(buckets)` so segments sum to day total |
| OPNL-08 | ToolLatencyCard | GET `/api/tools/latency?range={today\|7d\|30d}` | `ToolLatencyResponse` { items: [{tool_name, call_count, p50_ms, p95_ms, max_ms, error_rate}], range } | `range` (default 7d) | **30s poll** | Sorted by p95 desc backend-side; flag rules (UI): red if p95_ms > 5000 OR error_rate > 0.05; green if call_count >= 10 AND p95_ms < 1000 AND error_rate === 0 |
| OPNL-09 | HookActivityCard | GET `/api/hooks/activity?range={today\|7d\|30d}` | `HookActivityResponse` { items: [{day, hook_name, fires, paired_duration_ms_p50}], range, total_fires } | `range` (default 7d) | **60s poll** | **Empty state when `total_fires === 0`** — defaults to EmptyState heading per UI-SPEC |
| OPNL-10 | ProjectBreakdownCard | GET `/api/sessions/by-project?range={today\|7d\|30d\|all}` | `ProjectRollupResponse` { items: [{cwd, display_path, sessions, tokens_effective, tool_calls, pct_of_total}], range } | `range` (default 30d) | **120s poll** | **Backend already computes `display_path`** (`/Users/<u>/` → `~/`) — UI uses it directly; never re-implement the regex client-side |
| OPNL-11 | AgentFanoutCard | GET `/api/tools/agent-fanout?range={today\|7d\|30d}` | `AgentFanoutResponse` { items: [{session_id, title, agent_calls, started_at}], range } | `range` (default 7d) | **120s poll** | When `title` is null/empty, fall back to `session_id.slice(0,8) + '…'` rendered with `--cmc-text-subtle`; backend already supplies fallback in some cases — UI must double-check |
| OPNL-12 | EditAcceptanceCard | GET `/api/tools/edit-decisions?range={today\|7d\|30d}` | `EditDecisionsResponse` { items: [{tool_name, accepted, rejected, accept_rate, low_sample}], range } | `range` (default 7d) | **60s poll** | Always 4 rows (Edit/MultiEdit/Write/NotebookEdit); `low_sample` per row when total<10. Use `Badge variant="warning"` |
| OPNL-13 | ProductivityCard | GET `/api/activity/productivity?range={today\|7d\|30d}` | `ProductivityResponse` { commits, pull_requests, lines_added, lines_removed, range } | `range` (default 7d) | **120s poll** | **Empty state when `commits + pull_requests + lines_added + lines_removed === 0`** |
| OPNL-14 | PressurePanel | GET `/api/system/pressure` | `PressureResponse` { api_retries_exhausted, compaction_count, recent_api_errors: [{ts, session_id, message}] } | none | **30s poll** | "last 10" is enforced backend-side (`LIMIT 10`) — UI does not slice |
| OPNL-15 | MCP panel | GET `/api/mcp` (servers list) + GET `/api/mcp/{server}/tools` (drill-down on click) | `McpServerListResponse` { items: [{server_name, call_count, error_count, latency_p50_ms, latency_p95_ms, latency_max_ms, source_priority, computed_at}] } + `McpToolsResponse` { server_name, items: [{tool_name, call_count, error_count, latency_p50_ms, latency_p95_ms, latency_max_ms, source_priority, schema_size_bytes}] } | server name in path | **120s poll on list; on-demand on tools (no poll while expanded)** | Phase 7 SKLP-01 reuses the same component on `/skills`. Slow tag: p95 > 5000ms; Fast: call_count ≥ 10 AND p95 < 500ms AND error_count === 0. Path-traversal: backend returns 400 on bad server name — `encodeURIComponent` is sufficient client-side |
| ACTV-01 | HeatmapGrid | **GAP — no endpoint exists** | Recommended new: GET `/api/activity/heatmap?range=30d` → `[{day, sessions, tokens_effective}]` | `range` | **300s poll** | Plan 06-01 must add this thin route. Read direct from `sessions` table (no `activities` table populate dependency). Cell color scaled by sessions per day or tokens — UI choice |
| ACTV-02 | ChartsStrip (14d) | GET `/api/usage/tokens?range=30d` | `TokenUsageResponse` (same as OPNL-05) — UI slices last 14 days client-side | `range=30d` (overfetch by 16d to keep one query key) | **60s poll** | OR add a separate `range=14d` literal — backend currently accepts only `today/7d/30d` (verified `_RANGE_TO_SINCE` in `observability.py` L62). **Recommendation: keep range=30d and slice client-side** — avoids a Pydantic Literal change cascading through SUMMARY artifacts |
| ACTV-03 | OtelPanel | SSE GET `/api/firehose?event_name={?}&since={iso?}` | `ServerSentEvent` stream — each event has `event: 'otel'`, `id: string`, `data: { id, ts, event_name, session_id, attrs_mcp_server, attrs_mcp_tool }` | optional `event_name` filter, optional `since` ISO | **SSE — no poll** | Caps at 60min server-side (Pitfall 1) — client must auto-reconnect. Backend pre-validates `since` via `_resolve_since_id` Depends → 400 if bad ISO. Empty body: just newlines + heartbeats |
| ACTV-04 | TopSkills | **GAP — no endpoint exists** | Recommended new: GET `/api/skills/usage?range=30d` → `[{name, sessions, tokens_total}]` | `range` | **120s poll** | **Or punt to v2.** No `skill_id` on sessions table today — recommend reading `otel_events` `claude_code.skill_invoked` events (verify event name exists in Phase 2 ingest) OR scope to "skills with sessions in CWD matching skill folder name" (heuristic). Decision needed in Plan 06-01 |
| ACTV-05 | UnifiedFailures | **GAP — synthesizable from existing endpoints** | Recommended new: GET `/api/sessions/failures?range=30d` → `[{session_id, started_at, outcome, last_error_message}]` | `range` | **30s poll** | Joins `sessions WHERE outcome IN ('errored', 'rate_limited')` with most recent `claude_code.api_error` body.message per session. Alternative: synthesize client-side from OBSV-03 outcomes + OBSV-10 pressure recent_api_errors — but message-to-session mapping is not currently exposed (the OBSV-10 list returns most-recent-10 globally, not per-session correlated). Add the route |
| ACTV-06 | SessionsTable | GET `/api/sessions?range={...}&source={?}&model={?}&limit={N}&offset={N}` | `SessionListResponse` { items: [SessionListItem], total, limit, offset } | range/source/model/limit/offset (`limit` ge=1 le=200, default 50) | **60s poll** | Search field: client-side filter on the page payload (NOT backend — there's no `q=` param). Pagination: `offset += limit` chunks. `range='all'` is supported |

**Auxiliary endpoints used inside panels (not as the primary card data source):**

| Inside panel | Endpoint | Notes |
|--------------|----------|-------|
| OPNL-04 drawer (open) | GET `/api/sessions/{sid}/details` | Session+tools timeline; ordered ASC; 400 on bad UUID; 404 if session missing |
| OPNL-04 drawer (follow-up) | POST `/api/sessions/live/{sid}/message` | 202 + queue_path; 400 invalid sid; 404 session missing; 409 ended (`ended_at IS NOT NULL`) |

**Path correction needed in `frontend/src/lib/api.ts`:** `systemState: (key) => fetchJson(\`/api/system/state/\${encodeURIComponent(key)}\`)` is **wrong** — backend route is GET `/api/system/state?key=X` (query param, not path). Phase 5 stub; Phase 6 fixes when consumed (no panel binds to system_state in scope today, but the bug should be flagged in plan 06-01).

## Chart library decision (Recharts 3.x)

**Recommendation: install Recharts 3.x.** Bundle hand-rolled fallbacks for HeatmapGrid (CSS grid — no library needed) and KPI sparklines (Recharts `<LineChart>` micro-mode). Project STACK.md already lists Recharts as the default with version "~3.8" verified.

### Alternatives considered

| Library | Bundle (gzip) | Stacked bars | Sparkline | Heatmap | CSS-var theming | React 19 | Verdict |
|---------|---------------|--------------|-----------|---------|-----------------|----------|---------|
| **Recharts 3.x** | ~95 kB | ✅ `<BarChart><Bar stackId>` | ✅ `<LineChart>` micro-mode | ❌ (hand-roll) | ✅ accepts `fill={var(--cmc-...)}` and `stroke=` props | ✅ peer `^16 \|\| ^17 \|\| ^18 \|\| ^19` (verify on install) | **Recommended.** Project default; declarative; SVG so theming via CSS vars is direct; covers stacked/sparkline/line-with-target |
| Tremor 3.x | ~110 kB + Tailwind hard-dep | ✅ | ✅ | ✅ | ❌ Tailwind-locked | ✅ | **Rejected** — UI-SPEC bans Tailwind. Tremor's value prop is the Tailwind utility surface; without it we'd be paying its cost for nothing |
| Visx (airbnb) | ~40 kB tree-shaken | ✅ low-level | ✅ low-level | ✅ low-level | ✅ | ✅ | **Considered.** Most flexible, smallest. But: every chart is composition from 4-5 primitives — Phase 6's 5 charts (4 stacked-bar + 1 sparkline + 1 heatmap) would each cost 30-50 lines of low-level work. Recharts is faster to ship; visx is a defensible v2 if we need sankey/chord/treemap |
| Nivo | ~140 kB+ per chart | ✅ | ✅ | ✅ canvas/svg native heatmap | ⚠️ inline theme prop, not CSS-var native | ✅ | **Rejected.** Heaviest of the three; theme-by-prop fights `--cmc-*` token contract. Nivo's strength (rich animations, beautiful defaults) is unused since UI-SPEC locks our motion contract |
| Chart.js / react-chartjs-2 | ~70 kB | ✅ | ✅ | ⚠️ matrix plugin | ⚠️ canvas — no CSS-var read | ✅ | **Rejected.** Canvas means we can't theme via CSS vars without re-rendering on token changes; SVG (Recharts) wins for a token-driven dashboard |
| ECharts (apache) | ~250 kB+ | ✅ | ✅ | ✅ | ⚠️ JS-config theme | ✅ | **Rejected.** Way too heavy for this scope; "kitchen sink" library; project ethos is bespoke + minimal |
| Hand-rolled SVG | 0 kB | manual | manual | manual | ✅ | ✅ | **Used for HeatmapGrid only** — 30 cells in CSS grid is trivial; pulling Recharts for it is overkill |

**Why Recharts wins for THIS project:**
- Already the documented project default in `.planning/research/STACK.md` (HIGH confidence sourcing).
- SVG output → every fill/stroke can read `var(--cmc-*)` via `style.color` or by setting `fill="currentColor"` and styling the parent.
- Declarative React API → composable with our `<PanelCard>` shell; `<ResponsiveContainer>` handles `auto-fit minmax(320px,1fr)` resize without manual ResizeObserver.
- Covers the four chart shapes Phase 6 needs (stacked bar, sparkline, line-with-target ReferenceLine, mini bar) with one library; tree-shakable via per-component imports `import { BarChart, Bar, XAxis, ... } from 'recharts'`.
- Phase 6 ships 4 stacked-bar cards (OPNL-05 token usage, OPNL-07 outcomes, OPNL-09 hook fires, ACTV-02 14-day token) + 1 sparkline (OPNL-06 cache trend) + 1 line-with-target (also OPNL-06 70% target line) = 6 charts. All on one library.
- Bundle: ~95 kB gzip on top of an already-shipped 60+ kB React+TanStack stack is acceptable for a localhost-only dashboard. (For the perfectionist: Recharts 3 ships per-chart entry points for tree-shaking in Vite.)

**Install + verify (Wave 0 task):**
```bash
cd frontend && npm install recharts@^3
node -e "console.log(require('recharts/package.json').version)"  # must print 3.x
node -e "console.log(require('recharts/package.json').peerDependencies)"  # MUST include react ^19 (or ^18 with no React 19 issues — verify against npm view)
```
If peer is `^16 || ^17 || ^18` only (no 19), check the latest 3.x changelog — Recharts has been adding React 19 support iteratively. Fall back to `--legacy-peer-deps` ONLY if the runtime smoke test (`npx vite build`) succeeds. **Wave 0 must commit the resolved version + peer-deps line in 06-01-SUMMARY.md.**

## Polling cadence + cache invalidation pattern

The current root QueryClient uses `staleTime: 30_000`, no per-query overrides, and `refetchOnWindowFocus: false`. Phase 6 establishes a **canonical query keys + options table** in `lib/queries.ts`. Each card reads from this — never inlines.

### Recommended cadence per data class

| Class | Examples | `refetchInterval` | `staleTime` | Why |
|-------|----------|-------------------|-------------|-----|
| Live system | OPNL-01 health, OPNL-04 live sessions | **5_000** | 0 (always stale) | Drift-visible (uptime ticks every second; users notice >10s latency) |
| Today KPIs | OPNL-02 summary, OPNL-14 pressure | **15_000** | 5_000 | KPIs visibly tick on the page; pressure errors should surface within ~15s |
| Attention | OPNL-03 attention | **10_000** | 5_000 | Stuck loops + dispatcher staleness — 10s is the sweet spot |
| Tool latency | OPNL-08 latency | **30_000** | 20_000 | Aggregation; 30s is fine for p95 drift |
| Daily aggregates | OPNL-05 tokens, OPNL-06 cache, OPNL-07 outcomes, OPNL-09 hooks, OPNL-12 edits, OPNL-13 productivity | **60_000** | 45_000 | Daily-bucket data; doesn't change minute-by-minute; saves DB load |
| Slow rollups | OPNL-10 by-project, OPNL-11 agent-fanout, OPNL-15 mcp, ACTV-04 skills, ACTV-01 heatmap | **120_000** | 90_000 | Wide-window aggregates; 2min cadence is generous |
| Historical | ACTV-06 sessions, ACTV-05 failures | **30_000** | 20_000 | Mid-range; user navigates pages — staleness keeps already-fetched pages snappy |
| SSE | ACTV-03 firehose | **N/A — no refetch** | N/A | Pushed; cursor-based reconnect on close (60min cap) |
| One-shot writes | OPNL-04 follow-up POST | N/A — `useMutation` | N/A | On success: `queryClient.invalidateQueries({ queryKey: ['sessions','live'] })` to refresh the drawer's source list |

### `lib/queries.ts` shape (single source of truth)

```ts
// frontend/src/lib/queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type * as T from './api'

// Query keys — typed factory; every panel reads from here.
export const qk = {
  systemHealth: () => ['system', 'health'] as const,
  attention:    () => ['attention'] as const,
  summary:      () => ['summary'] as const,
  pressure:     () => ['system', 'pressure'] as const,
  liveSessions: () => ['sessions', 'live'] as const,
  sessionDetails: (sid: string) => ['sessions', sid, 'details'] as const,
  tokens:   (range: T.Range) => ['usage', 'tokens', range] as const,
  cache:    (range: T.Range) => ['usage', 'cache',  range] as const,
  outcomes: (range: T.Range) => ['sessions', 'outcomes', range] as const,
  latency:  (range: T.Range) => ['tools', 'latency', range] as const,
  hooks:    (range: T.Range) => ['hooks', 'activity', range] as const,
  byProject:(range: T.Range) => ['sessions', 'by-project', range] as const,
  fanout:   (range: T.Range) => ['tools', 'agent-fanout', range] as const,
  edits:    (range: T.Range) => ['tools', 'edit-decisions', range] as const,
  productivity:(range: T.Range) => ['activity', 'productivity', range] as const,
  mcpServers:   () => ['mcp'] as const,
  mcpTools:     (server: string) => ['mcp', server, 'tools'] as const,
  heatmap:  (range: T.Range) => ['activity', 'heatmap', range] as const,
  topSkills:(range: T.Range) => ['skills', 'usage', range] as const,
  failures: (range: T.Range) => ['sessions', 'failures', range] as const,
  sessionsList: (params: T.SessionsListParams) => ['sessions', 'list', params] as const,
} as const

// Hooks — one per panel, opinionated cadence.
export const useSystemHealth = () =>
  useQuery({ queryKey: qk.systemHealth(), queryFn: api.systemHealth, refetchInterval: 5_000, staleTime: 0 })

export const useAttention = () =>
  useQuery({ queryKey: qk.attention(), queryFn: api.attention, refetchInterval: 10_000, staleTime: 5_000 })

// ... etc, 21 hooks total. Each panel imports ONE.

// Mutation — follow-up to live session.
export function useFollowUpMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sid, message }: { sid: string; message: string }) =>
      api.sessionFollowUp(sid, { message }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.liveSessions() }),
  })
}
```

### When to show skeleton vs stale-but-rendered

TanStack Query has 4 status combinations a card must handle:

```ts
const q = useUsageTokens(range)
// 1. q.isPending && q.fetchStatus === 'fetching'  → skeleton (first load, no cached data yet)
// 2. q.isPending && q.fetchStatus === 'idle'     → skeleton (mounted with no fetch yet — rare with refetchInterval)
// 3. !q.isPending && q.data && q.isFetching      → render q.data; show subtle "syncing" affordance (optional — UI-SPEC says no spinners; could omit)
// 4. !q.isPending && q.data                       → render q.data
// Error: q.isError                                → ErrorState card (specific copy: "Couldn't load {data-noun}. Refresh or check `cc doctor`.")
```

**Rule (locked for Phase 6):** Show **skeleton ONLY on first-load (`q.isPending`)**. On subsequent refetches, render cached data without a loading affordance — this matches UI-SPEC L140 "skeletons not Loading text" and "skeleton blocks match the final content shape." The `<PanelCard>` wrapper enforces this rule (callers pass `q` not `q.data`).

## SSE integration pattern (`useFirehose` hook)

**Recommendation: hand-rolled `useFirehose` hook around native `EventSource`.** ~50 lines. Reusable for SESS-05 (Phase 7+) without re-shape. No dependency added.

### Why not a library

- `@microsoft/fetch-event-source` adds POST-with-body support — we don't need that (firehose is GET).
- `react-use-websocket` is WebSocket-shaped — wrong tool.
- `eventsource` polyfill is for Node — not needed in modern browsers.
- Our SSE has only two consumers (ACTV-03 now, SESS-05 later); one bespoke hook is cheaper than a library API surface.

### Hook shape

```ts
// frontend/src/lib/useFirehose.ts
import { useEffect, useRef, useState } from 'react'

export interface OtelEvent {
  id: number
  ts: string
  event_name: string
  session_id: string | null
  attrs_mcp_server: string | null
  attrs_mcp_tool: string | null
}

interface FirehoseOptions {
  eventName?: string         // server-side filter (passed as ?event_name=)
  since?: string             // ISO timestamp; default = backend tail (MAX(id)-100)
  bufferSize?: number        // ring-buffer cap; default 500
}

export function useFirehose(opts: FirehoseOptions = {}) {
  const [events, setEvents] = useState<OtelEvent[]>([])
  const [status, setStatus] = useState<'connecting'|'open'|'closed'>('connecting')
  const lastIdRef = useRef<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (opts.eventName) params.set('event_name', opts.eventName)
    if (opts.since)     params.set('since', opts.since)
    // On reconnect, resume from last seen id via SSE Last-Event-ID header — EventSource native.
    const url = `/api/firehose${params.toString() ? `?${params}` : ''}`
    const es = new EventSource(url)

    es.addEventListener('open', () => setStatus('open'))
    es.addEventListener('error', () => {
      setStatus('closed')
      // EventSource auto-reconnects with exponential backoff; the 60-min server cap
      // means an idle reconnect every hour is normal, not an error condition.
    })
    es.addEventListener('otel', (ev: MessageEvent) => {
      lastIdRef.current = ev.lastEventId
      try {
        const evt = JSON.parse(ev.data) as OtelEvent
        setEvents(prev => {
          const cap = opts.bufferSize ?? 500
          const next = [...prev, evt]
          return next.length > cap ? next.slice(next.length - cap) : next
        })
      } catch { /* skip malformed */ }
    })

    return () => es.close()
  }, [opts.eventName, opts.since, opts.bufferSize])

  return { events, status }
}
```

### Reconnect contract

- `EventSource` natively emits `Last-Event-ID` header on reconnect (the `id:` field of the last received frame). Backend `tail_otel_events` accepts `?since=` ISO but does NOT yet honor `Last-Event-ID` — Phase 6 may either (a) pass `since` from the React side using the cached `lastIdRef.current`'s ISO, OR (b) extend the backend `_resolve_since_id` Depends to also read from `Last-Event-ID` header. **Recommend (b)** as a tiny backend tweak in Plan 06-01 — the frontend then writes natural EventSource code without manual resume logic. (If we want to keep Phase 6 frontend-only: option (a) works.)
- Hook does NOT wire into TanStack Query because the firehose is append-only and only one component (OtelPanel) consumes it. The buffer lives in component state. If a second consumer ever needs it, lift to a Context or to `queryClient.setQueryData(['firehose'], buf)` then.

### Filter behavior

OtelPanel's UI shows a free-text `event_name` filter. Two strategies:
1. **Server-side filter** — re-mount the hook with `eventName=` whenever the user types. Simple but disconnects + reconnects on every keystroke.
2. **Client-side filter** — keep `eventName=undefined` server-side (full firehose) and filter the rendered list in the React component.

Recommend **(2) client-side** for v1. Cheaper. Server filter is an optimization for future when firehose cardinality justifies it.

## Panel composition pattern (`<PanelCard>` shell + uniform loading/empty/error)

**Recommendation: a `<PanelCard>` wrapper component, not a `usePanel(queryKey)` hook.** Components compose better with React Suspense / ErrorBoundary boundaries; hooks force every panel to re-implement the loading/empty/error JSX.

### `<PanelCard>` API

```tsx
// frontend/src/components/ui/PanelCard.tsx (NEW — Phase 6)
import { ReactNode } from 'react'
import { UseQueryResult } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, EmptyState, Skeleton } from './'  // existing barrel

interface PanelCardProps<TData> {
  reqId: string                     // kicker — e.g. "OPNL-05" (matches PlaceholderCardGrid surface)
  title: string                     // CardTitle
  description?: ReactNode           // CardDescription (range toggle, badges, etc.)
  trailing?: ReactNode              // top-right slot (RangeToggle, refresh chip)
  query: UseQueryResult<TData, Error>
  empty: { dataNoun: string; when?: (data: TData) => boolean }   // when?(data) overrides empty detection
  skeleton?: ReactNode              // override default skeleton block (4 lines of cmc-skeleton--text)
  children: (data: TData) => ReactNode
}

export function PanelCard<T>({ reqId, title, description, trailing, query, empty, skeleton, children }: PanelCardProps<T>) {
  return (
    <Card>
      <CardHeader>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <CardDescription className="cmc-label">{reqId}</CardDescription>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {trailing}
        </div>
      </CardHeader>
      <CardContent>
        {query.isPending
          ? (skeleton ?? <DefaultSkeleton />)
          : query.isError
          ? <ErrorState message={query.error.message} />
          : isEmpty(query.data, empty.when)
          ? <EmptyState heading="Nothing to show yet"
                        body={`Once ${empty.dataNoun} arrives it will appear here. Run sync from the header to refresh.`} />
          : children(query.data!)}
      </CardContent>
    </Card>
  )
}
```

### Worked example: OPNL-05 TokenUsageCard

```tsx
// frontend/src/components/panels/TokenUsageCard.tsx
import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { PanelCard } from '../ui/PanelCard'
import { RangeToggle } from '../ui/RangeToggle'
import { useTokens } from '../../lib/queries'
import { groupTokensByDay } from './TokenUsageCard.utils'

export function TokenUsageCard() {
  const [range, setRange] = useState<'today'|'7d'|'30d'>('7d')
  const q = useTokens(range)
  return (
    <PanelCard
      reqId="OPNL-05"
      title="Token Usage"
      trailing={<RangeToggle value={range} onChange={setRange} options={['today','7d','30d']} />}
      query={q}
      empty={{ dataNoun: 'token usage data', when: (d) => d.items.length === 0 }}
    >
      {(data) => {
        const rows = groupTokensByDay(data.items) // pure helper; sums by day, segments preserved
        return (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows}>
              <XAxis dataKey="day" stroke="var(--cmc-text-subtle)" />
              <YAxis stroke="var(--cmc-text-subtle)" />
              <RechartsTooltip contentStyle={{ background: 'var(--cmc-surface-3)', border: '1px solid var(--cmc-border)' }} />
              <Bar dataKey="input"        stackId="t" fill="var(--cmc-accent-blue)" />
              <Bar dataKey="output"       stackId="t" fill="var(--cmc-accent-purple)" />
              <Bar dataKey="cache_read"   stackId="t" fill="var(--cmc-status-cyan)" />
              <Bar dataKey="cache_create" stackId="t" fill="var(--cmc-status-green)" />
            </BarChart>
          </ResponsiveContainer>
        )
      }}
    </PanelCard>
  )
}
```

The pattern is locked because:
- Every panel ends up ~30 lines + a pure `groupBy` helper. Cards stay legible.
- Loading/empty/error JSX exists in **one** place (`<PanelCard>`) — fixing a copy change touches one file.
- The `reqId` kicker preserves the PlaceholderCardGrid surface (UI-SPEC traceability) so users + future debuggers can map every visual element back to a requirement.
- `query` + `empty.when` are declarative — testable without rendering Recharts (component test mocks `useTokens` via MSW, asserts `<EmptyState>` renders when `items: []`).

### Other Phase 6 primitives Phase 5 did NOT ship (must be added)

| Primitive | Lives in | Used by |
|-----------|----------|---------|
| `<PanelCard>` | `components/ui/PanelCard.tsx` | All 21 panels |
| `<RangeToggle>` (today / 7d / 30d) | `components/ui/RangeToggle.tsx` | OPNL-05/06/07/08/09/12/13/10/11/15, ACTV-01/02/04/05 |
| `<DataTable>` (sort, paginate, filter) | `components/ui/DataTable.tsx` | OPNL-08, OPNL-12, ACTV-06 |
| `<HeatmapGrid>` (30-cell CSS grid; color-scale fn) | `components/ui/HeatmapGrid.tsx` | ACTV-01 |
| `<StatList>` (icon + label + value rows) | `components/ui/StatList.tsx` | OPNL-13 productivity, OPNL-14 pressure (recent_api_errors), KPI tile |
| `<KpiTile>` (display-size mono number + delta hint) | `components/ui/KpiTile.tsx` | OPNL-02 (4× tile in KpiRow) — STATE.md L203 already names this |
| `<ErrorState>` (in-card error JSX with retry button) | `components/ui/ErrorState.tsx` | `<PanelCard>` (when `query.isError`) |
| `useFirehose` hook | `lib/useFirehose.ts` | ACTV-03 |

Plan 06-01 (Wave 0) ships all 8 in one wave so Wave 1 panels can compose freely.

## Empty-state policy / taxonomy

UI-SPEC L137-138 locks heading + body. Phase 6 owns the **rule for when to show empty vs render-with-warning vs error**.

| State | Trigger | UI |
|-------|---------|----|
| **Skeleton (loading)** | `query.isPending` (first load) | `<DefaultSkeleton>` 4 lines (text variant) — never on refetch |
| **Empty (no data yet)** | `query.data` exists AND `empty.when?.(data) === true` (default: `data.items?.length === 0` for paginated, or `total === 0` for KPIs) | `<EmptyState heading="Nothing to show yet" body="Once {dataNoun} arrives it will appear here. Run sync from the header to refresh." icon={<Inbox/>} />` |
| **Empty (zero-aggregate)** — special case | `OPNL-09`: `total_fires === 0`; `OPNL-13`: `commits + prs + lines_added + lines_removed === 0` | Same EmptyState as above; pass `empty.when=(d) => d.total_fires === 0` etc. |
| **Low-sample warning** | Per-row or overall `low_sample === true` (OPNL-06 cache; OPNL-12 edit-decisions) | Render the data. Add `<Badge variant="warning">Low sample</Badge>` next to the value. Never replace data with EmptyState |
| **Stale-but-rendered** | `query.isStale && !query.isFetching` | Render the data normally. No affordance (UI-SPEC: no "Loading" text, and 30s staleness on a 60s refetchInterval is invisible) |
| **Error** | `query.isError` | `<ErrorState message={query.error.message}><Button onClick={() => query.refetch()}>Retry</Button></ErrorState>` — copy: "Couldn't load {dataNoun}. Refresh or check `cc doctor`." |
| **Hidden (AttentionBar only)** | `attention.items.length === 0 && stuck_sessions === 0 && stale_dispatcher_seconds === null` | Render `null` — bar disappears entirely |

**Rule for choosing between "no data yet" vs "low sample":** Low-sample never replaces visible data. If a metric has 5 calls (low sample), still show "60% accept rate" + the warning badge. EmptyState is reserved for cases where there's literally nothing to display.

## Plan breakdown (5 plans, 3 waves)

Wave structure follows Phase 5's serialization pattern (multiple writers to `styles.css` + `components/ui/index.ts` cannot run in parallel):

```
Wave 0: 06-01  (foundation — chart lib, panel primitives, queries layer, gap endpoints, useFirehose)
Wave 1: 06-02  (Command page — system + KPI + attention + live sessions)         depends_on 06-01
Wave 1: 06-03  (Command page — analytical cards OPNL-05..15)                     depends_on 06-01     [parallel with 06-02]
Wave 2: 06-04  (Activity page — heatmap + charts strip + sessions table)         depends_on 06-01
Wave 2: 06-05  (Activity page — OTEL panel SSE + UnifiedFailures + TopSkills + plan close + Phase 6 entry contract for Phase 7)  depends_on 06-01, 06-02, 06-03, 06-04
```

**Why this split (NOT a 21-card-21-plan):** infrastructure must land first; 06-02 and 06-03 both append to `components/panels/index.ts` (will need an explicit barrel) and to `routes/index.tsx` (route appends a `<KpiRow>` slot above the grid + replaces 14 placeholder cards). Serializing 06-02 → 06-03 keeps Wave 1 mergeable; running them in parallel works ONLY if they edit disjoint slots, which they do (06-02: KpiRow + OPNL-01/03/04 = top of route; 06-03: OPNL-05..15 = grid replacements). 06-04 and 06-05 are split because the Activity page's SSE panel + table are visually distinct from the heatmap + charts and split cleanly along data-source boundaries (poll vs SSE).

### Plan files (estimates)

| Plan | Title | Files touched (est) | New deps | Tests added |
|------|-------|---------------------|----------|-------------|
| **06-01** | Wave 0 — chart lib + panel primitives + queries + gap endpoints + useFirehose | `frontend/package.json` (+1 dep: recharts); `frontend/src/components/ui/{PanelCard,RangeToggle,DataTable,HeatmapGrid,StatList,KpiTile,ErrorState}.tsx` (7 new); `frontend/src/components/ui/index.ts` (append 7 exports); `frontend/src/lib/{queries.ts,useFirehose.ts,api.ts}` (queries+hook new; api.ts narrows `unknown`→typed); `frontend/src/styles.css` (append RangeToggle + DataTable + HeatmapGrid + KpiTile classes); `backend/cmc/api/routes/observability.py` (+3 endpoints: heatmap, skills/usage, sessions/failures); `backend/cmc/api/schemas/observability.py` (+3 response models); `backend/cmc/api/sse.py` (+ `Last-Event-ID` header read in `_resolve_since_id` — optional polish); `backend/tests/test_phase6_obsv_extensions.py` (new — 3 endpoints × ~3 tests each = ~9). **Estimated 18-22 files** | recharts ^3 | ~25 frontend + ~9 backend |
| **06-02** | Wave 1 — System + KPI + Attention + Live Sessions + drawer + follow-up mutation | `frontend/src/components/panels/{SystemHealthStrip,KpiRow,AttentionBar,LiveSessionsCard}.tsx` (4 new); `frontend/src/components/panels/index.ts` (new barrel); `frontend/src/routes/index.tsx` (insert KpiRow slot above PlaceholderCardGrid; replace OPNL-01/03/04 placeholders); `frontend/src/components/PlaceholderCardGrid.tsx` (delete OPNL-01/03/04 entries from index.tsx slots — file stays for OPNL-05..15); tests for each panel via MSW. **Estimated 8-10 files** | none | ~16 |
| **06-03** | Wave 1 — Analytical cards OPNL-05..15 (11 cards) | `frontend/src/components/panels/{TokenUsage,CacheEfficiency,SessionOutcomes,ToolLatency,HookActivity,ProjectBreakdown,AgentFanout,EditAcceptance,Productivity,Pressure,Mcp}Card.tsx` (11 new); `frontend/src/components/panels/index.ts` (append 11 exports); `frontend/src/routes/index.tsx` (replace OPNL-05..15 placeholders → DELETE PlaceholderCardGrid usage on `/`); per-panel tests. **Estimated 14-16 files** | none | ~30 |
| **06-04** | Wave 2 — Activity page heatmap + charts strip + sessions table | `frontend/src/components/panels/{HeatmapGrid,ChartsStrip,SessionsTable}.tsx` (3 new — note: HeatmapGrid panel wraps the `<HeatmapGrid>` ui primitive; SessionsTable wraps `<DataTable>`); `frontend/src/routes/activity.tsx` (replace ACTV-01/02/06 placeholders); per-panel tests. **Estimated 6-8 files** | none | ~12 |
| **06-05** | Wave 2 — OTEL firehose + UnifiedFailures + TopSkills + plan close (Phase 6 → Phase 7 entry contract) | `frontend/src/components/panels/{OtelPanel,UnifiedFailures,TopSkills}.tsx` (3 new); `frontend/src/routes/activity.tsx` (replace ACTV-03/04/05 placeholders → DELETE PlaceholderCardGrid usage on `/activity`); SSE integration test (vitest with `EventSource` polyfill stub or skip — CI-able strategy below); palette item additions for new pages (none new — / and /activity already in Cmd+K); 06-VERIFICATION.md draft. **Estimated 6-8 files** | none | ~14 (includes one SSE smoke test) |

**Total: ~52-64 files, ~106 tests added on top of existing 62/62.** Realistic agent-time estimate from STATE.md velocity: ~70-90 minutes per plan; ~6-8 hours total agent work for Phase 6.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Recharts React 19 peer-dep mismatch** | LOW | HIGH (blocks Wave 0) | Wave 0 includes `npm view recharts peerDependencies` verification step in 06-01-PLAN; if mismatch: `--legacy-peer-deps` + runtime smoke test, OR fall back to visx for charts (worst case, 1-day pivot) |
| **Recharts SSR/Vite quirks (`Window is not defined`, `ResponsiveContainer` resize loop)** | MEDIUM | MEDIUM | Recharts 3 ships ESM; `<ResponsiveContainer>` is the documented escape hatch for resize observers in Vite. Test on `npm run build` + `npm run preview` in Wave 0 |
| **EventSource reconnect storm** | MEDIUM | MEDIUM | 60-min server-side cap means an idle reconnect every hour is normal. Mitigation: use `Last-Event-ID` resume (server tweak in 06-01) so reconnects don't replay. Add a `status='closed'` UI affordance ("Reconnecting…") |
| **Sessions table N+1 on filter change** | MEDIUM | LOW | Use `keepPreviousData: true` (TanStack Query option — keep old page visible while new one fetches; renamed `placeholderData: keepPreviousData` in v5). Backend already paginates — no N+1 there |
| **Chart accessibility** | MEDIUM | MEDIUM | Recharts ships `aria-label` on `<XAxis>`/`<YAxis>` but not the bars themselves. Phase 6 wraps each chart in a `<figure aria-label="...">` with a screen-reader-only data table fallback (the same `groupBy` rows rendered as `<table>` with `.cmc-sr-only`). UI-SPEC accessibility requirements are met |
| **Timezone drift on daily buckets** | LOW (already mitigated) | HIGH | Backend uses `STRFTIME(..., 'localtime')` consistently (`observability.py` L82, L110, L156, L183). Phase 6 displays the `day` string verbatim; never re-bucket client-side. The `tzname` from OPNL-01 should be visible somewhere on the Command page (recommend: as a footnote on TokenUsageCard) so users see "your dashboard is bucketing in PDT" |
| **Project breakdown regex** | LOW | LOW | Backend already strips `/Users/<user>/` → `~/` and exposes `display_path`. Frontend uses `display_path` directly — STATE.md confirms this is the contract. Risk = a future refactor accidentally re-implements the regex client-side. Mitigation: 06-03 plan calls this out explicitly |
| **Large dataset rendering — ACTV-06 SessionsTable** | MEDIUM | MEDIUM | Default page size 50; max 200. Use `<DataTable>` primitive with windowed rendering ONLY if user complains — start with naive `.map`. (Single-user dashboard; 200 rows is trivial for React.) |
| **MSW + happy-dom interaction** | MEDIUM | MEDIUM | `msw` is not yet installed. Phase 6 needs request mocking for component tests of cards that fetch. Either: (a) install `msw@^2`, (b) mock at the `useQuery` layer via `QueryClient.setQueryData` in test setup. **Recommend (b)** for v1 — sidesteps MSW + happy-dom + Service Worker integration risk; faster to write |
| **AttentionBar showing zero items but rendering empty space** | LOW | LOW | Locked rule: render `null` (not `<EmptyState>`) when no items. Special case in PanelCard via `empty.when=(d)=>shouldHide(d)` + a `hiddenWhenEmpty?: boolean` prop |
| **Phase 4 deferred fields appearing as `0` confuse users** | LOW | LOW | `pending_decisions: 0` and `failed_tasks: 0` are stable contract — Phase 6 displays them but Phase 7 will populate. UI for AttentionBar shows only `items[]` + `stuck_sessions` + dispatcher staleness in v1; the deferred fields are reserved for Phase 7 expansion. Document in 06-02 plan |
| **Range toggle + URL state drift** | LOW | LOW | Phase 6 keeps range in `useState` (per-card local) initially; persist to `cmc.filter.{cardId}.range` via `lib/storage` if user complains. Defer URL state to v2 |
| **`api.ts` `systemState` path bug** | NOW | LOW (no consumer in Phase 6 binds to it) | Fix in 06-01 alongside the type-tightening pass |
| **Recharts bundle bloat** | LOW | LOW | Use named imports (`import { BarChart } from 'recharts'` is tree-shakable in Vite). Verify `npm run build` chunks in 06-01 — if `vendor.js` jumps >40 kB above pre-Phase-6 baseline, switch to per-chart entry points (`recharts/es6/chart/BarChart`). Acceptable for localhost dashboard either way |
| **Two thin gap endpoints (heatmap, top-skills, failures) creep in scope** | MEDIUM | MEDIUM | Bound them: read-only, no joins beyond what OBSV-* already does, total <100 LOC. If TopSkills proves to need a Phase 2 ingest change (skill_id on session), **scope ACTV-04 to v2** and ship a "Top Skills (coming soon)" empty card. 06-01 plan must reach a decision before opening Wave 1 |

## What Phase 5 leaves us (capability inventory)

### Usable as-is (Phase 6 imports from `frontend/src/components/ui` barrel):
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` — every panel composes these inside `<PanelCard>`
- `Button` (primary/secondary/ghost; sm/md) — drawer "Send" button, Sessions table pagination, Retry on error
- `Badge` (neutral/info/success/warning/danger) — low-sample, slow-tag, fast-tag, pending-decisions count
- `StatePill` (ok/running/pending/stale/error) — SystemHealthStrip pills, LiveSessionsCard row state
- `Tooltip` — RelativeTime hover, hover-on-bar tooltips wrap charts (NOT Recharts' built-in)
- `Skeleton` — `<PanelCard>` default loading
- `EmptyState` — `<PanelCard>` empty branch
- `RelativeTime` (+ `formatRelative`) — every "started 3m ago" timestamp; LiveSessionsCard, AgentFanout, UnifiedFailures, OtelPanel
- `ShellErrorBoundary` — already wraps the whole shell
- **`Sheet`** — LiveSessionsCard drawer. Already supports right-side, focus trap, Esc, aria-modal — exactly what OPNL-04 needs
- `CollapsibleSection` — MCP server expand-to-tools, possibly Pressure Panel "recent errors" expand
- `CommandPalette` — already mounted; no Phase 6 changes (Phase 7 wires Quick task)

### Need extending in Phase 6 (existing primitive + new sibling):
- `Skeleton` already supports text/rect/circle variants — Phase 6 may want a `<Skeleton variant="bar" />` for chart placeholders (a 3-bar SVG mock). Add inline if needed.

### Brand-new in Phase 6 (Plan 06-01):
- `<PanelCard>` shell wrapper (loading/empty/error in one place)
- `<RangeToggle>` (today/7d/30d segmented control)
- `<DataTable>` (sort, paginate, filter — ACTV-06 sessions, OPNL-08 latency, OPNL-12 edits)
- `<HeatmapGrid>` (30-cell CSS grid; color-scale fn)
- `<StatList>` (icon + label + value rows)
- `<KpiTile>` (display-size mono number + delta hint; 4× in KpiRow)
- `<ErrorState>` (in-card error with retry)
- `useFirehose` (SSE hook)
- `lib/queries.ts` (TanStack Query keys + hooks)
- Tighter types in `lib/api.ts` (replace `unknown` with imported response shapes)

### Things STATE.md says Phase 5 explicitly defers to Phase 6:
- Replace each `<Card>` placeholder by `reqId` (PlaceholderCardGrid surface)
- KpiRow slot ABOVE the grid on `/` (STATE.md L203)
- Real loading state on cards (Phase 5 placeholder always renders EmptyState)

## Test strategy

Phase 5 ships 62 frontend tests, all unit/component-level using RTL + happy-dom. Phase 6 follows the same pattern with three additions:

### Test granularity per panel

| Test type | Coverage | Tooling |
|-----------|----------|---------|
| **Unit — pure helpers** | `groupTokensByDay`, `computeStatePillFromHealth(daemonAges)`, `colorForCacheRate`, etc. — every `*.utils.ts` next to a panel file | Vitest 4 + plain TS — no DOM |
| **Component — PanelCard branches** | One test per branch: skeleton, empty (default + custom `empty.when`), error+retry, render-with-data | RTL 16 + happy-dom; mock `query` prop literally (no MSW; `queryClient.setQueryData` in test setup) |
| **Component — each card renders correct data shape** | One test per panel: assert title + assert data-binding via a fixture response | RTL 16 + `queryClient.setQueryData(qk.tokens('7d'), fixture)` then render — no fetch is performed |
| **Component — chart smoke** | For each chart card: render with fixture, assert SVG is in DOM (`container.querySelector('svg')` non-null), assert `<XAxis>` tick labels include the expected day strings. Do NOT assert pixel positions | RTL 16; Recharts renders to SVG in happy-dom — verify in 06-01 spike |
| **Hook — useFirehose** | Mock `EventSource` global; emit synthetic `MessageEvent` for `otel`; assert `events` state grows; assert ring-buffer caps at `bufferSize` | Vitest 4 — `Object.defineProperty(globalThis, 'EventSource', ...)` |
| **Mutation — useFollowUpMessage** | Mock `fetch`; submit; assert `queryClient.invalidateQueries` called with correct key | RTL + Vitest mock |
| **Integration — route smoke** | Boot `/` and `/activity` via real `RouterProvider` + `createMemoryHistory` (Phase 5 pattern at `src/__tests__/integration.test.tsx`); preload TanStack Query cache with fixtures; assert each card heading appears, no PlaceholderCardGrid kickers remain | Same harness as Phase 5 integration test (5 cases → grow to ~15) |

### MSW vs `setQueryData` decision

**Recommendation: `setQueryData` for panel tests, native `fetch` mock + `EventSource` mock for the two hook tests.** No MSW dependency.

Rationale: MSW + happy-dom + Service Worker registration adds setup risk that's not buying us much for component tests. We're not testing the network layer — we're testing rendering behavior given query state. `queryClient.setQueryData(key, fixture)` directly seeds the state machine and is the canonical TanStack Query test pattern.

### Must-pass set for Phase 6 close

- All Phase 5 tests still pass (62/62 → ~168/168 with Phase 6 additions)
- `npm run typecheck` exits 0 with no new strict errors
- `npm run build` produces a valid `dist/` (chunk sizes recorded in 06-VERIFICATION)
- Backend tests still pass (currently ~193/193 from STATE.md L173); Plan 06-01's 9 new tests pass
- A manual visual checkpoint at end of 06-05: replicate Phase 5's "approved by user" pattern — page loads with real data (not just placeholders); skeletons → real cards transition is visible; AttentionBar shows zero state correctly; LiveSessionsCard drawer opens

### What we are NOT testing in Phase 6

- Real HTTP integration end-to-end (Phase 9 / TEST-01..04 ships Playwright)
- Visual regression / screenshot diff (out of scope; user-approved visual quality bar covers it)
- Performance — no LCP/CLS budgets in v1; localhost-only

## Things the planner should know that aren't obvious

1. **Phase 5's PlaceholderCardGrid is meant to be deleted.** STATE.md L198 explicitly says "helper deletes when last placeholder is replaced." Plan 06-03 finishes off `/` (deletes `<PlaceholderCardGrid>` from `routes/index.tsx`); Plan 06-05 finishes off `/activity`. The component file itself stays alive until Phase 7 retires it from `/skills`.

2. **OPNL-04's Sheet drawer is already a Phase-5 primitive** (FESH-04). Phase 6 does NOT build a new drawer — it composes `<Sheet open={...} onOpenChange={...}>` and inside renders the tool timeline + a follow-up form bound to `useFollowUpMessage()`.

3. **The OPNL-15 MCP panel is a SUBSET of Phase 7's SKLP-01.** Phase 6 ships the Command-page MCP panel. Phase 7 reuses the same component on `/skills` (or extends it). The panel file should live at `components/panels/McpPanel.tsx` (Phase 6 imports), and Phase 7 imports the same file. Plan 06-03 must not put MCP-specific code in `routes/index.tsx` — keep it portable.

4. **`/api/sessions/live` returns a bare `list`, not a `{ items: ... }` envelope** — see `sessions.py` L135-169 `response_model=list[LiveSessionItem]`. Every other Phase 3 endpoint returns `{ items: [...], range, ... }`. Don't write a generic `Envelope<T>` type in queries.ts that assumes the wrapper.

5. **Backend already supplies `display_path` (home-dir stripped) on OPNL-10.** Don't re-implement the regex client-side — STATE.md L201 makes this a regression risk worth calling out in plan 06-03.

6. **AttentionBar must HIDE not collapse** when no items — `<PanelCard hiddenWhenEmpty>` is the cleanest API; alternative is for the AttentionBar component to short-circuit `return null` outside the wrapper. Either works; document the chosen pattern in 06-02.

7. **Phase 4 deferred fields (`pending_decisions`, `failed_tasks`) are stable zero today.** AttentionBar v1 ignores them; Phase 7 fills them in. STATE.md L145 confirms the schema-stable contract.

8. **`/api/firehose` server caps at 60 minutes** by design (Pitfall 1 from Phase 3). The OtelPanel SSE hook MUST handle reconnect — `EventSource` does this natively but our backend's `_resolve_since_id` doesn't yet honor `Last-Event-ID`. Recommendation: tweak `_resolve_since_id` in 06-01 to read the `Last-Event-ID` header as fallback when `?since=` is absent. Tiny change; future-proofs.

9. **Search on SessionsTable is client-side** — there's no `q=` query param on `/api/sessions`. Search filters the in-memory page (50-200 rows). If the search box should search across pages, that's a v2 backend feature — recommend NOT taking it on in Phase 6.

10. **The `range="all"` literal exists ONLY for OPNL-10 by-project.** Every other range-aware endpoint accepts only `today/7d/30d`. The `<RangeToggle>` primitive's `options` prop should be configurable per-card to avoid surfacing `all` where the backend rejects it.

11. **`tokens?range=14d` doesn't exist.** ACTV-02 needs 14 days but backend `_RANGE_TO_SINCE` is a closed Literal. Recommend overfetching `range=30d` and slicing the last 14 days client-side. (Alternative: extend the Literal — but that cascades through Pydantic + 4 tests + 1 SUMMARY artifact. Not worth it.)

12. **Three small backend additions live in this phase, not in a Phase 3 retroactive patch.** ACTV-01 heatmap, ACTV-04 top-skills, ACTV-05 failures all need new GET routes. Plan 06-01 owns them. Cleaner than splitting backend work across phases.

13. **Recharts SVG fills via CSS variables work in modern browsers** but only when the prop is `fill="var(--cmc-...)"`. Recharts forwards the prop to SVG attributes; `fill` accepts CSS var. Verify in 06-01 with one stacked bar; the cheap fallback is `style={{ fill: 'var(--cmc-...)' }}` on the `<Bar>` element.

14. **No CONTEXT.md was authored for Phase 6**, but 6 + 7 are the most user-facing phases of the project. The user-approved Phase 5 visual quality bar (2026-04-27) is the implicit contract — Phase 6 panels must look like the Phase 5 placeholder grid PLUS Linear/Raycast/Vercel-grade data presentation. Recharts' default styling is bland; every chart MUST be styled with the locked color tokens before close.

15. **Phase 6 + Phase 7 can technically run in parallel** per ROADMAP.md L184. They don't conflict on `__init__.py` (Phase 7 adds new routers to the same place but Phase 6 doesn't add Python routers; only Plan 06-01's three thin endpoints touch `observability.py`). The recommended ordering is still 6 → 7 because Phase 6's `<PanelCard>` + `<DataTable>` + `<KpiTile>` primitives are reusable in Phase 7 (TaskBoard cards, DecisionsCard, etc.). Phase 7 should depend_on Phase 6 in the resulting plan files.

## RESEARCH COMPLETE

Phase 6 is a frontend-dominant phase: 18 of 21 cards bind to existing read-only Phase-3 endpoints (every endpoint VERIFIED against `backend/cmc/api/routes/*.py`). Three small gaps require new thin GET routes (ACTV-01 heatmap, ACTV-04 top-skills, ACTV-05 failures); these belong inside Plan 06-01 alongside the chart-library install (Recharts 3.x — project default; alternatives Tremor/Visx/Nivo/Chart.js/ECharts considered and rejected for Tailwind-lock / scope / theming-fit). Charts use Recharts SVG with `var(--cmc-*)` token fills; HeatmapGrid is hand-rolled CSS grid (no library); SSE uses a bespoke ~50-line `useFirehose` hook around native `EventSource` (no library; reusable for SESS-05). Polling cadence is tabled by data class (5s live, 15s KPIs, 60s daily aggregates, 120s slow rollups) and lives in a new `lib/queries.ts` keys+hooks layer. Every panel composes a new `<PanelCard>` shell that owns the loading/empty/error JSX uniformly. Five plans across three waves: **06-01** (Wave 0 foundation: chart lib + 7 new ui primitives + queries + useFirehose + 3 backend endpoints), **06-02** (Wave 1 Command top: KpiRow + SystemHealthStrip + AttentionBar + LiveSessionsCard with drawer + follow-up mutation), **06-03** (Wave 1 Command grid: 11 analytical cards OPNL-05..15; runs parallel with 06-02 — disjoint slots), **06-04** (Wave 2 Activity: HeatmapGrid + ChartsStrip + SessionsTable), **06-05** (Wave 2 Activity: OtelPanel SSE + UnifiedFailures + TopSkills + plan close + entry contract for Phase 7). Estimated 52-64 files touched, ~106 new tests on top of 62/62 Phase-5 baseline. Risk register flags Recharts React-19 peer-dep verification, EventSource reconnect storm, MSW deferral (use `setQueryData` instead), and the ACTV-04 skill_id question that may force a v2 punt.
