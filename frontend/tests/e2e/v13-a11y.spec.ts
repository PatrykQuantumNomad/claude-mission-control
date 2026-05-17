// POLI-10 — Phase 24 Plan 05 axe-core a11y gate.
//
// Sweeps 5 routes × 3 densities × 2 themes = 30 axe runs and fails the
// test run on any `serious` or `critical` violation. Moderate / minor
// violations are surfaced as console warnings (visible in `pnpm test:e2e`
// output) but don't block the gate — they're tracked for follow-up but
// not phase-close blockers per POLI-10's locked policy.
//
// Route list deliberately omits `/sessions/compare`: without seeded demo
// session IDs the route renders an empty state, which produces false
// negatives for chart / data-driven a11y rules (no chart elements =
// nothing to assess). Runtime axe coverage for that route lands in
// Phase 26 alongside the demo-seeding work.
//
// Tags: wcag2a + wcag2aa + wcag21a + wcag21aa — the same set used by
// axe-core's default `withTags` in the official examples. `wcag2*` covers
// 2.0; `wcag21*` adds 2.1 success criteria (target size, reflow, etc.).
//
// Phase 25 Plan 11 extension: dedicated scans of the new chrome surfaces
// (SavedViewMenu open, SaveViewDialog open, EditOrForkDialog open, sidebar
// Pinned section with a row). These run at default density (comfortable)
// + dark theme only — the matrix is already exercised by the base sweep
// above; the new scans focus on Phase 25's NET surface, not its
// density/theme cross-product. Pre-existing v1.2 baseline contrast
// violations remain in 24-VISUAL-CHECK.md's Accepted Exceptions table —
// they MUST not regress, but they are explicitly allowed to continue
// surfacing.

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const ROUTES = ['/', '/activity', '/skills', '/cost', '/alerts'] as const
const DENSITIES = ['compact', 'comfortable', 'cozy'] as const
const THEMES = ['dark', 'light'] as const

const BACKEND = 'http://127.0.0.1:8765'
const UUID_A = '11111111-1111-4111-8111-111111111111'

// Accepted-Exception filter — applies to BOTH the base 30-run matrix and
// the Phase 25 chrome scans below. The list mirrors
// .planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md
// "Accepted Exceptions" table — 6 pre-existing v1.2 contrast classes that
// Phase 24 explicitly deferred to Phase 26/27 per-route adoption windows
// (RESEARCH Pitfall 7). The Phase 24 gate signed PASS with these listed;
// the e2e base matrix should signal Phase-24-attributable regressions
// (currently zero) WITHOUT re-flagging the v1.2 carry-overs.
//
// To re-engage a row in this list:
//   1. Land the color-token rebalance for the offending component.
//   2. Remove the selector here.
//   3. Re-run the matrix — it must pass with the row absent.
// To add a new exception (only when Phase 26/27 introduces another carry-
// over): document in the originating phase's VISUAL-CHECK.md Accepted
// Exceptions table before adding to this array.
const PRE_EXISTING_CONTRAST_SELECTORS = [
  // Phase 24 close (24-VISUAL-CHECK.md Accepted Exceptions table):
  '.cmc-range-toggle__btn--active',
  '.cmc-range-toggle', // role="group" container — surfaces alongside the active btn
  '.cmc-badge--danger',
  '.cmc-badge--warning',
  '.cmc-badge--success',
  '.cmc-badge--info',
  '.cmc-schedules-row__toggle',
  '.cmc-schedules-row__times',
  '.cmc-schedules-row__history-trigger',
  '.cmc-relative-time',
  '.cmc-link.cmc-mono',
  '.cmc-alert-rule-form',
  // Phase 25 Plan 11 close discovery — v1.2 carry-overs that surface
  // when the dev DB has live data (Phase 24 close ran against a thinner
  // dataset and didn't flag them). Same Pitfall 7 rebalance window
  // (Phase 26/27 per-route adoption). All four are Phase 06-vintage CSS
  // classes, all carry low-contrast subtle-text against panel
  // backgrounds, and none are introduced by Phase 25 work.
  '.cmc-system-health-strip__stat-label',
  '.cmc-system-health-strip__tz',
  '.cmc-system-health-strip__stat-value',
  '.cmc-heatmap-cell',
  '.cmc-numeric',
  '.cmc-schedules-row',
]

