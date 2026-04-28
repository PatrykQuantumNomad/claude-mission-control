# Phase 9: Telegram, Setup & Testing — Research

**Researched:** 2026-04-27
**Domain:** (a) Telegram Bot API integration (one notifier daemon + one handler daemon, both polling-based; plain text + inline buttons + callbacks), (b) macOS install/launch tooling (`install.sh`, `cc` CLI shim, doctor.py, setup_otel.py, launchd plists), (c) Playwright @playwright/test e2e suite for the React dashboard.
**Confidence:** HIGH on inheritance contracts (notification_log table shape, dispatcher plist pattern, queue helpers, Settings layout, ESTOP wiring); HIGH on Telegram Bot API surface (long-polling getUpdates + sendMessage + answerCallbackQuery — a stable public API since 2015); HIGH on launchd LaunchAgent semantics (already proven in Plan 08-02); MEDIUM on setup_otel.py exact 6-key list (REQUIREMENTS.md says "6 OTEL env keys" without spelling them out — this RESEARCH proposes the canonical 6); MEDIUM on theme-toggle (TEST-04 contract: `verify theme toggle persists` — feature does NOT exist in the code today; either Phase 9 ships it or TEST-04 is reinterpreted as "color-scheme persists"); HIGH on Playwright @playwright/test current best practice (verified against 2025–2026 changelog).

## CONTEXT.md Status

**No CONTEXT.md exists for Phase 9** (per the orchestrator note). All implementation choices are at Claude's discretion within the bounds of REQUIREMENTS.md and PROJECT.md decisions. Gray-area choices are surfaced under "Open Questions" below — the planner should lock them on the way into 09-01-PLAN.

## Phase Goal & Scope

**Goal (echoed from ROADMAP):** Optional Telegram pager works for notifications and callbacks, one-command installer sets up everything, and Playwright tests verify the critical user flows.

**Phase 9 covers 18 requirements**:
- **TELE-01..07** (7) — Telegram setup wizard, notifier daemon, handler daemon, dedup, dash router, plist
- **SETUP-01..07** (7) — install.sh, setup_otel.py, doctor.py, cc shim
- **TEST-01..04** (4) — Playwright e2e tests

**Phase 9 success criteria (must all be TRUE at close-out):**
1. install.sh detects Python, creates venv, installs deps, copies files, renders launchd plists, produces a working `cc` CLI shim
2. `cc start / stop / restart / doctor / logs` all work correctly
3. setup_telegram.py wizard walks through BotFather setup and sends a test message
4. Telegram notifier sends plain-text notifications for decisions, failures, overdue schedules with working inline buttons
5. Playwright e2e tests pass (3 routes render, Cmd+K opens palette, schedule composer works, theme toggle persists)

**Out of scope** (deferred to v2 / out-of-band):
- Linux portability (PLAT-01 — systemd instead of launchd) — Phase 9 is launchd-only by REQUIREMENTS.md and PROJECT.md.
- Telegram group chats / multi-user (locked single-user by PROJECT.md).
- CI gating on Playwright (no formal CI yet — recommend `npm run test:e2e` as a manual gate; document the launch sequence).

## Requirements Coverage Map

| Req ID | Description | Delivery file/module |
|--------|-------------|----------------------|
| TELE-01 | setup_telegram.py wizard | `scripts/setup_telegram.py` (new — top-level scripts/) |
| TELE-02 | Notifier 30s loop checks decisions/approvals/failures/overdue/inbox | `backend/cmc/telegram/notifier.py` + `backend/cmc/telegram/oneshot_notifier.py` (launchd entry) |
| TELE-03 | Plain-text notifications + inline buttons | `backend/cmc/telegram/messages.py` (formatters) + `backend/cmc/telegram/api.py` (httpx wrapper) |
| TELE-04 | Dedup via notification_log UNIQUE + snooze | DB INSERT-OR-IGNORE in `notifier.py` against existing `notification_log` table; snooze via PATCH that sets `snoozed_until` |
| TELE-05 | Handler polls getUpdates, whitelists users, routes text→Claude CLI, callbacks→dash_router | `backend/cmc/telegram/handler.py` + `backend/cmc/telegram/oneshot_handler.py` (launchd entry, long-polling) |
| TELE-06 | dash_router routes inline button callbacks to dashboard API endpoints | `backend/cmc/telegram/dash_router.py` (pure function: callback_data → (METHOD, /api/path, body)) |
| TELE-07 | Launchd plist template for telegram-bot daemon (only installed if opted in) | `backend/cmc/telegram/templates/com.cmc.telegram.plist.j2` + `backend/cmc/telegram/plist_render.py` (parallels `cmc.dispatcher.plist_render`) |
| SETUP-01 | install.sh — Python detection (homebrew 3.12+), venv, deps | `scripts/install.sh` |
| SETUP-02 | install.sh — copies scripts, ui/dist, skills; creates `~/.command-centre/` layout | `scripts/install.sh` |
| SETUP-03 | install.sh — writes start.sh, stop.sh, `cc` shim | `scripts/install.sh` (writes), `scripts/cc` (template), `scripts/start.sh`, `scripts/stop.sh` |
| SETUP-04 | install.sh — renders + loads launchd plists | `scripts/install.sh` invokes `python -m cmc.dispatcher.plist_render` and `python -m cmc.telegram.plist_render` (plus a NEW `cmc.app.plist_render` for the FastAPI server itself) |
| SETUP-05 | setup_otel.py merges 6 OTEL env keys into settings.json (never overwrite) | `scripts/setup_otel.py` |
| SETUP-06 | doctor.py — zero-LLM 8-check health report | `scripts/doctor.py` |
| SETUP-07 | `cc` CLI — start/stop/restart/doctor/setup otel/setup telegram/sync/logs | `scripts/cc` (bash shim) — dispatches to `start.sh` / `stop.sh` / `python -m doctor` / etc. |
| TEST-01 | Playwright — all three routes render | `frontend/tests/e2e/routes.spec.ts` |
| TEST-02 | Playwright — Cmd+K opens palette | `frontend/tests/e2e/command-palette.spec.ts` |
| TEST-03 | Playwright — schedule composer creates a schedule | `frontend/tests/e2e/schedule-composer.spec.ts` |
| TEST-04 | Playwright — theme toggle persists | `frontend/tests/e2e/theme-toggle.spec.ts` (REQUIRES theme-toggle component — see Gap §below) |

