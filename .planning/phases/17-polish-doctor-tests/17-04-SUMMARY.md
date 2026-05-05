---
phase: 17-polish-doctor-tests
plan: 04
subsystem: testing
tags: [playwright, e2e, sessions-compare, command-palette, picker, kpi-strip]

# Dependency graph
requires:
  - phase: 16-session-comparison
    provides: SessionsTable per-row Compare button (aria-label='Compare session {id}'), CommandPalette context-aware Compare item + ComparePicker Sheet, /sessions/compare route with validateSearch UUID validator, SessionCompareView two-up KPI strip
  - phase: 17-polish-doctor-tests
    provides: Playwright webServer config that auto-boots backend (uvicorn) + frontend (vite preview) — established by Plan 17-03
provides:
  - "TEST-05b half: Playwright /sessions/compare picker → diff lifecycle e2e (row Compare button for A → URL ?a → Cmd+K context-aware Compare item → ComparePicker Sheet → click row for B → URL ?a&b → both KPI strips render) — under preflight skip when DB has <2 sessions"
affects: [17-06 traceability close-out, future TEST-05 hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Preflight-skip pattern for e2e tests requiring ≥N sessions in DB (deterministic dev-resilience — Pitfall 6 from research)"
    - "Range-matched preflight (GET /api/sessions?range=7d&limit=5 mirrors SessionsTable's default range='7d' so the preflight-fetched session_id is guaranteed to appear as a clickable row)"
    - "aria-label-based picker row selector (full UUID match) when visible text is truncated (ComparePicker renders only first 8 chars + ellipsis — text=${full_uuid} would never hit; aria-label='Compare with session {full_uuid}' is the stable selector)"
    - "KPI strip assertion via stable label text (A • Cost / B • Cost) instead of session_id text (the SessionCompareView body does NOT render UUIDs — sides are identified by 'A •' / 'B •' prefix only)"

key-files:
  created:
    - frontend/tests/e2e/sessions-compare.spec.ts
  modified: []

key-decisions:
  - "Selector strategy: aria-label-based getByRole('button', { name: 'Compare with session {full_uuid}' }) for picker row (NOT text=${full_uuid} as the verbatim spec proposed — visible text in ComparePicker is truncated to 8-char prefix + ellipsis per CommandPalette.tsx:248-250)"
  - "KPI assertion: page.getByText('A • Cost') + page.getByText('B • Cost') + getByRole('region', { name: /Side-by-side KPIs/i }) — stable side-prefix labels from SideKpiColumn helper are the most robust two-up render proof"
  - "Skip-when-<2-sessions: preserved as documented dev-resilience choice (Pitfall 6) — NO POST /api/sync preflight to seed sessions; the skip message points the developer at `cmc sync`"
  - "Range alignment: preflight uses range=7d (matching SessionsTable's default) — without this alignment, the API's 30d default could return a session_id outside the 7d window the table renders, causing the row Compare button to be missing from the DOM"

patterns-established:
  - "End-to-end picker→diff lifecycle test (row entry point + palette entry point exercised in sequence within ONE test, single user-flow narrative)"
  - "Visible-text vs. accessible-label selector triage: when component truncates user-facing text but preserves full identifier in aria-label, prefer the accessible label for tests"
  - "Stable side-prefix landmark assertion (A • / B • labels) for two-up panel render checks — decouples test from internal class names and from session_id text"

# Metrics
duration: 12min
completed: 2026-05-05
---

# Phase 17 Plan 04: TEST-05b Sessions Compare Picker→Diff e2e Summary

**Playwright e2e exercising both ComparePicker entry points (SessionsTable row button for side A + Cmd+K context-aware "Compare with…" item for side B) and asserting the two-up KPI strip render at /sessions/compare?a=&b=, skipping cleanly when the developer's DB has <2 sessions.**

## Performance

- **Duration:** ~12 min (3 selector iterations to align with actual DOM)
- **Started:** 2026-05-05T13:42:00Z
- **Completed:** 2026-05-05T13:54:21Z
- **Tasks:** 1 (single Playwright spec file authored)
- **Files modified:** 1 created, 0 modified
- **Test runtime:** 1.8s steady-state (clean run after webServer warmup); 4.7s on first run including server boot

## Accomplishments

- Authored `frontend/tests/e2e/sessions-compare.spec.ts` (113 LOC) covering the full picker→diff flow:
  1. GET `/api/sessions?range=7d&limit=5` preflight → skip if <2 sessions with actionable "run `cmc sync`" message.
  2. Visit `/activity` → click SessionsTable row Compare button → assert URL `/sessions/compare?a={A}`.
  3. Press Cmd+K → assert command palette opens (role='dialog' name='Mission Control command palette').
  4. Click context-aware "Compare with…" option → assert ComparePicker Sheet opens.
  5. Click row B in picker (aria-label match for full UUID) → assert URL `/sessions/compare?a={A}&b={B}`.
  6. Assert "Side-by-side KPIs" region visible + "A • Cost" + "B • Cost" labels visible (proves two-up render took the populated branch, not the idle Card-shell empty branch).
- Test passes against the developer's local DB (1.8s on second run, 4.7s including webServer cold start).
- Locked the route validateSearch UUID round-trip (Plan 16-02 contract) at e2e level.
- Locked the Cmd+K context-aware label switching (Plan 16-03 contract) at e2e level.
- Locked the ComparePicker self-compare guard implicitly (sessionA and sessionB are distinct preflight ids, so the disabled-row branch is never hit by this test).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author sessions-compare.spec.ts** — `166e235` (test)

**Plan metadata:** This SUMMARY.md + STATE.md update lands in a separate commit.

**Inter-agent race observed (procedural, no impact on deliverable):** During execution, a transient orphan commit `617905e` (now unreachable from any branch) briefly contained this plan's test file alongside Plan 17-05's README.md changes. That commit was rebased/dropped by another agent before this executor staged its own commit, so the test file fell back to untracked status in the working tree. This executor then re-staged and committed the file in isolation (`166e235`). The file content is byte-identical to what was briefly in `617905e` (verified via `git show`). See Deviations §5 for the full story.

## Files Created/Modified

- `frontend/tests/e2e/sessions-compare.spec.ts` (NEW, 113 lines) — Playwright e2e for /sessions/compare picker→diff flow.
- `.planning/phases/17-polish-doctor-tests/deferred-items.md` (NEW, scope-boundary log) — captures schedule-composer.spec.ts pre-existing strict-mode failure + uncommitted README.md anomaly observed during full-suite verification.

## Decisions Made

1. **Selector strategy: aria-label over visible text for picker row.** The verbatim spec in PLAN.md used `page.locator('[role="dialog"]').locator('text=${sessionB}')` for the picker row click. Inspection of `frontend/src/components/ui/CommandPalette.tsx:247-250` shows the visible row text is `${row.session_id.slice(0, 8)}…` (truncated to 8 chars + ellipsis). A full-UUID text match would never hit. The picker row IS a `<button>` with `aria-label="Compare with session {row.session_id}"` (CommandPalette.tsx:245), so `getByRole('button', { name: 'Compare with session ${full_uuid}' })` is the clean stable selector. Plan brief explicitly anticipated this: "If the spec fails on first run due to selector mismatch, prefer adjusting the test selector to match observed DOM rather than modifying production code."

2. **Two-up KPI assertion via side-prefix labels, not session_id text.** The verbatim spec used `page.getByText(sessionA, { exact: false })` / `page.getByText(sessionB, ...)` to assert two-up render. The actual SessionCompareView body does NOT render the session UUIDs anywhere visible — sides are identified purely by the `A •` / `B •` prefix (panel uses SideKpiColumn helper that emits "A • Cost", "B • Cost", etc.). Replaced with three assertions: (a) `getByRole('region', { name: /Side-by-side KPIs/i })` is visible (proves the populated render branch took, not the idle Card-shell branch), (b) `getByText('A • Cost')` visible, (c) `getByText('B • Cost')` visible. This is more robust than the original session_id text match would have been.

3. **Range alignment between preflight and SessionsTable default.** The verbatim spec used `GET /api/sessions?limit=5` (no range param), and the API defaults to `range=30d`. SessionsTable mounts with `range='7d'` (panels/SessionsTable.tsx:57). A session_id that's in the 30d window but outside the 7d window would NOT render as a clickable row, causing the test to fail with "Compare session button not visible". Adjusted preflight to `?range=7d&limit=5` so the chosen sessionA is guaranteed to be in the table.

4. **Route correction: /activity not /sessions.** The verbatim spec used `await page.goto('/sessions')` but no top-level `/sessions` route exists in v1.1 — only the dynamic-segment `/sessions/$session_id/details` (sheet) and `/sessions/compare` (deep-link target). SessionsTable is mounted at `/activity` (routes/activity.tsx:48). Adjusted the test's first navigation to `/activity`. The plan's `/sessions/compare` target URL is unchanged — that's the deep-link the row Compare button navigates to and is correct.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wrong navigation target — verbatim spec used /sessions but route does not exist**

- **Found during:** Task 1 — first test run failed at line 45 (`expect(rowCompareA).toBeVisible()` timeout).
- **Issue:** The verbatim spec in PLAN.md (lines 130-131) instructed `await page.goto('/sessions')` and expected the SessionsTable to be visible there. Page snapshot from the failed run showed the route returns "Not Found" — there is no `/sessions` top-level route in v1.1. SessionsTable is mounted at `/activity` (verified at routes/activity.tsx:48).
- **Fix:** Changed `page.goto('/sessions')` → `page.goto('/activity')` in the test. Also added a comment line explaining the choice.
- **Files modified:** frontend/tests/e2e/sessions-compare.spec.ts
- **Verification:** Re-ran spec; row Compare button found and clicked successfully; URL transitioned to /sessions/compare?a={A} as expected.
- **Committed in:** 166e235

**2. [Rule 3 - Blocking] Picker row selector — visible text is truncated, full UUID lives only in aria-label**

- **Found during:** Task 1 — pre-emptively caught at write-time via reading CommandPalette.tsx (avoided a third test-run iteration).
- **Issue:** Verbatim spec used `page.locator('[role="dialog"]').locator('text=${sessionB}').first()`. ComparePicker row visible text is `${row.session_id.slice(0, 8)}…` (CommandPalette.tsx:247-250) — full-UUID text match would never hit. The plan's notes explicitly mentioned the row is a `<button>` (line 209: "DO NOT click the Sheet's row by aria-label / button — the Sheet's row affordance per Plan 16-03 uses click-on-row, not click-on-button.") but inspection of the actual implementation showed it IS a button with an aria-label carrying the full UUID — the plan note is slightly out of sync with the implemented code, and the implemented code is correct (the wrapping `<li>` is non-interactive; the inner `<button>` is the affordance).
- **Fix:** Used `getByRole('button', { name: 'Compare with session ${sessionB}' })` against the page (the picker is the only place this aria-label exists, so no scoping needed).
- **Files modified:** frontend/tests/e2e/sessions-compare.spec.ts
- **Verification:** Picker row located and clicked; URL transitioned to ?a=&b= as expected.
- **Committed in:** 166e235

**3. [Rule 3 - Blocking] KPI assertion — verbatim spec used session_id text but SessionCompareView body does not render UUIDs**

- **Found during:** Task 1 — second test run failed at line 103 (`expect(sessionAReferences.first()).toBeVisible()` timeout).
- **Issue:** Verbatim spec used `page.getByText(sessionA, { exact: false })` / `page.getByText(sessionB, ...)` for two-up assertion. Page snapshot from the failed run showed the SessionCompareView body identifies sides ONLY by "A •" / "B •" prefix labels (SideKpiColumn helper emits "A • Cost", "A • Duration", "B • Cost", etc.). The session UUIDs themselves are NOT rendered anywhere visible in the panel body — they live only in the URL bar (which is not in the DOM scope of getByText).
- **Fix:** Replaced UUID-text assertions with three stable-label assertions: (a) `getByRole('region', { name: /Side-by-side KPIs/i })` visible (named landmark from SessionCompareView's KPI region), (b) `getByText('A • Cost')` visible, (c) `getByText('B • Cost')` visible.
- **Files modified:** frontend/tests/e2e/sessions-compare.spec.ts
- **Verification:** Re-ran spec — all three assertions pass; full test passes in 1.8s.
- **Committed in:** 166e235

**4. [Rule 3 - Blocking] Range mismatch between preflight and SessionsTable default**

- **Found during:** Task 1 — caught pre-emptively while diagnosing deviation #1 (avoided a separate test-run iteration).
- **Issue:** Verbatim spec used `GET /api/sessions?limit=5` (API defaults `range=30d`). SessionsTable defaults `range='7d'` (panels/SessionsTable.tsx:57). A session in the 30d window but outside 7d would not appear as a clickable row, causing flaky failures depending on the developer's session distribution.
- **Fix:** Aligned preflight to `?range=7d&limit=5`. Updated skip message accordingly.
- **Files modified:** frontend/tests/e2e/sessions-compare.spec.ts
- **Verification:** Test runs deterministically against any DB with ≥2 sessions in the last 7 days.
- **Committed in:** 166e235

### Inter-agent race (procedural, not auto-fixed)

**5. [Rule 3 - Procedural] Inter-agent race — test file briefly captured in parallel agent's commit, then dropped by rebase, recovered as untracked**

- **Found during:** Final commit step — `git diff --cached --stat` initially showed README.md (not this plan's deliverable) staged alongside the test file, and `git log -1 -- frontend/tests/e2e/sessions-compare.spec.ts` revealed the file had been included in commit `617905e` from a parallel Plan 17-05 agent (titled "docs(17-05): add v1.1 panels, pricing, and OTEL spike sections to README").
- **Investigation:** A few minutes later, `git log --oneline` no longer showed `617905e`. The Plan 17-05 agent had rebased or replaced the commit (the new commit `6e96649` carried only README.md, NOT the test file). `git rev-parse 617905e` still resolved to the orphan SHA but `git branch --contains 617905e` returned empty — the commit had been orphaned by the rebase. The test file therefore fell back to untracked status in the working tree.
- **Issue:** A parallel agent executing Plan 17-05 originally staged its README.md changes via `git add -A` (or equivalent broad-stage), which also picked up this executor's just-written `sessions-compare.spec.ts` as an untracked file. The agent then noticed the mistake and rebased to drop the test file from its commit, leaving `sessions-compare.spec.ts` back in untracked state.
- **Fix:** This executor re-staged the test file in isolation (`git add frontend/tests/e2e/sessions-compare.spec.ts`) and committed it atomically as `166e235` (`test(17-04): add TEST-05b sessions-compare picker→diff e2e`). The file content is byte-identical to what was briefly in the orphan `617905e` (verified via `git show 617905e:frontend/tests/e2e/sessions-compare.spec.ts | diff -` → IDENTICAL).
- **Files modified:** None (only re-staging; the file content is unchanged).
- **Verification:** `git log --oneline -1 -- frontend/tests/e2e/sessions-compare.spec.ts` now resolves to `166e235`, the atomic test commit.
- **Mitigation for future plans:** Parallel-agent waves should stage files individually (`git add path/to/file`) rather than broad-stage (`git add -A` or `git add .`) to avoid sweeping up other agents' just-written untracked files. This rule is already in the executor's `<task_commit_protocol>` step 2 — Plan 17-05's agent appears to have learned the lesson mid-execution (the rebase that dropped the test file is the corrective action). Recommend the verifier note this in the Phase 17 close-out as a procedural observation, not a blocker.

---

**Total deviations:** 5 — 4 selector/route auto-fixes (all Rule 3 — blocking) + 1 procedural inter-agent race (resolved by re-staging the test file and committing atomically as `166e235`).

**Impact on plan:** All four selector/route auto-fixes were necessary to make the test runnable against the actual codebase — the verbatim spec was authored against a hypothetical DOM that didn't quite match the implementation. The plan brief explicitly anticipated this ("If the spec fails on first run due to selector mismatch, prefer adjusting the test selector"), and the deviations stayed strictly inside the test file (no production code modified). The inter-agent race resolved cleanly: the parallel agent rebased to drop my test file from their commit, this executor re-staged and committed atomically. Final state has one clean atomic commit per the original plan.

## Issues Encountered

- **schedule-composer.spec.ts pre-existing strict-mode violation** — Discovered while running the full e2e suite to confirm no regressions. The `getByLabel('Name')` locator now matches both the OTEL filter input ("Filter skill name") and the schedule composer's Name input on /activity, causing strict-mode failure. Verified pre-existing on clean main via `git stash` checkpoint. Logged to `.planning/phases/17-polish-doctor-tests/deferred-items.md` per Rule 3 scope boundary; out-of-scope for Plan 17-04. Recommended fix (form-scoped selector) documented in deferred-items.md.
- **Uncommitted README.md anomaly observed at executor entry** — `git status` at startup showed README.md modified but unstaged; this turned out to be the in-flight Plan 17-05 work that was committed mid-execution by a parallel agent (see Deviation §5). Logged for transparency.

## Next Phase Readiness

- TEST-05a (Plan 17-03 — alerts firing→ack lifecycle) and TEST-05b (this plan — sessions compare picker→diff) both green; **TEST-05 is fully covered at the e2e layer**.
- REQUIREMENTS.md status flip for TEST-05 is **deferred to Plan 17-06** per the wave-2 single-writer convention. Do NOT flip here.
- Plan 17-05 (README docs) already landed (commit 617905e — included this plan's test file as a side effect, see Deviation §5).
- Phase 17 wave 1 is now: 17-01 ✓, 17-02 ✓, 17-03 ✓, 17-04 ✓, 17-05 ✓ (all 5 wave-1 plans landed). Wave 2 is just 17-06 (REQUIREMENTS traceability close-out + verifier-ready).

---
*Phase: 17-polish-doctor-tests*
*Plan: 04*
*Completed: 2026-05-05*

## Self-Check: PASSED

- frontend/tests/e2e/sessions-compare.spec.ts → FOUND (113 LOC on disk + tracked in commit 166e235)
- .planning/phases/17-polish-doctor-tests/17-04-SUMMARY.md → FOUND (this file)
- .planning/phases/17-polish-doctor-tests/deferred-items.md → FOUND
- git commit 166e235 (test) → FOUND on main
- git commit 97ced92 (docs) → FOUND on main
- Test verification: `cd frontend && npm run test:e2e -- sessions-compare.spec.ts --reporter=list` → 1 passed in 1.8s
- STATE.md Plan 17-04 entry → FOUND (incorporated into shared history via 8614355)
- ROADMAP.md row for 17-04 → checked `[x]` (already in shared history via 8614355's docs commit)
- REQUIREMENTS.md not modified → confirmed (deferred to 17-06 per single-writer wave-2 convention)