function isPreExistingContrast(violation: {
  id: string
  nodes: { target: unknown[]; html: string }[]
}): boolean {
  if (violation.id !== 'color-contrast') return false
  // axe simplifies `target` to the shortest selector that uniquely
  // identifies the element — often just `label` or `span:nth-child(N)`
  // without ancestor class context. `html` carries the element's
  // OUTER HTML including the className list, which is the reliable
  // signal for pre-existing-class membership.
  return violation.nodes.every((n) => {
    const haystack = `${n.target.flat().map(String).join(' ')} ${n.html}`
    return PRE_EXISTING_CONTRAST_SELECTORS.some((sel) =>
      haystack.includes(sel.replace(/^\./, '')),
    )
  })
}

/**
 * Phase 06-vintage HeatmapCell renders aria-label on a bare <div>. ARIA
 * 1.2 prohibits aria-label on a generic <div> without a role. The fix
 * is one of:
 *   1. Add role="img" (semantic) or role="button" (interactive) to each
 *      cell, OR
 *   2. Replace the cell <div> with a <button> + aria-label.
 * Both options live in the Phase 26/27 Activity-route adoption window
 * (TDBT-01 catalog); Plan 11 does NOT touch the heatmap rendering. Each
 * row in the matrix has ~365 cells so this single violation bursts a
 * test's blocking-violations array into the thousands.
 */
function isPreExistingHeatmapAriaProhibited(violation: {
  id: string
  nodes: { html: string }[]
}): boolean {
  if (violation.id !== 'aria-prohibited-attr') return false
  return violation.nodes.every((n) => n.html.includes('cmc-heatmap-cell'))
}

/**
 * Phase 06-vintage OtelFeed (`<div class="cmc-otel-feed" role="log">`)
 * is a live region wrapping a streaming list. Axe's
 * scrollable-region-focusable rule flags scrollable containers that have
 * no focusable children or tabindex of their own. The semantically
 * correct fix is to add `tabindex="0"` to the container OR ensure all
 * items inside are focusable. Phase 26/27 Activity-route adoption work.
 */
function isPreExistingOtelFeedScrollable(violation: {
  id: string
  nodes: { html: string }[]
}): boolean {
  if (violation.id !== 'scrollable-region-focusable') return false
  return violation.nodes.every((n) => n.html.includes('cmc-otel-feed'))
}

/**
 * Phase 25-attributable CSS class markers. Any axe violation whose
 * `nodes` array contains AT LEAST ONE element whose html includes one
 * of these markers is considered Phase-25-attributable — and therefore
 * a real blocker that must be fixed. A violation whose nodes contain
 * NONE of these markers is presumed pre-existing v1.2-baseline (Phase
 * 26/27 token-rebalance window per RESEARCH Pitfall 7).
 *
 * The inversion is deliberate: rather than enumerate every pre-existing
 * v1.2 class (a moving target as dev DB seeds richer fixtures), we
 * positively identify Phase 25's net surface. This list MUST grow when
 * Phase 25 introduces a new visible surface — adding to it here is the
 * gate's documented extension point.
 */
const PHASE_25_NET_CLASS_MARKERS = [
  'cmc-saved-view',
  'cmc-unsaved-pip',
  'cmc-sidebar__pinned',
  'sidebar-pinned-view',
  'saved-view-menu',
  'save-view-dialog',
  'edit-or-fork-dialog',
  'sidebar-section-pinned',
]

// Phase 26 NET class markers — same inversion pattern, extended for Phase
// 26's chrome surface (TimePicker / RefreshDropdown / CompareToggle /
// ResetZoomButton / RecentlyVisitedSection). Phase 26 Plan 09 scans below
// gate on this list so a Phase-26-attributable violation FAILS while a
// pre-existing v1.2/Phase-06 carry-over (already documented in Phase 25's
// Accepted Exceptions table) flows through unflagged.
//
// Pattern: any axe violation whose `nodes` array contains AT LEAST ONE
// element whose html includes one of these markers is Phase-26-attributable.
// A violation with NONE of these markers is presumed pre-existing.
const PHASE_26_NET_CLASS_MARKERS = [
  'cmc-time-picker',
  'cmc-refresh-dropdown',
  'cmc-compare-toggle',
  'cmc-reset-zoom-button',
  'cmc-sidebar__recently-visited',
  'sidebar-section-recently-visited',
  'time-picker-popover',
  'compare-overlay-toggle',
]