## Existing Codebase Anchors (Phase 9 builds on)

These have already landed and Phase 9 reuses them verbatim. Plans should NOT re-implement.

| Anchor | Path | Phase 9 use |
|--------|------|-------------|
| Dispatcher plist template | `backend/cmc/dispatcher/templates/com.cmc.dispatcher.plist.j2` | Pattern for `com.cmc.telegram.plist.j2` (TELE-07); also pattern for a NEW `com.cmc.server.plist.j2` (FastAPI server as a launchd job — SETUP-04) |
| Plist render helper | `backend/cmc/dispatcher/plist_render.py` (string.Template, .j2 file is convention only) | Mirror at `cmc.telegram.plist_render` and `cmc.app.plist_render`; identical 3-substitution pattern (`python_path`, `python_path_dir`, `repo_root`) |
| Notification log model | `backend/cmc/db/models/notification_log.py` — `(kind, entity_id, sent_at, chat_id, message_id, snoozed_until, status)` with `UNIQUE(kind, entity_id, chat_id)` | TELE-04 dedup ledger — already exists; Phase 9 adds INSERT-OR-IGNORE + snooze PATCH; **no Alembic migration needed** |
| System state KV | `backend/cmc/db/models/system_state.py` (key/value/value_json) | TELE-02 stamp `telegram_last_tick_at` (already whitelisted by SAPI-03 — see system.py L62-68) for SAPI-04 staleness; also `telegram_offset` for getUpdates last_update_id persistence |
| Queue helpers | `backend/cmc/core/queue.py` (queue_path, write_decision_answer, write_inbox_reply) | TELE-05 text-to-Claude routing reuses queue layout when relaying to a session; TELE-06 callbacks calling answer/reply routes go through the existing /api/decisions/{id}/answer + /api/inbox/{id}/reply HTTP paths (no DB writes from Telegram code) |
| ESTOP path | POST /api/system/emergency-stop (system.py L384-441) | TELE-06 emergency-stop callback triggers the same endpoint — single source of truth for ESTOP order-of-operations |
| Decisions/Inbox/Tasks/Schedules APIs | `backend/cmc/api/routes/{hitl,tasks,schedules,system}.py` | TELE-06 dash_router maps callback_data verbs (`approve_task:42`, `answer_decision:7:yes`, `snooze:30m`, `estop`) → these endpoints |
| Settings (pydantic-settings) | `backend/cmc/config/settings.py` | New fields: `telegram_bot_token`, `telegram_chat_id`, `telegram_allowed_user_ids`, `telegram_poll_timeout_s`, `telegram_notifier_interval_s`. Settings layout pattern (model_validator path resolution) is locked. |
| 4-tier model resolver | `backend/cmc/dispatcher/model_resolve.py` | TELE-05 text-to-Claude relay reuses classic-mode patterns from `cmc.dispatcher.run_classic` (subprocess.Popen `claude -p`, `--bare`, `--output-format json`, `--model`, env scrub of ANTHROPIC_API_KEY) |
| `cc` working command for FastAPI | `uvicorn cmc.app.factory:create_app --factory --host 127.0.0.1 --port 8765` | SETUP-04 server plist's ProgramArguments |
| Frontend build pattern | `frontend/dist/` (Vite default) — already produced by `npm run build` | SETUP-02 copies this into `~/.command-centre/ui/dist/`; STATIC_DIR env points there in install mode |
| Frontend Cmd+K palette | `frontend/src/components/ui/CommandPalette.tsx` | TEST-02 target |
| ScheduleComposer + cron preview | `frontend/src/components/panels/ScheduleComposer.tsx` (Sheet + cronstrue) | TEST-03 target |
| Three routes | `frontend/src/routes/index.tsx`, `activity.tsx`, `skills.tsx` | TEST-01 target |
| `httpx>=0.28` | already a runtime dep (Phase 8 promoted from dev) | TELE-02/05 use it for Bot API calls and DISP-08-style POSTs to `/api/inbox` |
| ANTHROPIC_API_KEY scrub pattern | `cmc.dispatcher.run_classic` L75-79 | TELE-05 text-to-Claude relay scrubs the same key |

## Locked Architectural Decisions (from STATE.md / PROJECT.md / completed phases)

These are NOT options — Phase 9 plans must comply.

1. **Localhost-only**: bind to 127.0.0.1; Telegram is the ONLY external surface; no inbound auth on /api (anyone on localhost can call it — Telegram handler MUST whitelist user_ids before relaying).
2. **Plain-text Telegram messages, no parse_mode** (PROJECT.md "Key Decisions"): DB content has unescaped backticks/asterisks that silently break MarkdownV2.
3. **Python 3.12+ on install.sh's stock-python path**, Python 3.13 in dev (uv-managed). install.sh MUST work without uv.
4. **macOS-only** (launchd, ~/.claude/projects, ~/Library/LaunchAgents). Linux is v2 (PLAT-01).
5. **launchd target = `~/Library/LaunchAgents/`** (user agents, no sudo required, no root).
6. **Single-user** — Telegram has ONE owner (one chat_id from setup wizard); group chats out of scope.
7. **`~/.command-centre/`** is the install-mode root; dev-mode points launchd at the repo. install.sh distinguishes.
8. **Anthropic API key**: never bake into plists (DISP-12 / Pitfall 8 pattern). Settings reads from env or `~/.command-centre/.env`.
9. **No outbound network** except (a) Telegram (when configured), (b) Anthropic API (when ANTHROPIC_API_KEY set).
10. **ESTOP order-of-operations** (Plan 04-05): flag-flip → PID-scan SIGTERM → bulk UPDATE — Telegram emergency-stop callback uses POST /api/system/emergency-stop, not a direct DB write.

## Library / Approach Decisions (with recommendations)

### D1. Telegram bot library — RECOMMEND raw `httpx` for both notifier and handler

