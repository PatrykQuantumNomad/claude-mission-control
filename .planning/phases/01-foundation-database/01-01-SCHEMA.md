# Phase 1 — Canonical 15-Table Schema

**Status:** APPROVED 2026-04-25 — canonical schema for Phase 1 (Plan 05 will autogenerate Alembic revision against this).

**Approval note:** User approved 2026-04-25 with the 10 `[NEEDS USER CONFIRMATION]` flags accepted as-is; resolve in downstream plans or via future Alembic migrations as the production-dashboard reality clarifies each one. The flags are left in place below as visible TODOs — they are NOT blockers for Plan 05.

**Source:** Derived from REQUIREMENTS.md by reading every -* category that touches the database. Tagged `[NEEDS USER CONFIRMATION]` where the requirement text leaves a column or type genuinely ambiguous.
**Stack:** SQLAlchemy 2.0 async + SQLModel + Alembic (locked in Phase 1 — see CONTEXT.md). Types below use SQLModel/Python typing notation; Alembic autogenerate will translate to `sqlalchemy` types.
**Conventions:**
- All tables use `id INTEGER PRIMARY KEY AUTOINCREMENT` unless a natural key (e.g. `session_id` UUID) is documented.
- Timestamps are stored as ISO-8601 strings via `datetime` (SQLAlchemy maps to TEXT under SQLite). UTC for ingest/system fields; local-time day buckets are stored as `date` (YYYY-MM-DD) where the requirement is "daily by local-time day".
- `JSON` means `sa.JSON` (TEXT under SQLite, opaque blob); used for opaque payloads (event bodies, tool params) where querying by inner key is not required for v1.
- Foreign keys are declared and enforced (`PRAGMA foreign_keys=ON`); `ondelete` is `CASCADE` for child rows tied to a session lifecycle, `RESTRICT` otherwise.

## Tables

### 1. sessions
**Purpose:** One row per Claude Code session, upserted by INGST-04 on session end. Drives every per-session API (SESS-01..07), project rollups (OBSV-06), and outcome buckets (OBSV-03).
**Columns:**
| name             | type             | null | default            | notes                                                    |
|------------------|------------------|------|--------------------|----------------------------------------------------------|
| session_id       | str              | no   | -                  | PK; UUID string from JSONL filename                      |
| started_at       | datetime         | no   | -                  | First message timestamp (UTC)                            |
| ended_at         | Optional[datetime]| yes | NULL               | NULL until session ends; INGST-04 re-parses if NULL      |
| synced_at        | datetime         | no   | now()              | Last time scraper read this file                         |
| jsonl_mtime      | datetime         | no   | -                  | mtime at last sync; INGST-04 re-parses if mtime > synced_at |
| jsonl_path       | str              | no   | -                  | Absolute path; project hash + session-id derivable       |
| cwd              | Optional[str]    | yes  | NULL               | Project directory (OBSV-06 rollup key)                   |
| project_hash     | Optional[str]    | yes  | NULL               | Path component from ~/.claude/projects/<hash>/           |
| model            | Optional[str]    | yes  | NULL               | Last model used in session (filter for SESS-01)          |
| source           | Optional[str]    | yes  | NULL               | "cli" / "claude-code" — filter for SESS-01 [NEEDS USER CONFIRMATION on enum values] |
| outcome          | Optional[str]    | yes  | NULL               | One of {ok, errored, rate_limited, truncated, unfinished} per OBSV-03 |
| tokens_input     | int              | no   | 0                  | Sum across all assistant messages                        |
| tokens_output    | int              | no   | 0                  |                                                          |
| tokens_cache_read| int              | no   | 0                  |                                                          |
| tokens_cache_create | int           | no   | 0                  |                                                          |
| tool_call_count  | int              | no   | 0                  | Quick rollup for OBSV-06                                 |
| message_count    | int              | no   | 0                  |                                                          |
| error_message    | Optional[str]    | yes  | NULL               | First/last error text for ACTV-05 unified failures       |

**Indexes:** PRIMARY KEY(session_id); INDEX(started_at DESC); INDEX(cwd); INDEX(model); INDEX(ended_at) for "live" filter (where ended_at IS NULL or ended_at > now-5min); INDEX(synced_at).
**FKs:** none (this is the parent).
**Used by:** INGST-04, SESS-01..07, OBSV-01, OBSV-03, OBSV-06, OBSV-07, ACTV-05, ACTV-06.

