---
phase: 02-data-ingestion
verified: 2026-04-25T12:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 2: Data Ingestion Verification Report

**Phase Goal:** Real session data and OTEL telemetry flow into the database automatically
**Verified:** 2026-04-25
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After server boot, sessions from ~/.claude/projects/ appear in the sessions table with correct token totals | VERIFIED | `lifespan.py:89` calls `sync_once` at boot; Plan 02-05 smoke ingested 148 real sessions, 319,240 input tokens, 35 token_usage buckets; `test_lifespan_runs_initial_sync_and_schedules_loop` confirms 1 session row after lifespan context |
| 2 | Posting OTLP/HTTP JSON to /v1/logs stores events in otel_events with extracted mcp_server/tool names | VERIFIED | `ingest.py:70-150` implements `POST /v1/logs`; `extract_mcp_attrs` in `otel_parser.py:57-81` handles both `tool_parameters` JSON path and `split_mcp` fallback; 5 tests cover INGST-07/08 including `test_otlp_logs_extracts_mcp_attrs_via_tool_parameters` and `test_otlp_logs_mcp_fallback_split_on_tool_name` |
| 3 | Posting OTLP/HTTP JSON to /v1/metrics stores metrics in otel_metrics | VERIFIED | `ingest.py:153-233` implements `POST /v1/metrics`; discriminates sum/gauge/histogram by key presence; `test_otlp_metrics_persists_three_kinds` confirms counter=47855.0, gauge=3.0, histogram=8542.3 all stored with correct kind |
| 4 | Corrupted JSONL lines are skipped without crashing the sync cycle | VERIFIED | `jsonl_parser.py:88-99` catches `JSONDecodeError` per-line, logs at WARNING, continues; `scheduler.py:73-75` catches `Exception` per-file with count to `errors`; `test_jsonl_parser_corrupted_line_skipped` proves iter_jsonl skips corrupt lines and yields valid ones; `test_sync_once_corrupted_line_does_not_crash` confirms errors==0 and tokens_output>=28 |
| 5 | POST /api/sync triggers an immediate re-scrape and returns success | VERIFIED | `sync.py:33-46` implements `POST /api/sync` delegating to `sync_once`; returns `{"status":"ok","files_seen":N,"files_updated":N,"errors":N,"duration_ms":N}`; wired via `all_routers()` at `/api` prefix; `test_manual_sync_returns_summary_and_persists_data` + `test_sync_route_registered` both pass |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/cmc/ingest/jsonl_parser.py` | JSONL parser with corruption handling | VERIFIED | 289 lines; `iter_jsonl` (INGST-06), `parse_session_file` (INGST-02/03/05), `split_mcp` (INGST-08 fallback) |
| `backend/cmc/ingest/otel_parser.py` | OTLP attribute extraction helpers | VERIFIED | 82 lines; `extract_mcp_attrs` dual-path (tool_parameters JSON + split_mcp fallback), `parse_unix_nano`, `iter_attrs` |
| `backend/cmc/ingest/repository.py` | Idempotent upsert helpers | VERIFIED | 245 lines; `upsert_session` (ON CONFLICT), `upsert_tools`, `accumulate_token_usage` (Option B subtract-then-add) |
| `backend/cmc/ingest/scheduler.py` | sync_once + periodic_sync_loop | VERIFIED | 178 lines; `sync_once` returns summary dict; `periodic_sync_loop` is sleep-first, catches Exception (not BaseException), re-raises CancelledError |
| `backend/cmc/api/routes/ingest.py` | POST /v1/logs + /v1/metrics | VERIFIED | 234 lines; always-200 contract per INGST-07/09; 413 only on oversize Content-Length before body read; per-record try/except with savepoint; per-file try/except |
| `backend/cmc/api/routes/sync.py` | POST /api/sync | VERIFIED | 46 lines; 4-line handler delegating to `sync_once`; wired in `all_routers()` under /api prefix |
| `backend/cmc/app/lifespan.py` | Boot sync + periodic task management | VERIFIED | 115 lines; `sync_once` called at boot (lines 89-92); `create_task(periodic_sync_loop)` stored on `app.state.sync_task` (lines 94-97); cancel-before-dispose in finally block |
| `backend/tests/test_phase2_ingest.py` | Phase 2 test suite | VERIFIED | 1156 lines; 36 tests covering all INGST-* requirements; all 36 pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lifespan.py` | `scheduler.sync_once` | `from cmc.ingest.scheduler import sync_once` | WIRED | Called at boot line 89; periodic loop created at line 94-97 |
| `sync.py` | `scheduler.sync_once` | `from cmc.ingest.scheduler import sync_once` | WIRED | Handler delegates at line 44; same coroutine as lifespan — single code path |
| `factory.py` | `all_routers()` + `raw_routers()` | `from cmc.api.routes import all_routers, raw_routers` | WIRED | `all_routers` includes sync_router; `raw_routers` includes ingest_router; both registered before SPA mount |
| `ingest.py` | `otel_parser.extract_mcp_attrs` | `from cmc.ingest.otel_parser import extract_mcp_attrs, iter_attrs, parse_unix_nano` | WIRED | Called per log record at line 109; dual-path MCP extraction wired |
| `scheduler.py` | `jsonl_parser.parse_session_file` | `from cmc.ingest.jsonl_parser import parse_session_file` | WIRED | Called via `asyncio.to_thread` at line 103 (keeps event loop responsive) |
| `scheduler.py` | `repository.*` | `from cmc.ingest.repository import ...` | WIRED | `upsert_session` line 139, `upsert_tools` line 140, `accumulate_token_usage` lines 141-148 |
| `routes/__init__.py` | `ingest_router` at root | `raw_routers() = [ingest_router]` | WIRED | Routes `/v1/logs` and `/v1/metrics` registered at root (no /api prefix) per OTLP spec |
| `routes/__init__.py` | `sync_router` under /api | `all_routers() includes sync_router` | WIRED | Route `/api/sync` registered correctly; `test_raw_routers_registers_otlp_paths_at_root` confirms no accidental /api prefix on OTLP paths |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `sessions` table | session rows | `sync_once` -> `jsonl_parser.parse_session_file` -> `upsert_session` | Yes — walks `*/*.jsonl`, parses real token totals | FLOWING |
| `otel_events` table | event rows | `POST /v1/logs` -> `OtelEvent` ORM add | Yes — real OTLP payload attributes extracted, attrs_mcp_server/tool populated | FLOWING |
| `otel_metrics` table | metric rows | `POST /v1/metrics` -> `OtelMetric` ORM add | Yes — value from asInt/asDouble/sum, kind discriminated by key presence | FLOWING |
| `token_usage` table | daily rollup rows | `accumulate_token_usage` -> `_adjust_bucket` | Yes — local-date bucketing via `ts.astimezone().date()` (INGST-05); Option B subtract-then-add prevents double-counting | FLOWING |
| `tools` table | tool call rows | `upsert_tools` from parsed `tool_calls` list | Yes — tool_use/tool_result paired, duration capped at 600_000ms, pending->ok transition idempotent | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 36 phase-2 tests pass | `python -m pytest backend/tests/test_phase2_ingest.py -v` | 36 passed in 46s | PASS |
| Full suite (61 tests) passes without regressions | `python -m pytest backend/tests/` | 61 passed in 89s | PASS |
| /v1/logs and /v1/metrics registered at root, not /api | `test_raw_routers_registers_otlp_paths_at_root` | Asserts /v1/logs in paths, /api/v1/logs not in paths | PASS |
| /api/sync registered under /api | `test_sync_route_registered` | Asserts /api/sync in paths, /sync not in paths | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INGST-01 | 02-05 | JSONL scraper scans on boot and every 120s | SATISFIED | `lifespan.py:89` boot sync; `create_task(periodic_sync_loop, 120s)` at line 94-97; 3 lifespan tests |
| INGST-02 | 02-02 | Extract user/assistant messages with token usage | SATISFIED | `jsonl_parser.py:196-214`; `test_jsonl_parser_token_usage_extraction` asserts 15/28/100/50 totals |
| INGST-03 | 02-02 | Pair tool_use/tool_result by tool_use_id, cap duration | SATISFIED | `jsonl_parser.py:237-258`; `_TEN_MIN_MS=600_000`; 3 tests covering paired/pending/capped cases |
| INGST-04 | 02-04 | Upsert sessions on session_id; re-parse on mtime change | SATISFIED | `repository.py:64-83` upsert with ON CONFLICT; `scheduler.py:93-99` skip-decision logic; 4 idempotence tests |
| INGST-05 | 02-02/04 | Daily token_usage rollups with local-time day bucketing | SATISFIED | `jsonl_parser.py:209` `ts.astimezone().date()`; `repository.py:122-244` `_adjust_bucket`; `test_sync_once_local_day_bucket_uses_system_tz` verifies PDT bucketing |
| INGST-06 | 02-02 | Corrupted lines skipped + log, never crash | SATISFIED | `jsonl_parser.py:88-99` JSONDecodeError per-line; 2 corruption tests pass |
| INGST-07 | 02-03 | OTLP /v1/logs always 200, per-row try/except | SATISFIED | `ingest.py:70-150`; always-200 contract; 413 only pre-body for oversize; 4 /v1/logs tests |
| INGST-08 | 02-03 | Extract mcp_server_name and mcp_tool_name from OTLP | SATISFIED | `otel_parser.py:57-81` dual-path: tool_parameters JSON + split_mcp fallback; 2 MCP extraction tests |
| INGST-09 | 02-03 | OTLP /v1/metrics receives JSON, inserts otel_metrics, always 200 | SATISFIED | `ingest.py:153-233`; `test_otlp_metrics_persists_three_kinds` confirms sum/gauge/histogram |
| INGST-10 | 02-05 | POST /api/sync triggers manual sync | SATISFIED | `sync.py:33-46`; 3 manual-sync tests including idempotence under repeat |

