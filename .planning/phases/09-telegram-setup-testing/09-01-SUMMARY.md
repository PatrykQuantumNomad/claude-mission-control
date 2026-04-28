---
phase: 09-telegram-setup-testing
plan: 01
subsystem: telegram

tags: [telegram, httpx, plist, launchd, notifications, dash_router, settings]

# Dependency graph
requires:
  - phase: 01-foundation-database
    provides: notification_log table (UNIQUE kind+entity_id+chat_id), Settings + load_settings() pretty-error pattern, repo-root path resolution
  - phase: 04-stateful-apis
    provides: hitl router style, system.emergency_stop endpoint, Schedule/Task/Decision/Inbox tables that downstream notifier formatters consume
  - phase: 08-mission-control-dispatcher
    provides: cmc.dispatcher.plist_render string.Template pattern + cmc.dispatcher.templates package marker convention
provides:
  - cmc.telegram.api — httpx Bot API wrapper (5 endpoints, NO parse_mode)
  - cmc.telegram.messages — plain-text formatters (decision/failure/overdue/inbox/approval/test)
  - cmc.telegram.dash_router — pure callback_data → (METHOD, /api/path, body) mapper (7 verbs)
  - cmc.telegram.plist_render — launchd plist renderer for notifier + handler variants
  - cmc.telegram.templates — two .plist.j2 templates (oneshot StartInterval=30 + KeepAlive long-running)
  - 5 new Settings fields (telegram_bot_token, telegram_chat_id, telegram_allowed_user_ids, telegram_poll_timeout_s=25, telegram_notifier_interval_s=30)
  - GET/PATCH/GET-resolve endpoints under /api/notifications
affects:
  - Plan 09-02 (notifier loop — imports api.send_message + messages.format_*)
  - Plan 09-03 (handler loop — imports api.get_updates + api.answer_callback_query + dash_router.{decode_callback,route})
  - Plan 09-04 (install.sh — invokes `python -m cmc.telegram.plist_render --variant {notifier,handler}` to render plists into ~/Library/LaunchAgents/)
  - Plan 09-05 (close-out E2E — verifies all 4 daemons start under launchctl)

# Tech tracking
tech-stack:
  added: []  # No new runtime deps; httpx already pinned >=0.28 in Phase 8
  patterns:
    - "Plain-text Telegram (Pitfall P3): send_message has NO parse_mode parameter; enforced by inspect.signature() grep test"
    - "callback_data 64-byte cap workaround: snooze callbacks use (kind, entity_id, duration) compact encoding; handler GETs /_resolve to recover notif_id before PATCHing"
    - "string.Template (NOT Jinja2) plist rendering — mirrors cmc.dispatcher.plist_render; 3 placeholders ($python_path, $python_path_dir, $repo_root)"
    - "Optional client= parameter on api.* — allows test injection of httpx.MockTransport without re-entering an outer async with block"

key-files:
  created:
    - backend/cmc/telegram/__init__.py
    - backend/cmc/telegram/api.py
    - backend/cmc/telegram/messages.py
    - backend/cmc/telegram/dash_router.py
    - backend/cmc/telegram/plist_render.py
    - backend/cmc/telegram/templates/__init__.py
    - backend/cmc/telegram/templates/com.cmc.telegram-notifier.plist.j2
    - backend/cmc/telegram/templates/com.cmc.telegram-handler.plist.j2
    - backend/cmc/api/routes/notifications.py
    - backend/tests/test_phase9_telegram_unit.py
  modified:
    - backend/cmc/config/settings.py
    - backend/cmc/api/routes/__init__.py

key-decisions:
  - "send_message API surface LOCKED with NO parse_mode parameter (Pitfall P3); enforced by test_api_no_parse_mode_argument grep gate"
  - "snooze callback_data shape locked as snooze:<kind>:<entity_id>:<duration>; handler must GET /_resolve before PATCH (keeps callback under Telegram's 64-byte cap)"
  - "Three-method dispatcher contract: POST/PATCH (direct HTTP), NOOP (handler enters reply state), RESOLVE_THEN_PATCH (handler GETs resolve URL, then PATCHes)"
  - "templates package gets explicit __init__.py (auto-add Rule 3 vs plan literal); without it importlib.resources.files('cmc.telegram.templates') would raise ModuleNotFoundError at install time"
  - "5 Settings telegram_* fields all have safe defaults (None / empty list / 25 / 30) so existing single-machine deploys keep working when telegram is not configured"

