// SchedulesCard — TPNL-03 (current).
//
// Lists schedules with cronstrue-rendered preview, enabled toggle (optimistic
// via usePatchSchedule per implementation hooks), next/last run RelativeTime, and
// per-row inline run-history disclosure. The history pulls via
// useScheduleRuns(id, open) — Pitfall 9 lock: we only fetch /runs once the
// user expands the row, so 50 schedules don't trigger 50 GETs on mount.
//
// We deliberately implement disclosure as a local <button>+<div> rather than
// reusing CollapsibleSection because we need first-class control over the
// open/closed boolean to feed useScheduleRuns(id, open). CollapsibleSection
// owns its own open state internally (persists under cmc.collapsible.*),
// which would force us to mirror it via DOM observation. A bespoke button
// here is ~10 lines and stays testable via accessible role queries.
//
// Stale heuristic (v1): enabled + last_run_at older than 48h ⇒ visual cue.
// Coarse approximation; future revision can compute exact "missed N intervals"
// using cron-utils.
//
// Cadence is locked at 30_000ms in lib/queries.ts (useSchedules) — this panel
// does NOT inline refetchInterval.

import { useState } from 'react'
import {
  Button,
  DataTable,
  PanelCard,
  RelativeTime,
} from '../ui'
import {
  usePatchSchedule,
  useScheduleRuns,
  useSchedules,
} from '../../lib/queries'
import { prettyCron } from '../../lib/cron-utils'
import { ScheduleComposer } from './ScheduleComposer'
import type {
  ScheduleListItem,
  ScheduleListResponse,
  TaskListItem,
} from '../../lib/api'

export function SchedulesCard() {
  const query = useSchedules()
  const [composerOpen, setComposerOpen] = useState(false)
  return (
    <>
      <PanelCard<ScheduleListResponse>
        bounded
        reqId="TPNL-03"
        title="Schedules"
        description="Cron-driven recurring tasks"
        trailing={
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={() => setComposerOpen(true)}
          >
            + New
          </Button>
        }
        query={query}
        empty={{ dataNoun: 'scheduled task data' }}
      >
        {(data) => (
          <ul className="cmc-schedules-list">
            {data.items.map((s) => (
              <ScheduleRow key={s.id} schedule={s} />
            ))}
          </ul>
        )}
      </PanelCard>
      <ScheduleComposer open={composerOpen} onOpenChange={setComposerOpen} />
    </>
  )
}

function ScheduleRow({ schedule }: { schedule: ScheduleListItem }) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const patchM = usePatchSchedule()
  // Pitfall 9 — lazy: useScheduleRuns only fetches when historyOpen=true.
  const runs = useScheduleRuns(schedule.id, historyOpen)
  const preview = prettyCron(schedule.cron)
  const stale = isStale(schedule)
  const historyId = `schedules-runs-${schedule.id}`

  return (
    <li
      className={`cmc-schedules-row ${
        stale ? 'cmc-schedules-row--stale' : ''
      }`.trim()}
    >
      <div className="cmc-schedules-row__head">
        <strong className="cmc-schedules-row__name">{schedule.name}</strong>
        <span className="cmc-schedules-row__preview cmc-text-subtle">
          {preview.ok ? preview.text : `cron: ${schedule.cron}`}
        </span>
        <label className="cmc-schedules-row__toggle">
          <input
            type="checkbox"
            checked={schedule.enabled}
            onChange={(e) =>
              patchM.mutate({
                id: schedule.id,
                body: { enabled: e.target.checked },
              })
            }
          />
          Enabled
        </label>
      </div>
      <div className="cmc-schedules-row__times">
        {schedule.next_run_at ? (
          <span>
            Next: <RelativeTime value={schedule.next_run_at} />
          </span>
        ) : null}
        {schedule.last_run_at ? (
          <span>
            Last: <RelativeTime value={schedule.last_run_at} />
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className="cmc-schedules-row__history-trigger"
        aria-expanded={historyOpen}
        aria-controls={historyId}
        onClick={() => setHistoryOpen((v) => !v)}
      >
        Run history {historyOpen ? '▾' : '▸'}
      </button>
      {historyOpen ? (
        <div id={historyId} className="cmc-schedules-row__history">
          <RunHistory runs={runs} />
        </div>
      ) : null}
    </li>
  )
}

function RunHistory({
  runs,
}: {
  runs: ReturnType<typeof useScheduleRuns>
}) {
  if (runs.isPending) {
    return <p className="cmc-text-subtle">Loading…</p>
  }
  if (runs.isError) {
    return (
      <p className="cmc-text-subtle" role="alert">
        Couldn’t load run history. Refresh or check `cmc doctor`.
      </p>
    )
  }
  if (!runs.data || runs.data.items.length === 0) {
    return <p className="cmc-text-subtle">No runs yet</p>
  }
  return (
    <DataTable<TaskListItem>
      rows={runs.data.items}
      rowKey={(r) => String(r.id)}
      columns={[
        {
          id: 'started_at',
          header: 'Started',
          cell: (r) =>
            r.started_at ? <RelativeTime value={r.started_at} /> : '—',
        },
        { id: 'status', header: 'Status', cell: (r) => r.status },
        { id: 'title', header: 'Title', cell: (r) => r.title },
      ]}
      ariaLabel="Schedule run history"
    />
  )
}

function isStale(s: ScheduleListItem): boolean {
  // v1 heuristic: enabled + last_run_at older than 48h ago.
  if (!s.enabled || !s.last_run_at) return false
  const ageMs = Date.now() - new Date(s.last_run_at).getTime()
  return ageMs > 48 * 3600 * 1000
}
