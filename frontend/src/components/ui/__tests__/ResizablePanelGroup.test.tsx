// Phase 28 Plan 01 — Skeleton vitest for `ResizablePanelGroup`.
//
// Wave 3 (Plan 28-05) ships `frontend/src/components/ui/ResizablePanelGroup.tsx`
// — a wrapper around `react-resizable-panels` PanelGroup that round-trips
// the user-chosen split percentages through the URL `split_sizes` param
// (CSV groups: `groupId:p1,p2;groupId2:p1,p2`). The wrapper also exposes
// double-click-to-reset on the Separator (testid family
// `resize-handle-{groupId}`).
//
// CRITICAL Pitfall 1: react-resizable-panels exposes BOTH
// `onLayoutChange` (fires on every pointermove during drag) AND
// `onLayoutChanged` (fires once at pointerup). Wave 3 MUST wire URL
// writes to `onLayoutChanged` ONLY — otherwise pointermove triggers a
// router commit storm. The `writes URL on onLayoutChanged (NOT
// onLayoutChange)` `it.todo` below is the regression net.

import { describe, it } from 'vitest'

describe('ResizablePanelGroup (Phase 28 Plan 28-05 — LAYO-03)', () => {
  describe('URL round-trip', () => {
    it.todo('reads split_sizes from the URL on mount and seeds defaultSize')
    it.todo(
      'writes URL on onLayoutChanged (NOT onLayoutChange — Pitfall 1: pointermove debounce)',
    )
    it.todo('omits split_sizes when sizes return to defaults (no churn)')
  })

  describe('double-click reset (LAYO-03 SC#2)', () => {
    it.todo(
      'double-click on Separator (testid resize-handle-{groupId}) removes split_sizes from the URL',
    )
    it.todo('does NOT touch other groups\' entries in the CSV')
  })

  describe('a11y + perf', () => {
    it.todo('Separator exposes role="separator" and aria-orientation')
    it.todo(
      'chart container (ResponsiveContainer) keeps DOM identity across resize (Phase 24 lock)',
    )
  })
})
