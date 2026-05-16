---
phase: 24-shell-density-containment-primitives
plan: 07
type: execute
wave: 5
depends_on: [05, 06]
files_modified:
  - .planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md
  - .planning/phases/24-shell-density-containment-primitives/visual-check/
  - .lighthouseci/
autonomous: false

must_haves:
  truths:
    - "Playwright visual-capture spec produces 36 PNGs (6 routes x 3 densities x 2 themes) under .planning/phases/24-shell-density-containment-primitives/visual-check/"
    - "Playwright axe-core spec produces 30 runs (5 routes x 3 densities x 2 themes) with zero serious + zero critical violations"
    - "Lighthouse CI run on /, /activity, /skills (3 URLs x 3 numberOfRuns) produces .lighthouseci/manifest.json with all assertions passing — LCP<2500ms, CLS<0.1, INP<200ms"
    - "React DevTools profiler verification: clicking density toggle on /activity produces 0 React commits below DensityToggle (binary perf gate POLI-11)"
    - "ResponsiveContainer instance count (rg -c 'ResponsiveContainer' frontend/src/components/panels/) is unchanged from v1.2 baseline + plan-04-shipping count — Phase 24 must not add or remove any chart container"
    - "24-VISUAL-CHECK.md compiles all evidence: 36-row capture verdict table, axe results summary, Lighthouse CI verdict, React profiler screenshot reference, perf-budget pass/fail rollup, operator pass/fail verdict for the phase"
  artifacts:
    - path: ".planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md"
      provides: "POLI-09 phase-close gate: operator-driven visual + axe + Lighthouse + perf verdict"
      contains: "Verdict"
    - path: ".planning/phases/24-shell-density-containment-primitives/visual-check/*.png"
      provides: "36 captured screenshots — 6 routes x 3 densities x 2 themes"
      contains: ""
    - path: ".lighthouseci/manifest.json"
      provides: "Lighthouse CI output — 9 runs (3 URLs x 3 runs each), assertion results"
      contains: ""
  key_links:
    - from: ".planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md"
      to: ".planning/phases/24-shell-density-containment-primitives/visual-check/*.png"
      via: "Verdict table cross-references each PNG"
      pattern: "visual-check/.*\\.png"
    - from: ".planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md"
      to: ".lighthouseci/manifest.json"
      via: "Lighthouse CI section copies LCP/CLS/INP per URL"
      pattern: "lighthouseci"
    - from: ".planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md"
      to: "frontend/tests/e2e/v13-a11y.spec.ts (output)"
      via: "axe-core results pasted/summarized into VISUAL-CHECK.md"
      pattern: "axe-core"
---

<objective>
Run every quality-gate scaffold built in plans 05+06, capture the evidence, and write the Phase 24 close-gate verdict at `.planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md`.

This plan is **gate-only**. It produces no production code. Its three tasks execute the matrix runs (visual, axe, Lighthouse, React profiler), then a single human-verify checkpoint reviews the assembled evidence and pronounces phase pass/fail.

If any gate fails (axe blocking violation, Lighthouse threshold breach, density toggle triggers React commits, ResponsiveContainer count drift), the operator has three options:
1. **Fix in place** — invoke `/gsd-plan-phase 24 --gaps` to author a gap-closure plan, OR have the executor patch the offending code in this plan as a follow-up task before re-running the gate.
2. **Accept with documented exception** — add a `## Accepted Exceptions` section to `24-VISUAL-CHECK.md` explaining why the failure is tolerable and what unblocks closure (e.g., "axe-core flags a moderate contrast warning on `--cmc-text-subtle` body usage at Compact + light theme; not blocking — see Phase 24 RESEARCH Pitfall 7; Phase 24 holds the line on subtle-text-not-for-body").
3. **Roll back** — `git revert` the offending plan's commit and re-plan (this is the rollback path called out in research §"NavBar deletion timing").

