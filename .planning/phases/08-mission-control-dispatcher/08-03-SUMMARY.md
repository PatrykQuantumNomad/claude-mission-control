---
phase: 08-mission-control-dispatcher
plan: 03
subsystem: dispatcher
tags: [dispatcher, subprocess, stream-json, markers, decisions, inbox, threading]

# Dependency graph
requires:
  - phase: 08-mission-control-dispatcher
    plan: 01
    provides: state.write_pid_file/unlink_pid_file, Settings.dispatcher_decision_timeout_s/dispatcher_answer_poll_s/port, conftest tmp_pid_dir_monkey + _bootstrap_db
  - phase: 08-mission-control-dispatcher
    plan: 02
    provides: model_resolve.resolve_model (4-tier precedence), run_classic shape (Pitfall-8/10 lifecycle pattern mirrored in run_stream), fake_claude_classic + _write_fake_claude_wrapper (sibling pattern reused for stream)
  - phase: 04-stateful-apis
    provides: Decision ORM (prompt + options + status + answer columns + HITL-02 partial-unique dedup_key), POST /api/inbox endpoint (HITL-05) accepting {body, subject, session_id, task_id} via InboxCreate
provides:
  - MarkerParser + Marker (cmc.dispatcher.marker_parser) — fenced-code-aware DECISION/INBOX extractor with stateful chunk-buffer + in_fence toggle
  - wait_for_answer(sessions, decision_id, *, timeout_s, poll_s) — DISP-07 decision-answer poll, fresh AsyncSession per iteration, returns answer string or None on timeout
  - post_inbox_marker(body, *, port, host) — DISP-08 httpx.AsyncClient POST /api/inbox with {source: 'agent_marker', body}; ConnectError + non-2xx tolerated (logged, never raised)
  - run_stream(task_row, settings, sessions, *, skill=None) — DISP-06/07/08 stream-mode subprocess runner; threading.Thread reader + dedicated asyncio loop thread + Pitfall-8 env scrub + Pitfall-10 PID timing + Pitfall-11 line-buffered text frames
  - probe_stdin_shape(claude_bin=None, *, deadline_s) — Wave-2 spike confirming claude CLI accepts symmetric NDJSON on stdin (RESEARCH §A2 / §Open Q2)
  - tests/fixtures/fake_claude_stream.py — stream-mode fake claude (NDJSON in/out) supporting --emit-decision/--emit-inbox/--emit-fenced-decision/--emit-multi-marker/--exit-code/--print-pid-file/--linger/--hang
