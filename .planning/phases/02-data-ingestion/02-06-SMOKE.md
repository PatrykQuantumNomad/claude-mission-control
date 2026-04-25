# Phase 2 Smoke Test (Plan 02-06)

This document records the end-to-end verification of Phase 2 against real
Claude Code data + recorded OTLP samples.

Run from REPO ROOT.

## Sample OTLP/HTTP JSON payloads

The two files below are used in Steps 3 and 4. Save them to `/tmp/` before running curl.

### `/tmp/otlp_logs_sample.json`

```json
{
  "resourceLogs": [{
    "resource": {"attributes": [
      {"key": "service.name", "value": {"stringValue": "claude-code"}}
    ]},
    "scopeLogs": [{
      "scope": {"name": "com.anthropic.claude_code.events"},
      "logRecords": [
        {
          "timeUnixNano": "1745601281385000000",
          "body": {"stringValue": "tool_result"},
          "attributes": [
            {"key": "event.name", "value": {"stringValue": "claude_code.tool_result"}},
            {"key": "session_id", "value": {"stringValue": "smoke-1"}},
            {"key": "tool_name", "value": {"stringValue": "Bash"}},
            {"key": "duration_ms", "value": {"intValue": "1234"}}
          ]
        },
        {
          "timeUnixNano": "1745601282385000000",
          "body": {"stringValue": "tool_result"},
          "attributes": [
            {"key": "event.name", "value": {"stringValue": "claude_code.tool_result"}},
            {"key": "session_id", "value": {"stringValue": "smoke-1"}},
            {"key": "tool_name", "value": {"stringValue": "mcp__myserver__do_thing"}}
          ]
        }
      ]
    }]
  }]
}
```

### `/tmp/otlp_metrics_sample.json`

```json
{
  "resourceMetrics": [{
    "resource": {"attributes": [
      {"key": "service.name", "value": {"stringValue": "claude-code"}}
    ]},
    "scopeMetrics": [{
      "scope": {"name": "com.anthropic.claude_code.metrics"},
      "metrics": [
        {
          "name": "claude_code.token.usage",
          "unit": "tokens",
          "sum": {
            "aggregationTemporality": 2,
            "isMonotonic": true,
            "dataPoints": [{
              "timeUnixNano": "1745601281385000000",
              "asInt": "47855",
              "attributes": [
                {"key": "type", "value": {"stringValue": "input"}}
              ]
            }]
          }
        },
        {
          "name": "claude_code.session.count",
          "gauge": {
            "dataPoints": [{
              "timeUnixNano": "1745601281385000000",
              "asInt": "3"
            }]
          }
        }
      ]
    }]
  }]
}
```

## Smoke transcript

(executor fills below as the smoke runs)

### Step 1 — Boot

```
$ uvicorn --app-dir backend cmc.app:create_app --factory --host 127.0.0.1 --port 8765
... (paste stdout including the `ingest.boot_sync` line)
```

### Step 2 — Real data ingestion check

```
$ sqlite3 data/cmc.db "SELECT count(*), max(synced_at) FROM sessions;"
... (count should be > 0; synced_at should be recent)
```

### Step 3 — POST /v1/logs

```
$ curl -s -X POST http://127.0.0.1:8765/v1/logs \
    -H 'Content-Type: application/json' \
    -d @/tmp/otlp_logs_sample.json
... (expect: {})

$ sqlite3 data/cmc.db "SELECT event_name, attrs_mcp_server, attrs_mcp_tool FROM otel_events ORDER BY id DESC LIMIT 2;"
... (expect: 2 rows; one with attrs_mcp_server='myserver' attrs_mcp_tool='do_thing')
```

### Step 4 — POST /v1/metrics

```
$ curl -s -X POST http://127.0.0.1:8765/v1/metrics \
    -H 'Content-Type: application/json' \
    -d @/tmp/otlp_metrics_sample.json
... (expect: {})

$ sqlite3 data/cmc.db "SELECT metric_name, kind, value FROM otel_metrics ORDER BY id DESC LIMIT 3;"
... (expect: counter row + gauge row)
```

### Step 5 — POST /api/sync

```
$ curl -s -X POST http://127.0.0.1:8765/api/sync
... (expect: {"status":"ok","files_seen":N,...})
```

### Step 6 — Clean shutdown

- Press Ctrl+C in the uvicorn terminal.
- Confirm: no `Task was destroyed but it is pending` warnings.
- Confirm: no `RuntimeError` from disposed engines.

### Step 7 — Path resolution regression

```
$ ls -la data/cmc.db data/cmc.db-wal data/cmc.db-shm
$ ls -la backend/data/cmc.db 2>/dev/null && echo "REGRESSION" || echo "OK"
... (expect: WAL siblings present at repo root; no backend/data/cmc.db)
```

## Result

(executor records "approved" or failure description after Step 7)
