---
phase: 09-telegram-setup-testing
plan: 04
plan_id: 09-04
subsystem: install / cli / launchd
tags: [install, cc, launchd, doctor, otel, server-plist, cli, telegram, setup]
provides:
  - "scripts/install.sh — one-command macOS installer (Python detect, venv, pip, rsync, plists, cc shim)"
  - "scripts/cc — bash dispatcher (start/stop/restart/status/doctor/logs/sync/setup {otel|telegram})"
  - "scripts/start.sh + scripts/stop.sh — launchctl bootstrap/bootout wrappers (4 daemons)"
  - "scripts/doctor.py + scripts/setup_otel.py — thin Python shims to cmc.cli.*"
  - "backend/cmc/app/plist_render.py + templates/com.cmc.server.plist.j2 (uvicorn --factory, KeepAlive=true)"
  - "backend/cmc/cli/setup_otel.py — atomic 6-key OTEL merge into ~/.claude/settings.json"
  - "backend/cmc/cli/doctor.py — 8 zero-LLM health checks (ANSI colored)"
  - "backend/cmc/dispatcher/plist_render.py CLI entry retrofit (additive; non-behavior-breaking)"
requires:
  - "Plan 09-01 telegram primitives + plist templates (TELE-07 telegram.plist_render --variant {notifier|handler})"
  - "Plan 09-02 telegram notifier oneshot loop"
  - "Plan 09-03 telegram handler long-poll + setup_telegram BotFather wizard"
  - "Phase 8 dispatcher.plist_render (retrofitted with main() entry point in this plan)"
affects:
  - "Phase 9 install path: cc start brings up all 4 daemons (server + dispatcher + telegram-notifier + telegram-handler)"
  - "Plan 09-05 close-out E2E can now `cc start` against a freshly installed Phase 9 stack"
tech-stack:
  added: []
  patterns:
    - "string.Template for plist substitution (3 vars: python_path, python_path_dir, repo_root) — uniform across 4 renderers"
    - "Atomic JSON write: same-dir tmp + os.replace + timestamped .bak (Pitfall P8)"
    - "launchctl bootstrap with load -w fallback (Pitfall P1)"
    - "rsync excludes: .venv/, .git/, .planning/, tests/, node_modules/, __pycache__/, *.pyc, data/cmc.db"
key-files:
  created:
    - scripts/install.sh
    - scripts/cc
    - scripts/start.sh
    - scripts/stop.sh
    - scripts/doctor.py
    - scripts/setup_otel.py
    - backend/cmc/app/plist_render.py
    - backend/cmc/app/templates/__init__.py
    - backend/cmc/app/templates/com.cmc.server.plist.j2
    - backend/cmc/cli/doctor.py
    - backend/cmc/cli/setup_otel.py
    - backend/tests/test_phase9_setup.py
  modified:
    - backend/cmc/dispatcher/plist_render.py
decisions:
  - "Use Path.absolute() (NOT resolve()) in app/plist_render.py to keep operator-supplied bin dir; resolve() follows symlinks into homebrew Cellar where uvicorn console-script is absent (Rule 1 fix during Task 1 verify)"
  - "Phase-9 deviation against Plan 08-02: dispatcher/plist_render.py gets a main() + __main__ guard so `python -m cmc.dispatcher.plist_render <python> <root>` works uniformly alongside the three new renderers (additive; existing imports unaffected)"
  - "OTEL_LOG_USER_PROMPTS intentionally omitted (Q3 LOCKED — defaults to 0 anyway; locks at exactly 6 keys)"
  - "Server plist uses uvicorn console-script at ${python_path_dir}/uvicorn rather than `python -m uvicorn` so launchd KeepAlive sees a stable executable target"
  - "cc shim resolves install root via CMC_HOME → ~/.command-centre → repo root (dev mode); resolves venv via $ROOT/venv → $ROOT/backend/.venv (production vs dev layout)"
  - "rsync command in install.sh does NOT use --delete on the backend/ rsync to preserve user state; only --delete on ui/dist/, skills/, migrations/ (idempotent re-installs without state loss)"
metrics:
  duration: "~25 min"
  completed: 2026-04-28
  tasks_count: 2
  files_count: 13
---

# Phase 9 Plan 04: Setup CLI + Installer Summary

One-liner: One-command macOS installer + `cc` bash dispatcher + 4-daemon launchd plists + atomic OTEL merge + 8-check doctor — first-touch UX so a fresh user can go from `git clone` to `cc start` without hand-rolling Phase 8 launchd setup.

## Goal

SETUP-01..07. Three deliverables, each ~120 LOC:

