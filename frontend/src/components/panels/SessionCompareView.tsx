// SessionCompareView — CMPR-02..05 (Phase 16 Plan 02).
//
// Two-up paired-session compare panel rendered under the /sessions/compare
// file-based route. Composition (single-column stack — each side gets a wide
// column inside the panel body, NOT .cmc-card-grid):
//
//   1. KPI strip (two columns, side by side): cost, duration, total tokens,
//      tool calls, message count, model, outcome (StatePill).
//   2. Side-by-side recharts BarChart (two ResponsiveContainer height=220):
//      input / output / cache_read / cache_create_5m / cache_create_1h.
//   3. Skill-set diff: three columns (Shared / Only A / Only B) with each
//      skill name a TanStack Link to /skills/$name.
//   4. Tool-counts diff DataTable: tool_name + count_a + count_b + delta.
//      Hidden when over_cap=true on either side; replaced with an
//      EmptyState fallback ("Session too long for full diff (>500 tool
//      calls). Showing summary metrics only.") per CMPR-04.
//   5. Footer caption: "Rates as of {rates_as_of}" (mirror SkillCostCard).
//
// CRITICAL CORRECTNESS CONSTRAINTS:
//   - cost_usd is a Decimal-as-JSON-string (Pydantic v2 default —
//     Phase 13/14/16 lock + Pitfall 1 in 16-RESEARCH). Always display via
//     template literal `$${side.cost_usd}` — NEVER coerce via Number()
//     for the displayed dollar figure.
//   - CMPR-05 (structured tabular only): NO react-diff-viewer / jsdiff /
//     markdown-message rendering. Every value is a JSON field from the API.
//   - This component does NOT fetch any session message content from any
//     other endpoint — only useSessionCompare's payload is rendered.
//
// Cadence is locked at 60_000ms in lib/queries.ts (useSessionCompare) — this
// panel does NOT inline refetchInterval (project convention; cadence policy
// lives in queries.ts, never inside panels — see lib/queries.ts header).

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from '@tanstack/react-router'
import type { ReactElement, ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  KpiTile,
  PanelCard,
  StatePill,
} from '../ui'
import type { DataTableColumn } from '../ui'
import { useSessionCompare } from '../../lib/queries'
import type {
  SessionCompareResponse,
  SessionCompareSide,
  SkillSetDiff,
} from '../../lib/api'

const EM_DASH = '—'

// TanStack Router typegen rejects `to="/skills/$name"` from this file because
// routeTree.gen.ts is generated from src/routes/. The skill-detail route
// already exists (Phase 14 Plan 05), so the runtime works fine — the cast
// just silences the compile-time check, mirroring TopSkills.tsx:38-43.
const SkillLink = Link as unknown as (props: {
  to: string
  params?: Record<string, string>
  className?: string
  children?: ReactNode
}) => ReactElement

const nf = new Intl.NumberFormat('en')

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return EM_DASH
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remSec = seconds % 60
  if (minutes < 60) return remSec > 0 ? `${minutes}m ${remSec}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remMin = minutes % 60
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`
}

function totalTokens(side: SessionCompareSide): number {
  return (
    side.tokens_input +
    side.tokens_output +
    side.tokens_cache_read +
    side.tokens_cache_create_5m +
    side.tokens_cache_create_1h
  )
}

function outcomePill(outcome: string | null): ReactElement {
  // Mirror observability.py outcome taxonomy:
  //   'errored' / 'rate_limited' → error red
  //   'truncated'                → pending amber
  //   'unfinished'               → pending amber
  //   'ok'                       → ok green
  //   null                       → stale grey
  if (outcome === null) return <StatePill state="stale" label="Unknown" />
  if (outcome === 'ok') return <StatePill state="ok" label="OK" />
  if (outcome === 'errored') return <StatePill state="error" label="Errored" />
  if (outcome === 'rate_limited')
    return <StatePill state="error" label="Rate limited" />
  if (outcome === 'truncated')
    return <StatePill state="pending" label="Truncated" />
  if (outcome === 'unfinished')
    return <StatePill state="pending" label="Unfinished" />
  return <StatePill state="stale" label={outcome} />
}

