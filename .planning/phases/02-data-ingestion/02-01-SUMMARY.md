---
phase: 02-data-ingestion
plan: 01
subsystem: config
tags: [pydantic-settings, pytest, fixtures, jsonl, otlp, phase-2-foundation]

# Dependency graph
requires:
  - phase: 01-foundation-database
    provides: Settings class + repo-root path resolver + test_phase1_boot.py + conftest fixtures (clean_env, tmp_db_path, test_settings, tmp_static_dir, test_settings_with_static)
provides:
  - Settings.jsonl_root (default ~/.claude/projects, NOT repo-root-resolved)
  - Settings.session_idle_minutes (default 5)
  - Settings.otlp_max_body_bytes (default 10_000_000)
  - pytest-freezer dev dep (freezegun 1.5.5) for INGST-05 local-day-bucket tests
  - backend/tests/test_phase2_ingest.py (Phase 2 single-file test convention seed)
  - 4 conftest fixtures: fake_jsonl_dir, golden_jsonl_session, otlp_log_payload, otlp_metric_payload
  - Phase 1 cwd-test bug fix (3 alembic/migration relative paths absolutized)
affects: [02-02-jsonl-parser, 02-03-otlp-router, 02-04-scheduler-repo, 02-05-lifespan-manual-sync, 02-06-smoke]

# Tech tracking
tech-stack:
  added: [pytest-freezer 0.4.9, freezegun 1.5.5]
  patterns:
    - "Settings field default_factory for user-home paths (Path.home() / '.claude/projects') — bypasses repo-root resolver"
    - "Single test file per phase (test_phaseN_*.py) appended-to by each plan"
    - "Conftest fixtures live in backend/tests/conftest.py and are auto-discovered by name across all test files"

key-files:
  created:
    - backend/tests/test_phase2_ingest.py
  modified:
    - backend/cmc/config/settings.py
    - backend/.env.example
    - backend/pyproject.toml
    - backend/tests/conftest.py
    - backend/tests/test_phase1_boot.py

key-decisions:
  - "jsonl_root default: Path.home() / '.claude/projects' — locked Phase 2 discretion (research §1, Pitfall 8)"
  - "session_idle_minutes default: 5 — matches SESS-03 'live sessions' definition"
  - "otlp_max_body_bytes default: 10_000_000 (10MB) — protects against misconfigured exporters"
  - "jsonl_root EXCLUDED from _resolve_repo_root_paths validator (it's user-home anchored, not repo-root anchored — expanduser() happens at scraper access time)"
  - "Test cwd-fix: alembic Config script_location must be absolutized in addition to ini path (alembic.ini's `script_location = migrations` is cwd-relative; mirror lifespan.py's BLOCKER 1 fix in tests)"

patterns-established:
  - "Phase 2 single-file convention: backend/tests/test_phase2_ingest.py (downstream plans append INGST-* sections)"
  - "Phase 2 fixture suite: fake_jsonl_dir → golden_jsonl_session chain for parser tests; otlp_log_payload/otlp_metric_payload for router tests"

# Metrics
duration: 12min
completed: 2026-04-25
---

# Phase 2 Plan 01: Foundation Summary

**Three new Settings fields (jsonl_root, session_idle_minutes, otlp_max_body_bytes) + pytest-freezer dev dep + Phase 2 conftest fixtures + Phase 1 cwd-relative-path test cleanup, all green from both backend/ and repo-root cwds.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-25T18:19:00Z
- **Completed:** 2026-04-25T18:31:20Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 edited)

## Accomplishments

- Three Phase 2 Settings fields with locked defaults — `jsonl_root=~/.claude/projects`, `session_idle_minutes=5`, `otlp_max_body_bytes=10_000_000`
- Four reusable conftest fixtures (`fake_jsonl_dir`, `golden_jsonl_session`, `otlp_log_payload`, `otlp_metric_payload`) — Plans 02-02..02-05 will consume by name, no re-introduction
- `pytest-freezer 0.4.9` + `freezegun 1.5.5` installed; `import freezegun` works
- Closed STATE.md "Pending Todos" cwd-relative-path bug — `pytest -q` now passes 25/25 from BOTH `backend/` AND repo-root cwds
- Phase 2 single-test-file convention established: `backend/tests/test_phase2_ingest.py` exists with one passing seed test asserting all 3 new Settings fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Settings + .env.example + pytest-freezer + cwd-test fix** — `621af80` (feat)
2. **Task 2: conftest fixtures + test_phase2_ingest.py seed** — `164331a` (test)

## Files Created/Modified

**Created:**
- `backend/tests/test_phase2_ingest.py` — Phase 2 test suite (single-file-per-phase convention); 1 seed test asserting new Settings fields

