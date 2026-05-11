// CONT-03 — Phase 24 Plan 05 truncation + tooltip e2e.
//
// Finds a real `.cmc-cell--truncate` cell on /skills (the safest
// universally-rendered DataTable route in v1.2 demo data) that is
// actually overflowing (`scrollWidth > clientWidth`), hovers it, and
// asserts the Radix Tooltip surfaces the full value.
//
// Forward-compat skip: if the current /skills dataset has no overflowing
// cells, `test.skip` records that as expected and the truncation primitive
// stays covered by vitest unit tests in plan 03. The skip path activates
// automatically once Phase 26/27 wires per-column `wrap: true` /
// `copyable: true` on session-id / cwd / skill-name columns.

import { test, expect } from '@playwright/test'

test.describe('CONT-03 truncation + tooltip', () => {
  test('long string in DataTable cell truncates with ellipsis and shows full value on tooltip hover', async ({
    page,
  }) => {
    await page.goto('/skills')
    await page.waitForLoadState('networkidle')

    // Find any cell with .cmc-cell--truncate that is actually overflowing.
    // scrollWidth > clientWidth + 1 — the +1 absorbs sub-pixel rounding
    // jitter (a fractional 0.5px difference would otherwise count as
    // overflow on Retina displays).
    const overflowingCell = await page.evaluate(() => {
      const cells = Array.from(
        document.querySelectorAll('.cmc-cell--truncate'),
      ) as HTMLElement[]
      const overflow = cells.find((c) => c.scrollWidth > c.clientWidth + 1)
      return overflow
        ? {
            text: overflow.textContent,
            x: overflow.getBoundingClientRect().x,
            y: overflow.getBoundingClientRect().y,
          }
        : null
    })

    // If no overflowing cell is present in the demo data, skip — the
    // truncation path is covered by vitest unit tests in plan 03 and the
    // forward-compat surface activates in Phase 26/27 column adoption.
    test.skip(
      !overflowingCell,
      'No truncating cell present in current /skills dataset; truncation path is tested via vitest unit',
    )

    const cell = page.locator('.cmc-cell--truncate').first()
    await cell.hover()
    const tooltip = page.locator('[role="tooltip"]').first()
    await expect(tooltip).toBeVisible()
    expect(overflowingCell?.text).toBeTruthy()
    await expect(tooltip).toContainText(overflowingCell!.text!.trim())
  })
})
