---
phase: 21-alert-anomaly-depth-nl-authoring
plan: 03
type: execute
wave: 2
depends_on: [21-02]
files_modified:
  - frontend/src/lib/api.ts
  - frontend/src/lib/queries.ts
  - frontend/src/components/panels/AlertRuleForm.tsx
  - frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx
  - backend/tests/test_alerts_metrics_sync.py
autonomous: true
requirements: [ALRT-14]

must_haves:
  truths:
    - "AlertRuleForm renders an NL input + Parse button (mirroring NLCronInput at ScheduleComposer.tsx:452-498)."
    - "On Parse success, the AlertDialog preview modal shows parsed fields read-only (name, kind, metric, threshold_fire, threshold_clear, min_samples, params_json window_kind+window_n where applicable, plus echoed input description)."
    - "On Save in the preview modal, useCreateAlertRule fires with the parsed AlertRuleCreate (NOT merged with the manual draft) — the modal is the authoritative payload."
    - "On Parse failure (503), the form surfaces an inline 'could not parse — please rephrase' message via role='alert' (mirrors NLCronInput at ScheduleComposer.tsx:487-494). NO auto-save, NO fallback rule."
    - "AlertRuleForm sources KNOWN_METRICS from useAlertMetrics() at runtime; the existing hard-coded constant remains as a fallback during the loading window."
    - "Backend pytest test_alerts_metrics_sync.py reads frontend/src/components/panels/AlertRuleForm.tsx, regex-extracts the fallback constant values, and asserts equality with sorted(_SCOPE_EXTRACTORS.keys()) — fails fast on cross-language drift."
    - "While useParseAlertNl.isPending OR previewOpen is true, the manual form fields are disabled (Pitfall 5 — single source of truth for the save payload)."
  artifacts:
    - path: frontend/src/lib/api.ts
      provides: "alertsParseNl(body), alertMetrics() client functions + AlertRuleParseRequest/Response/AlertMetricsResponse types"
      contains: "alertsParseNl"
    - path: frontend/src/lib/queries.ts
      provides: "useParseAlertNl mutation + useAlertMetrics query"
      contains: "useParseAlertNl"
    - path: frontend/src/components/panels/AlertRuleForm.tsx
      provides: "NL input + AlertDialog preview modal + useAlertMetrics-sourced KNOWN_METRICS"
      contains: "useParseAlertNl"
    - path: frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx
      provides: "Tests for NL parse → preview → save flow + parse-error branch"
      contains: "Parse"
    - path: backend/tests/test_alerts_metrics_sync.py
      provides: "Cross-language drift guard — reads AlertRuleForm.tsx, asserts metric values match _SCOPE_EXTRACTORS.keys()"
      contains: "_SCOPE_EXTRACTORS"
  key_links:
    - from: "frontend/src/components/panels/AlertRuleForm.tsx"
      to: "frontend/src/lib/queries.ts:useParseAlertNl + useAlertMetrics"
      via: "import + mutation/query hooks"
      pattern: "useParseAlertNl|useAlertMetrics"
    - from: "frontend/src/lib/queries.ts:useParseAlertNl"
      to: "POST /api/alerts/parse-nl (Plan 21-02)"
      via: "alertsParseNl client fn"
      pattern: "/api/alerts/parse-nl"
    - from: "frontend/src/lib/queries.ts:useAlertMetrics"
      to: "GET /api/alerts/metrics (Plan 21-02)"
      via: "alertMetrics client fn"
      pattern: "/api/alerts/metrics"
    - from: "backend/tests/test_alerts_metrics_sync.py"
      to: "frontend/src/components/panels/AlertRuleForm.tsx + cmc.alerts.scopes._SCOPE_EXTRACTORS"
      via: "regex parse + set equality"
      pattern: "KNOWN_METRICS"
---

<objective>
ALRT-14 frontend + KNOWN_METRICS sync: ship the user-visible NL-authoring flow on top of Plan 21-02's `POST /api/alerts/parse-nl` and `GET /api/alerts/metrics` endpoints, plus a backend pytest that fails fast on cross-language drift between `_SCOPE_EXTRACTORS` and the frontend `KNOWN_METRICS` fallback constant.

