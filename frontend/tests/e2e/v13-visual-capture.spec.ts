// POLI-09 — Phase 24 Plan 05 visual capture matrix.
//
// Sweeps 6 routes × 3 densities × 2 themes = 36 PNGs into the phase
// visual-check directory. Operator reviews the matrix at phase close
// (plan 07) to verify density tiers + theme variants render cleanly.
//
// Naming: `{slug}__{density}__{theme}.png` (double-underscore separator)
// keeps the lexicographic order grouped by route → density → theme so
// reviewers can scan a route's nine variants (3 densities × 2 themes
// minus 6 = wait, that's 6 per route — `compact|comfortable|cozy` ×
// `dark|light`) contiguously.
//
// `/sessions/compare` is captured even without seeded session IDs — the
// empty-state structure is part of what the visual matrix verifies.
// Full demo-data rendering for that route lands in Phase 26.
//
// The phase visual-check directory is excluded from git via .gitignore
// (`.planning/phases/*/visual-check/*.png`); operators can `git add -f`
// individual PNGs to commit visual evidence to history.
//
// Phase 25 Plan 11 extension: 5 NEW chrome surfaces × 3 densities × 2 themes
// = 30 NEW PNGs into the Phase 25 visual-check directory:
//   1. saved-view-menu-open — SavedViewMenu DropdownMenu OPEN on /cost
//   2. save-view-dialog-open — SaveViewDialog OPEN on /cost
//   3. edit-or-fork-dialog-open — EditOrForkDialog OPEN on /sessions/compare
//   4. unsaved-pip-visible — UnsavedPip showing on a divergent URL
//   5. sidebar-pinned-populated — sidebar Pinned section with 2 rows
// Output dir: `.planning/phases/25-saved-views-backend-frontend/visual-check/`
// (separate from Phase 24's visual-check/ — each phase keeps its own
// matrix for diff-friendly operator review). The Phase 25 dir is created
// at runtime in test.beforeAll below.

import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// Playwright runs specs as ESM in this project (package.json "type": "module"),
// so __dirname is undefined. Derive it from import.meta.url instead.
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROUTES = [
  { path: '/', slug: 'home' },
  { path: '/activity', slug: 'activity' },
  { path: '/skills', slug: 'skills' },
  { path: '/cost', slug: 'cost' },
  { path: '/alerts', slug: 'alerts' },
  { path: '/sessions/compare', slug: 'sessions-compare' },
] as const
const DENSITIES = ['compact', 'comfortable', 'cozy'] as const
const THEMES = ['dark', 'light'] as const

const PHASE_DIR = path.resolve(
  __dirname,
  '../../../.planning/phases/24-shell-density-containment-primitives/visual-check',
)

test.beforeAll(() => {
  fs.mkdirSync(PHASE_DIR, { recursive: true })
})

test.describe('POLI-09 visual capture matrix — Phase 24', () => {
  for (const route of ROUTES) {
    for (const density of DENSITIES) {
      for (const theme of THEMES) {
        test(`capture ${route.slug} d=${density} t=${theme}`, async ({
          page,
        }) => {
          await page.addInitScript(
            ([d, t]) => {
              window.localStorage.setItem('cmc.density', d as string)
              window.localStorage.setItem('cmc.theme', t as string)
            },
            [density, theme],
          )
          await page.goto(route.path)
          await page.waitForLoadState('domcontentloaded')
          // /activity and /skills carry persistent OTEL firehose / chart
          // streams that never reach `networkidle` within the 30s test
          // timeout. Use a fixed settle delay instead — the DOM is fully
          // hydrated after DCL + 1.5s; charts are mounted and the layout
          // is stable. Locked invariant: visual-capture screenshots do not
          // assert on streaming-data content (we cannot guarantee fixture
          // determinism across runs); they assert on layout + theme +
          // density rendering only.
          await page.waitForTimeout(1500)
          await page.screenshot({
            path: path.join(
              PHASE_DIR,
              `${route.slug}__${density}__${theme}.png`,
            ),
            fullPage: true,
          })
        })
      }
    }
  }
})

// ────────────────────────────────────────────────────────────────────────
// Phase 25 Plan 11 extension: 5 NEW chrome surfaces × 3 densities × 2 themes
// ────────────────────────────────────────────────────────────────────────

const PHASE_25_DIR = path.resolve(
  __dirname,
  '../../../.planning/phases/25-saved-views-backend-frontend/visual-check',
)
const BACKEND = 'http://127.0.0.1:8765'
const UUID_A_VIS = '11111111-1111-4111-8111-111111111111'

