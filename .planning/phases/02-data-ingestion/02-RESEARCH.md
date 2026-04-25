# Phase 2: Data Ingestion — Research

**Researched:** 2026-04-25
**Domain:** JSONL transcript scraping (Anthropic Claude Code session files), OTLP/HTTP JSON ingestion (logs + metrics), background scheduling inside FastAPI lifespan, idempotent SQLite/SQLAlchemy 2.0 async upserts, local-time daily bucketing.
**Confidence:** HIGH overall — JSONL format verified by direct inspection of real session files on this machine; OTEL event/metric names and attributes verified via official Claude Code monitoring docs; OTLP wire format verified via opentelemetry-proto examples; SQLAlchemy upsert + FastAPI lifespan patterns verified via Context7 / official docs. Phase 1 codebase inspected directly so wiring instructions match what actually exists.

## Phase Quick Reference

| Topic | Locked answer |
|-------|---------------|
| **JSONL location** | `~/.claude/projects/<project-hash>/<session-id>.jsonl` (one top-level file per session) [VERIFIED: filesystem inspection]. Subagent JSONLs live in `<project-hash>/<session-id>/subagents/agent-*.jsonl` — **out of scope for Phase 2** (parent session file already aggregates totals). |
| **JSONL event types found in real files** | `user`, `assistant`, `system`, `attachment`, `file-history-snapshot`, `permission-mode`, `last-prompt` [VERIFIED: real-file scan]. Phase 2 only needs `user`, `assistant`, and (optionally) `system` for `subtype="session_end"`-style signals. |
| **Token usage source** | `assistant.message.usage` block: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` [VERIFIED: real-file scan]. Sum across all assistant messages in a file. |
| **Tool pairing key** | `tool_use.id` (in assistant `message.content[i].type=="tool_use"`) ↔ `tool_result.tool_use_id` (in user `message.content[i].type=="tool_result"`) [VERIFIED: real-file scan]. |
| **MCP tool naming** | Tool name pattern `mcp__<server>__<tool>` (double underscores) [VERIFIED: real-file scan, e.g. `mcp__notebooklm-mcp__notebook_get`]. |
| **Session end detection** | **NO explicit session-end event exists in the JSONL** [VERIFIED: real-file scan]. INGST-04's `ended_at` must be inferred: (a) treat session as ended if `mtime > N minutes` ago AND scraper has fully read the file; (b) timestamp of last message becomes `ended_at`. Re-parse condition: `ended_at IS NULL OR jsonl_mtime > synced_at`. |
| **OTLP HTTP paths** | `/v1/logs` and `/v1/metrics` — fixed by spec [CITED: opentelemetry.io/docs/specs/otlp]. POST. Content-Type either `application/json` or `application/x-protobuf`; Phase 2 accepts JSON only (matches Claude Code default exporter behavior). |
| **OTLP HTTP success contract** | Always return 200 with empty `ExportLogsServiceResponse{}` / `ExportMetricsServiceResponse{}` body; per-row try/except inside [CITED: PITFALLS.md Pitfall 4]. Failure to return 200 = telemetry permanently lost. |
| **OTLP JSON shape (logs)** | `{"resourceLogs": [{"resource": {"attributes": [...]}, "scopeLogs": [{"scope": {...}, "logRecords": [{"timeUnixNano": "...", "body": {"stringValue": "..."}, "attributes": [...]}]}]}]}` [CITED: opentelemetry-proto/examples/logs.json]. |
| **OTLP JSON shape (metrics)** | `{"resourceMetrics": [{"resource": {...}, "scopeMetrics": [{"scope": {...}, "metrics": [{"name": "...", "unit": "...", "sum"|"gauge"|"histogram": {"dataPoints": [...], "aggregationTemporality": ..., "isMonotonic": ...}}]}]}]}` [CITED: opentelemetry-proto/examples/metrics.json]. |
| **OTEL event names emitted by Claude Code** | `claude_code.user_prompt`, `claude_code.tool_result`, `claude_code.api_request`, `claude_code.api_error`, `claude_code.tool_decision`, `claude_code.permission_mode_changed`, `claude_code.auth`, `claude_code.mcp_server_connection`, `claude_code.internal_error`, `claude_code.plugin_installed`, `claude_code.skill_activated`, `claude_code.api_retries_exhausted`, `claude_code.hook_execution_start`, `claude_code.hook_execution_complete`, `claude_code.compaction`, `claude_code.api_request_body`, `claude_code.api_response_body` [CITED: code.claude.com/docs/en/monitoring-usage]. |
| **OTEL metric names** | `claude_code.session.count`, `claude_code.lines_of_code.count`, `claude_code.pull_request.count`, `claude_code.commit.count`, `claude_code.cost.usage`, `claude_code.token.usage`, `claude_code.code_edit_tool.decision`, `claude_code.active_time.total` [CITED: code.claude.com/docs/en/monitoring-usage]. |
| **MCP attribute extraction (INGST-08)** | For `claude_code.tool_result` events with `tool_name` starting `mcp__`, `mcp_server_name` and `mcp_tool_name` are nested inside the `tool_parameters` JSON string attribute (only present when `OTEL_LOG_TOOL_DETAILS=1`) [CITED: monitoring docs]. Fallback: parse from `tool_name` itself by splitting on `__`. |
| **Background scheduler** | `asyncio.create_task` started in lifespan after engine setup, cancelled on shutdown. NO APScheduler, NO threading. [CITED: FastAPI lifespan docs] |
| **Sync interval** | 120s per INGST-01. Use `asyncio.sleep(120)` inside the loop. Sync on lifespan startup before scheduling the periodic loop (so initial data is populated immediately). |
| **Idempotent upsert** | `from sqlalchemy.dialects.sqlite import insert` → `insert(Model).values(...).on_conflict_do_update(index_elements=[...], set_={...})` [CITED: SQLAlchemy 2.0 docs]. |
| **Local-time day bucket** | Read system tz with `datetime.now().astimezone().tzinfo` (Python 3.6+) or `zoneinfo.ZoneInfo("...")` if env-configured. Convert UTC `assistant.timestamp` → local → `.date()` [CITED: PITFALLS.md Pitfall 8]. |
| **JSONL streaming** | `for line in open(path):` with per-line `try/except json.JSONDecodeError` (skip + log). Per-file 10s budget; offload to `asyncio.to_thread()` so the event loop stays responsive [CITED: PITFALLS.md Pitfall 5]. |
| **Manual sync endpoint** | `POST /api/sync` triggers a single sync cycle via the same coroutine the scheduler calls. Returns `{"status": "ok", "synced_files": N, "duration_ms": M}`. |
| **New router needed** | `cmc/api/routes/ingest.py` for `/v1/logs`, `/v1/metrics`. Note: per OTLP spec these are NOT under `/api`. Must mount differently (see Architecture section). |

**One-sentence summary:** Phase 2 adds three things to the existing FastAPI app — a background `asyncio` task that scans `~/.claude/projects/*.jsonl` every 120s and streams parsed messages into SQLite via on-conflict upserts, two OTLP/HTTP JSON endpoints (`/v1/logs`, `/v1/metrics`) that accept telemetry, store it in `otel_events`/`otel_metrics`, and **always return 200**, and a manual `/api/sync` trigger. All wired through the existing lifespan and session machinery from Phase 1; no new dependencies needed.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| JSONL filesystem scan | API / Backend (cmc.ingest.jsonl_scraper) | — | Pure backend service; reads `~/.claude/projects/`; runs in lifespan-spawned asyncio task |
| JSONL parsing & upsert | API / Backend (cmc.ingest.jsonl_parser + repository) | Database / Storage (SQLAlchemy upserts) | Parser is pure function (jsonl bytes → domain rows); repository owns DB writes |
| OTLP `/v1/logs` ingestion | API / Backend (cmc.api.routes.ingest) | Database / Storage (otel_events table) | FastAPI POST handler; per-row try/except; always returns 200 |
| OTLP `/v1/metrics` ingestion | API / Backend (cmc.api.routes.ingest) | Database / Storage (otel_metrics table) | Same handler module; mirrors logs flow |
| Periodic scheduler (120s) | API / Backend (cmc.app.lifespan) | — | `asyncio.create_task()` started after engine init, cancelled on shutdown |
| Manual sync trigger | API / Backend (`POST /api/sync` route) | — | Same sync coroutine as scheduler; just HTTP-callable |
| MCP attribute extraction | API / Backend (cmc.ingest.otel_parser) | — | Pure function: walks log record attributes JSON, materializes `attrs_mcp_server` / `attrs_mcp_tool` columns on `otel_events` |
| Token usage rollup (daily) | API / Backend (cmc.ingest.rollups) | Database / Storage (token_usage table) | Computed during JSONL parse; one upsert per (day, model, source) tuple per session-end |

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does not exist in the project root [VERIFIED: Read tool returned File does not exist]. The only operative project-level constraints come from `.planning/PROJECT.md`:
- macOS-only platform; JSONL paths are `~/.claude/projects/`.
- Python 3.13+; `from __future__ import annotations` not strictly required.
- SQLite single-file with WAL.
- SQLAlchemy 2.0 async + SQLModel + Alembic (locked Phase 1 stack).
- Bind to `127.0.0.1` only (PITFALLS.md security mistake #1).
- No outbound network for ingestion; OTEL is purely an inbound HTTP receiver.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INGST-01 | JSONL scraper scans `~/.claude/projects/*/*.jsonl` on boot and every 120s | Implementation Guidance §3 (background scheduler) + §1 (file enumeration) |
| INGST-02 | JSONL parser extracts user/assistant messages with token usage (input, output, cache_read, cache_create) | §1 (real-file shape) — usage block keys verified against live data |
| INGST-03 | JSONL parser pairs `tool_use` and `tool_result` by `tool_use_id`, computing duration capped at 10 min | §1 (pairing example) |
| INGST-04 | JSONL parser upserts `sessions` row with totals on session end; re-parses if `ended_at IS NULL` or `mtime > synced_at` | §4 (idempotent upsert) + §1 (no explicit session-end event — inferred from mtime + last message timestamp) |
| INGST-05 | JSONL parser writes daily `token_usage` rollups with local-time day bucketing | §6 (zoneinfo + astimezone) |
| INGST-06 | JSONL parser handles corrupted lines gracefully (skip + log, never crash sync cycle) | §5 (streaming + per-line try/except) |
| INGST-07 | OTEL `/v1/logs` endpoint receives OTLP/HTTP JSON, always returns 200, per-row try/except | §2 (OTLP shape) + Pitfall 4 |
| INGST-08 | OTEL `/v1/logs` extracts `mcp_server_name` and `mcp_tool_name` from `tool_parameters` JSON for `mcp_tool` events | §2 (attribute extraction) — Note: real attribute name is `tool_parameters` (JSON-stringified) on `claude_code.tool_result` |
| INGST-09 | OTEL `/v1/metrics` endpoint receives OTLP/HTTP JSON, inserts into `otel_metrics`, always returns 200 | §2 (metrics shape) |
| INGST-10 | `POST /api/sync` triggers manual sync cycle | §3 (manual trigger reuses scheduler coroutine) |

## Implementation Guidance

### 1. Anthropic JSONL transcript format

**Where to find files** [VERIFIED: filesystem inspection]:
- Primary path: `~/.claude/projects/<project-hash>/<session-id>.jsonl` (one file per top-level Claude Code session)
- Subagent files: `~/.claude/projects/<project-hash>/<session-id>/subagents/agent-*.jsonl` — **Phase 2 ignores these**. Reasoning: the parent session's JSONL already accounts for the Task tool calls that spawn them, and Phase 2 has no requirement to drill into subagent transcripts. (A future phase could re-visit if subagent token attribution is needed.)
- Project-hash naming: directory name is the project's `cwd` with `/` replaced by `-` (e.g., `/Users/patrykattc/work/git/claude-mission-control` → `-Users-patrykattc-work-git-claude-mission-control`). Useful for backfilling `sessions.cwd` when not present in messages, but **every message already has a `cwd` field at the top level**, so prefer reading it from the message.
- Glob: `Path.home() / ".claude/projects" / "**/*.jsonl"` — but you want only the top-level file per session, NOT the subagents. Recommended: glob `~/.claude/projects/*/*.jsonl` (single-level, NOT `**`) [VERIFIED: matches the spec in INGST-01 wording, and excludes the `subagents/` subdirectory].

**Top-level event types found in real files** [VERIFIED: scanned three real session files in this project's directory]:
- `user` — user messages, including `<command-name>/clear</command-name>` synthetic markers and tool_result blocks
- `assistant` — assistant turns; carries `message.usage` and `message.content[]` (which contains `text`, `thinking`, and `tool_use` blocks)
- `system` — system events with `subtype` (e.g., session metadata)
- `attachment` — pasted/dropped file content
- `file-history-snapshot` — meta event for the IDE; ignore
- `permission-mode` — records `Shift+Tab` permission cycling; ignore for token math
- `last-prompt` — meta marker; ignore

**Common top-level fields on user/assistant/system messages:**
```
parentUuid, isSidechain, type, message, uuid, timestamp,
userType, entrypoint, cwd, sessionId, version, gitBranch
```

**For `assistant` events specifically**, also: `requestId`. The `message` sub-object has `model`, `id`, `type`, `role`, `content`, `stop_reason`, `stop_sequence`, `stop_details`, `usage`.

**Token usage shape (verified against real data):**
```json
"usage": {
  "input_tokens": 2,
  "cache_creation_input_tokens": 47855,
  "cache_read_input_tokens": 0,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 0,
    "ephemeral_1h_input_tokens": 47855
  },
  "output_tokens": 29,
  "service_tier": "standard",
  "inference_geo": "not_available"
}
```
- Map `input_tokens` → `tokens_input`, `output_tokens` → `tokens_output`, `cache_read_input_tokens` → `tokens_cache_read`, `cache_creation_input_tokens` → `tokens_cache_create`. **Do NOT use the inner `cache_creation.ephemeral_*` breakdowns** — those are TTL-tier diagnostics, not totals.

**Tool use / tool result pairing (verified against real data):**

A `tool_use` block lives inside an `assistant` message:
```json
{
  "type": "tool_use",
  "id": "toolu_01UEHJJ9ngzcBMQdW5EajEUV",
  "name": "Bash",
  "input": {"command": "...", "description": "..."}
}
```

A matching `tool_result` block lives inside a `user` message (yes, user — Claude Code reflects the result back as a synthetic user turn):
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01UEHJJ9ngzcBMQdW5EajEUV",
  "is_error": false,
  "content": "false"      // or a list of {type:"text"|"image", ...} blocks
}
```

Pair by `tool_use.id == tool_result.tool_use_id`. Duration = `tool_result.timestamp - tool_use.timestamp` capped at 600,000 ms (10 min) per INGST-03. Status = `ok` if `is_error == false`, else `error`. If a `tool_use` has no matching `tool_result` (last event in file, session crashed mid-call), leave `ended_at = NULL`, `duration_ms = NULL`, `status = "pending"`.

**MCP tool name pattern** [VERIFIED]: `mcp__<server>__<tool>`. Examples seen in real data: `mcp__claude_ai_Indeed__search_jobs`, `mcp__notebooklm-mcp__notebook_get`. To extract server/tool from a JSONL `tool_use.name`:
```python
def split_mcp(tool_name: str) -> tuple[str | None, str | None]:
    if not tool_name.startswith("mcp__"):
        return None, None
    parts = tool_name.split("__", 2)  # max 2 splits → ['mcp', server, tool]
    if len(parts) < 3:
        return None, None
    return parts[1], parts[2]
```

**Session end detection — CRITICAL FINDING** [VERIFIED]: There is **no explicit session-end event** in the JSONL stream. Real files just stop being appended when the user exits Claude Code. Implications for INGST-04:
- "Session is over" must be inferred. Recommended heuristic:
  1. Compute `last_message_ts` = max(timestamp) across all parsed messages.
  2. If `mtime` of file is > 5 minutes old AND scraper has read to EOF → mark `ended_at = last_message_ts`.
  3. Otherwise, leave `ended_at = NULL` (still "live").
- The `system` event with `subtype="..."` MAY in some Claude Code versions carry an end signal — surveying three real files shows only `subtype` = various meta values, no explicit `"end"`. Treat as not-reliable; rely on the mtime heuristic.
- Re-parse condition (verbatim from INGST-04): `ended_at IS NULL OR jsonl_mtime > synced_at`. The `sessions` table from Phase 1 already has both columns wired up.

**File-level real-world quirks observed:**
- A typical session file is 50–250 lines [VERIFIED on three sample files: 50, 73, 124 lines]. Phase 1's PITFALLS.md warns of 100MB+ files; that's the worst-case ceiling. Most files are tiny.
- The first non-meta line is usually a `user` message with a `<local-command-caveat>` synthetic prefix. Skip messages where `isMeta == true` for token/tool accounting.
- Timestamps are ISO-8601 strings with `Z` suffix (e.g., `"2026-04-25T17:54:41.385Z"`). Parse with `datetime.fromisoformat(s.replace("Z", "+00:00"))`.
- Files are appended-to during active sessions. Reading mid-write may see a partial last line. Wrap `json.loads(line)` per-line in try/except (this is also INGST-06's literal requirement). Per `PITFALLS.md`, claude-code issue #20992 documents concurrent-write corruption that can leave truncated lines mid-file (not just at EOF) — so the try/except must continue past corrupted lines, not break.
- A file's `mtime` may update without new content (e.g., touched by system tools) — always re-parse from offset 0 if `mtime > synced_at`. Phase 2 does NOT need byte-offset incremental parsing for v1; total file sizes are small enough that re-parsing whole-file is acceptable. PITFALLS.md flags 100MB+ as the trigger to add offset tracking — defer that to a later optimization phase.

**Code pointer:**

```python
# cmc/ingest/jsonl_parser.py
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Iterator

log = logging.getLogger(__name__)

def iter_jsonl(path: Path) -> Iterator[dict]:
    """Yield one parsed JSON object per line, skipping corrupted lines.

    Per INGST-06 + PITFALLS.md Pitfall 5: never crash on a bad line. Log and continue.
    """
    with path.open("r", encoding="utf-8", errors="replace") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as e:
                log.warning("jsonl.parse_skip path=%s line=%d err=%s", path, lineno, e)
                continue


def parse_iso_z(ts: str) -> datetime:
    """Parse Anthropic's ISO-8601 'Z' timestamps to aware UTC datetime."""
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))
```

### 2. OTLP/HTTP JSON spec

**Endpoint paths** [CITED: opentelemetry.io/docs/specs/otlp]:
- `POST /v1/logs` — body type `ExportLogsServiceRequest`
- `POST /v1/metrics` — body type `ExportMetricsServiceRequest`
- `POST /v1/traces` — out of scope for Phase 2 (no requirement; Claude Code traces are beta)

These are **NOT** prefixed with `/api`. Phase 1's app factory mounts every router under `/api`:
```python
# cmc/app/factory.py:47
for router in all_routers():
    app.include_router(router, prefix="/api")
```
**Implication:** the OTEL routes need either (a) a separate `include_router` call without prefix, or (b) a flag/list that distinguishes "API routers" from "raw routers". Recommend adding a second registration step in the factory:
```python
# cmc/app/factory.py — proposed Phase 2 edit
for router in all_routers():
    app.include_router(router, prefix="/api")
for router in raw_routers():            # NEW for Phase 2
    app.include_router(router)          # no prefix; mounts at given path
```
Then `cmc/api/routes/__init__.py` exposes both `all_routers()` and `raw_routers()`. Keep the SPA mount last (Pitfall 8).

**Content types accepted** [CITED: OTLP spec]:
- `application/json` (Protobuf-JSON encoding)
- `application/x-protobuf` (binary Protobuf)
- Server MUST mirror request `Content-Type` in response.

**Phase 2 scope decision:** accept `application/json` only. Returning 415 to protobuf clients is fine for v1 — Claude Code defaults to JSON when `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` is set. This keeps the implementation a Pydantic model + standard FastAPI handler with no protobuf compiler dependency.

**OTLP logs JSON shape** [CITED: github.com/open-telemetry/opentelemetry-proto/blob/main/examples/logs.json]:
```json
{
  "resourceLogs": [
    {
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "claude-code"}},
          {"key": "service.version", "value": {"stringValue": "2.1.112"}}
        ]
      },
      "scopeLogs": [
        {
          "scope": {"name": "com.anthropic.claude_code.events", "version": "1.0.0"},
          "logRecords": [
            {
              "timeUnixNano": "1745601281385000000",
              "observedTimeUnixNano": "1745601281385000000",
              "severityNumber": 9,
              "severityText": "INFO",
              "body": {"stringValue": "tool_result"},
              "attributes": [
                {"key": "event.name", "value": {"stringValue": "tool_result"}},
                {"key": "session_id", "value": {"stringValue": "e7955e92-..."}},
                {"key": "tool_name", "value": {"stringValue": "Bash"}},
                {"key": "tool_use_id", "value": {"stringValue": "toolu_01UE..."}},
                {"key": "success", "value": {"stringValue": "true"}},
                {"key": "duration_ms", "value": {"intValue": "8486"}}
              ],
              "traceId": "...",
              "spanId": "..."
            }
          ]
        }
      ]
    }
  ]
}
```

**OTLP metrics JSON shape** [CITED: github.com/open-telemetry/opentelemetry-proto/blob/main/examples/metrics.json]:
```json
{
  "resourceMetrics": [
    {
      "resource": {"attributes": [...]},
      "scopeMetrics": [
        {
          "scope": {"name": "com.anthropic.claude_code.metrics"},
          "metrics": [
            {
              "name": "claude_code.token.usage",
              "unit": "tokens",
              "sum": {
                "aggregationTemporality": 2,
                "isMonotonic": true,
                "dataPoints": [
                  {
                    "startTimeUnixNano": "...",
                    "timeUnixNano": "...",
                    "asInt": "47855",
                    "attributes": [
                      {"key": "type", "value": {"stringValue": "input"}},
                      {"key": "model", "value": {"stringValue": "claude-opus-4-6"}}
                    ]
                  }
                ]
              }
            },
            {
              "name": "claude_code.session.count",
              "gauge": {"dataPoints": [{"asInt": "3", "timeUnixNano": "..."}]}
            },
            {
              "name": "tool.duration",
              "histogram": {
                "aggregationTemporality": 2,
                "dataPoints": [{
                  "count": "10", "sum": 8542.3,
                  "bucketCounts": ["1","3","4","2"],
                  "explicitBounds": [100, 500, 2000],
                  "min": 23, "max": 8400,
                  "timeUnixNano": "..."
                }]
              }
            }
          ]
        }
      ]
    }
  ]
}
```

**Critical decoding notes** [CITED: spec]:
- `intValue` is delivered as a **string** in JSON (Protobuf int64 wire encoding). Always parse as `int(v)` before storing.
- `timeUnixNano` is a string of nanoseconds. Convert with `datetime.fromtimestamp(int(t)/1e9, tz=UTC)`.
- The "value" wrapper is a **discriminated union**: one of `stringValue`, `intValue`, `doubleValue`, `boolValue`, `arrayValue`, `kvlistValue`. Phase 2 only needs string and int handling for the materialized columns; everything else goes into the `body` JSON column raw.
- Each metric carries exactly one of `sum`, `gauge`, `histogram`, `summary`, `exponentialHistogram`. Match on whichever key is present and set `kind` column accordingly.

**Minimum viable parser (Pydantic models):**
```python
# cmc/ingest/otlp_models.py
from typing import Literal, Annotated
from pydantic import BaseModel, Field

class AttrValue(BaseModel):
    stringValue: str | None = None
    intValue: str | None = None       # JSON encoding of int64 is string
    doubleValue: float | None = None
    boolValue: bool | None = None
    # arrayValue / kvlistValue ignored — they fall through into raw body

class Attribute(BaseModel):
    key: str
    value: AttrValue

class LogRecord(BaseModel):
    timeUnixNano: str | None = None
    observedTimeUnixNano: str | None = None
    severityNumber: int | None = None
    severityText: str | None = None
    body: dict | None = None
    attributes: list[Attribute] = []
    traceId: str | None = None
    spanId: str | None = None

class ScopeLogs(BaseModel):
    scope: dict = {}
    logRecords: list[LogRecord] = []

class ResourceLogs(BaseModel):
    resource: dict = {}
    scopeLogs: list[ScopeLogs] = []

class ExportLogsRequest(BaseModel):
    resourceLogs: list[ResourceLogs] = []
```
Same pattern for metrics. **Important:** make every field optional and use lenient parsing — INGST-07 / Pitfall 4 says we accept "anything that parses as JSON," which includes payloads with unknown fields and missing optional fields.

**Lenient endpoint pattern** [REQUIRED by INGST-07/INGST-09 + PITFALLS.md Pitfall 4]:
```python
# cmc/api/routes/ingest.py
from fastapi import APIRouter, Request
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from cmc.db import get_session
from cmc.ingest.otlp_logs import process_log_record
from starlette.responses import JSONResponse

router = APIRouter()

@router.post("/v1/logs")
async def otlp_logs(request: Request, session: AsyncSession = Depends(get_session)):
    """OTLP/HTTP logs endpoint. ALWAYS returns 200. Per-row try/except.

    Pitfall 4: any 4xx/5xx here causes Claude Code's exporter to drop the batch
    permanently. Parse defensively, accept-then-process, return 200.
    """
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({}, status_code=200)  # malformed body → still 200

    resource_logs = payload.get("resourceLogs", []) if isinstance(payload, dict) else []
    accepted = 0
    for rl in resource_logs:
        for sl in rl.get("scopeLogs", []) or []:
            for record in sl.get("logRecords", []) or []:
                try:
                    await process_log_record(session, rl.get("resource", {}), sl.get("scope", {}), record)
                    accepted += 1
                except Exception as e:
                    log.warning("otel.log_record_skip err=%s", e)
                    continue
    try:
        await session.commit()
    except Exception:
        await session.rollback()
    return JSONResponse({}, status_code=200)
```

Mirror this for `/v1/metrics`. The empty `{}` body matches the spec's `ExportLogsServiceResponse` / `ExportMetricsServiceResponse` (both are empty messages on success).

**MCP attribute extraction (INGST-08)** [CITED: code.claude.com/docs/en/monitoring-usage]:
- The requirement text says "extract `mcp_server_name` and `mcp_tool_name` from `tool_parameters` JSON for `mcp_tool` events." The actual Claude Code event is `claude_code.tool_result` with `tool_name` starting `mcp__`. The `tool_parameters` attribute is **a JSON-stringified blob** that includes nested `mcp_server_name` and `mcp_tool_name` keys (only when `OTEL_LOG_TOOL_DETAILS=1` is set client-side).
- **Robust extraction strategy** (handle both with-details and without-details):
  1. If `tool_parameters` attribute is present and parses as JSON, read `.mcp_server_name` and `.mcp_tool_name` from it.
  2. Else, fall back to splitting `tool_name` on `__` (works without `OTEL_LOG_TOOL_DETAILS=1`).
  3. Materialize both into the `attrs_mcp_server` and `attrs_mcp_tool` columns on `otel_events` (already in schema).

```python
def extract_mcp_attrs(record: dict) -> tuple[str | None, str | None]:
    """Return (mcp_server, mcp_tool) for a tool_result log record."""
    attrs = {a["key"]: a.get("value", {}) for a in record.get("attributes", [])}
    tool_name = attrs.get("tool_name", {}).get("stringValue", "") or ""
    if not tool_name.startswith("mcp__"):
        return None, None
    # Try parsed tool_parameters first (only set if OTEL_LOG_TOOL_DETAILS=1)
    params_raw = attrs.get("tool_parameters", {}).get("stringValue")
    if params_raw:
        try:
            params = json.loads(params_raw)
            srv = params.get("mcp_server_name")
            tl = params.get("mcp_tool_name")
            if srv or tl:
                return srv, tl
        except json.JSONDecodeError:
            pass
    # Fallback: parse from tool_name itself
    parts = tool_name.split("__", 2)
    if len(parts) >= 3:
        return parts[1], parts[2]
    return None, None
```

### 3. Background scheduler (FastAPI lifespan + asyncio.create_task)

**Locked decision:** in-process `asyncio.create_task` started from lifespan, cancelled on shutdown. **NO APScheduler, NO threading.** [Rationale: this is a single-process FastAPI app on localhost, the work is async-friendly, and APScheduler would add a heavy dependency for one timer. Phase 8's Mission Control is a separate launchd-managed process — different concern.]

**Pattern** [CITED: FastAPI lifespan docs + tested in similar projects]:
```python
# cmc/app/lifespan.py — extended for Phase 2
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ... existing Phase 1 setup (engine, alembic, sessionmaker) ...

    # Phase 2: kick off initial sync immediately so the dashboard has data
    # the moment the server is up. Then schedule the recurring loop.
    from cmc.ingest.scheduler import sync_once, periodic_sync_loop
    await sync_once(app.state.sessions)         # boot-time scan (INGST-01)
    sync_task = asyncio.create_task(
        periodic_sync_loop(app.state.sessions, interval_s=120)
    )
    app.state.sync_task = sync_task

    try:
        yield
    finally:
        sync_task.cancel()
        try:
            await sync_task
        except asyncio.CancelledError:
            pass
        await engine.dispose()
```

**The loop coroutine itself:**
```python
# cmc/ingest/scheduler.py
import asyncio
import logging

log = logging.getLogger(__name__)

async def sync_once(sessionmaker) -> dict:
    """Run one full sync cycle: scan JSONLs, upsert sessions/messages/tools, write rollups.

    Returns a summary dict for both the scheduler (logging) and POST /api/sync (response).
    """
    started = asyncio.get_event_loop().time()
    files_seen = 0
    files_updated = 0
    errors = 0
    async with sessionmaker() as session:
        # iterate ~/.claude/projects/*/*.jsonl
        # for each: decide via sessions.synced_at + jsonl_mtime whether to re-parse
        # offload heavy parsing to asyncio.to_thread() per Pitfall 5
        ...
    duration_ms = int((asyncio.get_event_loop().time() - started) * 1000)
    return {"files_seen": files_seen, "files_updated": files_updated, "errors": errors, "duration_ms": duration_ms}


