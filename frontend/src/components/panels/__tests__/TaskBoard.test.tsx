// TaskBoard — TPNL-01 (Phase 7 Plan 03 / Wave 2).
//
// Strategy: setQueryData seeds qk.tasks() with mixed-status rows so PanelCard
// resolves synchronously to its data branch and the board can group items
// client-side. AlertDialog from Plan 07-01 is a Radix portal — assertions
// against the dialog use document.body.querySelectorAll because the dialog
// content is portaled outside the test container.
//
// awaiting_approval rows render in an above-board banner, NOT a 4th column —
// this is the explicit Pitfall 11 / Open Q1 lock from RESEARCH.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { TaskBoard } from '../TaskBoard'
import { qk } from '../../../lib/queries'
import type { TaskListItem, TaskListResponse } from '../../../lib/api'

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

function makeTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: 1,
    title: 'task-default',
    description: '',
    status: 'pending',
    priority: 3,
    quadrant: null,
    approval: 'auto',
    risk: null,
    dry_run: false,
    model: null,
    execution_mode: 'interactive',
    skill: null,
    scheduled_for: null,
    schedule_id: null,
    pid: null,
    stdout_path: null,
    error_message: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    started_at: null,
    ended_at: null,
    approved_at: null,
    ...overrides,
  }
}

const mixed: TaskListResponse = {
  items: [
    makeTask({ id: 1, title: 'pending-1', status: 'pending', skill: 'pdf-extract', model: 'sonnet', quadrant: 'do', risk: 'low' }),
    makeTask({ id: 2, title: 'pending-2', status: 'pending' }),
    makeTask({ id: 3, title: 'running-1', status: 'running' }),
    makeTask({ id: 4, title: 'done-1', status: 'done' }),
    makeTask({ id: 5, title: 'failed-1', status: 'failed' }),
    makeTask({ id: 6, title: 'awaiting-1', status: 'awaiting_approval', approval: 'awaiting_approval' }),
    makeTask({ id: 7, title: 'awaiting-2', status: 'awaiting_approval', approval: 'awaiting_approval' }),
  ],
  total: 7,
}

