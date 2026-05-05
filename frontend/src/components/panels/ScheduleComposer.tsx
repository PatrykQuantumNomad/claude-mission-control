// ScheduleComposer — TPNL-04 (current).
//
// Sheet-wrapped form for creating schedules. Composes:
//   - native time picker (input type='time')
//   - 7 day-of-week chips (bespoke <button aria-pressed> — design notes//     chips: bespoke for v1; not Radix toggle group)
//   - live cronstrue preview from cron-utils.partsToCron + prettyCron
//   - advanced cron textarea (manual override; non-empty wins over chips)
//   - NL-cron secondary entry (calls useParseNlCron; on 503 surfaces body
//     literal "natural-language schedules unavailable" verbatim — V11)
//   - inline task_template fields (title/description/model/mode/priority/
//     quadrant/risk/approval/dry_run) — design notes//     over nested Sheet for v1
//   - skill picker (uses useSkills cache — already polled at 60_000ms)
//
// Pitfall 3: cron preview uses "Keep typing…" fallback while user is mid-edit
// (focused) on the advanced cron field; the inline error only renders AFTER
// blur. We track this via advancedBlurred state.
//
// Pitfall 6: drafts persist to localStorage under 'cmc.composer.schedule.draft'
// (storage helper auto-prefixes 'cmc.', so we pass the suffix). Distinct from
// TaskComposer's 'cmc.composer.task.draft' so the two composers can't collide.
//
// skipPersistRef pattern reused from TaskComposer: after onSuccess
// clears the draft AND resets the form, the next change-effect would clobber
// the cleared key with the empty default — the ref flag swallows that one tick.
//
// useCreateSchedule is NOT optimistic (server may 422 on cron, 409 on name).
// On error we preserve the typed form (Pitfall 2 pattern from DecisionsCard).

import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button, Sheet } from '../ui'
import {
  useCreateSchedule,
  useParseNlCron,
  useSkills,
} from '../../lib/queries'
import { storage } from '../../lib/storage'
import { partsToCron, prettyCron } from '../../lib/cron-utils'
import type { ScheduleCreate, TaskCreate } from '../../lib/api'

const DRAFT_KEY = 'composer.schedule.draft'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

interface ScheduleComposerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ComposerDraft {
  name: string
  time: string // 'HH:MM'
  days: ReadonlyArray<DayIndex>
  advancedCron: string
  skill: string | null
  task_template: TaskCreate
}

function defaultTaskTemplate(): TaskCreate {
  return {
    title: '',
    description: '',
    priority: 3,
    approval: 'auto',
    dry_run: false,
    execution_mode: 'interactive',
  }
}

function defaultDraft(): ComposerDraft {
  return {
    name: '',
    time: '09:00',
    days: [1, 2, 3, 4, 5],
    advancedCron: '',
    skill: null,
    task_template: defaultTaskTemplate(),
  }
}

