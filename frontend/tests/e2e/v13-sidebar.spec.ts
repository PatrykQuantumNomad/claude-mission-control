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
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    // Clean slate.
    await page.evaluate(() =>
      window.localStorage.removeItem('cmc.sidebar.collapsed'),
    )
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

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
    // The sidebar `width` carries a 180ms ease-out transition. Wait for
    // the transition to complete before measuring — Playwright's
    // waitForFunction returns the instant the attribute flips, well
    // before the visual width reaches its 52px target.
    await page.waitForFunction(
      () => {
        const sb = document.querySelector('.cmc-sidebar') as HTMLElement | null
        return sb ? sb.getBoundingClientRect().width < 70 : false
      },
      undefined,
      { timeout: 2000 },
    )
    const collapsedWidth = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    )
    expect(collapsedWidth).toBeLessThan(70)

    // Reload → persistence. The applySidebar() boot script reads
    // localStorage and sets [data-sidebar-collapsed=true] BEFORE first
    // paint, so the sidebar should render at 52px without transition —
    // but be defensive in case future plans add a hydration transition.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.waitForFunction(
      () => {
        const sb = document.querySelector('.cmc-sidebar') as HTMLElement | null
        return sb ? sb.getBoundingClientRect().width < 70 : false
      },
      undefined,
      { timeout: 2000 },
    )
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
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
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
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    const activityLink = page.getByTestId('sidebar-link-activity')
    await activityLink.hover()
    // Radix Tooltip mounts via Portal — locate by role.
    const tooltip = page.locator('[role="tooltip"]').first()
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toContainText('Activity')
  })
})
