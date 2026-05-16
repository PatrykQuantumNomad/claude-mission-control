---
phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
verified: 2026-05-16T00:00:00Z
status: passed
score: 5/5
overrides_applied: 6
overrides:
  - must_have: "/cost 7d/30d toggle re-queries CostForecastCard — CostForecastCard MTD-only re-query"
    reason: "CostForecastCard is a single-point MTD projection — a literal range-shifted re-query requires a backend range extension out of scope for Phase 27. SC#2 re-query contract satisfied as re-render; the panel re-renders on URL change. Deferred to Phase 28+ candidate."
    accepted_by: "Patryk Golabek"
    accepted_at: "2026-05-16T00:00:00Z"
  - must_have: "compare-to-previous overlay TIME-04 renders DeltaPill column in CostByProjectCard"
    reason: "Escape path (i): CompareToggle URL round-trip ships (writing compare_panels=cost-by-project to URL), but DeltaPill column is NOT rendered. Client-side prior-period slicing requires bucketed data; /api/cost/breakdown returns rolled-up totals with no time axis. Backend bucketed endpoint deferred to Phase 28+."
    accepted_by: "Patryk Golabek"
    accepted_at: "2026-05-16T00:00:00Z"
  - must_have: "Stale backend restart during Phase 27 cascade"
    reason: "Self-healed per Rule 3. Running uvicorn on :8765 pre-dated Plan 27-02 schema additions and lacked --reload. Killed and restarted fresh; project_key now present on all /api/sessions* responses. Implementation source is correct."
    accepted_by: "Patryk Golabek"
    accepted_at: "2026-05-16T00:00:00Z"
  - must_have: "cost-dashboard.spec.ts pre-existing RangeToggle test"
    reason: "Self-healed per Rule 1. Plan 27-05 dropped the panel-internal RangeToggle in CostByProjectCard. Pre-existing e2e test that asserted on the dropped button was rewritten to use the equivalent URL-driven path (global TimePicker -> useRouteRangeVocab -> fetch range=30d)."
    accepted_by: "Patryk Golabek"
    accepted_at: "2026-05-16T00:00:00Z"
  - must_have: "SkillLatencySnapshot global time picker re-anchors on /skills/$name"
    reason: "SkillLatencySnapshot is intentionally left on the route-local ?range= path. Operator-locked decision documented inline at skills_.$name.tsx:242-246. Will lift when SkillLatencySnapshot is extracted to its own component during a future snapshot refactor (Phase 28+ candidate)."
    accepted_by: "Patryk Golabek"
    accepted_at: "2026-05-16T00:00:00Z"
  - must_have: "Verification-discovered fix d76a95b — SkillLatencySnapshot success-state cmc-card--bounded"
    reason: "Rule-1 close-gate fix. Plan 27-04 Step 6 added cmc-card--bounded to loading-state and error-state branches but missed the success-state branch. One-line className fix committed during Plan 27-09 live walkthrough, mirroring Phase 26's e838135 close-gate fix precedent. Surface restored to 5/5 bounded."
    accepted_by: "Patryk Golabek"
    accepted_at: "2026-05-16T00:00:00Z"
---

# Phase 27: Per-Route Adoption II (Skills/Cost/Alerts) + Tech Debt — Verification Report

**Phase Goal:** Complete the per-route adoption sweep on the tail-end routes (`/skills`, `/skills/$name`, `/cost`, `/alerts`) by consuming Phase 24 primitives + Phase 25 saved views + Phase 26 time picker, AND close the v1.2 carried tech debt items that the new shell makes natural to fix (`project_key` wire exposure, `KNOWN_METRICS` removal, NL composer 503 retry/queue UX).

