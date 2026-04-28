// TEST-01 — Three routes render without error.
//
// Walks the three top-level routes the dashboard exposes (`/`, `/activity`,
// `/skills`) and asserts that each page produces its h1 heading and the
// React error-boundary fallback ("Couldn't reach the dashboard server.")
// is NOT visible. This is a "smoke" gate — if any route blows up at mount
// time, this test catches it.
//
// Headings come from frontend/src/routes/{index,activity,skills}.tsx. Each
// page has a `<h1 class="cmc-page__heading">` with a stable id we can target.

import { test, expect } from '@playwright/test'

test.describe('TEST-01: three routes render', () => {
  test('command page (/) renders heading without error fallback', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#cmd-heading')).toHaveText('Command')
    await expect(
      page.getByText("Couldn't reach the dashboard server."),
    ).toHaveCount(0)
  })

  test('activity page (/activity) renders heading without error fallback', async ({
    page,
  }) => {
    await page.goto('/activity')
    await expect(page.locator('#activity-heading')).toHaveText('Activity')
    await expect(
      page.getByText("Couldn't reach the dashboard server."),
    ).toHaveCount(0)
  })

  test('skills page (/skills) renders heading without error fallback', async ({
    page,
  }) => {
    await page.goto('/skills')
    await expect(page.locator('#skills-heading')).toHaveText('Skills')
    await expect(
      page.getByText("Couldn't reach the dashboard server."),
    ).toHaveCount(0)
  })
})
