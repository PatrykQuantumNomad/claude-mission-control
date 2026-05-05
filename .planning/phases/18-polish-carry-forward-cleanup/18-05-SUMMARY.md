---
phase: 18-polish-carry-forward-cleanup
plan: 05
subsystem: project-meta
tags: [baseline, ci-counts, phase-close, verifier-reference, poli-06, poli-07, poli-08]

# Dependency graph
requires:
  - phase: 18-polish-carry-forward-cleanup
    provides: POLI-06 dual gate green (Plan 02), POLI-07 vi.spyOn determinism (Plan 03), POLI-08 strict-mode + e2e README (Plan 04)
provides:
  - "BASELINE.md — single authoritative reference for v1.2 phases (19–23) verifiers to compare suite pass-counts and warning deltas against"
  - "Per-suite verifier rules (pytest / vitest / playwright) embedded as machine-readable thresholds inside BASELINE.md"
  - "Dev-DB context capture (failed_tasks_total=1, failed_tasks_recent_5min=0) explaining the alerts.spec.ts steady-state skip"
affects: [phase-19, phase-20, phase-21, phase-22, phase-23, all-future-v1.2-verifiers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-phase BASELINE.md artifact lives in the phase directory (not at .planning/ root) so each polish-phase's baseline is locally discoverable next to the work that produced it"
    - "Verifier-rule-as-data: each suite section embeds explicit pass/fail/warn thresholds (e.g., 'passed >= 566 → pass') so downstream verifiers can mechanically compare without re-deriving acceptable ranges"
    - "Dev-DB context capture for state-dependent skips: record the actual DB state that drives a skipped spec so future verifiers can distinguish 'baseline preserved' from 'state drifted'"

key-files:
  created:
    - ".planning/phases/18-polish-carry-forward-cleanup/BASELINE.md"
    - ".planning/phases/18-polish-carry-forward-cleanup/18-05-SUMMARY.md"
  modified: []

key-decisions:
  - "BASELINE.md path: .planning/phases/18-polish-carry-forward-cleanup/BASELINE.md (next to the phase that produced it), not .planning/BASELINE.md (project-root). Per CONTEXT D-Verifier-baseline."
  - "Warning-delta included in baseline: pytest total warnings (32) AND datetime.utcnow-specific warnings (0) are both recorded — the second is the load-bearing POLI-06 reverse-direction signal; the first gives a 100-warning headroom band before flagging an investigation."
  - "Dev-DB script uses async-engine + cmc.core.time.now_utc (not datetime.utcnow), consistent with the Plan 18-02 sweep — even ad-hoc inspection scripts that aren't committed do not call the deprecated stdlib factory. Threshold for POLI-06 is structural across the codebase, not just shipped code."
  - "Plan body's inline dev-DB script template (next(get_session())) was outdated — get_session is FastAPI-async (Depends-injected). Replaced with async load_settings → create_engine_for_settings → make_sessionmaker pattern. Ad-hoc fix; not committed (script is one-shot)."
  - "Skipped spec's full path documented (alerts.spec.ts > TEST-05a: /alerts lifecycle) so future verifier comparisons can pinpoint the steady-state skip without ambiguity."

patterns-established:
  - "Pattern: BASELINE.md as the phase-close exit artifact for any 'green-CI' polish phase. Subsequent polish phases (e.g., a hypothetical Phase 24) should refresh this file in their own phase directory rather than mutating Phase 18's frozen baseline."
  - "Pattern: 'verifier rule embedded in artifact' — store thresholds as prose-with-explicit-bounds inside the artifact itself rather than spreading them across STATE.md or RUNBOOK.md."

# Metrics
duration: ~9min
completed: 2026-05-05
---

# Phase 18 Plan 05: Baseline and Phase Close Summary

**Recorded the post-Phase-18 green-CI baseline (566 pytest pass / 293 vitest pass / 7 playwright pass + 1 steady-state skip) plus the datetime.utcnow deprecation-warning delta (~1429 → 0) into `BASELINE.md`, the canonical reference for v1.2 phases 19–23 verifiers.**

## Performance

- **Duration:** ~9 min (540s)
- **Started:** 2026-05-05T21:06:28Z
- **Completed:** 2026-05-05T21:15:28Z
- **Tasks:** 2 (Task 1: BASELINE.md write + commit; Task 2: SC verification only — no commit)
- **Files modified:** 0 (1 created — BASELINE.md)

## Final Phase-18 Test Counts at Phase Close

| Suite | Passed | Failed | Skipped | Runtime | Source log |
|---|---|---|---|---|---|
| Backend pytest | **566** | 0 | 0 | 174.29s | `/tmp/phase18-baseline-pytest.log` |
| Frontend vitest | **293** | 0 | 0 | 6.58s | `/tmp/phase18-baseline-vitest.log` |
| Playwright e2e | **7** | 0 | 1 (alerts TEST-05a, steady-state) | 7.0s | `/tmp/phase18-baseline-playwright.log` |

## Deprecation-Warning Delta (POLI-06 Load-Bearing Signal)

| Metric | Pre-Phase-18 | Post-Phase-18 | Δ |
|---|---|---|---|
| Pytest `datetime.datetime.utcnow` deprecation lines | ~1429 (per Plan 18-02 plan-body baseline) | **0** | -1429 |
| Total pytest warnings | ~340–1429 (counting-method-dependent) | **32** | -308 to -1397 |
| `git grep -nE 'datetime\.utcnow' -- backend/` | 25 | **0** | -25 |
| `ruff check --select UP` | clean (Plan 18-01 already cleared) | **clean** | unchanged |

The remaining 32 pytest warnings are **aiosqlite default-datetime-adapter** notices in `tests/test_dispatcher.py` + `tests/test_alerts_dispatcher.py` — out of POLI-06 scope (sqlite3 stdlib deprecation, not `datetime.utcnow`).

## Dev-DB Context for E2E Baseline

Captured at baseline-recording time using async-engine + `cmc.core.time.now_utc`:

| Metric | Value |
|---|---|
| `failed_tasks_total` (all-time) | 1 |
| `failed_tasks_recent_5min` | 0 |

**Why this matters:** The Playwright `alerts.spec.ts > TEST-05a` test self-skips when no recent (within 5 minutes) failed task is present in the dev DB. Recording this context lets Phase 19+ verifiers distinguish:

- **`skipped == 1`, alerts.spec.ts is the only skipped spec** → baseline preserved (state hasn't drifted; pass)
- **`skipped == 0`** → better-than-baseline (a recent failed task is now present; pass)
- **`skipped >= 2`** → state drift OR new flake (flag for human review)

## ROADMAP Success Criteria Audit (All 4 Green)

| SC | Description | Status | Evidence |
|---|---|---|---|
| SC1 (POLI-06) | `ruff --select UP` clean AND `git grep utcnow` 0 hits | **PASS** | `All checks passed!` + 0 grep matches |
| SC2 (POLI-07) | `vi.spyOn(Date` >=1, `vi.useFakeTimers` =0, TZ=UTC pass, TZ=America/New_York pass | **PASS** | spyOn=2, fake-timers=0, both TZs 8/8 SchedulesCard tests green |
| SC3 (POLI-08) | Playwright 0 failed, e2e/README.md has feature-component-element, source-component testid present, CONTRIBUTING.md untouched | **PASS** | 7/0/1, README convention locked, `data-testid="schedule-composer-name"` on ScheduleComposer.tsx, CONTRIBUTING.md does not exist (untouched — file is genuinely absent) |
| SC4 (Phase close) | All three suites green + BASELINE.md present | **PASS** | pytest 566 ≥ 561, vitest 293 ≥ 293, playwright 7 ≥ 7, BASELINE.md committed at eb65e1c |

## Net-Zero Dependency Change (Phase-Wide Confirmation)

`git log HEAD~10..HEAD -- backend/uv.lock frontend/pnpm-lock.yaml frontend/package.json backend/pyproject.toml` returns **0 commits** — Phase 18 (commits `4247f56` through `eb65e1c`) introduced no new runtime or dev dependencies. POLI-06/POLI-07/POLI-08 were all delivered by source-only refactors and test-only additions.

## Task Commits

1. **Task 1: BASELINE.md write + commit** — `eb65e1c` (`docs(18-05): record green-CI baseline for v1.2 downstream phases`)
2. **Task 2: phase-close SC verification** — verification-only, no commit (no source artifacts produced)

**Plan metadata:** (pending — final docs commit follows this SUMMARY)

## Files Created/Modified

- `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` (new, 101 lines) — Frontmatter (12 numeric facts) + 7 sections: pytest, vitest, e2e, lint, cross-cutting, resume rules, sources. Each suite section embeds an explicit verifier rule subsection.
- `.planning/phases/18-polish-carry-forward-cleanup/18-05-SUMMARY.md` (this file).

No source-component files modified. No test files modified. No dependency lockfiles modified.

## Decisions Made

1. **BASELINE.md lives in the phase directory, not at `.planning/` root.** Per CONTEXT D-Verifier-baseline. A future "Phase 24 Polish v2" or similar would write its own baseline in *its* phase directory rather than mutating this one. The `.planning/phases/{phase}/BASELINE.md` path makes the artifact locally discoverable next to the work that produced it and avoids cross-phase mutation conflicts.

2. **Warning-delta is a load-bearing baseline metric, not just a curiosity.** RESEARCH Open-Question 2 recommended including warning counts as a regression guard. The verifier rule for `total_warnings > 132` (baseline 32 + 100-warning headroom) is the early-warning signal; the verifier rule for `warnings_datetime_utcnow > 0` is a hard fail (regression of POLI-06).

3. **Dev-DB inspection script re-written to use the async engine pattern.** The plan body's inline script (`next(get_session())`) referenced an outdated import — `get_session` in this codebase is a FastAPI dependency (`Request`-injected, async generator). Replaced with the lifespan-style pattern: `load_settings() → create_engine_for_settings() → make_sessionmaker()`. The script also uses `cmc.core.time.now_utc` instead of `datetime.utcnow` so even ad-hoc one-shot scripts respect the POLI-06 ban — structural enforcement, not just "shipped-code" enforcement.

4. **Verifier rules embedded as prose-with-bounds inside BASELINE.md, not spread across STATE.md or RUNBOOK.md.** Single source of truth: a downstream verifier reads one file and gets both the baseline counts AND the comparison thresholds.

5. **Skipped spec documented by full path.** Recorded as `alerts.spec.ts > TEST-05a: /alerts lifecycle — create rule → fire → ack` so future verifiers can pinpoint the steady-state skip without ambiguity if other specs eventually skip too.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Dev-DB inspection script rewritten to use async engine + lifespan pattern**

- **Found during:** Task 1 Step 2 (capturing dev-DB context)
- **Issue:** Plan body's inline script template (`from cmc.db.engine import get_session ... sess = next(get_session())`) failed with `ImportError: cannot import name 'get_session' from 'cmc.db.engine'`. The codebase's `get_session` lives in `cmc.db.session` (re-exported via `cmc.db.__init__`) and is a FastAPI dependency (`Request`-injected `AsyncIterator[AsyncSession]`) — it cannot be invoked synchronously via `next()`.
- **Fix:** Rewrote the inline one-shot script to use the lifespan-style pattern: `from cmc.config.settings import load_settings; from cmc.db import create_engine_for_settings, make_sessionmaker` then `asyncio.run` an async coroutine that awaits `sess.execute(...)`. Kept the `from cmc.core.time import now_utc` import per the plan's "even ad-hoc" structural-POLI-06 mandate.
- **Files modified:** None (one-shot inline script, not committed).
- **Verification:** Script ran cleanly, output `failed_tasks_total=1` and `failed_tasks_recent_5min=0` — both recorded in BASELINE.md frontmatter and dev-DB context section.
- **Commit:** N/A (one-shot inspection script).

### Out-of-Scope Discoveries

None. The phase is closing in a known-good steady state with all 4 ROADMAP success criteria green.

---

**Total deviations:** 1 auto-fixed (Rule 3 — Blocking; the plan-body script template was outdated relative to the live codebase API)
**Impact on plan:** Cosmetic — Step 2's data was captured correctly using a re-derived script. No SUMMARY content shifted; the recorded numbers (1 / 0) match what the spec needed for the alerts.spec.ts skip context. Future plans authoring inline DB-inspection scripts should reference `cmc.db.__init__` exports + `load_settings()` rather than the obsolete `next(get_session())` form.

## Issues Encountered

- **Pytest output truncation under `tee | tail -5`:** First `tee | tail -5` invocation cut the log mid-warning-summary, hiding the `566 passed, 32 warnings in 174.29s` summary line. Re-ran with `> /tmp/phase18-baseline-pytest.log` redirect (no tee), then `tail -20` of the file showed the full summary. Documented for future plans: prefer `command > log; tail -N log` over `command | tee log | tail -N` when the trailing summary is the load-bearing data.

## User Setup Required

None — pure documentation artifact, no external services, no env changes.

## Next Phase Readiness

- **Phase 18 is fully closed.** All 5 plans (18-01 through 18-05) have on-disk SUMMARYs.
- **BASELINE.md is the canonical reference for v1.2 phases (19–23) verifiers.** Each downstream phase's verifier should read this file at phase-close time and apply the embedded per-suite verifier rules.
- **Phase 19 entry conditions are all green:** zero datetime.utcnow call sites, deterministic SchedulesCard test, strict-mode-clean Playwright, locked feature-component-element testid convention, net-zero dependency change.
- **Recommended for Phase 19+:** Treat BASELINE.md as read-only. If a future phase needs to refresh the baseline (e.g., after a major test-suite expansion), write a new BASELINE.md in *that* phase's directory and mark this one historical via STATE.md handoff note.

## Verifier Notes

- The `alerts.spec.ts` steady-state 1-skip baseline is documented in both `frontend/tests/e2e/README.md` (Plan 18-04) and `BASELINE.md` (this plan). Verifier comparisons should focus on **failed counts**, not skip counts, unless `skipped >= 2`.
- The `total_warnings` rule has 100-warning headroom (`32 + 100 = 132`) — phases that legitimately add new test warnings (e.g., new aiosqlite-style stdlib deprecations) won't trigger a false positive. The hard-fail is on `warnings_datetime_utcnow > 0`.
- `pyproject.toml` was NOT touched in Phase 18, so the ruff config (no DTZ activation) remains intentional per Plan 18-02's Open-Question-3 deferral.

## Self-Check: PASSED

- [x] `BASELINE.md` exists at `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` (verified `test -f`)
- [x] BASELINE.md grep gates: `backend_pytest_passed=1`, `frontend_vitest_passed=1`, `frontend_playwright_passed=1`, `datetime.utcnow=4`, `Verifier rule=3` — all >=1 (Verifier rule >=3)
- [x] Commit `eb65e1c` exists (`git log --oneline | grep eb65e1c`)
- [x] No deletions in `eb65e1c` (`git diff --diff-filter=D HEAD~1 HEAD` empty)
- [x] Pre-Phase-18 → Post-Phase-18 datetime.utcnow deprecation lines: ~1429 → 0
- [x] All 4 ROADMAP success criteria green (SC1/SC2/SC3/SC4)
- [x] Net-zero Phase-18 dependency change (`git log HEAD~10..HEAD -- <lockfiles>` = 0 commits)
- [x] BASELINE.md is the single authoritative reference for v1.2-phase regressions

---
*Phase: 18-polish-carry-forward-cleanup*
*Completed: 2026-05-05*