1. `scripts/install.sh` — one-command installer for macOS. Detects Python ≥3.12, creates venv, pip installs the backend package, copies non-excluded files into `~/.command-centre/`, renders 4 launchd plists, places them in `~/Library/LaunchAgents/`, writes the `cc` shim, prints next-steps.
2. `scripts/cc` — bash dispatcher. ~150 LOC. Subcommands: start, stop, restart, status, doctor, logs, sync, setup (otel|telegram).
3. Backend additions: `cmc.cli.doctor` (8 checks), `cmc.cli.setup_otel` (atomic OTEL merge with the 6 LOCKED keys), `cmc.app.plist_render` + server plist template.

## install.sh — order of operations

| Step | Action | Idempotency |
| ---- | ------ | ----------- |
| 1 | Parse flags (`--install`, `--prefix=PATH`, `--dry-run`) | n/a |
| 2 | Detect Python ≥3.12 (homebrew bins → PATH; reject <3.12 with brew hint) | n/a |
| 3 | Choose mode: install (DEST=~/.command-centre) vs dev (DEST=$REPO_ROOT) | n/a |
| 4 | mkdir layout: `bin/`, `logs/`, `data/`, `~/Library/LaunchAgents/` | mkdir -p |
| 5 | Create venv (skip if `bin/python` already +x) | skip-on-exists |
| 6 | pip install backend (`-e` in dev mode, regular in install mode) | pip handles |
| 7 | rsync source into DEST/backend (install mode only) — Q4 LOCKED excludes | data/cmc.db preserved |
| 8 | Render 4 launchd plists (`python -m cmc.{app,dispatcher,telegram}.plist_render`) | overwrite OK |
| 9 | Write cc shim (`~/.local/bin/cc` preferred; `/usr/local/bin/cc` fallback) | overwrite OK |
| 10 | Copy `start.sh` + `stop.sh` into `$DEST/bin/` and chmod +x | overwrite OK |
| 11 | Print next-steps (`cc doctor`, `cc setup otel`, `cc setup telegram`, `cc start`) | n/a |

## cc subcommand dispatch table

| Subcommand | Action | Routes to |
| ---------- | ------ | --------- |
| `start` | Bootstrap 4 daemons under launchd | `$ROOT/bin/start.sh` (if present) → loops `launchctl bootstrap` with `load -w` fallback |
| `stop` | Bootout 4 daemons | `$ROOT/bin/stop.sh` (if present) → loops `launchctl bootout` with `unload` fallback |
| `restart` | stop + sleep 1 + start | (composed) |
| `status` | Show `[loaded]` / `[ off ]` per label | `launchctl print gui/$UID/<label>` per daemon |
| `doctor` | 8-check health report | `exec $VENV_PY -m cmc.cli.doctor` |
| `logs` | tail -F across all daemon logs | `tail -F -n 50` over `$ROOT/.tmp/mission-control-queue/dispatcher-logs/*.{out,err}` + `$ROOT/logs/*.{out,err}` |
| `sync` | Kick the dispatcher tick manually | `curl -sX POST http://127.0.0.1:8765/api/sync` |
| `setup otel` | Merge OTEL env keys | `exec $VENV_PY -m cmc.cli.setup_otel` |
| `setup telegram` | BotFather wizard | `exec $VENV_PY -m cmc.cli.setup_telegram` |
| `help` / `--help` / `-h` | Print usage | inline |

The 4 launchd labels managed by start/stop:
- `com.cmc.server` (NEW — this plan; uvicorn --factory; KeepAlive=true)
- `com.cmc.dispatcher` (Phase 8)
- `com.cmc.telegram-notifier` (Plan 09-01 template; oneshot StartInterval=30)
- `com.cmc.telegram-handler` (Plan 09-01 template; long-running KeepAlive=true)

## OTEL keys merged by setup_otel.py

All 6 keys are LOCKED per Plan 09-01 frontmatter Q3. `OTEL_LOG_USER_PROMPTS` intentionally dropped (defaults to 0 anyway).

| # | Key | Value | Purpose |
| - | --- | ----- | ------- |
| 1 | `CLAUDE_CODE_ENABLE_TELEMETRY` | `"1"` | Master switch — enables OTEL exporter |
| 2 | `OTEL_EXPORTER_OTLP_ENDPOINT` | `"http://127.0.0.1:8765"` | Local Mission Control server endpoint |
| 3 | `OTEL_EXPORTER_OTLP_PROTOCOL` | `"http/json"` | Wire format (Phase 2 OTEL ingestion) |
| 4 | `OTEL_LOGS_EXPORTER` | `"otlp"` | Logs go to OTLP endpoint |
| 5 | `OTEL_METRICS_EXPORTER` | `"otlp"` | Metrics (token usage, tool counts) → OTLP |
| 6 | `OTEL_LOG_TOOL_DETAILS` | `"1"` | Include tool inputs/outputs in spans |

