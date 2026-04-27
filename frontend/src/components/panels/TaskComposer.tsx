// TaskComposer — TPNL-02 (Phase 7 Plan 03 / Wave 2).
//
// Sheet-wrapped bespoke form for creating tasks with all 9 fields surfaced.
// Drafts persist to localStorage under 'cmc.composer.task.draft' (Pitfall 6 —
// distinct namespace so a future Schedule composer using its own key cannot
// collide). Submit dispatches useCreateTask which is NOT optimistic (RESEARCH
// §Anti-patterns: schedules/tasks 422 risk) — on 422 the body literal renders
// inline AND the form is preserved so the user can edit and retry.
//
// Mounted globally at AppShell via TaskComposerProvider so Cmd+K → 'Quick task'
// can open the composer from any route. The Provider+hook pattern keeps state
// out of the route tree and makes the open-trigger reachable from siblings.

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  FormEvent,
  ChangeEvent,
} from 'react'
import { Sheet, Button } from '../ui'
import { useCreateTask } from '../../lib/queries'
import { storage } from '../../lib/storage'
import type { TaskCreate } from '../../lib/api'

const DRAFT_KEY = 'composer.task.draft'

// ----------------------------------------------------------------------------
// Context — exposes {open, setOpen} to descendants. CommandPalette consumes
// this to flip the composer open from the Cmd+K menu without prop-drilling.
// ----------------------------------------------------------------------------

interface TaskComposerCtxValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const TaskComposerCtx = createContext<TaskComposerCtxValue | null>(null)

export function TaskComposerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <TaskComposerCtx.Provider value={{ open, setOpen }}>
      {children}
      <TaskComposer open={open} onOpenChange={setOpen} />
    </TaskComposerCtx.Provider>
  )
}

export function useTaskComposer(): TaskComposerCtxValue {
  const ctx = useContext(TaskComposerCtx)
  if (!ctx) throw new Error('useTaskComposer must be used within TaskComposerProvider')
  return ctx
}

// ----------------------------------------------------------------------------
// Form
// ----------------------------------------------------------------------------

type TaskComposerForm = TaskCreate

function defaultTaskForm(): TaskComposerForm {
  return {
    title: '',
    description: '',
    priority: 3,
    approval: 'auto',
    dry_run: false,
    execution_mode: 'interactive',
  }
}

interface TaskComposerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TaskComposer({ open, onOpenChange }: TaskComposerProps) {
  const m = useCreateTask()
  const [form, setForm] = useState<TaskComposerForm>(
    () => storage.get<TaskComposerForm>(DRAFT_KEY) ?? defaultTaskForm(),
  )
  // Tracks whether the next form-change effect should write to storage.
  // After a successful submit we clear storage AND reset form to defaults;
  // without this guard the "form changed" effect would re-persist the empty
  // default and clobber the cleared draft.
  const skipPersistRef = useRef(false)

  // Persist on every change (Pitfall 6 — solo dashboard, direct write fine).
  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    storage.set(DRAFT_KEY, form)
  }, [form])

  // On Sheet open, restore the latest draft. This handles the case where the
  // composer is closed without submit/cancel and re-opened later.
  useEffect(() => {
    if (open) {
      const draft = storage.get<TaskComposerForm>(DRAFT_KEY)
      if (draft) setForm(draft)
    }
  }, [open])

  function update<K extends keyof TaskComposerForm>(
    key: K,
    value: TaskComposerForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.title.trim() || m.isPending) return
    m.mutate(form, {
      onSuccess: () => {
        storage.remove(DRAFT_KEY)
        // Skip the next persist effect so the empty default doesn't get
        // written back into storage immediately after we cleared it.
        skipPersistRef.current = true
        setForm(defaultTaskForm())
        onOpenChange(false)
      },
      // onError: NO action — preserve typed form so user can fix + retry.
    })
  }

  function handleCancel() {
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New task"
      description="All fields except title are optional."
    >
      <form onSubmit={handleSubmit} className="cmc-composer">
        <label className="cmc-composer__field">
          <span>Title</span>
          <input
            type="text"
            className="cmc-input"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            maxLength={200}
            required
            disabled={m.isPending}
          />
        </label>
        <label className="cmc-composer__field">
          <span>Description</span>
          <textarea
            className="cmc-input"
            value={form.description ?? ''}
            onChange={(e) => update('description', e.target.value)}
            rows={3}
            disabled={m.isPending}
          />
        </label>
        <label className="cmc-composer__field">
          <span>Skill</span>
          <input
            type="text"
            className="cmc-input"
            value={form.skill ?? ''}
            onChange={(e) => update('skill', e.target.value || undefined)}
            disabled={m.isPending}
          />
        </label>
        <label className="cmc-composer__field">
          <span>Model</span>
          <input
            type="text"
            className="cmc-input"
            value={form.model ?? ''}
            onChange={(e) => update('model', e.target.value || undefined)}
            disabled={m.isPending}
          />
        </label>
        <label className="cmc-composer__field">
          <span>Execution mode</span>
          <select
            className="cmc-input"
            value={form.execution_mode ?? 'interactive'}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              update(
                'execution_mode',
                e.target.value as TaskCreate['execution_mode'],
              )
            }
            disabled={m.isPending}
          >
            <option value="interactive">interactive</option>
            <option value="classic">classic</option>
            <option value="stream">stream</option>
          </select>
        </label>
        <label className="cmc-composer__field">
          <span>Priority (1–5)</span>
          <input
            type="number"
            className="cmc-input"
            value={form.priority ?? 3}
            onChange={(e) =>
              update('priority', Number.parseInt(e.target.value, 10) || 3)
            }
            min={1}
            max={5}
            disabled={m.isPending}
          />
        </label>
        <label className="cmc-composer__field">
          <span>Quadrant</span>
          <select
            className="cmc-input"
            value={form.quadrant ?? ''}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              const v = e.target.value
              update(
                'quadrant',
                v === '' ? undefined : (v as TaskCreate['quadrant']),
              )
            }}
            disabled={m.isPending}
          >
            <option value="">—</option>
            <option value="do">do</option>
            <option value="plan">plan</option>
            <option value="delegate">delegate</option>
            <option value="drop">drop</option>
          </select>
        </label>
        <label className="cmc-composer__field">
          <span>Risk</span>
          <select
            className="cmc-input"
            value={form.risk ?? ''}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              const v = e.target.value
              update(
                'risk',
                v === '' ? undefined : (v as TaskCreate['risk']),
              )
            }}
            disabled={m.isPending}
          >
            <option value="">—</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
        <label className="cmc-composer__field">
          <span>Approval</span>
          <select
            className="cmc-input"
            value={form.approval ?? 'auto'}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              update('approval', e.target.value as TaskCreate['approval'])
            }
            disabled={m.isPending}
          >
            <option value="auto">auto</option>
            <option value="awaiting_approval">awaiting_approval</option>
          </select>
        </label>
        <label className="cmc-composer__field cmc-composer__field--inline">
          <input
            type="checkbox"
            checked={Boolean(form.dry_run)}
            onChange={(e) => update('dry_run', e.target.checked)}
            disabled={m.isPending}
          />
          <span>Dry run</span>
        </label>
        {m.isError ? (
          <p role="alert" className="cmc-composer__error">
            {m.error instanceof Error ? m.error.message : 'Save failed'}
          </p>
        ) : null}
        <div className="cmc-composer__actions">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={m.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={m.isPending || !form.title.trim()}
          >
            {m.isPending ? 'Saving\u2026' : 'Create task'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
