// AppShellHeader — Phase 24 Plan 04 (SHEL-02).
//
// Test strategy:
//   - AppShellHeader mounts EmergencyStopBanner which uses TanStack Query
//     (useSystemState polling). We wrap renders in a fresh QueryClientProvider
//     and stub fetch to a benign idle response — same pattern as
//     EmergencyStopBanner.test.tsx and the deleted NavBar.test.tsx.
//   - The right-side action area is asserted by inspecting the children of
//     `.cmc-app-shell-header__right` in DOM order (matches the order the
//     plan's contract pins).
//   - Hidden placeholders (Phases 25/26 testid pre-registration) are
//     present but `style.display === 'none'`.
//
// Behaviour exercised:
//   1. EmergencyStopBanner is in the LEFT region; not in the right region.
//   2. Right region children, in order: time-picker-trigger,
//      save-view-button, cmdk-trigger, density-toggle-trigger, theme-toggle.
//   3. time-picker-trigger and save-view-button have inline display:none and
//      are disabled — they are pre-registered testids only.
//   4. DensityToggle integrates cleanly: clicking density-toggle-trigger
//      opens the menu and the three density options are queryable.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, userEvent } from '../../../test/utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShellHeader } from '../AppShellHeader'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
    },
  })
}

function renderHeader() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <AppShellHeader />
    </QueryClientProvider>,
  )
}

describe('AppShellHeader', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.density
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: { emergency_stop: '0' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    delete document.documentElement.dataset.density
  })

  it('mounts EmergencyStopBanner in the left region', () => {
    const { container } = renderHeader()
    const left = container.querySelector('.cmc-app-shell-header__left')
    expect(left).not.toBeNull()
    // EmergencyStopBanner renders a button matching /Emergency stop/i.
    expect(left!.querySelector('button.cmc-estop')).not.toBeNull()
  })

  it('renders right-side action items in locked order', () => {
    const { container } = renderHeader()
    const right = container.querySelector('.cmc-app-shell-header__right')
    expect(right).not.toBeNull()
    const children = Array.from(right!.children) as HTMLElement[]
    // Locked order: time-picker, save-view, cmdk-trigger, density-toggle, theme-toggle.
    const testids = children.map((el) => el.getAttribute('data-testid'))
    expect(testids).toEqual([
      'time-picker-trigger',
      'save-view-button',
      'cmdk-trigger',
      'density-toggle-trigger',
      'theme-toggle',
    ])
  })

  it('hides Phase 25/26 placeholders (testids pre-registered, display:none)', () => {
    renderHeader()
    const timePicker = screen.getByTestId('time-picker-trigger') as HTMLButtonElement
    expect(timePicker.style.display).toBe('none')
    expect(timePicker.disabled).toBe(true)
    expect(timePicker.getAttribute('aria-label')).toMatch(/Phase 26/i)

    const saveView = screen.getByTestId('save-view-button') as HTMLButtonElement
    expect(saveView.style.display).toBe('none')
    expect(saveView.disabled).toBe(true)
    expect(saveView.getAttribute('aria-label')).toMatch(/Phase 25/i)
  })

  it('integrates DensityToggle (clicking the trigger opens the menu)', async () => {
    renderHeader()
    const user = userEvent.setup()
    const trigger = await screen.findByTestId('density-toggle-trigger')
    await user.click(trigger)
    // DropdownMenu items live in a Radix Portal; query by their testids.
    expect(await screen.findByTestId('density-option-compact')).toBeInTheDocument()
    expect(await screen.findByTestId('density-option-comfortable')).toBeInTheDocument()
    expect(await screen.findByTestId('density-option-cozy')).toBeInTheDocument()
  })
})
