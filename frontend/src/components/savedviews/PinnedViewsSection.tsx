// PinnedViewsSection — Phase 25 Plan 09 (SHEL-06).
//
// Renders the Sidebar's "Pinned" section: a cross-route list of saved views
// the user has explicitly pinned via the SavedViewMenu submenu. Mirrors the
// Configure empty-section precedent from Phase 24 plan-04 — the section header
// is ALWAYS visible, the body is the dynamic list (or an empty-state hint
// when the user has not pinned anything yet).
//
// Data sources:
//   - cross-route `useSavedViews()` (no route filter) for the full catalog.
//   - `getPinnedIds()` from lib/savedViews — localStorage-backed user pin list.
//   - `useLoadedView()` from LoadedViewContext (Plan 06) — for active-state.
//   - `useRouterState({ select: s => s.location })` — pathname + search for the
//     active-state algorithm.
//
// Active-state algorithm (Research Pitfall 9 — locked recommendation):
//   A pinned-view row shows the accent ONLY when BOTH the pathname-prefix
//   matches the view's route AND the URL's search params structurally equal
//   the view's state_json. Pathname-only matching would incorrectly accent
//   ALL pinned views on a route when only one of them is "loaded" — the
//   stableStringify compare is the only way to disambiguate.
//
// Cross-route navigability v1 limitation: a SavedView's state_json is
// search-only — it does NOT carry the resolved value for dynamic route
// segments (e.g. /skills/$name). routePathFromId from CommandPalette
// encapsulates the navigability decision: static routes navigate verbatim;
// dynamic-segment views navigate ONLY when the user is already on a matching
// base prefix (so the dynamic value is implicitly preserved). Otherwise the
// click soft-warns and exits — see Plan 08 for the same lock.
//
// localStorage same-tab limitation (carried forward to Plan 11 e2e):
// `cmc.savedView.pinned` writes from SavedViewMenu (DropdownMenu pin/unpin
// submenu actions) do NOT trigger the browser 'storage' event in the SAME
// tab — only OTHER tabs receive that event. So this section's rendered list
// can lag a tab-local pin/unpin by exactly one render cycle. The user
// typically navigates after pinning (closing the menu re-renders the tree),
// so the lag is invisible in practice. Plan 11 e2e Playwright case will
// reload between the pin action and the assertion.

import { useMemo } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Pin } from 'lucide-react'
import { SidebarSection } from '../shell/SidebarSection'
import { useSavedViews } from '../../lib/queries'
import { getPinnedIds } from '../../lib/savedViews'
import { useLoadedView } from './LoadedViewContext'
import { routePathFromId } from '../ui/CommandPalette'
import type { SavedView } from '../../lib/api'

/** Stable structural compare — same shape as UnsavedPip's stableStringify
 * (Plan 06). The `schemaVersion` field is excluded because it's a SavedView
 * structural attribute, not a user-meaningful search-state key. Keys are
 * sorted at every depth so {a:1,b:2} and {b:2,a:1} compare equal.
 *
 * Pure function so the test suite can rely on deterministic output without
 * mounting the React tree.
 */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj) ?? 'null'
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`
  const o = obj as Record<string, unknown>
  const keys = Object.keys(o)
    .filter((k) => k !== 'schemaVersion')
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
}

/** Compute the active-state for a single pinned view against the current
 * location. Returns true only when BOTH conditions hold:
 *   1. The pathname matches the view's route — for static routes that's an
 *      exact equality; for dynamic-segment routes (e.g. `/skills/$name`) the
 *      pathname must start with the base prefix (`/skills/`).
 *   2. The structural compare of the view's `state_json` and the URL search
 *      params is equal (ignoring `schemaVersion`).
 *
 * Exported for vitest. The component composes this with `stableStringify`
 * over the current `location.search`.
 */
export function isPinnedViewActive(
  view: SavedView,
  currentPathname: string,
  currentSearch: unknown,
): boolean {
  // Pathname check: static routes are exact-equal; dynamic routes match by
  // base prefix only (param value is encoded in the path, not state_json).
  const isDynamic = view.route.includes('$')
  const base = isDynamic ? view.route.split('/$')[0] : view.route
  const pathnameMatches = isDynamic
    ? currentPathname === base || currentPathname.startsWith(base + '/')
    : currentPathname === view.route
  if (!pathnameMatches) return false
  // Structural search compare — both sides via stableStringify so order +
  // schemaVersion don't cause false negatives.
  return stableStringify(view.state_json) === stableStringify(currentSearch)
}

export function PinnedViewsSection() {
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  // Cross-route fetch (no route filter) — the section surfaces views from
  // every route. Backed by the same React Query cache slot that
  // CommandPalette uses (qk.savedViews()), so the Pinned section and the
  // Cmd+K Saved Views group stay coherent under any mutation.
  const { data: allViews } = useSavedViews()
  const { setLoadedView } = useLoadedView()

  // Read pinned ids at render time. localStorage reads inside render are
  // safe in this codebase (lib/density.ts and lib/sidebar.ts use the same
  // pattern) — happy-dom + jsdom both seed window.localStorage by default.
  const pinnedIds = getPinnedIds()

  // Build the actual rendered list: intersect pinned ids with the fetched
  // catalog, preserving insertion order from `pinnedIds`. Filter out ids
  // that no longer exist in the catalog (deleted views) — fail-soft.
  const pinnedViews = useMemo<SavedView[]>(() => {
    if (!allViews) return []
    const byId = new Map(allViews.items.map((v) => [v.id, v]))
    return pinnedIds
      .map((id) => byId.get(id))
      .filter((v): v is SavedView => Boolean(v))
    // pinnedIds is read at every render (storage-backed), so excluding it
    // from deps would not stale-close — but eslint expects it listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allViews, pinnedIds.join(',')])

  return (
    <SidebarSection title="Pinned" testId="sidebar-section-pinned">
      {pinnedViews.length === 0 && (
        <div className="cmc-sidebar__pinned-empty" data-testid="sidebar-pinned-empty">
          Pin a saved view from the header menu
        </div>
      )}
      {pinnedViews.map((v) => {
          const active = isPinnedViewActive(v, location.pathname, location.search)
          return (
            <button
              key={v.id}
              type="button"
              className={`cmc-sidebar__navlink ${active ? 'cmc-sidebar__navlink--active' : ''}`}
              data-testid={`sidebar-pinned-view-${v.id}`}
              data-active={active ? 'true' : 'false'}
              onClick={() => {
                const target = routePathFromId(v.route, location.pathname)
                if (target === null) {
                  // Dynamic-segment view that can't be navigated from this
                  // pathname — soft warn so the user gets feedback, but
                  // don't navigate. Matches Plan 08's CommandPalette
                  // contract for the same v1 limitation.
                  console.warn(
                    `[Sidebar] Pinned view "${v.name}" requires a specific entity — navigate to its base route first.`,
                  )
                  return
                }
                navigate({
                  to: target,
                  search: v.state_json as Record<string, unknown>,
                })
                setLoadedView(v)
              }}
              title={`${v.name} (${v.route})`}
              aria-current={active ? 'page' : undefined}
            >
              <Pin
                size={14}
                aria-hidden
                className="cmc-sidebar__navlink-icon"
              />
              <span className="cmc-sidebar__navlink-label">{v.name}</span>
            </button>
          )
        })}
    </SidebarSection>
  )
}
