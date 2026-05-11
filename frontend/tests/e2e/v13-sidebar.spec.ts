// SHEL-04 — Phase 24 Plan 05 sidebar e2e (Cmd+B + persistence + active
// highlight + collapsed-mode tooltip).
//
// Coverage:
//   1. Cmd+B toggles `<html data-sidebar-collapsed>` and shrinks
//      `.cmc-sidebar` from ~240px to ~52px.
//   2. Reload preserves the collapsed state (localStorage cmc.sidebar.collapsed).
//   3. Active route still shows the 3px accent-blue border-left when the
//      sidebar is collapsed.
//   4. Hovering a collapsed nav icon shows the Radix Tooltip with the
//      route label (side="right", Portal-mounted).
//
// The sidebar's keyboard listener is attached at window level so Cmd+B
// works regardless of focus location — see Sidebar.tsx comments. We use
// ControlOrMeta in Playwright so the test runs identically on macOS and
// Linux CI workers.

import { test, expect } from '@playwright/test'

test.describe('SHEL-04 sidebar collapse + persistence', () => {
  test.afterEach(async ({ page }) => {
    // Reset to expanded so subsequent specs / re-runs start clean.
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('cmc.sidebar.collapsed')
      } catch {
        // ignore — context may be torn down
      }
    })
  })

  test('Cmd+B toggles sidebar collapsed state and persists across reload', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Clean slate.
    await page.evaluate(() =>
      window.localStorage.removeItem('cmc.sidebar.collapsed'),
    )
    await page.reload()
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('.cmc-sidebar')
    await expect(sidebar).toBeVisible()
    const initialWidth = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    )
    expect(initialWidth).toBeGreaterThan(200) // expanded ~240px

    // Send the press to body to guarantee focus is in the page (URL bar
    // would otherwise swallow it in some harnesses).
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyB')
    await page.waitForFunction(
      () => document.documentElement.dataset.sidebarCollapsed === 'true',
    )
    const collapsedWidth = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    )
    expect(collapsedWidth).toBeLessThan(70)

    // Reload → persistence.
    await page.reload()
    await page.waitForLoadState('networkidle')
    const persistedWidth = await page
      .locator('.cmc-sidebar')
      .evaluate((el) => el.getBoundingClientRect().width)
    expect(persistedWidth).toBeLessThan(70)
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem('cmc.sidebar.collapsed'),
      ),
    ).toBe('true')

    // Active route survives collapsed mode — the 3px accent-blue bar must
    // still render.
    await page.goto('/activity')
    await page.waitForLoadState('networkidle')
    const activeLink = page.locator('.cmc-sidebar__navlink--active')
    await expect(activeLink).toBeVisible()
    const borderLeft = await activeLink.evaluate(
      (el) => window.getComputedStyle(el).borderLeftWidth,
    )
    expect(parseInt(borderLeft, 10)).toBeGreaterThanOrEqual(3)
  })

  test('hover icon in collapsed mode shows tooltip with route label', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('cmc.sidebar.collapsed', 'true')
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const activityLink = page.getByTestId('sidebar-link-activity')
    await activityLink.hover()
    // Radix Tooltip mounts via Portal — locate by role.
    const tooltip = page.locator('[role="tooltip"]').first()
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toContainText('Activity')
  })
})
