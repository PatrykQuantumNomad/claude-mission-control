// PlaceholderCardGrid — Phase 5 Plan 04 (Wave 3 page grids).
//
// Generic grid that maps a list of {reqId, title, dataNoun} into Card +
// EmptyState placeholders. Phase 6/7 will replace each placeholder with
// the real domain panel keyed by `reqId`.
//
// Surface contract:
// - One <Card> per slot, rendered with a kicker (cmc-label) showing the
//   Phase-6/7 requirement id, the panel title, and an EmptyState body using
//   the UI-SPEC default template ("Once {data-noun} arrives it will appear
//   here. Run sync from the header to refresh.").
// - Outer <div> uses `.cmc-card-grid` (auto-fit minmax(320px, 1fr) +
//   grid-auto-rows: 1fr — DESG-04 matched-height responsive grid).
//
// The component is consumed by routes/index.tsx (OPNL-*),
// routes/activity.tsx (ACTV-*), routes/skills.tsx (HPNL/TPNL/SKLP).

import { Inbox } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, EmptyState } from './ui'

export interface PlaceholderSlot {
  /** Phase 6/7 requirement id surfaced as the card kicker (e.g. "OPNL-04"). */
  reqId: string
  /** Human-friendly panel name (e.g. "Live Sessions"). */
  title: string
  /** Noun substituted into the UI-SPEC empty body template. */
  dataNoun: string
}

interface PlaceholderCardGridProps {
  slots: PlaceholderSlot[]
}

export function PlaceholderCardGrid({ slots }: PlaceholderCardGridProps) {
  return (
    <div className="cmc-card-grid">
      {slots.map(({ reqId, title, dataNoun }) => (
        <Card key={reqId}>
          <CardHeader>
            <CardDescription className="cmc-label">{reqId}</CardDescription>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<Inbox aria-hidden />}
              heading="Nothing to show yet"
              body={`Once ${dataNoun} arrives it will appear here. Run sync from the header to refresh.`}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
