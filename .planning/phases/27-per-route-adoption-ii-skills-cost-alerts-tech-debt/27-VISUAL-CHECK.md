# Phase 27 — VISUAL-CHECK

**Operator:** Patryk Golabek
**Date capture run:** 2026-05-15
**Date verdict signed:** 2026-05-16
**Phase:** 27 — Per-Route Adoption II (Skills/Cost/Alerts) + Tech Debt
**Plan that produced this evidence:** 09 (close gate)
**Status:** **PASS** — operator-signed verdict via live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001

**Capture commands:**

- Visual (Phase 24):       `cd frontend && pnpm test:e2e v13-visual-capture.spec.ts` (36 PNGs into Phase 24 dir; re-run validates the matrix unchanged)
- Visual (Phase 25):       same spec (30 PNGs into Phase 25 dir; re-run validates the matrix unchanged)
- Visual (Phase 26):       same spec (30 PNGs into Phase 26 dir; re-run validates the matrix unchanged)
- Visual (Phase 27):       same spec (24 NEW PNGs into the Phase 27 dir below)
- Axe-core (matrix + chrome scans): `cd frontend && pnpm test:e2e v13-a11y.spec.ts`
- Tail-route e2e (NEW):    `cd frontend && pnpm test:e2e v13-tail-routes.spec.ts`
- Truncation walks:        `cd frontend && pnpm test:e2e v13-truncation.spec.ts`
- Portal containment:      `cd frontend && pnpm test:e2e v13-portal-containment.spec.ts`
- Time picker re-anchor:   `cd frontend && pnpm test:e2e v13-time-picker.spec.ts`
- Route-specific extensions: `cd frontend && pnpm test:e2e alerts cost-dashboard skills-detail`
- URL contract:            `cd backend && uv run pytest tests/test_url_contract.py -v`
- Full backend pytest:     `cd backend && uv run pytest`
- Full frontend vitest:    `cd frontend && pnpm test --run`

**Captured PNGs:** `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/visual-check/` (24 files: 4 tail-end-route surfaces × 3 densities × 2 themes — skills-index-bounded, skills-detail-bounded, cost-bounded, alerts-bounded). Combined v1.3 visual surface to date: **120 PNGs** (36 Phase 24 + 30 Phase 25 + 30 Phase 26 + 24 Phase 27).

---

## ROADMAP Success Criteria Mapping

| SC | Criterion | Evidence | Verdict |
|----|-----------|----------|---------|
| SC#1 | /skills/$name 4-panel bounded + density + global picker re-anchor (long names truncate cleanly) | v13-tail-routes.spec.ts tests 1-6 (SC#1) + v13-truncation.spec.ts new /skills/$name walk + visual-capture skills-detail-bounded × 6 + **live walkthrough 2026-05-16 (Chrome DevTools MCP) — section.cmc-page--bounded ✓; 5/5 .cmc-card--bounded after the d76a95b verification-discovered fix; TruncatedCell wraps `tdd-coverage-author-with-fanout` heading; density-flip preserves all 5 DOM markers (zero re-render contract); global picker WINS — `?time_from=now-25d&time_to=now` causes cost+projects to fetch range=30d while SkillLatencySnapshot stays at route-local range=14d per LOCKED OPERATOR DECISION 2 + source-comment exception** | ✅ **PASS** |
| SC#2 | /cost picker re-query + CompareToggle round-trip + project_key truncation | v13-tail-routes.spec.ts tests 7-11 (SC#2) + v13-truncation.spec.ts new /cost walk + cost-dashboard.spec.ts Phase 27 extensions × 3 + visual-capture cost-bounded × 6 + **live walkthrough 2026-05-16 — section.cmc-page--bounded ✓; 2/2 .cmc-card--bounded; compare-overlay-toggle-cost-by-project testid mounted; `?time_from=now-30d&time_to=now` triggers `GET /api/cost/breakdown?dim=project&range=30d` (vocab bridge wins) while `/api/cost/forecast` runs without range (MTD opt-out — Accepted Exception #1); clicking CompareToggle writes `?compare_panels=cost-by-project` to URL** | ✅ **PASS** (Accepted Exceptions #1+#2 acknowledged) |
| SC#3 | Compare picker uses project_key (sha1[:12] of realpath) — TDBT-01 | v13-tail-routes.spec.ts tests 12-15 (SC#3) + backend test_sessions_router.py +3 from Plan 27-02 + **live walkthrough 2026-05-16 — `GET /api/sessions?limit=2` returns `project_key: "37ae465f3a20"` and `"63c04f774647"` (12-char hex on every row); `GET /api/sessions/compare?a=…&b=…` returns `a.project_key` + `b.project_key` both 12-char hex; source-grep `scopeCwd` returns 0 hits, `scopeProjectKey` returns 12 hits in CommandPalette.tsx; "Showing sessions in the same project" copy renders — no 12-char hex leak** | ✅ **PASS** |
| SC#4 | AlertRuleForm metric vocab from useAlertMetrics — TDBT-02 | v13-tail-routes.spec.ts tests 16-19 (SC#4) + backend test_alerts_metrics_contract.py +2 from Plan 27-07 + **live walkthrough 2026-05-16 — `/alerts` issues `GET /api/alerts/metrics`; AlertRuleForm `<select>` renders 4 options ("Select a metric…" disabled placeholder + 3 raw-key options sourced from API: cost_usd_24h / dispatcher_failed_tasks_5m / skill_p95_latency_ms); `grep -c FALLBACK_KNOWN_METRICS frontend/src/components/panels/AlertRuleForm.tsx` returns 0; `backend/tests/test_alerts_metrics_sync.py` absent; `backend/tests/test_alerts_metrics_contract.py` present** | ✅ **PASS** |
| SC#5 | NL composer 503 retry/queue UX — TDBT-03 | v13-tail-routes.spec.ts tests 20-24 (SC#5) + AlertRuleForm.test.tsx +5 vitest cases from Plan 27-08 + v13-a11y.spec.ts AlertNlInput 503 scan + **live walkthrough 2026-05-16 — stubbed `/api/alerts/parse-nl` → 503; clicking Parse renders the operator-locked copy verbatim ("Couldn't parse this description. The phrasing didn't match a known pattern, or the natural-language service is temporarily unavailable.") inside `role="alert"` block with Retry button; clicking Retry fires a 2nd POST with identical payload (calls=2, payloadsIdentical=true); zero leaked terms ("credentials missing" / "Anthropic" / "API key" / "ANTHROPIC_API_KEY" all absent — V11 collapsed-failure-mode lock honored); manual ThresholdForm BELOW remains focusable/enabled (Phase 21 Pitfall 5 invariant preserved)** | ✅ **PASS** |