async def periodic_sync_loop(sessionmaker, interval_s: int = 120) -> None:
    """Run sync_once every interval_s seconds. Cancelled on lifespan shutdown."""
    while True:
        try:
            await asyncio.sleep(interval_s)
            summary = await sync_once(sessionmaker)
            log.info("ingest.sync_cycle %s", summary)
        except asyncio.CancelledError:
            log.info("ingest.sync_cycle_cancelled")
            raise
        except Exception:
            log.exception("ingest.sync_cycle_error")
            # Critical: don't propagate; the loop must outlive single-cycle failures.
            continue
```

**Why this shape, exactly:**
- `asyncio.sleep` BEFORE `sync_once` inside the loop — first sync already ran in lifespan startup; sleeping first prevents back-to-back execution.
- Bare `except Exception` swallows non-cancellation errors so the scheduler never crashes silently. Log them.
- `asyncio.CancelledError` MUST re-raise so lifespan can await the cancellation cleanly.
- `app.state.sessions` (the sessionmaker, NOT a session) is what the loop captures — each sync cycle opens a fresh session inside `sync_once`. Per Pitfall 1 / Pitfall 2 from PITFALLS.md: short-lived sessions, no long-held connections.

**Manual sync (INGST-10):**
```python
# cmc/api/routes/sync.py
from fastapi import APIRouter, Request

