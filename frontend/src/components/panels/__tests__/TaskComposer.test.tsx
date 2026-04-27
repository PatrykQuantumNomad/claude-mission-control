// TaskComposer — TPNL-02 (Phase 7 Plan 03 / Wave 2).
//
// Strategy: TaskComposer is a Sheet (Radix Dialog portal) with a bespoke form
// that drafts to localStorage under 'cmc.composer.task.draft'. Tests render
// the Sheet directly with open=true (rather than going through the
// CommandPalette wiring — that's exercised by the integration test). Sheet
// portals to document.body so assertions look up form fields via screen
// queries — they resolve through the portal.
//
// Pitfall 6 lock: distinct localStorage namespace 'cmc.composer.task.draft'
// (the storage helper auto-prefixes 'cmc.', so the key passed in is
// 'composer.task.draft' which becomes 'cmc.composer.task.draft' on disk).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { TaskComposer } from '../TaskComposer'
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

const DRAFT_KEY = 'composer.task.draft'

describe('TaskComposer', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('renders form with title, description, and execution_mode select with all 3 options when open=true', async () => {
    const client = makeClient()
    render(
      <Wrap client={client}>
        <TaskComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    // Title input is present
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    // execution_mode select with 3 options (interactive default + classic + stream — RESEARCH §Open Q4)
    const modeSelect = screen.getByLabelText(/execution mode/i) as HTMLSelectElement
    expect(modeSelect).toBeInTheDocument()
    const optionValues = Array.from(modeSelect.options).map((o) => o.value)
    expect(optionValues).toEqual(expect.arrayContaining(['interactive', 'classic', 'stream']))
    expect(optionValues.length).toBe(3)
  })

  it('typing in title persists draft to lib/storage under cmc.composer.task.draft', async () => {
    const client = makeClient()
    render(
      <Wrap client={client}>
        <TaskComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    const user = userEvent.setup()
    const title = screen.getByLabelText(/title/i)
    await user.type(title, 'Refactor settings page')
    await waitFor(() => {
      const draft = storage.get<{ title: string }>(DRAFT_KEY)
      expect(draft?.title).toBe('Refactor settings page')
    })
  })

  it('Submit calls POST /api/tasks with the typed body and clears draft + closes Sheet on success', async () => {
    const client = makeClient()
    let createdBody: unknown = null
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && url === '/api/tasks') {
          createdBody = init?.body ? JSON.parse(String(init.body)) : null
          return new Response(JSON.stringify({ id: 42, title: 'created' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    let openState = true
    const onOpenChange = vi.fn((next: boolean) => {
      openState = next
    })
    const { rerender } = render(
      <Wrap client={client}>
        <TaskComposer open={openState} onOpenChange={onOpenChange} />
      </Wrap>,
    )
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/title/i), 'fix it')
    await user.click(screen.getByRole('button', { name: /Create task/i }))
    await waitFor(() => {
      const tasksCall = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'POST' && String(init.body ?? '').includes('fix it'),
      )
      expect(tasksCall).toBeTruthy()
    })
    expect((createdBody as { title: string })?.title).toBe('fix it')
    // onOpenChange invoked with false on success
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    // Draft cleared
    rerender(
      <Wrap client={client}>
        <TaskComposer open={false} onOpenChange={onOpenChange} />
      </Wrap>,
    )
    expect(storage.get(DRAFT_KEY)).toBeNull()
  })

  it('on 422 the inline error appears AND the form is NOT cleared (user keeps editing)', async () => {
    const client = makeClient()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'POST' && url === '/api/tasks') {
          return new Response(JSON.stringify({ error: 'validation failed' }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
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
        <TaskComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    const user = userEvent.setup()
    const title = screen.getByLabelText(/title/i) as HTMLInputElement
    await user.type(title, 'broken request')
    await user.click(screen.getByRole('button', { name: /Create task/i }))
    await waitFor(() => {
      expect(screen.getByText(/validation failed/i)).toBeInTheDocument()
    })
    // Form value preserved
    expect(title.value).toBe('broken request')
  })

  it('Cancel button calls onOpenChange(false)', async () => {
    const client = makeClient()
    const onOpenChange = vi.fn()
    render(
      <Wrap client={client}>
        <TaskComposer open={true} onOpenChange={onOpenChange} />
      </Wrap>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Cancel$/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('opening the Sheet restores existing draft from localStorage', async () => {
    storage.set(DRAFT_KEY, {
      title: 'restored draft title',
      description: 'persisted body',
      priority: 3,
      approval: 'auto',
      dry_run: false,
      execution_mode: 'interactive',
    })
    const client = makeClient()
    render(
      <Wrap client={client}>
        <TaskComposer open={true} onOpenChange={() => {}} />
      </Wrap>,
    )
    await waitFor(() => {
      const title = screen.getByLabelText(/title/i) as HTMLInputElement
      expect(title.value).toBe('restored draft title')
    })
  })
})
