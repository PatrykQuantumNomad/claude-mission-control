# Claude Mission Control

## What This Is

A production-grade local dashboard and command centre for Claude Code, shipped as v1.0 on 2026-04-28 and extended through v1.1 (Skills & Cost Intelligence) on 2026-05-05. Ingests session JSONLs and OTEL telemetry from the user's Mac, stores everything in SQLite (WAL), and renders a dense, dark-themed React UI at `localhost:8765`. Includes a Mission Control task dispatcher with classic + stream execution modes, a human-in-the-loop decisions/inbox system, scheduled task automation with cron + natural-language input, live session monitoring, a hysteresis-aware skill-level alert engine with Telegram ack flow, two-up session comparison with deep-linkable URL state, a read-time cost engine with 5-SKU pricing and self-correcting historical totals, and an optional Telegram bridge with full Approve/Reject/Snooze callback parity. Runs entirely on localhost — no cloud, no accounts, no outbound telemetry.

## Core Value

A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, what each skill costs and how often it fails, queue and approve tasks, compare two sessions side-by-side, get paged when metrics breach thresholds, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

(Verified at v1.0 ship and re-verified at v1.1 ship: shipping the full skills observability suite + alert engine + session compare confirmed this remains the right framing. Core value did not shift during v1.1 — the milestone deepened the existing observability/command-centre lanes rather than adding a new lane.)

## Current State

**v1.1 Skills & Cost Intelligence shipped 2026-05-05** at git `af6d308` — 4-day milestone (2026-05-02 → 2026-05-05), 6 phases (12–17), 28 plans, 666 files changed vs v1.0, +81,397 / -13,435 lines. ~56,232 LOC at close (~35,700 Python + ~20,500 TypeScript/TSX). Test suites green at close: 552 backend + 292 frontend + 8 Playwright e2e specs. Audit re-verified 41/41 v1.1 requirements + 6/6 phases + 9/9 cross-phase integration + 6/6 E2E flows.

## Next Milestone Goals (TBD)

Define via `/gsd:new-milestone`. Carried backlog candidates:

- **Skill polish (v1.2 candidates):** SKLP-08 per-project breakdown, SKLP-09 period-over-period deltas, SKLP-10 "new this week" / "dormant" badges, SKLP-11 per-skill latency overhead breakdown
- **Cost differentiators:** ANLY-06 monthly cost forecast (linear extrapolation), ANLY-07 per-project cost breakdown card
- **Alert differentiators:** ALRT-13 full anomaly detection (rolling mean ± stddev), ALRT-14 NL-authored alert rules via Haiku
- **Compare differentiators:** CMPR-06 per-skill latency delta in compare view, CMPR-07 Cmd+K "compare with previous session" shortcut
- **Platform / automation:** PLAT-01 Linux/systemd support, AUTO-01..03 NL schedules beyond cron, auto-retry, task dependencies

## Requirements

### Validated

**v1.0 baseline (148 requirements — see `.planning/milestones/v1.0-REQUIREMENTS.md` for full list):**