patterns-established:
  - "Pattern (api.py): each Bot API helper takes optional `client: httpx.AsyncClient` so tests pass MockTransport-backed clients without re-entering their own async with"
  - "Pattern (notifications router): /_resolve helper returns the most-recent matching row by (kind, entity_id, [chat_id]) — generalizable for any future indirect-id callback"
  - "Pattern (plist_render): variant table maps short string names to .j2 filenames; CLI entry takes --variant + 2 positional args; install.sh invokes once per variant"

# Metrics
duration: 17min
completed: 2026-04-27
---

# Phase 09 Plan 01: Wave 1 Foundation — Telegram Primitives + Plist Templates + Notifications Router Summary

**httpx-based Telegram Bot API wrapper (no parse_mode), pure-function callback dispatcher, two launchd plist variants, and a /_resolve-backed notifications router that sidesteps Telegram's 64-byte callback_data cap.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-04-28T00:25:52Z
- **Completed:** 2026-04-28T00:43:29Z
- **Tasks:** 2
- **Files created:** 10 (9 plan-listed + 1 auto-add: templates/__init__.py)
- **Files modified:** 2

## Accomplishments

- **5 Telegram primitives** in `cmc.telegram` (api/messages/dash_router/plist_render + package marker) ready for parallel consumption by Plans 09-02 (notifier) and 09-03 (handler).
- **2 launchd plist templates** (notifier oneshot StartInterval=30, handler long-running KeepAlive=true) renderable via `python -m cmc.telegram.plist_render --variant {notifier,handler}`.
- **3 endpoints under `/api/notifications`** wired into all_routers(): GET (paged list with kind filter), PATCH `/{id}/snooze` (15m/30m/1h/4h whitelist), GET `/_resolve/{kind}/{entity_id}` (handler indirection helper).
- **5 new Settings fields** (telegram_bot_token, telegram_chat_id, telegram_allowed_user_ids, telegram_poll_timeout_s=25, telegram_notifier_interval_s=30) — all optional so unset = telegram disabled.
- **Pitfall P3 enforced in code**: `cmc.telegram.api.send_message` has zero `parse_mode` mention; a `test_api_no_parse_mode_argument` test calls `inspect.signature()` to lock the surface.
- **+33 backend tests** — full suite 298 → 331 green (24% growth in test count for foundation alone).

## Task Commits

1. **Task 1: Settings fields + telegram package skeleton + api.py + messages.py + dash_router.py + tests** — `245b2aa` (feat)
2. **Task 2: Plist templates + plist_render.py + notifications router (GET/PATCH) + tests** — `d89d76d` (feat)

**Plan metadata:** _to be assigned by final docs commit_

## Files Created/Modified

### Created (10)