describe('TaskBoard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mixed), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders 3 columns (pending=2, running=1, done=2 incl failed)', async () => {
    const client = makeClient()
    client.setQueryData(qk.tasks(), mixed)
    const { container } = render(
      <Wrap client={client}>
        <TaskBoard />
      </Wrap>,
    )
    expect(screen.getByText('TPNL-01')).toBeInTheDocument()
    expect(screen.getByText('Task Board')).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelector('.cmc-task-board__columns')).not.toBeNull()
    })
    // Column titles include counts
    expect(screen.getByText(/Pending \(2\)/)).toBeInTheDocument()
    expect(screen.getByText(/Running \(1\)/)).toBeInTheDocument()
    // Done column includes done + failed = 2
    expect(screen.getByText(/Done \(2\)/)).toBeInTheDocument()
  })

  it('awaiting_approval rows render in the banner above the columns, NOT inside any column', async () => {
    const client = makeClient()
    client.setQueryData(qk.tasks(), mixed)
    const { container } = render(
      <Wrap client={client}>
        <TaskBoard />
      </Wrap>,
    )
    await waitFor(() => {
      expect(container.querySelector('.cmc-task-board__banner')).not.toBeNull()
    })
    const banner = container.querySelector('.cmc-task-board__banner')!
    // Banner copy mentions "2 tasks awaiting your approval"
    expect(banner.textContent).toMatch(/2 tasks awaiting your approval/i)
    // Both awaiting titles present in banner subtree
    expect(banner.textContent).toContain('awaiting-1')
    expect(banner.textContent).toContain('awaiting-2')
    // Columns subtree does NOT include awaiting titles
    const columns = container.querySelector('.cmc-task-board__columns')!
    expect(columns.textContent).not.toContain('awaiting-1')
    expect(columns.textContent).not.toContain('awaiting-2')
  })

  it('failed row shown in Done column with a "Failed" badge', async () => {
    const client = makeClient()
    client.setQueryData(qk.tasks(), mixed)
    const { container } = render(
      <Wrap client={client}>
        <TaskBoard />
      </Wrap>,
    )
    await waitFor(() => {
      expect(container.querySelector('.cmc-task-board__columns')).not.toBeNull()
    })
    expect(screen.getByText('failed-1')).toBeInTheDocument()
    // The Failed badge is rendered with destructive variant
    const failedBadges = Array.from(container.querySelectorAll('.cmc-badge')).filter(
      (b) => /failed/i.test(b.textContent ?? ''),
    )
    expect(failedBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('Approve button only appears on awaiting_approval rows; Rerun only on failed rows', async () => {
    const client = makeClient()
    client.setQueryData(qk.tasks(), mixed)
    render(
      <Wrap client={client}>
        <TaskBoard />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByText('failed-1')).toBeInTheDocument()
    })
    // 2 awaiting rows -> 2 Approve buttons (banner ApprovalRows)
    const approveBtns = screen.getAllByRole('button', { name: /^Approve$/i })
    expect(approveBtns.length).toBe(2)
    // 1 failed row -> 1 Rerun button
    const rerunBtns = screen.getAllByRole('button', { name: /^Rerun$/i })
    expect(rerunBtns.length).toBe(1)
  })

  it('badges render only when fields are non-null (skill/model/quadrant/risk)', async () => {
    const client = makeClient()
    client.setQueryData(qk.tasks(), mixed)
    const { container } = render(
      <Wrap client={client}>
        <TaskBoard />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByText('pending-1')).toBeInTheDocument()
    })
    // pending-1 has skill/model/quadrant/risk all set — its row contains 4 metadata badges
    const pending1Row = Array.from(container.querySelectorAll('.cmc-task-board__row')).find(
      (li) => /pending-1/.test(li.textContent ?? ''),
    )!
    const pending1Badges = pending1Row.querySelectorAll('.cmc-badge')
    expect(pending1Badges.length).toBeGreaterThanOrEqual(4)
    // pending-2 has all those fields null — its row contains 0 metadata badges
    const pending2Row = Array.from(container.querySelectorAll('.cmc-task-board__row')).find(
      (li) => /pending-2/.test(li.textContent ?? ''),
    )!
    const pending2Badges = pending2Row.querySelectorAll('.cmc-badge')
    expect(pending2Badges.length).toBe(0)
  })

  it('clicking Delete opens an AlertDialog (role=alertdialog appears in document.body)', async () => {
    const client = makeClient()
    client.setQueryData(qk.tasks(), mixed)
    render(
      <Wrap client={client}>
        <TaskBoard />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('pending-1')).toBeInTheDocument())
    // Pre-click: no alertdialog
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
    // Click the first Delete button
    const deleteBtns = screen.getAllByRole('button', { name: /^Delete$/i })
    await user.click(deleteBtns[0])
    await waitFor(() => {
      expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull()
    })
    // Title contains the deleted task title (one of the non-running rows)
    const dialogText = document.body.querySelector('[role="alertdialog"]')!.textContent ?? ''
    expect(dialogText).toMatch(/Delete task/i)
  })

  it('confirming the AlertDialog calls DELETE /api/tasks/<id>', async () => {
    const client = makeClient()
    client.setQueryData(qk.tasks(), mixed)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (method === 'DELETE' && /\/api\/tasks\/\d+$/.test(url)) {
          return new Response(null, { status: 204 })
        }
        return new Response(JSON.stringify(mixed), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )
    render(
      <Wrap client={client}>
        <TaskBoard />
      </Wrap>,
    )
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('pending-1')).toBeInTheDocument())
    // Click Delete on the first eligible row (pending-1, id=1)
    const deleteBtns = screen.getAllByRole('button', { name: /^Delete$/i })
    await user.click(deleteBtns[0])
    await waitFor(() => {
      expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull()
    })
    // Click the Delete confirm button inside the dialog (action button)
    const dialog = document.body.querySelector('[role="alertdialog"]')! as HTMLElement
    const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => /^Delete$/i.test(b.textContent ?? ''),
    )!
    await user.click(confirmBtn)
    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(
        ([, init]) => init?.method === 'DELETE',
      )
      expect(deleteCalls.length).toBeGreaterThanOrEqual(1)
      expect(/\/api\/tasks\/\d+$/.test(String(deleteCalls[0][0]))).toBe(true)
    })
  })
})
