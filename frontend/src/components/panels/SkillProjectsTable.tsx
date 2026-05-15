// SkillProjectsTable — SKLP-08 (NEW, Phase 19 Plan 04).
//
// Per-project rollup panel for /skills/$name. Consumes useSkillProjects(name,
// range) and renders a sortable DataTable with five columns: project_key
// (12-char hex), runs (count), p50/p95 latency, cost.
//
// PATH-LEAKAGE GUARD (load-bearing for ROADMAP success criterion #1):
//   The cell renderers operate ONLY on fields enumerated in SkillProjectRow:
//   project_key / count / p50_ms / p95_ms / cost_usd. The TS type itself
//   has no cwd / path / display_path field, so the type system rejects any
//   future renderer that tries to surface a path-shaped value. Backend
//   enforces the same property structurally
//   (test_skill_projects_no_path_leakage); both layers must hold for the
//   success criterion to be safe.
//
// data-testid lives on the wrapping <section> — PanelCard does NOT
// pass-through data-testid, so we sandwich the testid on a stable wrapper
// that survives the loading / empty / error / data branches. This gives
// the Playwright spec one stable DOM hook regardless of which branch
// PanelCard rendered.
//
// Sort state is controlled — initial sort is `count desc` (most-active
// project first) per RESEARCH §UX-projects.

import { useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { DataTable, PanelCard } from '../ui'
import type { DataTableColumn, DataTableSort } from '../ui'
import { useSkillProjects } from '../../lib/queries'
import type {
  SkillProjectRow,
  SkillProjectsResponse,
  SkillRange,
} from '../../lib/api'
import {
  snapToSkillRange,
  useRouteRangeVocab,
} from '../../lib/time/useRouteRangeVocab'

interface SkillProjectsTableProps {
  name: string
  // Phase 27 / SC#1: caller-supplied route-local default (narrowed from
  // SkillsDetailRange). The panel internally overrides this with the global
  // picker WHEN PRESENT (hasGlobalPicker flag below); the prop continues to
  // act as the FALLBACK when no global picker is set — preserves Phase 19
  // call-shape (callers pass narrowed `range` from URL search state).
  range: SkillRange
}

function fmtMs(v: number | null): string {
  return v === null ? '—' : `${v}ms`
}

function fmtCost(v: string): string {
  // cost_usd arrives as a Decimal-as-JSON-string; render with 4 decimals
  // (per-project rollups can be sub-cent; 2 decimals would round-to-zero
  // and look like a free run). parseFloat is sort-only — display passes
  // through the string-formatted result.
  const n = Number.parseFloat(v)
  if (!Number.isFinite(n)) return v
  return `$${n.toFixed(4)}`
}

const COLUMNS: DataTableColumn<SkillProjectRow>[] = [
  {
    id: 'project_key',
    header: 'Project',
    sortable: true,
    sort: (a, b) => a.project_key.localeCompare(b.project_key),
    cell: (r) => <code className="cmc-numeric">{r.project_key}</code>,
  },
  {
    id: 'count',
    header: 'Runs',
    sortable: true,
    sort: (a, b) => a.count - b.count,
    cell: (r) => <span className="cmc-numeric">{r.count.toLocaleString()}</span>,
  },
  {
    id: 'p50_ms',
    header: 'p50',
    sortable: true,
    sort: (a, b) => (a.p50_ms ?? -1) - (b.p50_ms ?? -1),
    cell: (r) => <span className="cmc-numeric">{fmtMs(r.p50_ms)}</span>,
  },
  {
    id: 'p95_ms',
    header: 'p95',
    sortable: true,
    sort: (a, b) => (a.p95_ms ?? -1) - (b.p95_ms ?? -1),
    cell: (r) => <span className="cmc-numeric">{fmtMs(r.p95_ms)}</span>,
  },
  {
    id: 'cost_usd',
    header: 'Cost',
    sortable: true,
    sort: (a, b) =>
      (Number.parseFloat(a.cost_usd) || 0) - (Number.parseFloat(b.cost_usd) || 0),
    cell: (r) => <span className="cmc-numeric">{fmtCost(r.cost_usd)}</span>,
  },
]

export function SkillProjectsTable({ name, range }: SkillProjectsTableProps) {
  // Phase 27 / SC#1 — global picker WINS over route-local ?range= when
  // both time_from and time_to are present (LOCKED OPERATOR DECISION 2).
  // useRouteRangeVocab is called UNCONDITIONALLY (rules-of-hooks safe);
  // the explicit hasGlobalPicker presence flag picks between globalRange
  // and the prop-supplied route-local range. The hook's return value can
  // NOT be used as a presence proxy because it returns routeDefault='14d'
  // for BOTH the "missing" and "valid default match" cases.
  const globalRange = useRouteRangeVocab<SkillRange>('14d', snapToSkillRange)
  const search = useRouterState({ select: (s) => s.location.search }) as Record<
    string,
    unknown
  >
  const hasGlobalPicker =
    typeof search.time_from === 'string' && typeof search.time_to === 'string'
  const effectiveRange = hasGlobalPicker ? globalRange : range
  const query = useSkillProjects(name, effectiveRange)
  // Initial sort: count desc (most-active project first).
  const [sort, setSort] = useState<DataTableSort>({ col: 'count', dir: 'desc' })

  return (
    <section
      className="cmc-skill-projects"
      data-testid="skills-detail-projects-table"
    >
      <PanelCard<SkillProjectsResponse>
        bounded
        reqId="SKLP-08"
        title="Per-project breakdown"
        description="Runs / latency / cost grouped by project_key (12-char hex; never a filesystem path)."
        query={query}
        empty={{
          dataNoun: 'project rollups',
          when: (d) => !d.rows || d.rows.length === 0,
        }}
      >
        {(data) => (
          <DataTable<SkillProjectRow>
            rows={data.rows}
            columns={COLUMNS}
            rowKey={(r) => r.project_key}
            sort={sort}
            onSortChange={setSort}
            ariaLabel="Per-project skill rollups"
          />
        )}
      </PanelCard>
    </section>
  )
}
