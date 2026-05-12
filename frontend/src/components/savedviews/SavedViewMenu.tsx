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
  Star,
  Trash2,
} from 'lucide-react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import type { SavedView } from '../../lib/api'
import { useDeleteView, useSavedViews } from '../../lib/queries'
import {
  getDefaultViewId,
  getPinnedIds,
  pinView,
  setDefaultViewId,
  unpinView,
} from '../../lib/savedViews'
import { useLoadedView } from './LoadedViewContext'
import { SaveViewDialog } from './SaveViewDialog'

/** Normalize a TanStack pathname like `/skills/foo` to a route id like
 * `/skills/$name`. Wave-2 v1.3 routes are static; only `/skills/<name>`
 * currently uses a dynamic param. Backend `route` column stores whatever the
 * frontend POSTs — this function is the single coercion site. */
export function normalizeRouteId(pathname: string): string {
  if (pathname.startsWith('/skills/')) return '/skills/$name'
  return pathname || '/'
}

export function SavedViewMenu() {
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const currentRoute = normalizeRouteId(location.pathname)
  const { data, isLoading } = useSavedViews(currentRoute)
  const { loadedView, setLoadedView } = useLoadedView()
  const deleteMutation = useDeleteView()
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [forkSource, setForkSource] = useState<SavedView | null>(null)

  const triggerLabel = loadedView?.name ?? 'Views'
  const defaultId = getDefaultViewId(currentRoute)
  const pinned = new Set(getPinnedIds())
  const items = data?.items ?? []

  const openSaveDialog = (fork: SavedView | null) => {
    setForkSource(fork)
    setSaveDialogOpen(true)
  }

  const handleOpen = (v: SavedView) => {
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
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <SaveViewDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        fork={forkSource}
        currentRoute={currentRoute}
      />
    </>
  )
}
