---
phase: 18-polish-carry-forward-cleanup
plan: 05
type: execute
wave: 3
depends_on: [18-02, 18-03, 18-04]
files_modified:
  - .planning/phases/18-polish-carry-forward-cleanup/BASELINE.md
autonomous: true
requirements: [POLI-06, POLI-07, POLI-08]
must_haves:
  truths:
    - "Backend pytest suite is green at phase close (>= 561 passed, 0 failed) — recorded as the v1.2 baseline pytest count."
    - "Frontend vitest suite is green at phase close (>= 293 passed, 0 failed) — recorded as the v1.2 baseline vitest count."
    - "Playwright e2e suite is green at phase close (>= 7 passed, 0 failed; 1 skip is the steady-state alerts.spec.ts carryover) — recorded as the v1.2 baseline e2e count."
    - "Pytest deprecation-warning count for datetime.utcnow is 0 (down from ~1429 pre-Phase-18) — recorded for Phase 19+ to track regressions."
    - "BASELINE.md exists in the phase directory with all four counts and the dev-DB context that produced them, so Phase 19+ verifiers have a stable reference point."
  artifacts:
    - path: ".planning/phases/18-polish-carry-forward-cleanup/BASELINE.md"
      provides: "Recorded pass/skip/fail counts + warning count + run timestamp + dev-DB context for downstream verifier comparison"
      contains: "pytest"
      contains_also: "vitest"
      contains_more: "playwright"
      contains_warning: "datetime.utcnow"
  key_links:
    - from: "BASELINE.md"
      to: "Phase 19–23 verifier prompts"
      via: "Documented contract: 'phase X verifier compares pytest/vitest/playwright pass counts against BASELINE.md baseline; failure count must be 0 to pass; skip count tolerates +0 vs baseline (1 alerts.spec.ts skip is the steady state)'"
      pattern: "phase 19.*BASELINE"
---

<objective>
Record the post-Phase-18 green-CI baseline pass counts (backend pytest, frontend vitest, Playwright e2e) plus the deprecation-warning delta into a `BASELINE.md` artifact in the phase directory, so downstream Phase 19–23 verifiers have a stable reference point to compare against.

Purpose: ROADMAP success criterion 4 locks this artifact ("verifier records baseline pass counts for downstream phases to compare against"). CONTEXT D-Verifier-baseline grants Claude's discretion on the exact recording mechanism — `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` is chosen because it lives next to the phase that produced it, is greppable from any future verifier prompt, and follows the pattern of phase artifacts living in their phase directory. Open-Question 2 in RESEARCH recommends including warning counts as a regression guard — this plan implements that recommendation since pytest's `~1429 → 0` deprecation drop is the load-bearing reverse-direction signal that POLI-06 actually completed.

Output:
- `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` (NEW) — structured markdown with frontmatter + sections covering pytest, vitest, Playwright, warning counts, and the dev-DB context that produced the e2e numbers (so the alerts.spec.ts skip-count steady-state is documented).
</objective>

