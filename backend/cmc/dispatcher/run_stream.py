"""DISP-06/07/08 stream-mode runner — bidirectional pipes + reader thread.

Architecture:
- subprocess.Popen with stdin=PIPE, stdout=PIPE, stderr=log file (Pitfall 11
  bufsize=1 + text=True for line-buffered str frames).
- A dedicated asyncio loop runs in its own thread so async DB / httpx helpers
  can be invoked from the reader thread via `asyncio.run_coroutine_threadsafe`.
- A reader thread reads NDJSON line-by-line off proc.stdout, json.loads each
  line, dispatches on event['type']:
    'assistant'      → iterate content blocks; type='text' → MarkerParser.feed_text
    'stream_event'   → if content_block_delta + text_delta → MarkerParser.feed_text
    'system' / 'user' / 'result' → ignore (no marker semantics)
- Each emitted DECISION marker:
    1. INSERT a Decision row (status='pending', dedup_key=hash(task_id, body))
    2. await wait_for_answer (blocks the reader thread on the asyncio loop)
    3. on answer received → continue; on timeout → write an 'interrupt'
       user-message to stdin, mark task failed with 'decision timeout'
- Each emitted INBOX marker: post to /api/inbox via httpx (DISP-08); failures
  logged but never abort the stream.
- On stream end: parser.flush() → emit final buffered marker → close stdin →
  proc.wait() → mark task done (returncode 0) or failed (nonzero) → finally:
  always unlink_pid_file (parallel to run_classic).

Pitfalls covered:
- Pitfall 8: env scrub of ANTHROPIC_API_KEY before Popen.
- Pitfall 10: write_pid_file IMMEDIATELY after Popen returns.
- Pitfall 11: bufsize=1 + text=True so the last line is not lost.

Note on the Decision schema: the table column is `prompt` (not `content` —
verify against backend/cmc/db/models/decisions.py). The marker body becomes
the prompt; options[] is left empty (the agent did not enumerate choices in
the marker text — HITL UI presents free-form answer).

Follow-up file->stdin injection uses the same stdin pipe. Decision timeout also
writes an interrupt message to stdin so the child can exit cleanly.
"""

import asyncio
import hashlib
import json
import logging
import os
import subprocess
import threading
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy import update as _upd

from cmc.core.paths import repo_root
from cmc.db.models.decisions import Decision
from cmc.db.models.tasks import Task
from cmc.dispatcher.answer_poll import wait_for_answer
from cmc.dispatcher.follow_ups import FollowUpPump
from cmc.dispatcher.inbox_post import post_inbox_marker
from cmc.dispatcher.marker_parser import Marker, MarkerParser
from cmc.dispatcher.model_resolve import resolve_model
from cmc.dispatcher.state import unlink_pid_file, write_pid_file

log = logging.getLogger(__name__)


