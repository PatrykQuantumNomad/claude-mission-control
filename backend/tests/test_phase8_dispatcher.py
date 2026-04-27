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
