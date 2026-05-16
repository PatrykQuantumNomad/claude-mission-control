// TokenUsageCard — OPNL-05 (current).
//
// Stacked daily bar chart of token usage broken out by token TYPE
// (input/output/cache_read/cache_create). Pulls /api/usage/tokens at the
// 60s daily-aggregate cadence via useTokens(range) — refetchInterval is
// owned by lib/queries.ts, NEVER inlined here.
//
// Accessibility: chart wraps in <figure aria-label="Daily token breakdown">
// with a screen-reader-only fallback table (06-design notes).
// Model/source-axis stacking deferred to v2.
//
// Phase 26 / TIME-04 (Plan 07). Mounts a <CompareToggle panelId="token-usage" />
// in the panel chrome row alongside the existing RangeToggle. When the URL's
// `compare_panels` CSV contains `token-usage` AND the effective range is `7d`,
// we render a translucent "previous period" overlay Bar series. v1 scope
// (planner choice within Claude's Discretion): overlay is only supported for
// range='7d'. For other ranges the toggle still mounts but surfaces an inline
// `compare-overlay-hint` — full support for the other ranges depends on a
// backend window-shift API (Phase 27 TDBT or post-v1.3).
//
// The overlay piggybacks on an EXISTING useTokens('30d') query: a 30d window
// contains the prior 7 days that the 7d view is comparing against, so we slice
// client-side (data is daily aggregates — trivial). This keeps the
// ResponsiveContainer count unchanged (no new chart wrapper) and avoids
// burning a new backend endpoint.
//
// Phase 26 / TIME-02 bridge (Plan 08, sibling): URL time params drive the
// effective range via useRouteRange('today'); local RangeToggle clicks
// override (localRange wins until reset — v1 limitation). Compare-overlay
// reads effectiveRange so URL drives BOTH primary + prior pipelines.

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useRouterState } from '@tanstack/react-router'
import { PanelCard, RangeToggle, type LayoutCustomizableProps } from '../ui'
import { useTokens } from '../../lib/queries'
import type { Range, TokenUsageResponse } from '../../lib/api'
import { useRouteRange } from '../../lib/time/useRouteRange'
import { CompareToggle } from '../time/CompareToggle'
import { groupTokensByDay } from './TokenUsageCard.utils'

const PANEL_ID = 'token-usage'

const RANGE_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: '7d' as const, label: '7d' },
  { value: '30d' as const, label: '30d' },
]