<execution_context>
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/18-polish-carry-forward-cleanup/18-CONTEXT.md
@.planning/phases/18-polish-carry-forward-cleanup/18-RESEARCH.md
@.planning/phases/18-polish-carry-forward-cleanup/18-02-SUMMARY.md
@.planning/phases/18-polish-carry-forward-cleanup/18-03-SUMMARY.md
@.planning/phases/18-polish-carry-forward-cleanup/18-04-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run all three suites in clean order, capture counts, write BASELINE.md</name>
  <files>.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md</files>
  <action>
    Per ROADMAP SC4 and CONTEXT D-Verifier-baseline:

    1. Run the three suites in order (sequential — no parallelism, this is a measurement task and the e2e run starts a backend that competes with pytest):

       a. Backend pytest:
          ```bash
          cd backend && uv run pytest -q --tb=no 2>&amp;1 | tee /tmp/phase18-baseline-pytest.log | tail -5
          ```
          Capture: passed count, failed count, warning count, total runtime.
          Also capture: `grep -c 'datetime\.datetime\.utcnow' /tmp/phase18-baseline-pytest.log` (should be 0 post-Plan-02; non-zero is a phase-blocker).

       b. Frontend vitest:
          ```bash
          cd frontend && pnpm exec vitest run --reporter=verbose 2>&amp;1 | tee /tmp/phase18-baseline-vitest.log | tail -5
          ```
          Capture: passed count, failed count, total runtime, test-file count.

       c. Playwright e2e:
          ```bash
          cd frontend && npx playwright test --reporter=line 2>&amp;1 | tee /tmp/phase18-baseline-playwright.log | tail -5
          ```
          Capture: passed count, skipped count, failed count, total runtime.

       d. Optional (D-Aggressive-cleanup signal): full-repo `ruff check`:
          ```bash
          cd backend && uv run ruff check 2>&amp;1 | tail -1
          ```
          Capture: clean / N findings.

    2. Capture dev-DB context for the e2e baseline (Pitfall 6 documentation):
       ```bash
       cd backend && uv run python -c "from cmc.db.engine import get_session; from cmc.db.models.tasks import Task; from sqlmodel import select; from datetime import datetime, timedelta; \
       sess = next(get_session()); \
       cutoff = datetime.utcnow() - timedelta(minutes=5); \  # NOTE: this script uses datetime.utcnow ONLY for the baseline-measurement code which is throwaway — does not regress the sweep
       failed = sess.exec(select(Task).where(Task.status == 'failed').where(Task.ended_at != None)).all(); \
       print(f'failed_tasks_total={len(failed)}'); \
       recent = [t for t in failed if t.ended_at and t.ended_at > cutoff]; \
       print(f'failed_tasks_recent_5min={len(recent)}')"
       ```
       NOTE: the inline measurement script above uses `datetime.utcnow()` for convenience but it is THROWAWAY code that runs once during measurement, NOT committed to the codebase. If you prefer to keep things consistent, replace with `from cmc.core.time import now_utc` per Plan 02. The repo verify-gate checks committed source files, not ad-hoc measurement scripts.

    3. Write `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` with this structure:

       ```markdown
       ---
       phase: 18-polish-carry-forward-cleanup
       baseline_recorded_at: "2026-05-05T<HH:MM>:00Z"
       backend_pytest_passed: <N>
       backend_pytest_failed: 0
       backend_pytest_warnings_total: <N>
       backend_pytest_warnings_datetime_utcnow: 0
       frontend_vitest_passed: <N>
       frontend_vitest_failed: 0
       frontend_playwright_passed: <N>
       frontend_playwright_skipped: 1
       frontend_playwright_failed: 0
       devdb_failed_tasks_recent_5min: <N from step 2>
       ---

       # Phase 18 Green-CI Baseline

       This is the reference baseline for v1.2 phases (19–23). Verifiers in those
       phases compare their post-completion test counts against the numbers below.

       ## Backend (`pytest`)

       - Passed: <N> (recorded 2026-05-05; runtime ~3min)
       - Failed: 0
       - Total warnings: <N> (down from ~1429 pre-Phase-18)
       - `datetime.utcnow` deprecation warnings: **0** (POLI-06 verify gate; see Plan 02)
       - Command: `cd backend && uv run pytest -q --tb=no`

       ### Verifier rule (Phase 19+)
       - `passed >= <N>` → pass
       - `failed > 0` → fail
       - `warnings_datetime_utcnow > 0` → fail (regression of POLI-06)
       - `total_warnings > <N> + 100` → warn (investigate; not a blocker)

       ## Frontend (`vitest`)

       - Passed: <N> (recorded 2026-05-05; runtime ~7s)
       - Failed: 0
       - Test files: 65
       - Command: `cd frontend && pnpm exec vitest run`

       ### Verifier rule (Phase 19+)
       - `passed >= <N>` → pass
       - `failed > 0` → fail

       ## E2E (`playwright test`)

       - Passed: <N>
       - Skipped: 1 (`alerts.spec.ts > shows recent firing event` — Pitfall 6, dev-DB-state-dependent)
       - Failed: 0
       - Command: `cd frontend && npx playwright test`

       ### Dev-DB context for this baseline
       - `failed_tasks_total`: <N>
       - `failed_tasks_recent_5min`: <N> (drives the alerts.spec.ts skip; expect 1 skip when this is 0)

       ### Verifier rule (Phase 19+)
       - `failed > 0` → fail
       - `passed >= <N> - skipped_delta` → pass (skip count tolerates +0 vs this baseline; if a NEW skip appears, the verifier flags it for human review)
       - `skipped == 1 AND alerts.spec.ts is the only skipped spec` → pass (steady-state)
       - `skipped == 0 AND failed == 0` → pass (better-than-baseline; alerts.spec.ts un-skipped because dev DB now has a recent failed task)
       - `skipped >= 2` → flag for human review (new collision or new flake)

       ## Lint (`ruff`)

       - Project-default `ruff check`: <clean / N findings>
       - `ruff check --select UP`: clean (POLI-06 GATE 1)
       - `git grep -nE 'datetime\.utcnow'` across `backend/`: 0 matches (POLI-06 GATE 2)

       ## Cross-cutting signals

       - Pytest `datetime.utcnow` deprecation-warning delta: ~1429 → 0 (target hit; the load-bearing reverse-direction signal that POLI-06's mechanical sweep landed completely)
       - Net dependency change for Phase 18: 0 (`uv lock`, `pnpm-lock.yaml`, `package.json` all unchanged)

       ## Resume rules for Phase 19+

       Each downstream verifier should:
       1. Read this BASELINE.md.
       2. Re-run the three suites at phase close.
       3. Compare counts using the per-section verifier rules above.
       4. If new flakes/skips/failures surface that ARE caused by the new phase's code, fix in-phase per the `--gaps` workflow.
       5. If new flakes surface that are NOT caused by the new phase's code (truly pre-existing), append to STATE.md pending todos AND elevate to the next "polish" phase budget.

       ## Sources

       - `/tmp/phase18-baseline-pytest.log` (pytest run output)
       - `/tmp/phase18-baseline-vitest.log` (vitest run output)
       - `/tmp/phase18-baseline-playwright.log` (playwright run output)
       - Plan summaries: 18-01-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md, 18-04-SUMMARY.md
       ```

    4. Substitute the `<N>` placeholders with actual numbers from the captured runs.

    5. Sanity-check the recorded counts match the SUMMARYs from Plans 02/03/04 — if any plan's SUMMARY claims a different number, investigate (likely a rerun discrepancy or a flake; the BASELINE numbers are the load-bearing source of truth).
  </action>
  <verify>
    <automated>test -f .planning/phases/18-polish-carry-forward-cleanup/BASELINE.md &amp;&amp; grep -c 'backend_pytest_passed' .planning/phases/18-polish-carry-forward-cleanup/BASELINE.md | tr -d ' ' &amp;&amp; grep -c 'frontend_vitest_passed' .planning/phases/18-polish-carry-forward-cleanup/BASELINE.md | tr -d ' ' &amp;&amp; grep -c 'frontend_playwright_passed' .planning/phases/18-polish-carry-forward-cleanup/BASELINE.md | tr -d ' ' &amp;&amp; grep -c 'datetime.utcnow' .planning/phases/18-polish-carry-forward-cleanup/BASELINE.md | tr -d ' ' &amp;&amp; grep -c 'Verifier rule' .planning/phases/18-polish-carry-forward-cleanup/BASELINE.md | tr -d ' '</automated>
    <expected>BASELINE.md exists with all 4 frontmatter keys (pytest_passed, vitest_passed, playwright_passed, warnings_datetime_utcnow) and >=3 "Verifier rule" sections. Each grep returns >=1.</expected>
  </verify>
  <done>
    - `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` exists.
    - Frontmatter contains all four count fields (pytest, vitest, playwright, datetime_utcnow_warnings).
    - Each section has a "Verifier rule" subsection that downstream phases can reference.
    - Pitfall-6 dev-DB context is captured so the alerts.spec.ts skip-count steady state is documented.
    - Numbers match (within ±1 jitter) the counts recorded in Plan 02/03/04 SUMMARYs.
  </done>
