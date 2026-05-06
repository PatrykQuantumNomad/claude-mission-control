---
phase: 20-cost-forecast-per-project-card
plan: 04
type: execute
wave: 4
# why_this_split: Playwright e2e — depends on the full vertical slice (Plans 01..03). Single small plan; one task. Mirrors Phase 19 Plan 04's skills-detail.spec.ts pattern. Steady-state baseline already accommodates "skipped when no seed data" via Phase 18 Plan 04 + Phase 19 Plan 04 README convention.
depends_on: ["20-01", "20-02", "20-03"]
files_modified:
  - frontend/tests/e2e/cost-dashboard.spec.ts
  - frontend/tests/e2e/README.md
autonomous: true
requirements: [ANLY-06, ANLY-07]
must_haves:
  truths:
    - "Playwright spec opens /cost on the production preview build (vite preview at http://127.0.0.1:4173) and asserts both data-testid='cost-forecast-card' and data-testid='cost-by-project-card' are visible."
    - "Spec asserts the path-leakage guard: getByTestId('cost-by-project-card-table').textContent does NOT match /\\b\\/[A-Za-z][\\w/.-]+/ — no path-shape strings rendered. Mirrors Phase 19 skills-detail.spec.ts adversarial-mutation-verified guard."
    - "Spec asserts that EITHER the projection KpiTile (testid cost-forecast-card-projected) OR the insufficient-message element (testid cost-forecast-card-insufficient-message) is present — exactly one of them — depending on dev DB state. Spec degrades gracefully when neither set of conditions holds (e.g., /cost responds but no token_usage rows seeded → still passes by skipping the per-project assertion via test.skip with a documented reason)."
    - "Spec asserts the 7d/30d toggle changes data: clicks the 30d button, waits for any DOM change in cost-by-project-card-table, asserts a network request matching /api\\/cost\\/breakdown.*range=30d/ fired."
    - "Spec asserts navigation: clicks the 'Cost' link in the NavBar from /, asserts URL becomes /cost, asserts both cards mount."
    - "Steady-state Playwright baseline updated in frontend/tests/e2e/README.md: Phase 19 baseline was 7 passed / 2 skipped; Phase 20 adds this spec with up to 1 conditional skip (when /cost has no seed data). README documents the new skip condition."
  artifacts:
    - path: "frontend/tests/e2e/cost-dashboard.spec.ts"
      provides: "Playwright spec for /cost — navigation + both cards visible + path-leakage guard + range toggle"
      contains: "test.describe('cost-dashboard'"
      contains_also: "cost-by-project-card-table"
      min_lines: 80
    - path: "frontend/tests/e2e/README.md"
      provides: "Updated baseline — Phase 20 cost-dashboard.spec.ts noted alongside the existing skips inventory"
      contains: "cost-dashboard"
  key_links:
    - from: "frontend/tests/e2e/cost-dashboard.spec.ts"
      to: "Plan 20-01 + Plan 20-02 + Plan 20-03 (full vertical slice)"
      via: "navigates to /cost; asserts both panels (testids set in Plan 20-03) are visible"
      pattern: "cost-forecast-card|cost-by-project-card"
    - from: "frontend/tests/e2e/cost-dashboard.spec.ts"
      to: "GET /api/cost/breakdown?dim=project&range=30d (Plans 20-01 + 20-03 toggle)"
      via: "page.waitForRequest with regex match"
      pattern: "range=30d"
---

<objective>
Add the Playwright e2e spec for the cost dashboard, completing the user-shippable verification chain for Phase 20. Mirrors Phase 19's `skills-detail.spec.ts` (verified at HEAD) — same path-leakage assertion pattern, same conditional-skip discipline when dev DB has no seed data, same kebab-case testid integration.

Purpose: Provide a single load-bearing structural test that an external observer would run after `pnpm dev` on a real DB and confirm: (1) the /cost route is reachable, (2) both cards render, (3) no filesystem path leaks through the per-project card, (4) the 7d/30d toggle drives a real fetch. Backend invariants (path-leakage SQL, Decimal-only OLS, insufficient_data threshold) all already covered by pytest/vitest from Plans 20-01..03; the e2e spec is the final integration trust signal.