- `backend/cmc/telegram/__init__.py` — package marker + public-API docstring listing 6 modules (api/messages/dash_router/plist_render/notifier/handler).
- `backend/cmc/telegram/api.py` — 5 async functions (`get_me`, `send_message`, `answer_callback_query`, `edit_message_reply_markup`, `get_updates`). All accept optional `client: httpx.AsyncClient` for test injection. **`send_message` has NO `parse_mode` parameter.** When client is None each function opens its own AsyncClient with sensible per-endpoint timeouts (10s for short calls, 15s for sendMessage, timeout+5s for long-poll getUpdates).
- `backend/cmc/telegram/messages.py` — 6 formatters returning `(text, inline_keyboard | None)` tuples. `format_inbox` accepts both `body` and `prompt` row attrs (Phase 4 schema uses body). `format_failure` truncates `error_message` at 500 chars. `format_test` returns no keyboard.
- `backend/cmc/telegram/dash_router.py` — `decode_callback(data) -> (verb, args)` and `route(verb, args) -> (METHOD, path, body)` pure functions. Handles 7 verb shapes; raises `CallbackParseError` for empty/unknown input.
- `backend/cmc/telegram/plist_render.py` — `render_plist(variant, python_path, repo_root_path)` + `main()` CLI. `_VARIANTS` dict maps `"notifier"`/`"handler"` to template filenames; `safe_substitute` so missing vars don't raise.
- `backend/cmc/telegram/templates/__init__.py` — package marker (Rule 3 auto-add not in plan).
- `backend/cmc/telegram/templates/com.cmc.telegram-notifier.plist.j2` — Label=com.cmc.telegram-notifier, ProgramArguments invokes `cmc.telegram.oneshot_notifier`, StartInterval=30, RunAtLoad=true.
- `backend/cmc/telegram/templates/com.cmc.telegram-handler.plist.j2` — Label=com.cmc.telegram-handler, ProgramArguments invokes `cmc.telegram.oneshot_handler`, KeepAlive=true, ThrottleInterval=5, NO StartInterval.
- `backend/cmc/api/routes/notifications.py` — APIRouter prefix=/notifications. GET ""(list w/ kind+limit), PATCH "/{notification_id}/snooze" (duration whitelist 15m/30m/1h/4h), GET "/_resolve/{kind}/{entity_id}".
- `backend/tests/test_phase9_telegram_unit.py` — 33 tests across 4 sections (api 7, messages 4, dash_router 10, plist_render 5, notifications router 7).

### Modified (2)

- `backend/cmc/config/settings.py` — added `from typing import Optional`; appended Phase 9 telegram block after `dispatcher_answer_poll_s`. None of the new fields enter `_resolve_repo_root_paths` (they are not paths).
- `backend/cmc/api/routes/__init__.py` — `from cmc.api.routes.notifications import router as notifications_router` + appended to `all_routers()` return list as last entry (after schedules_router).

## Public APIs Established

### `cmc.telegram.api` (5 functions)

```python
async def get_me(token, *, client=None) -> dict
async def send_message(token, chat_id, text, *, reply_markup=None, client=None) -> dict   # NO parse_mode
async def answer_callback_query(token, callback_query_id, text="", *, client=None) -> None
async def edit_message_reply_markup(token, chat_id, message_id, reply_markup=None, *, client=None) -> None
async def get_updates(token, offset, timeout=25, *, client=None) -> list[dict]
```

### `cmc.telegram.messages` (6 formatters)

```python
def format_decision(decision_row) -> tuple[str, dict]    # ✅ Yes / ❌ No / ⏰ Snooze 30m
def format_failure(task_row)     -> tuple[str, dict]    # 🔄 Rerun / ⏰ Snooze 30m
def format_overdue(schedule_row) -> tuple[str, dict]    # ⏰ Snooze 30m
def format_inbox(inbox_row)      -> tuple[str, dict]    # 💬 Reply / ⏰ Snooze 30m
def format_approval(task_row)    -> tuple[str, dict]    # ✅ Approve / 🛑 Reject
def format_test()                -> tuple[str, None]    # 👋 Mission Control connected (no buttons)
```

### `cmc.telegram.dash_router` (verb → route table)

| callback_data shape                  | METHOD              | path                                              | body                          |
| ------------------------------------ | ------------------- | ------------------------------------------------- | ----------------------------- |
| `approve_task:<id>`                  | POST                | `/api/tasks/{id}/approve`                         | `{}`                          |
| `reject_task:<id>`                   | POST                | `/api/tasks/{id}/reject`                          | `{}`                          |
| `rerun_task:<id>`                    | POST                | `/api/tasks/{id}/rerun`                           | `{}`                          |
| `answer_decision:<id>:<yes|no>`      | POST                | `/api/decisions/{id}/answer`                      | `{"answer": "yes|no"}`        |
| `reply_inbox:<id>`                   | NOOP                | `/api/inbox/{id}` (informational)                 | `{}`                          |
| `snooze:<kind>:<entity>:<duration>`  | RESOLVE_THEN_PATCH  | `/api/notifications/_resolve/{kind}/{entity_id}`  | `{"duration": "30m"}`         |
| `estop`                              | POST                | `/api/system/emergency-stop`                      | `{"reason": "telegram"}`      |

