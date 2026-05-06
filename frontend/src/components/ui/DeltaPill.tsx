// DeltaPill — SKLP-09 (Phase 19 Plan 04).
//
// Pure presentation primitive for period-over-period deltas. Renders an
// inline-flex pill with three children:
//   1. directional glyph: ↑ (up) / ↓ (down) / · (flat)
//   2. absolute change formatted as integer (locale-grouped) or currency
//   3. percent change in parens — '—' when null (server signals "no
//      baseline" via deltaPct=null when prev=0; we never fabricate +0% / +inf%)
//
// Typing:
//   - delta: number — backend serializes the underlying Decimal as a JSON
//     STRING (Pydantic v2 default). Callers MUST coerce via Number() before
//     passing here. Numeric-only signature keeps this primitive cheap to
//     reason about (no string-vs-number branching inside).
//   - deltaPct: number | null — already in fractional form (0.45 == +45%).
//     null sentinel means "prev was zero, no baseline" per backend
//     RESEARCH §Pattern 3. Server is the source of truth on this decision.
//   - format: 'integer' | 'currency' — controls the abs renderer only. The
//     percent always renders as '+NN%' / '-NN%' regardless of format.
//
// Color/sign treatment: a single CSS-variable accent per sign
// (`cmc-delta-pill--up` / `--down` / `--flat`). Backend's `direction`
// field is NOT consumed here — we re-derive from delta locally so the
// component is decoupled from the wire shape (callers pass primitive
// numbers, not the whole DeltaPill DTO).
//
// aria-label is fully realized so screen readers don't read the glyph
// alone (which would be a meaningless "down arrow" for decrement).

import type { HTMLAttributes } from 'react'

export interface DeltaPillProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Absolute delta — backend curr - prev. Number-coerced by caller from
   * the Decimal-as-JSON-string wire shape. */
  delta: number
  /** Percent change in fractional form (0.45 == +45%). null when prev was
   * zero — render '—' rather than fabricating +0% / +inf%. */
  deltaPct: number | null
  /** Format hint for the absolute value. Default 'integer' (locale-grouped);
   * 'currency' renders '$NN.NN' with two decimals. */
  format?: 'integer' | 'currency'
}

const _intFormatter = new Intl.NumberFormat('en')

export function DeltaPill({
  delta,
  deltaPct,
  format = 'integer',
  className = '',
  ...rest
}: DeltaPillProps) {
  const sign = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const direction = sign === 'up' ? '↑' : sign === 'down' ? '↓' : '·'
  const absStr =
    format === 'currency'
      ? `$${Math.abs(delta).toFixed(2)}`
      : _intFormatter.format(Math.abs(delta))
  const pctStr =
    deltaPct === null
      ? '—'
      : `${deltaPct > 0 ? '+' : ''}${(deltaPct * 100).toFixed(0)}%`
  return (
    <span
      className={`cmc-delta-pill cmc-delta-pill--${sign} ${className}`.trim()}
      aria-label={`Change: ${direction} ${absStr} (${pctStr})`}
      {...rest}
    >
      <span aria-hidden="true">{direction}</span>
      <span className="cmc-delta-pill__abs cmc-numeric">{absStr}</span>
      <span className="cmc-delta-pill__pct cmc-numeric">({pctStr})</span>
    </span>
  )
}
