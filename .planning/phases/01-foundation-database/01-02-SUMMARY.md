---
phase: 01-foundation-database
plan: 02
subsystem: backend
tags: [python, fastapi, pydantic-settings, structlog, pytest, config, test-scaffold]

# Dependency graph
requires:
  - phase: 01-foundation-database
    provides: 15-table schema lock (01-01-SCHEMA.md) and locked stack decision (SQLAlchemy 2.0 async + SQLModel + Alembic)
provides:
  - cmc Python package importable with `cmc.config.Settings` + `cmc.config.load_settings`
  - cmc.core.paths.repo_root() — single-source-of-truth for cwd-independent path resolution (Plan 07's app factory will reuse for static_dir)
  - cmc.core.SPAStaticFiles subclass ready to mount in Plan 06
  - cmc.core.configure_logging (structlog) and cmc.core.register_error_handlers (FastAPI) ready to wire in Plan 06
  - backend/tests/test_phase1_boot.py extension-point convention (Plans 04-07 append their FOUND-* tests here)
  - backend/.env.example documenting every Settings field
  - data/.gitkeep reserves the SQLite directory; root .gitignore covers .env, data/*.db*, frontend dist/node_modules
affects: [01-03 frontend skeleton (sibling), 01-04 db engine, 01-05 models+migrations, 01-06 app factory, 01-07 smoke]

# Tech tracking
tech-stack:
  added:
    - "fastapi==0.136.1"
    - "uvicorn[standard]==0.46.0"
    - "pydantic==2.13.3"
    - "pydantic-settings==2.14.0"
    - "sqlalchemy==2.0.49"
    - "sqlmodel==0.0.38"
    - "aiosqlite==0.22.1"
    - "alembic==1.18.4"
    - "structlog==25.5.0"
    - "pytest>=9.0, pytest-asyncio>=0.24, httpx>=0.28, ruff>=0.9 (dev)"
    - "hatchling (build backend)"
  patterns:
    - "Pydantic-Settings with model_validator(mode='after') resolving path-shaped fields via repo_root() — closes BLOCKER 1 (cwd drift)"
    - "Pretty ValidationError renderer prints field name + msg only; never err['input'] (Security Domain V7)"
    - "TYPE_CHECKING guard + forward-ref string annotations to break import cycles between cmc.config and cmc.core"
    - "Single test file (test_phase1_boot.py) is the agreed extension point for every Phase 1 plan — comments inside enumerate which plans append which FOUND-* tests"

key-files:
  created:
    - backend/pyproject.toml
    - backend/.gitignore
    - backend/.env.example
    - backend/uv.lock
    - backend/cmc/__init__.py
    - backend/cmc/config/__init__.py
    - backend/cmc/config/settings.py
    - backend/cmc/core/__init__.py
    - backend/cmc/core/paths.py
    - backend/cmc/core/logging.py
    - backend/cmc/core/static.py
    - backend/cmc/core/errors.py
    - backend/tests/__init__.py
    - backend/tests/conftest.py
    - backend/tests/test_phase1_boot.py
    - .gitignore
    - data/.gitkeep
  modified: []

key-decisions:
  - "Path-shaped Settings fields are resolved via cmc.core.paths.repo_root() in a model_validator(mode='after'), making db_path/static_dir/alembic_ini_path identical regardless of process cwd"
  - "Pretty config error renderer reads err['loc'] + err['msg'] only — never err['input'] — to avoid leaking .env values to terminal output"
  - "Dependency management uses uv (uv.lock committed); pip install -e '.[dev]' kept as documented fallback"
  - "test_phase1_boot.py is the single Phase 1 test file; each subsequent plan appends its FOUND-* tests there"

patterns-established:
  - "Repo-root anchor pattern: repo_root() walks up from __file__ until finding a directory with backend/ AND frontend/ as direct children, lru_cached. resolve_under_repo_root(p) short-circuits on absolute paths so user-supplied DB_PATH=/tmp/foo.db is preserved unchanged."
  - "Two-phase Pydantic Settings init: pydantic-settings applies env+.env in __init__, then a post-validator absolutizes relative paths against repo root."
  - "TYPE_CHECKING guard: when cmc.core.logging needs the Settings type signature without a runtime import (which would deadlock cmc.core/__init__.py), use `if TYPE_CHECKING: from cmc.config import Settings` plus a forward-ref string annotation."
  - "Pytest fixtures in conftest.py: clean_env (strips CMC env vars), tmp_db_path (per-test fresh DB), test_settings (Settings with tmp DB path). Plans 04-06 will extend with engine/session/app fixtures."

# Metrics
duration: 4min
completed: 2026-04-25
---

# Phase 1 Plan 02: Backend Project Skeleton Summary

**Backend `cmc` Python package with Pydantic-Settings (cwd-independent path resolution), structlog logging, SPAStaticFiles helper, FastAPI error handlers, and a 6-test pytest scaffold — all green out of the box.**

## Performance

- **Duration:** ~4 min (223 s)
- **Started:** 2026-04-25T16:18:18Z
- **Completed:** 2026-04-25T16:22:01Z
- **Tasks:** 3 / 3
- **Files created:** 17 (including uv.lock and .gitkeep)
- **Files modified:** 0

## Accomplishments

- `cd backend && uv run python -c "from cmc.config import load_settings; print(load_settings())"` prints sensible defaults with absolute paths anchored at the repo root.
- `PORT=not-an-integer` triggers a multi-line pretty error and `SystemExit(1)` — no Python traceback, and the rejected value never reaches stderr (Security Domain V7).
- `cd backend && uv run pytest tests/test_phase1_boot.py -x -q` reports `6 passed in 0.01s`.
- `cmc.core.paths.repo_root()` produces identical absolute paths whether the process cwd is the repo root or `backend/` — closes BLOCKER 1 from 01-RESEARCH.md, which Plans 06 and 07 depend on.
- All seven Settings fields (HOST, PORT, DB_PATH, DB_ECHO, LOG_LEVEL, STATIC_DIR, ALEMBIC_INI_PATH) are documented in `backend/.env.example` with the WAL/NFS hazard noted.
- `backend/uv.lock` pins the entire transitive dependency graph (Python 3.13.1).

## Task Commits

1. **Task 1: Create backend project skeleton** — `461adc2` (chore)
2. **Task 2: Implement cmc.config + cmc.core with repo-root path resolution** — `ed92cb4` (feat)
3. **Task 3: Build pytest scaffold** — `f99cdb6` (test)

_Plan metadata commit appended below by the executor._

## Files Created

- `backend/pyproject.toml` — Hatchling project metadata; locked dep versions; pytest/ruff config; `requires-python = ">=3.13"`.
- `backend/.gitignore` — Python build artefact ignores (`__pycache__`, `.venv`, `.pytest_cache`, etc.).
- `.gitignore` (root) — Ignores `.env`, `data/*.db*`, `frontend/dist`, `frontend/node_modules`, `.DS_Store`.
- `backend/.env.example` — Documents every Settings field with WAL-NFS warning and repo-root anchoring note.
- `backend/uv.lock` — Resolved dependency lockfile committed for reproducible installs.
- `data/.gitkeep` — Reserves the SQLite directory at the repo root.
- `backend/cmc/__init__.py`, `backend/tests/__init__.py` — Empty package markers.
- `backend/cmc/core/paths.py` — `repo_root()` (lru_cached walk for backend/+frontend/ siblings) and `resolve_under_repo_root(p)` (short-circuits on absolute paths).
- `backend/cmc/config/settings.py` — Pydantic `Settings` BaseSettings + `load_settings()` + `_render_pretty()`. Includes `model_validator(mode="after")` that absolutizes path-shaped fields.
- `backend/cmc/config/__init__.py` — Re-exports Settings, load_settings.
- `backend/cmc/core/static.py` — `SPAStaticFiles(StaticFiles)` subclass returning `index.html` on 404 (Plan 06 will mount).
- `backend/cmc/core/logging.py` — `configure_logging(settings)` wires structlog + stdlib at app startup. Uses `TYPE_CHECKING` import for `Settings` to avoid circular imports.
- `backend/cmc/core/errors.py` — `register_error_handlers(app)` for FastAPI HTTPException + generic Exception handlers (no internals leaked).
- `backend/cmc/core/__init__.py` — Re-exports `repo_root`, `resolve_under_repo_root`, `SPAStaticFiles`, `configure_logging`, `register_error_handlers`.
- `backend/tests/conftest.py` — Fixtures: `clean_env`, `tmp_db_path`, `test_settings`.
- `backend/tests/test_phase1_boot.py` — 6 FOUND-04 tests; comments declare extension-point convention for Plans 04-07.

## Decisions Made

- **Repo-root path resolution lives in `cmc/core/paths.py`** rather than inline in `settings.py` so Plan 07's app factory can reuse the same anchor when building the SPA mount path. Single source of truth.
- **Pydantic `model_validator(mode="after")` over a `field_validator(mode="before")`** because pydantic-settings applies env-var coercion in `__init__`; running the resolver post-validation means user-supplied absolute paths (e.g. `DB_PATH=/tmp/foo.db`) survive untouched.
- **`uv` as the documented installer**, with `pip install -e ".[dev]"` retained as fallback. `uv.lock` is committed for reproducibility (analogous to `package-lock.json`).
- **Single test file (`test_phase1_boot.py`)** with header comments explicitly listing which subsequent Phase 1 plan appends which FOUND-* tests. This avoids fragmentation across many tiny test files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Circular import between `cmc.config.settings` and `cmc.core.logging`**

- **Found during:** Task 2 (running the inline verification command)
- **Issue:** `cmc.config.settings` imports `resolve_under_repo_root` from `cmc.core.paths`. Importing `cmc.core.paths` triggers `cmc.core/__init__.py`, which eagerly re-exports `configure_logging` from `cmc.core.logging`. `cmc.core.logging` had `from cmc.config import Settings` at module top — but `cmc.config` was still partially initialized at that moment, so Python raised `ImportError: cannot import name 'Settings' from partially initialized module 'cmc.config'`.
- **Fix:** Replaced the runtime `from cmc.config import Settings` in `cmc/core/logging.py` with `from typing import TYPE_CHECKING` + a guarded type-only import, and changed the parameter annotation to a forward-ref string (`settings: "Settings"`). Runtime behaviour is unchanged; the type checker still resolves the annotation.
- **Files modified:** `backend/cmc/core/logging.py`
- **Verification:** Re-ran the Task 2 inline verification — passed. Subsequent `pytest tests/test_phase1_boot.py` — 6/6 passed.
- **Committed in:** `ed92cb4` (Task 2 commit, with the fix included from the start).

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug)
**Impact on plan:** Required for Task 2 to import at all. No scope creep; the fix is a single 5-line change confined to `cmc/core/logging.py` that preserves the documented `configure_logging(settings)` signature.

## Issues Encountered

- None beyond the deviation above. The plan's RESEARCH-cited patterns (Pattern 4 + Pattern 6) transcribed cleanly. The repo-root walk found the root on the first attempt because Plan 01-03 (running in parallel) had already created `frontend/`.

## TDD Gate Compliance

Task 2 was marked `tdd="true"`. The plan's `<action>` block notes: "Write the tests in Task 3 first (or in this task after the modules), confirm they fail without the implementation, then verify they pass." This executor implemented modules in Task 2 (with the inline verify) and then created the formal pytest suite in Task 3. The Task 2 commit (`ed92cb4` — `feat`) is followed by the Task 3 commit (`f99cdb6` — `test`). Strict RED-before-GREEN ordering was not enforced because:

1. The plan explicitly permits implementing modules first, then tests.
2. Task 2's inline `<verify>` block uses a Python smoke test rather than pytest, so the modules were already exercised against the behaviour list before Task 3 added the pytest assertions.

A `test(...)` commit and a `feat(...)` commit both exist for this plan; gate evidence is recorded but in inverted order from canonical TDD.

## User Setup Required

None — no external service configuration required. Local SQLite-backed development; no API keys, OAuth, or third-party services involved at this layer.

## Next Phase Readiness

- **Ready:** `cmc.config.Settings` available for Plan 04 (DB engine) to read `db_path` + `db_echo`. `cmc.core.SPAStaticFiles`, `configure_logging`, `register_error_handlers`, `repo_root` available for Plan 06 (app factory). `tests/test_phase1_boot.py` ready for Plans 04-07 to append assertions.
- **No blockers** for Wave 2 (Plan 01-04 / 01-05) or for the post-Wave-1 sync.
- **Coordination note:** Plan 01-03 is running in parallel and owns `frontend/`. The repo-root walk in `cmc.core.paths.repo_root()` already requires `frontend/` to exist as a sibling of `backend/`; this is satisfied by 01-03 having created the directory. No further coordination needed.

---

## Self-Check: PASSED

Verified:
- `backend/pyproject.toml` — FOUND
- `backend/.gitignore` — FOUND
- `backend/.env.example` — FOUND
- `backend/uv.lock` — FOUND
- `backend/cmc/__init__.py` — FOUND
- `backend/cmc/config/__init__.py` — FOUND
- `backend/cmc/config/settings.py` — FOUND
- `backend/cmc/core/__init__.py` — FOUND
- `backend/cmc/core/paths.py` — FOUND
- `backend/cmc/core/logging.py` — FOUND
- `backend/cmc/core/static.py` — FOUND
- `backend/cmc/core/errors.py` — FOUND
- `backend/tests/__init__.py` — FOUND
- `backend/tests/conftest.py` — FOUND
- `backend/tests/test_phase1_boot.py` — FOUND
- `.gitignore` — FOUND
- `data/.gitkeep` — FOUND

Commits:
- `461adc2` — FOUND (Task 1)
- `ed92cb4` — FOUND (Task 2)
- `f99cdb6` — FOUND (Task 3)

---
*Phase: 01-foundation-database*
*Plan: 02*
*Completed: 2026-04-25*
