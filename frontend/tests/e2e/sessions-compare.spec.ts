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
//
// Phase 23 Plan 03 extends this file with two additional tests:
//   - TEST-23-CMPR-06: per-skill p95 latency section mounts on /sessions/compare
//     and delta is suppressed when EITHER side is low-sample (preflight-aware).
//   - TEST-23-CMPR-07: Cmd+K "Compare with previous session" gating + nav.

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
  //    is "Compare with…" (when only ?a is set) or "Pick a different
  //    session B" (when both are). We're at ?a only, so it's the former.
  //    NOTE: Phase 23 Plan 02 added a sibling "Compare with previous
  //    session" option which the legacy regex `/Compare with|.../i` also
  //    matches under strict mode (raises strict-mode violation). Anchor
  //    the regex with `…` (the ellipsis is unique to the original Plan
  //    16-03 label) so we resolve to a single option element.
  const compareWithItem = palette.getByRole('option', {
    name: /Compare with…|Pick a different session B/i,
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

// TEST-23-CMPR-06 — Per-skill p95 latency section renders on /sessions/compare.
//
// Phase 23 Plan 02 added a `SkillLatencySection` to `SessionCompareView` that
// reads `skill_latencies` per side and `low_sample_a` / `low_sample_b` flags
// from `/api/sessions/compare`. Stable anchors (testids per the e2e
// convention `feature-component-element`):
//   - section: data-testid="session-compare-skill-latency-section"
//   - low-sample badge: data-testid="session-compare-skill-latency-low-sample"
//   - delta cell per skill: data-testid="session-compare-skill-latency-delta-{skill}"
//
// The dev DB may have no completed skill invocations for the chosen sessions,
// so we preflight `/api/sessions/compare?a=&b=` to inspect the actual
// `skill_latencies` shape before asserting on rendered content. We always
// assert the SECTION mounts (it renders an EmptyState when both sides have
// no skill latencies, so the wrapper still exists). We only assert the
// suppression / delta-presence behavior when the preflight tells us the
// branch is exercisable.
test('TEST-23-CMPR-06: /sessions/compare — per-skill p95 latency section mounts; delta suppressed on low-sample', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)

  // Need ≥2 sessions to construct a compare URL. Match the SessionsTable
  // 7d window so steady-state behavior matches TEST-05b.
  const sRes = await request.get(`${API}/api/sessions?range=7d&limit=5`)
  expect(sRes.ok()).toBe(true)
  const sBody = await sRes.json()
  const ids: string[] = (sBody.items ?? []).map(
    (s: { session_id: string }) => s.session_id,
  )
  test.skip(
    ids.length < 2,
    `TEST-23-CMPR-06: requires ≥2 sessions in DB (range=7d), found ${ids.length}. ` +
      `Run \`cmc sync\` to ingest local Claude Code sessions, then re-run.`,
  )
  const [sessionA, sessionB] = ids

  // Preflight the actual compare response so we can branch assertions on
  // real data shape (Pitfall 6: dev DB has unpredictable seed state).
  const cmpRes = await request.get(
    `${API}/api/sessions/compare?a=${sessionA}&b=${sessionB}`,
  )
  expect(cmpRes.ok()).toBe(true)
  const cmpBody: {
    a: { skill_latencies?: Record<string, number> }
    b: { skill_latencies?: Record<string, number> }
    low_sample_a: boolean
    low_sample_b: boolean
  } = await cmpRes.json()
  const skillsA = Object.keys(cmpBody.a.skill_latencies ?? {})
  const skillsB = Object.keys(cmpBody.b.skill_latencies ?? {})
  const sharedSkill = skillsA.find((s) => skillsB.includes(s))
  const lowSample = Boolean(cmpBody.low_sample_a || cmpBody.low_sample_b)

  // Navigate to the compare page directly with both ids resolved.
  await page.goto(
    `/sessions/compare?a=${sessionA}&b=${sessionB}`,
  )

  // The latency section ALWAYS mounts (renders EmptyState branch when no
  // skill latencies exist — see SessionCompareView.tsx:378-399). Use the
  // testid as the stable anchor.
  const latencySection = page.getByTestId(
    'session-compare-skill-latency-section',
  )
  await expect(latencySection).toBeVisible({ timeout: 15_000 })

  // Branch on the preflight data shape. We only exercise the row-level
  // delta assertions when the data warrants it; otherwise we just assert
  // the section mounts (handled above) and skip the deeper checks with
  // an actionable reason.
  if (skillsA.length === 0 && skillsB.length === 0) {
    test.info().annotations.push({
      type: 'note',
      description:
        'TEST-23-CMPR-06: both sides have no skill_latencies — section ' +
        'mounted in EmptyState branch; skipping delta assertions. Run ' +
        '`cmc sync` against a project with completed skill invocations ' +
        'to exercise the populated branch.',
    })
    return
  }

  // Section is in the populated branch — the rows table should be present.
  await expect(
    page.getByTestId('session-compare-skill-latency-table'),
  ).toBeVisible()

  if (lowSample) {
    // D-17: low-sample badge should be visible AND delta cells should
    // show EM_DASH (—) instead of a numeric ms value. Assert at least
    // one delta cell exists (any skill with a row will have one).
    await expect(
      page.getByTestId('session-compare-skill-latency-low-sample'),
    ).toBeVisible()
    // Pick any rendered skill from either side to anchor the delta cell.
    const anySkill = sharedSkill ?? skillsA[0] ?? skillsB[0]
    if (anySkill) {
      const deltaCell = page.getByTestId(
        `session-compare-skill-latency-delta-${anySkill}`,
      )
      await expect(deltaCell).toBeVisible()
      // EM DASH (U+2014). Suppression renders this when either side is
      // low-sample (D-17) OR when one side lacks a value for the skill.
      await expect(deltaCell).toHaveText('—')
    }
  } else {
    // Both sides ≥30 samples per side. The badge MUST NOT render.
    await expect(
      page.getByTestId('session-compare-skill-latency-low-sample'),
    ).toHaveCount(0)
    // Delta should be a real numeric value when both sides have a value
    // for the same skill. We can only assert this when there's a shared
    // skill across both sides — otherwise the row renders with EM_DASH
    // for the missing side (haveBoth=false branch in SessionCompareView).
    if (sharedSkill) {
      const deltaCell = page.getByTestId(
        `session-compare-skill-latency-delta-${sharedSkill}`,
      )
      await expect(deltaCell).toBeVisible()
      // Format: optional sign + integer + 'ms' (e.g. "+12ms", "-5ms", "0ms").
      await expect(deltaCell).toHaveText(/^[+-]?\d+ms$/)
    } else {
      test.info().annotations.push({
        type: 'note',
        description:
          'TEST-23-CMPR-06: no skill exists on BOTH sides; delta-value ' +
          'branch not asserted. Section + low-sample-absence verified.',
      })
    }
  }
})

