# Claude Mission Control

## What This Is

A production-grade local dashboard and command centre for Claude Code. It ingests session JSONLs and OTEL telemetry from the user's Mac, stores everything in SQLite, and renders a dense, dark-themed React UI at `localhost:8765`. It includes a task dispatcher (Mission Control), human-in-the-loop decision/inbox system, scheduled task automation, live session monitoring, and an optional Telegram pager. Runs entirely on localhost — no cloud, no accounts, no outbound telemetry.

## Core Value

A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, queue and approve tasks, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Ingest session JSONLs from `~/.claude/projects/` on boot and every 120s
- [ ] Receive OTEL telemetry via `/v1/logs` and `/v1/metrics` endpoints (OTLP/HTTP JSON)
- [ ] Store all data in a single SQLite file with WAL mode and idempotent migrations
- [ ] Serve pre-built React frontend as static files from FastAPI
- [ ] Show system health strip, KPI row, and attention bar on every page load
- [ ] Display live sessions with tool-call timeline drawer and follow-up messaging for stream-mode sessions
- [ ] Show token usage with daily stacked bars (today/7d/30d) by model and source
- [ ] Show cache efficiency with hit rate, daily trend, and low-sample badge
- [ ] Show session outcomes as stacked daily bars (errored/rate_limited/truncated/unfinished/ok)
- [ ] Show per-tool latency with p50/p95/max/error-rate sorted by p95
- [ ] Show hook activity with daily fires and paired-duration estimates
- [ ] Show project breakdown by cwd with session and token rollups
- [ ] Show agent fanout (sessions using Agent tool)
- [ ] Show edit acceptance rates from tool_decision events
- [ ] Show productivity counters (commits, PRs, lines of code) from OTEL metrics
- [ ] Show system pressure (retry exhaustion, compaction, recent API errors)
- [ ] Provide MCP server drill-down with per-server and per-tool latency breakdown — the centerpiece panel
- [ ] Display skill economics (token cost per skill)
- [ ] Show context health (read-only scan of settings.json + CLAUDE.md)
- [ ] Provide skill registry with autonomy controls across environments
- [ ] Show activity heatmap (30-day GitHub-style grid) and 14-day token charts by model
- [ ] Provide OTEL firehose panel with SSE streaming and event filtering
- [ ] Show top skills and unified failure view (crashed sessions with errors)
- [ ] Provide searchable, paginated sessions table with range/source/model filters
- [ ] Implement HITL decisions queue with pending/answered flow and dashboard answering
- [ ] Implement HITL inbox for agent-to-user messaging with read/reply
- [ ] Implement task board with 3 columns (pending/running/done), composer sheet, and full lifecycle (approve/rerun/delete)
- [ ] Implement schedule system with cron composer, enabled toggle, stale detection, and run history
- [ ] Implement Mission Control dispatcher with stream/classic execution modes, DECISION:/INBOX: marker parsing, and PID-based process tracking
- [ ] Implement emergency stop that SIGTERMs only dispatcher-launched `claude -p` children via PID files
- [ ] Implement Telegram bridge with notifier (decisions, approvals, failures, overdue schedules, inbox), inline button callbacks, and chat routing
- [ ] Provide command palette (Cmd+K) with fuzzy search across pages and quick-task action
- [ ] Support collapsible sections with localStorage-persisted state and framer-motion animation
- [ ] Deliver production-grade dark theme matching Linear/Raycast/Vercel quality bar
- [ ] Provide `install.sh` one-command installer with OTEL wizard, Telegram wizard, launchd plist generation
- [ ] Provide `cc` CLI shim with start/stop/restart/doctor/setup/sync/logs subcommands
- [ ] Provide `doctor.py` deterministic health check (no LLM) with colored output
- [ ] Include Playwright e2e tests covering main pages, command palette, schedule composer, theme toggle

### Out of Scope

- Posture audits panel — community-only feature, not part of this build
- Cloud deployment / remote access — localhost-only by design
- WebSockets for observability — SSE where needed, polling otherwise
- PostgreSQL / Supabase / external databases — SQLite single-file only
- External auth / OAuth — no auth, local-only
- Mobile app — browser-only dashboard
- Voice interfaces / agent avatars — dense data UI, not conversational
- Cowork integration — referenced in spec as optional, defer to post-v1
- Real-time WebSocket session streaming — use SSE and polling

