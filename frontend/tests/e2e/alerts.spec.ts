// TEST-05a — /alerts lifecycle: create rule → fire → ack → cleanup.
//
// Architecture notes:
// - POST /api/dispatcher/trigger returns 202 (async; spawns detached
//   subprocess). The alert evaluator runs AFTER the response is sent,
//   so this test MUST poll the events panel to wait for repopulation.
// - AlertEventsList queries at refetchInterval=30_000 (queries.ts), so
//   we wait ≤35s for the firing row to appear.
// - There is no in-UI Ack button on /alerts today (verified at planning
//   time by reading AlertEventsList.tsx). Ack ships via the same
//   /api/alerts/_ack pathway used by the Telegram ack_alert callback.
//   TEST-05a calls that endpoint directly and asserts 200.
// - Cleanup: DELETE the rule in afterEach so re-runs don't accumulate
//   stale e2e-fire rows in the dev DB (Phase 15 cascade also drops
//   alert_state and alert events for the rule).

import { test, expect, type APIRequestContext } from '@playwright/test'
import { createHash } from 'node:crypto'

const API = 'http://127.0.0.1:8765'

let createdRuleId: number | null = null

async function deleteRuleIfPresent(request: APIRequestContext, id: number | null) {
  if (id === null) return
  const res = await request.delete(`${API}/api/alerts/rules/${id}`)
  // 204 expected on success; 404 acceptable if the test failed before create.
  if (![200, 204, 404].includes(res.status())) {
    throw new Error(`teardown: unexpected status ${res.status()} deleting rule ${id}`)
  }
}

test.afterEach(async ({ request }) => {
  await deleteRuleIfPresent(request, createdRuleId)
  createdRuleId = null
})

test('TEST-05a: /alerts lifecycle — create rule → fire → ack', async ({ page, request }) => {
  test.setTimeout(90_000)

  // 0. Preflight — the dispatcher_failed_tasks_5m extractor is a strict
  //    COUNT(*) over tasks WHERE status='failed' AND ended_at >= now-5m.
  //    The detector requires current_value > threshold_fire (strict >),
  //    so threshold_fire=0 fires only when count>0. The public API has
  //    no surface to stamp ended_at, so we cannot seed synthetically —
  //    skip with a clear reason instead. Aligns with TEST-05b's <2-session
  //    skip pattern and the planner-checker fix-option (c).
  const fiveMinAgoIso = new Date(Date.now() - 5 * 60_000).toISOString()
  const tasksRes = await request.get(`${API}/api/tasks?status=failed&limit=50`)
  expect(tasksRes.ok()).toBe(true)
  const tasksBody = await tasksRes.json()
  const recentFailed = (tasksBody.items ?? []).filter(
    (t: { ended_at: string | null }) =>
      t.ended_at !== null && t.ended_at >= fiveMinAgoIso,
  )
  test.skip(
    recentFailed.length === 0,
    'TEST-05a: requires ≥1 failed task with ended_at in the last 5 minutes ' +
      '(dispatcher_failed_tasks_5m extractor window). Seed one by failing a ' +
      'dispatcher run within 5 minutes of running this test.',
  )

  // 1. Seed an always-firing threshold rule. dispatcher_failed_tasks_5m has
  //    scope=<global> so we know the scope_key in advance.
  const name = `e2e-fire-${Date.now()}`
  const createRes = await request.post(`${API}/api/alerts/rules`, {
    data: {
      name,
      kind: 'threshold',
      metric: 'dispatcher_failed_tasks_5m',
      threshold_fire: 0,
      min_dwell_seconds: 0,
      min_samples: 1,
      cooldown_seconds: 0,
      enabled: true,
    },
  })
  expect(createRes.ok(), `POST /api/alerts/rules failed: ${createRes.status()}`).toBe(true)
  const created = await createRes.json()
  createdRuleId = created.id as number
  expect(typeof createdRuleId).toBe('number')

  // 2. Trigger the dispatcher tick. Returns 202 (async — spawns subprocess).
  const trigRes = await request.post(`${API}/api/dispatcher/trigger`)
  expect([200, 202]).toContain(trigRes.status())

  // 3. Visit /alerts, confirm the rule appears in the rules list.
  await page.goto('/alerts')
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 })

  // 4. Wait for the events list to refetch and surface the firing row.
  //    AlertEventsList uses refetchInterval=30_000; allow one full cycle
  //    plus margin. The firing row's Rule column shows the rule name as
  //    <strong>{rule_name}</strong> per AlertEventsList.tsx col definition.
  const eventsTable = page.getByRole('table', { name: /Alert firing history/i })
  await expect(eventsTable).toBeVisible({ timeout: 10_000 })
  await expect(
    eventsTable.locator('tbody tr', { hasText: name }),
  ).toBeVisible({ timeout: 35_000 })

  // 5. Ack via the same pathway the Telegram ack_alert callback uses.
  //    scope_hash = sha256('<global>').hexdigest()[:8] for the
  //    dispatcher_failed_tasks_5m metric (no per-scope split).
  const scopeHash = createHash('sha256').update('<global>').digest('hex').slice(0, 8)
  const ackRes = await request.post(`${API}/api/alerts/_ack`, {
    data: { rule_id: createdRuleId, scope_hash: scopeHash },
  })
  expect(ackRes.status(), `POST /api/alerts/_ack returned ${ackRes.status()}`).toBe(200)
  const ackBody = await ackRes.json()
  expect(ackBody.ok).toBe(true)
  expect(typeof ackBody.acked_until).toBe('string')
  // ISO-8601 format check (loose — value is "now + 1h").
  expect(ackBody.acked_until).toMatch(/^\d{4}-\d{2}-\d{2}T/)
})
