// SkillsRegistry — SKLP-04 (Phase 7 Plan 02 / Wave 1).
//
// DataTable of skills with name / environment / autonomy columns. The
// autonomy column is a per-row <select> dispatching usePatchSkillAutonomy
// (OPTIMISTIC with onMutate snapshot + onError rollback + onSettled
// invalidation — RESEARCH §Pattern 2). The component just dispatches; the
// optimistic logic + 60s polling cadence live in lib/queries.ts.

import { DataTable, PanelCard } from '../ui'
import type { DataTableColumn } from '../ui'
import { usePatchSkillAutonomy, useSkills } from '../../lib/queries'
import type {
  SkillAutonomyRequest,
  SkillListResponse,
  SkillRow,
} from '../../lib/api'

const AUTONOMY_OPTIONS: SkillAutonomyRequest['autonomy'][] = [
  'auto',
  'review',
  'manual',
]

export function SkillsRegistry() {
  const query = useSkills()
  const mutation = usePatchSkillAutonomy()

  const columns: DataTableColumn<SkillRow>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (r) => <span className="cmc-mono">{r.name}</span>,
    },
    {
      id: 'environment',
      header: 'Environment',
      cell: (r) => r.environment ?? '\u2014',
    },
    {
      id: 'autonomy',
      header: 'Autonomy',
      cell: (r) => (
        <select
          className="cmc-input cmc-skills-registry__autonomy"
          value={r.autonomy}
          aria-label={`Autonomy for ${r.name}`}
          onChange={(e) =>
            mutation.mutate({
              name: r.name,
              body: {
                autonomy: e.target.value as SkillAutonomyRequest['autonomy'],
              },
            })
          }
        >
          {AUTONOMY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ),
    },
  ]

  return (
    <PanelCard<SkillListResponse>
      reqId="SKLP-04"
      title="Skills Registry"
      description="Catalog of detected skills with autonomy controls"
      query={query}
      empty={{
        dataNoun: 'skill registry entries',
        when: (d) => d.items.length === 0,
      }}
    >
      {(data) => (
        <DataTable<SkillRow>
          rows={data.items}
          columns={columns}
          rowKey={(r) => r.name}
          ariaLabel="Skills registry"
        />
      )}
    </PanelCard>
  )
}
