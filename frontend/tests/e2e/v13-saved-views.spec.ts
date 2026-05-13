// Phase 25 Plan 11 — Saved Views e2e regression net.
//
// Covers ROADMAP Phase 25 success criteria 1-4 (and the frontend half of
// criterion 5) end-to-end against the running backend + Vite preview build.
// Criterion 5's backend half (5 CRUD endpoints + Alembic migration + 50-cap
// 400 + UNIQUE-name 400) is owned by `backend/tests/test_views_router.py`
// (Plan 02 pytest); this file exercises the frontend chrome wired against
// the same router.
//
// Pattern mirrors the existing `v13-*.spec.ts` family:
//   - data-testid selectors EXCLUSIVELY (registry is the contract — ESLint
//     custom rule cmc/testid-registry-only enforces).
//   - `domcontentloaded` + a short settle delay — `networkidle` is forbidden
//     on chart-heavy routes that hold persistent OTEL/polling streams
//     (Phase 24 plan-07 SUMMARY lock).
//   - `ControlOrMeta+KeyK` for Cmd+K, mirroring `command-palette.spec.ts`'s
//     macOS/Linux-portable keystroke convention.
//   - beforeEach wipes BOTH server-side saved_views rows AND the relevant
//     localStorage keys (`cmc.savedView.default.*`, `cmc.savedView.pinned`,
//     `cmc.savedView.recent.*`). Plan 11 is the first Playwright spec that
//     touches persistent server state — without the wipe, runs depend on
//     order. Same shape Plan 25-02's pytest beforeEach uses.
//
// Route selection note (Plan 11 Accepted Exception):
//   Criterion 1 (auto-load per-route default) is exercised on
//   /sessions/compare with synthetic UUIDs. /skills/$name CANNOT exercise
//   criterion 1 end-to-end because its validateSearch defaults `range=14d`
//   on every read — DefaultViewLoader's Pitfall-8 deep-link-wins lock then
//   short-circuits the auto-apply (any non-schemaVersion key in URL search
//   counts as a deep-link). This is a known v1 limitation: routes whose
//   validateSearch fills defaults beyond schemaVersion need a different
//   "user-supplied vs route-default" distinction in DefaultViewLoader,
//   which is out-of-scope for Phase 25 close. /sessions/compare is the
//   correct fixture because its validateSearch only preserves explicitly
//   supplied UUIDs — bare `/sessions/compare` yields `{schemaVersion:1}`
//   (no other keys), so the auto-apply fires as designed.
//
// Criterion 2 (EditOrForkDialog on URL divergence) uses
//   window.history.pushState + dispatchEvent(PopStateEvent) to simulate a
//   deep-link in-page WITHOUT a full reload (which would reset the
//   in-memory LoadedViewContext and defeat the test). TanStack Router
//   listens for popstate and re-reads the URL — same code path as a
//   user pasting a divergent URL into the address bar.

import { test, expect, type Page } from '@playwright/test'

const BACKEND = 'http://127.0.0.1:8765'

// Synthetic UUIDs for /sessions/compare. The route's validateSearch
// PRESERVES any value matching UUID_RE — these don't need to resolve to
// real sessions for the URL-state-as-source-of-truth tests below.
const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const UUID_C = '33333333-3333-4333-8333-333333333333'

async function wipeViews(page: Page) {
  const r = await page.request.get(`${BACKEND}/api/views`)
  const data = (await r.json()) as { items: Array<{ id: number }> }
  for (const v of data.items) {
    await page.request.delete(`${BACKEND}/api/views/${v.id}`)
  }
}