- ✓ Ingest session JSONLs from `~/.claude/projects/` on boot and every 120s — v1.0
- ✓ Receive OTEL telemetry via `/v1/logs` and `/v1/metrics` endpoints (OTLP/HTTP JSON, always-200 contract) — v1.0
- ✓ Store all data in a single SQLite file with WAL mode + Alembic migrations — v1.0
- ✓ Serve pre-built React frontend as static files from FastAPI with SPA catch-all routing — v1.0
- ✓ Show system health strip, KPI row, and attention bar on every page load — v1.0 (OPNL-01..03)
- ✓ Display live sessions with tool-call timeline drawer and follow-up messaging for stream-mode sessions — v1.0 (OPNL-04)
- ✓ Show token usage with daily stacked bars (today/7d/30d) by model and source — v1.0 (OPNL-05)
- ✓ Show cache efficiency with hit rate, daily trend, and low-sample badge — v1.0 (OPNL-06)
- ✓ Show session outcomes as stacked daily bars — v1.0 (OPNL-07)
- ✓ Show per-tool latency with p50/p95/max/error-rate sorted by p95 — v1.0 (OPNL-08)
- ✓ Show hook activity with daily fires and paired-duration estimates — v1.0 (OPNL-09)
- ✓ Show project breakdown by cwd — v1.0 (OPNL-10)
- ✓ Show agent fanout, edit acceptance rates, productivity counters, system pressure — v1.0 (OPNL-11..14)
- ✓ Provide MCP server drill-down with per-server and per-tool latency — v1.0 (OPNL-15 + SKLP-01)
- ✓ Show context health (read-only scan of settings.json + CLAUDE.md) — v1.0 (SKLP-03)
- ✓ Provide skill registry with autonomy controls — v1.0 (SKLP-04)
- ✓ Show activity heatmap, 14-day token charts, OTEL firehose, unified failure view, sessions table — v1.0 (ACTV-01..03, ACTV-05, ACTV-06)
- ✓ Implement HITL decisions queue with pending/answered flow — v1.0 (HPNL-01, 5s polling)
- ✓ Implement HITL inbox for agent-to-user messaging — v1.0 (HPNL-02, 10s polling)
- ✓ Implement task board with full lifecycle — v1.0 (TPNL-01..02)
- ✓ Implement schedule system with cron composer + NL-cron — v1.0 (TPNL-03..04)
- ✓ Implement Mission Control dispatcher with stream/classic execution modes — v1.0 (DISP-01..12)
- ✓ Implement emergency stop with PID-validated SIGTERM — v1.0 (ESTOP-01..04)
- ✓ Implement Telegram bridge with notifier + handler + callback dispatch — v1.0 (TELE-01..07)
- ✓ Provide command palette (Cmd+K) with fuzzy search — v1.0 (FESH-07)
- ✓ Support collapsible sections + framer-motion polish — v1.0 (FESH-03)
- ✓ Deliver production-grade dark theme matching Linear/Raycast/Vercel quality bar — v1.0 (DESG-01..06)
- ✓ Provide `install.sh` + `cmc` CLI shim + `doctor.py` deterministic health check — v1.0 (SETUP-01..07)
- ✓ Include Playwright e2e tests covering main pages, command palette, schedule composer, theme toggle — v1.0 (TEST-01..04)

**v1.1 — see `.planning/milestones/v1.1-REQUIREMENTS.md` for full list (41 requirements):**

- ✓ Confirm `claude_code.skill_activated` event shape from real ingest (verbatim SQL output) — v1.1 (SPIK-01, Phase 12)
- ✓ `cmc.pricing.compute_cost` Decimal-only math + 5-SKU pricing table with `effective_from`/`effective_until` window logic; never store $ in derived tables — v1.1 (ANLY-01..03, Phase 13)
- ✓ `GET /api/cost/summary` + `/api/cost/breakdown?dim=model|skill|project` with cache-tier accounting; "Rates as of YYYY-MM-DD" UI caption; doctor warns on stale pricing rows — v1.1 (ANLY-04..05, Phase 13/14)
- ✓ `attrs_skill_name` indexed column + `(session_id, otel_event_id)` UNIQUE for idempotent skill-event ingest; single Alembic migration 0002 for skill column + alert tables — v1.1 (INGST-11..13, Phase 13)
- ✓ Skills API surface: `/api/skills/usage`, `/api/skills/{name}/cost|latency|runs` with Pattern 4 SQL CTEs — v1.1 (SKIL-04..07, Phase 14)
- ✓ TopSkills panel reactivated (closes ACTV-04 v1.0 placeholder); SkillCostCard reactivated (closes SKLP-02 v1.0 placeholder) — v1.1 (Phase 14)
- ✓ SkillLatencyTable + SkillTimeline + per-skill detail route `/skills/$name` (first file-based dynamic route in the codebase) — v1.1 (SKLP-05..07, Phase 14)
- ✓ Hysteresis-aware alert engine with `alert_rules` + `alert_state` tables; `evaluate_alerts(db)` invoked once per dispatcher tick after stamp_tick + e-stop; try/except isolation — v1.1 (ALRT-01..04, Phase 15)
- ✓ EWMA z-score detector with 24h warm-up suppression; stable `dedup_key = f"alert:{rule_id}:{scope_key}"` reusing `notification_log` UNIQUE; auto-resolve via `decisions.status='answered'` + `answered_by='alert_engine'` — v1.1 (ALRT-05..07, Phase 15)
- ✓ Telegram `ack_alert` callback verb (sha256[:8] under 64-byte cap) with 1h re-notification suppression; `cmc/telegram/callback_verbs.py` central StrEnum — v1.1 (ALRT-08, Phase 15)
- ✓ `/api/alerts` full CRUD + `/api/alerts/events?range=` history; `/alerts` UI page with rules list + discriminated-union form + events history — v1.1 (ALRT-09..10, Phase 15)
- ✓ Plain-text alert messages enforced by directory-wide `parse_mode=` grep test; alert engine NEVER imports `cmc.dispatcher.tasks` — v1.1 (ALRT-11..12, Phase 15/17)
- ✓ Single-round-trip `/api/sessions/compare?a=&b=` (≤9 SQL/request) with 200-with-flag over-cap fallback at 500 tool calls — v1.1 (CMPR-01, CMPR-04, Phase 16)
- ✓ Two-up `SessionCompareView` panel + `/sessions/compare` deep-linkable route (first `validateSearch` use, hand-written UUID validator) — v1.1 (CMPR-02, Phase 16)
- ✓ Cmd+K context-aware "Compare with…" + sessions-table per-row Compare button + ComparePicker Sheet drawer — v1.1 (CMPR-03, Phase 16)
- ✓ Tabular-only compare (recharts side-by-side, no diff library, no raw message rendering) — v1.1 (CMPR-05, Phase 16)
- ✓ `cmc doctor` warnings for stale pricing / unpriced tokens / unset OTEL_LOG_TOOL_DETAILS; `parse_mode=` directory-wide CI guard — v1.1 (POLI-01..02, Phase 13/17)
- ✓ CallbackVerb round-trip tests parametrized over enum; alert lifecycle integration test (1 decision + 1 notification_log) — v1.1 (POLI-03..04, Phase 17)
- ✓ Playwright e2e for `/alerts` (create→fire→ack with async-trigger 35s polling + cleanup) and `/sessions/compare` (both picker entry points) — v1.1 (TEST-05, Phase 17)
- ✓ Updated in-repo docs (README + .env.example) covering pricing seed workflow, OTEL spike findings, v1.1 panels — v1.1 (POLI-05, Phase 17; companion guide externally maintained per line 94)