The verdict in `24-VISUAL-CHECK.md` is the single artifact the verifier reads at phase close.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-shell-density-containment-primitives/24-CONTEXT.md
@.planning/phases/24-shell-density-containment-primitives/24-RESEARCH.md
@.planning/phases/24-shell-density-containment-primitives/24-01-SUMMARY.md
@.planning/phases/24-shell-density-containment-primitives/24-02-SUMMARY.md
@.planning/phases/24-shell-density-containment-primitives/24-03-SUMMARY.md
@.planning/phases/24-shell-density-containment-primitives/24-04-SUMMARY.md
@.planning/phases/24-shell-density-containment-primitives/24-05-SUMMARY.md
@.planning/phases/24-shell-density-containment-primitives/24-06-SUMMARY.md

@frontend/tests/e2e/v13-visual-capture.spec.ts
@frontend/tests/e2e/v13-a11y.spec.ts
@frontend/tests/e2e/v13-portal-containment.spec.ts
@frontend/tests/e2e/v13-sidebar.spec.ts
@frontend/tests/e2e/v13-density.spec.ts
@frontend/lighthouserc.json
@.planning/phases/24-shell-density-containment-primitives/24-TRANSFORM-AUDIT.md

<interfaces>
Test commands (verified by plan 05 + plan 06):
- `cd frontend && pnpm test:e2e -- tests/e2e/v13-visual-capture.spec.ts` — 36 captures
- `cd frontend && pnpm test:e2e -- tests/e2e/v13-a11y.spec.ts` — 30 axe runs
- `cd frontend && pnpm test:e2e -- tests/e2e/v13-portal-containment.spec.ts` — 3 portal probes
- `cd frontend && pnpm test:e2e -- tests/e2e/v13-sidebar.spec.ts` — 2 sidebar e2e
- `cd frontend && pnpm test:e2e -- tests/e2e/v13-density.spec.ts` — 2 density e2e
- `cd frontend && pnpm test:e2e -- tests/e2e/v13-truncation.spec.ts` — conditional (skips on clean data)
- `cd frontend && pnpm test:e2e -- tests/e2e/v13-copy-cell.spec.ts` — conditional (skips when no copyable cells)
- `cd frontend && pnpm build && npx lhci autorun --config=./lighthouserc.json` — Lighthouse 3 URLs x 3 runs
- `cd frontend && pnpm vitest run` — unit tests (~349)
- `cd backend && python -m pytest -q` — backend pytest (~661 + 2 from URL contract)
- React DevTools profiler — manual operator step

Phase 18 baseline (from STATE.md):
- Backend pytest: 661 / 0 / 0
- Frontend vitest: 326 / 0 / 0
- Playwright e2e: 13 specs (11 passing + 2 known skips)

Phase 24 expected counts:
- Backend pytest: 663 (+2 url-contract tests). 0 fails. 0-2 skips depending on test_url_contract behavior.
- Frontend vitest: ~349 (+~23 from plans 02, 03, 04). 0 fails.
- Playwright e2e: 13 + 7 new = 20 specs. New: visual-capture (36 tests), a11y (30 tests), portal (3 tests), sidebar (2 tests), density (2 tests), truncation (1 test, may skip), copy-cell (1 test, may skip).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run the full quality-gate matrix and capture all evidence</name>
  <files>.planning/phases/24-shell-density-containment-primitives/visual-check/, .lighthouseci/</files>
  <action>
Execute every quality-gate spec, capturing outputs to disk. Do NOT proceed to task 2 if any gate produces an unrecoverable failure (e.g., a TypeScript error in a spec file). Recoverable failures (axe violations, Lighthouse threshold breaches, missing PNGs from a flaky run) get recorded for operator review in task 3.

1. **Frontend type-check + unit tests** (sanity baseline):
   ```bash
   cd frontend && pnpm tsc --noEmit
   cd frontend && pnpm vitest run --reporter=dot
   ```
   Record pass count. Expected ~349. Any unit-test failure here is a code regression and must be fixed BEFORE the matrix — file a follow-up edit to the relevant earlier plan and re-run before continuing this plan.

2. **Backend pytest baseline:**
   ```bash
   cd backend && python -m pytest -q --tb=line
   ```
   Record pass/fail/skip count. Expected 663 / 0 / 0-2.

3. **Visual capture matrix** (POLI-09):
   ```bash
   cd frontend && pnpm test:e2e -- tests/e2e/v13-visual-capture.spec.ts --workers=2
   ```
   Confirms 36 PNGs land in `.planning/phases/24-shell-density-containment-primitives/visual-check/`. Verify with `ls .planning/phases/24-shell-density-containment-primitives/visual-check/*.png | wc -l` — should print 36.