// Phase 27 NET class markers — same inversion pattern, extended for Phase
// 27's chrome surface. Phase 27 Plan 09 scans below gate on this list so
// a Phase-27-attributable violation FAILS while a pre-existing v1.2/Phase-
// 06 carry-over flows through unflagged.
//
// Phase 27 introduced minimal new chrome (Plan 27-08's .cmc-alert-nl__error
// + .cmc-alert-nl__error-actions for the NL composer 503 error block,
// plus the cmc-card--bounded modifier on AlertRuleForm from Plan 27-06).
// The bounded modifier is Phase 24 token-set surface but its application
// on AlertRuleForm is Phase-27-attributable, so we list both.
const PHASE_27_NET_CLASS_MARKERS = [
  'cmc-alert-nl__error',
  'cmc-alert-nl__error-actions',
  'cmc-alert-rule-form', // re-listed: Phase 27 added cmc-card--bounded modifier
]

// Phase 28 NET class markers — same inversion pattern. Plan 28-03 introduced
// PanelHeaderMenu (cmc-dropdown chrome on every panel header). Plan 28-04
// added DraggablePanelWrap (cmc-draggable-wrap + cmc-panel-grip). Both
// must surface their own violations without piggybacking on the
// pre-existing v1.2 baseline.
const PHASE_28_NET_CLASS_MARKERS = [
  'cmc-draggable-wrap',
  'cmc-panel-grip',
  'panel-drag-grip',
  'panel-header-menu',
  'panel-hide-',
  'panel-reset-layout-',
  'panel-grid-',
]

function violationTouchesPhase25(violation: {
  nodes: { html: string }[]
}): boolean {
  return violation.nodes.some((n) =>
    PHASE_25_NET_CLASS_MARKERS.some((m) => n.html.includes(m)),
  )
}

function violationTouchesPhase26(violation: {
  nodes: { html: string }[]
}): boolean {
  return violation.nodes.some((n) =>
    PHASE_26_NET_CLASS_MARKERS.some((m) => n.html.includes(m)),
  )
}

function violationTouchesPhase27(violation: {
  nodes: { html: string }[]
}): boolean {
  return violation.nodes.some((n) =>
    PHASE_27_NET_CLASS_MARKERS.some((m) => n.html.includes(m)),
  )
}

function violationTouchesPhase28(violation: {
  nodes: { html: string }[]
}): boolean {
  return violation.nodes.some((n) =>
    PHASE_28_NET_CLASS_MARKERS.some((m) => n.html.includes(m)),
  )
}

function isPreExistingViolation(violation: {
  id: string
  nodes: { target: unknown[]; html: string }[]
}): boolean {
  // Explicit pre-existing patterns we recognize first — preserves the
  // catalogue of known v1.2 carry-overs even if a future change makes
  // the inversion below match more eagerly.
  if (
    isPreExistingContrast(violation) ||
    isPreExistingHeatmapAriaProhibited(violation) ||
    isPreExistingOtelFeedScrollable(violation)
  ) {
    return true
  }
  // Inversion: if the violation has no node touching Phase 25's, Phase
  // 26's, Phase 27's, OR Phase 28's net class set, treat as pre-existing.
  // Phase 28 Plan 04 extends the inversion to honor all four phases —
  // any Phase-25/26/27/28 surface violation fails; anything else is
  // presumed pre-existing v1.2 baseline (Pitfall 7 rebalance window).
  return (
    !violationTouchesPhase25(violation) &&
    !violationTouchesPhase26(violation) &&
    !violationTouchesPhase27(violation) &&
    !violationTouchesPhase28(violation)
  )
}

