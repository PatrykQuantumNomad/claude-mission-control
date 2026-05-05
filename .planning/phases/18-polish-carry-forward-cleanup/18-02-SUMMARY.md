---
phase: 18-polish-carry-forward-cleanup
plan: 02
subsystem: backend-core
tags: [datetime, utc, deprecation, python-3.12, sweep, poli-06, ruff]

# Dependency graph
requires:
  - phase: 18-polish-carry-forward-cleanup
    provides: cmc.core.time.now_utc helper + UTCDatetime canonical home (Plan 18-01)
provides:
  - "Zero datetime.utcnow call sites across backend/ — POLI-06 dual gate green"
  - "All 17 db model files import now_utc from cmc.core.time and use it as a Field(default_factory=...) reference"
  - "cmc/pricing.py:182 + tests/test_pricing.py:139 inline call sites migrated to now_utc()"
  - "tests/conftest.py:451 stale comment refreshed to reference now_utc as the canonical replacement"
affects: [18-05-baseline-and-phase-close, all-future-time-stamping-code]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-Sweep: atomic single mechanical-replacement commit (bisect-friendly) for the helper-adoption half of a two-commit migration"
    - "POLI-06 dual verify gate: ruff --select UP clean AND git grep utcnow 0 matches — structural enforcement of the deprecated-API ban"
    - "Pitfall 7 lock: default_factory takes a function REFERENCE (no parens); inline call sites use parens"

key-files:
  created: []
  modified:
    - "backend/cmc/db/models/activities.py"
    - "backend/cmc/db/models/alert_rules.py"
    - "backend/cmc/db/models/alert_state.py"
    - "backend/cmc/db/models/decisions.py"
    - "backend/cmc/db/models/inbox.py"
    - "backend/cmc/db/models/live_state.py"
    - "backend/cmc/db/models/mcp_stats.py"
    - "backend/cmc/db/models/notification_log.py"
    - "backend/cmc/db/models/otel_events.py"
    - "backend/cmc/db/models/otel_metrics.py"
    - "backend/cmc/db/models/pricing.py"
    - "backend/cmc/db/models/schedules.py"
    - "backend/cmc/db/models/sessions.py"
    - "backend/cmc/db/models/skills.py"
    - "backend/cmc/db/models/system_state.py"
    - "backend/cmc/db/models/tasks.py"
    - "backend/cmc/db/models/token_usage.py"
    - "backend/cmc/pricing.py"
    - "backend/cmc/core/time.py"
    - "backend/tests/conftest.py"
    - "backend/tests/test_core_time.py"
    - "backend/tests/test_pricing.py"

key-decisions:
  - "Tasks 1+2 merged into a single atomic commit (c3d792f) per the plan's bisect-friendly D-Sweep convention. The mechanical 22-site replacement either fully reverts or fully applies — no half-migrated state on the bisect timeline."
  - "Docstring rewordings in cmc/core/time.py and tests/test_core_time.py were folded into the sweep commit (not separated) because the literal substring 'datetime.utcnow' in docstrings would block the POLI-06 git-grep verify gate. The descriptive prose now uses 'deprecated stdlib naive-UTC factory' / 'deprecated naive-UTC call sites' instead."
  - "The pre-commit ruff hook surfaced 2 pre-existing I001 (import-sort) errors in tests/test_core_time.py — introduced by Plan 18-01. Per D-Aggressive-cleanup, these were auto-fixed inline via `ruff check --select I --fix` and folded into the sweep commit (vs. a separate adjacent-cleanup commit) because the file was already touched by the sweep and the hook required them green to land the commit."
  - "Did NOT add ruff DTZ to project select (Open-Question 3 deferred — would surface 38 unrelated DTZ findings)."
  - "Did NOT introduce a Field constants module or a NOW_UTC sentinel — kept the 19 default_factory= sites as direct function references, matching D-Field-factories."

patterns-established:
  - "Pattern: Docstring substring discipline — when a verify gate uses git grep, prose mentioning the banned API must paraphrase (e.g., 'the deprecated stdlib factory' instead of the literal name)"
  - "Pattern: Inline lint cleanup folds into the sweep commit when the same file is already touched and a pre-commit hook gates the landing"

# Metrics
duration: ~42min
completed: 2026-05-05
---

# Phase 18 Plan 02: utcnow Sweep Summary

**Atomic mechanical sweep migrating all 22 deprecated naive-UTC call sites onto `cmc.core.time.now_utc`, eliminating Python 3.12 `datetime.utcnow` deprecation warnings and clearing the POLI-06 dual verify gate (ruff --select UP + git grep both zero).**

