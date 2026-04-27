# Roadmap: Claude Mission Control

## Overview

This roadmap builds a production-grade local dashboard and command centre for Claude Code in 9 phases. It starts with the FastAPI server foundation and SQLite database, layers on data ingestion (JSONL + OTEL), then builds out the full API surface in two phases (read-only observability, then stateful CRUD). The frontend shell and design system provide the container, followed by two panel phases (observability/activity, then command centre). The dispatcher brings autonomous task execution, and the final phase adds Telegram integration, installer, CLI tooling, and end-to-end tests.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Database** - FastAPI server, SQLite schema, settings, static file serving
- [x] **Phase 2: Data Ingestion** - JSONL scraper, OTEL log/metric endpoints, manual sync
- [x] **Phase 3: Read-Only APIs** - System health, sessions, observability metrics, MCP, and skills endpoints
- [x] **Phase 4: Stateful APIs** - HITL decisions/inbox, tasks, schedules, emergency stop CRUD
- [x] **Phase 5: Frontend Shell & Design System** - TanStack Router, app shell, components, dark theme, visual polish
- [ ] **Phase 6: Observability & Activity Panels** - All 15 observability panels plus the 6 activity page panels
- [ ] **Phase 7: Command Centre Panels** - HITL decision/inbox panels, task board, schedule composer, skills page, emergency stop
- [ ] **Phase 8: Mission Control Dispatcher** - Heartbeat, task execution (classic + stream), DECISION/INBOX parsing, skill routing
- [ ] **Phase 9: Telegram, Setup & Testing** - Telegram bridge, install.sh, cc CLI, doctor.py, Playwright e2e tests

## Phase Details

### Phase 1: Foundation & Database
**Goal**: Server boots, database is ready, and the React frontend loads in a browser at localhost:8765
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06
**Success Criteria** (what must be TRUE):
  1. Visiting http://localhost:8765 in a browser loads the React SPA
  2. SQLite database file exists in data/ with WAL mode enabled and all 15 tables created
  3. Server starts cleanly from a single command using app factory pattern with lifespan manager
  4. Configuration loads from environment variables and .env file with validation errors on missing required values
**Plans**: 7 plans
- [ ] 01-01-PLAN.md — Doc-fix gate (REQUIREMENTS.md + PROJECT.md ORM reconcile) and 15-table schema confirmation checkpoint
- [x] 01-02-PLAN.md — Backend skeleton: pyproject.toml, cmc.config (pydantic-settings + pretty error), cmc.core (logging, errors, SPAStaticFiles), pytest scaffold
- [x] 01-03-PLAN.md — Frontend skeleton: Vite + React + TanStack Router (plugin order verified), build produces frontend/dist
- [x] 01-04-PLAN.md — DB foundation: cmc.db engine (with pragma listener + autocommit toggle), session factory, Alembic env (async + shared-connection)
- [x] 01-05-PLAN.md — 15 SQLModel tables (per approved schema) + Alembic 0001_initial.py + _column_exists helper (FOUND-03)
- [x] 01-06-PLAN.md — App factory + lifespan (engine + alembic upgrade + dispose) + /api/health route
- [x] 01-07-PLAN.md — SPA static mount (after routers per Pitfall 8) + e2e smoke + manual browser checkpoint

### Phase 2: Data Ingestion
**Goal**: Real session data and OTEL telemetry flow into the database automatically
**Depends on**: Phase 1
**Requirements**: INGST-01, INGST-02, INGST-03, INGST-04, INGST-05, INGST-06, INGST-07, INGST-08, INGST-09, INGST-10
**Success Criteria** (what must be TRUE):
  1. After server boot, sessions from ~/.claude/projects/ appear in the sessions table with correct token totals
  2. Posting OTLP/HTTP JSON to /v1/logs stores events in otel_events with extracted mcp_server/tool names
  3. Posting OTLP/HTTP JSON to /v1/metrics stores metrics in otel_metrics
  4. Corrupted JSONL lines are skipped without crashing the sync cycle
  5. POST /api/sync triggers an immediate re-scrape and returns success