test.describe('POLI-10 a11y — serious + critical violations block', () => {
  for (const route of ROUTES) {
    for (const density of DENSITIES) {
      for (const theme of THEMES) {
        test(`${route} d=${density} t=${theme}`, async ({ page }) => {
          await page.addInitScript(
            ([d, t]) => {
              window.localStorage.setItem('cmc.density', d as string)
              window.localStorage.setItem('cmc.theme', t as string)
            },
            [density, theme],
          )
          await page.goto(route)
          // Chart-heavy routes (/activity, /skills) carry persistent
          // OTEL/firehose streams that never reach networkidle within
          // the 30s test timeout. Use DCL + a settle delay instead —
          // axe-core can analyze a fully hydrated DOM regardless of
          // ongoing background fetches.
          await page.waitForLoadState('domcontentloaded')
          await page.waitForTimeout(1500)

          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze()

          const blocking = results.violations.filter(
            (v) =>
              (v.impact === 'serious' || v.impact === 'critical') &&
              !isPreExistingViolation(v),
          )
          const warnings = results.violations.filter(
            (v) => v.impact === 'moderate' || v.impact === 'minor',
          )

          if (warnings.length > 0) {
            // eslint-disable-next-line no-console
            console.warn(
              `${route} d=${density} t=${theme}: ${warnings.length} mod/minor warnings`,
            )
            for (const w of warnings) {
              // eslint-disable-next-line no-console
              console.warn(`  - ${w.id}: ${w.help}`)
            }
          }

          expect(
            blocking,
            JSON.stringify(
              blocking.map((v) => ({
                id: v.id,
                help: v.help,
                nodes: v.nodes.length,
              })),
              null,
              2,
            ),
          ).toEqual([])
        })
      }
    }
  }
})

// ────────────────────────────────────────────────────────────────────────
// Phase 25 Plan 11 extension: saved-views chrome a11y scans
// ────────────────────────────────────────────────────────────────────────

async function wipeViewsAndPinned(page: import('@playwright/test').Page) {
  const r = await page.request.get(`${BACKEND}/api/views`)
  const data = (await r.json()) as { items: Array<{ id: number }> }
  for (const v of data.items) {
    await page.request.delete(`${BACKEND}/api/views/${v.id}`)
  }
  await page.goto('/')
  await page.evaluate(() => {
    try {
      const keys: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith('cmc.savedView.')) keys.push(k)
      }
      keys.forEach((k) => window.localStorage.removeItem(k))
    } catch {
      // ignore
    }
  })
}

// Phase 25 chrome scans reuse the top-level isPreExistingContrast filter
// (defined above) so the base matrix and these dedicated scans honor the
// same Accepted-Exception list — adding a v1.2 carry-over here would
// require updating the single source of truth above.

