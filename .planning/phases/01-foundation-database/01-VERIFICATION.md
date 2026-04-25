---
phase: 01-foundation-database
verified: 2026-04-25T14:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 1: Foundation & Database Verification Report

**Phase Goal:** Server boots, database is ready, and the React frontend loads in a browser at localhost:8765
**Verified:** 2026-04-25
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Visiting http://localhost:8765 loads the React SPA | PASSED (human-approved) | Browser smoke test approved by user 2026-04-25: header + body content visible, deep-link fallback works, no console errors, clean shutdown confirmed |
| 2 | SQLite database exists in data/ with WAL mode and all 15 tables | VERIFIED | `data/cmc.db`, `data/cmc.db-shm`, `data/cmc.db-wal` all present; engine.py applies `PRAGMA journal_mode=WAL` on connect; migration `0001_initial.py` has 15 `op.create_table` blocks confirmed by source inspection |
| 3 | Server starts from a single command using app factory pattern with lifespan manager | VERIFIED | `create_app()` returns `FastAPI` (verified by import); `factory.py` wires lifespan, routers, and SPA mount; `lifespan.py` runs `alembic upgrade head` via `asynccontextmanager` and disposes engine on shutdown; canonical command documented: `uvicorn --app-dir backend cmc.app:create_app --factory --host 127.0.0.1 --port 8765` |
| 4 | Configuration loads from environment variables and .env with validation errors on missing required values | VERIFIED | `settings.py` uses `pydantic-settings` with `env_file=".env"`; `model_validator(mode="after")` resolves all path fields against repo root; `load_settings()` catches `ValidationError` and exits 1 with a per-field pretty error; test coverage: 22/25 tests pass covering FOUND-04 |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/cmc/app/factory.py` | App factory, router registration, SPA mount | VERIFIED | Substantive (67 lines); routers registered before SPA mount (per Pitfall 8); SPAStaticFiles mounted at "/" after all `/api/*` routers; SPA mount guarded by `index.html` existence check |
| `backend/cmc/app/lifespan.py` | Lifespan manager calling alembic upgrade | VERIFIED | Substantive (71 lines); uses `asynccontextmanager`; calls `command.upgrade(alembic_cfg, "head")` via `conn.run_sync`; absolutizes `script_location` against ini parent to be cwd-independent; disposes engine in `finally` |
| `backend/cmc/db/engine.py` | Async engine with pragma listener | VERIFIED | Substantive (62 lines); registers `connect` event listener applying 5 pragmas: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `journal_size_limit`, `synchronous=NORMAL`; handles aiosqlite `isolation_level` toggle correctly |
| `backend/cmc/config/settings.py` | Pydantic-settings with .env loading and pretty error | VERIFIED | Substantive (83 lines); `BaseSettings` with `env_file=".env"`; `model_validator(mode="after")` absolutizes `db_path`, `static_dir`, `alembic_ini_path` against `repo_root()`; `load_settings()` catches `ValidationError` and `sys.exit(1)` without leaking rejected values |
| `backend/cmc/db/models/__init__.py` | Imports all 15 model classes | VERIFIED | Exactly 15 `from cmc.db.models.*` imports with `# noqa: F401`; all 15 model files present in `models/` directory |
| `backend/migrations/versions/0001_initial.py` | Creates 15 tables | VERIFIED | Exactly 15 `op.create_table(...)` calls confirmed by line scan; includes FK constraints, indexes, unique constraints, and partial unique index for `decisions` |
| `frontend/dist/index.html` | Built SPA artifact | VERIFIED | Exists; references `/assets/index-C6NVRcsU.js` and `/assets/index-vjEIWytj.css` — real Vite build output, not a placeholder |
| `backend/cmc/core/static.py` | SPAStaticFiles catch-all | VERIFIED | Subclasses `StaticFiles`; catches `starlette.exceptions.HTTPException` (not fastapi's, per Pitfall 5); wraps `self.directory` with `Path(...)` before joining |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `factory.py` | `lifespan.py` | `lifespan=lifespan` param in `FastAPI(...)` | WIRED | `from cmc.app.lifespan import lifespan` imported; passed directly to `FastAPI(lifespan=lifespan)` |
| `factory.py` | `/api/*` routers | `all_routers()` loop | WIRED | `from cmc.api.routes import all_routers`; `for router in all_routers(): app.include_router(router, prefix="/api")` |
| `factory.py` | `SPAStaticFiles` | `app.mount("/", ...)` | WIRED | Mounted after routers; guarded by `index.html` existence; conditional log warning if missing |
| `lifespan.py` | `alembic upgrade head` | `conn.run_sync(_upgrade)` | WIRED | `AlembicConfig` built from `settings.alembic_ini_path` (absolute); `script_location` overridden to absolute path; `command.upgrade(cfg, "head")` called |
| `lifespan.py` | `engine.py` | `create_engine_for_settings(settings)` | WIRED | Imported from `cmc.db`; called at lifespan startup; result stored in `app.state.engine` |
| `health.py` | `get_session` dependency | `Depends(get_session)` | WIRED | `from cmc.db import get_session`; `AsyncSession = Depends(get_session)` in route signature; executes `SELECT 1` to confirm DB reachability |
| `settings.py` | `repo_root()` | `resolve_under_repo_root()` | WIRED | `from cmc.core.paths import resolve_under_repo_root`; called in `model_validator` for all three path fields |

### Data-Flow Trace (Level 4)

Not applicable for Phase 1 — no components rendering dynamic application data. The `/api/health` endpoint returns a static `{"status": "ok"}` response after a DB round-trip, which is the intended behavior for a liveness check.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `create_app()` returns FastAPI instance | `python -c "from cmc.app import create_app; print(type(create_app()).__name__)"` | `FastAPI` | PASS |
| 25 tests pass from `backend/` | `cd backend && python -m pytest tests/test_phase1_boot.py` | `25 passed in 0.66s` | PASS |
| `frontend/dist/index.html` is a real Vite build | File inspection: references hashed JS/CSS assets | Asset references present | PASS |
| SQLite WAL siblings exist in `data/` | `ls data/` | `cmc.db`, `cmc.db-shm`, `cmc.db-wal` present | PASS |
| Migration has exactly 15 tables | `grep "op.create_table" migrations/versions/0001_initial.py | wc -l` | 15 | PASS |

Note: Running tests from repo root (`python -m pytest backend/tests/test_phase1_boot.py`) causes 3 failures (`test_alembic_upgrade_creates_all_tables`, `test_alembic_upgrade_is_idempotent`, `test_column_exists_helper_signature`). These failures are caused by the test code using a relative `Config("alembic.ini")` path, which resolves incorrectly outside `backend/`. The production lifespan is unaffected — it uses `settings.alembic_ini_path`, which is always an absolute path resolved by `model_validator`. The correct invocation is `cd backend && pytest` (matching `testpaths = ["tests"]` in `pyproject.toml`). This is a test ergonomics issue, not a production defect.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| FOUND-01 | FastAPI app factory pattern | SATISFIED | `create_app()` in `factory.py`; `FastAPI(lifespan=lifespan)` wired |
| FOUND-02 | SQLite DB with WAL + 15 tables | SATISFIED | Pragma listener in `engine.py`; 15-table migration; WAL files present in `data/` |
| FOUND-03 | Schema idempotency (`_column_exists` helper) | SATISFIED | `_column_exists(table, column) -> bool` in `0001_initial.py`; test `test_column_exists_helper_signature` passes when run from `backend/` |
| FOUND-04 | Pydantic-settings config from env/.env | SATISFIED | `settings.py` with `BaseSettings`, `.env` loading, `model_validator` for repo-root paths, pretty error on bad values |
| FOUND-05 | Lifespan manager (start/stop) | SATISFIED | `lifespan.py` with `asynccontextmanager`; engine created + migrations run on start; `engine.dispose()` on shutdown |
| FOUND-06 | React SPA served at / | SATISFIED | `SPAStaticFiles` in `core/static.py`; mounted after routers in `factory.py`; `frontend/dist/index.html` exists with real Vite build assets; browser smoke test approved |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `tests/test_phase1_boot.py:150,178` | `Config("alembic.ini")` — relative path in test helpers | Warning | Tests fail when run from repo root; passes from `backend/` as per `pyproject.toml` config. Not a production defect. |
| `tests/test_phase1_boot.py:194` | `migrations/versions/0001_initial.py` — relative path for `spec_from_file_location` | Warning | Same root cause as above — test uses relative path that only resolves from `backend/`. |

No blockers found. No production code stubs, placeholders, or disconnected wiring detected.

### Human Verification Required

None. The one item requiring human testing (must-have #1: React SPA loads at localhost:8765) was approved by the user on 2026-04-25. The approved test covered: header and body content visible, `/api/health` returned JSON, deep-link fallback (`/some-deep-link`) returned the SPA shell, `/api/docs` rendered Swagger, DB landed at `data/` with WAL siblings, and clean Ctrl+C shutdown.

### Gaps Summary

No gaps. All four observable truths are verified by code inspection, test results, and the user-approved browser smoke test.

**Note on test run context:** The `pytest` configuration (`testpaths = ["tests"]`, `pyproject.toml`) specifies tests should be run from `backend/`. Three tests use relative paths to `alembic.ini` and the migration file that only resolve from `backend/`. These pass correctly from the intended directory (25/25). This is a test ergonomics issue worth addressing in a future phase but does not constitute a gap against the phase goal.

---

_Verified: 2026-04-25T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