### 2. token_usage
**Purpose:** Daily rollups of token usage bucketed by local-time day, model, and source. Drives the stacked daily bars in OBSV-01 and TokenUsageCard (OPNL-05). One row per (day, model, source) tuple.
**Columns:**
| name              | type     | null | default | notes                                                 |
|-------------------|----------|------|---------|-------------------------------------------------------|
| id                | int      | no   | -       | PK autoincrement                                      |
| day               | date     | no   | -       | Local-time day bucket (INGST-05)                      |
| model             | str      | no   | -       | e.g. "claude-opus-4-7", "claude-sonnet-4-5"           |
| source            | str      | no   | -       | "cli" / "claude-code" / "telemetry" [NEEDS USER CONFIRMATION] |
| tokens_input      | int      | no   | 0       |                                                       |
| tokens_output     | int      | no   | 0       |                                                       |
| tokens_cache_read | int      | no   | 0       |                                                       |
| tokens_cache_create | int    | no   | 0       |                                                       |
| sessions_count    | int      | no   | 0       | How many sessions contributed                         |
| updated_at        | datetime | no   | now()   |                                                       |

**Indexes:** PRIMARY KEY(id); UNIQUE(day, model, source) for upsert idempotency; INDEX(day DESC) for the "today/7d/30d" window.
**FKs:** none (rollup, not referencing sessions).
**Used by:** INGST-05, OBSV-01, OBSV-02 (cache hit rate derives from these counts), OPNL-05, OPNL-06, ACTV-02.

### 3. tools
**Purpose:** One row per paired tool_use/tool_result event, populated by INGST-03. Drives per-tool latency (OBSV-04), edit decisions (OBSV-08), agent fanout (OBSV-07), MCP per-tool stats (MCP-02), and the session timeline drawer (SESS-02).
**Columns:**
| name           | type             | null | default | notes                                                         |
|----------------|------------------|------|---------|---------------------------------------------------------------|
| id             | int              | no   | -       | PK autoincrement                                              |
| tool_use_id    | str              | no   | -       | UUID from JSONL; pairs tool_use to tool_result                |
| session_id     | str              | no   | -       | FK -> sessions.session_id                                     |
| tool_name      | str              | no   | -       | "Edit", "Bash", "Read", "mcp__server__tool", etc.             |
| started_at     | datetime         | no   | -       | tool_use timestamp                                            |
| ended_at       | Optional[datetime]| yes | NULL    | tool_result timestamp; NULL if unpaired                       |
| duration_ms    | Optional[int]    | yes  | NULL    | (ended_at - started_at) capped at 600_000 (10 min) per INGST-03 |
| status         | str              | no   | -       | "ok" / "error" / "pending" (no result yet)                    |
| error_message  | Optional[str]    | yes  | NULL    | If status=error                                               |
| input_summary  | Optional[str]    | yes  | NULL    | Short label for SESS-02 timeline (e.g. file path for Edit)    |
| mcp_server_name| Optional[str]    | yes  | NULL    | If tool_name starts "mcp__"; populated for MCP-02             |
| mcp_tool_name  | Optional[str]    | yes  | NULL    | "                                                             |
| decision       | Optional[str]    | yes  | NULL    | tool_decision event payload: "accept"/"reject" for edit-class tools (OBSV-08) [NEEDS USER CONFIRMATION on the tool_decision linkage — separate event row vs column on this row] |

**Indexes:** PRIMARY KEY(id); UNIQUE(tool_use_id) — paired upsert key; INDEX(session_id); INDEX(tool_name, started_at) for OBSV-04 latency aggregations; INDEX(mcp_server_name, mcp_tool_name) for MCP-02.
**FKs:** session_id -> sessions(session_id) ON DELETE CASCADE.
**Used by:** INGST-03, SESS-02, OBSV-04, OBSV-07, OBSV-08, MCP-02, OPNL-04, OPNL-08, OPNL-12.