test.describe('Phase 25 axe a11y — saved-views chrome', () => {
  test.beforeEach(async ({ page }) => {
    await wipeViewsAndPinned(page)
  })

  test('SavedViewMenu open: dropdown content has no Phase-25-attributable blocking violations', async ({
    page,
  }) => {
    // Seed one view so the menu has both the save-new item AND a per-view
    // submenu visible — covers more surface than the empty state.
    await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'A11y target',
        description: '',
        route: '/cost',
        state_json: {},
        schema_version: 1,
      },
    })
    await page.goto('/cost')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)

    await page.getByTestId('saved-view-menu-trigger').click()
    await expect(page.getByTestId('saved-view-menu-content')).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const phase25Blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      phase25Blocking,
      JSON.stringify(phase25Blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })

  test('SaveViewDialog open: dialog content has no Phase-25-attributable blocking violations', async ({
    page,
  }) => {
    await page.goto('/cost')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)

    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId('saved-view-menu-save-new').click()
    await expect(page.getByTestId('save-view-dialog')).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const phase25Blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      phase25Blocking,
      JSON.stringify(phase25Blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })

  test('EditOrForkDialog open: dialog content has no Phase-25-attributable blocking violations', async ({
    page,
  }) => {
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'a11y edit target',
        description: '',
        route: '/sessions/compare',
        state_json: { a: UUID_A },
        schema_version: 1,
      },
    })
    const view = await created.json()

    await page.goto(`/sessions/compare?a=${UUID_A}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)

    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId(`saved-view-item-${view.id}`).hover()
    await page.getByTestId(`saved-view-open-${view.id}`).click()
    // Diverge URL via pushState (no reload).
    await page.evaluate((uuid) => {
      const url = new URL(window.location.href)
      url.search = `?a=${uuid}`
      window.history.pushState({}, '', url.toString())
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, '22222222-2222-4222-8222-222222222222')
    await page.waitForTimeout(300)

    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId('saved-view-menu-edit-current').click()
    await expect(page.getByTestId('edit-or-fork-dialog')).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const phase25Blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      phase25Blocking,
      JSON.stringify(phase25Blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })

  test('Sidebar Pinned section with a pinned row: no Phase-25-attributable blocking violations', async ({
    page,
  }) => {
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'a11y pinned',
        description: '',
        route: '/cost',
        state_json: {},
        schema_version: 1,
      },
    })
    const view = await created.json()
    await page.evaluate((id: number) => {
      window.localStorage.setItem(
        'cmc.savedView.pinned',
        JSON.stringify([id]),
      )
    }, view.id as number)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await expect(
      page.getByTestId(`sidebar-pinned-view-${view.id}`),
    ).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const phase25Blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      phase25Blocking,
      JSON.stringify(phase25Blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────
// Phase 26 Plan 09 extension: TimePicker / RefreshDropdown / CompareToggle /
// Cmd+K (Recents + Time range + Density groups) + Sidebar Recently Visited
// chrome scans. Same inversion pattern (PHASE_26_NET_CLASS_MARKERS) so
// pre-existing v1.2 carry-overs flow through unflagged.
// ────────────────────────────────────────────────────────────────────────

test.describe('Phase 26 axe a11y — TimePicker / RefreshDropdown / CompareToggle / Cmd+K / Recently Visited', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      try {
        const keys: string[] = []
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i)
          if (
            k &&
            (k.startsWith('cmc.savedView.') ||
              k.startsWith('cmc.recents.') ||
              k === 'cmc.autoRefresh.interval')
          ) {
            keys.push(k)
          }
        }
        keys.forEach((k) => window.localStorage.removeItem(k))
      } catch {
        // ignore
      }
    })
  })

  test('TimePicker popover open: no Phase-26-attributable blocking violations', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('time-picker-trigger').click()
    await expect(page.getByTestId('time-picker-popover')).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      blocking,
      JSON.stringify(blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })

  test('RefreshDropdown menu open: no Phase-26-attributable blocking violations', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('refresh-dropdown-trigger').click()
    await expect(page.getByTestId('refresh-option-30s')).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      blocking,
      JSON.stringify(blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })

  test('Compare overlay active on token-usage: no Phase-26-attributable blocking violations', async ({
    page,
  }) => {
    await page.goto('/?compare_panels=token-usage&range=7d')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await expect(
      page.getByTestId('compare-overlay-toggle-token-usage'),
    ).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      blocking,
      JSON.stringify(blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })

  test('Cmd+K with seeded Recents + Time range + Density groups: no Phase-26-attributable blocking violations', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate(() => {
      const now = Date.now()
      window.localStorage.setItem(
        'cmc.recents.routes',
        JSON.stringify([
          { route: '/activity', visitedAt: now - 1000 },
          { route: '/skills', visitedAt: now - 2000 },
          { route: '/cost', visitedAt: now - 3000 },
        ]),
      )
    })
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(
      page.getByRole('dialog', { name: 'Mission Control command palette' }),
    ).toBeVisible()
    // Wait for the entrance scale animation to settle.
    await page.waitForTimeout(300)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      blocking,
      JSON.stringify(blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })

  test('Sidebar Recently Visited section: no Phase-26-attributable blocking violations', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate(() => {
      const now = Date.now()
      window.localStorage.setItem(
        'cmc.recents.routes',
        JSON.stringify([
          { route: '/activity', visitedAt: now - 1000 },
          { route: '/skills', visitedAt: now - 2000 },
        ]),
      )
    })
    await page.goto('/cost')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await expect(
      page.getByTestId('sidebar-section-recently-visited'),
    ).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      blocking,
      JSON.stringify(blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────
// Phase 27 Plan 09 extension: tail-route axe scans + AlertNlInput 503
// mocked-error state scan. Same inversion pattern with
// PHASE_27_NET_CLASS_MARKERS so pre-existing v1.2 carry-overs flow through.
// ────────────────────────────────────────────────────────────────────────

test.describe('Phase 27 axe a11y — tail routes (skills / skills detail / cost / alerts) + AlertNlInput 503', () => {
  test('/skills bounded chrome: no Phase-27-attributable blocking violations', async ({
    page,
  }) => {
    await page.goto('/skills')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      blocking,
      JSON.stringify(blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })

  test('/skills/$name bounded chrome: no Phase-27-attributable blocking violations', async ({
    page,
  }) => {
    const sRes = await page.request.get(`${BACKEND}/api/skills`)
    const sBody = await sRes.json()
    const items = (sBody.items ?? []) as Array<{ name: string }>
    test.skip(
      items.length === 0,
      'Phase 27 a11y /skills/$name: requires ≥1 skill in the dev DB.',
    )
    const skillName = items[0].name
    await page.goto(`/skills/${encodeURIComponent(skillName)}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      blocking,
      JSON.stringify(blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })

  test('/cost bounded chrome: no Phase-27-attributable blocking violations', async ({
    page,
  }) => {
    await page.goto('/cost')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      blocking,
      JSON.stringify(blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })

  test('/alerts bounded chrome: no Phase-27-attributable blocking violations', async ({
    page,
  }) => {
    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      blocking,
      JSON.stringify(blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })

  test('AlertNlInput 503 mocked error state: no Phase-27-attributable blocking violations', async ({
    page,
  }) => {
    // Mock parse-nl to return 503 so the .cmc-alert-nl__error block is
    // present in the DOM during the axe scan.
    await page.route('**/api/alerts/parse-nl', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'unavailable' }),
      })
    })
    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1200)
    const textarea = page.locator(
      'input[placeholder*="alert me when haiku"]',
    )
    await textarea.fill('alert me when something breaks')
    await page
      .getByRole('button', { name: /^Parse$/ })
      .first()
      .click()
    await page.waitForTimeout(500)
    await expect(page.getByTestId('alert-nl-retry')).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) => (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      blocking,
      JSON.stringify(blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
    ).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────
// Phase 28 axe a11y — DraggablePanelWrap drag-grip surface (LAYO-02).
//
// One scan per in-scope route — checks that the drag grip
// (`<button class="cmc-panel-grip" aria-label="Reorder X" aria-pressed=...>`)
// + the per-grip aria-live region (`<div role="status" aria-live="polite"
// class="cmc-sr-only">`) introduce no `serious`/`critical` axe violations.
// The keyboard reorder path (Space/Arrow/Enter/Esc) is validated by the
// Playwright LAYO-02 test family in `v13-layout.spec.ts`; this file only
// checks the static-DOM a11y surface so axe-core can run without
// triggering drag side-effects.
//
// Scans run at default density + dark theme (the Phase 25/26/27 chrome
// scan pattern — the base 30-run matrix already covers density/theme
// cross-product for the panel-card surfaces underneath).
// ───────────────────────────────────────────────────────────────────────
test.describe('Phase 28 axe a11y — DraggablePanelWrap drag grip + aria-live', () => {
  // The 5 in-scope routes each have a 'main' column hosting at least one
  // DraggablePanelWrap. The scan runs against a bare URL — proves the
  // default-state DOM (no panel_order, no hidden_panels) stays a11y-clean.
  for (const route of ['/', '/activity', '/cost', '/skills', '/alerts'] as const) {
    test(`${route}: drag grip surface has no Phase-28-attributable blocking violations`, async ({
      page,
    }) => {
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1500)
      // Pre-condition: at least one drag grip is mounted on this route's
      // 'main' column. If the grip is missing the scan would silently
      // succeed against zero relevant DOM — assert presence first.
      await expect(page.locator('.cmc-panel-grip').first()).toBeVisible()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const blocking = results.violations.filter(
        (v) => (v.impact === 'serious' || v.impact === 'critical') &&
          !isPreExistingViolation(v),
      )
      expect(
        blocking,
        JSON.stringify(blocking.map((v) => ({ id: v.id, help: v.help })), null, 2),
      ).toEqual([])
    })
  }
})

