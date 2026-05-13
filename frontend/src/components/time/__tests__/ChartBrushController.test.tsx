// ChartBrushController + ResetZoomButton — Phase 26 Plan 05 (TIME-05) tests.
//
// Test strategy:
//   - vi.mock('@tanstack/react-router') so we can intercept useNavigate +
//     useRouterState without standing up a full MemoryRouter (the brush
//     hook is pure-effect on those two — no router actually mounts).
//   - For useChartBrush: render a tiny harness that calls the hook and
//     exposes the returned onDragEnd via a ref, then call it directly.
//   - For ResetZoomButton: render the button; vary mocked location.search
//     to flip between zoomed / unzoomed / relative-window states.
//
// Covered specs (≥7):
//   1. useChartBrush returns an onDragEnd function
//   2. onDragEnd({startIndex:2,endIndex:5}) → navigate with absolute ISO time_from/time_to
//   3. onDragEnd with reversed indices (5,2) still writes lo→hi (Math.min/max correct)
//   4. onDragEnd with missing payload is a no-op
//   5. onDragEnd with invalid (non-number) indices is a no-op
//   6. ResetZoomButton renders nothing when URL has no time_from
//   7. ResetZoomButton renders the button when URL has absolute ISO time_from; clicking it navigates with undefined values
//   8. ResetZoomButton renders nothing when time_from is RELATIVE (Grafana token, not zoomed)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '../../../test/utils'
import { useRef, useEffect } from 'react'

// Hoisted state shared with the vi.mock factory. vi.hoisted is mandatory
// because vi.mock factories run before module-level const declarations.
const routerMockState = vi.hoisted(() => {
  return {
    navigate: vi.fn(),
    pathname: '/activity',
    search: {} as Record<string, unknown>,
  }
})

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => routerMockState.navigate,
  useRouterState: ({ select }: { select: (s: { location: { pathname: string; search: Record<string, unknown> } }) => unknown }) =>
    select({
      location: {
        pathname: routerMockState.pathname,
        search: routerMockState.search,
      },
    }),
}))

// Import AFTER vi.mock so the hook resolves against the mocked module.
import { useChartBrush, type BrushDragPayload } from '../ChartBrushController'
import { ResetZoomButton } from '../../ui/ResetZoomButton'

interface DayRow {
  day: string
}

function HookHarness({
  data,
  onReady,
}: {
  data: DayRow[]
  onReady: (handler: (p: BrushDragPayload | undefined) => void) => void
}) {
  const { onDragEnd } = useChartBrush({ data })
  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onReadyRef.current(onDragEnd)
  }, [onDragEnd])
  return null
}

function callHook(data: DayRow[]): (p: BrushDragPayload | undefined) => void {
  let captured!: (p: BrushDragPayload | undefined) => void
  render(<HookHarness data={data} onReady={(h) => { captured = h }} />)
  return captured
}

beforeEach(() => {
  routerMockState.navigate.mockReset()
  routerMockState.pathname = '/activity'
  routerMockState.search = {}
})

