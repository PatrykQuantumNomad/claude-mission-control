// TimePicker — Phase 26 Plan 03 (TIME-01, TIME-03) tests.
//
// Test strategy:
//   - In-memory TanStack Router so useNavigate + useRouterState resolve.
//   - sonner is mocked via vi.mock so toast.* call inspection is trivial
//     (Pitfall 11 — sonner does NOT expose a test harness; mocking is the
//     accepted pattern). The mock keeps `Toaster` as a no-op component.
//   - Radix Popover.Portal mounts to document.body; tests query via screen
//     (which scans document.body by default in RTL).
//   - navigator.clipboard.{readText,writeText} are stubbed per-test so the
//     happy/error paths are deterministic.
//
// Behaviour exercised (7 specs):
//   1. Trigger renders with default "Last 7 days" label when URL is empty.
//   2. Clicking trigger opens the Popover (PresetList appears in document).
//   3. Clicking the "Last 7 days" preset navigates with time_from/time_to.
//   4. Cmd+Shift+C with current time_from/time_to fires toast.success +
//      writes the serialized range to the clipboard.
//   5. Cmd+Shift+C with NO URL params fires toast.error.
//   6. Cmd+Shift+V with a valid clipboard payload navigates + fires
//      toast.message.
//   7. Cmd+Shift+V with an unparseable clipboard payload fires toast.error.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, userEvent } from '../../../test/utils'
import { TimePicker } from '../TimePicker'

// ─────────────────────────────────────────────────────────────────────
// sonner mock — exposes vi.fn() spies on toast.success / error / message.
// `Toaster` is a no-op so AppShell tests that mount it stay stable.
// ─────────────────────────────────────────────────────────────────────
vi.mock('sonner', () => {
  const toast = {
    success: vi.fn((_msg?: unknown) => undefined),
    error: vi.fn((_msg?: unknown) => undefined),
    message: vi.fn((_msg?: unknown) => undefined),
  }
  return {
    toast,
    Toaster: () => null,
  }
})

// Re-import after the mock so the test scope shares the same vi.fn() refs.
import { toast } from 'sonner'

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function makeFixture(initialSearch: Record<string, unknown> = {}) {
  const rootRoute = createRootRoute({
    component: () => <TimePicker />,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
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

function fireMetaShift(key: 'c' | 'v') {
  const evt = new KeyboardEvent('keydown', {
    key,
    metaKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  })
  window.dispatchEvent(evt)
}

// ─────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────

describe('TimePicker', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.message).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders trigger with default "Last 7 days" label when URL has no time params', async () => {
    const fixture = makeFixture({})
    await renderFixture(fixture)
    const trigger = await screen.findByTestId('time-picker-trigger')
    expect(trigger).toBeTruthy()
    expect(trigger.textContent).toContain('Last 7 days')
  })

  it('clicking trigger opens the Popover (Portal-mounted in document.body)', async () => {
    const user = userEvent.setup()
    const fixture = makeFixture({})
    await renderFixture(fixture)
    const trigger = await screen.findByTestId('time-picker-trigger')
    await user.click(trigger)
    // Portal mounts under document.body; screen queries it by default.
    const popover = await screen.findByTestId('time-picker-popover')
    expect(popover).toBeTruthy()
  })

  it('clicking the "Last 7 days" preset writes time_from=now-7d&time_to=now to URL', async () => {
    const user = userEvent.setup()
    const fixture = makeFixture({})
    await renderFixture(fixture)
    const trigger = await screen.findByTestId('time-picker-trigger')
    await user.click(trigger)
    const preset = await screen.findByTestId('time-picker-preset-last-7-days')
    await user.click(preset)
    // navigate replace:false means history.location.search reflects the
    // applied params.
    await vi.waitFor(() => {
      expect(fixture.history.location.search).toContain('time_from=now-7d')
      expect(fixture.history.location.search).toContain('time_to=now')
    })
  })

  it('Cmd+Shift+C with current time range fires toast.success and writes clipboard', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, readText: () => Promise.resolve('') },
      configurable: true,
    })
    const fixture = makeFixture({ time_from: 'now-7d', time_to: 'now' })
    await renderFixture(fixture)
    await screen.findByTestId('time-picker-trigger')
    fireMetaShift('c')
    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Time range copied')
    })
    expect(writeText).toHaveBeenCalled()
    expect(writeText.mock.calls.length).toBeGreaterThan(0)
    const written = writeText.mock.calls[0][0]
    expect(written).toContain('time_from=now-7d')
    expect(written).toContain('time_to=now')
  })

  it('Cmd+Shift+C with no URL time params fires toast.error("No time range to copy")', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(), readText: () => Promise.resolve('') },
      configurable: true,
    })
    const fixture = makeFixture({})
    await renderFixture(fixture)
    await screen.findByTestId('time-picker-trigger')
    fireMetaShift('c')
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No time range to copy')
    })
  })

  it('Cmd+Shift+V with valid clipboard payload navigates and fires toast.message', async () => {
    const readText = vi.fn(() => Promise.resolve('?time_from=now-7d&time_to=now'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(), readText },
      configurable: true,
    })
    const fixture = makeFixture({})
    await renderFixture(fixture)
    await screen.findByTestId('time-picker-trigger')
    fireMetaShift('v')
    await vi.waitFor(() => {
      expect(toast.message).toHaveBeenCalled()
    })
    const calls = vi.mocked(toast.message).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const msg = String(calls[0][0] ?? '')
    expect(msg).toContain('Pasted: last 7 days')
    expect(fixture.history.location.search).toContain('time_from=now-7d')
  })

  it('Cmd+Shift+V with invalid clipboard payload fires toast.error("No time range on clipboard")', async () => {
    const readText = vi.fn(() => Promise.resolve('hello world'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(), readText },
      configurable: true,
    })
    const fixture = makeFixture({})
    await renderFixture(fixture)
    await screen.findByTestId('time-picker-trigger')
    fireMetaShift('v')
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No time range on clipboard')
    })
  })
})
