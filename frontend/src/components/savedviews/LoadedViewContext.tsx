// LoadedViewContext — Phase 25 Plan 06 (VIEW-04 / VIEW-05 / VIEW-08).
//
// Lightweight React Context exposing "which saved view (if any) is currently
// loaded into the URL". Read by every saved-view chrome consumer:
//
//   - SavedViewMenu (this plan)     — trigger label reflects loaded.name
//   - UnsavedPip    (this plan)     — compares loaded.state_json to URL search
//   - SaveViewDialog (this plan)    — sets loaded after a fresh create
//   - EditOrForkDialog (Plan 07)    — patches or forks the loaded view
//   - Sidebar Pinned section (Plan 09) — highlights the active row
//   - CommandPalette (Plan 08)      — surfaces "current view" affordance
//   - DefaultViewLoader (Plan 10)   — sets loaded when boot-time default fires
//
// Pattern is deliberately tiny: a single `loadedView` slot + setter. No
// reducer, no derived state — divergence logic lives in UnsavedPip's
// stableStringify (the only consumer that needs to compare). Plans that mount
// inside this provider can call setLoadedView(null) on unmount if they own
// transient loaded state; the current consumers (SavedViewMenu Open action +
// SaveViewDialog onSuccess) are explicit setters with no implicit cleanup.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { SavedView } from '../../lib/api'

export interface LoadedViewContextValue {
  loadedView: SavedView | null
  setLoadedView: (v: SavedView | null) => void
}

const LoadedViewContext = createContext<LoadedViewContextValue | null>(null)

export function LoadedViewProvider({ children }: { children: ReactNode }) {
  const [loadedView, setLoadedView] = useState<SavedView | null>(null)
  const value = useMemo<LoadedViewContextValue>(
    () => ({ loadedView, setLoadedView }),
    [loadedView],
  )
  return (
    <LoadedViewContext.Provider value={value}>
      {children}
    </LoadedViewContext.Provider>
  )
}

export function useLoadedView(): LoadedViewContextValue {
  const ctx = useContext(LoadedViewContext)
  if (!ctx) {
    throw new Error('useLoadedView must be used within LoadedViewProvider')
  }
  return ctx
}
