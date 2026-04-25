---
phase: 01-foundation-database
plan: 06
subsystem: api

tags:
  - backend
  - fastapi
  - lifespan
  - app-factory
  - alembic
  - phase-1

# Dependency graph
requires:
  - phase: 01-foundation-database
    provides: Settings (Plan 02), engine + session helpers (Plan 04), 15 SQLModel tables + 0001_initial migration (Plan 05)
provides:
  - "create_app(settings=None) -> FastAPI factory importable from cmc.app"
  - "@asynccontextmanager lifespan that creates engine, runs alembic upgrade head idempotently, populates app.state.engine + app.state.sessions, disposes on shutdown"
  - "GET /api/health -> 200 {'status': 'ok'}"
  - "all_routers() aggregator for routers-per-resource pattern (CONTEXT.md)"
  - "Bootable server: uvicorn --app-dir backend cmc.app:create_app --factory (canonical run command, repo-root)"
affects:
  - "01-07 (SPA static mount): mounts SPAStaticFiles at '/' AFTER routers, replaces test_routers_registered_before_static_mount_slot with test_static_mount_after_routers"
  - "Phase 2 (ingestion): adds sync route via all_routers() aggregator"
  - "Phase 3 (read-only APIs): adds sessions/observability/mcp/skills routers via aggregator"
  - "Phase 4 (HITL/system): adds decisions/inbox/tasks/schedules/system routers via aggregator"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FastAPI app factory + lifespan (asynccontextmanager) — replaces deprecated on_event hooks"
    - "Routers-per-resource via all_routers() aggregator — new resources plug in without editing factory.py"
    - "Idempotent alembic upgrade head in lifespan startup using shared connection (Plan 04 pattern)"
    - "Routers BEFORE static mount (Pitfall 8) — Plan 07 mounts AFTER"

key-files:
  created:
    - backend/cmc/app/__init__.py
    - backend/cmc/app/factory.py
    - backend/cmc/app/lifespan.py
    - backend/cmc/api/__init__.py
    - backend/cmc/api/routes/__init__.py
    - backend/cmc/api/routes/health.py
  modified:
    - backend/tests/test_phase1_boot.py

key-decisions:
  - "Lifespan absolutizes alembic script_location against ini_path.parent (BLOCKER 1 follow-through) — without this, settings.alembic_ini_path being absolute is insufficient because alembic.ini's `script_location = migrations` is cwd-relative."
  - "Lifespan also overrides sqlalchemy.url on the AlembicConfig to point at settings.db_path so any standalone CLI fallback in env.py wouldn't hit a different DB than the lifespan-created engine."
  - "RuntimeError raised (not silently created) when settings.alembic_ini_path doesn't exist — fail loud, with the canonical run command in the error message."
  - "Plan 06 owns test_routers_registered_before_static_mount_slot as a temporary contract guard; Plan 07 explicitly REMOVES + REPLACES it with test_static_mount_after_routers."
  - "test_phase1_boot.py extended in-place (single Phase 1 test file convention from Plan 02)."

patterns-established:
  - "FastAPI app factory: settings? -> FastAPI with lifespan, /api/docs, /api/openapi.json, error handlers, all_routers() under /api prefix, static slot for Plan 07."
  - "Lifespan: create engine -> validate ini path -> AlembicConfig (with absolute script_location + sqlalchemy.url overrides) -> shared-connection alembic upgrade -> wire app.state -> yield -> finally: engine.dispose()."
  - "Router module: APIRouter(tags=...) with routes that take Depends(get_session) for AsyncSession access via Plan 04's request-app-state dependency."

# Metrics
duration: 4 min
completed: 2026-04-25
---

# Phase 1 Plan 06: FastAPI App Factory + Lifespan + /api/health Summary

**Bootable FastAPI server with idempotent alembic upgrade in lifespan startup, asynccontextmanager-based engine lifecycle, routers-per-resource aggregator, and a working /api/health endpoint — uvicorn boots cleanly via `uvicorn --app-dir backend cmc.app:create_app --factory` from repo root.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-25T16:48:51Z
- **Completed:** 2026-04-25T16:52:38Z
- **Tasks:** 2 (both TDD: test → feat)
- **Files created:** 6
- **Files modified:** 1 (test_phase1_boot.py extended)
- **Test count:** 21 passing (13 prior + 4 lifespan + 4 factory/health)

## Accomplishments

- `cmc.app.create_app` factory + `cmc.app.lifespan.lifespan` importable end-to-end
- Lifespan creates engine, runs alembic upgrade head idempotently, wires `app.state.engine` + `app.state.sessions`, disposes cleanly on shutdown
- `GET /api/health` returns `200 {"status": "ok"}` (uses `Depends(get_session)` to verify DB reachability)
- Routers-per-resource aggregator (`all_routers()`) ready for Phase 2/3/4 plug-in
- Server smoke-tested: first boot runs migration; second boot is idempotent (no re-application)
- BLOCKER 1 fully closed: lifespan is cwd-independent — `settings.alembic_ini_path` absolute (Plan 02) AND `script_location` absolutized in lifespan
- Plan 07 entry contract preserved: static mount slot reserved BELOW router registration with load-bearing comment

## Task Commits

Each task was committed atomically following TDD (RED → GREEN, no REFACTOR needed):

1. **Task 1 RED: failing tests for lifespan** — `87162fe` (test)
2. **Task 1 GREEN: implement lifespan** — `87bc57e` (feat)
3. **Task 2 RED: failing tests for app factory + /api/health** — `807c3a5` (test)
4. **Task 2 GREEN: implement create_app + health route + aggregator** — `d7abdde` (feat)

Plan metadata commit follows.

## Files Created/Modified