</task>

<task type="auto">
  <name>Task 2: Append BASELINE.md handoff note to STATE.md and confirm phase-close gates</name>
  <files>(none committed by this task — STATE.md is updated by the orchestrator at phase close, this task verifies all gates are green)</files>
  <action>
    Final phase-close verification. This task does NOT modify code or planning docs; it confirms that every ROADMAP success criterion is provable AT THIS MOMENT, before the orchestrator marks Phase 18 complete.

    Run each gate and confirm GREEN:

    1. ROADMAP SC1 (POLI-06): two-gate verify
       ```bash
       cd backend && uv run ruff check --select UP                      # GATE 1
       git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- backend/  # GATE 2 (expect 0 hits)
       ```

    2. ROADMAP SC2 (POLI-07): mechanism + dual-TZ verification
       ```bash
       grep -c 'vi\.spyOn(Date' frontend/src/components/panels/__tests__/SchedulesCard.test.tsx
       grep -c 'vi\.useFakeTimers' frontend/src/components/panels/__tests__/SchedulesCard.test.tsx  # expect 0
       cd frontend && TZ=UTC pnpm exec vitest run src/components/panels/__tests__/SchedulesCard.test.tsx
       cd frontend && TZ=America/New_York pnpm exec vitest run src/components/panels/__tests__/SchedulesCard.test.tsx
       ```

    3. ROADMAP SC3 (POLI-08): strict-mode + documented convention
       ```bash
       cd frontend && npx playwright test --reporter=line 2>&amp;1 | tail -3
       grep -q 'feature-component-element' frontend/tests/e2e/README.md &amp;&amp; echo 'README documents convention'
       grep -q 'data-testid="schedule-composer-name"' frontend/src/components/panels/ScheduleComposer.tsx &amp;&amp; echo 'source component carries testid'
       grep -c 'data-testid' CONTRIBUTING.md 2>/dev/null || echo 'CONTRIBUTING.md untouched (locked redirect to e2e README — confirmed)'
       ```

    4. ROADMAP SC4 (Backend + frontend + e2e all green at phase close, baseline recorded)
       ```bash
       cd backend && uv run pytest -q --tb=no 2>&amp;1 | tail -3
       cd frontend && pnpm exec vitest run 2>&amp;1 | tail -3
       cd frontend && npx playwright test --reporter=line 2>&amp;1 | tail -3
       test -f .planning/phases/18-polish-carry-forward-cleanup/BASELINE.md &amp;&amp; echo 'BASELINE.md present'
       ```

    5. Net-zero dependency change confirmation:
       ```bash
       git diff --stat backend/uv.lock frontend/pnpm-lock.yaml frontend/package.json backend/pyproject.toml | tail -5
       ```
       Expected: empty (no edits to lock files or manifests).

    If ANY gate fails:
    - SC1 fail → return to Plan 02 (sweep incomplete).
    - SC2 fail → return to Plan 03 (vitest determinism).
    - SC3 fail → return to Plan 04 (e2e strict-mode).
    - SC4 fail → identify which suite, route to the corresponding plan; if a NEW flake (caused by Phase 18 itself) surfaces, fix in-phase as a separate commit per D-Aggressive-cleanup. If pre-existing, append to STATE.md and proceed (the baseline records the as-is state).

    No code changes in this task — verification only.
  </action>
  <verify>
    <automated>cd backend &amp;&amp; uv run ruff check --select UP 2>&amp;1 | tail -1 &amp;&amp; git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- backend/ | wc -l | tr -d ' ' &amp;&amp; cd backend &amp;&amp; uv run pytest -q --tb=no 2>&amp;1 | tail -3 &amp;&amp; cd frontend &amp;&amp; pnpm exec vitest run 2>&amp;1 | tail -3 &amp;&amp; cd frontend &amp;&amp; npx playwright test --reporter=line 2>&amp;1 | tail -3 &amp;&amp; test -f .planning/phases/18-polish-carry-forward-cleanup/BASELINE.md &amp;&amp; echo 'phase 18 close gates: GREEN'</automated>
    <expected>ruff: `All checks passed!`. git grep: `0`. pytest: `>=561 passed, 0 failed`. vitest: `>=293 passed, 0 failed`. playwright: `>=7 passed, 1 skipped, 0 failed` (or 8 passed if alerts un-skipped). BASELINE.md present. Final echo: `phase 18 close gates: GREEN`.</expected>
  </verify>
  <done>
    - All 4 ROADMAP success criteria have at least one passing automated check.
    - BASELINE.md is committed.
    - Net-zero dependency change confirmed.
    - Phase 18 is ready for orchestrator phase-close commit.
  </done>