export function TokenUsageCard({ panelId, headerMenu }: LayoutCustomizableProps = {}) {
  // Phase 26 TIME-02 bridge: URL time params (via TimePicker) drive the
  // effective range; per-route default is 'today' on /. Local RangeToggle
  // clicks override (localRange wins until reset — v1 limitation).
  const globalRange = useRouteRange('today')
  const [localRange, setLocalRange] = useState<Range | null>(null)
  const effectiveRange = localRange ?? globalRange
  const query = useTokens(effectiveRange)

  // Phase 26 TIME-04: read compare_panels CSV from URL; toggle is "active"
  // for this panel when the panel id is in the CSV. The CompareToggle
  // component owns the WRITE path — this read happens here so we can also
  // gate the prior-period overlay query and the inline hint.
  const location = useRouterState({ select: (s) => s.location })
  const search = (location.search ?? {}) as Record<string, unknown>
  const csv =
    typeof search.compare_panels === 'string'
      ? search.compare_panels
      : undefined
  const compareActive = csv?.split(',').includes(PANEL_ID) ?? false

  // Overlay is only supported for effectiveRange='7d' in v1 (other ranges
  // would need a backend window-shift API). Always run the hook with a
  // valid Range so React's hook ordering stays stable; we just ignore the
  // result when not applicable. 'today' is the cheapest query — used as
  // the off-state placeholder so we don't burn extra fetches.
  const shouldOverlay = compareActive && effectiveRange === '7d'
  const priorQuery = useTokens(shouldOverlay ? '30d' : 'today')

  // The prior-7-days slice: from a 30d daily aggregate, the LAST 7 days are
  // the CURRENT period, and the 7 days BEFORE that are the PRIOR period we
  // want to overlay. groupTokensByDay sorts ascending by day, so we slice
  // [-14, -7) to get the prior week.
  const priorSlice = useMemo(() => {
    if (!shouldOverlay || !priorQuery.data) return null
    const grouped = groupTokensByDay(priorQuery.data.items)
    return grouped.slice(-14, -7)
  }, [shouldOverlay, priorQuery.data])

  return (
    <PanelCard<TokenUsageResponse>
      reqId="OPNL-05"
      title="Token Usage"
      query={query}
      bounded
      panelId={panelId}
      headerMenu={headerMenu}
      empty={{
        dataNoun: 'token usage data',
        when: (d) => d.items.length === 0,
      }}
      trailing={
        <div className="cmc-token-usage__chrome">
          <RangeToggle<Range>
            value={effectiveRange}
            onChange={setLocalRange}
            options={RANGE_OPTIONS}
          />
          <CompareToggle panelId={PANEL_ID} />
        </div>
      }
    >
      {(data) => {
        const daily = groupTokensByDay(data.items)
        // Merge prior-period totals into the primary chart dataset under
        // a new `prior_total` field. Recharts renders one Bar per dataKey
        // — the primary type-stack uses stackId="t" and the prior overlay
        // uses its own stackId so it sits adjacent on the day axis rather
        // than piling onto the type-stack. Index-aligned merge keeps the
        // bars paired; if priorSlice has fewer rows (edge case near the
        // data boundary) the missing rows default to 0.
        const chartData = priorSlice
          ? daily.map((row, i) => {
              const p = priorSlice[i]
              const prior_total = p
                ? p.input + p.output + p.cache_read + p.cache_create
                : 0
              return { ...row, prior_total }
            })
          : daily
        return (
          <figure className="cmc-chart-fig" aria-label="Daily token breakdown">
            {compareActive && effectiveRange !== '7d' ? (
              <p
                className="cmc-token-usage__compare-hint cmc-label"
                data-testid="compare-overlay-hint"
              >
                Previous period overlay supported only for 7d range
              </p>
            ) : null}
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid stroke="var(--cmc-border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--cmc-text-subtle)" fontSize={12} />
                <YAxis stroke="var(--cmc-text-subtle)" fontSize={12} />
                <RechartsTooltip
                  cursor={{ fill: 'var(--cmc-surface-2)' }}
                  contentStyle={{
                    background: 'var(--cmc-surface-3)',
                    border: '1px solid var(--cmc-border)',
                    borderRadius: 8,
                    color: 'var(--cmc-text)',
                  }}
                />
                <Bar dataKey="input" stackId="t" fill="var(--cmc-accent-blue)" />
                <Bar dataKey="output" stackId="t" fill="var(--cmc-accent-purple)" />
                <Bar dataKey="cache_read" stackId="t" fill="var(--cmc-status-cyan)" />
                <Bar dataKey="cache_create" stackId="t" fill="var(--cmc-status-green)" />
                {priorSlice ? (
                  <Bar
                    dataKey="prior_total"
                    stackId="prior"
                    fill="var(--cmc-text-subtle)"
                    fillOpacity={0.25}
                    isAnimationActive={false}
                  />
                ) : null}
              </BarChart>
            </ResponsiveContainer>
            <table className="cmc-sr-only">
              <caption>Daily token totals by type</caption>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Cache read</th>
                  <th>Cache create</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => (
                  <tr key={row.day}>
                    <td>{row.day}</td>
                    <td>{row.input}</td>
                    <td>{row.output}</td>
                    <td>{row.cache_read}</td>
                    <td>{row.cache_create}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
        )
      }}
    </PanelCard>
  )
}