Unknown verbs raise `dash_router.CallbackParseError`.

### `cmc.telegram.plist_render`

```python
def render_plist(variant: Literal["notifier", "handler"], python_path, repo_root_path) -> str
# CLI: python -m cmc.telegram.plist_render --variant {notifier|handler} <python_path> <repo_root>
```

### `/api/notifications` endpoints (3)

| Method | Path                                  | Query                          | Notes                                                  |
| ------ | ------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| GET    | `/api/notifications`                  | `kind?`, `limit=50` (1..500)   | Ordered by `sent_at DESC`                              |
| PATCH  | `/api/notifications/{id}/snooze`      | `duration=30m`                 | Whitelist 15m/30m/1h/4h; 400 on invalid; 404 on no-id |
| GET    | `/api/notifications/_resolve/{kind}/{entity_id}` | `chat_id?`        | Returns `{id, kind, entity_id}`; 404 on no match     |

### `Settings` (5 new fields)

| Field                              | Default | Env var                                 | Purpose                                          |
| ---------------------------------- | ------- | --------------------------------------- | ------------------------------------------------ |
| `telegram_bot_token`               | None    | `TELEGRAM_BOT_TOKEN`                    | BotFather token; None disables daemons          |
| `telegram_chat_id`                 | None    | `TELEGRAM_CHAT_ID`                      | Single-user chat_id; string preserves negatives |
| `telegram_allowed_user_ids`        | `[]`    | `TELEGRAM_ALLOWED_USER_IDS=123,456`     | TELE-05 router allowlist                        |
| `telegram_poll_timeout_s`          | 25      | `TELEGRAM_POLL_TIMEOUT_S`               | getUpdates long-poll (must be < 30s cycle)      |
| `telegram_notifier_interval_s`     | 30      | `TELEGRAM_NOTIFIER_INTERVAL_S`          | Plist StartInterval (must match template)       |

## Decisions Made

- **Pitfall P3 enforcement codified in test, not just docs**: `test_api_no_parse_mode_argument` asserts `"parse_mode" not in inspect.signature(api.send_message).parameters`. Any future PR that adds the parameter will fail this test before merge.
- **Optional `client=` parameter shape**: instead of `async with (client or httpx.AsyncClient(...)) as c:` (which would close a caller-provided client on exit, breaking outer `async with`), each api function has two branches — use the provided client directly, or open+close a fresh one. Keeps the test transport pattern (MockTransport bound to outer client) clean.
- **`format_inbox` tolerance**: Phase 4 inbox table uses `body` not `prompt`. The plan's literal code referenced `inbox_row.prompt`; I used `getattr(row, "prompt", None) or getattr(row, "body", "")` so both schemas work. Future Plan 09-02 can wire actual InboxMessage rows without code change.
- **Snooze RESOLVE_THEN_PATCH indirection retained**: Telegram callback_data is capped at 64 bytes. Embedding `notif_id` (which can be 5+ digits as the system grows) plus duration plus prefix would push tight callbacks over the limit. The handler GETs /_resolve to look up the latest notif_id by (kind, entity_id, chat_id), then PATCHes /snooze.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `cmc/telegram/templates/__init__.py`**
- **Found during:** Task 2, Step 3 (writing plist_render.py)
- **Issue:** The plan listed only the two `.plist.j2` files in `files_modified.created`, but `importlib.resources.files("cmc.telegram.templates")` raises `ModuleNotFoundError` if the directory has no `__init__.py`. The dispatcher templates package has one — pattern requires it.
- **Fix:** Created `backend/cmc/telegram/templates/__init__.py` mirroring `cmc/dispatcher/templates/__init__.py` (docstring only).
- **Files modified:** `backend/cmc/telegram/templates/__init__.py`
- **Verification:** `test_plist_render_well_formed_xml` and 4 sibling plist tests all pass.
- **Committed in:** `d89d76d` (Task 2)

