// Phase 28 Plan 01 — Layout Customization e2e skeleton.
//
// Maps 1:1 to LAYO-01 / LAYO-02 / LAYO-03 / LAYO-04 requirements. Pattern
// mirrors `v13-tail-routes.spec.ts` (Phase 27 Plan 09) — a single
// `test.describe('Phase 28 — Layout Customization', ...)` block with
// nested groups per REQ id + one extra group for the saved-view
// round-trip + one for the ResponsiveContainer DOM-identity perf gate.
//
// EVERY test below is `test.skip(...)` at Wave 0 commit time. Wave 2
// (Plan 28-03 / hide), Wave 2 (Plan 28-04 / reorder), Wave 3 (Plan
// 28-05 / split-pane), Wave 4 (Plan 28-02 / SavedViewMenu reset) flip
// `test.skip` → `test` and implement. The `// TODO Wave N` comments
// inside each body name the implementing plan number.
//
// Selectors below reference the testid families registered by Task 3 of
// this plan in `docs/testid-registry.md`:
//   - panel-header-menu-{panelId}
//   - panel-hide-{panelId}
//   - panel-drag-grip-{panelId}
//   - panel-reset-layout-{route}
//   - resize-handle-{groupId}
//   - panel-grid-{columnId}
//
// CRITICAL: do NOT import any source modules that do not yet exist —
// the spec MUST list cleanly under `pnpm exec playwright test --list`
// at commit time so the verify command can count `.skip` entries.

import { test, expect } from '@playwright/test'
import type { Page, APIRequestContext } from '@playwright/test'

const BACKEND_API = 'http://127.0.0.1:8765'

/**
 * Fetch two session ids from the backend for LAYO-03 / perf-probe tests on
 * `/sessions/compare`. Mirrors the pattern shipped in
 * `frontend/tests/e2e/sessions-compare.spec.ts` (range=30d so we look as far
 * back as possible — LAYO-03 tests don't need the SessionsTable 7d window
 * since they navigate to /sessions/compare directly). Returns null when the
 * dev DB has fewer than 2 sessions — caller skips with Plan 27-09 pattern.
 */
async function getCompareSessionIds(
  request: APIRequestContext,
): Promise<{ a: string; b: string } | null> {
  const res = await request.get(`${BACKEND_API}/api/sessions?range=30d&limit=5`)
  if (!res.ok()) return null
  const body = (await res.json()) as {
    items?: Array<{ session_id: string }>
  }
  const ids = (body.items ?? []).map((s) => s.session_id)
  if (ids.length < 2) return null
  return { a: ids[0], b: ids[1] }
}

/** Pointer-drag the resize handle by `dx` pixels (positive = rightward). */
async function dragSeparator(page: Page, dx: number): Promise<void> {
  const handle = page.locator('[data-testid="resize-handle-compare"]').first()
  const box = await handle.boundingBox()
  if (!box) throw new Error('resize-handle-compare has no bounding box')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + dx, startY, { steps: 10 })
  await page.mouse.up()
}

