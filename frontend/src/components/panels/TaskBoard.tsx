// TaskBoard — TPNL-01 (Phase 7 Plan 03 / Wave 2).
//
// Single useTasks() fetch grouped client-side into 3 columns: pending, running,
// done (failed rows merge into done with a destructive "Failed" badge).
// awaiting_approval rows render in an above-board banner — NOT a 4th column —
// per RESEARCH §Pitfall 11 / Open Q1 lock. The banner uses the AttentionBar
// pattern: high-visibility band that disappears when the awaiting list is empty.
//
// Per-row actions respect the Phase 4 transition matrix (STATE.md L162):
//   - Approve: only on awaiting_approval rows
//   - Rerun:   only on failed rows
//   - Delete:  on any non-running row (DELETE backend route TASK-04 has no
//              transition guard; UI just hides delete on running rows for
//              ergonomics — a running task should be killed via ESTOP)
//
// Delete action goes through AlertDialog (Plan 07-01 primitive) because hard
// delete has no soft-FK cascade per STATE.md L211; the confirm step prevents
// fat-finger destructive actions. Cadence is locked at 5_000ms in lib/queries.ts
// — this panel does NOT inline refetchInterval.

import { useState, useMemo } from 'react'
import {
  AlertDialog,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PanelCard,
} from '../ui'
import {
  useApproveTask,
  useDeleteTask,
  useRerunTask,
  useTasks,
} from '../../lib/queries'
import type { TaskListItem, TaskListResponse } from '../../lib/api'

type Grouped = {
  pending: TaskListItem[]
  running: TaskListItem[]
  done: TaskListItem[]
  failed: TaskListItem[]
  awaiting_approval: TaskListItem[]
}

function groupByStatus(items: TaskListItem[]): Grouped {
  const out: Grouped = {
    pending: [],
    running: [],
    done: [],
    failed: [],
    awaiting_approval: [],
  }
  for (const t of items) {
    if (t.status === 'pending') out.pending.push(t)
    else if (t.status === 'running') out.running.push(t)
    else if (t.status === 'done') out.done.push(t)
    else if (t.status === 'failed') out.failed.push(t)
    else if (t.status === 'awaiting_approval') out.awaiting_approval.push(t)
    else out.pending.push(t)
  }
  return out
}

export function TaskBoard() {
  const query = useTasks()
  return (
    <PanelCard<TaskListResponse>
      reqId="TPNL-01"
      title="Task Board"
      description="Pending, running, and completed tasks"
      query={query}
      empty={{ dataNoun: 'task data' }}
    >
      {(data) => <TaskBoardBody items={data.items} />}
    </PanelCard>
  )
}

function TaskBoardBody({ items }: { items: TaskListItem[] }) {
  const grouped = useMemo(() => groupByStatus(items), [items])
  return (
    <div className="cmc-task-board">
      {grouped.awaiting_approval.length > 0 ? (
        <div className="cmc-task-board__banner" role="status">
          <span className="cmc-task-board__banner-headline">
            {grouped.awaiting_approval.length} task
            {grouped.awaiting_approval.length === 1 ? '' : 's'} awaiting your
            approval
          </span>
          <ul className="cmc-task-board__banner-list">
            {grouped.awaiting_approval.map((task) => (
              <ApprovalRow key={task.id} task={task} />
            ))}
          </ul>
        </div>
      ) : null}
      <div className="cmc-task-board__columns">
        <Column title="Pending" tasks={grouped.pending} />
        <Column title="Running" tasks={grouped.running} />
        <Column title="Done" tasks={[...grouped.done, ...grouped.failed]} />
      </div>
    </div>
  )
}

function Column({ title, tasks }: { title: string; tasks: TaskListItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} ({tasks.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="cmc-text-subtle">No tasks</p>
        ) : (
          <ul className="cmc-task-board__list">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function TaskRow({ task }: { task: TaskListItem }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const rerun = useRerunTask()
  const del = useDeleteTask()

  return (
    <li className="cmc-task-board__row">
      <span className="cmc-task-board__title">{task.title}</span>
      <div className="cmc-task-board__badges">
        {task.skill ? <Badge>{task.skill}</Badge> : null}
        {task.model ? <Badge>{task.model}</Badge> : null}
        {task.quadrant ? <Badge>{task.quadrant}</Badge> : null}
        {task.risk ? (
          <Badge variant={task.risk === 'high' ? 'danger' : 'neutral'}>
            {task.risk}
          </Badge>
        ) : null}
        {task.status === 'failed' ? (
          <Badge variant="danger">Failed</Badge>
        ) : null}
      </div>
      <div className="cmc-task-board__actions">
        {task.status === 'failed' ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => rerun.mutate(task.id)}
            disabled={rerun.isPending}
          >
            Rerun
          </Button>
        ) : null}
        {task.status !== 'running' ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setConfirmOpen(true)}
          >
            Delete
          </Button>
        ) : null}
      </div>
      <AlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete task '${task.title}'?`}
        description="This cannot be undone."
        actionLabel="Delete"
        actionVariant="destructive"
        onAction={() => {
          del.mutate(task.id, {
            onSuccess: () => setConfirmOpen(false),
          })
        }}
      />
    </li>
  )
}

function ApprovalRow({ task }: { task: TaskListItem }) {
  const approve = useApproveTask()
  return (
    <li className="cmc-task-board__banner-row">
      <span className="cmc-task-board__title">{task.title}</span>
      <Button
        type="button"
        size="sm"
        variant="primary"
        onClick={() => approve.mutate(task.id)}
        disabled={approve.isPending}
      >
        Approve
      </Button>
    </li>
  )
}
