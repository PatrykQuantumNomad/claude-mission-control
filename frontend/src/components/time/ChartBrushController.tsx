// ChartBrushController — Phase 26 Plan 05 (TIME-05).
//
// useChartBrush() returns an onDragEnd handler that translates a recharts
// Brush commit ({ startIndex, endIndex }) into a navigate() call writing
// absolute ISO time_from/time_to to the URL. Generic — any time-anchored
// chart can wire it.
//
// The brush commits ABSOLUTE timestamps (per CONTEXT: "zoomed range
// freezes to absolute"). This deliberately triggers AutoRefreshController's
// pause branch (Plan 03) — refresh is meaningless during investigation.
//
// onChange (per-frame during drag) is intentionally NOT consumed — we
// commit on onDragEnd only to avoid a navigate-per-mouse-move spam.
//
// Why a hook (not a component): `<Brush />` is a recharts internal that
// MUST render as a direct child of a cartesian chart (BarChart/LineChart).
// Wrapping it would break recharts' child-detection. The hook gives panels
// a generic onDragEnd they can wire directly.

import { useCallback } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'

interface BrushDataRow {
  day: string // ISO date or 'YYYY-MM-DD' — coerce to full ISO before navigate
}

export interface UseChartBrushOptions<T extends BrushDataRow> {
  data: T[]
}

export interface BrushDragPayload {
  startIndex?: number
  endIndex?: number
}

export function useChartBrush<T extends BrushDataRow>({ data }: UseChartBrushOptions<T>) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const onDragEnd = useCallback(
    (payload: BrushDragPayload | undefined) => {
      if (!payload) return
      const { startIndex, endIndex } = payload
      if (typeof startIndex !== 'number' || typeof endIndex !== 'number') return
      const lo = Math.min(startIndex, endIndex)
      const hi = Math.max(startIndex, endIndex)
      const fromRow = data[lo]
      const toRow = data[hi]
      if (!fromRow?.day || !toRow?.day) return
      // Coerce 'YYYY-MM-DD' (date-only) to full ISO at start/end-of-day
      // so the URL contains a parseable ISO_ABS token that asTimeToken accepts.
      const fromIso = fromRow.day.includes('T') ? fromRow.day : `${fromRow.day}T00:00:00.000Z`
      const toIso = toRow.day.includes('T') ? toRow.day : `${toRow.day}T23:59:59.999Z`
      navigate({
        to: pathname as never,
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          time_from: fromIso,
          time_to: toIso,
        })) as never,
        replace: false,
      })
    },
    [data, navigate, pathname],
  )

  return { onDragEnd }
}
