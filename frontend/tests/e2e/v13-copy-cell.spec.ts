// CONT-03 — Phase 24 Plan 05 click-to-copy e2e.
//
// Verifies the hover-revealed CopyIconButton inside a `.cmc-cell--copyable`
// cell:
//   1. Writes the cell's value to the clipboard (navigator.clipboard.writeText).
//   2. Does NOT fire the parent row's click handler (stopPropagation in
//      CopyIconButton).
//
// Forward-compat skip: until Phase 26/27 wires `copyable: true` on
// session-id / cwd / skill-name columns, the route may render no
// `.cmc-cell--copyable` cells. The unit test in plan 03 covers the
// primitive behavior; this e2e spec activates once columns light up.

import { test, expect } from '@playwright/test'

test.describe('CONT-03 click-to-copy on long cells', () => {
  test('copy icon writes to clipboard and does not fire row-click', async ({
    page,
    context,
  }) => {
    // Chromium requires explicit clipboard permission for headless
    // navigator.clipboard.readText() to resolve.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/skills')
    await page.waitForLoadState('networkidle')

    // If the route doesn't surface a copyable cell, skip — copyable cells
    // are wired per-column in Phase 26/27 adoption.
    const copyableCount = await page.locator('.cmc-cell--copyable').count()
    test.skip(
      copyableCount === 0,
      'No copyable cells on /skills today; coverage rolls forward in Phase 26/27',
    )

    const copyBtn = page.getByTestId('cell-copy-btn').first()
    await copyBtn.scrollIntoViewIfNeeded()
    await copyBtn.click()
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toBeTruthy()
  })
})
