// TEST-04 — Theme toggle persists across reload.
//
// The Phase 9 Plan 05 / Q1=A contract is "theme toggle persists" — tested
// here by:
//   1. Open `/` with a clean localStorage (default = dark).
//   2. Assert <html data-theme="dark">.
//   3. Click the ThemeToggle (data-testid="theme-toggle").
//   4. Assert <html data-theme="light">.
//   5. Confirm localStorage `cmc.theme` === 'light'.
//   6. Reload the page.
//   7. Assert <html data-theme="light"> still — persistence verified.
//
// afterEach resets localStorage to dark so subsequent runs / specs start
// from a known state. Beware: Playwright shares the BrowserContext across
// tests in a worker by default; we explicitly clear `cmc.theme` after
// each test to keep specs hermetic.

import { test, expect } from '@playwright/test'

test.describe('TEST-04: theme toggle persists across reload', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('cmc.theme')
      } catch {
        // ignore — context may be torn down
      }
    })
  })

  test('toggling persists across reload', async ({ page }) => {
    await page.goto('/')
    // Clean slate — clear any theme key from a previous run before asserting.
    await page.evaluate(() => window.localStorage.removeItem('cmc.theme'))
    await page.reload()

    // Default theme is dark.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    // Click the toggle.
    await page.getByTestId('theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    // localStorage updated synchronously by lib/theme.setTheme.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem('cmc.theme'),
    )
    expect(stored).toBe('light')

    // Reload — applyTheme() runs in main.tsx before paint → still light.
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
})
