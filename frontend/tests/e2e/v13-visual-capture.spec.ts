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