function SideKpiColumn({
  label,
  side,
}: {
  label: string
  side: SessionCompareSide
}) {
  return (
    <div className="cmc-skill-cost__top" style={{ flex: 1 }}>
      <KpiTile
        label={`${label} • Cost`}
        // Decimal-as-JSON-string — NEVER Number-coerce.
        value={`$${side.cost_usd}`}
        mono
      />
      <KpiTile
        label={`${label} • Duration`}
        value={formatDuration(side.duration_ms)}
        mono
      />
      <KpiTile
        label={`${label} • Tokens`}
        value={nf.format(totalTokens(side))}
        mono
      />
      <KpiTile
        label={`${label} • Tools`}
        value={nf.format(side.tool_call_count)}
        mono
      />
      <KpiTile
        label={`${label} • Messages`}
        value={nf.format(side.message_count)}
        mono
      />
      <KpiTile label={`${label} • Model`} value={side.model ?? EM_DASH} />
      <KpiTile
        label={`${label} • Outcome`}
        value={outcomePill(side.outcome)}
      />
    </div>
  )
}

interface BarRow {
  metric: string
  value: number
}

function buildBarRows(side: SessionCompareSide): BarRow[] {
  return [
    { metric: 'input', value: side.tokens_input },
    { metric: 'output', value: side.tokens_output },
    { metric: 'cache_read', value: side.tokens_cache_read },
    { metric: 'cache_create_5m', value: side.tokens_cache_create_5m },
    { metric: 'cache_create_1h', value: side.tokens_cache_create_1h },
  ]
}