**Plans**: 6 plans
- [x] 02-01-PLAN.md — Phase 2 foundation: 3 new Settings fields (jsonl_root, session_idle_minutes, otlp_max_body_bytes), pytest-freezer dev dep, conftest fixtures, test_phase2_ingest.py seed + Phase 1 cwd-test bug fix ✅ 2026-04-25
- [x] 02-02-PLAN.md — JSONL parser library (TDD): pure-function iter_jsonl + parse_session_file + split_mcp covering INGST-02, INGST-03, INGST-06 ✅ 2026-04-25
- [x] 02-03-PLAN.md — OTLP /v1/logs + /v1/metrics router with always-200 contract + body cap + raw_routers() factory wiring (INGST-07, INGST-08, INGST-09) ✅ 2026-04-25
- [x] 02-04-PLAN.md — Repository upserts (Option B token rollups) + scheduler sync_once + periodic_sync_loop (INGST-04, INGST-05) ✅ 2026-04-25
- [x] 02-05-PLAN.md — Lifespan extension (boot sync + create_task) + POST /api/sync route (INGST-01, INGST-10) ✅ 2026-04-25
- [x] 02-06-PLAN.md — Manual smoke checkpoint: real ~/.claude/projects/ ingestion + curl OTLP samples + clean shutdown verification ✅ 2026-04-26

### Phase 3: Read-Only APIs
**Goal**: All observability and analytics data is accessible via well-structured JSON API endpoints
**Depends on**: Phase 2
**Requirements**: SAPI-01, SAPI-02, SAPI-03, SAPI-04, SAPI-05, SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, SESS-06, SESS-07, OBSV-01, OBSV-02, OBSV-03, OBSV-04, OBSV-05, OBSV-06, OBSV-07, OBSV-08, OBSV-09, OBSV-10, MCP-01, MCP-02, MCP-03, MCP-04, SKIL-01, SKIL-02, SKIL-03
**Success Criteria** (what must be TRUE):
  1. GET /api/health returns 200 and GET /api/system/health returns uptime, memory, and daemon ages
  2. GET /api/sessions returns paginated results with working range/source/model filters
  3. GET /api/usage/tokens returns daily token breakdown by model with today/7d/30d range support
  4. GET /api/mcp returns server list with latency stats and GET /api/mcp/{server}/tools returns per-tool breakdown
  5. GET /api/firehose returns an SSE stream of recent OTEL events
**Plans**: 5 plans

- [x] 03-01-PLAN.md — Wave 0 foundation: psutil dep, app.state.boot_time wiring, 7 Pydantic v2 schema modules, shared SSE helper, per-router test scaffolding + conftest fixtures (SAPI-01 stays in Phase 1 health.py) ✅ 2026-04-26
- [x] 03-02-PLAN.md — System router (SAPI-02..05): /api/system/health, /api/system/state (KV with whitelist), /api/attention (Phase-4-graceful zeros), /api/firehose (SSE) ✅ 2026-04-26
- [x] 03-03-PLAN.md — Sessions router (SESS-01..07): paginated list + filters, details with tool timeline, live (Pitfall 8 fallback), live-state, live SSE stream, follow-up POST queue, today summary ✅ 2026-04-26
- [x] 03-04-PLAN.md — Observability router (OBSV-01..10): tokens, cache, outcomes (read-time CASE), tool latency (Pattern 4 percentile), hooks, by-project, agent fanout, edit decisions, productivity, pressure ✅ 2026-04-26
- [x] 03-05-PLAN.md — MCP + Skills routers (MCP-01..04 + SKIL-01..03): three-source priority aggregator, single-flight sync, filesystem skill scanner (no symlinks, 1-level, 1000-cap), autonomy patch with regex validation ✅ 2026-04-26

### Phase 4: Stateful APIs
**Goal**: Users can create, manage, and interact with decisions, inbox messages, tasks, schedules, and emergency stop via the API
**Depends on**: Phase 1
**Requirements**: HITL-01, HITL-02, HITL-03, HITL-04, HITL-05, HITL-06, HITL-07, TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07, SCHD-01, SCHD-02, SCHD-03, SCHD-04, SCHD-05, SCHD-06, ESTOP-01, ESTOP-02, ESTOP-03, ESTOP-04
**Success Criteria** (what must be TRUE):
  1. Creating a decision via POST and answering it via POST writes the answer to the queue file on disk
  2. Creating a task, approving it, and rerunning a failed task all transition status correctly
  3. Creating a schedule with a cron expression shows correct next_run_at; updating the cron clears and recomputes next_run_at
  4. POST /api/system/emergency-stop SIGTERMs only validated claude -p processes and sets the emergency flag
  5. POST /api/inbox creates a message; POST /api/inbox/{id}/reply writes the reply to the queue file
**Plans**: 5 plans

Wave structure (depends_on chain serializes router-registration writers on `cmc/api/routes/__init__.py`; 04-05 parallels in Wave 1 because it does NOT touch __init__.py):
- Wave 0: 04-01
- Wave 1: 04-02 (depends_on 04-01), 04-05 (depends_on 04-01) — parallel
- Wave 2: 04-03 (depends_on 04-01, 04-02)
- Wave 3: 04-04 (depends_on 04-01, 04-03)