## Context

The user already runs a version of this dashboard daily. This is a from-scratch rebuild of the full system, intended as the reference implementation. The companion guide (`build-your-own-dashboard-guide.html`) positions this as a "build your own" prompt that produces a working clone.

**Data sources are already on disk:**
- Session JSONLs at `~/.claude/projects/<project-hash>/<session-id>.jsonl` — one per session, line-delimited JSON events with `user`/`assistant` messages, `tool_use`/`tool_result` pairs, and `result` events
- OTEL telemetry via `CLAUDE_CODE_ENABLE_TELEMETRY=1` pointed at the dashboard's `/v1/logs` and `/v1/metrics` endpoints

**FastAPI chassis foundation:**
The backend follows patterns from the user's `fastapi-chassis` repo: app factory with builder pattern, Pydantic v2 `BaseSettings` for configuration, lifespan context manager for resource lifecycle, readiness registry for health checks, structured logging with request context, and middleware stack ordering. Adapted for this project's needs (raw SQL instead of SQLAlchemy ORM, SQLite-only, no auth layer).

**Frontend is pre-built:**
Vite builds to `ui/dist/` which FastAPI serves as static files. No SSR. React Query polls at 30s intervals (5s for decisions, 10s for inbox). TanStack Router provides file-based routing with three pages: Command (`/`), Activity (`/activity`), Skills (`/skills`).

**Database uses raw SQL:**
No ORM. All queries are raw SQL via Python's `sqlite3` or `aiosqlite`. Schema uses `CREATE TABLE IF NOT EXISTS` with an idempotent `_migrate_add_column` helper. 15 tables covering sessions, tokens, tools, OTEL events/metrics, tasks, schedules, decisions, inbox, activities, live state, MCP stats, skills, system state, and notification log.

**Dispatcher is a separate process:**
Mission Control runs via launchd (120s heartbeat). It claims pending tasks atomically, materializes scheduled tasks, and runs `claude -p` or `claude` (stream mode) as subprocesses. PID files in `.tmp/mission-control-queue/pids/` track spawned children for emergency stop targeting.

## Constraints

- **Platform**: macOS only (launchd, JSONL paths, install script)
- **Python**: 3.13+ (using chassis patterns, `from __future__ import annotations` not needed)
- **Runtime**: Single-machine, single-user, localhost:8765
- **Database**: SQLite with WAL mode, single `.db` file in `data/`
- **No ORM**: Raw SQL everywhere, `aiosqlite` for async access
- **No external services**: No cloud, no accounts, no outbound network (except optional Telegram)
- **Frontend build**: Pre-built `ui/dist/` served as static, no SSR
- **Quality bar**: Linear / Raycast / Vercel level — dense signal, dark theme, dialed-in typography, tasteful motion, production-grade polish

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| FastAPI chassis patterns (app factory, builder, settings, lifespan) | User's established production patterns — consistency and quality | -- Pending |
| Raw SQL instead of SQLAlchemy ORM | Prompt specifies raw SQL; simpler for read-heavy dashboard with known schema | -- Pending |
| Python 3.13 | User preference for latest Python; chassis targets 3.13+ | -- Pending |
| SQLite single-file with WAL | Local-only, no multi-server, excellent read concurrency for dashboard workload | -- Pending |
| PID files for emergency stop targeting | macOS 12+ restricts env disclosure to root; PID files are the only reliable way to identify dispatched children | -- Pending |
| TanStack Router (file-based) + React Query (30s poll) | Modern React routing + efficient data fetching without WebSocket complexity | -- Pending |
| Launchd for daemon management | macOS-native process supervision, no third-party dependency | -- Pending |
| SSE for firehose, polling everywhere else | Simpler than WebSockets, sufficient for single-user local dashboard | -- Pending |
| Plain text Telegram messages (no parse_mode) | DB-sourced content has unescaped backticks that break markdown parsing silently | -- Pending |

---
*Last updated: 2026-04-25 after initialization*