function SideBarChart({
  label,
  side,
}: {
  label: string
  side: SessionCompareSide
}) {
  const rows = buildBarRows(side)
  return (
    <figure
      className="cmc-chart-fig"
      aria-label={`${label} token breakdown`}
      style={{ flex: 1 }}
    >
      <figcaption
        className="cmc-label"
        style={{ color: 'var(--cmc-text-subtle)', marginBottom: 'var(--space-xs)' }}
      >
        {label} — token breakdown
      </figcaption>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows}>
          <CartesianGrid stroke="var(--cmc-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="metric"
            stroke="var(--cmc-text-subtle)"
            fontSize={11}
          />
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
          <Legend />
          <Bar dataKey="value" fill="var(--cmc-accent-blue)" />
        </BarChart>
      </ResponsiveContainer>
      <table className="cmc-sr-only">
        <caption>{label} token breakdown</caption>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.metric}>
              <td>{r.metric}</td>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function SkillDiffColumn({
  heading,
  skills,
}: {
  heading: string
  skills: string[]
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <h4
        className="cmc-label"
        style={{ color: 'var(--cmc-text-subtle)', margin: 0, marginBottom: 'var(--space-xs)' }}
      >
        {heading} ({skills.length})
      </h4>
      {skills.length === 0 ? (
        <p className="cmc-caption" style={{ margin: 0 }}>
          {EM_DASH}
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-xs)',
          }}
        >
          {skills.map((name) => (
            <li key={name}>
              <SkillLink
                to="/skills/$name"
                params={{ name }}
                className="cmc-link cmc-mono"
              >
                {name}
              </SkillLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SkillDiffRow({ diff }: { diff: SkillSetDiff }) {
  return (
    <section
      aria-label="Skill-set diff"
      style={{
        display: 'flex',
        gap: 'var(--space-md)',
        marginTop: 'var(--space-md)',
      }}
    >
      <SkillDiffColumn heading="Shared" skills={diff.shared} />
      <SkillDiffColumn heading="Only A" skills={diff.only_a} />
      <SkillDiffColumn heading="Only B" skills={diff.only_b} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Phase 23 (CMPR-06 / D-15..D-18): per-skill p95 latency rows.
//
// Reads `skill_latencies` per side (server-computed; integer ms). Renders a
// stable tabular row per skill with A / B / Δ (B−A) columns. The delta column
// is suppressed when EITHER side is low-sample (top-level low_sample_a OR
// low_sample_b on the response — D-17 lock); raw per-side values still render
// so the user can inspect the underlying numbers.
//
// Suppression renders the EM_DASH ('—') glyph in the delta cell and the
// section header surfaces a "Low sample" badge so the suppression is visible
// (matches Phase 19 SKLP-05 low-sample convention without reaching for
// DeltaPill — the plan's explicit semantics differ from a delta-pill drop-in).
//
// Over-cap (D-18): this section is INDEPENDENT of `over_cap` — the backend
// still returns skill_latencies on over-cap responses; only tool_counts is
// skipped. Do NOT branch this section on over_cap.
// ---------------------------------------------------------------------------

interface SkillLatencyRow {
  skill_name: string
  p95_a_ms: number | null
  p95_b_ms: number | null
}

function buildSkillLatencyRows(
  a: SessionCompareSide,
  b: SessionCompareSide,
): SkillLatencyRow[] {
  const names = new Set<string>([
    ...Object.keys(a.skill_latencies ?? {}),
    ...Object.keys(b.skill_latencies ?? {}),
  ])
  const rows: SkillLatencyRow[] = []
  for (const skill_name of names) {
    const ra = a.skill_latencies?.[skill_name]
    const rb = b.skill_latencies?.[skill_name]
    rows.push({
      skill_name,
      p95_a_ms: typeof ra === 'number' ? ra : null,
      p95_b_ms: typeof rb === 'number' ? rb : null,
    })
  }
  // Sort: largest absolute Δ first when both sides present; tie-break alpha
  // for stability (mirrors Tool counts diff sort).
  rows.sort((x, y) => {
    const dx =
      x.p95_a_ms !== null && x.p95_b_ms !== null
        ? Math.abs(x.p95_b_ms - x.p95_a_ms)
        : -1
    const dy =
      y.p95_a_ms !== null && y.p95_b_ms !== null
        ? Math.abs(y.p95_b_ms - y.p95_a_ms)
        : -1
    if (dy !== dx) return dy - dx
    return x.skill_name.localeCompare(y.skill_name)
  })
  return rows
}

function fmtMs(value: number | null): string {
  if (value === null) return EM_DASH
  return `${value}ms`
}

function SkillLatencySection({ data }: { data: SessionCompareResponse }) {
  const rows = buildSkillLatencyRows(data.a, data.b)
  // D-17: suppress delta when EITHER side is low-sample. Renders raw values
  // either way so the operator can still see what's there.
  const suppressDelta = Boolean(data.low_sample_a || data.low_sample_b)

  if (rows.length === 0) {
    return (
      <section
        aria-label="Per-skill p95 latency"
        data-testid="session-compare-skill-latency-section"
      >
        <h4
          className="cmc-label"
          style={{
            color: 'var(--cmc-text-subtle)',
            margin: 0,
            marginBottom: 'var(--space-xs)',
          }}
        >
          Per-skill p95 latency
        </h4>
        <EmptyState
          heading="No skill latencies"
          body="Neither session has completed skill invocations to roll up."
        />
      </section>
    )
  }

  return (
    <section
      aria-label="Per-skill p95 latency"
      data-testid="session-compare-skill-latency-section"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-xs)',
        }}
      >
        <h4
          className="cmc-label"
          style={{
            color: 'var(--cmc-text-subtle)',
            margin: 0,
          }}
        >
          Per-skill p95 latency
        </h4>
        {suppressDelta ? (
          <span
            className="cmc-label"
            data-testid="session-compare-skill-latency-low-sample"
            style={{
              color: 'var(--cmc-text-subtle)',
              border: '1px solid var(--cmc-border)',
              borderRadius: 6,
              padding: '0 6px',
              fontSize: 11,
            }}
            title="Delta suppressed: at least one side has fewer than 30 samples (low-sample threshold)."
          >
            Low sample — delta suppressed
          </span>
        ) : null}
      </div>
      <table
        className="cmc-table"
        aria-label="Per-skill p95 latency"
        data-testid="session-compare-skill-latency-table"
      >
        <thead>
          <tr>
            <th className="cmc-table__th">Skill</th>
            <th className="cmc-table__th" style={{ width: 100 }}>
              A (p95)
            </th>
            <th className="cmc-table__th" style={{ width: 100 }}>
              B (p95)
            </th>
            <th className="cmc-table__th" style={{ width: 120 }}>
              Δ (B−A)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const haveBoth = r.p95_a_ms !== null && r.p95_b_ms !== null
            let deltaCell: string
            if (suppressDelta || !haveBoth) {
              deltaCell = EM_DASH
            } else {
              const d = (r.p95_b_ms as number) - (r.p95_a_ms as number)
              const sign = d > 0 ? '+' : ''
              deltaCell = `${sign}${d}ms`
            }
            return (
              <tr key={r.skill_name}>
                <td>
                  <span className="cmc-mono">{r.skill_name}</span>
                </td>
                <td>
                  <span className="cmc-numeric">{fmtMs(r.p95_a_ms)}</span>
                </td>
                <td>
                  <span className="cmc-numeric">{fmtMs(r.p95_b_ms)}</span>
                </td>
                <td>
                  <span
                    className="cmc-numeric"
                    data-testid={`session-compare-skill-latency-delta-${r.skill_name}`}
                  >
                    {deltaCell}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

interface ToolDiffRow {
  tool_name: string
  count_a: number
  count_b: number
  delta: number
}

function buildToolDiffRows(
  a: SessionCompareSide,
  b: SessionCompareSide,
): ToolDiffRow[] {
  const names = new Set<string>([
    ...Object.keys(a.tool_counts),
    ...Object.keys(b.tool_counts),
  ])
  const rows: ToolDiffRow[] = []
  for (const tool_name of names) {
    const count_a = a.tool_counts[tool_name] ?? 0
    const count_b = b.tool_counts[tool_name] ?? 0
    rows.push({ tool_name, count_a, count_b, delta: count_b - count_a })
  }
  // Sort: largest absolute delta first; tie-break alphabetical for stability.
  rows.sort((x, y) => {
    const d = Math.abs(y.delta) - Math.abs(x.delta)
    if (d !== 0) return d
    return x.tool_name.localeCompare(y.tool_name)
  })
  return rows
}

const TOOL_COLUMNS: DataTableColumn<ToolDiffRow>[] = [
  {
    id: 'tool_name',
    header: 'Tool',
    cell: (r) => <span className="cmc-mono">{r.tool_name}</span>,
  },
  {
    id: 'count_a',
    header: 'A',
    cell: (r) => <span className="cmc-numeric">{r.count_a}</span>,
    width: 80,
  },
  {
    id: 'count_b',
    header: 'B',
    cell: (r) => <span className="cmc-numeric">{r.count_b}</span>,
    width: 80,
  },
  {
    id: 'delta',
    header: 'Δ (B−A)',
    cell: (r) => {
      const sign = r.delta > 0 ? '+' : ''
      return (
        <span className="cmc-numeric">
          {sign}
          {r.delta}
        </span>
      )
    },
    width: 100,
  },
]

function ToolCountsDiff({ data }: { data: SessionCompareResponse }) {
  if (data.over_cap || data.a.over_cap || data.b.over_cap) {
    return (
      <EmptyState
        heading="Session too long for full diff"
        body={`At least one side exceeds ${data.cap} tool calls. Showing summary metrics only.`}
      />
    )
  }
  const rows = buildToolDiffRows(data.a, data.b)
  if (rows.length === 0) {
    return (
      <EmptyState
        heading="No tool calls"
        body="Neither session recorded any tool invocations."
      />
    )
  }
  return (
    <DataTable<ToolDiffRow>
      rows={rows}
      columns={TOOL_COLUMNS}
      rowKey={(r) => r.tool_name}
      ariaLabel="Tool counts diff"
    />
  )
}

function CompareBody({ data }: { data: SessionCompareResponse }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
      }}
    >
      <section
        aria-label="Side-by-side KPIs"
        style={{ display: 'flex', gap: 'var(--space-md)' }}
      >
        <SideKpiColumn label="A" side={data.a} />
        <SideKpiColumn label="B" side={data.b} />
      </section>
      <section
        aria-label="Side-by-side token breakdown"
        style={{ display: 'flex', gap: 'var(--space-md)' }}
      >
        <SideBarChart label="A" side={data.a} />
        <SideBarChart label="B" side={data.b} />
      </section>
      <SkillDiffRow diff={data.skill_diff} />
      <SkillLatencySection data={data} />
      <section aria-label="Tool counts diff">
        <h4
          className="cmc-label"
          style={{
            color: 'var(--cmc-text-subtle)',
            margin: 0,
            marginBottom: 'var(--space-xs)',
          }}
        >
          Tool counts
        </h4>
        <ToolCountsDiff data={data} />
      </section>
      {data.rates_as_of ? (
        <p className="cmc-caption">
          Rates as of {data.rates_as_of}
        </p>
      ) : null}
    </div>
  )
}

export function SessionCompareView({
  a,
  b,
}: {
  a: string | undefined
  b: string | undefined
}) {
  const query = useSessionCompare(a, b)

  // Idle gate: when either UUID is missing (validateSearch stripped it), the
  // hook is disabled. Render a clear empty state with a concrete pick-two
  // hint — this is the deep-link landing shape, not a fetch in flight.
  // We bypass PanelCard here because PanelCard would render its
  // DefaultSkeleton on `isPending` (which an idle query reports). The Card
  // shell mirrors PanelCard's structure so the visual matches the populated
  // state's chrome (CardHeader / CardContent / reqId label).
  if (!a || !b) {
    return (
      <Card>
        <CardHeader>
          <div className="cmc-panel-card__header">
            <div>
              <CardDescription className="cmc-label">CMPR-02</CardDescription>
              <CardTitle>Session Compare</CardTitle>
              <CardDescription>
                Paired session metrics + skill-set diff.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <EmptyState
            heading="Pick two sessions"
            body="Pick two sessions from /activity or via Cmd+K to see a side-by-side compare."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <PanelCard<SessionCompareResponse>
      reqId="CMPR-02"
      title="Session Compare"
      description="Paired session metrics + skill-set diff."
      query={query}
      empty={{
        dataNoun: 'comparison',
        when: (d) => !d.a || !d.b,
      }}
    >
      {(data) => <CompareBody data={data} />}
    </PanelCard>
  )
}
