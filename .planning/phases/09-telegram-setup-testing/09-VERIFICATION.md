---
phase: 09-telegram-setup-testing
verified: pending
status: awaiting-human-verify
score: 0/5 must-haves verified
overrides_applied: 0
---

# Phase 9: Telegram, Setup & Testing — Verification Report

**Phase Goal:** A solo Claude Code developer can install Mission Control on a fresh Mac, link Telegram for ambient notifications + decisions, manage the stack with a single `cmc` shim, and rely on a four-spec Playwright suite as the user-facing acceptance gate.
**Verified:** pending — awaiting `09-05` close-out human-verify
**Status:** AWAITING HUMAN VERIFY
**Re-verification:** No — initial verification

## Goal Achievement (5 ROADMAP Success Criteria)

### SC1 — install.sh end-to-end

**Truth:** `bash scripts/install.sh` on a fresh Mac (or `--install` after `--dry-run`) detects Python ≥ 3.12, creates a venv at `~/.command-centre/venv`, installs the backend deps, copies the application files into `~/.command-centre/`, renders all 4 launchd plists (`com.cmc.{server,dispatcher,telegram-notifier,telegram-handler}`), and produces a working `cmc` CLI shim on PATH.

| Step | Manual command | Expected | Result |
|------|----------------|----------|--------|
| 1.1 | `bash scripts/install.sh --dry-run` | Lists actions; no filesystem writes | _pending_ |
| 1.2 | `bash scripts/install.sh --install` | Installs cleanly; exit 0 | _pending_ |
| 1.3 | `~/.command-centre/venv/bin/python --version` | Python 3.12.x or higher | _pending_ |
| 1.4 | `ls ~/.command-centre/bin/{start,stop}.sh` | Both files exist; both `+x` | _pending_ |
| 1.5 | `ls ~/Library/LaunchAgents/com.cmc.{server,dispatcher,telegram-notifier,telegram-handler}.plist` | 4/4 present | _pending_ |
| 1.6 | `which cmc` | Shim path on PATH (`~/.local/bin/cmc` or `/usr/local/bin/cmc`) | _pending_ |

**Pass/Fail:** _pending_

### SC2 — `cmc` subcommands

**Truth:** `cmc start`, `cmc stop`, `cmc restart`, `cmc doctor`, and `cmc logs` all dispatch correctly to the underlying launchd / scripts and return appropriate exit codes.

| Step | Manual command | Expected | Result |
|------|----------------|----------|--------|
| 2.1 | `cmc start` | No errors; exit 0 | _pending_ |
| 2.2 | `launchctl print gui/$UID/com.cmc.server` | state = running | _pending_ |
| 2.3 | `curl -s http://127.0.0.1:8765/api/health` | `{"status":"ok"}` | _pending_ |
| 2.4 | `cmc doctor` | All checks ✓ or warn (no fail); exit 0 | _pending_ |
| 2.5 | `cmc logs` | Tails launchd files (Ctrl-C stops cleanly) | _pending_ |
| 2.6 | `cmc stop` | state = not running | _pending_ |
| 2.7 | `cmc restart` | stop + start both succeed | _pending_ |

**Pass/Fail:** _pending_

### SC3 — `setup_telegram` wizard

**Truth:** `cmc setup telegram` walks through BotFather token + chat_id capture, validates the token via `getMe`, persists `~/.command-centre/.env` (or `./env` in dev), and sends a "Mission Control connected" test message to the configured chat.

| Step | Manual command | Expected | Result |
|------|----------------|----------|--------|
| 3.1 | Create bot via @BotFather; copy token | Token format `\d+:[A-Za-z0-9_-]{30,}` | _pending_ |
| 3.2 | Send any message to bot; visit `https://api.telegram.org/bot<TOKEN>/getUpdates` | chat_id captured | _pending_ |
| 3.3 | `cmc setup telegram` (interactive) | Prompts token + chat_id; validates via getMe | _pending_ |
| 3.4 | Wizard final stdout | "✓ test message sent (message_id=…)" | _pending_ |
| 3.5 | Check Telegram client | "👋 Mission Control connected" message visible | _pending_ |
| 3.6 | `grep TELEGRAM ~/.command-centre/.env` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_ALLOWED_USER_IDS` present | _pending_ |
| 3.7 | `cmc restart` | Loads telegram daemons | _pending_ |

**Pass/Fail:** _pending_

### SC4 — Telegram notifier sends real messages

**Truth:** With Telegram daemons running, the notifier sends plain-text notifications for decisions / failures / overdue schedules / inbox messages, with working inline buttons that the handler ingests (snooze, answer, etc.).

| Step | Manual command | Expected | Result |
|------|----------------|----------|--------|
| 4.1 | Trigger pending decision (UI or `INSERT INTO decisions...`) | Row appears in DB | _pending_ |
| 4.2 | Wait ≤ 30s | Telegram message arrives with inline buttons | _pending_ |
| 4.3 | Tap "Snooze 30m" | Buttons disappear within 1s; toast confirms | _pending_ |
| 4.4 | Wait next tick | No re-notification (snooze respected) | _pending_ |

**Pass/Fail:** _pending_

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

**Pass/Fail:** VERIFIED (5/6 individual checks confirmed; SC5 fully VERIFIED in agent run; SC1-4 are user-facing manual gates that depend on a fresh Telegram bot + `cmc start` lifecycle, marked pending until human-verify).

## Test Counts

- **Backend:** 298 → 373 (+75 tests across `test_phase9_telegram_unit.py`, `test_phase9_notifier.py`, `test_phase9_handler.py`, `test_phase9_setup.py`).
- **Frontend unit:** 234 → 234 (no regressions; ThemeToggle does not require new unit tests because TEST-04 covers persistence end-to-end).
- **Frontend e2e (NEW):** 0 → 4 specs / 6 tests, all passing locally. Manual gate per Q6 LOCKED — not run in CI in v1.

## Gaps

- SC1–SC4 require a fresh Mac install + Telegram bot creation, both of which are user-side actions outside the executor's reach. This document is committed as `awaiting-human-verify`; the user will mark each row VERIFIED (with optional command output) and flip the frontmatter status to `passed` after running through the SC1–SC4 walk-through in the close-out checkpoint.
- No CI gate for `npm run test:e2e` in v1 (Q6 LOCKED). Future revision can add a GitHub Actions job behind a manual-trigger workflow once Mission Control gains a public CI.

## Sign-off

Once SC1–SC5 are confirmed by the user, this file is updated to:

```yaml
verified: 2026-04-XX
status: passed
score: 5/5 must-haves verified
```

…and Phase 9 is marked complete in `.planning/ROADMAP.md`.