4. **Axe-core matrix** (POLI-10):
   ```bash
   cd frontend && pnpm test:e2e -- tests/e2e/v13-a11y.spec.ts --workers=2 --reporter=list 2>&1 | tee /tmp/axe-results.txt
   ```
   The spec EXITs nonzero on any blocking (serious/critical) violation. Capture stdout to `/tmp/axe-results.txt`. The spec already prints moderate/minor warnings to console — capture those too.

   If blocking violations appear:
   - Determine the violation rule (e.g., `color-contrast`, `link-name`).
   - Determine the offending route × density × theme combination.
   - If the violation is clearly fixable in CSS (research Pitfall 7: subtle-text-as-body in Compact + light), patch the relevant file (likely `frontend/src/styles.css`) in this task — apply the smallest possible change. Otherwise, document in task 3's VISUAL-CHECK.md as an `## Accepted Exceptions` row with rationale.

5. **Portal containment probe** (CONT-02):
   ```bash
   cd frontend && pnpm test:e2e -- tests/e2e/v13-portal-containment.spec.ts
   ```
   3 tests; all should pass. If any fail, the offending transform-bearing ancestor is reported by the test message — patch the source class (likely a missed `transform: translateY` in a hover rule), update `24-TRANSFORM-AUDIT.md`, and re-run.

6. **Sidebar + density + truncation + copy-cell e2e:**
   ```bash
   cd frontend && pnpm test:e2e -- tests/e2e/v13-sidebar.spec.ts tests/e2e/v13-density.spec.ts tests/e2e/v13-truncation.spec.ts tests/e2e/v13-copy-cell.spec.ts
   ```
   Record pass/skip counts. Sidebar + density should ALL pass. Truncation + copy-cell may skip (acceptable per plan 05 design — note in the verdict).

7. **Lighthouse CI** (POLI-11 perf budget):
   ```bash
   cd frontend && pnpm build
   cd frontend && npx lhci autorun --config=./lighthouserc.json 2>&1 | tee /tmp/lhci-out.txt
   ```
   `pnpm build` runs the production Vite build (the preview server consumes this). lhci then collects 3 URLs × 3 runs = 9 runs total. Output lands in `frontend/.lighthouseci/`. Examine `frontend/.lighthouseci/manifest.json` — confirm every assertion is `pass`. Threshold breaches:
   - LCP > 2500ms → record in VISUAL-CHECK.md; investigate (likely route bundle size, see if a Phase 25/26 dep already crept in).
   - CLS > 0.1 → likely a font-loading or image-without-dimensions issue; investigate or document.
   - INP > 200ms → likely a heavy-handler issue; investigate or document.

8. **React DevTools profiler — density toggle zero-rerender** (POLI-11 binary gate):
   This step requires manual browser action (no headless equivalent for React DevTools profiler). Document the procedure for the operator to run during task 3 (the human-verify checkpoint):
   - Steps:
     1. `cd frontend && pnpm dev`
     2. Open `http://localhost:5173/activity` (chart-heavy route).
     3. Open Chrome DevTools → React tab (DevTools extension installed) → Profiler tab.
     4. Click "Record".
     5. In the page, click the density toggle, select Compact (or any other tier).
     6. Click "Stop" in profiler.
     7. Inspect the commit list: PASS condition is "DensityToggle is the only component that re-rendered" (1 commit, 1 component). Any other component re-rendering is a FAIL — investigate (likely an accidental React Context introduction).
     8. Capture a screenshot of the profiler's commit list, save as `.planning/phases/24-shell-density-containment-primitives/visual-check/perf-density-toggle.png`.

   Do NOT block this task on the operator's profiler step — that's task 3's checkpoint. Capture the procedure into the operator-facing verdict template.