### 4. otel_events
**Purpose:** Append-only event log from OTEL `/v1/logs` (INGST-07). Drives the firehose SSE feed (SAPI-05, ACTV-03), unified failures (ACTV-05), pressure panel (OBSV-10), hook activity (OBSV-05), and tool-decision parsing (OBSV-08).
**Columns:**
| name             | type             | null | default | notes                                                   |
|------------------|------------------|------|---------|---------------------------------------------------------|
| id               | int              | no   | -       | PK autoincrement                                        |
| ts               | datetime         | no   | -       | OTEL timestamp (UTC)                                    |
| event_name       | str              | no   | -       | e.g. "claude_code.api_request", "claude_code.api_error", "claude_code.tool_decision", "claude_code.user_prompt", "claude_code.hook" |
| session_id       | Optional[str]    | yes  | NULL    | FK -> sessions; soft (sessions row may not exist yet)   |
| body             | JSON             | no   | {}      | Full OTEL log body (attributes + payload)               |
| attrs_mcp_server | Optional[str]    | yes  | NULL    | Materialized for fast MCP-2 lookup (INGST-08)           |
| attrs_mcp_tool   | Optional[str]    | yes  | NULL    | "                                                       |
| received_at      | datetime         | no   | now()   | When the row was inserted                               |

**Indexes:** PRIMARY KEY(id); INDEX(ts DESC) for SSE firehose tail; INDEX(event_name, ts DESC) for filtered queries; INDEX(session_id, ts) for session timeline; INDEX(attrs_mcp_server, attrs_mcp_tool) for MCP-02.
**FKs:** session_id -> sessions(session_id) ON DELETE SET NULL (events may outlive their session row in pathological cases).
**Used by:** INGST-07, INGST-08, SAPI-05, OBSV-05, OBSV-08, OBSV-10, ACTV-03, ACTV-05, OPNL-09, OPNL-14.

### 5. otel_metrics
**Purpose:** Append-only metric points from OTEL `/v1/metrics` (INGST-09). Drives productivity counters (OBSV-09 — commits, PRs, lines of code) and the pressure panel (OBSV-10).
**Columns:**
| name        | type     | null | default | notes                                                    |
|-------------|----------|------|---------|----------------------------------------------------------|
| id          | int      | no   | -       | PK autoincrement                                         |
| ts          | datetime | no   | -       | Metric timestamp                                         |
| metric_name | str      | no   | -       | e.g. "claude_code.commits", "claude_code.lines_of_code"  |
| value       | float    | no   | -       | Counter delta or gauge value                             |
| kind        | str      | no   | -       | "counter" / "gauge" / "histogram"                        |
| unit        | Optional[str] | yes | NULL | OTEL unit string                                         |
| attrs       | JSON     | no   | {}      | Attributes (e.g. type=added/removed for lines_of_code)   |
| received_at | datetime | no   | now()   |                                                          |

**Indexes:** PRIMARY KEY(id); INDEX(metric_name, ts DESC) for OBSV-09 daily SUM; INDEX(ts DESC).
**FKs:** none.
**Used by:** INGST-09, OBSV-09, OBSV-10, OPNL-13, OPNL-14.

### 6. tasks
**Purpose:** Mission Control task queue. Created via TASK-02; transitioned through pending -> running -> done|failed by the dispatcher (DISP-*); approved/rerun via TASK-05/06.
**Columns:**
| name              | type             | null | default        | notes                                                    |
|-------------------|------------------|------|----------------|----------------------------------------------------------|
| id                | int              | no   | -              | PK autoincrement                                         |
| title             | str              | no   | -              | TASK-02                                                  |
| description       | str              | no   | ""             |                                                          |
| status            | str              | no   | "pending"      | {pending, running, done, failed, awaiting_approval}      |
| priority          | int              | no   | 3              | TASK-02; 1=high                                          |
| quadrant          | Optional[str]    | yes  | NULL           | Eisenhower-ish: "do"/"plan"/"delegate"/"drop" [NEEDS USER CONFIRMATION on enum] |
| approval          | str              | no   | "auto"         | {auto, awaiting_approval} per TASK-05                    |
| risk              | Optional[str]    | yes  | NULL           | "low"/"medium"/"high"                                    |
| dry_run           | bool             | no   | false          |                                                          |
| model             | Optional[str]    | yes  | NULL           | Per-task model override (DISP-10 resolution chain)       |
| execution_mode    | str              | no   | "interactive"  | {interactive, classic, stream} per DISP-05/06            |
| skill             | Optional[str]    | yes  | NULL           | FK-by-name to skills.name; NULL = unassigned (DISP-11)   |
| scheduled_for     | Optional[datetime]| yes | NULL           | Future trigger; NULL = run ASAP                          |
| schedule_id       | Optional[int]    | yes  | NULL           | FK -> schedules.id if materialized from a schedule       |
| pid               | Optional[int]    | yes  | NULL           | Tracked by DISP-05/06 for ESTOP-01                       |
| stdout_path       | Optional[str]    | yes  | NULL           | Where dispatcher captured output (DISP-05)               |
| error_message     | Optional[str]    | yes  | NULL           |                                                          |
| created_at        | datetime         | no   | now()          |                                                          |
| started_at        | Optional[datetime]| yes | NULL           | Set when status -> running                               |
| ended_at          | Optional[datetime]| yes | NULL           |                                                          |
| approved_at       | Optional[datetime]| yes | NULL           | TASK-05 stamps this                                      |

