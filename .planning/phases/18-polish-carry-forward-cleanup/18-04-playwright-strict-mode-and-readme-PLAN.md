---
phase: 18-polish-carry-forward-cleanup
plan: 04
type: execute
wave: 2
depends_on: []
files_modified:
  - frontend/src/components/panels/ScheduleComposer.tsx
  - frontend/tests/e2e/schedule-composer.spec.ts
  - frontend/tests/e2e/README.md
autonomous: true
requirements: [POLI-08]
must_haves:
  truths:
    - "schedule-composer.spec.ts passes Playwright strict-mode without selector ambiguity (currently fails on getByLabel('Name') collision with SkillTimeline's aria-label='Filter skill name')."
    - "data-testid convention 'feature-component-element' (kebab-case) is documented in frontend/tests/e2e/README.md."
    - "data-testid attributes live on the source React component (ScheduleComposer.tsx), NOT on test-only wrappers."
    - "Full Playwright suite passes strict-mode with no NEW skips introduced (alerts.spec.ts steady-state 1 skip carryover from Pitfall 6 is preserved, not regressed)."
  artifacts:
    - path: "frontend/tests/e2e/README.md"
      provides: "data-testid convention documentation: feature-component-element kebab-case path-style, plus selector hierarchy and where attributes live"
      contains: "feature-component-element"
      contains_also: "data-testid"
    - path: "frontend/src/components/panels/ScheduleComposer.tsx"
      provides: "Source-component data-testid attributes for inputs that collide under Playwright strict mode"
      contains: "data-testid=\"schedule-composer-"
    - path: "frontend/tests/e2e/schedule-composer.spec.ts"
      provides: "Strict-mode-clean Playwright spec using getByTestId for the previously-colliding Name field (and Advanced cron field if it also collides under strict mode)"
      contains: "getByTestId('schedule-composer-"
  key_links:
    - from: "frontend/tests/e2e/schedule-composer.spec.ts"
      to: "frontend/src/components/panels/ScheduleComposer.tsx"
      via: "page.getByTestId('schedule-composer-name') resolves to the data-testid attribute on the source <input>"
      pattern: "getByTestId\\('schedule-composer-name'\\)"
    - from: "frontend/tests/e2e/README.md"
      to: "data-testid usage in specs"
      via: "Documented hierarchy: getByRole > getByLabel > getByText > getByTestId (fallback)"
      pattern: "getByTestId.*fallback"
---

<objective>
Eliminate the Playwright strict-mode collision in `schedule-composer.spec.ts:54` (`getByLabel('Name')` matches both ScheduleComposer's `<span>Name</span>` AND SkillTimeline's `aria-label="Filter skill name"`), establish the locked `feature-component-element` `data-testid` naming convention, document it in `frontend/tests/e2e/README.md`, and run the full Playwright suite in strict mode to surface and fix every other collision found in-phase.

Purpose: ROADMAP success criterion 3 locks two outputs — the e2e specs must pass strict-mode AND the convention must be documented in the e2e README (CONTEXT explicitly redirects this away from CONTRIBUTING.md). RESEARCH grounds-truths the actual collision count: ONE active collision today (`schedule-composer.spec.ts:54`), with `alerts.spec.ts`'s firehose-filter latent risk being a possibility that surfaces only when a future `/skills` test runs against a string containing "Name". The aggressive-cleanup-scope discipline (D-Cleanup-discipline, D-Playwright-selectors) extends this to "sweep all e2e specs in strict mode" — fix every ambiguity surfaced by running the full suite, not just the named one.

