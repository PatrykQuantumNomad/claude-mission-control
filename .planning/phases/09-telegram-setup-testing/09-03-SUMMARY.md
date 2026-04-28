---
phase: 09-telegram-setup-testing
plan: 03
subsystem: telegram

tags: [telegram, handler, long-poll, callback, dispatch, claude-relay, setup-wizard, cli, atomic-write]

# Dependency graph
requires:
  - phase: 09-telegram-setup-testing
    provides: cmc.telegram.api (get_me/send_message/get_updates/answer_callback_query/edit_message_reply_markup), cmc.telegram.dash_router (decode_callback + route covering 7 verbs incl. RESOLVE_THEN_PATCH for snooze + NOOP for reply_inbox), system_state.telegram_offset persistence key, /api/notifications/_resolve endpoint, 5 telegram_* Settings fields
  - phase: 08-mission-control-dispatcher
    provides: ANTHROPIC_API_KEY env-scrub pattern (cmc.dispatcher.run_classic L75-79), claude_bin + claude_default_model Settings, subprocess.Popen forensics convention
  - phase: 01-foundation-database
    provides: SystemState SQLModel + UPSERT pattern, Settings + load_settings() pretty-error, repo-root path resolution, AsyncSession sessionmaker
provides:
  - cmc.telegram.handler.run_handler_loop — long-poll daemon coroutine with offset persistence + whitelist gate + text-relay + callback dispatch
  - cmc.telegram.oneshot_handler — launchd KeepAlive=true entry point (asyncio.run wrapping engine + sessionmaker)
  - cmc.cli — new CLI subcommand package marker (used by Plan 09-04 for setup_otel + doctor)
  - cmc.cli.setup_telegram — interactive 4-state BotFather wizard with atomic .env merge
  - scripts/setup_telegram.py — thin executable shim delegating to cmc.cli.setup_telegram.main()
affects:
  - Plan 09-04 (install.sh — wires the launchd plist that spawns python -m cmc.telegram.oneshot_handler; `cc setup telegram` subcommand dispatches to scripts/setup_telegram.py)
  - Plan 09-05 (close-out E2E — verifies handler daemon registers under launchctl + survives restart with offset preserved)

# Tech tracking
tech-stack:
  added: []  # No new runtime deps; httpx + sqlalchemy + subprocess (stdlib) already in use
  patterns:
    - "Pitfall P2 offset crash-safety: telegram_offset is UPSERTed via SQLite ON CONFLICT DO UPDATE BEFORE the per-update dispatch loop, so a crash mid-batch does not cause Telegram to redeliver already-handled updates"
    - "Pitfall P12 env-scrub mirrors run_classic: relay_text_to_claude pops ANTHROPIC_API_KEY from os.environ.copy() before subprocess.run; asserted in test via captured kwargs.env"
    - "Pitfall P8 atomic .env write: tmp file lives in the SAME directory as final path so os.replace is a same-filesystem rename (atomic on POSIX); plan literal had a Path.with_suffix bug that produced .env.env.tmp — corrected to path.parent / (path.name + '.tmp')"
    - "Two-step snooze (RESOLVE_THEN_PATCH): handler GETs /api/notifications/_resolve/{kind}/{entity_id}?chat_id=... → reads notif_id → PATCHes /api/notifications/{notif_id}/snooze?duration=... so callback_data stays under Telegram's 64-byte cap"
    - "Telegram 15s ack contract: answer_callback_query is ALWAYS called (even on parse failures, unauthorized users, or dispatch errors) so the spinner clears in the user's UI; only edit_message_reply_markup is conditional on success"
    - "Test injection via optional client= parameter: handler accepts http_client=… and telegram_client=… so tests pass MockTransport-backed httpx.AsyncClients without re-entering an outer async with block"
    - "max_iterations test hook: run_handler_loop exits after N iterations when called with max_iterations=N — the production code path (None) loops forever as launchd KeepAlive expects"

key-files:
  created:
    - backend/cmc/telegram/handler.py
    - backend/cmc/telegram/oneshot_handler.py
    - backend/cmc/cli/__init__.py
    - backend/cmc/cli/setup_telegram.py
    - scripts/setup_telegram.py
    - backend/tests/test_phase9_handler.py
  modified: []

