// ResizablePanelGroup — Phase 28 Plan 28-05 (LAYO-03).
//
// Thin wrapper around react-resizable-panels@4 that bridges the user-chosen
// split percentages through the URL `split_sizes` CSV param via
// `useLayoutState.setSplit(groupId, sizes | null)`. The hook contract is
// shipped by Plan 28-02; this component is a pure consumer.
//
// CRITICAL Pitfall 1 (v4 vocabulary):
//   v4 renamed the public API. We MUST import:
//     - `Group`     (NOT `PanelGroup`)
//     - `Panel`     (unchanged — consumers import directly)
//     - `Separator` (NOT `PanelResizeHandle`)
//     - `orientation` prop on Group (NOT `direction`)
//   Any future copy-paste from shadcn-ui examples / AI-generated snippets
//   that uses the pre-v4 names will fail compile against this import line.
//
// CRITICAL Pitfall 6 (perf gate — URL write timing):
//   The library exposes BOTH `onLayoutChange` (fires on every pointermove
//   during drag — a router commit storm) AND `onLayoutChanged` (fires once
//   at pointerup release). We MUST wire URL writes to `onLayoutChanged`.
//   Failing this gate would re-render every chart on every pixel of drag
//   motion, regressing Phase 24/26/27's ResponsiveContainer-count = 8 lock.
//
// Pitfall 13 (bounded page flex-ladder):
//   The CSS in `frontend/src/styles.css` includes `min-height: 0` on
//   `.cmc-resizable-group` so the wrapper participates in the
//   `.cmc-page--bounded` flex ladder without overflowing the viewport.
//
// IMPORTANT v4 Layout shape clarification (deviation from RESEARCH.md §1
// `type Layout = number[]` — actual library type is an id-keyed map):
//   v4's `Layout` is `{ [panelId: string]: number }` — a map keyed by each
//   Panel's `id` prop (the flexGrow weight; relative, not %-clamped). The
//   URL `split_sizes` param is a POSITIONAL CSV (`compare:50,50`) so this
//   wrapper accepts an explicit `panelIds` array that maps URL positions
//   to Panel ids. The order MUST match the order of `<Panel id="…">`
//   children passed by the consumer. The wrapper:
//     - reads URL CSV → `[a, b]` → builds Layout `{[panelIds[0]]: a, [panelIds[1]]: b}`
//     - on `onLayoutChanged` receives Layout map → reads values at `panelIds[i]`
//       → serializes back to positional `[a, b]` for the URL
//
// Double-click reset semantics (LAYO-03 SC#2):
//   react-resizable-panels' Separator has built-in double-click-to-reset
//   behaviour (`disableDoubleClick` defaults to false — left at default
//   per the plan). On dblclick, the library resets adjacent Panels to their
//   `defaultSize` and fires `onLayoutChanged` with the default-matching
//   sizes. This wrapper detects the match against the consumer-supplied
//   `defaultSizes` (within ±1% tolerance per element to accommodate the
//   library's internal flex-basis rounding) and calls
//   `setSplit(groupId, null)` — the documented PRUNE path in Plan 28-02 that
//   removes the group from `split_sizes` entirely (and, when no groups
//   remain, removes the URL param itself — Pitfall 2 bare-URL gate).

