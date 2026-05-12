// UnsavedPip — Phase 25 Plan 06 (VIEW-08).
//
// Tiny visual badge next to the SavedViewMenu trigger. Visible only when:
//   1. A saved view is loaded (LoadedViewContext.loadedView !== null), AND
//   2. The current URL search differs from loadedView.state_json.
//
// Comparison strategy: stableStringify() — a property-sorted JSON serializer
// that strips `schemaVersion` before hashing. schemaVersion is a metadata
// field appended by validateSearch on every URL read; it's not "user state",
// so it must not register as divergence. Pitfall 7 in 25-RESEARCH.md.
//
// stableStringify is kept inline (NOT pulled from lib/) because the only
// other consumer that needs structural-equal-of-URL-state is the recent
// ad-hoc-states FIFO (lib/savedViews.ts), and that uses JSON.stringify
// directly — its inputs are already validated post-validateSearch, so the
// property-order question doesn't materially affect dedupe. Centralising
// would add coupling for one bit of normalization that this component
// uniquely needs.

import { useMemo } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useLoadedView } from './LoadedViewContext'

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj !== 'object') return JSON.stringify(obj) ?? 'null'
  if (Array.isArray(obj)) {
    return `[${obj.map((v) => stableStringify(v)).join(',')}]`
  }
  const o = obj as Record<string, unknown>
  const keys = Object.keys(o)
    .filter((k) => k !== 'schemaVersion')
    .sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`
}

/** Returns true when the current URL search diverges from the loaded view's
 * state_json. Returns false when nothing is loaded. */
export function useUrlDivergesFromLoadedView(): boolean {
  const { loadedView } = useLoadedView()
  const search = useRouterState({ select: (s) => s.location.search })
  return useMemo(() => {
    if (!loadedView) return false
    return stableStringify(search) !== stableStringify(loadedView.state_json)
  }, [search, loadedView])
}

export function UnsavedPip() {
  const diverged = useUrlDivergesFromLoadedView()
  if (!diverged) return null
  return (
    <span
      className="cmc-unsaved-pip"
      data-testid="unsaved-pip"
      role="status"
      aria-label="Unsaved changes to the loaded saved view"
      title="Unsaved changes"
    />
  )
}
