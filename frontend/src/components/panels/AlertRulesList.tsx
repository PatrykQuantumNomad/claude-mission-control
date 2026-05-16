// AlertRulesList — ALRT-10 (Phase 15 Plan 05).
//
// Lists alert rules from useAlertRules() with two row actions: enabled toggle
// (optimistic via usePatchAlertRule's enabled-only branch — see Plan 04
// queries.ts:770) and Delete (non-optimistic via useDeleteAlertRule). Mirrors
// the SchedulesCard idiom verbatim:
//   - PanelCard<AlertRuleListResponse> wraps the query
//   - DataTable renders the rule rows
//   - Inline checkbox calls patchM.mutate({ id, body: { enabled: !current } })
//   - Delete uses window.confirm — Phase 17 may upgrade to AlertDialog
//
// Cadence is locked at 30_000ms in lib/queries.ts (useAlertRules) — this panel
// does NOT inline refetchInterval (project convention; see queries.ts header).
//
// D-04: chat_id is settings-private and never surfaced. Columns are rule_id /
// name / kind (Badge) / metric / threshold_fire / cooldown_seconds / enabled
// (toggle) / actions (Delete).

import { Badge, DataTable, PanelCard } from '../ui'
import type { DataTableColumn, LayoutCustomizableProps } from '../ui'
import { useAlertRules, useDeleteAlertRule, usePatchAlertRule } from '../../lib/queries'
import type { AlertRule, AlertRuleListResponse } from '../../lib/api'

const EM_DASH = '—'

function formatThreshold(v: number | null): string {
  if (v === null) return EM_DASH
  // Threshold values can be tiny costs (0.0001) or large counts (5).
  // Use a stable representation: integer if whole, else 4 significant digits.
  if (Number.isInteger(v)) return String(v)
  return v.toPrecision(4)
}

function ActionsCell({ rule }: { rule: AlertRule }) {
  const deleteM = useDeleteAlertRule()
  return (
    <button
      type="button"
      className="cmc-btn cmc-btn--sm cmc-btn--ghost"
      onClick={() => {
        const ok = window.confirm(`Delete rule "${rule.name}" (#${rule.rule_id})?`)
        if (!ok) return
        deleteM.mutate(rule.rule_id)
      }}
      disabled={deleteM.isPending}
      aria-label={`Delete rule ${rule.name}`}
    >
      {deleteM.isPending ? 'Deleting…' : 'Delete'}
    </button>
  )
}

function EnabledToggleCell({ rule }: { rule: AlertRule }) {
  const patchM = usePatchAlertRule()
  return (
    <label className="cmc-alert-rules__toggle">
      <input
        type="checkbox"
        checked={rule.enabled}
        onChange={(e) =>
          patchM.mutate({
            id: rule.rule_id,
            body: { enabled: e.target.checked },
          })
        }
        disabled={patchM.isPending}
        aria-label={`Enable rule ${rule.name}`}
      />
      <span className="cmc-text-subtle">{rule.enabled ? 'On' : 'Off'}</span>
    </label>
  )
}

const COLUMNS: DataTableColumn<AlertRule>[] = [
  {
    id: 'rule_id',
    header: 'ID',
    cell: (r) => <span className="cmc-numeric">{r.rule_id}</span>,
    width: 56,
  },
  {
    id: 'name',
    header: 'Name',
    cell: (r) => <strong>{r.name}</strong>,
  },
  {
    id: 'kind',
    header: 'Kind',
    cell: (r) => (
      <Badge variant={r.kind === 'threshold' ? 'info' : 'warning'}>{r.kind}</Badge>
    ),
    width: 110,
  },
  {
    id: 'metric',
    header: 'Metric',
    cell: (r) => <span className="cmc-mono">{r.metric}</span>,
  },
  {
    id: 'threshold_fire',
    header: 'Fire',
    cell: (r) => (
      <span className="cmc-numeric">{formatThreshold(r.threshold_fire)}</span>
    ),
    width: 80,
  },
  {
    id: 'threshold_clear',
    header: 'Clear',
    cell: (r) => (
      <span className="cmc-numeric">{formatThreshold(r.threshold_clear)}</span>
    ),
    width: 80,
  },
  {
    id: 'cooldown_seconds',
    header: 'Cooldown',
    cell: (r) => <span className="cmc-numeric">{r.cooldown_seconds}s</span>,
    width: 96,
  },
  {
    id: 'enabled',
    header: 'Enabled',
    cell: (r) => <EnabledToggleCell rule={r} />,
    width: 110,
  },
  {
    id: 'actions',
    header: '',
    cell: (r) => <ActionsCell rule={r} />,
    width: 100,
  },
]

export function AlertRulesList({ panelId, headerMenu }: LayoutCustomizableProps = {}) {
  const query = useAlertRules()
  return (
    <PanelCard<AlertRuleListResponse>
      reqId="ALRT-10"
      title="Alert Rules"
      description="Hysteresis-aware rules. Edit by deleting + recreating; toggle to disable temporarily."
      query={query}
      bounded
      panelId={panelId}
      headerMenu={headerMenu}
      empty={{
        dataNoun: 'alert rules',
        when: (d) => !d.items || d.items.length === 0,
      }}
    >
      {(data) => (
        <DataTable<AlertRule>
          rows={data.items}
          columns={COLUMNS}
          rowKey={(r) => String(r.rule_id)}
          ariaLabel="Alert rules"
        />
      )}
    </PanelCard>
  )
}
