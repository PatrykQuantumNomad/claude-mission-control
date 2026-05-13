// CompareToggle — Phase 26 Plan 07 (TIME-04) tests.
//
// Test strategy mirrors RefreshDropdown.test.tsx + TimePicker.test.tsx:
//   - In-memory TanStack Router so useNavigate + useRouterState resolve.
//   - The route component renders <CompareToggle panelId="..." />; tests
//     query the trigger via its dynamic testid and use userEvent.click to
//     mutate URL state.
//   - We assert by re-reading router.state.location.search rather than
//     spying on navigate — this proves end-to-end URL round-trip through
//     validateSearch (the same code path saved-view fork-save will use).
//
// Behaviours exercised (≥ 6 specs):
//   1. aria-pressed=false when URL has no compare_panels
//   2. aria-pressed=true when URL has ?compare_panels=token-usage and panelId='token-usage'
//   3. Clicking inactive toggle adds panelId to compare_panels
//   4. Clicking active toggle (sole entry) removes compare_panels entirely
//   5. Clicking toggle when CSV already has another panel produces sorted CSV
//   6. Multiple toggles independent — toggling one does not toggle another

import { describe, it, expect } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, userEvent } from '../../../test/utils'
import { CompareToggle } from '../CompareToggle'
import { asComparePanels } from '../../../lib/searchSchemas'

function makeFixture(
  initialSearch: Record<string, unknown> = {},
  panels: string[] = ['token-usage'],
) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        {panels.map((p) => (
          <CompareToggle key={p} panelId={p} />
        ))}
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
    // Apply the same validator shape we extend in routes/index.tsx so the
    // round-trip through router state reflects production behaviour.
    validateSearch: (raw: Record<string, unknown>) => ({
      compare_panels: asComparePanels(raw.compare_panels),
    }),
  })
  const routeTree = rootRoute.addChildren([indexRoute])
  const qs = Object.entries(initialSearch)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  const entry = qs ? `/?${qs}` : '/'
  const history = createMemoryHistory({ initialEntries: [entry] })
  const router = createRouter({ routeTree, history })
  return { router, history }
}

async function renderFixture(fixture: ReturnType<typeof makeFixture>) {
  await fixture.router.load()
  return render(<RouterProvider router={fixture.router} />)
}

describe('CompareToggle', () => {
  it('renders aria-pressed=false when URL has no compare_panels', async () => {
    const fixture = makeFixture({})
    await renderFixture(fixture)
    const btn = await screen.findByTestId('compare-overlay-toggle-token-usage')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('renders aria-pressed=true when URL has ?compare_panels=token-usage', async () => {
    const fixture = makeFixture({ compare_panels: 'token-usage' })
    await renderFixture(fixture)
    const btn = await screen.findByTestId('compare-overlay-toggle-token-usage')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('clicking inactive toggle adds panelId to compare_panels', async () => {
    const user = userEvent.setup()
    const fixture = makeFixture({})
    await renderFixture(fixture)
    const btn = await screen.findByTestId('compare-overlay-toggle-token-usage')
    await user.click(btn)
    const search = fixture.router.state.location.search as Record<
      string,
      unknown
    >
    expect(search.compare_panels).toBe('token-usage')
    // After URL update the toggle re-renders with aria-pressed=true.
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('clicking active toggle (sole entry) removes compare_panels entirely', async () => {
    const user = userEvent.setup()
    const fixture = makeFixture({ compare_panels: 'token-usage' })
    await renderFixture(fixture)
    const btn = await screen.findByTestId('compare-overlay-toggle-token-usage')
    await user.click(btn)
    const search = fixture.router.state.location.search as Record<
      string,
      unknown
    >
    // Serializing an empty set returns `undefined`; the validator drops the
    // key from the parsed search shape.
    expect(search.compare_panels).toBeUndefined()
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking toggle with existing other panel produces sorted CSV', async () => {
    const user = userEvent.setup()
    // The other panel ('session-outcomes') sorts before 'token-usage'.
    const fixture = makeFixture({ compare_panels: 'session-outcomes' })
    await renderFixture(fixture)
    const btn = await screen.findByTestId('compare-overlay-toggle-token-usage')
    await user.click(btn)
    const search = fixture.router.state.location.search as Record<
      string,
      unknown
    >
    expect(search.compare_panels).toBe('session-outcomes,token-usage')
  })

  it('multiple toggles are independent — toggling one does not affect another', async () => {
    const user = userEvent.setup()
    const fixture = makeFixture({}, ['token-usage', 'session-outcomes'])
    await renderFixture(fixture)
    const tokenBtn = await screen.findByTestId(
      'compare-overlay-toggle-token-usage',
    )
    const outcomesBtn = await screen.findByTestId(
      'compare-overlay-toggle-session-outcomes',
    )
    // Initially both off.
    expect(tokenBtn.getAttribute('aria-pressed')).toBe('false')
    expect(outcomesBtn.getAttribute('aria-pressed')).toBe('false')

    await user.click(tokenBtn)
    expect(tokenBtn.getAttribute('aria-pressed')).toBe('true')
    expect(outcomesBtn.getAttribute('aria-pressed')).toBe('false')

    await user.click(outcomesBtn)
    expect(tokenBtn.getAttribute('aria-pressed')).toBe('true')
    expect(outcomesBtn.getAttribute('aria-pressed')).toBe('true')
    const search = fixture.router.state.location.search as Record<
      string,
      unknown
    >
    expect(search.compare_panels).toBe('session-outcomes,token-usage')
  })
})
