"""DISP-05 classic-mode runner.

Spawns `claude -p PROMPT --bare --output-format json --model MODEL` as a
synchronous subprocess and updates the task row to done|failed when the child
exits or times out.

Synchronous on purpose: Plan 08-04 will spawn this from a `threading.Thread`
inside the heartbeat fan-out (see RESEARCH §Pattern 4). The DB writes happen
via `asyncio.run(_mark_status(...))` because each thread gets its own loop.

Pitfalls covered:
- Pitfall 8 (env scrub): ANTHROPIC_API_KEY is removed from the child's env so a
  rogue MCP server / prompt cannot exfiltrate the operator's key.
- Pitfall 10 (PID-file timing): write_pid_file is called IMMEDIATELY after
  Popen returns, before any wait/communicate. ESTOP-08 needs the PID visible
  on disk the instant the child becomes killable.
- Pitfall 11 (subprocess hang): timeout enforced via communicate(timeout=...);
  on TimeoutExpired we terminate(), wait ≤10s, then kill().
- PID file ALWAYS unlinked in finally — even on Popen FileNotFoundError.

This module does NOT manage status transitions beyond done|failed. The
heartbeat's claim step has already flipped pending→running; we only stamp
ended_at + status + error_message at the end.
"""
from __future__ import annotations

import logging
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional

from cmc.core.paths import repo_root
from cmc.dispatcher.model_resolve import resolve_model
from cmc.dispatcher.state import unlink_pid_file, write_pid_file

log = logging.getLogger(__name__)


def run_classic(
    task_row: Mapping[str, Any],
    settings,
    sessions,
    *,
    skill: Optional[Any] = None,
) -> None:
    """One classic-mode subprocess; sync — caller spawns it on a thread.

    Args:
        task_row: claim_pending_tasks-shaped dict containing 'id',
                  'description'/'title', optional 'model', optional 'timeout_s'.
        settings: cmc.config.Settings (provides claude_bin, claude_default_model,
                  dispatcher_classic_timeout_s).
        sessions: async_sessionmaker. Used inside _mark_status via asyncio.run.
        skill:    Optional Skill ORM instance (forwarded to resolve_model).

    Returns:
        None. Side effects: subprocess spawn, PID file r/w, task row update.

    Failure modes (all → status='failed' + error_message + PID unlinked):
      - claude_bin missing               → 'spawn failed: <FileNotFoundError>'
      - subprocess returncode != 0       → 'nonzero exit <code>'
      - subprocess.communicate timeout   → 'timeout'
    """
    task_id = int(task_row["id"])
    model = resolve_model(task_row, skill, settings)
    timeout_s = int(task_row.get("timeout_s") or settings.dispatcher_classic_timeout_s)

    # Per-task log file (forensics: stderr + stdout merge here).
    log_dir = repo_root() / ".tmp" / "mission-control-queue" / "dispatcher-logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"task-{task_id}-{int(datetime.now().timestamp())}.log"

    # Pitfall 8: scrub ANTHROPIC_API_KEY before spawn. The skill router
    # (Plan 03) will inject ANTHROPIC_API_KEY into stream-mode subprocesses
    # only when explicitly required; classic mode never needs it.
    env = os.environ.copy()
    env.pop("ANTHROPIC_API_KEY", None)

    prompt = task_row.get("description") or task_row.get("title") or ""
    cmd = [
        str(settings.claude_bin),
        "-p", prompt,
        "--bare",
        "--output-format", "json",
        "--model", model,
    ]

    proc: Optional[subprocess.Popen] = None
    log_fp = open(log_path, "ab", buffering=0)
    try:
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(repo_root()),
                stdout=subprocess.PIPE,
                stderr=log_fp,
                stdin=subprocess.DEVNULL,
                env=env,
                close_fds=True,
            )
        except FileNotFoundError as exc:
            log.error(
                "dispatcher.run_classic.spawn_failed",
                extra={"task_id": task_id, "err": str(exc)},
            )
            _mark_failed_sync(task_id, f"spawn failed: {exc}", sessions)
            return

        # Pitfall 10: write PID file IMMEDIATELY, before any wait/communicate.
        # ESTOP-08's killer must see the PID on disk the moment the child is
        # killable.
        write_pid_file(task_id, proc.pid)

        try:
            stdout_bytes, _stderr_unused = proc.communicate(timeout=timeout_s)
        except subprocess.TimeoutExpired:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
            _mark_failed_sync(task_id, "timeout", sessions)
            return

        # Capture stdout into the per-task log file for forensics.
        if stdout_bytes:
            log_fp.write(stdout_bytes)

        if proc.returncode != 0:
            _mark_failed_sync(
                task_id, f"nonzero exit {proc.returncode}", sessions
            )
        else:
            _mark_done_sync(task_id, sessions)
    finally:
        try:
            log_fp.close()
        except Exception:
            pass
        # ALWAYS unlink — even on Popen FileNotFoundError or mid-flight crash.
        unlink_pid_file(task_id)


def _mark_failed_sync(task_id: int, error_message: str, sessions) -> None:
    """Sync wrapper around an async DB update.

    Uses asyncio.run because run_classic is invoked from a Thread (Plan 04
    fan-out). Each thread gets its own event loop. Standard sync→async bridge
    pattern — verified safe in Phase 4 spawn tests.
    """
    import asyncio

    asyncio.run(_mark_status(task_id, "failed", error_message, sessions))


def _mark_done_sync(task_id: int, sessions) -> None:
    """Sync wrapper for status='done' DB update."""
    import asyncio

    asyncio.run(_mark_status(task_id, "done", None, sessions))


async def _mark_status(
    task_id: int, status: str, error_message: Optional[str], sessions
) -> None:
    """Async DB update — set status + ended_at (+ optional error_message)."""
    from sqlalchemy import update as _upd

    from cmc.db.models.tasks import Task

    now = datetime.now(timezone.utc)
    async with sessions() as db:
        values: dict[str, Any] = {"status": status, "ended_at": now}
        if error_message is not None:
            values["error_message"] = error_message
        await db.execute(_upd(Task).where(Task.id == task_id).values(**values))
        await db.commit()
