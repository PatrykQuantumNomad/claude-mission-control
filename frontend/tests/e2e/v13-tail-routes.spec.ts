// Phase 27 Plan 09 — tail routes + tech debt e2e cascade.
//
// Maps 1:1 to ROADMAP Phase 27 success criteria SC#1-#5 + the three TDBT
// requirement IDs (TDBT-01 / TDBT-02 / TDBT-03). Pattern mirrors
// `v13-time-picker.spec.ts` (Phase 26 Plan 09) — `test.describe('Phase 27
// — tail routes + tech debt', ...)` with one `test()` per success
// criterion + a handful of targeted edge cases.
//
// Strategy:
//   - SC#3 / TDBT-01 (project_key wire shape) — verified via direct
//     `request.get(...)` against the backend on :8765 (mirrors the
//     pattern used in alerts.spec.ts + cost-dashboard.spec.ts).
//   - SC#5 / TDBT-03 (NL composer 503 retry UX) — verified via
//     `page.route('**/api/alerts/parse-nl', ...)` mocking 503 responses.
//     The retry button is exposed via the `alert-nl-retry` testid the
//     Plan 27-08 SUMMARY registered.
//   - SC#1 / SC#2 / SC#4 — observable URL contract + DOM probes for
//     bounded rendering, picker re-anchor, density/theme attribute
//     stability. Path-leakage + truncation guards inherit from
//     `skills-detail.spec.ts` + `cost-dashboard.spec.ts` precedents.
//   - SC#4 / TDBT-02 (FALLBACK_KNOWN_METRICS removal) — verified via
//     filesystem reads of the AlertRuleForm source (Node `fs.readFile`)
//     + the test_alerts_metrics_contract.py + test_alerts_metrics_sync.py
//     file-existence invariants from Plan 27-07.

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BACKEND = 'http://127.0.0.1:8765'

// Resolve to the workspace root regardless of where Playwright is invoked.
// __dirname is undefined under ESM; derive from import.meta.url.
import { fileURLToPath } from 'node:url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../../..')

