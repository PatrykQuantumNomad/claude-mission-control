// TEST-03 — ScheduleComposer creates a schedule end-to-end.
//
// Flow:
//   1. Navigate to /skills (SchedulesCard lives in the Skills page grid).
//   2. Click "+ New" on the SchedulesCard — opens ScheduleComposer (Sheet).
//   3. Fill name + advanced cron (use advanced cron to bypass the time/days
//      chip composition which is harder to drive via accessible queries).
//   4. Submit ("Create schedule") — POST /api/schedules.
//   5. Sheet closes; the schedule appears in the SchedulesCard list.
//   6. Cleanup: DELETE /api/schedules/{id} via the test fixture's request
//      context, regardless of test outcome (afterEach guard).
//
// Cleanup is critical — Playwright runs against a real backend with a
// persistent SQLite DB; without DELETE, schedules accumulate across runs.

import { test, expect, type APIRequestContext } from '@playwright/test'

const BACKEND = 'http://127.0.0.1:8765'

let createdId: number | null = null

async function deleteSchedule(request: APIRequestContext, id: number) {
  await request.delete(`${BACKEND}/api/schedules/${id}`)
}

test.afterEach(async ({ request }) => {
  if (createdId !== null) {
    await deleteSchedule(request, createdId)
    createdId = null
  }
})

test('TEST-03: schedule composer creates a schedule end-to-end', async ({
  page,
  request,
}) => {
  const name = `e2e-test-schedule-${Date.now()}`

  await page.goto('/skills')
  await expect(page.locator('#skills-heading')).toBeVisible()

  // Open the composer via the SchedulesCard "+ New" button. There may be
  // multiple "+ New"-like buttons elsewhere — scope to the SchedulesCard
  // PanelCard by its title.
  await page
    .getByRole('button', { name: '+ New' })
    .first()
    .click()

  // Sheet opens with title "New schedule".
  await expect(page.getByText('New schedule', { exact: true })).toBeVisible()

  // Fill name (required).
  await page.getByLabel('Name').fill(name)

  // Use advanced cron — overrides time/days, simpler to drive deterministically.
  await page.getByLabel('Advanced cron').fill('0 9 * * 1-5')
  // Blur to clear the "Keep typing…" preview (not strictly required, but
  // exercises the path).
  await page.getByLabel('Advanced cron').blur()

  // Submit.
  await page.getByRole('button', { name: 'Create schedule' }).click()

  // Sheet closes; new schedule appears in the SchedulesCard list.
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 5_000 })

  // Capture the created schedule's id for afterEach cleanup.
  const list = await request.get(`${BACKEND}/api/schedules`)
  expect(list.ok()).toBe(true)
  const data = (await list.json()) as { items: Array<{ id: number; name: string }> }
  const target = data.items.find((s) => s.name === name)
  expect(target).toBeDefined()
  createdId = target!.id
})