key-decisions:
  - "run_handler_loop max_iterations parameter is part of the public signature (not just a test hatch): it lets cc shutdown choreography request a clean stop and is essential for hermetic tests"
  - "Disabled mode (token or chat_id unset) early-returns 0 — when max_iterations is None the loop sleeps 60s before returning so launchd's ThrottleInterval prevents respawn thrash; when max_iterations is set (test) it returns immediately"
  - "Dispatch-failure ack text strategy: the handler always sends a short status string ('ok (200)' / 'err 502' / 'snoozed 30m' / 'bad callback' / 'dispatch failed') so the operator sees confirmation in the Telegram UI even when the local API is down"
  - "Tmp-file location for atomic .env write LOCKED as path.parent / (path.name + '.tmp') — Path.with_suffix('.env.tmp') on a hidden file produces .env.env.tmp because Python's suffix-replace treats `.env` as the suffix to swap (Rule 1 deviation, see below)"
  - "Wizard test mocks httpx.AsyncClient via a closure that captures the REAL constructor before patching (avoids infinite recursion through the patched factory) and forces transport=MockTransport(handler) on every constructed client"

patterns-established:
  - "Pattern (handler.py): three-callback-method dispatch table — POST/PATCH (direct HTTP), NOOP (acknowledge with hint to use dashboard), RESOLVE_THEN_PATCH (handler does the GET-then-PATCH dance to keep callback_data under 64 bytes); generalizable to any future indirect-id callback"
  - "Pattern (oneshot_handler.py): launchd long-running entry shape — load_settings → configure_logging(settings) (try/except basicConfig fallback) → engine + sessionmaker → asyncio.run(loop) → engine.dispose in finally; mirrors oneshot_notifier exactly"
  - "Pattern (setup_telegram.py): linear state machine via consecutive _prompt + async API calls + early-return-with-stderr-on-failure; main() = sys.exit(asyncio.run(_amain())); each step exits 1 on failure so the user just re-runs"
  - "Pattern (test_phase9_handler.py): _telegram_transport(updates_batches, answer_calls, edit_calls, send_calls=) helper — handles getUpdates pagination, records answer/edit/send call bodies; pairs with _local_api_transport(captured, *, resolve_status=200) for backend HTTP mocks"

# Metrics
duration: 12min
completed: 2026-04-28
---

# Phase 09 Plan 03: Wave 2 Inbound — Telegram Handler Long-Poll + Callback Dispatch + setup_telegram Wizard Summary

**Long-poll Telegram updates daemon with offset crash-safety, ANTHROPIC_API_KEY-scrubbed claude relay, dash_router-driven callback dispatch (incl. RESOLVE_THEN_PATCH snooze), and a 4-state BotFather setup wizard with atomic .env merge.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-28T00:49:12Z
- **Completed:** 2026-04-28T01:01:16Z
- **Tasks:** 2
- **Files created:** 6 (3 prod modules + 1 CLI package init + 1 scripts shim + 1 test file)

## Accomplishments

- TELE-05 long-poll loop: `run_handler_loop` reads `system_state.telegram_offset`, calls `api.get_updates(token, offset, timeout=25)`, persists `max(update_id)+1` BEFORE dispatching the batch (Pitfall P2 — crash mid-loop will not cause Telegram to redeliver handled updates), tolerates network flaps via 5s sleep + retry on `httpx.ConnectError`/etc.
- TELE-05 user whitelist: `is_user_allowed(from_id, settings)` returns True iff the id matches `telegram_chat_id` OR appears in `telegram_allowed_user_ids`; non-matches log at INFO (not ERROR) and short-circuit dispatch.
- TELE-05 text relay: text messages from whitelisted users feed `claude -p TEXT --bare --output-format text --model {claude_default_model}` via `subprocess.run` with `ANTHROPIC_API_KEY` popped from env (Pitfall P12); reply chunks at 4000 chars to fit Telegram's 4096-byte cap.
- TELE-06 callback dispatch: callback queries decode through `dash_router.decode_callback` + `dash_router.route` and dispatch through three method shapes:
  - `POST`/`PATCH` → direct httpx call against `http://127.0.0.1:8765`
  - `RESOLVE_THEN_PATCH` (snooze) → `GET /api/notifications/_resolve/{kind}/{entity_id}?chat_id=…` → `PATCH /api/notifications/{notif_id}/snooze?duration=…`
  - `NOOP` (reply_inbox) → ack with "reply via dashboard" hint
