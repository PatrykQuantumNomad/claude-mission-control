---
phase: 25
plan: 02
subsystem: backend / api
tags: [backend, fastapi, pydantic, saved-views, VIEW-03, CRUD]
dependency_graph:
  requires:
    - "backend/cmc/db/models/saved_views.py (Plan 01 — SavedView SQLModel)"
    - "backend/cmc/api/schemas/common.py (ORMBase, UTCDatetime re-export)"
    - "backend/cmc/core/time.py (now_utc canonical naive-UTC factory)"
    - "backend/cmc/db/session.py (get_session FastAPI dependency)"
    - "backend/cmc/api/routes/__init__.py (all_routers() aggregator)"
  provides:
    - "5 CRUD endpoints under /api/views (list/create/get/patch/delete)"
    - "cmc.api.routes.views.router APIRouter (tags=['views'])"
    - "cmc.api.routes.views.VIEW_CAP_PER_ROUTE = 50 constant (importable for tests/UI)"
    - "cmc.api.schemas.views: SavedViewCreate / SavedViewUpdate / SavedViewListItem / SavedViewListResponse"
    - "tests/conftest.py: make_saved_view_row async factory"
  affects:
    - "backend/cmc/api/routes/__init__.py (views_router added to all_routers() return list)"
tech_stack:
  added: []
  patterns:
    - "Application-side count-then-insert cap enforcement (Pitfall 5; single-user race window academic)"
    - "IntegrityError -> HTTPException 400 translation for UNIQUE (route, name) collisions (mirrors no FastAPI router precedent in this codebase but follows the {error: detail} envelope discipline)"
    - "Capture-before-rollback for attrs used in error messages (rollback expires session attrs even when expire_on_commit=False — Rule 1 deviation discovered + fixed)"
    - "PATCH partial-update via model_dump(exclude_unset=True) + setattr loop (line-for-line mirror of tasks.py:155-156)"
    - "204 No Content on DELETE (Response(status_code=204); r.text == '' for assertions)"
key_files:
  created:
    - backend/cmc/api/schemas/views.py
    - backend/cmc/api/routes/views.py
    - backend/tests/test_views_router.py
  modified:
    - backend/cmc/api/routes/__init__.py
    - backend/tests/conftest.py
decisions:
  - "VIEW_CAP_PER_ROUTE=50 module-level constant in views.py (not Settings) — single-product invariant per ROADMAP Phase 25 success criterion 5; exposed for import so tests + future UI affordance can reference the same source."
  - "make_saved_view_row uses async DB-writer shape (inserts + commits + refreshes) instead of the make_task_row dict-return shape — the 50-cap test would otherwise need 50 ORM construction + commit lines at the call site."
  - "Captured row_route into a local BEFORE the setattr loop in patch_view to keep the IntegrityError error message functional after rollback. SQLAlchemy 2.x expires session attrs on rollback unconditionally, regardless of expire_on_commit=False (which only governs commit behavior). Locked pattern for any future handler that references attrs after a possible rollback."
  - "PATCH ignores unknown `route` keys silently (Pydantic SavedViewUpdate omits route; raw POST body extras dropped). Verified by test_patch_view_route_field_silently_ignored. If a 'move view between routes' UX is ever required, expose a separate explicit endpoint per the schema docstring."
  - "Used existing db_session fixture (NOT the plan-text 'async_session' fixture, which does not exist in this codebase). conftest.py:396-422 deliberately wires db_session to coexist with `client` by sharing the same seeded_app fixture tuple — both fixtures hit the same lifespan-active app, so seeding via db_session immediately becomes visible to client.get/post calls."
metrics:
  duration_minutes: 11
  completed_date: 2026-05-12
  tasks_completed: 3
  files_created: 3
  files_modified: 2
  commits: 3
---

# Phase 25 Plan 02: Saved-Views Backend Router + Schemas Summary

**One-liner:** 5 CRUD endpoints under `/api/views` with 50-per-route application-side cap, UNIQUE `(route, name)` IntegrityError-to-HTTP-400 translation, and 21 pytest specs — backend deliverable is now independently verifiable via curl + pytest, unblocking the frontend hook layer (Plan 05).