**Modified:**
- `backend/cmc/config/settings.py` — Added `Field` import; added `jsonl_root`, `session_idle_minutes`, `otlp_max_body_bytes` fields with documented defaults; jsonl_root intentionally OMITTED from `_resolve_repo_root_paths` validator (user-home anchored, not repo-root anchored)
- `backend/.env.example` — Documented `JSONL_ROOT`, `SESSION_IDLE_MINUTES`, `OTLP_MAX_BODY_BYTES` with rationale comments
- `backend/pyproject.toml` — Added `pytest-freezer>=0.4` to `[project.optional-dependencies].dev`
- `backend/tests/conftest.py` — Appended Phase 2 fixtures (`fake_jsonl_dir`, `golden_jsonl_session`, `otlp_log_payload`, `otlp_metric_payload`)
- `backend/tests/test_phase1_boot.py` — Fixed 3 cwd-relative paths flagged in STATE.md "Pending Todos": `alembic.ini` references at lines 150 & 178 and `0001_initial.py` reference at line 194 → all now use `repo_root() / "backend/..."` absolute paths; also absolutized alembic Config `script_location` (mirroring lifespan.py's BLOCKER 1 fix)

## Decisions Made

- **jsonl_root field uses `Field(default_factory=lambda: Path.home() / ".claude/projects")`** — `default_factory` evaluates lazily at instantiation time (not import time), so per-process env overrides via tests/JSONL_ROOT remain straightforward; `~` expansion is the scraper's responsibility (Plan 02-04) so env-supplied `~/...` strings survive Settings construction unchanged.
- **jsonl_root must NOT be added to `_resolve_repo_root_paths`** — adding it would force user-home paths through `repo_root() / "..."` resolution and break the field semantics. The validator's tuple stays `("db_path", "static_dir", "alembic_ini_path")` exactly.
- **Test cwd-fix expansion**: Plan only flagged 3 path literals, but the alembic `Config(...)` constructor still pulled `script_location = migrations` from the ini file — that's also cwd-relative. Mirroring `cmc/app/lifespan.py`'s BLOCKER 1 mitigation (`set_main_option("script_location", str(ini_path.parent / "migrations"))`) was required to actually pass tests from repo root. Documented inline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] alembic Config `script_location` cwd-relative even after ini path absolutized**
- **Found during:** Task 1 (cwd-test fix verification)
- **Issue:** Plan instructions absolutized only the alembic.ini PATH, but alembic.ini contains `script_location = migrations` which is itself cwd-relative. After fix-1, repo-root pytest still failed with `CommandError: Path doesn't exist: migrations`. The two `test_alembic_upgrade_*` tests bypass the lifespan code that would normally absolutize `script_location`, so they hit the raw cwd resolution.
- **Fix:** After constructing `cfg = Config(str(ini_path))`, call `cfg.set_main_option("script_location", str(ini_path.parent / "migrations"))` — exactly mirrors `cmc/app/lifespan.py` lines 50-55 ("BLOCKER 1 follow-through"). Documented inline so future readers understand the parallel.
- **Files modified:** backend/tests/test_phase1_boot.py (`test_alembic_upgrade_creates_all_tables`, `test_alembic_upgrade_is_idempotent`)
- **Verification:** Both tests now pass from repo-root cwd; full pytest 25/25 from both cwds.
- **Committed in:** 621af80 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to actually deliver the cwd-bug fix the plan called for. No scope creep — purely the second half of a fix the plan partially specified.

## Issues Encountered

- `.venv/bin/pip` not present (uv-managed virtualenv); used `uv pip install --python .venv/bin/python -e ".[dev]"` instead. No impact on plan output.

## Phase 2 Entry Contracts for Downstream Plans

Each downstream plan in this phase consumes specific outputs of 02-01:

- **Plan 02-02 (JSONL parser):** Imports `cmc.config.Settings.jsonl_root` indirectly via the existing `test_settings` fixture; uses `golden_jsonl_session` to drive parser unit tests for INGST-02/03/06.
- **Plan 02-03 (OTLP router):** Reads `Settings.otlp_max_body_bytes` in the `/v1/logs` and `/v1/metrics` handlers; uses `otlp_log_payload` and `otlp_metric_payload` fixtures for router unit tests (INGST-07/08/09).
- **Plan 02-04 (scheduler/repo):** Reads `Settings.session_idle_minutes` in `sync_once`; uses `fake_jsonl_dir` + `golden_jsonl_session` + the `freezer` pytest-freezer fixture for INGST-04/05.
- **Plan 02-05 (lifespan/manual sync):** Wires the lifespan + `POST /api/sync` route; uses everything above for INGST-01/10 integration tests.

## Test Counts

- Before this plan: 25 tests (Phase 1 boot suite)
- After this plan: **26 tests** (25 Phase 1 + 1 Phase 2 seed)
- Both cwds: `pytest -q` from `backend/` → 26/26; from repo root → 26/26.

## User Setup Required

None — no external service configuration required. `pytest-freezer` is installed automatically via `pip install -e ".[dev]"`.

## Next Phase Readiness

- **Ready for Plan 02-02 (JSONL parser):** Settings + fixtures + test scaffolding all in place; downstream can use `golden_jsonl_session` directly.
- **STATE.md "Pending Todos" cleanup:** The cwd-relative-path bug item can now be removed.
- **No blockers.**

## Self-Check: PASSED

Verified:
- `backend/cmc/config/settings.py` — exists, contains `jsonl_root`, `session_idle_minutes`, `otlp_max_body_bytes`
- `backend/.env.example` — exists, contains `JSONL_ROOT`, `SESSION_IDLE_MINUTES`, `OTLP_MAX_BODY_BYTES`
- `backend/pyproject.toml` — exists, contains `pytest-freezer>=0.4`
- `backend/tests/conftest.py` — exists, contains `fake_jsonl_dir`, `golden_jsonl_session`, `otlp_log_payload`, `otlp_metric_payload`
- `backend/tests/test_phase2_ingest.py` — exists, contains `test_phase2_settings_fields_present`
- `backend/tests/test_phase1_boot.py` — exists, no cwd-relative `alembic.ini` or `migrations/versions/0001_initial.py` literals remain
- Commits `621af80`, `164331a` exist in `git log --oneline`
- `pytest -q` 26/26 from `backend/`; `pytest -c backend/pyproject.toml -q backend/tests/` 26/26 from repo root

---
*Phase: 02-data-ingestion*
*Completed: 2026-04-25*
