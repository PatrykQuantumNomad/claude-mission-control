/**
 * Saved-views client-side state helpers.
 *
 * Phase 25:
 *   - VIEW-06 — per-route default-view pointer (which saved view loads when
 *     the route opens without explicit search params).
 *   - SHEL-06 — Sidebar Pinned section: the ordered list of saved-view ids
 *     the user has explicitly pinned to the sidebar.
 *   - VIEW-09 — Recent ad-hoc states: per-route FIFO ring of recently
 *     visited search-param shapes, capped at RECENT_STATES_CAP (50).
 *
 * Backed by the typed `cmc.*` localStorage wrapper at lib/storage.ts. Final
 * key shapes:
 *   cmc.savedView.default.<route>     — number id (or absent)
 *   cmc.savedView.pinned              — number[] (insertion-ordered)
 *   cmc.savedView.recent.<route>      — RecentAdHocState[] (newest first)
 *
 * All helpers are silent on storage error (storage.ts swallows quota /
 * unavailable-storage exceptions). Callers can treat these as best-effort
 * cache; the server-persisted saved_views table is the source of truth for
 * the actual view contents.
 */
import { storage } from './storage'

// ────────────────────────────────────────────────
// Per-route default-view pointer (VIEW-06)
// ────────────────────────────────────────────────

/** Returns the saved-view id flagged as default for the given route, or null
 * when no default is set. */
export function getDefaultViewId(route: string): number | null {
  return storage.get<number>(`savedView.default.${route}`) ?? null
}

/** Set (or clear, by passing null) the default-view pointer for a route. */
export function setDefaultViewId(route: string, id: number | null): void {
  if (id === null) {
    storage.remove(`savedView.default.${route}`)
  } else {
    storage.set(`savedView.default.${route}`, id)
  }
}

// ────────────────────────────────────────────────
// Pinned view ids (SHEL-06)
// ────────────────────────────────────────────────

/** Returns the user-pinned saved-view ids in insertion order. Empty when
 * nothing has been pinned (default state for fresh installs). */
export function getPinnedIds(): number[] {
  return storage.get<number[]>('savedView.pinned') ?? []
}

/** Overwrite the pinned-ids list. Callers typically use pinView / unpinView
 * for incremental edits; this is for bulk replacement (drag-reorder UX). */
export function setPinnedIds(ids: number[]): void {
  storage.set('savedView.pinned', ids)
}

/** Add an id to the pinned list (deduped, preserves insertion order). No-op
 * if the id is already pinned. */
export function pinView(id: number): void {
  const current = getPinnedIds()
  if (!current.includes(id)) {
    setPinnedIds([...current, id])
  }
}

/** Remove an id from the pinned list (no-op if it wasn't pinned). */
export function unpinView(id: number): void {
  setPinnedIds(getPinnedIds().filter((x) => x !== id))
}

// ────────────────────────────────────────────────
// Recent ad-hoc states (VIEW-09)
// ────────────────────────────────────────────────

/** Maximum number of recent ad-hoc states retained per route. Exported so
 * tests (and CommandPalette UI affordances) reference the same boundary. */
export const RECENT_STATES_CAP = 50

export interface RecentAdHocState {
  route: string
  /** Validated search-param shape (post-validateSearch). Opaque here; consumers
   * re-coerce on read via the route's named validateSearch export. */
  state: Record<string, unknown>
  /** Date.now() at write time — the "visited at" timestamp surfaced by Cmd+K. */
  visitedAt: number
}

const recentKey = (route: string) => `savedView.recent.${route}` as const

/** Push a state into the route's recent list. FIFO ring with cap =
 * RECENT_STATES_CAP. Returns `{ atCap: true }` when the list was already at
 * the cap before this push (caller can surface a toast/note — VIEW-09
 * requires user-visible feedback at cap). Dedupe is structural by
 * JSON.stringify(state) so oscillating between the same N states does not
 * flood the ring with duplicates. */
export function pushRecentState(state: RecentAdHocState): { atCap: boolean } {
  const current = storage.get<RecentAdHocState[]>(recentKey(state.route)) ?? []

  // Structural dedupe: drop any prior entry whose state matches.
  const incomingKey = JSON.stringify(state.state)
  const filtered = current.filter(
    (e) => JSON.stringify(e.state) !== incomingKey,
  )

  // Prepend the new entry, then truncate to cap.
  const next = [state, ...filtered].slice(0, RECENT_STATES_CAP)
  const atCap = current.length >= RECENT_STATES_CAP

  storage.set(recentKey(state.route), next)
  if (atCap) {
    // Minimum visible signal that the cap was hit. Plan 10 may upgrade this to
    // a toast surface; until then, console.warn is the documented feedback.
    console.warn(
      `[savedViews] recent ad-hoc states cap (${RECENT_STATES_CAP}) reached for route ${state.route}; oldest evicted`,
    )
  }
  return { atCap }
}

/** Returns the recent ad-hoc states for a route, newest first. Empty when
 * nothing has been pushed (default state). */
export function getRecentStates(route: string): RecentAdHocState[] {
  return storage.get<RecentAdHocState[]>(recentKey(route)) ?? []
}

/** Clear all recent ad-hoc states for a route. */
export function clearRecentStates(route: string): void {
  storage.remove(recentKey(route))
}

/** Cross-route: aggregate recents across all known routes. Used by Cmd+K to
 * surface "anywhere recent" suggestions. Caller passes the route list (kept
 * outside this module to avoid coupling to TanStack Router internals). */
export function getAllRecentStates(routes: readonly string[]): RecentAdHocState[] {
  return routes.flatMap((r) => getRecentStates(r))
}
