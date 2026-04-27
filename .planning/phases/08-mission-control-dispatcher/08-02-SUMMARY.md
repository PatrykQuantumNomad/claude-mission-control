---
phase: 08-mission-control-dispatcher
plan: 02
subsystem: dispatcher
tags: [dispatcher, subprocess, launchd, model-resolution, plist, importlib-resources, string-template]

# Dependency graph
requires:
  - phase: 08-mission-control-dispatcher
    plan: 01
    provides: state.write_pid_file / state.unlink_pid_file (PID-file lifecycle), heartbeat.run_one_cycle (orchestration shell), Settings.claude_bin / claude_default_model / dispatcher_classic_timeout_s, conftest tmp_pid_dir_monkey + make_task_orm + timeout_s kwarg on make_task_row
  - phase: 04-stateful-apis
    provides: cmc.tasks.transitions (validate_transition for pending→running→done|failed lattice), Task ORM (status/started_at/ended_at/error_message columns)
  - phase: 01-foundation-database
    provides: Skill ORM (frontmatter JSON column for DISP-10 skill-level model override), Task model (status / execution_mode / model / timeout columns)
provides:
  - run_classic(task_row, settings, sessions, *, skill=None) — DISP-05 sync subprocess runner with PID-file Pitfall-10 timing + ANTHROPIC_API_KEY scrub (Pitfall 8) + timeout escalation (terminate→wait(10s)→kill) + always-unlink-on-finally lifecycle
  - resolve_model(task, skill, settings) -> str — DISP-10 pure 4-tier precedence resolver (task.model > skill.frontmatter['model'] > os.environ['CMC_DEFAULT_MODEL'] > settings.claude_default_model)
  - render_plist(python_path, repo_root) -> str — DISP-12 install-time launchd plist renderer using string.Template.safe_substitute (no Jinja2 dep)
  - templates/com.cmc.dispatcher.plist.j2 — string.Template plist with python_path / python_path_dir / repo_root placeholders
  - oneshot.main() — replaces Phase-4 stub; loads settings, configures logging, runs asyncio.run(run_one_cycle()), returns int exit code
  - tests/fixtures/fake_claude_classic.py — deterministic claude -p emulator with --hang / --exit-code / --print-pid-file flags
