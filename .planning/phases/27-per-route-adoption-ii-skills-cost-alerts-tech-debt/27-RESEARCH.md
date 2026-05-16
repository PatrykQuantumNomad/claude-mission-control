# Phase 27: Per-Route Adoption II (Skills/Cost/Alerts) + Tech Debt — Research

**Researched:** 2026-05-13
**Domain:** Frontend per-route adoption sweep on tail-end routes (`/skills`, `/skills/$name`, `/cost`, `/alerts`) + 3 carried tech debt items (TDBT-01 `project_key` wire, TDBT-02 `KNOWN_METRICS` removal, TDBT-03 NL composer 503 UX)
**Confidence:** HIGH for adoption pattern (Phase 26 Plan 08 is the verbatim template), HIGH for TDBT anchor points (every file located with line numbers), MEDIUM for TDBT-02 drift-guard reconciliation (one design choice to make), MEDIUM for vocab-bridge expansion (Skills/Cost/Alerts use vocabs broader than `Range`)

<phase_context>
## Phase Context

No CONTEXT.md exists for this phase (operator did not run `/gsd:discuss-phase`). The ROADMAP.md Phase 27 Success Criteria are the **authoritative scope contract**. Five SCs are LOCKED:

1. `/skills/$name` long skill name stays bounded; 4 panels (SkillProjectsTable + SkillRunsTable + SkillLatencyTable + SkillTimeline) scroll internally; density tokens propagate; global time picker re-anchors all four panels.
2. `/cost` 7d/30d range honored via global time picker (or saved view); CostForecastCard + CostByProjectCard re-query and re-render; long project paths truncate; TIME-04 compare-overlay renders against last week / last 30d.
3. `/sessions/compare` picker uses authoritative `project_key` (additive on `SessionListItemFull` and `SessionCompareSide` wire shapes) instead of cwd-as-proxy. (TDBT-01)
4. `/alerts` `AlertRuleForm` metric vocabulary loads exclusively from `useAlertMetrics` hook; `KNOWN_METRICS` frontend fallback constant fully removed; cross-language drift guard `test_alerts_metrics_sync.py` still passes. (TDBT-02)
5. `/alerts` NL composer 503 collapse surfaces graceful retry/queue UX with honest "credentials missing — retry" affordance instead of silent error. (TDBT-03)

There are no Claude's-Discretion or Deferred-Ideas blocks to honor — everything in the success criteria is LOCKED. Plans MUST NOT introduce work outside these five SCs + the three REQ-IDs they cover.
</phase_context>

## Phase 27 in one paragraph

Phase 27 closes the v1.3 per-route adoption arc by sweeping the four tail-end routes (`/skills`, `/skills/$name`, `/cost`, `/alerts`) through the primitives Phase 24 shipped (`BoundedPanelCard` / `cmc-page--bounded` / `TruncatedCell` / `CopyIconButton` / density tokens / z-index ladder), the saved-view URL contract Phase 25 shipped, and the global time picker + Cmd+K + TIME-04 CompareToggle Phase 26 shipped. The adoption work is mechanical (drop-in component swaps + CSS-class additions + per-panel hook bridges) and follows the verbatim pattern of Phase 26 Plan 08 — the only NEW design work is widening the `useRouteRange` bridge to emit `SkillRange` / `CostRange` / `AlertRange` (the three tail-end routes use vocabs broader than the `Range` literal the bridge currently returns). Bundled into the same phase: **three v1.2 tech-debt items that the adoption sweep makes natural to land** — TDBT-01 adds `project_key` to two backend Pydantic schemas + their frontend type mirrors + the compare picker filter, TDBT-02 removes the frontend `FALLBACK_KNOWN_METRICS` constant after reconciling the cross-language drift guard, TDBT-03 adds retry/queue UX to the NL alert composer's 503 collapse. **Five success criteria + 3 REQ-IDs.**

