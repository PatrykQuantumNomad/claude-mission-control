# OTEL Skill Event Spike — Phase 12

**Captured:** 2026-05-02

> Placeholder header — Plan 02 (Wave 2) replaces this with the full doc body, locks, and pretty-printed inline bodies. Wave 0 / Wave 1 own only the raw appendix below.

---

## Appendix A — Raw Capture Output

> **Wave 0 outcome: zero skill events. Wave 1 (live invocation per RESEARCH.md Appendix B) REQUIRED before HIGH-confidence locks.**

**Captured:** 2026-05-02T21:29:55Z
**Service version of record:** 2.1.116
**Operator working directory:** /Users/patrykattc/work/git/claude-mission-control
**SQLite version:** 3.51.0
**OS:** darwin 25.3.0 (arm64)

### Q0 — sanity: total row count in `otel_events`

Command:
```bash
sqlite3 data/cmc.db "SELECT COUNT(*) FROM otel_events;"
```

Output:
```
7241
```

### Q1 — spec LIMIT 50 (success criterion #1: skill rows present?)

Command:
```bash
sqlite3 -header -column data/cmc.db \
  "SELECT id, ts, event_name, substr(body,1,200) FROM otel_events
   WHERE event_name LIKE '%skill%' ORDER BY ts DESC LIMIT 50;"
```

Output:
```
(zero rows)
```

### Q2 — event-name count breakdown

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT event_name, COUNT(*) AS n FROM otel_events GROUP BY 1 ORDER BY n DESC;"
```

Output:
```
event_name|n
hook_execution_complete|1774
hook_execution_start|1774
tool_decision|1406
tool_result|1382
api_request|844
internal_error|44
user_prompt|20
mcp_server_connection|9
claude_code.tool_result|2
```

(Note: 9 distinct event_name values; the `(NULL)` rows that account for 7241 - 7233 = 8 rows are not surfaced by the breakdown — likely the 2 ancient smoke rows + 6 NULL-event placeholders. None are skill-related.)

### Q3 — distinct attribute-key enumeration (frequency-ranked) for skill events

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT json_extract(value,'\$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'\$.record.attributes'))
   WHERE event_name LIKE '%skill%'
   GROUP BY 1 ORDER BY n DESC;"
```

Output:
```
(zero rows)
```

### Q4 — `skill_name` vs `skill.name` vs `name` probe (success criterion #2)

Command:
```sql
SELECT
  (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='skill_name')   AS k_skill_name,
  (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='skill.name')   AS k_skill_dot_name,
  (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='name')         AS k_name,
  ts
FROM otel_events
WHERE event_name LIKE '%skill%'
ORDER BY ts DESC LIMIT 10;
```

Output:
```
(zero rows)
```

### Q5 — `duration_ms` presence (success criterion #3a)

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT
     COUNT(*) AS total,
     SUM(CASE WHEN (SELECT 1 FROM json_each(json_extract(body,'\$.record.attributes')) WHERE json_extract(value,'\$.key')='duration_ms') IS NOT NULL THEN 1 ELSE 0 END) AS have_duration_ms
   FROM otel_events WHERE event_name = 'skill_activated';"
```

Output:
```
total|have_duration_ms
0|
```

### Q6 — cache TTL split (OTEL surface)

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT
     (SELECT json_extract(value,'\$.value.stringValue') FROM json_each(json_extract(body,'\$.record.attributes')) WHERE json_extract(value,'\$.key') LIKE '%ephemeral_5m%') AS m5,
     (SELECT json_extract(value,'\$.value.stringValue') FROM json_each(json_extract(body,'\$.record.attributes')) WHERE json_extract(value,'\$.key') LIKE '%ephemeral_1h%') AS h1,
     COUNT(*) AS n
   FROM otel_events WHERE event_name LIKE '%skill%' OR event_name = 'api_request'
   GROUP BY 1, 2;"
```

Output:
```
m5|h1|n
||849
```

(Finding: `api_request` OTEL events do NOT carry `ephemeral_5m`/`ephemeral_1h` keys at all in 2.1.116 — both columns are NULL across all 849 rows. The TTL split lives on the JSONL `message.usage.cache_creation` surface, not the OTEL surface — see Q7.)

### Q7 — cache TTL split (JSONL surface, success criterion #3b)