## REQ-ID Closure

| REQ-ID | Description | Plan(s) | Verdict |
|--------|-------------|---------|---------|
| TDBT-01 | project_key wire exposure + ComparePicker switch (canonical id vs cwd proxy) | 27-02 (backend) + 27-03 (frontend) | ✅ **CLOSED** (live wire shape + frontend source-grep verified) |
| TDBT-02 | FALLBACK_KNOWN_METRICS removal + API-layer contract test replacing build-time grep | 27-07 | ✅ **CLOSED** (source-grep + file existence + live `<select>` options verified) |
| TDBT-03 | NL composer 503 retry UX + honest non-specific copy (V11 collapsed-failure-mode lock preserved) | 27-08 | ✅ **CLOSED** (stubbed 503 → honest copy + Retry re-fire + V11 leak check verified) |

## Automated Evidence Summary

| Gate | Phase 26 close baseline | Phase 27 close measured | Delta | Notes |
|------|-------------------------|-------------------------|-------|-------|
| Backend pytest | 686 / 0 / 0 | **690 / 0 / 0** | +4 | Plan 27-02 +3 (test_list_sessions_includes_project_key + test_compare_sessions_includes_project_key + test_project_key_matches_compute_helper); Plan 27-07 +2 (test_alerts_metrics_contract.py: exact-equality + ≥3 smoke) -1 (test_alerts_metrics_sync.py deleted). Net: +4. |
| Frontend vitest | 610 / 0 / 0 | **662 / 0 / 0** | +52 | Plans 27-01..08 unit-test deltas (Plan 27-01 +31 useRouteRangeVocab; Plan 27-03 +2 TDBT-01 + 5 fixture updates; Plan 27-04 hasGlobalPicker + bounded; Plan 27-05 +6 CompareOverlay + +2 URL-window-snap; Plan 27-06 +3 SC tests; Plan 27-07 +5 TDBT-02; Plan 27-08 +5 TDBT-03). |
| Playwright e2e (total tests in modified specs) | 207 (203 pass + 4 forward-compat skip) | **~243 (run subset shows 17 pass + 7 env-skip on tail-routes; 43 pass + 1 skip on a11y; 30 pass + 2 skip on time-picker+truncation; 7 pass on portal-containment; 7 pass on cost-dashboard; 4 skip + 2 pass on alerts+skills-detail when DB lacks fixtures)** | ~+36 | v13-tail-routes.spec.ts NEW = 24 tests; v13-a11y +5 chrome scans; v13-time-picker +3 re-anchor; v13-truncation +2; v13-portal-containment +1; cost-dashboard +3; skills-detail +2; alerts +2. Net: 24 NEW spec file + 18 extensions = 42 NEW tests. Existing test counts unchanged. |
| Lighthouse | 9/9 PASS | _pending operator re-run on Phase 27 close_ | 0 expected | Phase 27 ships ZERO new runtime deps — no perf regression expected. Operator: run `cd frontend && pnpm build && npx lhci autorun --config=./lighthouserc.json` before signing. |
| Axe (Phase-N-attributable blocking) | 0 (PHASE_25 + PHASE_26 inversion) | **0** | — | PHASE_27_NET_CLASS_MARKERS inversion filter added (cmc-alert-nl__error, cmc-alert-nl__error-actions, cmc-alert-rule-form). v1.2 carry-overs still flow through unflagged — Pitfall 7 rebalance window now becomes Phase 28+ candidate. 5 NEW Phase 27 chrome scans all PASS: /skills, /skills/$name, /cost, /alerts, AlertNlInput 503 mocked-error state. |
| Portal containment | 6/6 PASS | **7/7 PASS** | +1 | Phase 27 added 1 sentinel test confirming NO new portal-mounting surfaces landed (CompareToggle is a plain button; AlertNlInput 503 error block is inline DOM). |
| URL contract pytest | 2/2 PASS | **2/2 PASS** | 0 | Phase 27 validateSearch extensions are append-only (time_from + time_to + compare_panels on /skills, /skills/$name, /cost, /alerts) — Pitfall 13 lock honored. |
| Visual capture PNG total | 96 (36 Phase 24 + 30 Phase 25 + 30 Phase 26) | **120** | +24 | 4 tail-end-route surfaces × 3 densities × 2 themes = 24 NEW PNGs at `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/visual-check/`. |
| ResponsiveContainer count | 8 across 8 panel files (= Phase 24 lock baseline; Phase 26 close confirmed 8) | **8 across 8 panel files** | 0 | Phase 27 added zero charts. Plan 27-05's CompareToggle on CostByProjectCard ships URL-only (no DeltaPill chart column — see Accepted Exception below). `/usr/bin/grep -rc "<ResponsiveContainer" frontend/src/components/panels/` → 8. |

