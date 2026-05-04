// AlertRuleForm — ALRT-10 (Phase 15 Plan 05).
//
// Composer for creating alert rules. Discriminated union over `kind`
// (threshold | anomaly) drives field rendering — see Plan 05 D-02:
// segmented control switches the form's field set; switching kind clears
// threshold_fire / threshold_clear because anomaly interprets z-scores
// while threshold interprets raw metric values.
//
// KNOWN_METRICS sync warning: this constant mirrors backend
// cmc/alerts/scope.py::_SCOPE_EXTRACTORS keys (Plan 01 D-01 vocabulary
// lock). When backend adds a 4th metric, update this constant. Phase 17
// may fetch dynamically. Server still validates via is_known_metric so a
// stale client constant 422s cleanly rather than corrupting the DB.
//
// useCreateAlertRule is NOT optimistic (server may 422 on threshold_clear
// >= threshold_fire / unknown metric / spec_version mismatch). On error we
// preserve the typed form (Pitfall 2 pattern from DecisionsCard /
// ScheduleComposer) — server error message is rendered inline in a
// role="alert" paragraph.
//
// Layout: This panel is NOT a Sheet (unlike ScheduleComposer / TaskComposer
// which open via "+ New" buttons). It's a ROOT-LEVEL composer rendered
// inline next to AlertRulesList in the .cmc-card-grid — same idiom as
// TaskComposer's Cmd+K embedded form. Uses .cmc-card directly because
// PanelCard requires a UseQueryResult; this is a write-side form, not a
// read-side panel.

import { FormEvent, useState } from 'react'
import { Button } from '../ui'
import { useCreateAlertRule } from '../../lib/queries'
import type { AlertKind, AlertRuleCreate } from '../../lib/api'

// Mirrors backend cmc/alerts/scope.py::_SCOPE_EXTRACTORS keys (Plan 01 D-01).
// Keep in sync — see file header.
const KNOWN_METRICS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'cost_usd_24h', label: 'Cost (USD, 24h)' },
  { value: 'skill_p95_latency_ms', label: 'Skill p95 latency (ms)' },
  { value: 'dispatcher_failed_tasks_5m', label: 'Failed tasks (5m)' },
] as const

interface ThresholdDraft {
  kind: 'threshold'
  name: string
  metric: string
  enabled: boolean
  threshold_fire: string                  // string for controlled input; parseFloat on submit
  threshold_clear: string
  min_dwell_seconds: string
  cooldown_seconds: string
}

interface AnomalyDraft {
  kind: 'anomaly'
  name: string
  metric: string
  enabled: boolean
  threshold_fire: string                  // z-score
  threshold_clear: string
  min_samples: string
  min_dwell_seconds: string
  cooldown_seconds: string
  window_n: string                        // params_json.window_n
}

type Draft = ThresholdDraft | AnomalyDraft

function defaultThresholdDraft(): ThresholdDraft {
  return {
    kind: 'threshold',
    name: '',
    metric: KNOWN_METRICS[0].value,
    enabled: true,
    threshold_fire: '',
    threshold_clear: '',
    min_dwell_seconds: '0',
    cooldown_seconds: '0',
  }
}

function defaultAnomalyDraft(): AnomalyDraft {
  return {
    kind: 'anomaly',
    name: '',
    metric: KNOWN_METRICS[0].value,
    enabled: true,
    threshold_fire: '3.0',
    threshold_clear: '1.5',
    min_samples: '10',
    min_dwell_seconds: '0',
    cooldown_seconds: '0',
    window_n: '50',
  }
}

