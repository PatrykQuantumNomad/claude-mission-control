---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 03-05-PLAN.md (MCP + Skills routers; 7 endpoints; 15/15 plan-scope tests + 130 full-suite tests green)
last_updated: "2026-04-26T13:54:10.622Z"
last_activity: 2026-04-26
progress:
  total_phases: 9
  completed_phases: 2
  total_plans: 18
  completed_plans: 17
  percent: 94
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-25)

**Core value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, queue and approve tasks, and kill runaway sessions — all from one browser tab.
**Current focus:** Phase 3: Read-Only APIs (Wave 0 foundation landed; Wave 1 router plans 03-02..03-05 next)

## Current Position

Phase: 3 of 9 IN PROGRESS (Read-Only APIs) — Wave 0 complete; Wave 1 plans 03-02..03-05 ready
Plan: 4 of 5 complete in Phase 3 (03-01 ✅ Wave 0 foundation; 70/70 tests green)
Status: Ready to execute
Last activity: 2026-04-26

Progress (Phase 3): [██░░░░░░░░] 20%

## Performance Metrics

**Velocity:**

- Total plans completed: 13 (Phase 1: 7; Phase 2: 6)
- Average duration: ~12 min/plan (excluding human-verify wait time)
- Total execution time: ~2.5 hours of agent work across both phases

**By Phase:**

| Phase                       | Plans | Total    | Avg/Plan |
|-----------------------------|-------|----------|----------|
| Phase 1 (Foundation & DB)   | 7 / 7 | ~110 min | ~16 min  |
| Phase 2 (Data Ingestion)    | 6 / 6 | ~51 min  | ~9 min   |

**Recent Trend:**

- Last 6 plans: 02-01, 02-02, 02-03, 02-04, 02-05, 02-06 (Phase 2 implementation complete; 61 tests passing; real ~/.claude/projects ingested at boot via lifespan; POST /api/sync wired; user-approved manual smoke against real data)
- Trend: Stable; ingestion stack landed without architectural deviations (only Rule 3 test-scaffolding fixes when lifespan extension blocked pre-existing tests). Phase 2 closes ready for verifier.

