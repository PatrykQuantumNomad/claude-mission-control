# Requirements: Claude Mission Control

**Defined:** 2026-04-25
**Core Value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, queue and approve tasks, and kill runaway sessions — all from one browser tab.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01
**: Server starts on localhost:8765 with FastAPI app factory/builder pattern
- [x] **FOUND-02
**: SQLite database initializes with WAL mode, write-serialized architecture, and all 15 tables via idempotent CREATE TABLE IF NOT EXISTS
- [x] **FOUND-03
**: Idempotent migration helper (_migrate_add_column) supports schema evolution without data loss
- [x] **FOUND-04
**: Pydantic v2 settings class validates all configuration from environment variables and .env file
- [x] **FOUND-05
**: Lifespan context manager initializes database, starts background tasks, and shuts down gracefully
- [x] **FOUND-06
**: Pre-built React frontend served as static files from FastAPI with SPA catch-all routing

### Ingest

- [x] **INGST-01
**: JSONL scraper scans ~/.claude/projects/*/*.jsonl on boot and every 120s
- [x] **INGST-02
**: JSONL parser extracts user/assistant messages with token usage (input, output, cache_read, cache_create)
- [x] **INGST-03
**: JSONL parser pairs tool_use and tool_result by tool_use_id, computing duration (capped at 10 min)
- [x] **INGST-04
**: JSONL parser upserts sessions row with totals on session end; re-parses if ended_at IS NULL or mtime > synced_at
- [ ] **INGST-05**: JSONL parser writes daily token_usage rollups with local-time day bucketing
- [x] **INGST-06
**: JSONL parser handles corrupted lines gracefully (skip + log, never crash sync cycle)
- [x] **INGST-07
**: OTEL /v1/logs endpoint receives OTLP/HTTP JSON, always returns 200, per-row try/except
- [x] **INGST-08
**: OTEL /v1/logs extracts mcp_server_name and mcp_tool_name from tool_parameters JSON for mcp_tool events
- [x] **INGST-09
**: OTEL /v1/metrics endpoint receives OTLP/HTTP JSON, inserts into otel_metrics, always returns 200
- [x] **INGST-10
**: POST /api/sync triggers manual sync cycle

### System API

- [x] **SAPI-01
**: GET /api/health returns quick liveness check
- [x] **SAPI-02
**: GET /api/system/health returns server uptime, memory, last OTEL event age, daemon tick ages, tzname
- [x] **SAPI-03
**: GET /api/system/state reads system_state KV store
- [x] **SAPI-04
**: GET /api/attention returns aggregated issue feed (stuck loops, failed tasks, stale dispatcher, pending decisions)
- [x] **SAPI-05
**: GET /api/firehose returns SSE stream of recent OTEL events

### Sessions API

- [x] **SESS-01
**: GET /api/sessions returns paginated session list with range/source/model filters
- [x] **SESS-02
**: GET /api/sessions/{id}/details returns tool-call timeline and token breakdown
- [x] **SESS-03
**: GET /api/sessions/live returns sessions active in last 5 minutes
- [x] **SESS-04
**: GET /api/sessions/live/{sid}/state returns current live state row
- [x] **SESS-05
**: GET /api/sessions/live/{sid}/stream returns SSE line-by-line feed
- [x] **SESS-06
**: POST /api/sessions/live/{sid}/message queues follow-up message (UUID validation, stream-mode only)
- [x] **SESS-07
**: GET /api/summary returns today's KPIs (sessions, tokens, tools, errors)

### Observability API

- [x] **OBSV-01
**: GET /api/usage/tokens returns daily breakdown by model + source with today/7d/30d range
- [x] **OBSV-02
**: GET /api/usage/cache returns cache hit rate + daily trend with low-sample badge (<10K billable tokens)
- [x] **OBSV-03
**: GET /api/sessions/outcomes returns daily mutually-exclusive outcome buckets (errored > rate_limited > truncated > unfinished > ok)
- [x] **OBSV-04
**: GET /api/tools/latency returns per-tool p50/p95/max/error-rate/call-count sorted by p95 desc
- [x] **OBSV-05
**: GET /api/hooks/activity returns daily hook fires + paired-duration estimates (60s cap, FIFO per session)
- [x] **OBSV-06
**: GET /api/sessions/by-project returns rollup by cwd (sessions, effective tokens, tool count)
- [x] **OBSV-07
**: GET /api/tools/agent-fanout returns sessions with Agent tool calls
- [x] **OBSV-08
**: GET /api/tools/edit-decisions returns accept/reject rate for Edit/MultiEdit/Write/NotebookEdit from tool_decision events
- [x] **OBSV-09
**: GET /api/activity/productivity returns OTEL counters for commits, PRs, lines of code (SUM of delta-counters)
- [x] **OBSV-10
**: GET /api/system/pressure returns retry exhaustion count, compaction count, recent api_errors

### MCP API

- [x] **MCP-01
**: GET /api/mcp returns list of MCP servers with totals, avg latency, p95
- [x] **MCP-02
**: GET /api/mcp/{server}/tools returns per-tool breakdown (calls, p50, p95, max, error rate) from three sources in priority order
- [x] **MCP-03
**: POST /api/mcp/sync rebuilds mcp_stats table
- [x] **MCP-04
**: POST /api/mcp/measure runs schema-size measurement per server

### Skills API

- [x] **SKIL-01
**: GET /api/skills returns skill list with environment and user_invocable filters
- [x] **SKIL-02
**: POST /api/skills/sync rebuilds skills table from filesystem scan
- [x] **SKIL-03
**: PATCH /api/skills/{name}/autonomy updates autonomy level (auto/review/manual)

### HITL API

- [x] **HITL-01
**: GET /api/decisions returns filtered decision list (status=pending|answered)
- [x] **HITL-02
**: POST /api/decisions creates decision with INSERT OR IGNORE on partial unique index
- [x] **HITL-03
**: POST /api/decisions/{id}/answer writes answer to queue file, returns {answered: true}
- [x] **HITL-04
**: GET /api/inbox returns filtered inbox messages (unread, max_age_days)
- [x] **HITL-05
**: POST /api/inbox creates agent-to-user inbox message
- [x] **HITL-06
**: POST /api/inbox/{id}/read marks message read
- [x] **HITL-07
**: POST /api/inbox/{id}/reply writes user reply to queue file

### Tasks API

- [x] **TASK-01
**: GET /api/tasks returns filtered task list (status, quadrant)
- [x] **TASK-02
**: POST /api/tasks creates task with all fields (title, description, priority, quadrant, approval, risk, dry_run, model, execution_mode, skill, scheduled_for)
- [x] **TASK-03
**: PATCH /api/tasks/{id} updates task with status transition validation
- [x] **TASK-04
**: DELETE /api/tasks/{id} deletes task
- [x] **TASK-05
**: POST /api/tasks/{id}/approve flips awaiting_approval to pending, stamps approved_at
- [x] **TASK-06
**: POST /api/tasks/{id}/rerun resets failed task to pending (400 if not failed)
- [x] **TASK-07
**: POST /api/dispatcher/trigger spawns one-shot dispatcher run via subprocess.Popen

### Schedules API

- [x] **SCHD-01
**: GET /api/schedules returns schedule list
- [x] **SCHD-02
**: POST /api/schedules creates schedule
- [x] **SCHD-03
**: PATCH /api/schedules/{id} updates schedule (clears next_run_at on cron change)
- [x] **SCHD-04
**: DELETE /api/schedules/{id} deletes schedule
- [x] **SCHD-05
**: GET /api/schedules/{id}/runs returns last N materialized tasks
- [x] **SCHD-06
**: POST /api/schedules/parse-nl converts natural language to cron via Haiku

### Emergency Stop

- [x] **ESTOP-01**: POST /api/system/emergency-stop SIGTERMs dispatcher-launched children via PID file scan with process validation
- [x] **ESTOP-02**: Emergency stop verifies PID is a claude -p process via ps command before SIGTERM
- [x] **ESTOP-03**: Emergency stop sets system_state.emergency_stop = '1' and fails running tasks
- [x] **ESTOP-04**: POST /api/system/emergency-resume clears emergency flag

### Mission Control

- [ ] **DISP-01**: Heartbeat runs every 120s via launchd, claims pending tasks atomically, materializes schedules, invokes dispatcher
- [ ] **DISP-02**: Dispatcher honors emergency_stop flag with early return
- [ ] **DISP-03**: Dispatcher sweeps stale PIDs from .tmp/mission-control-queue/pids/
- [ ] **DISP-04**: Dispatcher runs up to MAX_CONCURRENT (3) tasks with skill autonomy check
- [ ] **DISP-05**: Classic mode: subprocess.Popen claude -p with timeout, stdout capture, PID tracking
- [ ] **DISP-06**: Stream mode: subprocess.Popen with stdin/stdout pipes, JSON line parsing, PID tracking
- [ ] **DISP-07**: Stream mode parses DECISION: markers (skipping fenced code blocks) and blocks on answer poll
- [ ] **DISP-08**: Stream mode parses INBOX: markers and posts to /api/inbox
- [ ] **DISP-09**: Stream mode polls queue file for user follow-ups and injects to stdin
- [ ] **DISP-10**: Dispatcher resolves model from task > skill frontmatter > env > CLI default
- [ ] **DISP-11**: Skill router uses Haiku to pick best skill for unassigned tasks
- [ ] **DISP-12**: Launchd plist template with correct Python path (not /usr/bin/python3)

### Frontend Shell

- [ ] **FESH-01**: TanStack Router with three routes: / (Command), /activity, /skills
- [ ] **FESH-02**: AppShell with navigation bar, page layout, and dark theme matching spec palette
- [ ] **FESH-03**: CollapsibleSection with localStorage persistence, framer-motion 220ms height animation, aria-expanded/controls
- [ ] **FESH-04**: Sheet component (right-side drawer) with Esc-to-close, focus trap, aria-modal
- [ ] **FESH-05**: Card primitives (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
- [ ] **FESH-06**: Button (primary gradient/secondary/ghost), Badge, StatePill, Tooltip components
- [ ] **FESH-07**: CommandPalette via Cmd+K with fuzzy search across pages + quick-task action
- [ ] **FESH-08**: Loading skeletons on every panel (not spinners)
- [ ] **FESH-09**: Clear empty states that teach the user what's happening
- [ ] **FESH-10**: Relative time display with absolute timestamp on hover tooltip

### Observability Panels

- [ ] **OPNL-01**: SystemHealthStrip shows server uptime, memory, OTEL age, daemon ages with health-colored pills
- [ ] **OPNL-02**: KpiRow shows today's sessions/tokens/tools/errors as 4 skeleton-loading tiles
- [ ] **OPNL-03**: AttentionBar shows red banner for stuck loops, failed tasks, stale dispatcher (hides when clear)
- [ ] **OPNL-04**: LiveSessionsCard with title, cwd, model, tokens, started-at; drawer with tool timeline and follow-up messaging
- [ ] **OPNL-05**: TokenUsageCard with today/7d/30d stacked daily bars (input/output/cache_read/cache_create) and totals
- [ ] **OPNL-06**: CacheEfficiencyCard with hit rate big number, daily sparkline, 70% target line, low-sample badge
- [ ] **OPNL-07**: SessionOutcomesCard with stacked daily bars (errored/rate_limited/truncated/unfinished/ok summing to day total)
- [ ] **OPNL-08**: ToolLatencyCard with per-tool p50/p95/max, error rate, call count, red/green flags
- [ ] **OPNL-09**: HookActivityCard with daily fires and paired-duration estimates (empty state when totalFires=0)
- [ ] **OPNL-10**: ProjectBreakdownCard with sessions by cwd, effective tokens, % of total (regex home-dir strip)
- [ ] **OPNL-11**: AgentFanoutCard with sessions that ran Agent tool, fallback to session_id with muted prefix
- [ ] **OPNL-12**: EditAcceptanceCard with accept/reject rates for Edit/MultiEdit/Write/NotebookEdit, low-sample badge
- [ ] **OPNL-13**: ProductivityCard with commits, PRs, lines added/removed from OTEL counters (empty state when all zero)
- [ ] **OPNL-14**: PressurePanel with retry exhaustion, compaction count, last 10 api_errors
- [ ] **OPNL-15**: MCP panel with server list + expandable per-tool drill-down with p50/p95/max/err-rate/N and slow/fast tags

### HITL Panels

- [ ] **HPNL-01**: DecisionsCard with pending decisions, answer button/modal, 5s polling
- [ ] **HPNL-02**: InboxCard with unread agent-to-user messages, reply box, 10s polling

### Task Panels

- [ ] **TPNL-01**: TaskBoard with 3 columns (pending/running/done), skill/model/quadrant/risk badges, approve/rerun/delete actions
- [ ] **TPNL-02**: TaskComposer slide-out with title, description, model, mode (Interactive default), priority, quadrant, risk, approval, dry_run
- [ ] **TPNL-03**: SchedulesCard with name, cron preview, enabled toggle, next-run countdown, stale detection, expandable run history
- [ ] **TPNL-04**: ScheduleComposer slide-out with time picker, day chips, live cron preview, task fields, skill picker
- [ ] **TPNL-05**: EmergencyStopBanner with red header button and 2-step confirm dialog

### Activity Page

- [ ] **ACTV-01**: HeatmapGrid showing 30-day GitHub-style daily activity grid
- [ ] **ACTV-02**: ChartsStrip showing 14-day stacked token charts by model
- [ ] **ACTV-03**: OtelPanel with SSE firehose subscription, scrolling event feed, event_name filter
- [ ] **ACTV-04**: TopSkills showing most-used skills with token cost
- [ ] **ACTV-05**: UnifiedFailures showing crashed sessions with error messages
- [ ] **ACTV-06**: SessionsTable with search, pagination, range/source/model filters

### Skills Page

- [ ] **SKLP-01**: MCPPanel with server list, totals, avg/p95 latency, expandable per-tool drill-down with slow/fast tags
- [ ] **SKLP-02**: SkillCostCard showing token cost per skill sorted by total
- [ ] **SKLP-03**: ContextHealthCard (read-only scan of settings.json + CLAUDE.md — line count, rule count, MCP server count, hook count)
- [ ] **SKLP-04**: SkillsRegistry table across environments with autonomy controls

### Telegram

- [ ] **TELE-01**: setup_telegram.py wizard (BotFather instructions, token input, chat_id input, test message, env write)
- [ ] **TELE-02**: Notifier 30s loop checks decisions, approvals, failures, overdue schedules, unread inbox
- [ ] **TELE-03**: Notifier sends plain text (no parse_mode) with inline buttons for each notification type
- [ ] **TELE-04**: Notification deduplication via notification_log UNIQUE constraint with snooze support
- [ ] **TELE-05**: Telegram handler polls getUpdates, whitelists users, routes text to Claude CLI and callbacks to dash_router
- [ ] **TELE-06**: dash_router routes inline button callbacks to dashboard API endpoints
- [ ] **TELE-07**: Launchd plist template for telegram-bot daemon (only installed if opted in)

### Setup & Operations

- [ ] **SETUP-01**: install.sh handles Python detection (prefer homebrew 3.12+), venv creation, dependency install
- [ ] **SETUP-02**: install.sh copies scripts, ui/dist, skills, creates layout under ~/.command-centre/
- [ ] **SETUP-03**: install.sh writes launcher scripts (start.sh, stop.sh) and cc CLI shim
- [ ] **SETUP-04**: install.sh renders and loads launchd plists from templates
- [ ] **SETUP-05**: setup_otel.py backs up settings.json and merges 6 OTEL env keys (never overwrites existing)
- [ ] **SETUP-06**: doctor.py runs zero-LLM deterministic health check with colored output (Python version, claude CLI, settings.json, projects dir, port, health API, launchd, Telegram)
- [ ] **SETUP-07**: cc CLI shim supports start/stop/restart/doctor/setup otel/setup telegram/sync/logs subcommands

### Visual Design

- [ ] **DESG-01**: Dark theme with spec palette (bg #0a0a0f, surface #12121a, accent gradient #4d7cff → #8b5cf6, status green/amber/red/cyan)
- [ ] **DESG-02**: Layered radial background gradients for subtle depth
- [ ] **DESG-03**: Inter for body text, JetBrains Mono for labels/kickers/numeric displays
- [ ] **DESG-04**: Card-based layout with 14-16px border radius, 24-32px padding, auto-rows-fr matched heights
- [ ] **DESG-05**: Panel fade-in on mount (~300ms), collapsible 220ms ease-out, button hover lift 2px with shadow
- [ ] **DESG-06**: lucide-react icons throughout, consistent style

### Testing

- [ ] **TEST-01**: Playwright e2e tests verify all three routes render
- [ ] **TEST-02**: Playwright e2e tests verify command palette opens via Cmd+K
- [ ] **TEST-03**: Playwright e2e tests verify schedule composer creates a schedule
- [ ] **TEST-04**: Playwright e2e tests verify theme toggle persists

## v2 Requirements

### Enhanced Analytics

- **ANLYT-01**: Session cost estimation from token usage and model pricing
- **ANLYT-02**: Multi-day trend analysis with anomaly detection
- **ANLYT-03**: Session comparison view (side-by-side token/tool breakdowns)

### Platform Expansion

- **PLAT-01**: Linux support (systemd instead of launchd)
- **PLAT-02**: Cowork session ingestion (audit.jsonl from ~/Library/Application Support/Claude/)

### Advanced Automation

- **AUTO-01**: Natural-language schedule creation via LLM beyond simple cron
- **AUTO-02**: Auto-retry failed tasks with exponential backoff
- **AUTO-03**: Task dependencies (task B waits for task A to complete)

*Note: Phase 1 (Foundation & Database) discussion locked SQLAlchemy 2.0 async + SQLModel + Alembic as the data-access stack (see .planning/phases/01-foundation-database/01-CONTEXT.md). The "CREATE TABLE IF NOT EXISTS" / "_migrate_add_column" wording in FOUND-02 and FOUND-03 is INTENT (idempotent, data-safe schema evolution); the implementation is Alembic.*

## Out of Scope

| Feature | Reason |
|---------|--------|
| Posture audits panel | Community-only feature, not part of this build |
| Cloud deployment / remote access | Localhost-only by design — privacy model |
| WebSockets for observability | SSE + polling simpler, sufficient for single-user local dashboard |
| PostgreSQL / external databases | SQLite single-file is the right tool for this workload |
| External auth / OAuth | No auth needed — localhost-only |
| Mobile app | Browser-only dashboard |
| Voice interfaces / agent avatars | Dense data UI, not conversational |
| Real-time WebSocket session streaming | SSE and polling sufficient |
| Multi-user support | Single-user tool by design |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| FOUND-05 | Phase 1 | Complete |
| FOUND-06 | Phase 1 | Complete |
| INGST-01 | Phase 2 | Complete |
| INGST-02 | Phase 2 | Pending |
| INGST-03 | Phase 2 | Pending |
| INGST-04 | Phase 2 | Complete |
| INGST-05 | Phase 2 | Pending |
| INGST-06 | Phase 2 | Pending |
| INGST-07 | Phase 2 | Complete |
| INGST-08 | Phase 2 | Pending |
| INGST-09 | Phase 2 | Complete |
| INGST-10 | Phase 2 | Complete |
| SAPI-01 | Phase 3 | Pending |
| SAPI-02 | Phase 3 | Pending |
| SAPI-03 | Phase 3 | Pending |
| SAPI-04 | Phase 3 | Pending |
| SAPI-05 | Phase 3 | Pending |
| SESS-01 | Phase 3 | Pending |
| SESS-02 | Phase 3 | Pending |
| SESS-03 | Phase 3 | Pending |
| SESS-04 | Phase 3 | Pending |
| SESS-05 | Phase 3 | Pending |
| SESS-06 | Phase 3 | Pending |
| SESS-07 | Phase 3 | Pending |
| OBSV-01 | Phase 3 | Pending |
| OBSV-02 | Phase 3 | Pending |
| OBSV-03 | Phase 3 | Pending |
| OBSV-04 | Phase 3 | Pending |
| OBSV-05 | Phase 3 | Pending |
| OBSV-06 | Phase 3 | Pending |
| OBSV-07 | Phase 3 | Pending |
| OBSV-08 | Phase 3 | Pending |
| OBSV-09 | Phase 3 | Pending |
| OBSV-10 | Phase 3 | Pending |
| MCP-01 | Phase 3 | Pending |
| MCP-02 | Phase 3 | Pending |
| MCP-03 | Phase 3 | Pending |
| MCP-04 | Phase 3 | Pending |
| SKIL-01 | Phase 3 | Pending |
| SKIL-02 | Phase 3 | Pending |
| SKIL-03 | Phase 3 | Pending |
| HITL-01 | Phase 4 | Pending |
| HITL-02 | Phase 4 | Pending |
| HITL-03 | Phase 4 | Pending |
| HITL-04 | Phase 4 | Pending |
| HITL-05 | Phase 4 | Pending |
| HITL-06 | Phase 4 | Pending |
| HITL-07 | Phase 4 | Pending |
| TASK-01 | Phase 4 | Pending |
| TASK-02 | Phase 4 | Pending |
| TASK-03 | Phase 4 | Pending |
| TASK-04 | Phase 4 | Pending |
| TASK-05 | Phase 4 | Pending |
| TASK-06 | Phase 4 | Pending |
| TASK-07 | Phase 4 | Pending |
| SCHD-01 | Phase 4 | Pending |
| SCHD-02 | Phase 4 | Pending |
| SCHD-03 | Phase 4 | Pending |
| SCHD-04 | Phase 4 | Pending |
| SCHD-05 | Phase 4 | Pending |
| SCHD-06 | Phase 4 | Pending |
| ESTOP-01 | Phase 4 | Complete (04-05) |
| ESTOP-02 | Phase 4 | Complete (04-05) |
| ESTOP-03 | Phase 4 | Complete (04-05) |
| ESTOP-04 | Phase 4 | Complete (04-05) |
| FESH-01 | Phase 5 | Pending |
| FESH-02 | Phase 5 | Pending |
| FESH-03 | Phase 5 | Pending |
| FESH-04 | Phase 5 | Pending |
| FESH-05 | Phase 5 | Pending |
| FESH-06 | Phase 5 | Pending |
| FESH-07 | Phase 5 | Pending |
| FESH-08 | Phase 5 | Pending |
| FESH-09 | Phase 5 | Pending |
| FESH-10 | Phase 5 | Pending |
| DESG-01 | Phase 5 | Pending |
| DESG-02 | Phase 5 | Pending |
| DESG-03 | Phase 5 | Pending |
| DESG-04 | Phase 5 | Pending |
| DESG-05 | Phase 5 | Pending |
| DESG-06 | Phase 5 | Pending |
| OPNL-01 | Phase 6 | Pending |
| OPNL-02 | Phase 6 | Pending |
| OPNL-03 | Phase 6 | Pending |
| OPNL-04 | Phase 6 | Pending |
| OPNL-05 | Phase 6 | Pending |
| OPNL-06 | Phase 6 | Pending |
| OPNL-07 | Phase 6 | Pending |
| OPNL-08 | Phase 6 | Pending |
| OPNL-09 | Phase 6 | Pending |
| OPNL-10 | Phase 6 | Pending |
| OPNL-11 | Phase 6 | Pending |
| OPNL-12 | Phase 6 | Pending |
| OPNL-13 | Phase 6 | Pending |
| OPNL-14 | Phase 6 | Pending |
| OPNL-15 | Phase 6 | Pending |
| ACTV-01 | Phase 6 | Pending |
| ACTV-02 | Phase 6 | Pending |
| ACTV-03 | Phase 6 | Pending |
| ACTV-04 | Phase 6 | Pending |
| ACTV-05 | Phase 6 | Pending |
| ACTV-06 | Phase 6 | Pending |
| HPNL-01 | Phase 7 | Pending |
| HPNL-02 | Phase 7 | Pending |
| TPNL-01 | Phase 7 | Pending |
| TPNL-02 | Phase 7 | Pending |
| TPNL-03 | Phase 7 | Pending |
| TPNL-04 | Phase 7 | Pending |
| TPNL-05 | Phase 7 | Pending |
| SKLP-01 | Phase 7 | Pending |
| SKLP-02 | Phase 7 | Pending |
| SKLP-03 | Phase 7 | Pending |
| SKLP-04 | Phase 7 | Pending |
| DISP-01 | Phase 8 | Pending |
| DISP-02 | Phase 8 | Pending |
| DISP-03 | Phase 8 | Pending |
| DISP-04 | Phase 8 | Pending |
| DISP-05 | Phase 8 | Pending |
| DISP-06 | Phase 8 | Pending |
| DISP-07 | Phase 8 | Pending |
| DISP-08 | Phase 8 | Pending |
| DISP-09 | Phase 8 | Pending |
| DISP-10 | Phase 8 | Pending |
| DISP-11 | Phase 8 | Pending |
| DISP-12 | Phase 8 | Pending |
| TELE-01 | Phase 9 | Pending |
| TELE-02 | Phase 9 | Pending |
| TELE-03 | Phase 9 | Pending |
| TELE-04 | Phase 9 | Pending |
| TELE-05 | Phase 9 | Pending |
| TELE-06 | Phase 9 | Pending |
| TELE-07 | Phase 9 | Pending |
| SETUP-01 | Phase 9 | Pending |
| SETUP-02 | Phase 9 | Pending |
| SETUP-03 | Phase 9 | Pending |
| SETUP-04 | Phase 9 | Pending |
| SETUP-05 | Phase 9 | Pending |
| SETUP-06 | Phase 9 | Pending |
| SETUP-07 | Phase 9 | Pending |
| TEST-01 | Phase 9 | Pending |
| TEST-02 | Phase 9 | Pending |
| TEST-03 | Phase 9 | Pending |
| TEST-04 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 147 total
- Mapped to phases: 147
- Unmapped: 0

---
*Requirements defined: 2026-04-25*
*Last updated: 2026-04-25 after roadmap creation*