**Options surveyed:**
| Option | Pros | Cons |
|--------|------|------|
| `python-telegram-bot` v22.x (async-only, stable since v20) | Rich update routing, conversation handlers, robust error handling, large ecosystem | Heavy: pulls 6+ transitive deps (`apscheduler`, `tornado`, etc. — 22.x trimmed but still ~3MB); learning curve for the Application/Builder pattern; opinionated about asyncio loop ownership |
| `aiogram` 3.x | Type hints, FSM, dispatcher-style routing | Same heaviness; less common in solo-dev tools |
| Raw `httpx` against Bot API | Zero new deps (httpx already runtime); 5 endpoints used (`getUpdates`, `sendMessage`, `answerCallbackQuery`, `editMessageReplyMarkup`, `getMe`); plain-text + inline-buttons covered in <100 LOC | DIY error handling, retry, offset persistence |

**Verdict:** RAW `httpx`.

**Rationale:**
- The notifier is a 30s polling loop that calls `sendMessage` only — three lines of httpx. A bot framework for that is overkill.
- The handler polls `getUpdates` (long-polling, `timeout=25` to fit inside a 30s launchd cycle), routes 4–5 callback verbs, and relays text to `claude -p`. Still a small surface.
- The codebase already trims deps aggressively (httpx promoted from dev to runtime in Phase 8 rather than adding python-telegram-bot at the time). Phase 9 should keep that discipline.
- Raw httpx makes testing trivial (`respx` mock or `httpx.MockTransport` — already a Phase 8 idiom).