import { useCallback, Children, Fragment, type ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import {
  Group,
  Separator,
  type Layout,
  // v4 vocabulary — see Pitfall 1 banner above. DO NOT change to
  // PanelGroup / PanelResizeHandle / direction.
} from 'react-resizable-panels'
import { useLayoutState } from '../../lib/layout/useLayoutState'

export interface ResizablePanelGroupProps {
  /** Matches the URL `split_sizes` group key. The PRUNE path keys off this. */
  groupId: string
  /**
   * Ordered list of Panel `id` props — positional URL CSV index ↔ Panel id
   * map. MUST match the order of `<Panel id="…">` children passed by the
   * consumer (length identical; same ids).
   */
  panelIds: string[]
  /** Initial layout when the URL has no override. Percentages, sum ≈ 100.
   *  Positional — index i corresponds to `panelIds[i]`. */
  defaultSizes: number[]
  /** Layout direction. Default horizontal (col-resize cursor on Separator). */
  orientation?: 'horizontal' | 'vertical'
  /** Optional className appended to the inner `.cmc-resizable-group`. */
  className?: string
  /** `Panel` children. A Separator is auto-inserted between every pair. */
  children: ReactNode
}

/**
 * Round each layout entry to an integer percentage — matches the serializer
 * in `useLayoutState.serializeSplitSizes` which floor-rounds for URL output.
 */
function roundLayout(layout: number[]): number[] {
  return layout.map((n) => Math.round(n))
}

/**
 * Does the rounded layout match the consumer's `defaultSizes` (within ±1%
 * per element)? The library's internal flex-basis pipeline can return e.g.
 * 50.0000001 / 49.9999999 from a clean double-click reset — the tolerance
 * absorbs that floating-point drift so the prune path fires reliably.
 */
function matchesDefaults(rounded: number[], defaults: number[]): boolean {
  if (rounded.length !== defaults.length) return false
  for (let i = 0; i < rounded.length; i++) {
    if (Math.abs(rounded[i] - defaults[i]) > 1) return false
  }
  return true
}

/** Build a Layout map from positional sizes — keys are Panel ids in order. */
function toLayoutMap(panelIds: string[], sizes: number[]): Layout {
  const map: Layout = {}
  for (let i = 0; i < panelIds.length; i++) {
    map[panelIds[i]] = sizes[i] ?? 0
  }
  return map
}

/** Extract positional sizes from a Layout map using `panelIds` for order. */
function fromLayoutMap(panelIds: string[], layout: Layout): number[] {
  return panelIds.map((id) => layout[id] ?? 0)
}

export function ResizablePanelGroup({
  groupId,
  panelIds,
  defaultSizes,
  orientation = 'horizontal',
  className,
  children,
}: ResizablePanelGroupProps) {
  // Pathname → useLayoutState (route-keyed registry lookup). Same vocabulary
  // as PanelHeaderMenu — pathname is the source of truth.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { splitSizes, setSplit } = useLayoutState(pathname)

  // Seed `defaultLayout` from URL when present, else from the prop. The
  // library copies this value into its internal state on mount; subsequent
  // updates flow through the `onLayoutChanged` callback (NOT a controlled
  // re-render via `defaultLayout` prop changes — Pitfall 1 lock).
  const sizes = splitSizes(groupId) ?? defaultSizes
  const initial = toLayoutMap(panelIds, sizes)

  const handleLayoutChanged = useCallback(
    (layout: Layout): void => {
      const positional = fromLayoutMap(panelIds, layout)
      const rounded = roundLayout(positional)
      if (matchesDefaults(rounded, defaultSizes)) {
        // PRUNE — drops the group from split_sizes; serializer removes the
        // URL param entirely when no groups remain (Pitfall 2 bare-URL gate
        // stays intact).
        setSplit(groupId, null)
      } else {
        setSplit(groupId, rounded)
      }
    },
    [defaultSizes, groupId, panelIds, setSplit],
  )

  // Interleave Panel children with auto-inserted Separator siblings between
  // every pair. The library requires separators as DIRECT DOM CHILDREN of
  // the Group (Fragment wrapping breaks v4's child enumeration). React
  // unwraps Fragment children when reconciling against the parent, so the
  // Fragment around each panel is safe (it disappears at render time).
  const panels = Children.toArray(children)
  const interleaved: ReactNode[] = []
  for (let i = 0; i < panels.length; i++) {
    interleaved.push(<Fragment key={`panel-${i}`}>{panels[i]}</Fragment>)
    if (i < panels.length - 1) {
      // v4 Separator emits `data-testid={id}` and `id={id}` from its `id` prop
      // (the library's spread order overrides any caller-supplied data-testid
      // — verified in dist/react-resizable-panels.js line 2179). To get the
      // `resize-handle-${groupId}` testid registered in docs/testid-registry.md,
      // we MUST pass it via the `id` prop. For groups with more than two
      // panels this would collide (multiple separators with the same id /
      // testid); for LAYO-03 the only group is `compare` (2 panels = 1
      // separator) so the single id is unique. A future group with N>2 panels
      // would need to switch to `${groupId}-${i}` and update the testid pattern.
      const separatorId =
        panels.length === 2
          ? `resize-handle-${groupId}`
          : `resize-handle-${groupId}-${i}`
      interleaved.push(
        <Separator
          key={`sep-${groupId}-${i}`}
          id={separatorId}
          className="cmc-resizable-separator"
        />,
      )
    }
  }

  const groupClass = className
    ? `cmc-resizable-group ${className}`
    : 'cmc-resizable-group'

  return (
    <Group
      orientation={orientation}
      defaultLayout={initial}
      onLayoutChanged={handleLayoutChanged}
      className={groupClass}
      data-orientation={orientation}
    >
      {interleaved}
    </Group>
  )
}