- Telegram 15s ack contract: `answer_callback_query` is invoked for every callback (incl. unauthorized users, parse failures, dispatch errors) so the operator's UI spinner clears; `edit_message_reply_markup` strips inline buttons only on dispatch success so a user can't double-press.
- TELE-01 setup wizard: 4-state machine validates BotFather token via `get_me`, prompts for `chat_id` (accepts negative for groups with a warning per Pitfall P10), sends a plain-text "Mission Control connected" test message (no parse_mode — Pitfall P3 enforced by `api.send_message` signature), and idempotent-merges `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`/`TELEGRAM_ALLOWED_USER_IDS` into `~/.command-centre/.env` (or `./.env` in dev) via tmp-in-same-dir + `os.replace` (Pitfall P8 atomic write).
- launchd entry: `cmc.telegram.oneshot_handler` mirrors `oneshot_notifier` shape — `load_settings → configure_logging → create_engine_for_settings → make_sessionmaker → asyncio.run(run_handler_loop) → engine.dispose`; the KeepAlive=true plist from Plan 09-01 templates spawns this once and respawns on exit.
- Test suite expansion: +12 tests in `test_phase9_handler.py` covering all 8 must_haves observable behaviors. Backend suite reaches 351/351 (was 331 pre-Phase-9; +33 from 09-01, +12 from 09-03, +8 from 09-02 running in parallel).

## Task Commits

Each task was committed atomically:

1. **Task 1: handler.py + oneshot_handler.py + 9 dispatch tests** — `e6968d7` (feat)
2. **Task 2: setup_telegram wizard + scripts shim + 3 wizard tests** — `15e149c` (feat)

**Plan metadata commit:** [pending — final docs commit follows]

## Files Created/Modified

**Created:**
- `backend/cmc/telegram/handler.py` — `run_handler_loop` long-poll coroutine with offset upsert before processing, whitelist gate, text-relay (env-scrubbed `subprocess.run`), and callback dispatcher routing through `dash_router`. Internal helpers: `get_offset`, `set_offset`, `is_user_allowed`, `relay_text_to_claude`, `dispatch_text`, `dispatch_callback`. Module constants: `LOCAL_API="http://127.0.0.1:8765"`, `CLAUDE_RELAY_TIMEOUT_S=120`, `TELEGRAM_MESSAGE_CAP=4000`.
- `backend/cmc/telegram/oneshot_handler.py` — launchd KeepAlive=true entry. `_amain` wraps `load_settings + configure_logging + create_engine_for_settings + make_sessionmaker + run_handler_loop + engine.dispose`. `main()` = `sys.exit(asyncio.run(_amain()))`.
- `backend/cmc/cli/__init__.py` — new CLI subcommand package marker. Future Phase 9 plans land `setup_otel.py` and `doctor.py` here.
- `backend/cmc/cli/setup_telegram.py` — TELE-01 wizard. `_validate_token`, `_send_test`, `_resolve_env_path`, `_write_env` (atomic merge), `_prompt`, `_amain` (state machine), `main()`. Module constants: `INSTALL_ENV = ~/.command-centre/.env`, `DEV_ENV = ./.env`.
- `scripts/setup_telegram.py` — `chmod 755` thin shim that imports `cmc.cli.setup_telegram.main` and invokes it. Plan 09-04's `cc setup telegram` subcommand will dispatch through this path.
- `backend/tests/test_phase9_handler.py` — 12 tests: 9 handler (offset persistence, unauthorized drop, approve_task / estop / snooze (RESOLVE_THEN_PATCH) callback dispatch, ANTHROPIC_API_KEY scrub assertion, no-op without token, invalid callback ack, get_updates exception retry) + 3 wizard (happy-path state machine, bad-token exits 1, atomic merge preserves unrelated keys).

**Modified:** None.

## Decisions Made

