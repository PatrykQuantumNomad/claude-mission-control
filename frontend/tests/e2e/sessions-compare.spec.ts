// TEST-05b — /sessions/compare picker → diff flow.
//
// Phase 16 shipped two picker entry points (Plan 16-03):
//   1. SessionsTable per-row Compare button → /sessions/compare?a={id}
//   2. Cmd+K context-aware "Compare with…" / "Pick a different session B"
//      → opens ComparePicker Sheet → click row → /sessions/compare?a=&b=
//
// This test exercises BOTH entry points in sequence (button for A, palette
// for B), then asserts the two-up render lands. Skips when the developer's
// DB has fewer than 2 sessions — Pitfall 6 from research: e2e tests run
// against the real local backend (no test-DB seed in playwright.config.ts).

import { test, expect } from '@playwright/test'

const API = 'http://127.0.0.1:8765'

test('TEST-05b: /sessions/compare — pick A via row button + B via Cmd+K', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)

  // Pre-flight — confirm ≥2 sessions exist in SessionsTable's default
  // 7d range. The /api/sessions endpoint defaults to 30d, but
  // SessionsTable mounts with range='7d' (panels/SessionsTable.tsx:57),
  // so we MUST match the panel's window or our chosen sessionA may not
  // appear as a clickable row in the rendered table.
  const sRes = await request.get(`${API}/api/sessions?range=7d&limit=5`)
  expect(sRes.ok()).toBe(true)
  const sBody = await sRes.json()
  const ids: string[] = (sBody.items ?? []).map(
    (s: { session_id: string }) => s.session_id,
  )
  test.skip(
    ids.length < 2,
    `TEST-05b: requires ≥2 sessions in DB (range=7d), found ${ids.length}. ` +
      `Run \`cmc sync\` to ingest local Claude Code sessions, then re-run.`,
  )
  const [sessionA, sessionB] = ids

  // 1. Visit /activity (where SessionsTable is mounted — see
  //    routes/activity.tsx:48) and click the row Compare button for
  //    session A. There is no top-level /sessions route in v1.1; the
  //    table lives on the Activity page.
  await page.goto('/activity')
  // The SessionsTable's per-row Compare button has
  // aria-label="Compare session {session_id}". Use exact match to avoid
  // collisions if multiple rows render.
  const rowCompareA = page.getByRole('button', {
    name: `Compare session ${sessionA}`,
  })
  await expect(rowCompareA).toBeVisible({ timeout: 10_000 })
  await rowCompareA.click()

  // 2. Assert URL contains ?a={sessionA}. The route validateSearch
  //    (Plan 16-02) strips invalid UUIDs, so the value MUST round-trip.
  await expect(page).toHaveURL(new RegExp(`/sessions/compare\\?a=${sessionA}`))

  // 3. Open Cmd+K. Per command-palette.spec.ts, the palette listens on
  //    document and responds to ControlOrMeta+KeyK.
  await page.locator('body').click()
  await page.keyboard.press('ControlOrMeta+KeyK')
  const palette = page.getByRole('dialog', {
    name: 'Mission Control command palette',
  })
  await expect(palette).toBeVisible({ timeout: 5_000 })

  // 4. Click the context-aware Compare action. Per Plan 16-03, the label
  //    is "Compare with…" or "Pick a different session B" depending on
  //    whether ?b is set (we're at ?a only, so it's the former).
  const compareWithItem = palette.getByRole('option', {
    name: /Compare with|Pick a different session B/i,
  })
  await expect(compareWithItem).toBeVisible()
  await compareWithItem.click()

  // 5. The ComparePicker Sheet opens. It lists sessions; we click the
  //    row for session B. Per CommandPalette.tsx:240, each row is a
  //    <button aria-label="Compare with session {session_id}"> — using
  //    aria-label gives us the full UUID match (the visible text is
  //    truncated to the first 8 chars + ellipsis, so a text-content
  //    match on the full sessionB UUID would NOT hit). Self-compare
  //    guard (Plan 16-03) disables the row matching session A — using
  //    sessionB here sidesteps that branch.
  const pickerRow = page.getByRole('button', {
    name: `Compare with session ${sessionB}`,
  })
  await expect(pickerRow).toBeVisible({ timeout: 5_000 })
  await pickerRow.click()

  // 6. URL should now have both ?a and ?b.
  await expect(page).toHaveURL(
    new RegExp(`/sessions/compare\\?a=${sessionA}.*b=${sessionB}`),
  )

  // 7. Assert two-up render: both KPI strips visible. Plan 16-02's
  //    SessionCompareView (panels/SessionCompareView.tsx) renders one
  //    KPI strip per side using a SideKpiColumn helper that emits
  //    labels like "A • Cost", "A • Duration" for side A and
  //    "B • Cost", "B • Duration" for side B. The session_id UUIDs
  //    themselves are NOT rendered in the view body — the sides are
  //    identified purely by the "A •" / "B •" prefix. Assert against
  //    those stable labels rather than UUID text (which only lives in
  //    the URL bar, not the DOM). The "Side-by-side KPIs" region
  //    landmark also confirms the two-up render branch took the
  //    populated path (NOT the idle Card-shell empty branch from
  //    !a||!b).
  await expect(
    page.getByRole('region', { name: /Side-by-side KPIs/i }),
  ).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('A • Cost', { exact: false })).toBeVisible()
  await expect(page.getByText('B • Cost', { exact: false })).toBeVisible()
})
