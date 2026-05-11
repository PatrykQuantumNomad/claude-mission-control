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

import { test } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

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
          await page.waitForLoadState('networkidle')
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