- `frontend/src/lib/api.ts` adds `alertsParseNl` + `alertMetrics` client functions and the matching TypeScript types.
- `frontend/src/lib/queries.ts` adds `useParseAlertNl` mutation (mirror `useParseNlCron` at `:745-749`) + `useAlertMetrics` query.
- `frontend/src/components/panels/AlertRuleForm.tsx` adds an NL input + Parse button + an `AlertDialog`-wrapped preview modal showing the parsed `AlertRuleCreate` read-only; on Save, fires `useCreateAlertRule.mutate(parsedRule)` directly. On Parse 503, renders an inline `role="alert"` "could not parse" message. KNOWN_METRICS is sourced from `useAlertMetrics().data ?? FALLBACK_KNOWN_METRICS` — runtime sync via React Query.
- `frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx` adds tests for the parse → preview → save flow + the parse-error branch. Module-mock `api.alertsParseNl` per the existing module-mock pattern.
- `backend/tests/test_alerts_metrics_sync.py` (NEW) reads `frontend/src/components/panels/AlertRuleForm.tsx`, regex-extracts the metric `value` strings from the `KNOWN_METRICS` constant, and asserts `set(extracted) == set(_SCOPE_EXTRACTORS.keys())`. The test lives in `backend/tests/` because it imports the Python source-of-truth; it reads the TS file as text only (no JS runtime).

Purpose: ship the user-visible Phase 21 deliverable AND the cross-language drift guard. PITFALLS lockout: UI must surface "could not parse" on hallucination — never auto-save a fallback rule.

Output: one atomic commit covering the API client, the query hooks, the form changes, the vitest tests, and the backend sync pytest.
</objective>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/21-alert-anomaly-depth-nl-authoring/21-RESEARCH.md
@.planning/phases/21-alert-anomaly-depth-nl-authoring/21-02-nl-parser-route-and-metrics-SUMMARY.md

# Source-of-truth shipped exemplars (mirror these)
@frontend/src/components/panels/ScheduleComposer.tsx
@frontend/src/components/ui/AlertDialog.tsx
@frontend/src/components/panels/AlertRuleForm.tsx
@frontend/src/lib/api.ts
@frontend/src/lib/queries.ts
@backend/cmc/alerts/scopes.py
</context>

<plan_context>
**Locked decisions (from RESEARCH.md + ROADMAP success criteria 3+4+5):**

1. Modal mount: existing `AlertDialog` primitive at `frontend/src/components/ui/AlertDialog.tsx:34` (Radix-portaled, role="alertdialog", title + description + cancelLabel + actionLabel + actionVariant + onAction + arbitrary children). Title: `"Preview alert rule"`. Action label: `"Save"`. Cancel label: `"Cancel"`.

2. NL input UX: mirror `NLCronInput` at `ScheduleComposer.tsx:452-498` — single text input + Parse button (disabled while empty / pending) + inline error message on failure. Placeholder example: `"alert me when haiku skill p95 exceeds 5s for 10 minutes"`.

3. Save semantics (Pitfall 5): when the user clicks Save in the preview modal, the parsed `AlertRuleCreate` is the AUTHORITATIVE payload — DO NOT merge with the manual draft. To prevent the two-sources-of-truth bug, the manual form fields are DISABLED while `useParseAlertNl.isPending` OR `previewOpen` is `true` (the simpler-than-confirmation alternative). On modal Cancel, manual draft is preserved.

4. Error UX (Pitfall 6, recommendation A): the backend collapses both failure modes (no API key + Haiku invalid output) to a single 503 with body literal `"natural-language alerts unavailable"`. The frontend renders a single inline `<p role="alert" className="cmc-text-subtle">` with the message `"Could not parse — please rephrase or use the manual form below."` (do NOT echo the raw 503 body literal — UX needs an actionable message; the 503 contract stays at the network layer). Mirrors NLCronInput's error rendering at `ScheduleComposer.tsx:487-494`.

