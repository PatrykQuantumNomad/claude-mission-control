---
phase: 25-saved-views-backend-frontend
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - backend/cmc/api/schemas/views.py
  - backend/cmc/api/routes/views.py
  - backend/cmc/api/routes/__init__.py
  - backend/tests/conftest.py
  - backend/tests/test_views_router.py
autonomous: true

must_haves:
  truths:
    - "GET /api/views?route=<route> returns route-filtered views ordered by updated_at desc"
    - "GET /api/views (no route= arg) returns all views across all routes (for Cmd+K cross-route surfacing)"
    - "POST /api/views creates a view; second POST on same (route, name) returns 400/409 due to UNIQUE constraint"
    - "POST /api/views returns 400 when the 51st view on a route is attempted (cap enforcement)"
    - "GET /api/views/{id} returns the view or 404"
    - "PATCH /api/views/{id} accepts partial updates; state_json replaced wholesale; route is NOT patchable"
    - "DELETE /api/views/{id} returns 204 No Content"
    - "Error responses use the app's {error: detail} shape, not FastAPI default {detail: ...}"
  artifacts:
    - path: "backend/cmc/api/schemas/views.py"
      provides: "SavedViewCreate, SavedViewUpdate, SavedViewListItem, SavedViewListResponse"
      contains: "class SavedViewCreate"
    - path: "backend/cmc/api/routes/views.py"
      provides: "5 handlers: list/create/get/patch/delete + VIEW_CAP_PER_ROUTE constant"
      contains: "VIEW_CAP_PER_ROUTE = 50"
    - path: "backend/tests/test_views_router.py"
      provides: "pytest coverage for all 5 endpoints + 50-cap + UNIQUE rejection + 204 body"
      contains: "test_post_views_enforces_cap"
    - path: "backend/cmc/api/routes/__init__.py"
      provides: "views_router registered in all_routers()"
      contains: "views_router"
  key_links:
    - from: "backend/cmc/api/routes/__init__.py"
      to: "backend/cmc/api/routes/views.py"
      via: "router import + appended to all_routers() return list"
      pattern: "views_router"
    - from: "backend/cmc/api/routes/views.py"
      to: "backend/cmc/db/models/saved_views.py (Plan 01)"
      via: "SQLAlchemy select() against SavedView"
      pattern: "select\\(SavedView\\)"
    - from: "backend/tests/test_views_router.py"
      to: "backend/tests/conftest.py make_saved_view_row factory"
      via: "factory call to seed DB rows directly"
      pattern: "make_saved_view_row"
---

<objective>
Ship the 5 CRUD endpoints + Pydantic schemas + pytest coverage for the `saved_views` table (VIEW-03). Mirror `tasks.py` exactly — this is mechanical surface duplication. 50-per-route cap enforced application-side in POST handler per Research Pitfall 5.

This plan completes Wave 1's backend deliverable. Per ROADMAP Phase 25 success criterion 5, the 5 CRUD endpoints MUST pass independently via curl + pytest BEFORE the frontend wires up.

