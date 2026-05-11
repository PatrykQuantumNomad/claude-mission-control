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

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const ROUTES = ['/', '/activity', '/skills', '/cost', '/alerts'] as const
const DENSITIES = ['compact', 'comfortable', 'cozy'] as const
const THEMES = ['dark', 'light'] as const

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
            (v) => v.impact === 'serious' || v.impact === 'critical',
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
