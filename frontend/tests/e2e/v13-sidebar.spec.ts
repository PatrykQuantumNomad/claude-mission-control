// SHEL-04 — Phase 24 Plan 05 sidebar e2e (Cmd+B + persistence + active
// highlight + collapsed-mode tooltip).
//
// Coverage:
//   1. Cmd+B toggles `<html data-sidebar-collapsed>` and shrinks
//      `.cmc-sidebar` from ~240px to ~52px.
//   2. Reload preserves the collapsed state (localStorage cmc.sidebar.collapsed).
//   3. Active route still shows the 3px accent-blue border-left when the
//      sidebar is collapsed.
//   4. Hovering a collapsed nav icon shows the Radix Tooltip with the
//      route label (side="right", Portal-mounted).
//
// Phase 25 Plan 11 extension (SHEL-06):
//   5. The "Pinned" section renders between OPERATE and CONFIGURE — IA
//      preserved (Phase 24 4-section pattern grows to 5 sections; original
//      4 remain locked).
//   6. Empty-state copy appears when nothing is pinned.
//   7. A pinned saved view shows up as `sidebar-pinned-view-{id}` after
//      reload (Plan 09 documents the same-tab localStorage limitation —
//      reload required to pick up a fresh pin).
//   8. Active-state lights up (data-active="true") when both pathname and
//      structural search match the pinned view's state_json.
//
// The sidebar's keyboard listener is attached at window level so Cmd+B
// works regardless of focus location — see Sidebar.tsx comments. We use
// ControlOrMeta in Playwright so the test runs identically on macOS and
// Linux CI workers.

import { test, expect } from '@playwright/test'

const BACKEND = 'http://127.0.0.1:8765'
const UUID_A = '11111111-1111-4111-8111-111111111111'

test.describe('SHEL-04 sidebar collapse + persistence', () => {
  test.afterEach(async ({ page }) => {
    // Reset to expanded so subsequent specs / re-runs start clean.
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('cmc.sidebar.collapsed')
      } catch {
        // ignore — context may be torn down
      }
    })
  })

  test('Cmd+B toggles sidebar collapsed state and persists across reload', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    // Clean slate.
    await page.evaluate(() =>
      window.localStorage.removeItem('cmc.sidebar.collapsed'),
    )
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    const sidebar = page.locator('.cmc-sidebar')
    await expect(sidebar).toBeVisible()
    const initialWidth = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    )
    expect(initialWidth).toBeGreaterThan(200) // expanded ~240px

    // Send the press to body to guarantee focus is in the page (URL bar
    // would otherwise swallow it in some harnesses).
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyB')
    await page.waitForFunction(
      () => document.documentElement.dataset.sidebarCollapsed === 'true',
    )
    // The sidebar `width` carries a 180ms ease-out transition. Wait for
    // the transition to complete before measuring — Playwright's
    // waitForFunction returns the instant the attribute flips, well
    // before the visual width reaches its 52px target.
    await page.waitForFunction(
      () => {
        const sb = document.querySelector('.cmc-sidebar') as HTMLElement | null
        return sb ? sb.getBoundingClientRect().width < 70 : false
      },
      undefined,
      { timeout: 2000 },
    )
    const collapsedWidth = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width,
    )
    expect(collapsedWidth).toBeLessThan(70)

    // Reload → persistence. The applySidebar() boot script reads
    // localStorage and sets [data-sidebar-collapsed=true] BEFORE first
    // paint, so the sidebar should render at 52px without transition —
    // but be defensive in case future plans add a hydration transition.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.waitForFunction(
      () => {
        const sb = document.querySelector('.cmc-sidebar') as HTMLElement | null
        return sb ? sb.getBoundingClientRect().width < 70 : false
      },
      undefined,
      { timeout: 2000 },
    )
    const persistedWidth = await page
      .locator('.cmc-sidebar')
      .evaluate((el) => el.getBoundingClientRect().width)
    expect(persistedWidth).toBeLessThan(70)
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem('cmc.sidebar.collapsed'),
      ),
    ).toBe('true')

    // Active route survives collapsed mode — the 3px accent-blue bar must
    // still render.
    await page.goto('/activity')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    const activeLink = page.locator('.cmc-sidebar__navlink--active')
    await expect(activeLink).toBeVisible()
    const borderLeft = await activeLink.evaluate(
      (el) => window.getComputedStyle(el).borderLeftWidth,
    )
    expect(parseInt(borderLeft, 10)).toBeGreaterThanOrEqual(3)
  })

  test('hover icon in collapsed mode shows tooltip with route label', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('cmc.sidebar.collapsed', 'true')
    })
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    const activityLink = page.getByTestId('sidebar-link-activity')
    await activityLink.hover()
    // Radix Tooltip mounts via Portal — locate by role.
    const tooltip = page.locator('[role="tooltip"]').first()
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toContainText('Activity')
  })
})

// ────────────────────────────────────────────────────────────────────────
// Phase 25 Plan 11 extension: Pinned section coverage (SHEL-06)
// ────────────────────────────────────────────────────────────────────────

