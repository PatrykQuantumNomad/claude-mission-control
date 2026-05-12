/// <reference types="node" />

// ANLY-06 / ANLY-07 — /cost dashboard (Phase 20 Plan 04).
//
// This spec covers the user-visible deliverables of Phase 20:
//   - The /cost route mounts both panels (CostForecastCard,
//     CostByProjectCard) — testids set on the wrapping <section> in Plan
//     20-03 survive all PanelCard branches (loading/empty/error/data).
//   - The NavBar 'Cost' link added in Plan 20-03 navigates from / to /cost.
//   - LOAD-BEARING: no rendered cell text in the per-project card contains
//     a leading-slash filesystem path (path-leakage guard for ROADMAP
//     success criterion #3 — fourth layer of defense, complementing the
//     SQL filter, the structural pytest test, and the vitest container
//     regex from Plans 20-01..03).
//   - The 7d/30d RangeToggle drives a real /api/cost/breakdown?range=30d
//     fetch — confirms the toggle is wired through the query layer rather
//     than just toggling local UI state.
//
// SKIP CONDITION (mirrors skills-detail.spec.ts and alerts.spec.ts steady-
// state skip pattern documented in `frontend/tests/e2e/README.md`): when
// the dev DB has no `sessions.project_key != ''` rows for the current 7d
// window, the per-project card renders the empty-state branch — there is
// no `cost-by-project-card-table` element to scan and no RangeToggle
// trailing slot to click. Phase verifiers compare failed counts only,
// not skip counts — a clean dev DB legitimately produces "1-2 skipped"
// here.

import { test, expect } from '@playwright/test'

const API = 'http://127.0.0.1:8765'
// Adversarial regex: matches a leading-slash filesystem-shaped string
// (e.g. '/Users/foo' or '/home/bar'). Mirror skills-detail.spec.ts so a
// future schema regression on either page surfaces under one assertion.
const PATH_REGEX = /\/[A-Za-z][\w/.-]+/

