"""DISP-09 follow-up pump — reads queue files, writes user-message NDJSON to proc.stdin.

Symmetric NDJSON shape:

    {"type":"user","message":{"role":"user","content":"<body>"}}\\n

Atomic read-then-truncate: rename the queue file to a `.tmp-pump` suffix,
read it, delete the tmp. New writes by the API land in a fresh file at the
original path so we never lose lines mid-drain.

v1 channel scope: pump polls ONLY `messages/task-{task_id}.jsonl`.
- Decision answers: handled by `cmc.dispatcher.answer_poll.wait_for_answer`'s
  DB-read loop, NOT injected here.
- Inbox replies: not re-injected into the running task in v1. They land at
  queue_path('inbox', <id>) for downstream consumers.

Lifecycle:
- Caller (run_stream) instantiates `FollowUpPump(task_row, proc, settings)` and
  spawns `threading.Thread(target=pump.run, daemon=True)`.
- Pump terminates when `pump.stop()` is called OR when proc.stdin closes
  (BrokenPipeError seen on inject → set stop event).
- Pump does NOT close proc.stdin — that's run_stream's teardown responsibility.
"""

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any

from cmc.core.queue import queue_path

log = logging.getLogger(__name__)


class FollowUpPump:
    """Thread-callable pump. Caller spawns via threading.Thread(target=pump.run)."""

    def __init__(self, task_row: dict[str, Any], proc, settings) -> None:
        self._task_id = int(task_row["id"])
        # v1: queue is keyed on task-id. The Task schema has no session_id
        # column; senders writing follow-ups MUST write to
        #   queue_path("messages", f"task-{task_id}")
        # A future session_id column may allow rekeying; until then, task-id IS
        # the queue key.
        self._queue_key = f"task-{self._task_id}"
        self._proc = proc
        self._settings = settings
        self._stop = threading.Event()

    def stop(self) -> None:
        """Signal the run loop to exit before its next poll."""
        self._stop.set()

    def run(self) -> None:
        """Main loop — drain the messages queue every poll_s seconds.

        Catches and logs all per-iteration exceptions so a transient failure
        (filesystem race, JSONDecodeError) doesn't kill the pump.
        """
        poll_s = float(self._settings.dispatcher_followup_poll_s)
        while not self._stop.is_set():
            try:
                # v1 messages-only channel. Queue is keyed on task-id;
                # operator-side senders MUST write to
                #   queue_path("messages", f"task-{task_id}").
                self._drain(queue_path("messages", self._queue_key))
                # Decision answers: handled by answer_poll's DB read loop, NOT
                # injected here.
                # Inbox replies: not re-injected into the running task in v1.
            except Exception:
                log.exception("dispatcher.follow_ups.iteration_error")
            if self._stop.wait(timeout=poll_s):
                break

    def _drain(self, path: Path) -> None:
        """Atomically swap the queue file to a tmp name, read, delete the tmp.

        New writes by the API land in a fresh file at `path` so we never lose
        lines mid-drain (POSIX rename is atomic on the same filesystem).
        """
        if not path.exists():
            return
        tmp = path.with_suffix(path.suffix + ".tmp-pump")
        try:
            os.replace(path, tmp)
        except FileNotFoundError:
            return  # raced; retry next iteration
        try:
            with tmp.open("r", encoding="utf-8") as fp:
                for line in fp:
                    line = line.strip()
                    if not line:
                        continue
                    self._inject(line)
        finally:
            try:
                tmp.unlink()
            except FileNotFoundError:
                pass

    def _inject(self, line: str) -> None:
        """Write a symmetric-NDJSON user message to proc.stdin.

        Each queue line MAY already be JSON ({"body": "...", ...}) or plain
        text. Extracts a body string then wraps it in the locked shape:
        {"type":"user","message":{"role":"user","content":<body>}}
        """
        try:
            parsed = json.loads(line)
            body = (
                parsed.get("body")
                or parsed.get("message")
                or parsed.get("content")
                or line
            )
        except json.JSONDecodeError:
            body = line
        payload = {
            "type": "user",
            "message": {"role": "user", "content": str(body)},
        }
        try:
            if (
                self._proc is not None
                and self._proc.stdin is not None
                and not self._proc.stdin.closed
            ):
                self._proc.stdin.write(json.dumps(payload) + "\n")
                self._proc.stdin.flush()
        except (BrokenPipeError, ValueError) as exc:
            log.warning(
                "dispatcher.follow_ups.stdin_closed", extra={"err": str(exc)}
            )
            self._stop.set()
