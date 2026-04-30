"""DISP-03: prune stale .pid files; return live-PID set for concurrency cap input.

Goal: every cycle, walk {pid_dir}/*.pid, validate via psutil.pid_exists, unlink
the dead ones, and return the set of live PIDs. The dispatcher uses
len(live_pids) to compute the DISP-04 concurrency cap (slots = max - live).

Garbage tolerance: non-numeric .pid contents (race-write, manual edit) are
treated as dead — file unlinked, no error raised.
"""

import logging

import psutil

from cmc.dispatcher.state import pid_dir

log = logging.getLogger(__name__)


def sweep_stale_pids() -> set[int]:
    """Walk pid_dir, return live PIDs, unlink dead files. Idempotent."""
    d = pid_dir()
    if not d.exists():
        return set()
    live: set[int] = set()
    for f in sorted(d.glob("*.pid")):
        try:
            pid = int(f.read_text().strip())
        except (ValueError, FileNotFoundError):
            # Garbage or race-deleted; clean up and move on.
            try:
                f.unlink()
            except FileNotFoundError:
                pass
            continue
        if psutil.pid_exists(pid):
            live.add(pid)
        else:
            try:
                f.unlink()
            except FileNotFoundError:
                pass
            log.info(
                "dispatcher.sweep.unlinked_stale", extra={"pid": pid, "file": str(f)}
            )
    return live