</task>

</tasks>

<verification>
Phase 18 close gates (ALL must pass before STATE.md advance):

```bash
# SC1 — POLI-06 dual gate
cd backend && uv run ruff check --select UP                      # All checks passed!
git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- backend/   # (no output)

# SC2 — POLI-07 mechanism + dual-TZ
grep -c 'vi\.spyOn(Date' frontend/src/components/panels/__tests__/SchedulesCard.test.tsx  # >=1
grep -c 'vi\.useFakeTimers' frontend/src/components/panels/__tests__/SchedulesCard.test.tsx  # 0
cd frontend && TZ=UTC pnpm exec vitest run | tail -3              # 0 failed
cd frontend && TZ=America/New_York pnpm exec vitest run | tail -3 # 0 failed

# SC3 — POLI-08 strict-mode + documented convention
cd frontend && npx playwright test --reporter=line | tail -3      # 0 failed
test -f frontend/tests/e2e/README.md
grep -q 'feature-component-element' frontend/tests/e2e/README.md
grep -q 'data-testid="schedule-composer-name"' frontend/src/components/panels/ScheduleComposer.tsx

# SC4 — All three suites green + baseline recorded
cd backend && uv run pytest -q --tb=no | tail -3                  # >=561 passed, 0 failed
cd frontend && pnpm exec vitest run | tail -3                     # >=293 passed, 0 failed
cd frontend && npx playwright test --reporter=line | tail -3      # 0 failed; 1 skip steady-state
test -f .planning/phases/18-polish-carry-forward-cleanup/BASELINE.md
```
</verification>

