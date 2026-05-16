// frontend/src/lib/layout/useLayoutState.ts — Phase 28 Plan 02 (LAYO-01..04).
//
// Single hook that bridges the three new Phase 28 URL search params
// (`hidden_panels`, `panel_order`, `split_sizes`) to a consumer-friendly
// `{ isHidden, setHidden, orderedPanels, setOrder, splitSizes, setSplit,
// reset }` interface. All state lives in the URL — NO localStorage, NO
// component-local React state for layout (RESEARCH §1 + Phase 27 invariant).
//
// Why URL is the single source of truth:
//   - Saved views (Phase 25) capture `useRouterState().location.search`
//     verbatim into `state_json`. Layout state piggybacks automatically.
//   - Phase 27 deliberately moved per-panel state OFF localStorage (Plan
//     27-05 cost-by-project, Plan 27-06 alerts) — going backward here
//     would break the invariant + lose the save-view round-trip.
//
// reset() critical invariant (LAYO-04 SC#3 + Pitfall 11):
//   Clears ONLY `hidden_panels` + `panel_order` + `split_sizes`. Preserves
//   `time_from` / `time_to` / `compare_panels` / `range` / `a` / `b` /
//   `schemaVersion` and any future search keys. Uses destructuring-delete
//   (NOT whitelist-spread) so future search keys stay untouched without
//   requiring an explicit allowlist update at this site.
//
// Pitfall 7 graceful drift:
//   `orderedPanels(columnId)` filters unknown panel ids from the URL via
//   `PANEL_REGISTRY[route]` membership. A saved view referencing a panel
//   that was later removed from the registry still loads — the deleted id
//   is silently dropped from the rendered order.
//
// Pitfall 2 undefined-default:
//   `setHidden` / `setOrder` / `setSplit` pass `undefined` (NOT empty
//   string) when the field reduces to the empty set, so the URL param is
//   removed entirely. DefaultViewLoader's bare-URL gate stays intact.

import { useCallback } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { PANEL_REGISTRY, isValidPanelId } from './panelRegistry'

// ───────────────────────────────────────────────────────────────────────
// Pure parsing / serialization helpers (no React deps — testable in
// isolation if a future plan wants to extract them).
// ───────────────────────────────────────────────────────────────────────

/** Parse `hidden_panels` CSV into a Set. Unknown ids pass through — the
 *  caller filters at the read site via `isValidPanelId`. */
function parseHiddenSet(csv: unknown): Set<string> {
  if (typeof csv !== 'string' || csv === '') return new Set()
  return new Set(csv.split(','))
}

function serializeHiddenSet(set: Set<string>): string | undefined {
  if (set.size === 0) return undefined
  // Sort for deterministic fork-save round-trip (Phase 26 Plan 07 precedent).
  return [...set].sort().join(',')
}

/** Parse `panel_order` CSV groups into `Record<columnId, panelId[]>`. */
function parsePanelOrder(csv: unknown): Record<string, string[]> {
  if (typeof csv !== 'string' || csv === '') return {}
  const out: Record<string, string[]> = {}
  for (const group of csv.split(';')) {
    const [columnId, panels] = group.split(':')
    if (!columnId || !panels) continue
    out[columnId] = panels.split(',')
  }
  return out
}

function serializePanelOrder(
  groups: Record<string, string[]>,
): string | undefined {
  const parts: string[] = []
  for (const columnId of Object.keys(groups).sort()) {
    const panels = groups[columnId]
    if (panels.length === 0) continue
    parts.push(`${columnId}:${panels.join(',')}`)
  }
  return parts.length === 0 ? undefined : parts.join(';')
}

/** Parse `split_sizes` CSV groups into `Record<groupId, number[]>`. */
function parseSplitSizes(csv: unknown): Record<string, number[]> {
  if (typeof csv !== 'string' || csv === '') return {}
  const out: Record<string, number[]> = {}
  for (const group of csv.split(';')) {
    const [groupId, sizes] = group.split(':')
    if (!groupId || !sizes) continue
    const parsed = sizes.split(',').map((s) => Number.parseInt(s, 10))
    if (parsed.some((n) => Number.isNaN(n))) continue
    if (parsed.length < 2) continue
    out[groupId] = parsed
  }
  return out
}

function serializeSplitSizes(
  groups: Record<string, number[]>,
): string | undefined {
  const parts: string[] = []
  for (const groupId of Object.keys(groups).sort()) {
    const sizes = groups[groupId]
    if (sizes.length < 2) continue
    parts.push(`${groupId}:${sizes.map((n) => Math.round(n)).join(',')}`)
  }
  return parts.length === 0 ? undefined : parts.join(';')
}

// ───────────────────────────────────────────────────────────────────────
// Hook
// ───────────────────────────────────────────────────────────────────────