affects: [08-03 stream runner (will reuse resolve_model), 08-04 fan-out (will spawn run_classic from threads), 09-launchd-deployment (will invoke render_plist + emit installer doc), ESTOP-08 (consumes the PID file written by run_classic)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sync→async DB-update bridge via asyncio.run(_mark_status(...)) — required because Plan 04 fan-out runs run_classic from threading.Thread; each thread gets its own event loop"
    - "Subprocess env scrub: env = os.environ.copy(); env.pop('ANTHROPIC_API_KEY', None) — Pitfall 8 mitigation, prevents key exfiltration via rogue MCP / prompt"
    - "Pitfall-10 PID-file timing: write_pid_file(task_id, proc.pid) IMMEDIATELY after Popen returns, BEFORE communicate() — ESTOP-08 needs the PID on disk the instant the child becomes killable"
    - "Always-unlink-on-finally: PID file removal lives in finally so partial-spawn (FileNotFoundError of claude_bin), mid-flight crash, and successful exit all converge to a clean filesystem"
    - "Timeout escalation: communicate(timeout=N) → TimeoutExpired → terminate() → wait(10s) → kill() — graceful-then-firm pattern used by Phase 4 dispatcher_oneshot tests"
    - "string.Template.safe_substitute for plist (NOT Jinja2): three placeholders is below the threshold for adding a new runtime dependency; safe_substitute means missing placeholders pass through as literals (defensive-installer-script-friendly)"
    - "importlib.resources.files(package) / 'name' for shipped non-Python files: lets sdist / wheel ship the .plist.j2 template as package data without ad-hoc path resolution"
    - "Late import inside main() (cmc.dispatcher.heartbeat) so test monkeypatching of run_one_cycle takes effect without import-time side effects in oneshot.py"

key-files:
  created:
    - backend/cmc/dispatcher/model_resolve.py
    - backend/cmc/dispatcher/run_classic.py
    - backend/cmc/dispatcher/plist_render.py
    - backend/cmc/dispatcher/templates/__init__.py
    - backend/cmc/dispatcher/templates/com.cmc.dispatcher.plist.j2
    - backend/tests/fixtures/__init__.py
    - backend/tests/fixtures/fake_claude_classic.py
  modified:
    - backend/cmc/dispatcher/oneshot.py
    - backend/tests/test_phase8_dispatcher.py

key-decisions:
  - "CMC_DEFAULT_MODEL (not CLAUDE_DEFAULT_MODEL) is the env-var name for DISP-10 tier 3. The settings field is claude_default_model (so its bare-name env override is CLAUDE_DEFAULT_MODEL via pydantic-settings); the dispatcher-specific override CMC_DEFAULT_MODEL deliberately uses the CMC_ prefix to distinguish a runtime knob from the project default. This is the ONLY CMC_-prefixed env var in the dispatcher (settings still use bare names per Plan-01 lock)."
  - "string.Template.safe_substitute over Jinja2 for plist rendering — three placeholders is well below the threshold for adding Jinja2 to runtime deps. The .plist.j2 suffix is a CONVENTION (matches industry expectation that .j2 means 'template'), not a Jinja2 binding. safe_substitute (not substitute) is used so missing placeholders pass through as literals — defensive against installer-script bugs."
  - "Sync subprocess.Popen + thread-spawned DB writes (asyncio.run from inside the thread) — verified safe in Phase 4 spawn tests. Plan 08-04 wires threading.Thread(target=run_classic, ...) inside the heartbeat fan-out; classic mode does NOT use asyncio.create_subprocess_exec because we want simpler error semantics (no event-loop lifetime questions for a 600s subprocess)."
  - "Wrapper shell script in tests/_write_fake_claude_wrapper(tmp_path, fixture_extra_args=...): the cleanest way to inject test behaviors (--hang, --exit-code, --print-pid-file) into the runner WITHOUT modifying run_classic's cmd construction. Keeps run_classic's argv shape identical between tests and prod. The wrapper exec's sys.executable + the fixture .py file with extra args prepended."
  - "Late `from cmc.dispatcher import heartbeat as _hb` inside oneshot.main() (not module-level): lets tests monkeypatch cmc.dispatcher.heartbeat.run_one_cycle directly without re-importing oneshot. Module-level import would have bound run_one_cycle to oneshot's namespace at import time, defeating the standard monkeypatch.setattr pattern."

patterns-established:
  - "Pattern (subprocess test fixture): fake_claude_classic.py is the canonical script for emulating claude -p in tests. Plan 08-03 will reuse the same pattern for stream mode (a sibling fake_claude_stream.py with different argv handling). Tests inject extra fixture args via a tiny shell wrapper, NOT by modifying the production runner's argv."
  - "Pattern (sync→async DB-update bridge): _mark_status async function + _mark_failed_sync / _mark_done_sync wrappers using asyncio.run. Reusable for any thread-spawned subprocess runner that needs to write to the AsyncSession-only DB layer. Each thread gets its own event loop — verified safe."
  - "Pattern (PID-file lifecycle ALWAYS in finally): write_pid_file → try (Popen → write → communicate) → finally (unlink_pid_file). Future runners (stream mode, decision-watch) MUST follow this — partial-failure cases are easy to miss otherwise."
  - "Pattern (env scrub before Popen): env = os.environ.copy(); env.pop('SECRET_NAME', None); ...Popen(env=env...). Reusable for any subprocess where the parent has secrets the child must not see. Plan 08-03 stream mode will keep ANTHROPIC_API_KEY when skill router demands it — the scrub is per-runner, not global."
  - "Pattern (string.Template plist with package-data resource): files(package) / 'template.j2' + Template(text).safe_substitute(...). Reusable for any future installer template (e.g., systemd unit on Linux Phase, npm package.json scaffold). Three-placeholder threshold separates 'use stdlib' from 'add a templating engine'."

requirements-completed: [DISP-05, DISP-10, DISP-12]

# Metrics
duration: 9min
completed: 2026-04-27
---

# Phase 8 Plan 2: Mission Control Dispatcher Wave 2 (Classic Runner + Model Chain + Plist) Summary

**Classic-mode subprocess runner (Pitfall-10 PID timing + Pitfall-8 env scrub + timeout escalation) plus DISP-10 4-tier model precedence chain plus DISP-12 launchd plist template — Phase-4 oneshot stub replaced with the real entry point, end-to-end verified against a clean DB.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-04-27T21:28:53Z
- **Completed:** 2026-04-27T21:37:35Z
- **Tasks:** 2 (TDD; 4 commits = 2 RED + 2 GREEN)
- **Files modified:** 9 (7 created + 2 modified)

## Accomplishments

- **DISP-05 classic runner**: `run_classic(task_row, settings, sessions, *, skill=None)` spawns `claude -p PROMPT --bare --output-format json --model MODEL` synchronously (caller threads it); 4 lifecycle paths verified — happy / nonzero / timeout / spawn-fail — all converge to a clean PID-file state via finally.
- **Pitfall 10 verified**: `test_disp05_classic_writes_pid_immediately` polls for the PID file WHILE the child subprocess is mid-flight (fixture sleeps 1s after writing its marker, giving the test a window). Confirms the parent's `write_pid_file(task_id, proc.pid)` runs before any `communicate()` blocking.
- **Pitfall 8 verified**: `test_disp05_classic_scrubs_anthropic_key` spies on `subprocess.Popen` and asserts `ANTHROPIC_API_KEY` is absent from the env dict the child receives. Real env still has the key (monkeypatch sets it); the scrub happens per-spawn.
- **DISP-10 model precedence**: 5 unit tests cover all 4 tiers (task → skill → env → settings) plus skill-without-frontmatter fallback. Pure function, zero I/O.
- **DISP-12 plist template + render**: 7 tests cover existence, substitution, required launchd keys, PATH includes python_path_dir, no `ANTHROPIC_API_KEY` embed, XML parseability, venv-not-system-python.
- **oneshot.py replaced**: Phase-4 stub message gone; main() loads settings, configures structlog, runs `asyncio.run(_hb.run_one_cycle())`, returns int. Smoke verified: `cd backend && uv run python -m cmc.dispatcher.oneshot` exits 0 against a real-but-empty DB and emits `dispatcher.claimed` log line.
- **Suite growth**: 226 → 246 (+20). All 20 new Plan-02 tests pass; full suite green.

## Task Commits

Each task was committed atomically following TDD (RED → GREEN):

1. **Task 1 RED — Failing tests for model resolver + classic runner + fake-claude fixture** — `61dc067` (test)
2. **Task 1 GREEN — Implement model_resolve + run_classic** — `8ede11d` (feat)
3. **Task 2 RED — Failing tests for plist template + oneshot replacement** — `dbfa1bb` (test)
4. **Task 2 GREEN — Plist template + render helper + replace oneshot stub** — `c0cad6e` (feat)

**Plan metadata:** _(this commit — see final_commit step)_

## Files Created/Modified

### Created

| File | Purpose | Public API |
|---|---|---|
| `backend/cmc/dispatcher/model_resolve.py` | DISP-10 pure-function model precedence | `resolve_model(task, skill, settings) -> str` |
| `backend/cmc/dispatcher/run_classic.py` | DISP-05 classic-mode subprocess runner | `run_classic(task_row, settings, sessions, *, skill=None) -> None` |
| `backend/cmc/dispatcher/plist_render.py` | DISP-12 launchd plist install-time renderer | `render_plist(python_path, repo_root_path) -> str` |
| `backend/cmc/dispatcher/templates/__init__.py` | Package marker so `importlib.resources.files('cmc.dispatcher.templates')` works | _(empty package init)_ |
| `backend/cmc/dispatcher/templates/com.cmc.dispatcher.plist.j2` | string.Template launchd plist with python_path / python_path_dir / repo_root placeholders | _(template file)_ |
| `backend/tests/fixtures/__init__.py` | Package marker for test fixtures dir | _(empty package init)_ |
| `backend/tests/fixtures/fake_claude_classic.py` | Deterministic claude -p emulator | `python -m tests.fixtures.fake_claude_classic [-p PROMPT] [--bare] [--output-format json] [--model NAME] [--hang] [--exit-code N] [--print-pid-file PATH]` |

### Modified

| File | Change |
|---|---|
| `backend/cmc/dispatcher/oneshot.py` | Phase-4 stub body deleted; replaced with real `main()` that loads settings, configures logging, runs `asyncio.run(_hb.run_one_cycle())`, returns int (1 on uncaught exception). Late import of heartbeat for test monkeypatch friendliness. |
| `backend/tests/test_phase8_dispatcher.py` | +20 Plan-02 tests (5 DISP-10 + 6 DISP-05 + 7 DISP-12 + 2 oneshot replacement) appended after existing Plan-01 cases. |

## run_classic Public Contract

```python
def run_classic(
    task_row: Mapping[str, Any],   # claim-shaped dict: id, title, description, model, timeout_s
    settings,                       # cmc.config.Settings (claude_bin, claude_default_model, dispatcher_classic_timeout_s)
    sessions,                       # async_sessionmaker (used inside _mark_status via asyncio.run)
    *,
    skill: Optional[Any] = None,   # Skill ORM instance — forwarded to resolve_model
) -> None: ...
```

**Failure modes (all → status='failed' + error_message + PID unlinked):**

| Failure                            | error_message                |
| ---------------------------------- | ---------------------------- |
| claude_bin not found               | `spawn failed: <FileNotFoundError>` |
| subprocess returncode != 0         | `nonzero exit <code>`        |
| subprocess.communicate timeout     | `timeout`                    |

**Happy path:** returncode == 0 → status='done', ended_at=now, stdout captured to per-task log file at `.tmp/mission-control-queue/dispatcher-logs/task-{id}-{epoch}.log`.

## PID-File Lifecycle Paths (4-way verified)

| Path                                | PID-write      | PID-unlink                            |
| ----------------------------------- | -------------- | ------------------------------------- |
| Happy (returncode 0)                | After Popen    | finally (after _mark_done_sync)       |
| Nonzero exit (returncode 7)         | After Popen    | finally (after _mark_failed_sync)     |
| Timeout (--hang fixture)            | After Popen    | finally (after terminate→wait→kill)   |
| Spawn fail (claude_bin missing)     | NEVER (Popen raised) | finally — unlink_pid_file is FileNotFoundError-tolerant, so the call is a no-op |

The Pitfall-10 contract is: `write_pid_file` happens IMMEDIATELY after `subprocess.Popen` returns, before `communicate()`. The test that proves this (`test_disp05_classic_writes_pid_immediately`) uses a fixture that signals when the child has started, then asserts the parent's PID file exists at that moment — i.e., during, not just after, the subprocess lifetime.

## Plist Template Substitution Variables

| Variable           | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `${python_path}`   | Absolute path to venv python (NOT /usr/bin/python3 — the system python lacks the cmc package) |
| `${python_path_dir}` | Parent dir of venv python — prepended to PATH so `claude` and friends resolve via PATH inside dispatcher subprocesses |
| `${repo_root}`     | WorkingDirectory + StandardOut/ErrorPath base — `.tmp/mission-control-queue/dispatcher-logs/oneshot.{out,err}` |

`render_plist` uses `Path(...).resolve()` on inputs so relative paths from installer scripts become absolute before substitution. `safe_substitute` (not `substitute`) is used so missing placeholders pass through as literals — installer-script-bug tolerant.

## oneshot.py Exit-Code Contract

| Exit code | Cause                                                                  |
| --------- | ---------------------------------------------------------------------- |
| 0         | Cycle ran successfully (work or no work; emergency-stop counts as 0)   |
| 1         | Uncaught exception during settings load OR run_one_cycle (logged via structlog + stderr message) |

The settings load happens BEFORE the try/except so a settings-load failure surfaces via `cmc.config._render_pretty` (Phase 1 pretty-error helper) rather than the catch-all stderr message.

## Decisions Made

1. **CMC_DEFAULT_MODEL is the env name for DISP-10 tier 3**, NOT CLAUDE_DEFAULT_MODEL. The latter is the bare-name env override for the `claude_default_model` settings field (Phase-1 convention); the former is a separate dispatcher-specific runtime knob for operators. CMC_-prefix disambiguates the two and makes the override explicit. This is the ONLY CMC_-prefixed env var in the dispatcher — settings still use bare names per the Plan-01 lock.

2. **string.Template.safe_substitute over Jinja2** — three placeholders is well below the threshold for a new runtime dep. The .plist.j2 suffix is a convention (industry expectation that .j2 means "template") not a Jinja2 binding. `safe_substitute` is used so missing placeholders pass through as literals.

3. **Sync subprocess.Popen with thread-spawned DB writes (asyncio.run inside thread)** — Plan 08-04 will wrap `run_classic` in `threading.Thread(target=...)` inside the heartbeat fan-out. Classic mode chose this over asyncio.create_subprocess_exec for simpler error semantics over a 600s subprocess.

4. **Test wrapper shell script (`_write_fake_claude_wrapper`)** — keeps `run_classic`'s argv shape identical between tests and prod. Test extras (--hang, --exit-code, --print-pid-file) are injected via the wrapper's prepended-args mechanism, NOT by modifying the runner. Pattern is reusable for Plan 08-03 stream-mode tests.

5. **Late import of heartbeat in oneshot.main()** — module-level `from cmc.dispatcher.heartbeat import run_one_cycle` would have bound the function to oneshot's namespace at import time, defeating the standard `monkeypatch.setattr("cmc.dispatcher.heartbeat.run_one_cycle", ...)` pattern. Late import inside `main()` re-resolves the attribute on each call.

## Deviations from Plan

### None

Plan executed exactly as written. All 20 new tests passed on the first GREEN run after both RED commits. No bugs found, no missing-critical functionality discovered, no blocking issues, no architectural escalations. The plan's `<action>` blocks were complete and accurate enough that implementation was a 1:1 translation.

The only minor adjustment was a TDD-friendly tweak in Task 2's oneshot.py: rather than the plan's literal `from cmc.dispatcher.heartbeat import run_one_cycle` at module level, I used `from cmc.dispatcher import heartbeat as _hb` then `_hb.run_one_cycle()` so the test that monkeypatches `cmc.dispatcher.heartbeat.run_one_cycle` works correctly. This is an implementation detail that preserves the public contract (main() returns the cycle's exit code) — not a deviation per Rules 1-4.

---

**Total deviations:** 0
**Impact on plan:** Zero. Plan-as-written was production-quality.

## Issues Encountered

None — every test passed on first GREEN run after the RED commit. The fake-claude wrapper pattern (shell script delegating to the .py fixture with prepended extra args) needed a brief moment of design thought (the fixture's argparse can't easily receive both Popen-supplied and test-supplied flags), but the final shape was clean.

## Threat Flags

None. New modules introduce no new network surface, auth paths, or trust boundaries beyond what Plan 01 already covered. The ANTHROPIC_API_KEY scrub (Pitfall 8) is a hardening measure, not a new exposure.

## TODO Markers Status

- `cmc/dispatcher/heartbeat.py` line ~88 (`# TODO(Plan 08-04): per-task fan-out via run_classic / run_stream.`) is **PRESERVED** — Plan 02 deliberately does NOT touch it. Plan 04 will replace it with `await asyncio.gather(*runner_tasks)` after Plan 03 ships `run_stream`.
- `cmc/dispatcher/__init__.py` docstring still says "Plans 08-02..04 add run_classic / run_stream / fan-out wiring" — accurate (Plan 02 added run_classic; Plan 03 adds run_stream; Plan 04 wires fan-out).

## User Setup Required

None — no external service configuration required for Plan 02. Plan 09 (launchd deployment) will use `render_plist` to emit `~/Library/LaunchAgents/com.cmc.dispatcher.plist` and document the `launchctl load` command.

## Next Phase Readiness

- **Plan 08-03 (Wave 2: Stream runner + decisions)**: `run_stream(task_dict, settings)` will be a sibling of `run_classic` — same skeletal shape (write_pid_file → try/finally → unlink), different subprocess behavior (`claude --output-format stream-json --input-format stream-json`, line-buffered stdout reader, DECISION/INBOX line parsing, decision-poll loop). Plan 03 reuses `resolve_model` verbatim.
- **Plan 08-04 (Wave 3: Fan-out + integration smoke)**: replaces the heartbeat TODO with `threading.Thread(target=run_classic | run_stream, args=(claimed_task_row, settings, sessions))` per claimed row. Plan 04 verifies the end-to-end smoke: a pending classic-mode task transitions pending→running→done in a single `python -m cmc.dispatcher.oneshot` invocation (already plumbed in Plan 02 — only fan-out missing).
- **Plan 09 (launchd deployment)**: will invoke `render_plist(sys.executable, repo_root())` and write the rendered XML to `~/Library/LaunchAgents/com.cmc.dispatcher.plist`. Plan 02 ships everything Plan 09 needs except the installer entry point.

**Test count delta:** 226 → 246 (+20). Suite remains 100% green.

## Self-Check: PASSED

Verified all created files exist and all commit hashes resolve:

- `backend/cmc/dispatcher/model_resolve.py` — FOUND
- `backend/cmc/dispatcher/run_classic.py` — FOUND
- `backend/cmc/dispatcher/plist_render.py` — FOUND
- `backend/cmc/dispatcher/templates/__init__.py` — FOUND
- `backend/cmc/dispatcher/templates/com.cmc.dispatcher.plist.j2` — FOUND
- `backend/tests/fixtures/__init__.py` — FOUND
- `backend/tests/fixtures/fake_claude_classic.py` — FOUND
- Commit `61dc067` (RED 1) — FOUND
- Commit `8ede11d` (GREEN 1) — FOUND
- Commit `dbfa1bb` (RED 2) — FOUND
- Commit `c0cad6e` (GREEN 2) — FOUND
- Test suite: `cd backend && uv run pytest` → 246 passed (226 baseline + 20 new) — PASSED
- Smoke: `cd backend && uv run python -m cmc.dispatcher.oneshot` → exit 0, prints `dispatcher.claimed` — PASSED

---
*Phase: 08-mission-control-dispatcher*
*Completed: 2026-04-27*
