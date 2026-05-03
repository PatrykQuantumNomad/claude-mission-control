// SkillTimeline — SKLP-06 (NEW, Phase 14 Plan 04).
//
// Tests the live-stream firehose panel for skill_activated events. Mocks
// useFirehose via vi.mock so we can:
//   1. control the events array deterministically
//   2. spy on the call args (assert eventName='skill_activated' BARE per D-06,
//      and that pause toggles enabled to false).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import type { OtelEvent } from '../../../lib/useFirehose'

// Hoisted mock — vi.mock is hoisted above imports so the spy is in place
// when SkillTimeline imports useFirehose at module-evaluation time.
const useFirehoseMock = vi.fn()
vi.mock('../../../lib/useFirehose', () => ({
  useFirehose: (opts: unknown) => useFirehoseMock(opts),
}))

// SkillTimeline import MUST come after vi.mock so the mocked module is
// resolved during component module evaluation.
import { SkillTimeline } from '../SkillTimeline'

const sampleEvents: OtelEvent[] = [
  {
    id: 1,
    ts: '2026-04-27T08:00:00Z',
    event_name: 'skill_activated',
    session_id: 'sid-aaaa-1111',
    attrs_mcp_server: null,
    attrs_mcp_tool: null,
    attrs_skill_name: 'analyze',
  },
  {
    id: 2,
    ts: '2026-04-27T08:00:05Z',
    event_name: 'skill_activated',
    session_id: 'sid-bbbb-2222',
    attrs_mcp_server: null,
    attrs_mcp_tool: null,
    attrs_skill_name: 'refactor',
  },
  {
    id: 3,
    ts: '2026-04-27T08:00:10Z',
    event_name: 'skill_activated',
    session_id: null,
    attrs_mcp_server: null,
    attrs_mcp_tool: null,
    attrs_skill_name: null, // null skill name — must render '—' without crash
  },
]

describe('SkillTimeline', () => {
  beforeEach(() => {
    useFirehoseMock.mockReset()
    useFirehoseMock.mockReturnValue({ events: sampleEvents, status: 'open' })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('subscribes with eventName="skill_activated" (BARE per D-06) and renders all events when filter empty', async () => {
    const { container } = render(<SkillTimeline />)
    expect(screen.getByText('SKLP-06')).toBeInTheDocument()
    expect(screen.getByText('Skill Timeline')).toBeInTheDocument()
    // BARE event name + camelCase prop assertion.
    const firstCallArgs = useFirehoseMock.mock.calls[0]?.[0] as {
      eventName: string
      enabled: boolean
    }
    expect(firstCallArgs.eventName).toBe('skill_activated')
    expect(firstCallArgs.enabled).toBe(true)
    await waitFor(() => {
      const rows = container.querySelectorAll('.cmc-otel-row')
      expect(rows).toHaveLength(3)
    })
  })

  it('typing in the skill filter narrows the rendered list', async () => {
    const { container } = render(<SkillTimeline />)
    const filterInput = screen.getByLabelText(/filter skill name/i) as HTMLInputElement
    await userEvent.type(filterInput, 'analyze')
    await waitFor(() => {
      const rows = container.querySelectorAll('.cmc-otel-row')
      expect(rows).toHaveLength(1)
    })
    expect(container.querySelector('.cmc-otel-row__name')?.textContent).toBe('analyze')
  })

  it('clicking the pause button flips enabled to false on the next useFirehose call', async () => {
    render(<SkillTimeline />)
    // Sanity: initial subscribe has enabled=true.
    expect(useFirehoseMock.mock.calls[0]?.[0].enabled).toBe(true)
    const pauseBtn = screen.getByRole('button', { name: /pause/i })
    await userEvent.click(pauseBtn)
    // After re-render, the latest call to useFirehose must have enabled=false.
    await waitFor(() => {
      const lastCall = useFirehoseMock.mock.calls.at(-1)?.[0] as { enabled: boolean }
      expect(lastCall.enabled).toBe(false)
    })
  })

  it('renders a status pill that reflects useFirehose status (open / connecting / closed)', () => {
    useFirehoseMock.mockReturnValue({ events: [], status: 'connecting' })
    const { unmount } = render(<SkillTimeline />)
    expect(screen.getByLabelText(/connecting/i)).toBeInTheDocument()
    unmount()
    useFirehoseMock.mockReturnValue({ events: [], status: 'open' })
    render(<SkillTimeline />)
    expect(screen.getByLabelText(/open \(ok\)/i)).toBeInTheDocument()
  })

  it('renders "—" for the skill name when attrs_skill_name is null (no crash)', async () => {
    const { container } = render(<SkillTimeline />)
    await waitFor(() => {
      const rows = container.querySelectorAll('.cmc-otel-row')
      expect(rows).toHaveLength(3)
    })
    // The newest-first row (id=3) has attrs_skill_name=null → first row should
    // show '—' for the skill cell.
    const firstRow = container.querySelectorAll('.cmc-otel-row')[0]
    expect(firstRow.querySelector('.cmc-otel-row__name')?.textContent).toBe('—')
  })
})