async function wipeViewsAndPinned(page: import('@playwright/test').Page) {
  const r = await page.request.get(`${BACKEND}/api/views`)
  const data = (await r.json()) as { items: Array<{ id: number }> }
  for (const v of data.items) {
    await page.request.delete(`${BACKEND}/api/views/${v.id}`)
  }
  // One-shot localStorage wipe: navigate to / so we have a real origin,
  // then strip the savedView.* keys. Subsequent same-origin navs
  // preserve the cleaned state.
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

test.describe('SHEL-06 Pinned section IA + rendering', () => {
  test.beforeEach(async ({ page }) => {
    await wipeViewsAndPinned(page)
  })

  test('Pinned section header renders between Operate and Configure', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    // SidebarSection passes testId="sidebar-section-pinned" on the wrapper.
    const pinnedSection = page.getByTestId('sidebar-section-pinned')
    await expect(pinnedSection).toBeVisible()

    // IA preservation: header position is between Operate and Configure
    // sections. Section headers render as `.cmc-sidebar__section-header`
    // (a <div>, not <h2>) per Phase 24 plan-04 layout. Assert ordering
    // via insertion order of header text.
    const sections = await page
      .locator('.cmc-sidebar .cmc-sidebar__section-header')
      .allTextContents()
    // Phase 24 baseline sections: Observe, Operate, Configure. Plan 09
    // inserts Pinned between Operate and Configure (Sidebar.tsx layout).
    expect(sections).toContain('Pinned')
    const pinnedIdx = sections.indexOf('Pinned')
    const operateIdx = sections.indexOf('Operate')
    const configureIdx = sections.indexOf('Configure')
    expect(operateIdx).toBeLessThan(pinnedIdx)
    expect(pinnedIdx).toBeLessThan(configureIdx)
  })

  test('Pinned section empty-state renders when nothing is pinned', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await expect(page.getByTestId('sidebar-pinned-empty')).toBeVisible()
    await expect(page.getByTestId('sidebar-pinned-empty')).toContainText(
      /pin a saved view/i,
    )
  })

  test('A pinned view appears in the sidebar and active-state matches both pathname and search', async ({
    page,
  }) => {
    // Seed: create a view + pin it via direct localStorage (so this spec is
    // independent of the SavedViewMenu DOM path — covered separately by
    // v13-saved-views.spec.ts).
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Compare A pinned',
        description: '',
        route: '/sessions/compare',
        state_json: { a: UUID_A },
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
    await page.waitForTimeout(500)

    const pinned = page.getByTestId(`sidebar-pinned-view-${view.id}`)
    await expect(pinned).toBeVisible()

    // From /, the pinned view is NOT active (pathname mismatch).
    expect(await pinned.getAttribute('data-active')).toBe('false')

    // Navigate to the matching pathname + structural search → active true.
    await page.goto(`/sessions/compare?a=${UUID_A}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    const pinnedAfter = page.getByTestId(`sidebar-pinned-view-${view.id}`)
    expect(await pinnedAfter.getAttribute('data-active')).toBe('true')
    await expect(pinnedAfter).toHaveClass(/cmc-sidebar__navlink--active/)
  })
})

// ────────────────────────────────────────────────────────────────────────
// Phase 26 Plan 09 extension: Sidebar Recently Visited section (SHEL-05)
// ────────────────────────────────────────────────────────────────────────

test.describe('SHEL-05 Recently Visited section', () => {
  test.beforeEach(async ({ page }) => {
    // Wipe relevant localStorage so each test sees a clean rings state.
    await page.goto('/')
    await page.evaluate(() => {
      try {
        const keys: string[] = []
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i)
          if (k && k.startsWith('cmc.recents.')) keys.push(k)
        }
        keys.forEach((k) => window.localStorage.removeItem(k))
      } catch {
        // ignore
      }
    })
  })

  test('Recently Visited header renders even with empty localStorage', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await expect(
      page.getByTestId('sidebar-section-recently-visited'),
    ).toBeVisible()
  })

  test('Seeded recents render as sidebar links; current pathname is filtered out', async ({
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
    // Navigate to /cost → its row is current pathname, so should be filtered.
    await page.goto('/cost')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    const section = page.getByTestId('sidebar-section-recently-visited')
    await expect(section).toBeVisible()
    await expect(section.getByTestId('sidebar-link-activity')).toBeVisible()
    await expect(section.getByTestId('sidebar-link-skills')).toBeVisible()
    // /cost is the current pathname → filtered out of Recently Visited
    // (RecentlyVisitedSection's current-pathname filter).
    await expect(section.getByTestId('sidebar-link-cost')).toHaveCount(0)
  })

  test('Recently Visited entries survive sidebar collapsed mode (Cmd+B)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('cmc.sidebar.collapsed', 'true')
      const now = Date.now()
      window.localStorage.setItem(
        'cmc.recents.routes',
        JSON.stringify([
          { route: '/activity', visitedAt: now - 1000 },
          { route: '/skills', visitedAt: now - 2000 },
        ]),
      )
    })
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    const section = page.getByTestId('sidebar-section-recently-visited')
    await expect(section).toBeVisible()
    // Seeded links should still render as icons in collapsed mode.
    await expect(section.getByTestId('sidebar-link-activity')).toBeVisible()
  })
})