### Anti-Patterns Found

No blockers or warnings found. Spot-checks run:

- No `TODO`/`FIXME`/`PLACEHOLDER` comments in production code under `backend/cmc/ingest/` or `backend/cmc/api/routes/`
- No `return null` / `return {}` stub handlers — all route handlers have real implementations
- No hardcoded empty arrays where dynamic data is expected — `sync_once` returns a live summary dict populated from actual file-walking
- `return JSONResponse({}, status_code=200)` in `ingest.py` on malformed JSON is CORRECT behavior per the always-200 OTLP contract (INGST-07/09), not a stub

### Human Verification Required

None. The Phase 2 manual smoke checkpoint (Plan 02-06) was executed and user-approved, covering:
- Step 1 (boot with real `~/.claude/projects/`): confirmed 148 sessions ingested at boot (Plan 02-05 internal smoke)
- Steps 3-4 (POST /v1/logs and /v1/metrics with sample payloads): covered by automated tests INGST-07/08/09; user approved the integrated run
- Step 5 (POST /api/sync): confirmed `{"status":"ok","files_seen":148,...}` returned during Plan 02-05 smoke; user-approved
- Steps 6-7 (clean shutdown + path regression): confirmed clean Ctrl+C and `data/cmc.db` at repo root

No new uncovered ground requiring additional human testing was identified.