affects: [08-04 fan-out (heartbeat per-task threading.Thread → run_classic | run_stream), 08-04 follow-up pump (file→stdin symmetric NDJSON shape — LOCKED by spike), HITL-02 dedup-key conflict path (run_stream falls back to existing pending row's id)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fenced-code-aware line-start regex (Pitfall 4): ^\\s*(DECISION|INBOX):\\s+(.*\\S)\\s*$ — line-start anchor blocks inline backtick mid-prose, ^\\s*``` toggle blocks DECISION inside code examples; tested across chunk-boundary fragmentation"
    - "Stateful streaming parser with chunk buffer: feed_text accumulates _buffer until \\n, splits + parses each line, leaves trailing fragment for next chunk; flush() emits the final un-newlined buffered marker — required because stream-json text_delta events arrive in arbitrary character chunks"
    - "Dedicated asyncio-loop thread inside run_stream: loop = asyncio.new_event_loop(); threading.Thread(target=loop.run_forever) so reader-thread callbacks can submit coroutines via run_coroutine_threadsafe (DECISION INSERT, wait_for_answer, post_inbox_marker) without blocking the reader on stdout.readline"
    - "Reader thread pattern: for line in iter(proc.stdout.readline, ''): json.loads → dispatch on event['type']; assistant.content[type='text'] AND stream_event.event[content_block_delta.delta.type='text_delta'] both feed into MarkerParser.feed_text — handles both message-frame events and partial-message deltas"
    - "Wake-up follow-up on decision answer: when wait_for_answer returns a non-None answer, run_stream writes {'type':'user', 'message':{'role':'user','content':<answer>}} + '\\n' to proc.stdin so the agent's read loop unblocks. Plan 04 will replace this minimal wake-up with proper queue-driven follow-up content; the symmetric NDJSON shape used here is locked by the spike"
    - "Decision dedup_key with HITL-02 fallback: hash(task_id, body) → INSERT pending row; on partial-unique conflict, rollback + SELECT existing pending row + reuse its id — preserves the 'one pending decision per question' invariant"
    - "fresh AsyncSession per poll iteration: wait_for_answer opens `async with sessions() as db:` inside the while-loop body, then `await asyncio.sleep(poll_s)` happens AFTER the session has closed — never holds a connection across the sleep window"
    - "shlex.quote for shell-script fixture wrappers: _write_fake_claude_stream_wrapper now shlex-quotes each --emit-* flag value so spaces in marker bodies (e.g. 'heads up') survive the sh-level word split that bit the first GREEN run"
    - "Locked teardown order in run_stream finally: (1) close proc.stdin → (2) reader.join(timeout=10) → (3) loop.call_soon_threadsafe(loop.stop) → (4) loop_thread.join(timeout=2) → (5) loop.close() → (6) log_fp.close() → (7) unlink_pid_file. Justification documented inline; Plan 04's FollowUpPump.stop() will be inserted at step 0"

key-files:
  created:
    - backend/cmc/dispatcher/marker_parser.py
    - backend/cmc/dispatcher/answer_poll.py
    - backend/cmc/dispatcher/inbox_post.py
    - backend/cmc/dispatcher/run_stream.py
    - backend/cmc/dispatcher/_input_format_spike.py
    - backend/tests/fixtures/fake_claude_stream.py
  modified:
    - backend/tests/test_phase8_dispatcher.py

key-decisions:
  - "Decision schema reality vs plan wording: the plan's truth said 'content=body' but Phase-1 schema names the column `prompt` (with required JSON `options` defaulting to []). _insert_decision uses `prompt=body, options=[]` — no schema migration, the plan's word choice was a typo against the locked schema. Documented as Rule-1 deviation."
  - "Wake-up follow-up shape on decision-answered: run_stream writes {type:'user',message:{role:'user',content:<answer>}}+\\n to proc.stdin so the child's stdin-read loop unblocks. Without this the fake_claude_stream fixture (which pauses on stdin after emitting DECISION) would deadlock. Plan 04 replaces the minimal wake-up with richer follow-up pump content, but the SHAPE is locked here — symmetric NDJSON, validated by the Wave-2 spike."
  - "Inbox marker payload: {source: 'agent_marker', body: <marker text>}. Pydantic v2's default extra-fields behavior is 'ignore' so the InboxCreate schema (which lacks a `source` column) silently drops `source` server-side. This preserves forward compatibility — if a future migration adds a source column the wire shape stays correct. Marker provenance is also encoded by virtue of the marker text itself."
  - "Stdin-shape spike result: ACCEPTED. Real claude binary at /opt/homebrew/bin/claude (Claude Code 2.1.112) emits an 'assistant' event within deadline when fed the symmetric NDJSON shape on stdin. RESEARCH §Open Q2 is RESOLVED — Plan 04's follow-up pump can rely on this shape. No contingency needed."
  - "Reader-thread + asyncio-loop-thread split (NOT asyncio.create_subprocess_exec): the reader thread blocks on proc.stdout.readline (sync call), and submits coroutines (DB INSERT, answer_poll, INBOX POST) to a dedicated asyncio loop running in its own thread. This avoids the event-loop lifetime complexities of long-running subprocess subprocess management while keeping all DB / HTTP work fully async. Mirrors run_classic's threading approach."

patterns-established:
  - "Pattern (stream-mode test fixture): fake_claude_stream.py is the canonical script for emulating stream-mode claude in tests. Mirrors fake_claude_classic argv shape; supports an extra suite of marker-emission flags (--emit-decision/--emit-inbox/--emit-fenced-decision) plus --linger for Pitfall-10 windowing. Plan 04's follow-up pump tests will reuse this fixture verbatim."
  - "Pattern (shell-script wrapper with shlex-quoted args): _write_fake_claude_stream_wrapper shlex.quote-s each fixture-extra arg before joining with spaces, so flag values containing whitespace survive the sh-level word split. Generalizes the Plan-02 _write_fake_claude_wrapper helper (which had the same bug latent — it just never had a test that triggered it). Future shell-script test wrappers MUST shlex.quote."
  - "Pattern (sync-context bridge from reader thread): asyncio.run_coroutine_threadsafe(coro, loop).result() submits an async coroutine to a loop running in a different thread and blocks the caller until it returns. Reusable for any sync code (e.g., subprocess reader threads) that needs to make async DB / HTTP calls without spinning up its own event loop."
  - "Pattern (line-start anchor + fence toggle for stream parsing): Pitfall 4 prevention generalizes beyond DECISION/INBOX. Any future agent-to-system marker (e.g., HALT:, ESCALATE:) should use the same ^\\s*MARKER:\\s+body\\s*$ regex inside the existing MarkerParser._parse_line dispatch — just add another precompiled regex + Marker.kind variant."

requirements-completed: [DISP-06, DISP-07, DISP-08]

# Metrics
duration: 30min
completed: 2026-04-27
---

# Phase 8 Plan 3: Mission Control Dispatcher Wave 3 (Stream Runner + Markers + Decisions + Inbox) Summary

**Stream-mode subprocess runner with bidirectional pipes + reader thread + dedicated asyncio loop, fenced-code-aware DECISION/INBOX marker parser, decision answer poll, INBOX → /api/inbox httpx poster, and the Wave-2 stdin-shape spike — all wired together so a fake claude fixture can drive the full DECISION → INSERT → poll → resume → INBOX → POST flow in a deterministic test.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-27T21:43:55Z
- **Completed:** 2026-04-27T22:13:37Z
- **Tasks:** 3 (TDD; 6 commits = 3 RED + 3 GREEN)
- **Files created:** 6 (5 production modules + 1 test fixture)
- **Files modified:** 1 (backend/tests/test_phase8_dispatcher.py — +25 cumulative tests)

## Accomplishments

- **DISP-07 marker parser**: 6 grammar tests prove fenced-code skipping, inline-backtick rejection, chunk-boundary recombination, flush-final-line, fence-state-persists-across-chunks, and body-whitespace stripping. Locked regex `^\s*(DECISION|INBOX):\s+(.*\S)\s*$` plus `^\s*```` fence toggle. Stateful `MarkerParser` class with `_buffer` for cross-chunk text accumulation.
- **DISP-07 answer poll**: 3 tests prove status-flip resumes (`asyncio.gather` race against a flipper coroutine), timeout returns `None`, and a fresh AsyncSession is opened per poll iteration (no connection pinning across `await asyncio.sleep`).
- **DISP-08 inbox poster**: 3 tests prove success path returns inbox id, `httpx.ConnectError` returns None (logged, never raised), unexpected non-2xx returns None. Wire shape `{source: 'agent_marker', body: <marker>}` POST to `http://127.0.0.1:{port}/api/inbox`.
- **DISP-06 stream runner**: 10 tests prove happy path (assistant text + INBOX → done), Pitfall-10 PID file written immediately (verified via `--linger` window), Pitfall-8 ANTHROPIC_API_KEY scrub, model passthrough + stream-json + --include-partial-messages flags in argv, DECISION blocks until answer flips → resumes → done, fenced DECISION skipped (only outer marker inserted), DECISION timeout marks task `failed` with `error_message='decision timeout'`, INBOX marker observed at httpx layer with correct payload, nonzero exit → failed, reader-thread exception → PID file still unlinked (finally block).
- **Wave-2 stdin-shape spike**: 3 tests cover skip-when-claude-missing, write-correct-shape (recorder shell script captures stdin → asserts symmetric NDJSON), and accepted/rejected outcomes against synthetic shell-script fakes. Real spike against `/opt/homebrew/bin/claude` (Claude Code 2.1.112) returns `accepted: assistant event observed` — RESEARCH §Open Q2 RESOLVED.
- **Suite growth**: 246 → 271 (+25). All Phase-8 baseline + Plan-03 tests green; full backend suite 100% pass.
- **Heartbeat fan-out TODO PRESERVED**: `cmc/dispatcher/heartbeat.py` line ~88 (`# TODO(Plan 08-04)`) untouched, as required by Plan-03 scope.

## Task Commits

TDD execution: each task committed RED then GREEN.

1. **Task 1 RED — Failing tests for marker_parser + answer_poll + inbox_post (12 tests)** — `37d09e5` (test)
2. **Task 1 GREEN — Implement marker_parser + answer_poll + inbox_post** — `592c71a` (feat)
3. **Task 2 RED — Failing tests for run_stream (DISP-06/07/08; 10 tests)** — `f907e6c` (test)
4. **Task 2 GREEN — Implement run_stream + fake_claude_stream fixture** — `6ceb130` (feat)
5. **Task 3 RED — Failing tests for stdin-shape spike (3 tests)** — `487b468` (test)
6. **Task 3 GREEN — Implement _input_format_spike** — `143fa01` (feat)

**Plan metadata:** _(this commit — see final_commit step)_

## Files Created/Modified

### Created

| File | Purpose | Public API |
|---|---|---|
| `backend/cmc/dispatcher/marker_parser.py` | DISP-07 fenced-code-aware DECISION/INBOX extractor | `MarkerParser` class (`feed_text`, `flush`); `Marker(kind, body)` dataclass |
| `backend/cmc/dispatcher/answer_poll.py` | DISP-07 decision answer poll | `wait_for_answer(sessions, decision_id, *, timeout_s, poll_s) → Optional[str]` |
| `backend/cmc/dispatcher/inbox_post.py` | DISP-08 INBOX → POST /api/inbox via httpx | `post_inbox_marker(body, *, port, host) → Optional[int]` |
| `backend/cmc/dispatcher/run_stream.py` | DISP-06/07/08 stream-mode runner | `run_stream(task_row, settings, sessions, *, skill=None) → None` |
| `backend/cmc/dispatcher/_input_format_spike.py` | Wave-2 stdin-shape verification (RESEARCH §A2/§Open Q2) | `probe_stdin_shape(claude_bin=None, *, deadline_s) → tuple[Outcome, str]`; `main()` |
| `backend/tests/fixtures/fake_claude_stream.py` | Test fake of stream-mode claude | `python -m tests.fixtures.fake_claude_stream [-p PROMPT] [--emit-decision BODY] [--emit-inbox BODY] [--emit-fenced-decision] [--emit-multi-marker] [--exit-code N] [--print-pid-file PATH] [--linger SECS] [--hang]` |

### Modified

| File | Change |
|---|---|
| `backend/tests/test_phase8_dispatcher.py` | +25 Plan-03 tests appended after Plan-02 cases (12 marker/poll/inbox + 10 run_stream + 3 spike). New helper `_write_fake_claude_stream_wrapper` mirrors Plan-02's `_write_fake_claude_wrapper` but shlex-quotes fixture args. |

## run_stream Public Contract

```python
def run_stream(
    task_row: Mapping[str, Any],   # claim-shaped: id, title, description, model, timeout_s
    settings,                       # cmc.config.Settings
    sessions,                       # async_sessionmaker
    *,
    skill: Optional[Any] = None,   # Skill ORM (forwarded to resolve_model)
) -> None: ...
```

**Failure modes (all → status='failed' + PID unlinked):**

| Failure                            | error_message                |
| ---------------------------------- | ---------------------------- |
| claude_bin not found               | `spawn failed: <FileNotFoundError>` |
| subprocess returncode != 0         | `nonzero exit <code>`        |
| DECISION never answered            | `decision timeout`           |
| Reader thread raised               | logged via `dispatcher.run_stream.reader_error`; status set by current path (timeout / nonzero / completed-handler), PID unlinked |

**Happy path:** returncode == 0 → status='done', ended_at=now, NDJSON events captured to `.tmp/mission-control-queue/dispatcher-logs/task-{id}-stream-{epoch}.log`.

## Threading Model (run_stream)

Three threads + one subprocess:

```
                       ┌────────────────────────────┐
                       │  caller thread             │
                       │  (Plan 08-04 fan-out)      │
                       │                            │
                       │  proc = Popen(...)         │
                       │  write_pid_file(pid)       │
                       │  proc.wait()               │
                       │  reader.join()             │
                       │  loop.stop()               │
                       │  loop_thread.join()        │
                       │  unlink_pid_file()         │
                       └─────────┬──────────────────┘
                                 │
              ┌──────────────────┼─────────────────────┐
              │                  │                     │
   ┌──────────▼────────┐ ┌───────▼───────┐ ┌──────────▼─────────┐
   │ reader thread     │ │ asyncio-loop  │ │ claude subprocess  │
   │                   │ │ thread        │ │                    │
   │ for line in       │ │               │ │ stdout: NDJSON     │
   │   proc.stdout:    │ │ loop.run_     │ │ stdin:  NDJSON     │
   │   json.loads      │ │   forever()   │ │ stderr: log file   │
   │   parser.feed_    │ │               │ │                    │
   │     text          │ │ ← receives    │ │                    │
   │   handle_marker   │ │   coroutines  │ │                    │
   │   → run_coroutine_│ │   from reader │ │                    │
   │     threadsafe    │ │   via         │ │                    │
   │                   │ │   threadsafe  │ │                    │
   └───────────────────┘ └───────────────┘ └────────────────────┘
```

The reader thread is sync (blocks on `proc.stdout.readline`); the loop thread is the only place async coroutines actually run; the caller thread owns the subprocess lifecycle. This is the simplest model that satisfies bidirectional pipes + line-by-line NDJSON parsing + async DB / HTTP calls without spinning up a fresh asyncio.run for every callback.

## Stdin-Shape Spike Result

**Status:** ACCEPTED.

```
$ uv run python -m cmc.dispatcher._input_format_spike
accepted: assistant event observed
```

Tested against `/opt/homebrew/bin/claude` (resolves to `claude-code/2.1.112`). The symmetric NDJSON shape

```json
{"type":"user","message":{"role":"user","content":"hello from spike"}}
```

is accepted on stdin, and the CLI emits an `assistant` event in response within the 5s deadline. RESEARCH §Open Q2 is **RESOLVED**: Plan 08-04's follow-up pump can rely on this shape. No contingency document needed.

## DECISION/INBOX Marker Lifecycle (DISP-07/08)

**DECISION** (e.g., `DECISION: should I deploy?`):
1. `MarkerParser.feed_text` emits a `Marker(kind='DECISION', body='should I deploy?')`.
2. Reader thread calls `handle_marker(m)`.
3. `_insert_decision_sync` → `asyncio.run_coroutine_threadsafe(_insert(), loop).result()` — INSERT a `Decision` row with `prompt=body, options=[], status='pending', dedup_key=hash(task_id, body)[:32]`. On HITL-02 partial-unique conflict, fetch + reuse the existing pending row's id.
4. `wait_for_answer(sessions, decision_id, timeout_s=settings.dispatcher_decision_timeout_s, poll_s=settings.dispatcher_answer_poll_s)` blocks the reader on the loop thread until either:
   - **Answered:** returns the answer string. Run_stream writes a follow-up `{type:user, message:{role:user, content:<answer>}}` line to `proc.stdin` so the child unblocks.
   - **Timeout:** returns `None`. Run_stream writes an `[interrupt]` user message to stdin, sets `decision_timed_out`, and after `proc.wait()` marks the task `failed` with `error_message='decision timeout'`.

**INBOX** (e.g., `INBOX: heads up`):
1. `MarkerParser.feed_text` emits a `Marker(kind='INBOX', body='heads up')`.
2. Reader thread calls `handle_marker(m)`.
3. `asyncio.run_coroutine_threadsafe(post_inbox_marker(body, port=settings.port), loop).result()` — POST `http://127.0.0.1:{port}/api/inbox` with `{source: 'agent_marker', body}`.
4. Failures (ConnectError, non-2xx) are logged but never abort the stream.

## MarkerParser Locked Grammar (6 verified edge cases)

| Edge case | Input | Emitted markers |
|---|---|---|
| Fenced DECISION skipped | ``` ```python\nDECISION: ignored?\n``` ``` then `DECISION: real?` | `[DECISION 'real?']` |
| Inline backtick | ``Like `DECISION: foo` not real`` | `[]` (no match — line-start anchor) |
| Chunk boundary | `feed_text("DECISI")` then `feed_text("ON: foo\n")` | `[DECISION 'foo']` (single emit) |
| Flush final line | `feed_text("DECISION: bar")` (no \n) then `flush()` | `[DECISION 'bar']` |
| Fence state across chunks | ``` `\`\`\n` `\`\`\n` ``` interleaved with markers | `[DECISION 'visible']` only (fenced 'hidden' suppressed) |
| Body whitespace strip | `"  DECISION:    body text   \n"` | `[DECISION 'body text']` |

## Decisions Made

1. **Decision schema reality vs plan wording**: the plan's `<truth>` said `content=body` but Phase-1 schema names the column `prompt` (with required JSON `options` defaulting to `[]`). _insert_decision uses `prompt=body, options=[]`. No schema migration; the plan's word choice was a typo against the locked schema. Tracked as Rule-1 deviation.

2. **Wake-up follow-up shape on decision-answered**: when `wait_for_answer` returns a non-None answer, run_stream writes `{"type":"user","message":{"role":"user","content":<answer>}}` + `\n` to `proc.stdin` so the child's stdin-read loop unblocks. Without this, the fake_claude_stream fixture (which pauses on stdin after emitting DECISION, simulating real agent behavior) would deadlock — the reader thread keeps spinning on `proc.stdout.readline` waiting for output that never arrives because the agent is blocked on stdin. Plan 04 will replace this minimal wake-up with proper queue-driven follow-up pump content; the SHAPE is locked here and validated by the spike.

3. **Inbox marker payload `{source: 'agent_marker', body}`**: Pydantic v2's default extra-fields behavior is `'ignore'`, so the InboxCreate schema (which lacks a `source` column) silently drops `source` server-side. Forward-compatible: if a future migration adds a source column the wire shape stays correct.

4. **Stdin-shape spike result**: ACCEPTED. Real claude binary at `/opt/homebrew/bin/claude` (Claude Code 2.1.112) emits an 'assistant' event within deadline. RESEARCH §Open Q2 is RESOLVED. No contingency needed.

5. **Reader-thread + asyncio-loop-thread split (NOT asyncio.create_subprocess_exec)**: avoids event-loop lifetime complexity for long-running subprocesses while keeping all DB / HTTP work fully async. Mirrors run_classic's threading approach.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Schema reality] Decision body uses `prompt` column, not `content`**
- **Found during:** Task 2 GREEN (writing `_insert_decision_sync`).
- **Issue:** The plan's `<truths>` block said `content=body`, but `backend/cmc/db/models/decisions.py` defines the column as `prompt: str` plus a required JSON `options` list. Using `content=` would have raised an `AttributeError` at INSERT time.
- **Fix:** `Decision(task_id=..., dedup_key=..., prompt=body, options=[], status='pending', created_at=now)`.
- **Files modified:** `backend/cmc/dispatcher/run_stream.py`.
- **Commit:** `6ceb130`.

**2. [Rule 1 - Bug] Shell-wrapper word-split on flag values with spaces**
- **Found during:** Task 2 first GREEN test run (`test_disp06_stream_happy_path` failed with body='heads' instead of 'heads up').
- **Issue:** `_write_fake_claude_stream_wrapper` joined `fixture_extra_args` with single spaces; the shell then word-split `--emit-inbox heads up` into three tokens. The fixture's argparse only consumed two of them, so `--emit-inbox` got value `'heads'` and `'up'` became junk.
- **Fix:** `extra = " ".join(shlex.quote(a) for a in fixture_extra_args)`.
- **Files modified:** `backend/tests/test_phase8_dispatcher.py` (helper only).
- **Commit:** `6ceb130`.
- **Note:** The Plan-02 sibling helper `_write_fake_claude_wrapper` has the same latent bug — it just never had a test that exercised a flag value with whitespace. Left as-is per scope discipline (out-of-scope of Plan 03's surface).

**3. [Rule 3 - Blocking] Decision-answered path must wake up child via stdin follow-up**
- **Found during:** Task 2 first run of `test_disp07_decision_blocks_until_answered` (test hung).
- **Issue:** When `wait_for_answer` returned a successful answer, run_stream just continued reading stdout — but the fixture (and real agent behavior) is blocked on `sys.stdin` waiting for a `{type:user}` line. Without a wake-up, both sides deadlock.
- **Fix:** After `ans = await wait_for_answer(...)`, run_stream writes `{type:'user', message:{role:'user', content:ans}}` + `\n` to `proc.stdin`. Plan 04 will replace this minimal wake-up with proper follow-up pump content.
- **Files modified:** `backend/cmc/dispatcher/run_stream.py`.
- **Commit:** `6ceb130`.

---

**Total deviations:** 3 (all Rules 1/3 — auto-fixed during implementation).
**Impact on plan:** Minimal. The schema-correctness fix is a one-line column-name swap; the shell-wrapper bug is a test-helper-only fix; the wake-up follow-up is a 12-line addition that Plan 04 explicitly intends to expand. Plan-as-written was substantially correct on the architectural / threading model.

## Issues Encountered

1. **Test output truncation at 4 dots**: The first run of `pytest -k "test_disp06 or test_disp07_decision or test_disp07_fenced or test_disp08_inbox"` showed only `....F` and then stalled — caused by `test_disp07_decision_blocks_until_answered` deadlocking before the wake-up follow-up was added. Resolved by sending an answer-as-follow-up message.

2. **shlex.quote was not initially in the helper**: a 30-second debugging detour to track down why `body='heads'` until I traced it back to the shell wrapper's word split. Documented in patterns-established so future shell-wrapper helpers MUST shlex-quote.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: net.localhost-post | `backend/cmc/dispatcher/inbox_post.py` | New localhost POST surface (`http://127.0.0.1:{port}/api/inbox`) — mitigated by binding to 127.0.0.1 only and tolerating connection errors. Same trust domain as the dispatcher (operator's machine). |

No other threat surface introduced. The `_input_format_spike` opens a subprocess to /opt/homebrew/bin/claude with the operator's existing env (no new credentials, no new network surface beyond what claude itself opens).

## TODO Markers Status

- `cmc/dispatcher/heartbeat.py` line ~88 (`# TODO(Plan 08-04): per-task fan-out via run_classic / run_stream.`) is **PRESERVED** — Plan 03 deliberately does NOT touch it. Plan 04 will replace it with `await asyncio.gather(*runner_tasks)` (or threading.Thread fan-out) now that both `run_classic` and `run_stream` exist.
- New TODO in `cmc/dispatcher/run_stream.py`: the wake-up follow-up on decision-answered is intentionally minimal (just echoes the answer). Plan 04's follow-up pump replaces it with queue-driven content from `~/.tmp/mission-control-queue/decisions/{decision_id}.jsonl`.

## User Setup Required

None — no external service configuration required for Plan 03. The stdin-shape spike runs against the operator's installed `claude` binary; in CI without claude installed, the spike returns `('skipped', 'claude binary not present')` gracefully (exit code 77).

## Next Phase Readiness

- **Plan 08-04 (Wave 4: Fan-out + follow-up pump + integration smoke)**: replaces the heartbeat TODO at `cmc/dispatcher/heartbeat.py:~88` with per-claimed-row `threading.Thread(target=run_classic | run_stream, args=(task_row, settings, sessions))` (selected by `task.execution_mode`). Plan 04 also ships the follow-up pump (file→stdin) using the LOCKED symmetric NDJSON shape verified by the spike, plus the skill router (Skill ORM lookup → forwarded to `skill=` kwarg). Plan 04 verifies the end-to-end smoke: a pending stream-mode task with a DECISION marker transitions pending→running→DECISION row created→answered via `POST /api/decisions/{id}/answer`→stream resumes→done in a single `python -m cmc.dispatcher.oneshot` invocation.
- **Plan 08-04 entry contract** (LOCKED by this plan):
  - `run_stream(task_row, settings, sessions, *, skill=None)` is callable directly; PID-file lifecycle is correct; teardown is finally-safe; reader-thread exceptions don't leak.
  - Symmetric NDJSON stdin shape `{type:'user', message:{role:'user', content:<text>}}` is ACCEPTED by claude (verified via spike).
  - `MarkerParser`, `wait_for_answer`, `post_inbox_marker` are all callable in isolation — Plan 04 reuses them via the same imports.
  - `fake_claude_stream.py` supports an `--emit-decision` mode that pauses on stdin until a `{type:user}` follow-up arrives — Plan 04's follow-up-pump tests can build on this.
  - The wake-up follow-up at `run_stream.handle_marker.DECISION` (lines ~120-145) is the SINGLE point Plan 04 modifies to plug in queue-driven follow-up content. Everything else stays.

**Test count delta:** 246 → 271 (+25 across Plan 03). Suite remains 100% green. Wave 1 = 226 baseline, Wave 2 added +20 (246), Wave 3 adds +25 (271).

## Self-Check: PASSED

Verified all created files exist and all commit hashes resolve:

- `backend/cmc/dispatcher/marker_parser.py` — FOUND
- `backend/cmc/dispatcher/answer_poll.py` — FOUND
- `backend/cmc/dispatcher/inbox_post.py` — FOUND
- `backend/cmc/dispatcher/run_stream.py` — FOUND
- `backend/cmc/dispatcher/_input_format_spike.py` — FOUND
- `backend/tests/fixtures/fake_claude_stream.py` — FOUND
- Commit `37d09e5` (Task 1 RED) — FOUND
- Commit `592c71a` (Task 1 GREEN) — FOUND
- Commit `f907e6c` (Task 2 RED) — FOUND
- Commit `6ceb130` (Task 2 GREEN) — FOUND
- Commit `487b468` (Task 3 RED) — FOUND
- Commit `143fa01` (Task 3 GREEN) — FOUND
- Test suite: `cd backend && uv run pytest` → 271 passed (246 baseline + 25 new) — PASSED
- Spike: `cd backend && uv run python -m cmc.dispatcher._input_format_spike` → exit 0, prints `accepted: assistant event observed` — PASSED

---
*Phase: 08-mission-control-dispatcher*
*Completed: 2026-04-27*
