"""Emergency Stop tests — ESTOP-01..04.

Test inventory (10 cases):
    - test_estop01_stop_with_no_pids_or_running_tasks
    - test_estop01_stop_with_pid_files_validates_via_ps
    - test_estop02_validate_pid_is_claude_positive
    - test_estop02_validate_pid_is_claude_negative_no_p_flag
    - test_estop02_validate_pid_is_claude_dead_pid
    - test_estop03_running_tasks_marked_failed
    - test_estop03_done_tasks_unchanged
    - test_estop04_resume_clears_flag
    - test_estop04_resume_no_prior_stop
    - test_estop_emergency_stop_visible_via_sapi03

Pitfall awareness:
    - Mock emergency_stop_all where it's IMPORTED in the router module
      (`cmc.api.routes.system.emergency_stop_all`), NOT where it's defined
      (`cmc.core.process.emergency_stop_all`). Python re-binds at import time,
      so patching the definition site does nothing.
    - All tests that exercise POST /api/system/emergency-stop monkeypatch
      emergency_stop_all to a stub — we never SIGTERM real PIDs in tests.
"""
import os
from datetime import datetime

from sqlalchemy import select

# ---- Helpers ----


async def _seed_running_tasks(app, n: int = 2) -> list[int]:
    """Insert N tasks with status='running' via the seeded app's sessionmaker.
    Returns the list of inserted task ids.
    """
    from cmc.db.models.tasks import Task

    from .conftest import make_task_row

    ids: list[int] = []
    sessionmaker = app.state.sessions
    async with sessionmaker() as db:
        for i in range(n):
            row = make_task_row(title=f"running-{i}", status="running")
            t = Task(**row)
            db.add(t)
            await db.commit()
            await db.refresh(t)
            ids.append(t.id)
    return ids


async def _seed_task(app, **overrides) -> int:
    """Insert a single task with the given overrides; return its id."""
    from cmc.db.models.tasks import Task

    from .conftest import make_task_row

    sessionmaker = app.state.sessions
    async with sessionmaker() as db:
        row = make_task_row(**overrides)
        t = Task(**row)
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t.id


async def _read_system_state(app, key: str):
    """Return the SystemState row for `key`, or None if absent."""
    from cmc.db.models.system_state import SystemState

    sessionmaker = app.state.sessions
    async with sessionmaker() as db:
        return (
            await db.execute(select(SystemState).where(SystemState.key == key))
        ).scalar_one_or_none()


async def _read_task(app, task_id: int):
    """Return the Task row for `task_id`, or None if absent."""
    from cmc.db.models.tasks import Task

    sessionmaker = app.state.sessions
    async with sessionmaker() as db:
        return (
            await db.execute(select(Task).where(Task.id == task_id))
        ).scalar_one_or_none()


def _stub_empty_summary(monkeypatch):
    """Patch the router-side import of emergency_stop_all to return an empty
    StopSummary. Use in tests that don't care about PID handling.
    """
    from cmc.core.process import StopSummary

    monkeypatch.setattr(
        "cmc.api.routes.system.emergency_stop_all",
        lambda: StopSummary(terminated=[], skipped=[], missing=[]),
    )


# ---- Test 1: ESTOP-01 happy path no-op ----


async def test_estop01_stop_with_no_pids_or_running_tasks(
    seeded_app, client, monkeypatch
) -> None:
    """ESTOP-01: POST /emergency-stop with no PID files + no running tasks
    returns 200 with all-empty PID lists, 0 failed_running_tasks, and the
    flag flip persists to system_state.emergency_stop='1'.
    """
    app, _cm = seeded_app
    _stub_empty_summary(monkeypatch)

    response = await client.post("/api/system/emergency-stop")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "emergency_stop": True,
        "terminated_pids": [],
        "skipped_pids": [],
        "missing_pids": [],
        "failed_running_tasks": 0,
    }

    # Flag flipped to '1' in system_state
    row = await _read_system_state(app, "emergency_stop")
    assert row is not None
    assert row.value == "1"


