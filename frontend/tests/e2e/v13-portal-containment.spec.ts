// CONT-02 — Phase 24 Plan 05 portal-containment runtime probe.
//
// For each overlay-mounting interaction across the app, open the overlay
// then assert no ancestor of the Portal-mounted content has a
// transform-creating containing block. Catches the `.cmc-btn:hover` bug
// class (transform on a hovered button trapped Radix Portal children
// because the containing block jumped from <body> to the hovered button)
// and any future regressions.
//
// Mechanism: page.evaluate walks `el.parentElement` from the Portal's
// rendered content up to `document.body`, collecting any ancestor whose
// `getComputedStyle().transform` is anything other than `none`. The list
// MUST be empty — `transform: none` is the only acceptable value on the
// ancestor chain because any non-none transform turns its element into
// the containing block for `position: fixed` descendants (the Portal
// child IS position: fixed).
//
// Two exceptions are skipped during the walk — these are the Portal's
// OWN positioning + entrance-animation surfaces, not external ancestors:
//   1. `[data-radix-popper-content-wrapper]` — Radix Popper's positioning
//      wrapper translates the popper to its anchor position via
//      `transform: translate(x, y)`. This transform is intrinsic to how
//      Radix positions floating UI; it does NOT trap descendants because
//      it IS the Portal's mount point.
//   2. The locator element itself when it carries an entrance scale
//      (e.g., cmdk's `transform: scale(0.96619)` during the open
//      animation). The animation is on the element, not on an ancestor;
//      there is no Portal-content descendant of the locator to trap.
// Both are "self" transforms, not ancestor transforms — they don't
// satisfy the "transform on an ancestor traps fixed descendants" pitfall.
//
// Coverage: three highest-risk Portal mount paths in v1.2 + plan 04's
// new sidebar tooltip:
//   1. DensityToggle DropdownMenu (Radix Portal, plan 02)
//   2. Command palette / cmdk dialog (Radix Portal via Dialog primitive)
//   3. Button hover state (regression guard for plan 01's transform
//      removal on `.cmc-btn:hover`)
// Additional overlay mount paths (Sheet on row click, AlertDialog) can be
// added in later phases as routes adopt them; this baseline catches the
// Phase 24 surface.

import { test, expect } from '@playwright/test'

interface TransformAncestor {
  tag: string
  cls: string
  transform: string
}

test.describe('CONT-02 portal containment — no transform ancestor traps Radix Portal children', () => {
  test('density toggle dropdown content has no transform ancestor', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('density-toggle-trigger').click()
    const popperContent = page.locator('[role="menu"]').first()
    await expect(popperContent).toBeVisible()

    const ancestorTransforms: TransformAncestor[] = await popperContent.evaluate(
      (el) => {
        const isRadixPopperWrapper = (e: Element) =>
          e.hasAttribute('data-radix-popper-content-wrapper')
        const offenders: Array<{
          tag: string
          cls: string
          transform: string
        }> = []
        let cur: Element | null = el.parentElement
        while (cur && cur !== document.body) {
          // Radix's popper-content-wrapper translates the floating UI to
          // its anchor position. The transform is intrinsic to Portal
          // positioning, not an ancestor-trap. Skip it during the walk.
          if (isRadixPopperWrapper(cur)) {
            cur = cur.parentElement
            continue
          }
          const cs = window.getComputedStyle(cur)
          if (cs.transform && cs.transform !== 'none') {
            offenders.push({
              tag: cur.tagName,
              cls: cur.className?.toString?.() ?? '',
              transform: cs.transform,
            })
          }
          cur = cur.parentElement
        }
        return offenders
      },
    )

    expect(ancestorTransforms, JSON.stringify(ancestorTransforms)).toEqual([])
  })

  test('command palette content has no transform ancestor', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Click body first to ensure focus is in the page (mirrors the pattern
    // used in command-palette.spec.ts — without it the shortcut can be
    // captured by the URL bar in some harnesses).
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')

    const cmdk = page.locator('.cmc-cmdk').first()
    await expect(cmdk).toBeVisible()

    // Wait out the cmdk entrance scale animation (~200ms) — the
    // `transform: scale(0.96619)` on `.cmc-cmdk__content` is a self
    // transform, but a still-animating one will resolve to a matrix
    // mid-animation; settle first for a stable assertion.
    await page.waitForTimeout(250)

    const ancestorTransforms: TransformAncestor[] = await cmdk.evaluate((el) => {
      const isRadixPopperWrapper = (e: Element) =>
        e.hasAttribute('data-radix-popper-content-wrapper')
      const offenders: Array<{
        tag: string
        cls: string
        transform: string
      }> = []
      let cur: Element | null = el.parentElement
      while (cur && cur !== document.body) {
        if (isRadixPopperWrapper(cur)) {
          cur = cur.parentElement
          continue
        }
        const cs = window.getComputedStyle(cur)
        if (cs.transform && cs.transform !== 'none') {
          offenders.push({
            tag: cur.tagName,
            cls: cur.className?.toString?.() ?? '',
            transform: cs.transform,
          })
        }
        cur = cur.parentElement
      }
      return offenders
    })

    expect(ancestorTransforms, JSON.stringify(ancestorTransforms)).toEqual([])
  })

  test('hovering a button does not put the page into a transform state for subsequent overlays', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Plan 01 swapped `.cmc-btn:hover`'s transform for `top: -2px` +
    // box-shadow. Verify the hover state still resolves to
    // `transform: none` — any regression that re-adds a translate / scale
    // here would re-create the Portal-trap class.
    const btn = page.locator('.cmc-btn').first()
    if ((await btn.count()) > 0) {
      await btn.hover()
      const t = await btn.evaluate(
        (el) => window.getComputedStyle(el).transform,
      )
      expect(t).toBe('none')
    }
  })
})