export function ScheduleComposer({ open, onOpenChange }: ScheduleComposerProps) {
  const [draft, setDraft] = useState<ComposerDraft>(
    () => storage.get<ComposerDraft>(DRAFT_KEY) ?? defaultDraft(),
  )
  const [advancedBlurred, setAdvancedBlurred] = useState(false)
  const skipPersistRef = useRef(false)
  const m = useCreateSchedule()
  const skills = useSkills()

  // Persist draft on every change (Pitfall 6 — solo dashboard, direct write).
  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    storage.set(DRAFT_KEY, draft)
  }, [draft])

  // Restore draft when Sheet opens (mirrors TaskComposer pattern).
  useEffect(() => {
    if (open) {
      const restored = storage.get<ComposerDraft>(DRAFT_KEY)
      if (restored) setDraft(restored)
      setAdvancedBlurred(false)
    }
  }, [open])

  // Compute the cron expression from the discrete state. Advanced cron
  // (when non-empty) wins over chips/time so power users can hand-author.
  const computedCron = useMemo(() => {
    if (draft.advancedCron.trim()) return draft.advancedCron.trim()
    const [h, mm] = draft.time.split(':').map(Number)
    return partsToCron({ minute: mm, hour: h, days: draft.days })
  }, [draft.time, draft.days, draft.advancedCron])

  const preview = useMemo(() => prettyCron(computedCron), [computedCron])

  function update<K extends keyof ComposerDraft>(
    key: K,
    value: ComposerDraft[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function updateTaskTemplate<K extends keyof TaskCreate>(
    key: K,
    value: TaskCreate[K],
  ) {
    setDraft((prev) => ({
      ...prev,
      task_template: { ...prev.task_template, [key]: value },
    }))
  }

  function toggleDay(d: DayIndex) {
    setDraft((prev) => {
      const has = prev.days.includes(d)
      const next = has
        ? prev.days.filter((x) => x !== d)
        : [...prev.days, d].sort((a, b) => a - b)
      return { ...prev, days: next as ReadonlyArray<DayIndex> }
    })
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!draft.name.trim() || m.isPending) return
    const body: ScheduleCreate = {
      name: draft.name.trim(),
      cron: computedCron,
      enabled: true,
      task_template: draft.task_template as unknown as Record<string, unknown>,
      ...(draft.skill ? { skill: draft.skill } : {}),
    }
    m.mutate(body, {
      onSuccess: () => {
        storage.remove(DRAFT_KEY)
        skipPersistRef.current = true
        setDraft(defaultDraft())
        onOpenChange(false)
      },
      // No onError handler — preserve typed form (Pitfall 2 pattern).
    })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New schedule"
      description="Time, days, and a task template."
    >
      <form onSubmit={handleSubmit} className="cmc-composer">
        <label className="cmc-composer__field">
          <span>Name</span>
          <input
            type="text"
            className="cmc-input"
            value={draft.name}
            onChange={(e) => update('name', e.target.value)}
            maxLength={120}
            required
            disabled={m.isPending}
            data-testid="schedule-composer-name"
          />
        </label>

        <label className="cmc-composer__field">
          <span>Time</span>
          <input
            type="time"
            className="cmc-input"
            value={draft.time}
            onChange={(e) => update('time', e.target.value)}
            disabled={m.isPending}
          />
        </label>

        <fieldset className="cmc-composer__field">
          <legend>Days</legend>
          <div className="cmc-day-chips" role="group" aria-label="Days of week">
            {DAY_LABELS.map((label, idx) => {
              const i = idx as DayIndex
              const on = draft.days.includes(i)
              return (
                <button
                  key={label}
                  type="button"
                  className={`cmc-day-chip ${on ? 'cmc-day-chip--on' : ''}`.trim()}
                  aria-pressed={on}
                  onClick={() => toggleDay(i)}
                  disabled={m.isPending}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <label className="cmc-composer__field">
          <span>Advanced cron</span>
          <textarea
            className="cmc-input"
            value={draft.advancedCron}
            onChange={(e) => {
              update('advancedCron', e.target.value)
              setAdvancedBlurred(false)
            }}
            onBlur={() => setAdvancedBlurred(true)}
            rows={2}
            placeholder="0 9 * * 1-5 (overrides time + days)"
            disabled={m.isPending}
          />
        </label>

        <p className="cmc-cron-preview" aria-live="polite">
          {preview.ok ? (
            <span>{preview.text}</span>
          ) : advancedBlurred ? (
            <span
              data-testid="cmc-cron-preview-error"
              style={{ color: 'var(--cmc-status-red)' }}
            >
              {preview.error}
            </span>
          ) : (
            <span className="cmc-text-subtle">Keep typing…</span>
          )}
        </p>

        <NLCronInput
          onResolved={(cron) => {
            update('advancedCron', cron)
            setAdvancedBlurred(true)
          }}
        />

        <fieldset className="cmc-composer__field">
          <legend>Task template</legend>
          <label className="cmc-composer__field">
            <span>Task title</span>
            <input
              type="text"
              className="cmc-input"
              value={draft.task_template.title}
              onChange={(e) => updateTaskTemplate('title', e.target.value)}
              maxLength={200}
              disabled={m.isPending}
            />
          </label>
          <label className="cmc-composer__field">
            <span>Task description</span>
            <textarea
              className="cmc-input"
              value={draft.task_template.description ?? ''}
              onChange={(e) => updateTaskTemplate('description', e.target.value)}
              rows={2}
              disabled={m.isPending}
            />
          </label>
          <label className="cmc-composer__field">
            <span>Model</span>
            <input
              type="text"
              className="cmc-input"
              value={draft.task_template.model ?? ''}
              onChange={(e) =>
                updateTaskTemplate('model', e.target.value || undefined)
              }
              disabled={m.isPending}
            />
          </label>
          <label className="cmc-composer__field">
            <span>Execution mode</span>
            <select
              className="cmc-input"
              value={draft.task_template.execution_mode ?? 'interactive'}
              onChange={(e) =>
                updateTaskTemplate(
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
              value={draft.task_template.priority ?? 3}
              onChange={(e) =>
                updateTaskTemplate(
                  'priority',
                  Number.parseInt(e.target.value, 10) || 3,
                )
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
              value={draft.task_template.quadrant ?? ''}
              onChange={(e) => {
                const v = e.target.value
                updateTaskTemplate(
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
              value={draft.task_template.risk ?? ''}
              onChange={(e) => {
                const v = e.target.value
                updateTaskTemplate(
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
              value={draft.task_template.approval ?? 'auto'}
              onChange={(e) =>
                updateTaskTemplate(
                  'approval',
                  e.target.value as TaskCreate['approval'],
                )
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
              checked={Boolean(draft.task_template.dry_run)}
              onChange={(e) => updateTaskTemplate('dry_run', e.target.checked)}
              disabled={m.isPending}
            />
            <span>Dry run</span>
          </label>
        </fieldset>

        <label className="cmc-composer__field">
          <span>Skill</span>
          <select
            className="cmc-input"
            value={draft.skill ?? ''}
            onChange={(e) =>
              update('skill', e.target.value === '' ? null : e.target.value)
            }
            disabled={m.isPending}
          >
            <option value="">—</option>
            {skills.data?.items?.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
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
            onClick={() => onOpenChange(false)}
            disabled={m.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={m.isPending || !draft.name.trim()}
          >
            {m.isPending ? 'Saving…' : 'Create schedule'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function NLCronInput({
  onResolved,
}: {
  onResolved: (cron: string) => void
}): ReactNode {
  const [text, setText] = useState('')
  const m = useParseNlCron()
  return (
    <div className="cmc-nl-cron">
      <label className="cmc-label" htmlFor="cmc-nl-cron-input">
        Or describe in natural language
      </label>
      <input
        id="cmc-nl-cron-input"
        type="text"
        className="cmc-input"
        placeholder="every weekday at 9am"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={m.isPending}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!text.trim() || m.isPending}
        onClick={() =>
          m.mutate(
            { description: text },
            { onSuccess: (r) => onResolved(r.cron) },
          )
        }
      >
        {m.isPending ? 'Parsing…' : 'Parse'}
      </Button>
      {m.isError ? (
        <p className="cmc-text-subtle" role="alert">
          {/* V11: surfaces 503 body literal "natural-language schedules
              unavailable" verbatim via ApiError.message — does NOT branch
              on the failure mode. */}
          {m.error instanceof Error ? m.error.message : 'NL parsing failed'}
        </p>
      ) : null}
    </div>
  )
}
