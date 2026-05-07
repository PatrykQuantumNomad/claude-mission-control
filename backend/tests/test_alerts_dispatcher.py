"""Phase 15 Plan 02 — alert engine dispatcher integration tests.

Covers ALRT-04 (tick integration), ALRT-06/07 (dedup + auto-resolve),
ALRT-12 (no-tasks-import invariant), and the e-stop gate.

Patterns:
  - _bootstrap_db (alembic upgrade) mirrors test_dispatcher.py.
  - Static-import test reads cmc/dispatcher/alerts.py with `ast` (no runtime).
  - Concurrent-tick race uses two distinct AsyncSession instances on the same
    engine wrapped in asyncio.gather; verifies UNIQUE + partial-unique handle
    the contention as the verbatim-copied notifier.py / hitl.py pattern does.
"""
from __future__ import annotations

import ast
import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from cmc.db.models.alert_rules import AlertRule
from cmc.db.models.alert_state import AlertState
from cmc.db.models.decisions import Decision
from cmc.db.models.notification_log import NotificationLog
from cmc.db.models.system_state import SystemState
from cmc.db.models.tasks import Task

# --------------------------------------------------------------------------
# Bootstrap helper — copied from test_dispatcher.py::_bootstrap_db.
# --------------------------------------------------------------------------


async def _bootstrap_db(test_settings):
    from alembic import command
    from alembic.config import Config

    from cmc.db import create_engine_for_settings, make_sessionmaker

    engine = create_engine_for_settings(test_settings)
    cfg = Config(str(test_settings.alembic_ini_path))
    cfg.set_main_option(
        "script_location", str(test_settings.alembic_ini_path.parent / "migrations")
    )

    async with engine.begin() as conn:
        def _upgrade(sync_conn):
            cfg.attributes["connection"] = sync_conn
            command.upgrade(cfg, "head")

        await conn.run_sync(_upgrade)

    sessions = make_sessionmaker(engine)
    return engine, sessions


# --------------------------------------------------------------------------
# Inline factory helpers — DB-shape brittle code colocated with tests.
# --------------------------------------------------------------------------


def _make_alert_rule(
    name: str = "rule",
    kind: str = "threshold",
    metric: str = "dispatcher_failed_tasks_5m",
    threshold_fire: float | None = 0.0,
    threshold_clear: float | None = None,
    min_dwell_seconds: int = 0,
    min_samples: int = 1,
    cooldown_seconds: int = 0,
    enabled: bool = True,
    spec_version: int = 1,
    params_json: dict | None = None,
    created_at: datetime | None = None,
) -> AlertRule:
    if created_at is None:
        # Default to a created_at far in the past so anomaly warm-up gate (24h)
        # is auto-satisfied for the few tests that use anomaly rules.
        created_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=30)
    return AlertRule(
        name=name,
        kind=kind,
        metric=metric,
        threshold_fire=threshold_fire,
        threshold_clear=threshold_clear,
        min_dwell_seconds=min_dwell_seconds,
        min_samples=min_samples,
        cooldown_seconds=cooldown_seconds,
        enabled=enabled,
        spec_version=spec_version,
        params_json=params_json or {},
        created_at=created_at,
        updated_at=created_at,
    )


async def _seed_failed_task(
    sessions, ended_at: datetime | None = None, status: str = "failed"
) -> int:
    if ended_at is None:
        ended_at = datetime.now(UTC).replace(tzinfo=None)
    async with sessions() as db:
        t = Task(
            title="failed-task",
            description="seed",
            status=status,
            priority=3,
            approval="auto",
            execution_mode="classic",
            created_at=ended_at - timedelta(seconds=60),
            started_at=ended_at - timedelta(seconds=30),
            ended_at=ended_at,
        )
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t.id


async def _seed_alert_rule(sessions, **kwargs) -> int:
    async with sessions() as db:
        r = _make_alert_rule(**kwargs)
        db.add(r)
        await db.commit()
        await db.refresh(r)
        return r.rule_id


async def _count_decisions(sessions, dedup_key: str | None = None) -> int:
    async with sessions() as db:
        q = select(func.count(Decision.id))
        if dedup_key is not None:
            q = q.where(Decision.dedup_key == dedup_key)
        return (await db.execute(q)).scalar_one()