describe('useChartBrush', () => {
  it('returns an onDragEnd function', () => {
    const handler = callHook([{ day: '2026-05-01' }, { day: '2026-05-02' }])
    expect(typeof handler).toBe('function')
  })

  it('onDragEnd({startIndex:2,endIndex:5}) navigates with absolute ISO time_from/time_to', () => {
    const data: DayRow[] = [
      { day: '2026-05-01' },
      { day: '2026-05-02' },
      { day: '2026-05-03' },
      { day: '2026-05-04' },
      { day: '2026-05-05' },
      { day: '2026-05-06' },
    ]
    const handler = callHook(data)
    handler({ startIndex: 2, endIndex: 5 })

    expect(routerMockState.navigate).toHaveBeenCalledTimes(1)
    const arg = routerMockState.navigate.mock.calls[0][0] as {
      to: string
      search: (prev: Record<string, unknown>) => Record<string, unknown>
      replace: boolean
    }
    expect(arg.to).toBe('/activity')
    expect(arg.replace).toBe(false)
    // Apply the search function-form against an empty prev to inspect the merge.
    const merged = arg.search({ foo: 'preserved' })
    expect(merged).toEqual({
      foo: 'preserved',
      time_from: '2026-05-03T00:00:00.000Z',
      time_to: '2026-05-06T23:59:59.999Z',
    })
  })

  it('onDragEnd with reversed indices (5,2) still writes lo→hi', () => {
    const data: DayRow[] = [
      { day: '2026-05-01' },
      { day: '2026-05-02' },
      { day: '2026-05-03' },
      { day: '2026-05-04' },
      { day: '2026-05-05' },
      { day: '2026-05-06' },
    ]
    const handler = callHook(data)
    handler({ startIndex: 5, endIndex: 2 })

    expect(routerMockState.navigate).toHaveBeenCalledTimes(1)
    const arg = routerMockState.navigate.mock.calls[0][0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }
    const merged = arg.search({})
    expect(merged.time_from).toBe('2026-05-03T00:00:00.000Z')
    expect(merged.time_to).toBe('2026-05-06T23:59:59.999Z')
  })

  it('onDragEnd with undefined payload is a no-op', () => {
    const handler = callHook([{ day: '2026-05-01' }, { day: '2026-05-02' }])
    handler(undefined)
    expect(routerMockState.navigate).not.toHaveBeenCalled()
  })

  it('onDragEnd with non-number indices is a no-op', () => {
    const handler = callHook([{ day: '2026-05-01' }, { day: '2026-05-02' }])
    // Recharts can emit { startIndex: undefined, endIndex: undefined } during edge interactions.
    handler({ startIndex: undefined, endIndex: undefined })
    expect(routerMockState.navigate).not.toHaveBeenCalled()
  })

  it('onDragEnd preserves full-ISO day values (passes through, no coercion)', () => {
    // If data.day is already an ISO timestamp with T, the hook MUST NOT
    // re-suffix it. This guards round-trips when callers feed already-ISO data.
    const data: DayRow[] = [
      { day: '2026-05-01T10:00:00.000Z' },
      { day: '2026-05-02T15:00:00.000Z' },
    ]
    const handler = callHook(data)
    handler({ startIndex: 0, endIndex: 1 })
    const arg = routerMockState.navigate.mock.calls[0][0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }
    const merged = arg.search({})
    expect(merged.time_from).toBe('2026-05-01T10:00:00.000Z')
    expect(merged.time_to).toBe('2026-05-02T15:00:00.000Z')
  })
})

describe('ResetZoomButton', () => {
  it('renders nothing when URL has no time_from', () => {
    routerMockState.search = {}
    const { container } = render(<ResetZoomButton />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('reset-zoom-button')).toBeNull()
  })

  it('renders nothing when time_from is a Grafana relative token (not absolute)', () => {
    routerMockState.search = { time_from: 'now-7d', time_to: 'now' }
    const { container } = render(<ResetZoomButton />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the button when URL has absolute ISO time_from; click clears time_from/time_to', () => {
    routerMockState.search = {
      time_from: '2026-05-03T00:00:00.000Z',
      time_to: '2026-05-06T23:59:59.999Z',
    }
    render(<ResetZoomButton />)
    const btn = screen.getByTestId('reset-zoom-button')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-label', 'Reset zoom')
    fireEvent.click(btn)
    expect(routerMockState.navigate).toHaveBeenCalledTimes(1)
    const arg = routerMockState.navigate.mock.calls[0][0] as {
      to: string
      search: (prev: Record<string, unknown>) => Record<string, unknown>
      replace: boolean
    }
    expect(arg.to).toBe('/activity')
    const merged = arg.search({
      time_from: '2026-05-03T00:00:00.000Z',
      time_to: '2026-05-06T23:59:59.999Z',
      keep_me: 'survives',
    })
    expect(merged.time_from).toBeUndefined()
    expect(merged.time_to).toBeUndefined()
    expect(merged.keep_me).toBe('survives')
  })
})