9. **ResponsiveContainer count check** (POLI-11):
   ```bash
   cd frontend && rg -c "ResponsiveContainer" src/components/panels/ | awk -F: '{s+=$2}END{print s}'
   ```
   Record the integer. Compare against v1.2 baseline (record from `git log` of v1.2 close + `git show`-ing pre-Phase-24 styles). The count MUST be unchanged — Phase 24 doesn't add or remove charts. If it changed, identify which panel and explain in the verdict.
  </action>
  <verify>
    <automated>cd frontend && pnpm tsc --noEmit && cd .. && ls .planning/phases/24-shell-density-containment-primitives/visual-check/*.png 2>/dev/null | wc -l && test -f frontend/.lighthouseci/manifest.json</automated>
  </verify>
  <done>36 PNGs captured under visual-check/. axe-core run completed (output captured to /tmp/axe-results.txt; blocking violations either zero or addressed inline). Portal-containment probe green. Sidebar+density e2e green. Lighthouse manifest.json present at frontend/.lighthouseci/. ResponsiveContainer count recorded for the verdict.</done>
</task>

<task type="auto">
  <name>Task 2: Compile evidence into 24-VISUAL-CHECK.md draft</name>
  <files>.planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md</files>
  <action>
Write `.planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md` with the following structure. Fill in all `{...}` placeholders from the artifacts produced by task 1:

```markdown
# Phase 24 — VISUAL-CHECK

**Operator:** {leave blank for the human checkpoint to fill}
**Date:** {ISO date of task 1 run}
**Capture commands:**
- Visual: `cd frontend && pnpm test:e2e -- tests/e2e/v13-visual-capture.spec.ts`
- Axe-core: `cd frontend && pnpm test:e2e -- tests/e2e/v13-a11y.spec.ts`
- Portal-containment: `cd frontend && pnpm test:e2e -- tests/e2e/v13-portal-containment.spec.ts`
- Sidebar/density e2e: `cd frontend && pnpm test:e2e -- tests/e2e/v13-{sidebar,density,truncation,copy-cell}.spec.ts`
- Lighthouse: `cd frontend && pnpm build && npx lhci autorun --config=./lighthouserc.json`

**Captured PNGs:** `.planning/phases/24-shell-density-containment-primitives/visual-check/` (36 files: 6 routes × 3 densities × 2 themes)

## Test counts (vs Phase 18 / v1.2 close baseline)

| Suite              | v1.2 baseline | Phase 24 close | Delta | Notes |
|--------------------|--------------:|---------------:|------:|-------|
| Backend pytest     |        661 / 0 / 0 | {actual} | {+/-} | +2 url-contract tests expected |
| Frontend vitest    |        326 / 0 / 0 | {actual} | {+~23} | density/sidebar/copy/truncated/bounded tests |
| Playwright e2e     |        13 specs (11 pass + 2 skip) | {actual} | {+7 specs} | v13-* additions |

## Visual capture verdict (36 rows)

Operator: open each PNG in alpha order under `visual-check/`, mark PASS/FAIL, add notes.

| Route × Density × Theme              | Verdict | Notes |
|--------------------------------------|---------|-------|
| home__compact__dark.png              | PASS / FAIL | … |
| home__compact__light.png             | PASS / FAIL | … |
| home__comfortable__dark.png          | PASS / FAIL | … |
| home__comfortable__light.png         | PASS / FAIL | … |
| home__cozy__dark.png                 | PASS / FAIL | … |
| home__cozy__light.png                | PASS / FAIL | … |
| activity__compact__dark.png          | PASS / FAIL | … |
| activity__compact__light.png         | PASS / FAIL | … |
| activity__comfortable__dark.png      | PASS / FAIL | … |
| activity__comfortable__light.png     | PASS / FAIL | … |
| activity__cozy__dark.png             | PASS / FAIL | … |
| activity__cozy__light.png            | PASS / FAIL | … |
| skills__compact__dark.png            | PASS / FAIL | … |
| skills__compact__light.png           | PASS / FAIL | … |
| skills__comfortable__dark.png        | PASS / FAIL | … |
| skills__comfortable__light.png       | PASS / FAIL | … |
| skills__cozy__dark.png               | PASS / FAIL | … |
| skills__cozy__light.png              | PASS / FAIL | … |
| cost__compact__dark.png              | PASS / FAIL | … |
| cost__compact__light.png             | PASS / FAIL | … |
| cost__comfortable__dark.png          | PASS / FAIL | … |
| cost__comfortable__light.png         | PASS / FAIL | … |
| cost__cozy__dark.png                 | PASS / FAIL | … |
| cost__cozy__light.png                | PASS / FAIL | … |
| alerts__compact__dark.png            | PASS / FAIL | … |
| alerts__compact__light.png           | PASS / FAIL | … |
| alerts__comfortable__dark.png        | PASS / FAIL | … |
| alerts__comfortable__light.png       | PASS / FAIL | … |
| alerts__cozy__dark.png               | PASS / FAIL | … |
| alerts__cozy__light.png              | PASS / FAIL | … |
| sessions-compare__compact__dark.png  | PASS / FAIL (empty-state acceptable; full content on this route lands in Phase 26) |
| sessions-compare__compact__light.png | PASS / FAIL | … |
| sessions-compare__comfortable__dark.png  | PASS / FAIL | … |
| sessions-compare__comfortable__light.png | PASS / FAIL | … |
| sessions-compare__cozy__dark.png     | PASS / FAIL | … |
| sessions-compare__cozy__light.png    | PASS / FAIL | … |

## Axe-core results (POLI-10)

**Run command:** `pnpm test:e2e -- tests/e2e/v13-a11y.spec.ts`
**Total runs:** 30 (5 routes × 3 densities × 2 themes)
**Blocking violations (serious + critical):** {0 = pass; >0 = list each below}

| Route | Density | Theme | Rule | Impact | Element | Resolution |
|-------|---------|-------|------|--------|---------|------------|
| {fill if any} |

**Moderate / minor warnings (non-blocking):** {count + summary; not phase-blocking but logged for next phase}

| Route | Density | Theme | Rule | Description |
|-------|---------|-------|------|-------------|
| {fill from /tmp/axe-results.txt warnings} |

## Lighthouse CI results (POLI-11 extension)

**Run command:** `cd frontend && pnpm build && npx lhci autorun --config=./lighthouserc.json`
**Manifest:** `frontend/.lighthouseci/manifest.json`
**URLs:** http://127.0.0.1:4173/, /activity, /skills (3 URLs × 3 runs each = 9 runs)

| URL          | LCP (median) | CLS (median) | INP (median) | Verdict |
|--------------|-------------:|-------------:|-------------:|---------|
| /            | {ms} | {0.x} | {ms} | PASS / FAIL |
| /activity    | {ms} | {0.x} | {ms} | PASS / FAIL |
| /skills      | {ms} | {0.x} | {ms} | PASS / FAIL |

**Thresholds:** LCP < 2500ms, CLS < 0.1, INP < 200ms (Google CWV "Good" boundaries).

## Perf budget — binary gates

| Gate | Result | Evidence |
|------|--------|----------|
| Density toggle React re-render count = 0 | PASS / FAIL | `visual-check/perf-density-toggle.png` (operator-captured React DevTools profiler) |
| Chart polling p95 paint < 16ms | PASS / FAIL | Chrome DevTools Performance trace (operator-recorded) |
| ResponsiveContainer instance count stable | {N} == v1.2 baseline {M} | `rg -c "ResponsiveContainer" frontend/src/components/panels/` |

## Portal containment probe (CONT-02)

| Test | Result |
|------|--------|
| Density toggle dropdown content has no transform ancestor | PASS / FAIL |
| Command palette content has no transform ancestor | PASS / FAIL |
| Hovering a button doesn't put the page into a transform state | PASS / FAIL |

If any FAIL, see `24-TRANSFORM-AUDIT.md` for the offender list and `frontend/src/styles.css` for the patch path.

## URL contract gate (POLI-13)

**Run:** `cd backend && python -m pytest tests/test_url_contract.py -v`
**Result:** PASS / FAIL ({2 passed} expected; both directions of the contract enforced).

## Sidebar + density e2e (SHEL-04, DENS-01..03)

| Spec                        | Result |
|-----------------------------|--------|
| v13-sidebar (2 tests)       | PASS / FAIL |
| v13-density (2 tests)       | PASS / FAIL |
| v13-truncation (1 test)     | PASS / SKIP (clean dataset; covered by vitest unit) |
| v13-copy-cell (1 test)      | PASS / SKIP (no copyable cells until Phase 26/27 column adoption) |

## Accepted Exceptions

(Empty if every gate passed cleanly.)

| Exception | Rationale | Unblock condition |
|-----------|-----------|-------------------|
| {Example: axe-core warns moderate contrast on subtle-text body usage} | {research Pitfall 7; not a blocker — Phase 24 holds the line on subtle-text-not-for-body} | {none — accept indefinitely; Phase 26/27 adoption may revisit} |

## Phase verdict

**Operator verdict:** {PASS / FAIL — leave blank for the human checkpoint}
**Date verdict signed:**
**Operator name:**
**Notes:**
```

Pre-fill every numeric/boolean cell from task 1's outputs. Leave only `Operator verdict`, the visual matrix `PASS/FAIL` cells, and the `Notes` column blank for the operator. The visual matrix is operator-driven; the rest is auto-filled.
  </action>
  <verify>
    <automated>test -f .planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md && grep -q 'Visual capture verdict' .planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md && grep -q 'Lighthouse CI results' .planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md && grep -q 'Phase verdict' .planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md && grep -c '__compact__\|__comfortable__\|__cozy__' .planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md</automated>
  </verify>
  <done>24-VISUAL-CHECK.md exists with all sections populated except operator-fill cells. Visual matrix table has 36 rows. Lighthouse, axe, perf-gate, portal-probe, sidebar/density e2e, URL-contract sections all populated from task 1 evidence.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Phase 24 quality gates have been executed end-to-end:
- 36 PNGs captured under `.planning/phases/24-shell-density-containment-primitives/visual-check/`
- Axe-core run completed across 5 routes × 3 densities × 2 themes (30 runs)
- Lighthouse CI ran on /, /activity, /skills with 9 total runs; manifest at `frontend/.lighthouseci/manifest.json`
- Sidebar/density/portal-containment Playwright e2e ran
- ResponsiveContainer count + URL-contract pytest verified
- Draft `24-VISUAL-CHECK.md` populated with all auto-fillable cells

This checkpoint is the final operator gate for Phase 24 close. The operator validates the captured evidence and signs the verdict.
  </what-built>
  <how-to-verify>
1. **Visual matrix review (~10-15 min):**
   - Open `.planning/phases/24-shell-density-containment-primitives/visual-check/` in Finder.
   - Iterate through all 36 PNGs in alpha order. For each, mark PASS or FAIL in the verdict table at `24-VISUAL-CHECK.md` ## Visual capture verdict section.
   - Pass criteria: layout coherent, no horizontal scrollbar (except inside DataTable wraps), no clipped content, sidebar visible with correct active-route highlight, header action area not overflowing, density visibly different per tier (Compact tighter, Cozy roomier).
   - Acceptable to FAIL: `/sessions/compare` PNGs likely show empty-state because demo session IDs aren't seeded — that's accepted; mark "PASS (empty-state)" in notes.

2. **Axe-core verdict:**
   - Open `24-VISUAL-CHECK.md` ## Axe-core results.
   - Confirm "Blocking violations" row reads 0. If not, the gate FAILS — operator decides between fix-in-place or accepted-exception.

3. **Lighthouse verdict:**
   - Open `frontend/.lighthouseci/manifest.json` and the per-URL HTML reports under `frontend/.lighthouseci/`.
   - Confirm all 9 runs (3 URLs × 3 runs) pass LCP < 2500, CLS < 0.1, INP < 200.

4. **React DevTools profiler — density toggle zero-rerender (the most important manual step):**
   - `cd frontend && pnpm dev`
   - Open `http://localhost:5173/activity` in Chrome with React DevTools extension.
   - DevTools → React → Profiler tab → Record.
   - Click the density toggle in the header, select Compact.
   - Stop recording.
   - In the commits list: ONLY `DensityToggle` should appear as having re-rendered (1 commit, 1 component). Charts, tables, panels, sidebar — NONE should have re-rendered.
   - Capture screenshot, save as `.planning/phases/24-shell-density-containment-primitives/visual-check/perf-density-toggle.png`.
   - Mark the perf-budget binary gate row in `24-VISUAL-CHECK.md` as PASS or FAIL.

5. **Manual sidebar smoke test:**
   - Same dev server. Press Cmd+B → sidebar collapses to icon-only. Hover any icon → tooltip on the right with route label.
   - Press Cmd+B again → sidebar expands. Reload → state persists.
   - Click density toggle → menu shows three tiers with check on current. Select different tier → page re-spaces with no flash.

6. **Sign the verdict:**
   - Fill `Operator name`, `Date verdict signed`, `Operator verdict: PASS` (or FAIL) in `24-VISUAL-CHECK.md`.
   - If any gate FAILED but you choose to accept-with-exception, fill the `## Accepted Exceptions` table with the rationale.

7. **Confirm aggregate test counts:**
   - `cd backend && python -m pytest -q` → expect ~663 / 0 / 0-2.
   - `cd frontend && pnpm vitest run --reporter=dot` → expect ~349 / 0.
   - `cd frontend && pnpm test:e2e --reporter=list 2>&1 | tail -20` → expect all v13-* specs green or with planned skips only.
  </how-to-verify>
  <resume-signal>Type "approved" once `24-VISUAL-CHECK.md` is fully filled in (matrix verdicts, perf gate, operator verdict + signature). If any gate genuinely fails and is not acceptable as-is, describe the failure and the executor will produce a `--gaps` plan.</resume-signal>
</task>

</tasks>

<verification>
Phase 24 close-gate is the human checkpoint above. Auto-checks for the executor before raising the checkpoint:

```bash
# All 36 PNGs landed.
ls .planning/phases/24-shell-density-containment-primitives/visual-check/*.png 2>/dev/null | wc -l   # expect 36

# Lighthouse manifest exists.
test -f frontend/.lighthouseci/manifest.json

# 24-VISUAL-CHECK.md has all sections.
grep -c '## ' .planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md   # expect 9+ sections

# Test counts vs baseline.
cd backend && python -m pytest -q 2>&1 | tail -3
cd frontend && pnpm vitest run --reporter=dot 2>&1 | tail -3
```
</verification>

<success_criteria>
1. `.planning/phases/24-shell-density-containment-primitives/visual-check/` contains 36 PNGs (one per route × density × theme combination from the matrix).
2. `frontend/.lighthouseci/manifest.json` exists with 9 successful runs (3 URLs × 3 runs).
3. `24-VISUAL-CHECK.md` exists with all 9+ sections populated; auto-filled cells reflect actual run data; verdict cells await operator review.
4. Axe-core run produced 0 blocking (serious + critical) violations across 30 runs (5 × 3 × 2). Any blocking violations are either fixed in place during task 1, OR documented under `## Accepted Exceptions` with rationale + unblock condition.
5. Lighthouse CI assertions pass (LCP < 2500ms, CLS < 0.1, INP < 200ms) on /, /activity, /skills.
6. Portal-containment probe — 3 tests green.
7. Sidebar e2e — 2 tests green; density e2e — 2 tests green; truncation/copy-cell — green or planned skip.
8. URL-contract pytest passes (both directions: documented routes exist; tree routes are documented).
9. ResponsiveContainer count unchanged from v1.2 baseline (Phase 24 added zero charts).
10. React DevTools profiler verifies zero React re-renders below DensityToggle on density-tier swap.
11. Operator signs `24-VISUAL-CHECK.md` with `PASS` verdict (OR `FAIL` with accepted-exceptions table filled).
12. Aggregate test counts: backend pytest ~663 / 0 / 0-2 (vs Phase 18 baseline 661); frontend vitest ~349 / 0 (vs 326); Playwright e2e all v1.2 specs green + new v13-* specs green or planned-skip.
</success_criteria>

<output>
After the operator approves the human checkpoint, create `.planning/phases/24-shell-density-containment-primitives/24-07-SUMMARY.md` per the standard SUMMARY template, recording:
- Final visual-matrix verdict counts (PASS / FAIL / accepted-exception)
- Final Lighthouse LCP / CLS / INP medians per URL
- Final axe-core blocking + warning counts
- Test count delta vs Phase 18 baseline (backend / vitest / playwright)
- The signed operator verdict
- Any accepted exceptions and their unblock conditions
- Phase 24 close confirmation: every requirement in CONT-01..05, SHEL-01..04, DENS-01..03, POLI-09..14 is satisfied (cite the plan that delivered each)

This SUMMARY is the verifier's primary input for Phase 24 close. Phase 25 planning starts only after this is committed.
</output>