**Verified:** 2026-05-16
**Status:** PASSED (5/5 must-haves — 6 operator-acknowledged exceptions applied)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/skills/$name` long skill name renders bounded; SkillProjectsTable + SkillRunsTable + SkillLatencyTable + SkillTimeline each scroll internally; density tokens propagate; global time picker re-anchors panels | VERIFIED (Accepted Exception #5 for SkillLatencySnapshot + #6 for d76a95b fix) | `cmc-page cmc-page--bounded` in `skills_.$name.tsx:250`; `TruncatedCell value={name}` at line 273; all 5 panel components rendered (SkillCostCard, SkillProjectsTable, SkillLatencySnapshot, SkillRunsTable, SkillTimeline); `bounded` prop on all 5; `useRouteRangeVocab` + `hasGlobalPicker` ternary in SkillProjectsTable + SkillCostCard; `SkillTimeline skillName={name} bounded` at line 296; operator-signed live walkthrough 2026-05-16 confirms 5/5 bounded post-d76a95b |
| 2 | `/cost` 7d/30d toggle re-queries CostForecastCard + CostByProjectCard; long project paths truncate cleanly; compare-to-previous overlay (TIME-04) renders | VERIFIED (Accepted Exceptions #1 + #2) | `cmc-page cmc-page--bounded` in `cost.tsx:60`; `useRouteRangeVocab('7d', snapToCostRange)` in `CostByProjectCard.tsx:141`; `bounded` on both PanelCard instances; `TruncatedCell value={r.key}` in CostByProjectCard column renderer; `<CompareToggle panelId={PANEL_ID} />` in trailing slot at line 164; CompareToggle writes `compare_panels=cost-by-project` to URL per live walkthrough |
| 3 | Compare picker uses authoritative `project_key` (sha1[:12]) instead of cwd-as-proxy (TDBT-01) | VERIFIED | `project_key: str` on `SessionListItem` (sessions.py:34) and `SessionCompareSide` (sessions.py:154) with Phase 27 TDBT-01 comments; `scopeProjectKey` referenced 12 times in `CommandPalette.tsx`; zero `scopeCwd` references in production code (test comment only); `test_list_sessions_includes_project_key`, `test_compare_sessions_includes_project_key`, `test_project_key_matches_compute_helper` present in `test_sessions_router.py:1211,1254,1302` |
| 4 | AlertRuleForm metric vocabulary loads exclusively from `useAlertMetrics` hook — `KNOWN_METRICS` frontend fallback constant fully removed; cross-language drift guard still passes (TDBT-02) | VERIFIED | No `FALLBACK_KNOWN_METRICS` or `KNOWN_METRICS` anywhere in `frontend/src/` (grep exit 1); `useAlertMetrics` defined at `queries.ts:266`; `knownMetrics = useMemo(() => (metricsQuery.data?.metrics ?? []).map(...)` at `AlertRuleForm.tsx:315-319`; `test_alerts_metrics_contract.py` present with exact-equality assertion; `test_alerts_metrics_sync.py` deleted (ls exit 1); `GET /api/alerts/metrics` returns `sorted(_SCOPE_EXTRACTORS.keys())` at `alerts.py:430` |
| 5 | NL alert composer 503 collapse surfaces graceful retry / queue UX with honest "credentials missing — retry" affordance (TDBT-03) | VERIFIED | `AlertNlInput` function in `AlertRuleForm.tsx:195`; `showError = m.isError \|\| (hadError && m.isPending)` latch at line 219; `role="alert"` div with "Couldn't parse this description. The phrasing didn't match a known pattern, or the natural-language service is temporarily unavailable." at lines 273-276; `data-testid="alert-nl-retry"` Retry button at line 279; `disabled={m.isPending}` DoS guard; zero prohibited strings (`credentials missing` / `Anthropic` / `API key` / `ANTHROPIC_API_KEY`) in AlertRuleForm.tsx; backend `alerts.py:404-415` shows single 503 with V11 collapsed-failure-mode lock |

**Score:** 5/5 truths verified (6 operator-acknowledged exceptions applied; all PASS per override rules)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/routes/skills_.$name.tsx` | /skills/$name bounded page shell + TruncatedCell + 5 panels | VERIFIED | `cmc-page cmc-page--bounded`; `TruncatedCell value={name}`; all 5 panels rendered; `validateSearch` includes `time_from?`, `time_to?`, `compare_panels?` (Phase 27 append-only) |
| `frontend/src/routes/cost.tsx` | /cost bounded page + time_from/compare_panels search fields | VERIFIED | `cmc-page cmc-page--bounded`; `validateSearch` with `time_from?`, `time_to?`, `compare_panels?` via `asTimeToken` + `asComparePanels` |
| `frontend/src/routes/alerts.tsx` | /alerts bounded page shell | VERIFIED | `cmc-page cmc-page--bounded` at line 62 |
| `frontend/src/components/panels/CostByProjectCard.tsx` | bounded + CompareToggle + TruncatedCell + useRouteRangeVocab | VERIFIED | `bounded` on PanelCard; `<CompareToggle panelId={PANEL_ID} />`; `TruncatedCell value={r.key}`; `useRouteRangeVocab('7d', snapToCostRange)` |
| `frontend/src/components/panels/CostForecastCard.tsx` | bounded; TIME-04 opt-out documented | VERIFIED | `bounded` on PanelCard; "TIME-04 OPT-OUT" comment at line 27; no CompareToggle (correct) |
| `frontend/src/components/panels/AlertRuleForm.tsx` | useAlertMetrics sole source; no FALLBACK_KNOWN_METRICS; AlertNlInput with Retry | VERIFIED | `useAlertMetrics` only; comment at line 63 "in-file metric-vocabulary fallback constant removed"; AlertNlInput with latched-error + Retry + role="alert" |
| `frontend/src/lib/time/useRouteRangeVocab.ts` | hook + snapToSkillRange + snapToCostRange + snapToAlertRange | VERIFIED | All three snap functions defined at lines 47, 52, 59; `useRouteRangeVocab` generic hook at line 27 |
| `frontend/src/components/panels/SkillProjectsTable.tsx` | bounded + useRouteRangeVocab + hasGlobalPicker | VERIFIED | `useRouteRangeVocab` import + call; `hasGlobalPicker` flag; `effectiveRange = hasGlobalPicker ? globalRange : range`; `bounded` prop |
| `frontend/src/components/panels/SkillCostCard.tsx` | bounded + useRouteRangeVocab + hasGlobalPicker | VERIFIED | `useRouteRangeVocab` + `hasGlobalPicker` logic; `bounded` on PanelCard |
| `frontend/src/components/panels/SkillRunsTable.tsx` | bounded | VERIFIED | `bounded` at line 229; no range parameter (recent-runs list, not time-range query — correct design) |
| `frontend/src/components/panels/SkillTimeline.tsx` | bounded prop + skillName pre-filter | VERIFIED | `bounded?: boolean` prop at line 57; `cmc-card--bounded` applied at line 85; `skillName` exact-match filter at line 75 |
| `backend/cmc/api/schemas/sessions.py` | project_key on SessionListItem + SessionCompareSide | VERIFIED | `project_key: str` at line 34 (SessionListItem, Phase 27 TDBT-01 comment) and line 154 (SessionCompareSide, Phase 27 TDBT-01 comment) |
| `backend/tests/test_alerts_metrics_contract.py` | exact-equality drift guard against _SCOPE_EXTRACTORS | VERIFIED | File exists; asserts `sorted(body["metrics"]) == sorted(_SCOPE_EXTRACTORS.keys())`; also has smoke test for >=3 metrics |
| `backend/tests/test_alerts_metrics_sync.py` | DELETED | VERIFIED | `ls` exit 1 — file does not exist |
| `backend/cmc/api/routes/alerts.py` | V11 collapsed-failure-mode lock; /api/alerts/metrics route | VERIFIED | `status_code=503` + "Single 503 covers both failure modes" comment at line 404; `sorted(_SCOPE_EXTRACTORS.keys())` returned at line 430 |
| `.planning/phases/27-*/visual-check/*.png` | 24 matrix PNGs + 3 operator walkthrough | VERIFIED | 27 files present (24 matrix: 4 routes × 3 densities × 2 themes + 3 supplemental operator walkthrough PNGs) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `skills_.$name.tsx` | `useRouteRangeVocab` | `SkillProjectsTable` + `SkillCostCard` `hasGlobalPicker` ternary | WIRED | Panels import and call `useRouteRangeVocab` unconditionally; `hasGlobalPicker` flag selects effective range |
| `cost.tsx` validateSearch | `CostByProjectCard` | `useRouteRangeVocab('7d', snapToCostRange)` | WIRED | `time_from`/`time_to` in URL → `useRouteRangeVocab` → `useCostBreakdown(range)` query key change → re-fetch |
| `CostByProjectCard` | URL `compare_panels` | `<CompareToggle panelId="cost-by-project" />` | WIRED | CompareToggle reads/writes `compare_panels` CSV URL param; confirmed by live walkthrough |
| `AlertRuleForm` | `/api/alerts/metrics` | `useAlertMetrics()` → `api.alertMetrics()` | WIRED | `useAlertMetrics` at `queries.ts:266` fetches `/api/alerts/metrics`; `knownMetrics` derived from response; populates `<select>` options |
| `AlertNlInput` | `useParseAlertNl` mutation | `m.mutate({ description })` | WIRED | Parse fires mutation; Retry re-fires same payload; `showError` latch keeps error block mounted across retry pending window |
| `CommandPalette` | `project_key` scope filter | `scopeProjectKey` + `row.project_key === scopeProjectKey` | WIRED | 12 `scopeProjectKey` references; filter at line 765 `allItems.filter((row) => row.project_key === scopeProjectKey)`; zero `scopeCwd` in production code |
| `SessionListItem` / `SessionCompareSide` | wire shape | `project_key: str` field | WIRED | Both schemas include `project_key: str`; backend tests lock the round-trip wire shape |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `CostByProjectCard` | `range` → `useCostBreakdown` | `useRouteRangeVocab('7d', snapToCostRange)` reads `time_from`/`time_to` from URL | Yes — snaps to CostRange Literal, queries `/api/cost/breakdown?dim=project&range={range}` | FLOWING |
| `AlertRuleForm` select | `knownMetrics` | `useAlertMetrics()` → `GET /api/alerts/metrics` → `sorted(_SCOPE_EXTRACTORS.keys())` | Yes — runtime API response, not hardcoded | FLOWING |
| `SkillProjectsTable` | `effectiveRange` | `useRouteRangeVocab` + `hasGlobalPicker` flag | Yes — snaps global picker window to SkillRange; falls back to route-local `range` prop | FLOWING |
| `AlertNlInput` error state | `showError` | `m.isError` or `(hadError && m.isPending)` — latched from `useParseAlertNl` mutation | Yes — mutation error drives render; retry re-fires real POST | FLOWING |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED for interactive flows (server required). All behavioral checks were conducted via operator live walkthrough on 2026-05-16 via Chrome DevTools MCP against `http://localhost:5173` + backend on `:8001`. Static checks below cover code-level verifiable behaviors.

| Behavior | Evidence | Status |
|----------|----------|--------|
| `FALLBACK_KNOWN_METRICS` absent from entire frontend/src | `grep` exit 1 (no matches) | PASS |
| Zero `scopeCwd` in production code | `grep` finds 1 hit — inside test comment only | PASS |
| `project_key: str` on both session wire schemas | Read `backend/cmc/api/schemas/sessions.py:34,154` | PASS |
| `test_alerts_metrics_sync.py` deleted | `ls` exit 1 | PASS |
| `test_alerts_metrics_contract.py` exists with exact-equality assertion | Read confirmed | PASS |
| No prohibited strings in AlertRuleForm.tsx | `grep` exit 1 for "credentials missing" / "Anthropic" / "API key" / "ANTHROPIC_API_KEY" | PASS |
| `cmc-page cmc-page--bounded` on /skills/$name, /cost, /alerts routes | Read confirmed at skills_.$name.tsx:250, cost.tsx:60, alerts.tsx:62 | PASS |
| 24 matrix PNGs + 3 operator screenshots present | `ls visual-check/` = 27 files | PASS |

---

## Requirements Coverage

| REQ-ID | Description | Plans | Status | Evidence |
|--------|-------------|-------|--------|----------|
| TDBT-01 | project_key wire exposure + ComparePicker switch (canonical id vs cwd proxy) | 27-02 (backend), 27-03 (frontend) | SATISFIED | `SessionListItem.project_key` + `SessionCompareSide.project_key` in sessions.py; `scopeProjectKey` filter in CommandPalette.tsx; backend tests at test_sessions_router.py:1211,1254,1302 |
| TDBT-02 | FALLBACK_KNOWN_METRICS removal + API-layer contract test | 27-07 | SATISFIED | KNOWN_METRICS absent from frontend/src (grep exit 1); `useAlertMetrics` sole source; `test_alerts_metrics_contract.py` with exact-equality assertion; `test_alerts_metrics_sync.py` deleted |
| TDBT-03 | NL composer 503 retry UX + honest non-specific copy (V11 lock) | 27-08 | SATISFIED | AlertNlInput with `showError` latch, `role="alert"` div, operator-locked honest copy, Retry button with DoS guard; backend V11 collapsed-failure-mode at alerts.py:404 |

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None found | — | — | — |

Scanned `AlertRuleForm.tsx`, `CostByProjectCard.tsx`, `CostForecastCard.tsx`, `skills_.$name.tsx`, `cost.tsx`, `alerts.tsx`, `useRouteRangeVocab.ts`, `CommandPalette.tsx`, `sessions.py`, `alerts.py`. No TODO/FIXME/placeholder patterns, no empty stub implementations, no hardcoded static returns in place of real data queries.

---

## Human Verification Required

None — all programmatic checks pass. Operator live walkthrough (2026-05-16) via Chrome DevTools MCP against the running dev server covered all 5 success criteria interactively. Operator verdict signed PASS.

---

## Accepted Exceptions

Six operator-acknowledged exceptions apply. All are encoded in frontmatter `overrides:` and counted in the 5/5 passing score.

| # | Exception | Disposition |
|---|-----------|-------------|
| 1 | CostForecastCard MTD-only — SC#2 "re-query" satisfied as "re-render" | Accepted: literal range-shifted re-query requires backend extension (Phase 28+ candidate) |
| 2 | CostByProjectCard DeltaPill column not rendered — URL round-trip ships | Accepted: escape path (i); client-side prior-period slicing impossible without bucketed backend endpoint (Phase 28+) |
| 3 | Stale backend restart during cascade | Self-healed (Rule 3); implementation correct, long-running process lacked --reload |
| 4 | cost-dashboard.spec.ts RangeToggle test rewritten | Self-healed (Rule 1); Plan 27-05 dropped RangeToggle; test brought forward to URL-driven path |
| 5 | SkillLatencySnapshot stays on route-local `?range=` | Operator-locked decision documented at skills_.$name.tsx:242-246; lift when SkillLatencySnapshot extracted (Phase 28+) |
| 6 | Verification-discovered fix d76a95b — SkillLatencySnapshot success-state bounded | Rule-1 close-gate fix; one-line className addition; tsc + lint clean; surface restored 5/5 bounded |

---

## Gaps Summary

No gaps. All 5 must-haves verified against the codebase. The 6 accepted exceptions are operator-acknowledged intentional deviations with documented rationale and forward-compatible implementations (URL contracts + bounded shells land; deferred column rendering and range extension tracked as Phase 28+ candidates). Tech debt items TDBT-01, TDBT-02, TDBT-03 fully closed end-to-end.

---

_Verified: 2026-05-16_
_Verifier: Claude (gsd-verifier) — goal-backward analysis_
