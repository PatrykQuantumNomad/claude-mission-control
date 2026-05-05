---
phase: 18-polish-carry-forward-cleanup
plan: 03
type: execute
wave: 2
depends_on: []
files_modified:
  - frontend/src/components/panels/__tests__/SchedulesCard.test.tsx
autonomous: true
requirements: [POLI-07]
must_haves:
  truths:
    - "SchedulesCard.test.tsx > stale row passes deterministically under TZ=UTC at simulated 23:55."
    - "SchedulesCard.test.tsx > stale row passes deterministically under TZ=America/New_York at simulated 23:55."
    - "The fresh-row fixture (id:1) computes as fresh (NO cmc-schedules-row--stale class) regardless of wall-clock date — fixture rot from 2026-04-27T15:00:00Z hard-code is fixed."
    - "Date.now is mocked via vi.spyOn(Date, 'now') (NOT vi.useFakeTimers) — direct verification of the locked POLI-07 mechanism."
    - "Frontend vitest suite remains green at the same baseline (293 tests, 0 failed) — adjacent vitest specs are NOT regressed."
  artifacts:
    - path: "frontend/src/components/panels/__tests__/SchedulesCard.test.tsx"
      provides: "Deterministic stale-row test using vi.spyOn(Date, 'now') + NOW_MS-relative fixture timestamps"
      contains: "vi.spyOn(Date, 'now').mockReturnValue"
      contains_also: "NOW_MS - 5 * 60_000"
  key_links:
    - from: "frontend/src/components/panels/__tests__/SchedulesCard.test.tsx"
      to: "Date.now()"
      via: "vi.spyOn(Date, 'now').mockReturnValue(NOW_MS) in beforeEach + mockRestore() in afterEach"
      pattern: "vi\\.spyOn\\(Date, 'now'\\)"
    - from: "fresh-row fixture (id:1)"
      to: "mocked Date.now()"
      via: "last_run_at: new Date(NOW_MS - 5 * 60_000).toISOString() — relative timestamp instead of hard-coded 2026-04-27T15:00:00Z"
      pattern: "NOW_MS - 5 \\* 60_000"
---

<objective>
Fix the time-of-day flake in `SchedulesCard.test.tsx > stale row` so it runs deterministically across all clock conditions, AND simultaneously fix the bit-rotted `id:1` fresh-row fixture that has been silently making the test fail today (2026-05-05) regardless of clock mocking.

Purpose: ROADMAP success criterion 2 locks the FIX MECHANISM (`vi.spyOn(Date, 'now')` — NOT `vi.useFakeTimers`) and the VERIFICATION CONDITION (TZ=UTC AND TZ=America/New_York at simulated 23:55 boundary). RESEARCH Pitfall 1 reveals a SECOND bug — the populated fixture's id:1 row hard-codes `last_run_at: '2026-04-27T15:00:00Z'`, which is now ~8 days old, so even with `Date.now` mocked the fresh row computes as stale unless the fixture also moves to a relative timestamp. Both fixes are required; mocking the clock alone is necessary but not sufficient.

Output:
- `SchedulesCard.test.tsx` rewritten to use `vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)` in `beforeEach` and `mockRestore()` in `afterEach`.
- `makeSchedule()` default `last_run_at: '2026-04-27T15:00:00Z'` either removed or rewritten to be NOW_MS-relative; the populated fixture's id:1 row uses `last_run_at: new Date(NOW_MS - 5 * 60_000).toISOString()`.
- `id:2` (already-stale fixture) preserved as `last_run_at: new Date(NOW_MS - 72 * 3600 * 1000).toISOString()` — already correct in the existing test, just ensure the NOW_MS reference is consistent.
- The test passes under BOTH `TZ=UTC` and `TZ=America/New_York` when NOW_MS is set to a 23:55 boundary instant (e.g., `2026-05-05T23:55:00Z`).
</objective>

<execution_context>
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/18-polish-carry-forward-cleanup/18-CONTEXT.md
@.planning/phases/18-polish-carry-forward-cleanup/18-RESEARCH.md

# File this plan modifies (read before editing)
@frontend/src/components/panels/__tests__/SchedulesCard.test.tsx

<interfaces>
<!-- Existing test file shape (verified at HEAD `ac63767`): -->