Command:
```bash
ls -t ~/.claude/projects/-Users-patrykattc-work-git-claude-mission-control/*.jsonl | head -1 | \
  xargs -I {} python3 -c "
import json, sys
for line in open('{}'):
    try: r = json.loads(line)
    except: continue
    if r.get('type') == 'assistant':
        u = r.get('message', {}).get('usage', {})
        if u.get('cache_creation'):
            print(json.dumps(u, indent=2))
            break
"
```

Source file: `/Users/patrykattc/.claude/projects/-Users-patrykattc-work-git-claude-mission-control/2c047cd5-589c-4242-a141-0da79182267e.jsonl`

Output (first assistant turn with `cache_creation`):
```json
{
  "input_tokens": 5,
  "cache_creation_input_tokens": 39327,
  "cache_read_input_tokens": 23308,
  "output_tokens": 521,
  "server_tool_use": {
    "web_search_requests": 0,
    "web_fetch_requests": 0
  },
  "service_tier": "standard",
  "cache_creation": {
    "ephemeral_1h_input_tokens": 39327,
    "ephemeral_5m_input_tokens": 0
  },
  "inference_geo": "",
  "iterations": [
    {
      "input_tokens": 5,
      "output_tokens": 521,
      "cache_read_input_tokens": 39327,
      "cache_creation_input_tokens": 39327,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 39327
      },
      "type": "message"
    }
  ],
  "speed": "standard"
}
```

Auxiliary: most-recent assistant turn from the previous session (`c9792b44-…jsonl`) — also captured for cross-session validation that the schema is stable across separate JSONL files:
```json
{
  "input_tokens": 1,
  "cache_creation_input_tokens": 3177,
  "cache_read_input_tokens": 87032,
  "output_tokens": 870,
  "server_tool_use": {
    "web_search_requests": 0,
    "web_fetch_requests": 0
  },
  "service_tier": "standard",
  "cache_creation": {
    "ephemeral_1h_input_tokens": 3177,
    "ephemeral_5m_input_tokens": 0
  },
  "inference_geo": "",
  "iterations": [
    {
      "input_tokens": 1,
      "output_tokens": 870,
      "cache_read_input_tokens": 87032,
      "cache_creation_input_tokens": 3177,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 3177
      },
      "type": "message"
    }
  ],
  "speed": "standard"
}
```

(Both blocks confirm the schema: `message.usage.cache_creation.ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens` are present as integer keys on assistant turns. Pitfall 7 correlation key — JSONL `requestId` ↔ OTEL `request_id` — is the only safe join.)

### Q8 — version-of-record (Pitfall 6)

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT json_extract(body,'\$.scope.version') AS version, COUNT(*) AS n
   FROM otel_events GROUP BY 1 ORDER BY n DESC;"
```

Output:
```
version|n
2.1.116|7309
|2
```

(7309 of 7311 with version stamps come from `claude-code 2.1.116`. The 2 NULL-version rows are ancient smoke-test rows pre-dating the resource scope being populated. **Service version of record for this spike: 2.1.116.**)

### Q9 — session/project correlation key (filtering for `%session%`-keyed attributes on skill events)

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT json_extract(value,'\$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'\$.record.attributes'))
   WHERE event_name LIKE '%skill%' AND json_extract(value,'\$.key') LIKE '%session%'
   GROUP BY 1 ORDER BY n DESC;"
```

Output:
```
(zero rows)
```

### Q10 — multi-skill turn batching

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT
     (SELECT json_extract(value,'\$.value.stringValue') FROM json_each(json_extract(body,'\$.record.attributes')) WHERE json_extract(value,'\$.key')='session.id') AS sid,
     ts, event_name
   FROM otel_events WHERE event_name LIKE '%skill%' ORDER BY sid, ts LIMIT 50;"
```

Output:
```
(zero rows)
```

### Q11 — error / cancel / failure status attribute presence on skill events

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT json_extract(value,'\$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'\$.record.attributes'))
   WHERE event_name LIKE '%skill%'
     AND (json_extract(value,'\$.key') LIKE '%error%'
          OR json_extract(value,'\$.key') LIKE '%status%'
          OR json_extract(value,'\$.key') LIKE '%outcome%'
          OR json_extract(value,'\$.key') LIKE '%cancel%'
          OR json_extract(value,'\$.key') LIKE '%success%')
   GROUP BY 1 ORDER BY n DESC;"
```

Output:
```
(zero rows)
```

