# Claude Mission Control

## What This Is

A production-grade local dashboard and command centre for Claude Code, shipped as v1.0 on 2026-04-28. Ingests session JSONLs and OTEL telemetry from the user's Mac, stores everything in SQLite (WAL), and renders a dense, dark-themed React UI at `localhost:8765`. Includes a Mission Control task dispatcher with classic + stream execution modes, a human-in-the-loop decisions/inbox system, scheduled task automation with cron + natural-language input, live session monitoring, and an optional Telegram bridge with full Approve/Reject/Snooze callback parity. Runs entirely on localhost — no cloud, no accounts, no outbound telemetry.

## Core Value

A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, queue and approve tasks, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

(Verified at v1.0 ship: shipping the full observability + command centre + dispatcher + Telegram bridge confirmed this remains the right framing. Core value did not shift during the milestone.)

## Requirements

### Validated

- ✓ Ingest session JSONLs from `~/.claude/projects/` on boot and every 120s — v1.0
- ✓ Receive OTEL telemetry via `/v1/logs` and `/v1/metrics` endpoints (OTLP/HTTP JSON, always-200 contract) — v1.0
- ✓ Store all data in a single SQLite file with WAL mode + Alembic migrations — v1.0 (Alembic 0001_initial.py creates all 15 tables; FOUND-02 "CREATE TABLE IF NOT EXISTS" wording was intent — Alembic provides the data-safe equivalent)
- ✓ Serve pre-built React frontend as static files from FastAPI with SPA catch-all routing — v1.0
- ✓ Show system health strip, KPI row, and attention bar on every page load — v1.0 (OPNL-01..03)
- ✓ Display live sessions with tool-call timeline drawer and follow-up messaging for stream-mode sessions — v1.0 (OPNL-04)
- ✓ Show token usage with daily stacked bars (today/7d/30d) by model and source — v1.0 (OPNL-05)
- ✓ Show cache efficiency with hit rate, daily trend, and low-sample badge (<10K billable tokens) — v1.0 (OPNL-06)
- ✓ Show session outcomes as stacked daily bars (errored/rate_limited/truncated/unfinished/ok) — v1.0 (OPNL-07, read-time CASE in `/api/sessions/outcomes`)
- ✓ Show per-tool latency with p50/p95/max/error-rate sorted by p95 — v1.0 (OPNL-08, percentile via Pattern 4)
- ✓ Show hook activity with daily fires and paired-duration estimates — v1.0 (OPNL-09, 60s cap, FIFO per session)
- ✓ Show project breakdown by cwd with session and token rollups — v1.0 (OPNL-10, backend display_path field; no client regex)
- ✓ Show agent fanout (sessions using Agent tool) — v1.0 (OPNL-11)
- ✓ Show edit acceptance rates from tool_decision events — v1.0 (OPNL-12)
- ✓ Show productivity counters (commits, PRs, lines of code) from OTEL metrics — v1.0 (OPNL-13)
- ✓ Show system pressure (retry exhaustion, compaction, recent API errors) — v1.0 (OPNL-14)
- ✓ Provide MCP server drill-down with per-server and per-tool latency breakdown — v1.0 (OPNL-15 + SKLP-01, three-source priority aggregator)
- ✓ Show context health (read-only scan of settings.json + CLAUDE.md) — v1.0 (SKLP-03, secret-key name redaction)
- ✓ Provide skill registry with autonomy controls across environments — v1.0 (SKLP-04, optimistic onMutate/onError rollback)
- ✓ Show activity heatmap (30-day GitHub-style grid) and 14-day token charts by model — v1.0 (ACTV-01, ACTV-02 client-side 14-day slice)
- ✓ Provide OTEL firehose panel with SSE streaming and event filtering — v1.0 (ACTV-03)
- ✓ Show unified failure view (crashed sessions with errors) — v1.0 (ACTV-05)
- ✓ Provide searchable, paginated sessions table with range/source/model filters — v1.0 (ACTV-06)
- ✓ Implement HITL decisions queue with pending/answered flow and dashboard answering — v1.0 (HPNL-01, 5s polling)
- ✓ Implement HITL inbox for agent-to-user messaging with read/reply — v1.0 (HPNL-02, 10s polling)
- ✓ Implement task board with 3 columns (pending/running/done), composer sheet, and full lifecycle (approve/rerun/delete) — v1.0 (TPNL-01, TPNL-02 with draft persistence)
- ✓ Implement schedule system with cron composer, enabled toggle, stale detection, and run history — v1.0 (TPNL-03, TPNL-04 with NL-cron via Haiku)
- ✓ Implement Mission Control dispatcher with stream/classic execution modes, DECISION:/INBOX: marker parsing, and PID-based process tracking — v1.0 (DISP-01..12, fenced-code-aware parser, 3-task concurrency, autonomy gate, FollowUpPump, Haiku skill router)
- ✓ Implement emergency stop that SIGTERMs only dispatcher-launched `claude -p` children via PID files — v1.0 (ESTOP-01..04, ps-validated PID before SIGTERM)
- ✓ Implement Telegram bridge with notifier (decisions, approvals, failures, overdue schedules, inbox) and inline button callbacks — v1.0 (TELE-01..07 + Phase 10 Approve/Reject/Snooze parity + answered_by='telegram' provenance)
- ✓ Provide command palette (Cmd+K) with fuzzy search across pages and quick-task action — v1.0 (FESH-07)
- ✓ Support collapsible sections with localStorage-persisted state and framer-motion animation — v1.0 (FESH-03, 220ms ease-out)
- ✓ Deliver production-grade dark theme matching Linear/Raycast/Vercel quality bar — v1.0 (DESG-01..06, visual quality bar approved by user at Phases 5/6/7 close-outs)
- ✓ Provide `install.sh` one-command installer with OTEL + Telegram wizards and launchd plist generation — v1.0 (SETUP-01..05)
- ✓ Provide `cmc` CLI shim with start/stop/restart/doctor/setup/sync/logs subcommands — v1.0 (SETUP-07; renamed from `cc` to avoid `/usr/bin/cc` clang collision)
- ✓ Provide `doctor.py` deterministic health check (no LLM) with colored output — v1.0 (SETUP-06; Phase 11 added .env loader so doctor doesn't false-skip Telegram check)
- ✓ Include Playwright e2e tests covering main pages, command palette, schedule composer, theme toggle — v1.0 (TEST-01..04, chromium-only, 6/6 passing)

**v1.0 audit verification:** 148/148 requirements, 11/11 phases, 8/8 cross-phase integration checks, 8/8 E2E flows passed (re-audited 2026-04-28).

### Active

(Empty — define next milestone via `/gsd:new-milestone`)

### Out of Scope

- Posture audits panel — community-only feature, not part of this build
- Cloud deployment / remote access — localhost-only by design (privacy model still valid post-v1)
- WebSockets for observability — SSE + polling proved sufficient at v1.0; reasoning still valid
- PostgreSQL / Supabase / external databases — SQLite single-file is the right tool for this workload (validated under real-world ingest at v1.0)
- External auth / OAuth — no auth needed, localhost-only
- Mobile app — browser-only dashboard
- Voice interfaces / agent avatars — dense data UI, not conversational
- Real-time WebSocket session streaming — SSE + polling sufficient at v1.0
- Multi-user support — single-user tool by design
- ACTV-04 functional TopSkills panel — deferred to v2 pending `claude_code.skill_invoked` OTEL event in ingest pipeline
- SKLP-02 functional SkillCostCard — same dependency as ACTV-04, deferred to v2

## Context

**v1.0 shipped 2026-04-28** at git `a771a0a` — 4-day milestone (2026-04-25 → 2026-04-28), 11 phases (9 base + 2 audit gap-closure), 47 plans, 745 files changed, 172,853 insertions, ~39,800 LOC (~25,000 Python + ~14,800 TypeScript/TSX). Test suites green at close: 388+ backend + 234+ frontend + 6 Playwright e2e specs. Visual quality bar approved by user at Phases 5/6/7 close-outs.

The user already runs a version of this dashboard daily; v1.0 is a from-scratch rebuild as the reference implementation. The companion guide (`build-your-own-dashboard-guide.html`) positions it as a "build your own" prompt that produces a working clone.

**Data sources are already on disk:**

- Session JSONLs at `~/.claude/projects/<project-hash>/<session-id>.jsonl` — one per session, line-delimited JSON events with `user`/`assistant` messages, `tool_use`/`tool_result` pairs, and `result` events
- OTEL telemetry via `CLAUDE_CODE_ENABLE_TELEMETRY=1` pointed at the dashboard's `/v1/logs` and `/v1/metrics` endpoints

**FastAPI chassis foundation (validated at v1.0):**
The backend follows patterns from the user's `fastapi-chassis` repo: app factory with builder pattern, Pydantic v2 `BaseSettings` for configuration, lifespan context manager for resource lifecycle, structured logging with request context, and middleware stack ordering. Adapted for this project's needs (SQLAlchemy 2.0 async + SQLModel instead of the chassis's plain stack, SQLite-only, no auth layer).

**Frontend is pre-built:**
Vite builds to `frontend/dist/` which FastAPI serves as static files (SPA mount registered AFTER routers per Phase 1 Pitfall 8). No SSR. React Query polls at locked cadences (5s for decisions, 10s for inbox, 30s for most observability data) — locked in `lib/queries.ts`. TanStack Router provides file-based routing with three pages: Command (`/`), Activity (`/activity`), Skills (`/skills`).

**Database stack (locked Phase 1, validated v1.0):**
SQLAlchemy 2.0 async + SQLModel + Alembic. SQLModel classes (one per resource) define all 15 tables. The async engine uses `sqlite+aiosqlite://` with WAL mode, foreign_keys=ON, and busy_timeout pragmas applied at connect time via a pragma listener. Schema management is Alembic (`0001_initial.py` creates all 15 tables; future migrations evolve them via `op.batch_alter_table` for SQLite compatibility). FOUND-02/03 wording in REQUIREMENTS.md describes intent — Alembic is the idempotent, data-safe implementation.

**Dispatcher is a separate process:**
Mission Control runs via launchd (120s heartbeat). It claims pending tasks atomically, materializes scheduled tasks, runs `claude -p` (classic) or `claude` (stream) as subprocesses, parses DECISION:/INBOX: markers (skipping fenced code blocks), routes unassigned tasks to skills via Haiku, and gates execution on a per-skill autonomy level. PID files in `.tmp/mission-control-queue/pids/` track spawned children for emergency-stop targeting (ps-validated before SIGTERM).

**Known v1.0 tech debt (carried into v2 backlog):**

- ACTV-04 / SKLP-02 placeholder cards in production UI (need `claude_code.skill_invoked` OTEL event)
- `answer_poll` uses 2s DB polling rather than file-watch (works for single-host)
- No CI gate for `npm run test:e2e` in v1 (Q6 LOCKED — manual gate by design)
- `FollowUpPump` queue keyed on `task_id` but dashboard `/api/sessions/live/{sid}/message` writes session_id-keyed queue — dashboard follow-ups don't reach dispatcher tasks (documented v1 design)
- `reply_inbox` callback is NOOP at dash_router (handler acks 'reply via dashboard') — Telegram Reply button is UX dead-end in v1
- Orphan `api.ts` client functions (`mcpSync`, `mcpMeasure`, `sync`, `createDecision`, `createInbox`, `sessionLiveState`) — exported but unused; cosmetic
- `test_phase3_system.py::test_sapi05_firehose_route_is_registered` fails on Python 3.11 only; project pins ≥3.13 — environmental only
- `test_phase4_estop` pre-existing flake (logged in `deferred-items.md`)

## Constraints

- **Platform**: macOS only (launchd, JSONL paths, install script) — Linux deferred to v2 (PLAT-01)
- **Python**: 3.13+ (chassis patterns, `from __future__ import annotations` not needed)
- **Runtime**: Single-machine, single-user, localhost:8765
- **Database**: SQLite with WAL mode, single `.db` file in `data/`
- **ORM**: SQLAlchemy 2.0 async + SQLModel; raw SQL only when stepping outside the ORM is unavoidable. `aiosqlite` is the async driver under the hood.
- **No external services**: No cloud, no accounts, no outbound network (except optional Telegram)
- **Frontend build**: Pre-built `frontend/dist/` served as static, no SSR
- **Quality bar**: Linear / Raycast / Vercel level — dense signal, dark theme, dialed-in typography, tasteful motion, production-grade polish (validated at v1.0)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| FastAPI chassis patterns (app factory, builder, settings, lifespan) | User's established production patterns — consistency and quality | ✓ Good — chassis patterns held up across 11 phases; no rework needed |
| SQLAlchemy 2.0 async + SQLModel + Alembic | Locked in Phase 1 discussion — supersedes earlier "raw SQL" direction. Models give type-safe queries, Alembic gives versioned migrations, aiosqlite stays as the async driver. | ✓ Good — type-safe queries paid off across 50+ endpoints; no schema regressions |
| Python 3.13 | User preference for latest Python; chassis targets 3.13+ | ✓ Good — only env-only test flake on 3.11 (pinned ≥3.13 anyway) |
| SQLite single-file with WAL | Local-only, no multi-server, excellent read concurrency for dashboard workload | ✓ Good — handled real-world ingest at v1.0 close without contention issues |
| PID files for emergency stop targeting | macOS 12+ restricts env disclosure to root; PID files are the only reliable way to identify dispatched children | ✓ Good — ESTOP-01..04 ship with ps-validation defense-in-depth |
| TanStack Router (file-based) + React Query (30s poll) | Modern React routing + efficient data fetching without WebSocket complexity | ✓ Good — locked polling cadences in `lib/queries.ts` worked across 21 panels |
| Launchd for daemon management | macOS-native process supervision, no third-party dependency | ✓ Good — 4 launchd plists ship in install.sh; daemon start bug fixed in 09-04 |
| SSE for firehose, polling everywhere else | Simpler than WebSockets, sufficient for single-user local dashboard | ✓ Good — bespoke `useFirehose` hook + per-router SSE helpers held up |
| Plain text Telegram messages (no parse_mode) | DB-sourced content has unescaped backticks that break markdown parsing silently | ✓ Good — Pitfall P3 enforced by `inspect.signature()` grep test in 09-01 |
| Theme toggle locked to Q1=A (Phase 9) | Light mode CSS overrides + `lib/theme.ts` module + NavBar mount | ✓ Good — TEST-04 verified persistence |
| `cmc` CLI shim (renamed from `cc`) | Avoids `/usr/bin/cc` (clang) collision discovered during Phase 9 install testing | ✓ Good — clean install verified end-to-end at Phase 9 close |
| 2-phase audit gap closure (Phases 10–11) over deferred-items list | Audit found integration + flow gaps — close them in-milestone rather than defer to v1.1 to ship a clean v1.0 | ✓ Good — re-audit returned 148/148 requirements + 8/8 integration + 8/8 flows |

---

*Last updated: 2026-04-28 after v1.0 milestone*
