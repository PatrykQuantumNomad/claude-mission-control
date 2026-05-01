// HeatmapGrid — current. Hand-rolled CSS-grid heatmap (typically 30
// cells for the 30-day session activity panel). Caller supplies a `colorScale`
// function that maps a cell's value (and the max across the grid) to a CSS
// color token. We pass that string directly to `style.background` so callers
// can choose between gradient bands, accent tints, or status colors per panel.
//
// Each cell is wrapped in a Tooltip so hovering shows the underlying day +
// value in JetBrains Mono.

import { CSSProperties } from 'react'
import { Tooltip } from './Tooltip'

export interface HeatmapCell {
  day: string
  value: number
}

interface HeatmapGridProps {
  cells: HeatmapCell[]
  colorScale: (value: number, max: number) => string
  cellSize?: number
  gap?: number
  ariaLabel?: string
  formatTooltip?: (cell: HeatmapCell) => string
}

export function HeatmapGrid({
  cells,
  colorScale,
  cellSize = 14,
  gap,
  ariaLabel = 'Activity heatmap',
  formatTooltip,
}: HeatmapGridProps) {
  const max = cells.reduce((m, c) => (c.value > m ? c.value : m), 0)
  const style: CSSProperties = {
    // CSS variable consumed by .cmc-heatmap-grid grid-template-columns.
    ['--heatmap-cell' as keyof CSSProperties as string]: `${cellSize}px`,
    gap: typeof gap === 'number' ? `${gap}px` : undefined,
  } as CSSProperties

  return (
    <div className="cmc-heatmap-grid" role="img" aria-label={ariaLabel} style={style}>
      {cells.map((cell) => {
        const bg = colorScale(cell.value, max)
        const label = formatTooltip
          ? formatTooltip(cell)
          : `${cell.day}: ${cell.value.toLocaleString()}`
        return (
          <Tooltip key={cell.day} content={label}>
            <div
              className="cmc-heatmap-cell"
              data-day={cell.day}
              data-value={cell.value}
              style={{ background: bg }}
              tabIndex={0}
              aria-label={label}
            />
          </Tooltip>
        )
      })}
    </div>
  )
}
