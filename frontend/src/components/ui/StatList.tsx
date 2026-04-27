// StatList — Phase 6 Plan 01. Icon + label + value rows. Used by Phase 6
// ProductivityCard and PressurePanel for narrow KPI lists where a 4-up
// KpiTile grid would be visually overwhelming.
//
// `trend` is optional; when provided we render a colored arrow glyph using
// status colors (NOT accents — accent is reserved per UI-SPEC §Color).

import { ReactNode } from 'react'

export interface StatListItem {
  icon?: ReactNode
  label: ReactNode
  value: ReactNode
  trend?: 'up' | 'down' | 'flat'
}

interface StatListProps {
  items: StatListItem[]
  className?: string
}

const TREND_GLYPH: Record<NonNullable<StatListItem['trend']>, string> = {
  up: '\u25b2',
  down: '\u25bc',
  flat: '\u2014',
}

export function StatList({ items, className = '' }: StatListProps) {
  return (
    <ul className={`cmc-stat-list ${className}`.trim()}>
      {items.map((item, idx) => (
        <li key={idx} className="cmc-stat-list__row">
          <span className="cmc-stat-list__label">
            {item.icon ? <span className="cmc-stat-list__icon">{item.icon}</span> : null}
            {item.label}
          </span>
          <span className="cmc-stat-list__value">
            {item.value}
            {item.trend ? (
              <span
                className={`cmc-stat-list__trend--${item.trend}`}
                aria-label={`trend ${item.trend}`}
                style={{ marginLeft: 'var(--space-2xs)' }}
              >
                {TREND_GLYPH[item.trend]}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
