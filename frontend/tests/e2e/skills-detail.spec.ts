/// <reference types="node" />

// SKLP-08 / SKLP-09 / SKLP-10 — /skills/<name> detail panels.
//
// This spec covers the user-visible deliverables of Phase 19 Plan 04:
//   - SkillProjectsTable renders the per-project rollup (testid present).
//   - LOAD-BEARING: no rendered table-row text contains a leading-slash
//     filesystem path (path-leakage guard for ROADMAP success criterion #1;
//     mirrors the runtime DOM half of the dual structural guard, with the
//     vitest panel test as the unit-side complement).
//   - SkillCostCard renders a DeltaPill in its header (when seed data
//     produces one — assertion is conditional on data presence).
//
// SKIP CONDITION (mirrors alerts.spec.ts steady-state skip pattern from
// `frontend/tests/e2e/README.md`): when the dev DB has no skills, /skills
// renders an empty registry and there is no skill name to drill into.
// Phase verifiers compare failed counts only, not skip counts — a clean
// dev DB legitimately produces "1 skipped" here.

import { test, expect } from '@playwright/test'

const API = 'http://127.0.0.1:8765'

test.describe('SKLP-08/09/10: /skills/<name> detail panels', () => {
  test('projects table renders, no path leakage, delta pill visible (when seeded)', async ({
    page,
    request,
  }) => {
    test.setTimeout(45_000)

    // 0. Preflight — find a skill to drill into. The registry endpoint
    //    is the source of truth for "is there at least one skill?".
    //    Mirrors TEST-05b's preflight: API guard before UI navigation,
    //    with a clear skip reason that points the developer at the fix.
    const sRes = await request.get(`${API}/api/skills`)
    expect(sRes.ok()).toBe(true)
    const sBody = await sRes.json()
    const items = (sBody.items ?? []) as Array<{ name: string }>
    test.skip(
      items.length === 0,
      'SKLP-08/09/10: requires ≥1 skill in the dev DB. Run `cmc start` and ' +
        '`POST /api/skills/sync` to ingest local Claude Code skills, then re-run.',
    )
    const skillName = items[0].name

    // 1. Navigate directly to the detail route. Bypassing the click-from-
    //    /skills flow keeps the spec focused on the panel contracts (the
    //    cross-link from TopSkills → /skills/$name is exercised in
    //    TopSkills.test.tsx; this e2e spec is about the detail page render).
    await page.goto(`/skills/${encodeURIComponent(skillName)}`)

    // 2. Assert the projects table panel mounted with its testid hook.
    //    Even on empty data the wrapping <section> still renders, so this
    //    assertion holds across data-presence states.
    const projectsTable = page.getByTestId('skills-detail-projects-table')
    await expect(projectsTable).toBeVisible({ timeout: 10_000 })

    // 3. LOAD-BEARING path-leakage guard. Scan the entire panel's text
    //    content for a leading-slash filesystem path (e.g. '/Users/foo'
    //    or '/home/bar'). The regex requires '/' followed by an ASCII
    //    letter and at least one further path-shape character, narrowly
    //    matching real fs paths without false-positive on bare '/'.
    //    ROADMAP success criterion #1: this is the runtime DOM half of
    //    the dual guard (backend test_skill_projects_no_path_leakage is
    //    the schema half).
    const panelText = (await projectsTable.textContent()) ?? ''
    expect(panelText, 'projects panel must not render a filesystem-path-shaped string').not.toMatch(
      /\/[A-Za-z][\w/.-]+/,
    )
    // Defensive: the words 'cwd' / 'display_path' must never appear in
    // the user-facing panel either (these were never schema fields, but
    // the test guards future regressions).
    expect(panelText).not.toMatch(/\bcwd\b/i)
    expect(panelText).not.toMatch(/display_path/i)

    // 4. SkillCostCard's DeltaPill is conditional on seeded data: the
    //    pill always renders (server emits a flat-zero pill on the
    //    empty-case branch; see Plan 19-03 SUMMARY), but it lives inside
    //    the "Total cost" KpiTile which is gated by the trend-data
    //    empty-state. If the dev DB has no priced rows in the window,
    //    the SkillCostCard renders the PanelCard empty branch and the
    //    pill DOM never mounts. Use count() to make the assertion
    //    branch-aware rather than make the spec dev-DB-state-dependent.
    const costDelta = page.getByTestId('skill-cost-card-delta-pill')
    if ((await costDelta.count()) > 0) {
      await expect(costDelta.first()).toBeVisible()
    }
  })
})
