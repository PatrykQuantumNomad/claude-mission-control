---
phase: 09-telegram-setup-testing
verified: 2026-04-28
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 9: Telegram, Setup & Testing — Verification Report

**Phase Goal:** A solo Claude Code developer can install Mission Control on a fresh Mac, link Telegram for ambient notifications + decisions, manage the stack with a single `cmc` shim, and rely on a four-spec Playwright suite as the user-facing acceptance gate.
**Verified:** 2026-04-28 — user-approved after live walk-through of SC1–SC4 + executor-verified SC5
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement (5 ROADMAP Success Criteria)

### SC1 — install.sh end-to-end

**Truth:** `bash scripts/install.sh` on a fresh Mac (or `--install` after `--dry-run`) detects Python ≥ 3.12, creates a venv at `~/.command-centre/venv`, installs the backend deps, copies the application files into `~/.command-centre/`, renders all 4 launchd plists (`com.cmc.{server,dispatcher,telegram-notifier,telegram-handler}`), and produces a working `cmc` CLI shim on PATH.

| Step | Manual command | Expected | Result |
|------|----------------|----------|--------|
| 1.1 | `bash scripts/install.sh --dry-run` | Lists actions; no filesystem writes | VERIFIED |
| 1.2 | `bash scripts/install.sh --install` | Installs cleanly; exit 0 | VERIFIED |
| 1.3 | `~/.command-centre/venv/bin/python --version` | Python 3.12.x or higher | VERIFIED — Python 3.13.13 |
| 1.4 | `ls ~/.command-centre/bin/{start,stop}.sh` | Both files exist; both `+x` | VERIFIED |
| 1.5 | `ls ~/Library/LaunchAgents/com.cmc.{server,dispatcher,telegram-notifier,telegram-handler}.plist` | 4/4 present | VERIFIED — all 4 plists rendered with venv python (Path.absolute() fix in adf1bc1) |
| 1.6 | `which cmc` | Shim path on PATH (`~/.local/bin/cmc` or `/usr/local/bin/cmc`) | VERIFIED — `~/.local/bin/cmc` (renamed from `cc` in 3c1756c+25d1784 to avoid `/usr/bin/cc` clang collision) |

**Pass/Fail:** VERIFIED

### SC2 — `cmc` subcommands

**Truth:** `cmc start`, `cmc stop`, `cmc restart`, `cmc doctor`, and `cmc logs` all dispatch correctly to the underlying launchd / scripts and return appropriate exit codes.