---

## Visual capture verdict — Phase 27 new chrome (24 NEW PNGs)

Operator: open each PNG in alpha order under `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/visual-check/`, mark PASS/FAIL, add notes. Pass criteria: surfaces render bounded (no panel content overflows past card border), density tokens visibly differ (Compact tighter / Cozy roomier vs Comfortable reference), the chrome's intended affordance is legible.

| Surface × Density × Theme | Verdict | Notes |
| ------------------------- | ------- | ----- |
| alerts-bounded__compact__dark.png | ✅ PASS | bounded shell + AlertRuleForm cmc-card--bounded; compact density tighter than comfortable reference |
| alerts-bounded__compact__light.png | ✅ PASS | parity with dark variant; legible affordances |
| alerts-bounded__comfortable__dark.png | ✅ PASS | comfortable reference variant — used as the live walkthrough baseline density |
| alerts-bounded__comfortable__light.png | ✅ PASS | parity with dark; both themes inherit identical density tokens |
| alerts-bounded__cozy__dark.png | ✅ PASS | cozy roomier than comfortable — visible density-token differentiation |
| alerts-bounded__cozy__light.png | ✅ PASS | parity with dark variant |
| cost-bounded__compact__dark.png | ✅ PASS | both cost cards bounded; project_key column tight at compact density |
| cost-bounded__compact__light.png | ✅ PASS | parity with dark variant |
| cost-bounded__comfortable__dark.png | ✅ PASS | comfortable reference; live walkthrough confirmed CompareToggle round-trips URL |
| cost-bounded__comfortable__light.png | ✅ PASS | parity with dark variant |
| cost-bounded__cozy__dark.png | ✅ PASS | cozy density visibly roomier; cards stay bounded |
| cost-bounded__cozy__light.png | ✅ PASS | parity with dark variant |
| skills-detail-bounded__compact__dark.png | ✅ PASS | 5/5 cards bounded post-d76a95b; TruncatedCell wraps long heading; compact tightest density |
| skills-detail-bounded__compact__light.png | ✅ PASS | parity with dark variant |
| skills-detail-bounded__comfortable__dark.png | ✅ PASS | comfortable reference; SkillTimeline mounts as 5th panel |
| skills-detail-bounded__comfortable__light.png | ✅ PASS | parity with dark variant |
| skills-detail-bounded__cozy__dark.png | ✅ PASS | cozy density roomier; bounded contract preserved |
| skills-detail-bounded__cozy__light.png | ✅ PASS | parity with dark variant |
| skills-index-bounded__compact__dark.png | ✅ PASS | all index panels bounded |
| skills-index-bounded__compact__light.png | ✅ PASS | parity with dark variant |
| skills-index-bounded__comfortable__dark.png | ✅ PASS | comfortable reference for /skills index |
| skills-index-bounded__comfortable__light.png | ✅ PASS | parity with dark variant |
| skills-index-bounded__cozy__dark.png | ✅ PASS | cozy density |
| skills-index-bounded__cozy__light.png | ✅ PASS | parity with dark variant |

---

## Backend pytest gate

**Run:** `cd backend && uv run pytest --tb=no`
**Result:** **690 passed, 0 failed, 0 skipped, 32 warnings** (vs Phase 26 close 686 → delta +4 net)

Breakdown:
- Plan 27-02 added 3 tests in `tests/test_sessions_router.py` (round-trip wire-shape locks for project_key on `/api/sessions` list + `/api/sessions/compare` + `compute_project_key(cwd) == response.project_key` cross-check).
- Plan 27-07 added 2 tests in `tests/test_alerts_metrics_contract.py` (exact-equality `sorted(_SCOPE_EXTRACTORS.keys()) == sorted(GET /api/alerts/metrics → metrics)` + smoke "≥3 metrics") and deleted 1 test in `tests/test_alerts_metrics_sync.py` (build-time grep-based drift guard).
- Net: +3 (Plan 27-02) + +2 (Plan 27-07) + -1 (Plan 27-07 delete) = +4.

The 32 warnings remain Phase 06-vintage aiosqlite Python 3.12+ datetime adapter deprecations — pre-existing carry-over, not phase-attributable.

---

## Frontend vitest gate

**Run:** `cd frontend && pnpm test --run`
**Result:** **662 passed, 0 failed, 0 skipped** across 107 test files (vs Phase 26 close 610 → delta +52)

Plan-by-plan deltas captured in each 27-XX-SUMMARY.md; net +52 across the 8 implementation plans.

---

## Frontend typecheck + lint + build

| Check | Result |
| ----- | ------ |
| `pnpm tsc --noEmit` | **clean** (no output / exit 0) |
| `pnpm lint --max-warnings 0` | **exit 0** |
| `pnpm build` | **clean** (production bundle CommandPalette chunk ~389 kB, well under the Vite 500 kB default-warn threshold) |

---

## URL contract gate (POLI-13)

**Run:** `cd backend && uv run pytest tests/test_url_contract.py -v`
**Result:** **2/2 PASS**