Output:
- `frontend/tests/e2e/cost-dashboard.spec.ts` (NEW, ~120 LOC):
  - Mirrors `frontend/tests/e2e/skills-detail.spec.ts` (Phase 19 Plan 04) for structure.
  - 4 tests:
    1. `'/cost route mounts both cards'` — navigates to /cost, asserts both panel testids are visible.
    2. `'NavBar Cost link navigates from /'` — opens /, clicks the 'Cost' nav link by name, asserts URL becomes /cost AND cost-forecast-card is visible.
    3. `'cost-by-project-card-table has no path-leakage'` — getByTestId('cost-by-project-card-table'); read .textContent(); regex assert `/\b\/[A-Za-z][\w/.-]+/` does NOT match. Conditional skip with documented reason when the table is in the empty-state branch (no projects seeded).
    4. `'7d→30d toggle fires a /api/cost/breakdown?range=30d request'` — page.waitForRequest with regex; clicks the 30d button; awaits the request. Conditional skip when no project data exists (toggle wouldn't be visible OR wouldn't trigger a refetch on an empty state).
- `frontend/tests/e2e/README.md` (EXTENDED): under the existing "Steady-state Playwright skips" section, add an entry noting `cost-dashboard.spec.ts` may show 1 skip when the dev DB has no `token_usage` rows AND/OR no `sessions` rows for the current month. Frame consistent with how Phase 19 documented its `skills-detail` skip ("requires ≥1 skill in dev DB"). New baseline for downstream phases: 8 passed / 2-3 skipped / 0 failed (Phase 19 was 7/2/0; Phase 20 adds 1 spec with up to 1 additional skip).
</objective>

<execution_context>
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/20-cost-forecast-per-project-card/20-RESEARCH.md
@.planning/phases/20-cost-forecast-per-project-card/20-03-cost-dashboard-route-and-cards-PLAN.md
@.planning/phases/19-skills-per-project-deltas-badges/19-04-frontend-deltas-projects-badges-PLAN.md

# Existing files this plan touches or imports from (read before editing)
@frontend/tests/e2e/skills-detail.spec.ts
@frontend/tests/e2e/README.md
@frontend/playwright.config.ts

<interfaces>
<!-- Key contracts from prior plans + Phase 18 POLI-08 testid convention. -->

From frontend/tests/e2e/skills-detail.spec.ts (Phase 19 — pattern to mirror verbatim):
- File header pattern: imports { test, expect } from '@playwright/test'.
- Skip-on-no-data pattern: open the route, check for the empty-state element, call test.skip() with a reason if no seed data is available.
- Path-leakage assertion: const text = await page.getByTestId('skills-detail-projects-table').textContent(); expect(text ?? '').not.toMatch(/\b\/[A-Za-z][\w/.-]+/).
- Documented in README.md: "skills-detail.spec.ts skipped when dev DB has no skills seeded."

Locked testids (from Plan 20-03):
- cost-forecast-card (outer section)
- cost-forecast-card-projected (KpiTile when forecast available)
- cost-forecast-card-insufficient-message (when insufficient_data=true)
- cost-forecast-card-bias-banner (when partial_month_bias=true)
- cost-forecast-card-mtd (always-present MTD KpiTile)
- cost-by-project-card (outer section)
- cost-by-project-card-table (DataTable container)

Playwright config (read-only context):
- frontend/playwright.config.ts: target is vite preview at http://127.0.0.1:4173; backend uvicorn on http://127.0.0.1:8765; Chromium only; serial workers=1.
- Run command: `cd frontend && npm run test:e2e -- cost-dashboard.spec.ts`.

API contract (from Plans 20-01 + 20-02 — for the network-fire assertion):
- GET /api/cost/breakdown?dim=project&range=7d (default panel state)
- GET /api/cost/breakdown?dim=project&range=30d (after 30d click)
- GET /api/cost/forecast (no params)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Playwright spec + update e2e README</name>
  <files>frontend/tests/e2e/cost-dashboard.spec.ts, frontend/tests/e2e/README.md</files>
  <action>
**Step 1a — Read `frontend/tests/e2e/skills-detail.spec.ts` first** to confirm the conditional-skip pattern, the path-leakage regex, and the testid-getter discipline. Mirror its style verbatim — small Playwright specs are highly conventionalized in this repo.

**Step 1b — Create `frontend/tests/e2e/cost-dashboard.spec.ts`:**