## Performance

- **Duration:** ~42 min
- **Started:** 2026-05-05T20:15:16Z
- **Completed:** 2026-05-05T20:58:12Z
- **Tasks:** 3 (Tasks 1+2 merged into 1 commit per D-Sweep; Task 3 verification-only)
- **Files modified:** 22

## Accomplishments

- **22 call sites migrated** — 19 `Field(default_factory=)` defaults across 17 model files + 2 inline `datetime.utcnow()` calls (`cmc/pricing.py:182`, `tests/test_pricing.py:139`) + 1 stale comment (`tests/conftest.py:451`).
- **POLI-06 dual gate green:**
  - `cd backend && uv run ruff check --select UP` → `All checks passed!`
  - `git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- 'backend/'` → **0 matches**
- **Deprecation warnings eliminated:** `grep -c 'datetime.datetime.utcnow' /tmp/phase18-plan02-pytest-task3.log` → **0** (down from 4 unique sources / ~340 total warning entries pre-sweep).
- **Pytest non-regressive:** 566 passed, 0 failed in 174s (vs. 566 passed pre-sweep baseline). No new failures introduced.
- **Full ruff lint clean:** `cd backend && uv run ruff check` → `All checks passed!` (down from 2 pre-existing I001 errors carried over from Plan 18-01).
- **App imports cleanly:** `uv run python -c "import cmc.app.lifespan"` → OK.
- **No new dependencies:** `uv.lock` unchanged.

## Task Commits

Each task was committed atomically per the plan's D-Sweep convention:

1. **Tasks 1+2 (merged): atomic mechanical sweep** — `c3d792f` (refactor) — 22 call sites + adjacent I001 fix
2. **Task 3: verification only** — no commit (no adjacent cleanup warranted; full ruff clean by sweep commit's I001 fix)

**Plan metadata:** (pending — final docs commit follows this SUMMARY)

## The 22 Migrated Call Sites

### 19 Field(default_factory=) defaults across 17 model files

| File | Line | Field |
|---|---|---|
| `backend/cmc/db/models/activities.py` | 27 | `updated_at` |
| `backend/cmc/db/models/alert_rules.py` | 32 | `created_at` |
| `backend/cmc/db/models/alert_rules.py` | 33 | `updated_at` |
| `backend/cmc/db/models/alert_state.py` | 22 | `last_evaluated_at` |
| `backend/cmc/db/models/decisions.py` | 47 | `created_at` |
| `backend/cmc/db/models/inbox.py` | 43 | `created_at` |
| `backend/cmc/db/models/live_state.py` | 32 | `updated_at` |
| `backend/cmc/db/models/mcp_stats.py` | 29 | `computed_at` |
| `backend/cmc/db/models/notification_log.py` | 23 | `sent_at` |
| `backend/cmc/db/models/otel_events.py` | 35 | `received_at` |
| `backend/cmc/db/models/otel_metrics.py` | 25 | `received_at` |
| `backend/cmc/db/models/pricing.py` | 32 | `loaded_at` |
| `backend/cmc/db/models/schedules.py` | 32 | `created_at` |
| `backend/cmc/db/models/schedules.py` | 33 | `updated_at` |
| `backend/cmc/db/models/sessions.py` | 19 | `synced_at` |
| `backend/cmc/db/models/skills.py` | 30 | `updated_at` |
| `backend/cmc/db/models/system_state.py` | 25 | `updated_at` |
| `backend/cmc/db/models/tasks.py` | 49 | `created_at` |
| `backend/cmc/db/models/token_usage.py` | 30 | `updated_at` |

(Line numbers shifted +2 from plan's pre-sweep enumeration because each model file gained a 2-line `from cmc.core.time import now_utc` import block.)

### 2 inline datetime.utcnow() call sites

| File | Pre-sweep line | Replacement |
|---|---|---|
| `backend/cmc/pricing.py` | 182 | `loaded_at=now_utc()` (parens — per-call value) |
| `backend/tests/test_pricing.py` | 139 | `loaded_at=now_utc()` (parens — per-call value) |

### 1 stale comment

| File | Pre-sweep line | Action |
|---|---|---|
| `backend/tests/conftest.py` | 451 | Comment refreshed: now references `now_utc` as the canonical `default_factory` replacement; literal `datetime.utcnow` substring removed (would have failed the POLI-06 git-grep verify gate). |

### 2 docstring rewordings (Rule 3 fix to clear verify gate)

| File | Action |
|---|---|
| `backend/cmc/core/time.py` (module + function docstrings) | Reworded "Python 3.12 deprecated `datetime.utcnow()`…" / "`now_utc()` is the single helper the rest of the backend should call instead of `datetime.utcnow()`" / "Replaces the deprecated `datetime.utcnow()` (Python 3.12+)…" to use the descriptive paraphrase "deprecated stdlib naive-UTC factory" — preserves explanatory intent while clearing the literal substring out of the codebase. |
| `backend/tests/test_core_time.py` (module docstring line 4) | "22 `datetime.utcnow()` call sites" → "22 deprecated naive-UTC call sites". |

## Pre-sweep vs Post-sweep Metrics

| Metric | Pre-sweep | Post-sweep | Δ |
|---|---|---|---|
| `git grep -nE 'datetime\.utcnow\|from datetime import .*utcnow' -- 'backend/' \| wc -l` | 25 (22 actual sites + 3 docstring mentions in `cmc/core/time.py` + 1 in `tests/test_core_time.py`) | **0** | -25 |
| `cd backend && uv run ruff check --select UP` | All checks passed! (Plan 18-01 already cleared) | All checks passed! | unchanged |
| `cd backend && uv run ruff check` (full) | 2 errors (I001 in tests/test_core_time.py — Plan 18-01 carry-over) | All checks passed! | -2 |
| Pytest pass count | 566 passed | **566 passed** | 0 |
| Pytest failure count | 0 failed | **0 failed** | 0 |
| `grep -c 'datetime.datetime.utcnow' <pytest-output>` | 4 (unique deprecation sources, ~340 total warning entries collapsed) | **0** | -4 |
| Total pytest warnings reported | 340 | **32** | -308 |

(The plan's pre-baseline claim of "~1429 deprecation lines" used a different counting method — likely `-W default` per-occurrence. Pytest's default behavior collapses duplicates by `(filename, lineno)` to 4 unique sources here. Either way, **post-sweep is verifiably zero**, which is what POLI-06 enforces.)

## Files Created/Modified

**Created:** none.

**Modified (22):**
- 17 db model files (see table above) — each gained `from cmc.core.time import now_utc` and 1-2 `default_factory=now_utc` replacements
- `backend/cmc/pricing.py` — added `from cmc.core.time import now_utc` import + 1 inline call replacement
- `backend/cmc/core/time.py` — module + function docstrings reworded to drop the literal `datetime.utcnow` substring (Rule 3 — required to clear POLI-06 git-grep gate)
- `backend/tests/conftest.py` — stale comment at line 451 rewritten to reference `now_utc` and drop the literal substring
- `backend/tests/test_core_time.py` — module docstring line 4 reworded; pre-existing I001 import-sort fix folded in (Plan 18-01 carry-over)
- `backend/tests/test_pricing.py` — added `from cmc.core.time import now_utc` import + 1 inline call replacement

## Decisions Made

1. **Single atomic commit for Tasks 1+2 (vs. one-per-file).** Plan explicitly mandates D-Sweep / bisect-friendly atomicity for the helper-adoption half of the locked two-commit migration. The 22-site replacement either lands fully or reverts fully on `git bisect` — no half-migrated intermediate state. Commit `c3d792f`.

2. **Docstring rewordings included in the sweep commit.** The verify gate `git grep -nE 'datetime\.utcnow' -- 'backend/'` is structural — it counts substring matches. Three docstring blocks in `cmc/core/time.py` and one in `tests/test_core_time.py` mentioned the banned API by name to explain WHY `now_utc` exists. Rather than carve them out as a separate "documentation cleanup" commit, the rewords were folded into the sweep — they're part of the same "drop the deprecated name from the codebase" intent and keeping them separate would force the sweep commit to fail the gate.

3. **Pre-existing I001 fix folded in (vs. separate adjacent-cleanup commit).** Per D-Aggressive-cleanup, the plan permits adjacent cleanup as separate commits when "ruff check (no select filter) surfaces non-UP findings in touched files." Two `I001` errors in `tests/test_core_time.py` (import-sort, introduced by Plan 18-01) blocked the pre-commit hook on the sweep commit. Two paths existed: (a) commit the I001 fix first as a "lint" commit, then commit the sweep, or (b) fold the auto-fix into the sweep. Chose (b) because the file was already in the sweep's modification set (docstring change at line 4), the fix was a deterministic `ruff --fix --select I` auto-fix, and a separate one-line lint commit on the same file would muddle the bisect timeline. Documented in the commit body as `Adjacent: ...`.

4. **No DTZ activation.** Per Open-Question 3 in 18-RESEARCH (deferred). Adding `DTZ` to ruff `select` would surface 38 unrelated findings (e.g., `datetime.now()` without TZ in business logic) — out of POLI-06 scope.

5. **No Field constants module / NOW_UTC sentinel.** Kept all 19 default_factory= references as direct function imports — matches D-Field-factories. A constants module would have added a layer of indirection without ergonomic benefit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded docstring mentions of the literal `datetime.utcnow` to clear the POLI-06 verify gate**
- **Found during:** Task 2 verify gate (after editing `tests/conftest.py:451`)
- **Issue:** The plan's verify gate is `git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- 'backend/' | wc -l` returns 0. After the 22 code-site sweep, 4 substring matches remained — all in explanatory docstrings (cmc/core/time.py module docstring + function docstring × 2 mentions, tests/test_core_time.py module docstring × 1 mention). These are project documentation explaining WHY `now_utc()` exists, but they collide with the structural verify gate.
- **Fix:** Reworded each occurrence to use the descriptive paraphrase "deprecated stdlib naive-UTC factory" / "deprecated naive-UTC call sites" — preserves the explanatory intent while clearing the literal substring out of the codebase.
- **Files modified:** `backend/cmc/core/time.py`, `backend/tests/test_core_time.py`
- **Verification:** `git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- 'backend/' | wc -l` → 0
- **Committed in:** `c3d792f` (folded into the atomic sweep commit)

**2. [Rule 3 - Blocking] Auto-fixed pre-existing I001 import-sort errors in tests/test_core_time.py**
- **Found during:** Task 2 commit step (pre-commit ruff hook rejected the sweep commit)
- **Issue:** Plan 18-01 left 2 pre-existing `I001` (un-sorted import block) errors in `tests/test_core_time.py` (lines 11-16 and lines 75-77). These pre-date this plan but blocked the pre-commit hook because `tests/test_core_time.py` is in the sweep's modification set (docstring reword at line 4).
- **Fix:** Ran `uv run ruff check --select I --fix tests/test_core_time.py` — deterministic auto-fix. Verified: top-level imports now ordered stdlib → third-party (pydantic) → first-party (cmc.core.time); function-local imports (in `test_utc_datetime_reexport_path`) reordered alphabetically without the previous blank-line break.
- **Files modified:** `backend/tests/test_core_time.py`
- **Verification:** `cd backend && uv run ruff check` → All checks passed!
- **Committed in:** `c3d792f` (folded into the atomic sweep commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — Blocking)
**Impact on plan:** Both auto-fixes were necessary to clear the plan's own verify gates and the pre-commit ruff hook. No scope creep; both fixes stayed within touched files and within the spirit of D-Aggressive-cleanup.

## Issues Encountered

- **Pytest output buffering with `-q --tb=no`:** The first pytest run with `-q --tb=no 2>&1 | tee | tail -3` produced a truncated tail that did not show the `XYZ passed` summary line. Worked around by running without `-q` (full progress + summary), then grepping for `passed|failed|error` directly.
- **Single intermittent test flake (`test_estop02_validate_pid_is_claude_positive`):** One pytest run during baseline measurement showed this test failing while subsequent runs and isolated runs all passed. Root cause is a pre-existing test-isolation issue unrelated to this sweep (likely PID-recycling state contention with another test in the full suite). Documented in this section because it briefly muddied the baseline pass-count comparison; the final post-sweep run cleanly showed 566 passed.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 18-03 (schedules-card-determinism):** already complete (commit `f5b9b42`). Out-of-order execution by another agent.
- **Plan 18-04 (Playwright strict-mode):** already complete (commit `cc75428`).
- **Plan 18-05 (baseline-and-phase-close):** ready to execute. POLI-06 dual gate is now green; Plan 18-05 will refresh the suite-wide baseline (Plan 17 baseline shifts now that 308 fewer warnings are emitted) and close the phase.

## Self-Check: PASSED

- All 22 modified files exist on disk.
- Sweep commit `c3d792f` present in `git log --oneline`.
- POLI-06 Gate 1 (`ruff check --select UP`): All checks passed!
- POLI-06 Gate 2 (`git grep utcnow backend/`): 0 matches.
- Pytest: 566 passed, 0 failed, 0 `datetime.datetime.utcnow` deprecation lines.
- App imports cleanly (`import cmc.app.lifespan` → OK).
- No Pitfall 7 violations in code (only the docstring example at `cmc/core/time.py:20` which describes the pitfall, not a real call).
- `uv.lock` unchanged (no new dependencies).

---
*Phase: 18-polish-carry-forward-cleanup*
*Completed: 2026-05-05*