Atomicity contract:
- Same-dir tmp file (`settings.json.tmp`) → `os.replace` is a same-FS rename and therefore atomic on macOS (Pitfall P8).
- Pre-existing keys are NEVER overwritten — user opt-out (`CLAUDE_CODE_ENABLE_TELEMETRY=0`) is preserved.
- A timestamped `.bak.<unix-ts>` sibling is created BEFORE write whenever the settings file already exists (rollback safety).
- Invalid JSON in the existing settings file aborts with `SystemExit(1)` after the backup is created (so the user has a restore point).

## doctor 8 checks with their pass/warn/fail criteria

| # | Label | Status returned | Hint shown when not ok |
| - | ----- | --------------- | ---------------------- |
| 1 | Python ≥3.12 | `ok` if `sys.version_info ≥ (3,12)`; else `fail` | `brew install python@3.13` |
| 2 | claude CLI on PATH | `ok` if `claude --version` returns 0; else `fail` | Install Claude Code link |
| 3 | `~/.claude/settings.json` | `ok` if exists + valid JSON; `warn` if missing; `fail` if invalid JSON | `Run cc setup otel` |
| 4 | `~/.claude/projects/` | `ok` if exists + ≥1 subdir; `warn` if missing or empty | `No sessions yet — run claude once` |
| 5 | Port 8765 free or owned | `ok` if free OR owned by `uvicorn cmc.app.factory`; `fail` if owned by another process; `warn` if psutil missing or net_connections requires elevated perms | (no hint; informational) |
| 6 | GET `/api/health` | `ok` on 200; `fail` on any other status / connection error | `Run cc start` |
| 7 | launchd jobs running | `ok` if both `com.cmc.server` + `com.cmc.dispatcher` show `state = running`; `fail` otherwise | `Run cc start` |
| 8 | Telegram (optional) | `ok` (skipped) if `TELEGRAM_BOT_TOKEN` unset; `ok` if `getMe` returns 200; `fail` on any error | `Re-run cc setup telegram` |

Exit code: 0 iff zero checks have status `fail`. Warns do NOT trigger exit 1.

ANSI symbols: `\033[32m[✓]\033[0m` (ok, green), `\033[33m[⚠]\033[0m` (warn, yellow), `\033[31m[✗]\033[0m` (fail, red).

## com.cmc.server.plist contract

Locked decisions from Plan 09-01 frontmatter Q8:
- `Label`: `com.cmc.server`
- `ProgramArguments`: `${python_path_dir}/uvicorn cmc.app.factory:create_app --factory --host 127.0.0.1 --port 8765`
- `RunAtLoad`: true
- `KeepAlive`: true (auto-restart on crash; Phase 9 = production server lifecycle)
- `ThrottleInterval`: 5 (seconds between restart attempts)
- `WorkingDirectory`: `${repo_root}`
- `EnvironmentVariables`: `PYTHONUNBUFFERED=1`, `PATH=${python_path_dir}:/usr/bin:/bin`
- `StandardOutPath`: `${repo_root}/.tmp/mission-control-queue/dispatcher-logs/server.out`
- `StandardErrorPath`: `${repo_root}/.tmp/mission-control-queue/dispatcher-logs/server.err`
- `ProcessType`: `Background`

The plist invokes the `uvicorn` console-script directly (sibling of the python binary) rather than `python -m uvicorn` so launchd's KeepAlive sees a stable executable target.

## Test count delta

Backend suite: 354 → 373 (+19 tests in this plan).

Breakdown of the 19 new tests in `backend/tests/test_phase9_setup.py`:

**Server plist (3):**
- `test_server_plist_renders_uvicorn_command` — uvicorn invocation, --factory, KeepAlive, port 8765, WorkingDirectory
- `test_server_plist_module_cli_entry` — `python -m cmc.app.plist_render` writes plist to stdout
- `test_dispatcher_plist_module_cli_entry` — Phase-9 retrofit: `python -m cmc.dispatcher.plist_render` works

**setup_otel atomic merge (5):**
- `test_setup_otel_creates_settings_with_six_keys` — all 6 LOCKED keys present; OTEL_LOG_USER_PROMPTS NOT present
- `test_setup_otel_never_overwrites_existing` — user opt-out preserved; 5 of 6 added; non-OTEL keys preserved
- `test_setup_otel_atomic_no_leftover_tmp` — Pitfall P8: no .tmp leftover after merge
- `test_setup_otel_idempotent_second_run_adds_nothing` — second run is a no-op
- `test_setup_otel_invalid_json_aborts_with_backup` — SystemExit(1) + backup preserved