Purpose: Independently verifiable backend surface for saved-view CRUD. Opaque `state_json` (no shape validation), 50-cap, optional `route` filter on list (Research OQ#2 / OQ#5 recommendation), UNIQUE `(route, name)` rejection.
Output: `views_router` mounted under `/api`. Operator can curl all 5 endpoints; full pytest matrix green.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md
@.planning/phases/25-saved-views-backend-frontend/25-01-SUMMARY.md

# Reference shapes — mirror line-for-line
@backend/cmc/api/routes/tasks.py
@backend/cmc/api/schemas/tasks.py
@backend/cmc/api/schemas/common.py
@backend/cmc/api/routes/__init__.py
@backend/cmc/db/session.py
@backend/cmc/db/models/saved_views.py
@backend/tests/conftest.py
@backend/tests/test_tasks_router.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Pydantic schemas for saved_views CRUD</name>
  <files>backend/cmc/api/schemas/views.py</files>
  <action>
Create `backend/cmc/api/schemas/views.py` mirroring `backend/cmc/api/schemas/tasks.py:1-101` shape.

EXACT contents:

```python
"""Pydantic schemas for saved_views CRUD.

Phase 25 / VIEW-03. state_json is intentionally `dict[str, Any]` — opaque to
the backend, validated client-side via the route's validateSearch on read
(VIEW-02 lock).
"""
from typing import Any

from pydantic import BaseModel, Field

from cmc.api.schemas.common import ORMBase, UTCDatetime


class SavedViewListItem(ORMBase):
    id: int
    name: str
    description: str
    route: str
    state_json: dict[str, Any]
    schema_version: int
    created_at: UTCDatetime
    updated_at: UTCDatetime


class SavedViewListResponse(BaseModel):
    items: list[SavedViewListItem]
    total: int


class SavedViewCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    route: str = Field(min_length=1, max_length=200)
    state_json: dict[str, Any] = Field(default_factory=dict)
    schema_version: int = Field(default=1, ge=1)


class SavedViewUpdate(BaseModel):
    """All fields optional. state_json is REPLACED WHOLESALE, NOT deep-merged.

    NOTE: `route` is deliberately NOT patchable — a view's route is intrinsic
    to its identity; renaming would silently move it between menu lists. If
    "move route" becomes a UX, expose a separate explicit endpoint.
    """
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    state_json: dict[str, Any] | None = None
    schema_version: int | None = Field(default=None, ge=1)
```

IMPORTANT:
- `ORMBase` and `UTCDatetime` come from `cmc.api.schemas.common` — verify imports exist (read `common.py` first if uncertain).
- `state_json` uses `dict[str, Any]` — opaque per VIEW-02. Do NOT add per-route Pydantic shape validation.
- `name` is `max_length=200` (matches the model definition's intent; Pydantic-level guard).
- `SavedViewUpdate` excludes `route` to lock view-to-route identity.
  </action>
  <verify>
`cd backend && uv run python -c "from cmc.api.schemas.views import SavedViewCreate, SavedViewUpdate, SavedViewListItem, SavedViewListResponse; print(SavedViewCreate.model_fields.keys())"` prints `dict_keys(['name', 'description', 'route', 'state_json', 'schema_version'])`.
  </verify>
  <done>
All 4 schemas importable; field names match the spec; `SavedViewUpdate` has NO `route` field.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create views router with 5 handlers + 50-cap, mount in all_routers</name>
  <files>backend/cmc/api/routes/views.py, backend/cmc/api/routes/__init__.py</files>
  <action>
Create `backend/cmc/api/routes/views.py` mirroring `backend/cmc/api/routes/tasks.py:1-294` end-to-end. Five handlers: list / create / get / patch / delete.

Key decisions baked in (from Research §Pattern 3 + Open Questions):
- `route=` is OPTIONAL on GET /api/views (OQ#5 recommendation — supports Cmd+K cross-route surfacing).
- 50-per-route cap enforced in POST handler (OQ#1 + Pitfall 5 — single-user, local; no SQLite triggers).
- UNIQUE `(route, name)` collision returns 400 with `error` message; SQLAlchemy IntegrityError caught and re-raised as HTTPException.
- 204 No Content on DELETE (matches `tasks.py` precedent + test_tasks_router.py:236-237 contract).

EXACT contents:

```python
"""Saved-views CRUD router.

Phase 25 / VIEW-03. Mirrors backend/cmc/api/routes/tasks.py end-to-end.
state_json is stored opaquely (no shape validation backend-side per VIEW-02).
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.views import (
    SavedViewCreate,
    SavedViewListItem,
    SavedViewListResponse,
    SavedViewUpdate,
)
from cmc.core.time import now_utc
from cmc.db import get_session
from cmc.db.models.saved_views import SavedView

router = APIRouter(tags=["views"])

VIEW_CAP_PER_ROUTE = 50
"""Per-route cap on saved views. Enforced application-side in the POST handler.
ROADMAP.md Phase 25 success criterion 5; REQUIREMENTS.md milestone summary.
Single-user local product; race window is academic (Research Pitfall 5)."""


@router.get("/views", response_model=SavedViewListResponse)
async def list_views(
    route: str | None = Query(default=None, max_length=200),
    db: AsyncSession = Depends(get_session),
) -> SavedViewListResponse:
    q = select(SavedView).order_by(SavedView.updated_at.desc())
    if route is not None:
        q = q.where(SavedView.route == route)
    rows = (await db.execute(q)).scalars().all()
    return SavedViewListResponse(
        items=[SavedViewListItem.model_validate(r) for r in rows],
        total=len(rows),
    )


@router.post("/views", response_model=SavedViewListItem, status_code=201)
async def create_view(
    payload: SavedViewCreate,
    db: AsyncSession = Depends(get_session),
) -> SavedViewListItem:
    # 50-per-route cap (Pitfall 5: count-then-insert race acceptable in single-user)
    existing_count = (
        await db.execute(
            select(func.count(SavedView.id)).where(SavedView.route == payload.route)
        )
    ).scalar_one()
    if existing_count >= VIEW_CAP_PER_ROUTE:
        raise HTTPException(
            status_code=400,
            detail=f"saved view cap reached for route {payload.route!r} (max {VIEW_CAP_PER_ROUTE})",
        )

    now = now_utc()
    view = SavedView(
        **payload.model_dump(),
        created_at=now,
        updated_at=now,
    )
    db.add(view)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        # UNIQUE (route, name) collision
        raise HTTPException(
            status_code=400,
            detail=f"saved view with name {payload.name!r} already exists on route {payload.route!r}",
        ) from exc
    await db.refresh(view)
    return SavedViewListItem.model_validate(view)


@router.get("/views/{view_id}", response_model=SavedViewListItem)
async def get_view(view_id: int, db: AsyncSession = Depends(get_session)) -> SavedViewListItem:
    row = (
        await db.execute(select(SavedView).where(SavedView.id == view_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="saved view not found")
    return SavedViewListItem.model_validate(row)


@router.patch("/views/{view_id}", response_model=SavedViewListItem)
async def patch_view(
    view_id: int,
    payload: SavedViewUpdate,
    db: AsyncSession = Depends(get_session),
) -> SavedViewListItem:
    row = (
        await db.execute(select(SavedView).where(SavedView.id == view_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="saved view not found")

    updates = payload.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(row, k, v)
    row.updated_at = now_utc()
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"saved view name {payload.name!r} already exists on route {row.route!r}",
        ) from exc
    await db.refresh(row)
    return SavedViewListItem.model_validate(row)


@router.delete("/views/{view_id}", status_code=204)
async def delete_view(view_id: int, db: AsyncSession = Depends(get_session)) -> Response:
    row = (
        await db.execute(select(SavedView).where(SavedView.id == view_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="saved view not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)
```

Then mount in `backend/cmc/api/routes/__init__.py`:
1. Add `from cmc.api.routes.views import router as views_router` (alphabetical near other imports).
2. Append `views_router` to the list returned by `all_routers()` (preserve alphabetical / topical ordering used elsewhere in the file).

Read `backend/cmc/api/routes/__init__.py:36-57` first to see the exact existing ordering convention.

IMPORTANT:
- Use `now_utc()` from `cmc.core.time` — locked invariant.
- Catch `IntegrityError` in BOTH POST and PATCH (PATCH can hit UNIQUE collision when renaming).
- The app's exception handler emits `{error: detail}`, NOT FastAPI default `{detail: ...}` — Plan 03 tests must use `r.json()["error"]` (precedent: `test_tasks_router.py:225,283`).
  </action>
  <verify>
`cd backend && uv run python -c "from cmc.api.routes.views import router; print([r.path for r in router.routes])"` lists `/views`, `/views/{view_id}` (twice for GET/PATCH/DELETE), etc. `cd backend && uv run python -c "from cmc.api.routes import all_routers; assert any('/views' in r.path for router in all_routers() for r in router.routes); print('mounted')"` prints `mounted`.
  </verify>
  <done>
Five handlers defined; router mounted in `all_routers()`; importable cleanly; `now_utc` used (not `datetime.utcnow`).
  </done>
</task>

<task type="auto">
  <name>Task 3: Add make_saved_view_row factory + full router pytest coverage</name>
  <files>backend/tests/conftest.py, backend/tests/test_views_router.py</files>
  <action>
First, extend `backend/tests/conftest.py` with a `make_saved_view_row` factory mirroring `make_task_row` (existing at `conftest.py:641-690`). Read that section first to match shape.

Add this factory function at the end of `conftest.py`:

```python
async def make_saved_view_row(
    session,
    *,
    name: str = "Test view",
    description: str = "",
    route: str = "/",
    state_json: dict | None = None,
    schema_version: int = 1,
) -> "SavedView":
    """Factory for direct-DB seeding of saved_views rows in tests.

    Mirrors make_task_row pattern at conftest.py:641-690.
    """
    from cmc.db.models.saved_views import SavedView
    now = now_utc()
    row = SavedView(
        name=name,
        description=description,
        route=route,
        state_json=state_json or {},
        schema_version=schema_version,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row
```

Then create `backend/tests/test_views_router.py` covering all 5 endpoints + edge cases. Use `test_tasks_router.py:1-413` as the line-for-line shape reference (fixtures, helpers, assertion conventions).

Required test cases (one per scenario; mirror naming from test_tasks_router.py):

```
test_list_views_empty_route_filter         # GET /api/views (no route=) returns ALL views
test_list_views_route_filter                # GET /api/views?route=/cost returns only that route's
test_list_views_orders_by_updated_at_desc   # asserts ordering
test_create_view_201                        # happy path; returns 201 + body
test_create_view_uses_now_utc_for_timestamps  # asserts created_at == updated_at on insert
test_create_view_default_schema_version_1   # absent schema_version -> 1
test_create_view_duplicate_name_same_route_400  # UNIQUE rejection; r.json()["error"] contains "already exists"
test_create_view_duplicate_name_different_route_ok  # same name on different route is allowed
test_create_view_enforces_50_cap            # seed 50 rows on route="/test", 51st POST -> 400 with cap message
test_get_view_404_when_missing              # r.status_code == 404; r.json()["error"] == "saved view not found"
test_get_view_200                           # happy path
test_patch_view_partial_name                # PATCH only name; description/state_json unchanged
test_patch_view_state_json_replaces_wholesale  # PATCH state_json={"a":1} overwrites prior {"x":2}
test_patch_view_404                         # missing id
test_patch_view_updates_updated_at          # updated_at changes; created_at does not
test_patch_view_duplicate_name_400          # renaming to a sibling's name on same route rejects
test_delete_view_204                        # status 204; r.text == "" (precedent: test_tasks_router.py:236-237)
test_delete_view_404                        # missing id
```

For the 50-cap test, use a tight loop to seed 50 rows then POST the 51st:

```python
async def test_create_view_enforces_50_cap(client, async_session):
    for i in range(50):
        await make_saved_view_row(async_session, name=f"v{i}", route="/cap-test")
    r = await client.post("/api/views", json={"name": "v50", "route": "/cap-test"})
    assert r.status_code == 400
    assert "cap reached" in r.json()["error"].lower()
```

IMPORTANT:
- Use `r.json()["error"]` NOT `r.json()["detail"]` — precedent at `test_tasks_router.py:225,283`. The app's exception handler rewrites the key.
- Use `r.text == ""` to assert empty 204 body — precedent at `test_tasks_router.py:236-237`. Calling `r.json()` on a 204 raises.
- All tests are `async def` and use the existing `client` + `async_session` fixtures from `conftest.py`.
- Use `uv run pytest` (system python is 3.11.7; backend requires 3.13 per STATE.md).
  </action>
  <verify>
`cd backend && uv run pytest tests/test_views_router.py -v` shows all ~18 tests passing. `cd backend && uv run pytest -x` reports >= 683 passed / 0 failed (was 665 after Plan 01; +18 here). Manual curl smoke (operator runs `cmc start` then `curl -X POST http://127.0.0.1:8765/api/views -H "Content-Type: application/json" -d '{"name":"smoke","route":"/"}'` returns 201; `curl http://127.0.0.1:8765/api/views?route=/` returns the smoke view).
  </verify>
  <done>
All test_views_router.py cases pass; backend pytest >= 683 / 0 / 0 total; manual curl roundtrip on `cmc start` succeeds for all 5 endpoints. Backend deliverable is independently testable; frontend (Waves 2–4) can now begin.
  </done>
</task>

</tasks>

<verification>
1. `cd backend && uv run pytest -x` — full suite green; expected 683+ / 0 / 0 (was 663 at Phase 24 close; +2 from Plan 01 migration tests; +~18 here).
2. `cd backend && uv run pytest tests/test_views_router.py -v` — all 18+ cases pass.
3. Manual curl matrix (operator runs against live `cmc start`):
   - `curl http://127.0.0.1:8765/api/views` → `{"items":[],"total":0}` initially.
   - `curl -X POST http://127.0.0.1:8765/api/views -H "Content-Type: application/json" -d '{"name":"my view","route":"/","state_json":{"x":1}}'` → 201 + body.
   - `curl http://127.0.0.1:8765/api/views?route=/` → 1 item.
   - `curl http://127.0.0.1:8765/api/views/1` → that item.
   - `curl -X PATCH http://127.0.0.1:8765/api/views/1 -H "Content-Type: application/json" -d '{"name":"renamed"}'` → 200 + updated.
   - `curl -X DELETE -i http://127.0.0.1:8765/api/views/1` → 204 No Content, no body.
4. `pnpm tsc --noEmit` + frontend vitest still clean (no frontend touched).
5. ROADMAP Phase 25 success criterion 5 ("5 CRUD endpoints pass independently via curl + pytest before frontend wires") is SATISFIED at this point.
</verification>

<success_criteria>
- All 5 endpoints round-trip successfully via curl AND pytest.
- 50-per-route cap rejects the 51st POST on the same route.
- UNIQUE `(route, name)` rejection returns 400 with informative `error` field.
- Cross-route surfacing supported: `GET /api/views` (no route=) returns all views.
- Backend pytest count >= 683 / 0 / 0.
- The frontend can now safely depend on this API surface (Waves 2–4 unblocked).
</success_criteria>

<output>
After completion, create `.planning/phases/25-saved-views-backend-frontend/25-02-SUMMARY.md` documenting:
- Final endpoint paths + status codes
- pytest count delta (e.g. "665 → 683, +18 tests")
- Curl examples that operator can paste into terminal
- Any deviation from research (e.g. if IntegrityError wrap pattern differs)
- "Where to look first" hint for Plan 05's frontend client (e.g. "API client should call `${API_BASE}/views`; types live in backend/cmc/api/schemas/views.py")
</output>