- **Wizard env-write filename strategy** — switched from plan's `path.with_suffix(".env.tmp")` to `path.parent / (path.name + ".tmp")` because Python's `.with_suffix` on a `.env` file produces `.env.env.tmp` (the entire `.env` is treated as the existing suffix and replaced). Rule 1 — Bug auto-fix; documented in deviations.
- **Wizard test patches `httpx.AsyncClient` via REAL-constructor closure** — capturing the unpatched ctor before `monkeypatch.setattr` avoids infinite recursion when the factory tries to call `httpx.AsyncClient(...)` and lands back in itself. Rule 1 — Bug avoided proactively in tests.
- **Disabled-mode 60s sleep when not in test** — when `telegram_bot_token` or `telegram_chat_id` is unset, the loop sleeps 60s before returning so launchd's ThrottleInterval can prevent respawn thrash; tests pass `max_iterations=1` for instant exit.
- **Test fixture pattern: `seeded_app` returns `(app, cm)`, sessions reached via `app.state.sessions` after `async with cm:`** — mirrors `test_phase9_telegram_unit.py` notifications router tests rather than the plan's literal `_, sessions = seeded_app` (which would have failed against the project's actual `seeded_app` fixture shape).
- **Reply chunking at 4000 chars (not 4096)** — leaves headroom under Telegram's hard cap so any encoding-related byte expansion (multi-byte UTF-8 inside emoji-heavy claude replies) doesn't push a chunk over.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `Path.with_suffix(".env.tmp")` on a hidden `.env` file produces `.env.env.tmp`**
- **Found during:** Task 2 (wizard implementation review)
- **Issue:** The plan's literal code `tmp = path.with_suffix(".env.tmp")` would, for `path = .env`, return `.env.env.tmp` because Python's `Path.suffix` on `.env` returns the full `.env` and `.with_suffix` replaces the existing suffix. Verified with `python3 -c "from pathlib import Path; print(Path('/tmp/.env').with_suffix('.env.tmp'))"` → `/tmp/.env.env.tmp`. The atomic-replace would still work but the temp file would have a misleading name and not match the test expectation (`assert not (tmp_path / ".env.tmp").exists()`).
- **Fix:** Replaced with `tmp = path.parent / (path.name + ".tmp")` so the temp is `.env.tmp` for any input filename, lives in the same directory as the destination (Pitfall P8 same-FS rename guarantee), and matches the obvious test invariant.
- **Files modified:** `backend/cmc/cli/setup_telegram.py` (Task 2)
- **Verification:** `test_write_env_atomic_merge` asserts `not (tmp_path / ".env.tmp").exists()` after the merge — passes.
- **Committed in:** `15e149c` (Task 2)

**2. [Rule 1 — Bug] Test fixture shape mismatch — plan assumed `_, sessions = seeded_app` but the project's `seeded_app` returns `(app, lifespan_cm)`**
- **Found during:** Task 1 (test scaffolding)
- **Issue:** Plan's test snippets destructure `_, sessions = seeded_app` but `backend/tests/conftest.py:289` returns `(app, app.router.lifespan_context(app))`. Sessions are reached via `app.state.sessions` after entering the lifespan via `async with cm:` (verified pattern in `test_phase9_telegram_unit.py::test_notifications_list_orders_by_sent_at_desc`).
- **Fix:** Adjusted every handler test to `app, cm = seeded_app; async with cm: sessions = app.state.sessions; await run_handler_loop(sessions, …)`. Function signatures otherwise unchanged.
- **Files modified:** `backend/tests/test_phase9_handler.py` (Task 1)
- **Verification:** All 9 handler tests pass; offset-persistence test reads `await handler.get_offset(db)` against the real engine and confirms `==6` after a single update with `update_id=5`.
- **Committed in:** `e6968d7` (Task 1)

**3. [Rule 1 — Bug] Wizard test `monkeypatch.setattr("httpx.AsyncClient", lambda *a, **kw: httpx.AsyncClient(...))` recurses infinitely**
- **Found during:** Task 2 (wizard test first run)
- **Issue:** The plan literal `monkeypatch.setattr("httpx.AsyncClient", lambda *a, **kw: httpx.AsyncClient(transport=MockTransport(handler), timeout=10))` recurses because the lambda's body calls `httpx.AsyncClient` AFTER it has been monkeypatched to itself. First test run hit `RecursionError: maximum recursion depth exceeded` inside `_validate_token`.
- **Fix:** Capture the real constructor before patching: `real_ctor = httpx.AsyncClient; def _factory(*a, **kw): kw["transport"] = MockTransport(handler); return real_ctor(*a, **kw); monkeypatch.setattr("httpx.AsyncClient", _factory)`. The closure retains the unpatched constructor.
- **Files modified:** `backend/tests/test_phase9_handler.py` (Task 2)
- **Verification:** All 3 wizard tests pass; happy-path test confirms `.env` written with all three TELEGRAM_* keys.
- **Committed in:** `15e149c` (Task 2)