*Updated after each plan completion*
| Phase 01-foundation-database P02 | 4 min | 3 tasks | 17 files |
| Phase 01-foundation-database P03 | 10 min | 3 tasks | 13 files |
| Phase 01-foundation-database P04 | 5 min | 2 tasks | 12 files |
| Phase 01-foundation-database P05 | ~7 min | 2 tasks | 18 files |
| Phase 01-foundation-database P06 | 4 min | 2 tasks | 7 files |
| Phase 01-foundation-database P07 | ~50 min (incl. checkpoint wait) | 3 tasks | 5 files + dist rebuild |
| Phase 02-data-ingestion P01 | 12 min | 2 tasks | 5 files |
| Phase 02-data-ingestion P02 | 3 min | 2 tasks | 3 files |
| Phase 02-data-ingestion PP03 | 11 min | 2 tasks tasks | 6 files files |
| Phase 02-data-ingestion P04 | 6 min | 2 tasks (TDD; 4 commits) | 3 files |
| Phase 02-data-ingestion PP05 | 14 min | 2 tasks (TDD; 4 commits) tasks | 4 files files |
| Phase 02-data-ingestion P06 | ~5 min agent + overnight human-verify wait | 2 tasks (1 auto + 1 checkpoint) | 1 file |
| Phase 03-read-only-apis P01 | 14 min | 3 tasks tasks | 16 files files |
| Phase 03-read-only-apis P04 | 14 min | 2 tasks tasks | 3 files files |
| Phase 03-read-only-apis P02 | 30 min | 2 tasks (TDD; 4 commits) tasks | 3 files files |
| Phase Phase 03-read-only-apis PP05 | 25 min | 2 tasks (TDD; 4 commits) tasks | 5 created + 3 modified files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: 9 phases derived from 147 requirements across 22 categories
- Roadmap: Phases 3/4/5 can parallelize after Phase 1; Phases 6/7/8 can parallelize after their dependencies
- 2026-04-25: SQLAlchemy 2.0 async + SQLModel + Alembic locked as the Phase 1 data-access stack (supersedes earlier "raw SQL, no ORM" wording in REQUIREMENTS.md and PROJECT.md)
- 2026-04-25: 15-table schema approved as-is (10 flagged questions deferred to downstream plans) — `.planning/phases/01-foundation-database/01-01-SCHEMA.md` is canonical for Plan 05's Alembic initial revision
- 2026-04-25: Repo-root path resolution lives in cmc/core/paths.py — Settings model_validator absolutizes db_path/static_dir/alembic_ini_path against repo_root() so process cwd cannot drift them (closes BLOCKER 1 from 01-RESEARCH)
- 2026-04-25: Pretty config error renderer reads err['loc'] + err['msg'] only — never err['input'] — to avoid leaking .env values to terminal output (Security Domain V7)
- 2026-04-25: test_phase1_boot.py is the single Phase 1 test file; each subsequent plan (04-07) appends its FOUND-* tests there — convention declared in module docstring
- Plan 01-03: tanstackRouter() locked as plugins[0] in vite.config.ts; routeTree.gen.ts committed (not gitignored) so downstream phases can build without first running dev
- Pitfall 1 mitigation translated for aiosqlite adapter: use isolation_level=None instead of .autocommit=True (the AsyncAdapt_aiosqlite_connection wrapper does not expose .autocommit). Semantics identical on the underlying sqlite3 driver. Verified: PRAGMA foreign_keys returns 1 after toggle.
- greenlet>=3.0 added as explicit backend dependency (Plan 02 omitted it but SQLAlchemy 2.0 async IO requires it at runtime — engine.connect() raises ValueError without it).
- Plan 05 entry contract: cmc/db/models/__init__.py MUST contain explicit imports of every table class with noqa F401 markers, or env.py target_metadata stays empty and autogenerate produces an empty initial migration (Pitfall 2).
- Plan 05 complete: 15 SQLModel tables defined per 01-01-SCHEMA, 0001_initial Alembic migration creates them all (alembic upgrade head produces 16 tables = 15 app + alembic_version, idempotent), _column_exists helper added for FOUND-03
- Plan 05 pattern: FK columns with non-default ON DELETE behavior use sa_column=Column(... ForeignKey(ondelete='CASCADE'/'SET NULL'), ...) — SQLModel's Field(foreign_key='...') shorthand omits ondelete
- Plan 05 pitfall mitigated: autogenerated alembic migration references sqlmodel.sql.sqltypes.AutoString throughout but never emits 'import sqlmodel'. Hand-edit required (added to 0001_initial.py)
- Plan 06 complete: FastAPI app factory + lifespan + /api/health wired; uvicorn boots cleanly via canonical command, alembic upgrade is idempotent
- Plan 06 BLOCKER 1 follow-through: lifespan absolutizes alembic script_location against ini_path.parent — without this, settings.alembic_ini_path being absolute is insufficient because alembic.ini's script_location = migrations is cwd-relative
- Plan 06 entry contract for Plan 07: insertion point is # NOTE comment in factory.py; Plan 07 mounts SPAStaticFiles at / AFTER routers and REPLACES test_routers_registered_before_static_mount_slot with test_static_mount_after_routers
- 2026-04-25: Phase 1 final integration verified — uvicorn boots from repo root, React SPA loads at localhost:8765 with header + body content, /api/health returns JSON, deep-link fallback (/some-deep-link) returns the SPA shell, /api/docs renders Swagger, DB lands at repo-root data/ with WAL siblings, clean Ctrl+C shutdown
- Plan 07 auto-fixes (Rule 1, 3 bugs): SPAStaticFiles caught fastapi.HTTPException instead of starlette.exceptions.HTTPException (deep-link fallback dead); StaticFiles parent stores directory as str so override needed Path(...) wrap; root Mount has empty path attribute so tests must locate it via name="spa" not by path
- Plan 07 final test count: 25 (Plan 06 had 21; +5 new SPA tests, -1 removed Plan 06 contract-guard = +4 net)
- Plan 02-01: Phase 2 Settings locked — jsonl_root=~/.claude/projects (NOT in repo-root resolver), session_idle_minutes=5, otlp_max_body_bytes=10_000_000; pytest-freezer 0.4.9 added to dev extras
- Plan 02-01: Phase 2 single-test-file convention — backend/tests/test_phase2_ingest.py (downstream plans 02-02..02-05 APPEND INGST-* sections)
- Plan 02-01: 4 reusable conftest fixtures land for Phase 2 — fake_jsonl_dir, golden_jsonl_session, otlp_log_payload, otlp_metric_payload
- Plan 02-01 auto-fix (Rule 3): alembic Config script_location was still cwd-relative after ini path absolutization; tests now mirror lifespan.py's `set_main_option("script_location", str(ini_path.parent / "migrations"))` pattern. Result: pytest 26/26 from BOTH backend/ and repo-root cwds.
- Plan 02-02: cmc.ingest.jsonl_parser is the pure-sync entry contract for Plan 02-04 — scheduler MUST wrap in asyncio.to_thread(parse_session_file, path); _last_message_ts is the field the scheduler reads to decide ended_at
- Plan 02-02: split_mcp(name) is the canonical mcp__server__tool splitter (maxsplit=2 preserves trailing __ in tool component); Plan 02-03 OTLP parser will import it for the INGST-08 fallback path
- Plan 02-02: cmc/ingest/__init__.py kept empty (package marker only) so parallel plans 02-03..05 can land submodules without re-export churn
- Plan 02-03: per-record savepoint + IntegrityError retry pattern for /v1/logs — db.add() defers FK validation to commit, so a single bad session_id would abort the whole batch; savepoint-per-record + retry-as-NULL preserves the soft-FK contract on otel_events.session_id
- Plan 02-03: raw_routers() established as canonical aggregator for any router whose URL is fixed externally (OTLP, future webhooks/OAuth callbacks); lives alongside all_routers() in cmc.api.routes and is registered between /api routers and the SPA mount in factory.py
- Plan 02-03: GET /v1/logs returns 405 only when SPA mount is disabled — with SPA mount active, GET falls through to index.html (200) which is the correct production behavior since /v1/logs is POST-only and the SPA catches all unknown GETs for client-side routing
- Plan 02-03: Plan 01-07's test_static_mount_after_routers extended to also assert /v1/logs and /v1/metrics positions precede the SPA mount — the Pitfall 8 regression guard now scales to any future raw_routers additions
- Plan 02-04: Option B token rollup math locked as "subtract previous, add new"; Phase 2 v1 simplification attributes a session's previous-totals to a single primary (day, model) bucket = `existing.synced_at.date()` in system tz. Multi-day sessions get small smear; documented as Phase 3+ revisit candidate.
- Plan 02-04: cmc.ingest.repository._SESSION_MUTABLE_COLS is the explicit allowlist of columns copied from `excluded.*` on conflict; `started_at` intentionally OMITTED so first-insert started_at survives re-parses (immutable lower bound on session lifetime).
- Plan 02-04: _adjust_bucket pattern = UPDATE-then-INSERT-fallback (not ON CONFLICT with arithmetic on excluded.* + existing column) — chosen for portability + readability; ON CONFLICT safety net included on the INSERT for theoretical concurrent-insert races (single-writer Phase 2 design).
- Plan 02-04: Plan 02-05 entry contract is `from cmc.ingest.scheduler import sync_once, periodic_sync_loop`. sync_once returns JSON-serializable summary dict suitable as POST /api/sync response. periodic_sync_loop is sleep-first (boot-time sync_once in lifespan won't be immediately duplicated) and Pitfall-7-compliant (catches Exception, re-raises CancelledError).
- Plan 02-04 auto-fix (Rule 1): pending→ok upsert test originally used a single AsyncSession across both phases and saw stale ORM instance from `expire_on_commit=False` identity-map cache (raw SQL had 'ok'; ORM returned 'pending'). Fixed by opening fresh session per assertion phase — mirrors how scheduler consumes sessionmaker (one session per file).
- Plan 02-05: Single ingestion code path locked — boot sync, periodic loop, and POST /api/sync ALL delegate to scheduler.sync_once. Future ingestion features add behavior to sync_once, never to a trigger-specific copy
- Plan 02-05: lifespan task lifecycle pattern — asyncio.create_task during startup, store on app.state.sync_task, cancel + await + swallow CancelledError in finally BEFORE engine.dispose(). Phases 3+ adding background workers should follow this shape
- Plan 02-05: boot-time sync_once is wrapped in try/except — a one-time FS error never prevents server startup; the 120s periodic loop will retry
- Plan 02-05 auto-fix (Rule 3): _bootstrap_app helper in test_phase2_ingest.py auto-redirects default jsonl_root (~/.claude/projects/) to a tmp-path nonexistent dir so boot sync stays hermetic for tests that don't override jsonl_root explicitly
- 2026-04-26: Phase 2 manual smoke checkpoint (Plan 02-06) APPROVED by user — all 5 ROADMAP success criteria verified against real ~/.claude/projects/ data + recorded OTLP samples; SMOKE.md preserved as the canonical replayable Phase 2 smoke recipe for future contributors
- Plan 02-06: per-step SMOKE.md transcript backfill skipped — Plan 02-05's internal smoke (148 sessions ingested at boot, POST /api/sync returned documented summary, Ctrl+C clean) already supplied real-data evidence for the major steps; user "approved" reply covers integrated system. SMOKE.md primary value is the embedded payloads + replayable recipe, not a one-time transcript
- Plan 03-01 complete: Phase 3 Wave 0 foundation landed (psutil, lifespan boot_time, 6 schema modules with all Wave 1 DTOs, tail_otel_events SSE helper, seeded_app+client fixtures, 4 factory helpers, 5 per-router test scaffold files)
- Plan 03-01: Per-router test file convention declared — all SAPI-* tests in test_phase3_system.py, SESS-* in test_phase3_sessions.py, OBSV-* in test_phase3_observability.py, MCP-* in test_phase3_mcp.py, SKILL-* in test_phase3_skills.py (Phase-3 split avoids the Phase-2 1156-line monolith)
- Plan 03-01: tail_otel_events SSE generator caps at 60min duration + uses MAX(id)-100 cursor on first connect — clients reconnect; bounds memory per Pitfall 1/3
- Plan 03-04 complete: 10 OBSV endpoints implemented; window-function percentile (ROW_NUMBER OVER PARTITION + COUNT OVER PARTITION) replaces plan's correlated-subquery-with-COUNT-in-OFFSET form (Rule 1 — SQLite rejects aggregate in OFFSET); all 17 OBSV tests pass
- Plan 03-04: FK-aware test seeding pattern — _seed_rows helper auto-seeds parent sessions for any otel_events/tools rows referencing missing session_ids (PRAGMA foreign_keys=1 from Phase 1 listener requires parent to exist on insert; soft-FK ON DELETE SET NULL only applies on parent delete)
- Plan 03-04 entry contract for Phase 6 dashboard: 10 GET endpoints under /api/usage/, /api/sessions/, /api/tools/, /api/hooks/, /api/activity/, /api/system/ — see 03-04-SUMMARY.md for sample response shapes; OBSV-08 dual-source merge pattern (tools.decision UNION otel_events claude_code.tool_decision) means parser changes in Phase 2+ on EITHER path show up in this endpoint without router changes
- Plan 03-02: FastAPI 0.136.1 SSE pattern locked — path operation IS an async generator with response_class=EventSourceResponse (NOT sse_starlette's return-the-generator). Validation lives in a separate Depends() because HTTPException raised inside an SSE generator gets swallowed by FastAPI's inner anyio task group
- Plan 03-02: SAPI-03 whitelist locked at frozenset({tzname, last_jsonl_sync_at, jsonl_sync_last_tick_at, dispatcher_last_tick_at, telegram_last_tick_at, emergency_stop}); per-key 404 message identical for non-whitelisted vs. whitelisted-but-absent (T-03-02-01 Information Disclosure mitigation)
- Plan 03-02 auto-fix (Rule 1): SSE behavior tests cannot run through httpx ASGITransport — the transport never delivers http.disconnect for streaming responses (response_complete is never set during SSE). Pattern: ONE HTTP-level test for Content-Type + 400 validation, THREE direct unit tests on tail_otel_events with a mock Request that flips is_disconnected() after N calls. Production behavior verified by Phase 3 verifier checkpoint, not by ASGITransport tests
- Plan 03-02: Pitfall 7 attention shape locked — pending_decisions=0 + failed_tasks=0 ALWAYS in /api/attention response, NOT branched on Phase 4 schema presence. When Phase 4 lands tasks/decisions tables, edit attention() to populate counters via real queries; do not add schema branching
- Plan 03-05 complete: 7 endpoints (MCP-01..04 + SKIL-01..03) backed by three-source priority MCP aggregator + Pitfall-5-hardened skill scanner; SQLite window-function percentiles; single-flight pattern locked for both sync endpoints
- Plan 03-05 SQL pattern: window-function percentiles (ROW_NUMBER + COUNT OVER PARTITION BY) replace plan-prescribed correlated-subquery LIMIT/OFFSET (which SQLite rejects with 'misuse of aggregate function COUNT()'); pattern reusable for any future per-partition percentile needs
- Plan 03-05 path-traversal defense: regex (^[a-zA-Z0-9._-]+$ for MCP server, ^[a-zA-Z0-9_-]+$ for skill name) + explicit '..' substring check. Regex alone permits 'bad..name' since '.' is allowed; the dotdot check rejects literal traversal sequences (V11/V12 mitigation)
- Plan 03-05 single-flight pattern locked for ALL future sync endpoints: app.state.<feature>_sync_running boolean set in entry, cleared in finally; concurrent calls receive 409 with detail '<feature> sync already running' (mitigation T-03-05-05)

### Pending Todos

- Phase 2 onward: 10 `[NEEDS USER CONFIRMATION]` flags in `01-01-SCHEMA.md` should be resolved as relevant plans approach (or via future Alembic migrations once production-dashboard reality clarifies them).
- ~~Test cwd: 3 tests in test_phase1_boot.py reference relative paths~~ — **CLOSED in Plan 02-01** (commit 621af80; replaced with `repo_root() / "backend/..."` absolute paths and absolutized alembic Config script_location to mirror lifespan.py).

### Blockers/Concerns

None — Phase 1 + Phase 2 implementations complete; verifier readiness confirmed via 61 passing tests (25 Phase 1 + 36 Phase 2) + human browser smoke (Phase 1) + human end-to-end smoke against real `~/.claude/projects/` data and OTLP samples (Phase 2).

## Session Continuity

Last session: 2026-04-26T13:53:57.142Z
Stopped at: Completed 03-05-PLAN.md (MCP + Skills routers; 7 endpoints; 15/15 plan-scope tests + 130 full-suite tests green)
Resume file: None

Phase 1 final commit chain:

- 01-02: 17 files (FastAPI skeleton)
- 01-03: 13 files (Vite + React + TanStack Router)
- 01-04: c4613f8 + d3c9e90 (DB engine + Alembic env)
- 01-05: 4711ade + 308c123 + d1c5d7e (15 SQLModel tables + initial migration)
- 01-06: 87162fe + 87bc57e + 807c3a5 + d7abdde + 33aa4ec (factory + lifespan + /api/health)
- 01-07: 7a3e478 + 7c6437f + a8adda0 + 7e4af2a + (closing commit) (SPA mount + 25 tests + browser-verified)

Phase 2 final commit chain:

- 02-01: 5 files (Phase 2 settings + conftest fixtures + test_phase2_ingest.py seed)
- 02-02: 3 files (TDD jsonl_parser — INGST-02/03/06)
- 02-03: 6 files (TDD OTLP /v1/logs + /v1/metrics — INGST-07/08/09 + raw_routers factory)
- 02-04: 0ef404f + eca22ba + ... + f7405a6 (TDD repository + scheduler — INGST-04/05)
- 02-05: 13e0e08 + 0c13d27 + ccd8296 + 8afb885 + c2f7951 (lifespan boot sync + POST /api/sync — INGST-01/10)
- 02-06: 4215761 + (this closing commit) (SMOKE.md scaffold + user-approved Phase 2 manual smoke)