export interface UseLayoutState {
  /** True iff the panel is in the URL's `hidden_panels` set. Unknown ids
   *  pass through — callers must combine with `isValidPanelId` at the
   *  render site (Pitfall 7 defense in depth). */
  isHidden: (panelId: string) => boolean
  /** Toggle a panel's hidden state. When the resulting set is empty, the
   *  `hidden_panels` URL param is REMOVED (not set to empty string —
   *  Pitfall 2). */
  setHidden: (panelId: string, hide: boolean) => void
  /** Returns the render-order panel id array for a column. URL-specified
   *  ids come first (in URL order); registry panels NOT in the URL are
   *  appended in registry order. Unknown ids are filtered (Pitfall 7). */
  orderedPanels: (columnId: string) => string[]
  /** Write a column's panel order to the URL. Preserves other columns'
   *  orders. */
  setOrder: (columnId: string, panelIds: string[]) => void
  /** Returns the split-pane size array for a group, or `undefined` when
   *  the URL has no override (caller provides defaultSizes). */
  splitSizes: (groupId: string) => number[] | undefined
  /** Set a group's split sizes. `null` OR an empty array PRUNES the group
   *  from `split_sizes` (consumed by Plan 28-05's double-click reset).
   *  When no groups remain, `split_sizes` is removed from the URL
   *  entirely (Pitfall 2 lock). */
  setSplit: (groupId: string, sizes: number[] | null) => void
  /** Clear ONLY `hidden_panels` + `panel_order` + `split_sizes`. Preserves
   *  all other search keys (LAYO-04 SC#3 + Pitfall 11). No-op when none of
   *  the three layout keys are present (avoids history pollution). */
  reset: () => void
}

export function useLayoutState(route: string): UseLayoutState {
  const navigate = useNavigate()
  const search = useRouterState({
    select: (s) => s.location.search,
  }) as Record<string, unknown>

  const isHidden = useCallback(
    (panelId: string): boolean => {
      const set = parseHiddenSet(search.hidden_panels)
      return set.has(panelId)
    },
    [search.hidden_panels],
  )

  const setHidden = useCallback(
    (panelId: string, hide: boolean): void => {
      const set = parseHiddenSet(search.hidden_panels)
      if (hide) set.add(panelId)
      else set.delete(panelId)
      const next = serializeHiddenSet(set)
      void navigate({
        to: '.',
        // Cast through `never` per Phase 26 TimePicker precedent — TanStack
        // Router's per-route Search types refuse the generic
        // `Record<string, unknown>` mutator shape; the hook is route-agnostic
        // by design (each route's validateSearch handles unknown-field-drop).
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          hidden_panels: next,
        })) as never,
        replace: true,
      })
    },
    [navigate, search.hidden_panels],
  )

  const orderedPanels = useCallback(
    (columnId: string): string[] => {
      const groups = parsePanelOrder(search.panel_order)
      const urlList = groups[columnId] ?? []
      const registryForRoute = PANEL_REGISTRY[route] ?? []
      const registryForColumn = registryForRoute
        .filter((p) => p.columnId === columnId)
        .map((p) => p.panelId)
      // Filter unknown ids from URL (Pitfall 7 defense in depth).
      const validFromUrl = urlList.filter((id) => isValidPanelId(route, id))
      const urlSet = new Set(validFromUrl)
      // Registry-known panels NOT in URL appended in registry order.
      const trailing = registryForColumn.filter((id) => !urlSet.has(id))
      return [...validFromUrl, ...trailing]
    },
    [route, search.panel_order],
  )

  const setOrder = useCallback(
    (columnId: string, panelIds: string[]): void => {
      const groups = parsePanelOrder(search.panel_order)
      groups[columnId] = panelIds
      const next = serializePanelOrder(groups)
      void navigate({
        to: '.',
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          panel_order: next,
        })) as never,
        replace: true,
      })
    },
    [navigate, search.panel_order],
  )

  const splitSizes = useCallback(
    (groupId: string): number[] | undefined => {
      const groups = parseSplitSizes(search.split_sizes)
      return groups[groupId]
    },
    [search.split_sizes],
  )

  const setSplit = useCallback(
    (groupId: string, sizes: number[] | null): void => {
      const groups = parseSplitSizes(search.split_sizes)
      if (sizes === null || sizes.length === 0) {
        // Prune the named group; if no groups remain, the serializer
        // returns undefined and the URL param is removed entirely.
        delete groups[groupId]
      } else {
        groups[groupId] = sizes.map((n) => Math.round(n))
      }
      const next = serializeSplitSizes(groups)
      void navigate({
        to: '.',
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          split_sizes: next,
        })) as never,
        replace: true,
      })
    },
    [navigate, search.split_sizes],
  )

  const reset = useCallback((): void => {
    // No-op when the URL has no layout overrides — avoid history pollution
    // from accidentally clicking reset when nothing is customized.
    if (
      !search.hidden_panels &&
      !search.panel_order &&
      !search.split_sizes
    ) {
      return
    }
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => {
        // Destructuring-delete pattern — preserves time_from / time_to /
        // compare_panels / range / a / b / schemaVersion / and any future
        // search keys (LAYO-04 SC#3 / Pitfall 11). DO NOT replace with a
        // whitelist-spread; that breaks append-only-safety against future
        // search-key additions.
        const next = { ...prev }
        delete next.hidden_panels
        delete next.panel_order
        delete next.split_sizes
        return next
      }) as never,
      replace: true,
    })
  }, [
    navigate,
    search.hidden_panels,
    search.panel_order,
    search.split_sizes,
  ])

  return {
    isHidden,
    setHidden,
    orderedPanels,
    setOrder,
    splitSizes,
    setSplit,
    reset,
  }
}