# ---- Test 2: ESTOP-01 PID file scan path (validation via ps) ----


async def test_estop01_stop_with_pid_files_validates_via_ps(
    seeded_app, client, monkeypatch
) -> None:
    """ESTOP-01: POST /emergency-stop reports skipped_pids when emergency_stop_all
    rejects PIDs that fail the ps validation. We stub the helper so the test
    does not actually issue ps or SIGTERM.
    """
    from cmc.core.process import StopSummary

    monkeypatch.setattr(
        "cmc.api.routes.system.emergency_stop_all",
        lambda: StopSummary(terminated=[], skipped=[12345, 999999], missing=[]),
    )

    response = await client.post("/api/system/emergency-stop")

    assert response.status_code == 200
    body = response.json()
    assert body["skipped_pids"] == [12345, 999999]
    assert body["terminated_pids"] == []
    assert body["missing_pids"] == []
    assert body["emergency_stop"] is True


# ---- Test 3: ESTOP-02 validate_pid_is_claude positive (mocked ps) ----


def test_estop02_validate_pid_is_claude_positive(monkeypatch) -> None:
    """ESTOP-02: validate_pid_is_claude returns True when ps reports a command
    line containing both 'claude' AND ' -p'.

    We assert that the live test process (pytest, not claude -p) returns False
    via the un-mocked path, then we monkeypatch subprocess.run to fake a real
    `claude -p ...` cmdline and confirm True.
    """
    from cmc.core import process as proc_mod

    # Live: pytest is NOT a claude -p process.
    assert proc_mod.validate_pid_is_claude(os.getpid()) is False

    # Mocked: simulate `ps -p PID -o command=` returning a claude -p line.
    class _Fake:
        returncode = 0
        stdout = "claude -p hello world"

    monkeypatch.setattr(
        "cmc.core.process.subprocess.run",
        lambda *a, **kw: _Fake(),
    )
    assert proc_mod.validate_pid_is_claude(12345) is True


# ---- Test 4: ESTOP-02 negative — no ' -p' substring ----


def test_estop02_validate_pid_is_claude_negative_no_p_flag(monkeypatch) -> None:
    """ESTOP-02: 'claude --prefix=foo' must NOT pass validation — the literal
    ' -p' substring (with leading space) is required, so '--prefix' (which
    begins with '--p') correctly fails the heuristic.
    """
    from cmc.core import process as proc_mod

    class _Fake:
        returncode = 0
        stdout = "claude --prefix=foo"

    monkeypatch.setattr(
        "cmc.core.process.subprocess.run",
        lambda *a, **kw: _Fake(),
    )
    assert proc_mod.validate_pid_is_claude(12345) is False


# ---- Test 5: ESTOP-02 dead PID returns False ----


def test_estop02_validate_pid_is_claude_dead_pid(monkeypatch) -> None:
    """ESTOP-02: ps returncode != 0 (dead/missing PID) yields False."""
    from cmc.core import process as proc_mod

    class _Fake:
        returncode = 1
        stdout = ""

    monkeypatch.setattr(
        "cmc.core.process.subprocess.run",
        lambda *a, **kw: _Fake(),
    )
    assert proc_mod.validate_pid_is_claude(12345) is False


# ---- Test 6: ESTOP-03 running tasks transition to failed ----


async def test_estop03_running_tasks_marked_failed(
    seeded_app, client, monkeypatch
) -> None:
    """ESTOP-03: POST /emergency-stop UPDATEs every running task to
    status='failed', sets ended_at, and writes error_message='emergency stop'.
    """
    app, _cm = seeded_app
    _stub_empty_summary(monkeypatch)

    ids = await _seed_running_tasks(app, n=2)

    response = await client.post("/api/system/emergency-stop")
    assert response.status_code == 200
    assert response.json()["failed_running_tasks"] == 2

    for tid in ids:
        row = await _read_task(app, tid)
        assert row is not None
        assert row.status == "failed"
        assert row.ended_at is not None
        # Pitfall 4: tz-aware vs tz-naive — accept either.
        assert isinstance(row.ended_at, datetime)
        assert row.error_message == "emergency stop"


