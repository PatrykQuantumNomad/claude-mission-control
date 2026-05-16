// Phase 28 Plan 01 — Skeleton vitest for `PANEL_REGISTRY` + `isValidPanelId`.
//
// Wave 1 (Plan 28-02) ships `frontend/src/lib/layout/panelRegistry.ts` —
// a frozen mapping of `route → readonly panelId[]` that anchors the
// append-only panel-id vocabulary documented in `docs/url-contract.md`
// "Locked invariants (Phase 28)". Until that module exists the file
// below is intentionally green via `it.todo`.
//
// Pitfall 9: panel ids are append-only — once a panel id ships, it
// cannot be renamed or repurposed. The "registry shape lock" assertion
// per in-scope route below is the regression net.

import { describe, it } from 'vitest'

describe('PANEL_REGISTRY (Phase 28 Plan 28-02 — LAYO-01/02/03/04)', () => {
  describe('isValidPanelId(route, panelId)', () => {
    it.todo('returns true for a registered panel id on the route')
    it.todo('returns false for a panel id not registered on the route')
    it.todo('returns false for a panel id registered on a different route')
  })

  describe('registry shape lock (one assertion per in-scope route)', () => {
    it.todo('/ has a non-empty panelId array')
    it.todo('/activity has a non-empty panelId array')
    it.todo('/cost has a non-empty panelId array')
    it.todo('/skills has a non-empty panelId array')
    it.todo('/alerts has a non-empty panelId array')
    it.todo('/sessions/compare has a non-empty panelId array')
  })

  describe('append-only invariant (Pitfall 9)', () => {
    it.todo('panel ids match the lowercase-ASCII vocabulary (/^[a-z0-9_-]+$/)')
  })
})