Phase 27 added optional search-param fields to /skills, /skills/$name, /cost, /alerts validateSearch (time_from + time_to + compare_panels) — all APPEND-ONLY per Pitfall 13. Bidirectional contract intact: every documented route resolves to a file in `frontend/src/routes/`; every route file is documented in `docs/url-contract.md`.

---

## Phase 27 e2e cascade summary

The Phase 27 close gate adds **24 NEW tests** in `v13-tail-routes.spec.ts` (mapped 1:1 to SC#1-#5 + TDBT-01..03) PLUS **18 NEW extension tests** across 5 existing v13-* spec families + 3 route-specific specs:

| Spec | Phase 26 close | Phase 27 close (NEW Phase-27-attributable) | Status |
| ---- | -------------- | ------------------------------------------ | ------ |
| `v13-tail-routes.spec.ts` (NEW) | — | **24 tests** (17 pass + 7 env-skip when DB lacks fixtures) | NEW |
| `v13-a11y.spec.ts` | 39 PASS | +5 NEW chrome scans (4 tail routes + AlertNlInput 503) — **44 total (43 pass + 1 env-skip)** | extended |
| `v13-time-picker.spec.ts` | 19 PASS | +3 NEW re-anchor probes on /skills, /cost, /alerts — **22 total (all pass)** | extended |
| `v13-truncation.spec.ts` | 1 (forward-compat skip) | +2 NEW walks (skills/$name header + cost project column) — **3 total (1 pass + 2 env-conditional)** | extended |
| `v13-portal-containment.spec.ts` | 6 PASS | +1 NEW Phase 27 sentinel (no new portals) — **7 total (all pass)** | extended |
| `cost-dashboard.spec.ts` | 4 (with skips) | +3 NEW Phase 27 extensions; pre-existing RangeToggle test rewritten to use global TimePicker preset (Plan 27-05 dropped the RangeToggle) — **7 total (all pass)** | extended + 1 rewritten |
| `skills-detail.spec.ts` | 1 (with skip) | +2 NEW Phase 27 extensions — **3 total (env-conditional)** | extended |
| `alerts.spec.ts` | 1 (TEST-05a, env-conditional) | +2 NEW Phase 27 extensions — **3 total (env-conditional)** | extended |

**Total NEW tests:** 24 (v13-tail-routes.spec.ts) + 18 (extensions) = **42 NEW tests**.

**Skips note:** Several Phase 27 tests skip when the dev DB lacks fixtures (no skills / no project_key rows / no compare-picker context active). These match the precedent established by `skills-detail.spec.ts` (Phase 19) + `cost-dashboard.spec.ts` (Phase 20) + `alerts.spec.ts` (Phase 21). Phase verifiers compare failed counts only, not skip counts — a clean dev DB legitimately produces several "n skipped" rows here.

---

## Accepted Exceptions

Phase 24 + Phase 25 + Phase 26 close's Accepted Exceptions tables are **carried forward unchanged**. The Phase 26 close noted "the 8 v1.2 carry-over a11y items + 2 Phase 06 vintage semantic patterns enumerated in Phase 25 close are carried forward unchanged. Confirm they continue flowing through the inversion filter without re-engaging the close gate." Phase 27 honors this — the `PHASE_27_NET_CLASS_MARKERS` inversion catches Phase-27-attributable violations only.

### Pre-positioned Accepted Exception (operator confirms or escalates)

**CostForecastCard MTD-only — SC#2 "re-query" satisfied as "re-render":**

The `/api/cost/forecast` endpoint is month-to-date with NO range parameter (per `frontend/src/routes/cost.tsx:56-58` and Phase 19/20 design). Plan 27-05 correctly opts CostForecastCard OUT of the `useRouteRangeVocab` bridge (documented inline at `frontend/src/components/panels/CostForecastCard.tsx`). When the operator changes the global time picker on `/cost`, CostForecastCard produces a React re-render (URL change re-runs the route component) but does NOT issue a new API call.

**This satisfies SC#2's "panels re-query on picker change" contract per the existing architecture.** Achieving a literal "re-query" for the MTD card would require a backend range extension — OUT OF SCOPE for Phase 27 (tracked as Phase 28+ candidate). The card's single-point projection already encodes its own confidence via `partial_month_bias`; range-based comparison would change the card's UX semantics.

**Operator action:** confirm acceptance OR escalate to gap closure plan in Phase 28.

### Pre-positioned Accepted Exception (operator confirms or escalates)

**CostByProjectCard CompareToggle — URL round-trip ships but DeltaPill column does NOT render (escape path (i)):**

Plan 27-05 mounts `<CompareToggle panelId="cost-by-project" />` in the CostByProjectCard chrome — when toggled, URL gains `?compare_panels=cost-by-project` (saved-view + bookmark + deep-link contract parity with TokenUsageCard from Phase 26). However, the prior-period DeltaPill column is NOT rendered: `CostBreakdownResponse.rows` are rolled-up per-project totals with no time bucketing (each row has `key + tokens_* + cost_usd` — no `day` axis). Client-side prior-period slicing requires bucketed data; without backend support this isn't computable.

**This is escape path (i)** documented in Plan 27-05's key-decisions: "ship CompareToggle for URL contract + saved-view forward-compat, document the limitation, defer the column rendering to a future plan that lands the backend bucketed endpoint." `CostByProjectCard.compareOverlay.test.tsx` pins the limitation (assertion: no `.cmc-delta-pill` rendered + no "vs prior period" header text); a future patch adding the column without bucketed data would flag as a regression test failure.

**Operator action:** confirm acceptance OR escalate to gap closure plan in Phase 28+ that lands the backend bucketed cost-breakdown endpoint.

### Pre-positioned Accepted Exception (deviation — already self-healed)

**Stale dev backend was running on :8765 without --reload — restarted as Rule 3 fix during Plan 27-09 cascade:**

During Task 1 verification, the e2e tests against the running dev backend at :8765 failed because the running uvicorn process was started BEFORE Plan 27-02 added `project_key` to `SessionListItem` + `SessionCompareSide` schemas. The process lacked `--reload` so it never picked up the schema change. Killed PID 42432 + restarted fresh with `cd backend && uv run uvicorn cmc.app.factory:create_app --factory --host 127.0.0.1 --port 8765`. Fresh start now emits `project_key: "37ae465f3a20"` (and equivalent) on all `/api/sessions*` responses.

**Disposition:** Self-healed (Rule 3 — blocking issue auto-fixed). The Phase 27 implementation source code is correct; only the operator's long-running dev process was stale. No code change needed. Operator should verify the dev backend is running with the project_key wire shape before signing.

### Pre-positioned Accepted Exception (deviation — already self-healed)

**Pre-existing `7d→30d RangeToggle` test in `cost-dashboard.spec.ts` rewritten to use global TimePicker (Rule 1 — bug):**

Plan 27-05 DROPPED the panel-internal `<RangeToggle persistKey="cost-by-project" />` in `CostByProjectCard.tsx` — the URL is now the canonical persistence layer. The pre-existing e2e test `7d→30d toggle fires a /api/cost/breakdown?range=30d request` was asserting on the dropped button. Plan 27-09 Task 1 cascade rewrote the test (without expanding scope) to use the equivalent URL-driven path: TimePicker "Last 30 days" preset → `?time_from=now-30d&time_to=now` → `useRouteRangeVocab` → `snapToCostRange` → fetch `range=30d`. The new test name is "Phase 27 / global TimePicker preset triggers /api/cost/breakdown?range=30d request" (renamed for clarity).

**Disposition:** Self-healed (Rule 1 — stale test from before Plan 27-05). The implementation is correct (Plan 27-05's URL migration); only the test needed to be brought forward with it.

---

## Manual operator steps (require browser)

The automated gates above ground the close-gate decision in evidence. The operator's role is the same as Phase 24/25/26 close-gates: spot-check the visual matrix, exercise the interactive flows, and sign the verdict.

### 1. Visual matrix review (~5-10 min for the 24 NEW Phase 27 PNGs)

Open `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/visual-check/` in Finder. Iterate through all 24 PNGs in alpha order. For each:

- **PASS** if the route renders bounded (no panel content overflows past card border), density tokens visibly differ (compact tighter / cozy roomier vs comfortable), and the surface's intended affordance is legible (e.g., AlertRuleForm renders inside cmc-card--bounded; CostByProjectCard project_key column truncates cleanly; SkillTimeline mounts as 5th panel on /skills/$name).
- **FAIL** if any of the above breaks.

Mark each row in the **Visual capture verdict** table above.

### 2. Interactive exercise (success criteria 1-5)

Dev server: `cd backend && uv run uvicorn cmc.app.factory:create_app --factory --host 127.0.0.1 --port 8765` (fresh after the cascade restart) + `cd frontend && pnpm dev`.

**Criterion 1 — /skills/$name 4-panel bounded + density + global picker:**

1. Navigate to `/skills/tdd-coverage-author-with-fanout` (or any long-name skill) → header truncates with hover tooltip; 4 panels (SkillProjectsTable + SkillRunsTable + SkillLatencySnapshot + SkillTimeline) render bounded inside cmc-page--bounded shell.
2. Set global TimePicker to "Last 7 days" → URL gains `?time_from=now-7d&time_to=now`; panels refetch (snap to '14d' vocab via snapToSkillRange + 21d band).
3. Open `?range=30d` URL alongside `?time_from=now-7d` — both query keys persist (append-only Pitfall 2 LOCK preserved); global picker WINS per LOCKED OPERATOR DECISION 2.
4. Cmd+K → "Density: Compact" → entire dashboard re-spaces; SkillTimeline doesn't remount (DOM identity preserved per POLI-11 architectural inheritance).

**Criterion 2 — /cost picker + CompareToggle + project truncation:**

1. Navigate to `/cost` → both panels bounded (cost-forecast-card + cost-by-project-card with cmc-card--bounded). Root section has cmc-page--bounded.
2. Set TimePicker to "Last 30 days" → URL gains time_from=now-30d/time_to=now; CostByProjectCard refetches with range=30d (DevTools Network tab confirms).
3. Click CompareToggle on CostByProjectCard → URL gains `compare_panels=cost-by-project`. **Accepted Exception:** DeltaPill column does NOT render (escape path (i) — see Accepted Exceptions above). Reload preserves the URL state; saved-view fork-save round-trips the compare_panels key.
4. CostForecastCard does NOT show CompareToggle (TIME-04 opt-out — MTD projection has no historical timeline; **Accepted Exception** above).
5. CostByProjectCard project_key column truncates cleanly via TruncatedCell (currently uniform 12-char hex; defensive wrap for future schema widening).

**Criterion 3 — ComparePicker uses project_key (TDBT-01):**

1. Open Cmd+K from a single-session-set `/sessions/compare?a=<uuid>` URL → "Compare with previous" → ComparePicker shows candidates whose project_key matches the scope (canonical sha1[:12]-of-realpath, not cwd string).
2. Description copy reads "Showing sessions in the same project." — **no 12-char project_key hex leaks** into user-facing copy.
3. Symlink + byte-equal-cwd edge cases now resolve correctly (verified via vitest in `CommandPalette.test.tsx` Plan 27-03 TDBT-01 cases).

**Criterion 4 — AlertRuleForm metric vocabulary from useAlertMetrics (TDBT-02):**

1. Open `/alerts` → DevTools Network shows a `GET /api/alerts/metrics` request. AlertRuleForm `<select>` renders 3+ vocabulary options sourced from the API response.
2. Throttle network to "Slow 3G" → reload → `<select>` shows disabled "Loading metric vocabulary…" placeholder during the brief fetch window.
3. Inspect source: `grep -c FALLBACK_KNOWN_METRICS frontend/src/components/panels/AlertRuleForm.tsx` returns **0**. The cross-language drift guard is now the API-layer contract test `backend/tests/test_alerts_metrics_contract.py`.

**Criterion 5 — NL composer 503 retry UX (TDBT-03):**

1. Unset `ANTHROPIC_API_KEY` in backend env, restart backend → navigate to `/alerts` → type a description ("alert me when haiku skill p95 exceeds 5s") in AlertNlInput → click Parse → honest non-specific copy appears: "Couldn't parse this description. The phrasing didn't match a known pattern, or the natural-language service is temporarily unavailable." Retry button visible.
2. **V11 lock honored:** copy does NOT contain "credentials missing" / "Anthropic" / "API key" (operator can verify via DevTools Elements panel inspection).
3. Click Retry → useParseAlertNl mutation re-fires (Network tab shows 2 POSTs same payload); Retry button disabled + labeled "Retrying…" during the in-flight window (DoS guard).
4. Manual ThresholdForm + AnomalyForm BELOW the NL composer remain usable after the 503 (Phase 21 Pitfall 5 invariant).

### 3. Console errors review

Open browser DevTools Console. Navigate around (/, /activity, /sessions/compare, /skills, /skills/$name, /cost, /alerts). Exercise TimePicker / RefreshDropdown / Cmd+K / CompareToggle / AlertNlInput 503 retry. **PASS condition:** no NEW errors attributable to Phase 27 work. The pre-existing 404 pattern on `/api/system/state?key=emergency_stop` (Phase 26 close baseline) remains acceptable.

### 4. Acknowledge Accepted Exceptions

- **CostForecastCard MTD-only** — confirm acceptance (SC#2 "re-query" satisfied as "re-render"; literal re-query requires backend range extension out of scope for Phase 27).
- **CostByProjectCard DeltaPill deferred** — confirm acceptance of escape path (i); URL round-trip ships, column rendering deferred to a future plan landing backend bucketed cost-breakdown.
- **Stale backend restart** — confirm the fresh `uvicorn` on :8765 is running with project_key on the wire (`curl 'http://127.0.0.1:8765/api/sessions?limit=1' | python3 -m json.tool` should show `"project_key": "<12-char-hex>"`).
- **cost-dashboard.spec.ts test rewrite** — confirm the renamed Phase 27 test exercises the equivalent URL-driven path (global TimePicker → useRouteRangeVocab → fetch range=30d) instead of the dropped RangeToggle button click.
- Phase 24 + 25 + 26 a11y carry-overs (8 v1.2 color-contrast classes + 2 Phase 06 vintage semantic patterns) continue flowing through the inversion filter — Pitfall 7 rebalance window now becomes a Phase 28+ candidate (no Phase 27 plan claimed the cleanup).

### 5. Lighthouse re-run

```bash
cd frontend && pnpm build && npx lhci autorun --config=./lighthouserc.json
```

Manifest: `frontend/.lighthouseci/manifest.json`. Expected: **9/9 PASS at median aggregation** (Phase 27 ships ZERO new runtime deps so no perf regression is expected). Document the median LCP / CLS / performance per URL alongside the Phase 26 baseline numbers in this file under a NEW "Lighthouse CI results" section if any per-URL median drifts >10%; otherwise mark as PASS inline above.

**Then:** write operator inline notes (8-9-item template like Phase 24/25/26) into this file; write the verdict signature block below; commit the close-gate metadata.

---

## Live operator walkthrough — 2026-05-16 (Chrome DevTools MCP against http://localhost:5173)

Conducted by Patryk Golabek via the Claude Code Chrome DevTools MCP integration directly against the running dev server (`pnpm dev` on :5173 + backend on :8001). All 5 ROADMAP success criteria verified functionally against live wire shapes and live DOM.

### Verification-discovered close-gate fix (committed inline)

**`d76a95b` — fix(27-09): SkillLatencySnapshot success-state cmc-card--bounded (Rule 1)**

Plan 27-04 Step 6 correctly added the `cmc-card--bounded` modifier to the loading-state (`skills_.$name.tsx:145`) and error-state (`skills_.$name.tsx:160`) branches of the inline `SkillLatencySnapshot` component, but missed the success-state branch (`skills_.$name.tsx:177`) where the bare `<section className="cmc-card">` was rendered when real data flowed. The bug only surfaces when the dev DB has skill-latency data; tests passed Plan 27-04 close because the test environment didn't exercise this path. Live walkthrough caught it: 5 cards rendered, only 4 bounded. One-line fix (`className="cmc-card"` → `className="cmc-card cmc-card--bounded"`) restores the surface to 5/5 bounded. Behavior unchanged, no test added (Phase 28 will add a route-level bounded contract test that exercises every state-machine branch — tracked as a Phase 28 candidate).

### Live wire-shape evidence

| Probe | Result |
|-------|--------|
| `GET /api/sessions?limit=2` | items[0].project_key = "37ae465f3a20"; items[1].project_key = "63c04f774647" (12-char hex on every row — TDBT-01 backend) |
| `GET /api/sessions/compare?a=6c3ea6dd…&b=aa9afa28…` | a.project_key = "37ae465f3a20", b.project_key = "63c04f774647" (12-char hex on both sides — TDBT-01 backend) |
| `GET /api/alerts/metrics` | `{"metrics": ["cost_usd_24h", "dispatcher_failed_tasks_5m", "skill_p95_latency_ms"]}` (drives AlertRuleForm `<select>` — TDBT-02) |
| `/skills/tdd-coverage-author-with-fanout?time_from=now-25d&time_to=now` | cost+projects fetch `range=30d` (global picker wins via snapToSkillRange — LOCKED OPERATOR DECISION 2); latency stays at `range=14d` (route-local — Accepted Exception below) |
| `/cost?time_from=now-30d&time_to=now` | `GET /api/cost/breakdown?dim=project&range=30d` (vocab bridge wins); `GET /api/cost/forecast` (no range param — MTD opt-out) |
| Click CompareToggle on `/cost` | URL becomes `/cost?…&compare_panels=cost-by-project` (URL round-trip — TIME-04 contract) |
| Stub `/api/alerts/parse-nl` → 503 + Parse | `role="alert"` block renders the operator-locked copy verbatim + Retry button; zero leaked terms (V11 lock honored) |
| Click Retry | 2nd POST with identical `{description: …}` payload — mutation re-fires; manual ThresholdForm stays focusable (Pitfall 5 invariant) |

### Live density-flip zero-rerender probe

Tagged the 5 `.cmc-card` DOM nodes with `data-probe="pre-N"`, flipped `data-density` from `comfortable` → `compact`, re-queried. All 5 markers preserved. POLI-11 zero-rerender contract maintained on the new Phase 27 detail route.

### Live walkthrough screenshots (NEW supplemental evidence)

- `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/visual-check/operator-walkthrough-skills-detail-bounded.png` — `/skills/tdd-coverage-author-with-fanout?time_from=now-25d&time_to=now` post-d76a95b (5/5 bounded)
- `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/visual-check/operator-walkthrough-cost-compare-active.png` — `/cost?…&compare_panels=cost-by-project` (CompareToggle in `--active` state)
- `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/visual-check/operator-walkthrough-alerts-after-restore.png` — `/alerts` post-503-walkthrough after `location.reload()` restored unstubbed fetch

### Lighthouse re-run disposition

Deferred — Phase 27 ships ZERO new runtime dependencies (all 8 implementation plans consume the existing Phase 24 / Phase 25 / Phase 26 primitive stack; Plan 27-08's CSS additions for `.cmc-alert-nl__error*` are ~5 lines of layout-only declarations with no new asset loading). Phase 26 close's 9/9 PASS at median (LCP 319-590ms / CLS ≤0.0001 median / performance 1.00) is inherited unchanged. `pnpm build` confirmed clean at close — CommandPalette chunk 389 kB (gzip 121 kB), no asset-budget breach. **Operator accepts Phase 26 baseline carry-forward.**

### NEW Accepted Exception (#5) — SkillLatencySnapshot stays on route-local `?range=`

**Context:** During live walkthrough of LOCKED OPERATOR DECISION 2 ("global picker WINS WHEN PRESENT" on `/skills/$name`), the 4 panels covered by Plan 27-04's `hasGlobalPicker` ternary wiring (SkillCostCard / SkillProjectsTable / SkillRunsTable via prop / SkillTimeline) correctly snap to the global picker's range vocabulary. However, **SkillLatencySnapshot** — the inline single-skill latency card defined within `skills_.$name.tsx:121-216` — was intentionally left on the route-local `?range=` path per the operator-locked decision documented in source comments at `skills_.$name.tsx:242-246`:

> "Phase 27 / SC#1 (Plan 04): the global picker (time_from/time_to) wins over the route-local `range` AT THE PANEL READ SITE. The page header itself doesn't care which one is active — it only reflects the skill name. Panels (SkillCostCard, SkillProjectsTable, SkillRunsTable, SkillTimeline) each compute their own effective range via the hasGlobalPicker ternary; SkillLatencySnapshot still uses the route-local `range` because it's an inline component and the operator chose to leave it on the legacy code path until the wider snapshot refactor (see file header — single-skill-latency is intentionally un-extracted)."

**Live observation:** `?time_from=now-25d&time_to=now&range=14d` produces `GET /api/skills/.../cost?range=30d` + `GET /api/skills/.../projects?range=30d` (global wins) but `GET /api/skills/.../latency?range=14d` (route-local preserved). This is the documented design.

**Disposition:** Accepted as carry-forward. Will be lifted when SkillLatencySnapshot is extracted to its own component during a future single-skill snapshot refactor (Phase 28+ candidate). No Phase 27 regression — the operator-locked decision predates this close gate and is encoded in source comments + tests.

### NEW Accepted Exception (#6) — Verification-discovered fix `d76a95b` lands inside Plan 27-09

**Context:** A 1-line `cmc-card--bounded` className addition was applied to the SkillLatencySnapshot success-state branch during live walkthrough (see "Verification-discovered close-gate fix" above). The fix lands as part of the Plan 27-09 close-gate cascade (mirroring the Phase 26 close pattern where `e838135 fix(26-09): TIME-04 click hit-test resilience` landed inside the close gate).

**Disposition:** Accepted as a Rule-1 close-gate fix. Surface restored to 5/5 bounded; tsc + lint clean; Plan 27-04's spirit preserved.

---

## Phase verdict

**Operator verdict:** ✅ **PASS**
**Date verdict signed:** 2026-05-16
**Operator name:** Patryk Golabek

**Notes:** Phase 27 closes cleanly. All 5 ROADMAP success criteria functionally verified via live Chrome DevTools MCP walkthrough against the running dev server (frontend :5173 + backend :8001). All 3 REQ-IDs (TDBT-01 / TDBT-02 / TDBT-03) closed end-to-end. v1.3 milestone advances 3/5 → 4/5 phases complete; Phase 28 (Layout Customization) is now unblocked.

**6 Accepted Exceptions operator-acknowledged:**
1. **CostForecastCard MTD-only opt-out** — SC#2 "re-query" satisfied as "re-render" (no range param on `/api/cost/forecast`); literal re-query deferred to Phase 28+ candidate landing backend range-shifted forecast.
2. **CostByProjectCard DeltaPill column deferred** — escape path (i); CompareToggle URL round-trip ships, but client-side prior-period slicing impossible without backend bucketed cost-breakdown.
3. **Stale backend restart** — Rule 3 self-healed; running uvicorn now picks up Plan 27-02 schema additions.
4. **cost-dashboard.spec.ts test rewrite** — Rule 1 self-healed; pre-existing RangeToggle test brought forward to global-TimePicker path.
5. **SkillLatencySnapshot stays on route-local `?range=`** — NEW exception; operator-locked decision documented inline at `skills_.$name.tsx:242-246`; will lift during future snapshot refactor.
6. **Verification-discovered fix `d76a95b`** — NEW exception; 1-line `cmc-card--bounded` className add inside Plan 27-09 close-gate, mirroring Phase 26's `e838135` close-gate fix precedent.

**Lighthouse re-run disposition:** Phase 26 9/9 baseline accepted as carry-forward — Phase 27 ships ZERO new runtime deps; production build clean.

---

## Self-Check (automated artifacts produced by Plan 09)

- [x] 24 NEW v13-tail-routes.spec.ts tests authored (17 pass + 7 env-skip when DB lacks fixtures matching precedent skip patterns)
- [x] 5 NEW v13-a11y.spec.ts chrome scans + PHASE_27_NET_CLASS_MARKERS inversion filter added (all PASS; 43 total a11y tests pass + 1 env-skip)
- [x] 3 NEW v13-time-picker.spec.ts re-anchor probes on /skills, /cost, /alerts (all PASS)
- [x] 2 NEW v13-truncation.spec.ts walks (long skill name + project_key) (env-conditional)
- [x] 1 NEW v13-portal-containment.spec.ts Phase 27 sentinel (no new portals — PASS)
- [x] 3 NEW cost-dashboard.spec.ts Phase 27 extensions + 1 pre-existing test rewritten to use global TimePicker (Plan 27-05 dropped RangeToggle) — all 7 PASS
- [x] 2 NEW skills-detail.spec.ts Phase 27 extensions (env-conditional)
- [x] 2 NEW alerts.spec.ts Phase 27 extensions (env-conditional)
- [x] 24 NEW v13-visual-capture.spec.ts captures (4 tail routes × 3 densities × 2 themes)
- [x] 24 PNGs landed at `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/visual-check/`
- [x] Backend `uv run pytest` 690/0/0 (+4 vs Phase 26 close: Plan 27-02 +3 + Plan 27-07 net +1)
- [x] Frontend `pnpm test --run` 662/0/0 (+52 vs Phase 26 close from Plans 27-01..08)
- [x] Frontend `pnpm tsc --noEmit` clean
- [x] Frontend `pnpm lint --max-warnings 0` clean
- [x] Frontend `pnpm build` clean
- [x] Backend `uv run pytest tests/test_url_contract.py` 2/2 PASS
- [x] ResponsiveContainer count = 8 across 8 panel files (= v1.2 baseline; Phase 24/25/26/27 deltas all 0)
- [x] PHASE_27_NET_CLASS_MARKERS inversion filter wired into the base 30-run axe matrix
- [x] Pre-positioned Accepted Exceptions: CostForecastCard MTD-only opt-out (SC#2 re-query as re-render) + CostByProjectCard DeltaPill column deferred (escape path (i) — URL contract round-trips without the column) + stale backend restart (Rule 3) + cost-dashboard.spec.ts test rewrite (Rule 1)
- [x] **Operator visual matrix verdict** — 24/24 PNGs marked PASS via density-token + bounded-contract spot-check
- [x] **Operator interactive criteria 1-5 verification** — live Chrome DevTools MCP walkthrough 2026-05-16; all 5 SCs functionally verified against running dev server; 6 Accepted Exceptions acknowledged
- [x] **Lighthouse re-run** — deferred + accepted at Phase 26 9/9 baseline; Phase 27 ships ZERO new runtime deps; `pnpm build` clean at close
- [x] **Operator verdict signature** — PASS signed 2026-05-16 by Patryk Golabek

## Self-Check: PASSED
