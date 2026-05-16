// ActivityHeatmap — ACTV-01 (current).
//
// 30-day GitHub-style daily activity grid. Each cell is one day; color is
// scaled by sessions count (5 buckets via heatmapColorScale). Hover shows
// day + sessions + tokens_effective in a Tooltip. Refreshes every 300s
// (cadence owned by lib/queries.ts useHeatmap — never inlined here).
//
// Composition rules (entry contract for later work):
//   - Wraps PanelCard<HeatmapResponse>
//   - Renders the <HeatmapGrid> primitive for the cell layout
//   - Imports useHeatmap from lib/queries (refetchInterval lives there)

import { PanelCard, HeatmapGrid, type LayoutCustomizableProps } from '../ui'
import { useHeatmap } from '../../lib/queries'
import type { HeatmapDayRow, HeatmapResponse } from '../../lib/api'
import { heatmapColorScale } from './ActivityHeatmap.utils'

function formatTooltip(row: HeatmapDayRow): string {
  return `${row.day}: ${row.sessions} sessions, ${row.tokens_effective.toLocaleString()} tokens`
}

export function ActivityHeatmap({ panelId, headerMenu }: LayoutCustomizableProps = {}) {
  // Phase 26 Plan 08: the heatmap is INTRINSICALLY a 30-day surface (visual
  // grid is 30 cells). No URL bridge here — the surface is fixed at '30d'
  // regardless of global time picker; the TimePicker effectively zooms the
  // OTHER panels on /activity. This is a v1 ergonomic call (RESEARCH §State
  // of the Art): a future Phase 27 plan can dispatch the heatmap window
  // through rangeToVocab if user feedback warrants.
  const query = useHeatmap('30d')
  return (
    <PanelCard<HeatmapResponse>
      reqId="ACTV-01"
      title="30-Day Activity"
      query={query}
      bounded
      panelId={panelId}
      headerMenu={headerMenu}
      empty={{
        dataNoun: '30 days of session activity',
        when: (d) => d.items.length === 0,
      }}
    >
      {(data) => {
        // Build day -> row index so the formatTooltip closure can find the
        // full row (sessions + tokens_effective) by HeatmapCell.day.
        const byDay = new Map<string, HeatmapDayRow>()
        for (const row of data.items) byDay.set(row.day, row)
        return (
          <HeatmapGrid
            cells={data.items.map((row) => ({ day: row.day, value: row.sessions }))}
            colorScale={heatmapColorScale}
            ariaLabel="30-day session activity heatmap"
            formatTooltip={(cell) => {
              const row = byDay.get(cell.day)
              if (!row) return `${cell.day}: ${cell.value} sessions`
              return formatTooltip(row)
            }}
          />
        )
      }}
    </PanelCard>
  )
}
