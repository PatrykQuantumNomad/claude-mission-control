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