<success_criteria>
1. `BASELINE.md` exists in the phase directory with frontmatter capturing pytest/vitest/playwright pass counts, fail counts (= 0), skip counts, deprecation-warning delta, and dev-DB context.
2. Each suite section in BASELINE.md has a "Verifier rule" subsection that Phase 19+ verifiers can reference for pass/fail/warn determination.
3. All 4 ROADMAP success criteria are provable via the verification commands above — every gate green.
4. Net-zero dependency change for Phase 18: `uv.lock`, `pnpm-lock.yaml`, `package.json`, `pyproject.toml` all unchanged.
5. STATE.md handoff note for Phase 19: BASELINE.md is the canonical reference for v1.2-phase test-count regressions.
</success_criteria>

<output>
After completion, create `.planning/phases/18-polish-carry-forward-cleanup/18-05-SUMMARY.md` documenting:
- Final pytest/vitest/playwright counts at phase close.
- The deprecation-warning delta (1429 → 0) as the load-bearing reverse-direction signal.
- The dev-DB context that produced the e2e baseline (especially the alerts.spec.ts steady-state skip).
- Confirmation that BASELINE.md is the single authoritative reference for Phase 19+ verifier comparisons.
- Confirmation that all 4 ROADMAP success criteria are green.
- Net-zero dependency-change confirmation.
</output>
