"""Phase 8 dispatcher tests — single-file convention (mirrors Phase 4).

Plan 08-01 ships:
  - Settings: 7 dispatcher fields + env override round-trip
  - state.py: pid_dir(), write_pid_file/unlink_pid_file/list_live_pids/stamp_tick
  - sweep.py: sweep_stale_pids() (DISP-03)
  - claim.py: claim_pending_tasks(engine, slots) (DISP-01 atomic claim half)
  - materialize.py: materialize_due_schedules(db) (DISP-01 fan-out half)
  - heartbeat.py: run_one_cycle() async orchestrator (DISP-01/02/03/04 wiring)

Plans 08-02..04 will append DISP-05..12 cases here.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import select

# ---- Settings tests ----------------------------------------------------------


def test_settings_dispatcher_fields_present(clean_env):
    """All 7 new dispatcher fields land with documented defaults."""
    from cmc.config import Settings

    s = Settings()
    assert s.claude_bin == Path("/opt/homebrew/bin/claude")
    assert s.claude_default_model == "sonnet"
    assert s.dispatcher_max_concurrent == 3
    assert s.dispatcher_classic_timeout_s == 600
    assert s.dispatcher_decision_timeout_s == 3600
    assert s.dispatcher_followup_poll_s == 1.0
    assert s.dispatcher_answer_poll_s == 2.0


def test_settings_env_overrides(clean_env, monkeypatch):
    """Pydantic-Settings derives env names from field names (no CMC_ prefix —
    matches existing PORT/DB_PATH/LOG_LEVEL convention from Phase 1)."""
    from cmc.config import Settings

    monkeypatch.setenv("CLAUDE_BIN", "/usr/local/bin/claude")
    monkeypatch.setenv("DISPATCHER_MAX_CONCURRENT", "5")
    s = Settings()
    assert s.claude_bin == Path("/usr/local/bin/claude")
    assert s.dispatcher_max_concurrent == 5


# ---- state.py tests ----------------------------------------------------------


def test_state_pid_file_round_trip(tmp_pid_dir_monkey):
    """write_pid_file + unlink_pid_file form an atomic round-trip; missing files tolerated."""
    from cmc.dispatcher.state import unlink_pid_file, write_pid_file

    final = write_pid_file(123, 4567)
    assert final == tmp_pid_dir_monkey / "123.pid"
    assert final.read_text() == "4567"

    unlink_pid_file(123)
    assert not final.exists()

    # FileNotFoundError tolerated
    unlink_pid_file(999)  # must NOT raise


def test_state_list_live_pids_uses_psutil(tmp_pid_dir_monkey, mock_psutil_pids):
    """list_live_pids reads .pid files and discriminates via psutil.pid_exists."""
    from cmc.dispatcher.state import list_live_pids, write_pid_file

    write_pid_file(1, 10001)  # alive
    write_pid_file(2, 20002)  # dead

    mock_psutil_pids({10001})  # only the first is alive
    live = list_live_pids()
    assert live == {10001}


async def _bootstrap_db(test_settings):
    """Helper: alembic-upgrade a freshly-created engine and return (engine, sessions).

    Caller is responsible for awaiting engine.dispose() at teardown.
    """
    from alembic import command
    from alembic.config import Config

    from cmc.db import create_engine_for_settings, make_sessionmaker

    engine = create_engine_for_settings(test_settings)
    cfg = Config(str(test_settings.alembic_ini_path))
    # Mirror lifespan's BLOCKER 1 fix (absolutize script_location).
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


@pytest.mark.asyncio
async def test_state_stamp_tick_upserts(test_settings):
    """stamp_tick creates the row on first call and updates value on the second."""
    from cmc.db.models.system_state import SystemState
    from cmc.dispatcher.state import stamp_tick

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        await stamp_tick(sessions)
        async with sessions() as db:
            rows = (
                await db.execute(
                    select(SystemState).where(SystemState.key == "dispatcher_last_tick_at")
                )
            ).scalars().all()
        assert len(rows) == 1
        first_value = rows[0].value
        assert first_value is not None

        # Sleep a tick so the iso strings differ; second call must update, not duplicate
        await asyncio.sleep(0.01)
        await stamp_tick(sessions)
        async with sessions() as db:
            rows = (
                await db.execute(
                    select(SystemState).where(SystemState.key == "dispatcher_last_tick_at")
                )
            ).scalars().all()
        assert len(rows) == 1  # still ONE row
        assert rows[0].value != first_value  # value advanced
    finally:
        await engine.dispose()


# ---- sweep.py tests ---------------------------------------------------------


def test_disp03_sweep_unlinks_dead_pids(tmp_pid_dir_monkey, mock_psutil_pids):
    """DISP-03: sweep returns live-PID set AND unlinks dead .pid files."""
    from cmc.dispatcher.state import write_pid_file
    from cmc.dispatcher.sweep import sweep_stale_pids

    write_pid_file(1, 11111)  # alive
    write_pid_file(2, 22222)  # dead

    mock_psutil_pids({11111})
    live = sweep_stale_pids()
    assert live == {11111}

    # Dead .pid file removed; live one preserved.
    assert (tmp_pid_dir_monkey / "1.pid").exists()
    assert not (tmp_pid_dir_monkey / "2.pid").exists()


def test_disp03_sweep_handles_garbage_pid_files(tmp_pid_dir_monkey, mock_psutil_pids):
    """sweep tolerates non-numeric .pid contents (race + garbage cleanup)."""
    from cmc.dispatcher.sweep import sweep_stale_pids

    bad = tmp_pid_dir_monkey / "99.pid"
    bad.write_text("not-a-number")

    mock_psutil_pids(set())
    live = sweep_stale_pids()
    assert live == set()
    # Garbage file removed.
    assert not bad.exists()


# ---- claim.py tests ---------------------------------------------------------


@pytest.mark.asyncio
async def test_disp01_claim_zero_slots_noop(test_settings):
    """slots <= 0 returns [] without touching the DB."""
    from cmc.dispatcher.claim import claim_pending_tasks

    engine, _sessions = await _bootstrap_db(test_settings)
    try:
        rows = await claim_pending_tasks(engine, 0)
        assert rows == []
        rows = await claim_pending_tasks(engine, -5)
        assert rows == []
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_disp01_claim_respects_priority_and_scheduled_for(test_settings):
    """ORDER BY priority ASC, created_at ASC; future scheduled_for excluded."""
    from cmc.db.models.tasks import Task
    from cmc.dispatcher.claim import claim_pending_tasks

    now = datetime.now(timezone.utc)
    future = now + timedelta(hours=1)

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        async with sessions() as db:
            # 4 tasks: low-priority, high-priority (older), high-priority (newer),
            # high-priority-future-scheduled
            db.add_all([
                Task(title="lo", priority=5, status="pending", created_at=now - timedelta(seconds=10)),
                Task(title="hi-old", priority=1, status="pending",
                     created_at=now - timedelta(seconds=20)),
                Task(title="hi-new", priority=1, status="pending",
                     created_at=now - timedelta(seconds=5)),
                Task(title="hi-future", priority=1, status="pending",
                     created_at=now - timedelta(seconds=15), scheduled_for=future),
            ])
            await db.commit()

        rows = await claim_pending_tasks(engine, 2)
        # Two highest-priority READY tasks; ordered by created_at ASC within priority.
        titles = [r["title"] for r in rows]
        assert titles == ["hi-old", "hi-new"]

        # Run again; lo-priority remains, hi-future still excluded.
        rows = await claim_pending_tasks(engine, 5)
        titles = sorted([r["title"] for r in rows])
        assert titles == ["lo"]  # hi-future is still in the future
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_disp01_claim_partitions_pending(test_settings):
    """Two concurrent claim() calls each get distinct rows; union covers all 5."""
    from cmc.db.models.tasks import Task
    from cmc.dispatcher.claim import claim_pending_tasks

    now = datetime.now(timezone.utc)
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        async with sessions() as db:
            db.add_all([
                Task(title=f"t{i}", priority=3, status="pending", created_at=now)
                for i in range(5)
            ])
            await db.commit()

        # Two cycles racing for slots=3 each. BEGIN IMMEDIATE serializes them;
        # only the writer that grabs the WAL write lock first executes, the other
        # waits then claims the remainder.
        results = await asyncio.gather(
            claim_pending_tasks(engine, 3),
            claim_pending_tasks(engine, 3),
        )
        ids_a = {r["id"] for r in results[0]}
        ids_b = {r["id"] for r in results[1]}
        assert ids_a.isdisjoint(ids_b), "claim races must not double-claim a row"
        assert ids_a | ids_b == {1, 2, 3, 4, 5}
        assert sum(len(r) for r in results) == 5
    finally:
        await engine.dispose()


# ---- materialize.py tests ---------------------------------------------------


@pytest.mark.asyncio
async def test_disp01_materialize_creates_task_rows(test_settings):
    """Enabled+due schedule → Task row created, schedule.next_run_at advanced."""
    from cmc.db.models.schedules import Schedule
    from cmc.db.models.tasks import Task
    from cmc.dispatcher.materialize import materialize_due_schedules

    now = datetime.now(timezone.utc)
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        async with sessions() as db:
            db.add(
                Schedule(
                    name="due-now",
                    cron="*/5 * * * *",
                    enabled=True,
                    next_run_at=now,
                    task_template={
                        "title": "from sched",
                        "execution_mode": "classic",
                    },
                )
            )
            await db.commit()

        async with sessions() as db:
            created = await materialize_due_schedules(db)
        assert len(created) == 1

        async with sessions() as db:
            tasks = (await db.execute(select(Task))).scalars().all()
            scheds = (await db.execute(select(Schedule))).scalars().all()
        assert len(tasks) == 1
        t = tasks[0]
        assert t.title == "from sched"
        assert t.schedule_id == scheds[0].id
        assert t.status == "pending"

        s = scheds[0]
        assert s.last_run_at is not None
        # Tz-aware compare (SQLite strips tzinfo on round-trip)
        nra = s.next_run_at if s.next_run_at.tzinfo else s.next_run_at.replace(tzinfo=timezone.utc)
        assert nra > now
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_disp01_materialize_skips_disabled_or_future(test_settings):
    """Disabled OR future-due schedules don't materialize."""
    from cmc.db.models.schedules import Schedule
    from cmc.db.models.tasks import Task
    from cmc.dispatcher.materialize import materialize_due_schedules

    now = datetime.now(timezone.utc)
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        async with sessions() as db:
            db.add_all([
                Schedule(name="disabled-due", cron="*/5 * * * *", enabled=False,
                         next_run_at=now, task_template={"title": "x"}),
                Schedule(name="enabled-future", cron="*/5 * * * *", enabled=True,
                         next_run_at=now + timedelta(hours=1),
                         task_template={"title": "y"}),
            ])
            await db.commit()

        async with sessions() as db:
            created = await materialize_due_schedules(db)
        assert created == []

        async with sessions() as db:
            tasks = (await db.execute(select(Task))).scalars().all()
        assert tasks == []
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_disp01_materialize_handles_bad_template(test_settings):
    """Pitfall 7: bad task_template caught + next_run_at NOT advanced (so SAPI-04 sees lag)."""
    from cmc.db.models.schedules import Schedule
    from cmc.db.models.tasks import Task
    from cmc.dispatcher.materialize import materialize_due_schedules

    now = datetime.now(timezone.utc)
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        async with sessions() as db:
            db.add_all([
                Schedule(name="bad", cron="*/5 * * * *", enabled=True,
                         next_run_at=now,
                         task_template={"priorty": 5}),  # typo: 'priorty'
                Schedule(name="good", cron="*/5 * * * *", enabled=True,
                         next_run_at=now,
                         task_template={"title": "ok-task"}),
            ])
            await db.commit()

        async with sessions() as db:
            created = await materialize_due_schedules(db)
        # Only the good schedule materialized.
        assert len(created) == 1

        async with sessions() as db:
            tasks = (await db.execute(select(Task))).scalars().all()
            scheds = (
                await db.execute(select(Schedule).order_by(Schedule.name))
            ).scalars().all()
        assert len(tasks) == 1
        assert tasks[0].title == "ok-task"

        bad, good = scheds  # alpha order: 'bad' < 'good'
        assert bad.name == "bad"
        # Pitfall 7 contract: bad schedule's next_run_at NOT advanced.
        bad_nra = (bad.next_run_at if bad.next_run_at.tzinfo
                   else bad.next_run_at.replace(tzinfo=timezone.utc))
        assert bad_nra == now or bad_nra <= now  # untouched
        # Good schedule advanced.
        good_nra = (good.next_run_at if good.next_run_at.tzinfo
                    else good.next_run_at.replace(tzinfo=timezone.utc))
        assert good_nra > now
    finally:
        await engine.dispose()