router = APIRouter(tags=["system"])

@router.post("/sync")
async def manual_sync(request: Request) -> dict:
    """INGST-10: trigger an immediate sync cycle."""
    summary = await sync_once(request.app.state.sessions)
    return {"status": "ok", **summary}
```
Mounted under `/api`, so the URL is `POST /api/sync`.

**Verification:** PITFALLS.md lifecycle test — kill `uvicorn` and confirm the task is cancelled (no zombie warning in stderr). The pattern above does that.

### 4. Idempotent upserts in SQLite via SQLAlchemy 2.0 async

**Use `sqlalchemy.dialects.sqlite.insert(...).on_conflict_do_update(...)`** [CITED: docs.sqlalchemy.org/en/20/dialects/sqlite.html]. NOT `Session.merge()` — merge is row-by-row select-then-write and doesn't use the `INSERT ... ON CONFLICT` SQL form. Don't use `INSERT OR REPLACE` either; that DELETEs and re-INSERTs, breaking foreign key references.

**Example: upsert a `sessions` row** (INGST-04):
```python
# cmc/ingest/repository.py
from datetime import datetime
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncSession
from cmc.db.models.sessions import Session as SessionModel

async def upsert_session(db: AsyncSession, **fields) -> None:
    """Idempotent INSERT ... ON CONFLICT(session_id) DO UPDATE for sessions."""
    stmt = insert(SessionModel).values(**fields)
    update_cols = {
        "ended_at": stmt.excluded.ended_at,
        "synced_at": stmt.excluded.synced_at,
        "jsonl_mtime": stmt.excluded.jsonl_mtime,
        "tokens_input": stmt.excluded.tokens_input,
        "tokens_output": stmt.excluded.tokens_output,
        "tokens_cache_read": stmt.excluded.tokens_cache_read,
        "tokens_cache_create": stmt.excluded.tokens_cache_create,
        "tool_call_count": stmt.excluded.tool_call_count,
        "message_count": stmt.excluded.message_count,
        "model": stmt.excluded.model,
        "outcome": stmt.excluded.outcome,
        "error_message": stmt.excluded.error_message,
        # Don't overwrite started_at — it's the immutable session start.
    }
    stmt = stmt.on_conflict_do_update(
        index_elements=["session_id"],
        set_=update_cols,
    )
    await db.execute(stmt)