**Primary recommendation:** Mirror Phase 26's 9-plan / 5-wave structure. Land 4 adoption plans (one per route) + 3 TDBT plans (one per REQ-ID) + 1 close-out plan. Wave-1 ships a vocab-bridge expansion (one widened helper used by all four adoption plans). Use Phase 26 Plan 08 as the verbatim template for each adoption plan — the only delta is which panels each route consumes.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `BoundedPanelCard` adoption on Skills/Cost/Alerts panels | Browser / Client (JSX swap) | — | Mechanical — Phase 24 primitives shipped; pure consumer work. |
| `cmc-page--bounded` on 4 route shells | Browser / Client (CSS class) | — | Single class addition per route file. |
| `useRouteRange` bridge widened to `SkillRange` / `CostRange` / `AlertRange` | Browser / Client | — | Pure type-level extension of the existing bridge (`lib/time/useRouteRange.ts`, `lib/time/rangeToVocab.ts`). Backend unchanged. |
| TIME-04 CompareToggle adoption on `/cost` panels (SC#2) | Browser / Client | — | Reuses `CompareToggle` + `compare_panels` URL CSV from Phase 26 Plan 07. CostByProjectCard / CostForecastCard render the prior-period overlay (data is already 30d-ranged). |
| `project_key` wire field (TDBT-01) | API / Backend (primary) | Browser / Client (consumer) | Add field to two Pydantic schemas (`SessionListItem`, `SessionCompareSide`) — the source DB column (`sessions.project_key`) already exists (Phase 19 SKLP-08). Frontend mirrors the type addition and switches `ComparePicker.tsx` filter from `row.cwd === scopeCwd` to `row.project_key === scopeProjectKey`. |
| `FALLBACK_KNOWN_METRICS` removal (TDBT-02) | Browser / Client | Backend (drift guard test) | Frontend deletes the constant + the loading-window fallback path. Backend `test_alerts_metrics_sync.py` must EITHER be replaced (move the drift guard to compare backend metrics against the runtime `/api/alerts/metrics` response shape contract) OR be relaxed (assert `FALLBACK_KNOWN_METRICS == set()` / file absent). Design choice — see TDBT-02 section. |
| NL composer retry/queue UX (TDBT-03) | Browser / Client | — | Frontend-only enhancement: replace the silent-error inline `<p role="alert">` with a retry button (re-fires the `useParseAlertNl` mutation) and an honest "credentials missing — Anthropic API key not configured" body. Optional queue (localStorage of pending descriptions). Backend 503 contract unchanged. |
| Phase 26 a11y Phase-27 deferrals (`.cmc-heatmap-cell`, `.cmc-otel-feed`, `.cmc-sessions-table-header__label`, Range filter `<select>`) | Browser / Client (CSS + JSX) | — | **OUT OF SCOPE** for Phase 27 unless an SC names them. The SCs do not. Defer to a future polish pass. |

## Per-route adoption inventory

For each of the four routes, here is the current state and the diff Phase 27 must apply.

### Route 1: `/skills` ([frontend/src/routes/skills.tsx:1-119](frontend/src/routes/skills.tsx))

**Current panels rendered** (line 102-110):
- `DecisionsCard`, `InboxCard` (full-width above grid)
- Inside `.cmc-card-grid`: `TaskBoard`, `SchedulesCard`, `SkillsRegistry`, `McpPanel` (reqId=SKLP-01), `SkillCostCardForTopSkill` (inline wrapper around `SkillCostCard`), `SkillLatencyTable`, `SkillTimeline`, `ContextHealthCard`

**Current state:**
- ✗ Root `<section>` uses `className="cmc-page"` (line 83) — **MISSING** `cmc-page--bounded`
- ✗ NO panel adopts `bounded` (grep `<BoundedPanelCard` and `bounded` returns 0 hits across skill panels)
- ✗ NO `useRouteRange` consumption — `SkillCostCardForTopSkill` calls `useSkillUsage('14d', 1)` with a hardcoded `'14d'` (line 63)
- ✓ `validateSearch` already in place ([skills.tsx:58-60](frontend/src/routes/skills.tsx)) — only `schemaVersion`, no time params. Phase 25 plan locked: "/skills route lands NO new filters in Phase 25" (line 49-50). Phase 27 must extend it append-only with `time_from?`, `time_to?`, `compare_panels?` matching the pattern from Phase 26 Plan 02 + Plan 07.

**Diff Phase 27 must apply:**
1. Root `<section>` → `className="cmc-page cmc-page--bounded"`
2. `validateSearch` → append `asTimeToken(raw.time_from)` + `asTimeToken(raw.time_to)` + `asComparePanels(raw.compare_panels)` (helpers exist in `lib/searchSchemas.ts`)
3. Adopt `bounded` on each panel rendered inside `.cmc-card-grid` — same mechanical swap as Phase 26 Plan 08 Task 1
4. Time-anchored panels on `/skills` are limited — `SkillCostCardForTopSkill` is the obvious one (calls `useSkillUsage('14d', 1)`); `SkillLatencyTable` and `SkillTimeline` also consume ranges. These need the new `useRouteSkillRange('14d')` bridge (see Vocab Bridge Expansion below)
5. NL/decision/task panels do not consume time params — they opt out by simply not consuming the bridge

**SC#1 dependency:** SC#1 names `/skills/$name`, not `/skills`. The /skills (index) adoption is implicit because Phase 27 is the "tail-end routes" sweep; the SC's "global time picker re-anchors all four panels" specifically targets the detail route's four panels.

### Route 2: `/skills/$name` ([frontend/src/routes/skills_.$name.tsx:1-249](frontend/src/routes/skills_.$name.tsx))

**Current panels rendered** (line 230-243):
- `SkillCostCard` (with internal RangeToggle, persistKey-driven)
- `SkillProjectsTable` (already takes `range` prop threaded from URL — line 238)
- `SkillLatencySnapshot` (inline, calls `useSkillLatency(name, backendRange)`)
- `SkillRunsTable`

⚠️ **SC#1 mismatch:** SC#1 names "SkillProjectsTable + SkillRunsTable + SkillLatencyTable + SkillTimeline". The current detail route renders `SkillLatencySnapshot` (NOT `SkillLatencyTable` — the index uses the table; the detail uses an inline snapshot per the file's own comments at line 19-25: "reusing SkillLatencyTable would force the multi-skill useQueries fan-out hook, which is the wrong shape for a single-skill view"). And the detail route does NOT currently render `SkillTimeline`. **The SC text is therefore aspirational — the planner must decide whether to (a) add `SkillTimeline` to the detail page + rename SkillLatencySnapshot → SkillLatencyTable, (b) treat the SC text as listing the four-panel set that exists today (Cost + Projects + LatencySnapshot + Runs) and update VERIFICATION accordingly, or (c) split: keep SkillLatencySnapshot but ADD SkillTimeline to satisfy the SC text literally.** Recommend (c) — adding SkillTimeline to the detail page is a single-line JSX addition; renaming the inline LatencySnapshot is unnecessary churn. See Open Questions.

**Current state:**
- ✗ Root `<section>` uses `className="cmc-page"` (line 207) — MISSING `cmc-page--bounded`
- ✗ NO panel adopts `bounded`
- ✓ `validateSearch` already accepts `range` (`SkillsDetailRange = '7d' | '14d' | '30d'`) ([skills_.$name.tsx:58-80](frontend/src/routes/skills_.$name.tsx)). Phase 25 plan 04 shipped this — VERIFIED.
- ⚠️ Existing route-local `range` conflicts with the new global `time_from` / `time_to` — must keep the existing `range` URL param working (URL contract is APPEND-ONLY) AND layer the global time picker on top. The pattern Phase 26 Plan 08 used: "if local `range` state is set (not the panel's initial default), use local; otherwise use `globalRange`" — but here the route-local range IS the URL state, not a local-state override. Recommendation: the `range` URL param continues to drive per-panel queries directly; `time_from`/`time_to` are additionally accepted but treated as the "global picker's view" when present (with a fallback chain: explicit `range` > `time_from`/`time_to` snap > per-route default `'14d'`)
- 🔑 The page header already documents this in line 38-39: "Phase 26+ may broaden SkillRange to include '7d' and retire this helper" — Phase 27 does NOT broaden the backend `SkillRange` (out of scope); but the planner should decide if Phase 27 is the right moment

**Diff Phase 27 must apply:**
1. Root `<section>` → `className="cmc-page cmc-page--bounded"`
2. `validateSearch` → preserve `range` (the existing first-class filter), append `time_from?`, `time_to?`, `compare_panels?`
3. Adopt `bounded` on all 4 panels (Cost, Projects, LatencySnapshot, Runs — plus SkillTimeline if SC#1 literal interpretation wins)
4. Each panel's `range` consumption stays as-is (route-local `range` is the canonical source); add an OPTIONAL fallback via `useRouteSkillRange('14d')` when route-local `range` is unset — but the current route always sets `range` (default '14d'), so practically this is a no-op
5. Adopt `TruncatedCell` for long skill name display in the page header (line 224 shows `{name}` raw — for a name like `tdd-coverage-author-with-fanout` it will overflow without containment)

### Route 3: `/cost` ([frontend/src/routes/cost.tsx:1-67](frontend/src/routes/cost.tsx))

**Current panels rendered** (line 56-58):
- `CostForecastCard` ([panels/CostForecastCard.tsx](frontend/src/components/panels/CostForecastCard.tsx)) — no internal range toggle (always month-to-date)
- `CostByProjectCard` ([panels/CostByProjectCard.tsx](frontend/src/components/panels/CostByProjectCard.tsx)) — internal `RangeToggle` with `persistKey='cost-by-project'`, options `7d` / `30d`

**Current state:**
- ✗ Root `<section>` uses `className="cmc-page"` (line 41) — MISSING `cmc-page--bounded`
- ✗ NO panel adopts `bounded`
- ✓ `validateSearch` accepts only `schemaVersion` ([cost.tsx:34-36](frontend/src/routes/cost.tsx)). Comment at line 27 explicitly defers: "stays panel-internal until Phase 26/27 per-route adoption migrates it into the search shape" — **this is Phase 27's job**.
- 🔑 `CostByProjectCard` uses `localStorage`-persisted RangeToggle today. Phase 27 must lift this into URL state — same pattern Phase 26 Plan 08 used for the / and /activity panels (URL is the persistence layer; `localStorage` persistKey dropped)

**Diff Phase 27 must apply:**
1. Root `<section>` → `className="cmc-page cmc-page--bounded"`
2. `validateSearch` → append `asTimeToken(raw.time_from)` + `asTimeToken(raw.time_to)` + `asComparePanels(raw.compare_panels)`
3. Adopt `bounded` on both panels
4. `CostByProjectCard`: replace `useState<CostRange>('7d')` + `RangeToggle persistKey=...` with `useRouteCostRange('7d')` from the widened bridge — URL becomes the source of truth; `persistKey` removed
5. `CostForecastCard`: forecast is always month-to-date (the endpoint has no range param) — opts out of the bridge naturally
6. Long project paths in `CostByProjectCard` already render as `<code className="cmc-numeric">{r.key}</code>` (line 67) — wrap in `TruncatedCell` (the `r.key` is a 12-char hex `project_key`, never a path; truncation is unlikely needed BUT the SC text says "long project paths truncate cleanly" — this is honest-confusion in the SC; the rows are project_key hex, not paths. The `.cmc-numeric` font is already monospace + tabular. Plan can satisfy the SC by adding `TruncatedCell` defensively, OR by documenting the project_key shape — recommend defensive `TruncatedCell` wrap since the column header text says "Project" implying user-visible identity)
7. TIME-04 compare-overlay: SC#2 names "compare-to-previous overlay (TIME-04) renders against last week / last 30d". Mount `<CompareToggle panelId="cost-by-project" />` (or `cost-forecast`) in panel header. The overlay rendering logic on `CostByProjectCard` parallels `TokenUsageCard.tsx:121-166` from Phase 26 Plan 07: client-side slice the previous-period window from a wider 30d fetch and render an additional stack/Bar series. **CostForecastCard cannot render a compare overlay** (no historical timeline data — just a single projected total). Recommend: CompareToggle lands ONLY on CostByProjectCard.

### Route 4: `/alerts` ([frontend/src/routes/alerts.tsx:1-70](frontend/src/routes/alerts.tsx))

**Current panels rendered** (line 56-61):
- `AlertRulesList`
- `AlertRuleForm` (the TDBT-02 + TDBT-03 host — both tech debt items concentrate here)
- `AlertEventsList` (full-width below; has internal 4-tier `RangeToggle` with `persistKey='alert-events-range'`)

**Current state:**
- ✗ Root `<section>` uses `className="cmc-page"` (line 40) — MISSING `cmc-page--bounded`
- ✗ NO panel adopts `bounded`
- ✓ `validateSearch` accepts only `schemaVersion`. Comment at line 26-27: "stays in localStorage until Phase 26/27 per-route adoption migrates it into the search shape" — **this is Phase 27's job**.
- 🔑 `AlertEventsList` uses `AlertRange = '1d' | '7d' | '14d' | '30d'` ([panels/AlertEventsList.tsx:80](frontend/src/components/panels/AlertEventsList.tsx)) with localStorage persistKey. Phase 27 lifts this to URL state via a new `useRouteAlertRange('7d')` bridge.

**Diff Phase 27 must apply:**
1. Root `<section>` → `className="cmc-page cmc-page--bounded"`
2. `validateSearch` → append `asTimeToken(raw.time_from)` + `asTimeToken(raw.time_to)` + `asComparePanels(raw.compare_panels)`
3. Adopt `bounded` on all three panels
4. `AlertEventsList`: replace `useState<AlertRange>('7d')` + `RangeToggle persistKey='alert-events-range'` with `useRouteAlertRange('7d')` from the widened bridge
5. `AlertRuleForm`: no time-range consumption (it's a write-side composer, not a time-anchored read panel) — but it IS the host for TDBT-02 (remove FALLBACK_KNOWN_METRICS) and TDBT-03 (NL composer 503 retry/queue UX). Adoption work here is limited to `bounded` (or none, since the existing comment at line 34-38 explains: "Uses `.cmc-card` directly because PanelCard requires a UseQueryResult; this is a write-side form, not a read-side panel"). **Recommendation:** add `className="cmc-card--bounded"` directly to the existing `<article className="cmc-card cmc-alert-rule-form">` (line 309) since the article is the Card primitive's wrapper — same trick Plan 26-08 used for OtelPanel's bespoke Card.

## Tech debt closures

Three carried v1.2 items co-located with the adoption sweep. Each has a precise origin, target file set, and design constraint.

### TDBT-01 — Expose `project_key` on wire (additive)

**Origin:** Phase 23 (compare depth milestone close). The compare picker on `/sessions/compare` filters its candidate list by `row.cwd === scopeCwd` ([components/ui/CommandPalette.tsx:749](frontend/src/components/ui/CommandPalette.tsx)) — using `cwd` as a project-identity proxy. The lock comment at line 354-358 explicitly flags the weakness: "if SessionListItem grew a `cwd` projection that the picker could read directly, we could scope without consulting the compare cache. SessionListItemFull DOES expose cwd today (per api.ts), so picker filtering can also use the picker's OWN row data: filter by (row.cwd === aCwd)." The edge case: when two sessions live in cwds whose `realpath` resolves to the same target (symlinks) but the raw `cwd` strings differ, the filter incorrectly excludes the matching session. Conversely, when two cwds are byte-equal but their realpath-derived sha1[:12] differs (rare — distinct projects with same path string), the filter incorrectly includes a mismatch.

**Authoritative replacement already exists at the DB layer:** `sessions.project_key` is a Phase 19 column ([backend/cmc/db/models/sessions.py:27-33](backend/cmc/db/models/sessions.py)) populated by `cmc.core.project_key.compute_project_key` (sha1[:12] of `realpath(cwd.rstrip('/'))`). The frontend type at [api.ts:562](frontend/src/lib/api.ts) already documents the field: "project_key (12-char hex of sha1[:12]) is the ONLY project-shaped value." But it's NOT on `SessionListItem` (backend Pydantic, [backend/cmc/api/schemas/sessions.py:19-35](backend/cmc/api/schemas/sessions.py)) or `SessionCompareSide` ([backend/cmc/api/schemas/sessions.py:123-159](backend/cmc/api/schemas/sessions.py)).

**Target files:**
1. [backend/cmc/api/schemas/sessions.py:19-35](backend/cmc/api/schemas/sessions.py) — `SessionListItem` Pydantic ORMBase → add `project_key: str` field (additive; ORMBase auto-maps from `Session.project_key` column)
2. [backend/cmc/api/schemas/sessions.py:123-159](backend/cmc/api/schemas/sessions.py) — `SessionCompareSide` Pydantic BaseModel → add `project_key: str` field (additive; handler must populate it from the ORM row)
3. Backend handler code in `backend/cmc/api/routes/sessions.py` — verify the compare handler builds `SessionCompareSide` from the Session ORM row; if so, `project_key` flows automatically via `model_validate(session_row)`; if the handler builds the BaseModel field-by-field, add `project_key=session.project_key` to the construction. Read [backend/cmc/api/routes/sessions.py](backend/cmc/api/routes/sessions.py) at plan time.
4. [frontend/src/lib/api.ts:103-117](frontend/src/lib/api.ts) — `SessionListItemFull` TypeScript interface → add `project_key: string` (mirror)
5. [frontend/src/lib/api.ts:160-185](frontend/src/lib/api.ts) — `SessionCompareSide` TypeScript interface → add `project_key: string` (mirror)
6. [frontend/src/components/ui/CommandPalette.tsx:362-371](frontend/src/components/ui/CommandPalette.tsx) — `aCwd` derivation switches to `aProjectKey`: read `data.a.project_key` / `data.b.project_key` instead of `cwd`
7. [frontend/src/components/ui/CommandPalette.tsx:710](frontend/src/components/ui/CommandPalette.tsx) — `ComparePicker` prop renames `scopeCwd` → `scopeProjectKey`
8. [frontend/src/components/ui/CommandPalette.tsx:747-750](frontend/src/components/ui/CommandPalette.tsx) — `ComparePicker` filter changes from `row.cwd === scopeCwd` to `row.project_key === scopeProjectKey`
9. [frontend/src/components/ui/CommandPalette.tsx:758-762](frontend/src/components/ui/CommandPalette.tsx) — picker description copy updates (replace "Showing sessions from {cwd} only" with project_key-shaped copy — recommendation: don't show the 12-char hex, fall back to "Showing sessions in the same project")
10. [frontend/src/components/ui/CommandPalette.tsx:790-792](frontend/src/components/ui/CommandPalette.tsx) — picker row display: currently `{row.cwd ?? '—'}`. cwd remains useful as a human-visible label for the row; KEEP the cwd display, only the FILTER switches to project_key

**Consumers to verify (blast radius audit):**
Grep `SessionListItemFull` (9 frontend files): `lib/api.ts`, `lib/queries.ts`, `components/ui/CommandPalette.tsx`, `components/ui/__tests__/CommandPalette.test.tsx`, `components/panels/SessionCompareView.tsx`, `components/panels/SessionsTable.tsx`, `components/panels/__tests__/SkillRunsTable.test.tsx`, `components/panels/__tests__/SessionCompareView.test.tsx`, `components/panels/__tests__/LiveSessionsCard.test.tsx`, `components/panels/__tests__/SessionsTable.test.tsx`. All 9 files use the type, but none of them touch the picker filter — they consume `session_id`/`cwd`/`started_at` etc. The TYPE change is additive; the BEHAVIORAL change is confined to the picker. Test fixtures in the 4 vitest test files MUST be updated to include `project_key: ''` (or a fixture sha1[:12]) in mock objects so the new required field doesn't break compile.

**Wire-shape contract verified:** TDBT-01 is genuinely additive on both schemas — `project_key` already exists at the DB layer; the change is exposing an existing column on two response models. Zero backend logic change beyond the schema/handler-population delta.

### TDBT-02 — Remove `KNOWN_METRICS` frontend fallback

**Origin:** Phase 21 (alert-anomaly-depth-nl-authoring). The frontend has TWO sources for the metric vocabulary:
1. **Runtime** ([frontend/src/lib/queries.ts:265](frontend/src/lib/queries.ts)) — `useAlertMetrics()` fetches `GET /api/alerts/metrics` with `staleTime: Infinity`. This is the canonical source.
2. **Loading-window fallback** ([frontend/src/components/panels/AlertRuleForm.tsx:56-60](frontend/src/components/panels/AlertRuleForm.tsx)) — `FALLBACK_KNOWN_METRICS` constant: 3 entries (`cost_usd_24h`, `skill_p95_latency_ms`, `dispatcher_failed_tasks_5m`). Used when `useAlertMetrics()` is still in flight (typically 1-2 frames on cold load).

**Drift guard mechanism:** [backend/tests/test_alerts_metrics_sync.py:25-69](backend/tests/test_alerts_metrics_sync.py) regex-extracts the `value: '...'` strings from `FALLBACK_KNOWN_METRICS` in `AlertRuleForm.tsx` AT TEST TIME, then asserts equality with `sorted(_SCOPE_EXTRACTORS.keys())` from the backend. The regex tolerates both names: `FALLBACK_KNOWN_METRICS` and `KNOWN_METRICS` (line 47-50 of the test).

**The conflict:** Phase 27 SC#4 says "the metric vocabulary loads exclusively from `useAlertMetrics` hook — `KNOWN_METRICS` frontend fallback constant is fully removed; cross-language drift guard `test_alerts_metrics_sync.py` still passes." The drift guard, AS IT EXISTS TODAY, ASSERTS that the frontend constant exists with a non-empty value (line 53-58: "Could not find FALLBACK_KNOWN_METRICS array literal in {tsx_path}"). **Removing the constant breaks the test.**

**Three design options for reconciling drift guard:**

Option A — **Replace the drift guard with a backend-only constraint test.** Delete `test_alerts_metrics_sync.py`. Add a new test that asserts the `/api/alerts/metrics` response shape (e.g. `assert sorted(_SCOPE_EXTRACTORS.keys()) == response.metrics`). This is the cleanest path — the frontend is no longer the second source of truth, so there's nothing to drift against.

Option B — **Relax the drift guard to assert "the constant does NOT exist."** Update `test_alerts_metrics_sync.py` to assert `FALLBACK_KNOWN_METRICS` is absent from the file. This is regression-proof but doesn't add new safety.

Option C — **Move the drift guard to a build-time TypeScript / contract assertion.** Generate the metric vocabulary types from backend `_SCOPE_EXTRACTORS` via codegen. Higher-effort; not warranted for a 3-element vocab.

**Recommendation: Option A.** The phase description says "test_alerts_metrics_sync.py cross-language drift guard remains" — this is preserve-the-test text, not preserve-the-test-AS-IS text. Renaming the test to `test_alerts_metrics_contract.py` and rewriting it to assert the response-shape contract honors the spirit (cross-language drift detection) while accepting the truth (the frontend no longer has a vocabulary constant to drift). Document this in the plan as a CONTEXT-substitute design call.

**Frontend deletions in AlertRuleForm.tsx:**
- Line 56-60: delete `FALLBACK_KNOWN_METRICS`
- Line 92, 105: `defaultThresholdDraft()` / `defaultAnomalyDraft()` initialize `metric` from `FALLBACK_KNOWN_METRICS[0].value` — replace with `''` (empty string) which renders as the first `<option>` value once `useAlertMetrics` loads, OR with a sentinel that the submit-validator rejects (preserving Pitfall 2 typed-form behavior)
- Line 244: keep `metricsQuery = useAlertMetrics()`
- Line 250-257: simplify the `knownMetrics` useMemo — `metricsQuery.data?.metrics ?? []` (empty array during load — `<select>` renders no options, which renders as disabled; alternative: render a single placeholder `<option disabled>Loading…</option>`)
- Line 252: delete the fallback branch entirely
- Line 254-256: delete the labelByKey merge (no more fallback labels) — labels become the raw metric keys until / unless the backend response includes labels (it doesn't today — `/api/alerts/metrics` returns `AlertMetricsResponse.metrics: list[str]`, just keys)

**Loading-window UX consideration:** Before the deletion, the user sees 3 valid options for a brief moment. After the deletion, they see 0 options for that moment. This is detectable in tests but the phase is single-user localhost (no race-against-CDN concerns). Loading state should render a disabled `<select>` with a "Loading metric vocabulary…" placeholder.

**Target files:**
1. [frontend/src/components/panels/AlertRuleForm.tsx:9-15](frontend/src/components/panels/AlertRuleForm.tsx) — update header comment
2. [frontend/src/components/panels/AlertRuleForm.tsx:51-60](frontend/src/components/panels/AlertRuleForm.tsx) — delete `FALLBACK_KNOWN_METRICS`
3. [frontend/src/components/panels/AlertRuleForm.tsx:88-114](frontend/src/components/panels/AlertRuleForm.tsx) — update default draft initializers
4. [frontend/src/components/panels/AlertRuleForm.tsx:244-257](frontend/src/components/panels/AlertRuleForm.tsx) — simplify metric vocabulary derivation
5. [frontend/src/components/panels/AlertRuleForm.tsx:369-383](frontend/src/components/panels/AlertRuleForm.tsx) — `<select>` rendering: handle empty options (loading state)
6. [backend/tests/test_alerts_metrics_sync.py](backend/tests/test_alerts_metrics_sync.py) — replace with new contract test (Option A)
7. [frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx](frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx) — likely needs updates: any test that asserts the loading-state options render specific metrics will break. The existing test already mocks `/api/alerts/metrics` (line 257-258 verified earlier), so the mocked-vocab path is well-covered.

### TDBT-03 — NL composer 503 retry/queue UX

**Origin:** Phase 21 plan 21-02 ([21-02-PLAN.md:160](.planning/phases/21-alert-anomaly-depth-nl-authoring/21-02-nl-parser-route-and-metrics-PLAN.md)): "DO NOT add a confidence field, retry, multi-shot, code-fence stripping, or fallback rule. Single Haiku call; hard-reject-or-return." This was a deliberate scope-limit in Phase 21. The 503 response body literal is `"natural-language alerts unavailable"` ([backend/cmc/api/routes/alerts.py:413-415](backend/cmc/api/routes/alerts.py)) covering two failure modes (missing `ANTHROPIC_API_KEY` OR Haiku output rejected by `is_known_metric` / `threshold_clear < threshold_fire` validators).

**Current frontend UX** ([frontend/src/components/panels/AlertRuleForm.tsx:225-233](frontend/src/components/panels/AlertRuleForm.tsx)):
```typescript
{m.isError ? (
  <p className="cmc-text-subtle" role="alert">
    Could not parse — please rephrase or use the manual form below.
  </p>
) : null}
```

This is the "silent error" the SC names. The user has no signal whether (a) their phrasing was the problem, or (b) the backend doesn't have credentials. Both cases land on the same message.

**SC#5 requires:** "graceful retry / queue UX with honest 'credentials missing — retry' affordance instead of silent error."

**Design:**

1. **Retry affordance** — wherever the inline error renders, add a `<Button>` that re-fires `m.mutate({ description: text })` with the same payload. Simple, surfaces user agency.
2. **Honest credentials messaging** — the backend SHOULD distinguish the two failure modes in the body. Currently it doesn't (V11 collapsed-failure-mode). Two paths:
   - **(a) Backend extension:** change the 503 body to include a `reason` field discriminating `missing_credentials` vs `parse_rejected`. This violates the V11 lock from Phase 21 ("Do not split into 200+null-rule envelope or distinguish 503 reasons — the user retypes either way") — BUT the SC's "credentials missing — retry" phrasing implies the user CAN distinguish them. Recommendation: revisit the V11 lock with the operator (Open Question 1) before changing the backend.
   - **(b) Frontend-only honest copy:** without backend changes, the frontend can't tell the difference. Render the message: "Couldn't parse — either your phrasing didn't match a known metric pattern, or natural-language alerts are unavailable (Anthropic credentials may be missing). [Retry] [Use manual form]". Action: explicit "Retry" button + persistent "Use manual form" affordance. This satisfies the SC text WITHOUT backend changes.
3. **Queue UX (optional, the SC says "retry / queue UX")** — the slash suggests a single deliverable, not both. Recommendation: ship retry only; defer queue. A queue (localStorage-of-pending-descriptions, fired when credentials become available) is over-engineered for a single-user localhost dev tool.

**Target files:**
1. [frontend/src/components/panels/AlertRuleForm.tsx:184-236](frontend/src/components/panels/AlertRuleForm.tsx) — `AlertNlInput` component → add retry button + honest copy
2. Optional [frontend/src/styles.css](frontend/src/styles.css) — small button-row CSS if the retry affordance needs custom layout
3. [frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx:255-360](frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx) — new test: 503 response shows retry button; clicking retry re-fires the mutation

## Reusable primitives map

Phase 27 ships ZERO new core primitives. Every chrome / primitive piece is consumed from prior phases.

| Primitive | Ships from | Phase 27 consumer |
|-----------|-----------|-------------------|
| `BoundedPanelCard` (or `<PanelCard bounded>`) | Phase 24 Plan 03 ([frontend/src/components/ui/BoundedPanelCard.tsx](frontend/src/components/ui/BoundedPanelCard.tsx)) | All 4 routes' panels |
| `cmc-page--bounded` CSS modifier | Phase 24 Plan 03 ([frontend/src/styles.css](frontend/src/styles.css)) | All 4 route shells |
| `TruncatedCell` | Phase 24 Plan 03 ([frontend/src/components/ui/TruncatedCell.tsx](frontend/src/components/ui/TruncatedCell.tsx)) | `/skills/$name` page header (long skill name), `CostByProjectCard` project column (defensive), `AlertEventsList` rows if long error messages |
| `CopyIconButton` | Phase 24 Plan 03 ([frontend/src/components/ui/CopyIconButton.tsx](frontend/src/components/ui/CopyIconButton.tsx)) | `/skills/$name` page header (copy the skill name), `CostByProjectCard` project column |
| Density tokens (`--cmc-space-*`, `--cmc-text-*`) | Phase 24 Plan 01-02 ([frontend/src/styles.css](frontend/src/styles.css)) | Automatic — every adopted panel inherits via `:root` cascade |
| z-index ladder (`--cmc-z-*`) | Phase 24 Plan 06 ([docs/z-index-ladder.md](docs/z-index-ladder.md)) | Any new Sheet / Popover on /skills/$name detail (likely none needed) |
| `asTimeToken` validator helper | Phase 26 Plan 02 ([frontend/src/lib/searchSchemas.ts](frontend/src/lib/searchSchemas.ts)) | All 4 route `validateSearch` extensions |
| `asComparePanels` validator helper | Phase 26 Plan 07 ([frontend/src/lib/searchSchemas.ts](frontend/src/lib/searchSchemas.ts)) | All 4 route `validateSearch` extensions |
| `useRouteRange(routeDefault)` | Phase 26 Plan 08 ([frontend/src/lib/time/useRouteRange.ts](frontend/src/lib/time/useRouteRange.ts)) | Returns `Range = 'today' \| '7d' \| '30d'` — **does NOT cover** SkillRange / CostRange / AlertRange. Phase 27 must widen (see Vocab Bridge Expansion below). |
| `rangeToVocab({from, to})` | Phase 26 Plan 01 ([frontend/src/lib/time/rangeToVocab.ts](frontend/src/lib/time/rangeToVocab.ts)) | Same — narrow to `Range`. Phase 27 needs vocab-parameterized variants OR additional snap-rule constants. |
| `CompareToggle` | Phase 26 Plan 07 ([frontend/src/components/time/CompareToggle.tsx](frontend/src/components/time/CompareToggle.tsx)) | `/cost` (CostByProjectCard) — SC#2 |
| `TimePicker` + `RefreshDropdown` + `AutoRefreshController` | Phase 26 Plan 03 (mounted in AppShellHeader / AppShell — global, route-agnostic) | Already global. Phase 27 only needs to make the 4 routes consume the URL state. |
| `sonner` toast lib | Phase 26 Plan 01 (mounted in AppShell) | Available for any new toast in TDBT-03 retry / TDBT-01 copy success |
| `cmc.recents.routes` ring | Phase 26 Plan 02 ([frontend/src/lib/recents.ts](frontend/src/lib/recents.ts)) | `IN_SCOPE_ROUTES` already includes `/skills`, `/skills/$name`, `/cost`, `/alerts` (verified in [RecentRoutesTracker.tsx](frontend/src/components/recents/RecentRoutesTracker.tsx) Phase 26 Plan 04). No change needed — Phase 27 routes already track. |

### Vocab Bridge Expansion (NEW lightweight helper, NOT a primitive)

`useRouteRange` returns `Range = 'today' | '7d' | '30d'`. Phase 27's three tail-end routes use:

- `/skills/$name` — `SkillsDetailRange = '7d' | '14d' | '30d'` (URL) / `SkillRange = '14d' | '30d'` (backend Literal) — narrowing helper already in [skills_.$name.tsx:85](frontend/src/routes/skills_.$name.tsx)
- `/cost` (CostByProjectCard) — `CostRange = '1d' | '7d' | '14d' | '30d'`
- `/alerts` (AlertEventsList) — `AlertRange = '1d' | '7d' | '14d' | '30d'`

**Recommended approach — generic vocab-parameterized hook:**

```typescript
// frontend/src/lib/time/useRouteRangeVocab.ts (NEW, ~30 LOC)
import { useRouterState } from '@tanstack/react-router'
import { coerceToAbsolute } from './coerce'
import type { Range, SkillRange, CostRange, AlertRange } from '../api'

/**
 * Generic snap helper — caller supplies the allowed vocab and the snap rules.
 * Falls back to routeDefault when URL time_from/time_to is absent or unparseable.
 *
 * Phase 27 widens the Phase 26 useRouteRange (which only emitted Range) so
 * /skills/$name, /cost, /alerts can also consume the URL time picker.
 */
export function useRouteRangeVocab<V extends string>(
  routeDefault: V,
  snap: (windowHours: number) => V,
): V {
  const location = useRouterState({ select: (s) => s.location })
  const search = (location.search ?? {}) as Record<string, unknown>
  const timeFrom = typeof search.time_from === 'string' ? search.time_from : undefined
  const timeTo = typeof search.time_to === 'string' ? search.time_to : undefined
  if (!timeFrom || !timeTo) return routeDefault
  const fromDate = coerceToAbsolute(timeFrom)
  const toDate = coerceToAbsolute(timeTo)
  if (!fromDate || !toDate) return routeDefault
  const windowHours = (toDate.getTime() - fromDate.getTime()) / 3_600_000
  return snap(windowHours)
}

// Pre-baked vocab snappers for each tail-end route
export function snapToSkillRange(h: number): SkillRange {
  return h <= 24 * 21 ? '14d' : '30d'  // ≤21d → 14d, else 30d
}
export function snapToCostRange(h: number): CostRange {
  if (h <= 24 * 2) return '1d'
  if (h <= 24 * 8) return '7d'
  if (h <= 24 * 21) return '14d'
  return '30d'
}
export function snapToAlertRange(h: number): AlertRange {
  if (h <= 24 * 2) return '1d'
  if (h <= 24 * 8) return '7d'
  if (h <= 24 * 21) return '14d'
  return '30d'
}
```

Three lines at call sites (e.g. `CostByProjectCard`):
```typescript
const range = useRouteRangeVocab<CostRange>('7d', snapToCostRange)
const query = useCostBreakdown('project', range)
```

**Reuse note:** `useRouteRange` from Phase 26 Plan 08 can be re-expressed as `useRouteRangeVocab<Range>(routeDefault, snapToRange)` once the generic exists. Plan can either keep `useRouteRange` as a thin wrapper (zero refactor) OR refactor 9 call sites on `/` + `/activity` to use the generic. Recommend: keep `useRouteRange` AS-IS (thin wrapper) to minimize blast radius — Phase 27 adoption work doesn't need to touch the Phase 26 routes.

## Recommended plan structure

Mirror Phase 26's 9-plan / 5-wave shape. Phase 27 has 5 SCs (vs Phase 26's 5 SCs + 9 REQ-IDs), so plan count can compress slightly — but the tech debt items + 4 adoption routes argue for 8 plans + 1 close-out.

| Wave | Plan | Title | REQ/SC | Parallel-safe with |
|------|------|-------|--------|---------------------|
| 1 | 27-01 | Vocab bridge expansion: ship `useRouteRangeVocab` + snap helpers + vitest | Foundation (no REQ) | 27-02 |
| 1 | 27-02 | TDBT-01 wire-shape additions: `project_key` on backend `SessionListItem` + `SessionCompareSide` + frontend type mirrors + handler audit | TDBT-01 backend half | 27-01 |
| 2 | 27-03 | TDBT-01 compare picker switch: `ComparePicker` filter on `project_key` not `cwd` + test fixture updates across 4 vitest files | TDBT-01 frontend half / SC#3 | 27-04 |
| 2 | 27-04 | `/skills` + `/skills/$name` adoption sweep: validateSearch append, `cmc-page--bounded`, panel `bounded`, vocab bridge wiring, TruncatedCell on header (Phase 26 Plan 08 verbatim template) | SC#1 | 27-05 |
| 3 | 27-05 | `/cost` adoption sweep: validateSearch append, `cmc-page--bounded`, panel `bounded`, vocab bridge wiring on `CostByProjectCard`, CompareToggle on CostByProjectCard with prior-period overlay, TruncatedCell on project column | SC#2 / TIME-04 | 27-06 |
| 3 | 27-06 | `/alerts` adoption sweep: validateSearch append, `cmc-page--bounded`, panel `bounded`, vocab bridge wiring on `AlertEventsList`, AlertRuleForm card-bounded variant | (no REQ; supports TDBT-02/03) | — |
| 4 | 27-07 | TDBT-02 `FALLBACK_KNOWN_METRICS` removal + drift-guard rewrite: delete frontend constant + simplify metric vocabulary derivation + replace `test_alerts_metrics_sync.py` with `test_alerts_metrics_contract.py` (response-shape test) | TDBT-02 / SC#4 | 27-08 |
| 4 | 27-08 | TDBT-03 NL composer retry/queue UX: retry button + honest copy in `AlertNlInput` + vitest cases | TDBT-03 / SC#5 | 27-07 |
| 5 | 27-09 | Close gate: Playwright e2e + axe + Lighthouse + visual-capture cascade for SCs #1-5 + operator-signed `27-VISUAL-CHECK.md` | POLI-09 / all SCs | — |

**Justification for the structure:**
- Wave 1 is parallel-safe (different files): vocab bridge is pure frontend/lib; TDBT-01 backend half is pure backend/.
- Wave 2 is parallel-safe: TDBT-01 frontend half changes `CommandPalette.tsx` ComparePicker; `/skills` + `/skills/$name` adoption changes routes + skill panels.
- Wave 3 is parallel-safe: `/cost` and `/alerts` adoption change non-overlapping files.
- Wave 4 is parallel-safe: TDBT-02 and TDBT-03 both touch `AlertRuleForm.tsx` (different sections of the file). Wave-4 plans must be co-located in branches or merged sequentially — flag in plan dependencies.
- Wave 5 is the close gate (operator checkpoint).

**Alternative compression (7 plans):** Merge 27-01 + 27-02 into a single Wave-1 foundation plan; merge 27-07 + 27-08 into a single TDBT-cleanup plan. Tradeoff: larger atomic plans = harder to review = harder to roll back. Recommend the 9-plan shape per Phase 26 precedent.

## Pitfalls

### Pitfall 1: SkillRange / CostRange / AlertRange are NOT subsets of Range — vocab snap is asymmetric

**What goes wrong:** A planner who skim-reads Phase 26 Plan 08 sees `useRouteRange('today')` and tries to apply it verbatim to `/cost` — the helper returns `Range = 'today' | '7d' | '30d'`, but `useCostBreakdown` expects `CostRange = '1d' | '7d' | '14d' | '30d'`. TypeScript catches it; runtime is fine; but the panel never actually picks `'1d'` or `'14d'` from the global picker.

**Why it happens:** Three independent vocabs evolved in different phases — backend `Range` (Phase 03 read-only APIs), backend `SkillRange` (Phase 14), backend `CostRange` (Phase 20), backend `AlertRange` (Phase 15). The Phase 26 bridge collapsed all of them to `Range` because that's what `/` and `/activity` consumed.

**How to avoid:** Always look at the panel's hook signature before wiring the bridge. For each /cost / /alerts / /skills panel: read `lib/queries.ts` to find the typed `range` arg, then pick the matching `useRouteRangeVocab` instantiation. The vocab-bridge expansion in Plan 27-01 makes this explicit at the type level.

**Warning signs:** TypeScript error `Argument of type 'Range' is not assignable to parameter of type 'CostRange'`. OR a /cost test that toggles the picker through "Last 5 minutes" and the chart never refreshes (5m snaps to `'today'` in the Range vocab but `/cost` doesn't accept `'today'` — silent fallback to `'7d'`).

### Pitfall 2: `/skills/$name` already has a `range` URL param — additive layering, not replacement

**What goes wrong:** The planner reads the Phase 26 pattern "lift RangeToggle into URL state via validateSearch" and tries to replace the existing `?range=` URL param on `/skills/$name` with `?time_from=&time_to=`. URL contract is APPEND-ONLY — removing `?range=` breaks every existing deep-link.

**Why it happens:** `/skills/$name` is the ONLY tail-end route that already lifted its RangeToggle into the URL (Phase 25 Plan 04 — see [skills_.$name.tsx:31-39](frontend/src/routes/skills_.$name.tsx)). It's an outlier among the four routes.

**How to avoid:** Treat `/skills/$name`'s `?range=` as the canonical filter. Add `time_from?` / `time_to?` ADDITIVELY (defaulting to `undefined` per Pitfall 3 below). Panels on the detail route prefer the route-local `?range=` over the global picker — OR, alternatively, the global picker's `time_from`/`time_to` win when present (the route-local `?range=` gets out of the way). **Design call required** — see Open Question 2.

**Warning signs:** A diff that DELETES the `range` field from `SkillsDetailSearch`. The URL-contract pytest will fail.

### Pitfall 3: `validateSearch` is APPEND-ONLY — time_from/time_to default to `undefined`, NOT to a route default

**What goes wrong:** Following Phase 26 Plan 08, a planner writes `time_from: asTimeToken(raw.time_from) ?? 'now-7d'` to default the param. This breaks `DefaultViewLoader`'s "bare URL" gate (Phase 25 plan 10) — when a saved view is set as the route default, DefaultViewLoader only fires if `search` is bare (only `schemaVersion`); a defaulted `time_from` makes search non-bare, and the saved view never auto-loads.

**Why it happens:** Phase 25 Accepted Exception (a) + Phase 26 Pitfall 13. `/skills/$name` already manifests this — its `range` field defaults to `'14d'`, meaning DefaultViewLoader can't auto-load a `/skills/$name` saved view from bare URL. Phase 27 must NOT exacerbate this.

**How to avoid:** `validateSearch` returns `time_from: asTimeToken(raw.time_from)` — the helper returns `undefined` for missing/invalid input. Per-route default is applied AT PANEL READ SITE via `useRouteRangeVocab(routeDefault, ...)`, NOT in the validator. Phase 26 Plan 08 codified this; Phase 27 must follow.

**Warning signs:** A validator like `time_from: typeof raw.time_from === 'string' ? raw.time_from : 'now-7d'`.

### Pitfall 4: `KNOWN_METRICS` drift guard test is BUILD-TIME, not runtime — removing the constant breaks the test

**What goes wrong:** A planner deletes `FALLBACK_KNOWN_METRICS` from `AlertRuleForm.tsx` and ships. CI's `pytest backend/tests/test_alerts_metrics_sync.py` fails with "Could not find FALLBACK_KNOWN_METRICS array literal."

**Why it happens:** The drift test regex-greps the source file ([backend/tests/test_alerts_metrics_sync.py:25-58](backend/tests/test_alerts_metrics_sync.py)) at test time and asserts a non-empty extraction. The test was scoped to Phase 21's design where the constant WAS the second source of truth — Phase 27 removes the second source, so the test must be rewritten or replaced.

**How to avoid:** TDBT-02 plan MUST include either (a) replacing the test with a response-shape contract test (Option A in TDBT-02 section) or (b) relaxing the assertion to verify the constant is absent. The phase SC#4 mandates "drift guard still passes" — interpret as "the spirit of the cross-language drift guard is preserved" not "the existing test runs unchanged."

**Warning signs:** A plan diff that touches `AlertRuleForm.tsx` but doesn't touch `test_alerts_metrics_sync.py`.

### Pitfall 5: `SessionListItemFull` consumers — adding required `project_key` field breaks ALL mock fixtures

**What goes wrong:** TDBT-01 adds `project_key: string` to the TS interface. Vitest test files that construct `SessionListItemFull` mocks (4 test files: `SessionsTable.test.tsx`, `SessionCompareView.test.tsx`, `LiveSessionsCard.test.tsx`, `SkillRunsTable.test.tsx`) now have TypeScript errors because the new required field is absent from every mock object.

**Why it happens:** Adding a required field is a breaking type change for every consumer that constructs the object literal — even though it's wire-additive (backend always emits the field once landed).

**How to avoid:** Two options:
- **(a) Make `project_key: string` required:** update all 4 test fixture files to add `project_key: ''` (empty sentinel matching the DB default) in every mock. Most type-safe; ensures consumers think about it.
- **(b) Make `project_key?: string` optional:** TS sidesteps the test mock break. Weaker — runtime code paths must handle `undefined`. NOT recommended: the field exists at the DB layer for every session row (Phase 19 backfill); making it optional sends the wrong signal.
- **Recommendation: (a).** The blast radius is 4 test files; mechanical edit; type-safe. Use `vi.findFiles` or a codemod if the count grows.

**Warning signs:** `pnpm tsc --noEmit` failures in 4 test files after TDBT-01 lands.

### Pitfall 6: Phase 26 a11y deferrals (`.cmc-heatmap-cell`, `.cmc-otel-feed`, etc.) are NOT in Phase 27 SCs

**What goes wrong:** A planner reads the comment block in [frontend/src/styles.css:212-216](frontend/src/styles.css) ("Phase 27 deferral: aria/semantic carry-overs…") and pulls those 4 items into Phase 27 scope. None of the 5 SCs mention them.

**Why it happens:** Phase 26 Plan 08 deferred these items "to Phase 27" — but the deferral was implicit (the comment is in code; no formal handoff into Phase 27's REQUIREMENTS or ROADMAP). Phase 27's REQ IDs are TDBT-01..03 only; the SCs are the binding contract.

**How to avoid:** Treat the styles.css comment as informational. If the operator wants these items in Phase 27, they need to amend the SCs or REQUIREMENTS. Phase 27 plans should explicitly defer these 4 items to a future phase (or to v1.3 close polish), documented inline in the plan.

**Warning signs:** A plan diff that touches `.cmc-heatmap-cell` aria-prohibited-attr / `.cmc-otel-feed` scrollable-region-focusable / `.cmc-sessions-table-header__label` / Range filter `<select>` without justifying it via an SC quote.

### Pitfall 7: TDBT-03 SC text says "credentials missing — retry" — backend doesn't currently distinguish failure modes

**What goes wrong:** Plan 27-08 author implements the honest copy literally — renders "Anthropic credentials missing" — but the backend 503 collapses BOTH `ANTHROPIC_API_KEY unset` AND `Haiku-output-rejected-by-validators` to the same response body. The frontend can't tell which case fired; the copy is sometimes wrong.

**Why it happens:** Phase 21 V11 collapsed-failure-mode lock ([backend/cmc/api/routes/alerts.py:402-415](backend/cmc/api/routes/alerts.py) + Phase 21 plan 21-02 line 94: "DO NOT split into 200+null-rule envelope or distinguish 503 reasons — the user retypes either way").

**How to avoid:** Two paths:
- **(a) Honor V11; frontend copy is non-specific:** "Couldn't parse — either the phrasing didn't match a known metric pattern, or the natural-language service is unavailable. [Retry]". Doesn't claim "credentials missing." Honest but less SC-text-literal.
- **(b) Break V11; backend distinguishes:** add a `reason: 'missing_credentials' | 'parse_rejected'` field to the 503 body. Frontend renders the case-specific copy. Phase 27 plan-budget: small backend diff (~10 LOC + 1 test).

**Recommendation: (a) for the initial plan; flag as Open Question.** The operator may prefer (b) for V1.3 polish — let them decide. Either way, the SC text ("credentials missing — retry") is paraphrase, not contract; the contract is "honest UX, not silent error" — both (a) and (b) satisfy that.

**Warning signs:** Frontend hard-codes "Anthropic credentials missing" copy on every 503, regardless of root cause.

### Pitfall 8: CostByProjectCard's TIME-04 compare-overlay needs a chart, not just a table

**What goes wrong:** Plan 27-05 reads SC#2 ("compare-to-previous overlay (TIME-04) renders against last week / last 30d") and naively wraps `CostByProjectCard`'s sortable table with a CompareToggle — but the overlay is a chart artifact (the Phase 26 `TokenUsageCard` overlay is a translucent Bar series adjacent to the primary bars). CostByProjectCard has NO chart — it's a `<DataTable>` of rows.

**Why it happens:** SC#2 conflates "compare overlay" (a chart concept) with a table view. Either the SC means CostByProjectCard's table grows a "prior period" column (delta-pill style — `+12%` next to the cost cell), OR CostByProjectCard grows a small chart inline.

**Two design options:**
- **(a) Delta-pill column:** add a "vs prior period" column to `CostByProjectCard` showing the delta (a `<DeltaPill>` primitive already exists from Phase 19 SKLP-08 — see [frontend/src/components/ui/DeltaPill.tsx](frontend/src/components/ui/DeltaPill.tsx)). CompareToggle gates the column visibility. No chart needed.
- **(b) Inline chart:** transform `CostByProjectCard` into a chart panel (group bars by project, secondary stack for prior period). Heavy lift; introduces a new `<ResponsiveContainer>` (Phase 24 lock).

**Recommendation: (a) — DeltaPill column.** Lightweight; reuses an existing primitive; honors the SC text via a sensible interpretation of "overlay." The plan must document the design call.

**Warning signs:** A plan diff for CostByProjectCard that imports recharts — the `<ResponsiveContainer>` count would tick from 26 (Phase 24 lock) → 27.

## Test surface delta

### Existing tests covering touched areas

| Test file | Lines | Covers | Phase 27 impact |
|-----------|-------|--------|------------------|
| [frontend/tests/e2e/skills-detail.spec.ts](frontend/tests/e2e/skills-detail.spec.ts) | (1 test block visible) | SKLP-08/09/10 detail panels | Extend with: 4-panel bounded check, long-name truncation, global picker re-anchor probe |
| [frontend/tests/e2e/cost-dashboard.spec.ts](frontend/tests/e2e/cost-dashboard.spec.ts) | (4+ test blocks visible) | ANLY-06/07 dashboard, path-leakage, 7d→30d toggle | Extend with: bounded check, global picker re-anchor, CompareToggle round-trip |
| [frontend/tests/e2e/alerts.spec.ts](frontend/tests/e2e/alerts.spec.ts) | (1+ tests visible) | TEST-05a lifecycle (create→fire→ack) | Extend with: NL composer retry UX, KNOWN_METRICS-removed regression |
| [frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx](frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx) | 360+ | NL parse-nl mock, threshold/anomaly form, draft preservation | Extend with: retry button (TDBT-03), updated metric-loading state (TDBT-02) |
| [frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx](frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx) | (exists, line count unknown) | Path-leakage dual-guard, sortable rows | Extend with: useRouteRangeVocab consumption probe, CompareToggle gate |
| [frontend/src/components/panels/__tests__/SkillProjectsTable.test.tsx](frontend/src/components/panels/__tests__/SkillProjectsTable.test.tsx) | (exists) | Per-project rollup behavior | Extend with: bounded + global picker probe |
| [frontend/src/components/panels/__tests__/SkillRunsTable.test.tsx](frontend/src/components/panels/__tests__/SkillRunsTable.test.tsx) | (exists) | Recent invocations + session sheet | Add: `project_key` mock fixture (TDBT-01 Pitfall 5) |
| [frontend/src/components/panels/__tests__/SessionCompareView.test.tsx](frontend/src/components/panels/__tests__/SessionCompareView.test.tsx) | (exists) | Compare visual + skill diff | Add: `project_key` mock fixture (TDBT-01 Pitfall 5) |
| [frontend/src/components/panels/__tests__/SessionsTable.test.tsx](frontend/src/components/panels/__tests__/SessionsTable.test.tsx) | (exists) | Sortable table + click handlers | Add: `project_key` mock fixture (TDBT-01 Pitfall 5) |
| [frontend/src/components/panels/__tests__/LiveSessionsCard.test.tsx](frontend/src/components/panels/__tests__/LiveSessionsCard.test.tsx) | (exists) | Live SSE feed | Add: `project_key` mock fixture (TDBT-01 Pitfall 5) |
| [frontend/src/components/ui/__tests__/CommandPalette.test.tsx](frontend/src/components/ui/__tests__/CommandPalette.test.tsx) | (exists) | Compare picker filter | Update: switch picker filter assertion from `cwd` to `project_key` |
| [backend/tests/test_url_contract.py](backend/tests/test_url_contract.py) | 110 | Bidirectional doc⇄route contract | No new URLs — 4 routes already documented. Confirm `docs/url-contract.md` is updated to reflect Phase 27 search-param appends. |
| [backend/tests/test_alerts_metrics_sync.py](backend/tests/test_alerts_metrics_sync.py) | 86 | Cross-language drift guard | **REPLACE** with `test_alerts_metrics_contract.py` (Option A from TDBT-02 design call) |
| [backend/tests/test_sessions_router.py](backend/tests/test_sessions_router.py) (likely) | unknown | SESS-01 list response | Add: `project_key` round-trip assertion (the field MUST be present in the response body) |
| [frontend/tests/e2e/v13-portal-containment.spec.ts](frontend/tests/e2e/v13-portal-containment.spec.ts) | (Phase 24 + 26 extensions) | Sheet/Popover viewport containment | Extend: 4 tail-end routes added to the route-loop |
| [frontend/tests/e2e/v13-a11y.spec.ts](frontend/tests/e2e/v13-a11y.spec.ts) | (Phase 24 + 26 extensions) | axe-core scan per route | Confirm 4 tail-end routes are in the scan loop — likely already there |
| [frontend/tests/e2e/v13-time-picker.spec.ts](frontend/tests/e2e/v13-time-picker.spec.ts) | 496 (Phase 26) | TIME-01..05 + CMDK-02..04 + SHEL-05 on Phase 26 routes | Extend: re-anchor probes on 4 tail-end routes |
| [frontend/tests/e2e/v13-truncation.spec.ts](frontend/tests/e2e/v13-truncation.spec.ts) | (Phase 24) | TruncatedCell behavior | Extend: long skill name on `/skills/$name`, long project_key (or path) on `/cost` |
| [frontend/tests/e2e/v13-visual-capture.spec.ts](frontend/tests/e2e/v13-visual-capture.spec.ts) | (Phase 24 + 26) | Visual matrix | Add: 4 tail-end route × 3 density × 2 theme = 24 NEW PNGs |

### New test coverage Phase 27 must add

- [ ] `frontend/src/lib/time/__tests__/useRouteRangeVocab.test.ts` — covers Plan 27-01 generic helper + snap functions for SkillRange / CostRange / AlertRange
- [ ] `frontend/src/components/panels/__tests__/AlertEventsList.test.tsx` extension — useRouteAlertRange consumption (range comes from URL not localStorage)
- [ ] `frontend/src/components/panels/__tests__/CostByProjectCard.compareOverlay.test.tsx` — TIME-04 CompareToggle + DeltaPill column (mirror Phase 26 Plan 07's TokenUsageCard.compareOverlay.test.tsx)
- [ ] `frontend/src/components/panels/__tests__/AlertRuleForm.retry.test.tsx` (or extend existing) — TDBT-03 retry button + honest copy
- [ ] `frontend/src/components/ui/__tests__/CommandPalette.projectKey.test.tsx` (or extend existing) — TDBT-01 picker filter on project_key
- [ ] `backend/tests/test_alerts_metrics_contract.py` (NEW, replaces test_alerts_metrics_sync.py) — response-shape contract test
- [ ] `backend/tests/test_sessions_router.py` extension — assert `project_key` present in SESS-01 list response (and in `SessionCompareSide`)
- [ ] `frontend/tests/e2e/v13-tail-routes.spec.ts` (NEW) — single new spec covering SC#1–SC#5 e2e: long skill name bounded, /cost compare overlay round-trip, /alerts NL retry UX, picker filter via project_key (could also extend `v13-time-picker.spec.ts` instead — planner choice)

## Verification approach

How to prove each of the 5 SCs at phase close.

**SC#1 — /skills/$name long name + 4 panels bounded + density + global picker re-anchor:**
1. Navigate to `/skills/tdd-coverage-author-with-fanout` (or any synthetic long name) — page header renders without horizontal overflow; TruncatedCell wraps the name in the header
2. Visual capture (Playwright + screenshot) — confirms `cmc-page--bounded` modifier is on the root `<section>`
3. DOM check — each of `SkillCostCard` / `SkillProjectsTable` / `SkillLatencyTable` (or SkillLatencySnapshot if Open Question 1 resolves to retain it) / `SkillTimeline` has a `cmc-card--bounded` class
4. Density toggle: flip Comfortable → Compact via header; assert `<html data-density="compact">` and panel padding visibly tightens (Phase 24 invariant — CSS-only re-paint)
5. Set global time picker to `now-7d` — assert URL gains `?time_from=now-7d&time_to=now` AND that any data refetch goes through (probe via network capture for `/api/skills/...?range=...`); since SkillRange is `'14d' | '30d'`, snap rule maps 7d → 14d

**SC#2 — /cost 7d/30d picker + re-query + TIME-04 overlay + project path truncation:**
1. Open `/cost` — both panels render bounded
2. Open global time picker, click "Last 30 days" — URL gains `?time_from=now-30d&time_to=now`; `CostByProjectCard` re-fetches with `?range=30d` (network capture); rendered table data changes accordingly
3. Save the current range as a saved view — round-trip via SavedViewMenu
4. Click `<CompareToggle panelId="cost-by-project" />` in the panel header — URL gains `?compare_panels=cost-by-project`
5. CostByProjectCard shows a "vs prior period" delta column (or overlay — design choice from Pitfall 8) — DeltaPill values render with correct sign
6. Find a long `project_key` row — `<TruncatedCell>` truncates with tooltip on hover

**SC#3 — /sessions/compare picker uses project_key:**
1. Open `/sessions/compare?a=<sid>` — the compare picker opens
2. DevTools: inspect the response payload of `GET /api/sessions/compare?a=...&b=...` — `a.project_key` field present (12-char hex)
3. Open the picker — DOM check that the filter logic reads `row.project_key === scopeProjectKey`, not `row.cwd === scopeCwd` (vitest is the precision lever; e2e checks the URL/data flow)
4. Edge-case test: backfill the test DB with two sessions whose `realpath(cwd)` resolves identically but raw `cwd` strings differ (symlink case) — assert both appear in the scoped picker
5. Inverse edge-case: two sessions with byte-equal `cwd` strings but different sessions (chained symlinks resolving to different real paths) — assert only the matching project_key row appears

**SC#4 — /alerts AlertRuleForm metric vocabulary from useAlertMetrics only:**
1. `grep -c "FALLBACK_KNOWN_METRICS\|KNOWN_METRICS" frontend/src/components/panels/AlertRuleForm.tsx` = 0
2. Open `/alerts`, observe `AlertRuleForm` `<select>` for metric — assert options loaded from `useAlertMetrics` response (network capture confirms `GET /api/alerts/metrics`)
3. Test the loading state: throttle the request — `<select>` renders disabled with "Loading metric vocabulary…" placeholder
4. Backend pytest: run `pytest backend/tests/test_alerts_metrics_contract.py` (the rewritten guard) — passes; assert it tests the actual response shape
5. `grep` for old test name — `pytest backend/tests/test_alerts_metrics_sync.py` either fails to collect (file deleted) OR passes (rewritten in-place); plan should pick a clear path

**SC#5 — /alerts NL composer 503 retry/queue UX:**
1. Force a 503 from `/api/alerts/parse-nl` (unset `ANTHROPIC_API_KEY` or mock the fetch)
2. Type a description, click "Parse" — UI shows honest copy + "Retry" button (NOT silent error)
3. Click "Retry" — `useParseAlertNl` mutation re-fires with the same payload (network capture confirms re-POST)
4. Manual form remains usable (Phase 21 Pitfall 5 invariant — composer doesn't block the manual draft)
5. (Optional, deferred) Queue: if implemented, descriptions persist across reloads; reload page → "Pending NL queue: 1 description" banner

## Open Questions

Three open questions that need operator decision before plans lock. The researcher recommends a path for each; if operator has no opinion, plan can proceed with the recommendation.

1. **`/skills/$name` 4-panel SC#1 mismatch:** SC#1 names `SkillLatencyTable`, but the detail route currently renders `SkillLatencySnapshot` (inline, single-skill — see [skills_.$name.tsx:89-189](frontend/src/routes/skills_.$name.tsx)). And the detail route does NOT currently render `SkillTimeline`.
   - What we know: The SkillLatencyTable component IS the multi-skill table on `/skills` (the index). The detail route is single-skill. The phase header comment explicitly explains why: "reusing SkillLatencyTable would force the multi-skill useQueries fan-out hook, which is the wrong shape for a single-skill view."
   - What's unclear: did SC#1 author mean the inline snapshot (called LatencyTable colloquially) or the multi-skill component? And did they mean SkillTimeline as a NEW panel on the detail route?
   - **Recommendation:** Interpret SC#1 literally: add `SkillTimeline` to `/skills/$name` (single-line JSX addition, the component exists and works without a `name`-prop wrapper as long as we filter the firehose to the current skill). Keep `SkillLatencySnapshot` and add a code comment that it's the detail-route equivalent of `SkillLatencyTable`. Phase 27 verification can satisfy SC#1 as "4 panels of {Cost, Projects, LatencySnapshot, Runs} + new SkillTimeline = 5 panels, all bounded." This is honest and SC-spirit-faithful. If operator disagrees, the alternative is to rename SkillLatencySnapshot → SkillLatencyTable in the detail file (cosmetic churn).

2. **`/skills/$name` global picker vs route-local `?range=` precedence:** The route already has `?range=` (Phase 25 plan 04). Phase 27 adds `?time_from=`/`?time_to=`. When both are present, which wins for the four panels' queries?
   - What we know: URL contract is append-only; both params must be accepted forever. Phase 25 made `range` the canonical filter; Phase 27 is adding the global picker layer.
   - What's unclear: Whether the operator wants the route-local toggle to override the global picker (Phase 26 Plan 08 precedence pattern) OR the global picker to override the route-local (consistent with "global picker re-anchors all four panels" in SC#1).
   - **Recommendation:** Global picker wins when present. Concretely: panels prefer `useRouteRangeVocab` (which reads `time_from`/`time_to`) over the route-local `range`. Falls back to route-local `range` when `time_from`/`time_to` are absent. This honors the SC text "global time picker re-anchors all four panels" while keeping the existing URL contract intact. The internal RangeToggle in `SkillCostCard` still works — its onChange writes to the URL `?range=` param; that becomes the SECOND-line fallback only.

3. **TDBT-03 V11 collapsed-failure-mode lock — break it or honor it?** The 503 body literal is shared between two failure modes (missing credentials, parse rejected). SC#5's "credentials missing — retry" implies the frontend can distinguish them.
   - What we know: Phase 21 Plan 21-02 explicitly locked V11 collapse: "DO NOT split into 200+null-rule envelope or distinguish 503 reasons — the user retypes either way."
   - What's unclear: Whether Phase 27 has authority to revisit that lock. The SC text suggests yes; the Phase 21 plan suggests no.
   - **Recommendation:** Honor V11 in code; ship the honest-but-non-specific copy ("Couldn't parse — your phrasing didn't match a known pattern, or the natural-language service is unavailable. [Retry]"). This satisfies the SC spirit (honest, retry-capable) without touching backend. If operator wants the specific copy, add a follow-up plan that breaks V11 with operator sign-off — small change (~10 backend LOC + 1 test + frontend branch) but the design call needs explicit approval.

## Environment Availability

Phase 27 introduces ZERO new runtime deps. All primitives consumed are already installed and verified by Phase 26 close.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `recharts` | (CostByProjectCard if option 8(b)) | ✓ | 3.8.1 (Phase 26 verified) | Skip Pitfall 8(b); use DeltaPill (option a) — already in tree |
| `sonner` | TDBT-03 retry toast (optional) | ✓ | 2.0.7 (Phase 26 verified) | None — required for any toast |
| `@tanstack/react-router` | `validateSearch` extensions | ✓ | 1.168.24 | — |
| `lucide-react` | New icons for retry button (e.g. `RefreshCw`) | ✓ | 1.11.0 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with viable fallbacks:** None.

This is intentional — Phase 27 is a consumer phase, not an introducer phase. Phase 28 is the only remaining v1.3 phase sanctioned to add a new dep (`react-resizable-panels@4.11.0`).

## Validation Architecture

> `.planning/config.json` does not list `workflow.nyquist_validation` — treat as enabled (Phase 26 precedent).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest@^4.1.5` (unit) + `@playwright/test@^1.59.1` (e2e) + `pytest` (backend) |
| Config files | `frontend/vitest.config.ts`, `frontend/playwright.config.ts`, `backend/pyproject.toml` |
| Quick run command (frontend) | `pnpm --filter cmc-frontend test --run <changed-file>` |
| Quick run command (backend) | `cd backend && uv run pytest <changed-file> -x` |
| Full suite command | `pnpm --filter cmc-frontend test && pnpm --filter cmc-frontend test:e2e && cd backend && uv run pytest` |

### Phase Requirements → Test Map

| Req ID / SC | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC#1 | `/skills/$name` 4-panel bounded + density + global picker re-anchor | e2e + unit | `pnpm playwright test v13-tail-routes.spec.ts -g skills-detail` + `pnpm vitest run src/components/panels/__tests__/SkillProjectsTable.test.tsx` | ❌ Wave 5 (extend) |
| SC#2 | `/cost` 7d/30d picker + re-query + TIME-04 + truncate | e2e + unit | `pnpm playwright test cost-dashboard.spec.ts` (extended) + `pnpm vitest run src/components/panels/__tests__/CostByProjectCard.test.tsx` | ✅ existing (extend) |
| SC#3 / TDBT-01 | Compare picker filters via project_key | e2e + unit | `pnpm playwright test sessions-compare.spec.ts` (extended) + `pnpm vitest run src/components/ui/__tests__/CommandPalette.test.tsx` | ✅ existing (extend) |
| SC#4 / TDBT-02 | KNOWN_METRICS removed + drift guard rewritten | unit (front + back) | `pnpm vitest run src/components/panels/__tests__/AlertRuleForm.test.tsx` + `cd backend && uv run pytest tests/test_alerts_metrics_contract.py` | ❌ test_alerts_metrics_contract.py is new |
| SC#5 / TDBT-03 | NL composer 503 retry + honest copy | unit + e2e | `pnpm vitest run src/components/panels/__tests__/AlertRuleForm.test.tsx` (extended) + `pnpm playwright test alerts.spec.ts` (extended) | ✅ existing (extend) |
| Foundation | `useRouteRangeVocab` + 3 snappers | unit | `pnpm vitest run src/lib/time/__tests__/useRouteRangeVocab.test.ts` | ❌ Wave 1 |
| Adoption (`/skills`) | All panels bounded; vocab bridge consumed | unit | grep audit + per-panel test extensions | ✅ existing (extend) |
| Adoption (`/alerts`) | AlertEventsList consumes useRouteAlertRange (URL state, not localStorage) | unit | `pnpm vitest run src/components/panels/__tests__/AlertEventsList.test.tsx` | ✅ existing (extend) |

### Sampling Rate
- **Per task commit:** `pnpm --filter cmc-frontend test --run <changed-file>` (~1-5s per file) + `cd backend && uv run pytest <changed-file> -x`
- **Per wave merge:** `pnpm --filter cmc-frontend test && pnpm --filter cmc-frontend typecheck && pnpm --filter cmc-frontend lint && cd backend && uv run pytest`
- **Phase gate:** Full suite green (vitest + playwright + axe + lighthouse + pytest) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/lib/time/__tests__/useRouteRangeVocab.test.ts` — covers Plan 27-01 generic helper + 3 snap functions
- [ ] `backend/tests/test_alerts_metrics_contract.py` — replaces test_alerts_metrics_sync.py (TDBT-02 / SC#4)
- [ ] `frontend/src/components/panels/__tests__/CostByProjectCard.compareOverlay.test.tsx` — TIME-04 + DeltaPill (SC#2)
- [ ] `frontend/src/components/panels/__tests__/AlertRuleForm.retry.test.tsx` OR extension — TDBT-03 retry button (SC#5)
- [ ] `frontend/tests/e2e/v13-tail-routes.spec.ts` (NEW) OR extend `v13-time-picker.spec.ts` — SC#1–SC#5 e2e integration
- [ ] Test-fixture updates: 4 vitest test files need `project_key: ''` in mocks (TDBT-01 Pitfall 5)

## Security Domain

> `.planning/config.json` does not list `security_enforcement` — treat as enabled (Phase 26 precedent).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user local product; no auth surface added |
| V3 Session Management | no | Same |
| V4 Access Control | no | Same |
| V5 Input Validation | **yes** | `validateSearch` coerces unknown `time_from`/`time_to`/`compare_panels` to `undefined` on 4 routes (mirror Phase 26 Plan 02 + Plan 07) |
| V6 Cryptography | no | No crypto added |
| V8 Data Protection | yes | `project_key` is sha1[:12] hex (non-reversible). Wire exposure is additive on response only — no inputs |
| V14 Configuration | no | Zero new runtime deps |

### Known Threat Patterns for the stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `time_from`/`time_to`/`compare_panels` injection via URL | Tampering | Same `asTimeToken` + `asComparePanels` regex helpers Phase 26 uses; reject + default to undefined |
| `project_key` value tampering (URL ?b=<id>&projectKey=<spoofed>) | Tampering | `project_key` is RESPONSE-only; not accepted as a URL param. Frontend ComparePicker derives it from the `a`-side compare-cache, NEVER from URL input |
| Frontend `useAlertMetrics` returning a corrupt vocabulary (XSS via metric label) | Tampering | The vocab is rendered inside `<option>{label}</option>` — React escapes by default. Labels are now raw metric keys (TDBT-02 deletes the FALLBACK_KNOWN_METRICS labels), which are backend-controlled lowercase identifiers — no script-injection vector |
| Retry-button DoS (TDBT-03) — user spams Retry → 100 requests/min | DoS | `useParseAlertNl` is a `useMutation` — disable the Retry button while `m.isPending` (mirror existing pattern on the Parse button line 211). No additional rate-limit needed for single-user localhost |
| Test_alerts_metrics_sync.py removal breaks CI guard | Audit/contract | Replace with `test_alerts_metrics_contract.py` (response-shape assertion) — the spirit of the guard is preserved |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SC#1's 4 panels means SkillProjectsTable + SkillRunsTable + SkillLatencyTable + SkillTimeline literally; the detail route adds SkillTimeline | `/skills/$name` adoption inventory + Open Q1 | If operator wants Cost+Projects+LatencySnapshot+Runs literally, SkillTimeline isn't added — minor JSX delta |
| A2 | `/skills/$name` global picker overrides route-local `?range=` when both present | Open Q2 + Pitfall 2 | If operator wants reverse (route-local wins), invert the precedence in `useRouteRangeVocab` consumption — 1-line change per panel |
| A3 | TDBT-02 drift-guard test is REPLACED (Option A) — new contract test, not relaxed | TDBT-02 section + Pitfall 4 | If operator prefers Option B (relax existing test), plan adjusts; same end-state (no FALLBACK_KNOWN_METRICS in source) |
| A4 | TDBT-03 backend V11 lock is HONORED — frontend renders honest-but-non-specific copy | Open Q3 + Pitfall 7 | If operator wants explicit "credentials missing" copy, backend split needed — small follow-up |
| A5 | TIME-04 compare-overlay on CostByProjectCard manifests as DeltaPill column (not chart) | Pitfall 8 | If operator wants a chart, CostByProjectCard rewrite + new ResponsiveContainer (Phase 24 lock + 1) |
| A6 | `project_key: string` is REQUIRED on the new TS types (not optional) | TDBT-01 + Pitfall 5 | If kept optional, 4 vitest fixtures don't need updating — but type signal is weaker |
| A7 | Phase 26 a11y deferrals (heatmap-cell / otel-feed / etc.) are OUT OF SCOPE for Phase 27 | Pitfall 6 | If operator wants them in, ROADMAP / REQUIREMENTS amendments needed before plans lock |
| A8 | The vocab-bridge expansion is a thin new helper `useRouteRangeVocab` (~30 LOC), not a refactor of the existing `useRouteRange` | Vocab Bridge Expansion + Plan 27-01 | If operator prefers refactoring `useRouteRange` to be vocab-parameterized, blast radius grows to the 9 Phase 26 panels — recommend avoiding |
| A9 | Plan structure is 9 plans / 5 waves mirroring Phase 26 | Recommended plan structure | Operator may prefer the 7-plan compression — either works; 9 is safer for review/rollback |

**If this table is non-empty:** A1, A2, A3, A4, A5 should be confirmed by the operator before plans lock the architecture. A6, A7, A8, A9 are within the researcher's judgment (justified above) and can proceed unless operator disagrees.

## Sources

### Primary (HIGH confidence — codebase + Phase 26 verified artifacts)

- `frontend/src/routes/skills.tsx` — current /skills route shape (no bounded, no time params, validateSearch=schemaVersion only)
- `frontend/src/routes/skills_.$name.tsx` — current /skills/$name shape (no bounded, has range URL param, no time params)
- `frontend/src/routes/cost.tsx` — current /cost shape (no bounded, no time params, validateSearch=schemaVersion only)
- `frontend/src/routes/alerts.tsx` — current /alerts shape (no bounded, no time params, validateSearch=schemaVersion only)
- `frontend/src/components/panels/AlertRuleForm.tsx` — TDBT-02 + TDBT-03 host (FALLBACK_KNOWN_METRICS @ L56-60; AlertNlInput @ L184-236; 503 inline error @ L225-233)
- `frontend/src/components/panels/CostByProjectCard.tsx` — current /cost panel with localStorage RangeToggle (line 113-118)
- `frontend/src/components/panels/CostForecastCard.tsx` — current /cost panel (no range param, MTD-only)
- `frontend/src/components/panels/AlertEventsList.tsx` — current /alerts panel with localStorage 4-tier RangeToggle (line 94-100)
- `frontend/src/components/panels/SkillProjectsTable.tsx` / `SkillRunsTable.tsx` / `SkillLatencyTable.tsx` / `SkillTimeline.tsx` / `SkillCostCard.tsx` — current /skills + /skills/$name panels (no bounded)
- `frontend/src/components/panels/SessionCompareView.tsx` — Phase 26-adopted; consumes SessionCompareSide.cwd
- `frontend/src/components/ui/CommandPalette.tsx:362-371,710,749` — ComparePicker cwd-as-proxy filter site (TDBT-01)
- `frontend/src/lib/api.ts:103-185,562` — SessionListItemFull + SessionCompareSide + project_key documentation
- `frontend/src/lib/queries.ts:265,834` — useAlertMetrics + useParseAlertNl (TDBT-02 + TDBT-03 anchors)
- `frontend/src/lib/searchSchemas.ts` — `asTimeToken` + `asComparePanels` validators (Phase 26 Plan 02 + 07)
- `frontend/src/lib/time/useRouteRange.ts` + `rangeToVocab.ts` + `coerce.ts` — Phase 26 vocab bridge (narrow to Range)
- `frontend/src/components/time/CompareToggle.tsx` — Phase 26 Plan 07 TIME-04 primitive
- `frontend/src/components/ui/BoundedPanelCard.tsx` + `TruncatedCell.tsx` + `CopyIconButton.tsx` + `DeltaPill.tsx` — Phase 24 primitives
- `backend/cmc/api/schemas/sessions.py:19-35,123-159` — SessionListItem + SessionCompareSide Pydantic schemas (TDBT-01 anchors)
- `backend/cmc/db/models/sessions.py:27-33` — DB project_key column (sha1[:12], Phase 19 SKLP-08)
- `backend/cmc/api/routes/alerts.py:397-431` — parse-nl 503 contract + /api/alerts/metrics endpoint
- `backend/tests/test_alerts_metrics_sync.py` — TDBT-02 drift guard (the test that must be replaced or rewritten)
- `.planning/phases/26-per-route-adoption-i-command-activity-sessions-time-cmd-k/26-RESEARCH.md` — Phase 26 research (template for Phase 27)
- `.planning/phases/26-per-route-adoption-i-command-activity-sessions-time-cmd-k/26-CONTEXT.md` — Phase 26 CONTEXT (locked decisions Phase 27 inherits)
- `.planning/phases/26-per-route-adoption-i-command-activity-sessions-time-cmd-k/26-08-PLAN.md` — Phase 26 Plan 08 (the verbatim adoption template Phase 27 plans 27-04..06 mirror)
- `.planning/phases/26-per-route-adoption-i-command-activity-sessions-time-cmd-k/26-07-PLAN.md` — Phase 26 Plan 07 (TIME-04 CompareToggle pattern for Phase 27 Plan 27-05)
- `.planning/phases/26-per-route-adoption-i-command-activity-sessions-time-cmd-k/26-VERIFICATION.md` — Phase 26 verification (5/5 PASS — baseline for Phase 27)
- `.planning/REQUIREMENTS.md` lines 91-93, 225-227, 249-252 — TDBT-01..03 definitions + Phase 27 note
- `.planning/ROADMAP.md` Phase 27 entry — 5 LOCKED SCs

### Secondary (MEDIUM confidence — referenced patterns)

- `.planning/phases/21-alert-anomaly-depth-nl-authoring/21-02-nl-parser-route-and-metrics-PLAN.md` — Phase 21 V11 collapsed-failure-mode lock (TDBT-03 design constraint)
- `.planning/phases/23-compare-depth-milestone-close/` — Phase 23 carried-debt origin for TDBT-01 (cwd-as-proxy weakness)
- `.planning/phases/24-shell-density-containment-primitives/24-RESEARCH.md` — Phase 24 primitive rationale + recharts ResponsiveContainer transform pitfall
- `frontend/src/styles.css:206-221` — `.cmc-numeric` token rebalance + Phase 27 deferral comment

### Tertiary (LOW confidence — needs validation before plans lock)

- The exact line counts in some test files (e.g. `CostByProjectCard.test.tsx`) were not opened — planner should `wc -l` and read them during plan-write to scope extension cost accurately
- The `backend/tests/test_sessions_router.py` existence + line count not confirmed in this research — plan should verify

## Metadata

**Confidence breakdown:**
- Per-route adoption inventory: **HIGH** — all 4 route files read end-to-end with line numbers; current state verified
- TDBT-01 anchor map: **HIGH** — DB column verified (Phase 19), schema absence verified, picker filter site located at line 749
- TDBT-02 anchor map: **HIGH** — `FALLBACK_KNOWN_METRICS` located + drift-guard test read end-to-end
- TDBT-03 anchor map: **HIGH** — `AlertNlInput` 503 inline-error site located at line 225-233; backend 503 contract read
- Vocab bridge expansion: **MEDIUM-HIGH** — `useRouteRange` source code read; generic helper design is straightforward but introduces a new file
- Plan structure recommendation: **MEDIUM** — mirroring Phase 26 is the safe bet; operator may compress
- Pitfalls: **HIGH** — 8 enumerated; each backed by code reference or Phase 26 precedent
- Compatibility with Phase 24/25/26 invariants: **HIGH** — every invariant reviewed (URL contract append-only, validateSearch defaults to undefined, ResponsiveContainer count, density:root, no React Context for cross-cutting state, testid registry)

**Research date:** 2026-05-13
**Valid until:** 2026-06-12 (30 days — stack is stable; revisit if Phase 26 close-gate artifacts uncover regression).

## RESEARCH COMPLETE