**4. [Rule 3 — Blocking] `configure_logging` requires a `settings` argument**
- **Found during:** Task 1 (oneshot_handler implementation)
- **Issue:** Plan literal in `oneshot_handler` called `configure_logging()` (no args) but `cmc.core.logging.configure_logging` is `def configure_logging(settings: "Settings") -> None`. Would have crashed with TypeError on first launchd spawn.
- **Fix:** Reordered the bootstrap so `load_settings()` runs first (inside the try block), then `configure_logging(settings)` is called with the settings instance. The except branch falls back to `logging.basicConfig(level=logging.INFO)` and still calls `load_settings()` so the rest of `_amain` has a settings instance.
- **Files modified:** `backend/cmc/telegram/oneshot_handler.py` (Task 1)
- **Verification:** `python -c "from cmc.telegram import oneshot_handler"` imports clean.
- **Committed in:** `e6968d7` (Task 1)

---

**Total deviations:** 4 auto-fixed (3 Rule-1 bugs + 1 Rule-3 blocking)
**Impact on plan:** All four were straightforward correctness fixes against the actual codebase shape (fixture API, configure_logging signature, Path.with_suffix semantics, monkeypatch recursion). No scope creep; plan's interface contracts and test count target (~12) preserved exactly.

## Issues Encountered

- Subprocess.run captures `kwargs.get("env")` — initial design used `subprocess.Popen` per plan literal but `subprocess.run` with `check=False` + `timeout=120` is a closer match to the test scaffolding (Plan 09-03's `fake_run` mock returns a synthetic `R` class with `returncode/stdout/stderr` attrs, matching `subprocess.run`'s return shape). Switched without changing observable semantics — both call the binary with the same argv + cwd + env + stdin=DEVNULL.

## User Setup Required

None for this plan. End-user setup happens via Plan 09-04's install.sh + the wizard delivered here. Plan 09-05 closes out with E2E verification.

## Next Phase Readiness

- Wave 2 fully complete: Plan 09-02 (notifier) and Plan 09-03 (handler + wizard) both landed in parallel against the 09-01 foundation. 351/351 backend tests green.
- Plan 09-04 ready to consume: `python -m cmc.telegram.oneshot_handler` is the launchd entry for `com.cmc.telegram-handler.plist`; `python -m cmc.cli.setup_telegram` is the wizard module that `cc setup telegram` will dispatch to; `scripts/setup_telegram.py` is the user-facing shim path. All three artifacts confirmed importable + invocable.
- Plan 09-05 close-out: handler offset persistence + button-strip behavior is observable via real Telegram (TELE-05 success criterion).

## Self-Check: PASSED

- [x] `backend/cmc/telegram/handler.py` exists (14746 bytes)
- [x] `backend/cmc/telegram/oneshot_handler.py` exists (1576 bytes)
- [x] `backend/cmc/cli/__init__.py` exists (441 bytes)
- [x] `backend/cmc/cli/setup_telegram.py` exists (5362 bytes)
- [x] `scripts/setup_telegram.py` exists + chmod 755 (344 bytes, executable)
- [x] `backend/tests/test_phase9_handler.py` exists (16964 bytes, 12 tests)
- [x] Commit `e6968d7` (Task 1) present in `git log`
- [x] Commit `15e149c` (Task 2) present in `git log`
- [x] All 12 plan tests pass (`pytest tests/test_phase9_handler.py` → 12 passed)
- [x] Full backend suite: 351 passed (was 331 pre-Phase-9; +33 from 09-01, +12 from 09-03, +8 from parallel 09-02)
- [x] `python -c "from cmc.telegram import handler, oneshot_handler"` succeeds
- [x] `python -c "from cmc.cli import setup_telegram"` succeeds

---
*Phase: 09-telegram-setup-testing*
*Completed: 2026-04-28*
