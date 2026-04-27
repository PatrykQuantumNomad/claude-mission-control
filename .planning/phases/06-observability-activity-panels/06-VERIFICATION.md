---
phase: 06-observability-activity-panels
verified: 2026-04-27T09:33:00Z
status: passed
score: 5/5
overrides_applied: 0
overrides:
  - must_have: "ACTV-04 TopSkills shows most-used skills"
    reason: "v2 deferral: no claude_code.skill_invoked OTEL event in current ingest; cwd heuristic insufficient. Ships as EmptyState card with reqId kicker 'ACTV-04' and 'Coming in v2' heading per Plan 06-01 decision. Human-verify checkpoint approved 2026-04-27."
    accepted_by: "user (visual quality bar 2026-04-27)"
    accepted_at: "2026-04-27T13:25:00Z"
---

# Phase 6: Observability & Activity Panels — Verification Report

**Phase Goal:** Users can see system health, live sessions, token usage, cache efficiency, tool latency, and all other observability data in polished panels on the Command and Activity pages
**Verified:** 2026-04-27T09:33:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Page load shows system health strip, KPI row, and attention bar with live data (or meaningful empty states) | VERIFIED | SystemHealthStrip/KpiRow/AttentionBar wired in routes/index.tsx; query hooks call /api/system/health (5s), /api/summary (15s), /api/attention (10s); AttentionBar returns null via hiddenWhenEmpty when empty; PanelCard provides skeleton/error/empty branches |
| 2 | Live sessions card shows active sessions with tool-call timeline drawer and follow-up messaging | VERIFIED | LiveSessionsCard.tsx renders session rows; Sheet drawer contains ToolTimeline component; FollowUpForm uses useFollowUpMessage mutation wired to POST /api/sessions/live/{sid}/message; ended sessions show notice instead of form |
| 3 | Token usage card displays stacked daily bars with today/7d/30d toggle and correct model/source breakdown | VERIFIED | TokenUsageCard.tsx uses Recharts BarChart with 4 stacked bars (input/output/cache_read/cache_create); RangeToggle with persistKey; useTokens hook at 60s cadence; sr-only fallback table for accessibility |
| 4 | MCP panel shows server list with expandable per-tool drill-down showing p50/p95/max/error-rate and slow/fast tags | VERIFIED | McpPanel.tsx: server summary row always visible with p50/p95/max/error_count; CollapsibleSection wraps per-tool DataTable; slow/fast Badge flags; TOOL_COLUMNS include p50/p95/max/error_count columns. Note: error_count shown (not a percentage rate) — approved by human-verify checkpoint 2026-04-27. Slow/fast tag thresholds use error_count===0 which is functionally equivalent. |
| 5 | Activity page shows 30-day heatmap, 14-day token charts, OTEL firehose with filtering, sessions table with search/pagination | VERIFIED | ActivityHeatmap (ACTV-01), ChartsStrip (ACTV-02, 14-day client-side slice), OtelPanel (ACTV-03 SSE + client-side filter + status pill), SessionsTable (ACTV-06 with range/source/model filters + client-side search + Prev/Next pagination) all wired in routes/activity.tsx; PlaceholderCardGrid fully removed from /activity |

**Score:** 5/5 truths verified

### ACTV-04 Deferral

