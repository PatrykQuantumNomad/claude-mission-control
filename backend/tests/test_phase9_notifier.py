"""TELE-02 + TELE-04 — notifier dispatch + dedup + snooze + rerun cleanup.

Uses the Phase 8 `_bootstrap_db` helper pattern (alembic-upgrade a fresh
engine, return engine + sessionmaker) rather than `seeded_app` because the
notifier is a DB-only module — no FastAPI lifespan needed.

Pitfall P6 enforcement: dedup test re-runs the cycle against the same DB
state and asserts ZERO new sendMessage calls; rowcount-driven INSERT
ON CONFLICT DO NOTHING is the only design that satisfies this under both
single-process and concurrent ticks.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from httpx import MockTransport, Response
from sqlalchemy import select

from cmc.config import Settings
from cmc.db.models.decisions import Decision
from cmc.db.models.notification_log import NotificationLog
from cmc.db.models.schedules import Schedule
from cmc.db.models.system_state import SystemState
from cmc.db.models.tasks import Task
from cmc.telegram import notifier


async def _bootstrap_db(test_settings):
    """Per-test fresh engine + alembic upgrade + sessionmaker.

    Mirrors backend/tests/test_phase8_dispatcher.py::_bootstrap_db. Caller is
    responsible for awaiting engine.dispose() at teardown.
    """
    from alembic import command
    from alembic.config import Config

    from cmc.db import create_engine_for_settings, make_sessionmaker

    engine = create_engine_for_settings(test_settings)
    cfg = Config(str(test_settings.alembic_ini_path))
    cfg.set_main_option(
        "script_location",
        str(test_settings.alembic_ini_path.parent / "migrations"),
    )

    async with engine.begin() as conn:
        def _upgrade(sync_conn):
            cfg.attributes["connection"] = sync_conn
            command.upgrade(cfg, "head")

        await conn.run_sync(_upgrade)

    sessions = make_sessionmaker(engine)
    return engine, sessions


def _mock_client(captured: list):
    """httpx.AsyncClient backed by MockTransport that captures every request."""

    def handler(req: httpx.Request) -> Response:
        body = req.content.decode("utf-8") if req.content else ""
        captured.append({"url": str(req.url), "json": body})
        return Response(
            200,
            json={
                "ok": True,
                "result": {"message_id": len(captured), "chat": {"id": 1}},
            },
        )

    return httpx.AsyncClient(transport=MockTransport(handler))


@pytest.mark.asyncio
async def test_notifier_full_cycle_sends_three(test_settings):
    """3 candidates (decision + failure + overdue schedule) → 3 sendMessage calls."""
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        now = datetime.now(timezone.utc)
        async with sessions() as db:
            db.add(
                Decision(
                    dedup_key="dk-1",
                    prompt="continue?",
                    session_id=None,
                    status="pending",
                    created_at=now,
                )
            )
            db.add(
                Task(
                    title="failed task",
                    description="x",
                    status="failed",
                    execution_mode="classic",
                    error_message="boom",
                    created_at=now,
                )
            )
            db.add(
                Schedule(
                    name="overdue-1",
                    cron="*/5 * * * *",
                    enabled=True,
                    task_template={"title": "x"},
                    next_run_at=now - timedelta(minutes=10),
                )
            )
            await db.commit()

        captured: list = []
        s = Settings(telegram_bot_token="TKN", telegram_chat_id="999")
        async with _mock_client(captured) as client:
            sent = await notifier.run_one_cycle(
                sessions, s, http_client=client
            )
        assert sent == 3
        assert len(captured) == 3
        # Pitfall P3: no parse_mode field in any payload.
        for c in captured:
            body = json.loads(c["json"]) if c["json"] else {}
            assert "parse_mode" not in body
            # All sendMessage calls must include text + chat_id.
            assert body["chat_id"] == "999"
            assert body["text"]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_notifier_dedup_no_resend(test_settings):
    """Pitfall P6: re-running with same DB state → 0 new sendMessage calls."""
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        now = datetime.now(timezone.utc)
        async with sessions() as db:
            db.add(
                Decision(
                    dedup_key="dk-2",
                    prompt="continue?",
                    session_id=None,
                    status="pending",
                    created_at=now,
                )
            )
            await db.commit()

        s = Settings(telegram_bot_token="TKN", telegram_chat_id="999")
        cap1: list = []
        async with _mock_client(cap1) as c:
            await notifier.run_one_cycle(sessions, s, http_client=c)
        assert len(cap1) == 1  # first cycle sends

        # Second run: same DB state → 0 sends.
        cap2: list = []
        async with _mock_client(cap2) as c:
            sent = await notifier.run_one_cycle(sessions, s, http_client=c)
        assert sent == 0
        assert cap2 == []
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_notifier_snooze_blocks_resend(test_settings):
    """status='snoozed' AND snoozed_until > now blocks the candidate."""
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        now = datetime.now(timezone.utc)
        async with sessions() as db:
            d = Decision(
                dedup_key="dk-3",
                prompt="continue?",
                session_id=None,
                status="pending",
                created_at=now,
            )
            db.add(d)
            await db.commit()
            await db.refresh(d)
            db.add(
                NotificationLog(
                    kind="decision",
                    entity_id=str(d.id),
                    chat_id="999",
                    sent_at=now,
                    snoozed_until=now + timedelta(hours=1),
                    status="snoozed",
                )
            )
            await db.commit()

        s = Settings(telegram_bot_token="TKN", telegram_chat_id="999")
        cap: list = []
        async with _mock_client(cap) as c:
            sent = await notifier.run_one_cycle(sessions, s, http_client=c)
        assert sent == 0
        assert cap == []
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_notifier_rerun_cleanup_allows_resend(test_settings):
    """failed→running transition deletes stale failure row; second failure re-notifies.

    Sequence (RESEARCH §D3):
      1. Task fails → notification_log row {kind=failure, status=sent}.
      2. User reruns → task status flips back to 'running'.
      3. Notifier cycle A: cleanup_rerun_failures sees task.status='running'
         and deletes the stale failure row (no candidates yet, 0 sends).
      4. Task fails AGAIN → status='failed' with no surviving notif row.
      5. Notifier cycle B: candidate scan finds the failed task, no block,
         INSERT-OR-IGNORE wins, sendMessage fires (1 send).
    """
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        now = datetime.now(timezone.utc)
        # Step 1+2: task has been rerun → currently 'running' but stale
        # failure notif row from the prior failure still exists.
        async with sessions() as db:
            t = Task(
                title="task",
                description="x",
                status="running",
                execution_mode="classic",
                created_at=now,
            )
            db.add(t)
            await db.commit()
            await db.refresh(t)
            task_id = t.id
            db.add(
                NotificationLog(
                    kind="failure",
                    entity_id=str(task_id),
                    chat_id="999",
                    sent_at=now - timedelta(hours=1),
                    status="sent",
                )
            )
            await db.commit()

        s = Settings(telegram_bot_token="TKN", telegram_chat_id="999")

        # Step 3: cycle A — cleanup_rerun_failures deletes the stale row
        # because task.status='running'. No candidates yet, so 0 sends.
        cap_a: list = []
        async with _mock_client(cap_a) as c:
            sent_a = await notifier.run_one_cycle(
                sessions, s, http_client=c
            )
        assert sent_a == 0
        assert cap_a == []
        # Confirm cleanup ran: stale row gone.
        async with sessions() as db:
            stale = (
                await db.execute(
                    select(NotificationLog).where(
                        NotificationLog.kind == "failure"
                    )
                )
            ).scalars().all()
        assert stale == []

        # Step 4: second failure event.
        async with sessions() as db:
            t2 = (
                await db.execute(
                    select(Task).where(Task.id == task_id)
                )
            ).scalar_one()
            t2.status = "failed"
            t2.error_message = "second failure"
            await db.commit()

        # Step 5: cycle B — re-notify fires (1 send).
        cap_b: list = []
        async with _mock_client(cap_b) as c:
            sent_b = await notifier.run_one_cycle(
                sessions, s, http_client=c
            )
        assert sent_b == 1
        assert len(cap_b) == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_notifier_no_op_without_token(test_settings):
    """settings.telegram_bot_token is None → returns 0, no sendMessage calls."""
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        s = Settings()  # all telegram_* default → None / empty
        cap: list = []
        async with _mock_client(cap) as c:
            sent = await notifier.run_one_cycle(sessions, s, http_client=c)
        assert sent == 0
        assert cap == []
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_notifier_stamps_tick_on_no_op(test_settings):
    """Pitfall P5: tick stamp fires even when telegram is disabled."""
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        s = Settings()
        async with _mock_client([]) as c:
            await notifier.run_one_cycle(sessions, s, http_client=c)
        async with sessions() as db:
            row = (
                await db.execute(
                    select(SystemState).where(
                        SystemState.key == "telegram_last_tick_at"
                    )
                )
            ).scalar_one()
        assert row.value is not None
        # Value parses as ISO datetime.
        parsed = datetime.fromisoformat(row.value)
        assert parsed.tzinfo is not None
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_notifier_send_failure_marks_status_failed(test_settings):
    """sendMessage returns 500 → notification_log row left at status='failed'."""
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        now = datetime.now(timezone.utc)
        async with sessions() as db:
            db.add(
                Decision(
                    dedup_key="dk-4",
                    prompt="x",
                    session_id=None,
                    status="pending",
                    created_at=now,
                )
            )
            await db.commit()

        # Mock returns 500.
        def handler(req: httpx.Request) -> Response:
            return Response(
                500, json={"ok": False, "description": "boom"}
            )

        s = Settings(telegram_bot_token="TKN", telegram_chat_id="999")
        async with httpx.AsyncClient(transport=MockTransport(handler)) as c:
            sent = await notifier.run_one_cycle(sessions, s, http_client=c)
        assert sent == 0

        # The notif row exists with status='failed' so future cycles can act.
        async with sessions() as db:
            r = (
                await db.execute(
                    select(NotificationLog).where(
                        NotificationLog.kind == "decision"
                    )
                )
            ).scalar_one()
        assert r.status == "failed"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_notifier_inline_keyboard_shape(test_settings):
    """Decision sendMessage carries answer_decision:<id>:yes / :no callbacks."""
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        now = datetime.now(timezone.utc)
        async with sessions() as db:
            d = Decision(
                dedup_key="dk-5",
                prompt="?",
                session_id=None,
                status="pending",
                created_at=now,
            )
            db.add(d)
            await db.commit()
            await db.refresh(d)
            decision_id = d.id

        captured: list = []
        s = Settings(telegram_bot_token="TKN", telegram_chat_id="999")
        async with _mock_client(captured) as c:
            await notifier.run_one_cycle(sessions, s, http_client=c)
        assert len(captured) == 1
        body = captured[0]["json"]
        assert f"answer_decision:{decision_id}:yes" in body
        assert f"answer_decision:{decision_id}:no" in body
        assert f"snooze:decision:{decision_id}:30m" in body
    finally:
        await engine.dispose()
