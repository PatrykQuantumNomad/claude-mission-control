// PanelHeaderMenu — Phase 28 Plan 28-03 (LAYO-01 + LAYO-04 per-panel half).
//
// Radix DropdownMenu mounted in the PanelCard `headerMenu` chrome slot
// (Plan 28-02 contract). Two items: "Hide this panel" (LAYO-01) and
// "Reset layout" (LAYO-04). Trigger is a Settings/gear icon button.
//
// Why a separate component (not inline JSX in each panel):
//   - Single source of truth for the testid families
//     (`panel-header-menu-{panelId}` / `panel-hide-{panelId}` /
//     `panel-reset-layout-{route}`) registered in docs/testid-registry.md.
//   - Reuses useLayoutState — every panel mount on every in-scope route
//     gets identical hide+reset behaviour without duplicating the URL-bridge
//     logic at each panel.
//   - Self-derives `route` via `useRouterState({ select: s =>
//     normalizeRouteId(s.location.pathname) })` so caller need not pass it.
//     Shared panel components (e.g. McpPanel on `/` AND `/skills`) get the
//     correct route slug automatically.
//
// Phase 24 Pitfall 2 (transform-bearing ancestor breaks Portal):
//   The trigger button uses `cmc-density-toggle` (mirror DensityToggle's
//   shape — no transform on hover; reuse-and-conform). The cmc-dropdown CSS
//   in styles.css uses `--cmc-z-dropdown` (Phase 24 z-index ladder lock —
//   never raw z-index per CONT-05 / `cmc/no-raw-z-index` ESLint rule).
//
// LAYO-04 wiring (per-panel reset):
//   handleReset = () => { reset(); toast.success('Layout reset') }
//   reset() destructuring-delete-clears the three layout URL keys while
//   preserving time_from / time_to / compare_panels / range / a / b /
//   schemaVersion + any future search keys (Pitfall 11). Two-surface
//   coverage with SavedViewMenu's chrome-level Reset Layout — operator can
//   always escape a corrupt-state lock-in regardless of which panels are
//   hidden.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { EyeOff, RotateCcw, Settings } from 'lucide-react'
import { useRouterState } from '@tanstack/react-router'
import { toast } from 'sonner'
import { normalizeRouteId } from '../../lib/layout/panelRegistry'
import { useLayoutState } from '../../lib/layout/useLayoutState'

interface PanelHeaderMenuProps {
  /** Panel id from PANEL_REGISTRY — drives the testid + setHidden write. */
  panelId: string
  /** Operator-visible label — used in the trigger's aria-label
   *  ("Customize {label}"). */
  label: string
}

export function PanelHeaderMenu({ panelId, label }: PanelHeaderMenuProps) {
  // Pathname for the registry-keyed useLayoutState lookup (pathname vocab,
  // `/` / `/cost` / etc.). DISTINCT from the testid slug below.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { setHidden, reset } = useLayoutState(pathname)

  // Testid slug — `home` / `cost` / etc. Throws on out-of-scope routes
  // (defense in depth — PanelHeaderMenu should never mount on a route that
  // is not in the Phase 28 in-scope set, since the registry has no entries
  // for it). If a future plan needs to silently no-op on out-of-scope
  // routes, mirror SavedViewMenu.safeRouteSlug.
  const routeSlug = normalizeRouteId(pathname)

  const handleReset = () => {
    reset()
    toast.success('Layout reset')
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="cmc-density-toggle"
          data-testid={`panel-header-menu-${panelId}`}
          aria-label={`Customize ${label}`}
        >
          <Settings size={14} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="cmc-dropdown"
          sideOffset={6}
          align="end"
        >
          <DropdownMenu.Item
            className="cmc-dropdown__item"
            data-testid={`panel-hide-${panelId}`}
            aria-label={`Hide ${label}`}
            onSelect={() => setHidden(panelId, true)}
          >
            <EyeOff size={14} aria-hidden /> Hide this panel
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="cmc-dropdown__sep" />
          <DropdownMenu.Item
            className="cmc-dropdown__item"
            data-testid={`panel-reset-layout-${routeSlug}`}
            aria-label="Reset layout to default"
            onSelect={handleReset}
          >
            <RotateCcw size={14} aria-hidden /> Reset layout
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
