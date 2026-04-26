---
phase: 03-read-only-apis
verified: 2026-04-26T14:30:00Z
status: passed
score: 5/5
overrides_applied: 0
---

# Phase 3: Read-Only APIs — Verification Report

**Phase Goal:** All observability and analytics data is accessible via well-structured JSON API endpoints
**Verified:** 2026-04-26T14:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/health returns 200 and GET /api/system/health returns uptime, memory, and daemon ages | VERIFIED | `health.py` returns `{"status":"ok"}`; `system.py:108` implements `/system/health` returning `SystemHealthResponse` with `uptime_seconds`, `memory_rss_mb`, `daemon_ages[3]`, `tzname`; boot_time set in `lifespan.py:49`; `test_sapi02_system_health_happy_empty_otel` and `test_sapi02_system_health_with_otel_events` both pass |
| 2 | GET /api/sessions returns paginated results with working range/source/model filters | VERIFIED | `sessions.py:55` implements `/sessions` with `range_` (today/7d/30d/all), `source`, `model`, `limit`/`offset`; returns `SessionListResponse` with `items`, `total`, `limit`, `offset`; `test_sess01_list_pagination_and_filters` passes |
| 3 | GET /api/usage/tokens returns daily token breakdown by model with today/7d/30d range support | VERIFIED | `observability.py:88` implements `/usage/tokens` with `Literal["today","7d","30d"]` range; SQL groups by `day, model, source`; returns `TokenUsageResponse`; `test_obsv_01_usage_tokens_range_filter` passes |
| 4 | GET /api/mcp returns server list with latency stats and GET /api/mcp/{server}/tools returns per-tool breakdown | VERIFIED | `mcp.py:44` implements `/mcp` returning `McpServerListResponse` with `latency_p50_ms`, `latency_p95_ms`, `latency_max_ms` fields; `mcp.py:55` implements `/mcp/{server}/tools` returning `McpToolsResponse`; `test_mcp_list_servers_returns_server_level_rows` and `test_mcp_server_tools_priority_routing` both pass |
| 5 | GET /api/firehose returns an SSE stream of recent OTEL events | VERIFIED | `system.py:322` implements `/firehose` with `response_class=EventSourceResponse`; reuses `cmc.api.sse.tail_otel_events` which yields `{event:"otel", id, data}` dicts with disconnect detection and 60-minute cap; `test_sapi05_firehose_route_is_registered` and SSE unit tests all pass |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/cmc/api/routes/health.py` | GET /api/health liveness check | VERIFIED | 21 lines; returns `{"status":"ok"}` after DB ping |
| `backend/cmc/api/routes/system.py` | SAPI-02..05 system endpoints | VERIFIED | 363 lines; 4 endpoints + `_resolve_since_id` dep + whitelist constant |
| `backend/cmc/api/routes/sessions.py` | SESS-01..07 sessions endpoints | VERIFIED | 402 lines; 7 endpoints including SSE stream + JSONL queue writer |
| `backend/cmc/api/routes/observability.py` | OBSV-01..10 analytics endpoints | VERIFIED | 671 lines; 10 endpoints with window-function percentiles |
| `backend/cmc/api/routes/mcp.py` | MCP-01..04 MCP endpoints | VERIFIED | 149 lines; 4 endpoints with path-traversal guard |
| `backend/cmc/api/routes/skills.py` | SKIL-01..03 skills endpoints | VERIFIED | 188 lines; 3 endpoints with single-flight sync and dotdot block |
| `backend/cmc/api/sse.py` | Shared SSE tail helper | VERIFIED | 74 lines; `tail_otel_events` with disconnect check, 60-min cap, cursor-bound batch |
| `backend/cmc/mcp/aggregator.py` | Three-source MCP aggregator | VERIFIED | 338 lines; three-source priority merge with window-function percentiles |
| `backend/cmc/skills/scanner.py` | Pitfall-5-hardened skill scanner | VERIFIED | 127 lines; symlink-rejecting, one-level-deep, 1000-entry capped |
| `backend/cmc/api/schemas/` (6 modules) | Pydantic v2 DTOs for all routers | VERIFIED | 6 schema files exist; all importable |
| `backend/cmc/api/routes/__init__.py` | All routers registered | VERIFIED | 7 routers in `all_routers()`: health, sync, mcp, sessions, observability, system, skills |
| `backend/cmc/app/lifespan.py` | boot_time set at startup | VERIFIED | `app.state.boot_time = datetime.now(timezone.utc)` at line 49, before alembic upgrade |
| `backend/tests/test_phase3_system.py` | 17 SAPI tests | VERIFIED | 17 tests pass; includes SSE unit tests + whitelist enforcement |
| `backend/tests/test_phase3_sessions.py` | 20 SESS tests | VERIFIED | 20 tests pass; includes live-state, SSE stream, queue path |
| `backend/tests/test_phase3_observability.py` | 17 OBSV tests | VERIFIED | 17 tests pass; includes percentile edge cases |
| `backend/tests/test_phase3_mcp.py` | 7 MCP tests | VERIFIED | 7 tests pass; includes priority routing, single-flight 409 |
| `backend/tests/test_phase3_skills.py` | 8 Skills tests | VERIFIED | 8 tests pass; includes scanner, sync, PATCH autonomy |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `system.py` | `cmc.api.sse.tail_otel_events` | `async for chunk in tail_otel_events(...)` | WIRED | `system.py:44` imports, `system.py:356` consumes in firehose generator |
| `system.py` | `app.state.boot_time` | `getattr(request.app.state, "boot_time", now_utc)` | WIRED | `system.py:122`; boot_time set in `lifespan.py:49` |
| `system.py` | `psutil` | `psutil.Process(os.getpid()).memory_info().rss` | WIRED | `system.py:31,127`; psutil==7.2.2 in pyproject.toml deps |
| `mcp.py` | `cmc.mcp.aggregator.rebuild_mcp_stats` | `await rebuild_mcp_stats(db)` | WIRED | `mcp.py:37,98`; aggregator does real three-source SQL merge |
| `sessions.py` | `cmc.core.paths.repo_root` | `repo_root() / ".tmp/..."` | WIRED | `sessions.py:40,381`; queue file path is repo-root-anchored |
| `routes/__init__.py` | all 7 routers | `all_routers()` return list | WIRED | All imports present at lines 19-27; all 7 in return list at lines 31-39 |
| `observability.py` | SQLite window functions | `ROW_NUMBER() OVER (PARTITION BY ...)` in CTEs | WIRED | `observability.py`; plan's broken correlated-subquery was replaced with working window-function SQL |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `system.py:/system/health` | `uptime_seconds` | `app.state.boot_time` set in lifespan | Yes — real process start time | FLOWING |
| `system.py:/system/health` | `memory_rss_mb` | `psutil.Process().memory_info().rss` | Yes — real RSS from OS | FLOWING |
| `system.py:/system/health` | `daemon_ages` | `select(SystemState).where(key == ...)` per daemon key | Yes — real DB reads; None when rows absent (correct) | FLOWING |
| `sessions.py:/sessions` | `items`, `total` | `select(SessionModel)` with filters + count | Yes — real DB queries with WHERE/LIMIT/OFFSET | FLOWING |
| `observability.py:/usage/tokens` | `items` | `_TOKENS_SQL` on `token_usage` table grouped by `day, model, source` | Yes — real aggregate SQL | FLOWING |
| `mcp.py:/mcp` | `items` | `select(MCPStat).where(tool_name.is_(None))` | Yes — populated by `rebuild_mcp_stats` via POST /mcp/sync | FLOWING |
| `system.py:/firehose` | SSE chunks | `tail_otel_events` -> `select(OtelEvent).where(id > last_id)` | Yes — real DB polling; empty table yields zero events (correct) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| `/api/health` endpoint exists and returns dict | `grep "@router.get(\"/health\")" health.py` | Found at line 13 | PASS |
| Sessions endpoint has all three filter params | `grep "range_\|source.*Optional\|model.*Optional" sessions.py` | Found at lines 58-61 | PASS |
| Token usage groups by model | `grep "GROUP BY day, model, source" observability.py` | Found at line 82 | PASS |
| MCP server rows have latency fields in schema | `grep "latency_p50_ms\|latency_p95_ms" schemas/mcp.py` | Found at lines 28-30, 46-48 | PASS |
| Firehose is SSE with EventSourceResponse | `grep "response_class=EventSourceResponse" routes/system.py` | Found at line 322 | PASS |
| Full test suite green | `uv run pytest tests/` | 130 passed in 84.68s | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SAPI-01 | 03-02 | GET /api/health liveness check | SATISFIED | `health.py:13`; 200 + `{"status":"ok"}` |
| SAPI-02 | 03-02 | GET /api/system/health with uptime/memory/otel age/daemon ages | SATISFIED | `system.py:108`; all 6 fields present |
| SAPI-03 | 03-02 | GET /api/system/state whitelisted KV read | SATISFIED | `system.py:179`; frozenset whitelist enforced |
| SAPI-04 | 03-02 | GET /api/attention aggregate with Pitfall-7 zeros | SATISFIED | `system.py:215`; `pending_decisions=0`, `failed_tasks=0` always returned |
| SAPI-05 | 03-02 | GET /api/firehose SSE stream | SATISFIED | `system.py:322`; `EventSourceResponse` + `tail_otel_events` |
| SESS-01 | 03-03 | GET /api/sessions paginated with range/source/model | SATISFIED | `sessions.py:55`; all filters implemented |
| SESS-02 | 03-03 | GET /api/sessions/{id}/details session + tool timeline | SATISFIED | `sessions.py:103`; UUID guard + 404 |
| SESS-03 | 03-03 | GET /api/sessions/live Pitfall-8 fallback | SATISFIED | `sessions.py:135`; derives from sessions table, prefers live_state |
| SESS-04 | 03-03 | GET /api/sessions/live/{sid}/state snapshot | SATISFIED | `sessions.py:223`; 404 when no live_state row |
| SESS-05 | 03-03 | GET /api/sessions/live/{sid}/stream SSE | SATISFIED | `sessions.py:267`; StreamingResponse + 60-min cap + heartbeat fallback |
| SESS-06 | 03-03 | POST /api/sessions/live/{sid}/message JSONL queue | SATISFIED | `sessions.py:346`; 202 + repo-root-anchored queue path |
| SESS-07 | 03-03 | GET /api/summary today KPIs local time | SATISFIED | `sessions.py:172`; STRFTIME localtime single source of truth |
| OBSV-01 | 03-04 | GET /api/usage/tokens daily by model with range | SATISFIED | `observability.py:88`; GROUP BY day, model, source |
| OBSV-02 | 03-04 | GET /api/usage/cache hit_rate trend + low_sample | SATISFIED | `observability.py:115`; low_sample when billable < 10_000 |
| OBSV-03 | 03-04 | GET /api/sessions/outcomes Pitfall-9 read-time | SATISFIED | `observability.py`; CASE EXISTS on otel_events |
| OBSV-04 | 03-04 | GET /api/tools/latency p50/p95/max window functions | SATISFIED | `observability.py`; ROW_NUMBER OVER PARTITION percentiles |
| OBSV-05 | 03-04 | GET /api/hooks/activity fires + paired duration p50 | SATISFIED | `observability.py`; Python FIFO pairing, 60s cap |
| OBSV-06 | 03-04 | GET /api/sessions/by-project cwd rollup | SATISFIED | `observability.py`; pct_of_total computed |
| OBSV-07 | 03-04 | GET /api/tools/agent-fanout agent callers | SATISFIED | `observability.py`; sorted by agent_calls DESC |
| OBSV-08 | 03-04 | GET /api/tools/edit-decisions dual source merge | SATISFIED | `observability.py`; reads tools.decision AND otel_events |
| OBSV-09 | 03-04 | GET /api/activity/productivity commits/PRs/lines | SATISFIED | `observability.py`; reads claude_code.* counters |
| OBSV-10 | 03-04 | GET /api/system/pressure retries + recent errors | SATISFIED | `observability.py`; last 10 api_error events returned |
| MCP-01 | 03-05 | GET /api/mcp server list with latency stats | SATISFIED | `mcp.py:44`; sorted by call_count desc, latency fields present |
| MCP-02 | 03-05 | GET /api/mcp/{server}/tools per-tool breakdown | SATISFIED | `mcp.py:55`; path-traversal guard + empty 200 for unknown server |
| MCP-03 | 03-05 | POST /api/mcp/sync rebuild from priority sources | SATISFIED | `mcp.py:83`; single-flight 409; calls `rebuild_mcp_stats` |
| MCP-04 | 03-05 | POST /api/mcp/measure schema_size_bytes per server | SATISFIED | `mcp.py:104`; best-effort SUM(LENGTH(body)) capped at 100 events |
| SKIL-01 | 03-05 | GET /api/skills list with environment/user_invocable filters | SATISFIED | `skills.py`; filters via query params |
| SKIL-02 | 03-05 | POST /api/skills/sync scan + upsert (single-flight) | SATISFIED | `skills.py`; walks user + project roots, never clobbers autonomy |
| SKIL-03 | 03-05 | PATCH /api/skills/{name}/autonomy Literal enum | SATISFIED | `skills.py`; regex + dotdot block + Literal["auto","review","manual"] |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None found | — | — | No TODOs, FIXME, placeholders, or hollow returns found in production route/helper code |

Note: `DeprecationWarning: datetime.utcnow()` warnings appear in Phase 1+2 code (`scheduler.py`, `repository.py`) — not in Phase 3 deliverables. Not a blocker for Phase 3 goal.

### Human Verification Required

None. All success criteria are verifiable programmatically against the actual codebase.

The firehose SSE real-world behavior (browser EventSource reconnect on 60-min cap, client disconnect detection in production uvicorn) cannot be verified without a running server, but this is a well-understood framework behavior and is covered by direct unit tests that stub the transport layer.

### Gaps Summary

No gaps. All 5 success criteria are VERIFIED against the actual codebase:

1. GET /api/health and GET /api/system/health are both implemented with all required fields (uptime, memory, daemon ages, tzname) and backed by real psutil + DB queries. Boot time is set in lifespan startup.

2. GET /api/sessions implements pagination (limit/offset/total) and all three filters (range, source, model) with a correct `total` reflecting the filtered count.

3. GET /api/usage/tokens is backed by a real SQL aggregate grouped by `day, model, source` with today/7d/30d range support via STRFTIME localtime.

4. GET /api/mcp returns server-level rows with latency fields computed by the three-source aggregator; GET /api/mcp/{server}/tools returns per-tool breakdowns with the same latency stats. Path-traversal guard implemented with defense-in-depth (regex + explicit dotdot check).

5. GET /api/firehose is a real SSE stream using FastAPI 0.136.1's `EventSourceResponse` pattern backed by `tail_otel_events` which queries OtelEvent rows with disconnect detection and a 60-minute cap.

All 130 tests pass (25 Phase 1 + 36 Phase 2 + 69 Phase 3) with zero failures.

---

_Verified: 2026-04-26T14:30:00Z_
_Verifier: Claude (gsd-verifier)_
