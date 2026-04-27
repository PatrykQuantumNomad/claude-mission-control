"""Cross-cutting dispatcher state: PID files, tick stamp, MAX_CONCURRENT.

All write paths are atomic (os.replace for PID files; UPSERT for tick stamp)
to avoid Pitfall 10 (mid-spawn SIGTERM losing the PID reference).

Plan 08-01 ships the helpers; Plans 08-02..04 wire run_classic / run_stream
through write_pid_file / unlink_pid_file as the canonical ESTOP-08 contract.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import psutil
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from cmc.config import load_settings
from cmc.core.process import pid_dir as _phase4_pid_dir
from cmc.db.models.system_state import SystemState

# Historical default; runtime callers should prefer max_concurrent() to honor env overrides.
MAX_CONCURRENT = 3


def pid_dir() -> Path:
    """Re-export Phase 4 pid_dir; centralizes the import for dispatcher modules.

    Tests monkeypatch `cmc.dispatcher.state._phase4_pid_dir` so we always call
    through the module-level binding (do NOT inline the import).
    """
    return _phase4_pid_dir()


def write_pid_file(task_id: int, pid: int) -> Path:
    """Atomically write {pid_dir}/{task_id}.pid via tmp + os.replace.

    Pitfall 10 mitigation: must happen IMMEDIATELY after Popen, before any
    wait/read. The tmp + rename dance guarantees a reader never sees a
    partially-written file (POSIX rename is atomic on the same filesystem).
    """
    d = pid_dir()
    d.mkdir(parents=True, exist_ok=True)
    final = d / f"{int(task_id)}.pid"
    tmp = d / f".{int(task_id)}.pid.tmp"
    tmp.write_text(str(int(pid)))
    os.replace(tmp, final)
    return final


def unlink_pid_file(task_id: int) -> None:
    """Remove {pid_dir}/{task_id}.pid; tolerate FileNotFoundError (idempotent)."""
    try:
        (pid_dir() / f"{int(task_id)}.pid").unlink()
    except FileNotFoundError:
        pass


def list_live_pids() -> set[int]:
    """Return the set of PIDs whose .pid files exist AND psutil considers alive.

    Race-deletion between glob() and read_text() is tolerated (FileNotFoundError
    -> skip). Used as input to the DISP-04 concurrency-cap calculation.
    """
    d = pid_dir()
    if not d.exists():
        return set()
    live: set[int] = set()
    for f in d.glob("*.pid"):
        try:
            pid = int(f.read_text().strip())
        except (ValueError, FileNotFoundError):
            continue
        if psutil.pid_exists(pid):
            live.add(pid)
    return live


async def stamp_tick(sessions) -> None:
    """UPSERT system_state.dispatcher_last_tick_at = now ISO UTC.

    Pitfall 5 mitigation: caller wraps run_one_cycle's body in try/finally so
    SAPI-04's liveness check sees a fresh tick stamp even when sweep / claim /
    materialize raise mid-cycle.
    """
    now = datetime.now(timezone.utc)
    iso = now.isoformat()
    async with sessions() as db:
        await db.execute(
            sqlite_insert(SystemState)
            .values(key="dispatcher_last_tick_at", value=iso, updated_at=now)
            .on_conflict_do_update(
                index_elements=["key"],
                set_={"value": iso, "updated_at": now},
            )
        )
        await db.commit()


def max_concurrent() -> int:
    """Resolve the runtime concurrency cap from Settings (honors env overrides)."""
    return load_settings().dispatcher_max_concurrent
