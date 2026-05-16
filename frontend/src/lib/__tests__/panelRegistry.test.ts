// Phase 28 Plan 02 — vitest regression net for `PANEL_REGISTRY` +
// `isValidPanelId` + `normalizeRouteId` + `getPanelLabel`.
//
// Module under test: `frontend/src/lib/layout/panelRegistry.ts`
//
// Locked invariants asserted here:
//   1. Each in-scope route (`/`, `/activity`, `/cost`, `/skills`, `/alerts`,
//      `/sessions/compare`) appears as a registry key with a non-empty
//      `PanelDescriptor[]` array (Phase 28 scope per RESEARCH §4 + plan).
//   2. Panel ids match the append-only lowercase ASCII vocabulary
//      `/^[a-z0-9_-]+$/` (Pitfall 9). Stale URL params referencing
//      removed/renamed ids must still parse — but the renaming itself is
//      prohibited.
//   3. `isValidPanelId(route, panelId)`:
//      - true for a registered panel on the route
//      - false for an unregistered panel
//      - false for a panel registered on a DIFFERENT route (cross-route
//        bleed-prevention — Pitfall 7 defense in depth)
//      - false for an unknown route key
//   4. `normalizeRouteId(pathname)` maps pathname → slug for the
//      `panel-reset-layout-{route}` testid family:
//      `/` → `home`, `/activity` → `activity`, `/sessions/compare` →
//      `sessions-compare`, etc. Unknown pathnames throw.
//   5. `getPanelLabel(route, panelId)`:
//      - returns the registered label for a known panel
//      - falls back to `panelId` when panel is unknown (graceful drift —
//        Pitfall 7)
//      - falls back to `panelId` when the route is unknown
//
// Wave 0 skeleton authored in Plan 28-01 lived here with `it.todo`
// placeholders. This Plan 28-02 commit flips them into real assertions.

import { describe, it, expect } from 'vitest'
import {
  PANEL_REGISTRY,
  getPanelLabel,
  isValidPanelId,
  normalizeRouteId,
} from '../layout/panelRegistry'

const IN_SCOPE_ROUTES = [
  '/',
  '/activity',
  '/cost',
  '/skills',
  '/alerts',
  '/sessions/compare',
] as const

const PANEL_ID_RE = /^[a-z0-9_-]+$/

describe('PANEL_REGISTRY (Phase 28 Plan 28-02 — LAYO-01/02/03/04)', () => {
  describe('isValidPanelId(route, panelId)', () => {
    it('returns true for a registered panel id on the route', () => {
      // Pick the first registered panel of `/` route to keep the assertion
      // resilient against future registry expansion.
      const firstHomePanel = PANEL_REGISTRY['/'][0].panelId
      expect(isValidPanelId('/', firstHomePanel)).toBe(true)
    })

    it('returns false for a panel id not registered on the route', () => {
      expect(isValidPanelId('/', 'definitely-not-a-real-panel')).toBe(false)
    })

    it('returns false for a panel id registered on a different route', () => {
      const costPanel = PANEL_REGISTRY['/cost'][0].panelId
      // Sanity-check: ensure the chosen cost-route panel is NOT also present
      // on `/` (if a future plan adds the same id to `/` this guard tells us
      // to pick a different cross-route sample).
      const collidesOnHome = PANEL_REGISTRY['/'].some(
        (p) => p.panelId === costPanel,
      )
      expect(collidesOnHome).toBe(false)
      expect(isValidPanelId('/', costPanel)).toBe(false)
    })

    it('returns false for an unknown route key', () => {
      expect(isValidPanelId('/nonexistent', 'whatever')).toBe(false)
    })
  })

  describe('registry shape lock (one assertion per in-scope route)', () => {
    for (const route of IN_SCOPE_ROUTES) {
      it(`${route} has a non-empty panelId array`, () => {
        expect(PANEL_REGISTRY[route]).toBeDefined()
        expect(PANEL_REGISTRY[route].length).toBeGreaterThan(0)
      })
    }
  })

  describe('append-only invariant (Pitfall 9)', () => {
    it('panel ids match the lowercase-ASCII vocabulary (/^[a-z0-9_-]+$/)', () => {
      for (const route of IN_SCOPE_ROUTES) {
        for (const descriptor of PANEL_REGISTRY[route]) {
          expect(descriptor.panelId).toMatch(PANEL_ID_RE)
        }
      }
    })

    it('column ids match the same vocabulary', () => {
      for (const route of IN_SCOPE_ROUTES) {
        for (const descriptor of PANEL_REGISTRY[route]) {
          expect(descriptor.columnId).toMatch(PANEL_ID_RE)
        }
      }
    })

    it('every descriptor has a non-empty label', () => {
      for (const route of IN_SCOPE_ROUTES) {
        for (const descriptor of PANEL_REGISTRY[route]) {
          expect(typeof descriptor.label).toBe('string')
          expect(descriptor.label.length).toBeGreaterThan(0)
        }
      }
    })

    it('every descriptor has a boolean defaultVisible field', () => {
      for (const route of IN_SCOPE_ROUTES) {
        for (const descriptor of PANEL_REGISTRY[route]) {
          expect(typeof descriptor.defaultVisible).toBe('boolean')
        }
      }
    })

    it('panel ids are unique within each route (no duplicates per scope)', () => {
      for (const route of IN_SCOPE_ROUTES) {
        const ids = PANEL_REGISTRY[route].map((p) => p.panelId)
        const uniq = new Set(ids)
        expect(uniq.size).toBe(ids.length)
      }
    })
  })

  describe('normalizeRouteId(pathname) — slug vocabulary for testids', () => {
    it("maps `/` to `home`", () => {
      expect(normalizeRouteId('/')).toBe('home')
    })

    it('maps top-level routes to their slug (slash-stripped)', () => {
      expect(normalizeRouteId('/activity')).toBe('activity')
      expect(normalizeRouteId('/cost')).toBe('cost')
      expect(normalizeRouteId('/skills')).toBe('skills')
      expect(normalizeRouteId('/alerts')).toBe('alerts')
    })

    it('maps `/sessions/compare` to `sessions-compare`', () => {
      expect(normalizeRouteId('/sessions/compare')).toBe('sessions-compare')
    })

    it('throws on a pathname not mapped to a known in-scope route', () => {
      // Defense in depth — caller should always pass a Phase-28-aware route.
      expect(() => normalizeRouteId('/nonexistent')).toThrow()
    })
  })

  describe('getPanelLabel(route, panelId)', () => {
    it('returns the registered label for a known panel', () => {
      const firstHomePanel = PANEL_REGISTRY['/'][0]
      expect(getPanelLabel('/', firstHomePanel.panelId)).toBe(
        firstHomePanel.label,
      )
    })

    it('falls back to panelId when panel is unknown on the route (Pitfall 7 graceful drift)', () => {
      expect(getPanelLabel('/', 'unknown-panel-id')).toBe('unknown-panel-id')
    })

    it('falls back to panelId when the route is unknown', () => {
      expect(getPanelLabel('/nonexistent', 'whatever')).toBe('whatever')
    })
  })
})