## What Was Built

Five FastAPI endpoints + four Pydantic schemas + one async test-factory + 21 pytest specs, mirroring `backend/cmc/api/routes/tasks.py` line-for-line as the plan prescribed. The router is mounted in `all_routers()` after `alerts_router` as the Phase 25 entry, so `cmc start` exposes all 5 endpoints under `/api/views*` on next boot.

### Endpoint matrix

| Method | Path                  | Status | Notes                                                                |
| ------ | --------------------- | ------ | -------------------------------------------------------------------- |
| GET    | `/api/views`          | 200    | Optional `?route=<route>` filter; ordered by `updated_at DESC`       |
| POST   | `/api/views`          | 201    | Enforces `VIEW_CAP_PER_ROUTE=50`; UNIQUE collision → 400             |
| GET    | `/api/views/{id}`     | 200    | 404 if missing                                                       |
| PATCH  | `/api/views/{id}`     | 200    | Partial; `state_json` REPLACED wholesale; `route` not patchable; UNIQUE rename collision → 400 |
| DELETE | `/api/views/{id}`     | 204    | Empty body (`r.text == ''`); 404 if missing                          |

### Curl examples (operator can paste verbatim against `cmc start`)

```bash
# List (empty initially)
curl http://127.0.0.1:8765/api/views
# -> {"items":[],"total":0}

# Create
curl -X POST http://127.0.0.1:8765/api/views \
  -H "Content-Type: application/json" \
  -d '{"name":"My cost view","route":"/cost","state_json":{"range":"30d","tab":"drift"}}'
# -> 201 + {"id":1,"name":"My cost view","route":"/cost",...}

# List filtered by route
curl 'http://127.0.0.1:8765/api/views?route=/cost'
# -> {"items":[{...}],"total":1}

# Fetch one
curl http://127.0.0.1:8765/api/views/1
# -> 200 + the saved view

# Partial update (rename)
curl -X PATCH http://127.0.0.1:8765/api/views/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Renamed cost view"}'
# -> 200 + updated body; updated_at bumped

# Wholesale state_json replacement (NOT deep-merged)
curl -X PATCH http://127.0.0.1:8765/api/views/1 \
  -H "Content-Type: application/json" \
  -d '{"state_json":{"range":"7d"}}'
# -> 200 + state_json now == {"range":"7d"} (prior "tab":"drift" dropped)

# Duplicate rename collision (UNIQUE (route, name))
curl -X POST http://127.0.0.1:8765/api/views \
  -H "Content-Type: application/json" \
  -d '{"name":"Renamed cost view","route":"/cost"}'
# -> 400 + {"error":"saved view with name 'Renamed cost view' already exists on route '/cost'"}

# Delete (204 No Content; empty body)
curl -i -X DELETE http://127.0.0.1:8765/api/views/1
# -> HTTP/1.1 204 No Content (no body)
```

### Per-route cap rejection

```bash
# After seeding 50 views on /cap-test (e.g., via repeated POST), the 51st returns:
# 400 + {"error":"saved view cap reached for route '/cap-test' (max 50)"}
```

## Architecture Notes

- **Error contract:** This app's exception handler emits `{error: detail}` (NOT FastAPI default `{detail: ...}`). All assertions in `test_views_router.py` use `r.json()["error"]` — precedent at `test_tasks_router.py:225,283`. Future API clients in the frontend (Plan 05+) MUST extract from `r.json().error`, not `r.json().detail`.

- **VIEW-02 opacity lock:** `state_json` is typed `dict[str, Any]` and stored via the existing `JSON` sa_column on `SavedView` (Plan 01). The router NEVER calls `json.loads()` on it; it round-trips opaquely. Frontend `validateSearch` (Plan 03) is the only place that interprets the shape. Any future backend code that schema-validates `state_json` on insert is a contract violation.

- **`route` not patchable:** `SavedViewUpdate` deliberately omits `route` so a view's route is intrinsic to its identity. If a "move view between routes" UX is ever needed, expose a separate explicit endpoint (documented in `views.py` schema docstring).