```

**For `tools`** (INGST-03): the unique constraint is `tool_use_id`. On second sync of an in-progress session, the same `tool_use` may now have its `tool_result`. Use the same upsert pattern with `index_elements=["tool_use_id"]`.

**For `token_usage`** (INGST-05): unique on `(day, model, source)`. This is a true accumulating counter, so the `set_` block should ADD, not replace:
```python
stmt = insert(TokenUsage).values(
    day=day, model=model, source=source,
    tokens_input=delta_in, tokens_output=delta_out,
    tokens_cache_read=delta_cr, tokens_cache_create=delta_cc,
    sessions_count=1, updated_at=datetime.utcnow(),
)
stmt = stmt.on_conflict_do_update(
    index_elements=["day", "model", "source"],
    set_={
        "tokens_input": TokenUsage.tokens_input + stmt.excluded.tokens_input,
        "tokens_output": TokenUsage.tokens_output + stmt.excluded.tokens_output,
        ...
    },
)
```
**Caveat:** because we may re-parse a session whose tokens already counted toward yesterday's bucket, naive accumulation double-counts. Two safe options:
- **Option A (recommended):** compute totals deterministically per session and overwrite. Track per-session contribution with an auxiliary `session_token_contribution` derived view, OR
- **Option B (simpler):** during sync, for each session being re-parsed: subtract the previous totals first (read existing `sessions.tokens_*` columns), then add the freshly-parsed totals. Keep the rollup correct without an extra table.

Phase 2 plan should explicitly choose between A and B. **Recommendation:** Option B — simpler, fits the "re-parse the whole file every time" approach.

**Transaction shape (Pitfall 2):** all upserts in a sync cycle should land inside a single `BEGIN IMMEDIATE` transaction per file (or per batch). SQLAlchemy's default async transaction is DEFERRED — under contention this can produce silent `database is locked` failures. To force IMMEDIATE on SQLite via async:
```python
async with sessionmaker() as db:
    await db.execute(text("BEGIN IMMEDIATE"))
    # ... all upserts for this file ...
    await db.commit()
```
Or use `connection.execution_options(isolation_level="IMMEDIATE")` at engine level for ingest paths.

### 5. Streaming JSONL parser

**Pattern:**
1. `iter_jsonl(path)` (shown in §1) is an iterator that yields one parsed dict per valid line, skipping corrupted lines.
2. Walk the iterator once per file, accumulating per-session running totals into Python locals (NOT lists of full message bodies).
3. After the walk, run a single batched upsert per table.
4. Wrap the whole walk in `await asyncio.to_thread(...)` so the event loop stays responsive — the parser itself is sync-safe (pure CPU + file IO), and `to_thread` is the simplest way to keep `/v1/logs` responsive during a parse.

**Skeleton:**
```python
# cmc/ingest/jsonl_parser.py (continued)
from collections import defaultdict
from datetime import datetime
from pathlib import Path

def parse_session_file(path: Path) -> dict:
    """Walk a JSONL once; return aggregated upsert payloads.

    Returns a dict with keys:
        session: dict       # one row for sessions table
        messages_count: int
        tool_calls: list    # rows for tools table
        token_usage_buckets: list  # rows for token_usage table (one per (day, model))
    """
    session_id = None
    started_at = None
    last_ts = None
    cwd = None
    project_hash = None
    model = None
    tokens = {"input": 0, "output": 0, "cache_read": 0, "cache_create": 0}
    message_count = 0
    tool_uses: dict[str, dict] = {}      # by tool_use_id
    tool_results: dict[str, dict] = {}   # by tool_use_id
    daily_tokens: dict[tuple[date, str], dict] = defaultdict(lambda: {"input":0,"output":0,"cache_read":0,"cache_create":0})

    for ev in iter_jsonl(path):
        ev_type = ev.get("type")
        if ev_type not in ("user", "assistant"):
            continue
        if ev.get("isMeta"):
            continue
        session_id = session_id or ev.get("sessionId")
        cwd = cwd or ev.get("cwd")
        ts_str = ev.get("timestamp")
        if not ts_str:
            continue
        ts = parse_iso_z(ts_str)
        started_at = started_at or ts
        last_ts = ts
        message_count += 1

        msg = ev.get("message", {})
        if ev_type == "assistant":
            model = msg.get("model") or model
            usage = msg.get("usage", {}) or {}
            tin = usage.get("input_tokens", 0) or 0
            tout = usage.get("output_tokens", 0) or 0
            tcr = usage.get("cache_read_input_tokens", 0) or 0
            tcc = usage.get("cache_creation_input_tokens", 0) or 0
            tokens["input"] += tin
            tokens["output"] += tout
            tokens["cache_read"] += tcr
            tokens["cache_create"] += tcc
            # daily bucket (local-time day)
            local_day = ts.astimezone().date()
            bucket = daily_tokens[(local_day, model or "unknown")]
            bucket["input"] += tin
            bucket["output"] += tout
            bucket["cache_read"] += tcr
            bucket["cache_create"] += tcc

        # Walk content for tool_use / tool_result
        content = msg.get("content")
        if isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "tool_use":
                    tool_uses[block.get("id")] = {
                        "tool_use_id": block.get("id"),
                        "tool_name": block.get("name"),
                        "started_at": ts,
                        "input_summary": _summarize_input(block.get("input")),
                    }
                elif btype == "tool_result":
                    tool_results[block.get("tool_use_id")] = {
                        "tool_use_id": block.get("tool_use_id"),
                        "ended_at": ts,
                        "is_error": bool(block.get("is_error")),
                    }

    # Pair tool_uses with results
    paired = []
    for tid, use in tool_uses.items():
        result = tool_results.get(tid)
        if result:
            duration_ms = min(
                int((result["ended_at"] - use["started_at"]).total_seconds() * 1000),
                600_000,  # 10 min cap (INGST-03)
            )
            status = "error" if result["is_error"] else "ok"
            ended_at = result["ended_at"]
        else:
            duration_ms = None
            status = "pending"
            ended_at = None
        # MCP detection
        srv, tl = split_mcp(use["tool_name"] or "")
        paired.append({
            **use, "ended_at": ended_at, "duration_ms": duration_ms,
            "status": status, "mcp_server_name": srv, "mcp_tool_name": tl,
        })

    return {
        "session": {
            "session_id": session_id,
            "started_at": started_at,
            "ended_at": None,        # decided by caller from mtime heuristic
            "cwd": cwd,
            "model": model,
            "tokens_input": tokens["input"],
            "tokens_output": tokens["output"],
            "tokens_cache_read": tokens["cache_read"],
            "tokens_cache_create": tokens["cache_create"],
            "message_count": message_count,
            "tool_call_count": len(paired),
            "_last_message_ts": last_ts,
        },
        "tool_calls": paired,
        "token_usage_buckets": [
            {"day": d, "model": m, "source": "claude-code",
             "tokens_input": v["input"], "tokens_output": v["output"],
             "tokens_cache_read": v["cache_read"], "tokens_cache_create": v["cache_create"]}
            for (d, m), v in daily_tokens.items()
        ],
    }