5. KNOWN_METRICS sync: ship BOTH paths.
   - **Runtime path:** `useAlertMetrics()` query (TanStack Query) — `staleTime: Infinity` (vocabulary changes only on backend deploys). The form's `<select>` options are sourced from `useAlertMetrics().data ?? FALLBACK_KNOWN_METRICS`.
   - **Static guard:** the existing hard-coded constant in `AlertRuleForm.tsx:33-39` is RENAMED to `FALLBACK_KNOWN_METRICS` and kept as the loading-window fallback. The backend pytest `test_alerts_metrics_sync.py` regex-extracts the `value` strings from this constant and asserts equality with `sorted(_SCOPE_EXTRACTORS.keys())`. Either constant drift or backend dict drift fails the test fast.

6. NO new dependencies. The existing `@radix-ui/react-alert-dialog`, `@tanstack/react-query`, and shipped `Button` / `AlertDialog` primitives suffice.

7. `useParseAlertNl` mutation shape mirrors `useParseNlCron` at `lib/queries.ts:745-749` — same React Query mutation signature, same error surfacing pattern.

8. Vitest test scaffolding: module-mock `api.alertsParseNl` per the existing `vi.mock('../../lib/api')` pattern in the alerts test files. Render `AlertRuleForm`, type into the NL input, click Parse, assert preview modal opens with the expected fields, click Save, assert `useCreateAlertRule.mutate` was called with the parsed payload. Hallucination branch: mock `alertsParseNl` to reject (503) and assert the inline error renders without auto-saving.

9. Backend sync pytest specifics:
   - Path: `backend/tests/test_alerts_metrics_sync.py`.
   - Read the TS file as text via `Path(__file__).resolve().parents[2] / "frontend" / "src" / "components" / "panels" / "AlertRuleForm.tsx"`.
   - Regex: extract all `value: '...'` (or `value: "..."`) string literals inside the `FALLBACK_KNOWN_METRICS` (or original `KNOWN_METRICS`) array literal. Use a tight regex anchored to the const name to avoid catching unrelated `value:` occurrences.
   - Assertion: `set(extracted) == set(_SCOPE_EXTRACTORS.keys())`.
   - Diagnostic: on failure, print BOTH sets and the symmetric difference so the failure mode is obvious.

10. Plan 21-03 depends on Plan 21-02 (the endpoints must exist before the frontend can call them). Wave 2.

**Out of scope:**
- Editing the parsed rule before save — v1 is preview-and-confirm only (RESEARCH user_constraints "Deferred Ideas").
- Per-user / per-project NL templates.
- Streaming responses.
- Re-prompting on validation failure.
- Playwright E2E (RESEARCH Plan 21-04 — explicitly NOT recommended; CI lacks `ANTHROPIC_API_KEY` for round-trip).

**Conflict-free with Plans 21-01 / 21-02:** This plan touches frontend + a new backend test file ONLY. Zero overlap with the backend Python files modified by Plans 01/02.
</plan_context>

<tasks>

<task type="auto">
  <name>Task 1: API client + query hooks + AlertRuleForm NL input + preview modal</name>
  <files>frontend/src/lib/api.ts, frontend/src/lib/queries.ts, frontend/src/components/panels/AlertRuleForm.tsx</files>
  <action>
**A) `frontend/src/lib/api.ts` — append client functions + types:**

Add types matching the backend Pydantic envelopes from Plan 21-02:

```ts
export interface AlertRuleParseRequest { description: string }
export interface AlertRuleParseResponse { rule: AlertRuleCreate; description: string }
export interface AlertMetricsResponse { metrics: string[] }
```

Add client functions next to the existing alerts client functions (`api.ts:1155-1180` region):

```ts
export async function alertsParseNl(body: AlertRuleParseRequest): Promise<AlertRuleParseResponse> {
  return jsonRequest<AlertRuleParseResponse>('/api/alerts/parse-nl', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function alertMetrics(): Promise<AlertMetricsResponse> {
  return jsonRequest<AlertMetricsResponse>('/api/alerts/metrics', { method: 'GET' })
}
```

(Use whatever the file's existing `jsonRequest` / `fetch` wrapper pattern is — mirror neighboring alerts client functions verbatim.)

**B) `frontend/src/lib/queries.ts` — append hooks:**