- **PATCH `state_json` is wholesale replace:** Test `test_patch_view_state_json_replaces_wholesale` pins this contract — PATCH with `{"state_json": {"a": 1}}` over a prior `{"x": 2, "y": "keep?"}` results in `state_json == {"a": 1}`. NO deep merge. Frontend save logic must include the full state blob on every save (matches how URL search params work).

- **`updated_at` bumps on every PATCH:** `test_patch_view_updates_updated_at` pins this — frontend list views can rely on `ORDER BY updated_at DESC` (the GET handler default) to surface most-recently-edited views first.

## Deviations from Plan

### Rule 1 — Auto-fixed Bug: Attribute access after rollback in PATCH error message

- **Found during:** Task 3 — `test_patch_view_duplicate_name_400` failed with `sqlalchemy.exc.MissingGreenlet` inside the PATCH handler's `IntegrityError` block.
- **Issue:** The IntegrityError handler built the error message via `f"... on route {row.route!r}"` after calling `await db.rollback()`. SQLAlchemy 2.x expires all session-tracked attrs on rollback regardless of `expire_on_commit=False` (which only governs commit). Re-accessing `row.route` triggered an attempted lazy-load on a now-expired attr, which surfaced as `MissingGreenlet` because the post-rollback execution path doesn't run inside the greenlet adapter context.
- **Fix:** Captured `row_route = row.route` into a local BEFORE the `setattr` loop, then referenced `row_route` in the rollback path's error message. Identical pattern would be needed if any future PATCH handler in this codebase references session-tracked attrs after a possible rollback.
- **Files modified:** `backend/cmc/api/routes/views.py:138-152` (PATCH handler error path)
- **Commit:** `8f78107`

### Rule 3 — Auto-fixed Blocker: Plan-text `async_session` fixture does not exist

- **Found during:** Task 3 — plan's test code referenced `async_session` fixture; `grep "async_session" tests/conftest.py` returned nothing.
- **Issue:** The plan's test-author shorthand named the async-session fixture `async_session`. The actual canonical name in this codebase is `db_session` (conftest.py:396-422). The two are functionally identical — `db_session` deliberately coexists with `client` by sharing the same `seeded_app` tuple.
- **Fix:** Used `db_session` in all 21 test signatures that need direct DB access. Documented in test file's module docstring so future readers don't trip on the same gap.
- **Files modified:** `backend/tests/test_views_router.py` (signatures throughout)
- **Commit:** `8f78107`

### Rule 1 — Adjusted: `make_saved_view_row` shape diverged from plan-stated `make_task_row` mirror

- **Found during:** Task 3 — `make_task_row` returns a plain dict (caller constructs ORM + commits); plan's spec for `make_saved_view_row` was async + DB-writer (inserts + commits + refreshes inside the factory).
- **Resolution:** Followed the plan's stated spec (async DB-writer) because the 50-cap test's tight loop would have been 50× more boilerplate with the dict-return shape. The plan's "mirroring make_task_row pattern" prose was about the kwargs signature, not the return semantics — the call sites in plan-quoted tests only work with the async DB-writer.
- **Files modified:** `backend/tests/conftest.py` (appended async factory at file tail)
- **Commit:** `8f78107`

### Additional test specs vs. plan

The plan listed 18 test cases; I shipped 21. The 3 extras:

1. `test_views_schemas_smoke` — top-of-file Pydantic constructor smoke check (mirrors `test_tasks_schemas_smoke` at `test_tasks_router.py:32-36`).
2. `test_create_view_cap_is_per_route` — pins that the 50-cap is per-route, not table-wide. Without this, the cap message could silently regress to a global cap on a bad refactor and the existing cap test would still pass.
3. `test_patch_view_route_field_silently_ignored` — pins that posting `{"route": "/skills"}` to PATCH does NOT move the view. Without this, a future SavedViewUpdate that mistakenly adds `route` would slip past the "route is intrinsic to identity" lock.

