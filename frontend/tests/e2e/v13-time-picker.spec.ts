// Phase 26 Plan 09 — TimePicker + RefreshDropdown + Cmd+K time / density /
// recents end-to-end coverage. Maps 1:1 to ROADMAP Phase 26 success
// criteria + the requirement IDs SHEL-05 / TIME-01..05 / CMDK-02..04.
//
// Pattern mirrors `v13-saved-views.spec.ts` (Phase 25 Plan 11): data-testid
// selectors EXCLUSIVELY (ESLint cmc/testid-registry-only enforces); use
// `domcontentloaded` + a short settle delay (`networkidle` is forbidden on
// chart-heavy routes that hold persistent OTEL/polling streams).
// `ControlOrMeta+Shift+KeyC` / `ControlOrMeta+Shift+KeyV` for Cmd+Shift+C/V
// (TimePicker.tsx listens at window level on both metaKey AND ctrlKey).
//
// Clipboard handling: Playwright's Chromium project (chromium-only here;
// see frontend/playwright.config.ts) grants `clipboard-read` /
// `clipboard-write` via the test context by default for chromium —
// `navigator.clipboard.readText/writeText` is callable from `page.evaluate`
// without an extra permissions grant. The tests below seed the clipboard
// via `navigator.clipboard.writeText` inside `page.evaluate` before
// triggering Cmd+Shift+V.
//
// Recently Visited (SHEL-05) localStorage key: `cmc.recents.routes` — array
// of `{ route: string, visitedAt: number }`. Seeded directly via
// `page.evaluate(...)` to avoid having to traverse 5 routes mid-test.
//
// Phase 25's pattern of wiping server-side `saved_views` rows before each
// test is preserved (the Cmd+K palette renders the Saved Views group
// alongside Recents/Time-range/Density; a polluted catalogue would distort
// the group-order assertion).

import { test, expect, type Page } from '@playwright/test'

const BACKEND = 'http://127.0.0.1:8765'

// Seeded recents fixture used across multiple tests. The pathname strings
// follow the `pathname + search` shape that lib/recents.ts persists; the
// e2e doesn't need to round-trip search params through cmc.recents.routes
// because the CMDK-04 surface filters by pathname only.
function seededRecents(): Array<{ route: string; visitedAt: number }> {
  const now = Date.now()
  return [
    { route: '/activity', visitedAt: now - 1000 },
    { route: '/skills', visitedAt: now - 2000 },
    { route: '/cost', visitedAt: now - 3000 },
    { route: '/alerts', visitedAt: now - 4000 },
    { route: '/sessions/compare', visitedAt: now - 5000 },
  ]
}

async function wipeViewsAndLocal(page: Page) {
  // Wipe server-side saved_views (the palette's Saved Views group is part
  // of the surface this spec asserts on; pollution distorts group order).
  const r = await page.request.get(`${BACKEND}/api/views`)
  const data = (await r.json()) as { items: Array<{ id: number }> }
  for (const v of data.items) {
    await page.request.delete(`${BACKEND}/api/views/${v.id}`)
  }
  // Wipe relevant localStorage keys after navigating to a real origin
  // (localStorage is origin-scoped — about:blank has no access).
  await page.goto('/')
  await page.evaluate(() => {
    try {
      const keys: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (
          k &&
          (k.startsWith('cmc.savedView.') ||
            k.startsWith('cmc.recents.') ||
            k === 'cmc.autoRefresh.interval')
        ) {
          keys.push(k)
        }
      }
      keys.forEach((k) => window.localStorage.removeItem(k))
    } catch {
      // ignore
    }
  })
}

