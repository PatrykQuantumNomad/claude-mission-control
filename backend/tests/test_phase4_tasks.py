"""Phase 4 Tasks router tests — TASK-01..07.

Per Plan 03-01 per-router convention: ALL TASK-* tests live here.
Wave 1 plan 04-03 implements the Tasks router; tests below cover all 7 endpoints.

Pitfall awareness:
  - r.json()["error"] (NOT "detail") — Phase 1 error handler emits {error: ...}.
  - tz-aware UTC datetimes when seeding (Pitfall 4).
  - TASK-03 illegal status transitions are validated by cmc.tasks.transitions
    (pure function); the matrix is locked in Wave 0 — see transitions.py docstring.
  - TASK-07 spawn_dispatcher_oneshot uses subprocess.Popen + start_new_session=True;
    tests monkeypatch BOTH `cmc.tasks.spawn.subprocess.Popen` AND `cmc.tasks.spawn.repo_root`
    so no real subprocess + no real .tmp/ writes ever happen.
"""
from __future__ import annotations

import subprocess
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from cmc.api.schemas.tasks import TaskCreate
from cmc.db.models.tasks import Task
from cmc.tasks.transitions import validate_transition

from .conftest import make_task_row


# ---------- Wave 0 smoke (kept) ----------


def test_phase4_tasks_smoke():
    t = TaskCreate(title="hello")
    assert t.title == "hello"
    assert validate_transition("pending", "running") is True
    assert validate_transition("done", "pending") is False


# ---------- Helpers ----------


async def _seed_task(client_fixture, **overrides) -> int:
    """Insert a Task row via the app's sessionmaker; return the new id."""
    sessionmaker = client_fixture._transport.app.state.sessions
    row = make_task_row(**overrides)
    async with sessionmaker() as db:
        t = Task(**row)
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t.id


# ---------- TASK-01: GET /api/tasks ----------


@pytest.mark.asyncio
async def test_task01_list_default(client) -> None:
    """No filter -> all rows returned. Order: priority ASC, created_at DESC."""
    await _seed_task(client, title="t-pending", status="pending", priority=2)
    await _seed_task(client, title="t-running", status="running", priority=3)
    await _seed_task(client, title="t-done", status="done", priority=1)

    r = await client.get("/api/tasks")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 3
    # priority ASC: 1 first, then 2, then 3
    priorities = [it["priority"] for it in body["items"]]
    assert priorities == sorted(priorities)


@pytest.mark.asyncio
async def test_task01_list_status_filter(client) -> None:
    await _seed_task(client, title="t-p", status="pending")
    await _seed_task(client, title="t-r", status="running")
    await _seed_task(client, title="t-d", status="done")

    r = await client.get("/api/tasks?status=pending")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["status"] == "pending"
    assert body["items"][0]["title"] == "t-p"


@pytest.mark.asyncio
async def test_task01_list_quadrant_filter(client) -> None:
    await _seed_task(client, title="t-do", quadrant="do")
    await _seed_task(client, title="t-plan", quadrant="plan")
    await _seed_task(client, title="t-none", quadrant=None)

    r = await client.get("/api/tasks?quadrant=do")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["quadrant"] == "do"
    assert body["items"][0]["title"] == "t-do"


# ---------- TASK-02: POST /api/tasks ----------


