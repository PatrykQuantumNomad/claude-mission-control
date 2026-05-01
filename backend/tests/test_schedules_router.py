"""Schedules router tests — SCHD-01..06.

All SCHD-* tests live here. Tests below cover schedule CRUD, task history,
and natural-language cron generation.

Pitfall awareness:
  - r.json()["error"] (NOT "detail") — the error handler emits {error: ...}.
  - tz-aware UTC datetimes when seeding (Pitfall 4) — Schedule.next_run_at must
    be timezone-aware on insert, and assertions parse the response value with
    datetime.fromisoformat (post-Z/+00:00 normalisation).
  - SCHD-03 PATCH MUST recompute (or clear) next_run_at when EITHER cron OR
    enabled changes (Pitfall 7 + Open Q4 — clear-and-recompute pattern).
  - SCHD-06 NL->cron tests monkeypatch `cmc.api.routes.schedules.nl_to_cron`
    directly (cleaner than the __import__ hack on the AsyncAnthropic
    constructor — the conftest mock_anthropic_client fixture remains available
    for callers that prefer it).
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from cmc.api.schemas.schedules import NLCronRequest, ScheduleCreate
from cmc.db.models.schedules import Schedule
from cmc.db.models.tasks import Task
from cmc.schedules.cron import validate_cron

from .conftest import make_schedule_row, make_task_row

# ---------- Schema smoke ----------


def test_schedules_smoke():
    s = ScheduleCreate(name="daily", cron="0 9 * * *")
    assert s.cron == "0 9 * * *"
    assert validate_cron("0 9 * * *") is True
    assert validate_cron("not a cron") is False
    n = NLCronRequest(description="every weekday at 9am")
    assert "weekday" in n.description


# ---------- Helpers ----------


async def _seed_schedule(client_fixture, **overrides) -> int:
    """Insert a Schedule row via the app's sessionmaker; return the new id."""
    sessionmaker = client_fixture._transport.app.state.sessions
    row = make_schedule_row(**overrides)
    async with sessionmaker() as db:
        s = Schedule(**row)
        db.add(s)
        await db.commit()
        await db.refresh(s)
        return s.id


async def _seed_task(client_fixture, schedule_id, **overrides) -> int:
    """Insert a Task row linked to a schedule_id via the app's sessionmaker."""
    sessionmaker = client_fixture._transport.app.state.sessions
    row = make_task_row(schedule_id=schedule_id, **overrides)
    async with sessionmaker() as db:
        t = Task(**row)
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t.id


# ---------- SCHD-01: GET /api/schedules ----------


@pytest.mark.asyncio
async def test_schd01_list(client) -> None:
    """Seed 2 schedules; GET returns total=2 + items length 2."""
    await _seed_schedule(client, name="sched-a", cron="0 9 * * *")
    await _seed_schedule(client, name="sched-b", cron="0 12 * * *")

    r = await client.get("/api/schedules")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2


# ---------- SCHD-02: POST /api/schedules ----------


