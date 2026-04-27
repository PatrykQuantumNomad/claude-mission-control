// ScheduleComposer — TPNL-04 (Phase 7 Plan 04 / Wave 4).
//
// Strategy mirrors TaskComposer: render the Sheet directly with open=true and
// assert against form fields via screen queries (Sheet portals into
// document.body, queries resolve through the portal).
//
// Pitfall 6 lock: distinct localStorage namespace 'cmc.composer.schedule.draft'
// (separate from TaskComposer's 'cmc.composer.task.draft').
// Pitfall 3 lock: cron preview shows "Keep typing…" while user is mid-edit
// in the advanced cron textarea, only flips to inline error message after blur.
// V11 lock: NL-cron 503 surfaces body literal verbatim ("natural-language
// schedules unavailable") regardless of the underlying failure mode.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { ScheduleComposer } from '../ScheduleComposer'
import { storage } from '../../../lib/storage'

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

const DRAFT_KEY = 'composer.schedule.draft'

describe('ScheduleComposer', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // Default fetch mock — overridden in mutation tests.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('open=true renders form with name, time picker, day chips (7), advanced cron textarea', async () => {
    const client = makeClient()
    render(
      <Wrap client={client}>
        <ScheduleComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    expect(screen.getByLabelText(/^Name/i)).toBeInTheDocument()
    // time picker
    const time = screen.getByLabelText(/^Time/i) as HTMLInputElement
    expect(time).toBeInTheDocument()
    expect(time.type).toBe('time')
    // 7 day chips
    const chips = screen.getAllByRole('button', { name: /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/i })
    expect(chips.length).toBe(7)
    // advanced cron textarea
    expect(screen.getByLabelText(/Advanced cron/i)).toBeInTheDocument()
  })

  it('initial cron preview reflects defaults (Mon-Fri 09:00 → cronstrue text)', async () => {
    const client = makeClient()
    render(
      <Wrap client={client}>
        <ScheduleComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    // Default days [1,2,3,4,5] at 09:00 -> cron "0 9 * * 1,2,3,4,5"
    // cronstrue renders this as "At 09:00, only on Monday, Tuesday, Wednesday, Thursday, and Friday"
    await waitFor(() => {
      expect(screen.getByText(/At 09:00/i)).toBeInTheDocument()
    })
    expect(
      screen.getByText(/Monday, Tuesday, Wednesday, Thursday, and Friday/i),
    ).toBeInTheDocument()
  })

  it('toggling Tuesday off updates the preview text (no longer mentions Tuesday)', async () => {
    const client = makeClient()
    render(
      <Wrap client={client}>
        <ScheduleComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    const user = userEvent.setup()
    // Default preview includes Tuesday.
    await waitFor(() => {
      expect(screen.getByText(/Monday, Tuesday/i)).toBeInTheDocument()
    })
    const tueChip = screen.getByRole('button', { name: /^Tue$/i })
    await user.click(tueChip)
    await waitFor(() => {
      expect(
        screen.getByText(/Monday, Wednesday, Thursday, and Friday/i),
      ).toBeInTheDocument()
    })
  })

  it('typing in advanced cron textarea overrides chips (preview reflects the manual cron)', async () => {
    const client = makeClient()
    render(
      <Wrap client={client}>
        <ScheduleComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    const user = userEvent.setup()
    const ta = screen.getByLabelText(/Advanced cron/i) as HTMLTextAreaElement
    await user.clear(ta)
    await user.type(ta, '*/15 * * * *')
    // Preview becomes "Every 15 minutes" (cronstrue output).
    await waitFor(() => {
      expect(screen.getByText(/Every 15 minutes/i)).toBeInTheDocument()
    })
  })

  it('mid-typing invalid cron in advanced (no blur yet) → preview shows "Keep typing…"', async () => {
    const client = makeClient()
    render(
      <Wrap client={client}>
        <ScheduleComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    const user = userEvent.setup()
    const ta = screen.getByLabelText(/Advanced cron/i) as HTMLTextAreaElement
    await user.clear(ta)
    await user.type(ta, 'garbage')
    // Stayed focused — Pitfall 3 keep-typing fallback.
    await waitFor(() => {
      expect(screen.getByText(/Keep typing/i)).toBeInTheDocument()
    })
  })

  it('blurring an invalid advanced cron → preview shows the inline error', async () => {
    const client = makeClient()
    render(
      <Wrap client={client}>
        <ScheduleComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    const user = userEvent.setup()
    const ta = screen.getByLabelText(/Advanced cron/i) as HTMLTextAreaElement
    await user.clear(ta)
    await user.type(ta, 'garbage')
    // Blur to trigger the error transition.
    ta.blur()
    await waitFor(() => {
      expect(screen.queryByText(/Keep typing/i)).toBeNull()
    })
    // Some message related to invalid cron is now rendered.
    expect(screen.getByTestId('cmc-cron-preview-error')).toBeInTheDocument()
  })

  it('NL-cron Parse calls useParseNlCron; on success fills the advanced cron field', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && url === '/api/schedules/parse-nl') {
          return new Response(
            JSON.stringify({ cron: '0 9 * * 1-5', description: 'every weekday at 9am' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    render(
      <Wrap client={makeClient()}>
        <ScheduleComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    const user = userEvent.setup()
    const nlInput = screen.getByPlaceholderText(/every weekday at 9am/i)
    await user.type(nlInput, 'every weekday at 9am')
    await user.click(screen.getByRole('button', { name: /^Parse$/i }))
    // Advanced cron textarea now contains the parsed cron.
    await waitFor(() => {
      const ta = screen.getByLabelText(/Advanced cron/i) as HTMLTextAreaElement
      expect(ta.value).toBe('0 9 * * 1-5')
    })
  })

  it('NL-cron 503 surfaces body literal "natural-language schedules unavailable" verbatim (V11)', async () => {
    const client = makeClient()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && url === '/api/schedules/parse-nl') {
          return new Response('natural-language schedules unavailable', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          })
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    render(
      <Wrap client={client}>
        <ScheduleComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    const user = userEvent.setup()
    const nlInput = screen.getByPlaceholderText(/every weekday at 9am/i)
    await user.type(nlInput, 'every weekday at 9am')
    await user.click(screen.getByRole('button', { name: /^Parse$/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/natural-language schedules unavailable/i),
      ).toBeInTheDocument()
    })
  })

  it('Submit with valid form fires useCreateSchedule with the typed body shape', async () => {
    const client = makeClient()
    let createdBody: unknown = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && url === '/api/schedules') {
          createdBody = init?.body ? JSON.parse(String(init.body)) : null
          return new Response(
            JSON.stringify({
              id: 99,
              name: 'smoke',
              cron: '0 9 * * 1,2,3,4,5',
              enabled: true,
              next_run_at: null,
              last_run_at: null,
              task_template: {},
              skill: null,
              created_at: '2026-04-27T00:00:00Z',
              updated_at: '2026-04-27T00:00:00Z',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    const onOpenChange = vi.fn()
    render(
      <Wrap client={client}>
        <ScheduleComposer open={true} onOpenChange={onOpenChange} />
      </Wrap>,
    )
    const user = userEvent.setup()
    const nameInput = screen.getByLabelText(/^Name/i)
    const titleInput = screen.getByLabelText(/Task title/i)
    await user.type(nameInput, 'smoke')
    await user.type(titleInput, 'recurring')
    await user.click(screen.getByRole('button', { name: /Create schedule/i }))
    await waitFor(() => {
      expect((createdBody as { name: string })?.name).toBe('smoke')
    })
    expect((createdBody as { cron: string })?.cron).toBe('0 9 * * 1,2,3,4,5')
    expect((createdBody as { enabled: boolean })?.enabled).toBe(true)
    expect((createdBody as { task_template: { title: string } })?.task_template?.title).toBe(
      'recurring',
    )
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(storage.get(DRAFT_KEY)).toBeNull()
  })

  it('Submit on 409 (duplicate name) renders inline error AND form is NOT cleared', async () => {
    const client = makeClient()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && url === '/api/schedules') {
          return new Response(
            JSON.stringify({ error: 'name already exists' }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    render(
      <Wrap client={client}>
        <ScheduleComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    const user = userEvent.setup()
    const nameInput = screen.getByLabelText(/^Name/i) as HTMLInputElement
    const titleInput = screen.getByLabelText(/Task title/i) as HTMLInputElement
    await user.type(nameInput, 'duplicate')
    await user.type(titleInput, 'recurring')
    await user.click(screen.getByRole('button', { name: /Create schedule/i }))
    // Inline error appears (ApiError.message contains the body literal).
    await waitFor(() => {
      expect(screen.getByText(/name already exists/i)).toBeInTheDocument()
    })
    // Form preserved (Pitfall 2-style preserve-on-error).
    expect(nameInput.value).toBe('duplicate')
    expect(titleInput.value).toBe('recurring')
  })
})