**Indexes:** PRIMARY KEY(id); INDEX(status, priority, scheduled_for) for dispatcher queue claim; INDEX(quadrant, status) for TPNL-01 board; INDEX(schedule_id); INDEX(pid) for ESTOP-01.
**FKs:** schedule_id -> schedules(id) ON DELETE SET NULL; skill -> skills(name) ON DELETE SET NULL [NEEDS USER CONFIRMATION whether to enforce skill name as FK or leave it as a free-text reference].
**Used by:** TASK-01..07, DISP-01, DISP-02, DISP-04, DISP-05, DISP-06, DISP-10, DISP-11, ESTOP-01, ESTOP-03, TPNL-01, TPNL-02.

### 7. schedules
**Purpose:** Cron-driven recurring task templates. Materialized into `tasks` rows by DISP-01 / heartbeat. Composer in TPNL-03/04 reads this.
**Columns:**
| name           | type             | null | default | notes                                                       |
|----------------|------------------|------|---------|-------------------------------------------------------------|
| id             | int              | no   | -       | PK autoincrement                                            |
| name           | str              | no   | -       | Human label                                                 |
| cron           | str              | no   | -       | Cron expression (5-field unix cron)                         |
| enabled        | bool             | no   | true    | TPNL-03 toggle                                              |
| next_run_at    | Optional[datetime]| yes | NULL    | Cleared on cron change per SCHD-03; recomputed by heartbeat |
| last_run_at    | Optional[datetime]| yes | NULL    |                                                             |
| task_template  | JSON             | no   | {}      | Fields to copy onto materialized task (title, model, etc.) |
| skill          | Optional[str]    | yes  | NULL    | Default skill for materialized tasks                        |
| created_at     | datetime         | no   | now()   |                                                             |
| updated_at     | datetime         | no   | now()   |                                                             |

**Indexes:** PRIMARY KEY(id); INDEX(enabled, next_run_at) for the heartbeat scan; UNIQUE(name) [NEEDS USER CONFIRMATION — duplicate-name allowed?].
**FKs:** skill -> skills(name) ON DELETE SET NULL [NEEDS USER CONFIRMATION].
**Used by:** SCHD-01..06, DISP-01, TPNL-03, TPNL-04.

### 8. decisions
**Purpose:** HITL decision queue — agents emit DECISION: markers (DISP-07) which become rows here; user answers via dashboard (HITL-03) or Telegram (TELE-02). Partial UNIQUE prevents duplicate prompts within a session.
**Columns:**
| name        | type             | null | default | notes                                                  |
|-------------|------------------|------|---------|--------------------------------------------------------|
| id          | int              | no   | -       | PK autoincrement                                       |
| session_id  | Optional[str]    | yes  | NULL    | FK -> sessions; NULL if origin is a task w/ no JSONL   |
| task_id     | Optional[int]    | yes  | NULL    | FK -> tasks                                            |
| dedup_key   | str              | no   | -       | Hash of (session_id, prompt) — used in partial UNIQUE  |
| prompt      | str              | no   | -       | Question text                                          |
| options     | JSON             | no   | []      | List of choice strings (free-text if empty)            |
| status      | str              | no   | "pending"| {pending, answered}                                   |
| answer      | Optional[str]    | yes  | NULL    | HITL-03 writes this                                    |
| answered_at | Optional[datetime]| yes | NULL    |                                                        |
| answered_by | Optional[str]    | yes  | NULL    | "dashboard" / "telegram" / "cli"                       |
| created_at  | datetime         | no   | now()   |                                                        |