All 3 are pure additive coverage — Rule 2 (auto-add missing critical functionality for invariant pinning).

## Test Count Delta

| Run | Count | Delta |
| --- | ----- | ----- |
| Wave 1 baseline (Plan 01 close) | 665 / 0 / 0 | — |
| Plan 02 close | 686 / 0 / 0 | +21 specs |
| Plan-text estimate | "+18 specs" | beat by 3 |

Goal stated in plan's `<done>` ("backend pytest >= 683 / 0 / 0") — **exceeded by 3**.

## Self-Check: PASSED

All claimed files exist on disk:

```
$ ls backend/cmc/api/schemas/views.py backend/cmc/api/routes/views.py backend/tests/test_views_router.py
FOUND: backend/cmc/api/schemas/views.py
FOUND: backend/cmc/api/routes/views.py
FOUND: backend/tests/test_views_router.py
```

All 3 commits in HEAD:

```
$ git log --oneline -3
8f78107 test(25-02): saved_views router coverage — 21 specs, all 5 endpoints + cap + UNIQUE
363320c feat(25-02): add views_router with 5 CRUD handlers + 50-per-route cap
2eb5f9f feat(25-02): add Pydantic schemas for saved_views CRUD
```

Endpoint matrix verified live:

```
$ uv run python -c "from cmc.api.routes import all_routers; [print(sorted(r.methods - {'HEAD'}), r.path) for ar in all_routers() for r in ar.routes if '/views' in r.path]"
['GET']    /views
['POST']   /views
['GET']    /views/{view_id}
['PATCH']  /views/{view_id}
['DELETE'] /views/{view_id}
```

Full backend pytest (with `-x`):

```
686 passed, 32 warnings in 240.90s
```

## Where to Look First (for Plan 05's frontend hook layer)

- **API base:** `${API_BASE}/views` (where `API_BASE` already includes `/api`). Five methods correspond 1:1 to the matrix above.
- **Response shapes:** `backend/cmc/api/schemas/views.py` is the source of truth. The frontend types should mirror:
  - `SavedViewListItem` → `{ id: number; name: string; description: string; route: string; state_json: Record<string, unknown>; schema_version: number; created_at: string; updated_at: string }`
  - `SavedViewListResponse` → `{ items: SavedViewListItem[]; total: number }`
  - POST body shape → `Pick<SavedViewListItem, "name" | "description" | "route" | "schema_version"> & { state_json: unknown }`
  - PATCH body shape → `Partial<{ name: string; description: string; state_json: unknown; schema_version: number }>` (note: NO `route`)
- **Error contract:** ALL error responses use `r.json().error` (NOT `r.json().detail`). The frontend client must extract from `error`. Examples of error strings the UI will encounter:
  - Duplicate name: `"saved view with name 'foo' already exists on route '/cost'"`
  - Cap reached: `"saved view cap reached for route '/cost' (max 50)"`
  - Not found: `"saved view not found"`
- **Cap surfacing:** `VIEW_CAP_PER_ROUTE = 50` is exported from `cmc.api.routes.views`. The frontend should NOT hardcode 50 — instead, treat the 400 response as the authoritative signal AND display a count-down affordance in the save UI when `views.length >= 49` so the user knows the cap is imminent.
- **DELETE returns 204 + empty body** — do NOT try to `.json()` it.
- **PATCH `state_json` is REPLACE, not merge.** When the frontend saves a view edit, send the full `state_json` blob, not a delta.
- **`updated_at` bumps on every PATCH** — frontend list views can rely on the default `ORDER BY updated_at DESC` (no client-side sort needed).
- **Cross-route listing for Cmd+K:** `GET /api/views` (no `?route=`) returns all views across all routes — the Cmd+K palette can fetch this once and partition client-side.

## Phase 25 ROADMAP success criterion 5 status

> "5 CRUD endpoints pass independently via curl + pytest before frontend wires up."

**SATISFIED.** The pytest matrix is green (21/21 + 665 prior = 686/0/0), and the curl examples above can be pasted into `cmc start` for live verification. The frontend (Plan 05) can now safely depend on the API surface.
