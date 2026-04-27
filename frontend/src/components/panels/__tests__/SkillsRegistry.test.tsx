// SkillsRegistry — SKLP-04 (Phase 7 Plan 02 / Wave 1).
//
// Strategy: setQueryData seeds qk.skills() with skill rows; mutation tests
// use a URL-aware fetch mock to drive the optimistic+rollback path. The
// optimistic logic lives in usePatchSkillAutonomy (RESEARCH §Pattern 2);
// this test exercises the *user-observable* contract — onSettled invalidate
// causes the cache to converge on server truth, but onError must restore
// the snapshotted value so the select snaps back.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { SkillsRegistry } from '../SkillsRegistry'
import { qk } from '../../../lib/queries'
import type { SkillListResponse, SkillRow } from '../../../lib/api'

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

function makeSkill(overrides: Partial<SkillRow> = {}): SkillRow {
  return {
    name: 'pdf-extract',
    environment: 'user',
    user_invocable: true,
    autonomy: 'review',
    description: 'Extract text from PDF files',
    path: '/Users/test/.claude/skills/pdf-extract',
    updated_at: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  }
}

const populated: SkillListResponse = {
  items: [
    makeSkill({ name: 'pdf-extract', environment: 'user', autonomy: 'review' }),
    makeSkill({ name: 'image-resize', environment: 'project', autonomy: 'auto' }),
    makeSkill({ name: 'web-search', environment: 'user', autonomy: 'manual' }),
  ],
}

describe('SkillsRegistry', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(populated), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders 3 skills as DataTable rows with name/environment/autonomy columns', async () => {
    const client = makeClient()
    client.setQueryData(qk.skills(), populated)
    const { container } = render(
      <Wrap client={client}>
        <SkillsRegistry />
      </Wrap>,
    )
    expect(screen.getByText('SKLP-04')).toBeInTheDocument()
    expect(screen.getByText('Skills Registry')).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-table tbody tr').length).toBe(3)
    })
    expect(screen.getByText('pdf-extract')).toBeInTheDocument()
    expect(screen.getByText('image-resize')).toBeInTheDocument()
    expect(screen.getByText('web-search')).toBeInTheDocument()
  })

  it('renders empty state when items=[]', async () => {
    const client = makeClient()
    client.setQueryData(qk.skills(), { items: [] } satisfies SkillListResponse)
    render(
      <Wrap client={client}>
        <SkillsRegistry />
      </Wrap>,
    )
    expect(screen.getByText('SKLP-04')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/Nothing to show yet/i)).toBeInTheDocument()
    })
  })

  it('changing the autonomy select dispatches usePatchSkillAutonomy with the typed body', async () => {
    const client = makeClient()
    client.setQueryData(qk.skills(), populated)
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'PATCH' && /\/api\/skills\/[^/]+\/autonomy$/.test(url)) {
          return new Response(
            JSON.stringify({
              name: 'pdf-extract',
              autonomy: 'auto',
              updated_at: new Date().toISOString(),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify(populated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    const { container } = render(
      <Wrap client={client}>
        <SkillsRegistry />
      </Wrap>,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-table tbody tr').length).toBe(3)
    })
    const selects = container.querySelectorAll('select.cmc-skills-registry__autonomy')
    expect(selects.length).toBe(3)
    // Row 0 (pdf-extract) starts at 'review'; change to 'auto'.
    const user = userEvent.setup()
    const firstSelect = selects[0] as HTMLSelectElement
    expect(firstSelect.value).toBe('review')
    await user.selectOptions(firstSelect, 'auto')
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/skills/pdf-extract/autonomy',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ autonomy: 'auto' }),
        }),
      ),
    )
  })

  it('on 422, the autonomy select reverts to the original value (rollback)', async () => {
    const client = makeClient()
    client.setQueryData(qk.skills(), populated)
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'PATCH' && /\/api\/skills\/[^/]+\/autonomy$/.test(url)) {
          return new Response(
            JSON.stringify({ error: 'invalid autonomy value' }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          )
        }
        // Refetch on settle returns the original payload (server truth).
        return new Response(JSON.stringify(populated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    const { container } = render(
      <Wrap client={client}>
        <SkillsRegistry />
      </Wrap>,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('.cmc-table tbody tr').length).toBe(3)
    })
    const user = userEvent.setup()
    const firstSelect = container.querySelectorAll(
      'select.cmc-skills-registry__autonomy',
    )[0] as HTMLSelectElement
    expect(firstSelect.value).toBe('review')
    await user.selectOptions(firstSelect, 'manual')
    // After mutation settles (error path), onError restores the snapshot AND
    // onSettled invalidates → refetch returns the unchanged populated payload.
    await waitFor(() => {
      const select = container.querySelectorAll(
        'select.cmc-skills-registry__autonomy',
      )[0] as HTMLSelectElement
      expect(select.value).toBe('review')
    })
  })
})