def run_stream(
    task_row: Mapping[str, Any],
    settings,
    sessions,
    *,
    skill: Any | None = None,
) -> None:
    """One stream-mode subprocess. Sync — caller spawns it on a thread.

    Args:
        task_row: claim_pending_tasks-shaped dict with 'id', 'description'/'title',
                  optional 'model', 'timeout_s'.
        settings: cmc.config.Settings (claude_bin, port, dispatcher_decision_timeout_s,
                  dispatcher_answer_poll_s).
        sessions: async_sessionmaker.
        skill: Optional Skill ORM instance forwarded to resolve_model.
    """
    task_id = int(task_row["id"])
    model = resolve_model(task_row, skill, settings)

    log_dir = repo_root() / ".tmp" / "mission-control-queue" / "dispatcher-logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"task-{task_id}-stream-{int(datetime.now().timestamp())}.log"

    env = os.environ.copy()
    env.pop("ANTHROPIC_API_KEY", None)  # scrub shell-inherited key

    prompt = task_row.get("description") or task_row.get("title") or ""
    cmd = [
        str(settings.claude_bin),
        "-p", prompt,
        "--output-format", "stream-json",
        "--input-format", "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--model", model,
    ]

    log_fp = open(log_path, "ab", buffering=0)

    # Dedicated asyncio loop in its own thread so reader-thread helpers can
    # submit coroutines via run_coroutine_threadsafe.
    loop = asyncio.new_event_loop()
    loop_ready = threading.Event()
    loop_thread = threading.Thread(
        target=_run_loop_forever,
        args=(loop, loop_ready),
        daemon=True,
        name=f"run_stream-loop-{task_id}",
    )
    loop_thread.start()
    loop_ready.wait(timeout=2.0)

    proc: subprocess.Popen | None = None
    reader: threading.Thread | None = None
    pump: FollowUpPump | None = None
    pump_thread: threading.Thread | None = None
    decision_timed_out = {"v": False}

    def handle_marker(m: Marker) -> None:
        """Reader-thread callback for each emitted marker.

        DECISION → insert row → wait for answer → on timeout, send interrupt.
        INBOX    → POST /api/inbox (failures logged, not raised).
        """
        if m.kind == "DECISION":
            did = _insert_decision_sync(task_id, m.body, sessions, loop)
            if did is None:
                log.warning(
                    "dispatcher.run_stream.decision_insert_failed",
                    extra={"task_id": task_id},
                )
                return
            ans = asyncio.run_coroutine_threadsafe(
                wait_for_answer(
                    sessions,
                    did,
                    timeout_s=settings.dispatcher_decision_timeout_s,
                    poll_s=settings.dispatcher_answer_poll_s,
                ),
                loop,
            ).result()
            if ans is None:
                # Decision timed out — send interrupt to wake up the child's
                # read loop so it exits cleanly, then flag for teardown.
                decision_timed_out["v"] = True
                try:
                    if proc is not None and proc.stdin and not proc.stdin.closed:
                        interrupt_msg = json.dumps({
                            "type": "user",
                            "message": {
                                "role": "user",
                                "content": "[dispatcher: decision timeout — aborting]",
                            },
                        }) + "\n"
                        proc.stdin.write(interrupt_msg)
                        proc.stdin.flush()
                except (BrokenPipeError, ValueError, OSError):
                    pass
            else:
                # Decision answered — feed the answer back to the agent as a
                # follow-up user message so its read loop unblocks.
                try:
                    if proc is not None and proc.stdin and not proc.stdin.closed:
                        followup = json.dumps({
                            "type": "user",
                            "message": {
                                "role": "user",
                                "content": ans,
                            },
                        }) + "\n"
                        proc.stdin.write(followup)
                        proc.stdin.flush()
                except (BrokenPipeError, ValueError, OSError):
                    pass
        else:  # INBOX
            try:
                asyncio.run_coroutine_threadsafe(
                    post_inbox_marker(m.body, port=settings.port),
                    loop,
                ).result()
            except Exception:
                log.exception(
                    "dispatcher.run_stream.inbox_post_unexpected",
                    extra={"task_id": task_id},
                )

    def _reader() -> None:
        """Reader thread body — parses NDJSON events, fires marker callbacks."""
        parser = MarkerParser()
        try:
            assert proc is not None and proc.stdout is not None
            for line in iter(proc.stdout.readline, ""):
                if not line:
                    break
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                etype = event.get("type")
                if etype == "assistant":
                    content = event.get("message", {}).get("content", []) or []
                    for block in content:
                        if block.get("type") == "text":
                            for marker in parser.feed_text(block.get("text", "")):
                                handle_marker(marker)
                elif etype == "stream_event":
                    ev = event.get("event", {}) or {}
                    if ev.get("type") == "content_block_delta":
                        delta = ev.get("delta", {}) or {}
                        if delta.get("type") == "text_delta":
                            for marker in parser.feed_text(delta.get("text", "")):
                                handle_marker(marker)
                # 'system' / 'user' / 'result' → no marker semantics here.
            for marker in parser.flush():
                handle_marker(marker)
        except Exception:
            log.exception("dispatcher.run_stream.reader_error", extra={"task_id": task_id})

    try:
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(repo_root()),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=log_fp,
                env=env,
                close_fds=True,
                bufsize=1,        # line-buffered (Pitfall 11)
                text=True,        # str frames not bytes
            )
        except FileNotFoundError as exc:
            log.error(
                "dispatcher.run_stream.spawn_failed",
                extra={"task_id": task_id, "err": str(exc)},
            )
            _mark_status_via_loop(
                task_id, "failed", f"spawn failed: {exc}", sessions, loop
            )
            return

        # Pitfall 10: PID file IMMEDIATELY after Popen returns.
        write_pid_file(task_id, proc.pid)

        # DISP-09 FollowUpPump — drains queue_path('messages', f'task-{id}')
        # into proc.stdin while the subprocess runs. Daemon=True because the
        # locked teardown sequence below explicitly stops + joins the pump.
        pump = FollowUpPump(dict(task_row), proc, settings)
        pump_thread = threading.Thread(
            target=pump.run,
            daemon=True,
            name=f"run_stream-pump-{task_id}",
        )
        pump_thread.start()

        reader = threading.Thread(
            target=_reader, daemon=False, name=f"run_stream-reader-{task_id}"
        )
        reader.start()

        proc.wait()
        reader.join(timeout=10)

        if decision_timed_out["v"]:
            _mark_status_via_loop(
                task_id, "failed", "decision timeout", sessions, loop
            )
        elif proc.returncode != 0:
            _mark_status_via_loop(
                task_id, "failed", f"nonzero exit {proc.returncode}", sessions, loop
            )
        else:
            _mark_status_via_loop(task_id, "done", None, sessions, loop)
    finally:
        # Teardown order:
        #   1. pump.stop() — pump must STOP writing to stdin BEFORE we close it
        #      (otherwise it could log a false "stdin closed" warning).
        #   2. Close proc.stdin (signals EOF to claude; reader unblocks).
        #   3. Reader join (returns once stdout drains).
        #   4. Pump thread join (exits within poll_s of stop()).
        #   5. Stop the asyncio loop + join the loop thread + close the loop.
        #   6. Close log file + unlink_pid_file (idempotent).
        # Justification: pump first so it never writes to a closed stdin.
        # stdin closes BEFORE reader/loop teardown so any in-flight
        # answer_poll coroutines submitted via run_coroutine_threadsafe complete
        # cleanly. unlink_pid_file is LAST so a forensic operator can correlate
        # the .pid file with the still-open log during the final commit.
        try:
            if pump is not None:
                pump.stop()
        except Exception:
            pass
        try:
            if proc is not None and proc.stdin and not proc.stdin.closed:
                proc.stdin.close()
        except Exception:
            pass
        if reader is not None:
            try:
                reader.join(timeout=10)
            except Exception:
                pass
        if pump_thread is not None:
            try:
                pump_thread.join(timeout=2)
            except Exception:
                pass
        try:
            loop.call_soon_threadsafe(loop.stop)
        except Exception:
            pass
        loop_thread.join(timeout=2)
        try:
            loop.close()
        except Exception:
            pass
        try:
            log_fp.close()
        except Exception:
            pass
        unlink_pid_file(task_id)