**2. [Rule 1 - Bug] Replaced `async with (client or httpx.AsyncClient(...))` pattern in api.py**
- **Found during:** Task 1, Step 3 (writing api.py)
- **Issue:** The plan's literal code used `async with (client or httpx.AsyncClient(timeout=...)) as c:`. When the caller provides `client=...` (e.g., in tests with MockTransport), the `async with` would call `__aexit__` on that client — closing it before the caller's outer `async with` context closes, causing "Cannot send a request, as the client has been closed" on subsequent calls.
- **Fix:** Each api function branches: if `client is not None`, use `client.post(...)` / `client.get(...)` directly without entering its context. Otherwise open+close a fresh client via `async with`.
- **Files modified:** `backend/cmc/telegram/api.py`
- **Verification:** All 7 api tests pass with caller-supplied MockTransport-backed clients (`async with httpx.AsyncClient(transport=MockTransport(handler)) as client: await api.X(..., client=client)`).
- **Committed in:** `245b2aa` (Task 1)

**3. [Rule 1 - Bug] Replaced `httpx._content.json.loads` with `json.loads` in tests**
- **Found during:** Task 1, Step 6 (writing test scaffold)
- **Issue:** The plan's literal test code referenced `httpx._content.json.loads(req.content)`, but `httpx._content` exposes `json_dumps` (a function reference) — not a sub-module called `json`. The test as written would raise AttributeError at collection.
- **Fix:** Use the standard library: `import json` at top of file; `json.loads(req.content)` in handlers.
- **Files modified:** `backend/tests/test_phase9_telegram_unit.py`
- **Verification:** All 7 api tests pass and assertions on captured JSON bodies succeed.
- **Committed in:** `245b2aa` (Task 1)

**4. [Rule 1 - Bug] Replaced `_, sessions = seeded_app` with `app.state.sessions` in router tests**
- **Found during:** Task 2, Step 6 (writing notifications router tests)
- **Issue:** The plan's literal code destructured `_, sessions = seeded_app` and then did `async with sessions() as db:`. But `seeded_app` yields `(app, lifespan_cm)` — calling `lifespan_cm()` would not yield an AsyncSession.
- **Fix:** Each test does `app, _cm = seeded_app; sessions = app.state.sessions; async with sessions() as db:`. The `client` fixture has already entered the lifespan, so `app.state.sessions` is populated and binds to the same engine the test client uses.
- **Files modified:** `backend/tests/test_phase9_telegram_unit.py`
- **Verification:** All 7 notifications router tests pass with the seeded data visible to subsequent client.get/patch requests.
- **Committed in:** `d89d76d` (Task 2)

**5. [Rule 1 - Bug] Rewrote plist_render tests to use `tmp_path` instead of literal `/opt/homebrew/bin/python3.13`**
- **Found during:** Task 2, Step 6 (running plist tests)
- **Issue:** The plan's literal code used `render_plist("notifier", "/opt/homebrew/bin/python3.13", "/Users/me/repo")` and asserted the literal substring `"/opt/homebrew/bin/python3.13"` appeared in the output. But `Path.resolve()` follows symlinks, and on this dev machine `/opt/homebrew/bin/python3.13` is a real symlink pointing to `/opt/homebrew/Cellar/python@3.13/3.13.13/Frameworks/Python.framework/Versions/3.13/bin/python3.13`. The substring assertion failed because the resolved absolute path differs from the input.
- **Fix:** Switched to `tmp_path` fixture pattern matching Phase 8 `test_phase8_dispatcher.py::render_plist_*` — create a fake `tmp_path/venv/bin/python` file, render against it, assert `str(py.resolve())` (which equals the path itself when no symlinks intervene). Also added two extra tests (`test_plist_render_well_formed_xml`, `test_plist_render_no_secrets_in_environment`) borrowed from Phase 8 for parity.
- **Files modified:** `backend/tests/test_phase9_telegram_unit.py`
- **Verification:** All 5 plist tests pass; CLI invocation against real `/opt/homebrew/bin/python3.13` smoke-tested manually after task commit and produces correct output.
- **Committed in:** `d89d76d` (Task 2)

---