**v1.0 audit verification:** 148/148 requirements, 11/11 phases, 8/8 cross-phase integration checks, 8/8 E2E flows passed (re-audited 2026-04-28).
**v1.1 audit verification:** 41/41 requirements, 6/6 phases, 9/9 cross-phase integration checks, 6/6 E2E flows passed (audited 2026-05-05).

### Active

(Next milestone TBD — see "Next Milestone Goals" above. Run `/gsd:new-milestone` to define requirements.)

### Out of Scope

- Posture audits panel — community-only feature, not part of this build
- Cloud deployment / remote access — localhost-only by design (privacy model still valid post-v1.1)
- WebSockets for observability — SSE + polling proved sufficient at v1.0/v1.1; reasoning still valid
- PostgreSQL / Supabase / external databases — SQLite single-file is the right tool (validated under real-world ingest at v1.0 and v1.1 alert/skill workloads)
- External auth / OAuth — no auth needed, localhost-only
- Mobile app — browser-only dashboard
- Voice interfaces / agent avatars — dense data UI, not conversational
- Real-time WebSocket session streaming — SSE + polling sufficient
- Multi-user support — single-user tool by design
- Multi-user / leaderboard skills — community-style features off-mission (locked v1.1)
- Hard cost caps that block invocation — alerts only; user owns the budget decision (locked v1.1)
- Auto-pause / auto-remediation on alert — decisions queue handles human action; "alerts are sensors, not actuators" (ALRT-12 invariant, locked v1.1)
- Multi-channel notifications (Slack, email, SMS) — Telegram + decisions queue only (locked v1.1)
- 3+ way session comparison — layout collapses; Linear/Honeycomb/Langfuse all stop at 2 (locked v1.1)
- Sub-30s polling for skill panels — 30s lockstep with existing observability cadence; firehose covers live needs (locked v1.1)
- Auto-fetch of model pricing from Anthropic page — manual seed + doctor warning (locked v1.1)
- SLO / error budget tracking — threshold alerts cover the legitimate single-user need (locked v1.1)
- Per-skill alert message templates — single plain-text format (locked v1.1)
- Saved-comparison bookmarks — URL state is sufficient (locked v1.1)
- Raw LLM message diff in comparison — privacy-leaky and visually overwhelming (CMPR-05 invariant, locked v1.1)
- Post-hoc annotation / tagging of OTEL events — events are immutable (locked v1.1)
- Cost stamping at ingest time — read-time only; `/v1/logs` MUST always return 200 (locked v1.1)
- Cost stored as $ in DB — tokens stored, $ computed at read time; pricing edits self-correct historical totals (locked v1.1)

(Removed from out-of-scope at v1.1 ship: ACTV-04 functional TopSkills panel and SKLP-02 functional SkillCostCard — both reactivated by Phase 14 once the OTEL spike confirmed the literal `claude_code.skill_activated` event shape.)

