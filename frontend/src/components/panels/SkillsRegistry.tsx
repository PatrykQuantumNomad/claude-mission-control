// SkillsRegistry — SKLP-04 (current). Phase 19 SKLP-10 adds new/dormant
// badges by joining useSkillUsage data into the registry rows by skill name.
//
// DataTable of skills with name / environment / autonomy columns. The
// autonomy column is a per-row <select> dispatching usePatchSkillAutonomy
// (OPTIMISTIC with onMutate snapshot + onError rollback + onSettled
// invalidation — design notes). The component just dispatches; the
// optimistic logic + 60s polling cadence live in lib/queries.ts.
//
// Phase 19 NOTE: badges come from useSkillUsage, NOT useSkills (the registry
// catalog endpoint has no badges field). useSkillUsage returns the top-N
// skills for the active range; for skills outside the top-N (or below the
// activity threshold), badges silently render as empty — by design, since
// the badge classification depends on activity windows the registry-only
// endpoint doesn't expose.

import { Badge, DataTable, PanelCard } from '../ui'
import type { DataTableColumn } from '../ui'
import {
  usePatchSkillAutonomy,
  useSkills,
  useSkillUsage,
} from '../../lib/queries'
import type {
  SkillAutonomyRequest,
  SkillListResponse,
  SkillRow,
  SkillUsageRow,
} from '../../lib/api'

const AUTONOMY_OPTIONS: SkillAutonomyRequest['autonomy'][] = [
  'auto',
  'review',
  'manual',
]

export function SkillsRegistry() {
  const query = useSkills()
  const mutation = usePatchSkillAutonomy()
  // SKLP-10 — use the same 14d usage feed TopSkills uses so the new/dormant
  // badge state is consistent across panels. The hook is kebab-keyed
  // ('skill-usage' / 14d), distinct from the registry's qk.skills() key.
  // limit=200 widens the join coverage so registry rows below the default
  // top-10 still get badge markers when they're new or dormant.
  const usageQuery = useSkillUsage('14d', 200)
  const badgeByName = new Map<string, SkillUsageRow['badges']>()
  for (const row of usageQuery.data?.rows ?? []) {
    if (row.badges && row.badges.length > 0) {
      badgeByName.set(row.skill_name, row.badges)
    }
  }

  const columns: DataTableColumn<SkillRow>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (r) => {
        const badges = badgeByName.get(r.name) ?? []
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2xs)' }}>
            <span className="cmc-mono">{r.name}</span>
            {badges.includes('new_this_week') ? (
              <Badge variant="info" data-testid="skills-registry-new-badge">
                new this week
              </Badge>
            ) : null}
            {badges.includes('dormant') ? (
              <Badge variant="warning" data-testid="skills-registry-dormant-badge">
                dormant
              </Badge>
            ) : null}
          </span>
        )
      },
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
