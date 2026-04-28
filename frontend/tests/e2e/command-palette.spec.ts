// TEST-02 — Cmd+K opens the command palette.
//
// CommandPalette (frontend/src/components/ui/CommandPalette.tsx) listens for
// the global `k` keypress with metaKey OR ctrlKey on the document. Playwright's
// page.keyboard.press('Meta+K') maps to Cmd+K on macOS (the executor's host
// OS); on Linux/Windows runners, Meta+K still triggers since cmdk responds to
// both modifiers.
//
// Locator: cmdk's Command.Dialog renders a Radix Dialog (role="dialog") with
// the `aria-label` we pass. We match by role+name — robust against future
// className changes.

import { test, expect } from '@playwright/test'

test('TEST-02: Cmd+K opens the command palette', async ({ page }) => {
  await page.goto('/')
  // Ensure the page has fully mounted before pressing — otherwise the cmdk
  // global listener may not be attached yet.
  await expect(page.locator('#cmd-heading')).toBeVisible()

  // Send the keypress directly to the body element. CommandPalette listens
  // on document so any element that bubbles works; we click body first to
  // ensure focus is in the page (otherwise the press goes to the URL bar
  // in some browser harnesses).
  await page.locator('body').click()
  // Use ControlOrMeta — Playwright maps this to Meta on macOS and Control
  // elsewhere. CommandPalette accepts either (both metaKey AND ctrlKey are
  // checked in the listener).
  await page.keyboard.press('ControlOrMeta+KeyK')

  const palette = page.getByRole('dialog', {
    name: 'Mission Control command palette',
  })
  await expect(palette).toBeVisible({ timeout: 5_000 })

  // Sanity — the search input should be present too (cmdk renders an
  // <input> inside the dialog with the spec's placeholder copy).
  await expect(
    page.getByPlaceholder('Search pages, sessions, schedules…'),
  ).toBeVisible()
})