async def _count_notification_log(sessions, entity_id: str | None = None) -> int:
    async with sessions() as db:
        q = select(func.count(NotificationLog.id))
        if entity_id is not None:
            q = q.where(NotificationLog.entity_id == entity_id)
        return (await db.execute(q)).scalar_one()


# --------------------------------------------------------------------------
# Test (a): static-import audit — ALRT-12 invariant.
# --------------------------------------------------------------------------


def test_no_tasks_import():
    """ALRT-12: alert engine MUST NOT import cmc.dispatcher.tasks.

    Static AST audit — runtime import would also fail this if it slipped in,
    but the AST check pins the contract regardless of import-time behavior.
    """
    from pathlib import Path

    src_path = (
        Path(__file__).resolve().parent.parent
        / "cmc"
        / "dispatcher"
        / "alerts.py"
    )
    tree = ast.parse(src_path.read_text())
    bad: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            bad.extend(
                alias.name
                for alias in node.names
                if "cmc.dispatcher.tasks" in alias.name
            )
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if mod == "cmc.dispatcher.tasks" or mod.startswith(
                "cmc.dispatcher.tasks."
            ):
                bad.append(mod)
    assert bad == [], (
        f"cmc/dispatcher/alerts.py MUST NOT import cmc.dispatcher.tasks "
        f"(ALRT-12). Found: {bad}"
    )


def test_only_one_anomaly_detector():
    """ALRT-13 (Phase 21): the sliding-window detector ships as a
    params_json.window_kind discriminator INSIDE evaluate_anomaly, NOT a
    parallel detector function. AST-asserts that cmc/alerts/detector.py
    defines exactly ONE FunctionDef whose name equals 'evaluate_anomaly'.

    Mirrors the precedent at test_no_tasks_import (this file:147-183).

    Exact-equality check (`node.name == "evaluate_anomaly"`) — NOT startswith.
    A future `_evaluate_anomaly_helper` could trip a prefix match (RESEARCH
    Pitfall 7); the contract is "no parallel/sibling DETECTOR function", not
    "no helper named like the detector".
    """
    from pathlib import Path

    src_path = (
        Path(__file__).resolve().parent.parent
        / "cmc"
        / "alerts"
        / "detector.py"
    )
    tree = ast.parse(src_path.read_text())
    anomaly_fns = [
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef)
        and node.name == "evaluate_anomaly"
    ]
    assert anomaly_fns == ["evaluate_anomaly"], (
        "ALRT-13 must extend evaluate_anomaly via params_json.window_kind, "
        "not add a parallel detector function. "
        f"Found: {anomaly_fns}"
    )