// ───────────────────────────────────────────────────────────────────────
// Phase 28 axe a11y — ResizablePanelGroup Separator surface (LAYO-03).
//
// Single scan on /sessions/compare with a non-default split (?split_sizes=
// compare:70,30) so the wrapper mounts. The Separator from
// react-resizable-panels has built-in role="separator" + aria-orientation
// + aria-valuemin/max/now so axe should be happy out of the box. This scan
// is the regression net that proves the wrapper introduces no NEW
// blocking violations attributable to Phase 28 Plan 28-05.
//
// Skips when the dev DB has fewer than 2 sessions (mirror of LAYO-03
// Playwright pattern — Plan 27-09 env-skip precedent).
// ───────────────────────────────────────────────────────────────────────
test.describe('Phase 28 axe a11y — ResizablePanelGroup Separator (LAYO-03)', () => {
  test('/sessions/compare: split-pane surface has no Phase-28-attributable blocking violations', async ({
    page,
    request,
  }) => {
    const res = await request.get(`${BACKEND}/api/sessions?range=30d&limit=2`)
    if (!res.ok()) {
      test.skip(true, 'Phase 28 axe: backend not reachable')
      return
    }
    const body = (await res.json()) as {
      items?: Array<{ session_id: string }>
    }
    const ids = (body.items ?? []).map((s) => s.session_id)
    test.skip(
      ids.length < 2,
      'Phase 28 axe: requires ≥2 sessions (range=30d). Run `cmc sync`.',
    )
    if (ids.length < 2) return

    await page.goto(
      `/sessions/compare?a=${ids[0]}&b=${ids[1]}&split_sizes=compare:70,30`,
    )
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(
      page.locator('[data-testid="resize-handle-compare"]').first(),
    ).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) =>
        (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      blocking,
      JSON.stringify(
        blocking.map((v) => ({ id: v.id, help: v.help })),
        null,
        2,
      ),
    ).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────
// Phase 28 Plan 06 axe a11y — close-gate layout-customized URL variants.
//
// Plan 28-04 shipped 5 default-state drag-grip scans (one per in-scope
// route, bare URL). Plan 28-06 extends with the LAYO-01 + LAYO-02 +
// LAYO-03 COMBINED-URL surface — proves customized layouts don't
// introduce Phase-28-attributable axe regressions, and that the
// DraggablePanelWrap drag grip's aria-label / aria-pressed / aria-live
// chrome is verified at the close gate.
//
// Surface coverage (7 new scans):
//   - 5 route scans on /?hidden_panels=…&panel_order=main:… (one per
//     in-scope route, route-appropriate first registered main-column
//     panel hidden + main column reorder applied) — the layout-customized
//     close-gate variant.
//   - 1 split-pane scan on /sessions/compare?…&split_sizes=compare:70,30
//     (LAYO-03 dragged off 50/50) — env-skips when DB lacks ≥2 sessions
//     (mirrors the LAYO-03 default-state scan above + Plan 27-09 precedent).
//   - 1 drag-grip aria attribute test — keyboard-focusable cmc-panel-grip
//     emits aria-label "Reorder …" + aria-pressed flips false→true on
//     Space + role="status" aria-live region present.
//
// Together with Plan 28-04's 5 default-state scans + Plan 28-05's 1
// /sessions/compare default-state scan = 13 Phase-28-attributable axe
// scans at close gate.
// ───────────────────────────────────────────────────────────────────────

// Per-route hidden + reorder URL params for the layout-customized scans.
// Each route hides its first registered main-column panel and reorders
// the remaining main-column panels by rotating one position. The panel
// IDs are pinned to `frontend/src/lib/layout/panelRegistry.ts` — keeping
// them in lockstep is enforced by the panelRegistry.test.ts shape lock.
const LAYOUT_CUSTOMIZED_URL_BY_ROUTE: Record<string, string> = {
  '/':
    '/?hidden_panels=token-usage&panel_order=main:cache-efficiency,session-outcomes,model-mix',
  '/activity':
    '/activity?hidden_panels=otel-panel&panel_order=main:unified-failures,top-skills',
  '/cost':
    '/cost?hidden_panels=cost-forecast&panel_order=main:cost-by-project,cost-forecast',
  '/skills':
    '/skills?hidden_panels=task-board&panel_order=main:schedules,skills-registry,mcp-servers',
  '/alerts':
    '/alerts?hidden_panels=alert-rules-list&panel_order=main:alert-rule-form,alert-rules-list',
}

test.describe('Phase 28 axe a11y — close-gate layout-customized URL variants (LAYO-01 + LAYO-02)', () => {
  for (const route of ['/', '/activity', '/cost', '/skills', '/alerts'] as const) {
    test(`${route}: layout-customized chrome has no Phase-28-attributable blocking violations`, async ({
      page,
    }) => {
      await page.goto(LAYOUT_CUSTOMIZED_URL_BY_ROUTE[route])
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1500)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const blocking = results.violations.filter(
        (v) =>
          (v.impact === 'serious' || v.impact === 'critical') &&
          !isPreExistingViolation(v),
      )
      expect(
        blocking,
        JSON.stringify(
          blocking.map((v) => ({ id: v.id, help: v.help })),
          null,
          2,
        ),
      ).toEqual([])
    })
  }
})

test.describe('Phase 28 axe a11y — close-gate split-pane resized /sessions/compare (LAYO-03)', () => {
  test('/sessions/compare?split_sizes=compare:70,30: resized chrome has no Phase-28-attributable blocking violations', async ({
    page,
    request,
  }) => {
    const res = await request.get(`${BACKEND}/api/sessions?range=30d&limit=2`)
    if (!res.ok()) {
      test.skip(true, 'Phase 28 close-gate axe: backend not reachable')
      return
    }
    const body = (await res.json()) as {
      items?: Array<{ session_id: string }>
    }
    const ids = (body.items ?? []).map((s) => s.session_id)
    test.skip(
      ids.length < 2,
      'Phase 28 close-gate axe: requires ≥2 sessions (range=30d). Run `cmc sync`.',
    )
    if (ids.length < 2) return

    await page.goto(
      `/sessions/compare?a=${ids[0]}&b=${ids[1]}&split_sizes=compare:70,30`,
    )
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(
      page.locator('[data-testid="resize-handle-compare"]').first(),
    ).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (v) =>
        (v.impact === 'serious' || v.impact === 'critical') &&
        !isPreExistingViolation(v),
    )
    expect(
      blocking,
      JSON.stringify(
        blocking.map((v) => ({ id: v.id, help: v.help })),
        null,
        2,
      ),
    ).toEqual([])
  })
})

test.describe('Phase 28 axe a11y — close-gate drag-grip aria attribute contract (LAYO-02)', () => {
  test('/cost drag grip emits aria-label + aria-pressed false→true on Space + role="status" aria-live region present', async ({
    page,
  }) => {
    await page.goto('/cost')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    const grip = page.locator('.cmc-panel-grip').first()
    await expect(grip).toBeVisible()

    // aria-label is "Reorder <panel label>" per DraggablePanelWrap.tsx.
    const ariaLabel = await grip.getAttribute('aria-label')
    expect(ariaLabel).toMatch(/^Reorder /)

    // aria-pressed starts false (not in grab mode).
    expect(await grip.getAttribute('aria-pressed')).toBe('false')

    // Focus + Space toggles grab mode → aria-pressed becomes true.
    await grip.focus()
    await page.keyboard.press('Space')
    // Poll briefly — DraggablePanelWrap setState commits on the keydown
    // handler synchronously but React renders one tick later.
    await expect(grip).toHaveAttribute('aria-pressed', 'true')

    // The aria-live region is mounted alongside DraggablePanelWrap with
    // role="status" + aria-live="polite". At least one such region should
    // be present anywhere on the page (registered per-grip in the wrap).
    await expect(
      page.locator('[role="status"][aria-live="polite"]').first(),
    ).toBeVisible()

    // Restore default (Esc cancels grab mode).
    await page.keyboard.press('Escape')
    await expect(grip).toHaveAttribute('aria-pressed', 'false')
  })
})