```typescript
import { test, expect } from '@playwright/test'

const PATH_REGEX = /\b\/[A-Za-z][\w/.-]+/

test.describe('cost-dashboard', () => {
  test('opens /cost and mounts both panels', async ({ page }) => {
    await page.goto('/cost')

    // Outer section testids — set in Plan 20-03 on the section wrapping each
    // PanelCard. Survives all PanelCard branches (loading/empty/error/data).
    await expect(page.getByTestId('cost-forecast-card')).toBeVisible()
    await expect(page.getByTestId('cost-by-project-card')).toBeVisible()
  })

  test('NavBar Cost link navigates from /', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Cost' }).click()
    await expect(page).toHaveURL(/\/cost$/)
    await expect(page.getByTestId('cost-forecast-card')).toBeVisible()
  })

  test('cost-by-project-card-table has no path-leakage', async ({ page }) => {
    await page.goto('/cost')

    const card = page.getByTestId('cost-by-project-card')
    await expect(card).toBeVisible()

    // Skip when the table is in empty state — no project_key rows seeded
    // in dev DB. Documented in frontend/tests/e2e/README.md.
    const tableLocator = page.getByTestId('cost-by-project-card-table')
    const tableMounted = await tableLocator.count()
    if (tableMounted === 0) {
      test.skip(true, 'cost-by-project-card-table not mounted; dev DB has no project rows')
      return
    }

    const text = (await tableLocator.textContent()) ?? ''

    // Adversarial structural guard. The path-leakage prohibition is enforced
    // server-side in Plan 20-01 (SQL groups by project_key + WHERE != ''),
    // schema-side via CostBreakdownRow.key being a 12-char hex per
    // project_key contract, and now ALSO via this rendered-DOM regex check.
    // Mirrors the Phase 19 SkillProjectsTable adversarial-mutation-verified
    // guard (sed-mutation backend → RED → restore → GREEN).
    expect(text).not.toMatch(PATH_REGEX)

    // Sanity: assert the card actually rendered something (not vacuous).
    expect(text.length).toBeGreaterThan(0)
  })

  test('7d→30d toggle fires a range=30d cost-breakdown request', async ({ page }) => {
    await page.goto('/cost')
    await expect(page.getByTestId('cost-by-project-card')).toBeVisible()

    // Skip when the toggle isn't visible (empty state — RangeToggle still
    // renders in the trailing slot but the network call won't fire because
    // the component already rendered an empty result for 7d).
    const thirtyDayButton = page.getByRole('button', { name: /^30d$/ })
    const buttonVisible = await thirtyDayButton.isVisible().catch(() => false)
    if (!buttonVisible) {
      test.skip(true, 'RangeToggle 30d not visible; dev DB has no project rows for the surface')
      return
    }

    // waitForRequest race: arm the matcher before the click.
    const req30dPromise = page.waitForRequest(
      (req) =>
        /\/api\/cost\/breakdown\b/.test(req.url()) && /range=30d/.test(req.url()),
      { timeout: 5_000 },
    )
    await thirtyDayButton.click()
    const req30d = await req30dPromise
    expect(req30d.url()).toMatch(/dim=project/)
    expect(req30d.url()).toMatch(/range=30d/)
  })
})
```

**Step 1c — Update `frontend/tests/e2e/README.md`:**

Read the existing file. It documents:
- Phase 18 Plan 04: the kebab-case `feature-component-element` testid convention.
- Phase 19 Plan 04: the new skills-detail.spec.ts skip ("when no skill is seeded in dev DB").
- A "Steady-state baseline" section recording the current pass/skip/fail counts.

Append a new entry under the "Steady-state baseline" / "Skips inventory" section (locate the heading verbatim from the existing file before editing):

```markdown
- **cost-dashboard.spec.ts** (Phase 20 Plan 04) — may show 1 skip on `cost-by-project-card-table has no path-leakage` and/or `7d→30d toggle fires a range=30d cost-breakdown request` when the dev DB has no `sessions.project_key != ''` rows for the current 7d window. The path-leakage assertion is structurally vacuous in that branch (the empty-state element has no project keys to leak), and the toggle test cannot fire a range=30d request when the panel renders the empty branch. Both skips degrade gracefully and the spec passes when seed data is present (one keyed session within 7d satisfies both).
```

Update the steady-state pass/skip count if the README tracks it explicitly:

