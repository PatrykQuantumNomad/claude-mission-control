---
phase: 01-foundation-database
plan: 07
subsystem: api

tags:
  - integration
  - spa
  - smoke-test
  - phase-1
  - browser-verified

# Dependency graph
requires:
  - phase: 01-foundation-database
    provides: SPAStaticFiles class (Plan 02), built frontend/dist (Plan 03), create_app factory + lifespan + /api/health (Plan 06)
provides:
  - "End-to-end Phase 1 system: uvicorn boots, alembic upgrades DB, FastAPI serves /api/* routers, React SPA mounted at / with deep-link fallback"
  - "Canonical run command: uvicorn --app-dir backend cmc.app:create_app --factory --host 127.0.0.1 --port 8765 (run from repo root)"
  - "FOUND-01 + FOUND-06 verified end-to-end via human browser smoke test"
  - "test_static_mount_after_routers regression guard against Pitfall 8 (static mount shadowing /api/*)"
affects:
  - "Phase 2 (ingestion): all_routers() aggregator already wired; new ingestion routers plug in without touching factory.py"
  - "Phase 5 (frontend shell): dist/ rebuild + factory mount mechanism unchanged; future frontend work just rebuilds dist/"
  - "Phase 9 (doctor.py): Pitfall 4/7 WAL-on-iCloud check still owed (deferred per plan)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SPA mount LAST in factory, AFTER all routers (Pitfall 8 enforced by test_static_mount_after_routers)"
    - "settings.static_dir trusted as absolute (Plan 02 model_validator) — no multi-candidate cwd search in factory"
    - "Graceful skip-mount when frontend/dist/index.html missing (logs warning, API still works)"
    - "Test fixture pattern: model_copy(update=...) to override Settings fields without re-triggering env loading (BLOCKER 4 / WARNING 4)"

key-files:
  created:
    - .planning/phases/01-foundation-database/01-07-SUMMARY.md
  modified:
    - backend/cmc/app/factory.py
    - backend/cmc/core/static.py
    - backend/tests/conftest.py
    - backend/tests/test_phase1_boot.py
    - frontend/dist/

key-decisions:
  - "SPA mount uses settings.static_dir directly (already absolute via Plan 02 model_validator) — no _resolve_static_dir() helper or multi-candidate cwd search needed."
  - "When frontend/dist/index.html is missing, factory logs a warning and skips the mount instead of raising — the API remains usable for backend-only dev workflows."
  - "Plan 06's contract-guard test_routers_registered_before_static_mount_slot REMOVED and REPLACED by test_static_mount_after_routers (asserts SPA mount exists AND comes after /api/health). Net: -1 + 5 = +4 tests, total 25."
  - "test_settings_with_static fixture uses model_copy(update={...}) instead of Settings(...) to avoid re-triggering Pydantic env loading and picking up CMC_* vars outside clean_env scope."
  - "SPAStaticFiles deep-link fallback caught by starlette.exceptions.HTTPException (the actual class StaticFiles raises) and Path-wraps the str directory the parent constructor stores — auto-fixed during Task 1 manual smoke (deviation Rule 1)."

patterns-established:
  - "Factory mount order: register_error_handlers -> include_router loop -> app.mount('/', SPAStaticFiles, name='spa'). The mount is the LAST statement before return app, by code-review convention AND test enforcement."
  - "Mount identification in tests: locate the SPA mount via name='spa' (not by path) because Starlette stores the root Mount with empty path attribute."
  - "Manual browser smoke checkpoint pattern: 4 URL checks (/, /deep-link, /api/health, /api/docs) + console errors + clean shutdown + DB-at-repo-root verification."

# Metrics
duration: ~50 min (incl. checkpoint wait)
completed: 2026-04-25
---

# Phase 1 Plan 07: SPA Static Mount + End-to-End Smoke Summary