```

### 6. Local-time day bucketing

**Use `datetime.astimezone()` with no argument** to convert UTC to system local time (Python 3.6+). This reads the OS tzname automatically — exactly what INGST-05 wants ("local-time day bucketing" with no explicit tz config).

```python
from datetime import datetime, timezone

# UTC ISO from JSONL
ts_utc = datetime.fromisoformat("2026-04-25T03:30:00+00:00")
# astimezone() with no arg uses system local tz
local_day = ts_utc.astimezone().date()    # date(2026, 4, 24) in US/Pacific
```

**Pitfall 8 from PITFALLS.md** [CITED]: do NOT bucket on UTC date — evening sessions cross midnight UTC and get misattributed to "tomorrow." The single line above closes this pitfall. Verify with a Pacific-time fixture: a `2026-04-25T04:00:00Z` (= 2026-04-24 21:00 PDT) must bucket to `2026-04-24`.

**For SQL queries** (downstream phases will read these rollups): once `day` is stored as a Python `date` (which Phase 1's `token_usage.day` column is — `_date` SQLModel field), the bucket is fixed. No SQL-side `date('localtime')` conversion needed because we already converted in Python before the upsert.

**Optional configurability:** if a user sets `TZ=UTC` in their env, `astimezone()` honors it. No additional code needed. If they want to override regardless of OS tz, expose a future setting `Settings.report_tz` (Phase 3+). Not needed for v1.

### 7. Test strategy

**Existing test infrastructure (Phase 1):**
- Single test file `backend/tests/test_phase1_boot.py` with one assertion per FOUND-* requirement.
- `conftest.py` provides `clean_env`, `tmp_db_path`, `test_settings`, `tmp_static_dir`, `test_settings_with_static`.
- `pytest-asyncio` mode = `auto`, `addopts = -q`.
- 25 tests passing as of Phase 1 close.

**Phase 2 test file convention** (per Phase 1 STATE.md note): create `tests/test_phase2_ingest.py` as the single Phase 2 test file. Each plan adds tests that map 1:1 to INGST-* requirements.

**Required new fixtures (add to `conftest.py`):**
1. `fake_jsonl_dir(tmp_path)` — creates a temp dir mimicking `~/.claude/projects/<hash>/<session-id>.jsonl` layout. Returns the dir for the parser to scan. Used to keep tests hermetic from the user's actual `~/.claude/projects/`.
2. `golden_jsonl_session(fake_jsonl_dir)` — writes a synthetic session JSONL with known event mix: 5 user msgs, 5 assistant msgs, 3 tool_use/tool_result pairs, 1 unmatched tool_use, 1 corrupted line. Asserts on this serve as the golden file for the parser.
3. `otlp_log_payload()` and `otlp_metric_payload()` — minimal valid OTLP/HTTP JSON dicts matching the shape from §2. Includes one mcp tool_result event so the MCP-extraction test can use it.
4. `freeze_time` (via `freezegun==1.5.5` or `pytest-freezer==0.4.9` — recommend `pytest-freezer` because it integrates as a pytest plugin) — used to test the local-time bucketing edge case (11pm Pacific → "today" not "tomorrow"). Add to `[project.optional-dependencies].dev`.

**New dev dependencies:**
```toml
[project.optional-dependencies]
dev = [
  # ...existing...
  "pytest-freezer>=0.4",   # Phase 2: deterministic time for bucketing tests
]
```
(Both `freezegun` and `pytest-freezer` are listed on PyPI; `pytest-freezer` is the modern pytest-friendly wrapper.)

**Test sketches (to be filled in by planner):**

| Requirement | Test name | What it asserts |
|-------------|-----------|-----------------|
| INGST-01 | `test_jsonl_scraper_finds_files_in_projects_dir` | Given a fake projects dir with two session files, scraper enumerates exactly those two paths |
| INGST-01 | `test_periodic_loop_runs_every_interval` | Mock sync_once; assert called twice when loop sleeps `interval_s=0.1` for 0.25s |
| INGST-02 | `test_parser_extracts_token_usage_from_assistant_message` | Golden file with one assistant message; assert `tokens_input/output/cache_read/cache_create` match the JSONL `usage` block |
| INGST-03 | `test_parser_pairs_tool_use_and_result` | Golden file with one matched pair; assert `duration_ms` correct and `status="ok"` |
| INGST-03 | `test_parser_caps_duration_at_10_min` | Pair with 30-min gap; assert `duration_ms == 600_000` |
| INGST-03 | `test_parser_leaves_unpaired_tool_use_pending` | tool_use without tool_result; assert `status="pending"`, `duration_ms is None` |
| INGST-04 | `test_upsert_creates_session_row` | Run `sync_once`; assert row in `sessions` with correct totals |
| INGST-04 | `test_upsert_updates_existing_session_when_mtime_advances` | Run twice with file modified between; assert `synced_at` advances and totals reflect new data |
| INGST-04 | `test_session_ended_at_set_when_file_stale` | Mock mtime to be > 5 min old; assert `ended_at` populated |
| INGST-05 | `test_token_usage_buckets_by_local_time_day` | freezegun → 23:00 Pacific; assert daily bucket key is "today" Pacific, not "tomorrow" UTC |
| INGST-06 | `test_corrupted_jsonl_line_does_not_crash_sync` | Inject `{"type":"assist` (truncated) mid-file; sync completes, log message present, valid lines still parsed |
| INGST-07 | `test_otlp_logs_endpoint_returns_200_for_valid_payload` | POST minimal valid OTLP/JSON; assert 200 + empty body + row in `otel_events` |
| INGST-07 | `test_otlp_logs_endpoint_returns_200_for_malformed_body` | POST `b"not json"`; assert 200 (Pitfall 4 contract) |
| INGST-07 | `test_otlp_logs_endpoint_skips_bad_records_continues_others` | Payload with two records; first malformed; assert second persists and 200 returned |
| INGST-08 | `test_mcp_attrs_extracted_from_tool_parameters` | Tool_result with `tool_parameters` JSON containing mcp_server_name; assert columns populated |
| INGST-08 | `test_mcp_attrs_fallback_from_tool_name` | Tool_result with no tool_parameters; assert split-on-`__` populates columns |
| INGST-09 | `test_otlp_metrics_endpoint_persists_sum_metric` | POST sum metric; assert row with `kind="counter"` |
| INGST-09 | `test_otlp_metrics_endpoint_persists_gauge_metric` | POST gauge; assert `kind="gauge"` |
| INGST-09 | `test_otlp_metrics_endpoint_persists_histogram_metric` | POST histogram; assert `kind="histogram"` and `value` = sum or count (planner decides which) |
| INGST-10 | `test_post_api_sync_triggers_sync_cycle` | POST `/api/sync`; assert response includes `files_seen` and a sessions row appears |

**HTTP testing:** continue using `httpx.AsyncClient` + `ASGITransport` + `app.router.lifespan_context(app)` — the pattern Phase 1 already established (see `test_health_route_returns_ok`).

**Time mocking:** for the periodic loop test, prefer monkeypatching `asyncio.sleep` to advance instantly rather than freezing wall-clock time. For the daily-bucket test, `freezegun` (via `pytest-freezer`'s `freezer` fixture) is appropriate.

### 8. Common pitfalls (Phase-2-specific)

#### Pitfall 1: tool_use without matching tool_result
**What goes wrong:** `tool_use` exists but session ended (or is mid-flight) before `tool_result` was emitted. Naive parser produces incomplete `tools` rows or, worse, raises KeyError.
**How to avoid:** Pair via dict lookup, not list zip. Mark unpaired uses as `status="pending"`, `ended_at=NULL`, `duration_ms=NULL`. On re-parse, the upsert on `tool_use_id` updates the row when the `tool_result` finally arrives.
**Warning sign:** Row in `tools` with `status="pending"` and `ended_at IS NULL` for a session whose `ended_at IS NOT NULL` — that's a permanent orphan. Acceptable for v1; do not crash.

#### Pitfall 2: Sessions that never close (no end signal)
**What goes wrong:** `ended_at` stays NULL forever because there's no explicit session-end event in the JSONL.
**How to avoid:** Use the mtime heuristic (§1): if `now - mtime > 5 min` AND scraper has read EOF, set `ended_at = last_message_ts`. Document the 5-min threshold as a configurable `Settings.session_idle_minutes` (default 5).
**Warning sign:** SESS-03 ("live sessions" = `ended_at IS NULL OR > now-5min`) returning sessions that have actually been dead for hours.

#### Pitfall 3: File appended-to during scrape
**What goes wrong:** Reading mid-write yields a partial last line that fails `json.loads`. Or scraper reads N lines, parses, writes session totals; meanwhile session adds 5 more messages, totals are now stale.
**How to avoid:** (a) Per-line try/except (already covered by INGST-06). (b) Idempotent re-parse via mtime tracking — next sync cycle picks up the new lines because `jsonl_mtime > synced_at`.
**Warning sign:** Session token totals dropping between sync cycles (overwrite with stale data because we re-parsed before noticing new lines). Solution: compare current `mtime` to file's mtime AFTER reading; if changed, mark for re-parse next cycle.

#### Pitfall 4: Duplicate session_ids across projects
**What goes wrong:** Theoretically a UUID collision could place the same session_id under two different project hashes. (Practically: never observed; UUIDs are 122 bits.)
**How to avoid:** `sessions.session_id` is PK. The first parse wins; the second triggers `on_conflict_do_update` and overwrites with the second file's data. To detect: log a warning if a session's `jsonl_path` field changes during upsert.

#### Pitfall 5: Subagent JSONL files (out of scope but easy to scoop up by mistake)
**What goes wrong:** Glob `**/*.jsonl` accidentally includes `~/.claude/projects/<hash>/<sid>/subagents/agent-*.jsonl`. These have a different shape (subagent-specific) and would corrupt session totals.
**How to avoid:** Use `Path.glob("*/*.jsonl")` (single level) NOT `**/*.jsonl`. Verify by running the enumeration in a unit test against a fixture that includes a subagents/ subdir; assert the subagent files are NOT in the result.

#### Pitfall 6: OTEL endpoint returning anything other than 200
**What goes wrong:** Already covered by PITFALLS.md Pitfall 4. Re-stated: a non-200 from `/v1/logs` causes Claude Code to drop the entire batch permanently.
**How to avoid:** Pattern in §2 — outer try/except for body parse, inner try/except per record, outer JSONResponse always 200. Test with malformed JSON, malformed nested record, DB-down scenarios.

#### Pitfall 7: Background task crashing kills the loop
**What goes wrong:** An uncaught exception inside `periodic_sync_loop` cancels the task. No more 120s syncs ever happen until restart.
**How to avoid:** Bare `except Exception` inside the `while True` (not `BaseException` — that catches CancelledError too). Re-raise CancelledError specifically. Pattern shown in §3.

#### Pitfall 8: Tests against the user's real `~/.claude/projects/`
**What goes wrong:** Test scaffolding hits the user's home dir, sees megabytes of real session files, tests are slow and flaky (depends on what was parsed last).
**How to avoid:** Add a `Settings.jsonl_root: Path = Path.home() / ".claude/projects"` field. In tests, override to `tmp_path / "projects"`. Conftest fixture `fake_jsonl_dir` (already proposed in §7) materializes the override.

#### Pitfall 9: TestClient lifespan + background task interaction
**What goes wrong:** `TestClient(app)` from starlette doesn't run lifespan by default. `httpx.ASGITransport` does, IF you wrap with `app.router.lifespan_context(app)`. If the background task starts in lifespan, tests that don't enter the lifespan context never fire it — so manual sync via POST works in production but tests pass without exercising the loop.
**How to avoid:** Test the sync loop directly (`asyncio.create_task(periodic_sync_loop(sm, interval_s=0.05)); await asyncio.sleep(0.2); cancel()`) — don't rely on lifespan in tests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OTLP/HTTP JSON validation | Custom `dict.get()` chains | Pydantic models with `Optional` fields and `extra="allow"` | Pydantic gives readable errors and per-field validation; lenient via Optional/allow |
| Periodic background task | Threading + signal handlers + own scheduler | `asyncio.create_task` started in FastAPI lifespan, cancelled on shutdown | Standard pattern; integrates with single-process FastAPI; no extra deps |
| ON CONFLICT upserts in raw SQL | `text("INSERT ... ON CONFLICT ...")` strings | `sqlalchemy.dialects.sqlite.insert(...).on_conflict_do_update(...)` | Type-safe, dialect-aware, parameter binding handled |
| Tracking file mtime for re-parse | `os.path.getmtime` + custom dict caches | Read `mtime` directly into `sessions.jsonl_mtime`; compare against `synced_at` | Already in schema; no separate cache to keep consistent |
| Local timezone resolution | `time.tzname` parsing or hardcoded offsets | `datetime.astimezone()` (no arg) — uses OS tz natively | Stdlib, correct, handles DST, no hardcoding |
| Streaming line reader for huge files | `mmap` or `aiofiles` | Plain `for line in open(path):` inside `asyncio.to_thread()` | File sizes are small in practice; simplicity wins |
| OTLP retry/backoff logic on the server side | Custom retry queue, raw_otel_buffer table | Just always-200; let Claude Code's exporter retry on its own (it does for transient errors) | Spec-compliant; the exporter is the retry source of truth |

**Key insight:** OTLP clients retry only on 429/502/503/504. Anything else (4xx, network drop) is a permanent loss. The server-side guarantee "always return 200, even if internal processing fails" is non-negotiable per PITFALLS.md Pitfall 4 — and it removes the need to build any server-side replay infrastructure.

## Runtime State Inventory

> Phase 2 is greenfield (new ingest module + new tables). Not a rename/refactor — but flagging known runtime state Phase 2 introduces, so future renames/migrations have an audit trail.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New rows: `sessions`, `tools`, `token_usage`, `otel_events`, `otel_metrics` (all tables already migrated by Phase 1 Alembic 0001_initial) | None — schema already in place. |
| Live service config | None — Phase 2 introduces no external services. | None. |
| OS-registered state | None — Phase 2 is in-process; Phase 8 introduces launchd plist. | None. |
| Secrets/env vars | New optional setting: `JSONL_ROOT` (defaults to `~/.claude/projects`). No secrets. | Document in `.env.example`. |
| Build artifacts | None new beyond Phase 1's package install. | None. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.13 | Runtime | ✓ | 3.13 (already used in Phase 1) | — |
| sqlalchemy 2.0.49 | Upserts (`dialects.sqlite`) | ✓ | 2.0.49 (already in pyproject.toml) | — |
| sqlmodel 0.0.38 | Existing models | ✓ | 0.0.38 | — |
| aiosqlite 0.22.1 | Async SQLite driver | ✓ | 0.22.1 | — |
| `~/.claude/projects/` directory | INGST-01 file source | ✓ | exists with real session files [VERIFIED] | If absent, sync logs warning and skips silently. |
| pytest 9.0+ | Tests | ✓ | already a dev dep | — |
| pytest-freezer 0.4.9 | Local-tz bucketing tests | ✗ | — | Add to `[project.optional-dependencies].dev` |
| `freezegun` | Underlying time-freeze lib | (transitive of pytest-freezer) | 1.5.5 | Or use `pytest-freezer` directly which wraps it |
| Network connectivity | None — Phase 2 is purely inbound HTTP and local filesystem | n/a | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `pytest-freezer` — install via `uv add --dev pytest-freezer`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0+ with pytest-asyncio (auto mode) [CITED: pyproject.toml] |
| Config file | `backend/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command | `cd backend && pytest tests/test_phase2_ingest.py -x -q` |
| Full suite command | `cd backend && pytest -q` |
| Phase-1 tests still passing? | Must remain green — `test_phase1_boot.py` has 25 tests; do not break them |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INGST-01 | JSONL scraper enumerates `~/.claude/projects/*/*.jsonl`; runs every 120s | unit + integration | `pytest tests/test_phase2_ingest.py -k scrape -x` | ❌ Wave 0 (creates test_phase2_ingest.py) |
| INGST-02 | Parser extracts token usage | unit | `pytest tests/test_phase2_ingest.py -k token_usage -x` | ❌ Wave 0 |
| INGST-03 | Parser pairs tool_use/result by tool_use_id; caps at 10 min | unit | `pytest tests/test_phase2_ingest.py -k tool_pair -x` | ❌ Wave 0 |
| INGST-04 | Upserts session row; re-parses on mtime change | unit | `pytest tests/test_phase2_ingest.py -k upsert_session -x` | ❌ Wave 0 |
| INGST-05 | Daily token_usage rollups bucketed by local-time day | unit | `pytest tests/test_phase2_ingest.py -k local_day_bucket -x` | ❌ Wave 0 (needs pytest-freezer) |
| INGST-06 | Corrupted JSONL lines logged + skipped, sync continues | unit | `pytest tests/test_phase2_ingest.py -k corrupted -x` | ❌ Wave 0 |
| INGST-07 | `/v1/logs` always returns 200; per-record try/except | integration | `pytest tests/test_phase2_ingest.py -k otlp_logs -x` | ❌ Wave 0 |
| INGST-08 | MCP server/tool extracted from tool_parameters or tool_name fallback | unit | `pytest tests/test_phase2_ingest.py -k mcp_attrs -x` | ❌ Wave 0 |
| INGST-09 | `/v1/metrics` accepts sum/gauge/histogram, persists rows | integration | `pytest tests/test_phase2_ingest.py -k otlp_metrics -x` | ❌ Wave 0 |
| INGST-10 | `POST /api/sync` triggers a sync cycle | integration | `pytest tests/test_phase2_ingest.py -k manual_sync -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pytest tests/test_phase2_ingest.py -x -q`
- **Per wave merge:** `pytest -q` (full suite — must include Phase 1 tests staying green)
- **Phase gate:** Full suite green + a manual smoke (`uvicorn cmc.app:create_app --factory` + observe one full sync cycle in logs + curl POST /v1/logs with a sample payload)

### Wave 0 Gaps
- [ ] `tests/test_phase2_ingest.py` — single file holding all INGST-* tests (per Phase 1 convention)
- [ ] Add fixtures to `conftest.py`: `fake_jsonl_dir`, `golden_jsonl_session`, `otlp_log_payload`, `otlp_metric_payload`
- [ ] Add `pytest-freezer>=0.4` to `[project.optional-dependencies].dev` in `pyproject.toml`
- [ ] Add `Settings.jsonl_root: Path = Path.home() / ".claude/projects"` to `cmc/config/settings.py` (also add to `.env.example`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Localhost-only; no auth layer (PROJECT.md decision) |
| V3 Session Management | no | No user sessions |
| V4 Access Control | partial | `/v1/logs` and `/v1/metrics` accept anything from localhost. Bind to `127.0.0.1` only (already enforced by `Settings.host`). |
| V5 Input Validation | yes | OTLP endpoints accept arbitrary JSON; per-record try/except prevents crashes. JSONL parser uses lenient `try/except json.JSONDecodeError`. Both bound by FastAPI's request body size limit (configurable; default 1MB — may need raise for OTLP batches). |
| V6 Cryptography | no | No secrets handled by Phase 2. |
| V7 Error Handling & Logging | yes | Structured logs (structlog from Phase 1). NEVER log raw OTLP payload bodies — they may contain user prompts when `OTEL_LOG_USER_PROMPTS=1` was set client-side. |

### Known Threat Patterns for FastAPI + SQLite + OTLP

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| OTLP endpoint flooded by misconfigured client (PITFALLS.md security mistake #2) | DoS | Body size cap (10MB recommended); per-request rate limit (1000/s default — most likely never hit on localhost) |
| SQL injection via OTLP attribute values stored to JSON column | Tampering | SQLAlchemy ORM uses parameter binding; JSON column stores opaque blob — no user-controlled string interpolated into SQL |
| Path traversal in JSONL scraper (e.g., user has a symlink in `~/.claude/projects` pointing to `/etc/passwd`) | Tampering | Glob pattern restricts to `*.jsonl` extension; parser reads as JSON and skips invalid; no shell evaluation |
| Logging user prompt content | Information disclosure | Treat `claude_code.user_prompt.prompt` attribute and `body.stringValue` as sensitive; store but don't log at INFO. (The schema already keeps these in the `body` JSON column.) |

## Code Examples

### Sync orchestration (one cycle)
```python
# cmc/ingest/scheduler.py
import asyncio
import logging
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker

from cmc.config import Settings
from cmc.ingest.jsonl_parser import parse_session_file
from cmc.ingest.repository import (
    upsert_session, upsert_tools, accumulate_token_usage,
    get_existing_session_totals,
)

log = logging.getLogger(__name__)


async def sync_once(sessionmaker: async_sessionmaker, settings: Settings) -> dict:
    """One full ingestion cycle. Returns summary for logs / API response."""
    started = asyncio.get_event_loop().time()
    summary = {"files_seen": 0, "files_updated": 0, "errors": 0}
    root = Path(settings.jsonl_root).expanduser()
    if not root.is_dir():
        log.warning("ingest.jsonl_root_missing path=%s", root)
        return {**summary, "duration_ms": 0}

    for jsonl_path in root.glob("*/*.jsonl"):
        summary["files_seen"] += 1
        try:
            mtime = datetime.fromtimestamp(jsonl_path.stat().st_mtime)
            async with sessionmaker() as db:
                # Decide whether to re-parse: existing session ended? mtime newer?
                existing = await get_existing_session_totals(db, jsonl_path)
                if existing and existing.ended_at and existing.jsonl_mtime >= mtime:
                    continue  # no change

                parsed = await asyncio.to_thread(parse_session_file, jsonl_path)
                if not parsed["session"].get("session_id"):
                    continue  # empty / unparseable

                sess = parsed["session"]
                # Decide ended_at via mtime heuristic
                idle_threshold = timedelta(minutes=settings.session_idle_minutes)
                if datetime.now() - mtime > idle_threshold:
                    sess["ended_at"] = sess.pop("_last_message_ts")
                else:
                    sess.pop("_last_message_ts", None)
                sess["jsonl_path"] = str(jsonl_path)
                sess["jsonl_mtime"] = mtime
                sess["synced_at"] = datetime.utcnow()
                sess["source"] = "claude-code"
                sess["project_hash"] = jsonl_path.parent.name

                # If we're re-parsing, subtract previous contribution before adding (Option B from §4)
                # ...
                await upsert_session(db, **sess)
                await upsert_tools(db, sess["session_id"], parsed["tool_calls"])
                await accumulate_token_usage(db, parsed["token_usage_buckets"])
                await db.commit()
                summary["files_updated"] += 1
        except Exception:
            log.exception("ingest.file_error path=%s", jsonl_path)
            summary["errors"] += 1

    summary["duration_ms"] = int((asyncio.get_event_loop().time() - started) * 1000)
    return summary


async def periodic_sync_loop(sessionmaker, settings: Settings, interval_s: int = 120) -> None:
    while True:
        try:
            await asyncio.sleep(interval_s)
            summary = await sync_once(sessionmaker, settings)
            log.info("ingest.cycle %s", summary)
        except asyncio.CancelledError:
            log.info("ingest.cycle_cancelled")
            raise
        except Exception:
            log.exception("ingest.cycle_unexpected_error")
```

### OTLP endpoint
```python
# cmc/api/routes/ingest.py
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from cmc.db import get_session
from cmc.db.models.otel_events import OtelEvent
from cmc.db.models.otel_metrics import OtelMetric
from cmc.ingest.otel_parser import extract_mcp_attrs, parse_unix_nano

log = logging.getLogger(__name__)

router = APIRouter()


@router.post("/v1/logs")
async def otlp_logs(request: Request, db: AsyncSession = Depends(get_session)) -> JSONResponse:
    """OTLP/HTTP JSON logs endpoint. Always returns 200 (Pitfall 4)."""
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({}, status_code=200)

    if not isinstance(payload, dict):
        return JSONResponse({}, status_code=200)

    accepted = 0
    for rl in payload.get("resourceLogs", []) or []:
        if not isinstance(rl, dict): continue
        for sl in rl.get("scopeLogs", []) or []:
            if not isinstance(sl, dict): continue
            for record in sl.get("logRecords", []) or []:
                if not isinstance(record, dict): continue
                try:
                    attrs_dict = {a["key"]: a.get("value", {}) for a in record.get("attributes", []) if isinstance(a, dict) and "key" in a}
                    event_name_attr = attrs_dict.get("event.name", {})
                    event_name = event_name_attr.get("stringValue") or "unknown"
                    session_id_attr = attrs_dict.get("session_id", {})
                    session_id = session_id_attr.get("stringValue")
                    ts = parse_unix_nano(record.get("timeUnixNano") or record.get("observedTimeUnixNano"))
                    mcp_server, mcp_tool = extract_mcp_attrs(record)
                    db.add(OtelEvent(
                        ts=ts or datetime.now(timezone.utc),
                        event_name=event_name,
                        session_id=session_id,
                        body={"record": record, "resource": rl.get("resource", {}), "scope": sl.get("scope", {})},
                        attrs_mcp_server=mcp_server,
                        attrs_mcp_tool=mcp_tool,
                    ))
                    accepted += 1
                except Exception:
                    log.exception("otel.log_record_skip")
                    continue
    try:
        await db.commit()
    except Exception:
        log.exception("otel.logs_commit_error")
        await db.rollback()
    return JSONResponse({}, status_code=200)


@router.post("/v1/metrics")
async def otlp_metrics(request: Request, db: AsyncSession = Depends(get_session)) -> JSONResponse:
    """OTLP/HTTP JSON metrics endpoint. Always returns 200."""
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({}, status_code=200)
    if not isinstance(payload, dict):
        return JSONResponse({}, status_code=200)

    for rm in payload.get("resourceMetrics", []) or []:
        if not isinstance(rm, dict): continue
        for sm in rm.get("scopeMetrics", []) or []:
            if not isinstance(sm, dict): continue
            for metric in sm.get("metrics", []) or []:
                try:
                    name = metric.get("name") or "unknown"
                    unit = metric.get("unit")
                    # Discriminate kind by which key is present
                    for kind, key in [("counter", "sum"), ("gauge", "gauge"),
                                      ("histogram", "histogram"), ("summary", "summary")]:
                        if key not in metric: continue
                        kind_block = metric[key] or {}
                        for dp in kind_block.get("dataPoints", []) or []:
                            try:
                                ts = parse_unix_nano(dp.get("timeUnixNano"))
                                if "asInt" in dp:
                                    value = float(int(dp["asInt"]))
                                elif "asDouble" in dp:
                                    value = float(dp["asDouble"])
                                elif kind == "histogram":
                                    value = float(dp.get("sum", 0) or 0)  # store sum; count separately if needed
                                else:
                                    value = 0.0
                                attrs = {a["key"]: a.get("value", {}) for a in (dp.get("attributes") or []) if isinstance(a, dict)}
                                db.add(OtelMetric(
                                    ts=ts or datetime.now(timezone.utc),
                                    metric_name=name, value=value, kind=kind, unit=unit,
                                    attrs={"data_point": dp, "metric_attrs": attrs},
                                ))
                            except Exception:
                                log.exception("otel.metric_point_skip")
                                continue
                        break  # only one kind per metric
                except Exception:
                    log.exception("otel.metric_skip")
                    continue
    try:
        await db.commit()
    except Exception:
        log.exception("otel.metrics_commit_error")
        await db.rollback()
    return JSONResponse({}, status_code=200)
```

### Wiring into app factory
```python
# cmc/api/routes/__init__.py — extended for Phase 2
from fastapi import APIRouter
from cmc.api.routes.health import router as health_router
from cmc.api.routes.sync import router as sync_router
from cmc.api.routes.ingest import router as otlp_router

def all_routers() -> list[APIRouter]:
    """Routers mounted under /api."""
    return [health_router, sync_router]

def raw_routers() -> list[APIRouter]:
    """Routers mounted at root path (OTLP /v1/logs, /v1/metrics)."""
    return [otlp_router]
```
```python
# cmc/app/factory.py — extended (between Phase 1 lines 47 and 53)
for router in all_routers():
    app.include_router(router, prefix="/api")
for router in raw_routers():           # NEW
    app.include_router(router)         # mounted at the path defined inside the router
# SPA mount stays last per Pitfall 8
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Subagent JSONL files are out of scope for Phase 2 | §1 | If user expects subagent token attribution, totals will undercount per-task tokens. **Defer to user via discuss-phase if subagent breakdown is needed.** |
| A2 | Session end is inferred from `mtime > 5 minutes` ago | §1, §8-Pitfall 2 | Sessions in `live` view may stay there ~5 min after actual end. 5 min default is editable; recommend `Settings.session_idle_minutes`. |
| A3 | OTLP/HTTP `application/x-protobuf` requests can be rejected with 415 in Phase 2 | §2 | Claude Code's default exporter MAY use protobuf if user sets `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`. Spec docs show JSON as one option, protobuf as another. **Recommend planner verify default Claude Code protocol is JSON; if protobuf is the default, Phase 2 must add protobuf parsing.** [CITED: monitoring docs show grpc/http variants but don't pin a JSON default.] |
| A4 | `tool_parameters` attribute (with `mcp_server_name`/`mcp_tool_name`) is ONLY set when `OTEL_LOG_TOOL_DETAILS=1` | §2, INGST-08 | If user does not opt in, fallback to `tool_name` split on `__` covers it. Risk = LOW. |
| A5 | Token usage rollups should subtract previous session contribution on re-parse (Option B) | §4 | Without subtraction, repeated re-parses of an in-progress session inflate the daily bucket. Option A (per-session contribution table) is more correct but heavier. |
| A6 | Glob `*/*.jsonl` (one level) excludes subagents/ subdir | §1, §8-Pitfall 5 | Verified via filesystem inspection that subagents/ is one level deeper. Glob `*/*.jsonl` correctly skips it. |
| A7 | `claude_code.tool_result` is the right event name to filter for MCP attribute extraction (INGST-08) | §2 | The requirement says "for mcp_tool events" — the actual event name is `tool_result` whose `tool_name` starts `mcp__`. Naming may have drifted. |
| A8 | OTLP histogram metrics should be stored with `value = sum` (not count, not bucket counts) | §2, INGST-09 | Schema's `otel_metrics.value` is a single float. Phase 2 needs to choose. Sum is more useful for OBSV-09 productivity rollups. Bucket detail goes into the `attrs` JSON column. |
| A9 | Phase 2 does not need byte-offset incremental parsing of JSONL files | §1, §5 | Real files observed are 50-250 lines. PITFALLS.md Pitfall 5 flags 100MB+ as the trigger. If user has long-running sessions producing >10MB files, sync cycles slow but don't break. |
| A10 | `pytest-freezer` over `freezegun` direct | §7 | Cosmetic — pytest plugin is friendlier; both work. |
| A11 | Background scheduler is in-process via `asyncio.create_task`, not APScheduler/launchd | §3 | Locked decision rationale: single-process FastAPI; PROJECT.md restricts to launchd only for the dispatcher (Phase 8). |
| A12 | `Settings.jsonl_root` field is added in Phase 2 (not retroactively in Phase 1) | §7-Wave 0, §8-Pitfall 8 | Adds one field with default `~/.claude/projects`. Trivial but must update `.env.example`. |

## Open Questions / Risks

1. **OTLP protocol default in Claude Code is JSON or protobuf?**
   - What we know: Claude Code monitoring docs show env vars `OTEL_EXPORTER_OTLP_PROTOCOL=grpc` (default in many examples) and mention `http/json` and `http/protobuf` as HTTP variants.
   - What's unclear: which is the literal default when user just sets `CLAUDE_CODE_ENABLE_TELEMETRY=1` and `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:8765`?
   - Recommendation: planner should write `setup_otel.py` (Phase 9) to set `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` explicitly. For Phase 2, document JSON-only and reject protobuf with 415; if integration testing reveals protobuf is the default, add protobuf decoder in a follow-up plan.

2. **Subagent JSONL ingestion — required for v1?**
   - What we know: subagent files exist and are appended-to during Task tool calls. Parent session's JSONL has the Task `tool_use` block but not the subagent's full transcript.
   - What's unclear: does the user expect per-subagent token attribution in OBSV-07 (agent fanout)?
   - Recommendation: **discuss-phase question for the user.** Default to "out of scope for Phase 2" unless user pushes back.

3. **`session_idle_minutes` default — 5 minutes too short or too long?**
   - What we know: SESS-03 defines "live sessions" as last_activity within 5 min. So aligning the ended_at threshold with 5 min is consistent.
   - What's unclear: a brief network hiccup or `claude` background pause may leave files unmodified for 5+ min during an active session.
   - Recommendation: 5 min default; expose as setting; let user tune. Document in `.env.example`.

4. **Token usage Option A vs Option B (§4) — which does the planner pick?**
   - What we know: Option A (per-session contribution sub-table) is more correct on re-parse; Option B (subtract-previous) is simpler but requires reading existing totals before each upsert.
   - What's unclear: how often does Phase 2 expect to re-parse? Every 120s for in-progress sessions = ~720 re-parses/day for a heavy user. Option B's read-before-write is fine at that scale.
   - Recommendation: **Option B** for v1. Add explicit task to compute `delta = new_totals - existing_totals` before upserting to `token_usage`.

5. **MCP attribute extraction — what happens if `OTEL_LOG_TOOL_DETAILS=1` is NOT set client-side?**
   - What we know: Without it, `tool_parameters` is absent. The fallback (split `tool_name` on `__`) recovers `mcp_server_name` and `mcp_tool_name` from the tool name itself.
   - What's unclear: but the docs also imply that without details, the tool_name itself may be redacted (e.g., MCP commands "collapse to `mcp` unless `OTEL_LOG_TOOL_DETAILS=1`"). Need to verify whether `tool_result.tool_name` is preserved or redacted.
   - Recommendation: **always populate `attrs_mcp_server` and `attrs_mcp_tool` columns when extractable; leave NULL if both methods fail.** Add a smoke test that runs a real Claude Code session against the dashboard and verifies the columns are populated for at least one MCP call.

6. **Body-size limit on OTLP endpoints?**
   - What we know: FastAPI inherits Starlette's request body limit (default unlimited). Pitfall 4 / security #2 recommends a 10MB cap.
   - What's unclear: does Claude Code's exporter ever batch larger than 10MB? Spec says batches can be arbitrarily large.
   - Recommendation: 10MB cap as Phase 2 default via Starlette's `Request.body()` size check; raise to 50MB later if real users hit it.

7. **WAL checkpoint hygiene during high-frequency OTEL writes (PITFALLS.md Pitfall 1)?**
   - What we know: 30s polling from frontend keeps readers active; OTEL writes arrive every 5s for logs; combined could starve the WAL checkpoint.
   - What's unclear: does Phase 2's load actually trigger this? Phase 1 already set `journal_size_limit=64MB` and `wal_autocheckpoint` defaults.
   - Recommendation: keep Phase 1's pragmas as-is. Add a WAL-size health check to Phase 9's `doctor.py`. Add a periodic `PRAGMA wal_checkpoint(TRUNCATE)` (every 60s) to the same lifespan task family — but flag as an optional follow-up plan, not a Phase 2 blocker.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `dict.get()` chains for OTLP parsing | Pydantic models with `extra="allow"` | Pydantic 2.x | Cleaner, validates structure, but Pydantic-induced exceptions must still be caught (return 200) |
| `INSERT OR REPLACE` for upserts | `INSERT ... ON CONFLICT ... DO UPDATE` | SQLite 3.24+ (2018), well-supported | OR REPLACE deletes-then-inserts, breaking FK rows; ON CONFLICT preserves them |
| Threading + `time.sleep` for periodic tasks | `asyncio.create_task` + `asyncio.sleep` from FastAPI lifespan | FastAPI 0.93+ stable lifespan | Single event loop, no GIL contention for I/O-bound work, simpler shutdown |
| `datetime.utcnow()` (deprecated in Python 3.12) | `datetime.now(timezone.utc)` | Python 3.12 deprecation | Avoid mixing naive/aware dt; explicit UTC is safer |

**Deprecated/outdated:**
- `datetime.utcnow()`: deprecated in Python 3.12 [CITED: docs.python.org/3/library/datetime.html]. Phase 1's models use it (e.g., `default_factory=datetime.utcnow`). For Phase 2's NEW code, prefer `lambda: datetime.now(timezone.utc)`. Don't refactor Phase 1 models in Phase 2 — bigger change, separate plan.
- `OTEL_LOGS_EXPORTER=none` is BROKEN in Claude Code [CITED: github.com/anthropics/claude-code/issues/38454] — disabling logs exporter crashes telemetry init. Not Phase 2's problem (we're the receiver), but worth knowing for `setup_otel.py` (Phase 9).

