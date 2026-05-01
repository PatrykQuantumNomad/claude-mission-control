"""PID-file scan + ps validation for emergency stop."""

import os
import signal
import subprocess
from pathlib import Path
from typing import TypedDict

from cmc.core.paths import repo_root

PID_DIR_REL = ".tmp/mission-control-queue/pids"


class StopSummary(TypedDict):
    terminated: list[int]
    skipped: list[int]
    missing: list[int]


def pid_dir() -> Path:
    return repo_root() / PID_DIR_REL


def _read_pid(pid_file: Path) -> int | None:
    try:
        return int(pid_file.read_text().strip())
    except (OSError, ValueError):
        return None


def validate_pid_is_claude(pid: int) -> bool:
    """Return True iff PID alive AND command line contains 'claude' AND ' -p'.

    ESTOP-02: BSD `ps -p PID -o command=` (also works on GNU ps). Equals
    suffix on -o keyword strips the header. Heuristic match avoids false
    positives like `--prefix=claude` (the ' -p' substring requires the
    literal flag with leading space).
    """
    try:
        out = subprocess.run(
            ["ps", "-p", str(int(pid)), "-o", "command="],
            capture_output=True, text=True, timeout=2, check=False,
        )
    except (subprocess.TimeoutExpired, OSError):
        return False
    if out.returncode != 0:
        return False
    line = out.stdout.strip()
    if not line:
        return False
    return ("claude" in line) and (" -p" in line)


def emergency_stop_all(pid_directory: Path | None = None) -> StopSummary:
    """Scan pid_directory (default: repo .tmp/.../pids/), validate via ps,
    SIGTERM matching PIDs. Returns {terminated, skipped, missing} lists.

    ESTOP-01: SIGTERM (NOT SIGKILL) so the dispatcher's own shutdown handler
    can run. The race window between validate + kill is partly mitigated by
    treating ProcessLookupError as 'missing'.

    `pid_directory` parameter exists for tests (override to tmp dir).
    """
    d = pid_directory if pid_directory is not None else pid_dir()
    terminated: list[int] = []
    skipped: list[int] = []
    missing: list[int] = []
    if not d.exists():
        return StopSummary(terminated=terminated, skipped=skipped, missing=missing)
    for pid_file in sorted(d.glob("*.pid")):
        pid = _read_pid(pid_file)
        if pid is None:
            continue  # garbage file, skip silently
        if not validate_pid_is_claude(pid):
            skipped.append(pid)
            continue
        try:
            os.kill(pid, signal.SIGTERM)
            terminated.append(pid)
        except ProcessLookupError:
            missing.append(pid)
        except PermissionError:
            skipped.append(pid)
    return StopSummary(terminated=terminated, skipped=skipped, missing=missing)