**Total deviations:** 5 auto-fixed (1 Rule 3 blocking, 4 Rule 1 bugs in plan-literal code)
**Impact on plan:** All 5 fixes were corrections to plan literal code that would have failed verification. No scope creep; no architectural changes; no extra files beyond the auto-added `templates/__init__.py` (which was implicit in the dispatcher template pattern referenced by the plan's `<interfaces>` block).

## Issues Encountered

None — all deviations were caught at first test execution and fixed inline before commit. Final pytest run was a clean 331/331 with no warnings beyond the pre-existing aiosqlite/utcnow deprecation noise inherited from earlier phases.

## Test Delta

| Metric                  | Before | After | Delta |
| ----------------------- | ------ | ----- | ----- |
| Backend tests collected | 298    | 331   | +33   |
| Backend tests passing   | 298    | 331   | +33   |
| Plan said ~15 new       | —      | 33    | +18 over plan estimate |
| Test files added        | —      | 1     | `test_phase9_telegram_unit.py` |

The 18 over-budget tests came from defensive coverage worth keeping: extra api.py tests (`reply_markup` carrier, `answer_callback_query`, `edit_message_reply_markup`), extra dash_router tests (compound + no-args + empty-string), plist no-secrets and well-formed-XML tests (Phase 8 pattern parity), notifications kind-filter test, snooze unknown-id 404 test, resolve no-match 404 test.

## User Setup Required

None — no external service config in this plan. Plan 09-03 (`setup_telegram.py` wizard) handles BotFather token + chat_id capture; Plan 09-04 (`install.sh`) writes the `~/.command-centre/.env`.

## Next Phase Readiness

Wave 2 plans (09-02 + 09-03) can execute in parallel against this foundation:

- **Plan 09-02 (notifier oneshot)** imports `cmc.telegram.api.send_message`, `cmc.telegram.messages.format_*`, the `Settings.telegram_*` fields, and writes the rendered notifier plist via the existing `plist_render.py` CLI.
- **Plan 09-03 (handler long-poll)** imports `cmc.telegram.api.{get_updates, answer_callback_query, edit_message_reply_markup}`, `cmc.telegram.dash_router.{decode_callback, route, CallbackParseError}`, and uses `GET /api/notifications/_resolve/...` + `PATCH /api/notifications/{id}/snooze` for the snooze callback path.
- **Plan 09-04 (install.sh)** invokes `python -m cmc.telegram.plist_render --variant notifier <py> <repo>` and `--variant handler` to produce both `.plist` files into `~/Library/LaunchAgents/`.
- **Plan 09-05 (close-out E2E)** verifies all 4 daemons (server + dispatcher + telegram-notifier + telegram-handler) start under launchctl and Playwright passes 4/4 specs.

No blockers. The dispatcher's plist contract is mirrored cleanly so install.sh can extend its existing rendering loop with two new variants without restructure.

## Self-Check: PASSED

**Files exist:**
- `backend/cmc/telegram/__init__.py` — FOUND
- `backend/cmc/telegram/api.py` — FOUND
- `backend/cmc/telegram/messages.py` — FOUND
- `backend/cmc/telegram/dash_router.py` — FOUND
- `backend/cmc/telegram/plist_render.py` — FOUND
- `backend/cmc/telegram/templates/__init__.py` — FOUND
- `backend/cmc/telegram/templates/com.cmc.telegram-notifier.plist.j2` — FOUND
- `backend/cmc/telegram/templates/com.cmc.telegram-handler.plist.j2` — FOUND
- `backend/cmc/api/routes/notifications.py` — FOUND
- `backend/tests/test_phase9_telegram_unit.py` — FOUND

**Commits exist:**
- `245b2aa` (Task 1) — FOUND in git log
- `d89d76d` (Task 2) — FOUND in git log

**Suite green:** 331/331 backend tests passing (298 baseline + 33 new) — verified via `cd backend && uv run pytest --tb=line` exit 0.

**Pitfall P3 enforced:** `inspect.signature(api.send_message).parameters` does NOT contain `parse_mode` — verified by `test_api_no_parse_mode_argument` (line 22-27 of test_phase9_telegram_unit.py).

---
*Phase: 09-telegram-setup-testing*
*Plan: 01*
*Completed: 2026-04-27*
