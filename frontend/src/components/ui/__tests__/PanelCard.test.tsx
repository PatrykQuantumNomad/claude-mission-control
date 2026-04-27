import { describe, it, expect, vi } from 'vitest'
import { UseQueryResult } from '@tanstack/react-query'
import { render, screen, userEvent } from '../../../test/utils'
import { PanelCard } from '../PanelCard'

interface SampleData {
  items: { id: string }[]
}

// Build a minimal stand-in for UseQueryResult; we only consume isPending,
// isError, error, data, refetch in PanelCard. Avoiding new QueryClient setup
// for the test keeps it focused on the four render branches.
function mkQuery(partial: Partial<UseQueryResult<SampleData, Error>>): UseQueryResult<SampleData, Error> {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    data: undefined,
    refetch: vi.fn().mockResolvedValue({ data: undefined }),
    ...partial,
  } as unknown as UseQueryResult<SampleData, Error>
}

describe('PanelCard', () => {
  it('renders the skeleton branch when query.isPending is true', () => {
    const query = mkQuery({ isPending: true })
    const { container } = render(
      <PanelCard<SampleData>
        reqId="OPNL-99"
        title="Sample"
        query={query}
        empty={{ dataNoun: 'data' }}
      >
        {(data) => <div>rows: {data.items.length}</div>}
      </PanelCard>,
    )
    expect(screen.getByText('OPNL-99')).toBeInTheDocument()
    expect(screen.getByText('Sample')).toBeInTheDocument()
    // Default skeleton uses cmc-skeleton-stack (multi-line text variant)
    expect(container.querySelector('.cmc-skeleton-stack')).not.toBeNull()
  })

  it('renders the error branch with retry button when query.isError is true', async () => {
    const refetch = vi.fn().mockResolvedValue({ data: undefined })
    const query = mkQuery({
      isError: true,
      error: new Error('boom'),
      refetch: refetch as unknown as UseQueryResult<SampleData, Error>['refetch'],
    })
    render(
      <PanelCard<SampleData>
        reqId="OPNL-99"
        title="Sample"
        query={query}
        empty={{ dataNoun: 'sessions' }}
      >
        {(data) => <div>rows: {data.items.length}</div>}
      </PanelCard>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('renders the EmptyState branch when data is empty (default items=[] check)', () => {
    const query = mkQuery({ isSuccess: true, data: { items: [] } })
    render(
      <PanelCard<SampleData>
        reqId="OPNL-99"
        title="Sample"
        query={query}
        empty={{ dataNoun: 'live sessions' }}
      >
        {(data) => <div>rows: {data.items.length}</div>}
      </PanelCard>,
    )
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
    expect(screen.getByText(/Once live sessions arrives/)).toBeInTheDocument()
  })

  it('renders children with data when query has rows', () => {
    const query = mkQuery({ isSuccess: true, data: { items: [{ id: 'a' }, { id: 'b' }] } })
    render(
      <PanelCard<SampleData>
        reqId="OPNL-99"
        title="Sample"
        query={query}
        empty={{ dataNoun: 'sessions' }}
      >
        {(data) => <div data-testid="rows">rows: {data.items.length}</div>}
      </PanelCard>,
    )
    expect(screen.getByTestId('rows')).toHaveTextContent('rows: 2')
  })

  it('returns null when hiddenWhenEmpty + data empty (AttentionBar pattern)', () => {
    const query = mkQuery({ isSuccess: true, data: { items: [] } })
    const { container } = render(
      <PanelCard<SampleData>
        reqId="ATTN"
        title="Attention"
        query={query}
        empty={{ dataNoun: 'attention items' }}
        hiddenWhenEmpty
      >
        {(data) => <div>{data.items.length}</div>}
      </PanelCard>,
    )
    expect(container.firstChild).toBeNull()
  })
})