# ---- heartbeat.py tests -----------------------------------------------------


@pytest.mark.asyncio
async def test_disp02_emergency_stop_early_return(
    test_settings, monkeypatch, tmp_pid_dir_monkey, mock_psutil_pids
):
    """DISP-02: when system_state.emergency_stop='1', sweep/claim/materialize skipped.

    Tick stamp must STILL be written (Pitfall 5).
    """
    from cmc.db.models.system_state import SystemState
    from cmc.dispatcher import heartbeat as hb

    mock_psutil_pids(set())

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        async with sessions() as db:
            db.add(SystemState(key="emergency_stop", value="1",
                               updated_at=datetime.now(timezone.utc)))
            await db.commit()

        # Force run_one_cycle to use OUR engine (not load_settings()).
        from cmc.db import make_sessionmaker

        async def _build():
            return engine, make_sessionmaker(engine)

        # Track call counts on sweep / claim / materialize.
        sweep_calls: list[int] = []
        materialize_calls: list[int] = []
        claim_calls: list[int] = []
        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.sweep_stale_pids",
            lambda: (sweep_calls.append(1), set())[1],
        )

        async def _fake_materialize(db):
            materialize_calls.append(1)
            return []

        async def _fake_claim(eng, slots):
            claim_calls.append(slots)
            return []

        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.materialize_due_schedules", _fake_materialize
        )
        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.claim_pending_tasks", _fake_claim
        )

        # Patch engine + sessionmaker construction so run_one_cycle uses our DB.
        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.create_engine_for_settings", lambda s: engine
        )
        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.make_sessionmaker", lambda e: sessions
        )
        # Disable engine.dispose() so our engine survives the test (we own it).
        # heartbeat's `await engine.dispose()` runs at end of run_one_cycle;
        # we let it run — AsyncEngine.dispose is idempotent. Subsequent
        # session-factory calls via the (patched) sessions = sessionmaker
        # still work because async_sessionmaker holds its own engine ref and
        # dispose only closes the connection pool (a fresh connection is
        # acquired on next session() use). We confirmed by reading the
        # SQLAlchemy 2.0 source: `engine.dispose()` calls `pool.dispose()`
        # which is safe to call multiple times.

        rc = await hb.run_one_cycle()
        assert rc == 0

        # Sweep / claim / materialize must NOT have run.
        assert sweep_calls == []
        assert materialize_calls == []
        assert claim_calls == []

        # But tick stamp WAS written.
        async with sessions() as db:
            row = (
                await db.execute(
                    select(SystemState).where(
                        SystemState.key == "dispatcher_last_tick_at"
                    )
                )
            ).scalar_one_or_none()
        assert row is not None
        assert row.value is not None
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_disp01_one_cycle_smoke(
    test_settings, monkeypatch, tmp_pid_dir_monkey, mock_psutil_pids
):
    """End-to-end smoke: 1 due schedule + 0 pending tasks → materialize creates Task,
    claim runs (claims the just-materialized row), tick stamp written."""
    from cmc.db.models.schedules import Schedule
    from cmc.db.models.system_state import SystemState
    from cmc.db.models.tasks import Task
    from cmc.dispatcher import heartbeat as hb

    mock_psutil_pids(set())

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        now = datetime.now(timezone.utc)
        async with sessions() as db:
            db.add(
                Schedule(
                    name="due", cron="*/5 * * * *", enabled=True, next_run_at=now,
                    task_template={"title": "auto-from-sched", "execution_mode": "classic"},
                )
            )
            await db.commit()

        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.create_engine_for_settings", lambda s: engine
        )
        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.make_sessionmaker", lambda e: sessions
        )
        # heartbeat's `await engine.dispose()` runs at end of run_one_cycle;
        # we let it run — AsyncEngine.dispose is idempotent. Subsequent
        # session-factory calls via the (patched) sessions = sessionmaker
        # still work because async_sessionmaker holds its own engine ref and
        # dispose only closes the connection pool (a fresh connection is
        # acquired on next session() use). We confirmed by reading the
        # SQLAlchemy 2.0 source: `engine.dispose()` calls `pool.dispose()`
        # which is safe to call multiple times.

        rc = await hb.run_one_cycle()
        assert rc == 0

        async with sessions() as db:
            tasks = (await db.execute(select(Task))).scalars().all()
            tick = (
                await db.execute(
                    select(SystemState).where(
                        SystemState.key == "dispatcher_last_tick_at"
                    )
                )
            ).scalar_one_or_none()
        assert len(tasks) == 1
        assert tasks[0].title == "auto-from-sched"
        # Plan-01 contract: claim flips status to 'running'; per-task fan-out is TODO.
        assert tasks[0].status == "running"
        assert tick is not None
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_disp04_concurrency_cap(
    test_settings, monkeypatch, tmp_pid_dir_monkey, mock_psutil_pids
):
    """slots = max(0, max_concurrent - len(live_pids)); 0 slots = no claim."""
    from cmc.db.models.tasks import Task
    from cmc.dispatcher import heartbeat as hb
    from cmc.dispatcher.state import write_pid_file

    # 3 live PIDs → fills the default max_concurrent=3 cap.
    write_pid_file(101, 71111)
    write_pid_file(102, 72222)
    write_pid_file(103, 73333)
    mock_psutil_pids({71111, 72222, 73333})

    engine, sessions = await _bootstrap_db(test_settings)
    try:
        now = datetime.now(timezone.utc)
        async with sessions() as db:
            db.add_all([
                Task(title=f"t{i}", priority=3, status="pending", created_at=now)
                for i in range(5)
            ])
            await db.commit()

        claim_call_args: list[int] = []
        real_claim = hb.claim_pending_tasks

        async def _spy_claim(eng, slots):
            claim_call_args.append(slots)
            return await real_claim(eng, slots)

        monkeypatch.setattr("cmc.dispatcher.heartbeat.claim_pending_tasks", _spy_claim)
        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.create_engine_for_settings", lambda s: engine
        )
        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.make_sessionmaker", lambda e: sessions
        )
        # heartbeat's `await engine.dispose()` runs at end of run_one_cycle;
        # we let it run — AsyncEngine.dispose is idempotent. Subsequent
        # session-factory calls via the (patched) sessions = sessionmaker
        # still work because async_sessionmaker holds its own engine ref and
        # dispose only closes the connection pool (a fresh connection is
        # acquired on next session() use). We confirmed by reading the
        # SQLAlchemy 2.0 source: `engine.dispose()` calls `pool.dispose()`
        # which is safe to call multiple times.

        rc = await hb.run_one_cycle()
        assert rc == 0

        # slots = 0 → claim should not be called at all (early return path).
        # Either claim_call_args == [] (early return before claim_pending_tasks call)
        # OR claim_call_args == [0] (defensive call returning []).
        # The plan's heartbeat skeleton early-returns on slots == 0.
        assert claim_call_args == [] or claim_call_args == [0]

        async with sessions() as db:
            running = (
                await db.execute(select(Task).where(Task.status == "running"))
            ).scalars().all()
        assert running == []
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_disp_tick_stamp_on_exception(
    test_settings, monkeypatch, tmp_pid_dir_monkey, mock_psutil_pids
):
    """Pitfall 5: stamp_tick runs even when sweep raises (try/finally)."""
    from cmc.db.models.system_state import SystemState
    from cmc.dispatcher import heartbeat as hb

    mock_psutil_pids(set())
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        def _raise():
            raise RuntimeError("synthetic sweep failure")

        monkeypatch.setattr("cmc.dispatcher.heartbeat.sweep_stale_pids", _raise)
        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.create_engine_for_settings", lambda s: engine
        )
        monkeypatch.setattr(
            "cmc.dispatcher.heartbeat.make_sessionmaker", lambda e: sessions
        )
        # heartbeat's `await engine.dispose()` runs at end of run_one_cycle;
        # we let it run — AsyncEngine.dispose is idempotent. Subsequent
        # session-factory calls via the (patched) sessions = sessionmaker
        # still work because async_sessionmaker holds its own engine ref and
        # dispose only closes the connection pool (a fresh connection is
        # acquired on next session() use). We confirmed by reading the
        # SQLAlchemy 2.0 source: `engine.dispose()` calls `pool.dispose()`
        # which is safe to call multiple times.

        with pytest.raises(RuntimeError, match="synthetic sweep failure"):
            await hb.run_one_cycle()

        async with sessions() as db:
            tick = (
                await db.execute(
                    select(SystemState).where(
                        SystemState.key == "dispatcher_last_tick_at"
                    )
                )
            ).scalar_one_or_none()
        assert tick is not None  # tick stamp survived the exception
    finally:
        await engine.dispose()


