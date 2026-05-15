// AlertRuleForm — ALRT-10 (Phase 15 Plan 05) + ALRT-14 NL authoring (Phase 21 Plan 21-03).
//
// Composer for creating alert rules. Discriminated union over `kind`
// (threshold | anomaly) drives field rendering — see Plan 05 D-02:
// segmented control switches the form's field set; switching kind clears
// threshold_fire / threshold_clear because anomaly interprets z-scores
// while threshold interprets raw metric values.
//
// Metric vocabulary (Phase 27 TDBT-02 — supersedes Phase 21 ALRT-14):
// runtime via useAlertMetrics() is the SOLE source (staleTime: Infinity,
// vocabulary changes only on backend deploys). The in-file fallback
// constant was removed in Phase 27 Plan 07; the brief loading window is
// covered by a disabled <select> with a "Loading metric vocabulary…"
// placeholder option (typically 1-2 frames on cold load). The drift guard
// moved from build-time grep (test_alerts_metrics_sync.py — DELETED) to
// runtime API contract (test_alerts_metrics_contract.py — asserts
// sorted(_SCOPE_EXTRACTORS.keys()) == GET /api/alerts/metrics → metrics).
//
// useCreateAlertRule is NOT optimistic (server may 422 on threshold_clear
// >= threshold_fire / unknown metric / spec_version mismatch). On error we
// preserve the typed form (Pitfall 2 pattern from DecisionsCard /
// ScheduleComposer) — server error message is rendered inline in a
// role="alert" paragraph.
//
// NL authoring (ALRT-14, Phase 21 Plan 21-03 — retry UX added Phase 27 Plan 27-08 TDBT-03):
//   - "Or describe in natural language" input + Parse button — mirrors
//     ScheduleComposer.tsx::NLCronInput at :452-498.
//   - Parse success → AlertDialog preview modal shows parsed AlertRuleCreate
//     read-only; Save fires useCreateAlertRule with the parsed rule directly
//     (NOT merged with the manual draft — Pitfall 5 single-source-of-truth).
//   - Parse failure (503 collapsed-failure-mode) → inline role="alert"
//     block with honest non-specific copy + Retry button (Plan 27-08 TDBT-03,
//     LOCKED OPERATOR DECISION 3 / V11 collapsed-failure-mode lock). Retry
//     re-fires useParseAlertNl with the same payload; disabled while
//     m.isPending (DoS guard). NO auto-save, NO fallback rule (PITFALLS
//     lockout per 21-RESEARCH.md). Copy is intentionally non-specific
//     because the backend 503 body cannot distinguish missing credentials
//     from Haiku rejecting output (V11 lock — see backend/cmc/api/routes/alerts.py).
//   - Manual fields disabled while parsing OR preview modal open (Pitfall 5).
//     Manual ThresholdForm / AnomalyForm BELOW AlertNlInput stays usable
//     even on 503 (Phase 21 Pitfall 5 invariant — composer never blocks
//     the manual draft).
//
// Layout: This panel is NOT a Sheet (unlike ScheduleComposer / TaskComposer
// which open via "+ New" buttons). It's a ROOT-LEVEL composer rendered
// inline next to AlertRulesList in the .cmc-card-grid — same idiom as
// TaskComposer's Cmd+K embedded form. Uses .cmc-card directly because
// PanelCard requires a UseQueryResult; this is a write-side form, not a
// read-side panel.

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Button } from '../ui'
import { AlertDialog } from '../ui/AlertDialog'
import {
  useAlertMetrics,
  useCreateAlertRule,
  useParseAlertNl,
} from '../../lib/queries'
import type { AlertKind, AlertRuleCreate } from '../../lib/api'