async function wipeViewsAndLocalForCapture(
  page: import('@playwright/test').Page,
) {
  const r = await page.request.get(`${BACKEND}/api/views`)
  const data = (await r.json()) as { items: Array<{ id: number }> }
  for (const v of data.items) {
    await page.request.delete(`${BACKEND}/api/views/${v.id}`)
  }
}

test.beforeAll(() => {
  fs.mkdirSync(PHASE_25_DIR, { recursive: true })
})

test.describe('Phase 25 Plan 11 — saved-views chrome visual capture', () => {
  for (const density of DENSITIES) {
    for (const theme of THEMES) {
      // Surface 1: SavedViewMenu open with at least one row.
      test(`saved-view-menu-open d=${density} t=${theme}`, async ({
        page,
      }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await wipeViewsAndLocalForCapture(page)
        await page.request.post(`${BACKEND}/api/views`, {
          data: {
            name: 'My cost view',
            description: '',
            route: '/cost',
            state_json: {},
            schema_version: 1,
          },
        })
        await page.goto('/cost')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.getByTestId('saved-view-menu-trigger').click()
        await expect(page.getByTestId('saved-view-menu-content')).toBeVisible()
        await page.screenshot({
          path: path.join(
            PHASE_25_DIR,
            `saved-view-menu-open__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 2: SaveViewDialog open.
      test(`save-view-dialog-open d=${density} t=${theme}`, async ({
        page,
      }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await wipeViewsAndLocalForCapture(page)
        await page.goto('/cost')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.getByTestId('saved-view-menu-trigger').click()
        await page.getByTestId('saved-view-menu-save-new').click()
        await expect(page.getByTestId('save-view-dialog')).toBeVisible()
        await page.screenshot({
          path: path.join(
            PHASE_25_DIR,
            `save-view-dialog-open__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 3: EditOrForkDialog open.
      test(`edit-or-fork-dialog-open d=${density} t=${theme}`, async ({
        page,
      }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await wipeViewsAndLocalForCapture(page)
        const created = await page.request.post(`${BACKEND}/api/views`, {
          data: {
            name: 'Edit-target capture',
            description: '',
            route: '/sessions/compare',
            state_json: { a: UUID_A_VIS },
            schema_version: 1,
          },
        })
        const view = await created.json()
        await page.goto(`/sessions/compare?a=${UUID_A_VIS}`)
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.getByTestId('saved-view-menu-trigger').click()
        await page.getByTestId(`saved-view-item-${view.id}`).hover()
        await page.getByTestId(`saved-view-open-${view.id}`).click()
        await page.evaluate(() => {
          const url = new URL(window.location.href)
          url.search = '?a=22222222-2222-4222-8222-222222222222'
          window.history.pushState({}, '', url.toString())
          window.dispatchEvent(new PopStateEvent('popstate'))
        })
        await page.waitForTimeout(400)
        await page.getByTestId('saved-view-menu-trigger').click()
        await page.getByTestId('saved-view-menu-edit-current').click()
        await expect(page.getByTestId('edit-or-fork-dialog')).toBeVisible()
        await page.screenshot({
          path: path.join(
            PHASE_25_DIR,
            `edit-or-fork-dialog-open__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 4: UnsavedPip visible (URL diverges from loaded view).
      test(`unsaved-pip-visible d=${density} t=${theme}`, async ({ page }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await wipeViewsAndLocalForCapture(page)
        const created = await page.request.post(`${BACKEND}/api/views`, {
          data: {
            name: 'Pip target',
            description: '',
            route: '/sessions/compare',
            state_json: { a: UUID_A_VIS },
            schema_version: 1,
          },
        })
        const view = await created.json()
        await page.goto(`/sessions/compare?a=${UUID_A_VIS}`)
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.getByTestId('saved-view-menu-trigger').click()
        await page.getByTestId(`saved-view-item-${view.id}`).hover()
        await page.getByTestId(`saved-view-open-${view.id}`).click()
        await page.evaluate(() => {
          const url = new URL(window.location.href)
          url.search = '?a=22222222-2222-4222-8222-222222222222'
          window.history.pushState({}, '', url.toString())
          window.dispatchEvent(new PopStateEvent('popstate'))
        })
        await page.waitForTimeout(400)
        await expect(page.getByTestId('unsaved-pip')).toBeVisible()
        await page.screenshot({
          path: path.join(
            PHASE_25_DIR,
            `unsaved-pip-visible__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 5: Sidebar Pinned section populated with 2 rows.
      test(`sidebar-pinned-populated d=${density} t=${theme}`, async ({
        page,
      }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await wipeViewsAndLocalForCapture(page)
        const a = await page.request.post(`${BACKEND}/api/views`, {
          data: {
            name: 'Pinned cost',
            description: '',
            route: '/cost',
            state_json: {},
            schema_version: 1,
          },
        })
        const b = await page.request.post(`${BACKEND}/api/views`, {
          data: {
            name: 'Pinned alerts',
            description: '',
            route: '/alerts',
            state_json: {},
            schema_version: 1,
          },
        })
        const av = await a.json()
        const bv = await b.json()
        await page.goto('/cost')
        await page.evaluate(
          ([ida, idb]) => {
            window.localStorage.setItem(
              'cmc.savedView.pinned',
              JSON.stringify([ida, idb]),
            )
          },
          [av.id as number, bv.id as number],
        )
        await page.reload()
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await expect(
          page.getByTestId(`sidebar-pinned-view-${av.id}`),
        ).toBeVisible()
        await page.screenshot({
          path: path.join(
            PHASE_25_DIR,
            `sidebar-pinned-populated__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })
    }
  }
})

// ────────────────────────────────────────────────────────────────────────
// Phase 26 Plan 09 extension: 5 NEW chrome surfaces × 3 densities × 2 themes
// = 30 NEW PNGs into the Phase 26 visual-check directory.
//   1. time-picker-open — TimePicker popover with PresetList + Calendar
//   2. refresh-dropdown-open — RefreshDropdown menu with 4 intervals
//   3. compare-toggle-active — TokenUsageCard with the prior-period overlay
//      active (aria-pressed="true" via ?compare_panels=token-usage)
//   4. cmdk-with-recents — Cmd+K palette with seeded Recents + Time range
//      + Density groups visible
//   5. sidebar-with-recently-visited — Sidebar Recently Visited section
//      with 3 seeded rows
// Output dir: `.planning/phases/26-per-route-adoption-i-command-activity-sessions-time-cmd-k/visual-check/`
// ────────────────────────────────────────────────────────────────────────

const PHASE_26_DIR = path.resolve(
  __dirname,
  '../../../.planning/phases/26-per-route-adoption-i-command-activity-sessions-time-cmd-k/visual-check',
)

test.beforeAll(() => {
  fs.mkdirSync(PHASE_26_DIR, { recursive: true })
})

async function wipeAllForCapture26(
  page: import('@playwright/test').Page,
) {
  // Wipe both server views and the Phase 26 localStorage keys we touch.
  const r = await page.request.get(`${BACKEND}/api/views`)
  const data = (await r.json()) as { items: Array<{ id: number }> }
  for (const v of data.items) {
    await page.request.delete(`${BACKEND}/api/views/${v.id}`)
  }
}

test.describe('Phase 26 Plan 09 — Phase 26 chrome visual capture', () => {
  for (const density of DENSITIES) {
    for (const theme of THEMES) {
      // Surface 1: TimePicker popover open.
      test(`time-picker-open d=${density} t=${theme}`, async ({ page }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await wipeAllForCapture26(page)
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.getByTestId('time-picker-trigger').click()
        await expect(page.getByTestId('time-picker-popover')).toBeVisible()
        await page.screenshot({
          path: path.join(
            PHASE_26_DIR,
            `time-picker-open__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 2: RefreshDropdown menu open.
      test(`refresh-dropdown-open d=${density} t=${theme}`, async ({
        page,
      }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await wipeAllForCapture26(page)
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.getByTestId('refresh-dropdown-trigger').click()
        await expect(page.getByTestId('refresh-option-30s')).toBeVisible()
        await page.screenshot({
          path: path.join(
            PHASE_26_DIR,
            `refresh-dropdown-open__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 3: CompareToggle active on TokenUsageCard.
      test(`compare-toggle-active d=${density} t=${theme}`, async ({
        page,
      }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await wipeAllForCapture26(page)
        await page.goto('/?compare_panels=token-usage&range=7d')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await expect(
          page.getByTestId('compare-overlay-toggle-token-usage'),
        ).toBeVisible()
        await page.screenshot({
          path: path.join(
            PHASE_26_DIR,
            `compare-toggle-active__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 4: Cmd+K palette open with seeded Recents.
      test(`cmdk-with-recents d=${density} t=${theme}`, async ({ page }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
            const now = Date.now()
            window.localStorage.setItem(
              'cmc.recents.routes',
              JSON.stringify([
                { route: '/activity', visitedAt: now - 1000 },
                { route: '/skills', visitedAt: now - 2000 },
                { route: '/cost', visitedAt: now - 3000 },
                { route: '/alerts', visitedAt: now - 4000 },
              ]),
            )
          },
          [density, theme],
        )
        await wipeAllForCapture26(page)
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.locator('body').click()
        await page.keyboard.press('ControlOrMeta+KeyK')
        await expect(
          page.getByRole('dialog', { name: 'Mission Control command palette' }),
        ).toBeVisible()
        // Wait for entrance animation to settle.
        await page.waitForTimeout(400)
        await page.screenshot({
          path: path.join(
            PHASE_26_DIR,
            `cmdk-with-recents__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 5: Sidebar with Recently Visited section populated.
      test(`sidebar-with-recently-visited d=${density} t=${theme}`, async ({
        page,
      }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
            const now = Date.now()
            window.localStorage.setItem(
              'cmc.recents.routes',
              JSON.stringify([
                { route: '/activity', visitedAt: now - 1000 },
                { route: '/skills', visitedAt: now - 2000 },
                { route: '/cost', visitedAt: now - 3000 },
              ]),
            )
          },
          [density, theme],
        )
        await wipeAllForCapture26(page)
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await expect(
          page.getByTestId('sidebar-section-recently-visited'),
        ).toBeVisible()
        await page.screenshot({
          path: path.join(
            PHASE_26_DIR,
            `sidebar-with-recently-visited__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })
    }
  }
})

// ────────────────────────────────────────────────────────────────────────
// Phase 27 Plan 09 extension: 4 NEW tail-end-route surfaces × 3 densities
// × 2 themes = 24 NEW PNGs into the Phase 27 visual-check directory.
//   1. skills-index-bounded — /skills with cmc-page--bounded + adopted
//      panels bounded
//   2. skills-detail-bounded — /skills/$name (longest skill name available)
//      with 4-panel bounded set + TruncatedCell on header
//   3. cost-bounded — /cost with both panels bounded + project column
//      truncation visible
//   4. alerts-bounded — /alerts with all 3 panels bounded + AlertRuleForm
//      cmc-card--bounded modifier
// Output dir: `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/visual-check/`
// ────────────────────────────────────────────────────────────────────────

const PHASE_27_DIR = path.resolve(
  __dirname,
  '../../../.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/visual-check',
)

test.beforeAll(() => {
  fs.mkdirSync(PHASE_27_DIR, { recursive: true })
})

test.describe('Phase 27 Plan 09 — tail-route bounded chrome visual capture', () => {
  for (const density of DENSITIES) {
    for (const theme of THEMES) {
      // Surface 1: /skills bounded chrome.
      test(`skills-index-bounded d=${density} t=${theme}`, async ({ page }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await page.goto('/skills')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.screenshot({
          path: path.join(
            PHASE_27_DIR,
            `skills-index-bounded__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 2: /skills/$name bounded chrome (longest available name).
      test(`skills-detail-bounded d=${density} t=${theme}`, async ({
        page,
      }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        // Pick the longest available skill name; fall back to /skills if
        // the dev DB has zero skills (the empty registry state).
        const sRes = await page.request.get(`${BACKEND}/api/skills`)
        const sBody = await sRes.json()
        const items = (sBody.items ?? []) as Array<{ name: string }>
        if (items.length === 0) {
          await page.goto('/skills')
        } else {
          items.sort((a, b) => b.name.length - a.name.length)
          await page.goto(`/skills/${encodeURIComponent(items[0].name)}`)
        }
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.screenshot({
          path: path.join(
            PHASE_27_DIR,
            `skills-detail-bounded__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 3: /cost bounded chrome.
      test(`cost-bounded d=${density} t=${theme}`, async ({ page }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await page.goto('/cost')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.screenshot({
          path: path.join(
            PHASE_27_DIR,
            `cost-bounded__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 4: /alerts bounded chrome.
      test(`alerts-bounded d=${density} t=${theme}`, async ({ page }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await page.goto('/alerts')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.screenshot({
          path: path.join(
            PHASE_27_DIR,
            `alerts-bounded__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })
    }
  }
})

// ────────────────────────────────────────────────────────────────────────
// Phase 28 Plan 06 extension: 3 NEW layout-customization surfaces × 3
// densities × 2 themes = 18 NEW PNGs (Pitfall 10 cap — Phase 27 close
// shipped 120 cumulative PNGs; adding more than 18 would breach the
// 138-total close-gate budget for v1.3 milestone).
//
// Surfaces (3):
//   1. layout-default — `/` bare URL (no layout overrides) — establishes
//      the LAYO-01..02 zero-customization baseline so the operator can
//      diff it against the customized variant below.
//   2. layout-customized — `/?hidden_panels=token-usage&panel_order=main:
//      cache-efficiency,session-outcomes,model-mix,active-sessions,recent-
//      sessions,session-finalization,dispatcher-pressure,system-pressure,
//      latency-overhead,tool-success,token-spend,daily-throughput,latency-
//      percentiles,active-skills` — LAYO-01 hide writes URL + LAYO-02
//      reorder writes URL in concert; visually proves both customizations
//      compose on the same render.
//   3. compare-resized — `/sessions/compare?a=<a>&b=<b>&split_sizes=
//      compare:70,30` — LAYO-03 split-pane dragged off 50/50; requires
//      ≥2 sessions in the dev DB. Env-skips otherwise (mirror Plan 27-09
//      env-skip precedent).
// Output dir: `.planning/phases/28-layout-customization/visual-check/`
// ────────────────────────────────────────────────────────────────────────

const PHASE_28_DIR = path.resolve(
  __dirname,
  '../../../.planning/phases/28-layout-customization/visual-check',
)

test.beforeAll(() => {
  fs.mkdirSync(PHASE_28_DIR, { recursive: true })
})

// Hidden + reordered URL parameters for the layout-customized surface.
// `hidden_panels` hides token-usage on /; `panel_order` reorders main
// column to bring cache-efficiency + session-outcomes to the front. Both
// params are read by useLayoutState.isHidden + .orderedPanels(MAIN_COLUMN).
const LAYOUT_CUSTOMIZED_URL =
  '/?hidden_panels=token-usage&panel_order=main:cache-efficiency,session-outcomes,model-mix,active-sessions,recent-sessions,session-finalization,dispatcher-pressure,system-pressure,latency-overhead,tool-success,token-spend,daily-throughput,latency-percentiles,active-skills'

test.describe('Phase 28 Plan 06 — layout customization visual capture', () => {
  for (const density of DENSITIES) {
    for (const theme of THEMES) {
      // Surface 1: layout-default — / bare URL (no layout overrides).
      test(`layout-default d=${density} t=${theme}`, async ({ page }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.screenshot({
          path: path.join(
            PHASE_28_DIR,
            `layout-default__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 2: layout-customized — hidden_panels + panel_order on /
      // (LAYO-01 + LAYO-02 composed in concert).
      test(`layout-customized d=${density} t=${theme}`, async ({ page }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        await page.goto(LAYOUT_CUSTOMIZED_URL)
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.screenshot({
          path: path.join(
            PHASE_28_DIR,
            `layout-customized__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })

      // Surface 3: compare-resized — /sessions/compare with split_sizes=
      // compare:70,30 (LAYO-03 dragged off 50/50). Env-skips when the dev
      // DB lacks ≥2 sessions (mirror v13-a11y.spec.ts Phase 28 LAYO-03
      // scan precedent + Plan 27-09 env-skip pattern).
      test(`compare-resized d=${density} t=${theme}`, async ({
        page,
        request,
      }) => {
        await page.addInitScript(
          ([d, t]) => {
            window.localStorage.setItem('cmc.density', d as string)
            window.localStorage.setItem('cmc.theme', t as string)
          },
          [density, theme],
        )
        const res = await request.get(
          `${BACKEND}/api/sessions?range=30d&limit=2`,
        )
        if (!res.ok()) {
          test.skip(true, 'Phase 28 visual: backend not reachable')
          return
        }
        const body = (await res.json()) as {
          items?: Array<{ session_id: string }>
        }
        const ids = (body.items ?? []).map((s) => s.session_id)
        test.skip(
          ids.length < 2,
          'Phase 28 visual: compare-resized requires ≥2 sessions (range=30d). Run `cmc sync`.',
        )
        if (ids.length < 2) return
        await page.goto(
          `/sessions/compare?a=${ids[0]}&b=${ids[1]}&split_sizes=compare:70,30`,
        )
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1500)
        await page.screenshot({
          path: path.join(
            PHASE_28_DIR,
            `compare-resized__${density}__${theme}.png`,
          ),
          fullPage: true,
        })
      })
    }
  }
})