# ---- Test 7: ESTOP-03 done tasks untouched ----


async def test_estop03_done_tasks_unchanged(
    seeded_app, client, monkeypatch
) -> None:
    """ESTOP-03: only `running` tasks transition to `failed`. Tasks already
    in a terminal state (`done`, `failed`) and `pending` tasks must be
    untouched by the WHERE status='running' filter.
    """
    app, _cm = seeded_app
    _stub_empty_summary(monkeypatch)

    running_id = await _seed_task(app, title="r-1", status="running")
    done_id = await _seed_task(app, title="d-1", status="done")

    response = await client.post("/api/system/emergency-stop")
    assert response.status_code == 200
    assert response.json()["failed_running_tasks"] == 1

    running_row = await _read_task(app, running_id)
    done_row = await _read_task(app, done_id)
    assert running_row.status == "failed"
    assert done_row.status == "done"  # untouched
    assert done_row.error_message is None  # untouched


# ---- Test 8: ESTOP-04 resume clears the flag (does NOT delete row) ----


async def test_estop04_resume_clears_flag(
    seeded_app, client, monkeypatch
) -> None:
    """ESTOP-04: POST /emergency-resume sets system_state.emergency_stop='0'.
    We UPDATE rather than DELETE so SAPI-03 sees an explicit value (not
    'absent', which is ambiguous).
    """
    app, _cm = seeded_app
    _stub_empty_summary(monkeypatch)

    # First, stop -> row.value == '1'
    await client.post("/api/system/emergency-stop")
    row = await _read_system_state(app, "emergency_stop")
    assert row is not None
    assert row.value == "1"

    # Then resume -> row.value == '0', row STILL EXISTS
    response = await client.post("/api/system/emergency-resume")
    assert response.status_code == 200
    assert response.json() == {"emergency_stop": False}

    row = await _read_system_state(app, "emergency_stop")
    assert row is not None  # NOT deleted
    assert row.value == "0"


# ---- Test 9: ESTOP-04 resume without prior stop (upsert path) ----


async def test_estop04_resume_no_prior_stop(seeded_app, client) -> None:
    """ESTOP-04: POST /emergency-resume with no prior /emergency-stop call
    still succeeds — the upsert creates the row at value='0'. Mirrors the
    stop-side upsert behavior (no read-before-write race).
    """
    app, _cm = seeded_app

    # Confirm no row exists yet
    assert await _read_system_state(app, "emergency_stop") is None

    response = await client.post("/api/system/emergency-resume")
    assert response.status_code == 200
    assert response.json() == {"emergency_stop": False}

    row = await _read_system_state(app, "emergency_stop")
    assert row is not None
    assert row.value == "0"


# ---- Test 10: SAPI-03 still surfaces emergency_stop after ESTOP write ----


async def test_estop_emergency_stop_visible_via_sapi03(
    seeded_app, client, monkeypatch
) -> None:
    """SAPI-03 whitelist includes 'emergency_stop'.
    After POST /emergency-stop writes the row, GET /api/system/state?key=emergency_stop
    must return {items: {emergency_stop: '1'}}. Cross-router contract guard:
    confirms the ESTOP write side and SAPI-03 read side agree on column shape.
    """
    _stub_empty_summary(monkeypatch)

    # Stop -> writes emergency_stop='1'
    response = await client.post("/api/system/emergency-stop")
    assert response.status_code == 200

    # SAPI-03 returns the value via the whitelisted key
    response = await client.get("/api/system/state?key=emergency_stop")
    assert response.status_code == 200
    assert response.json() == {"items": {"emergency_stop": "1"}}