// TEST-23-CMPR-07 — Cmd+K "Compare with previous session" gating + navigation.
//
// Phase 23 Plan 02 (D-04, D-07..D-10) wired a Cmd+K command that:
//   - Is HIDDEN when /api/sessions/{sid}/previous returns 404 ({error:"no
//     previous session"}) — D-09.
//   - When visible, navigates directly to /sessions/compare?a=<sid>&b=<prev>
//     — D-08.
// The visibility gate reads from `useActiveSession()` (D-07: only on session
// detail views) OR from URL `a` on /sessions/compare (D-10).
//
// We exercise the D-10 path because /sessions/compare?a=<sid> is reliable
// across dev DB states (no Sheet portal needed). Selecting a session that
// has a previous session in the same project_key drives the visible branch;
// selecting one without drives the hidden branch.
test('TEST-23-CMPR-07: Cmd+K "Compare with previous session" gating + navigation', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)

  // Pull a wide enough window so we can scan for both branches.
  const sRes = await request.get(`${API}/api/sessions?range=30d&limit=50`)
  expect(sRes.ok()).toBe(true)
  const sBody = await sRes.json()
  const ids: string[] = (sBody.items ?? []).map(
    (s: { session_id: string }) => s.session_id,
  )
  test.skip(
    ids.length < 1,
    `TEST-23-CMPR-07: requires ≥1 session in DB (range=30d), found ${ids.length}. ` +
      `Run \`cmc sync\` to ingest local Claude Code sessions, then re-run.`,
  )

  // Preflight /previous for each candidate to find one of each branch:
  //   - sidWithPrevious: /previous → 200 {session_id}
  //   - sidWithoutPrevious: /previous → 404 {error:"no previous session"}
  // We stop scanning as soon as we have both branches (or exhaust ids).
  let sidWithPrevious: string | null = null
  let prevSidOf: string | null = null
  let sidWithoutPrevious: string | null = null
  for (const sid of ids) {
    const r = await request.get(`${API}/api/sessions/${sid}/previous`)
    if (r.status() === 200) {
      if (sidWithPrevious === null) {
        sidWithPrevious = sid
        const body = await r.json()
        prevSidOf = body.session_id
      }
    } else if (r.status() === 404) {
      if (sidWithoutPrevious === null) {
        sidWithoutPrevious = sid
      }
    }
    if (sidWithPrevious !== null && sidWithoutPrevious !== null) break
  }

  // Branch A — VISIBLE + NAVIGATE.
  // Requires a session with a previous in the same project_key. Dev DBs
  // that have only one session per project_key won't have any.
  if (sidWithPrevious !== null && prevSidOf !== null) {
    await page.goto(`/sessions/compare?a=${sidWithPrevious}`)

    // Wait for the compare page to finish its initial load — the side
    // KPI region rendering means useSessionCompare resolved, which means
    // useSessionPrevious also had time to fire (both keyed off `a`).
    // The page may render the idle "pick two" empty-state if `a` alone
    // yields no compare; either way we just need the cmdk listener live.
    await page.waitForLoadState('networkidle')

    // Open Cmd+K.
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    const palette = page.getByRole('dialog', {
      name: 'Mission Control command palette',
    })
    await expect(palette).toBeVisible({ timeout: 5_000 })

    // The new command-item carries data-testid="cmdk-compare-with-previous"
    // (CommandPalette.tsx:290). Use that as the stable anchor.
    const compareWithPrevious = palette.getByTestId(
      'cmdk-compare-with-previous',
    )
    await expect(compareWithPrevious).toBeVisible({ timeout: 5_000 })
    await expect(compareWithPrevious).toHaveText(
      /Compare with previous session/i,
    )

    // Selecting it should navigate to /sessions/compare?a=<sid>&b=<prev>.
    await compareWithPrevious.click()
    await expect(page).toHaveURL(
      new RegExp(
        `/sessions/compare\\?a=${sidWithPrevious}.*b=${prevSidOf}`,
      ),
    )
  } else {
    test.info().annotations.push({
      type: 'note',
      description:
        'TEST-23-CMPR-07: no session with a previous-session match in dev ' +
        'DB; visible-branch + navigation assertion skipped. Run `cmc sync` ' +
        'against a project that has ≥2 ended sessions sharing project_key.',
    })
  }

  // Branch B — HIDDEN (404 from /previous).
  // We MUST NOT see the compare-with-previous command item, AND no error
  // UI should bubble (the hook discards 404 to null per useSessionPrevious).
  if (sidWithoutPrevious !== null) {
    await page.goto(`/sessions/compare?a=${sidWithoutPrevious}`)
    await page.waitForLoadState('networkidle')

    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    const palette2 = page.getByRole('dialog', {
      name: 'Mission Control command palette',
    })
    await expect(palette2).toBeVisible({ timeout: 5_000 })

    // The action MUST NOT render when /previous returns 404.
    await expect(
      palette2.getByTestId('cmdk-compare-with-previous'),
    ).toHaveCount(0)
  } else {
    test.info().annotations.push({
      type: 'note',
      description:
        'TEST-23-CMPR-07: no session that returns 404 from /previous; ' +
        'hidden-branch assertion skipped. This is rare — most dev DBs ' +
        'have at least one session that is the first in its project_key.',
    })
  }

  // If neither branch was exercisable, surface a single skip — there is
  // no value to running this assertion file at all in that DB state.
  test.skip(
    sidWithPrevious === null && sidWithoutPrevious === null,
    'TEST-23-CMPR-07: dev DB has no sessions exercising either branch ' +
      '(visible OR hidden). Run `cmc sync` and re-run.',
  )
})
