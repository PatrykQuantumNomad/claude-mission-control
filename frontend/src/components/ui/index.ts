// current layout-primitives barrel — implementation (later work layout primitives).
// implementation will append Sheet / CollapsibleSection / CommandPalette here.
// implementation + current + current import every primitive from this module
// (NOT from the individual files) so the surface area is observable in one place.

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card'
export { Button } from './Button'
export { Badge } from './Badge'
export { StatePill } from './StatePill'
export { Tooltip } from './Tooltip'
export { Skeleton } from './Skeleton'
export { EmptyState } from './EmptyState'
export { RelativeTime, formatRelative } from './RelativeTime'
export { ShellErrorBoundary, ShellErrorFallback } from './ErrorBoundary'
// current — interactive primitives
export { Sheet } from './Sheet'
export { CollapsibleSection } from './CollapsibleSection'
export { CommandPalette } from './CommandPalette'
// current panel primitives
export { PanelCard } from './PanelCard'
export type { PanelCardEmpty } from './PanelCard'
// Phase 24 Plan 03 — containment primitives (CONT-03 / CONT-04).
export { BoundedPanelCard } from './BoundedPanelCard'
export { TruncatedCell } from './TruncatedCell'
export { CopyIconButton } from './CopyIconButton'
export { RangeToggle } from './RangeToggle'
export type { RangeOption } from './RangeToggle'
export { DataTable } from './DataTable'
export type { DataTableColumn, DataTableSort } from './DataTable'
export { HeatmapGrid } from './HeatmapGrid'
export type { HeatmapCell } from './HeatmapGrid'
export { StatList } from './StatList'
export type { StatListItem } from './StatList'
export { KpiTile } from './KpiTile'
export { ErrorState } from './ErrorState'
// current destructive-confirm primitive
export { AlertDialog } from './AlertDialog'
// Phase 19 Plan 04 — SKLP-09 period-over-period delta pill primitive.
export { DeltaPill } from './DeltaPill'
export type { DeltaPillProps } from './DeltaPill'
// Phase 28 Plan 03 — LAYO-01 / LAYO-04 per-panel show/hide menu.
export { PanelHeaderMenu } from './PanelHeaderMenu'
// Phase 28 Plan 04 — LAYO-02 drag-reorder wrapper (native HTML5 dnd +
// keyboard a11y + aria-live announcements).
export { DraggablePanelWrap } from './DraggablePanelWrap'
// Phase 28 Plan 03 — shared forwarding-prop shape for panels that
// participate in layout customization. Every in-scope panel component
// (~36 across /, /activity, /cost, /skills, /alerts) accepts these two
// optional props and forwards them verbatim to its internal PanelCard.
// The route mounts the panel as:
//   <FooBarCard panelId="foo-bar" headerMenu={<PanelHeaderMenu panelId="foo-bar" label="Foo bar" />} />
// Render-time filtering is applied at the route via useLayoutState.isHidden.
export type LayoutCustomizableProps = {
  panelId?: string
  headerMenu?: import('react').ReactNode
}