test.describe('ANLY-06/07: /cost dashboard panels', () => {
  test('opens /cost and mounts both panels', async ({ page }) => {
    await page.goto('/cost')

    // Outer section testids — set in Plan 20-03 on the section wrapping
    // each PanelCard. Survives all PanelCard branches (loading/empty/
    // error/data) so this assertion is dev-DB-state-independent.
    await expect(page.getByTestId('cost-forecast-card')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByTestId('cost-by-project-card')).toBeVisible({
      timeout: 10_000,
    })
  })

  test('NavBar Cost link navigates from / to /cost', async ({ page }) => {
    await page.goto('/')
    // Phase 20 Plan 03 added the 'Cost' link to NavBar between Skills and
    // Alerts. getByRole('link', { name: 'Cost' }) is exact-match and
    // collision-resistant under strict mode.
    //
    // Phase 25 Plan 03 (VIEW-01) added validateSearch on /cost so the URL
    // always rehydrates with `?schemaVersion=1` after navigation — the
    // regex changed from /\/cost$/ to /\/cost(\?|$)/ to tolerate the
    // schema-version suffix while still rejecting unrelated prefixes.
    await page.getByRole('link', { name: 'Cost' }).click()
    await expect(page).toHaveURL(/\/cost(\?|$)/)
    await expect(page.getByTestId('cost-forecast-card')).toBeVisible()
    await expect(page.getByTestId('cost-by-project-card')).toBeVisible()
  })

  test('cost-by-project-card-table has no path-leakage', async ({ page, request }) => {
    test.setTimeout(45_000)

    // Preflight: the per-project card renders the empty-state PanelCard
    // branch when the breakdown returns rows=[]. In that case the inner
    // `cost-by-project-card-table` div never mounts and the path-leakage
    // assertion is structurally vacuous. Skip with a documented reason
    // mirroring skills-detail.spec.ts's API-guarded skip pattern.
    const bRes = await request.get(
      `${API}/api/cost/breakdown?dim=project&range=7d`,
    )
    expect(bRes.ok()).toBe(true)
    const bBody = await bRes.json()
    const rowCount = (bBody.rows ?? []).length
    test.skip(
      rowCount === 0,
      'ANLY-07: requires ≥1 sessions.project_key != \'\' row in the dev ' +
        'DB within the 7d window. Run a Claude Code session inside a git ' +
        'project (so cwd → 12-char project_key hash), then re-run.',
    )

    await page.goto('/cost')
    const card = page.getByTestId('cost-by-project-card')
    await expect(card).toBeVisible()

    const tableLocator = page.getByTestId('cost-by-project-card-table')
    await expect(tableLocator).toBeVisible({ timeout: 10_000 })

    // LOAD-BEARING path-leakage guard. Scan the entire panel's text
    // content for a leading-slash filesystem path. The regex requires '/'
    // followed by an ASCII letter and at least one further path-shape
    // character, narrowly matching real fs paths without false-positive
    // on bare '/'. ROADMAP success criterion #3: this is the fourth
    // layer of defense (SQL filter → structural pytest test → vitest
    // container regex → real-DOM e2e). Mirrors Phase 19's
    // skills-detail.spec.ts adversarial-mutation-verified guard.
    const text = (await tableLocator.textContent()) ?? ''
    expect(
      text,
      'cost-by-project-card-table must not render a filesystem-path-shaped string',
    ).not.toMatch(PATH_REGEX)

    // Defensive: the words 'cwd' / 'display_path' must never appear in
    // the user-facing panel either (these were never schema fields, but
    // the test guards future regressions).
    expect(text).not.toMatch(/\bcwd\b/i)
    expect(text).not.toMatch(/display_path/i)

    // Sanity: the card actually rendered something (not vacuous after
    // the preflight guarantees rowCount > 0).
    expect(text.length).toBeGreaterThan(0)
  })

  test('7d→30d toggle fires a /api/cost/breakdown?range=30d request', async ({
    page,
    request,
  }) => {
    // Same preflight as the path-leakage test: the RangeToggle's trailing
    // slot only renders when PanelCard is in the data branch. If the 7d
    // breakdown is empty there's no toggle to click and no refetch to
    // observe. Skip with a documented reason rather than asserting
    // against an unstable empty-state branch.
    const bRes = await request.get(
      `${API}/api/cost/breakdown?dim=project&range=7d`,
    )
    expect(bRes.ok()).toBe(true)
    const bBody = await bRes.json()
    const rowCount = (bBody.rows ?? []).length
    test.skip(
      rowCount === 0,
      'ANLY-07: RangeToggle trailing slot only renders in PanelCard data ' +
        'branch; dev DB has no project_key rows for the 7d window.',
    )

    await page.goto('/cost')
    await expect(page.getByTestId('cost-by-project-card')).toBeVisible()

    // The RangeToggle uses { value: '30d', label: '30d' } per
    // CostByProjectCard's RANGE_OPTIONS. The toggle is implemented as a
    // group of toggle-buttons; getByRole('button', { name: '30d' }) is
    // exact-match.
    const thirtyDayButton = page.getByRole('button', { name: '30d' })
    await expect(thirtyDayButton).toBeVisible()

    // Arm the request matcher BEFORE the click — Playwright will reject
    // a waitForRequest registered after the network call already fired.
    const req30dPromise = page.waitForRequest(
      (req) =>
        /\/api\/cost\/breakdown\b/.test(req.url()) &&
        /[?&]range=30d\b/.test(req.url()) &&
        /[?&]dim=project\b/.test(req.url()),
      { timeout: 5_000 },
    )
    await thirtyDayButton.click()
    const req30d = await req30dPromise
    expect(req30d.url()).toMatch(/dim=project/)
    expect(req30d.url()).toMatch(/range=30d/)
  })
})
