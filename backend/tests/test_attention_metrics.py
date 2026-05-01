"""Attention metric tests for decision and task counts.

The /api/attention payload reports real SELECT COUNT(*) values scoped WHERE
status='pending' for decisions and WHERE status='failed' for tasks.
"""

import pytest

from cmc.db.models.decisions import Decision
from cmc.db.models.tasks import Task

from .conftest import make_decision_row, make_task_row


async def _seed_decision(client_fixture, **overrides) -> int:
    """Insert a Decision row via the app's sessionmaker; return new id."""
    sessionmaker = client_fixture._transport.app.state.sessions
    row = make_decision_row(**overrides)
    async with sessionmaker() as db:
        d = Decision(**row)
        db.add(d)
        await db.commit()
        await db.refresh(d)
        return d.id


async def _seed_task(client_fixture, **overrides) -> int:
    """Insert a Task row via the app's sessionmaker; return new id."""
    sessionmaker = client_fixture._transport.app.state.sessions
    row = make_task_row(**overrides)
    async with sessionmaker() as db:
        t = Task(**row)
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t.id


@pytest.mark.asyncio
async def test_attention_real_data_counts_pending_decisions_and_failed_tasks(client) -> None:
    """SAPI-04 real-data: with 2 pending decisions + 1 failed task seeded,
    /api/attention returns pending_decisions=2 and failed_tasks=1.

    Also seeds rows that should NOT count (1 answered decision + 1 done task)
    so the WHERE-clause filters are exercised. Without the WHERE filter the
    test would pass with naive `func.count()` queries that count everything.
    """
    # 2 pending decisions
    await _seed_decision(client, dedup_key="dk-pending-1", status="pending")
    await _seed_decision(client, dedup_key="dk-pending-2", status="pending")
    # 1 answered decision — should NOT count
    await _seed_decision(client, dedup_key="dk-answered", status="answered", answer="ok")

    # 1 failed task
    await _seed_task(client, title="t-failed", status="failed")
    # 1 done task — should NOT count
    await _seed_task(client, title="t-done", status="done")
    # 1 pending task — should NOT count toward failed_tasks
    await _seed_task(client, title="t-pending", status="pending")

    r = await client.get("/api/attention")
    assert r.status_code == 200, r.text
    body = r.json()

    # The two real-data fields now reflect actual DB state.
    assert body["pending_decisions"] == 2
    assert body["failed_tasks"] == 1

    # Other fields preserve the existing contract (Pitfall 7 — shape stable).
    assert "stuck_sessions" in body
    assert "stale_dispatcher_seconds" in body
    assert "items" in body