**doctor (5):**
- `test_doctor_python_check_passes` — Check 1 ok in test env
- `test_doctor_settings_check_warn_when_missing` — Check 3 warn when ~/.claude/settings.json absent
- `test_doctor_telegram_skipped_when_unset` — Check 8 ok-skipped when TELEGRAM_BOT_TOKEN unset
- `test_doctor_run_checks_returns_eight` — exactly 8 checks; ids {1..8}
- `test_doctor_render_includes_ansi_colors` — green/yellow/red ANSI; hint hidden for ok status

**install.sh + cc + start/stop (6):**
- `test_install_sh_dry_run_succeeds` — exit 0 with `DRY-RUN` + `Python:` lines; no files written under prefix
- `test_install_sh_unknown_arg_exits_2` — `--bogus-flag` → exit 2
- `test_cc_shim_help_lists_subcommands` — all 8 subcommands appear in help output
- `test_cc_shim_unknown_subcommand_exits_2` — unknown sub → exit 2
- `test_cc_shim_setup_without_arg_exits_2` — `cc setup` (no sub) → exit 2 with `otel` in usage
- `test_start_sh_and_stop_sh_executable` — both +x; both contain all 4 daemon labels

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Path.resolve()` follows symlinks; broke uvicorn path resolution**
- **Found during:** Task 1 verify (`test_server_plist_renders_uvicorn_command` failed)
- **Issue:** `Path("/opt/homebrew/bin/python3.13").resolve()` follows the homebrew symlink to `/opt/homebrew/Cellar/python@3.13/3.13.13/Frameworks/Python.framework/Versions/3.13/bin/python3.13`, where there is NO sibling `uvicorn` console-script. The plist's `${python_path_dir}/uvicorn` would then point at a non-existent file, and launchd would fail to start the server.
- **Fix:** Switched to `Path.absolute()` in `backend/cmc/app/plist_render.py`, which converts a relative path to absolute WITHOUT following symlinks — so the operator-supplied `/opt/homebrew/bin/` is preserved as the parent dir. The dispatcher and telegram plist_render modules use `.resolve()` but they substitute `${python_path}` directly into ProgramArguments (not the parent dir), so they're unaffected.
- **Files modified:** `backend/cmc/app/plist_render.py`
- **Commit:** `6a82539`

### Additive Phase-9 Deviation against Plan 08-02

**Dispatcher plist_render CLI retrofit:** `backend/cmc/dispatcher/plist_render.py` did not previously expose a `main()` + `__main__` entry point. Phase 9 install.sh needs uniform `python -m cmc.<x>.plist_render` invocation across all 4 renderers, so we appended a `main()` that argv-parses 2 positional args (`python_path`, `repo_root`) and writes the rendered plist to stdout.

This is **additive and non-behavior-breaking**:
- Existing `from cmc.dispatcher.plist_render import render_plist` callers (Phase 8 docs/tests) are unaffected.
- The new `main()` is only triggered by `python -m` invocation.
- Documented in the function docstring as a Phase-9 deviation.

### Documented Auth Gates

None — this plan has no authentication-gated tasks (all setup/doctor checks are local).

## Self-Check: PASSED

Created files verified to exist:
- `scripts/install.sh` ✓
- `scripts/cc` ✓
- `scripts/start.sh` ✓
- `scripts/stop.sh` ✓
- `scripts/doctor.py` ✓
- `scripts/setup_otel.py` ✓
- `backend/cmc/app/plist_render.py` ✓
- `backend/cmc/app/templates/__init__.py` ✓
- `backend/cmc/app/templates/com.cmc.server.plist.j2` ✓
- `backend/cmc/cli/doctor.py` ✓
- `backend/cmc/cli/setup_otel.py` ✓
- `backend/tests/test_phase9_setup.py` ✓

Modified file verified:
- `backend/cmc/dispatcher/plist_render.py` ✓ (CLI retrofit at bottom)

Commits verified:
- `6a82539` Task 1 (server plist + plist_render + setup_otel + doctor backend modules)
- `c0932a7` Task 2 (install.sh + cc dispatcher + start/stop scripts)

Verification commands executed:
- `cd backend && uv run pytest tests/test_phase9_setup.py -x -v` → 19 passed
- `cd backend && uv run pytest` → 373 passed (354 baseline + 19 new)
- `bash scripts/install.sh --dry-run --prefix=/tmp/cc-dry` → exit 0
- `CMC_HOME=$REPO scripts/cc help` → 8 subcommands listed
