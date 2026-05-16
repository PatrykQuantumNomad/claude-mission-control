// Phase 28 Plan 01 — Skeleton vitest for `useLayoutState` hook.
//
// This is the Nyquist-rule gate: Wave 1 (Plan 28-02) implements
// `frontend/src/lib/layout/useLayoutState.ts` and converts the `it.todo`
// placeholders below into real assertions. Until then, the file is
// intentionally green — no source imports, no failing tests.
//
// Coverage shape mirrors `useFirehose.test.ts` + `skillsDetailRange.test.tsx`
// so the Phase 25/26/27 vitest harness pattern carries forward.
//
// LAYO-04 SC#3 + Pitfall 11 lock: reset MUST clear `hidden_panels` +
// `panel_order` + `split_sizes` only — `time_from` / `time_to` /
// `compare_panels` / `range` / `a` / `b` are preserved verbatim. The
// `reset preserves non-layout URL keys` `it.todo` below enforces that
// invariant.
//
// Pitfall 7: unknown panel ids from a stale saved view MUST be filtered
// through `PANEL_REGISTRY` membership at the read site so the hook never
// surfaces a panel id the route does not recognize.

import { describe, it } from 'vitest'

describe('useLayoutState (Phase 28 Plan 28-02 — LAYO-01/02/03/04)', () => {
  describe('isHidden(panelId)', () => {
    it.todo('returns false by default when hidden_panels is undefined')
    it.todo('returns true after setHidden(id, true) updates the URL')
    it.todo('returns false after setHidden(id, false) removes the id from the CSV')
  })

  describe('orderedPanels(columnId, defaultOrder)', () => {
    it.todo('respects panel_order CSV when the group matches the columnId')
    it.todo('falls back to defaultOrder when the URL group is absent')
    it.todo('filters out unknown panel ids via PANEL_REGISTRY (Pitfall 7)')
  })

  describe('splitSizes(groupId)', () => {
    it.todo('parses split_sizes for a matching groupId')
    it.todo('returns undefined when split_sizes is absent or shape-invalid')
  })

  describe('reset()', () => {
    it.todo('clears hidden_panels, panel_order, and split_sizes from the URL')
    it.todo(
      'preserves time_from, time_to, compare_panels, range, a, b (LAYO-04 SC#3 / Pitfall 11)',
    )
  })

  describe('setHidden / setOrder / setSplit URL mutation contract', () => {
    it.todo('writes via TanStack navigate({ search: prev => ... }) — function form (Pitfall 1)')
    it.todo('omits the param entirely when the value reduces to the empty set')
  })
})