**React SPA mounted at `/` after all routers via `SPAStaticFiles(html=True)`, with deep-link fallback verified, /api/* routes preserved (Pitfall 8 guarded by `test_static_mount_after_routers`), and the full stack browser-smoke-tested: localhost:8765 renders the React page, /some-deep-link falls back to index.html, /api/health returns JSON, and the SQLite DB lands at repo-root `data/cmc.db` with WAL siblings.**

## Performance

- **Duration:** ~50 min total (including checkpoint wait for human browser verification)
- **Started:** 2026-04-25T~12:30Z
- **Completed:** 2026-04-25T~13:30Z
- **Tasks:** 3 (Task 1 auto, Task 2 auto, Task 3 checkpoint:human-verify)
- **Files created:** 1 (this SUMMARY)
- **Files modified:** 4 (factory.py, static.py, conftest.py, test_phase1_boot.py) + frontend/dist/ rebuild
- **Test count:** 25 passing (Plan 06 had 21; this plan removed 1 contract-guard, added 5 new = net +4)

## Accomplishments

- **FOUND-01 (Server boots on localhost:8765):** Verified via human browser smoke — `uvicorn --app-dir backend cmc.app:create_app --factory --host 127.0.0.1 --port 8765` boots cleanly from repo root, /api/health returns `{"status":"ok"}`, /api/docs renders Swagger UI, no Python tracebacks on startup or shutdown.
- **FOUND-06 (Pre-built React SPA + SPA catch-all):** Verified end-to-end. `frontend/dist/index.html` (rebuilt fresh) is served at `/`. Deep-link fallback (e.g., `/some-deep-link`) returns the same index.html. The "Mission Control online." body text and "Claude Mission Control" header render in a real browser with no console errors.
- **Pitfall 8 regression-guarded:** `test_static_mount_after_routers` asserts `/api/health` precedes the SPA mount in `app.routes`. The contract-guard `test_routers_registered_before_static_mount_slot` from Plan 06 was deliberately removed (per BLOCKER 2 handoff).
- **DB path resolution closed:** `data/cmc.db` + `cmc.db-wal` + `cmc.db-shm` confirmed at repo root after first boot. No `backend/data/cmc.db`. Empty stray `backend/data/` directory cleaned up post-verification.
- **Graceful degradation:** `test_create_app_skips_mount_if_static_dir_missing` proves the API remains operational even if `frontend/dist/index.html` is absent (factory logs a warning, skips the mount).
- **Phase 1 complete:** All 6 FOUND-* requirements implemented, tested, and human-verified.

## Task Commits

| # | Task | Commit | Type |
|---|------|--------|------|
| pre-1 | Auto-fix: SPA deep-link fallback (starlette.exceptions.HTTPException + Path wrap on directory) | `7a3e478` | fix |
| 1 | Frontend rebuild + factory mounts SPAStaticFiles after routers | `7c6437f` | feat |
| 2 | Add 5 new SPA mount tests + remove Plan 06 contract-guard test (25 passing) | `a8adda0` | test |
| pause | Mark plan paused at browser smoke checkpoint (STATE.md update) | `7e4af2a` | docs |
| 3 | Browser smoke checkpoint APPROVED by user (this plan's closing commit) | (this commit) | docs |

## Browser Smoke Verification (Task 3)

User confirmed all six checks on 2026-04-25:

| Check | Expected | Result |
|-------|----------|--------|
| `http://localhost:8765/` | React page loads with "Claude Mission Control" header + "Mission Control online." body | PASS |
| `http://localhost:8765/some-deep-link` | Same SPA shell served (deep-link fallback) | PASS |
| `http://localhost:8765/api/health` | `{"status":"ok"}` JSON | PASS |
| `http://localhost:8765/api/docs` | FastAPI Swagger UI | PASS |
| Browser console | No errors | PASS (no console errors) |
| Server stdout / shutdown | No Python tracebacks; clean Ctrl+C | PASS |
| DB location | `data/cmc.db` + WAL siblings at repo root, no `backend/data/cmc.db` | PASS |

## Files Created/Modified

**Created:**
- `.planning/phases/01-foundation-database/01-07-SUMMARY.md` — this summary

**Modified:**
- `backend/cmc/app/factory.py` — replaced the Plan 06 placeholder comment with the actual SPA mount: `app.mount("/", SPAStaticFiles(directory=str(static_dir), html=True), name="spa")` AFTER the router loop, with a graceful warn-and-skip branch when `static_dir / index.html` is missing.
- `backend/cmc/core/static.py` — auto-fix (deviation Rule 1): SPAStaticFiles now catches `starlette.exceptions.HTTPException` (the actual class StaticFiles raises) instead of `fastapi.HTTPException`, AND wraps `self.directory` in `Path(...)` since the StaticFiles parent stores `directory` as a string. Without these two fixes, deep-link fallback never triggered (the 404 propagated).
- `backend/tests/conftest.py` — added `tmp_static_dir` (creates a fake dist/ with marker text) and `test_settings_with_static` (model_copy-based override) fixtures.
- `backend/tests/test_phase1_boot.py` — REMOVED `test_routers_registered_before_static_mount_slot` (Plan 06 contract-guard, now obsolete). ADDED 5 tests: `test_spa_root_returns_index_html`, `test_spa_deep_link_fallback`, `test_api_not_shadowed_by_spa_mount`, `test_create_app_skips_mount_if_static_dir_missing`, `test_static_mount_after_routers`. Net change: -1 + 5 = +4. Total Phase 1 tests: 25 (from 21).
- `frontend/dist/` — rebuilt via `npm run build` to ensure a current bundle is on disk (no source change to frontend/src; Plan 03 already produced the React app with the marker text).

## Decisions Made

1. **No `_resolve_static_dir()` helper in factory.py.** `settings.static_dir` is already absolute (Plan 02's `model_validator(mode="after")` calls `resolve_under_repo_root()`). The factory trusts that path directly. The original Plan 07 draft had a multi-candidate cwd search; that was redundant after Plan 02's revision. Documented in the plan's `<interfaces>` section and reflected in the final factory code.

2. **Graceful warn-and-skip when index.html missing.** The factory does not raise if `frontend/dist/index.html` is absent; it logs a warning and proceeds without the SPA mount. This keeps the API usable for backend-only dev workflows (e.g., running tests, hitting /api/* directly) without forcing every developer to run `npm run build` first. `test_create_app_skips_mount_if_static_dir_missing` enforces this contract.

3. **Mount identified by `name="spa"` in tests, not by path.** Starlette stores the root `Mount` with an empty `path` attribute. Drafted tests that searched `app.routes` for `path == "/"` would never match. Inlined fix in Task 2 (deviation Rule 1) — `test_static_mount_after_routers` and `test_create_app_skips_mount_if_static_dir_missing` now use `name="spa"` (or `__class__.__name__ == "Mount"` plus a name check).

4. **Deferred to Phase 9 doctor.py:** Runtime check for `data/cmc.db` on iCloud/NFS (Pitfall 7 — WAL fails silently on those filesystems). The `.env.example` warning from Plan 02 covers user awareness; doctor.py will add the runtime probe.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] SPA deep-link fallback caught the wrong exception class**
- **Found during:** Task 1 manual smoke (curl `http://127.0.0.1:8765/some-deep-link` returned a 404 instead of index.html)
- **Issue:** `cmc/core/static.py` SPAStaticFiles.get_response caught `fastapi.HTTPException` on the 404 path. But StaticFiles is a Starlette construct and raises `starlette.exceptions.HTTPException` — these are different classes (FastAPI's HTTPException is a subclass with extra fields, but the parent StaticFiles raises the bare Starlette one). The catch never matched, so the 404 propagated and deep-link fallback was effectively dead.
- **Fix:** Changed the import to `from starlette.exceptions import HTTPException` and updated the `except` clause accordingly.
- **Files modified:** `backend/cmc/core/static.py`
- **Committed in:** `7a3e478`

**2. [Rule 1 — Bug] SPAStaticFiles called Path methods on a str**
- **Found during:** Task 1 manual smoke (after fix #1, traceback: `'str' object has no attribute 'is_file'`)
- **Issue:** Starlette's `StaticFiles.__init__` stores `directory` as a `str` on `self.directory`. The SPAStaticFiles override called `(self.directory / "index.html").is_file()` which only works on Path. Also affected `self.directory.is_dir()` in the missing-static guard.
- **Fix:** Wrapped `self.directory` in `Path(...)` inside the override before calling Path methods.
- **Files modified:** `backend/cmc/core/static.py`
- **Committed in:** `7a3e478` (same commit as #1)

**3. [Rule 1 — Bug] Test helpers identified the SPA Mount by path, not by name**
- **Found during:** Task 2 RED (tests as drafted in PLAN failed even after Task 1 was correct)
- **Issue:** The drafted tests `test_static_mount_after_routers` and `test_create_app_skips_mount_if_static_dir_missing` looked for `Mount` routes with `path == "/"`. Starlette stores the root mount with an empty `path` attribute (not `"/"`), so the lookup never matched and the assertions failed even when the mount was correctly registered.
- **Fix:** Changed both tests to identify the SPA mount via `getattr(r, "name", None) == "spa"` (the factory sets `name="spa"` on the mount) instead of by path.
- **Files modified:** `backend/tests/test_phase1_boot.py`
- **Committed in:** `a8adda0` (Task 2 commit, inline fix)

---

**Total deviations:** 3 auto-fixed (3 bugs, 0 missing critical, 0 architectural)
**Impact on plan:** All 3 are Rule 1 (bugs in plan-as-drafted code). No scope creep — each fix was the minimal change to make the documented behavior actually work. No user permission was required.

## Issues Encountered

None blocking after the auto-fixes. The browser smoke checkpoint was the only natural pause; user approval came in cleanly with all six checks passing on first try after the SPA fallback fixes.

## Phase 1 Wrap

This plan closes Phase 1: Foundation & Database. All 6 requirements (FOUND-01..FOUND-06) are implemented, tested via 25 passing pytest tests, and verified end-to-end through a human browser smoke. The full stack — FastAPI + SQLite + alembic + WAL + 15 SQLModel tables + React SPA + deep-link fallback — works from one command (`uvicorn --app-dir backend cmc.app:create_app --factory`) at `localhost:8765`.

Plan 01-07 hands off to the Phase 1 verifier (gsd-verifier). The orchestrator is responsible for flipping the phase status from "In progress" to "Complete" after verification passes.

## Canonical Run Command (pinned for Phase 2+)

```bash
# From REPO ROOT (the only supported invocation):
uvicorn --app-dir backend cmc.app:create_app --factory --host 127.0.0.1 --port 8765
```

This command is referenced by Plan 06, Plan 07, and the manual checkpoint instructions, and remains the canonical command for all downstream phases that boot the server.

## Self-Check: PASSED

Files verified on disk:
- `backend/cmc/app/factory.py` (mounts SPAStaticFiles after routers)
- `backend/cmc/core/static.py` (HTTPException fix + Path wrap)
- `backend/tests/conftest.py` (tmp_static_dir + test_settings_with_static fixtures)
- `backend/tests/test_phase1_boot.py` (25 tests, no test_routers_registered_before_static_mount_slot)
- `frontend/dist/index.html` (rebuilt)
- `data/cmc.db` + `cmc.db-wal` + `cmc.db-shm` (repo root, WAL active)
- `.planning/phases/01-foundation-database/01-07-SUMMARY.md` (this file)

Commits verified in git log:
- `7a3e478` (fix: SPA deep-link fallback now actually triggers)
- `7c6437f` (feat: mount SPAStaticFiles at / after routers)
- `a8adda0` (test: SPA mount tests + remove Plan 06 contract-guard)
- `7e4af2a` (docs: paused at checkpoint)

Test suite: 25/25 passing. Manual browser smoke: 6/6 checks PASS (user approved).

---
*Phase: 01-foundation-database*
*Completed: 2026-04-25*
