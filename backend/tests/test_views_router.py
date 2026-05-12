"""Saved-views router tests — Phase 25 / VIEW-03.

Covers all 5 CRUD endpoints + cap + UNIQUE rejection. Mirrors test_tasks_router.py
shape exactly:
  - r.json()["error"] (NOT "detail") — the app handler emits {error: ...}.
  - r.text == "" on 204 responses (calling r.json() on a 204 raises).
  - tz-naive UTC datetimes returned by now_utc serialize cleanly via UTCDatetime.

Fixtures used: `client` (HTTP), `db_session` (async session for direct seeding
inside the same lifespan-active app). The plan referenced an `async_session`
fixture that does not exist in this codebase; `db_session` is its functional
equivalent (see conftest.py:396-422 — `db_session` deliberately coexists with
`client` by sharing the same `seeded_app` tuple).
"""

import pytest

from cmc.api.routes.views import VIEW_CAP_PER_ROUTE
from cmc.api.schemas.views import SavedViewCreate
from cmc.db.models.saved_views import SavedView

from .conftest import make_saved_view_row

# ---------- Schema smoke ----------


def test_views_schemas_smoke():
    v = SavedViewCreate(name="hello", route="/")
    assert v.name == "hello"
    assert v.route == "/"
    assert v.state_json == {}
    assert v.schema_version == 1


# ---------- GET /api/views — list ----------


@pytest.mark.asyncio
async def test_list_views_empty_route_filter(client, db_session) -> None:
    """GET /api/views (no route=) returns ALL views across all routes."""
    await make_saved_view_row(db_session, name="v-root", route="/")
    await make_saved_view_row(db_session, name="v-cost", route="/cost")
    await make_saved_view_row(db_session, name="v-skills", route="/skills")

    r = await client.get("/api/views")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 3
    routes = sorted(it["route"] for it in body["items"])
    assert routes == ["/", "/cost", "/skills"]


@pytest.mark.asyncio
async def test_list_views_route_filter(client, db_session) -> None:
    """GET /api/views?route=/cost returns only that route's views."""
    await make_saved_view_row(db_session, name="v-root", route="/")
    await make_saved_view_row(db_session, name="v-cost-a", route="/cost")
    await make_saved_view_row(db_session, name="v-cost-b", route="/cost")

    r = await client.get("/api/views?route=/cost")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2
    assert {it["name"] for it in body["items"]} == {"v-cost-a", "v-cost-b"}
    assert all(it["route"] == "/cost" for it in body["items"])


@pytest.mark.asyncio
async def test_list_views_orders_by_updated_at_desc(client, db_session) -> None:
    """GET /api/views returns rows in updated_at DESC order."""
    from datetime import timedelta

    from cmc.core.time import now_utc

    base = now_utc()
    # Seed three rows with deterministic updated_at via direct manipulation
    # after the factory's now_utc() stamp.
    a = await make_saved_view_row(db_session, name="oldest", route="/")
    b = await make_saved_view_row(db_session, name="middle", route="/")
    c = await make_saved_view_row(db_session, name="newest", route="/")

    a.updated_at = base - timedelta(hours=3)
    b.updated_at = base - timedelta(hours=2)
    c.updated_at = base - timedelta(hours=1)
    await db_session.commit()

    r = await client.get("/api/views")
    assert r.status_code == 200, r.text
    names = [it["name"] for it in r.json()["items"]]
    assert names == ["newest", "middle", "oldest"]


# ---------- POST /api/views — create ----------