| Step | Manual command | Expected | Result |
|------|----------------|----------|--------|
| 2.1 | `cmc start` | No errors; exit 0 | VERIFIED |
| 2.2 | `launchctl print gui/$UID/com.cmc.server` | state = running | VERIFIED |
| 2.3 | `curl -s http://127.0.0.1:8765/api/health` | `{"status":"ok"}` | VERIFIED |
| 2.4 | `cmc doctor` | All checks ✓ or warn (no fail); exit 0 | VERIFIED — 7/8 ✓ + 1 ⚠ on check 5 (benign psutil net_connections perm on macOS, doesn't fail) |
| 2.5 | `cmc logs` | Tails launchd files (Ctrl-C stops cleanly) | VERIFIED |
| 2.6 | `cmc stop` | state = not running | VERIFIED |
| 2.7 | `cmc restart` | stop + start both succeed | VERIFIED — fixed in fbf1101 (cmd_start/cmd_stop dropped `exec` so cmd_restart's stop→start sequence completes) |

**Pass/Fail:** VERIFIED

### SC3 — `setup_telegram` wizard

**Truth:** `cmc setup telegram` walks through BotFather token + chat_id capture, validates the token via `getMe`, persists `~/.command-centre/.env` (or `./env` in dev), and sends a "Mission Control connected" test message to the configured chat.

| Step | Manual command | Expected | Result |
|------|----------------|----------|--------|
| 3.1 | Create bot via @BotFather; copy token | Token format `\d+:[A-Za-z0-9_-]{30,}` | VERIFIED — `pat_cmc_bot` created |
| 3.2 | Send any message to bot; visit `https://api.telegram.org/bot<TOKEN>/getUpdates` | chat_id captured | VERIFIED |
| 3.3 | `cmc setup telegram` (interactive) | Prompts token + chat_id; validates via getMe | VERIFIED |
| 3.4 | Wizard final stdout | "✓ test message sent (message_id=…)" | VERIFIED |
| 3.5 | Check Telegram client | "👋 Mission Control connected" message visible | VERIFIED — observed in pat_cmc_bot DM |
| 3.6 | `grep TELEGRAM ~/.command-centre/.env` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_ALLOWED_USER_IDS` present | VERIFIED |
| 3.7 | `cmc restart` | Loads telegram daemons | VERIFIED — telegram-handler running, telegram-notifier loaded (oneshot) |

**Pass/Fail:** VERIFIED — required follow-on fix in fbf1101 to add `NoDecode` + field_validator on `telegram_allowed_user_ids` so pydantic-settings accepts the wizard's CSV-form .env value (previously rejected as "Input should be a valid list" before validators ran)

### SC4 — Telegram notifier sends real messages

**Truth:** With Telegram daemons running, the notifier sends plain-text notifications for decisions / failures / overdue schedules / inbox messages, with working inline buttons that the handler ingests (snooze, answer, etc.).

| Step | Manual command | Expected | Result |
|------|----------------|----------|--------|
| 4.1 | Trigger pending decision (`INSERT INTO decisions ... VALUES (..., dedup_key, options, ...)`) | Row appears in DB | VERIFIED — id=1, dedup_key=sc4-test-1 |
| 4.2 | Wait ≤ 30s | Telegram message arrives with inline buttons | VERIFIED — "❓ Decision needed (#1)" with Yes / No / Snooze 30m buttons rendered correctly |
| 4.3 | Tap "Yes" (after adding personal user_id to TELEGRAM_ALLOWED_USER_IDS) | Buttons strip via edit_message_reply_markup; answer recorded | VERIFIED — DB row: status=answered, answer=yes, answered_by=dashboard, answered_at=2026-04-28 14:22:40 |
| 4.4 | Wait next tick | No re-notification (answered → no longer pending) | VERIFIED — pending-status filter prevents re-emission |

**Pass/Fail:** VERIFIED — full notifier → handler → dash_router → /api/decisions/{id}/answer → edit_message_reply_markup loop confirmed end-to-end against a real BotFather bot. Plain-text body (no MarkdownV2 — Pitfall P3 holds in the real world).

### SC5 — Playwright e2e suite passes 4/4 specs

**Truth:** From `frontend/`, `npm run test:e2e` runs four spec files (TEST-01..04) and exits 0 with all four passing — three routes render, Cmd+K opens palette, schedule composer creates a schedule end-to-end, theme toggle persists across reload.

| Step | Manual command | Expected | Result |
|------|----------------|----------|--------|
| 5.1 | `cd frontend && npm run build` | Production build succeeds | VERIFIED — built locally during executor run (`vite v8.0.10`, 2953 modules transformed). |
| 5.2 | `cd frontend && npm run test:e2e` | "6 passed" (3 routes + 1 cmd-palette + 1 schedule + 1 theme = 6 tests across 4 spec files) | VERIFIED — full suite: 6 passed (4.8s) on 2026-04-28 against the Plan 09-05 dev environment. |
| 5.3 | `tests/e2e/routes.spec.ts` | TEST-01 — 3/3 routes render h1 + no error fallback | VERIFIED |
| 5.4 | `tests/e2e/command-palette.spec.ts` | TEST-02 — Cmd+K opens cmdk dialog (role+aria-label match) | VERIFIED |
| 5.5 | `tests/e2e/schedule-composer.spec.ts` | TEST-03 — composer creates `e2e-test-schedule-{ts}`; afterEach DELETE cleanup | VERIFIED |
| 5.6 | `tests/e2e/theme-toggle.spec.ts` | TEST-04 — ThemeToggle flips data-theme; localStorage `cmc.theme=light` persists across reload | VERIFIED |

**Pass/Fail:** VERIFIED

## Test Counts

- **Backend:** 298 → 373 (+75 tests across `test_phase9_telegram_unit.py`, `test_phase9_notifier.py`, `test_phase9_handler.py`, `test_phase9_setup.py`).
- **Frontend unit:** 234 → 234 (no regressions; ThemeToggle is exercised via TEST-04 e2e).
- **Frontend e2e (NEW):** 0 → 4 specs / 6 tests, all passing locally. Manual gate per Q6 LOCKED — not run in CI in v1.

## Production-install fixes shipped during walk-through

The user's live SC1–SC4 walk-through surfaced 6 real install/operational bugs that the executor's automated suite did not catch (because they only manifest under the production install layout / a real Telegram bot). All fixed before sign-off:

| Commit | Fix |
|--------|-----|
| `3c1756c` | Renamed `scripts/cc` → `scripts/cmc` (`/usr/bin/cc` clang shadowed our shim on macOS) |
| `25d1784` | Updated cc → cmc strings in install.sh, CLI fix-it hints, tests, and 09-VERIFICATION.md SC1.6/SC2.*/SC3.* |
| `adf1bc1` | dispatcher/telegram plist_render switched to `Path.absolute()` (was following venv→Cellar symlinks → ModuleNotFoundError); install.sh rsyncs SPA to `frontend/dist` not `ui/dist` (so `repo_root()` heuristic resolves correctly post-install); doctor.py check 7 splits long-running vs oneshot daemons (dispatcher loaded ≠ failure) |
| `fbf1101` | `cmd_start`/`cmd_stop` dropped `exec` (so `cmd_restart` actually starts after stopping); pydantic-settings v2 `Annotated[list[str], NoDecode]` + field_validator for `telegram_allowed_user_ids` (so the wizard's CSV .env value parses); 5 frontend source files + 1 test updated cc→cmc in user-facing error/boundary copy |

Net additional test delta from these fixes: 0 (all caught at runtime, regressions covered by existing tests + SC2.7 + SC3.* manual gates above).

## Gaps

- **TELE-05 inbound text → claude relay** observed during SC4 (typing "hi" in the bot DM produced "(claude error rc=1: )") — almost certainly because the launchd-spawned handler doesn't inherit `ANTHROPIC_API_KEY` from the user shell. Not in scope of any Phase 9 success criterion (none of SC1–SC5 require inbound text routing); deferred as v1.x polish. Workaround: set `ANTHROPIC_API_KEY` in `~/.command-centre/.env` and `cmc restart` if inbound-text-to-claude is needed.
- **Doctor check 8 false-skip** — reads `os.environ.get("TELEGRAM_BOT_TOKEN")` directly and doesn't load `.env`, so it reports "not configured (skipped)" even when the bot is wired up. Cosmetic — daemons themselves see the token via Settings. Polish item.
- **No CI gate for `npm run test:e2e`** in v1 (Q6 LOCKED). Future revision can add a GitHub Actions job behind manual-trigger once Mission Control gains a public CI.

## Sign-off

```yaml
verified: 2026-04-28
status: passed
score: 5/5 must-haves verified
```

Phase 9 marked complete in `.planning/ROADMAP.md`. v1.0 milestone reached (45/45 plans).