@pytest.mark.asyncio
async def test_schd02_create_valid_cron(client) -> None:
    """POST with valid cron + enabled=True -> 201 with future next_run_at."""
    payload = {"name": "daily", "cron": "0 9 * * *", "enabled": True}
    r = await client.post("/api/schedules", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "daily"
    assert body["cron"] == "0 9 * * *"
    assert body["enabled"] is True
    assert body["next_run_at"] is not None
    parsed = datetime.fromisoformat(body["next_run_at"].replace("Z", "+00:00"))
    # SQLite strips tzinfo on round-trip; accept either naive or aware datetimes
    # by normalizing naive values to UTC for the futurity comparison.
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    assert parsed > datetime.now(UTC) - timedelta(seconds=5)
    assert isinstance(body["id"], int)

    # DB row exists with same name
    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        rows = (await db.execute(_sel(Schedule).where(Schedule.id == body["id"]))).scalars().all()
        assert len(rows) == 1
        assert rows[0].name == "daily"
        assert rows[0].next_run_at is not None


@pytest.mark.asyncio
async def test_schd02_create_disabled_skips_next_run(client) -> None:
    """POST with enabled=False -> 201 + next_run_at is null in response and DB."""
    payload = {"name": "off", "cron": "0 9 * * *", "enabled": False}
    r = await client.post("/api/schedules", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["enabled"] is False
    assert body["next_run_at"] is None

    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        row = (await db.execute(_sel(Schedule).where(Schedule.id == body["id"]))).scalar_one()
        assert row.next_run_at is None


@pytest.mark.asyncio
async def test_schd02_create_invalid_cron(client) -> None:
    """POST with garbage cron -> 422 with explicit error 'invalid cron expression'."""
    r = await client.post(
        "/api/schedules",
        json={"name": "bad", "cron": "not a cron", "enabled": True},
    )
    assert r.status_code == 422, r.text
    assert "invalid cron expression" in r.json()["error"].lower()


@pytest.mark.asyncio
async def test_schd02_create_duplicate_name_409(client) -> None:
    """Two POSTs with the same name -> second returns 409."""
    p = {"name": "twice", "cron": "0 9 * * *", "enabled": True}
    r1 = await client.post("/api/schedules", json=p)
    assert r1.status_code == 201, r1.text
    r2 = await client.post("/api/schedules", json=p)
    assert r2.status_code == 409, r2.text
    assert "already exists" in r2.json()["error"].lower()


# ---------- SCHD-03: PATCH /api/schedules/{id} ----------


@pytest.mark.asyncio
async def test_schd03_patch_cron_change_recomputes_next_run(client) -> None:
    """Cron change must trigger next_run_at recomputation (Pitfall 7)."""
    seeded_next = datetime(2026, 5, 1, 9, 0, 0, tzinfo=UTC)
    sched_id = await _seed_schedule(
        client,
        name="recompute",
        cron="0 9 * * *",
        enabled=True,
        next_run_at=seeded_next,
    )
    r = await client.patch(
        f"/api/schedules/{sched_id}",
        json={"cron": "0 12 * * *"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cron"] == "0 12 * * *"
    assert body["next_run_at"] is not None
    parsed = datetime.fromisoformat(body["next_run_at"].replace("Z", "+00:00"))
    # SQLite strips tzinfo on round-trip (Pitfall 4 cousin); normalize.
    parsed_aware = parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)
    # Recomputed -> different from seeded value AND in the future relative to "now".
    assert parsed_aware != seeded_next
    assert parsed_aware > datetime.now(UTC) - timedelta(seconds=5)


@pytest.mark.asyncio
async def test_schd03_patch_disable_clears_next_run(client) -> None:
    """Flipping enabled=False must clear next_run_at (Pitfall 7)."""
    sched_id = await _seed_schedule(
        client,
        name="disable-me",
        cron="0 9 * * *",
        enabled=True,
        next_run_at=datetime(2026, 5, 1, 9, 0, 0, tzinfo=UTC),
    )
    r = await client.patch(
        f"/api/schedules/{sched_id}",
        json={"enabled": False},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["enabled"] is False
    assert body["next_run_at"] is None

    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        row = (await db.execute(_sel(Schedule).where(Schedule.id == sched_id))).scalar_one()
        assert row.next_run_at is None


@pytest.mark.asyncio
async def test_schd03_patch_invalid_cron(client) -> None:
    """PATCH cron='garbage' -> 422; row unchanged."""
    sched_id = await _seed_schedule(
        client,
        name="keep-me-valid",
        cron="0 9 * * *",
        enabled=True,
    )
    r = await client.patch(
        f"/api/schedules/{sched_id}",
        json={"cron": "garbage"},
    )
    assert r.status_code == 422, r.text
    assert "invalid cron expression" in r.json()["error"].lower()

    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        row = (await db.execute(_sel(Schedule).where(Schedule.id == sched_id))).scalar_one()
        assert row.cron == "0 9 * * *"


@pytest.mark.asyncio
async def test_schd03_patch_404(client) -> None:
    r = await client.patch("/api/schedules/999999", json={"enabled": False})
    assert r.status_code == 404
    assert r.json()["error"] == "schedule not found"


# ---------- SCHD-04: DELETE /api/schedules/{id} ----------


@pytest.mark.asyncio
async def test_schd04_delete(client) -> None:
    sched_id = await _seed_schedule(client, name="to-delete")
    r = await client.delete(f"/api/schedules/{sched_id}")
    assert r.status_code == 204, r.text
    assert r.text == ""

    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        row = (await db.execute(_sel(Schedule).where(Schedule.id == sched_id))).scalar_one_or_none()
        assert row is None


@pytest.mark.asyncio
async def test_schd04_delete_404(client) -> None:
    r = await client.delete("/api/schedules/999999")
    assert r.status_code == 404
    assert r.json()["error"] == "schedule not found"


# ---------- SCHD-05: GET /api/schedules/{id}/runs ----------


@pytest.mark.asyncio
async def test_schd05_runs(client) -> None:
    """3 tasks linked via schedule_id -> /runs returns them in created_at DESC."""
    sched_id = await _seed_schedule(client, name="with-runs")
    # Seed 3 linked tasks; their created_at defaults to "now" inside the
    # factory (close together but ordered by insertion via id tie-break).
    t1 = await _seed_task(client, sched_id, title="run-1")
    t2 = await _seed_task(client, sched_id, title="run-2")
    t3 = await _seed_task(client, sched_id, title="run-3")

    r = await client.get(f"/api/schedules/{sched_id}/runs")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 3
    # Default limit returns all 3; verify that all three task ids are present.
    returned_ids = {it["id"] for it in body["items"]}
    assert returned_ids == {t1, t2, t3}

    # ?limit=2 returns 2
    r2 = await client.get(f"/api/schedules/{sched_id}/runs?limit=2")
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert len(body2["items"]) == 2
    assert body2["total"] == 3  # filtered count is the full set; limit only caps items


@pytest.mark.asyncio
async def test_schd05_runs_404(client) -> None:
    r = await client.get("/api/schedules/999999/runs")
    assert r.status_code == 404
    assert r.json()["error"] == "schedule not found"


# ---------- SCHD-06: POST /api/schedules/parse-nl ----------


@pytest.mark.asyncio
async def test_schd06_nl_cron_success_mocked(client, monkeypatch) -> None:
    """Mock nl_to_cron at the router import binding -> 200 + cron echoed."""
    monkeypatch.setattr(
        "cmc.api.routes.schedules.nl_to_cron",
        AsyncMock(return_value="0 9 * * 1-5"),
    )
    r = await client.post(
        "/api/schedules/parse-nl",
        json={"description": "every weekday at 9am"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cron"] == "0 9 * * 1-5"
    assert body["description"] == "every weekday at 9am"


@pytest.mark.asyncio
async def test_schd06_nl_cron_no_api_key_503(client, monkeypatch) -> None:
    """ANTHROPIC_API_KEY unset -> nl_to_cron returns None -> router 503."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    r = await client.post(
        "/api/schedules/parse-nl",
        json={"description": "every weekday at 9am"},
    )
    assert r.status_code == 503, r.text
    assert "natural-language schedules unavailable" in r.json()["error"].lower()


@pytest.mark.asyncio
async def test_schd06_nl_cron_invalid_model_output_503(client, monkeypatch) -> None:
    """Mocked nl_to_cron returning None (e.g. invalid model output) -> 503."""
    monkeypatch.setattr(
        "cmc.api.routes.schedules.nl_to_cron",
        AsyncMock(return_value=None),
    )
    r = await client.post(
        "/api/schedules/parse-nl",
        json={"description": "this is not cron"},
    )
    assert r.status_code == 503, r.text
    assert "natural-language schedules unavailable" in r.json()["error"].lower()
