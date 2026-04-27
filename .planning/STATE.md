---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Completed 05-01-PLAN.md
last_updated: "2026-04-27T00:07:10.318Z"
last_activity: 2026-04-27
progress:
  total_phases: 9
  completed_phases: 4
  total_plans: 27
  completed_plans: 24
  percent: 89
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-25)

**Core value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, queue and approve tasks, and kill runaway sessions — all from one browser tab.
**Current focus:** Phase 4: Stateful APIs — Wave 0 foundation landed (Plan 04-01); Wave 1 (04-02 + 04-05) ready to dispatch

## Current Position

Phase: 4 of 9 IN PROGRESS (Stateful APIs)
Plan: 5 of 5 complete in Phase 4 (04-01 + 04-02 + 04-05 ✅; 160/160 tests green)
Status: Phase complete — ready for verification
Last activity: 2026-04-27

Progress (Phase 4): [██████░░░░] 60%

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
| Phase 03-read-only-apis P03 | 75 min | 2 (TDD; 4 commits) tasks | 4 files files |
| Phase 04-stateful-apis P01 | ~25 min | 4 tasks (1A/1B/3/4) | 22 files (17 created + 5 modified) |
| Phase 04-stateful-apis P02 | 12 | 2 tasks | 4 files |
| Phase 04-stateful-apis P05 | ~12 min | 2 tasks (TDD; RED+GREEN) | 2 files |
| Phase 04-stateful-apis PP03 | 8 min | 2 tasks (TDD; RED+GREEN) tasks | 3 files files |
| Phase 04-stateful-apis P04 | 5 | 2 tasks | 3 files |
| Phase 05-frontend-shell-design-system P01 | 11 min | 3 tasks tasks | 13 created + 9 modified files files |

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
- Plan 03-03 complete: Sessions router (SESS-01..07) — 7 endpoints landed; SESS-03/04/05 implement Pitfall 8 fallback (live_state row preferred when present, sessions-table-derived when absent)
- Plan 03-03: SSE pattern locked — StreamingResponse + manual _format_sse() helper. fastapi.sse.EventSourceResponse exists but its FastAPI-native usage requires response_class= + ServerSentEvent yields, awkward for conditional heartbeat-then-close fallback. sse-starlette NOT installed. Manual SSE framing is simpler + version-agnostic
- Plan 03-03: SESS-06 queue path entry contract for Phase 8 dispatcher: <repo_root>/.tmp/mission-control-queue/messages/<sid>.jsonl, append-only JSONL, one record per follow-up. .tmp/ entry added to .gitignore so queue files never enter git history
- Plan 03-03 SSE-test pattern: when ASGITransport buffers a long-lived SSE generator (the with-data branch), call the route function directly with a stub Request whose is_disconnected() returns True after 1 iteration. Reserve httpx.stream() for self-terminating branches (e.g., heartbeat fallback)
- Plan 03-03: Pre-existing app HTTPException handler emits {error: detail} (cmc.core.errors), NOT FastAPI default {detail: ...}. Future plans testing 4xx bodies must check r.json()['error']
- Plan 04-01: Phase 4 Wave 0 foundation landed — croniter==6.2.2 + anthropic==0.97.0 deps, 4 schema modules (hitl/tasks/schedules) + system.py ESTOP extension, cmc.core.queue (decision/inbox JSONL writers), cmc.core.process (PID-scan + emergency_stop_all with ps validation), cmc.tasks (transitions matrix + spawn_dispatcher_oneshot), cmc.schedules (croniter wrappers + Anthropic Haiku NL->cron), cmc.dispatcher.oneshot stub, Settings.dispatcher_oneshot_cmd argv field, 4 conftest factories + tmp_pid_dir + mock_anthropic_client fixtures, 4 Phase-4 test scaffolds (134/134 tests green)
- Plan 04-01: Open Q1 (queue path) RESOLVED — `.tmp/mission-control-queue/{decisions,inbox}/{id}.jsonl` mirrors SESS-06 messages/ sibling pattern; cmc.core.queue.queue_path is the single source of truth so future relayout edits one file
- Plan 04-01: Open Q2 (status transition matrix) LOCKED v1 — pending↔running/awaiting_approval/failed/done; awaiting_approval->{pending,failed}; running->{done,failed}; done terminal; failed->pending (rerun resets)
- Plan 04-01: Open Q5 (TASK-07 dispatcher cmd source) RESOLVED via Settings.dispatcher_oneshot_cmd: list[str] = [sys.executable, '-m', 'cmc.dispatcher.oneshot'] — Phase 8 swaps stub by editing default, NOT router code
- Plan 04-01: Open Q6 (Anthropic env var) LOCKED — `ANTHROPIC_API_KEY` (SDK convention); missing key -> nl_to_cron returns None -> router emits 503
- Plan 04-01: Open Q7 (answered_by typing) LOCKED — `Literal["dashboard", "telegram", "cli"]` for cleaner UI types vs free-text
- Plan 04-01: TaskTriggerRequest INTENTIONALLY OMITTED from cmc.api.schemas.tasks — trigger endpoint takes no body in v1; FastAPI handler should omit body parameter rather than declare empty Pydantic model (which forces `{}` payloads + 422 on missing)
- Plan 04-01 process note: initial `uv sync` (without --all-extras) pruned dev deps; immediately re-ran `uv sync --all-extras` to restore pytest+ruff+freezegun. Both uv.lock mutations land cleanly in the Task 1A commit
- Plan 04-02: HITL router (HITL-01..07) — file-then-DB ordering invariant locked in code (Pitfall 1); INSERT OR IGNORE on partial-unique dedup_key returns 200 on conflict (vs 201 on insert) so the dashboard can distinguish 'created new' from 'returned existing pending'
- Plan 04-02: HITL-02 conflict-refetch SELECT MUST scope to status='pending' (Pitfall 6) — without it, an answered row with the same dedup_key could shadow the live pending one. Implemented in cmc.api.routes.hitl.create_decision fallback branch
- Plan 04-02: HITL-06 idempotency check uses DB-side row.read_at comparison (NOT JSON-side string equality) because SQLite strips tzinfo on round-trip — first response includes 'Z'/'+00:00', second response from re-fetched naive datetime does not, even though instants match (Pitfall 4 cousin)
- Plan 04-05: ESTOP order-of-operations LOCKED (Pitfall 8) — flag flip BEFORE PID-scan SIGTERM BEFORE bulk UPDATE of running tasks; commit between step 1 and step 2 so dispatcher's DISP-02 early-return engages on the flag before our UPDATE runs. Phase 8 dispatcher code MUST honor `system_state.emergency_stop='1'` as an early-return guard, not key on row presence (resume leaves the row in place at value='0')
- Plan 04-05: ESTOP-04 clear semantics LOCKED — UPDATE system_state SET value='0' (NOT DELETE). SAPI-03 distinguishes 'flag explicitly cleared' from 'never set'; Phase 8 dispatcher reads `value` not row presence
- Plan 04-05: PID validation rule LOCKED — `ps -p PID -o command=` must contain BOTH 'claude' substring AND ' -p' (literal flag with leading space). Avoids '--prefix=foo' / '--processes=N' false positives. Race window between validate + os.kill ACCEPTED for v1; partly mitigated via ProcessLookupError -> 'missing' bucket
- Plan 04-05: Test mock site LOCKED — patch at `cmc.api.routes.system.emergency_stop_all` (the import binding) NOT `cmc.core.process.emergency_stop_all` (the definition); Python re-binds at import time so the latter is a no-op. Pattern reusable for any router that does `from x import y` and wants y mocked in tests
- Plan 04-03 complete: Tasks router (TASK-01..07) — 7 endpoints landed; TASK-03 PATCH delegates legal-target validation to cmc.tasks.transitions.validate_transition (Wave 0 matrix); TASK-05/06 bypass matrix because targets are fixed and validate source state inline; TASK-07 spawns detached subprocess.Popen via cmc.tasks.spawn.spawn_dispatcher_oneshot, returns 202 + PID, no body in v1; 17 new tests pass; full suite 177/177 green
- Plan 04-03: TASK-04 returns 204 No Content (REST idiom — body adds nothing); TASK-06 rerun preserves pid + stdout_path on the row (clears only started_at/ended_at/error_message) so operators can still inspect the previous failed run's logs after pressing rerun; TASK-07 returns 202 Accepted because the dispatcher is async-of-response (subprocess already detached by the time JSON returns)
- Plan 04-03 test pattern: monkeypatch BOTH cmc.tasks.spawn.repo_root (-> tmp_path) AND cmc.tasks.spawn.subprocess.Popen so TASK-07 tests exercise the router end-to-end without spawning real processes or writing to .tmp/. Reusable for any future test of subprocess-spawning code paths
- Plan 04-04 complete: Schedules router (SCHD-01..06) — 6 endpoints landed; SCHD-02/03 enforce clear-and-recompute invariant on next_run_at (Pitfall 7 + Open Q4): EITHER cron OR enabled change triggers recompute via cmc.schedules.cron.next_run when enabled, NULL when disabled; SCHD-06 NL->cron returns single 503 'natural-language schedules unavailable' for BOTH 'no API key' AND 'invalid model output' (Security V11 — no env-config leak); 16 new tests + carry-over smoke = 17 in test_phase4_schedules.py; full suite 193/193 green
- Plan 04-04: SCHD-06 mock site LOCKED — patch at cmc.api.routes.schedules.nl_to_cron (the import binding) NOT cmc.schedules.nlcron.nl_to_cron (the definition). Same pattern as Plan 04-05's emergency_stop_all decision. The conftest mock_anthropic_client fixture (which patches builtins.__import__) remains usable but is more fragile; direct router-import monkeypatch is the cleaner default for any future test of an async helper imported into a router
- Plan 04-04 test fix (Rule 1): tests must allow naive datetimes in next_run_at responses — SQLite strips tzinfo on round-trip even when the value is inserted tz-aware (Pitfall 4 cousin; same workaround as Plan 04-02 HITL-06 idempotency check). Pattern: parsed = datetime.fromisoformat(...); parsed_aware = parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc); compare parsed_aware to now-UTC
- Plan 04-04 entry contract for Phase 8 dispatcher (DISP-01): reads schedules WHERE enabled=1 AND next_run_at IS NOT NULL AND next_run_at <= now_utc; idx_schedules_enabled_next_run supports the query. Dispatcher takes ownership of next_run_at advancement after the schedule starts firing — Schedules router is the INITIAL writer (POST + PATCH); dispatcher is the recurring writer (post-fire UPDATE). Both honor the same disabled-clears-next_run_at rule
- Plan 05-01: Phase 5 Wave 0 foundation landed — 16 deps installed, Vitest 4 + happy-dom + RTL 16 harness with all 5 RESEARCH pitfalls pre-mitigated, AppShell + NavBar + 3 routes (/, /activity, /skills), QueryClientProvider + ErrorBoundary mounted at route-tree root, lib/storage.ts + lib/api.ts (40+ endpoints typed); 12 tests green; npm run build/typecheck/test all exit 0
- Plan 05-01 deviation (Rule 3): Node 25.x default --webstorage flag plants a bare globalThis.localStorage = {} (no methods!) that shadows happy-dom's Storage Proxy via Vitest populateGlobal. Fix: prefix every test script in package.json with NODE_OPTIONS=--no-experimental-webstorage. Wave 1+2 inherit this — npm run test/test:watch/test:coverage already carry the flag
- Plan 05-01 pattern: vitest.config.ts is FLAT (does NOT mergeConfig with vite.config) so test runs don't trigger tanstackRouter regen of routeTree.gen.ts; explicit @vitejs/plugin-react() reinstated for JSX/TSX transform
- Plan 05-01 pattern: AppShell is pure-presentational; QueryClientProvider + ErrorBoundary mount at route-tree root in routes/__root.tsx so AppShell stays trivially unit-testable. Wave 1 layout primitives can render against AppShell in isolation without provider scaffolding
- Plan 05-01 pattern: component test bootstrap = createMemoryHistory + createRoute + await router.load() BEFORE render + findByText for first assertion. Wave 1+ component tests must follow this shape — getByText immediately after render returns empty body because TanStack Router 1.x bootstrap is async
- Plan 05-01 entry contract for Wave 1: render helper at frontend/src/test/utils.tsx (wraps MotionConfig reducedMotion='always'); ALL Phase 5 component tests MUST import { render, userEvent } from this module — never directly from @testing-library/react (Pitfall 2)
- Plan 05-01 entry contract for Phase 6: lib/api.ts exports fetchJson<T> + ApiError + api object covering 40+ Phase 3/4 endpoints; HealthResponse + SessionListResponse have full types (likely first consumers), all other responses typed as unknown for Phase 6 to narrow per-endpoint as it consumes them — avoids speculative typing under tsconfig strict

### Pending Todos

- Phase 2 onward: 10 `[NEEDS USER CONFIRMATION]` flags in `01-01-SCHEMA.md` should be resolved as relevant plans approach (or via future Alembic migrations once production-dashboard reality clarifies them).
- ~~Test cwd: 3 tests in test_phase1_boot.py reference relative paths~~ — **CLOSED in Plan 02-01** (commit 621af80; replaced with `repo_root() / "backend/..."` absolute paths and absolutized alembic Config script_location to mirror lifespan.py).

### Blockers/Concerns

None — Phase 1 + Phase 2 implementations complete; verifier readiness confirmed via 61 passing tests (25 Phase 1 + 36 Phase 2) + human browser smoke (Phase 1) + human end-to-end smoke against real `~/.claude/projects/` data and OTLP samples (Phase 2).

## Session Continuity

Last session: 2026-04-27T00:06:47.974Z
Stopped at: Completed 05-01-PLAN.md
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