**Indexes:** PRIMARY KEY(id); UNIQUE(dedup_key) WHERE status='pending' (partial unique per HITL-02 INSERT OR IGNORE); INDEX(status, created_at DESC); INDEX(session_id); INDEX(task_id).
**FKs:** session_id -> sessions(session_id) ON DELETE SET NULL; task_id -> tasks(id) ON DELETE SET NULL.
**Used by:** HITL-01..03, DISP-07, HPNL-01, TELE-02.

### 9. inbox
**Purpose:** Agent-to-user inbox. Agents emit INBOX: markers (DISP-08) which post via HITL-05; user marks read (HITL-06) or replies (HITL-07).
**Columns:**
| name         | type             | null | default | notes                                                   |
|--------------|------------------|------|---------|---------------------------------------------------------|
| id           | int              | no   | -       | PK autoincrement                                        |
| session_id   | Optional[str]    | yes  | NULL    | FK -> sessions                                          |
| task_id      | Optional[int]    | yes  | NULL    | FK -> tasks                                             |
| subject      | Optional[str]    | yes  | NULL    | Short label                                             |
| body         | str              | no   | -       | Message text                                            |
| read         | bool             | no   | false   | HITL-06 flips this                                      |
| read_at      | Optional[datetime]| yes | NULL    |                                                         |
| reply        | Optional[str]    | yes  | NULL    | HITL-07 writes this                                     |
| replied_at   | Optional[datetime]| yes | NULL    |                                                         |
| created_at   | datetime         | no   | now()   |                                                         |

**Indexes:** PRIMARY KEY(id); INDEX(read, created_at DESC) for HITL-04 unread filter; INDEX(session_id); INDEX(task_id).
**FKs:** session_id -> sessions(session_id) ON DELETE SET NULL; task_id -> tasks(id) ON DELETE SET NULL.
**Used by:** HITL-04..07, DISP-08, HPNL-02, TELE-02.

### 10. activities
**Purpose:** Daily aggregate counters used by the activity heatmap (ACTV-01) and productivity card (OPNL-13). Aggregates from `otel_metrics` (commits, PRs, lines of code) and `sessions` (sessions/day, tokens/day) into a uniform `(day, kind, value)` shape so the heatmap can sum across kinds.
**Columns:**
| name       | type     | null | default | notes                                                          |
|------------|----------|------|---------|----------------------------------------------------------------|
| id         | int      | no   | -       | PK autoincrement                                               |
| day        | date     | no   | -       | Local-time day                                                 |
| kind       | str      | no   | -       | {commits, prs, lines_added, lines_removed, sessions, tokens}   |
| value      | float    | no   | 0       | Aggregate over the day                                         |
| updated_at | datetime | no   | now()   |                                                                |

**Indexes:** PRIMARY KEY(id); UNIQUE(day, kind) for upsert idempotency; INDEX(day DESC).
**FKs:** none.
**Used by:** OBSV-09, ACTV-01, OPNL-13. **[NEEDS USER CONFIRMATION:** the production dashboard may compute these on the fly from `otel_metrics` instead of materializing — confirm whether to keep this as a precomputed cache or drop it. If dropped, the heatmap query reads `otel_metrics` directly.**]**

### 11. live_state
**Purpose:** Per-session live state — current message buffer, "thinking" flag, last activity stamp — for sessions active in the last 5 minutes (SESS-03/04). Updated by the JSONL scraper on each tail; trimmed by a janitor that deletes rows for sessions with no activity in N minutes.
**Columns:**
| name             | type             | null | default | notes                                                    |
|------------------|------------------|------|---------|----------------------------------------------------------|
| session_id       | str              | no   | -       | PK; FK -> sessions                                       |
| last_activity_at | datetime         | no   | -       | SESS-03 filter (active = last_activity_at > now-5min)    |
| state            | str              | no   | "idle"  | {idle, thinking, tool_running, awaiting_decision, streaming} [NEEDS USER CONFIRMATION on enum] |
| current_message  | Optional[str]    | yes  | NULL    | Tail of the live assistant message buffer (SESS-05 SSE)  |
| current_tool     | Optional[str]    | yes  | NULL    | Tool name if state=tool_running                          |
| pid              | Optional[int]    | yes  | NULL    | If a dispatcher-launched process is attached             |
| updated_at       | datetime         | no   | now()   |                                                          |