```typescript
// frontend/src/components/panels/__tests__/SchedulesCard.test.tsx (CURRENT — failing today)

function makeSchedule(overrides: Partial<ScheduleListItem> = {}): ScheduleListItem {
  return {
    // … other fields …
    last_run_at: '2026-04-27T15:00:00Z',  // ← Pitfall 1: hard-coded; bit-rotted today
    ...overrides,
  }
}

const populated: ScheduleListResponse = {
  items: [
    makeSchedule({ id: 1, name: 'every-5-min', cron: '*/5 * * * *', enabled: true }),  // INHERITS bit-rotted last_run_at
    makeSchedule({
      // … id: 2 (stale) …
      last_run_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),  // ← uses unfaked Date.now
    }),
  ],
  total: 2,
}

// no vi.spyOn(Date, 'now') anywhere → both rows compete for "stale" classification against wall clock.
```

<!-- Two specs that DO use useFakeTimers but MUST NOT be migrated (Pitfall 3): -->
<!--   frontend/src/components/RelativeTime.test.tsx — uses vi.setSystemTime() for fixed-clock test (no flake risk). -->
<!--   frontend/src/components/EmergencyStopBanner.test.tsx — uses vi.useFakeTimers({shouldAdvanceTime:false}) -->
<!--     for a load-bearing 5000ms re-disarm timer advancement. spyOn(Date) cannot replace advanceTimersByTime(). -->
<!-- DO NOT touch either of those two files. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rewrite SchedulesCard.test.tsx with vi.spyOn(Date, 'now') and NOW_MS-relative fixtures</name>
  <files>frontend/src/components/panels/__tests__/SchedulesCard.test.tsx</files>
  <behavior>
    The test file MUST satisfy these assertions after the rewrite:
    - `vi.spyOn(Date, 'now')` appears in the file (literal token); `vi.useFakeTimers` does NOT appear (POLI-07 mechanism lock).
    - A `NOW_MS` constant is defined as a fixed UTC instant (Claude's discretion on exact value; recommended `new Date('2026-05-05T23:55:00Z').getTime()` to land squarely on the locked TZ-boundary verification).
    - `beforeEach` calls `vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)`; `afterEach` calls the spy's `.mockRestore()`.
    - The `populated` fixture's `id:1` row uses `last_run_at: new Date(NOW_MS - 5 * 60_000).toISOString()` (5 minutes ago — well within the 48h fresh window).
    - The `populated` fixture's `id:2` row uses `last_run_at: new Date(NOW_MS - 72 * 3600 * 1000).toISOString()` (72 hours ago — past the 48h stale threshold).
    - The `makeSchedule()` default for `last_run_at` is either REMOVED (callers must pass it explicitly) OR replaced with a NOW_MS-relative expression. Removing the default is preferable (forces test authors to think about freshness explicitly), but Claude's discretion if removal cascades.
    - Existing `it('stale row (last_run_at > 48h ago) gets cmc-schedules-row--stale class', ...)` test passes:
      - The id:1 (fresh) row's `<tr>` does NOT have the `cmc-schedules-row--stale` className.
      - The id:2 (stale) row's `<tr>` DOES have the `cmc-schedules-row--stale` className.
    - All other existing tests in the file (~10 other `it(...)` blocks per existing structure) continue to pass — the `Date.now` mock must not interfere with their assertions. If any of them rely on a wall-clock side effect, scope the `beforeEach`/`afterEach` mock setup to a focused `describe` block instead of the file-level `beforeEach`.
  </behavior>
  <action>
    Per ROADMAP success criterion 2 (LOCKED) and CONTEXT D-POLI-07-implementation-notes:

    1. Add a `NOW_MS` constant near the top of the test file:
       ```typescript
       const NOW_MS = new Date('2026-05-05T23:55:00Z').getTime()
       ```
       The 23:55 UTC instant is chosen deliberately to satisfy the locked dual-TZ verification condition (TZ=UTC and TZ=America/New_York both put this at a day-boundary-adjacent moment where naive local-day buckets would diverge from UTC ones).

    2. Add `vi.spyOn(Date, 'now')` setup. Decide between FILE-LEVEL or DESCRIBE-SCOPED:
       - File-level (simpler): in the existing top-level `beforeEach`, add `vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)`. Add a top-level `afterEach` calling `vi.restoreAllMocks()` (or store the spy and `.mockRestore()` it explicitly). This works if all ~10 tests in the file are compatible with a fixed `Date.now`.
       - Describe-scoped (safer): wrap only the `it('stale row ...', ...)` test in its own `describe('with mocked Date.now', () => { beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)); afterEach(() => vi.restoreAllMocks()); it(...) })` block.
       - Read the existing test file before deciding. If any other test asserts on a literal Date or relative-time render (e.g., "renders 'Just now'"), describe-scoped is the lower-risk path. Default: describe-scoped.

    3. Patch `makeSchedule()` and the `populated` fixture per <behavior>:
       - In `makeSchedule()` default: REMOVE the `last_run_at: '2026-04-27T15:00:00Z'` line. Callers now pass `last_run_at` explicitly. (Pitfall 1's root cause — the hard-coded default — is what bit-rots; removing it forces every fixture to be deliberate about freshness.)
       - In `populated.items[0]` (id:1, fresh): add `last_run_at: new Date(NOW_MS - 5 * 60_000).toISOString()`.
       - In `populated.items[1]` (id:2, stale): change `last_run_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString()` to `last_run_at: new Date(NOW_MS - 72 * 3600 * 1000).toISOString()` (Date.now() is now mocked, but using NOW_MS directly is more readable and avoids any spy-restoration ordering concern).
       - If any OTHER `makeSchedule({...})` call in the file inherited the now-removed default, give it an explicit `last_run_at`. Best discovered by running the test suite once after removing the default — failing tests will surface those callers.

    4. Per Pitfall 3, do NOT migrate `RelativeTime.test.tsx` or `EmergencyStopBanner.test.tsx` to `vi.spyOn(Date, 'now')`. Those specs are load-bearing for non-time-of-day reasons; their `useFakeTimers` usage is correct.

    5. Per D-POLI-07 (broader cleanup-sweep clause): audit other vitest specs for `useFakeTimers` patterns that exhibit time-of-day flake risk:
       ```bash
       cd frontend && grep -rln 'useFakeTimers\|setSystemTime\|Date\.now()' src/components --include='*.test.tsx' --include='*.test.ts'
       ```
       For each file found that is NOT `RelativeTime.test.tsx`, `EmergencyStopBanner.test.tsx`, or `SchedulesCard.test.tsx`: read the file, decide if it has time-of-day flake risk (test asserts on a result that depends on the wall clock without mocking it). If yes, migrate to `vi.spyOn(Date, 'now')` per the same pattern. If no (or unsure), leave it and note in SUMMARY for STATE.md elevation. Each adjacent migration is a SEPARATE commit per D-Cleanup-discipline (chunked diffs).

    Per D-No-feature-behavior-changes: the production component `SchedulesCard.tsx` MUST NOT be modified. This is a test-fixture refactor only.
  </action>
  <verify>
    <automated>cd frontend &amp;&amp; pnpm exec vitest run src/components/panels/__tests__/SchedulesCard.test.tsx --reporter=verbose 2>&amp;1 | tail -20 &amp;&amp; cd frontend &amp;&amp; TZ=UTC pnpm exec vitest run src/components/panels/__tests__/SchedulesCard.test.tsx 2>&amp;1 | tail -3 &amp;&amp; cd frontend &amp;&amp; TZ=America/New_York pnpm exec vitest run src/components/panels/__tests__/SchedulesCard.test.tsx 2>&amp;1 | tail -3 &amp;&amp; grep -c 'vi\.spyOn(Date' frontend/src/components/panels/__tests__/SchedulesCard.test.tsx | tr -d ' ' &amp;&amp; grep -c 'vi\.useFakeTimers' frontend/src/components/panels/__tests__/SchedulesCard.test.tsx | tr -d ' '</automated>
    <expected>All vitest runs report 0 failures for SchedulesCard.test.tsx (current baseline is 1 failure). Both TZ=UTC and TZ=America/New_York runs pass cleanly. `vi.spyOn(Date` count: >=1. `vi.useFakeTimers` count: 0.</expected>
  </verify>
  <done>
    - `SchedulesCard.test.tsx > stale row` passes under `TZ=UTC` AND `TZ=America/New_York` (locked verification).
    - `vi.spyOn(Date, 'now')` is the mocking mechanism (locked); `vi.useFakeTimers` does not appear in this file.
    - Bit-rotted `'2026-04-27T15:00:00Z'` hard-code is gone — fresh-row fixture uses `NOW_MS - 5 * 60_000`.
    - All other tests in the file continue to pass — the spy does not regress adjacent specs.
    - Production component `SchedulesCard.tsx` is not modified.
    - SUMMARY notes any other vitest specs migrated under the broader cleanup-sweep clause (or explicitly notes "no other migrations needed" if the audit found nothing).
  </done>
</task>

<task type="auto">
  <name>Task 2: Run full vitest suite to confirm non-regression + capture pass count</name>
  <files>(none — verification-only task)</files>
  <action>
    Final non-regression gate before this plan hands off to Plan 05's baseline recording.

    1. `cd frontend &amp;&amp; pnpm exec vitest run 2>&amp;1 | tee /tmp/phase18-plan03-vitest.log` — full vitest suite. Pre-fix baseline (RESEARCH A2): 65 files, 293 tests, 1 failed (the SchedulesCard stale-row case). Post-fix expected: 293 passed (or 293+ if any adjacent spec was migrated and grew assertion count), 0 failed.
    2. Re-run under both TZ environments to satisfy ROADMAP SC2's verification condition explicitly:
       - `cd frontend &amp;&amp; TZ=UTC pnpm exec vitest run --reporter=verbose 2>&amp;1 | tail -5`
       - `cd frontend &amp;&amp; TZ=America/New_York pnpm exec vitest run --reporter=verbose 2>&amp;1 | tail -5`
       Both must show 0 failed.
    3. Sanity-check that no production component was edited:
       - `git diff --name-only frontend/src/components` — only `__tests__/` paths should appear.

    Per D-Aggressive-cleanup, if the suite-wide run surfaces flakes in OTHER specs (non-time-of-day origin), fix them inline, each as its own commit. If the failure is non-trivial (touches feature behavior), append to SUMMARY for STATE.md elevation rather than fixing in this phase.

    Per Pitfall 6 carryover: if any e2e spec failure surfaces (alerts.spec.ts skip), that is Plan 04's domain, NOT this plan's. Do not touch e2e specs in Plan 03.
  </action>
  <verify>
    <automated>cd frontend &amp;&amp; pnpm exec vitest run 2>&amp;1 | tail -5 &amp;&amp; cd frontend &amp;&amp; TZ=UTC pnpm exec vitest run 2>&amp;1 | tail -3 &amp;&amp; cd frontend &amp;&amp; TZ=America/New_York pnpm exec vitest run 2>&amp;1 | tail -3 &amp;&amp; git diff --name-only frontend/src/components | grep -v '__tests__' | wc -l | tr -d ' '</automated>
    <expected>All three vitest runs report 0 failures and >=293 passed. The diff-name grep returns `0` (no production component edits).</expected>
  </verify>
  <done>
    - Full vitest suite green under default TZ, `TZ=UTC`, and `TZ=America/New_York`.
    - Pass count >= 293 (no regression vs pre-fix baseline of 292 pass / 1 fail).
    - No production component file was edited.
    - SUMMARY records: vitest pass count delta, list of any other spec files migrated under the cleanup-sweep clause, list of any flakes deferred to STATE.md.
  </done>
</task>

</tasks>

<verification>
Plan-level POLI-07 success-criterion checks:

```bash
# Locked-mechanism verification
grep -c 'vi\.spyOn(Date' frontend/src/components/panels/__tests__/SchedulesCard.test.tsx  # >=1
grep -c 'vi\.useFakeTimers' frontend/src/components/panels/__tests__/SchedulesCard.test.tsx  # 0

# Locked verification condition (ROADMAP SC2): TZ=UTC AND TZ=America/New_York at 23:55 boundary
cd frontend && TZ=UTC pnpm exec vitest run src/components/panels/__tests__/SchedulesCard.test.tsx
cd frontend && TZ=America/New_York pnpm exec vitest run src/components/panels/__tests__/SchedulesCard.test.tsx

# Non-regression
cd frontend && pnpm exec vitest run | tail -3
```
</verification>

<success_criteria>
1. POLI-07 mechanism lock satisfied: `SchedulesCard.test.tsx` uses `vi.spyOn(Date, 'now')`, NOT `vi.useFakeTimers`.
2. POLI-07 verification condition satisfied: `SchedulesCard.test.tsx > stale row` passes deterministically under both `TZ=UTC` and `TZ=America/New_York` when run at any wall-clock instant — including a simulated 23:55 boundary (achieved via `NOW_MS = new Date('2026-05-05T23:55:00Z').getTime()`).
3. Pitfall 1 (bit-rotted fresh-row fixture) is fixed: the `id:1` row uses a NOW_MS-relative timestamp; removing the bit-rotted hard-coded default keeps future test authors honest.
4. Vitest suite green at >=293 passed (up from 292 pass / 1 fail).
5. Production component `SchedulesCard.tsx` is NOT modified — fix is pure test-side.
6. `RelativeTime.test.tsx` and `EmergencyStopBanner.test.tsx` are NOT modified (Pitfall 3 — load-bearing useFakeTimers usage).
</success_criteria>

<output>
After completion, create `.planning/phases/18-polish-carry-forward-cleanup/18-03-SUMMARY.md` documenting:
- The chosen scope (file-level vs describe-scoped) for `vi.spyOn(Date, 'now')` and rationale.
- The chosen `NOW_MS` value (recommended `2026-05-05T23:55:00Z`).
- Vitest pass-count delta (pre: 292 pass / 1 fail → post: 293+ pass / 0 fail).
- Any other vitest specs migrated under the broader cleanup-sweep clause (with file paths + commit hashes if chunked).
- Confirmation that production code was NOT modified (`git diff --name-only frontend/src/components` shows only test files).
</output>