# ---- Plan 08-02 — DISP-10 model resolver ------------------------------------


def test_disp10_model_resolution_task_wins(clean_env, test_settings):
    """task.model wins over skill, env, settings."""
    from cmc.db.models.skills import Skill
    from cmc.dispatcher.model_resolve import resolve_model

    skill = Skill(
        name="x", environment="personal", path="/tmp/x.md",
        frontmatter={"model": "claude-opus-4"},
    )
    task = {"model": "claude-haiku-4-5"}
    os.environ["CMC_DEFAULT_MODEL"] = "claude-sonnet-4"
    try:
        assert resolve_model(task, skill, test_settings) == "claude-haiku-4-5"
    finally:
        del os.environ["CMC_DEFAULT_MODEL"]


def test_disp10_model_resolution_skill_frontmatter(clean_env, test_settings):
    """skill.frontmatter['model'] wins when task.model is None."""
    from cmc.db.models.skills import Skill
    from cmc.dispatcher.model_resolve import resolve_model

    skill = Skill(
        name="x", environment="personal", path="/tmp/x.md",
        frontmatter={"model": "claude-opus-4"},
    )
    task = {"model": None}
    assert resolve_model(task, skill, test_settings) == "claude-opus-4"


def test_disp10_model_resolution_env_override(clean_env, monkeypatch, test_settings):
    """CMC_DEFAULT_MODEL env wins when task.model + skill.frontmatter.model both empty."""
    from cmc.dispatcher.model_resolve import resolve_model

    monkeypatch.setenv("CMC_DEFAULT_MODEL", "claude-sonnet-4")
    task = {"model": None}
    assert resolve_model(task, None, test_settings) == "claude-sonnet-4"