- [x] 04-01-PLAN.md — Wave 0 foundation: croniter + anthropic deps, 4 schema modules, cmc.core.queue + cmc.core.process, cmc.tasks (transitions + spawn), cmc.schedules (cron + nlcron), dispatcher.oneshot stub, Settings.dispatcher_oneshot_cmd, conftest factories + 4 Phase-4 test scaffolds ✅ 2026-04-26
- [x] 04-02-PLAN.md — HITL router (HITL-01..07): decisions list/create-with-INSERT-OR-IGNORE/answer + inbox list/create/read/reply; file-then-DB ordering for queue writes ✅ 2026-04-26
- [x] 04-03-PLAN.md — Tasks router (TASK-01..07): list/create/patch-with-transition-validation/delete/approve/rerun + dispatcher trigger via subprocess.Popen ✅ 2026-04-26
- [x] 04-04-PLAN.md — Schedules router (SCHD-01..06): list/create/patch-with-cron-recompute/delete/runs + NL→cron via Anthropic Haiku 4.5 (503-graceful) ✅ 2026-04-26
- [x] 04-05-PLAN.md — ESTOP-01..04 extends existing system router: flag flip + ps-validated PID SIGTERM + running-task fail + resume ✅ 2026-04-26

### Phase 5: Frontend Shell & Design System
**Goal**: The React app has complete navigation, reusable component library, dark theme, and the visual quality bar of Linear/Raycast/Vercel
**Depends on**: Phase 1
**Requirements**: FESH-01, FESH-02, FESH-03, FESH-04, FESH-05, FESH-06, FESH-07, FESH-08, FESH-09, FESH-10, DESG-01, DESG-02, DESG-03, DESG-04, DESG-05, DESG-06
**Success Criteria** (what must be TRUE):
  1. Three routes (/, /activity, /skills) render with navigation bar and correct page layout
  2. Cmd+K opens command palette with fuzzy search across pages and quick-task action
  3. Collapsible sections persist open/closed state in localStorage and animate with framer-motion
  4. Dark theme matches spec palette (bg #0a0a0f, surface #12121a, accent gradient) with Inter body + JetBrains Mono labels
  5. Every panel shows loading skeletons (not spinners) and clear empty states
**Plans**: 4 plans

Wave structure (serialized — 05-02 and 05-03 both append to styles.css and components/ui/index.ts, so they cannot run parallel):
- Wave 0: 05-01
- Wave 1: 05-02 (depends_on 05-01)
- Wave 2: 05-03 (depends_on 05-01, 05-02)
- Wave 3: 05-04 (depends_on 05-01, 05-02, 05-03)

- [x] 05-01-PLAN.md — Wave 0 foundation: deps + design tokens (replace Phase 1 styles.css stub) + Google Fonts + lib/storage + lib/api scaffolding + AppShell + NavBar + 3 TanStack Router routes + Vitest 4 / RTL 16 / happy-dom test infra with all 5 RESEARCH pitfalls pre-mitigated ✅ 2026-04-26
- [x] 05-02-PLAN.md — Layout primitives (Wave 1): Card family, Button, Badge, StatePill, Tooltip (Radix), Skeleton, EmptyState, RelativeTime, ErrorBoundary + barrel index ✅ 2026-04-27
- [x] 05-03-PLAN.md — Interactive primitives (Wave 1, parallel with 05-02): Sheet (Radix Dialog + framer-motion), CollapsibleSection (Radix Collapsible + framer-motion + lib/storage), CommandPalette (cmdk + global Cmd+K binding) + AppShell wiring ✅ 2026-04-27
- [x] 05-04-PLAN.md — Pre-domain placeholder card grids on /, /activity, /skills (one Card per Phase-6/7 requirement ID) + integration smoke test + human-verify visual quality bar checkpoint ✅ 2026-04-27
**UI hint**: yes

### Phase 6: Observability & Activity Panels
**Goal**: Users can see system health, live sessions, token usage, cache efficiency, tool latency, and all other observability data in polished panels on the Command and Activity pages
**Depends on**: Phase 3, Phase 5
**Requirements**: OPNL-01, OPNL-02, OPNL-03, OPNL-04, OPNL-05, OPNL-06, OPNL-07, OPNL-08, OPNL-09, OPNL-10, OPNL-11, OPNL-12, OPNL-13, OPNL-14, OPNL-15, ACTV-01, ACTV-02, ACTV-03, ACTV-04, ACTV-05, ACTV-06
**Success Criteria** (what must be TRUE):
  1. Page load shows system health strip, KPI row, and attention bar with live data (or meaningful empty states)
  2. Live sessions card shows active sessions with tool-call timeline drawer and follow-up messaging
  3. Token usage card displays stacked daily bars with today/7d/30d toggle and correct model/source breakdown
  4. MCP panel shows server list with expandable per-tool drill-down showing p50/p95/max/error-rate and slow/fast tags
  5. Activity page shows 30-day heatmap, 14-day token charts, OTEL firehose with filtering, sessions table with search/pagination
**Plans**: TBD
**UI hint**: yes

### Phase 7: Command Centre Panels
**Goal**: Users can manage decisions, inbox, tasks, and schedules from the dashboard, and control skills across environments
**Depends on**: Phase 4, Phase 5
**Requirements**: HPNL-01, HPNL-02, TPNL-01, TPNL-02, TPNL-03, TPNL-04, TPNL-05, SKLP-01, SKLP-02, SKLP-03, SKLP-04
**Success Criteria** (what must be TRUE):
  1. Pending decisions appear with answer button/modal and the list refreshes at 5s polling
  2. Task board shows three columns (pending/running/done) with working approve, rerun, and delete actions
  3. Task composer slide-out creates a new task with all fields (model, mode, priority, quadrant, risk, approval, dry_run)
  4. Schedule composer creates schedules with time picker, day chips, live cron preview, and run history is viewable
  5. Emergency stop banner appears in header with 2-step confirmation dialog
**Plans**: TBD
**UI hint**: yes

### Phase 8: Mission Control Dispatcher
**Goal**: Tasks execute autonomously via the dispatcher with stream-mode DECISION/INBOX parsing, skill routing, and safe PID-based process management
**Depends on**: Phase 4
**Requirements**: DISP-01, DISP-02, DISP-03, DISP-04, DISP-05, DISP-06, DISP-07, DISP-08, DISP-09, DISP-10, DISP-11, DISP-12
**Success Criteria** (what must be TRUE):
  1. Launchd heartbeat claims pending tasks atomically and materializes scheduled tasks every 120s
  2. Classic mode runs claude -p as subprocess with timeout, captures stdout, and tracks PID in file
  3. Stream mode parses DECISION: and INBOX: markers from claude output (skipping fenced code blocks) and blocks on answer poll
  4. Emergency stop flag causes immediate dispatcher return without executing tasks
  5. Dispatcher runs up to 3 concurrent tasks and sweeps stale PID files on each cycle
**Plans**: TBD

### Phase 9: Telegram, Setup & Testing
**Goal**: Optional Telegram pager works for notifications and callbacks, one-command installer sets up everything, and Playwright tests verify the critical user flows
**Depends on**: Phase 6, Phase 7, Phase 8
**Requirements**: TELE-01, TELE-02, TELE-03, TELE-04, TELE-05, TELE-06, TELE-07, SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05, SETUP-06, SETUP-07, TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. install.sh detects Python, creates venv, installs deps, copies files, renders launchd plists, and produces a working cc CLI shim
  2. cc start / cc stop / cc restart / cc doctor / cc logs all work correctly
  3. setup_telegram.py wizard walks through BotFather setup and sends a test message
  4. Telegram notifier sends plain-text notifications for decisions, failures, and overdue schedules with working inline buttons
  5. Playwright e2e tests pass: all three routes render, Cmd+K opens palette, schedule composer works, theme toggle persists
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 (parallel with 4, 5) -> 6 (parallel with 7, 8) -> 9

Note: Phases 3, 4, and 5 can execute in parallel after Phase 2 (or Phase 1 for 4 and 5). Phases 6 and 7 can execute in parallel once their dependencies are met. Phase 8 can execute in parallel with 6 and 7.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Database | 7/7 | Complete | 2026-04-25 |
| 2. Data Ingestion | 6/6 | Complete (verifier: 5/5 must-haves) | 2026-04-26 |
| 3. Read-Only APIs | 5/5 | Complete (verifier: 5/5 must-haves) | 2026-04-26 |
| 4. Stateful APIs | 5/5 | Complete (verifier: 5/5 must-haves) | 2026-04-26 |
| 5. Frontend Shell & Design System | 4/4 | Complete (visual quality bar approved by user) | 2026-04-27 |
| 6. Observability & Activity Panels | 0/TBD | Not started | - |
| 7. Command Centre Panels | 0/TBD | Not started | - |
| 8. Mission Control Dispatcher | 0/TBD | Not started | - |
| 9. Telegram, Setup & Testing | 0/TBD | Not started | - |
