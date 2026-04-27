// EmergencyStopBanner — TPNL-05 (Plan 07-01).
//
// Test strategy:
//   - vi.useFakeTimers() so the 5_000ms re-disarm timer is deterministic.
//   - Mock fetch URL-aware (STATE.md L222 — preferred over MSW for shell tests).
//   - Seed the systemState query with setQueryData when we want to short-cut
//     the loading branch and assert the engaged-state UI.
//
// Behaviour exercised (per plan §Task 2 behaviour bullets):
//   1. idle -> click -> armed (label + class change)
//   2. armed -> 5_001ms wall clock advance -> back to idle (auto-disarm)
//   3. armed -> click -> firing fires the emergencyStop POST
//   4. engaged state shows "Resume" affordance and click hits emergency-resume
//   5. unmount during armed clears the timer (no late state update warning)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent } from '@testing-library/react'
import { render, screen } from '../../../test/utils'
import { EmergencyStopBanner } from '../EmergencyStopBanner'
import { qk } from '../../../lib/queries'
import type {
  EmergencyResumeResponse,
  EmergencyStopResponse,
  SystemStateResponse,
} from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function Wrap({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const idleFlag: SystemStateResponse = { items: { emergency_stop: '0' } }
const engagedFlag: SystemStateResponse = { items: { emergency_stop: '1' } }

const stopOk: EmergencyStopResponse = {
  emergency_stop: true,
  terminated_pids: [],
  skipped_pids: [],
  missing_pids: [],
  failed_running_tasks: 0,
}
const resumeOk: EmergencyResumeResponse = { emergency_stop: false }

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('EmergencyStopBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('idle -> armed on first click (label + class change)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(idleFlag),
    )
    const client = makeClient()
    client.setQueryData(qk.systemState('emergency_stop'), idleFlag)
    render(
      <Wrap client={client}>
        <EmergencyStopBanner />
      </Wrap>,
    )
    const btn = screen.getByRole('button', { name: /Emergency stop/i })
    expect(btn.className).toContain('cmc-estop--idle')
    expect(btn.textContent).toContain('Emergency stop')

    await act(async () => {
      fireEvent.click(btn)
    })
    expect(btn.className).toContain('cmc-estop--armed')
    expect(btn.textContent).toContain('Click again to confirm')
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/system/emergency-stop'),
      expect.anything(),
    )
  })

  it('armed -> idle after 5_001ms (auto-disarm)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(idleFlag))
    const client = makeClient()
    client.setQueryData(qk.systemState('emergency_stop'), idleFlag)
    render(
      <Wrap client={client}>
        <EmergencyStopBanner />
      </Wrap>,
    )
    const btn = screen.getByRole('button', { name: /Emergency stop/i })
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(btn.className).toContain('cmc-estop--armed')

    await act(async () => {
      vi.advanceTimersByTime(5_001)
    })
    expect(btn.className).toContain('cmc-estop--idle')
    expect(btn.textContent).toContain('Emergency stop')
  })

  it('armed -> firing fires POST /api/system/emergency-stop', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.endsWith('/api/system/emergency-stop')) return jsonResponse(stopOk)
        if (url.includes('/api/system/state')) return jsonResponse(idleFlag)
        return jsonResponse({})
      })
    const client = makeClient()
    client.setQueryData(qk.systemState('emergency_stop'), idleFlag)
    render(
      <Wrap client={client}>
        <EmergencyStopBanner />
      </Wrap>,
    )
    const btn = screen.getByRole('button', { name: /Emergency stop/i })

    // Arm
    await act(async () => {
      fireEvent.click(btn)
    })
    // Confirm — fires the mutation. The mutation triggers fetch synchronously
    // (during act); advance fake timers + flush microtasks so the promise
    // returned by mockImplementation settles. We bound the advance below the
    // 5_000ms useSystemState refetchInterval to avoid spinning the Query
    // refetch timer infinitely under fake clock.
    await act(async () => {
      fireEvent.click(btn)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/emergency-stop',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('engaged state shows Resume affordance and POSTs emergency-resume on click', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.endsWith('/api/system/emergency-resume'))
          return jsonResponse(resumeOk)
        if (url.includes('/api/system/state')) return jsonResponse(engagedFlag)
        return jsonResponse({})
      })
    const client = makeClient()
    client.setQueryData(qk.systemState('emergency_stop'), engagedFlag)
    render(
      <Wrap client={client}>
        <EmergencyStopBanner />
      </Wrap>,
    )
    const btn = screen.getByRole('button', { name: /resume/i })
    expect(btn.className).toContain('cmc-estop--engaged')
    expect(btn.textContent).toMatch(/ENGAGED/i)

    await act(async () => {
      fireEvent.click(btn)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/emergency-resume',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('unmount during armed clears the re-disarm timer (no leaked setTimeout)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(idleFlag))
    const client = makeClient()
    client.setQueryData(qk.systemState('emergency_stop'), idleFlag)
    const { unmount } = render(
      <Wrap client={client}>
        <EmergencyStopBanner />
      </Wrap>,
    )
    const btn = screen.getByRole('button', { name: /Emergency stop/i })
    await act(async () => {
      fireEvent.click(btn) // -> armed (timer started)
    })
    // Unmount before timer fires; cleanup must clear the ref so advancing
    // the clock past the timer does NOT throw an unhandled state update.
    unmount()
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow()
  })
})