```markdown
**Steady-state Playwright baseline (Phase 20 close):**
- Passed: >= 8 (Phase 19 floor 7 + Phase 20's cost-dashboard 4 specs minus up-to-2 conditional skips → effective floor 8)
- Skipped: 2–4 (alerts.spec.ts steady-state + skills-detail.spec.ts when no skill seeded + cost-dashboard up-to-2 conditional skips when no project_key data seeded)
- Failed: 0
```

(Confirm the exact phrasing/heading conventions by reading the existing README; mirror its tone.)

  </action>
  <verify>
    <automated>cd frontend && npm run test:e2e -- cost-dashboard.spec.ts</automated>
    Expected: 4 tests, all pass OR pass-with-skip in 1-2 cases when dev DB lacks data; 0 failed.

    cd frontend && grep -n "cost-dashboard" frontend/tests/e2e/README.md
    Expected: at least 1 match in the skips inventory.

    # Full e2e suite (sanity — confirms baseline preserved):
    cd frontend && npm run test:e2e
    Expected: passed >= 8; failed == 0; skipped 2-4 (per README).

    # Adversarial-mutation verification for the path-leakage guard
    # (manual — perform once, do NOT commit):
    # 1. Edit backend/cmc/api/routes/cost.py and revert _BREAKDOWN_BY_PROJECT_SQL
    #    to use COALESCE(s.cwd, '<unknown>') AS key + GROUP BY COALESCE(s.cwd, ...).
    # 2. Restart the backend and re-run: cd frontend && npm run test:e2e -- cost-dashboard.spec.ts
    # 3. Expected: the path-leakage test FAILS (RED) — the cwd-shaped key bubbles
    #    into the table textContent and the regex matches.
    # 4. git checkout backend/cmc/api/routes/cost.py to restore.
    # 5. Re-run: test PASSES (GREEN). Confirms the guard is load-bearing
    #    and complements the unit-side adversarial verification from Plan 20-01.
  </verify>
  <done>
    cost-dashboard.spec.ts exists with 4 tests; passes with at most 2 conditional skips; 0 failures.
    README updated with the new skip inventory + steady-state floor.
    Adversarial-mutation verification done at least once locally — the e2e path-leakage guard fails on a deliberate cwd-restoration backend mutation.
    Phase 18 BASELINE.md verifier rules preserved across all suites.
  </done>
</task>

</tasks>

<verification>
- `frontend/tests/e2e/cost-dashboard.spec.ts` exists with 4 tests.
- All 4 tests pass OR up to 2 skip with documented reasons (no `sessions.project_key != ''` data in dev DB).
- 0 failed tests.
- `npm run test:e2e` total passing count >= 8 (Phase 19 baseline 7 + new spec adds 1-4).
- README documents the new spec's conditional skip behavior in the "Steady-state baseline" / skips inventory section.
- Adversarial-mutation verification confirmed at least once: reverting Plan 20-01's SQL refactor to `cwd` causes the path-leakage e2e test to fail (RED), restoring it returns it to GREEN.
- Phase 19 patterns honored: kebab-case testids, section-level testid stability across PanelCard branches, conditional-skip-on-no-data discipline.
- All locked decisions from Plans 20-01..03 are now exercised end-to-end through real ASGI + real Vite preview build.
</verification>

<success_criteria>
- ROADMAP success criteria #1, #2, #3 trust-signal-verified end-to-end via Playwright.
- ANLY-06 + ANLY-07 fully shipped; user can land on /cost in production preview, see the forecast/banner/insufficient-message and the per-project breakdown, and toggle 7d/30d.
- Path-leakage prohibition now exercised at FOUR layers: (1) backend SQL filter, (2) backend structural pytest test, (3) frontend vitest container.textContent regex, (4) Playwright e2e on real-DOM textContent.
- Phase 20 closes with the same green-suite discipline established in Phase 19: pytest >= 623, vitest >= 315, playwright >= 8, datetime.utcnow warnings == 0.
</success_criteria>

<output>
After completion, create `.planning/phases/20-cost-forecast-per-project-card/20-04-SUMMARY.md` documenting:
- The 4 e2e tests + their conditional-skip discipline.
- Adversarial-mutation verification result.
- Updated baseline counts (pytest / vitest / playwright).
- Phase 20 closure: ANLY-06 + ANLY-07 user-visible end-to-end; ROADMAP success criteria #1..#4 satisfied.
- Any deviation from this plan and rationale.
</output>