**Created:**
- `backend/cmc/app/__init__.py` — re-exports `create_app`
- `backend/cmc/app/factory.py` — `create_app(settings=None) -> FastAPI` with lifespan, error handlers, router aggregator, static-mount slot for Plan 07
- `backend/cmc/app/lifespan.py` — `@asynccontextmanager lifespan(app)` with engine + alembic + sessions + dispose
- `backend/cmc/api/__init__.py` — package marker
- `backend/cmc/api/routes/__init__.py` — `all_routers()` aggregator
- `backend/cmc/api/routes/health.py` — `GET /api/health` returning `{"status": "ok"}`

**Modified:**
- `backend/tests/test_phase1_boot.py` — appended 8 tests (4 lifespan FOUND-05 + 4 factory/health FOUND-01); test count 13 → 21

## Decisions Made

1. **Absolutize alembic script_location in lifespan.** `alembic.ini` ships with `script_location = migrations` (cwd-relative), so even though Plan 02's model_validator makes `settings.alembic_ini_path` absolute, the migration scripts directory still resolved against cwd. The lifespan now explicitly sets `script_location = ini_path.parent / "migrations"` after constructing `AlembicConfig`. Without this, the `test_lifespan_uses_repo_root_anchored_alembic_ini` test fails when cwd is anything other than `backend/`. Logged as deviation Rule 2 below.

2. **Override `sqlalchemy.url` on the AlembicConfig.** `alembic.ini` has `sqlalchemy.url = sqlite+aiosqlite:///data/cmc.db` baked in. The lifespan overrides it to point at `settings.db_path` so any standalone CLI fallback in `env.py` wouldn't hit a different DB than the lifespan-created engine. Plan 04's env.py already prefers `attributes['connection']` when present, but defense-in-depth.

3. **Fail loud on missing alembic.ini.** Lifespan raises `RuntimeError` (not a swallowed warning) with the canonical run command embedded in the error message. CI and dev both surface it immediately.

4. **No REFACTOR phase needed** — both tasks shipped clean implementations on first GREEN; no cleanup-only commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] Absolutize `script_location` against ini path parent**
- **Found during:** Task 1 GREEN (lifespan tests)
- **Issue:** The plan's lifespan example only set `sqlalchemy.url` on `AlembicConfig`. With cwd != `backend/`, `alembic.ini`'s relative `script_location = migrations` raised `alembic.util.exc.CommandError: Path doesn't exist: migrations` during `command.upgrade(...)`, breaking `test_lifespan_uses_repo_root_anchored_alembic_ini`.
- **Fix:** Added `alembic_cfg.set_main_option("script_location", str(ini_path.parent / "migrations"))` after the `sqlalchemy.url` override. This completes the BLOCKER 1 cwd-independence contract that Plan 02's model_validator started — settings give us an absolute ini_path, lifespan now also makes script_location absolute (anchored on the ini file's location, which is itself absolute).
- **Files modified:** `backend/cmc/app/lifespan.py`
- **Verification:** All 4 lifespan tests pass, including the cwd-independence test (`monkeypatch.chdir(tmp_path)`).
- **Committed in:** `87bc57e` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Auto-fix necessary for cwd-independence correctness — without it, the canonical run command (`uvicorn --app-dir backend ...`) from repo root would also fail because uvicorn doesn't change cwd. No scope creep.

## Issues Encountered

None beyond the deviation above. Smoke tests with the canonical uvicorn command boot cleanly:
- First boot: alembic logs `Running upgrade -> 0001_initial, initial schema (15 tables)` then app starts
- Second boot: no `Running upgrade` line (idempotent), app starts immediately
- Both: `curl http://127.0.0.1:8765/api/health` returns `{"status":"ok"}`

## Next Phase Readiness

**Plan 07 entry contract (per plan output spec):**
- Mount `SPAStaticFiles` at `/` AFTER all routers (currently the only consumer is `health_router`).
  Insertion point is the `# NOTE: Plan 07 will mount SPAStaticFiles at "/" here.` comment in `backend/cmc/app/factory.py`.
- REMOVE `test_routers_registered_before_static_mount_slot` (in `backend/tests/test_phase1_boot.py`) and REPLACE with `test_static_mount_after_routers` that asserts the SPA mount EXISTS and comes AFTER `/api/health` in `app.routes`.

**Canonical run command (pinned for Plan 07):**
```bash
# From REPO ROOT:
uvicorn --app-dir backend cmc.app:create_app --factory --host 127.0.0.1 --port 8765
```

**Available imports for Plan 07:**
- `cmc.app.create_app(settings=None) -> FastAPI`
- `cmc.app.lifespan.lifespan` (already wired into the factory)
- `cmc.api.routes.all_routers() -> list[APIRouter]` (extension point)
- All imports from prior plans: `cmc.config`, `cmc.core.SPAStaticFiles`, `cmc.db.*`

No blockers or concerns.

## Self-Check: PASSED

All files verified on disk:
- backend/cmc/app/__init__.py
- backend/cmc/app/factory.py
- backend/cmc/app/lifespan.py
- backend/cmc/api/__init__.py
- backend/cmc/api/routes/__init__.py
- backend/cmc/api/routes/health.py
- .planning/phases/01-foundation-database/01-06-SUMMARY.md

All commits verified in git log:
- 87162fe (test: lifespan tests)
- 87bc57e (feat: lifespan)
- 807c3a5 (test: factory + health tests)
- d7abdde (feat: factory + health + aggregator)

Test suite: 21/21 passing. Smoke test: `uvicorn --app-dir backend cmc.app:create_app --factory` boots cleanly, runs alembic upgrade idempotently, GET /api/health returns 200 {"status":"ok"}.

---
*Phase: 01-foundation-database*
*Completed: 2026-04-25*