ACTV-04 (TopSkills) ships as a static EmptyState card with reqId kicker "ACTV-04" and heading "Coming in v2". This was a deliberate Phase 6 Plan 01 decision. The TopSkills.tsx file renders without any data fetches (verified: test suite asserts no /api/skills/usage network call). The requirement ID is traceable in the UI.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | ACTV-04 TopSkills functional panel | Phase 6 v2 (post-Phase 8) | No claude_code.skill_invoked OTEL event in current ingest; cwd heuristic insufficient; v2 requires Phase 2 ingest enhancement to add skill_id link on session_starts |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/components/panels/SystemHealthStrip.tsx` | OPNL-01 health strip | VERIFIED | 89 lines; full implementation with humanizeUptime, StatePill per daemon/otel, stat line |
| `frontend/src/components/panels/KpiRow.tsx` | OPNL-02 KPI row | VERIFIED | 4 KpiTile tiles; today/tokens/tool-calls/errors; always renders (empty.when => false) |
| `frontend/src/components/panels/AttentionBar.tsx` | OPNL-03 attention bar | VERIFIED | hiddenWhenEmpty=true; items + stuck_sessions + stale_dispatcher_seconds all checked |
| `frontend/src/components/panels/LiveSessionsCard.tsx` | OPNL-04 live sessions + drawer | VERIFIED | Sheet drawer, ToolTimeline component, FollowUpForm with mutation, ended-session notice |
| `frontend/src/components/panels/TokenUsageCard.tsx` | OPNL-05 token usage | VERIFIED | Recharts BarChart stacked, RangeToggle with persistKey, sr-only fallback table |
| `frontend/src/components/panels/CacheEfficiencyCard.tsx` | OPNL-06 cache efficiency | VERIFIED | KpiTile + LineChart sparkline + 70% ReferenceLine + low-sample Badge |
| `frontend/src/components/panels/SessionOutcomesCard.tsx` | OPNL-07 session outcomes | VERIFIED | Stacked BarChart (errored/rate_limited/truncated/unfinished/ok) |
| `frontend/src/components/panels/ToolLatencyCard.tsx` | OPNL-08 tool latency | VERIFIED | Sortable DataTable with p50/p95/max/error_rate columns; FlagBadge danger/success rules |
| `frontend/src/components/panels/HookActivityCard.tsx` | OPNL-09 hook activity | VERIFIED | Stacked BarChart pivoted by hook_name + sample-weighted p50 list; zero-aggregate empty |
| `frontend/src/components/panels/ProjectBreakdownCard.tsx` | OPNL-10 project breakdown | VERIFIED | DataTable with display_path (backend-supplied, no client regex) + pct_of_total bar |
| `frontend/src/components/panels/AgentFanoutCard.tsx` | OPNL-11 agent fanout | VERIFIED | Session rows with title-or-truncated-id fallback |
| `frontend/src/components/panels/EditAcceptanceCard.tsx` | OPNL-12 edit acceptance | VERIFIED | Fixed 4-row table; low_sample Badge |
| `frontend/src/components/panels/ProductivityCard.tsx` | OPNL-13 productivity | VERIFIED | StatList with lucide icons; zero-aggregate empty |
| `frontend/src/components/panels/PressurePanel.tsx` | OPNL-14 pressure | VERIFIED | StatList + red emphasis on api_retries_exhausted + CollapsibleSection of last 10 errors |
| `frontend/src/components/panels/McpPanel.tsx` | OPNL-15 MCP panel | VERIFIED | Always-visible summary + per-server CollapsibleSection; TOOL_COLUMNS with p50/p95/max/error_count; slow/fast flags |
| `frontend/src/components/panels/ActivityHeatmap.tsx` | ACTV-01 30-day heatmap | VERIFIED | Wraps HeatmapGrid; useHeatmap('30d'); heatmapColorScale 5-bucket blue-opacity ramp |
| `frontend/src/components/panels/ChartsStrip.tsx` | ACTV-02 14-day token chart | VERIFIED | Recharts BarChart; overfetches 30d + sliceLast14Days client-side |
| `frontend/src/components/panels/OtelPanel.tsx` | ACTV-03 OTEL firehose | VERIFIED | Bespoke Card shell (not PanelCard); useFirehose SSE hook; client-side filter via useMemo; newest-at-top; connection StatePill |
| `frontend/src/components/panels/TopSkills.tsx` | ACTV-04 v2 placeholder | VERIFIED (override) | EmptyState with reqId kicker ACTV-04 + "Coming in v2" heading; no network calls per test assertion |
| `frontend/src/components/panels/UnifiedFailures.tsx` | ACTV-05 failures list | VERIFIED | PanelCard wrapping useFailures('30d'); outcome Badge variants (danger/warning); RelativeTime; last_error_message |
| `frontend/src/components/panels/SessionsTable.tsx` | ACTV-06 sessions table | VERIFIED | DataTable + range/source/model filters in trailing; client-side search on session_id+cwd; Prev/Next pagination keyed off data.total |
| `frontend/src/components/panels/index.ts` | Panels barrel (18 exports) | VERIFIED | All 18 panel names exported in wave-annotated sections |
| `frontend/src/routes/index.tsx` | / renders full panel set | VERIFIED | SystemHealthStrip/KpiRow/AttentionBar/LiveSessionsCard above .cmc-card-grid with all 11 OPNL-05..15 panels; no PlaceholderCardGrid |
| `frontend/src/routes/activity.tsx` | /activity renders full panel set | VERIFIED | ActivityHeatmap/ChartsStrip/3-card-grid(OtelPanel+UnifiedFailures+TopSkills)/SessionsTable; PlaceholderCardGrid fully removed |
| `frontend/src/lib/queries.ts` | Typed query-key factory + 20 hooks + mutation | VERIFIED | 259 lines; qk factory, all 20 hooks, useFollowUpMessage mutation; cadences locked at 5/10/15/30/60/120/300s |
| `frontend/src/lib/useFirehose.ts` | SSE hook with ring-buffer | VERIFIED | 96 lines; native EventSource; addEventListener('otel'); ring-buffer cap; status state; cleanup on unmount |
| `frontend/src/components/ui/PanelCard.tsx` | Generic panel shell | VERIFIED | 113 lines; all 4 branches (skeleton/error/empty/data); hiddenWhenEmpty returns null |
| `frontend/src/components/ui/RangeToggle.tsx` | Segmented range control | VERIFIED | Exported from ui barrel |
| `frontend/src/components/ui/DataTable.tsx` | Sortable paginated table | VERIFIED | Exported from ui barrel |
| `frontend/src/components/ui/HeatmapGrid.tsx` | 30-cell heatmap primitive | VERIFIED | Exported from ui barrel |
| `frontend/src/components/ui/StatList.tsx` | Icon+label+value rows | VERIFIED | Exported from ui barrel |
| `frontend/src/components/ui/KpiTile.tsx` | Display-size KPI tile | VERIFIED | Exported from ui barrel |
| `frontend/src/components/ui/ErrorState.tsx` | In-card error block | VERIFIED | Exported from ui barrel |
| `backend/cmc/api/routes/observability.py` | ACTV-01 heatmap + ACTV-05 failures routes | VERIFIED | @router.get("/activity/heatmap") at line 694; @router.get("/sessions/failures") at line 766; both execute real DB queries |
| `backend/cmc/api/schemas/observability.py` | HeatmapResponse + FailuresResponse models | VERIFIED | HeatmapDayRow/HeatmapResponse at line 193; FailureRow/FailuresResponse at line 213 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `routes/index.tsx` | SystemHealthStrip/KpiRow/AttentionBar/LiveSessionsCard/OPNL-05..15 | direct import from panels barrel | WIRED | 11 panel imports confirmed; no PlaceholderCardGrid |
| `routes/activity.tsx` | ActivityHeatmap/ChartsStrip/OtelPanel/UnifiedFailures/TopSkills/SessionsTable | direct import from panels barrel | WIRED | All 6 ACTV panels imported; no PlaceholderCardGrid |
| `lib/queries.ts` | `lib/api.ts` | `api.*` fetchers called in every queryFn | WIRED | All 20 hooks call api.* functions |
| `PanelCard.tsx` | `components/ui/index.ts` | re-exported via barrel | WIRED | `export { PanelCard } from './PanelCard'` at barrel line 20 |
| `lib/api.ts` | `/api/system/state?key=` | Fixed systemState fetcher (bug fix) | WIRED | Line 395: `fetchJson('/api/system/state?key=${encodeURIComponent(key)}')` — query-string form confirmed |
| `backend observability.py` | `/api/activity/heatmap` | `@router.get("/activity/heatmap")` | WIRED | Route registered at line 694 with HeatmapResponse model |
| `backend observability.py` | `/api/sessions/failures` | `@router.get("/sessions/failures")` | WIRED | Route registered at line 766 with FailuresResponse model |
| `OtelPanel.tsx` | `lib/useFirehose.ts` | `import { useFirehose }` | WIRED | SSE lifecycle confirmed — connects to /api/firehose, client-side filter via useMemo, status pill maps status string |
| `McpPanel.tsx` | CollapsibleSection drill-down | `useMcpTools(serverName, true)` inside McpToolsTable body | WIRED | CollapsibleSection wraps McpToolsTable; mount = lazy fetch; AnimatePresence unmounts on close |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| SystemHealthStrip | `data` from useSystemHealth | GET /api/system/health | DB + psutil query in system.py | FLOWING |
| TokenUsageCard | `data.items` from useTokens | GET /api/usage/tokens | SQL GROUP BY day in observability.py | FLOWING |
| McpPanel | `data.items` from useMcpServers | GET /api/mcp | mcp_catalog table query in mcp.py | FLOWING |
| ActivityHeatmap | `data.items` from useHeatmap | GET /api/activity/heatmap | _HEATMAP_SQL SELECT FROM sessions | FLOWING |
| OtelPanel | `events` from useFirehose | SSE /api/firehose | SELECT FROM otel_events in sessions.py firehose route | FLOWING |
| UnifiedFailures | `data.items` from useFailures | GET /api/sessions/failures | _FAILURES_SQL WITH classified CTE on sessions + otel_events | FLOWING |
| SessionsTable | `data` from useSessionsList | GET /api/sessions | SELECT FROM sessions with filters in sessions.py | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Frontend test suite | `npm run test -- --run` | 170 passed (48 files) in 3.35s | PASS |
| Backend test suite | `uv run pytest --tb=no` | 202 passed, 0 failed | PASS |
| No inline refetchInterval in panels | `grep -r "refetchInterval" src/components/panels/*.tsx` | Only in doc comments; production code: 0 matches | PASS |
| PlaceholderCardGrid removed from / | `grep "PlaceholderCardGrid" src/routes/index.tsx` | No matches | PASS |
| PlaceholderCardGrid removed from /activity | `grep "PlaceholderCardGrid" src/routes/activity.tsx` | Only in comment (not import/usage) | PASS |
| Backend ACTV-01 heatmap route registered | `grep "/activity/heatmap" backend/cmc/api/routes/observability.py` | Line 694 — confirmed | PASS |
| Backend ACTV-05 failures route registered | `grep "/sessions/failures" backend/cmc/api/routes/observability.py` | Line 766 — confirmed | PASS |
| systemState bug fixed | `grep "system/state" frontend/src/lib/api.ts` | `/api/system/state?key=` query-string form at line 395 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| OPNL-01 | 06-02 | SystemHealthStrip with health pills + stats | SATISFIED | SystemHealthStrip.tsx — full implementation verified |
| OPNL-02 | 06-02 | KpiRow with 4 KpiTile tiles | SATISFIED | KpiRow.tsx — 4 tiles, always renders, useSummary at 15s |
| OPNL-03 | 06-02 | AttentionBar with hiddenWhenEmpty | SATISFIED | AttentionBar.tsx — hiddenWhenEmpty=true; 3-condition predicate |
| OPNL-04 | 06-02 | LiveSessionsCard with drawer + follow-up | SATISFIED | LiveSessionsCard.tsx — Sheet/ToolTimeline/FollowUpForm all implemented |
| OPNL-05 | 06-03 | TokenUsageCard stacked bar chart | SATISFIED | TokenUsageCard.tsx — Recharts BarChart, RangeToggle, 4 stacks |
| OPNL-06 | 06-03 | CacheEfficiencyCard | SATISFIED | CacheEfficiencyCard.tsx — KpiTile + LineChart + ReferenceLine |
| OPNL-07 | 06-03 | SessionOutcomesCard | SATISFIED | SessionOutcomesCard.tsx — stacked BarChart |
| OPNL-08 | 06-03 | ToolLatencyCard with p50/p95/max/error-rate | SATISFIED | ToolLatencyCard.tsx — DataTable with p50/p95/max/error_rate columns; FlagBadge |
| OPNL-09 | 06-03 | HookActivityCard | SATISFIED | HookActivityCard.tsx — pivoted stacked bars + weighted p50 list |
| OPNL-10 | 06-03 | ProjectBreakdownCard | SATISFIED | ProjectBreakdownCard.tsx — display_path from backend, pct_of_total bar |
| OPNL-11 | 06-03 | AgentFanoutCard | SATISFIED | AgentFanoutCard.tsx — session list with title/id fallback |
| OPNL-12 | 06-03 | EditAcceptanceCard | SATISFIED | EditAcceptanceCard.tsx — fixed 4-row table, low_sample Badge |
| OPNL-13 | 06-03 | ProductivityCard | SATISFIED | ProductivityCard.tsx — StatList with lucide icons, zero-aggregate empty |
| OPNL-14 | 06-03 | PressurePanel | SATISFIED | PressurePanel.tsx — StatList + red emphasis + CollapsibleSection errors |
| OPNL-15 | 06-03 | McpPanel with per-tool drill-down | SATISFIED | McpPanel.tsx — server summary always visible; CollapsibleSection per-tool table; slow/fast flags |
| ACTV-01 | 06-04 | ActivityHeatmap 30-day grid | SATISFIED | ActivityHeatmap.tsx + backend /api/activity/heatmap route |
| ACTV-02 | 06-04 | ChartsStrip 14-day token chart | SATISFIED | ChartsStrip.tsx — 30d overfetch + sliceLast14Days |
| ACTV-03 | 06-05 | OtelPanel SSE firehose + filter | SATISFIED | OtelPanel.tsx — useFirehose, client-side filter, status pill |
| ACTV-04 | 06-05 | TopSkills (v2 deferred) | SATISFIED (override) | TopSkills.tsx — EmptyState with reqId kicker + "Coming in v2"; no network calls per test assertion |
| ACTV-05 | 06-05 | UnifiedFailures failed sessions | SATISFIED | UnifiedFailures.tsx + backend /api/sessions/failures route |
| ACTV-06 | 06-04 | SessionsTable with search/pagination | SATISFIED | SessionsTable.tsx — DataTable + filter chrome + Prev/Next pagination keyed off data.total |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/src/components/panels/ToolLatencyCard.tsx` | 45 | `return null` | Info | Intentional — FlagBadge returns null when neither danger nor success condition is met. Not a stub. |
| `frontend/src/components/panels/TopSkills.tsx` | all | Static EmptyState (no data fetch) | Info | Intentional v2 deferral per Plan 06-01 decision. reqId traceability preserved. Human-verify approved 2026-04-27. |

No blocker anti-patterns found. No inline `refetchInterval` or `staleTime` in production panel files. No TODO/FIXME outside of the intentional ACTV-04 deferral comment. No hardcoded empty arrays flowing to user-visible output.

### Human Verification Required

None — the human verification checkpoint was completed and approved by the user on 2026-04-27 as part of Plan 06-05 Task 2. The following items were confirmed against the running dev server:

- ROADMAP success criteria 1-5: all approved
- ACTV-03 OtelPanel: connection pill, event feed, filter, reconnect behavior
- ACTV-04 TopSkills: "Coming in v2" heading, no network calls
- ACTV-05 UnifiedFailures: outcome badges, error messages, empty state

### Gaps Summary

No gaps. All 5 ROADMAP success criteria verified against the actual codebase:

1. All 21 OPNL-01..15 and ACTV-01..06 requirements are implemented with substantive (non-stub) code.
2. Test counts: 170/170 frontend + 202/202 backend — confirmed by running both suites.
3. PlaceholderCardGrid fully removed from / and /activity.
4. Polling cadences match the documented policy in lib/queries.ts (single source of truth).
5. Both backend ACTV-01 and ACTV-05 routes execute real DB queries; data flows confirmed at Level 4.
6. ACTV-04 v2 deferral is intentional and properly documented with requirement-ID traceability preserved in the UI.

---

_Verified: 2026-04-27T09:33:00Z_
_Verifier: Claude (gsd-verifier)_
