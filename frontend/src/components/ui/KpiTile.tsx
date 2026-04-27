// KpiTile — Phase 6 Plan 01. Display-size value + uppercase mono label with
// an optional subline. Used 4-up in KpiRow on the home dashboard. `mono`
// renders the value in JetBrains Mono with tabular-nums; default is body
// font for word values like "Healthy".

import { ReactNode } from 'react'

interface KpiTileProps {
  label: ReactNode
  value: ReactNode
  sublabel?: ReactNode
  mono?: boolean
  className?: string
}

export function KpiTile({ label, value, sublabel, mono = false, className = '' }: KpiTileProps) {
  return (
    <div className={`cmc-kpi-tile ${className}`.trim()}>
      <span className="cmc-kpi-tile__label">{label}</span>
      <span
        className={`cmc-kpi-tile__value ${mono ? 'cmc-kpi-tile__value--mono' : ''}`.trim()}
      >
        {value}
      </span>
      {sublabel ? <span className="cmc-kpi-tile__sublabel">{sublabel}</span> : null}
    </div>
  )
}
