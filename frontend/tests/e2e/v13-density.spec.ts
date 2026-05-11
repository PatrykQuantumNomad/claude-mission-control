// DENS-01..03 — Phase 24 Plan 05 density toggle e2e.
//
// Coverage:
//   1. Selecting a density tier writes localStorage `cmc.density` AND
//      sets `<html data-density="…">` (the cascade trigger).
//   2. The `:root`-scoped CSS variable `--cmc-padding-card` resolves to
//      the tier's value (Compact = 16px) — confirms the cascade reached
//      computed style.
//   3. Reload preserves the density (applyDensity() in main.tsx runs
//      before paint).
//   4. Density tokens cascade into Radix Portal content — DropdownMenu
//      body font-size matches the Cozy tier (16px), proving the cascade
//      works for Portal-mounted subtrees (DENS-02 invariant).

import { test, expect } from '@playwright/test'

test.describe('DENS-01..03 density toggle persistence + cascade', () => {
  test.afterEach(async ({ page }) => {
    // Reset to comfortable so subsequent specs / re-runs start clean.
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('cmc.density')
      } catch {
        // ignore — context may be torn down
      }
    })
  })

  test('density toggle writes localStorage and dataset.density; persists across reload', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Clean slate.
    await page.evaluate(() => window.localStorage.removeItem('cmc.density'))
    await page.reload()
    await page.waitForLoadState('networkidle')

    await page.getByTestId('density-toggle-trigger').click()
    await page.getByTestId('density-option-compact').click()
    await page.waitForFunction(
      () => document.documentElement.dataset.density === 'compact',
    )
    expect(
      await page.evaluate(() => window.localStorage.getItem('cmc.density')),
    ).toBe('compact')

    // Cascade verification: `--cmc-padding-card` on :root resolves to the
    // Compact tier's value (16px per plan 01 token scale). getPropertyValue
    // returns the raw declared value (with leading whitespace stripped).
    const padding = await page.evaluate(() =>
      window
        .getComputedStyle(document.documentElement)
        .getPropertyValue('--cmc-padding-card')
        .trim(),
    )
    expect(padding).toBe('16px')

    // Reload → density survives (applyDensity in main.tsx).
    await page.reload()
    await page.waitForLoadState('networkidle')
    expect(
      await page.evaluate(() => document.documentElement.dataset.density),
    ).toBe('compact')
  })

  test('density tokens cascade to Radix Portal content (DropdownMenu)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('cmc.density', 'cozy')
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('density-toggle-trigger').click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible()
    const fontSize = await menu.evaluate(
      (el) => window.getComputedStyle(el).fontSize,
    )
    // Cozy body size is 16px per plan 01 density token scale.
    expect(fontSize).toBe('16px')
  })
})