function parseNumberOrNull(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function buildBody(draft: Draft): AlertRuleCreate | { error: string } {
  const name = draft.name.trim()
  if (!name) return { error: 'Name is required.' }
  if (name.length > 120) return { error: 'Name must be 120 chars or fewer.' }

  if (draft.kind === 'threshold') {
    const fire = parseNumberOrNull(draft.threshold_fire)
    if (fire === null) {
      return { error: 'Threshold rules require a numeric threshold_fire.' }
    }
    const clear = parseNumberOrNull(draft.threshold_clear)
    if (clear !== null && clear >= fire) {
      return { error: 'threshold_clear must be less than threshold_fire.' }
    }
    const dwell = parseNumberOrNull(draft.min_dwell_seconds) ?? 0
    const cooldown = parseNumberOrNull(draft.cooldown_seconds) ?? 0
    return {
      name,
      kind: 'threshold',
      metric: draft.metric,
      enabled: draft.enabled,
      threshold_fire: fire,
      ...(clear !== null ? { threshold_clear: clear } : {}),
      min_dwell_seconds: Math.max(0, Math.trunc(dwell)),
      cooldown_seconds: Math.max(0, Math.trunc(cooldown)),
    }
  }

  // anomaly
  const fire = parseNumberOrNull(draft.threshold_fire)
  if (fire === null) {
    return { error: 'Anomaly rules require a numeric z-score for threshold_fire.' }
  }
  const clear = parseNumberOrNull(draft.threshold_clear)
  if (clear !== null && clear >= fire) {
    return { error: 'threshold_clear must be less than threshold_fire.' }
  }
  const minSamples = parseNumberOrNull(draft.min_samples) ?? 10
  const windowN = parseNumberOrNull(draft.window_n) ?? 50
  const dwell = parseNumberOrNull(draft.min_dwell_seconds) ?? 0
  const cooldown = parseNumberOrNull(draft.cooldown_seconds) ?? 0
  return {
    name,
    kind: 'anomaly',
    metric: draft.metric,
    enabled: draft.enabled,
    threshold_fire: fire,
    ...(clear !== null ? { threshold_clear: clear } : {}),
    min_samples: Math.max(1, Math.trunc(minSamples)),
    min_dwell_seconds: Math.max(0, Math.trunc(dwell)),
    cooldown_seconds: Math.max(0, Math.trunc(cooldown)),
    params_json: { window_n: Math.max(1, Math.trunc(windowN)) },
  }
}

export function AlertRuleForm() {
  const [draft, setDraft] = useState<Draft>(() => defaultThresholdDraft())
  const [clientError, setClientError] = useState<string | null>(null)
  const m = useCreateAlertRule()

  function setKind(kind: AlertKind) {
    setClientError(null)
    setDraft(kind === 'threshold' ? defaultThresholdDraft() : defaultAnomalyDraft())
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }) as Draft)
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (m.isPending) return
    const body = buildBody(draft)
    if ('error' in body) {
      setClientError(body.error)
      return
    }
    setClientError(null)
    m.mutate(body, {
      onSuccess: () => {
        // Reset to a fresh threshold draft on success — matches the
        // ScheduleComposer pattern of clearing draft post-create.
        setDraft(defaultThresholdDraft())
      },
      // No onError handler — preserve typed form (Pitfall 2 pattern).
    })
  }

  return (
    <article className="cmc-card cmc-alert-rule-form">
      <header className="cmc-panel-card__header">
        <div>
          <p className="cmc-label" style={{ color: 'var(--cmc-text-subtle)', margin: 0 }}>
            ALRT-10
          </p>
          <h2 className="cmc-card__title" style={{ margin: 0 }}>
            Create alert rule
          </h2>
          <p className="cmc-card__description" style={{ margin: 0 }}>
            Threshold = raw metric crosses a fire/clear pair; Anomaly = EWMA
            z-score exceeds the bound.
          </p>
        </div>
      </header>
      <form onSubmit={handleSubmit} className="cmc-composer">
        <div className="cmc-composer__field">
          <span className="cmc-label">Kind</span>
          <div role="group" aria-label="Rule kind" className="cmc-segmented">
            <button
              type="button"
              className={`cmc-btn cmc-btn--sm ${draft.kind === 'threshold' ? 'cmc-btn--primary' : 'cmc-btn--ghost'}`.trim()}
              aria-pressed={draft.kind === 'threshold'}
              onClick={() => setKind('threshold')}
              disabled={m.isPending}
            >
              Threshold
            </button>
            <button
              type="button"
              className={`cmc-btn cmc-btn--sm ${draft.kind === 'anomaly' ? 'cmc-btn--primary' : 'cmc-btn--ghost'}`.trim()}
              aria-pressed={draft.kind === 'anomaly'}
              onClick={() => setKind('anomaly')}
              disabled={m.isPending}
            >
              Anomaly
            </button>
          </div>
        </div>

        <label className="cmc-composer__field">
          <span>Name</span>
          <input
            type="text"
            className="cmc-input"
            value={draft.name}
            onChange={(e) => update('name', e.target.value)}
            maxLength={120}
            disabled={m.isPending}
          />
        </label>

        <label className="cmc-composer__field">
          <span>Metric</span>
          <select
            className="cmc-input"
            value={draft.metric}
            onChange={(e) => update('metric', e.target.value)}
            disabled={m.isPending}
          >
            {KNOWN_METRICS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="cmc-composer__field">
          <span>{draft.kind === 'anomaly' ? 'Z-score fire' : 'Threshold fire'}</span>
          <input
            type="number"
            className="cmc-input"
            value={draft.threshold_fire}
            onChange={(e) => update('threshold_fire', e.target.value)}
            step="any"
            disabled={m.isPending}
            placeholder={draft.kind === 'anomaly' ? '3.0' : 'e.g. 10'}
          />
        </label>

        <label className="cmc-composer__field">
          <span>{draft.kind === 'anomaly' ? 'Z-score clear (optional)' : 'Threshold clear (optional)'}</span>
          <input
            type="number"
            className="cmc-input"
            value={draft.threshold_clear}
            onChange={(e) => update('threshold_clear', e.target.value)}
            step="any"
            disabled={m.isPending}
            placeholder={draft.kind === 'anomaly' ? '1.5' : 'e.g. 5'}
          />
        </label>

        {draft.kind === 'anomaly' ? (
          <>
            <label className="cmc-composer__field">
              <span>Min samples</span>
              <input
                type="number"
                className="cmc-input"
                value={(draft as AnomalyDraft).min_samples}
                onChange={(e) =>
                  setDraft({ ...(draft as AnomalyDraft), min_samples: e.target.value })
                }
                min={1}
                disabled={m.isPending}
              />
            </label>
            <label className="cmc-composer__field">
              <span>Window N</span>
              <input
                type="number"
                className="cmc-input"
                value={(draft as AnomalyDraft).window_n}
                onChange={(e) =>
                  setDraft({ ...(draft as AnomalyDraft), window_n: e.target.value })
                }
                min={1}
                disabled={m.isPending}
              />
            </label>
          </>
        ) : null}

        <label className="cmc-composer__field">
          <span>Min dwell (seconds)</span>
          <input
            type="number"
            className="cmc-input"
            value={draft.min_dwell_seconds}
            onChange={(e) => update('min_dwell_seconds', e.target.value)}
            min={0}
            disabled={m.isPending}
          />
        </label>

        <label className="cmc-composer__field">
          <span>Cooldown (seconds)</span>
          <input
            type="number"
            className="cmc-input"
            value={draft.cooldown_seconds}
            onChange={(e) => update('cooldown_seconds', e.target.value)}
            min={0}
            disabled={m.isPending}
          />
        </label>

        <label className="cmc-composer__field cmc-composer__field--inline">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
            disabled={m.isPending}
          />
          <span>Enabled</span>
        </label>

        {clientError ? (
          <p role="alert" className="cmc-composer__error">
            {clientError}
          </p>
        ) : null}
        {m.isError ? (
          <p role="alert" className="cmc-composer__error">
            {m.error instanceof Error ? m.error.message : 'Save failed'}
          </p>
        ) : null}

        <div className="cmc-composer__actions">
          <Button type="submit" variant="primary" disabled={m.isPending}>
            {m.isPending ? 'Saving…' : 'Create rule'}
          </Button>
        </div>
      </form>
    </article>
  )
}