def test_disp10_model_resolution_default_fallback(clean_env, test_settings):
    """Falls through to settings.claude_default_model when nothing else set."""
    from cmc.dispatcher.model_resolve import resolve_model

    # Ensure CMC_DEFAULT_MODEL not set (clean_env doesn't strip it).
    os.environ.pop("CMC_DEFAULT_MODEL", None)
    task = {"model": None}
    assert resolve_model(task, None, test_settings) == test_settings.claude_default_model
    assert resolve_model(task, None, test_settings) == "sonnet"


def test_disp10_model_resolution_skill_without_frontmatter(clean_env, test_settings):
    """Skill with empty/missing frontmatter falls through cleanly."""
    from cmc.db.models.skills import Skill
    from cmc.dispatcher.model_resolve import resolve_model

    os.environ.pop("CMC_DEFAULT_MODEL", None)
    skill_empty_fm = Skill(
        name="x", environment="personal", path="/tmp/x.md", frontmatter={}
    )
    task = {"model": None}
    assert resolve_model(task, skill_empty_fm, test_settings) == "sonnet"

    skill_no_model_key = Skill(
        name="y", environment="personal", path="/tmp/y.md",
        frontmatter={"description": "no model here"},
    )
    assert resolve_model(task, skill_no_model_key, test_settings) == "sonnet"


