// SavedViewMenu — Phase 25 Plan 06 (VIEW-04 / VIEW-05).
//
// Radix DropdownMenu mounted in AppShellHeader, replacing the inert
// save-view-button placeholder. Lists the current route's saved views via
// useSavedViews(currentRoute) and offers per-view actions
// (Open / Set-as-default / Pin / Unpin / Save-as-new / Delete) inside a
// submenu so the top-level menu stays scannable.
//
// Trigger label reflects the loaded view via LoadedViewContext — when nothing
// is loaded the bookmark icon reads "Views" (the empty-state cue).
//
// Pattern parity:
//   - Wrapper boilerplate mirrors DensityToggle.tsx (line-for-line on the
//     Trigger/Portal/Content shape); the data is what differs.
//   - DropdownMenu.Portal is mandatory (locked invariant POLI-11 — all
//     dropdown/popover content goes through Radix Portal).
//   - data-testid values come from docs/testid-registry.md (lint rule
//     cmc/testid-registry-only). Dynamic per-view ids use the
//     `saved-view-{action}-{id}` pattern registered in the doc.
//
// Route normalization: TanStack pathname like `/skills/foo` becomes the route
// id `/skills/$name` because the backend saved_views.route column stores
// whatever string the frontend supplies — and the frontend's source of truth
// for "which route am I on" is the route id, not the resolved pathname. This
// keeps a single saved view ("My favorite skill view") matched to every
// /skills/<name> visit. Wave-2 static routes (e.g. /cost) pass through
// unchanged because their pathname IS their route id.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import {
  Bookmark,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { toast } from 'sonner'
import type { SavedView } from '../../lib/api'
import {
  normalizeRouteId as normalizeRouteSlug,
} from '../../lib/layout/panelRegistry'
import { useLayoutState } from '../../lib/layout/useLayoutState'
import { useDeleteView, useSavedViews } from '../../lib/queries'
import {
  getDefaultViewId,
  getPinnedIds,
  pinView,
  setDefaultViewId,
  unpinView,
} from '../../lib/savedViews'
import { EditOrForkDialog } from './EditOrForkDialog'
import { useLoadedView } from './LoadedViewContext'
import { normalizeRouteId } from './routeNormalize'
import { SaveViewDialog } from './SaveViewDialog'
import { useUrlDivergesFromLoadedView } from './UnsavedPip'

// Plan 10: re-export normalizeRouteId so existing consumers
// (CommandPalette Plan 08 imports it from this module) keep working without
// a churn-edit. The canonical home is `./routeNormalize.ts`.
export { normalizeRouteId } from './routeNormalize'

// Phase 28 / LAYO-04. Slug coercion for the `panel-reset-layout-{route}`
// testid family. `normalizeRouteSlug` (from panelRegistry) throws for
// pathnames not in the 6 Phase 28 in-scope routes — SavedViewMenu mounts on
// EVERY route (including `/skills/$name` which is intentionally out of
// scope), so this wrapper returns `null` for out-of-scope routes and the
// Reset Layout item simply does not render. This is the LAYO-04 corrupt-
// state-lock-in escape hatch — only meaningful for routes that have layout
// state to reset.
function safeRouteSlug(pathname: string): string | null {
  try {
    return normalizeRouteSlug(pathname)
  } catch {
    return null
  }
}