## Sources

### Primary (HIGH confidence)
- **JSONL format**: direct filesystem inspection of `/Users/patrykattc/.claude/projects/-Users-patrykattc-work-git-claude-mission-control/{e07072f4,e7955e92,8eb7e0b1}-*.jsonl` (real session files; verified message types, usage block keys, tool_use/tool_result shape, MCP tool name pattern). [VERIFIED 2026-04-25]
- **OTLP/HTTP spec** — https://opentelemetry.io/docs/specs/otlp/ — endpoint paths, content types, success/failure response contract, gzip support
- **OTLP logs JSON example** — https://github.com/open-telemetry/opentelemetry-proto/blob/main/examples/logs.json — full LogRecord shape
- **OTLP metrics JSON example** — https://github.com/open-telemetry/opentelemetry-proto/blob/main/examples/metrics.json — sum/gauge/histogram shapes
- **Claude Code OTEL events catalog** — https://code.claude.com/docs/en/monitoring-usage — every `claude_code.*` event name, attributes per event, metric names
- **SQLAlchemy 2.0 SQLite dialect upserts** — https://docs.sqlalchemy.org/en/20/dialects/sqlite.html — `insert(...).on_conflict_do_update(...)` examples
- **Phase 1 RESEARCH.md** (`.planning/phases/01-foundation-database/01-RESEARCH.md`) — version-verified stack (FastAPI 0.136.1, SQLAlchemy 2.0.49, etc.); pitfall registry shared across phases
- **Phase 1 SCHEMA.md** (`.planning/phases/01-foundation-database/01-01-SCHEMA.md`) — canonical 15-table schema; sessions, tools, otel_events, otel_metrics, token_usage definitions used throughout this research
- **Existing codebase**: `backend/cmc/app/factory.py`, `cmc/app/lifespan.py`, `cmc/db/engine.py`, `cmc/db/session.py`, `cmc/db/models/*.py`, `cmc/api/routes/health.py` — existing wiring patterns to extend
- **Phase 1 PITFALLS.md** (`.planning/research/PITFALLS.md`) — Pitfalls 1, 2, 4, 5, 8 directly applicable to Phase 2