# ---- Plan 08-02 — DISP-05 classic runner -----------------------------------


def _classic_cmd_args() -> tuple[str, list[str]]:
    """Returns (claude_bin, prefix-args) so run_classic spawns the fake.

    We point claude_bin at sys.executable. The fake is invoked as
    `python -m tests.fixtures.fake_claude_classic ...`. The first positional arg
    in run_classic's cmd is settings.claude_bin; we cannot stuff `-m` between bin
    and prompt, so instead we shim claude_bin to a shell-script wrapper. Simpler:
    write a small wrapper script to tmp_path and chmod +x.
    """
    raise NotImplementedError


def _write_fake_claude_wrapper(tmp_path, fixture_extra_args=()) -> "Path":
    """Write a small executable shim that delegates to fake_claude_classic.py.

    Returns a Path the runner can use as settings.claude_bin. The wrapper
    *prepends* `fixture_extra_args` (e.g. --print-pid-file) before passing the
    real Popen-supplied argv through, so tests can flip behavior via env vars
    or extra flags without rewriting run_classic's cmd construction.
    """
    import stat
    import sys as _sys
    from pathlib import Path as _Path

    extra = " ".join(fixture_extra_args)
    fixture_path = (
        _Path(__file__).resolve().parent / "fixtures" / "fake_claude_classic.py"
    )
    wrapper = tmp_path / "fake_claude.sh"
    wrapper.write_text(
        f'#!/bin/sh\n'
        f'exec "{_sys.executable}" "{fixture_path}" {extra} "$@"\n'
    )
    wrapper.chmod(wrapper.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return wrapper


@pytest.mark.asyncio
async def test_disp05_classic_happy_path(
    test_settings, tmp_path, tmp_pid_dir_monkey, monkeypatch
):
    """DISP-05 happy path: pending classic task → done, PID file unlinked, ended_at set."""
    from cmc.db.models.tasks import Task
    from cmc.dispatcher.run_classic import run_classic

    wrapper = _write_fake_claude_wrapper(tmp_path)
    settings = test_settings.model_copy(update={"claude_bin": wrapper})

    engine, sessions = await _bootstrap_db(settings)
    try:
        async with sessions() as db:
            t = Task(
                title="hi", description="run me", status="running",
                execution_mode="classic", priority=3,
                created_at=datetime.now(timezone.utc),
            )
            db.add(t)
            await db.commit()
            await db.refresh(t)
            task_id = t.id

        task_row = {
            "id": task_id, "title": "hi", "description": "run me",
            "model": None, "timeout_s": 60, "execution_mode": "classic",
        }

        # run_classic is sync; run in thread to keep the event loop responsive.
        await asyncio.to_thread(run_classic, task_row, settings, sessions)

        async with sessions() as db:
            refreshed = (
                await db.execute(select(Task).where(Task.id == task_id))
            ).scalar_one()
        assert refreshed.status == "done"
        assert refreshed.ended_at is not None
        assert not (tmp_pid_dir_monkey / f"{task_id}.pid").exists()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_disp05_classic_writes_pid_immediately(
    test_settings, tmp_path, tmp_pid_dir_monkey, monkeypatch
):
    """Pitfall 10: PID file exists DURING the subprocess run, not just after."""
    from cmc.db.models.tasks import Task
    from cmc.dispatcher.run_classic import run_classic

    # Have the fake write its pid to a marker file, then sleep 1s so we can stat
    # the parent's PID file *while the subprocess is still alive*.
    marker = tmp_path / "child.pid"
    wrapper = _write_fake_claude_wrapper(
        tmp_path, fixture_extra_args=["--print-pid-file", str(marker)]
    )
    settings = test_settings.model_copy(update={"claude_bin": wrapper})

    engine, sessions = await _bootstrap_db(settings)
    try:
        async with sessions() as db:
            t = Task(
                title="x", description="x", status="running",
                execution_mode="classic", priority=3,
                created_at=datetime.now(timezone.utc),
            )
            db.add(t)
            await db.commit()
            await db.refresh(t)
            task_id = t.id

        task_row = {
            "id": task_id, "title": "x", "description": "x",
            "model": None, "timeout_s": 30,
        }

        # Spawn run_classic in a background thread, then poll for PID file
        # presence WHILE the child is still alive.
        async def _run():
            return await asyncio.to_thread(run_classic, task_row, settings, sessions)

        task_future = asyncio.create_task(_run())

        # Wait for the marker file (proof the child has started). Then assert
        # the parent's PID file exists at that moment (Pitfall 10).
        deadline = asyncio.get_event_loop().time() + 5.0
        while asyncio.get_event_loop().time() < deadline:
            if marker.exists():
                break
            await asyncio.sleep(0.05)
        assert marker.exists(), "child fixture did not start in time"

        pid_file = tmp_pid_dir_monkey / f"{task_id}.pid"
        # The fixture sleeps 1s after writing its marker, giving us a window.
        assert pid_file.exists(), "PID file must exist while subprocess is alive (Pitfall 10)"

        await task_future

        # After completion the PID file is unlinked.
        assert not pid_file.exists()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_disp05_classic_nonzero_exit(
    test_settings, tmp_path, tmp_pid_dir_monkey
):
    """Nonzero exit → status=failed, error_message contains 'nonzero exit 7', PID unlinked."""
    from cmc.db.models.tasks import Task
    from cmc.dispatcher.run_classic import run_classic

    wrapper = _write_fake_claude_wrapper(
        tmp_path, fixture_extra_args=["--exit-code", "7"]
    )
    settings = test_settings.model_copy(update={"claude_bin": wrapper})

    engine, sessions = await _bootstrap_db(settings)
    try:
        async with sessions() as db:
            t = Task(
                title="boom", description="x", status="running",
                execution_mode="classic", priority=3,
                created_at=datetime.now(timezone.utc),
            )
            db.add(t)
            await db.commit()
            await db.refresh(t)
            task_id = t.id

        task_row = {
            "id": task_id, "title": "boom", "description": "x",
            "model": None, "timeout_s": 30,
        }
        await asyncio.to_thread(run_classic, task_row, settings, sessions)

        async with sessions() as db:
            refreshed = (
                await db.execute(select(Task).where(Task.id == task_id))
            ).scalar_one()
        assert refreshed.status == "failed"
        assert "nonzero exit 7" in (refreshed.error_message or "")
        assert not (tmp_pid_dir_monkey / f"{task_id}.pid").exists()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_disp05_classic_timeout(
    test_settings, tmp_path, tmp_pid_dir_monkey
):
    """--hang fixture + timeout_s=2 → terminated, status=failed, error='timeout'."""
    from cmc.db.models.tasks import Task
    from cmc.dispatcher.run_classic import run_classic

    wrapper = _write_fake_claude_wrapper(tmp_path, fixture_extra_args=["--hang"])
    settings = test_settings.model_copy(update={"claude_bin": wrapper})

    engine, sessions = await _bootstrap_db(settings)
    try:
        async with sessions() as db:
            t = Task(
                title="slow", description="x", status="running",
                execution_mode="classic", priority=3,
                created_at=datetime.now(timezone.utc),
            )
            db.add(t)
            await db.commit()
            await db.refresh(t)
            task_id = t.id

        task_row = {
            "id": task_id, "title": "slow", "description": "x",
            "model": None, "timeout_s": 2,
        }
        await asyncio.to_thread(run_classic, task_row, settings, sessions)

        async with sessions() as db:
            refreshed = (
                await db.execute(select(Task).where(Task.id == task_id))
            ).scalar_one()
        assert refreshed.status == "failed"
        assert refreshed.error_message == "timeout"
        assert not (tmp_pid_dir_monkey / f"{task_id}.pid").exists()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_disp05_classic_scrubs_anthropic_key(
    test_settings, tmp_path, tmp_pid_dir_monkey, monkeypatch
):
    """Pitfall 8: ANTHROPIC_API_KEY is removed from the Popen env."""
    from cmc.db.models.tasks import Task
    from cmc.dispatcher import run_classic as rc_module
    from cmc.dispatcher.run_classic import run_classic

    monkeypatch.setenv("ANTHROPIC_API_KEY", "secret-must-not-leak")

    wrapper = _write_fake_claude_wrapper(tmp_path)
    settings = test_settings.model_copy(update={"claude_bin": wrapper})

    engine, sessions = await _bootstrap_db(settings)
    try:
        async with sessions() as db:
            t = Task(
                title="ok", description="x", status="running",
                execution_mode="classic", priority=3,
                created_at=datetime.now(timezone.utc),
            )
            db.add(t)
            await db.commit()
            await db.refresh(t)
            task_id = t.id

        # Spy on subprocess.Popen to capture the env it received.
        captured_env: list[dict] = []
        real_popen = rc_module.subprocess.Popen

        def _spy_popen(cmd, **kwargs):
            captured_env.append(dict(kwargs.get("env") or {}))
            return real_popen(cmd, **kwargs)

        monkeypatch.setattr(rc_module.subprocess, "Popen", _spy_popen)

        task_row = {
            "id": task_id, "title": "ok", "description": "x",
            "model": None, "timeout_s": 30,
        }
        await asyncio.to_thread(run_classic, task_row, settings, sessions)

        assert captured_env, "Popen was not called"
        assert "ANTHROPIC_API_KEY" not in captured_env[0]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_disp05_classic_passes_resolved_model(
    test_settings, tmp_path, tmp_pid_dir_monkey, monkeypatch
):
    """task.model='claude-opus-4' → Popen argv includes '--model' 'claude-opus-4'."""
    from cmc.db.models.tasks import Task
    from cmc.dispatcher import run_classic as rc_module
    from cmc.dispatcher.run_classic import run_classic

    wrapper = _write_fake_claude_wrapper(tmp_path)
    settings = test_settings.model_copy(update={"claude_bin": wrapper})

    engine, sessions = await _bootstrap_db(settings)
    try:
        async with sessions() as db:
            t = Task(
                title="m", description="x", status="running",
                execution_mode="classic", priority=3,
                created_at=datetime.now(timezone.utc),
            )
            db.add(t)
            await db.commit()
            await db.refresh(t)
            task_id = t.id

        captured_cmd: list[list[str]] = []
        real_popen = rc_module.subprocess.Popen

        def _spy_popen(cmd, **kwargs):
            captured_cmd.append(list(cmd))
            return real_popen(cmd, **kwargs)

        monkeypatch.setattr(rc_module.subprocess, "Popen", _spy_popen)

        task_row = {
            "id": task_id, "title": "m", "description": "x",
            "model": "claude-opus-4", "timeout_s": 30,
        }
        await asyncio.to_thread(run_classic, task_row, settings, sessions)

        assert captured_cmd, "Popen was not called"
        argv = captured_cmd[0]
        # Sequential pair: '--model' immediately followed by 'claude-opus-4'.
        idx = argv.index("--model")
        assert argv[idx + 1] == "claude-opus-4"
    finally:
        await engine.dispose()


# ---- Plan 08-02 — DISP-12 plist template + render helper -------------------


def test_disp12_plist_template_exists():
    """Template file must be importable as a package resource."""
    from importlib.resources import files

    res = files("cmc.dispatcher.templates") / "com.cmc.dispatcher.plist.j2"
    assert res.is_file()


def test_disp12_render_substitutes_python_path(tmp_path):
    """python_path + repo_root substitute into the rendered output."""
    from cmc.dispatcher.plist_render import render_plist

    py = tmp_path / "venv" / "bin" / "python"
    py.parent.mkdir(parents=True)
    py.write_text("#!/bin/sh\nexec /usr/bin/python3 \"$@\"\n")

    repo = tmp_path / "repo"
    repo.mkdir()

    rendered = render_plist(py, repo)
    assert f"<string>{py.resolve()}</string>" in rendered
    assert f"<string>{repo.resolve()}</string>" in rendered


def test_disp12_render_includes_required_keys(tmp_path):
    """All launchd-required keys present in the rendered plist."""
    from cmc.dispatcher.plist_render import render_plist

    py = tmp_path / "py"
    py.write_text("")
    rendered = render_plist(py, tmp_path)

    required = [
        "<key>Label</key>",
        "<string>com.cmc.dispatcher</string>",
        "<key>StartInterval</key>",
        "<integer>120</integer>",
        "<key>RunAtLoad</key>",
        "<true/>",
        "<key>StandardOutPath</key>",
        "<key>StandardErrorPath</key>",
        "<key>ProcessType</key>",
        "<string>Background</string>",
        "<key>ProgramArguments</key>",
        "<key>WorkingDirectory</key>",
        "<key>EnvironmentVariables</key>",
    ]
    for marker in required:
        assert marker in rendered, f"missing required marker {marker!r}"


def test_disp12_render_path_env_includes_python_dir(tmp_path):
    """PATH env-var in plist must include parent dir of python_path."""
    from cmc.dispatcher.plist_render import render_plist

    py = tmp_path / "venv" / "bin" / "python"
    py.parent.mkdir(parents=True)
    py.write_text("")

    rendered = render_plist(py, tmp_path)
    # The PATH key should expose the venv's bin dir so claude (and other tools)
    # are findable via $PATH inside subprocesses spawned by the dispatcher.
    assert str(py.parent.resolve()) in rendered
    # Sanity: the substitution did not leave a literal placeholder behind.
    assert "${python_path_dir}" not in rendered


def test_disp12_render_no_anthropic_key(tmp_path):
    """Pitfall 8: ANTHROPIC_API_KEY must NEVER be embedded in the plist."""
    from cmc.dispatcher.plist_render import render_plist

    py = tmp_path / "py"
    py.write_text("")
    rendered = render_plist(py, tmp_path)
    assert "ANTHROPIC_API_KEY" not in rendered


def test_disp12_render_xml_parseable(tmp_path):
    """Rendered output is well-formed XML (no malformed substitution)."""
    import xml.etree.ElementTree as ET

    from cmc.dispatcher.plist_render import render_plist

    py = tmp_path / "py"
    py.write_text("")
    rendered = render_plist(py, tmp_path)
    # Must not throw — the `<plist version="1.0">` root must be well-formed.
    ET.fromstring(rendered)


def test_disp12_render_uses_venv_not_system_python(tmp_path):
    """DISP-12 pitfall: rendered plist points at venv python, NOT /usr/bin/python3."""
    from cmc.dispatcher.plist_render import render_plist

    py = tmp_path / "venv" / "bin" / "python"
    py.parent.mkdir(parents=True)
    py.write_text("")

    rendered = render_plist(py, tmp_path)
    # The ProgramArguments[0] should be the venv python, not the system one.
    assert f"<string>{py.resolve()}</string>" in rendered
    # /usr/bin/python3 must not sneak in as the entry-point.
    assert "/usr/bin/python3" not in rendered


# ---- Plan 08-02 — oneshot.py replacement ------------------------------------


def test_oneshot_main_replaces_stub(monkeypatch, capsys):
    """oneshot.main() runs run_one_cycle and returns its int exit code."""
    import cmc.dispatcher.oneshot as oneshot_mod

    sentinel = 42

    async def _fake_cycle():
        return sentinel

    # Replace the heartbeat module's run_one_cycle so main()'s import sees ours.
    monkeypatch.setattr(
        "cmc.dispatcher.heartbeat.run_one_cycle", _fake_cycle
    )

    rc = oneshot_mod.main()
    assert rc == sentinel

    out = capsys.readouterr()
    # No more Phase-4 stub message.
    assert "Phase-4 stub" not in out.out
    assert "Phase-4 stub" not in out.err


def test_oneshot_main_handles_exception(monkeypatch, capsys):
    """When run_one_cycle raises, main() returns 1 and logs to stderr."""
    import cmc.dispatcher.oneshot as oneshot_mod

    async def _explode():
        raise RuntimeError("synthetic cycle failure")

    monkeypatch.setattr(
        "cmc.dispatcher.heartbeat.run_one_cycle", _explode
    )

    rc = oneshot_mod.main()
    assert rc == 1

    err = capsys.readouterr().err
    assert "synthetic cycle failure" in err