export function SavedViewMenu() {
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const currentRoute = normalizeRouteId(location.pathname)
  const layoutRouteSlug = safeRouteSlug(location.pathname)
  // Pass the raw pathname to useLayoutState — the hook's PANEL_REGISTRY
  // lookup uses pathname-style keys (`/`, `/cost`, etc.), distinct from the
  // testid slug vocabulary (`home`, `cost`, etc.). When the pathname is out
  // of scope (e.g. `/skills/foo`), useLayoutState's orderedPanels returns
  // empty arrays and reset() is a no-op — safe to invoke unconditionally.
  const { reset: resetLayout } = useLayoutState(location.pathname)
  const { data, isLoading } = useSavedViews(currentRoute)
  const { loadedView, setLoadedView } = useLoadedView()
  const urlDiverges = useUrlDivergesFromLoadedView()
  const deleteMutation = useDeleteView()
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [forkSource, setForkSource] = useState<SavedView | null>(null)
  // Plan 07 (VIEW-07): edit-or-fork 3-button chooser. Surfaced when the user
  // has a loaded view AND the URL diverges from it AND they pick "Edit
  // current view…" (or try to open a DIFFERENT view from the menu while the
  // current URL is divergent — instead of silently navigating we re-prompt).
  const [editOrForkOpen, setEditOrForkOpen] = useState(false)

  const triggerLabel = loadedView?.name ?? 'Views'
  const defaultId = getDefaultViewId(currentRoute)
  const pinned = new Set(getPinnedIds())
  const items = data?.items ?? []

  const openSaveDialog = (fork: SavedView | null) => {
    setForkSource(fork)
    setSaveDialogOpen(true)
  }

  const handleOpen = (v: SavedView) => {
    // VIEW-07: if there's a loaded view AND the URL has diverged AND the
    // user is trying to open a DIFFERENT view, intercept and surface the
    // 3-button chooser instead of silently overwriting the in-flight
    // changes. For v1 the user re-clicks Open after picking Discard — no
    // pending-navigation chaining (documented in 25-07-SUMMARY.md).
    if (loadedView && urlDiverges && v.id !== loadedView.id) {
      setEditOrForkOpen(true)
      return
    }
    navigate({
      to: location.pathname,
      search: v.state_json as Record<string, unknown>,
    })
    setLoadedView(v)
  }

  const togglePin = (id: number) => {
    if (pinned.has(id)) unpinView(id)
    else pinView(id)
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="cmc-saved-view-menu__trigger"
            data-testid="saved-view-menu-trigger"
            aria-label={`Saved views${loadedView ? `: ${loadedView.name}` : ''}`}
          >
            <Bookmark size={16} aria-hidden />
            <span>{triggerLabel}</span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="cmc-dropdown"
            sideOffset={6}
            align="end"
            data-testid="saved-view-menu-content"
          >
            {loadedView && urlDiverges && (
              <DropdownMenu.Item
                className="cmc-dropdown__item"
                data-testid="saved-view-menu-edit-current"
                onSelect={() => setEditOrForkOpen(true)}
              >
                <Pencil size={14} aria-hidden /> Edit "{loadedView.name}"…
              </DropdownMenu.Item>
            )}

            <DropdownMenu.Item
              className="cmc-dropdown__item"
              data-testid="saved-view-menu-save-new"
              onSelect={() => openSaveDialog(null)}
            >
              <Plus size={14} aria-hidden /> Save current view…
            </DropdownMenu.Item>

            {items.length > 0 && (
              <DropdownMenu.Separator className="cmc-dropdown__sep" />
            )}

            {isLoading && (
              <div className="cmc-dropdown__empty">Loading…</div>
            )}
            {!isLoading && items.length === 0 && (
              <div className="cmc-dropdown__empty">
                No saved views for this route
              </div>
            )}

            {items.map((v) => (
              <DropdownMenu.Sub key={v.id}>
                <DropdownMenu.SubTrigger
                  className="cmc-dropdown__item"
                  data-testid={`saved-view-item-${v.id}`}
                >
                  {v.id === defaultId && <Star size={12} aria-hidden />}
                  {v.name}
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className="cmc-dropdown">
                    <DropdownMenu.Item
                      className="cmc-dropdown__item"
                      data-testid={`saved-view-open-${v.id}`}
                      onSelect={() => handleOpen(v)}
                    >
                      Open
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cmc-dropdown__item"
                      data-testid={`saved-view-set-default-${v.id}`}
                      onSelect={() => setDefaultViewId(currentRoute, v.id)}
                    >
                      Set as default
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cmc-dropdown__item"
                      data-testid={`saved-view-pin-${v.id}`}
                      onSelect={() => togglePin(v.id)}
                    >
                      {pinned.has(v.id) ? (
                        <>
                          <PinOff size={12} aria-hidden /> Unpin
                        </>
                      ) : (
                        <>
                          <Pin size={12} aria-hidden /> Pin
                        </>
                      )}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cmc-dropdown__item"
                      data-testid={`saved-view-fork-${v.id}`}
                      onSelect={() => openSaveDialog(v)}
                    >
                      <Pencil size={12} aria-hidden /> Save as new (fork)
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="cmc-dropdown__item cmc-dropdown__item--danger"
                      data-testid={`saved-view-delete-${v.id}`}
                      onSelect={() => deleteMutation.mutate(v.id)}
                    >
                      <Trash2 size={12} aria-hidden /> Delete
                    </DropdownMenu.Item>
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ))}

            {/*
              Phase 28 / LAYO-04 escape hatch (RESEARCH §7 + A2).
              When every panel on a route is hidden, the operator has no
              per-panel menu to fall back to — SavedViewMenu is the chrome
              surface that survives. Rendered only on Phase-28 in-scope
              routes (layoutRouteSlug !== null guards out `/skills/$name`
              and any other future out-of-scope route).
              Plan 28-03 mounts the per-panel sibling Reset Layout item in
              PanelHeaderMenu — two-surface coverage of LAYO-04.
            */}
            {layoutRouteSlug !== null && (
              <>
                <DropdownMenu.Separator className="cmc-dropdown__sep" />
                <DropdownMenu.Item
                  className="cmc-dropdown__item"
                  data-testid={`panel-reset-layout-${layoutRouteSlug}`}
                  aria-label="Reset layout to default"
                  onSelect={() => {
                    resetLayout()
                    toast.success('Layout reset')
                  }}
                >
                  <RotateCcw size={14} aria-hidden /> Reset layout
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <SaveViewDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        fork={forkSource}
        currentRoute={currentRoute}
      />

      <EditOrForkDialog
        open={editOrForkOpen}
        onOpenChange={setEditOrForkOpen}
        currentPathname={location.pathname}
        onFork={() => {
          // Reuses Plan 06's SaveViewDialog in fork mode with the loaded
          // view as source — Plan 06's SUMMARY explicitly notes this seam.
          if (loadedView) openSaveDialog(loadedView)
        }}
      />
    </>
  )
}