### Secondary (MEDIUM confidence)
- FastAPI lifespan + `asyncio.create_task` for periodic background work — pattern recommended by FastAPI tiangolo discussions and validated against multiple 2025-2026 articles (https://fastapi.tiangolo.com/tutorial/background-tasks/, https://fastapi-utils.davidmontague.xyz/user-guide/repeated-tasks/)
- `freezegun` / `pytest-freezer` for time-bucket tests — widely used; verified on PyPI

### Tertiary (LOW confidence)
- Claim that the `tool_parameters` attribute (containing `mcp_server_name`) is JSON-stringified — inferred from monitoring docs phrasing "JSON string containing tool-specific parameters." Verify by capturing one real `/v1/logs` request from Claude Code and inspecting attribute value type.
- Default OTLP protocol when user does not set `OTEL_EXPORTER_OTLP_PROTOCOL` — multiple blog posts disagree on whether `grpc` or `http/protobuf` is the SDK default. Recommend Phase 9's `setup_otel.py` set it explicitly to `http/json`.

## Metadata

**Confidence breakdown:**
- JSONL format: HIGH — verified by direct file inspection on this exact machine
- OTLP wire format: HIGH — verified against opentelemetry-proto official examples
- Claude Code event/metric names: HIGH — verified against official monitoring docs
- Idempotent upsert pattern (SQLAlchemy 2.0 SQLite): HIGH — verified against SQLAlchemy 2.0 dialect docs
- Background scheduler pattern: HIGH — verified against FastAPI lifespan docs and existing Phase 1 lifespan.py
- Local-time bucketing: HIGH — `astimezone()` no-arg behavior verified in Python 3.13 stdlib
- Phase 2 specific pitfalls (subagents, session-end inference, file-during-scrape): MEDIUM — derived from observed JSONL format + PITFALLS.md analogous patterns; first-party verification will come from Phase 2 acceptance testing

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 for OTLP spec (mature; doesn't churn). Valid until next Claude Code release for the event/attribute catalog (more volatile — verify before Phase 9 setup wizard).

## RESEARCH COMPLETE