### Documentation Hygiene Note

The REQUIREMENTS.md traceability table at lines 283-292 still marks INGST-02/03/06/08 as "Pending" even though:

- The requirement list (lines 27-44) already shows these as `[x]` (complete)
- The implementing code exists and is fully verified
- The dedicated tests all pass

**Classification: Documentation/traceability gap only — NOT a functional gap.** The behavior required by INGST-02/03/06/08 is fully implemented and tested. The traceability table is a stale copy that was not updated when the requirement list checkboxes were ticked. This does not affect functionality.

INGST-05 is consistently `[ ]` in both the list and the table, but the behavior IS implemented: `jsonl_parser.py:209` uses `ts.astimezone().date()` for local-time bucketing, `repository.py` implements the Option B rollup, and `test_sync_once_local_day_bucket_uses_system_tz` verifies the PDT bucketing behavior. This is a requirements-tracking inconsistency where the requirement was implemented but the tracking document was not updated.

**Recommended action:** Update the REQUIREMENTS.md traceability table (lines 284/285/287/288/290) from "Pending" to "Complete" for INGST-02/03/05/06/08. This is a one-line-per-requirement documentation update, not a code change.

### Gaps Summary

No functional gaps found. All five Phase 2 ROADMAP success criteria are verified through:

1. Direct code inspection confirming the implementation path is present and non-stub at all levels
2. 36 passing tests that cover every INGST-* requirement including edge cases (corruption, idempotence, Option B token math, timezone bucketing, always-200 OTLP contract, per-record skip, periodic loop cancellation hygiene)
3. User-approved manual smoke (Plan 02-06) confirming the integrated end-to-end stack against real `~/.claude/projects/` data and recorded OTLP payloads

---

_Verified: 2026-04-25_
_Verifier: Claude (gsd-verifier)_