**Indexes:** PRIMARY KEY(session_id); INDEX(last_activity_at DESC) for SESS-03 query.
**FKs:** session_id -> sessions(session_id) ON DELETE CASCADE.
**Used by:** SESS-03, SESS-04, SESS-05, OPNL-04.

### 12. mcp_stats
**Purpose:** MCP per-server / per-tool aggregates (MCP-01/02), rebuilt by MCP-03. Stores stats from three priority sources (tool_decision events > tools table > otel_events). Plus optional schema-size measurements from MCP-04.
**Columns:**
| name             | type             | null | default | notes                                                       |
|------------------|------------------|------|---------|-------------------------------------------------------------|
| id               | int              | no   | -       | PK autoincrement                                            |
| server_name      | str              | no   | -       | "github", "context7", etc.                                  |
| tool_name        | Optional[str]    | yes  | NULL    | NULL = server-level row (MCP-01); non-NULL = per-tool (MCP-02) |
| call_count       | int              | no   | 0       |                                                             |
| error_count      | int              | no   | 0       |                                                             |
| latency_p50_ms   | Optional[float]  | yes  | NULL    |                                                             |
| latency_p95_ms   | Optional[float]  | yes  | NULL    |                                                             |
| latency_max_ms   | Optional[float]  | yes  | NULL    |                                                             |
| schema_size_bytes| Optional[int]    | yes  | NULL    | Populated by MCP-04 measurement                             |
| source_priority  | str              | no   | -       | "tool_decision" / "tools" / "otel" — provenance per MCP-02  |
| computed_at      | datetime         | no   | now()   | When MCP-03 last rebuilt this row                           |

**Indexes:** PRIMARY KEY(id); UNIQUE(server_name, tool_name) so MCP-03 can upsert/replace; INDEX(server_name).
**FKs:** none.
**Used by:** MCP-01..04, OPNL-15, SKLP-01.

### 13. skills
**Purpose:** Local skill registry — autonomy controls, environment scopes, user invocability. Rebuilt by SKIL-02 from filesystem scan; autonomy patched via SKIL-03.
**Columns:**
| name            | type             | null | default | notes                                                       |
|-----------------|------------------|------|---------|-------------------------------------------------------------|
| name            | str              | no   | -       | PK; skill identifier                                        |
| environment     | str              | no   | -       | {personal, project, mcp} [NEEDS USER CONFIRMATION on enum]  |
| user_invocable  | bool             | no   | true    | SKIL-01 filter                                              |
| autonomy        | str              | no   | "manual"| {auto, review, manual} per SKIL-03                          |
| description     | Optional[str]    | yes  | NULL    | Frontmatter description                                     |
| frontmatter     | JSON             | no   | {}      | Full parsed frontmatter (model, allowed_tools, etc.)        |
| path            | str              | no   | -       | Absolute path on disk                                       |
| updated_at      | datetime         | no   | now()   | SKIL-02 stamp                                               |

**Indexes:** PRIMARY KEY(name); INDEX(environment, user_invocable) for SKIL-01 filter; INDEX(autonomy) for DISP-04 skill-autonomy check.
**FKs:** none.
**Used by:** SKIL-01..03, DISP-04, DISP-10, DISP-11, SKLP-04, SKLP-02.

### 14. system_state
**Purpose:** Generic key-value store for system-level flags — emergency_stop (ESTOP-03), last sync stamps, daemon health, tzname. Read by SAPI-03; written by emergency stop, doctor, and various daemons.
**Columns:**
| name       | type             | null | default | notes                                                       |
|------------|------------------|------|---------|-------------------------------------------------------------|
| key        | str              | no   | -       | PK; e.g. "emergency_stop", "last_jsonl_sync_at", "tzname"   |
| value      | Optional[str]    | yes  | NULL    | String-serialized; consumers parse as needed                |
| value_json | Optional[JSON]   | yes  | NULL    | Optional structured value [NEEDS USER CONFIRMATION — keep two columns or pick one] |
| updated_at | datetime         | no   | now()   |                                                             |