test.describe('Phase 28 — Layout Customization (LAYO-01..04)', () => {
  // ───────────────────────────────────────────────────────────────────
  // LAYO-01 — Hide panels with URL persistence
  // 5 routes × 1 hide-and-persist journey each = 5 skipped tests.
  // ───────────────────────────────────────────────────────────────────
  test.describe('LAYO-01 hide-and-persist', () => {
    test('/: hide System Pressure persists across reload via ?hidden_panels', async ({ page }) => {
      // Plan 28-03 / LAYO-01: hide-and-persist on `/` with system-pressure.
      // 1. Bare URL → panel visible (data-panel-id=system-pressure mounted).
      // 2. Open PanelHeaderMenu via the Settings trigger → click "Hide".
      // 3. Assert URL has ?hidden_panels=system-pressure AND DOM no longer
      //    contains data-panel-id="system-pressure".
      // 4. Reload → assert both invariants still hold (validateSearch
      //    APPEND-ONLY pass-through).
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Pre-condition: the panel is mounted.
      await expect(
        page.locator('[data-panel-id="system-pressure"]'),
      ).toBeVisible()

      // Open the per-panel chrome menu + click Hide.
      await page.getByTestId('panel-header-menu-system-pressure').click()
      await page.getByTestId('panel-hide-system-pressure').click()

      // URL gains the hidden_panels CSV (single entry today).
      await expect(page).toHaveURL(/hidden_panels=system-pressure/)
      await expect(
        page.locator('[data-panel-id="system-pressure"]'),
      ).toHaveCount(0)

      // Reload — URL persists; render-time filter re-applies.
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await expect(page).toHaveURL(/hidden_panels=system-pressure/)
      await expect(
        page.locator('[data-panel-id="system-pressure"]'),
      ).toHaveCount(0)
    })

    test('/activity: hide Heatmap persists across reload via ?hidden_panels', async ({ page }) => {
      // Plan 28-03 / LAYO-01: hide-and-persist on `/activity` with
      // activity-heatmap. Identical 4-step shape as the / and /cost tests
      // shipped by Task 2a (Phase-28 consistency lint).
      await page.goto('/activity')
      await page.waitForLoadState('domcontentloaded')

      await expect(
        page.locator('[data-panel-id="activity-heatmap"]'),
      ).toBeVisible()

      await page.getByTestId('panel-header-menu-activity-heatmap').click()
      await page.getByTestId('panel-hide-activity-heatmap').click()

      await expect(page).toHaveURL(/hidden_panels=activity-heatmap/)
      await expect(
        page.locator('[data-panel-id="activity-heatmap"]'),
      ).toHaveCount(0)

      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await expect(page).toHaveURL(/hidden_panels=activity-heatmap/)
      await expect(
        page.locator('[data-panel-id="activity-heatmap"]'),
      ).toHaveCount(0)
    })

    test('/cost: hide CostByProjectCard persists across reload via ?hidden_panels', async ({ page }) => {
      // Plan 28-03 / LAYO-01: hide-and-persist on `/cost` with cost-by-project.
      // Mirror of the `/` test above — same 4-step navigate-click-assert-reload
      // pattern. /cost is the cleanest Plan-28 test fixture (2 panels only).
      await page.goto('/cost')
      await page.waitForLoadState('domcontentloaded')

      await expect(
        page.locator('[data-panel-id="cost-by-project"]'),
      ).toBeVisible()

      await page.getByTestId('panel-header-menu-cost-by-project').click()
      await page.getByTestId('panel-hide-cost-by-project').click()

      await expect(page).toHaveURL(/hidden_panels=cost-by-project/)
      await expect(
        page.locator('[data-panel-id="cost-by-project"]'),
      ).toHaveCount(0)

      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await expect(page).toHaveURL(/hidden_panels=cost-by-project/)
      await expect(
        page.locator('[data-panel-id="cost-by-project"]'),
      ).toHaveCount(0)
    })

    test('/skills: hide TopSkillsCard persists across reload via ?hidden_panels', async ({ page }) => {
      // Plan 28-03 / LAYO-01: hide-and-persist on `/skills`. Targets the
      // `decisions` panel — full-width at the top of the page where
      // .cmc-main scroll container does NOT intercept pointer events.
      // The Plan 28-01 skeleton named `task-board` and a later attempt to
      // route around an awaiting-approval banner overlay tried
      // `context-health` — both intercepted by the .cmc-main scroller's
      // overflow on the much-taller /skills layout. `decisions` sits
      // above .cmc-card-grid and inside the visible viewport without scroll.
      await page.goto('/skills')
      await page.waitForLoadState('domcontentloaded')

      await expect(
        page.locator('[data-panel-id="decisions"]'),
      ).toBeVisible()

      await page.getByTestId('panel-header-menu-decisions').click()
      await page.getByTestId('panel-hide-decisions').click()

      await expect(page).toHaveURL(/hidden_panels=decisions/)
      await expect(
        page.locator('[data-panel-id="decisions"]'),
      ).toHaveCount(0)

      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await expect(page).toHaveURL(/hidden_panels=decisions/)
      await expect(
        page.locator('[data-panel-id="decisions"]'),
      ).toHaveCount(0)
    })

    test('/alerts: hide AlertEventsList persists across reload via ?hidden_panels', async ({ page }) => {
      // Plan 28-03 / LAYO-01: hide-and-persist on `/alerts` with
      // alert-events-list.
      await page.goto('/alerts')
      await page.waitForLoadState('domcontentloaded')

      await expect(
        page.locator('[data-panel-id="alert-events-list"]'),
      ).toBeVisible()

      await page.getByTestId('panel-header-menu-alert-events-list').click()
      await page.getByTestId('panel-hide-alert-events-list').click()

      await expect(page).toHaveURL(/hidden_panels=alert-events-list/)
      await expect(
        page.locator('[data-panel-id="alert-events-list"]'),
      ).toHaveCount(0)

      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await expect(page).toHaveURL(/hidden_panels=alert-events-list/)
      await expect(
        page.locator('[data-panel-id="alert-events-list"]'),
      ).toHaveCount(0)
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // LAYO-02 — Reorder panels (mouse drag + keyboard grab-mode)
  // 2 mouse-drag + 2 keyboard reorder = 4 skipped tests.
  // ───────────────────────────────────────────────────────────────────
  test.describe('LAYO-02 reorder', () => {
    test('/cost: mouse drag moves cost-by-project before cost-forecast (panel_order URL)', async ({
      page,
    }) => {
      // Plan 28-04 / LAYO-02: mouse-drag reorder via Playwright's high-level
      // dragTo API. /cost is the simplest route — single 'main' column with
      // two panels. After dragging the cost-by-project grip onto the
      // cost-forecast wrapper, the URL must gain
      // ?panel_order=main:cost-by-project,cost-forecast (the dropped panel
      // takes the target's slot; the original head shifts down).
      await page.goto('/cost')
      await page.waitForLoadState('domcontentloaded')

      // Pre-condition: both panels mounted in default order.
      await expect(
        page.locator('[data-panel-id="cost-forecast"]'),
      ).toBeVisible()
      await expect(
        page.locator('[data-panel-id="cost-by-project"]'),
      ).toBeVisible()

      // Drag the cost-by-project grip onto the cost-forecast wrapper.
      // The wrapper lives at [data-panel-id=...] (not the grip itself).
      await page
        .locator('[data-testid="panel-drag-grip-cost-by-project"]')
        .dragTo(page.locator('[data-panel-id="cost-forecast"]'))

      // URL gains panel_order=main:cost-by-project,cost-forecast
      await expect(page).toHaveURL(/panel_order=main%3Acost-by-project%2Ccost-forecast|panel_order=main:cost-by-project,cost-forecast/)
    })

    test('/: keyboard reorder writes panel_order on the larger route', async ({
      page,
    }) => {
      // Plan 28-04 / LAYO-02 keyboard-path coverage on `/` (the larger
      // route — main column has 11 panels). Mouse-drag on `/` is unreliable
      // in Playwright because the SystemHealthStrip + KpiRow + AttentionBar +
      // LiveSessionsCard top-strip pushes the main grid below the fold
      // (and the `.cmc-main` scroll container intercepts pointer events
      // mid-drag, same flake Plan 28-03 SUMMARY documented on /skills).
      // Keyboard reorder is deterministic — focus the first main-column
      // grip + Space + ArrowDown + Enter, regardless of scroll position.
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      const grip = page.locator(
        '[data-testid="panel-drag-grip-token-usage"]',
      )
      await grip.focus()
      await page.keyboard.press(' ')
      await expect(grip).toHaveAttribute('aria-pressed', 'true')
      await page.keyboard.press('ArrowDown')
      // URL gains panel_order=main:...
      await expect(page).toHaveURL(/panel_order=main/)
      await page.keyboard.press('Enter')
      await expect(grip).toHaveAttribute('aria-pressed', 'false')
    })

    test('/cost: keyboard reorder via Space → ArrowDown → Enter writes panel_order', async ({
      page,
    }) => {
      // Plan 28-04 / LAYO-02 keyboard-path: Tab is unreliable in Playwright
      // (focus order depends on the entire tree). Use the grip's testid +
      // .focus() to land deterministically on the grip, then press Space
      // (grab), ArrowDown (move +1), Enter (commit).
      await page.goto('/cost')
      await page.waitForLoadState('domcontentloaded')

      const grip = page.locator(
        '[data-testid="panel-drag-grip-cost-forecast"]',
      )
      await grip.focus()
      await expect(grip).toHaveAttribute('aria-pressed', 'false')

      // Grab mode on.
      await page.keyboard.press(' ')
      await expect(grip).toHaveAttribute('aria-pressed', 'true')

      // aria-live region announces the grab.
      await expect(page.getByRole('status').first()).toContainText(
        /Cost forecast grabbed.*Position 1 of 2/i,
      )

      // ArrowDown moves cost-forecast from index 0 → 1.
      await page.keyboard.press('ArrowDown')

      // URL must now have panel_order=main:cost-by-project,cost-forecast.
      await expect(page).toHaveURL(
        /panel_order=main%3Acost-by-project%2Ccost-forecast|panel_order=main:cost-by-project,cost-forecast/,
      )

      // Enter commits: aria-pressed flips back to false.
      await page.keyboard.press('Enter')
      await expect(grip).toHaveAttribute('aria-pressed', 'false')
    })

    test('/cost: keyboard Escape cancels grab-mode without writing URL', async ({
      page,
    }) => {
      // Plan 28-04 / LAYO-02 keyboard-cancel: focus the grip, press Space
      // (grab), press Escape (cancel). aria-pressed must flip back to
      // false AND the URL must NOT gain panel_order.
      await page.goto('/cost')
      await page.waitForLoadState('domcontentloaded')

      const grip = page.locator(
        '[data-testid="panel-drag-grip-cost-forecast"]',
      )
      await grip.focus()
      await page.keyboard.press(' ')
      await expect(grip).toHaveAttribute('aria-pressed', 'true')

      await page.keyboard.press('Escape')
      await expect(grip).toHaveAttribute('aria-pressed', 'false')
      await expect(page).not.toHaveURL(/panel_order=/)
      await expect(page.getByRole('status').first()).toContainText(
        /cancelled/i,
      )
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // LAYO-03 — Split-pane resize on /sessions/compare
  // 3 skipped tests: resize persists, refresh preserves, double-click resets.
  // ───────────────────────────────────────────────────────────────────
  test.describe('LAYO-03 split-pane', () => {
    test('/sessions/compare: pointer drag on resize-handle writes ?split_sizes', async ({
      page,
      request,
    }) => {
      // Plan 28-05 / LAYO-03 SC#1: drag → URL gains split_sizes=compare:a,b on
      // release. CRITICAL Pitfall 6: writes fire on onLayoutChanged (release-
      // only), NOT onLayoutChange (per-pointer-tick). The wrapper subscribes
      // only to onLayoutChanged so URL updates exactly once at pointerup.
      const ids = await getCompareSessionIds(request)
      test.skip(
        ids === null,
        'LAYO-03: requires ≥2 sessions in DB (range=30d). Run `cmc sync` to ingest local sessions.',
      )
      if (!ids) return

      await page.goto(`/sessions/compare?a=${ids.a}&b=${ids.b}`)
      const handle = page.locator('[data-testid="resize-handle-compare"]').first()
      await expect(handle).toBeVisible({ timeout: 10_000 })

      await dragSeparator(page, 200)

      // URL search params are URL-encoded — `:` becomes `%3A`, `,` becomes
      // `%2C`. The regex covers both encoded and unencoded forms because
      // the Playwright URL-set may surface either depending on history API
      // mutation timing.
      await expect(page).toHaveURL(
        /split_sizes=compare(?::|%3A)\d+(?:,|%2C)\d+/,
        { timeout: 5_000 },
      )
      const url = new URL(page.url())
      // URL.searchParams.get() returns the DECODED value — `compare:71,29`.
      const sizes = url.searchParams.get('split_sizes')
      expect(sizes).toMatch(/^compare:\d+,\d+$/)
      const [, pair] = sizes!.split(':')
      const [left] = pair.split(',').map(Number)
      // Rightward drag → left pane grew. Use a permissive threshold (>55)
      // because the actual delta depends on container width and library
      // clamping, but the direction MUST be preserved.
      expect(left).toBeGreaterThan(55)
    })

    test('/sessions/compare: refresh after resize preserves split percentages', async ({
      page,
      request,
    }) => {
      // Plan 28-05 / LAYO-03 SC#2: deep-link with ?split_sizes=compare:70,30
      // restores 70/30 layout (URL → defaultLayout → Group).
      const ids = await getCompareSessionIds(request)
      test.skip(
        ids === null,
        'LAYO-03: requires ≥2 sessions in DB (range=30d). Run `cmc sync` to ingest local sessions.',
      )
      if (!ids) return

      await page.goto(
        `/sessions/compare?a=${ids.a}&b=${ids.b}&split_sizes=compare:70,30`,
      )
      // Wait for the panel children (mounted by react-resizable-panels with
      // id={id-prop} which the library also emits as data-testid).
      const sideA = page.locator('#side-a').first()
      const sideB = page.locator('#side-b').first()
      await expect(sideA).toBeVisible({ timeout: 10_000 })
      await expect(sideB).toBeVisible({ timeout: 10_000 })

      const boxA = await sideA.boundingBox()
      const boxB = await sideB.boundingBox()
      if (!boxA || !boxB) throw new Error('side panels have no bounding boxes')
      const ratio = boxA.width / (boxA.width + boxB.width)
      // 70/30 with ±5% tolerance — library clamping + flex-basis rounding
      // can drift a few percent on narrow viewports.
      expect(ratio).toBeGreaterThan(0.65)
      expect(ratio).toBeLessThan(0.75)
    })

    test('/sessions/compare: double-click on resize-handle resets to 50/50 (no split_sizes in URL)', async ({
      page,
      request,
    }) => {
      // Plan 28-05 / LAYO-03 SC#3: double-click prune. The library's
      // built-in dblclick handler resets adjacent Panels to their defaultSize
      // and fires onLayoutChanged with the default-matching sizes. The
      // wrapper detects the match and calls setSplit(groupId, null) which
      // removes the URL param entirely (NOT stored as compare:50,50 —
      // Pitfall 2 bare-URL gate).
      const ids = await getCompareSessionIds(request)
      test.skip(
        ids === null,
        'LAYO-03: requires ≥2 sessions in DB (range=30d). Run `cmc sync` to ingest local sessions.',
      )
      if (!ids) return

      await page.goto(
        `/sessions/compare?a=${ids.a}&b=${ids.b}&split_sizes=compare:70,30`,
      )
      const handle = page.locator('[data-testid="resize-handle-compare"]').first()
      await expect(handle).toBeVisible({ timeout: 10_000 })
      // URL params are URL-encoded by the router on initial commit — accept
      // either encoded (%3A / %2C) or unencoded (: / ,) for the regex.
      await expect(page).toHaveURL(
        /split_sizes=compare(?::|%3A)70(?:,|%2C)30/,
      )

      await handle.dblclick()

      await page.waitForFunction(
        () => !window.location.search.includes('split_sizes'),
        undefined,
        { timeout: 5_000 },
      )
      expect(page.url()).not.toContain('split_sizes')
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // LAYO-04 — Reset layout (per-panel menu + SavedViewMenu chrome)
  // 2 skipped tests: per-panel reset + SavedViewMenu reset.
  // Both MUST preserve time_from/time_to/compare_panels (Pitfall 11).
  // ───────────────────────────────────────────────────────────────────
  test.describe('LAYO-04 reset', () => {
    test('/cost: per-panel Reset layout clears hidden_panels/panel_order/split_sizes and preserves time/compare', async ({ page }) => {
      // Plan 28-03 / LAYO-04 per-panel reset half — proves PanelHeaderMenu's
      // Reset layout item invokes useLayoutState.reset(), which uses a
      // destructuring-delete pattern to clear ONLY the three layout keys
      // (hidden_panels, panel_order, split_sizes) while preserving every
      // other search key (time_from/time_to/compare_panels — LAYO-04 SC#3
      // / Pitfall 11). The route lands with all three layout keys + the
      // three non-layout keys in the URL; after Reset the URL keeps only
      // the non-layout three. The sonner toast is asserted via getByText
      // (mounted in document.body via Toaster portal).
      await page.goto(
        '/cost?time_from=now-7d&time_to=now&compare_panels=cost-forecast&hidden_panels=cost-by-project&panel_order=main:cost-forecast,cost-by-project',
      )
      await page.waitForLoadState('domcontentloaded')

      // Pre-condition: cost-by-project hidden by hidden_panels=cost-by-project.
      await expect(
        page.locator('[data-panel-id="cost-by-project"]'),
      ).toHaveCount(0)
      // cost-forecast remains visible — its PanelHeaderMenu is the one we
      // use to trigger Reset.
      await expect(
        page.locator('[data-panel-id="cost-forecast"]'),
      ).toBeVisible()

      await page.getByTestId('panel-header-menu-cost-forecast').click()
      await page.getByTestId('panel-reset-layout-cost').click()

      // The three layout keys are stripped.
      await expect(page).not.toHaveURL(/hidden_panels=/)
      await expect(page).not.toHaveURL(/panel_order=/)
      await expect(page).not.toHaveURL(/split_sizes=/)

      // The three non-layout keys survive verbatim (Pitfall 11).
      await expect(page).toHaveURL(/time_from=now-7d/)
      await expect(page).toHaveURL(/time_to=now/)
      await expect(page).toHaveURL(/compare_panels=cost-forecast/)

      // Both cost panels are visible again — no hidden_panels filter active.
      await expect(
        page.locator('[data-panel-id="cost-by-project"]'),
      ).toBeVisible()
      await expect(
        page.locator('[data-panel-id="cost-forecast"]'),
      ).toBeVisible()
    })

    test.skip('SavedViewMenu Reset Layout chrome clears the same three keys and preserves time/compare', async ({ page }) => {
      // TODO Wave 4 / Plan 28-02 — unskip and implement.
      // Selector: panel-reset-layout-{route} mounted inside saved-view-menu-content.
      // Escape hatch for "all panels hidden" — per RESEARCH.md §7 A2.
      await page.goto('/cost?hidden_panels=cost-by-project,cost-forecast')
      expect(true).toBe(true)
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // Round-trip with saved view — hide → save → navigate → load.
  // ───────────────────────────────────────────────────────────────────
  test.describe('Round-trip with saved view', () => {
    // Wipe server-side saved_views rows so test doesn't see leftover state.
    // Mirror of v13-saved-views.spec.ts pattern.
    const BACKEND = 'http://127.0.0.1:8765'

    test.beforeEach(async ({ page }) => {
      const r = await page.request.get(`${BACKEND}/api/views`)
      const data = (await r.json()) as { items: Array<{ id: number }> }
      for (const v of data.items) {
        await page.request.delete(`${BACKEND}/api/views/${v.id}`)
      }
      // Clean localStorage saved-view default keys so SavedViewMenu sees
      // a virgin state.
      await page.goto('/')
      await page.evaluate(() => {
        try {
          const keys: string[] = []
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i)
            if (k && k.startsWith('cmc.savedView.')) keys.push(k)
          }
          keys.forEach((k) => window.localStorage.removeItem(k))
        } catch {
          // ignore
        }
      })
    })

    test('hide panel → save current view → navigate away → load view → panel still hidden + URL has hidden_panels', async ({ page }) => {
      // Plan 28-03 / Pitfall 3 lock — SaveViewDialog auto-captures
      // useRouterState().location.search verbatim into state_json. No
      // SaveViewDialog edits needed; this test proves the round-trip works
      // off the existing Phase 25 pipeline.
      //
      // Sequence:
      //   1. /cost → hide cost-forecast (URL gains ?hidden_panels=cost-forecast)
      //   2. Save current view via saved-view-menu-save-new → "Cost without forecast"
      //   3. Navigate to / (different route — URL doesn't carry hidden_panels)
      //   4. Navigate back to /cost (URL no longer has hidden_panels)
      //   5. Open SavedViewMenu → expand the saved view → click Open
      //   6. Assert URL has ?hidden_panels=cost-forecast
      //   7. Assert the cost-forecast panel is NOT in the DOM
      await page.goto('/cost')
      await page.waitForLoadState('domcontentloaded')

      // (1) Hide cost-forecast.
      await page.getByTestId('panel-header-menu-cost-forecast').click()
      await page.getByTestId('panel-hide-cost-forecast').click()
      await expect(page).toHaveURL(/hidden_panels=cost-forecast/)

      // (2) Save current view.
      await page.getByTestId('saved-view-menu-trigger').click()
      await page.getByTestId('saved-view-menu-save-new').click()
      await expect(page.getByTestId('save-view-dialog')).toBeVisible()
      await page
        .getByTestId('save-view-dialog-name-input')
        .fill('Cost without forecast')
      await page.getByTestId('save-view-dialog-submit').click()
      await expect(page.getByTestId('save-view-dialog')).toBeHidden()

      // Discover the freshly saved view id via the backend list (mirror
      // v13-saved-views.spec.ts pattern).
      const r = await page.request.get(`${BACKEND}/api/views`)
      const data = (await r.json()) as {
        items: Array<{
          id: number
          name: string
          route: string
          state_json: Record<string, unknown>
        }>
      }
      const view = data.items.find((v) => v.name === 'Cost without forecast')
      expect(view).toBeTruthy()
      if (!view) return
      // Sanity: state_json captured the hidden_panels value verbatim.
      expect(view.state_json.hidden_panels).toBe('cost-forecast')
      expect(view.route).toBe('/cost')

      // (3) Navigate away to /.
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // (4) Navigate back to /cost with a bare URL — no layout params.
      await page.goto('/cost')
      await page.waitForLoadState('domcontentloaded')
      // Bare URL → cost-forecast panel is visible again (no override).
      await expect(
        page.locator('[data-panel-id="cost-forecast"]'),
      ).toBeVisible()

      // (5) Open the saved view via SavedViewMenu.
      await page.getByTestId('saved-view-menu-trigger').click()
      await page.getByTestId(`saved-view-item-${view.id}`).hover()
      await page.getByTestId(`saved-view-open-${view.id}`).click()

      // (6) + (7) URL has hidden_panels=cost-forecast; panel is gone.
      await expect(page).toHaveURL(/hidden_panels=cost-forecast/)
      await expect(
        page.locator('[data-panel-id="cost-forecast"]'),
      ).toHaveCount(0)
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // Perf — ResponsiveContainer DOM identity across split-pane drag.
  // Phase 24 lock: ResponsiveContainer count = 8 across panel files.
  // Resize MUST NOT remount the <svg> nodes (chart instance identity).
  // ───────────────────────────────────────────────────────────────────
  test.describe('Perf — ResponsiveContainer DOM identity', () => {
    test('/sessions/compare: chart <svg> element identity is preserved across split-pane drag', async ({
      page,
      request,
    }) => {
      // Plan 28-05 / Pitfall 6 perf probe (RESEARCH.md §6) — tag a chart
      // <svg> with a unique data attribute, drag the separator multiple
      // times, and assert the SAME element still bears the marker. Proves
      // that onLayoutChanged-driven URL writes don't trigger a parent
      // re-render that re-mounts the ResponsiveContainer subtree.
      const ids = await getCompareSessionIds(request)
      test.skip(
        ids === null,
        'Perf probe: requires ≥2 sessions in DB (range=30d). Run `cmc sync` to ingest local sessions.',
      )
      if (!ids) return

      await page.goto(`/sessions/compare?a=${ids.a}&b=${ids.b}`)
      const handle = page.locator('[data-testid="resize-handle-compare"]').first()
      await expect(handle).toBeVisible({ timeout: 10_000 })

      // Pick the first <svg> inside side-a — that's the SideBarChart's
      // ResponsiveContainer-rendered recharts root. The Panel emits id={id}
      // (id-selector matches) — `data-panel` is a boolean marker, not
      // value-bearing (verified in dist/react-resizable-panels.js line 2000).
      const svg = page.locator('#side-a svg').first()
      await expect(svg).toBeVisible({ timeout: 10_000 })

      const marker = await svg.evaluate((el) => {
        el.setAttribute('data-test-marker', 'before')
        return el.getAttribute('data-test-marker')
      })
      expect(marker).toBe('before')

      // Drag the separator three times — varying direction & magnitude.
      for (const dx of [100, -50, 30]) {
        await dragSeparator(page, dx)
      }

      // Re-locate the same <svg> by its persisted marker. If the chart
      // re-mounted, the marker would be lost (new <svg> = no attribute).
      const stillMarked = page
        .locator('#side-a svg[data-test-marker="before"]')
        .first()
      await expect(stillMarked).toBeAttached()
      const after = await stillMarked.evaluate((el) =>
        el.getAttribute('data-test-marker'),
      )
      expect(after).toBe('before')
    })
  })
})