@pytest.mark.asyncio
async def test_task02_create(client) -> None:
    """POST with all required + optional fields -> 201 + TaskListItem."""
    payload = {
        "title": "deploy backend",
        "description": "ssh + uv sync + reload",
        "priority": 1,
        "quadrant": "do",
        "approval": "awaiting_approval",
        "risk": "high",
        "dry_run": False,
        "model": "claude-opus-4-7",
        "execution_mode": "interactive",
        "skill": "deploy",
        "scheduled_for": "2026-05-01T10:00:00+00:00",
    }
    r = await client.post("/api/tasks", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["title"] == "deploy backend"
    assert body["description"] == "ssh + uv sync + reload"
    assert body["priority"] == 1
    assert body["quadrant"] == "do"
    assert body["approval"] == "awaiting_approval"
    assert body["risk"] == "high"
    assert body["dry_run"] is False
    assert body["model"] == "claude-opus-4-7"
    assert body["execution_mode"] == "interactive"
    assert body["skill"] == "deploy"
    assert body["status"] == "pending"  # server default
    assert isinstance(body["id"], int)

    # Verify in DB
    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        rows = (await db.execute(_sel(Task).where(Task.id == body["id"]))).scalars().all()
        assert len(rows) == 1
        assert rows[0].status == "pending"
        assert rows[0].title == "deploy backend"


@pytest.mark.asyncio
async def test_task02_create_minimal(client) -> None:
    """POST with just {title} -> 201 + sensible defaults."""
    r = await client.post("/api/tasks", json={"title": "minimal"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["title"] == "minimal"
    assert body["status"] == "pending"
    assert body["priority"] == 3
    assert body["approval"] == "auto"
    assert body["execution_mode"] == "interactive"
    assert body["dry_run"] is False
    assert body["description"] == ""


# ---------- TASK-03: PATCH /api/tasks/{id} ----------


@pytest.mark.asyncio
async def test_task03_patch_legal_transition(client) -> None:
    """pending -> running is legal per the v1 transition matrix."""
    task_id = await _seed_task(client, title="t-tr", status="pending")
    r = await client.patch(f"/api/tasks/{task_id}", json={"status": "running"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "running"

    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        row = (await db.execute(_sel(Task).where(Task.id == task_id))).scalar_one()
        assert row.status == "running"


@pytest.mark.asyncio
async def test_task03_patch_illegal_transition(client) -> None:
    """done is terminal — cannot transition to anything (including pending)."""
    task_id = await _seed_task(client, title="t-done", status="done")
    r = await client.patch(f"/api/tasks/{task_id}", json={"status": "pending"})
    assert r.status_code == 400, r.text
    assert "invalid status transition" in r.json()["error"].lower()

    # DB row unchanged
    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        row = (await db.execute(_sel(Task).where(Task.id == task_id))).scalar_one()
        assert row.status == "done"


@pytest.mark.asyncio
async def test_task03_patch_partial_update(client) -> None:
    """PATCH without status -> only specified fields update; status untouched."""
    task_id = await _seed_task(client, title="t-p", status="pending", priority=3, model=None)
    r = await client.patch(
        f"/api/tasks/{task_id}",
        json={"priority": 1, "model": "claude-haiku-4-5"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["priority"] == 1
    assert body["model"] == "claude-haiku-4-5"
    assert body["status"] == "pending"  # unchanged

    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        row = (await db.execute(_sel(Task).where(Task.id == task_id))).scalar_one()
        assert row.priority == 1
        assert row.model == "claude-haiku-4-5"
        assert row.status == "pending"


@pytest.mark.asyncio
async def test_task03_patch_404(client) -> None:
    r = await client.patch("/api/tasks/999999", json={"status": "running"})
    assert r.status_code == 404
    assert r.json()["error"] == "task not found"


# ---------- TASK-04: DELETE /api/tasks/{id} ----------


@pytest.mark.asyncio
async def test_task04_delete(client) -> None:
    """DELETE -> 204 (no body), DB row gone."""
    task_id = await _seed_task(client, title="t-del", status="pending")
    r = await client.delete(f"/api/tasks/{task_id}")
    assert r.status_code == 204, r.text
    assert r.text == ""  # 204 -> no body

    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        row = (await db.execute(_sel(Task).where(Task.id == task_id))).scalar_one_or_none()
        assert row is None


@pytest.mark.asyncio
async def test_task04_delete_404(client) -> None:
    r = await client.delete("/api/tasks/999999")
    assert r.status_code == 404
    assert r.json()["error"] == "task not found"


# ---------- TASK-05: POST /api/tasks/{id}/approve ----------


@pytest.mark.asyncio
async def test_task05_approve_legal(client) -> None:
    """approve flips status='awaiting_approval' -> 'pending', stamps approved_at."""
    task_id = await _seed_task(client, title="t-app", status="awaiting_approval")
    r = await client.post(f"/api/tasks/{task_id}/approve")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == task_id
    assert body["status"] == "pending"
    assert body["approved_at"] is not None
    # ISO-8601 sanity check
    datetime.fromisoformat(body["approved_at"].replace("Z", "+00:00"))

    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        row = (await db.execute(_sel(Task).where(Task.id == task_id))).scalar_one()
        assert row.status == "pending"
        assert row.approved_at is not None


@pytest.mark.asyncio
async def test_task05_approve_illegal(client) -> None:
    """approve on non-awaiting_approval -> 400."""
    task_id = await _seed_task(client, title="t-app-ill", status="pending")
    r = await client.post(f"/api/tasks/{task_id}/approve")
    assert r.status_code == 400, r.text
    assert "awaiting approval" in r.json()["error"].lower()


@pytest.mark.asyncio
async def test_task05_approve_404(client) -> None:
    r = await client.post("/api/tasks/999999/approve")
    assert r.status_code == 404
    assert r.json()["error"] == "task not found"


# ---------- TASK-06: POST /api/tasks/{id}/rerun ----------


@pytest.mark.asyncio
async def test_task06_rerun_legal(client) -> None:
    """rerun resets failed -> pending, clears started_at/ended_at/error_message."""
    now = datetime.now(timezone.utc)
    task_id = await _seed_task(
        client,
        title="t-rerun",
        status="failed",
        started_at=now - timedelta(minutes=5),
        ended_at=now - timedelta(minutes=1),
        error_message="boom",
    )
    r = await client.post(f"/api/tasks/{task_id}/rerun")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == task_id
    assert body["status"] == "pending"

    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        row = (await db.execute(_sel(Task).where(Task.id == task_id))).scalar_one()
        assert row.status == "pending"
        assert row.started_at is None
        assert row.ended_at is None
        assert row.error_message is None


@pytest.mark.asyncio
async def test_task06_rerun_illegal(client) -> None:
    """rerun on non-failed -> 400."""
    task_id = await _seed_task(client, title="t-rerun-ill", status="running")
    r = await client.post(f"/api/tasks/{task_id}/rerun")
    assert r.status_code == 400, r.text
    assert "not in failed state" in r.json()["error"].lower()


# ---------- TASK-07: POST /api/dispatcher/trigger ----------


@pytest.mark.asyncio
async def test_task07_trigger_calls_subprocess_popen(client, tmp_path, monkeypatch) -> None:
    """POST /api/dispatcher/trigger -> 202 + PID; subprocess.Popen called once
    with argv from settings.dispatcher_oneshot_cmd, start_new_session=True,
    stdin=DEVNULL, close_fds=True.

    Patch repo_root inside cmc.tasks.spawn so the dispatcher-logs/ directory
    lands in tmp_path (no real .tmp/ writes), then patch
    cmc.tasks.spawn.subprocess.Popen so no real process is spawned.
    """
    fake_proc = MagicMock(pid=12345)
    mock_popen = MagicMock(return_value=fake_proc)

    monkeypatch.setattr("cmc.tasks.spawn.repo_root", lambda: tmp_path)
    monkeypatch.setattr("cmc.tasks.spawn.subprocess.Popen", mock_popen)

    r = await client.post("/api/dispatcher/trigger")
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["triggered"] is True
    assert body["pid"] == 12345

    # Popen called exactly once
    assert mock_popen.call_count == 1
    args, kwargs = mock_popen.call_args

    # First positional arg must be the argv list whose head is sys.executable
    argv = args[0]
    assert isinstance(argv, list)
    assert argv[0] == sys.executable

    # Detachment + safety kwargs
    assert kwargs.get("start_new_session") is True
    assert kwargs.get("stdin") == subprocess.DEVNULL
    assert kwargs.get("close_fds") is True