# --------------------------------------------------------------------------
# Test (b): empty rules table — returns 0, no side effects.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_alerts_no_rules_returns_zero(test_settings):
    from cmc.dispatcher.alerts import evaluate_alerts

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        async with sessions() as db:
            n = await evaluate_alerts(db)
        assert n == 0
        assert await _count_decisions(sessions) == 0
        assert await _count_notification_log(sessions) == 0
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------
# Test (c): threshold rule fires once → 1 decision + 1 notification_log.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_alerts_threshold_fires_once(test_settings, monkeypatch):
    """Seeded failed task + always-firing rule → exactly 1 decision, 1 notif row."""
    from cmc.dispatcher.alerts import evaluate_alerts

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        # Telegram chat_id required for notification_log insert.
        from cmc.config import load_settings

        def _fake_load_settings():
            return load_settings().model_copy(
                update={"telegram_chat_id": "12345", "telegram_bot_token": "tkn"}
            )

        monkeypatch.setattr(
            "cmc.dispatcher.alerts.load_settings", _fake_load_settings
        )

        rule_id = await _seed_alert_rule(
            sessions,
            name="failed-tasks",
            metric="dispatcher_failed_tasks_5m",
            threshold_fire=0.5,
        )
        await _seed_failed_task(sessions)

        async with sessions() as db:
            await evaluate_alerts(db)

        dedup_key = f"alert:{rule_id}:<global>"
        assert await _count_decisions(sessions, dedup_key=dedup_key) == 1
        assert await _count_notification_log(sessions, entity_id=dedup_key) == 1

        # Decision row shape audit.
        async with sessions() as db:
            d = (
                await db.execute(
                    select(Decision).where(Decision.dedup_key == dedup_key)
                )
            ).scalar_one()
        assert d.status == "pending"
        assert d.options == []  # ALRT-12: alerts are sensors, no Yes/No.
        assert "fired" in d.prompt or "Alert" in d.prompt
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------
# Test (d): idempotent across consecutive ticks.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_alerts_idempotent_per_tick(test_settings, monkeypatch):
    from cmc.config import load_settings
    from cmc.dispatcher.alerts import evaluate_alerts

    monkeypatch.setattr(
        "cmc.dispatcher.alerts.load_settings",
        lambda: load_settings().model_copy(
            update={"telegram_chat_id": "12345", "telegram_bot_token": "tkn"}
        ),
    )

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        rule_id = await _seed_alert_rule(
            sessions,
            metric="dispatcher_failed_tasks_5m",
            threshold_fire=0.5,
        )
        await _seed_failed_task(sessions)

        async with sessions() as db:
            await evaluate_alerts(db)
        async with sessions() as db:
            await evaluate_alerts(db)

        dedup_key = f"alert:{rule_id}:<global>"
        assert await _count_decisions(sessions, dedup_key=dedup_key) == 1
        assert await _count_notification_log(sessions, entity_id=dedup_key) == 1
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------
# Test (e): concurrent ticks via asyncio.gather — Pitfall 7.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_alerts_concurrent_ticks(test_settings, monkeypatch):
    from cmc.config import load_settings
    from cmc.dispatcher.alerts import evaluate_alerts

    monkeypatch.setattr(
        "cmc.dispatcher.alerts.load_settings",
        lambda: load_settings().model_copy(
            update={"telegram_chat_id": "12345", "telegram_bot_token": "tkn"}
        ),
    )

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        rule_id = await _seed_alert_rule(
            sessions,
            metric="dispatcher_failed_tasks_5m",
            threshold_fire=0.5,
        )
        await _seed_failed_task(sessions)

        # Two distinct sessions on the same engine.
        async def _run():
            async with sessions() as db:
                await evaluate_alerts(db)

        await asyncio.gather(_run(), _run())

        dedup_key = f"alert:{rule_id}:<global>"
        assert await _count_decisions(sessions, dedup_key=dedup_key) == 1
        assert await _count_notification_log(sessions, entity_id=dedup_key) == 1
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------
# Test (f): auto-resolve on clear — Pitfall 5 fix.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_alerts_auto_resolve_on_clear(test_settings, monkeypatch):
    """fire → clear: decision.status='answered', notification_log row deleted."""
    from sqlalchemy import update as _upd

    from cmc.config import load_settings
    from cmc.dispatcher.alerts import evaluate_alerts

    monkeypatch.setattr(
        "cmc.dispatcher.alerts.load_settings",
        lambda: load_settings().model_copy(
            update={"telegram_chat_id": "12345", "telegram_bot_token": "tkn"}
        ),
    )

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        rule_id = await _seed_alert_rule(
            sessions,
            metric="dispatcher_failed_tasks_5m",
            threshold_fire=0.5,
        )
        task_id = await _seed_failed_task(sessions)

        # Tick 1: should fire.
        async with sessions() as db:
            await evaluate_alerts(db)
        dedup_key = f"alert:{rule_id}:<global>"
        assert await _count_decisions(sessions, dedup_key=dedup_key) == 1
        assert await _count_notification_log(sessions, entity_id=dedup_key) == 1

        # Flush the failed task (so the next tick sees count=0).
        async with sessions() as db:
            await db.execute(
                _upd(Task).where(Task.id == task_id).values(status="done")
            )
            await db.commit()

        # Tick 2: should auto-resolve.
        async with sessions() as db:
            await evaluate_alerts(db)

        async with sessions() as db:
            d = (
                await db.execute(
                    select(Decision).where(Decision.dedup_key == dedup_key)
                )
            ).scalar_one()
        assert d.status == "answered"
        assert d.answered_by == "alert_engine"
        assert d.answer == "auto-resolved"
        # Notification log row deleted (D-03 / Pitfall 5).
        assert await _count_notification_log(sessions, entity_id=dedup_key) == 0
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------
# Test (g): re-fire after clear — flap test.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_alerts_re_fire_after_clear(test_settings, monkeypatch):
    """fire → clear → fire = TWO decisions total, ONE notification_log row currently."""
    from sqlalchemy import update as _upd

    from cmc.config import load_settings
    from cmc.dispatcher.alerts import evaluate_alerts

    monkeypatch.setattr(
        "cmc.dispatcher.alerts.load_settings",
        lambda: load_settings().model_copy(
            update={"telegram_chat_id": "12345", "telegram_bot_token": "tkn"}
        ),
    )

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        rule_id = await _seed_alert_rule(
            sessions,
            metric="dispatcher_failed_tasks_5m",
            threshold_fire=0.5,
        )
        task_id = await _seed_failed_task(sessions)

        # Tick 1: fire.
        async with sessions() as db:
            await evaluate_alerts(db)
        dedup_key = f"alert:{rule_id}:<global>"

        # Flush the task and tick to clear.
        async with sessions() as db:
            await db.execute(
                _upd(Task).where(Task.id == task_id).values(status="done")
            )
            await db.commit()
        async with sessions() as db:
            await evaluate_alerts(db)
        # After clear: notification_log empty (D-03).
        assert await _count_notification_log(sessions, entity_id=dedup_key) == 0

        # New failure, re-tick — should fire again.
        await _seed_failed_task(sessions)
        async with sessions() as db:
            await evaluate_alerts(db)

        assert await _count_decisions(sessions, dedup_key=dedup_key) == 2
        assert await _count_notification_log(sessions, entity_id=dedup_key) == 1
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------
# Test (h): anomaly warm-up suppresses notifications.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_alerts_anomaly_warmup_suppressed(
    test_settings, monkeypatch
):
    """Anomaly rule with min_samples=10 → INSUFFICIENT verdict → no decision/notif."""
    from cmc.config import load_settings
    from cmc.dispatcher.alerts import evaluate_alerts

    monkeypatch.setattr(
        "cmc.dispatcher.alerts.load_settings",
        lambda: load_settings().model_copy(
            update={"telegram_chat_id": "12345", "telegram_bot_token": "tkn"}
        ),
    )

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        # Fresh rule (created_at = now → 24h warm-up gate ALSO fails, doubly suppresses).
        rule_id = await _seed_alert_rule(
            sessions,
            kind="anomaly",
            metric="dispatcher_failed_tasks_5m",
            threshold_fire=3.0,  # z-score threshold
            min_samples=10,
            params_json={"window_n": 100},
            created_at=datetime.now(UTC).replace(tzinfo=None),
        )
        await _seed_failed_task(sessions)

        async with sessions() as db:
            await evaluate_alerts(db)

        # State row exists with insufficient_data.
        async with sessions() as db:
            states = (
                await db.execute(
                    select(AlertState).where(AlertState.rule_id == rule_id)
                )
            ).scalars().all()
        assert len(states) == 1
        assert states[0].state == "insufficient_data"

        # NO decision, NO notification_log row.
        assert await _count_decisions(sessions) == 0
        assert await _count_notification_log(sessions) == 0
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------
# Test (i): disabled rules are skipped — no extractor call, no state row.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_alerts_skips_disabled(test_settings, monkeypatch):
    from cmc.config import load_settings
    from cmc.dispatcher.alerts import evaluate_alerts

    monkeypatch.setattr(
        "cmc.dispatcher.alerts.load_settings",
        lambda: load_settings().model_copy(
            update={"telegram_chat_id": "12345", "telegram_bot_token": "tkn"}
        ),
    )

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        rule_id = await _seed_alert_rule(
            sessions,
            metric="dispatcher_failed_tasks_5m",
            threshold_fire=0.0,
            enabled=False,
        )
        await _seed_failed_task(sessions)

        async with sessions() as db:
            await evaluate_alerts(db)

        # No state row created.
        async with sessions() as db:
            states = (
                await db.execute(
                    select(AlertState).where(AlertState.rule_id == rule_id)
                )
            ).scalars().all()
        assert states == []
        assert await _count_decisions(sessions) == 0
        assert await _count_notification_log(sessions) == 0
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------
# Test (j): unknown metric — log warning, no crash.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_alerts_unknown_metric_warns(
    test_settings, monkeypatch, caplog
):
    """Orphan rule with metric not in _SCOPE_EXTRACTORS — skip gracefully."""
    from cmc.config import load_settings
    from cmc.dispatcher.alerts import evaluate_alerts

    monkeypatch.setattr(
        "cmc.dispatcher.alerts.load_settings",
        lambda: load_settings().model_copy(
            update={"telegram_chat_id": "12345", "telegram_bot_token": "tkn"}
        ),
    )

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        # Direct DB insert bypasses the API validator.
        await _seed_alert_rule(
            sessions,
            metric="made_up_metric_foo",
            threshold_fire=0.0,
        )

        async with sessions() as db:
            n = await evaluate_alerts(db)
        # Returns 1 (rule WAS evaluated, even though no extractor matched).
        assert n == 1
        assert await _count_decisions(sessions) == 0
        assert await _count_notification_log(sessions) == 0
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------
# Test (k): heartbeat hook lands AFTER e-stop early return.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_heartbeat_hook_after_estop(
    test_settings, monkeypatch, tmp_pid_dir_monkey, mock_psutil_pids
):
    """emergency_stop=1 + always-firing rule → NO decision row.

    Verifies the placement: evaluate_alerts must NOT run when e-stop tripped.
    """
    from cmc.dispatcher import heartbeat as hb

    mock_psutil_pids(set())

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        async with sessions() as db:
            db.add(
                SystemState(
                    key="emergency_stop",
                    value="1",
                    updated_at=datetime.now(UTC),
                )
            )
            await db.commit()

        await _seed_alert_rule(
            sessions,
            metric="dispatcher_failed_tasks_5m",
            threshold_fire=0.5,
        )
        await _seed_failed_task(sessions)

        # Force run_one_cycle to use OUR engine.
        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.create_engine_for_settings",
            lambda s: engine,
        )
        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.make_sessionmaker", lambda e: sessions
        )

        rc = await hb.run_one_cycle()
        assert rc == 0
        # alerts engine MUST NOT have run.
        assert await _count_decisions(sessions) == 0
        assert await _count_notification_log(sessions) == 0
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------
# Test (l): heartbeat hook calls evaluate_alerts when e-stop NOT tripped.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_heartbeat_hook_calls_evaluate_alerts(
    test_settings, monkeypatch, tmp_pid_dir_monkey, mock_psutil_pids
):
    """POLI-04: emergency_stop=0 + firing rule → run_one_cycle() produces exactly
    1 decision row AND 1 notification_log row from the heartbeat tick.

    This is the canonical POLI-04 integration test referenced from
    .planning/REQUIREMENTS.md. The notification_log assertion is what
    distinguishes POLI-04 from earlier per-function variants (which only
    asserted decision count).
    """
    from cmc.config import load_settings
    from cmc.dispatcher import heartbeat as hb

    mock_psutil_pids(set())

    monkeypatch.setattr(
        "cmc.dispatcher.alerts.load_settings",
        lambda: load_settings().model_copy(
            update={"telegram_chat_id": "12345", "telegram_bot_token": "tkn"}
        ),
    )

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        rule_id = await _seed_alert_rule(
            sessions,
            metric="dispatcher_failed_tasks_5m",
            threshold_fire=0.5,
        )
        await _seed_failed_task(sessions)

        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.create_engine_for_settings",
            lambda s: engine,
        )
        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.make_sessionmaker", lambda e: sessions
        )

        rc = await hb.run_one_cycle()
        assert rc == 0
        dedup_key = f"alert:{rule_id}:<global>"
        assert await _count_decisions(sessions, dedup_key=dedup_key) == 1
        assert await _count_notification_log(sessions, entity_id=dedup_key) == 1
    finally:
        await engine.dispose()
