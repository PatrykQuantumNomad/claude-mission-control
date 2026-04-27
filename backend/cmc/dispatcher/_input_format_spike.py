"""Wave-2 spike for RESEARCH §A2 / §Open Q2 — stdin NDJSON shape verification.

Verifies the claude CLI accepts the SYMMETRIC NDJSON shape on stdin so DISP-09's
follow-up pump (Plan 04) can rely on it. The verified shape is:

    {"type":"user","message":{"role":"user","content":"<text>"}}\\n

If this returns ('rejected', ...), Plan 04 falls back to RESEARCH §A2 contingency:
  (a) introduce claude-agent-sdk dep,
  (b) use `claude --resume` per follow-up, or
  (c) defer DISP-09 to a later phase.

This module is NOT a runtime dependency of run_stream — it is a one-time
operator/CI verification. run_stream uses the shape DIRECTLY (no spike call).

Run manually:
    cd backend && uv run python -m cmc.dispatcher._input_format_spike

Exit codes:
    0  accepted (assistant event observed within deadline)
    1  rejected (no assistant event OR explicit error result)
    77 skipped (claude binary not present — EX_NOPERM-ish convention)
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from typing import Literal

Outcome = Literal["accepted", "rejected", "skipped"]


def probe_stdin_shape(
    claude_bin: str | None = None,
    *,
    deadline_s: float = 5.0,
) -> tuple[Outcome, str]:
    """Probe whether the claude CLI accepts the symmetric NDJSON stdin shape.

    Args:
        claude_bin: Optional explicit path to the claude binary. If None,
                    resolves via shutil.which('claude').
        deadline_s: Max wall-clock to wait for an 'assistant' event before
                    declaring the shape rejected (default 5.0s).

    Returns:
        ('accepted', detail)  if any 'assistant' event observed within deadline.
        ('rejected', detail)  if a 'result' event with subtype='error' arrived
                              first OR the deadline expired with no assistant
                              event.
        ('skipped',  detail)  if no claude binary is on PATH (CI scenario).
    """
    binpath = claude_bin or shutil.which("claude")
    if not binpath or not os.path.exists(binpath):
        return ("skipped", "claude binary not present")

    msg = json.dumps({
        "type": "user",
        "message": {"role": "user", "content": "hello from spike"},
    }) + "\n"

    proc = subprocess.Popen(
        [
            binpath,
            "-p", "",
            "--output-format", "stream-json",
            "--input-format", "stream-json",
            "--verbose",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=1,
        text=True,
    )
    try:
        assert proc.stdin is not None and proc.stdout is not None
        proc.stdin.write(msg)
        proc.stdin.flush()
        proc.stdin.close()

        start = time.time()
        while time.time() - start < deadline_s:
            line = proc.stdout.readline()
            if not line:
                break
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            etype = event.get("type")
            if etype == "assistant":
                return ("accepted", "assistant event observed")
            if etype == "result" and event.get("subtype") == "error":
                return ("rejected", f"result error: {event}")
        return ("rejected", "no assistant event within deadline")
    finally:
        try:
            proc.terminate()
        except ProcessLookupError:
            pass
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            try:
                proc.kill()
            except ProcessLookupError:
                pass


def main() -> int:
    outcome, detail = probe_stdin_shape()
    sys.stdout.write(f"{outcome}: {detail}\n")
    return {"accepted": 0, "rejected": 1, "skipped": 77}[outcome]


if __name__ == "__main__":
    raise SystemExit(main())
