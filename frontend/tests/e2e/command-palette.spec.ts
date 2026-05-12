// TEST-02 — Cmd+K opens the command palette.
//
// CommandPalette (frontend/src/components/ui/CommandPalette.tsx) listens for
// the global `k` keypress with metaKey OR ctrlKey on the document. Playwright's
// page.keyboard.press('Meta+K') maps to Cmd+K on macOS (the executor's host
// OS); on Linux/Windows runners, Meta+K still triggers since cmdk responds to
// both modifiers.
//
// Locator: cmdk's Command.Dialog renders a Radix Dialog (role="dialog") with
// the `aria-label` we pass. We match by role+name — robust against future
// className changes.
//
// Phase 25 Plan 11 extension (CMDK-01): a "Saved Views" Command.Group ships
// in the palette. Coverage:
//   1. Empty-state body renders when zero views exist.
//   2. A view created via the API surfaces as a clickable Command.Item that
//      navigates on select (cross-route navigability for static routes).
//   3. Current-route views appear before other-route views (the sort
//      invariant is locked in CommandPalette.sortSavedViewsForPalette — pure
//      function exercised by vitest; this e2e validates the wiring).

import { test, expect } from '@playwright/test'

const BACKEND = 'http://127.0.0.1:8765'

async function wipeViewsAndLocal(page: import('@playwright/test').Page) {
  const r = await page.request.get(`${BACKEND}/api/views`)
  const data = (await r.json()) as { items: Array<{ id: number }> }
  for (const v of data.items) {
    await page.request.delete(`${BACKEND}/api/views/${v.id}`)
  }
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
}

test('TEST-02: Cmd+K opens the command palette', async ({ page }) => {
  await page.goto('/')
  // Ensure the page has fully mounted before pressing — otherwise the cmdk
  // global listener may not be attached yet.
  await expect(page.locator('#cmd-heading')).toBeVisible()

  // Send the keypress directly to the body element. CommandPalette listens
  // on document so any element that bubbles works; we click body first to
  // ensure focus is in the page (otherwise the press goes to the URL bar
  // in some browser harnesses).
  await page.locator('body').click()
  // Use ControlOrMeta — Playwright maps this to Meta on macOS and Control
  // elsewhere. CommandPalette accepts either (both metaKey AND ctrlKey are
  // checked in the listener).
  await page.keyboard.press('ControlOrMeta+KeyK')

  const palette = page.getByRole('dialog', {
    name: 'Mission Control command palette',
  })
  await expect(palette).toBeVisible({ timeout: 5_000 })

  // Sanity — the search input should be present too (cmdk renders an
  // <input> inside the dialog with the spec's placeholder copy).
  await expect(
    page.getByPlaceholder('Search pages, sessions, schedules…'),
  ).toBeVisible()
})

// ────────────────────────────────────────────────────────────────────────
// Phase 25 Plan 11 extension: Saved Views Command.Group coverage (CMDK-01)
// ────────────────────────────────────────────────────────────────────────

test.describe('Phase 25 — Cmd+K Saved Views group', () => {
  test.beforeEach(async ({ page }) => {
    await wipeViewsAndLocal(page)
  })

  test('Saved Views group surfaces empty-state body when zero views exist', async ({
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
    await expect(page.getByTestId('cmdk-saved-views-empty')).toBeVisible()
    await expect(page.getByTestId('cmdk-saved-views-empty')).toContainText(
      /no saved views/i,
    )
  })

  test('Saved Views group lists views and navigates on select', async ({
    page,
  }) => {
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Palette view',
        description: '',
        route: '/cost',
        state_json: {},
        schema_version: 1,
      },
    })
    const view = await created.json()

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(page.getByTestId(`cmdk-saved-view-${view.id}`)).toBeVisible()
    await page.getByTestId(`cmdk-saved-view-${view.id}`).click()
    await expect(page).toHaveURL(/\/cost/)
  })

  test('Current-route views appear before other-route views in the palette', async ({
    page,
  }) => {
    // Seed two views on different routes — current-route first invariant
    // is tested with the user on /cost so /cost's view sorts before
    // /alerts's view, regardless of insertion order.
    const a = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Alerts view',
        description: '',
        route: '/alerts',
        state_json: {},
        schema_version: 1,
      },
    })
    const b = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Cost view',
        description: '',
        route: '/cost',
        state_json: {},
        schema_version: 1,
      },
    })
    const alertsView = await a.json()
    const costView = await b.json()

    await page.goto('/cost')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')

    // Both items render — assert relative order via bounding-box y.
    const costRow = page.getByTestId(`cmdk-saved-view-${costView.id}`)
    const alertsRow = page.getByTestId(`cmdk-saved-view-${alertsView.id}`)
    await expect(costRow).toBeVisible()
    await expect(alertsRow).toBeVisible()
    const costBox = await costRow.boundingBox()
    const alertsBox = await alertsRow.boundingBox()
    expect(costBox).not.toBeNull()
    expect(alertsBox).not.toBeNull()
    // costRow.y < alertsRow.y ⇒ cost (current route) renders first.
    expect(costBox!.y).toBeLessThan(alertsBox!.y)
  })
})