// Phase 27 TDBT-02: in-file metric-vocabulary fallback constant removed —
// useAlertMetrics is the SOLE source. See file header for rationale.

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
    // Phase 27 TDBT-02: empty-string sentinel — the disabled <select>
    // placeholder reads as "Select a metric…" once useAlertMetrics resolves;
    // buildBody() rejects an empty metric inline (Pitfall 2 typed-form pattern).
    metric: '',
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
    // Phase 27 TDBT-02: empty-string sentinel (see defaultThresholdDraft).
    metric: '',
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

  // Phase 27 TDBT-02: empty-metric sentinel guard. Default drafts initialize
  // metric='' (the <select> renders a disabled "Select a metric…" placeholder
  // until useAlertMetrics resolves AND the user picks one). Pitfall 2 pattern.
  if (!draft.metric) return { error: 'Metric is required.' }

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

/**
 * AlertNlInput — NL → AlertRule preview entry (ALRT-14, Phase 21 Plan 21-03).
 * Mirrors ScheduleComposer.tsx::NLCronInput at :452-498. On parse success
 * the resolved rule is handed to onParsed; on failure the inline role="alert"
 * message renders below the input — NO auto-save, NO fallback rule.
 */
function AlertNlInput({
  onParsed,
  disabled,
}: {
  onParsed: (rule: AlertRuleCreate, description: string) => void
  disabled: boolean
}) {
  const [text, setText] = useState('')
  const m = useParseAlertNl()
  // Phase 27 Plan 27-08 (TDBT-03): latched-error state. React Query resets
  // `isError` to `false` the moment a new mutate() call fires (Retry click),
  // which would unmount the error block (and the Retry button inside it)
  // mid-click — losing both the honest copy and the "Retrying…" affordance.
  // Latch the error so the block stays mounted across the retry's pending
  // window. Clears on success (parsed rule handed to onParsed → block
  // unmounts naturally) and on idle/text edits below.
  const [hadError, setHadError] = useState(false)
  useEffect(() => {
    if (m.isError) setHadError(true)
    else if (m.isSuccess) setHadError(false)
  }, [m.isError, m.isSuccess])
  // Show the error block while the latest mutation is errored OR while a
  // retry is in flight after a prior error (so the "Retrying…" disabled
  // button remains visible — the DoS guard's visual affordance).
  const showError = m.isError || (hadError && m.isPending)
  return (
    <div className="cmc-nl-alert">
      <label className="cmc-label" htmlFor="cmc-nl-alert-input">
        Or describe in natural language
      </label>
      <input
        id="cmc-nl-alert-input"
        type="text"
        className="cmc-input"
        placeholder="alert me when haiku skill p95 exceeds 5s for 10 minutes"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled || m.isPending}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!text.trim() || disabled || m.isPending}
        onClick={() =>
          m.mutate(
            { description: text },
            {
              onSuccess: (r) => onParsed(r.rule, r.description),
              // No onError handler — m.isError drives the inline message
              // below; PITFALLS lockout: NEVER auto-save a fallback rule.
            },
          )
        }
      >
        {m.isPending ? 'Parsing…' : 'Parse'}
      </Button>
      {showError ? (
        // Phase 27 TDBT-03 (Plan 27-08): honest non-specific copy + Retry
        // button. The Phase 21 V11 collapsed-failure-mode lock keeps the
        // backend 503 body literal collapsed — see
        // backend/cmc/api/routes/alerts.py and 21-RESEARCH.md PITFALLS for
        // the two upstream conditions the route maps to a single response.
        // Frontend therefore CANNOT discriminate failure modes; the copy
        // is intentionally non-specific. Specific upstream-mode wording
        // would be dishonest (the backend cannot tell us which failure
        // mode occurred — see LOCKED OPERATOR DECISION 3 in 27-08-PLAN.md
        // for the full rationale). Retry re-fires the same mutation with
        // the same payload — useful when an upstream issue clears between
        // Parse and Retry. disabled={m.isPending} is the DoS guard
        // mirroring the Parse button's pattern (RESEARCH Security Domain).
        // Container is a <div role="alert"> so screen readers announce
        // both the message and the actionable Retry control as one unit.
        // Visibility uses the `showError` latch (m.isError || (hadError &&
        // m.isPending)) so the block stays mounted across the retry's
        // pending window — otherwise React Query resets isError -> false
        // on the next mutate() call and the Retry button vanishes mid-click,
        // breaking the DoS-guard visual affordance.
        <div className="cmc-alert-nl__error" role="alert">
          <p className="cmc-text-subtle">
            Couldn&apos;t parse this description. The phrasing didn&apos;t match a known
            pattern, or the natural-language service is temporarily unavailable.
          </p>
          <div className="cmc-alert-nl__error-actions">
            <button
              type="button"
              className="cmc-btn cmc-btn--sm"
              data-testid="alert-nl-retry"
              disabled={m.isPending}
              onClick={() => {
                if (text.trim().length === 0) return
                m.mutate(
                  { description: text },
                  {
                    onSuccess: (r) => onParsed(r.rule, r.description),
                  },
                )
              }}
            >
              {m.isPending ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function AlertRuleForm() {
  const [draft, setDraft] = useState<Draft>(() => defaultThresholdDraft())
  const [clientError, setClientError] = useState<string | null>(null)
  const [parsedRule, setParsedRule] = useState<AlertRuleCreate | null>(null)
  const [parsedDescription, setParsedDescription] = useState('')
  const m = useCreateAlertRule()
  const metricsQuery = useAlertMetrics()

  // Phase 27 TDBT-02: single source of truth — useAlertMetrics. The backend
  // response shape (AlertMetricsResponse.metrics: list[str]) returns raw
  // metric keys; surface each as both value and label. If the backend ever
  // grows a label channel, this is the single touch point.
  const knownMetrics = useMemo(
    () =>
      (metricsQuery.data?.metrics ?? []).map((key) => ({ value: key, label: key })),
    [metricsQuery.data],
  )

  const previewOpen = parsedRule !== null
  // Manual fields disabled while: (a) the create mutation is in flight, OR
  // (b) the preview modal is open (Pitfall 5 single-source-of-truth — the
  // parsed rule is the authoritative payload, manual draft must not race
  // against it).
  const manualDisabled = m.isPending || previewOpen

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

  function handlePreviewSave() {
    if (!parsedRule) return
    // PITFALL 5: fire the parsed rule directly, NOT merged with the manual
    // draft. The preview modal is the authoritative payload.
    m.mutate(parsedRule, {
      onSuccess: () => {
        setParsedRule(null)
        setParsedDescription('')
      },
      // On error, leave the modal open so the user sees m.isError under the
      // form; standard Pitfall 2 pattern.
    })
  }

  return (
    <article className="cmc-card cmc-card--bounded cmc-alert-rule-form">
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
      <AlertNlInput
        onParsed={(rule, desc) => {
          setClientError(null)
          setParsedRule(rule)
          setParsedDescription(desc)
        }}
        disabled={m.isPending}
      />
      <form onSubmit={handleSubmit} className="cmc-composer">
        <div className="cmc-composer__field">
          <span className="cmc-label">Kind</span>
          <div role="group" aria-label="Rule kind" className="cmc-segmented">
            <button
              type="button"
              className={`cmc-btn cmc-btn--sm ${draft.kind === 'threshold' ? 'cmc-btn--primary' : 'cmc-btn--ghost'}`.trim()}
              aria-pressed={draft.kind === 'threshold'}
              onClick={() => setKind('threshold')}
              disabled={manualDisabled}
            >
              Threshold
            </button>
            <button
              type="button"
              className={`cmc-btn cmc-btn--sm ${draft.kind === 'anomaly' ? 'cmc-btn--primary' : 'cmc-btn--ghost'}`.trim()}
              aria-pressed={draft.kind === 'anomaly'}
              onClick={() => setKind('anomaly')}
              disabled={manualDisabled}
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
            disabled={manualDisabled}
          />
        </label>

        <label className="cmc-composer__field">
          <span>Metric</span>
          <select
            className="cmc-input"
            value={draft.metric}
            onChange={(e) => update('metric', e.target.value)}
            disabled={manualDisabled || metricsQuery.isLoading || knownMetrics.length === 0}
          >
            {/* Phase 27 TDBT-02: loading window placeholder. useAlertMetrics
                has staleTime: Infinity so on cold load this is typically 1-2
                frames; disabled state prevents the user from submitting a
                form with metric='' before the vocabulary lands. */}
            {metricsQuery.isLoading ? (
              <option value="" disabled>
                Loading metric vocabulary…
              </option>
            ) : knownMetrics.length === 0 ? (
              <option value="" disabled>
                No metrics available
              </option>
            ) : (
              <>
                <option value="" disabled>
                  Select a metric…
                </option>
                {knownMetrics.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </>
            )}
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
            disabled={manualDisabled}
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
            disabled={manualDisabled}
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
                disabled={manualDisabled}
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
                disabled={manualDisabled}
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
            disabled={manualDisabled}
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
            disabled={manualDisabled}
          />
        </label>

        <label className="cmc-composer__field cmc-composer__field--inline">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
            disabled={manualDisabled}
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
          <Button type="submit" variant="primary" disabled={manualDisabled}>
            {m.isPending ? 'Saving…' : 'Create rule'}
          </Button>
        </div>
      </form>

      {/* Phase 21 ALRT-14 preview modal — Radix-portaled AlertDialog. The
          parsed rule is shown read-only; Save fires useCreateAlertRule with
          the parsed rule directly (NOT merged with manual draft — Pitfall 5).
          On Cancel (modal close), the manual draft is preserved untouched. */}
      <AlertDialog
        open={previewOpen}
        onOpenChange={(o) => {
          if (!o) {
            setParsedRule(null)
            setParsedDescription('')
          }
        }}
        title="Preview alert rule"
        description={
          parsedDescription
            ? `Review the parsed rule from "${parsedDescription}" before saving.`
            : 'Review the parsed rule before saving.'
        }
        cancelLabel="Cancel"
        actionLabel={m.isPending ? 'Saving…' : 'Save'}
        actionVariant="primary"
        onAction={handlePreviewSave}
      >
        {parsedRule ? (
          <dl className="cmc-rule-preview">
            <dt>Name</dt>
            <dd>{parsedRule.name}</dd>
            <dt>Kind</dt>
            <dd>{parsedRule.kind}</dd>
            <dt>Metric</dt>
            <dd>{parsedRule.metric}</dd>
            <dt>Threshold (fire)</dt>
            <dd>{parsedRule.threshold_fire ?? '—'}</dd>
            <dt>Threshold (clear)</dt>
            <dd>{parsedRule.threshold_clear ?? '—'}</dd>
            <dt>Min samples</dt>
            <dd>{parsedRule.min_samples ?? 1}</dd>
            <dt>Min dwell (s)</dt>
            <dd>{parsedRule.min_dwell_seconds ?? 0}</dd>
            <dt>Cooldown (s)</dt>
            <dd>{parsedRule.cooldown_seconds ?? 0}</dd>
            {parsedRule.kind === 'anomaly' && parsedRule.params_json ? (
              <>
                <dt>Window kind</dt>
                <dd>
                  {(parsedRule.params_json as Record<string, unknown>).window_kind
                    ? String(
                        (parsedRule.params_json as Record<string, unknown>).window_kind,
                      )
                    : 'ewma'}
                </dd>
                <dt>Window N</dt>
                <dd>
                  {(parsedRule.params_json as Record<string, unknown>).window_n
                    ? String(
                        (parsedRule.params_json as Record<string, unknown>).window_n,
                      )
                    : 50}
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </AlertDialog>
    </article>
  )
}
