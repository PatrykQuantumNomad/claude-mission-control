"""TASK-07 dispatcher trigger. RESEARCH §Pattern 6 + Pitfalls 2 + 10."""
from __future__ import annotations

import subprocess
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from cmc.core.paths import repo_root

if TYPE_CHECKING:
    from cmc.config.settings import Settings


def spawn_dispatcher_oneshot(settings: "Settings") -> int:
    """Spawn a detached one-shot dispatcher run, return its PID. Does NOT wait.

    Pitfall 2: start_new_session=True isolates the dispatcher from FastAPI's
    signal disposition (Ctrl+C on uvicorn no longer kills the dispatcher).
    Pitfall 10: stdout/stderr file handle is opened, passed to Popen, then
    CLOSED locally in finally — subprocess keeps its own dup so the FD does
    not leak.
    """
    log_dir = repo_root() / ".tmp" / "mission-control-queue" / "dispatcher-logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    log_path = log_dir / f"oneshot-{ts}.log"
    log_fp = open(log_path, "ab", buffering=0)
    try:
        proc = subprocess.Popen(
            list(settings.dispatcher_oneshot_cmd),
            cwd=str(repo_root()),
            stdout=log_fp,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
            close_fds=True,
        )
        return proc.pid
    finally:
        log_fp.close()