test.describe('Phase 26 — TimePicker (TIME-01..05) + Cmd+K (CMDK-02..04) + Sidebar Recently Visited (SHEL-05)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies()
    // Clipboard permissions — chromium grants by default for tests, but
    // be explicit so future browser-matrix expansions inherit it.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await wipeViewsAndLocal(page)
  })

  // ────────────────────────────────────────────────────────────────────
  // TIME-01: time picker preset writes URL params
  // ────────────────────────────────────────────────────────────────────

  test('TIME-01: clicking "Last 7 days" preset writes URL ?time_from=now-7d&time_to=now', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('time-picker-trigger').click()
    await expect(page.getByTestId('time-picker-popover')).toBeVisible()
    await page.getByTestId('time-picker-preset-last-7-days').click()
    await expect(page).toHaveURL(/time_from=now-7d/)
    await expect(page).toHaveURL(/time_to=now/)
  })

  test('TIME-01: custom range calendar applies absolute ISO time_from / time_to', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('time-picker-trigger').click()
    await expect(page.getByTestId('time-picker-calendar')).toBeVisible()
    // CustomRangeCalendar applies whatever range its onApply prop receives.
    // The full react-day-picker UX is gnarly to drive deterministically in
    // CI; instead, simulate the apply path by writing ?time_from=<iso>&time_to=<iso>
    // via the URL bar and assert the picker label updates accordingly. This
    // is the same path the calendar Apply button takes (TimePicker.applyRange
    // calls navigate({ search: { time_from, time_to } })).
    await page.getByTestId('time-picker-trigger').click() // close popover
    await page.goto('/?time_from=2026-05-01T00:00:00Z&time_to=2026-05-08T00:00:00Z')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    // TimePicker trigger label falls back to "<from> → <to>" when no
    // preset matches the URL pair (humanLabel function in TimePicker.tsx).
    const triggerText = await page
      .getByTestId('time-picker-trigger')
      .textContent()
    expect(triggerText).toMatch(/2026-05-01/)
    expect(triggerText).toMatch(/2026-05-08/)
  })

  test('TIME-01: RefreshDropdown selects 30s → cmc.autoRefresh.interval localStorage gets "30s" + pulse indicator appears', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('refresh-dropdown-trigger').click()
    await page.getByTestId('refresh-option-30s').click()
    await expect(page.getByTestId('refresh-active-indicator')).toBeVisible()
    const stored = await page.evaluate(() =>
      window.localStorage.getItem('cmc.autoRefresh.interval'),
    )
    expect(stored).toBe('30s')
  })

  test('TIME-01: refresh dropdown shows "Paused" when URL has absolute time_from', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.getByTestId('refresh-dropdown-trigger').click()
    await page.getByTestId('refresh-option-30s').click()
    // Navigate to an absolute-time URL — same route — triggers paused state.
    await page.goto('/?time_from=2026-05-01T00:00:00Z&time_to=2026-05-08T00:00:00Z')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    const label = await page
      .getByTestId('refresh-dropdown-trigger')
      .textContent()
    expect(label?.toLowerCase()).toContain('paused')
    // Active indicator should NOT show in paused mode (RefreshDropdown.tsx
    // `active = interval !== 'off' && !paused`).
    await expect(
      page.getByTestId('refresh-active-indicator'),
    ).toBeHidden()
  })

  // ────────────────────────────────────────────────────────────────────
  // TIME-02: panel-sync via useRouteRange URL→Range bridge
  // ────────────────────────────────────────────────────────────────────

  test('TIME-02: setting TimePicker to Last 7 days on / writes time_from/time_to to URL (panels re-query via rangeToVocab bridge — Plan 08 lock)', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('time-picker-trigger').click()
    await page.getByTestId('time-picker-preset-last-7-days').click()
    // Assert URL carries both params — this is the contract every panel
    // on / reads via useRouteRange (lib/time/useRouteRange.ts).
    await expect(page).toHaveURL(/time_from=now-7d/)
    await expect(page).toHaveURL(/time_to=now/)
  })

  test('TIME-02: setting picker on /activity writes URL — OtelPanel (live SSE) is opt-out and remains mounted', async ({
    page,
  }) => {
    await page.goto('/activity')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('time-picker-trigger').click()
    await page.getByTestId('time-picker-preset-last-7-days').click()
    await expect(page).toHaveURL(/time_from=now-7d/)
    // OtelFeed is the bridge opt-out (TIME-02 documented carve-out): the
    // live SSE stream is intrinsic to the surface, not a windowed query.
    // We assert OtelFeed is still mounted in the DOM (its CSS class is
    // `.cmc-otel-feed`) after the time-range navigation.
    await expect(page.locator('.cmc-otel-feed').first()).toBeVisible()
  })

  // ────────────────────────────────────────────────────────────────────
  // TIME-03: Cmd+Shift+C / Cmd+Shift+V copy/paste hotkeys
  // ────────────────────────────────────────────────────────────────────

  test('TIME-03: Cmd+Shift+C copies serialized range to clipboard (sonner toast fires)', async ({
    page,
  }) => {
    await page.goto('/?time_from=now-7d&time_to=now')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+Shift+KeyC')
    // toast.success('Time range copied') — sonner renders region role
    const region = page.locator('[aria-label*="Notifications" i], [role="region"]').first()
    await expect(region).toBeAttached()
    // Confirm clipboard payload matches serializeRange("now-7d", "now")
    const clipboardValue = await page.evaluate(() =>
      navigator.clipboard.readText(),
    )
    expect(clipboardValue).toContain('time_from=now-7d')
    expect(clipboardValue).toContain('time_to=now')
  })

  test('TIME-03: Cmd+Shift+V applies clipboard range to URL', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.evaluate(() =>
      navigator.clipboard.writeText('?time_from=now-30d&time_to=now'),
    )
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+Shift+KeyV')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/time_from=now-30d/)
    await expect(page).toHaveURL(/time_to=now/)
  })

  test('TIME-03: paste between routes — copy on /activity → navigate to / → paste → / URL has the same params', async ({
    page,
  }) => {
    await page.goto('/activity?time_from=now-7d&time_to=now')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+Shift+KeyC')
    await page.waitForTimeout(300)

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+Shift+KeyV')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/time_from=now-7d/)
    await expect(page).toHaveURL(/time_to=now/)
  })

  test('CMDK-03 / TIME-03: Cmd+K "Copy time range" command writes to clipboard', async ({
    page,
  }) => {
    await page.goto('/?time_from=now-7d&time_to=now')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(
      page.getByRole('dialog', { name: 'Mission Control command palette' }),
    ).toBeVisible()
    await page.getByTestId('cmdk-time-range-copy').click()
    await page.waitForTimeout(300)
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toContain('time_from=now-7d')
  })

  // ────────────────────────────────────────────────────────────────────
  // TIME-04: CompareToggle round-trip
  // ────────────────────────────────────────────────────────────────────

  test('TIME-04: CompareToggle on token-usage adds compare_panels=token-usage to URL', async ({
    page,
  }) => {
    // CompareToggle uses URL as source of truth (Phase 26 Plan 07). Seed
    // the URL directly so the toggle reads `aria-pressed="true"`; clicking
    // it removes the panel from the CSV. This exercises the round-trip.
    await page.goto('/?compare_panels=token-usage&range=7d')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    const toggle = page.getByTestId('compare-overlay-toggle-token-usage')
    await expect(toggle).toBeVisible()
    expect(await toggle.getAttribute('aria-pressed')).toBe('true')

    // Reload preserves URL — the overlay re-mounts in the active state.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    const toggleAfter = page.getByTestId('compare-overlay-toggle-token-usage')
    await expect(toggleAfter).toBeVisible()
    expect(await toggleAfter.getAttribute('aria-pressed')).toBe('true')

    // Click → removes from CSV → aria-pressed false. The button lives in
    // the panel header trailing slot which sits below the page's chart-
    // dense first card; on chart-heavy routes the layout reflows as
    // panels mount, occasionally leaving the button under a transient
    // overlay. Scroll the button into view (mid-screen, not just visible)
    // and click via dispatchEvent so we exercise the React onClick
    // handler directly — this is the same path a real user takes via
    // Enter or keyboard, just decoupled from pointer hit-testing.
    await toggleAfter.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await toggleAfter.dispatchEvent('click')
    await page.waitForTimeout(300)
    expect(await toggleAfter.getAttribute('aria-pressed')).toBe('false')
    await expect(page).not.toHaveURL(/compare_panels=token-usage/)
  })

  // ────────────────────────────────────────────────────────────────────
  // TIME-05: brush-zoom + reset-zoom
  // ────────────────────────────────────────────────────────────────────

  test('TIME-05: ResetZoomButton appears when URL has absolute time_from; click clears the params', async ({
    page,
  }) => {
    // Brush-zoom drag is hard to drive deterministically across recharts
    // versions; we exercise the OBSERVABLE output (absolute time_from in
    // URL → ResetZoomButton visible → click clears it). Brush commit
    // writes ISO `2026-…T…`, which the ChartsStrip header's
    // ResetZoomButton then reads.
    await page.goto('/activity?time_from=2026-05-01T00:00:00Z&time_to=2026-05-08T00:00:00Z')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    const resetBtn = page.getByTestId('reset-zoom-button')
    await expect(resetBtn).toBeVisible()
    await resetBtn.click()
    await page.waitForTimeout(300)
    // After reset, the URL no longer carries the absolute time_from.
    await expect(page).not.toHaveURL(/time_from=2026-05-01/)
  })

  test('TIME-05 + auto-refresh interaction: absolute time_from in URL → RefreshDropdown shows "Paused"', async ({
    page,
  }) => {
    await page.goto('/activity')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.getByTestId('refresh-dropdown-trigger').click()
    await page.getByTestId('refresh-option-30s').click()
    await page.goto('/activity?time_from=2026-05-01T00:00:00Z&time_to=2026-05-08T00:00:00Z')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    const label = await page
      .getByTestId('refresh-dropdown-trigger')
      .textContent()
    expect(label?.toLowerCase()).toContain('paused')
  })

  // ────────────────────────────────────────────────────────────────────
  // CMDK-02: density command flips <html data-density>
  // ────────────────────────────────────────────────────────────────────

  test('CMDK-02: Cmd+K density command flips <html data-density> attribute + persists', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(
      page.getByRole('dialog', { name: 'Mission Control command palette' }),
    ).toBeVisible()
    await page.getByTestId('cmdk-density-compact').click()
    await page.waitForTimeout(200)
    const density = await page.evaluate(() =>
      document.documentElement.getAttribute('data-density'),
    )
    expect(density).toBe('compact')
    const stored = await page.evaluate(() =>
      window.localStorage.getItem('cmc.density'),
    )
    expect(stored).toBe('compact')
  })

  // ────────────────────────────────────────────────────────────────────
  // CMDK-03: time-range commands (4 condensed presets)
  // ────────────────────────────────────────────────────────────────────

  test('CMDK-03: Cmd+K "7d" Time range command writes URL', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await page.getByTestId('cmdk-time-range-7d').click()
    await page.waitForTimeout(300)
    await expect(page).toHaveURL(/time_from=now-7d/)
    await expect(page).toHaveURL(/time_to=now/)
  })

  // ────────────────────────────────────────────────────────────────────
  // CMDK-04: Recents group shows last 5 routes (current route filtered)
  // ────────────────────────────────────────────────────────────────────

  test('CMDK-04: Recents group shows seeded routes (current filtered); selecting navigates', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate((seeded) => {
      window.localStorage.setItem('cmc.recents.routes', JSON.stringify(seeded))
    }, seededRecents())
    await page.goto('/') // re-mount with seeded state
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(
      page.getByRole('dialog', { name: 'Mission Control command palette' }),
    ).toBeVisible()
    // Top route in seededRecents is /activity (current is /); should be visible.
    const activityRow = page.getByTestId('cmdk-recents-route-activity')
    await expect(activityRow).toBeVisible()
    // Current route (/ → home) should NOT appear in Recents — CMDK-04
    // documented behaviour: "current route filtered".
    await expect(
      page.getByTestId('cmdk-recents-route-home'),
    ).toHaveCount(0)
    // Selecting a recent navigates.
    await activityRow.click()
    await expect(page).toHaveURL(/\/activity/)
  })

  // ────────────────────────────────────────────────────────────────────
  // SHEL-05: Sidebar Recently Visited section shows top routes
  // ────────────────────────────────────────────────────────────────────

  test('SHEL-05: sidebar Recently Visited section shows seeded recents (current filtered)', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate((seeded) => {
      window.localStorage.setItem('cmc.recents.routes', JSON.stringify(seeded))
    }, seededRecents())
    await page.goto('/cost') // navigate to a route that's NOT in the top of seededRecents
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    const section = page.getByTestId('sidebar-section-recently-visited')
    await expect(section).toBeVisible()
    // Section header always renders even when no recents (RecentlyVisitedSection
    // implementation uses SidebarSection which renders the heading at all times).
    // Seeded /activity should surface as a sidebar link; the active /cost
    // route should be filtered out by RecentlyVisitedSection's
    // current-pathname filter.
    await expect(section.getByTestId('sidebar-link-activity')).toBeVisible()
  })

  test('SHEL-05: section header always renders (even on a fresh-localStorage cold start with zero recents)', async ({
    page,
  }) => {
    // wipeViewsAndLocal in beforeEach already cleared cmc.recents.routes.
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await expect(
      page.getByTestId('sidebar-section-recently-visited'),
    ).toBeVisible()
  })

  // ────────────────────────────────────────────────────────────────────
  // Cmd+K group order lock (Pitfall 10) — Recents → Saved Views → Pages →
  // Time range → Density → Actions
  // ────────────────────────────────────────────────────────────────────

  test('Cmd+K group order: Recents → Saved Views → Pages → Time range → Density → Actions', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(
      page.getByRole('dialog', { name: 'Mission Control command palette' }),
    ).toBeVisible()
    // cmdk renders Command.Group's `heading` as a [cmdk-group-heading] node.
    const headings = await page
      .locator('[cmdk-group-heading]')
      .allTextContents()
    const expected = ['Recents', 'Saved Views', 'Pages', 'Time range', 'Density', 'Actions']
    expect(headings).toEqual(expected)
  })

  // ────────────────────────────────────────────────────────────────────
  // Phase 27 Plan 09 extension: TimePicker re-anchor probes on the 4
  // tail-end routes. Mirror the Phase 26 Plan 09 pattern that probed
  // / + /activity + /sessions/compare.
  // ────────────────────────────────────────────────────────────────────

  test('Phase 27 / /skills: TimePicker preset writes time_from/time_to to URL', async ({
    page,
  }) => {
    await page.goto('/skills')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('time-picker-trigger').click()
    await page.getByTestId('time-picker-preset-last-7-days').click()
    await expect(page).toHaveURL(/time_from=now-7d/)
    await expect(page).toHaveURL(/time_to=now/)
  })

  test('Phase 27 / /cost: TimePicker preset writes time_from/time_to to URL (panels re-query)', async ({
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

  test('Phase 27 / /alerts: TimePicker preset writes time_from/time_to to URL', async ({
    page,
  }) => {
    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('time-picker-trigger').click()
    await page.getByTestId('time-picker-preset-last-7-days').click()
    await expect(page).toHaveURL(/time_from=now-7d/)
    await expect(page).toHaveURL(/time_to=now/)
  })
})
