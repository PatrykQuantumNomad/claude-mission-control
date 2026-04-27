// Phase 5 layout-primitives barrel — Plan 05-02 (Wave 1 layout primitives).
// Plan 05-03 will append Sheet / CollapsibleSection / CommandPalette here.
// Plan 05-04 + Phase 6 + Phase 7 import every primitive from this module
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
// Sheet, CollapsibleSection, CommandPalette land in Plan 05-03 — append exports there.