Output:
- `frontend/tests/e2e/README.md` (NEW) — documents the selector hierarchy, the `feature-component-element` `data-testid` convention with examples, and the rule that attributes live on source components.
- `frontend/src/components/panels/ScheduleComposer.tsx` — UPDATED to add `data-testid="schedule-composer-name"` on the Name `<input>`. Add additional `data-testid` attrs for any other field that surfaces a strict-mode collision when the full suite runs (Claude's discretion on which fields).
- `frontend/tests/e2e/schedule-composer.spec.ts` — UPDATED to use `page.getByTestId('schedule-composer-name')` instead of `page.getByLabel('Name')`. Other selectors (`getByRole('button', { name: 'Create schedule' })`, `getByRole('button', { name: '+ New' })`) stay as-is per Playwright's "testid is fallback only" guidance; only convert collisions.
- Any other e2e spec in `frontend/tests/e2e/*.spec.ts` that surfaces a strict-mode collision when the full suite runs gets fixed inline (D-Cleanup-discipline). Each such fix is a separate commit per chunked-cleanup convention.
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

# Files this plan modifies (read before editing)
@frontend/src/components/panels/ScheduleComposer.tsx
@frontend/tests/e2e/schedule-composer.spec.ts

<interfaces>
<!-- Confirmed strict-mode collision (verified at HEAD `ac63767` with `npx playwright test`): -->

```typescript
// frontend/tests/e2e/schedule-composer.spec.ts:54 — CURRENT (FAILS strict mode):
await page.getByLabel('Name').fill(name)
// Matches BOTH:
//   1. frontend/src/components/panels/ScheduleComposer.tsx:182 — <span>Name</span> wrapping <input>
//   2. frontend/src/components/panels/SkillTimeline.tsx:74 — <input aria-label="Filter skill name">
// Playwright getByLabel matches aria-label substrings → both elements qualify → strict-mode failure.
```

```tsx
// frontend/src/components/panels/ScheduleComposer.tsx:182 — CURRENT (target for data-testid):
<label className="cmc-composer__field">
  <span>Name</span>
  <input
    type="text"
    className="cmc-input"
    value={draft.name}
    onChange={(e) => update('name', e.target.value)}
    maxLength={120}
    required
    disabled={m.isPending}
  />
</label>
// ADD: data-testid="schedule-composer-name" to the <input>. Convention locked: feature-component-element kebab-case.
```

<!-- Other potentially-colliding fields in ScheduleComposer.tsx — Claude's discretion which to decorate. -->
<!-- Examples that MAY surface as collisions when the full suite runs strict-mode: -->
<!--   - Line ~228: <span>Advanced cron</span> wrapping the cron <input> -->
<!--   - The "Create schedule" submit button — likely safe (getByRole('button', {name:'…'}) is exact-match) -->
<!-- Only add data-testid where strict mode actually collides; do NOT pre-emptively decorate (Anti-pattern §"testid everywhere"). -->

<!-- Convention LOCKED by D-data-testid-convention: -->
<!--   format: feature-component-element (kebab-case path-style) -->
<!--   examples: schedule-composer-name, schedule-composer-cron, schedule-composer-submit, -->
<!--             alerts-firehose-skill-filter, skills-detail-projects-table -->
<!--   location: source React components, NOT test-only wrappers -->
<!--   docs: frontend/tests/e2e/README.md (NOT CONTRIBUTING.md) -->

<!-- alerts.spec.ts: 1 skip is steady-state for this dev DB (Pitfall 6 — alerts dispatcher needs recent failed task). -->
<!-- DO NOT modify alerts.spec.ts unless the full suite reveals a NEW strict-mode collision in it. -->
<!-- The CONTEXT mention of "alerts.spec.ts firehose Filter skill name" is LATENT, not active today. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create frontend/tests/e2e/README.md with the locked data-testid convention</name>
  <files>frontend/tests/e2e/README.md</files>
  <action>
    Per ROADMAP SC3 (LOCKED — convention documented in CONTRIBUTING.md OR e2e README; CONTEXT redirects to e2e README) and D-data-testid-convention:

    Create `frontend/tests/e2e/README.md` (NEW file) with these sections:

    1. **Header / Purpose** — these specs run against `vite preview` (production build) plus the live FastAPI backend (per `playwright.config.ts`'s `webServer` block); they exercise real cross-component flows that vitest's component tests cannot cover.

    2. **Selector hierarchy (Playwright official guidance)** — prefer in order:
       1. `page.getByRole(...)` — accessible to assistive tech; **default**.
       2. `page.getByLabel(...)` — form fields with `<label>` or `aria-label`. **Watch out for aria-label substring matches under strict mode (Pitfall 4).**
       3. `page.getByText(...)` — non-interactive text content.
       4. `page.getByTestId(...)` — **fallback** when role/label collide under strict mode.

    3. **When to add `data-testid`** — only when strict-mode locator ambiguity surfaces (multiple elements match the user-facing locator). Do NOT preemptively decorate components — Playwright's official guidance is that test IDs are a fallback, not a primary strategy.

    4. **`data-testid` naming convention** — format: `feature-component-element` (kebab-case, path-style). Examples (verbatim from CONTEXT D-data-testid-convention):
       - `schedule-composer-name` (input field on the schedule composer)
       - `schedule-composer-submit` (submit button on the schedule composer)
       - `alerts-firehose-skill-filter` (skill-name filter on the alerts firehose panel)
       - `skills-detail-projects-table` (projects table on the skill detail page)
       Predictable for grep, scoped by feature, collision-resistant across pages that share elements.

    5. **Where the attribute lives** — `data-testid` lives on the source React component (e.g., `frontend/src/components/panels/ScheduleComposer.tsx`), NOT on a test-only wrapper. Specs reference it via `page.getByTestId('…')`.

    6. **Running the suite** — paste the working commands (`pnpm run test:e2e`, `pnpm run test:e2e:ui`, `npx playwright test schedule-composer`); call out the backend on `http://127.0.0.1:8765` and frontend preview on `http://127.0.0.1:4173` (per `playwright.config.ts`'s `webServer` config with `reuseExistingServer=true`).

    7. **Known steady-state skips** — explicitly call out `alerts.spec.ts` (TEST-05a) which skips when the dev DB has no recently-failed task (Pitfall 6). State that "1 skipped" is the steady-state baseline for this spec on most dev databases; verifier compares failed counts only, not skip counts.

    Use the skeleton from RESEARCH §"POLI-08 — frontend/tests/e2e/README.md skeleton" as the starting point. Tighten or expand as needed; the load-bearing content is sections 4 (naming convention with examples) and 5 (where the attribute lives).

    Per CONTEXT D-Documentation-location: do NOT touch `CONTRIBUTING.md` (or any top-level docs file) for this convention — it lives next to the tooling that enforces it.
  </action>
  <verify>
    <automated>test -f frontend/tests/e2e/README.md &amp;&amp; grep -q 'feature-component-element' frontend/tests/e2e/README.md &amp;&amp; grep -q 'data-testid' frontend/tests/e2e/README.md &amp;&amp; grep -q 'schedule-composer-name' frontend/tests/e2e/README.md &amp;&amp; grep -q 'getByTestId' frontend/tests/e2e/README.md &amp;&amp; echo 'README OK'</automated>
    <expected>`README OK` — file exists with all key tokens.</expected>
  </verify>
  <done>
    - `frontend/tests/e2e/README.md` exists with all 7 sections from the action.
    - Convention `feature-component-element` (kebab-case) is documented with at least 4 examples.
    - The "where the attribute lives" rule is stated explicitly.
    - The Pitfall-6 steady-state skip is documented so verifier doesn't regress on it.
    - No edits to `CONTRIBUTING.md` (CONTEXT lock).
  </done>
</task>

<task type="auto">
  <name>Task 2: Add data-testid to ScheduleComposer.tsx + update schedule-composer.spec.ts to use getByTestId for the colliding selector</name>
  <files>frontend/src/components/panels/ScheduleComposer.tsx, frontend/tests/e2e/schedule-composer.spec.ts</files>
  <action>
    Per D-data-testid-convention and Pitfall 4:

    1. Edit `frontend/src/components/panels/ScheduleComposer.tsx`:
       - At line ~182, the Name `<input>` inside `<label className="cmc-composer__field"><span>Name</span><input ... /></label>` — ADD `data-testid="schedule-composer-name"` to the `<input>` props.
       - Optionally (Claude's discretion) add `data-testid="schedule-composer-submit"` to the "Create schedule" submit `<button>` if a strict-mode collision appears in the full Playwright run for it. Skip if no collision — pre-emptive decoration is an anti-pattern (RESEARCH §Anti-Patterns).
       - Optionally add `data-testid="schedule-composer-cron"` to the cron `<input>` (line ~228 region) IF and only if a strict-mode run shows `getByLabel('Advanced cron')` collides. Verify by running the full suite first; do not pre-decorate.

    2. Edit `frontend/tests/e2e/schedule-composer.spec.ts`:
       - At line ~54, replace `await page.getByLabel('Name').fill(name)` with `await page.getByTestId('schedule-composer-name').fill(name)`.
       - At line ~57 / ~60, the `getByLabel('Advanced cron')` selectors — RUN THE FULL SUITE FIRST in strict mode to see if these also collide. If yes, replace them with `getByTestId('schedule-composer-cron')` (and add the corresponding attr to the source component in Task 2.1). If no, leave them as-is per Playwright's "testid is fallback" rule.
       - The `getByRole('button', { name: '+ New' })` and `getByRole('button', { name: 'Create schedule' })` selectors should remain as-is unless they collide — exact role+name matches are the preferred locator.

    3. Per D-Playwright-selectors (sweep all e2e specs):
       - Run `cd frontend &amp;&amp; npx playwright test 2>&amp;1 | tee /tmp/phase18-plan04-playwright.log` after the schedule-composer fix.
       - For each strict-mode failure or "strict mode violation" message in the output, identify the source component, add a `data-testid` per the locked convention, update the spec to `getByTestId(...)`. Each fix lands as its own commit per D-Cleanup-discipline (chunked diffs).
       - Pitfall 6 reminder: `alerts.spec.ts` may show 1 skip (TEST-05a) — that is steady-state, not a regression. Do NOT add new skips when fixing collisions.

    4. Per Pitfall 4: when in doubt between `getByRole('textbox', { name: 'Name' })` (role-narrowed) and `getByTestId('schedule-composer-name')` (testid), the CONTEXT-locked answer is testid — apply consistently.

    5. Per D-No-feature-behavior-changes: only `data-testid` attributes are added to source components. Do NOT change component logic, props, classNames, or any user-visible behavior.
  </action>
  <verify>
    <automated>cd frontend &amp;&amp; npx playwright test schedule-composer 2>&amp;1 | tail -10 &amp;&amp; grep -c 'data-testid="schedule-composer-name"' frontend/src/components/panels/ScheduleComposer.tsx | tr -d ' ' &amp;&amp; grep -c "getByTestId('schedule-composer-name')" frontend/tests/e2e/schedule-composer.spec.ts | tr -d ' '</automated>
    <expected>`schedule-composer.spec.ts` reports 1 passed (was failing before). Source-component grep: `1` (data-testid present). Spec grep: `>=1` (getByTestId used).</expected>
  </verify>
  <done>
    - `schedule-composer.spec.ts` passes Playwright strict-mode (was failing on the `getByLabel('Name')` collision).
    - `data-testid="schedule-composer-name"` is on the source `<input>` in `ScheduleComposer.tsx` (NOT on a test-only wrapper).
    - The spec uses `page.getByTestId('schedule-composer-name')` for the formerly-colliding selector.
    - Other selectors in the spec remain unchanged unless strict mode flagged them.
    - Any other e2e spec collisions surfaced by the full suite run are fixed with the same pattern (each as its own commit per cleanup-discipline).
  </done>
</task>

<task type="auto">
  <name>Task 3: Run full Playwright suite in strict mode + confirm no new skips, no remaining collisions</name>
  <files>(none — verification-only task)</files>
  <action>
    Final non-regression gate before this plan hands off to Plan 05's baseline recording.

    1. `cd frontend &amp;&amp; npx playwright test --reporter=line 2>&amp;1 | tee /tmp/phase18-plan04-final.log` — full e2e suite.
       - Pre-fix baseline (RESEARCH A3): 8 tests, 6 passed, 1 skipped (alerts.spec.ts), 1 failed (schedule-composer strict-mode).
       - Post-fix expected: 8 tests, 7 passed, 1 skipped (alerts steady-state), 0 failed.
       - If the suite shows a NEW skip (was 1, now 2+), investigate — Pitfall 6 says `alerts.spec.ts` skip is the only steady-state skip on this dev DB.

    2. Run the suite with `--workers=1` once to confirm strict-mode determinism doesn't depend on parallelism:
       `cd frontend &amp;&amp; npx playwright test --workers=1 --reporter=line 2>&amp;1 | tail -5`

    3. Search the run log for any "strict mode violation" message:
       `grep -i 'strict mode violation\|matches.*resolved to' /tmp/phase18-plan04-final.log | head -5`
       Expected: empty. If any match appears, return to Task 2 and fix that collision.

    4. Confirm the README is reachable from the spec dir:
       `ls -la frontend/tests/e2e/README.md`

    5. Confirm net-zero dependency change for this plan (D-No-new-deps):
       `git diff frontend/package.json frontend/pnpm-lock.yaml | wc -l`
       Expected: 0 (no edits).

    Per D-Aggressive-cleanup, if any other strict-mode flake or selector ambiguity surfaces during the full-suite run, fix it inline as a separate commit. If a fix would touch feature behavior (e.g., changing a component's role or visible text), defer to STATE.md instead.
  </action>
  <verify>
    <automated>cd frontend &amp;&amp; npx playwright test --reporter=line 2>&amp;1 | tee /tmp/phase18-plan04-final.log | tail -5 &amp;&amp; grep -ic 'strict mode violation' /tmp/phase18-plan04-final.log | tr -d ' ' &amp;&amp; ls -la frontend/tests/e2e/README.md &amp;&amp; git diff --name-only frontend/package.json frontend/pnpm-lock.yaml | wc -l | tr -d ' '</automated>
    <expected>Playwright: `7 passed, 1 skipped` (or `8 passed` if Pitfall-6 alerts skip resolves due to dev DB state — both acceptable). Strict-mode-violation grep: `0`. README is listable. Dependency-diff: `0`.</expected>
  </verify>
  <done>
    - Full Playwright suite passes strict mode: 0 failed, 0 NEW skips (alerts.spec.ts steady-state 1 skip preserved).
    - No "strict mode violation" messages in the test log.
    - `frontend/tests/e2e/README.md` exists.
    - `frontend/package.json` and `frontend/pnpm-lock.yaml` are unchanged (no new deps).
    - SUMMARY records: list of components decorated with `data-testid`, list of spec files updated, post-fix Playwright pass/skip/fail counts, any deferred cleanup items elevated to STATE.md.
  </done>
</task>

</tasks>

<verification>
Plan-level POLI-08 success-criterion checks:

```bash
# Convention documentation exists in the locked location (e2e README, NOT CONTRIBUTING.md)
test -f frontend/tests/e2e/README.md
grep -q 'feature-component-element' frontend/tests/e2e/README.md
grep -q 'data-testid' frontend/tests/e2e/README.md

# Source components carry the data-testid (locked: source, not test wrapper)
grep -q 'data-testid="schedule-composer-name"' frontend/src/components/panels/ScheduleComposer.tsx

# Strict-mode-clean Playwright suite
cd frontend && npx playwright test --reporter=line | tail -3
# Expected: 7+ passed, 1 skipped (alerts), 0 failed

# No collisions remain in the run log
grep -i 'strict mode violation' /tmp/phase18-plan04-final.log  # expected: empty

# Net-zero dependency change
git diff --stat frontend/package.json frontend/pnpm-lock.yaml  # expected: empty
```
</verification>

<success_criteria>
1. POLI-08 strict-mode lock: `schedule-composer.spec.ts` passes Playwright strict-mode (currently fails on `getByLabel('Name')` collision); the full suite reports 0 strict-mode-violation messages.
2. POLI-08 documentation lock: `frontend/tests/e2e/README.md` exists, documents `feature-component-element` kebab-case naming, names the "source component, not test wrapper" rule, and lists at least 4 example testids matching the format.
3. `data-testid="schedule-composer-name"` is present on the source `<input>` in `ScheduleComposer.tsx` (not on a test wrapper, not in the spec file).
4. CONTRIBUTING.md is NOT modified (CONTEXT-locked redirect to e2e README).
5. Full Playwright suite green at >=7 passed (was 6); skip count stays at exactly 1 (alerts.spec.ts steady-state per Pitfall 6 — no NEW skips introduced).
6. Zero net-new dependencies: `frontend/package.json` and `frontend/pnpm-lock.yaml` are unchanged.
7. No source component logic, props, or visible behavior is changed — only `data-testid` attributes are added.
</success_criteria>

<output>
After completion, create `.planning/phases/18-polish-carry-forward-cleanup/18-04-SUMMARY.md` documenting:
- Pre-fix vs post-fix Playwright counts (target: 6 pass / 1 skip / 1 fail → 7 pass / 1 skip / 0 fail; or 8 pass / 0 skip / 0 fail if dev DB has a recent failed task and alerts.spec.ts un-skips).
- The list of source components that received `data-testid` attributes (file:line + testid string).
- The list of e2e spec files updated with `getByTestId` (file:line — should be just `schedule-composer.spec.ts:54` unless full-suite strict-mode surfaced more).
- Confirmation that `CONTRIBUTING.md` was NOT modified.
- Any deferred cleanup items elevated to STATE.md (e.g., a future `/skills` test that would re-trigger the latent firehose collision).
</output>