## Context

**v1.0 shipped 2026-04-28** at git `a771a0a` — 4-day milestone, 11 phases (9 base + 2 audit gap-closure), 47 plans, 745 files changed, 172,853 insertions, ~39,800 LOC. Test suites green at close: 388+ backend + 234+ frontend + 6 Playwright e2e specs. Visual quality bar approved by user at Phases 5/6/7 close-outs.

**v1.1 shipped 2026-05-05** at git `af6d308` — 4-day milestone, 6 phases (12–17), 28 plans, 666 files changed vs v1.0, +81,397 / -13,435 lines. ~56,232 LOC at close. Test suites green at close: 552 backend + 292 frontend + 8 Playwright e2e specs. Audit verified 41/41 requirements + 6/6 phases + 9/9 integration + 6/6 flows.

The user already runs a version of this dashboard daily; v1.0 is a from-scratch rebuild as the reference implementation, and v1.1 deepened the skills/cost/alerts/compare lanes to the same quality bar. The companion guide (`build-your-own-dashboard-guide.html`) positions it as a "build your own" prompt that produces a working clone — externally maintained outside this repo.

**Data sources are already on disk:**

- Session JSONLs at `~/.claude/projects/<project-hash>/<session-id>.jsonl` — one per session, line-delimited JSON events
- OTEL telemetry via `CLAUDE_CODE_ENABLE_TELEMETRY=1` pointed at the dashboard's `/v1/logs` and `/v1/metrics` endpoints (cache TTL split, `attrs_skill_name` indexed column landed v1.1)

