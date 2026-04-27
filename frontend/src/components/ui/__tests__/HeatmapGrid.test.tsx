import { describe, it, expect, vi } from 'vitest'
import { render } from '../../../test/utils'
import { HeatmapGrid } from '../HeatmapGrid'

describe('HeatmapGrid', () => {
  it('renders one cell per supplied entry', () => {
    const cells = Array.from({ length: 5 }, (_, i) => ({
      day: `2026-04-2${i}`,
      value: i * 2,
    }))
    const colorScale = () => 'var(--cmc-accent-blue)'
    const { container } = render(<HeatmapGrid cells={cells} colorScale={colorScale} />)
    expect(container.querySelectorAll('.cmc-heatmap-cell')).toHaveLength(5)
  })

  it('invokes colorScale once per cell with (value, max)', () => {
    const cells = [
      { day: 'a', value: 1 },
      { day: 'b', value: 4 },
      { day: 'c', value: 2 },
    ]
    const colorScale = vi.fn((_value: number, _max: number) => 'red')
    render(<HeatmapGrid cells={cells} colorScale={colorScale} />)
    expect(colorScale).toHaveBeenCalledTimes(3)
    // max should be 4 (the largest value in cells) for every invocation
    for (const call of colorScale.mock.calls) {
      expect(call[1]).toBe(4)
    }
  })

  it('applies the colorScale return value as cell background', () => {
    const cells = [{ day: 'd1', value: 1 }]
    const { container } = render(
      <HeatmapGrid cells={cells} colorScale={() => 'rgb(1, 2, 3)'} />,
    )
    const cell = container.querySelector('.cmc-heatmap-cell') as HTMLElement
    expect(cell.style.background).toContain('rgb(1, 2, 3)')
    expect(cell.dataset.day).toBe('d1')
    expect(cell.dataset.value).toBe('1')
  })
})