Add `useParseAlertNl` mutation mirroring `useParseNlCron` at `:745-749`:

```ts
export function useParseAlertNl() {
  return useMutation({
    mutationFn: (body: AlertRuleParseRequest) => alertsParseNl(body),
  })
}
```

Add `useAlertMetrics` query — `staleTime: Infinity`, no auto-refetch (vocabulary is deploy-stable):

```ts
export function useAlertMetrics() {
  return useQuery({
    queryKey: ['alerts', 'metrics'],
    queryFn: () => alertMetrics(),
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
```

(If the file uses a different React Query option naming convention, mirror the neighboring queries.)

**C) `frontend/src/components/panels/AlertRuleForm.tsx` — NL input + preview modal + KNOWN_METRICS source:**

1. Rename the existing constant `KNOWN_METRICS` (`:33-39`) to `FALLBACK_KNOWN_METRICS`. Update the file-header comment block (`:9-13`) to remove the "Phase 17 may fetch dynamically" TODO and replace with: "Phase 21 wires runtime sync via useAlertMetrics(); the constant below is the loading-window fallback. Backend test_alerts_metrics_sync.py guards drift between this constant and _SCOPE_EXTRACTORS."

2. Inside the component, source the metric options at runtime:

```ts
const metricsQuery = useAlertMetrics()
const knownMetrics = useMemo(() => {
  const keys = metricsQuery.data?.metrics
  if (!keys || keys.length === 0) return FALLBACK_KNOWN_METRICS
  // Preserve labels from the fallback when a key matches; fall back to the
  // raw key for any new metric the backend exposes ahead of the frontend.
  const labelByKey = new Map(FALLBACK_KNOWN_METRICS.map(m => [m.value, m.label]))
  return keys.map(k => ({ value: k, label: labelByKey.get(k) ?? k }))
}, [metricsQuery.data])
```

Replace existing `KNOWN_METRICS.map(...)` references in the JSX with `knownMetrics.map(...)`.

3. Add a local sub-component (or inline section) for the NL input. Mirror `NLCronInput` at `ScheduleComposer.tsx:452-498`:

```tsx
function AlertNlInput({
  onParsed,
  disabled,
}: {
  onParsed: (rule: AlertRuleCreate, description: string) => void
  disabled: boolean
}) {
  const [text, setText] = useState('')
  const m = useParseAlertNl()
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
            { onSuccess: (r) => onParsed(r.rule, r.description) },
          )
        }
      >
        {m.isPending ? 'Parsing…' : 'Parse'}
      </Button>
      {m.isError ? (
        <p className="cmc-text-subtle" role="alert">
          Could not parse — please rephrase or use the manual form below.
        </p>
      ) : null}
    </div>
  )
}
```

4. Wire local state for the preview modal at the top of `AlertRuleForm`:

```ts
const [parsedRule, setParsedRule] = useState<AlertRuleCreate | null>(null)
const [parsedDescription, setParsedDescription] = useState('')
const previewOpen = parsedRule !== null
const createMutation = useCreateAlertRule()  // existing
```

5. Render `<AlertNlInput onParsed={(rule, desc) => { setParsedRule(rule); setParsedDescription(desc) }} disabled={createMutation.isPending} />` near the top of the form (above the manual fields).

6. Disable manual form fields whenever `previewOpen || createMutation.isPending` — pass `disabled` through to every `<input>` / `<select>` / `<Button>`. (Pitfall 5.)

7. Render the preview modal using `AlertDialog`:

```tsx
<AlertDialog
  open={previewOpen}
  onOpenChange={(o) => { if (!o) setParsedRule(null) }}
  title="Preview alert rule"
  description={`Review the parsed rule from "${parsedDescription}" before saving.`}
  cancelLabel="Cancel"
  actionLabel="Save"
  actionVariant="primary"
  onAction={() => {
    if (parsedRule) {
      createMutation.mutate(parsedRule, {
        onSuccess: () => setParsedRule(null),
      })
    }
  }}
>
  {parsedRule ? (
    <dl className="cmc-rule-preview">
      <dt>Name</dt><dd>{parsedRule.name}</dd>
      <dt>Kind</dt><dd>{parsedRule.kind}</dd>
      <dt>Metric</dt><dd>{parsedRule.metric}</dd>
      <dt>Threshold (fire)</dt><dd>{parsedRule.threshold_fire ?? '—'}</dd>
      <dt>Threshold (clear)</dt><dd>{parsedRule.threshold_clear ?? '—'}</dd>
      <dt>Min samples</dt><dd>{parsedRule.min_samples ?? 1}</dd>
      <dt>Min dwell (s)</dt><dd>{parsedRule.min_dwell_seconds ?? 0}</dd>
      <dt>Cooldown (s)</dt><dd>{parsedRule.cooldown_seconds ?? 0}</dd>
      {parsedRule.kind === 'anomaly' && parsedRule.params_json ? (
        <>
          <dt>Window kind</dt><dd>{(parsedRule.params_json as any).window_kind ?? 'ewma'}</dd>
          <dt>Window N</dt><dd>{(parsedRule.params_json as any).window_n ?? 50}</dd>
        </>
      ) : null}
    </dl>
  ) : null}
</AlertDialog>
```

DO NOT auto-fire the create mutation on Parse success — the preview modal is the explicit confirm step. DO NOT merge `parsedRule` with the manual draft on Save (Pitfall 5). DO NOT echo the raw 503 body literal in the UI; use the actionable message above.
  </action>
  <verify>
```bash
cd frontend && pnpm tsc --noEmit
cd frontend && pnpm vitest run src/components/panels/__tests__/AlertRuleForm.test.tsx --no-coverage
```

Manual sanity (with backend running and `ANTHROPIC_API_KEY` set):
1. Navigate to `/alerts` (or wherever AlertRuleForm renders).
2. Type `"alert me when haiku skill p95 exceeds 5s for 10 minutes"` in the NL input. Click Parse. Modal opens with `kind=anomaly`, `metric=skill_p95_latency_ms`, `threshold_fire=5000.0` (or whatever Haiku decides).
3. Click Save. New rule appears in `AlertRulesList`.
4. Type a nonsense prompt. Click Parse. Inline `role="alert"` message renders without auto-save.
  </verify>
  <done>
- `tsc --noEmit` clean.
- AlertRuleForm renders NL input + Parse button.
- Parse success → AlertDialog modal with parsed fields read-only.
- Save → `useCreateAlertRule.mutate(parsedRule)` fires; modal closes on success.
- Parse failure (503) → inline `role="alert"` message; no auto-save.
- Manual form fields disabled while preview is open or create mutation pending.
- KNOWN_METRICS sourced from `useAlertMetrics()` at runtime (with FALLBACK_KNOWN_METRICS during loading).
  </done>
</task>

<task type="auto">
  <name>Task 2: Vitest tests for AlertRuleForm + backend KNOWN_METRICS sync pytest</name>
  <files>frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx, backend/tests/test_alerts_metrics_sync.py</files>
  <action>
**A) `frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx` — new tests:**

Mirror the existing module-mock pattern in this test file. Required new cases:

1. `test('NL parse → preview modal → save fires useCreateAlertRule with parsed rule')`:
   - Mock `api.alertsParseNl` to resolve with `{ rule: <valid AlertRuleCreate>, description: 'alert me when haiku skill p95 exceeds 5s' }`.
   - Mock `api.alertsCreateRule` (or whatever the create-rule client fn is named) to resolve.
   - Mock `api.alertMetrics` to resolve with the canonical 3-metric list.
   - Render `<AlertRuleForm />` (with the existing `QueryClientProvider` test wrapper).
   - Type "alert me ..." into the NL input (`screen.getByLabelText(/describe in natural language/i)`).
   - Click Parse (`screen.getByRole('button', { name: /parse/i })`).
   - Assert preview modal opens (`screen.findByRole('alertdialog')`).
   - Assert the parsed metric value renders (`screen.getByText(/skill_p95_latency_ms/i)`).
   - Click Save (the modal's action button).
   - Assert `api.alertsCreateRule` was called with the parsed rule object — NOT a merged draft.

2. `test('NL parse failure renders inline could-not-parse message; does not auto-save')`:
   - Mock `api.alertsParseNl` to reject (simulate 503 from the backend; whatever error the existing fetch wrapper throws).
   - Render the form; type prompt; click Parse.
   - Assert `screen.getByRole('alert')` renders the "Could not parse — please rephrase ..." message.
   - Assert the preview modal is NOT in the DOM (`screen.queryByRole('alertdialog')` is null).
   - Assert `api.alertsCreateRule` was NOT called.

3. `test('manual form fields disabled while preview modal is open')`:
   - Mock parse + metrics as in #1.
   - Type into NL input → Parse → modal opens.
   - Assert that a known manual input (e.g. the rule name input) has the `disabled` attribute (`expect(screen.getByLabelText(/name/i)).toBeDisabled()`).
   - Click Cancel on the modal; assert the manual input is re-enabled.

4. (Optional) `test('useAlertMetrics drives the metric <select> options')`:
   - Mock `api.alertMetrics` to resolve with `{ metrics: ['cost_usd_24h', 'dispatcher_failed_tasks_5m', 'skill_p95_latency_ms'] }`.
   - Render the form.
   - `await screen.findByRole('option', { name: /skill p95/i })`.
   - Assert all three options render.

DO NOT use msw or any new HTTP mocking layer — mirror whatever module-mock pattern the existing `AlertRuleForm.test.tsx` already uses. Existing tests in this file MUST continue to pass.

**B) NEW `backend/tests/test_alerts_metrics_sync.py`:**

```python
"""ALRT-14 / ROADMAP success criterion 5 — KNOWN_METRICS drift guard.

The frontend FALLBACK_KNOWN_METRICS constant in AlertRuleForm.tsx is the
loading-window fallback while the useAlertMetrics() React Query is in flight.
If the backend dict and the frontend constant drift, the form briefly shows
incorrect options on first render. This test is the static-time guard.

Approach: read the TS file as text, regex-extract the metric `value` strings
from the FALLBACK_KNOWN_METRICS array literal, and assert set equality with
sorted(_SCOPE_EXTRACTORS.keys()).

This test is the second half of the sync mechanism. The first half is the
GET /api/alerts/metrics endpoint shipped in Plan 21-02 + the useAlertMetrics
hook in Plan 21-03 — runtime path. Together they close both holes (drift at
build time, drift at deploy time).
"""
from __future__ import annotations

import re
from pathlib import Path

from cmc.alerts.scopes import _SCOPE_EXTRACTORS


def _extract_frontend_metric_keys() -> set[str]:
    """Read AlertRuleForm.tsx and pull the `value: '...'` strings out of the
    FALLBACK_KNOWN_METRICS array literal.

    Anchored regex: only matches `value:` occurrences within the
    FALLBACK_KNOWN_METRICS const declaration to avoid catching unrelated
    `value:` props elsewhere in the file.
    """
    repo_root = Path(__file__).resolve().parents[2]
    tsx_path = (
        repo_root
        / "frontend"
        / "src"
        / "components"
        / "panels"
        / "AlertRuleForm.tsx"
    )
    src = tsx_path.read_text()

    # Capture the FALLBACK_KNOWN_METRICS array literal body. Tolerates either
    # 'KNOWN_METRICS' or 'FALLBACK_KNOWN_METRICS' const name (Plan 21-03 renames
    # the original; this regex matches either to keep the test forward-portable).
    block_re = re.compile(
        r"(?:FALLBACK_KNOWN_METRICS|KNOWN_METRICS)\s*[:=][^\[]*\[(.+?)\]",
        re.DOTALL,
    )
    block_match = block_re.search(src)
    assert block_match is not None, (
        "Could not find FALLBACK_KNOWN_METRICS array literal in "
        f"{tsx_path}. The cross-language drift guard requires this constant "
        "to remain in AlertRuleForm.tsx — if you renamed or moved it, update "
        "the regex above."
    )
    body = block_match.group(1)
    value_re = re.compile(r"value\s*:\s*['\"]([^'\"]+)['\"]")
    return set(value_re.findall(body))


def test_known_metrics_match_scope_extractors():
    """KNOWN_METRICS drift guard — fails fast if backend or frontend changes
    the metric vocabulary without updating the other.
    """
    frontend = _extract_frontend_metric_keys()
    backend = set(_SCOPE_EXTRACTORS.keys())
    assert frontend == backend, (
        "KNOWN_METRICS drift between frontend FALLBACK_KNOWN_METRICS and "
        "backend _SCOPE_EXTRACTORS.\n"
        f"  Only in frontend: {sorted(frontend - backend)}\n"
        f"  Only in backend:  {sorted(backend - frontend)}\n"
        f"  Frontend full set: {sorted(frontend)}\n"
        f"  Backend full set:  {sorted(backend)}"
    )
```