// ────────────────────────────────────────────────────────────────────────
// Phase 26 Plan 09 extension: TimePicker popover + RefreshDropdown menu +
// Sonner Toaster region all Portal-mount via Radix or sonner's own
// document.body mount. Mirror the Phase 24 walker — none of these
// content roots may have a transform ancestor (only the Radix
// popper-content-wrapper's intrinsic translate is permitted).
// ────────────────────────────────────────────────────────────────────────

async function assertNoTransformAncestor(
  locator: import('@playwright/test').Locator,
): Promise<void> {
  const ancestorTransforms: TransformAncestor[] = await locator.evaluate(
    (el) => {
      const isRadixPopperWrapper = (e: Element) =>
        e.hasAttribute('data-radix-popper-content-wrapper')
      const offenders: Array<{
        tag: string
        cls: string
        transform: string
      }> = []
      let cur: Element | null = el.parentElement
      while (cur && cur !== document.body) {
        if (isRadixPopperWrapper(cur)) {
          cur = cur.parentElement
          continue
        }
        const cs = window.getComputedStyle(cur)
        if (cs.transform && cs.transform !== 'none') {
          offenders.push({
            tag: cur.tagName,
            cls: cur.className?.toString?.() ?? '',
            transform: cs.transform,
          })
        }
        cur = cur.parentElement
      }
      return offenders
    },
  )
  expect(ancestorTransforms, JSON.stringify(ancestorTransforms)).toEqual([])
}

test.describe('CONT-02 portal containment — Phase 26 chrome (TimePicker / RefreshDropdown / Toaster)', () => {
  test('TimePicker popover content has no transform ancestor', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('time-picker-trigger').click()
    const popover = page.getByTestId('time-picker-popover')
    await expect(popover).toBeVisible()
    await assertNoTransformAncestor(popover)
  })

  test('RefreshDropdown menu content has no transform ancestor', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('refresh-dropdown-trigger').click()
    // Radix DropdownMenu.Content is the role=menu surface.
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible()
    await assertNoTransformAncestor(menu)
  })

  test('Sonner Toaster region has no transform ancestor when a toast fires', async ({
    page,
  }) => {
    await page.goto('/?time_from=now-7d&time_to=now')
    await page.waitForLoadState('networkidle')
    await page.locator('body').click()
    // Cmd+Shift+C fires toast.success('Time range copied') — sonner
    // mounts a region in <body>.
    await page.keyboard.press('ControlOrMeta+Shift+KeyC')
    // Wait for the toast region to appear (sonner uses [data-sonner-toaster]
    // on its outer wrapper).
    const toaster = page.locator('[data-sonner-toaster], [aria-label*="Notifications" i]').first()
    await expect(toaster).toBeAttached({ timeout: 5_000 })
    await assertNoTransformAncestor(toaster)
  })
})

// ────────────────────────────────────────────────────────────────────────
// Phase 27 Plan 09 extension: confirm Phase 27 introduced no new portal-
// mounting surfaces. CompareToggle is a plain button (not a portal); the
// AlertNlInput 503 error block + Retry button are inline DOM (not a
// portal). Verify by asserting NO unexpected new portal wrappers appear
// on the 4 tail-end routes at idle (CompareToggle + AlertRuleForm are the
// only Phase 27 chrome surfaces and neither uses Radix Portal).
// ────────────────────────────────────────────────────────────────────────

test.describe('CONT-02 portal containment — Phase 27 sentinel (no new portals)', () => {
  test('Phase 27: /skills /cost /alerts have no new Phase-27-attributable portal-content surfaces at idle', async ({
    page,
  }) => {
    // The contract: Phase 27 shipped no Radix Portal / DropdownMenu /
    // Popover / Sheet new mounts. CompareToggle on /cost is a button
    // (verified by reading frontend/src/components/ui/CompareToggle.tsx
    // at planning time — it renders <button aria-pressed=…>).
    // AlertRuleForm's NL error block + Retry is inline <div role="alert">
    // (not a portal). Validate the negative invariant by walking the
    // existing radix-popper / radix-dialog set at idle on each route
    // and confirming the count matches the Phase 26 baseline (chrome-only).
    for (const route of ['/skills', '/cost', '/alerts']) {
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1200)
      const idleRadixCount = await page.evaluate(() =>
        document.querySelectorAll('[data-radix-popper-content-wrapper]').length,
      )
      // At idle, no Radix Popper popovers are open (the global TimePicker +
      // RefreshDropdown only mount on click). Phase 27 should not change this.
      expect(idleRadixCount).toBe(0)
    }
  })
})