**Bot API endpoints used** (verified 2026-04 against https://core.telegram.org/bots/api):
- `getMe` — setup wizard sanity check (TELE-01)
- `sendMessage` — notifier + setup wizard test message (TELE-01, TELE-02, TELE-03)
- `getUpdates` — handler long-poll loop with `offset=last_update_id+1, timeout=25` (TELE-05)
- `answerCallbackQuery` — handler must always call this within 15s of a callback (TELE-05, TELE-06)
- `editMessageReplyMarkup` (optional) — strip buttons after answer is recorded so user can't double-press

### D2. Notifier vs handler — separate processes or one daemon?

**Options:**
- A. ONE daemon = both poll loops in one launchd job (asyncio.gather of notifier_loop + handler_loop)
- B. TWO daemons = `com.cmc.telegram-notifier` (StartInterval=30s, oneshot) + `com.cmc.telegram-handler` (RunAtLoad=true, KeepAlive=true, long-running)

**Verdict:** TWO daemons (option B).

**Rationale:**
- Notifier is a oneshot (mirrors dispatcher's StartInterval=120 pattern; on each tick it does its read-DB, write-Telegram pass and exits). Crash safety: if it dies, launchd restarts it next tick, no state lost (notification_log is the dedup truth).
- Handler must long-poll `getUpdates` with timeout=25s, which means it lives across many ticks. Long-running daemon under launchd `KeepAlive=true`. Crash → launchd respawns.
- Splitting also matches REQUIREMENTS.md TELE-07 ("plist template for telegram-bot daemon" — singular but describing the handler; the notifier is a separate plist with `StartInterval=30`).
- Concretely: Phase 9 produces TWO templates: `com.cmc.telegram-notifier.plist.j2` (StartInterval=30, oneshot) and `com.cmc.telegram-handler.plist.j2` (RunAtLoad=true KeepAlive=true).

### D3. Notification dedup design (TELE-04)

**Existing table** (locked, no schema change): `notification_log(kind, entity_id, sent_at, chat_id, message_id, snoozed_until, status)` with `UNIQUE(kind, entity_id, chat_id)`.

**Strategy** (one INSERT statement per intent):
```python
# notifier.py — inside the 30s loop, for each candidate notification:
stmt = sqlite_insert(NotificationLog).values(
    kind=kind,                # "decision" / "failure" / "overdue_schedule" / "inbox" / "approval"
    entity_id=str(entity.id),  # decision_id / task_id / schedule_id / inbox_id
    chat_id=str(settings.telegram_chat_id),
    sent_at=now,
    status="pending",
).on_conflict_do_nothing(index_elements=["kind", "entity_id", "chat_id"])
result = await db.execute(stmt)
if result.rowcount == 0:
    continue  # already sent OR currently snoozed (status='snoozed' rows still violate UNIQUE — that's the dedup)
# else: row inserted; now call sendMessage; on success UPDATE status='sent', message_id=...
```

**`entity_id` per kind:**
- `decision` — `str(decisions.id)` — distinct decisions get distinct rows (Edge case: same prompt re-asked is a new decisions row with a new id, so it WILL re-notify, which is correct).
- `failure` — `str(tasks.id)` — same task re-tried gets a new task row (rerun creates a fresh task or resets the row; if reset-and-rerun keeps the same id, we WANT a re-notify on second failure because attempt count is meaningful — see Edge case below).
- `overdue_schedule` — `str(schedules.id)` — once-per-overdue. To avoid one-row-forever-blocks-all-future-overdues for the same schedule, snooze for 1h after sending (set `snoozed_until = now + 1h, status='sent'`) AND check `snoozed_until` before INSERT-OR-IGNORE — see snooze section.
- `inbox` — `str(inbox.id)` — distinct inbox messages get distinct rows.
- `approval` — `str(tasks.id)` (awaiting_approval state) — same row as failure but different `kind` so dedup is independent.

**Edge case — same task re-tried:**
- If user rerun resets `tasks.status=pending` while keeping the same id, a SECOND failure for the same task id collides with the existing `(kind=failure, entity_id=42)` row → no re-notify. **Fix:** the rerun handler (TASK-06) should also DELETE the corresponding notification_log row so a new failure re-notifies. Plan 09-02 owns this cleanup hook in the notifier (not in the tasks router — keep router stable).

**Snooze semantics:**
- User clicks "Snooze 30m" inline button → handler.py routes callback → dash_router emits `PATCH /api/notifications/{id}/snooze` (NEW endpoint — minor backend addition in Plan 09-04, single PATCH route, ~20 LOC).
- PATCH sets `snoozed_until = now + duration, status='snoozed'`.
- Notifier loop adds a `WHERE NOT EXISTS (SELECT 1 FROM notification_log WHERE kind=?, entity_id=?, chat_id=? AND (snoozed_until IS NULL OR snoozed_until > now()))` guard before the INSERT-OR-IGNORE — prevents re-notifying snoozed ones.
- When `snoozed_until` passes, snooze expires. Use cases: "remind me in 30m about this overdue schedule" — rare but listed in REQUIREMENTS.md TELE-04.

**Verdict:** Use existing UNIQUE constraint (no migration). Add a new `PATCH /api/notifications/{id}/snooze` endpoint for the snooze button. Add a `DELETE notification_log WHERE entity_id=?` hook on task rerun, called from the notifier (not from TASK-06 handler — keep Phase 4 router pristine).

### D4. install.sh design

**Idempotency principle:** every step short-circuits if the desired state is already present.

```
1. Detect Python ≥3.12:
   - Try /opt/homebrew/bin/python3.13 → /opt/homebrew/bin/python3.12 → python3.12 → python3.13 → python3
   - Reject < 3.12 with a clear "brew install python@3.13" hint and exit 1
   - SAVE the chosen path → used in plist render (DISP-12 verbatim)
2. Decide mode:
   - dev mode (default if invoked from inside the repo and `--install` flag NOT passed): launchd points at REPO_ROOT
   - install mode (--install): copy under ~/.command-centre/
3. Create venv at ~/.command-centre/venv (install) OR backend/.venv (dev)
   - python -m venv (stdlib, NOT virtualenv) — guaranteed to work on stock Python
4. pip install:
   - pip install --upgrade pip
   - pip install -e . (dev) OR pip install . (install — wheel)
5. Create ~/.command-centre/ layout (install mode only):
   ~/.command-centre/
     bin/cc, bin/start.sh, bin/stop.sh
     venv/                   (step 3 destination)
     ui/dist/                (rsync from frontend/dist/)
     skills/                 (rsync from skills/, if present)
     data/                   (DB lives here)
     logs/                   (launchd stdout/stderr)
     .env                    (template; user fills in TELEGRAM_BOT_TOKEN etc.)
     migrations/             (rsync from backend/migrations/)
     alembic.ini
6. Render plists:
   - python -m cmc.dispatcher.plist_render <python_path> <repo_root> > .../com.cmc.dispatcher.plist
   - python -m cmc.app.plist_render        <python_path> <repo_root> > .../com.cmc.server.plist
   - python -m cmc.telegram.plist_render --variant=notifier <python> <root> > .../com.cmc.telegram-notifier.plist  (only if TELEGRAM_BOT_TOKEN set)
   - python -m cmc.telegram.plist_render --variant=handler  <python> <root> > .../com.cmc.telegram-handler.plist
   - Place under ~/Library/LaunchAgents/
7. Load plists:
   - launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.cmc.{server,dispatcher}.plist
   - (Telegram plists loaded only if user opts in via setup_telegram.py)
8. Write `cc` shim under /usr/local/bin/cc OR ~/.local/bin/cc:
   - bash script that resolves to ~/.command-centre/bin/cc
   - prefer ~/.local/bin (no sudo); document PATH addition if missing
9. Print next steps:
   - `cc doctor`
   - `cc setup otel` (optional)
   - `cc setup telegram` (optional)
```

**File copy strategy:** `rsync -a --delete` (dev → install). Excludes: `.venv/`, `.git/`, `.planning/`, `tests/`, `node_modules/`, `__pycache__/`, `*.pyc`, `data/cmc.db` (preserve user's DB on re-install).

**venv location:**
- Dev mode: `backend/.venv/` (stays where uv puts it).
- Install mode: `~/.command-centre/venv/`.
- The `cc` shim resolves which mode is active by reading `~/.command-centre/.env` first; fallback to repo-relative.

**launchctl bootstrap vs load:**
- `launchctl bootstrap gui/$UID <plist>` is the modern API (since macOS 10.10) and gives clearer error messages.
- `launchctl load -w <plist>` is deprecated but still works. Use `bootstrap` first; fall back to `load` if `launchctl bootstrap` returns non-zero (older macOS — though unlikely on a Phase 9 user's box).
- For unload use `launchctl bootout gui/$UID/<label>`.

### D5. `cc` CLI shim — RECOMMEND pure bash (~150 LOC)

Reasons: `cc` is fundamentally `launchctl bootstrap/bootout` + `tail -f` + `python -m`. Click/argparse adds a Python boot per invocation (slow on cold cache) and a dependency. Bash dispatch handles 7 subcommands cleanly:

```
cc start                     → launchctl bootstrap all 4 plists
cc stop                      → launchctl bootout all 4
cc restart                   → stop && start
cc doctor                    → exec ~/.command-centre/venv/bin/python -m cmc.cli.doctor
cc logs                      → tail -F ~/.command-centre/logs/{server,dispatcher,telegram-*}.{out,err}
cc sync                      → curl -sX POST http://127.0.0.1:8765/api/sync
cc setup otel                → exec ~/.command-centre/venv/bin/python -m cmc.cli.setup_otel
cc setup telegram            → exec ~/.command-centre/venv/bin/python -m cmc.cli.setup_telegram
```

(Internally, `python -m cmc.cli.doctor` resolves to `scripts/doctor.py` content moved into a package module — easier to test than a top-level script. Plan 09-03 shapes this.)

**`cc logs` semantics:** `tail -F` (capital F, follows rotations) on all 4–6 launchd stderr/stdout files at once. macOS `tail -F` accepts multiple paths; prefix lines with filename via `tail -F -n 50 file1 file2 ...`. Single-flag `--service dispatcher` filters to one. No log rotation in Phase 9 — launchd doesn't rotate by default; document `cc logs --rotate` as v2.

### D6. doctor.py — 8 deterministic checks

| Check | Pass criterion | Failure remediation hint |
|-------|----------------|--------------------------|
| 1 | Python ≥3.12 (sys.version_info) | "Run `brew install python@3.13`" |
| 2 | `claude` CLI on PATH AND version ≥ a known-good (subprocess.run `claude --version`) | "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code" |
| 3 | `~/.claude/settings.json` exists AND parses as JSON | "Run `cc setup otel`" |
| 4 | `~/.claude/projects/` exists AND has ≥1 subdir | "No sessions yet — run `claude` once" |
| 5 | Port 8765: free OR owned by our server (psutil.net_connections + verify pid command line) | "Port 8765 in use by another process" |
| 6 | GET http://127.0.0.1:8765/api/health → 200 within 2s | "Run `cc start`" |
| 7 | launchctl print gui/$UID/com.cmc.{server,dispatcher} → state=running | "Run `cc start`" |
| 8 | Telegram: TELEGRAM_BOT_TOKEN env set → call `getMe` → 200 (skip-with-✓ if not configured) | "Run `cc setup telegram`" |

**Output format:** ANSI colored prefix `[✓]` green / `[✗]` red / `[⚠]` yellow + one-line message + (on failure) one-line remediation. Use stdlib `\033[32m...\033[0m` (no `colorama` dep — `colorama` is Windows-only anyway).

**Exit code:** 0 if all checks pass, 1 if any FAIL (warnings are still 0). Allows `cc doctor && cc start` chaining.

### D7. setup_otel.py — 6 OTEL env keys

REQUIREMENTS.md says "merges 6 OTEL env keys" without enumerating. Per Phase 2 RESEARCH (02-RESEARCH.md L1227-1229, L1294) and Claude Code monitoring docs:

| Key | Recommended value | Why |
|-----|-------------------|-----|
| `CLAUDE_CODE_ENABLE_TELEMETRY` | `1` | Opt-in flag |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://127.0.0.1:8765` | Where the dashboard listens |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/json` | Phase 2 supports JSON only; protobuf support is v2 |
| `OTEL_LOGS_EXPORTER` | `otlp` | Default; explicit avoids the `none` brokenness (Phase 2 RESEARCH cited claude-code#38454) |
| `OTEL_METRICS_EXPORTER` | `otlp` | Default |
| `OTEL_LOG_USER_PROMPTS` | `0` | Privacy default — DO NOT capture prompt text by default |

**(Optional 7th)** `OTEL_LOG_TOOL_DETAILS=1` — recommended for INGST-08 MCP attribution but listed as optional. Plan 09-02 should include it as the 6th and drop one of the above (likely OTEL_LOG_USER_PROMPTS, since 0 = default behavior anyway). Surface as Open Q below; planner picks 6 of these 7.

**Atomic merge algorithm:**
```python
1. settings_path = Path.home() / ".claude/settings.json"
2. backup = settings_path.with_suffix(f".json.bak.{int(time.time())}")
3. if settings_path.exists(): shutil.copy2(settings_path, backup)
4. data = json.loads(settings_path.read_text()) if settings_path.exists() else {}
5. env = data.setdefault("env", {})  # Claude Code reads top-level "env"
6. for key, value in OTEL_KEYS.items():
       if key not in env:           # NEVER overwrite user-set
           env[key] = value
7. tmp = settings_path.with_suffix(".json.tmp")
8. tmp.write_text(json.dumps(data, indent=2))
9. os.replace(tmp, settings_path)   # atomic on same FS
10. print backup path so user can rollback
```

Verify exact env-key location in `settings.json` against Claude Code docs at plan time — top-level `env` dict OR `defaultEnv` OR another shape; the algorithm is agnostic but the key path must match.

### D8. Playwright e2e — RECOMMEND `@playwright/test` (current best practice)

**Verified 2026-04 vs Playwright changelog**: `@playwright/test` is the canonical test runner; standalone `playwright` CLI is just the browser/codegen tool. All 2024–2026 docs steer to `@playwright/test`.

**Setup:**
```
cd frontend
npm install -D @playwright/test @types/node
npx playwright install chromium
```

**Browser scope:** chromium-only for v1. Single-developer macOS dashboard — running on Firefox + Safari adds nothing, costs CI complexity.

**Test fixtures:**
- Run against the **built and served** frontend (`vite preview --port 4173` OR the actual installed `cc start` server). HMR + Playwright = brittle (dev server reloads mid-test). Tests run against the production-shape build.
- Backend: tests run against a `cc start`-launched FastAPI on 127.0.0.1:8765. Easier than spawning a fixture backend per test (the dashboard tolerates empty DB; tests can seed via /api/tasks POST etc. when needed).
- Use `webServer` block in `playwright.config.ts` to auto-launch the backend if not already running:
  ```ts
  export default defineConfig({
    webServer: [
      { command: 'cd ../backend && uvicorn cmc.app.factory:create_app --factory --port 8765', url: 'http://127.0.0.1:8765/api/health', reuseExistingServer: true },
      { command: 'npm run preview -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
    ],
    use: { baseURL: 'http://127.0.0.1:4173' },
  });
  ```

**Smoke-data-seed pattern:** for TEST-03 (schedule composer creates a schedule), each test starts by DELETE-ing any test-named schedules then proceeds. No fixture DB swap (overkill for 4 tests).

**Test file layout:**
```
frontend/
  tests/
    e2e/
      routes.spec.ts          (TEST-01)
      command-palette.spec.ts (TEST-02)
      schedule-composer.spec.ts (TEST-03)
      theme-toggle.spec.ts    (TEST-04 — needs theme toggle to exist)
  playwright.config.ts
```

**CI vs local:** No CI gate. Document `npm run test:e2e` as the manual gate; add to `package.json scripts`. Phase 9 close-out runs it once and confirms 4/4 pass.

**Pitfall to flag:** `webServer` `reuseExistingServer: true` is critical so `cc start` (which Phase 9 just brought up) doesn't conflict.

### D9. Theme toggle (TEST-04) — GAP IN CURRENT FRONTEND

**Verified:** grep across `frontend/src` for `ThemeToggle`, `toggleTheme`, `darkMode`, `prefers-color-scheme` returns no matches. The dashboard ships a single dark theme (DESG-01 locked dark theme as the design language).

**Options:**
- A. **Implement minimal theme toggle in Phase 9** — adds a header button that flips a `data-theme` attribute on `<html>` and persists to localStorage (`cmc.theme = 'dark'|'light'`). Default 'dark'. Light theme can be a near-no-op (CSS variables remain the same; only the `data-theme` value persists). Test then reads `localStorage.getItem('cmc.theme')` after click.
- B. **Reinterpret TEST-04** — verify that some user preference persists (e.g., a CollapsibleSection open/closed state via `lib/storage.ts`, or the range toggle on TokenUsageCard). FESH-03 already says CollapsibleSection persists in localStorage with framer-motion 220ms animation — TEST-04 could verify that contract instead.
- C. **Defer TEST-04 to v2** — explicitly mark in Phase 9 close-out and update REQUIREMENTS.md.

**Recommendation:** Option A (implement minimal toggle in Plan 09-05 alongside Playwright tests). Reasons: REQUIREMENTS.md TEST-04 wording is unambiguous ("theme toggle persists"); it's ~30 LOC of frontend; light theme can be a thin override (e.g., flip `--bg`/`--surface`/`--text` CSS variables) without polishing visuals — the test only verifies persistence, not visual quality. Light theme polish is v2.

Surface as Open Q1 — planner can lock A/B/C.

## Wave Structure Proposal (5 plans)

**File-ownership analysis** (per-plan barrels, no shared writers):

| Plan | Owns (writers) | Reads/depends on |
|------|----------------|-----------------|
| 09-01 (Wave 1: foundation) | `backend/cmc/telegram/__init__.py`, `backend/cmc/telegram/api.py`, `backend/cmc/telegram/messages.py`, `backend/cmc/telegram/dash_router.py`, `backend/cmc/telegram/templates/` (2 plists), `backend/cmc/telegram/plist_render.py`, NEW Settings fields, `backend/cmc/api/routes/notifications.py` (PATCH snooze, GET list), `backend/tests/test_phase9_telegram_unit.py` | nothing |
| 09-02 (Wave 2 — depends_on 09-01): notifier daemon | `backend/cmc/telegram/notifier.py`, `backend/cmc/telegram/oneshot_notifier.py`, `backend/tests/test_phase9_notifier.py` | 09-01 (api.py, messages.py, dash_router.py) |
| 09-03 (Wave 2 — depends_on 09-01, parallel with 09-02): handler daemon + setup_telegram wizard | `backend/cmc/telegram/handler.py`, `backend/cmc/telegram/oneshot_handler.py`, `scripts/setup_telegram.py`, `backend/cmc/cli/setup_telegram.py` (importable shim), `backend/tests/test_phase9_handler.py` | 09-01 |
| 09-04 (Wave 3 — depends_on 09-01, 09-02, 09-03): install scripts + cc shim + doctor + setup_otel | `scripts/install.sh`, `scripts/cc`, `scripts/start.sh`, `scripts/stop.sh`, `scripts/doctor.py`, `scripts/setup_otel.py`, `backend/cmc/cli/__init__.py`, `backend/cmc/cli/doctor.py`, `backend/cmc/cli/setup_otel.py`, `backend/cmc/app/plist_render.py`, `backend/cmc/app/templates/com.cmc.server.plist.j2`, `backend/tests/test_phase9_setup.py` | 09-01..03 (uses telegram plist renderers) |
| 09-05 (Wave 4 — depends_on all): Playwright e2e + theme toggle + close-out | `frontend/tests/e2e/*.spec.ts` (4 files), `frontend/playwright.config.ts`, `frontend/package.json` (test:e2e script, devDeps), `frontend/src/components/shell/ThemeToggle.tsx` (NEW — ~50 LOC), `frontend/src/lib/theme.ts` (NEW), 1-line edit to `NavBar.tsx` to mount ThemeToggle, CSS variable additions in `frontend/src/styles.css` for `[data-theme="light"]` minimal overrides, **09-VERIFICATION.md + close-out human-verify checkpoint** | all prior |

**Why 5 plans (not 4 or 6):**
- 4 plans would force notifier + handler into the same plan — different daemon shapes (oneshot vs long-running), different test fixtures.
- 6 plans would over-split (e.g., separate cc/doctor/setup_otel into one plan each). They share `scripts/` directory and the `~/.command-centre/` layout — keeping them in one plan avoids merge conflicts on install.sh and the cc shim.

**Wave dependency chain:**
- Wave 1 = 09-01 alone (everyone else needs telegram primitives + plist renderer).
- Wave 2 = 09-02 ∥ 09-03 (parallel — different files, both depend on 09-01 only).
- Wave 3 = 09-04 alone (needs telegram code + plists from 09-01..03 to render install paths).
- Wave 4 = 09-05 alone (E2E gate — needs everything else functional).

**File-ownership rule check:** No two plans in the same wave write to the same file. All shared writers (`cmc/api/routes/__init__.py` for the new notifications router) live in 09-01 only.

## Pitfalls & Mitigations (12 items)

### P1. launchctl `bootstrap` vs deprecated `load`
**What goes wrong:** `launchctl load -w` is deprecated since macOS 10.10 — silent failures on newer macOS in some configurations.
**How to avoid:** Use `launchctl bootstrap gui/$UID <plist>` first; fallback to `load` only if bootstrap returns non-zero. For unload: `launchctl bootout gui/$UID/<label>`.

### P2. Telegram getUpdates `offset` persistence across handler restarts
**What goes wrong:** If handler crashes and restarts without persisting `last_update_id`, the user sees DUPLICATES of every callback they sent in the last 24h (Telegram retains updates 24h).
**How to avoid:** After every successful `getUpdates` poll that returned updates, UPSERT `system_state.telegram_offset = max(update_id) + 1`. On startup, read this row and pass `offset=` to first call. Idempotency: even if duplicates slip through, dedup by `(kind, entity_id, chat_id)` UNIQUE constraint catches re-sends; callback handlers must be idempotent (e.g., approving an already-approved task is a 200 no-op — verify TASK-05 already does this; if not, handler does the duplicate-suppression).

### P3. Telegram parse_mode escaping — never set parse_mode
**What goes wrong:** PROJECT.md locks plain text. If a future contributor sets `parse_mode='MarkdownV2'`, error messages with backticks/asterisks (e.g., from `error_message` in tasks table) silently fail with HTTP 400 "can't parse entities".
**How to avoid:** `cmc/telegram/api.py::send_message` does NOT accept a `parse_mode` parameter at all. All formatters in `messages.py` produce plain text. Code review: grep for `parse_mode` in CI gate (or an assertion in `test_phase9_telegram_unit.py`).

### P4. Bash subshells losing variables; quoting filenames with spaces
**What goes wrong:** `install.sh` snippet `PYTHON=$(detect_python)` — if `detect_python()` runs in a subshell that uses `read`, env doesn't propagate. Worse, `~/.command-centre/` may live under a path with spaces (`/Users/Joe Smith/...`).
**How to avoid:** Always quote: `"$HOME/.command-centre/"`, `"$PYTHON_PATH"`. Use functions that `printf` their result and assign via command substitution: `PYTHON=$(detect_python)`. Test install.sh under `/tmp/space test/` once.

### P5. `python -m venv` vs `virtualenv`
**What goes wrong:** Suggesting `virtualenv` when stock Python ships with `venv` adds a dep nobody needs.
**How to avoid:** Use stdlib `python3 -m venv`. Stock 3.12 / 3.13 from homebrew has it. Document fallback in error message: "If `venv` missing, run `xcode-select --install` then retry".

### P6. Notification race: dedup-check then INSERT not atomic
**What goes wrong:** Two notifier ticks fire in quick succession (e.g., the user manually triggered `cc start` mid-cycle). SELECT-then-INSERT pattern races and may double-send.
**How to avoid:** Use `INSERT ... ON CONFLICT DO NOTHING` against the `UNIQUE(kind, entity_id, chat_id)` constraint. The DB enforces atomicity — `result.rowcount` tells you whether you "won" the slot. ONLY then call `sendMessage`. If `sendMessage` fails, UPDATE `status='failed'` (so a retry next cycle can choose to delete-and-retry). See D3.

### P7. `cc` shim PATH resolution
**What goes wrong:** Users have `~/.local/bin` not in PATH; `cc` invocation fails with `command not found`.
**How to avoid:** Two-tier install: try `/usr/local/bin/cc` first (admin path; common via `brew`); if non-writable, try `~/.local/bin/cc` and print "Add `export PATH=\"$HOME/.local/bin:$PATH\"` to your `~/.zshrc`". Never silently install where PATH won't see it. Use a symlink to the canonical `~/.command-centre/bin/cc` so updates only need to rewrite the canonical.

### P8. settings.json.tmp + os.rename atomicity (macOS)
**What goes wrong:** Cross-FS rename is NOT atomic; if `~/.claude/` is on a separate volume from `/tmp`, the os.rename throws `OSError: cross-device link`.
**How to avoid:** Write `tmp = settings_path.with_suffix(".json.tmp")` (SAME directory as final) — same FS guaranteed. POSIX rename is atomic on the same FS.

### P9. Playwright + Vite dev server flake
**What goes wrong:** HMR triggers re-render mid-test → flaky element-not-attached errors.
**How to avoid:** Run tests against `vite preview` (production build) not `vite dev`. The webServer config block must use `npm run preview`, never `npm run dev`. Document as a comment in playwright.config.ts.

### P10. Telegram chat_id sign — group chats are negative integers
**What goes wrong:** User adds the bot to a group; group chat_ids are negative (e.g., `-100123456789`); the wizard might string-cast and reject the minus sign.
**How to avoid:** Accept any integer (positive or negative). For v1 we only support direct user chats (positive), but defensive: store as string in env (`TELEGRAM_CHAT_ID="-100..."`) and pass through to API calls verbatim. setup_telegram.py validates with `int()` cast — accepts negatives.

### P11. python-telegram-bot vs raw httpx — false-savings trap
**What goes wrong:** Pulling python-telegram-bot for "ergonomics" and ending up writing wrappers around its Application/Builder pattern that don't fit our oneshot model. The notifier's 30s loop is a fundamentally different shape than ptb's persistent dispatcher.
**How to avoid:** Locked to raw httpx (D1). Do not let "but it has a button helper" temptation re-open this. Inline buttons are 2 LOC of dict construction.

### P12. ANTHROPIC_API_KEY leakage via Telegram text relay
**What goes wrong:** TELE-05 routes incoming Telegram text to `claude -p`. If that subprocess inherits `ANTHROPIC_API_KEY` from launchd's environment, an MCP server installed by a third party could exfiltrate it. (Same threat model as Phase 8's run_classic.)
**How to avoid:** Reuse `cmc.dispatcher.run_classic`'s env-scrub pattern (`env.pop("ANTHROPIC_API_KEY", None)`) before subprocess.Popen in handler.py's text-relay path. Pin this in code review and a test.

## Open Questions (RESOLVED — see 09-01-PLAN.md locked_decisions)

### Q1. Theme toggle scope (TEST-04) — A/B/C from D9
- A. Implement minimal toggle in Plan 09-05 (RECOMMENDED — ~30 LOC + ~30 LOC test).
- B. Reinterpret TEST-04 as "any localStorage-persisted UI state" (CollapsibleSection state already qualifies).
- C. Defer TEST-04 to v2 + update REQUIREMENTS.md.

**Recommendation:** A. Planner locks in 09-01 plan header.

### Q2. Telegram daemon split — one daemon or two? (D2)
- Two daemons RECOMMENDED (notifier oneshot + handler long-running). Plan 09-04 ships TWO plist templates.

**Recommendation:** Two. Lock in 09-01.

### Q3. setup_otel.py — exactly which 6 keys?
Six picked from: `CLAUDE_CODE_ENABLE_TELEMETRY`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_LOGS_EXPORTER`, `OTEL_METRICS_EXPORTER`, `OTEL_LOG_USER_PROMPTS=0`, `OTEL_LOG_TOOL_DETAILS=1`.

**Recommendation:** Drop `OTEL_LOG_USER_PROMPTS` (defaults to 0 anyway per Claude Code docs) and ship the other 6. Verify against current Claude Code monitoring docs at plan time.

### Q4. install.sh — copy vs symlink for `~/.command-centre/`?
- Copy (`rsync -a --delete`) — safer, larger footprint (~10MB), self-contained install survives repo deletion.
- Symlink — faster, repo deletion breaks install.

**Recommendation:** Copy. v2 can add a `cc update` subcommand that re-rsyncs from the source repo.

### Q5. launchd target — user agents (`~/Library/LaunchAgents/`) — lock as is
PROJECT.md is silent but STATE.md / Plan 08-02 already ship to `~/Library/LaunchAgents/` (no sudo required, user-scoped). LOCK.

### Q6. Playwright as CI gate?
- No formal CI yet. RECOMMEND manual gate (`npm run test:e2e` documented; Phase 9 close-out runs once).

**Recommendation:** Manual. v2 adds GitHub Actions if/when remote repo lands.

### Q7. Snooze duration UI (TELE-04)
- Single duration (30m fixed) — minimal callbacks (`snooze:30m`).
- Multiple durations (15m / 1h / 4h) — three buttons under each notification.

**Recommendation:** Single 30m for v1. Multi-duration is v2.

### Q8. cc start launches the FastAPI server too — needs a `com.cmc.server.plist`?
The dispatcher plist exists; the FastAPI server itself currently runs via `uvicorn` on the user's terminal (per STATE.md "uvicorn cmc.app.factory:create_app ..."). Phase 9 should put the server under launchd too, OR document that `cc start` runs uvicorn in the background via nohup.

**Recommendation:** YES — add `com.cmc.server.plist.j2` template (mirrors dispatcher pattern, KeepAlive=true). Plan 09-04 owns it. This makes `cc start / stop / restart` symmetric across all 4 daemons (server, dispatcher, telegram-notifier, telegram-handler).

## Verification Approach (per ROADMAP success criterion)

### SC1. install.sh detects Python, creates venv, installs deps, copies files, renders launchd plists, produces a working cc CLI shim
- **Automated:** `tests/test_phase9_setup.py` includes a hermetic test that runs `install.sh --dry-run --prefix=$TMP/install-test` and asserts the layout. Real install runs `bash scripts/install.sh --install --prefix=$TMP/cc-install`, then asserts:
  - `$TMP/cc-install/venv/bin/python` exists and `--version` ≥ 3.12
  - `$TMP/cc-install/bin/cc` is +x and starts with `#!/usr/bin/env bash`
  - All four plists exist under `$TMP/cc-install/agents/` (alt agents dir for hermetic test)
  - `python -c 'import cmc'` succeeds against the install venv

### SC2. `cc start / stop / restart / doctor / logs` all work correctly
- **Manual checkpoint** (close-out human-verify):
  - `cc start` → `launchctl print gui/$UID/com.cmc.server` shows `state = running`
  - `curl -s http://127.0.0.1:8765/api/health` → 200
  - `cc stop` → `state = not running`
  - `cc restart` → both work
  - `cc doctor` → all 8 ✓
  - `cc logs` → tails launchd stdout+stderr files
- **Automated** (where possible): `test_phase9_setup.py::test_cc_doctor_passes_on_clean_install` runs `cc doctor` against a started server.

### SC3. setup_telegram.py wizard walks through BotFather setup and sends a test message
- **Manual** (close-out): user opens BotFather, gets a token, runs `cc setup telegram`, enters token + chat_id, gets "✓ test message sent" feedback in Terminal AND a "👋 Mission Control connected" message in Telegram.
- **Automated** (CI-friendly): `test_phase9_handler.py` mocks `httpx` Bot API responses and asserts the wizard's full state machine (token validation, getMe call, sendMessage call, .env write).

### SC4. Telegram notifier sends plain-text notifications for decisions, failures, overdue schedules with working inline buttons
- **Automated:** `test_phase9_notifier.py`:
  - Seeds DB: 1 pending decision, 1 failed task, 1 overdue schedule
  - Calls `notifier.run_one_cycle()` with mocked httpx
  - Asserts THREE `sendMessage` calls with: plain text bodies (no parse_mode), correct inline_keyboard JSON shape, kind+entity_id matches
  - Re-runs `run_one_cycle()` with no DB changes → asserts ZERO new calls (dedup works)
- **Manual** (close-out): user sees real notifications in Telegram for a real failed task and clicks an inline button (e.g., "Approve").

### SC5. Playwright e2e tests pass (4 tests)
- **Automated:** `npm run test:e2e` runs all 4 specs against a `cc start`-launched stack. Phase 9 close-out runs the suite and verifier captures the 4/4 pass.
- **Manual** (close-out human-verify): visual quality bar of the theme toggle (if Option A from Q1 is locked).

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Telegram Bot API surface | HIGH | Stable since 2015; verified endpoints against telegram.org/bots/api 2026-04 |
| Raw httpx vs framework choice | HIGH | Strong precedent (httpx promoted in Phase 8); 5-endpoint surface trivial to DIY |
| notification_log dedup | HIGH | Existing UNIQUE(kind, entity_id, chat_id) does exactly what TELE-04 needs |
| install.sh layout | HIGH | Mirrors common Homebrew-formula install patterns + matches PROJECT.md `~/.command-centre/` reference |
| launchd plist (telegram + server) | HIGH | Reuse Plan 08-02 pattern; 3-line template change |
| `cc` bash shim | HIGH | Standard pattern; multi-subcommand bash dispatch is well-trodden |
| doctor.py 8 checks | HIGH | All checks are deterministic stdlib + psutil + httpx (all already installed) |
| setup_otel.py 6 keys | MEDIUM | Phase 2 RESEARCH cited the keys but did NOT lock the exact 6-tuple — Open Q3 |
| Playwright @playwright/test | HIGH | Verified against current docs |
| Theme toggle (TEST-04) | LOW | Feature does NOT exist — Open Q1 must be locked |
| setup_telegram.py wizard UX | MEDIUM | Standard "input + validate + write" but exact prompts (BotFather instructions text) need composition at plan time |

## RESEARCH COMPLETE

**Phase:** 9 - Telegram, Setup & Testing
**Confidence:** HIGH on architecture/anchors/library choices; MEDIUM on setup_otel exact 6-key list and theme-toggle UX scope; LOW on the theme-toggle implementation details (because the feature doesn't yet exist in code).

### Key Findings
- The notification_log table (Phase 1) already has the EXACT shape TELE-04 needs — no migration required.
- Use raw httpx for all Telegram work; python-telegram-bot adds 6+ deps for ergonomics we don't need at this scale.
- Two telegram daemons recommended (oneshot notifier + long-running handler), three plists rendered by install.sh (server, dispatcher, telegram), four if both telegram daemons get separate plists.
- Theme toggle for TEST-04 is a GAP — feature doesn't exist; lock as Plan 09-05 deliverable (~50 LOC) or reinterpret/defer.
- 5-plan structure (foundation → 2 parallel daemons → install scripts → e2e+close-out) respects file-ownership rule and maximizes parallelism.
- ESTOP / decisions / inbox / schedules / tasks all already have HTTP endpoints — Telegram dash_router is purely a callback_data → (METHOD, /api/path, body) dispatcher. No DB writes from Telegram code.

### File Created
`.planning/phases/09-telegram-setup-testing/09-RESEARCH.md`

### Ready for Planning
Research complete. Planner can create 5 PLAN.md files (09-01 through 09-05) once Open Questions Q1 (theme toggle scope) and Q3 (exact 6 OTEL keys) are locked into 09-01-PLAN headers.