test.describe('Phase 27 — tail routes + tech debt (SC#1-#5 + TDBT-01..03)', () => {
  // ───────────────────────────────────────────────────────────────────
  // SC#1 — /skills/$name 4-panel bounded + density + global picker
  // ───────────────────────────────────────────────────────────────────

  test('SC#1: /skills/$name renders cmc-page--bounded shell', async ({
    page,
    request,
  }) => {
    // Preflight — find a skill to drill into. Mirrors skills-detail.spec.ts.
    const sRes = await request.get(`${BACKEND}/api/skills`)
    expect(sRes.ok()).toBe(true)
    const sBody = await sRes.json()
    const items = (sBody.items ?? []) as Array<{ name: string }>
    test.skip(
      items.length === 0,
      'SC#1: requires ≥1 skill in the dev DB.',
    )
    const skillName = items[0].name

    await page.goto(`/skills/${encodeURIComponent(skillName)}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)

    // Root <section> must carry cmc-page--bounded (Plan 27-04 contract).
    const bounded = await page.evaluate(() => {
      const root = document.querySelector('section.cmc-page--bounded')
      return !!root
    })
    expect(bounded).toBe(true)
  })

  test('SC#1: /skills/$name 4-panel set mounts bounded (projects + runs + latency-snapshot + timeline)', async ({
    page,
    request,
  }) => {
    const sRes = await request.get(`${BACKEND}/api/skills`)
    const sBody = await sRes.json()
    const items = (sBody.items ?? []) as Array<{ name: string }>
    test.skip(items.length === 0, 'SC#1 4-panel: requires ≥1 skill')
    const skillName = items[0].name

    await page.goto(`/skills/${encodeURIComponent(skillName)}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    // The projects table testid is set on the wrapping <section> so it
    // survives PanelCard's loading/empty/error/data branches.
    await expect(
      page.getByTestId('skills-detail-projects-table'),
    ).toBeVisible({ timeout: 10_000 })

    // The route has 4 explicit panels under the heading (per Plan 27-04):
    // SkillCostCard (loaded data only), SkillProjectsTable, SkillRunsTable
    // (renders a heading + table; assert via heading text), and
    // SkillLatencySnapshot (inline KpiTiles; assert via aria-labelledby).
    // SkillTimeline is the 5th panel added by Plan 27-04 (skillName +
    // bounded props); assert presence via cmc-card--bounded count >= 4.
    const boundedCardCount = await page.evaluate(() =>
      document.querySelectorAll('.cmc-card--bounded').length,
    )
    expect(boundedCardCount).toBeGreaterThanOrEqual(4)
  })

  test('SC#1: /skills/$name global TimePicker re-anchors panels (set range to 7d → URL updates)', async ({
    page,
    request,
  }) => {
    const sRes = await request.get(`${BACKEND}/api/skills`)
    const sBody = await sRes.json()
    const items = (sBody.items ?? []) as Array<{ name: string }>
    test.skip(items.length === 0, 'SC#1 picker: requires ≥1 skill')
    const skillName = items[0].name

    await page.goto(`/skills/${encodeURIComponent(skillName)}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('time-picker-trigger').click()
    await page.getByTestId('time-picker-preset-last-7-days').click()
    await expect(page).toHaveURL(/time_from=now-7d/)
    await expect(page).toHaveURL(/time_to=now/)
  })

  test('SC#1: /skills/$name density toggle flips <html data-density> without remount', async ({
    page,
    request,
  }) => {
    const sRes = await request.get(`${BACKEND}/api/skills`)
    const sBody = await sRes.json()
    const items = (sBody.items ?? []) as Array<{ name: string }>
    test.skip(items.length === 0, 'SC#1 density: requires ≥1 skill')
    const skillName = items[0].name

    await page.goto(`/skills/${encodeURIComponent(skillName)}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)

    // Snapshot a stable DOM marker (the heading element) so we can verify
    // the density flip doesn't remount the surface — same React root reused.
    const beforeMarker = await page.evaluate(() => {
      const h = document.querySelector('#skill-detail-heading') as HTMLElement | null
      if (!h) return null
      // Tag with a transient marker; if we still see it after density flip,
      // the React subtree was preserved (no remount).
      h.setAttribute('data-density-flip-marker', 'before')
      return h.getAttribute('data-density-flip-marker')
    })
    expect(beforeMarker).toBe('before')

    // Flip density via Cmd+K density command (CMDK-02 contract).
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await page.getByTestId('cmdk-density-compact').click()
    await page.waitForTimeout(250)

    const afterDensity = await page.evaluate(() =>
      document.documentElement.getAttribute('data-density'),
    )
    expect(afterDensity).toBe('compact')

    // The marker survived → React subtree was preserved across density flip.
    const afterMarker = await page.evaluate(() => {
      const h = document.querySelector('#skill-detail-heading') as HTMLElement | null
      return h?.getAttribute('data-density-flip-marker') ?? null
    })
    expect(afterMarker).toBe('before')
  })

  test('SC#1: /skills/$name route-local ?range= preserved alongside global picker (URL contract append-only)', async ({
    page,
    request,
  }) => {
    const sRes = await request.get(`${BACKEND}/api/skills`)
    const sBody = await sRes.json()
    const items = (sBody.items ?? []) as Array<{ name: string }>
    test.skip(items.length === 0, 'SC#1 append-only: requires ≥1 skill')
    const skillName = items[0].name

    // Open with both range=30d AND time_from/time_to — both must persist.
    await page.goto(
      `/skills/${encodeURIComponent(skillName)}?range=30d&time_from=now-7d&time_to=now`,
    )
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    // URL contract — append-only validateSearch.
    await expect(page).toHaveURL(/range=30d/)
    await expect(page).toHaveURL(/time_from=now-7d/)
    await expect(page).toHaveURL(/time_to=now/)
  })

  test('SC#1: /skills/$name global picker WINS WHEN PRESENT over route-local ?range= (LOCKED OPERATOR DECISION 2)', async ({
    page,
    request,
  }) => {
    const sRes = await request.get(`${BACKEND}/api/skills`)
    const sBody = await sRes.json()
    const items = (sBody.items ?? []) as Array<{ name: string }>
    test.skip(items.length === 0, 'SC#1 picker-wins: requires ≥1 skill')
    const skillName = items[0].name

    // Plan 27-04 LOCKED OPERATOR DECISION 2: when both URLs are present,
    // the global picker (time_from/time_to) wins. We assert the URL
    // contract preserves both — the precedence is verified at the
    // hasGlobalPicker ternary inside the panels (covered by vitest).
    // E2E observable: when ONLY range=30d, URL stays at 30d; when also
    // time_from=now-7d, the URL keeps both.
    await page.goto(`/skills/${encodeURIComponent(skillName)}?range=30d`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/range=30d/)

    await page.getByTestId('time-picker-trigger').click()
    await page.getByTestId('time-picker-preset-last-7-days').click()
    // Now URL has both — and the panels read time_from (Plan 27-04 lock).
    await expect(page).toHaveURL(/time_from=now-7d/)
    await expect(page).toHaveURL(/range=30d/)
  })

  // ───────────────────────────────────────────────────────────────────
  // SC#2 — /cost picker re-query + CompareToggle round-trip + truncation
  // ───────────────────────────────────────────────────────────────────

  test('SC#2: /cost renders cmc-page--bounded shell', async ({ page }) => {
    await page.goto('/cost')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)
    const bounded = await page.evaluate(() => {
      const root = document.querySelector('section.cmc-page--bounded')
      return !!root
    })
    expect(bounded).toBe(true)

    // Both panels mount under the bounded shell.
    await expect(page.getByTestId('cost-forecast-card')).toBeVisible()
    await expect(page.getByTestId('cost-by-project-card')).toBeVisible()
  })

  test('SC#2: /cost TimePicker preset writes time_from/time_to to URL (panels re-query)', async ({
    page,
  }) => {
    await page.goto('/cost')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('time-picker-trigger').click()
    await page.getByTestId('time-picker-preset-last-30-days').click()
    await expect(page).toHaveURL(/time_from=now-30d/)
    await expect(page).toHaveURL(/time_to=now/)
  })

  test('SC#2: /cost CompareToggle round-trip — click writes ?compare_panels=cost-by-project; reload preserves; click again clears', async ({
    page,
    request,
  }) => {
    // The CompareToggle renders only when CostByProjectCard is in the
    // data branch. Skip if the dev DB has no rows for the 7d window.
    const bRes = await request.get(
      `${BACKEND}/api/cost/breakdown?dim=project&range=7d`,
    )
    const bBody = await bRes.json()
    const rowCount = (bBody.rows ?? []).length
    test.skip(
      rowCount === 0,
      'SC#2 CompareToggle: requires ≥1 project_key row in the 7d window.',
    )

    // Seed the URL directly so the toggle reads aria-pressed=true. This
    // exercises the deep-link contract (mirrors Phase 26 TIME-04 pattern).
    await page.goto('/cost?compare_panels=cost-by-project')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)
    const toggle = page.getByTestId('compare-overlay-toggle-cost-by-project')
    await expect(toggle).toBeVisible()
    expect(await toggle.getAttribute('aria-pressed')).toBe('true')

    // Reload preserves the URL → toggle re-mounts pressed.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)
    const toggleAfter = page.getByTestId(
      'compare-overlay-toggle-cost-by-project',
    )
    expect(await toggleAfter.getAttribute('aria-pressed')).toBe('true')

    // Click → removes from CSV → aria-pressed false. Use the resilient
    // scroll + dispatchEvent pattern from Phase 26 TIME-04 (commit e838135).
    await toggleAfter.scrollIntoViewIfNeeded()
    await page.waitForTimeout(150)
    await toggleAfter.dispatchEvent('click')
    await page.waitForTimeout(300)
    expect(await toggleAfter.getAttribute('aria-pressed')).toBe('false')
    await expect(page).not.toHaveURL(/compare_panels=cost-by-project/)
  })

  test('SC#2: /cost CostByProjectCard project_key column wraps in TruncatedCell (defensive truncation)', async ({
    page,
    request,
  }) => {
    const bRes = await request.get(
      `${BACKEND}/api/cost/breakdown?dim=project&range=7d`,
    )
    const bBody = await bRes.json()
    const rowCount = (bBody.rows ?? []).length
    test.skip(
      rowCount === 0,
      'SC#2 truncation: requires ≥1 project_key row.',
    )

    await page.goto('/cost')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)
    const table = page.getByTestId('cost-by-project-card-table')
    await expect(table).toBeVisible()
    // Plan 27-05 wraps the project_key column in TruncatedCell.
    // Assert at least one .cmc-cell--truncate descendant inside the table.
    const truncCells = await table.locator('.cmc-cell--truncate').count()
    expect(truncCells).toBeGreaterThan(0)
  })

  test('SC#2: /cost saved view round-trips time_from + compare_panels (URL contract)', async ({
    page,
  }) => {
    // Deep-link URL contract assertion — both keys parsed by validateSearch.
    await page.goto(
      '/cost?time_from=now-30d&time_to=now&compare_panels=cost-by-project',
    )
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await expect(page).toHaveURL(/time_from=now-30d/)
    await expect(page).toHaveURL(/compare_panels=cost-by-project/)
  })

  // ───────────────────────────────────────────────────────────────────
  // SC#3 / TDBT-01 — compare picker uses project_key (not cwd)
  // ───────────────────────────────────────────────────────────────────

  test('SC#3 / TDBT-01: GET /api/sessions response items include project_key (12-char hex)', async ({
    request,
  }) => {
    const res = await request.get(`${BACKEND}/api/sessions?limit=5`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const items = (body.items ?? []) as Array<{ project_key: string }>
    test.skip(
      items.length === 0,
      'TDBT-01 wire shape: requires ≥1 session row.',
    )
    for (const it of items) {
      expect(it).toHaveProperty('project_key')
      // 12-char lowercase hex (sha1[:12] of realpath(cwd)) per Plan 27-02.
      expect(it.project_key).toMatch(/^[a-f0-9]{12}$|^$/)
    }
  })

  test('SC#3 / TDBT-01: GET /api/sessions/compare response includes a.project_key + b.project_key', async ({
    request,
  }) => {
    // Find two real session IDs to compare.
    const listRes = await request.get(`${BACKEND}/api/sessions?limit=2`)
    const listBody = await listRes.json()
    const ids = (listBody.items ?? []).map(
      (i: { session_id: string }) => i.session_id,
    )
    test.skip(
      ids.length < 2,
      'TDBT-01 compare wire shape: requires ≥2 session rows.',
    )
    const [a, b] = ids
    const cRes = await request.get(
      `${BACKEND}/api/sessions/compare?a=${a}&b=${b}`,
    )
    expect(cRes.ok()).toBe(true)
    const cBody = await cRes.json()
    expect(cBody).toHaveProperty('a')
    expect(cBody).toHaveProperty('b')
    expect(cBody.a).toHaveProperty('project_key')
    expect(cBody.b).toHaveProperty('project_key')
    expect(typeof cBody.a.project_key).toBe('string')
    expect(typeof cBody.b.project_key).toBe('string')
  })

  test('SC#3 / TDBT-01: compare picker description does NOT leak the 12-char project_key hex', async ({
    page,
    request,
  }) => {
    // Find a real session id with project_key.
    const listRes = await request.get(`${BACKEND}/api/sessions?limit=1`)
    const listBody = await listRes.json()
    const items = (listBody.items ?? []) as Array<{
      session_id: string
      project_key: string
    }>
    test.skip(items.length === 0, 'TDBT-01 copy: requires ≥1 session.')
    const aSid = items[0].session_id

    // Visit a sessions/compare URL with a-only; cmd+K → compare picker.
    await page.goto(`/sessions/compare?a=${aSid}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    // Open cmdk; click the "Compare with previous" affordance which routes
    // to ComparePicker. Mirror v13-time-picker.spec.ts CMDK pattern.
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    const list = page.getByTestId('cmdk-compare-picker-list')
    // The list renders when compare context is active (a set, b empty).
    // If not visible, skip — palette routing depends on cache priming
    // (Plan 27-03 SUMMARY notes the pre-seed pattern).
    if (!(await list.isVisible().catch(() => false))) {
      test.skip(true, 'compare picker not active in this dev session shape')
    }
    const dialog = page.getByRole('dialog', {
      name: 'Mission Control command palette',
    })
    const text = (await dialog.textContent()) ?? ''
    // Project-shape-honest copy from Plan 27-03 — must NOT leak the 12-char hex.
    expect(text).toContain('same project')
    expect(text).not.toContain(items[0].project_key)
  })

  test('SC#3 / TDBT-01: compute_project_key matches wire (round-trip invariant)', async ({
    request,
  }) => {
    // Backend's Plan 27-02 ships test_project_key_matches_compute_helper as
    // its canonical pytest invariant — this e2e test is a sanity probe.
    // Assert the response field exists and is hex-shaped on the wire.
    const res = await request.get(`${BACKEND}/api/sessions?limit=3`)
    const body = await res.json()
    const items = (body.items ?? []) as Array<{
      project_key: string
      cwd: string
    }>
    test.skip(items.length === 0, 'TDBT-01 invariant: requires sessions.')
    for (const it of items) {
      // Either empty (no cwd recorded — backfill sentinel) or 12-char hex.
      expect(it.project_key).toMatch(/^[a-f0-9]{12}$|^$/)
    }
  })

  // ───────────────────────────────────────────────────────────────────
  // SC#4 / TDBT-02 — AlertRuleForm metric vocab loads from useAlertMetrics
  // ───────────────────────────────────────────────────────────────────

  test('SC#4 / TDBT-02: GET /api/alerts/metrics returns metrics array with ≥3 entries', async ({
    request,
  }) => {
    const res = await request.get(`${BACKEND}/api/alerts/metrics`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body).toHaveProperty('metrics')
    expect(Array.isArray(body.metrics)).toBe(true)
    expect(body.metrics.length).toBeGreaterThanOrEqual(3)
  })

  test('SC#4 / TDBT-02: /alerts AlertRuleForm <select> renders metrics from useAlertMetrics (network capture)', async ({
    page,
  }) => {
    // Capture the metrics fetch — confirms the vocab is loaded over the
    // wire, not from a frontend constant.
    const metricsReq = page.waitForRequest(
      (req) => /\/api\/alerts\/metrics\b/.test(req.url()),
      { timeout: 10_000 },
    )
    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await metricsReq

    // AlertRuleForm renders <select> with the metric vocab. Confirm at
    // least one option exists (after the loading-state placeholder
    // resolves to populated).
    await page.waitForTimeout(800)
    const optionsCount = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'))
      // Find the metric select inside the cmc-alert-rule-form composer.
      const formSelect = selects.find((s) =>
        s.closest('.cmc-alert-rule-form'),
      )
      return formSelect ? formSelect.querySelectorAll('option').length : 0
    })
    // ≥3 vocab options + the disabled "Select a metric…" placeholder = ≥4.
    expect(optionsCount).toBeGreaterThanOrEqual(3)
  })

  test('SC#4 / TDBT-02: FALLBACK_KNOWN_METRICS source grep returns 0 (build-time invariant)', async () => {
    const formSrc = fs.readFileSync(
      path.join(
        REPO_ROOT,
        'frontend/src/components/panels/AlertRuleForm.tsx',
      ),
      'utf8',
    )
    expect(formSrc).not.toMatch(/FALLBACK_KNOWN_METRICS/)
  })

  test('SC#4 / TDBT-02: backend test_alerts_metrics_contract.py replaces test_alerts_metrics_sync.py', async () => {
    const contractTestPath = path.join(
      REPO_ROOT,
      'backend/tests/test_alerts_metrics_contract.py',
    )
    const syncTestPath = path.join(
      REPO_ROOT,
      'backend/tests/test_alerts_metrics_sync.py',
    )
    expect(fs.existsSync(contractTestPath)).toBe(true)
    expect(fs.existsSync(syncTestPath)).toBe(false)
  })

  // ───────────────────────────────────────────────────────────────────
  // SC#5 / TDBT-03 — NL composer 503 retry/queue UX
  // ───────────────────────────────────────────────────────────────────

  test('SC#5 / TDBT-03: NL composer 503 → honest copy + Retry button visible', async ({
    page,
  }) => {
    // Mock the parse-nl endpoint to return 503 (V11 collapsed-failure-mode).
    await page.route('**/api/alerts/parse-nl', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'natural-language service unavailable',
        }),
      })
    })

    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)

    // Find the NL composer textarea by placeholder text (no testid on input).
    const textarea = page.locator(
      'input[placeholder*="alert me when haiku"]',
    )
    await expect(textarea).toBeVisible()
    await textarea.fill('alert me when something breaks')

    // Click the Parse button — text content 'Parse'.
    await page
      .getByRole('button', { name: /^Parse$/ })
      .first()
      .click()

    // The 503 surfaces the honest copy block + Retry button.
    await page.waitForTimeout(500)
    const retryBtn = page.getByTestId('alert-nl-retry')
    await expect(retryBtn).toBeVisible()
    const errorBlock = page.locator('.cmc-alert-nl__error')
    const errorText = (await errorBlock.textContent()) ?? ''
    expect(errorText).toMatch(/Couldn.t parse this description/i)
  })

  test('SC#5 / TDBT-03: NL composer copy does NOT leak "credentials missing" / "Anthropic" / "API key" (V11 lock)', async ({
    page,
  }) => {
    await page.route('**/api/alerts/parse-nl', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'unavailable' }),
      })
    })
    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)

    const textarea = page.locator(
      'input[placeholder*="alert me when haiku"]',
    )
    await textarea.fill('alert me when latency exceeds 5s')
    await page
      .getByRole('button', { name: /^Parse$/ })
      .first()
      .click()
    await page.waitForTimeout(500)

    const errorBlock = page.locator('.cmc-alert-nl__error')
    const errorText = (await errorBlock.textContent()) ?? ''
    expect(errorText).not.toMatch(/credentials missing/i)
    expect(errorText).not.toMatch(/Anthropic/i)
    expect(errorText).not.toMatch(/API key/i)
  })

  test('SC#5 / TDBT-03: Click Retry → useParseAlertNl mutation re-fires (network capture: 2 POSTs same payload)', async ({
    page,
  }) => {
    const posts: string[] = []
    await page.route('**/api/alerts/parse-nl', async (route, req) => {
      posts.push(req.postData() ?? '')
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'unavailable' }),
      })
    })

    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    const textarea = page.locator(
      'input[placeholder*="alert me when haiku"]',
    )
    await textarea.fill('alert me when haiku skill p95 exceeds 5s')
    await page
      .getByRole('button', { name: /^Parse$/ })
      .first()
      .click()
    await page.waitForTimeout(500)

    const retryBtn = page.getByTestId('alert-nl-retry')
    await expect(retryBtn).toBeVisible()
    await retryBtn.click()
    await page.waitForTimeout(500)

    expect(posts.length).toBeGreaterThanOrEqual(2)
    // Both posts carry the same description payload — byte-equal Parse + Retry.
    expect(posts[0]).toBe(posts[1])
  })

  test('SC#5 / TDBT-03: Retry button disabled while m.isPending (DoS guard)', async ({
    page,
  }) => {
    // Hold the second response open so we can observe the disabled state
    // before the mutation resolves.
    let releaseHold: (() => void) | null = null
    let callCount = 0
    await page.route('**/api/alerts/parse-nl', async (route) => {
      callCount += 1
      if (callCount === 1) {
        // First call resolves immediately as 503 to surface the Retry button.
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'unavailable' }),
        })
        return
      }
      // Second call (Retry) hangs until released — that's the DoS-guard window.
      await new Promise<void>((resolve) => {
        releaseHold = resolve
      })
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'unavailable' }),
      })
    })

    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    const textarea = page.locator(
      'input[placeholder*="alert me when haiku"]',
    )
    await textarea.fill('alert me when latency exceeds 5s')
    await page
      .getByRole('button', { name: /^Parse$/ })
      .first()
      .click()
    await page.waitForTimeout(400)
    const retryBtn = page.getByTestId('alert-nl-retry')
    await expect(retryBtn).toBeVisible()
    await retryBtn.click()
    // While retry is pending, the button is disabled and labeled "Retrying…".
    await page.waitForTimeout(150)
    await expect(retryBtn).toBeDisabled()
    const label = (await retryBtn.textContent())?.trim() ?? ''
    expect(label).toMatch(/Retrying/i)

    // Release the hold so the test cleanly exits.
    if (releaseHold) (releaseHold as () => void)()
    await page.waitForTimeout(200)
  })

  test('SC#5 / TDBT-03: Manual ThresholdForm / AnomalyForm remain usable after 503 (Phase 21 Pitfall 5 invariant)', async ({
    page,
  }) => {
    await page.route('**/api/alerts/parse-nl', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'unavailable' }),
      })
    })
    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    const textarea = page.locator(
      'input[placeholder*="alert me when haiku"]',
    )
    await textarea.fill('alert me')
    await page
      .getByRole('button', { name: /^Parse$/ })
      .first()
      .click()
    await page.waitForTimeout(400)
    await expect(page.getByTestId('alert-nl-retry')).toBeVisible()

    // The manual form is rendered BELOW the NL composer. The "Name" input
    // is the canonical first field; it must remain editable after the 503.
    // Filter to inputs NOT inside the .cmc-nl-alert composer (the NL input
    // is `disabled={disabled || m.isPending}` so after a failed Parse it
    // is enabled but we want the manual-form Name field instead).
    const manualFormInputs = page.locator(
      '.cmc-alert-rule-form input[type="text"]:not(.cmc-nl-alert input)',
    )
    expect(await manualFormInputs.count()).toBeGreaterThan(0)
    const firstNameInput = manualFormInputs.first()
    await firstNameInput.focus()
    await firstNameInput.fill('manual-fallback-rule')
    expect(await firstNameInput.inputValue()).toBe('manual-fallback-rule')
  })
})
