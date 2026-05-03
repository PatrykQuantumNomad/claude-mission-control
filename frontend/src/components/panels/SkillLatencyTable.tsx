// SkillLatencyTable — SKLP-05 (NEW, Phase 14 Plan 04).
//
// Sortable per-skill latency table. Two-step fetch pattern:
//   1. useSkillUsage(range, 20) enumerates the top-20 skills.
//   2. useQueries fans out one fetchSkillLatency call per skill row.
//
// MANDATORY use of useQueries (NOT useSkillLatency in a .map() — that would
// be a Rules of Hooks violation: data.rows.length varies between renders
// (undefined → 0 → N → re-fetch → toggled-N) and React would throw "Rendered
// more hooks than during the previous render". useQueries handles dynamic
// query lists correctly because it accepts a single array argument and keeps
// the React-internal hook count constant at one.
//
// Server-driven low_sample badge: read response.low_sample directly. The
// minimum-sample threshold is intentionally NOT redefined as a frontend
// constant (D-04 Plan 01: server is the source of truth, frontend mirrors —
// prevents drift if backend ever retunes the threshold).
//
// Sort: client-side after all latency queries resolve. Default p95_ms desc.

import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Badge, DataTable, PanelCard, RangeToggle } from '../ui'
import type { DataTableColumn, DataTableSort } from '../ui'
import { useSkillUsage, qk } from '../../lib/queries'
import { fetchSkillLatency } from '../../lib/api'
import type {
  SkillLatencyResponse,
  SkillRange,
  SkillUsageResponse,
} from '../../lib/api'

const RANGE_OPTIONS = [
  { value: '14d' as const, label: '14d' },
  { value: '30d' as const, label: '30d' },
]

const nf = new Intl.NumberFormat('en')

interface Row {
  skill_name: string
  sample_count: number
  p50_ms: number | null
  p95_ms: number | null
  max_ms: number | null
  error_rate: number
  low_sample: boolean
}

const COLUMNS: DataTableColumn<Row>[] = [
  {
    id: 'skill_name',
    header: 'Skill',
    cell: (r) => (
      <span className="cmc-skill-latency__name">
        <span className="cmc-numeric" style={{ color: 'var(--cmc-text)' }}>
          {r.skill_name}
        </span>
        {r.low_sample ? (
          <span style={{ marginLeft: 'var(--space-xs)' }}>
            <Badge variant="warning">Low sample</Badge>
          </span>
        ) : null}
      </span>
    ),
    sortable: true,
    sort: (a, b) => a.skill_name.localeCompare(b.skill_name),
  },
  {
    id: 'sample_count',
    header: 'Samples',
    cell: (r) => <span className="cmc-numeric">{nf.format(r.sample_count)}</span>,
    sortable: true,
    sort: (a, b) => a.sample_count - b.sample_count,
  },
  {
    id: 'p50_ms',
    header: 'p50',
    cell: (r) => (
      <span className="cmc-numeric">{r.p50_ms === null ? '—' : `${r.p50_ms}ms`}</span>
    ),
    sortable: true,
    sort: (a, b) => (a.p50_ms ?? 0) - (b.p50_ms ?? 0),
  },
  {
    id: 'p95_ms',
    header: 'p95',
    cell: (r) => (
      <span className="cmc-numeric">{r.p95_ms === null ? '—' : `${r.p95_ms}ms`}</span>
    ),
    sortable: true,
    sort: (a, b) => (a.p95_ms ?? 0) - (b.p95_ms ?? 0),
  },
  {
    id: 'max_ms',
    header: 'max',
    cell: (r) => (
      <span className="cmc-numeric">{r.max_ms === null ? '—' : `${r.max_ms}ms`}</span>
    ),
    sortable: true,
    sort: (a, b) => (a.max_ms ?? 0) - (b.max_ms ?? 0),
  },
  {
    id: 'error_rate',
    header: 'Error %',
    cell: (r) => (
      <span className="cmc-numeric">{(r.error_rate * 100).toFixed(1)}%</span>
    ),
    sortable: true,
    sort: (a, b) => a.error_rate - b.error_rate,
  },
]

export function SkillLatencyTable() {
  const [range, setRange] = useState<SkillRange>('14d')
  const [sort, setSort] = useState<DataTableSort>({ col: 'p95_ms', dir: 'desc' })
  const usageQuery = useSkillUsage(range, 20)

  // Fan out per-row latency queries via useQueries (Rules of Hooks correctness —
  // see file header).
  const latencyResults = useQueries({
    queries:
      usageQuery.data?.rows.map((row) => ({
        queryKey: qk.skillLatency(row.skill_name, range),
        queryFn: () => fetchSkillLatency(row.skill_name, range),
        enabled: !!usageQuery.data,
        // Mirror the cadence locked in lib/queries.ts useSkillLatency — keeps
        // the per-row fan-out fetches on the same 60s/45s schedule rather
        // than tanstack's defaults.
        refetchInterval: 60_000,
        staleTime: 45_000,
      })) ?? [],
  })

  // Combine usage rows + per-row latency into Row[] (only include rows whose
  // latency query resolved).
  const tableRows: Row[] = useMemo(() => {
    if (!usageQuery.data) return []
    const out: Row[] = []
    usageQuery.data.rows.forEach((usageRow, i) => {
      const latency = latencyResults[i]?.data as SkillLatencyResponse | undefined
      if (!latency) return
      out.push({
        skill_name: usageRow.skill_name,
        sample_count: latency.sample_count,
        p50_ms: latency.p50_ms,
        p95_ms: latency.p95_ms,
        max_ms: latency.max_ms,
        error_rate: latency.error_rate,
        low_sample: latency.low_sample,
      })
    })
    return out
  }, [usageQuery.data, latencyResults])

  return (
    <PanelCard<SkillUsageResponse>
      reqId="SKLP-05"
      title="Skill Latency"
      query={usageQuery}
      empty={{ dataNoun: 'skill latency data', when: (d) => d.rows.length === 0 }}
      trailing={
        <RangeToggle<SkillRange>
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          persistKey="skill-latency"
        />
      }
    >
      {() => (
        <DataTable<Row>
          rows={tableRows}
          columns={COLUMNS}
          rowKey={(r) => r.skill_name}
          sort={sort}
          onSortChange={setSort}
          ariaLabel="Skill latency"
          emptyMessage="Loading per-skill latency…"
        />
      )}
    </PanelCard>
  )
}