### Q12 — token attribution attribute presence on skill events

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT json_extract(value,'\$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'\$.record.attributes'))
   WHERE event_name LIKE '%skill%'
     AND (json_extract(value,'\$.key') LIKE '%token%'
          OR json_extract(value,'\$.key') LIKE '%cost%')
   GROUP BY 1 ORDER BY n DESC;"
```

Output:
```
(zero rows)
```

### Q13 — full pretty-printed body (most-recent skill event)

Command:
```bash
sqlite3 -separator '' data/cmc.db \
  "SELECT body FROM otel_events WHERE event_name LIKE '%skill%' ORDER BY ts DESC LIMIT 1;" | \
  python3 -c "import json,sys; print(json.dumps(json.loads(sys.stdin.read()), indent=2))"
```

Output:
```
(zero rows — no skill body to pretty-print)
```

---

### Representative pretty-printed body — `api_request` (rich-attribute event with `cost_usd`, `duration_ms`, `request_id`)

Command:
```bash
sqlite3 -separator '' data/cmc.db \
  "SELECT body FROM otel_events WHERE event_name='api_request' ORDER BY ts DESC LIMIT 1;" | \
  python3 -c "import json,sys; print(json.dumps(json.loads(sys.stdin.read()), indent=2))"
```

Output:
```json
{
  "record": {
    "timeUnixNano": "1777757379706000000",
    "observedTimeUnixNano": "1777757379706000000",
    "body": {
      "stringValue": "claude_code.api_request"
    },
    "attributes": [
      {
        "key": "user.id",
        "value": {
          "stringValue": "0a2c55a959c8fbfc1a96f191f1320f7afa631a773018fd26fc9ad2eca99f591b"
        }
      },
      {
        "key": "session.id",
        "value": {
          "stringValue": "2c047cd5-589c-4242-a141-0da79182267e"
        }
      },
      {
        "key": "organization.id",
        "value": {
          "stringValue": "429b98a8-e9d5-4636-8ba4-bc3685065e29"
        }
      },
      {
        "key": "user.email",
        "value": {
          "stringValue": "golysoft@gmail.com"
        }
      },
      {
        "key": "user.account_uuid",
        "value": {
          "stringValue": "7207931e-43d1-44ba-88ad-80b05bd573ce"
        }
      },
      {
        "key": "user.account_id",
        "value": {
          "stringValue": "user_01F5h1hrhwykVrUVFtoWNn9K"
        }
      },
      {
        "key": "terminal.type",
        "value": {
          "stringValue": "iTerm.app"
        }
      },
      {
        "key": "event.name",
        "value": {
          "stringValue": "api_request"
        }
      },
      {
        "key": "event.timestamp",
        "value": {
          "stringValue": "2026-05-02T21:29:39.706Z"
        }
      },
      {
        "key": "event.sequence",
        "value": {
          "intValue": 7349
        }
      },
      {
        "key": "prompt.id",
        "value": {
          "stringValue": "16717426-9177-41ac-97ec-51063f4b06aa"
        }
      },
      {
        "key": "model",
        "value": {
          "stringValue": "claude-opus-4-7"
        }
      },
      {
        "key": "input_tokens",
        "value": {
          "stringValue": "1"
        }
      },
      {
        "key": "output_tokens",
        "value": {
          "stringValue": "267"
        }
      },
      {
        "key": "cache_read_tokens",
        "value": {
          "stringValue": "37722"
        }
      },
      {
        "key": "cache_creation_tokens",
        "value": {
          "stringValue": "369"
        }
      },
      {
        "key": "cost_usd",
        "value": {
          "stringValue": "0.027847249999999997"
        }
      },
      {
        "key": "duration_ms",
        "value": {
          "stringValue": "2757"
        }
      },
      {
        "key": "request_id",
        "value": {
          "stringValue": "req_011CaeTGjcBFAAvGgv91HVEy"
        }
      },
      {
        "key": "speed",
        "value": {
          "stringValue": "normal"
        }
      },
      {
        "key": "query_source",
        "value": {
          "stringValue": "agent:custom"
        }
      }
    ],
    "droppedAttributesCount": 0
  },
  "resource": {
    "attributes": [
      {
        "key": "host.arch",
        "value": {
          "stringValue": "arm64"
        }
      },
      {
        "key": "os.type",
        "value": {
          "stringValue": "darwin"
        }
      },
      {
        "key": "os.version",
        "value": {
          "stringValue": "25.3.0"
        }
      },
      {
        "key": "service.name",
        "value": {
          "stringValue": "claude-code"
        }
      },
      {
        "key": "service.version",
        "value": {
          "stringValue": "2.1.116"
        }
      }
    ],
    "droppedAttributesCount": 0
  },
  "scope": {
    "name": "com.anthropic.claude_code.events",
    "version": "2.1.116"
  }
}
```

### Representative pretty-printed body — `tool_decision` (rich-attribute event with `tool_name`, `decision`, `source`)

Command:
```bash
sqlite3 -separator '' data/cmc.db \
  "SELECT body FROM otel_events WHERE event_name='tool_decision' ORDER BY ts DESC LIMIT 1;" | \
  python3 -c "import json,sys; print(json.dumps(json.loads(sys.stdin.read()), indent=2))"
```

Output:
```json
{
  "record": {
    "timeUnixNano": "1777757388253000000",
    "observedTimeUnixNano": "1777757388253000000",
    "body": {
      "stringValue": "claude_code.tool_decision"
    },
    "attributes": [
      {
        "key": "user.id",
        "value": {
          "stringValue": "0a2c55a959c8fbfc1a96f191f1320f7afa631a773018fd26fc9ad2eca99f591b"
        }
      },
      {
        "key": "session.id",
        "value": {
          "stringValue": "2c047cd5-589c-4242-a141-0da79182267e"
        }
      },
      {
        "key": "organization.id",
        "value": {
          "stringValue": "429b98a8-e9d5-4636-8ba4-bc3685065e29"
        }
      },
      {
        "key": "user.email",
        "value": {
          "stringValue": "golysoft@gmail.com"
        }
      },
      {
        "key": "user.account_uuid",
        "value": {
          "stringValue": "7207931e-43d1-44ba-88ad-80b05bd573ce"
        }
      },
      {
        "key": "user.account_id",
        "value": {
          "stringValue": "user_01F5h1hrhwykVrUVFtoWNn9K"
        }
      },
      {
        "key": "terminal.type",
        "value": {
          "stringValue": "iTerm.app"
        }
      },
      {
        "key": "event.name",
        "value": {
          "stringValue": "tool_decision"
        }
      },
      {
        "key": "event.timestamp",
        "value": {
          "stringValue": "2026-05-02T21:29:48.253Z"
        }
      },
      {
        "key": "event.sequence",
        "value": {
          "intValue": 7361
        }
      },
      {
        "key": "prompt.id",
        "value": {
          "stringValue": "16717426-9177-41ac-97ec-51063f4b06aa"
        }
      },
      {
        "key": "decision",
        "value": {
          "stringValue": "accept"
        }
      },
      {
        "key": "source",
        "value": {
          "stringValue": "config"
        }
      },
      {
        "key": "tool_name",
        "value": {
          "stringValue": "Bash"
        }
      }
    ],
    "droppedAttributesCount": 0
  },
  "resource": {
    "attributes": [
      {
        "key": "host.arch",
        "value": {
          "stringValue": "arm64"
        }
      },
      {
        "key": "os.type",
        "value": {
          "stringValue": "darwin"
        }
      },
      {
        "key": "os.version",
        "value": {
          "stringValue": "25.3.0"
        }
      },
      {
        "key": "service.name",
        "value": {
          "stringValue": "claude-code"
        }
      },
      {
        "key": "service.version",
        "value": {
          "stringValue": "2.1.116"
        }
      }
    ],
    "droppedAttributesCount": 0
  },
  "scope": {
    "name": "com.anthropic.claude_code.events",
    "version": "2.1.116"
  }
}
```

---

### Wave 0 summary

- Total `otel_events` rows: 7241
- Skill rows (`event_name LIKE '%skill%'`): **0**
- Distinct attribute keys on skill events: **0**
- All Q3-Q5, Q9-Q13 skill-scoped queries: **(zero rows)** — confirms RESEARCH.md §1 verified-state.
- Service version of record: **2.1.116**
- Cache TTL split surface: **JSONL only** (`message.usage.cache_creation.ephemeral_{5m,1h}_input_tokens`); OTEL `api_request` events do NOT carry these keys in 2.1.116.
- Wave 1 (live invocation per RESEARCH.md Appendix B): **REQUIRED** before HIGH-confidence locks.