def _run_loop_forever(loop: asyncio.AbstractEventLoop, ready: threading.Event) -> None:
    """Loop-thread entry point: pin loop to thread, signal ready, run forever."""
    asyncio.set_event_loop(loop)
    ready.set()
    loop.run_forever()


def _insert_decision_sync(
    task_id: int,
    body: str,
    sessions,
    loop: asyncio.AbstractEventLoop,
) -> int | None:
    """INSERT a pending Decision row from the reader thread; return new id.

    On HITL-02 partial-unique conflict (existing pending row with same dedup_key),
    fetch and reuse the existing row's id.
    """
    dedup = hashlib.sha256(f"{task_id}:{body}".encode()).hexdigest()[:32]

    async def _insert() -> int | None:
        now = datetime.now(UTC)
        async with sessions() as db:
            d = Decision(
                task_id=task_id,
                dedup_key=dedup,
                prompt=body,
                options=[],
                status="pending",
                created_at=now,
            )
            db.add(d)
            try:
                await db.commit()
                await db.refresh(d)
                return d.id
            except Exception:
                await db.rollback()
        # HITL-02 partial-unique conflict — fetch existing pending row.
        async with sessions() as db2:
            row = (
                await db2.execute(
                    select(Decision).where(
                        Decision.dedup_key == dedup,
                        Decision.status == "pending",
                    )
                )
            ).scalar_one_or_none()
            return row.id if row is not None else None

    return asyncio.run_coroutine_threadsafe(_insert(), loop).result()


def _mark_status_via_loop(
    task_id: int,
    status: str,
    error_message: str | None,
    sessions,
    loop: asyncio.AbstractEventLoop,
) -> None:
    """Update task status via the dedicated asyncio loop."""

    async def _mark() -> None:
        now = datetime.now(UTC)
        values: dict[str, Any] = {"status": status, "ended_at": now}
        if error_message is not None:
            values["error_message"] = error_message
        async with sessions() as db:
            await db.execute(_upd(Task).where(Task.id == task_id).values(**values))
            await db.commit()

    try:
        asyncio.run_coroutine_threadsafe(_mark(), loop).result(timeout=10)
    except Exception:
        log.exception(
            "dispatcher.run_stream.mark_status_failed",
            extra={"task_id": task_id, "status": status},
        )