The test imports `_SCOPE_EXTRACTORS` directly (Python source-of-truth) and reads the TS file as text only — no node / vitest dependency at the backend layer.
  </action>
  <verify>
```bash
cd frontend && pnpm vitest run src/components/panels/__tests__/AlertRuleForm.test.tsx --no-coverage
cd backend && uv run pytest tests/test_alerts_metrics_sync.py -v
cd backend && uv run pytest -q  # full backend suite still green
cd frontend && pnpm vitest run --no-coverage  # full frontend suite still green
```

Negative-test the drift guard locally (without committing): temporarily comment out one entry in `FALLBACK_KNOWN_METRICS`. The pytest must FAIL with the contracted diagnostic showing the symmetric difference. Revert.
  </verify>
  <done>
- 3+ new vitest cases pass; existing AlertRuleForm tests still pass.
- `test_alerts_metrics_sync.py` passes against the current 3-metric vocabulary.
- Negative-test confirmed: removing a frontend metric value makes the pytest FAIL with a clear "Only in backend: [...]" diagnostic.
- Full frontend (`pnpm vitest run`) + full backend (`uv run pytest -q`) suites green.
- No new dependencies added (vitest + pytest + stdlib only).
  </done>
</task>

</tasks>

<verification>
1. `cd frontend && pnpm tsc --noEmit` — type clean.
2. `cd frontend && pnpm vitest run --no-coverage` — full frontend suite green; new AlertRuleForm tests pass.
3. `cd backend && uv run pytest -q` — full backend suite green; `test_alerts_metrics_sync.py` passes.
4. End-to-end smoke (manual, with `ANTHROPIC_API_KEY`): NL prompt → Parse → preview modal → Save → rule appears in list. Hallucinated prompt → "could not parse" inline message; no rule created.
5. `useAlertMetrics()` populates the metric `<select>` from `GET /api/alerts/metrics`. Verify in DevTools Network tab that the request fires once on form mount and is cached (`staleTime: Infinity`).
</verification>

<success_criteria>
- ROADMAP success criterion 3 (frontend half): preview modal shows parsed `AlertRule` (name, kind, metric, threshold, window) before save; user must explicitly click Save.
- ROADMAP success criterion 4 (frontend half): on hallucination → 503 → inline "could not parse" message; no fallback rule, no auto-save.
- ROADMAP success criterion 5: KNOWN_METRICS in sync via BOTH (a) `useAlertMetrics()` runtime fetch from `GET /api/alerts/metrics` AND (b) `test_alerts_metrics_sync.py` static-time drift guard.
- PITFALLS lockout: UI surfaces "could not parse" — never auto-saves a fallback (verified by the parse-failure vitest case).
- Atomic single commit covering: API client + query hooks + form changes + 3 vitest cases + 1 backend sync pytest.
</success_criteria>

<output>
After completion, create `.planning/phases/21-alert-anomaly-depth-nl-authoring/21-03-frontend-nl-input-and-metrics-sync-SUMMARY.md` documenting: API client function names, query hook names, AlertRuleForm prop / state changes, preview modal markup shape, vitest case counts, the sync pytest path, and any deviations. Reference `21-RESEARCH.md` Pattern 4 (UX template via NLCronInput + AlertDialog) for downstream context.
</output>