**Indexes:** PRIMARY KEY(key).
**FKs:** none.
**Used by:** SAPI-02, SAPI-03, ESTOP-03, ESTOP-04, DISP-02.

### 15. notification_log
**Purpose:** Telegram notification deduplication ledger (TELE-04). UNIQUE constraint prevents the 30s notifier loop from re-sending the same notification for the same entity within a window; supports snooze by storing a `snoozed_until` timestamp.
**Columns:**
| name             | type             | null | default | notes                                                        |
|------------------|------------------|------|---------|--------------------------------------------------------------|
| id               | int              | no   | -       | PK autoincrement                                             |
| kind             | str              | no   | -       | {decision, approval, failure, overdue_schedule, inbox}       |
| entity_id        | str              | no   | -       | e.g. decision.id, task.id, schedule.id (stringified)         |
| sent_at          | datetime         | no   | now()   |                                                              |
| chat_id          | Optional[str]    | yes  | NULL    | Telegram chat_id for multi-chat support                      |
| message_id       | Optional[str]    | yes  | NULL    | Returned by Telegram sendMessage; for editing/callbacks      |
| snoozed_until    | Optional[datetime]| yes | NULL    | If user snoozed via inline button                            |
| status           | str              | no   | "sent"  | {sent, failed, snoozed}                                      |

**Indexes:** PRIMARY KEY(id); UNIQUE(kind, entity_id, chat_id) per TELE-04 dedup; INDEX(sent_at DESC); INDEX(snoozed_until) for "wake-up" scan.
**FKs:** none (kind/entity_id is a soft polymorphic reference).
**Used by:** TELE-02, TELE-03, TELE-04, TELE-05, TELE-06.

## Open Questions (rolled up)

1. **Source enum values** for `sessions.source` and `token_usage.source` — what discrete strings does the production dashboard use? (`cli`, `claude-code`, `telemetry`, anything else?)
2. **`tools.decision` column vs. separate edit_decisions table.** The draft folds tool_decision events onto the `tools` row; alternative is a small dedicated table. The current shape works for OBSV-08 but loses the timestamp of the decision separately from the tool call.
3. **`activities` table — keep or drop.** If the production dashboard computes the heatmap on the fly from `otel_metrics` and `sessions`, this table is dead weight. Confirm before Plan 05 generates it.
4. **`tasks.skill` and `schedules.skill` as FK** vs. free-text. Enforcing FK gives integrity but breaks if a skill is deleted/renamed mid-flight. Free text is more forgiving.
5. **`tasks.quadrant` enum** — is the production dashboard using Eisenhower-matrix labels (do/plan/delegate/drop) or a different taxonomy?
6. **`live_state.state` enum** — what discrete states does the existing dashboard already use?
7. **`skills.environment` enum** — confirm the discrete set ({personal, project, mcp} is a guess from CLAUDE.md ecosystem conventions).
8. **`system_state` shape** — keep both `value` (TEXT) and `value_json` (JSON) columns, or pick one? Two columns is flexible; one is simpler.
9. **`schedules.name` UNIQUE** — should duplicate schedule names be allowed?
10. **OBSV-05 hooks data source** — the draft routes hook events through `otel_events` (event_name="claude_code.hook"). If the production dashboard has a dedicated `hooks` table, that would replace one of the 15 above. Confirm.

## Coverage Summary

| Phase | Tables touched (read or write) |
|-------|--------------------------------|
| Phase 2 (INGST) | sessions, token_usage, tools, otel_events, otel_metrics |
| Phase 3 (SAPI/SESS/OBSV/MCP/SKIL) | sessions, token_usage, tools, otel_events, otel_metrics, mcp_stats, skills, live_state, system_state |
| Phase 4 (HITL/TASK/SCHD/ESTOP) | tasks, schedules, decisions, inbox, system_state |
| Phase 6/7 (panels) | (read-only across all of the above) |
| Phase 8 (DISP/MC) | tasks, schedules, decisions, inbox, system_state, sessions, live_state |
| Phase 9 (TELE) | notification_log, decisions, tasks, schedules, inbox, system_state |

All 15 tables are referenced by at least one downstream phase. No table is orphaned.

---

*Draft prepared 2026-04-25 for Plan 01-01 Task 4 checkpoint. Approved by user 2026-04-25 (option: approve-as-is). Plan 05 may now autogenerate the Alembic initial revision against this schema.*