// SPA-internal URL mutation: history.pushState (no reload) + manually
// dispatched popstate so TanStack Router's history.subscribe picks it up.
// This is the only way to demonstrate URL divergence from a loaded view
// without resetting LoadedViewContext (which a full page.goto would do).
async function pushSearch(page: Page, search: string) {
  await page.evaluate((s) => {
    const url = new URL(window.location.href)
    url.search = s
    window.history.pushState({}, '', url.toString())
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, search)
}

test.describe('Phase 25 — Saved Views (ROADMAP success criteria 1-4)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies()
    // Wipe server-side rows so each test sees a clean catalog.
    await wipeViews(page)
    // Clean per-test localStorage. We do NOT use `addInitScript` here
    // because addInitScript fires before EVERY navigation (including SPA
    // page.goto calls mid-test) — that would re-wipe the cmc.savedView.*
    // keys the user-clicks-set-as-default flow writes, defeating the
    // VIEW-06 auto-apply test. Instead, navigate to a real route first
    // (so the origin-scoped localStorage is reachable), wipe, then let
    // each test perform its own page.goto. Subsequent same-origin SPA
    // navigations preserve the cleaned state.
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
        // ignore — context may be torn down
      }
    })
  })

  // ── ROADMAP criterion 1: save → set-as-default → leave → return → auto-apply
  test('saves a view on /sessions/compare and auto-loads it as the per-route default', async ({
    page,
  }) => {
    await page.goto(`/sessions/compare?a=${UUID_A}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)

    // Open SavedViewMenu via the chrome trigger.
    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId('saved-view-menu-save-new').click()
    await expect(page.getByTestId('save-view-dialog')).toBeVisible()
    await page.getByTestId('save-view-dialog-name-input').fill('Compare A')
    await page.getByTestId('save-view-dialog-submit').click()
    await expect(page.getByTestId('save-view-dialog')).toBeHidden()

    // Confirm via the API that the row landed with the correct route + state.
    const list = await page.request.get(`${BACKEND}/api/views`)
    const listJson = (await list.json()) as {
      items: Array<{ id: number; name: string; route: string; state_json: Record<string, unknown> }>
    }
    expect(listJson.items.length).toBe(1)
    const view = listJson.items[0]
    expect(view.name).toBe('Compare A')
    expect(view.route).toBe('/sessions/compare')
    expect(view.state_json).toMatchObject({ a: UUID_A })

    // Set as default via the per-view submenu.
    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId(`saved-view-item-${view.id}`).hover()
    await page.getByTestId(`saved-view-set-default-${view.id}`).click()

    // Navigate AWAY to a different route — defeats DefaultViewLoader's
    // useRef route-id guard so it re-arms on return.
    await page.goto('/alerts')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(400)

    // Return to /sessions/compare with NO query — DefaultViewLoader should
    // apply the per-route default, restoring `?a=<UUID_A>`.
    await page.goto('/sessions/compare')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await expect(page).toHaveURL(new RegExp(`a=${UUID_A}`))
  })

  test('deep link to /sessions/compare?a=<uuid> wins over per-route default (Pitfall 8)', async ({
    page,
  }) => {
    // Seed via API + localStorage so the test focuses on the deep-link path.
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Default A',
        description: '',
        route: '/sessions/compare',
        state_json: { a: UUID_A },
        schema_version: 1,
      },
    })
    const view = await created.json()
    // Seed the default-view pointer in localStorage. The wrapper writes the
    // value JSON-encoded (matching `storage.set` behavior in lib/storage.ts),
    // so a numeric id becomes the literal "1" — NOT a quoted string.
    await page.evaluate((id: number) => {
      window.localStorage.setItem(
        'cmc.savedView.default./sessions/compare',
        JSON.stringify(id),
      )
    }, view.id as number)

    // Deep link with a DIFFERENT UUID — Pitfall 8 lock means any
    // non-schemaVersion key short-circuits the apply.
    await page.goto(`/sessions/compare?a=${UUID_B}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await expect(page).toHaveURL(new RegExp(`a=${UUID_B}`))
    await expect(page).not.toHaveURL(new RegExp(`a=${UUID_A}`))
  })

  // ── ROADMAP criterion 2: edit a loaded view → EditOrForkDialog (no silent overwrite)
  test('modifying a loaded view exposes EditOrForkDialog with 3 explicit choices', async ({
    page,
  }) => {
    // Seed: create a view via API so we can Open it from the menu.
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Edit me',
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

    // Open the view → LoadedViewContext wires up; URL matches state_json
    // so UnsavedPip stays hidden.
    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId(`saved-view-item-${view.id}`).hover()
    await page.getByTestId(`saved-view-open-${view.id}`).click()
    await expect(page.getByTestId('unsaved-pip')).toBeHidden()

    // Simulate a deep-link to a DIVERGENT state via pushState (no reload).
    // The LoadedViewContext survives because it's React state, not URL state.
    await pushSearch(page, `?a=${UUID_B}`)
    await page.waitForTimeout(300)
    await expect(page.getByTestId('unsaved-pip')).toBeVisible()

    // Open menu → "Edit '<name>'…" item visible (only renders when
    // loadedView && urlDiverges).
    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId('saved-view-menu-edit-current').click()

    // Dialog has all 3 explicit choices — no silent-overwrite path.
    await expect(page.getByTestId('edit-or-fork-dialog')).toBeVisible()
    await expect(page.getByTestId('edit-or-fork-dialog-save')).toBeVisible()
    await expect(page.getByTestId('edit-or-fork-dialog-fork')).toBeVisible()
    await expect(
      page.getByTestId('edit-or-fork-dialog-discard'),
    ).toBeVisible()
  })

  test('save-changes branch updates the loaded view in place', async ({
    page,
  }) => {
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Save-changes target',
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

    await pushSearch(page, `?a=${UUID_B}`)
    await page.waitForTimeout(300)

    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId('saved-view-menu-edit-current').click()
    await page.getByTestId('edit-or-fork-dialog-save').click()

    await expect(page.getByTestId('edit-or-fork-dialog')).toBeHidden()
    // UnsavedPip cleared — the loaded view now matches the URL.
    await expect(page.getByTestId('unsaved-pip')).toBeHidden()

    // API: state_json updated to {a: UUID_B}.
    const updated = await page.request.get(`${BACKEND}/api/views/${view.id}`)
    const updatedJson = (await updated.json()) as {
      state_json: Record<string, unknown>
    }
    expect(updatedJson.state_json).toMatchObject({ a: UUID_B })
  })

  test('fork branch opens SaveViewDialog in fork mode (name pre-fills with "copy")', async ({
    page,
  }) => {
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Fork source',
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

    await pushSearch(page, `?a=${UUID_C}`)
    await page.waitForTimeout(300)

    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId('saved-view-menu-edit-current').click()
    await page.getByTestId('edit-or-fork-dialog-fork').click()

    // SaveViewDialog appears in fork mode. Plan 06 seed shape:
    // name = "{source.name} (copy)" — the "copy" cue is locked.
    await expect(page.getByTestId('save-view-dialog')).toBeVisible()
    const name = await page
      .getByTestId('save-view-dialog-name-input')
      .inputValue()
    expect(name.toLowerCase()).toContain('copy')
  })

  test('discard branch reverts URL to the loaded view state_json', async ({
    page,
  }) => {
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Discard target',
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

    await pushSearch(page, `?a=${UUID_B}`)
    await page.waitForTimeout(300)
    await expect(page).toHaveURL(new RegExp(`a=${UUID_B}`))

    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId('saved-view-menu-edit-current').click()
    await page.getByTestId('edit-or-fork-dialog-discard').click()

    // URL reverted to the loaded view's state_json.
    await expect(page).toHaveURL(new RegExp(`a=${UUID_A}`))
    await expect(page.getByTestId('unsaved-pip')).toBeHidden()
  })

  // ── ROADMAP criterion 3: Cmd+K Saved Views group navigation
  test('Cmd+K Saved Views group lists views and navigates to the matching route', async ({
    page,
  }) => {
    // Seed a view on /sessions/compare — STATIC routeId so routePathFromId
    // returns the route id verbatim.
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Compare overview',
        description: '',
        route: '/sessions/compare',
        state_json: { a: UUID_A },
        schema_version: 1,
      },
    })
    const view = await created.json()

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)

    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(
      page.getByRole('dialog', { name: 'Mission Control command palette' }),
    ).toBeVisible()

    await expect(page.getByTestId(`cmdk-saved-view-${view.id}`)).toBeVisible()
    await page.getByTestId(`cmdk-saved-view-${view.id}`).click()
    await expect(page).toHaveURL(/\/sessions\/compare/)
    await expect(page).toHaveURL(new RegExp(`a=${UUID_A}`))
  })

  test('Cmd+K Saved Views group surfaces empty-state when no views exist', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.locator('body').click()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(
      page.getByRole('dialog', { name: 'Mission Control command palette' }),
    ).toBeVisible()
    await expect(page.getByTestId('cmdk-saved-views-empty')).toBeVisible()
  })

  // ── ROADMAP criterion 4: pin a view → appears in sidebar Pinned section
  test('pinning a view via SavedViewMenu surfaces it in the sidebar Pinned section after reload', async ({
    page,
  }) => {
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Pin me',
        description: '',
        route: '/sessions/compare',
        state_json: { a: UUID_A },
        schema_version: 1,
      },
    })
    const view = await created.json()

    await page.goto('/sessions/compare')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)

    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId(`saved-view-item-${view.id}`).hover()
    await page.getByTestId(`saved-view-pin-${view.id}`).click()

    // Plan 09 SUMMARY locks the localStorage same-tab limitation:
    // `cmc.savedView.pinned` writes from the menu do NOT trigger 'storage'
    // events in the same tab. Reload to pick up the new pin (this is the
    // documented v1 behavior, not a bug).
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)

    const pinned = page.getByTestId(`sidebar-pinned-view-${view.id}`)
    await expect(pinned).toBeVisible()
    await pinned.click()
    await expect(page).toHaveURL(/\/sessions\/compare/)
  })

  test('Pinned section empty-state copy renders when no views are pinned', async ({
    page,
  }) => {
    await page.goto('/cost')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await expect(page.getByTestId('sidebar-pinned-empty')).toBeVisible()
  })

  // ──────────────────────────────────────────────────────────────────
  // Phase 26 Plan 09 extension: time_from + time_to + compare_panels
  // round-trip through state_json. Saved-views are an opaque blob the
  // route's validateSearch deserializes on read; Phase 26 adds 3 new
  // keys to / + /activity's validateSearch (time_from, time_to,
  // compare_panels). Round-tripping these proves saved-views remain
  // contract-compliant after the Phase 26 surface expansion.
  // ──────────────────────────────────────────────────────────────────

  test('Phase 26: saved view containing time_from + time_to round-trips through state_json', async ({
    page,
  }) => {
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Last 7 days view',
        description: '',
        route: '/',
        state_json: { time_from: 'now-7d', time_to: 'now' },
        schema_version: 1,
      },
    })
    const view = await created.json()

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    // Open the view via the SavedViewMenu — exercises the read path
    // (validateSearch decodes state_json on navigation).
    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId(`saved-view-item-${view.id}`).hover()
    await page.getByTestId(`saved-view-open-${view.id}`).click()
    await expect(page).toHaveURL(/time_from=now-7d/)
    await expect(page).toHaveURL(/time_to=now/)
  })

  test('Phase 26: saved view containing compare_panels=token-usage round-trips through state_json', async ({
    page,
  }) => {
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Compare overlay view',
        description: '',
        route: '/',
        state_json: { compare_panels: 'token-usage', range: '7d' },
        schema_version: 1,
      },
    })
    const view = await created.json()

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId(`saved-view-item-${view.id}`).hover()
    await page.getByTestId(`saved-view-open-${view.id}`).click()
    await expect(page).toHaveURL(/compare_panels=token-usage/)
    // The CompareToggle reads aria-pressed from the URL — the overlay
    // should be active after the open path.
    const toggle = page.getByTestId('compare-overlay-toggle-token-usage')
    await expect(toggle).toBeVisible()
    expect(await toggle.getAttribute('aria-pressed')).toBe('true')
  })

  test('Phase 26: saved view with time_from + time_to + compare_panels round-trips fully', async ({
    page,
  }) => {
    const created = await page.request.post(`${BACKEND}/api/views`, {
      data: {
        name: 'Composite Phase 26 view',
        description: '',
        route: '/',
        state_json: {
          time_from: 'now-7d',
          time_to: 'now',
          compare_panels: 'token-usage',
          range: '7d',
        },
        schema_version: 1,
      },
    })
    const view = await created.json()

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId(`saved-view-item-${view.id}`).hover()
    await page.getByTestId(`saved-view-open-${view.id}`).click()
    await expect(page).toHaveURL(/time_from=now-7d/)
    await expect(page).toHaveURL(/time_to=now/)
    await expect(page).toHaveURL(/compare_panels=token-usage/)
  })

  // ── ROADMAP criterion 5 frontend surface: 50-view cap warning
  test('UI surfaces an error when the 50-view-per-route cap is reached', async ({
    page,
  }) => {
    // Seed 50 views on /cost via the API.
    for (let i = 0; i < 50; i++) {
      const r = await page.request.post(`${BACKEND}/api/views`, {
        data: {
          name: `v${i}`,
          description: '',
          route: '/cost',
          state_json: { i },
          schema_version: 1,
        },
      })
      expect(r.status()).toBe(201)
    }

    await page.goto('/cost')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)

    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId('saved-view-menu-save-new').click()
    await page.getByTestId('save-view-dialog-name-input').fill('v50-attempted')
    await page.getByTestId('save-view-dialog-submit').click()

    // Backend returns 400 with `saved view cap reached for route '/cost' (max 50)`.
    // createMutation.error renders inside SaveViewDialog as
    // `<p class="cmc-field__error" role="alert">`.
    const error = page.locator(
      '[data-testid="save-view-dialog"] .cmc-field__error',
    )
    await expect(error).toBeVisible()
    await expect(error).toContainText(/cap/i)
  })
})