**FastAPI chassis foundation (validated at v1.0 + v1.1):**
The backend follows patterns from the user's `fastapi-chassis` repo: app factory with builder pattern, Pydantic v2 `BaseSettings` for configuration, lifespan context manager for resource lifecycle, structured logging with request context, and middleware stack ordering. Adapted for this project's needs (SQLAlchemy 2.0 async + SQLModel instead of the chassis's plain stack, SQLite-only, no auth layer). v1.1 added the `cmc.pricing` lifespan auto-seed and Alembic migration 0002 (auto-applied via `command.upgrade(alembic_cfg, "head")` in `lifespan.py:98-100`).

**Frontend is pre-built:**
Vite builds to `frontend/dist/` which FastAPI serves as static files (SPA mount registered AFTER routers per Phase 1 Pitfall 8). No SSR. React Query polls at locked cadences (5s for decisions, 10s for inbox, 30s for most observability data including alerts) — locked in `lib/queries.ts`. TanStack Router provides file-based routing with v1.0 base pages (Command, Activity, Skills) plus v1.1 additions (`/skills/$name` per-skill detail, `/alerts` page, `/sessions/compare?a=&b=` deep-linkable compare).

**Database stack (locked Phase 1, validated v1.0 + v1.1):**
SQLAlchemy 2.0 async + SQLModel + Alembic. SQLModel classes (one per resource) define all tables (15 in v1.0; +pricing/alert_rules/alert_state in v1.1 migration 0002). The async engine uses `sqlite+aiosqlite://` with WAL mode, foreign_keys=ON, and busy_timeout pragmas applied at connect time via a pragma listener. Schema management is Alembic (`0001_initial.py` + `0002_v1_1_alerts_and_skills.py`). v1.1 ingest writes via `INSERT ... ON CONFLICT DO NOTHING` for idempotent skill-event capture.

**Dispatcher is a separate process:**
Mission Control runs via launchd (120s heartbeat). It claims pending tasks atomically, materializes scheduled tasks, runs `claude -p` (classic) or `claude` (stream) as subprocesses, parses DECISION:/INBOX: markers, routes unassigned tasks to skills via Haiku, and gates execution on a per-skill autonomy level. v1.1 added `cmc/dispatcher/alerts.py::evaluate_alerts(db)` invoked once per tick after `stamp_tick` and after the e-stop early-return (try/except isolated so alert failures never kill the cycle).

**Cost engine (v1.1):**
`cmc.pricing.compute_cost(model, input, output, cache_read, cache_create_5m, cache_create_1h) -> Decimal` is the single source of truth. Read-time computation only — `/v1/logs` always returns 200, never blocking on price lookups. The `pricing` table uses `effective_from`/`effective_until` so adding/correcting rates self-corrects historical totals. 5 SKUs seeded from `data/pricing.json` at lifespan boot: `claude-opus-4-7`, `claude-opus-4-7[1m]`, `claude-sonnet-4-6`, `claude-sonnet-4-6[1m]`, `claude-haiku-4-5`.

**Alert engine (v1.1):**
Hysteresis-aware threshold + EWMA z-score detector (stdlib `math` only). Stable `dedup_key = f"alert:{rule_id}:{scope_key}"` reuses `notification_log` UNIQUE(kind, entity_id, chat_id) constraint and `decisions` partial-unique on dedup_key WHERE status='pending' — no new state machine. Alerts emit decisions only; the user gates action via existing autonomy controls (ALRT-12 invariant). Auto-resolve writes `decisions.status='answered'` with `answered_by='alert_engine'`. 3 v1.0 metrics in `_SCOPE_EXTRACTORS` table: `cost_usd_24h` / `skill_p95_latency_ms` / `dispatcher_failed_tasks_5m`.

**Known v1.1 outstanding human-verify items (non-blocking, operational):**

- Apply Alembic migration 0002 to live `data/cmc.db` (auto-applies on next `cmc start` via lifespan)
- Phase 14 visual checkpoint per Plan 14-05 (operator-driven dashboard navigation on `/activity`, `/skills`, `/skills/$name`)

**Known v1.1 tech debt (carried forward):**

- REQUIREMENTS.md ALRT-01/02 cosmetic `[ ]` markers despite traceability marking Complete — flipped at archive time
- `Field(default_factory=datetime.utcnow)` in `cmc/db/models/alert_rules.py` (deprecated in 3.12+; UTCDatetime serializer handles Z-suffix on the wire)
- `SchedulesCard.test.tsx > stale row` pre-existing time-of-day-dependent flake (Phase 7 origin)
- `schedule-composer.spec.ts` strict-mode collision with Phase 14 firehose filter `aria-label="Filter skill name"` — selector ambiguity, not production drift
- KNOWN_METRICS frontend constant must stay in sync with backend `_SCOPE_EXTRACTORS` keys (sync warning in module docstring)

**Carried v1.0 tech debt:**

- `answer_poll` uses 2s DB polling rather than file-watch (works for single-host)
- No CI gate for `npm run test:e2e` in v1 (Q6 LOCKED — manual gate by design)
- `FollowUpPump` queue keyed on `task_id` but dashboard `/api/sessions/live/{sid}/message` writes session_id-keyed queue
- `reply_inbox` callback is NOOP at dash_router (Telegram Reply button is UX dead-end)
- Orphan `api.ts` client functions (cosmetic)
- `test_phase4_estop` pre-existing flake

## Constraints

- **Platform**: macOS only (launchd, JSONL paths, install script) — Linux deferred to v2 (PLAT-01)
- **Python**: 3.13+ (chassis patterns)
- **Runtime**: Single-machine, single-user, localhost:8765
- **Database**: SQLite with WAL mode, single `.db` file in `data/`
- **ORM**: SQLAlchemy 2.0 async + SQLModel; raw SQL only when stepping outside the ORM is unavoidable. `aiosqlite` is the async driver under the hood.
- **No external services**: No cloud, no accounts, no outbound network (except optional Telegram)
- **Frontend build**: Pre-built `frontend/dist/` served as static, no SSR
- **Quality bar**: Linear / Raycast / Vercel level — dense signal, dark theme, dialed-in typography, tasteful motion, production-grade polish (validated at v1.0 + v1.1)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| FastAPI chassis patterns (app factory, builder, settings, lifespan) | User's established production patterns | ✓ Good — held up across 17 phases; no rework needed |
| SQLAlchemy 2.0 async + SQLModel + Alembic | Type-safe queries + versioned migrations + aiosqlite async | ✓ Good — type-safe queries paid off across 60+ endpoints; no schema regressions across 2 migrations |
| Python 3.13 | User preference; chassis targets 3.13+ | ✓ Good — only env-only test flake on 3.11 (pinned ≥3.13) |
| SQLite single-file with WAL | Local-only, no multi-server, excellent read concurrency | ✓ Good — handled real-world ingest at v1.0 close + v1.1 alert/skill workloads |
| PID files for emergency stop targeting | macOS 12+ restricts env disclosure; PID files are reliable | ✓ Good — ESTOP-01..04 ship with ps-validation |
| TanStack Router (file-based) + React Query (30s poll) | Modern routing + efficient data fetching without WebSocket complexity | ✓ Good — locked polling cadences worked across 26+ panels (21 v1.0 + 5 v1.1) |
| Launchd for daemon management | macOS-native, no third-party dependency | ✓ Good — 4 launchd plists ship in install.sh |
| SSE for firehose, polling everywhere else | Simpler than WebSockets, sufficient for single-user local | ✓ Good — `useFirehose` extended to skill_activated stream in v1.1 |
| Plain text Telegram messages (no parse_mode) | DB-sourced content has unescaped backticks | ✓ Good — Pitfall P3 enforced by `inspect.signature()` grep test in 09-01 + extended to alert paths in v1.1 (POLI-02) |
| `cmc` CLI shim (renamed from `cc`) | Avoids `/usr/bin/cc` (clang) collision | ✓ Good — clean install verified end-to-end |
| 2-phase audit gap closure (Phases 10–11) over deferred-items list | Audit found integration + flow gaps — close in-milestone | ✓ Good — re-audit returned 148/148 + 8/8 + 8/8 |
| **Cost stored as tokens, $ computed at read time** (v1.1) | Pricing changes self-correct historical totals via window logic; `/v1/logs` MUST always return 200 (Pitfall 4); never store $ in derived tables | ✓ Good — 5 SKUs seeded from `data/pricing.json`; 41/41 v1.1 reqs shipped without backfill events |
| **Single Alembic migration 0002 bundling skills + alerts + cache TTL** (v1.1) | Avoids mid-milestone migration ordering issues across Phases 13/15 | ✓ Good — ephemeral-DB tests prove BUG-B backfill correctness; live-DB apply is operational on next `cmc start` |
| **Alerts emit decisions only — ALRT-12 invariant** (v1.1) | "Sensors, not actuators"; user gates action via existing autonomy controls; alert engine NEVER imports `cmc.dispatcher.tasks` | ✓ Good — ast-based static-import audit test in dispatcher suite enforces invariant |
| **Stable `dedup_key = f"alert:{rule_id}:{scope_key}"`** (v1.1) | Reuses `notification_log` UNIQUE + `decisions` partial-unique; no new state machine | ✓ Good — POLI-04 integration test asserts exactly 1 decision + 1 notification_log per firing condition |
| **`UTCDatetime` PlainSerializer with `when_used='json'` gate** (v1.1) | Pydantic v2 default serializer omitted Z suffix → JS `new Date(naiveISO)` interpreted as LOCAL time → "in 4 hours" UI bug | ✓ Good — project-wide drop-in for 8 schemas / 37 datetime fields; native datetime preserved for SQLAlchemy INSERT/UPDATE |
| **`cmc/telegram/callback_verbs.py` central StrEnum** (v1.1) | Centralized verb dispatch; refactored `dash_router.py` + `handler.py` to use enum | ✓ Good — POLI-03 round-trip test parametrizes over enum; sha256[:8] keeps callback_data under 64-byte cap |
| **Hand-written `validateSearch` UUID validator** (v1.1) | First `validateSearch` use in codebase; deliberately avoided pulling in zod/valibot for one regex check | ✓ Good — sets the precedent; `routes/sessions_.compare.tsx` uses UUID_RE strict check + typeof string |
| **TanStack parent-layout opt-out via trailing-underscore filenames** (v1.1) | `skills.tsx` and `sessions.tsx` (when added) render their own page bodies without `<Outlet/>` so standard nested-file syntax breaks detail mounting | ✓ Good — `skills_.$name.tsx` and `sessions_.compare.tsx` keep public URLs unchanged; pattern documented for future deep-link routes |
| **CMPR-04 over-cap = render branch, not error branch** (v1.1) | HTTP 200 + `over_cap=true` + empty `tool_counts={}` so client templates EmptyState while KPIs survive | ✓ Good — single render branch the client templates as fallback, NOT 413/422 refusal |
| **CMPR-05 tabular-only compare** (v1.1) | No react-diff-viewer / jsdiff; metadata only; raw LLM message diff is privacy-leaky and visually overwhelming | ✓ Good — vitest + DevTools Sources scan (0/43 scripts match diff/jsdiff) hard-locks the constraint |
| **Wave-1/wave-2 single-writer convention for REQUIREMENTS.md** (v1.1) | Phase 16-04 + 17-06 serialize REQUIREMENTS.md edits behind on-disk verified artifacts from parallel wave-1 plans | ✓ Good — eliminates last-write-wins corruption risk that motivated the wave-1/wave-2 split (planner-checker Blocker 2) |

---

*Last updated: 2026-05-05 after v1.1 Skills & Cost Intelligence milestone shipped*
