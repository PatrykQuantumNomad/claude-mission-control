---
phase: 24-shell-density-containment-primitives
plan: 05
type: execute
wave: 4
depends_on: [04]
files_modified:
  - frontend/tests/e2e/v13-visual-capture.spec.ts
  - frontend/tests/e2e/v13-a11y.spec.ts
  - frontend/tests/e2e/v13-portal-containment.spec.ts
  - frontend/tests/e2e/v13-sidebar.spec.ts
  - frontend/tests/e2e/v13-density.spec.ts
  - frontend/tests/e2e/v13-truncation.spec.ts
  - frontend/tests/e2e/v13-copy-cell.spec.ts
  - frontend/lighthouserc.json
  - .gitignore
  - backend/tests/test_url_contract.py
  - .planning/phases/24-shell-density-containment-primitives/visual-check/.gitkeep
autonomous: true

must_haves:
  truths:
    - "Playwright auto-capture matrix produces N PNGs covering 6 routes x 3 densities x 2 themes (36 total) into the phase visual-check directory"
    - "Axe-core fixture iterates 5 routes x 3 densities x 2 themes (30 runs) and fails the run if any serious or critical violation appears"
    - "Portal-containment probe opens every overlay (Sheet, DropdownMenu, Tooltip) on each route and asserts no transform-bearing ancestor traps the Portal child"
    - "Sidebar Cmd+B + collapse-state persistence verified end-to-end via Playwright"
    - "Density toggle persistence across reload verified end-to-end via Playwright"
    - "TruncatedCell tooltip + CopyIconButton clipboard write verified end-to-end against a real long-string cell on a route already exposing such cells"
    - "Lighthouse CI config exists at frontend/lighthouserc.json targeting / + /activity + /skills (research-corrected target list to avoid the demo-data seeding pitfall on /sessions/compare); thresholds LCP<2.5s, CLS<0.1, INP<200ms"
    - "URL contract pytest gate enumerates every preserved route and fails if a documented pattern is missing from the route tree"
  artifacts:
    - path: "frontend/tests/e2e/v13-visual-capture.spec.ts"
      provides: "POLI-09 — auto-capture matrix"
      contains: "DENSITIES"
    - path: "frontend/tests/e2e/v13-a11y.spec.ts"
      provides: "POLI-10 — axe-core gate, serious+critical block"
      contains: "AxeBuilder"
    - path: "frontend/tests/e2e/v13-portal-containment.spec.ts"
      provides: "CONT-02 runtime probe"
      contains: "transform"
    - path: "frontend/tests/e2e/v13-sidebar.spec.ts"
      provides: "SHEL-04 e2e (Cmd+B + persistence)"
      contains: "cmc.sidebar.collapsed"
    - path: "frontend/tests/e2e/v13-density.spec.ts"
      provides: "DENS-03 e2e (persistence + cascade to Portal content)"
      contains: "cmc.density"
    - path: "frontend/tests/e2e/v13-truncation.spec.ts"
      provides: "CONT-03 truncation+tooltip e2e"
      contains: "scrollWidth"
    - path: "frontend/tests/e2e/v13-copy-cell.spec.ts"
      provides: "CONT-03 copy-icon affordance e2e (clipboard write + stopPropagation)"
      contains: "clipboard"
    - path: "frontend/lighthouserc.json"
      provides: "Lighthouse CI config (POLI-11 perf budget extension)"
      contains: "largest-contentful-paint"
    - path: "backend/tests/test_url_contract.py"
      provides: "POLI-13 URL contract gate (pytest)"
      contains: "url-contract.md"
  key_links:
    - from: "frontend/tests/e2e/v13-portal-containment.spec.ts"
      to: "Sidebar+Sheet+DropdownMenu+Tooltip Radix Portals"
      via: "page.evaluate walks document.body for transform ancestors"
      pattern: "computedStyle.*transform"
    - from: "frontend/tests/e2e/v13-density.spec.ts"
      to: "frontend/src/lib/density.ts (cmc.density localStorage key)"
      via: "page.evaluate writes localStorage; reload; assert dataset.density + computed --cmc-padding-card"
      pattern: "cmc.density"
    - from: "frontend/lighthouserc.json"
      to: "vite preview server on 127.0.0.1:4173"
      via: "startServerCommand"
      pattern: "pnpm preview"
