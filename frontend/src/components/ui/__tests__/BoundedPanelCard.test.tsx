import { describe, it, expect, vi } from 'vitest'
import { UseQueryResult } from '@tanstack/react-query'
import { render } from '../../../test/utils'
import { PanelCard } from '../PanelCard'
import { BoundedPanelCard } from '../BoundedPanelCard'

interface SampleData {
  items: { id: string }[]
}

function mkQuery(partial: Partial<UseQueryResult<SampleData, Error>>): UseQueryResult<SampleData, Error> {
  return {
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    data: { items: [{ id: 'a' }] },
    refetch: vi.fn().mockResolvedValue({ data: undefined }),
    ...partial,
  } as unknown as UseQueryResult<SampleData, Error>
}

describe('PanelCard.bounded', () => {
  it('does NOT add cmc-card--bounded when bounded prop is omitted (backward compat)', () => {
    const query = mkQuery({})
    const { container } = render(
      <PanelCard<SampleData>
        reqId="OPNL-99"
        title="Sample"
        query={query}
        empty={{ dataNoun: 'rows' }}
      >
        {(data) => <div>{data.items.length}</div>}
      </PanelCard>,
    )
    // Walk to the Card root. Card uses the .cmc-card class.
    const card = container.querySelector('.cmc-card')
    expect(card).not.toBeNull()
    expect(card?.className).not.toMatch(/cmc-card--bounded/)
  })

  it('adds cmc-card--bounded when bounded prop is true', () => {
    const query = mkQuery({})
    const { container } = render(
      <PanelCard<SampleData>
        reqId="OPNL-99"
        title="Sample"
        query={query}
        empty={{ dataNoun: 'rows' }}
        bounded
      >
        {(data) => <div>{data.items.length}</div>}
      </PanelCard>,
    )
    const card = container.querySelector('.cmc-card')
    expect(card).not.toBeNull()
    expect(card?.className).toMatch(/cmc-card--bounded/)
  })
})

describe('BoundedPanelCard', () => {
  it('renders a card with cmc-card--bounded by default (preset to bounded=true)', () => {
    const query = mkQuery({})
    const { container } = render(
      <BoundedPanelCard<SampleData>
        reqId="OPNL-99"
        title="Bounded sample"
        query={query}
        empty={{ dataNoun: 'rows' }}
      >
        {(data) => <div>{data.items.length}</div>}
      </BoundedPanelCard>,
    )
    const card = container.querySelector('.cmc-card')
    expect(card).not.toBeNull()
    expect(card?.className).toMatch(/cmc-card--bounded/)
  })

  it('produces identical className composition to <PanelCard bounded ...>', () => {
    const query = mkQuery({})
    const { container: panelContainer } = render(
      <PanelCard<SampleData>
        reqId="OPNL-99"
        title="Sample"
        query={query}
        empty={{ dataNoun: 'rows' }}
        bounded
      >
        {(data) => <div>{data.items.length}</div>}
      </PanelCard>,
    )
    const { container: boundedContainer } = render(
      <BoundedPanelCard<SampleData>
        reqId="OPNL-99"
        title="Sample"
        query={query}
        empty={{ dataNoun: 'rows' }}
      >
        {(data) => <div>{data.items.length}</div>}
      </BoundedPanelCard>,
    )
    const a = panelContainer.querySelector('.cmc-card')?.className
    const b = boundedContainer.querySelector('.cmc-card')?.className
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(a).toBe(b)
  })
})