@pytest.mark.asyncio
async def test_create_view_201(client) -> None:
    """POST /api/views with full payload -> 201 + SavedViewListItem body."""
    payload = {
        "name": "My cost overview",
        "description": "30d / drift",
        "route": "/cost",
        "state_json": {"range": "30d", "tab": "drift"},
        "schema_version": 1,
    }
    r = await client.post("/api/views", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "My cost overview"
    assert body["description"] == "30d / drift"
    assert body["route"] == "/cost"
    assert body["state_json"] == {"range": "30d", "tab": "drift"}
    assert body["schema_version"] == 1
    assert isinstance(body["id"], int)
    assert body["created_at"] is not None
    assert body["updated_at"] is not None


@pytest.mark.asyncio
async def test_create_view_uses_now_utc_for_timestamps(client) -> None:
    """On insert, created_at == updated_at (both stamped from a single now_utc())."""
    r = await client.post(
        "/api/views",
        json={"name": "ts-check", "route": "/"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["created_at"] == body["updated_at"]


@pytest.mark.asyncio
async def test_create_view_default_schema_version_1(client) -> None:
    """Absent schema_version on POST -> defaults to 1."""
    r = await client.post(
        "/api/views",
        json={"name": "no-version", "route": "/"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["schema_version"] == 1


@pytest.mark.asyncio
async def test_create_view_duplicate_name_same_route_400(client) -> None:
    """Second POST with same (route, name) -> 400 via UNIQUE constraint."""
    payload = {"name": "dupe", "route": "/cost"}
    r1 = await client.post("/api/views", json=payload)
    assert r1.status_code == 201, r1.text

    r2 = await client.post("/api/views", json=payload)
    assert r2.status_code == 400, r2.text
    assert "already exists" in r2.json()["error"].lower()


@pytest.mark.asyncio
async def test_create_view_duplicate_name_different_route_ok(client) -> None:
    """Same name on a different route is allowed (UNIQUE is on (route, name))."""
    r1 = await client.post("/api/views", json={"name": "default", "route": "/cost"})
    assert r1.status_code == 201, r1.text

    r2 = await client.post("/api/views", json={"name": "default", "route": "/skills"})
    assert r2.status_code == 201, r2.text


@pytest.mark.asyncio
async def test_create_view_enforces_50_cap(client, db_session) -> None:
    """Seed 50 rows on route="/cap-test"; the 51st POST returns 400."""
    for i in range(VIEW_CAP_PER_ROUTE):
        await make_saved_view_row(db_session, name=f"v{i}", route="/cap-test")

    r = await client.post("/api/views", json={"name": "v50", "route": "/cap-test"})
    assert r.status_code == 400, r.text
    err = r.json()["error"].lower()
    assert "cap reached" in err
    assert "/cap-test" in err
    assert str(VIEW_CAP_PER_ROUTE) in err


@pytest.mark.asyncio
async def test_create_view_cap_is_per_route(client, db_session) -> None:
    """50 views on /cap-test does NOT block insertion on a different route."""
    for i in range(VIEW_CAP_PER_ROUTE):
        await make_saved_view_row(db_session, name=f"v{i}", route="/cap-test")

    r = await client.post("/api/views", json={"name": "other", "route": "/different"})
    assert r.status_code == 201, r.text


# ---------- GET /api/views/{id} — fetch single ----------


@pytest.mark.asyncio
async def test_get_view_200(client, db_session) -> None:
    row = await make_saved_view_row(
        db_session,
        name="single",
        route="/skills",
        state_json={"range": "14d"},
    )

    r = await client.get(f"/api/views/{row.id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == row.id
    assert body["name"] == "single"
    assert body["route"] == "/skills"
    assert body["state_json"] == {"range": "14d"}


@pytest.mark.asyncio
async def test_get_view_404_when_missing(client) -> None:
    r = await client.get("/api/views/999999")
    assert r.status_code == 404
    assert r.json()["error"] == "saved view not found"


# ---------- PATCH /api/views/{id} — partial update ----------


@pytest.mark.asyncio
async def test_patch_view_partial_name(client, db_session) -> None:
    """PATCH only `name` — description / state_json / route untouched."""
    row = await make_saved_view_row(
        db_session,
        name="before",
        description="orig",
        route="/cost",
        state_json={"range": "30d"},
    )

    r = await client.patch(f"/api/views/{row.id}", json={"name": "after"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "after"
    assert body["description"] == "orig"
    assert body["route"] == "/cost"  # untouched (and not in SavedViewUpdate)
    assert body["state_json"] == {"range": "30d"}


@pytest.mark.asyncio
async def test_patch_view_state_json_replaces_wholesale(client, db_session) -> None:
    """PATCH state_json={"a":1} fully REPLACES the prior {"x":2} (no deep merge)."""
    row = await make_saved_view_row(
        db_session,
        name="rep",
        route="/",
        state_json={"x": 2, "y": "keep?"},
    )

    r = await client.patch(
        f"/api/views/{row.id}",
        json={"state_json": {"a": 1}},
    )
    assert r.status_code == 200, r.text
    assert r.json()["state_json"] == {"a": 1}  # NOT {"x": 2, "y": "keep?", "a": 1}


@pytest.mark.asyncio
async def test_patch_view_updates_updated_at(client, db_session) -> None:
    """updated_at bumps on patch; created_at does not change."""
    from datetime import datetime

    row = await make_saved_view_row(db_session, name="ts", route="/")
    created_before = row.created_at
    updated_before = row.updated_at

    r = await client.patch(f"/api/views/{row.id}", json={"description": "new"})
    assert r.status_code == 200, r.text
    body = r.json()

    # created_at unchanged
    created_after = datetime.fromisoformat(body["created_at"])
    assert created_after.replace(tzinfo=None) == created_before.replace(tzinfo=None)

    # updated_at advanced (or at minimum equal — clock resolution edge case)
    updated_after = datetime.fromisoformat(body["updated_at"])
    assert updated_after.replace(tzinfo=None) >= updated_before.replace(tzinfo=None)


@pytest.mark.asyncio
async def test_patch_view_404(client) -> None:
    r = await client.patch("/api/views/999999", json={"name": "new"})
    assert r.status_code == 404
    assert r.json()["error"] == "saved view not found"


@pytest.mark.asyncio
async def test_patch_view_duplicate_name_400(client, db_session) -> None:
    """Renaming view-A to view-B's name on the SAME route -> 400."""
    a = await make_saved_view_row(db_session, name="alpha", route="/cost")
    b = await make_saved_view_row(db_session, name="beta", route="/cost")

    r = await client.patch(f"/api/views/{a.id}", json={"name": "beta"})
    assert r.status_code == 400, r.text
    assert "already exists" in r.json()["error"].lower()

    # Sanity: b is unchanged, a is unchanged
    assert b.name == "beta"


@pytest.mark.asyncio
async def test_patch_view_route_field_silently_ignored(client, db_session) -> None:
    """`route` is NOT in SavedViewUpdate. A request body that includes it
    should not move the view between routes (Pydantic drops unknown fields
    when ConfigDict allows them; SavedViewUpdate omits route so it never
    hits the setattr loop)."""
    row = await make_saved_view_row(db_session, name="locked", route="/cost")

    r = await client.patch(
        f"/api/views/{row.id}",
        json={"route": "/skills", "name": "renamed"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["route"] == "/cost"  # NOT moved
    assert r.json()["name"] == "renamed"


# ---------- DELETE /api/views/{id} ----------


@pytest.mark.asyncio
async def test_delete_view_204(client, db_session) -> None:
    """DELETE -> 204 (empty body); DB row gone."""
    from sqlalchemy import select as _sel

    row = await make_saved_view_row(db_session, name="goner", route="/")
    row_id = row.id

    r = await client.delete(f"/api/views/{row_id}")
    assert r.status_code == 204, r.text
    assert r.text == ""  # 204 -> no body (calling r.json() would raise)

    # Verify gone from DB. Use a fresh sessionmaker to avoid stale identity-map.
    sessionmaker = client._transport.app.state.sessions
    async with sessionmaker() as db:
        gone = (
            await db.execute(_sel(SavedView).where(SavedView.id == row_id))
        ).scalar_one_or_none()
        assert gone is None


@pytest.mark.asyncio
async def test_delete_view_404(client) -> None:
    r = await client.delete("/api/views/999999")
    assert r.status_code == 404
    assert r.json()["error"] == "saved view not found"