---

<objective>
Ship the entire e2e + a11y + perf + URL-contract test surface that gates every Phase 24+ phase close. After this plan, plan 06 (POLI docs + ESLint) and plan 07 (phase close gate) run against a stable test scaffold.

This plan delivers POLI-09 (visual auto-capture), POLI-10 (axe-core gate), POLI-11 (Lighthouse CI extension to the binary perf gates already established by plan 02's design), POLI-13 (URL contract pytest), plus 4 supporting e2e specs that exercise the primitives shipped in plans 02-04 (sidebar, density, truncation, copy-cell, portal-containment).

Lighthouse target list is **research-corrected**: instead of `/`, `/activity`, `/sessions/compare` (which would require demo session seeding per Pitfall 5 in research), Phase 24 targets `/`, `/activity`, `/skills`. `/skills` has charts and doesn't require search params. Documented in `frontend/lighthouserc.json` comment AND in plan 06's url-contract.md.

Output:
- 7 new Playwright spec files (v13-*.spec.ts) in `frontend/tests/e2e/`.
- `frontend/lighthouserc.json` config (filesystem upload, 3 routes, CWV thresholds).
- `.gitignore` updated to exclude `.lighthouseci/` and the phase visual-check PNG directory (or commit PNGs — operator can later toggle).
- `.planning/phases/24-shell-density-containment-primitives/visual-check/.gitkeep` so the dir exists for plan 07's auto-capture run.
- `backend/tests/test_url_contract.py` (Python pytest gate; reads `docs/url-contract.md` written in plan 06 — this plan creates only the test, plan 06 ships the docs the test consumes; both must exist for `pytest` to pass at phase close).

The visual capture, axe matrix, and Lighthouse CI runs are EXECUTED in plan 07 (phase close). This plan only ships the spec files, fixtures, and config. Running them now (during this plan) is encouraged for sanity but not required for plan 05 to be considered done.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-shell-density-containment-primitives/24-CONTEXT.md
@.planning/phases/24-shell-density-containment-primitives/24-RESEARCH.md
@.planning/phases/24-shell-density-containment-primitives/24-04-SUMMARY.md

@frontend/playwright.config.ts
@frontend/tests/e2e/theme-toggle.spec.ts
@frontend/tests/e2e/command-palette.spec.ts
@frontend/tests/e2e/sessions-compare.spec.ts
@frontend/package.json

<interfaces>
Existing Playwright config (frontend/playwright.config.ts) already wires:
- Test dir: `frontend/tests/e2e`
- Web server: `pnpm dev` (or preview) on a configured port
- Default browser: Chromium

@axe-core/playwright (installed in plan 01) usage:
```ts
import AxeBuilder from '@axe-core/playwright'
const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()
```

@lhci/cli (installed in plan 01) command:
```bash
cd frontend && npx lhci autorun --config=./lighthouserc.json
```

Existing route paths (from frontend/src/routes — verified):
- `/` — Mission Control / Home (file index.tsx)
- `/activity`
- `/skills`
- `/skills/$name` (dynamic)
- `/cost`
- `/alerts`
- `/sessions/compare?a=...&b=...` (requires search params)

Locked routes for Lighthouse CI (per research Pitfall 5 + Open Question 4): `/`, `/activity`, `/skills`. NOT `/sessions/compare` until demo data seeding lands.

LocalStorage keys consumed by e2e specs:
- `cmc.theme` — 'dark' | 'light' (existing)
- `cmc.density` — 'compact' | 'comfortable' | 'cozy' (plan 01)
- `cmc.sidebar.collapsed` — 'true' | 'false' (plan 04)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Visual capture + axe-core + portal-containment Playwright specs</name>
  <files>frontend/tests/e2e/v13-visual-capture.spec.ts, frontend/tests/e2e/v13-a11y.spec.ts, frontend/tests/e2e/v13-portal-containment.spec.ts, .planning/phases/24-shell-density-containment-primitives/visual-check/.gitkeep, .gitignore</files>
  <action>
1. **Create `frontend/tests/e2e/v13-visual-capture.spec.ts`** (POLI-09):
   ```ts
   import { test } from '@playwright/test'
   import path from 'node:path'
   import fs from 'node:fs'

   const ROUTES = [
     { path: '/',               slug: 'home' },
     { path: '/activity',       slug: 'activity' },
     { path: '/skills',         slug: 'skills' },
     { path: '/cost',           slug: 'cost' },
     { path: '/alerts',         slug: 'alerts' },
     { path: '/sessions/compare', slug: 'sessions-compare' },
   ] as const
   const DENSITIES = ['compact', 'comfortable', 'cozy'] as const
   const THEMES = ['dark', 'light'] as const
   const PHASE_DIR = path.resolve(
     __dirname,
     '../../../.planning/phases/24-shell-density-containment-primitives/visual-check'
   )

   test.beforeAll(() => { fs.mkdirSync(PHASE_DIR, { recursive: true }) })

   test.describe('POLI-09 visual capture matrix — Phase 24', () => {
     for (const route of ROUTES) {
       for (const density of DENSITIES) {
         for (const theme of THEMES) {
           test(`capture ${route.slug} d=${density} t=${theme}`, async ({ page }) => {
             await page.addInitScript(([d, t]) => {
               window.localStorage.setItem('cmc.density', d as string)
               window.localStorage.setItem('cmc.theme', t as string)
             }, [density, theme])
             await page.goto(route.path)
             await page.waitForLoadState('networkidle')
             await page.screenshot({
               path: path.join(PHASE_DIR, `${route.slug}__${density}__${theme}.png`),
               fullPage: true,
             })
           })
         }
       }
     }
   })
   ```
   Total combinations: 6 routes × 3 densities × 2 themes = **36 PNGs**. Naming: `{slug}__{density}__{theme}.png` (double-underscore separator). The `/sessions/compare` capture WILL render an empty/error state without seeded demo data — that's accepted for the visual matrix (operator reviews and verifies the layout structurally; full content rendering on `/sessions/compare` lands in Phase 26).

2. **Create `frontend/tests/e2e/v13-a11y.spec.ts`** (POLI-10):
   ```ts
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
             await page.addInitScript(([d, t]) => {
               window.localStorage.setItem('cmc.density', d as string)
               window.localStorage.setItem('cmc.theme', t as string)
             }, [density, theme])
             await page.goto(route)
             await page.waitForLoadState('networkidle')
             const results = await new AxeBuilder({ page })
               .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
               .analyze()
             const blocking = results.violations.filter(v =>
               v.impact === 'serious' || v.impact === 'critical'
             )
             const warnings = results.violations.filter(v =>
               v.impact === 'moderate' || v.impact === 'minor'
             )
             if (warnings.length > 0) {
               console.warn(`${route} d=${density} t=${theme}: ${warnings.length} mod/minor warnings`)
               for (const w of warnings) console.warn(`  - ${w.id}: ${w.help}`)
             }
             expect(blocking, JSON.stringify(blocking.map(v => ({ id: v.id, help: v.help, nodes: v.nodes.length })), null, 2)).toEqual([])
           })
         }
       }
     }
   })
   ```
   Total: 5 routes × 3 × 2 = **30 axe runs**. `/sessions/compare` excluded from a11y matrix (empty-state would produce false negatives for chart/data-driven a11y rules; runtime axe coverage for that route lands in Phase 26).

3. **Create `frontend/tests/e2e/v13-portal-containment.spec.ts`** (CONT-02 runtime probe):
   ```ts
   import { test, expect } from '@playwright/test'

   /**
    * For each overlay-mounting interaction across the app, open the overlay then
    * assert no ancestor of the Portal-mounted content has a transform-creating
    * containing block. Catches the .cmc-btn:hover bug class and any future
    * regressions.
    */

   test.describe('CONT-02 portal containment — no transform ancestor traps Radix Portal children', () => {
     test('density toggle dropdown content has no transform ancestor', async ({ page }) => {
       await page.goto('/')
       await page.waitForLoadState('networkidle')
       await page.getByTestId('density-toggle-trigger').click()
       const popperContent = page.locator('[role="menu"]').first()
       await expect(popperContent).toBeVisible()
       const ancestorTransforms = await popperContent.evaluate((el) => {
         const offenders: Array<{ tag: string; cls: string; transform: string }> = []
         let cur: Element | null = el.parentElement
         while (cur && cur !== document.body) {
           const cs = window.getComputedStyle(cur)
           if (cs.transform && cs.transform !== 'none') {
             offenders.push({ tag: cur.tagName, cls: cur.className?.toString?.() ?? '', transform: cs.transform })
           }
           cur = cur.parentElement
         }
         return offenders
       })
       expect(ancestorTransforms, JSON.stringify(ancestorTransforms)).toEqual([])
     })

     test('command palette content has no transform ancestor', async ({ page }) => {
       await page.goto('/')
       await page.waitForLoadState('networkidle')
       await page.keyboard.press('Meta+K')
       const cmdk = page.locator('.cmc-cmdk').first()
       await expect(cmdk).toBeVisible()
       const ancestorTransforms = await cmdk.evaluate((el) => {
         const offenders: any[] = []
         let cur: Element | null = el.parentElement
         while (cur && cur !== document.body) {
           const cs = window.getComputedStyle(cur)
           if (cs.transform && cs.transform !== 'none') {
             offenders.push({ tag: cur.tagName, cls: cur.className?.toString?.() ?? '', transform: cs.transform })
           }
           cur = cur.parentElement
         }
         return offenders
       })
       expect(ancestorTransforms, JSON.stringify(ancestorTransforms)).toEqual([])
     })

     test('hovering a button does not put the page into a transform state for subsequent overlays', async ({ page }) => {
       await page.goto('/')
       await page.waitForLoadState('networkidle')
       // Hover any cmc-btn — plan 01 swapped its transform for top: -2px + box-shadow.
       const btn = page.locator('.cmc-btn').first()
       if (await btn.count() > 0) {
         await btn.hover()
         const t = await btn.evaluate(el => window.getComputedStyle(el).transform)
         expect(t).toBe('none')
       }
     })
   })
   ```
   These 3 tests cover the highest-risk Portal mount paths in v1.2 + plan 04's new sidebar tooltip. Additional overlay mount paths (Sheet on row click, AlertDialog) can be added in later phases; this baseline catches the Phase 24 surface.

4. **Create `.planning/phases/24-shell-density-containment-primitives/visual-check/.gitkeep`** as an empty file so the directory is committed and the auto-capture script's `mkdir -p` doesn't race git.

5. **Update `.gitignore`** at repo root — append:
   ```
   # Phase 24 quality-gate outputs
   .lighthouseci/
   .planning/phases/*/visual-check/*.png
   ```
   The PNG ignore lets operators commit the dir (`.gitkeep`) without committing 36+ binary screenshots. Operators who want to keep the visual evidence in history can manually `git add -f` the PNGs.
  </action>
  <verify>
    <automated>cd frontend && npx tsc --noEmit -p tsconfig.json && test -f tests/e2e/v13-visual-capture.spec.ts && test -f tests/e2e/v13-a11y.spec.ts && test -f tests/e2e/v13-portal-containment.spec.ts && grep -q 'AxeBuilder' tests/e2e/v13-a11y.spec.ts && grep -q 'transform' tests/e2e/v13-portal-containment.spec.ts && test -f ../.planning/phases/24-shell-density-containment-primitives/visual-check/.gitkeep && grep -q 'lighthouseci' ../.gitignore</automated>
  </verify>
  <done>3 spec files compile; visual-check dir exists with .gitkeep; .gitignore excludes .lighthouseci/ and visual-check PNGs. Specs run successfully via `pnpm test:e2e -- --grep="v13-"` (some may legitimately fail at this stage if shell pixel widths differ from research's recommendations — that surfaces as VISUAL-CHECK matrix output for plan 07 review, not as a plan-05 blocker; the spec FILES must exist and parse).</done>
</task>

<task type="auto">
  <name>Task 2: Sidebar + density + truncation + copy-cell e2e specs</name>
  <files>frontend/tests/e2e/v13-sidebar.spec.ts, frontend/tests/e2e/v13-density.spec.ts, frontend/tests/e2e/v13-truncation.spec.ts, frontend/tests/e2e/v13-copy-cell.spec.ts</files>
  <action>
1. **Create `frontend/tests/e2e/v13-sidebar.spec.ts`** (SHEL-04):
   ```ts
   import { test, expect } from '@playwright/test'

   test.describe('SHEL-04 sidebar collapse + persistence', () => {
     test('Cmd+B toggles sidebar collapsed state and persists across reload', async ({ page, context }) => {
       await page.goto('/')
       await page.waitForLoadState('networkidle')
       const sidebar = page.locator('.cmc-sidebar')
       await expect(sidebar).toBeVisible()
       const initialWidth = await sidebar.evaluate(el => el.getBoundingClientRect().width)
       expect(initialWidth).toBeGreaterThan(200)  // expanded ~240px

       // Cmd+B toggles to collapsed (52px).
       await page.keyboard.press('Meta+B')
       await page.waitForFunction(() => document.documentElement.dataset.sidebarCollapsed === 'true')
       const collapsedWidth = await sidebar.evaluate(el => el.getBoundingClientRect().width)
       expect(collapsedWidth).toBeLessThan(70)

       // Reload → persistence.
       await page.reload()
       await page.waitForLoadState('networkidle')
       const persistedWidth = await page.locator('.cmc-sidebar').evaluate(el => el.getBoundingClientRect().width)
       expect(persistedWidth).toBeLessThan(70)
       expect(await page.evaluate(() => localStorage.getItem('cmc.sidebar.collapsed'))).toBe('true')

       // Active route survives collapsed mode.
       await page.goto('/activity')
       await page.waitForLoadState('networkidle')
       const activeLink = page.locator('.cmc-sidebar__navlink--active')
       await expect(activeLink).toBeVisible()
       const borderLeft = await activeLink.evaluate(el => window.getComputedStyle(el).borderLeftWidth)
       expect(parseInt(borderLeft)).toBeGreaterThanOrEqual(3)  // 3px solid bar still present
     })

     test('hover icon in collapsed mode shows tooltip with route label', async ({ page }) => {
       await page.addInitScript(() => { localStorage.setItem('cmc.sidebar.collapsed', 'true') })
       await page.goto('/')
       await page.waitForLoadState('networkidle')
       const activityLink = page.getByTestId('sidebar-link-activity')
       await activityLink.hover()
       const tooltip = page.locator('[role="tooltip"]').first()
       await expect(tooltip).toBeVisible()
       await expect(tooltip).toContainText('Activity')
     })
   })
   ```

2. **Create `frontend/tests/e2e/v13-density.spec.ts`** (DENS-01..03):
   ```ts
   import { test, expect } from '@playwright/test'

   test.describe('DENS-01..03 density toggle persistence + cascade', () => {
     test('density toggle writes localStorage and dataset.density; persists across reload', async ({ page }) => {
       await page.goto('/')
       await page.waitForLoadState('networkidle')

       await page.getByTestId('density-toggle-trigger').click()
       await page.getByTestId('density-option-compact').click()
       await page.waitForFunction(() => document.documentElement.dataset.density === 'compact')
       expect(await page.evaluate(() => localStorage.getItem('cmc.density'))).toBe('compact')

       // Cascade: --cmc-padding-card on :root resolves to Compact value (16px).
       const padding = await page.evaluate(() =>
         window.getComputedStyle(document.documentElement).getPropertyValue('--cmc-padding-card').trim()
       )
       expect(padding).toBe('16px')

       // Reload → density survives.
       await page.reload()
       await page.waitForLoadState('networkidle')
       expect(await page.evaluate(() => document.documentElement.dataset.density)).toBe('compact')
     })

     test('density tokens cascade to Radix Portal content (DropdownMenu)', async ({ page }) => {
       await page.addInitScript(() => { localStorage.setItem('cmc.density', 'cozy') })
       await page.goto('/')
       await page.waitForLoadState('networkidle')
       await page.getByTestId('density-toggle-trigger').click()
       const menu = page.locator('[role="menu"]').first()
       await expect(menu).toBeVisible()
       const fontSize = await menu.evaluate(el => window.getComputedStyle(el).fontSize)
       // Cozy body size is 16px.
       expect(fontSize).toBe('16px')
     })
   })
   ```

3. **Create `frontend/tests/e2e/v13-truncation.spec.ts`** (CONT-03):
   ```ts
   import { test, expect } from '@playwright/test'

   test.describe('CONT-03 truncation + tooltip', () => {
     test('long string in DataTable cell truncates with ellipsis and shows full value on tooltip hover', async ({ page }) => {
       // Pick a route that renders a DataTable with potentially-long string columns.
       // /skills lists skill names; /alerts lists rule names. /sessions/compare's tables hold session-ids.
       // Use /skills as the safest universally-rendered DataTable.
       await page.goto('/skills')
       await page.waitForLoadState('networkidle')

       // Find any cell with .cmc-cell--truncate that is actually overflowing.
       const overflowingCell = await page.evaluate(() => {
         const cells = Array.from(document.querySelectorAll('.cmc-cell--truncate')) as HTMLElement[]
         const overflow = cells.find(c => c.scrollWidth > c.clientWidth + 1)
         return overflow ? { text: overflow.textContent, x: overflow.getBoundingClientRect().x, y: overflow.getBoundingClientRect().y } : null
       })

       // If no overflowing cell is present in the demo data, skip — the truncation path will
       // be exercised by other routes / fixtures. Don't fail the test on a clean dataset.
       test.skip(!overflowingCell, 'No truncating cell present in current /skills dataset; truncation path is tested via vitest unit')

       // Hover the cell, expect a tooltip with the full value.
       const cell = page.locator('.cmc-cell--truncate').first()
       await cell.hover()
       const tooltip = page.locator('[role="tooltip"]').first()
       await expect(tooltip).toBeVisible()
       expect(overflowingCell?.text).toBeTruthy()
       await expect(tooltip).toContainText(overflowingCell!.text!.trim())
     })
   })
   ```

4. **Create `frontend/tests/e2e/v13-copy-cell.spec.ts`** (CONT-03 copy):
   ```ts
   import { test, expect } from '@playwright/test'

   test.describe('CONT-03 click-to-copy on long cells', () => {
     test('copy icon writes to clipboard and does not fire row-click', async ({ page, context }) => {
       await context.grantPermissions(['clipboard-read', 'clipboard-write'])
       await page.goto('/skills')
       await page.waitForLoadState('networkidle')

       // Find any cell with .cmc-cell--copyable. If the route doesn't surface one,
       // skip — copyable cells are wired per-column in Phase 26/27 adoption.
       const copyableCount = await page.locator('.cmc-cell--copyable').count()
       test.skip(copyableCount === 0, 'No copyable cells on /skills today; coverage rolls forward in Phase 26/27')

       const copyBtn = page.getByTestId('cell-copy-btn').first()
       await copyBtn.scrollIntoViewIfNeeded()
       await copyBtn.click()
       const copied = await page.evaluate(() => navigator.clipboard.readText())
       expect(copied).toBeTruthy()
     })
   })
   ```
   The `test.skip` patterns in tasks 3 and 4 are honest: until per-route adoption (Phase 26/27) wires `copyable: true` on session-id / cwd / skill-name columns, the truncation and copy paths may not exercise on real demo data. The vitest unit tests in plan 03 cover the primitive behavior; these e2e specs are forward-compatible scaffolding that activates once Phase 26/27 lights up the columns.
  </action>
  <verify>
    <automated>cd frontend && npx tsc --noEmit -p tsconfig.json && test -f tests/e2e/v13-sidebar.spec.ts && test -f tests/e2e/v13-density.spec.ts && test -f tests/e2e/v13-truncation.spec.ts && test -f tests/e2e/v13-copy-cell.spec.ts && grep -q 'cmc.sidebar.collapsed' tests/e2e/v13-sidebar.spec.ts && grep -q 'cmc.density' tests/e2e/v13-density.spec.ts && grep -q 'scrollWidth' tests/e2e/v13-truncation.spec.ts && grep -q 'clipboard' tests/e2e/v13-copy-cell.spec.ts</automated>
  </verify>
  <done>4 spec files compile and parse via Playwright. Sidebar + density specs exercise localStorage persistence + DOM cascade behavior end-to-end. Truncation + copy-cell specs use `test.skip` when demo data doesn't expose the conditions, with comments pointing forward to Phase 26/27 adoption.</done>
</task>

<task type="auto">
  <name>Task 3: Lighthouse CI config + URL contract pytest gate</name>
  <files>frontend/lighthouserc.json, backend/tests/test_url_contract.py</files>
  <action>
1. **Create `frontend/lighthouserc.json`** (POLI-11 Lighthouse CI extension):
   ```json
   {
     "ci": {
       "collect": {
         "url": [
           "http://127.0.0.1:4173/",
           "http://127.0.0.1:4173/activity",
           "http://127.0.0.1:4173/skills"
         ],
         "startServerCommand": "pnpm preview --port 4173 --strictPort --host 127.0.0.1",
         "startServerReadyPattern": "ready in",
         "numberOfRuns": 3,
         "settings": {
           "preset": "desktop",
           "throttlingMethod": "provided"
         }
       },
       "assert": {
         "assertions": {
           "categories:performance": ["warn", { "minScore": 0.9 }],
           "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
           "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
           "interaction-to-next-paint": ["error", { "maxNumericValue": 200 }]
         }
       },
       "upload": {
         "target": "filesystem",
         "outputDir": ".lighthouseci"
       }
     }
   }
   ```
   Note research-corrected URL list: `/`, `/activity`, `/skills`. NOT `/sessions/compare` (per Pitfall 5: the route requires demo session IDs to render; without seeding, LCP measures the empty-state and produces noise). `/skills` substituted because it's chart-heavy AND requires no search params.

   Operator-driven, NOT CI-blocking on every commit. Run via `cd frontend && npx lhci autorun` at phase close (plan 07).

2. **Create `backend/tests/test_url_contract.py`** (POLI-13 gate):
   ```python
   """POLI-13 — URL contract gate.

   Enforces that every URL pattern documented in docs/url-contract.md still has a
   corresponding TanStack Router route file. If a documented pattern is missing
   from the route tree, this test fails — preventing accidental URL breakage.

   docs/url-contract.md is authored in plan 06 (Phase 24). The test fails until
   plan 06 lands; that's expected — the test+doc pair gates on phase close (plan 07).
   """
   import re
   from pathlib import Path

   import pytest

   REPO_ROOT = Path(__file__).resolve().parents[2]
   URL_DOC = REPO_ROOT / "docs" / "url-contract.md"
   ROUTE_DIR = REPO_ROOT / "frontend" / "src" / "routes"


   def parse_doc_urls() -> set[str]:
       """Extract every backtick-quoted URL pattern from the docs table."""
       if not URL_DOC.exists():
           pytest.skip(f"docs/url-contract.md missing — authored in plan 06 (Phase 24)")
       text = URL_DOC.read_text()
       return set(re.findall(r"\|\s*`(/[\w$./-]+)`", text))


   def derive_route_urls() -> set[str]:
       """Walk the TanStack Router file-based route tree.

       File-name conventions:
         - index.tsx -> /
         - foo.tsx -> /foo
         - foo_.bar.tsx -> /foo/bar (underscore segment break)
         - skills_.\\$name.tsx -> /skills/$name (dynamic param)
       Files starting with __ (e.g. __root.tsx) and routeTree.gen.ts are skipped.
       """
       urls: set[str] = set()
       if not ROUTE_DIR.exists():
           pytest.skip(f"Route dir {ROUTE_DIR} missing")
       for f in ROUTE_DIR.glob("*.tsx"):
           name = f.name
           if name.startswith("__") or name == "routeTree.gen.ts":
               continue
           stem = f.stem
           if stem == "index":
               urls.add("/")
               continue
           # Replace TanStack Router segment break (underscore-dot) with slash.
           segment_path = stem.replace("_.", "/").replace(".", "/")
           # $param stays as-is to match docs notation.
           urls.add("/" + segment_path)
       return urls


   def test_url_contract_documented_routes_exist():
       documented = parse_doc_urls()
       actual = derive_route_urls()
       missing = documented - actual
       assert not missing, (
           f"Documented URLs missing from route tree: {sorted(missing)}\n"
           f"Routes derived from {ROUTE_DIR}: {sorted(actual)}"
       )


   def test_url_contract_route_tree_is_documented():
       """Inverse direction: every route in the tree should be listed in docs.

       Allows for additive growth: new routes must be documented in the same
       commit that adds them. Failure mode points at the missing doc entry,
       not at the route file.
       """
       documented = parse_doc_urls()
       actual = derive_route_urls()
       undocumented = actual - documented
       assert not undocumented, (
           f"Routes in tree but not documented in docs/url-contract.md: {sorted(undocumented)}\n"
           f"Add a row to the routes table in docs/url-contract.md."
       )
   ```

   The test file uses `pytest.skip` when `docs/url-contract.md` is absent so plan 05 can land independently of plan 06. Both tests fail/pass together at phase close once plan 06 ships the doc.

3. **Sanity-check the test against the current route tree.** Run from repo root:
   ```bash
   cd backend && python -m pytest tests/test_url_contract.py -v
   ```
   Expected outcomes:
   - Without `docs/url-contract.md` → both tests SKIP (plan 06 not yet shipped).
   - After plan 06 ships docs/url-contract.md with the 7 expected routes (`/`, `/activity`, `/skills`, `/skills/$name`, `/sessions/compare`, `/cost`, `/alerts`) → both tests PASS.

   If the route-derivation regex is wrong for actual TanStack file conventions in this repo (worth verifying against `frontend/src/routes/`), adjust the `derive_route_urls` logic. Read `frontend/src/routes/` filenames and `frontend/src/routes/routeTree.gen.ts` to confirm. The illustrative regex handles `_.` and `.` separators and `$`-prefixed params — if there are edge cases (e.g., `_layout.foo.tsx`), document the limitation in a comment.
  </action>
  <verify>
    <automated>test -f frontend/lighthouserc.json && grep -q 'largest-contentful-paint' frontend/lighthouserc.json && grep -q '127.0.0.1:4173' frontend/lighthouserc.json && ! grep -q 'sessions/compare' frontend/lighthouserc.json && test -f backend/tests/test_url_contract.py && cd backend && python -m pytest tests/test_url_contract.py -v --no-header 2>&1 | head -30</automated>
  </verify>
  <done>`frontend/lighthouserc.json` contains the 3-URL collect list (research-corrected — NO `/sessions/compare`), CWV thresholds, filesystem upload. `backend/tests/test_url_contract.py` runs (skips if docs absent; will pass after plan 06 ships docs/url-contract.md). Existing 661 backend pytest count unaffected (the new test is additive; skips don't fail a run).</done>
</task>

</tasks>

<verification>
```bash
# Plan 05 ships scaffolding; the matrix actually RUNS in plan 07.
# Sanity verification:

# 1. Frontend type-check.
cd frontend && pnpm tsc --noEmit

# 2. Frontend unit tests still green (we added e2e specs, not unit).
cd frontend && pnpm vitest run --reporter=dot

# 3. Backend pytest still green (URL-contract test skips when docs absent).
cd backend && python -m pytest -q

# 4. Optional: spot-check one Playwright spec.
cd frontend && pnpm test:e2e -- --grep="density toggle writes" || true
# (Will pass if the dev server starts cleanly; ok to defer to plan 07's matrix run.)

# 5. Optional: verify Lighthouse CI config parses.
cd frontend && npx lhci autorun --config=./lighthouserc.json --collect.numberOfRuns=1 || true
# (Will report results; thresholds may pass or fail depending on local perf — operator reviews at plan 07.)
```
</verification>

<success_criteria>
1. 7 Playwright spec files exist under `frontend/tests/e2e/v13-*.spec.ts` and parse via Playwright's TS compiler.
2. `frontend/lighthouserc.json` exists with 3-URL list (`/`, `/activity`, `/skills` — NOT `/sessions/compare`), CWV thresholds (LCP 2500, CLS 0.1, INP 200), filesystem upload.
3. `.gitignore` excludes `.lighthouseci/` and `visual-check/*.png`.
4. `.planning/phases/24-shell-density-containment-primitives/visual-check/.gitkeep` exists.
5. `backend/tests/test_url_contract.py` exists; runs (skips when docs absent — that's the planned state until plan 06 lands).
6. Frontend `pnpm tsc --noEmit` clean.
7. Backend `pytest -q` count remains 661 (test_url_contract skips count as 1 skip, not failure — net 661 pass + 1 skip is acceptable; or 0 skip if the doc lands first; either way, no regression).
8. Existing Playwright suite (13 specs from v1.2 baseline, 11 passing + 2 known skips) unchanged.
</success_criteria>

<output>
After completion, create `.planning/phases/24-shell-density-containment-primitives/24-05-SUMMARY.md` per the standard SUMMARY template, recording:
- Final URL list in lighthouserc.json (any deviation from `/`, `/activity`, `/skills`)
- Whether the URL-contract pytest skipped or passed (depends on plan 06 ordering — plan 05 ships first by wave, but plan 06 may merge before plan 05's CI runs)
- Any test.skip conditions hit during sanity runs (truncation/copy-cell specs are explicitly conditional; sidebar/density specs should pass without skips)
- Notes for plan 07's matrix run (e.g., demo data state, browser version, any flakiness observed)
</output>
