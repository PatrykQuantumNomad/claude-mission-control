// CompareToggle — Phase 26 Plan 07 (TIME-04).
//
// Per-panel "compare to previous period" toggle. Lives in panel header chrome
// next to the existing per-panel range/affordance row. Writes to URL via a
// single CSV param `compare_panels` (e.g.
// `?compare_panels=token-usage,session-outcomes`). RESEARCH Open Q #2: a
// single-param CSV is easier to validate, easier to fork-save into a saved
// view's state_json, and produces lower URL noise than one-key-per-panel.
//
// Reading: useRouterState gives the current CSV. Toggle is active when
// `panelId` appears in the parsed set. Writing: function-form navigate
// splices `panelId` in or out, then normalizes (sort + de-dupe + drop empty)
// so the serialized CSV is deterministic — same URL whether the user toggled
// a, b in that order or b, a — which is what saved-view fork-save needs to
// round-trip the state_json (Phase 25 architecture: URL is the only ingress
// to state_json; `validateSearch` is the only gatekeeper).
//
// Validator contract: shape is enforced by `asComparePanels` in
// `lib/searchSchemas.ts`. Malformed values drop silently to undefined on
// read (defense in depth — clipboard paste, saved-view hydration, manual URL
// edits all re-validate through the same seam).
//
// SCHEMA_VERSION stays at 1 (append-only extension — Pitfall 2 + 13).

import { useNavigate, useRouterState } from '@tanstack/react-router'
import { GitCompareArrows } from 'lucide-react'

interface Props {
  /**
   * The panel id to toggle in/out of `compare_panels`. Must match the
   * shape accepted by `asComparePanels`: lowercase alphanumeric plus
   * `_` and `-`. Examples: `token-usage`, `session-outcomes`,
   * `cache_efficiency`.
   */
  panelId: string
}

function parseCsv(csv: string | undefined): Set<string> {
  if (!csv) return new Set()
  // Defensive: drop empty fragments (`,,` or trailing/leading commas)
  // even though the validator already rejects those shapes — a saved
  // view that hydrated under an older validator with looser rules must
  // still parse cleanly.
  return new Set(csv.split(',').filter(Boolean))
}

function serializeCsv(set: Set<string>): string | undefined {
  if (set.size === 0) return undefined
  // Sort for deterministic serialization (fork-save round-trip needs the
  // same URL for the same set, regardless of toggle order).
  return Array.from(set).sort().join(',')
}

export function CompareToggle({ panelId }: Props) {
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const search = (location.search ?? {}) as Record<string, unknown>
  const csv =
    typeof search.compare_panels === 'string'
      ? search.compare_panels
      : undefined
  const set = parseCsv(csv)
  const active = set.has(panelId)

  function toggle() {
    const next = new Set(set)
    if (active) next.delete(panelId)
    else next.add(panelId)
    const serialized = serializeCsv(next)
    navigate({
      // The pathname is whatever route we're currently on — there is no
      // statically-typed alternative because the toggle is route-agnostic
      // (mounted on `/`, `/activity`, `/sessions/compare`, plus any future
      // adopting route). The `as never` casts mirror Plan 03 (TimePicker)
      // and Plan 06 (CommandPalette): TanStack Router's literal-string
      // `to` type doesn't accept a runtime pathname, and the search reducer
      // function-form type is narrowed per-route — both need the escape
      // hatch when the component is route-agnostic.
      to: location.pathname as never,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        compare_panels: serialized,
      })) as never,
    })
  }

  return (
    <button
      type="button"
      className={`cmc-compare-toggle cmc-btn cmc-btn--ghost${
        active ? ' cmc-compare-toggle--active' : ''
      }`}
      data-testid={`compare-overlay-toggle-${panelId}`}
      aria-pressed={active}
      aria-label={`Compare with previous period for ${panelId}`}
      onClick={toggle}
    >
      <GitCompareArrows size={12} aria-hidden />
      <span>Compare</span>
    </button>
  )
}
