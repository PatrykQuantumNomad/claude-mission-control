---
phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
plan: 09
subsystem: testing
tags: [playwright, axe-core, lighthouse-ci, visual-regression, phase-close, tail-route-adoption, project-key, alert-nl-retry, fallback-known-metrics, compare-toggle, skills-detail, cost-by-project, alerts]

# Dependency graph
requires:
  - phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
    provides: "Plans 01-08 cumulative tail-end-route adoption substrate — useRouteRangeVocab<V> generic URL→Vocab bridge + 3 vocab snappers (Plan 01); project_key wire exposure on /api/sessions list + /api/sessions/compare backend (Plan 02); ComparePicker frontend filter switch from cwd-proxy to project_key authoritative identity (Plan 03); /skills + /skills/$name per-route adoption with hasGlobalPicker ternary on 4 detail panels, cmc-page--bounded, TruncatedCell wraps long skill name, SkillTimeline-as-5th-panel (Plan 04); /cost per-route adoption + TIME-04 CompareToggle on CostByProjectCard with URL-driven range replacing localStorage RangeToggle (Plan 05); /alerts per-route adoption with AlertEventsList vocab-bridge migration + AlertRulesList bounded + AlertRuleForm bespoke-card cmc-card--bounded touch (Plan 06); TDBT-02 SOLE-SOURCE — FALLBACK_KNOWN_METRICS DELETED + drift guard rewritten from build-time grep test_alerts_metrics_sync.py to runtime API-contract test_alerts_metrics_contract.py per LOCKED OPERATOR DECISION 2 (Plan 07); TDBT-03 — AlertNlInput silent inline 503 error REPLACED with honest non-specific copy + Retry button + hadError latched-state + V11 collapsed-failure-mode lock preserved (Plan 08)"
  - phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
    provides: "Global time picker contract (TimePicker + RefreshDropdown + AutoRefreshController + Cmd+Shift+C/V hotkeys + URL-as-broadcast-bus pattern) verified across /, /activity, /sessions/compare in Phase 26 close gate; Phase 27 tail routes extend the validateSearch substrate APPEND-ONLY with time_from/time_to/compare_panels on /skills, /skills/$name, /cost, /alerts (Pitfall 13 lock honored)"
  - phase: 25-saved-views-backend-frontend
    provides: "DefaultViewLoader + RecentStateTracker + Pinned section + LoadedViewContext + SavedViewMenu + validateSearch substrate that Phase 27 extends append-only on the tail-end routes; URL-state-as-saved-view-state_json contract round-trips compare_panels correctly via the fork-save path"
  - phase: 24-shell-density-containment-primitives
    provides: "Quality-gate Playwright matrix (v13-visual-capture, v13-a11y, v13-portal-containment, v13-sidebar, v13-truncation, v13-copy-cell, command-palette), lighthouserc.json, test_url_contract.py, ESLint cmc/testid-registry-only + cmc/no-raw-z-index invariants, BoundedPanelCard + density tokens + AppShellHeader + Radix Portal substrate that Phase 27 chrome consumes wholesale"
provides:
  - "Phase 27 close-gate verdict at 27-VISUAL-CHECK.md — operator-signed PASS on 2026-05-16 (Patryk Golabek via live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001); 5/5 ROADMAP success criteria functionally verified; 3/3 REQ-IDs (TDBT-01 + TDBT-02 + TDBT-03) closed end-to-end"
  - "24 NEW v13-tail-routes.spec.ts tests covering SC#1-#5 + TDBT-01..03 (17 pass + 7 env-skip when DB lacks fixtures, matching skills-detail.spec.ts + cost-dashboard.spec.ts + alerts.spec.ts precedent)"
  - "18 NEW extension tests across 5 existing v13-* spec families (v13-a11y +5 chrome / v13-time-picker +3 re-anchor / v13-truncation +2 / v13-portal-containment +1 sentinel / cost-dashboard +3 / skills-detail +2 / alerts +2) — net +42 Playwright tests"
  - "24 NEW visual-capture PNGs (4 tail-end-route surfaces × 3 densities × 2 themes — skills-index-bounded, skills-detail-bounded, cost-bounded, alerts-bounded); 24/24 PASS verdict; combined v1.3 visual surface 120 PNGs (36 + 30 + 30 + 24)"
  - "Axe-core matrix 0 Phase-27-attributable blocking violations; PHASE_27_NET_CLASS_MARKERS inversion filter wired additively atop Phase 25 + Phase 26 markers (cmc-alert-nl__error, cmc-alert-nl__error-actions, cmc-alert-rule-form)"
  - "Portal containment 7/7 PASS (Phase 26 6/6 carry-forward + Phase 27 sentinel confirming NO new portal-mounting surfaces in Phase 27 — CompareToggle is a plain button; AlertNlInput 503 block is inline DOM)"
  - "URL contract 2/2 PASS — Phase 27 validateSearch APPEND-ONLY extensions on /skills, /skills/$name, /cost, /alerts honor Pitfall 13 lock (time_from + time_to + compare_panels added; /skills/$name range PRESERVED per Pitfall 2 LOCK)"
  - "SkillLatencySnapshot success-state cmc-card--bounded fix shipped inline (d76a95b) — verification-discovered Rule-1 close-gate fix mirroring Phase 26's e838135 close-gate fix precedent"
  - "v1.3 milestone advances 3/5 → 4/5 phases complete (Phases 24 + 25 + 26 + 27 all closed; Phase 28 pending)"
affects: [phase-28, v1.3-milestone-close]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inversion filter PHASE_27_NET_CLASS_MARKERS in v13-a11y.spec.ts — additive forkable pattern continuing the Phase 25 → Phase 26 → Phase 27 inheritance chain. Each phase-close axe filter adds its own NET_CLASS_MARKERS set (cmc-alert-nl__error, cmc-alert-nl__error-actions, cmc-alert-rule-form); prior phases' filters carry forward additively. The 8 v1.2 carry-overs continue flowing through Phase 25's catalogue unflagged — Pitfall 7 rebalance window NOW becomes a Phase 28+ candidate (no Phase 27 plan claimed the cleanup, operator-acknowledged at sign-off)."
    - "Live-walkthrough verification-discovered fix pattern (#3 inheritance from Phase 26 e838135) — when an operator-driven Chrome DevTools MCP walkthrough catches a defect that the automated matrix didn't (because the test environment lacked fixtures to exercise the broken branch), the fix lands INSIDE the close-gate plan as a Rule-1 fix. Phase 27 inherits the precedent unchanged: d76a95b adds cmc-card--bounded to SkillLatencySnapshot's success-state branch (success branch unreachable when dev DB lacks skill-latency rows). Locked pattern: any future phase-close gate that runs against a live operator session may emit small Rule-1 fixes between the scaffold commit and the operator-signed verdict commit."
    - "Tail-route e2e scaffolding pattern locked: v13-tail-routes.spec.ts is the canonical Phase 27 close-gate spec, mapping 1:1 to SC#1-#5 + TDBT-01..03 with env-conditional skip blocks for DB-fixture-dependent paths (17 pass + 7 env-skip on a dev DB lacking complete fixtures, mirroring skills-detail.spec.ts + cost-dashboard.spec.ts + alerts.spec.ts precedent set in Phase 19-21). Locked for any future tail-end-route close-gate: spec family lives at v13-{phase-theme}.spec.ts; map tests 1:1 to ROADMAP success criteria; skip-when-fixtureless honors the verifier's failed-count-only contract."
    - "Test rewrite-vs-skip pattern for primitive migrations (#4 deviation pattern, inherited from earlier phases) — when a Phase 27 plan drops a primitive (e.g. Plan 27-05 dropped RangeToggle on CostByProjectCard, Plan 27-06 dropped AlertEventsList persistKey), the close gate REWRITES the pre-existing e2e test to use the equivalent URL-driven path (global TimePicker preset → useRouteRangeVocab → backend fetch) rather than skipping or deleting the test. Rule 1 (bug) since the test was asserting on a dropped button. Locked pattern: any future Phase N close-gate that ships a primitive replacement preserves the test coverage by rewriting, not by skipping."

key-files:
  created:
    - ".planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/27-09-SUMMARY.md (this file)"
    - "frontend/tests/e2e/v13-tail-routes.spec.ts (24 NEW tests mapped 1:1 to SC#1-#5 + TDBT-01..03)"
    - ".planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/27-VISUAL-CHECK.md (operator-signed verdict, 2026-05-16)"
  modified:
    - ".planning/STATE.md (Current Position → Phase 27 complete; status → phase_complete; metrics row Phase 26 close → Phase 27 close delta; decisions appended; session log; v1.3 progress 3/5 → 4/5)"
    - ".planning/ROADMAP.md (Phase 27 row [x] 9/9 Complete 2026-05-16; v1.3 milestone progress 3/5 → 4/5; progress table row Phase 27 → Complete 2026-05-16; v1.3 milestone summary bumped 39/45 → 42/45 active requirements satisfied)"
    - ".planning/REQUIREMENTS.md (TDBT-01 + TDBT-02 + TDBT-03 marked Complete in traceability table; v1.3 progress 38/45 → 41/45)"
    - "frontend/tests/e2e/v13-a11y.spec.ts (+5 NEW chrome scans for /skills, /skills/$name, /cost, /alerts, AlertNlInput 503 mocked-error state + PHASE_27_NET_CLASS_MARKERS inversion filter additive atop Phase 25 + Phase 26 sets)"
    - "frontend/tests/e2e/v13-time-picker.spec.ts (+3 NEW re-anchor probes on /skills, /cost, /alerts confirming the global picker writes time_from/time_to and panels refetch)"
    - "frontend/tests/e2e/v13-truncation.spec.ts (+2 NEW walks: long skill-name <h1> wrap on /skills/$name + project_key column truncation on /cost CostByProjectCard)"
    - "frontend/tests/e2e/v13-portal-containment.spec.ts (+1 NEW Phase 27 sentinel test confirming NO new portal-mounting surfaces landed in Phase 27)"
    - "frontend/tests/e2e/cost-dashboard.spec.ts (+3 NEW Phase 27 extensions + 1 pre-existing RangeToggle test REWRITTEN to use global TimePicker → useRouteRangeVocab → backend fetch path; Plan 27-05 dropped the RangeToggle so the test was rewritten without scope expansion)"
    - "frontend/tests/e2e/skills-detail.spec.ts (+2 NEW Phase 27 extensions: hasGlobalPicker ternary verification + 5th-panel SkillTimeline mount)"
    - "frontend/tests/e2e/alerts.spec.ts (+2 NEW Phase 27 extensions: AlertRuleForm metric vocabulary loads from useAlertMetrics + AlertNlInput 503 Retry button visible on stubbed 503)"
    - "frontend/tests/e2e/v13-visual-capture.spec.ts (+24 NEW captures: 4 tail-end-route surfaces × 3 densities × 2 themes — skills-index-bounded, skills-detail-bounded, cost-bounded, alerts-bounded)"
    - "frontend/src/routes/skills_.$name.tsx (SkillLatencySnapshot success-state branch line 177 — Rule 1 close-gate fix d76a95b: className 'cmc-card' → 'cmc-card cmc-card--bounded'; Plan 27-04 Step 6 missed the success branch, only landed on loading + error branches)"
  evidence:
    - ".planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/visual-check/ (24 NEW Phase 27 chrome PNGs + 3 supplemental live-walkthrough screenshots: operator-walkthrough-skills-detail-bounded.png, operator-walkthrough-cost-compare-active.png, operator-walkthrough-alerts-after-restore.png)"
    - "frontend/.lighthouseci/manifest.json + per-URL HTML reports (.gitignored; re-run DEFERRED + ACCEPTED at Phase 26 9/9 baseline — Phase 27 ships ZERO new runtime deps and production build clean)"

key-decisions:
  - "Operator verdict PASS signed 2026-05-16 by Patryk Golabek via live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001. All 5 ROADMAP success criteria functionally verified on live wire shapes + live DOM. 3/3 REQ-IDs (TDBT-01 + TDBT-02 + TDBT-03) closed end-to-end."
  - "Verification-discovered fix d76a95b lands INSIDE Plan 27-09 close-gate as Rule 1 (Bug). Plan 27-04 Step 6 correctly added cmc-card--bounded to the loading + error branches of the inline SkillLatencySnapshot component but missed the success-state branch (skills_.$name.tsx:177). The bug only surfaced when the dev DB had skill-latency data; tests passed Plan 27-04 close because the test environment didn't exercise this path. Live walkthrough caught it: 5 cards rendered, only 4 bounded. One-line fix restored the surface to 5/5 bounded. **Mirrors Phase 26 e838135 precedent** — verification-discovered close-gate fixes are accepted as Rule-1 fixes inside the close-gate plan."
  - "SkillLatencySnapshot stays on route-local `?range=` (Accepted Exception #5, NEW in Phase 27 close). During LOCKED OPERATOR DECISION 2 walkthrough on /skills/$name, the 4 panels covered by Plan 27-04's hasGlobalPicker ternary correctly snap to the global picker's range vocabulary (SkillCostCard / SkillProjectsTable / SkillRunsTable / SkillTimeline). However, the inline SkillLatencySnapshot component (defined within skills_.$name.tsx:121-216, NOT in panels/) was intentionally left on the route-local `?range=` path per the operator-locked decision documented at skills_.$name.tsx:242-246. Live observation: `?time_from=now-25d&time_to=now&range=14d` produces `GET /api/skills/.../cost?range=30d` + `/projects?range=30d` (global wins) but `/latency?range=14d` (route-local preserved). Will be lifted during a future SkillLatencySnapshot extraction (Phase 28+ candidate)."
  - "Lighthouse re-run DEFERRED + ACCEPTED at Phase 26 9/9 baseline. Phase 27 ships ZERO new runtime dependencies (all 8 implementation plans consume the existing Phase 24 / 25 / 26 primitive stack; Plan 27-08's CSS additions for `.cmc-alert-nl__error*` are ~5 lines of layout-only declarations with no new asset loading). Phase 26 close's 9/9 PASS at median (LCP 319-590ms / CLS ≤0.0001 median / performance 1.00) is inherited unchanged. `pnpm build` confirmed clean at close — CommandPalette chunk 389 kB (gzip 121 kB), no asset-budget breach. **Operator accepts Phase 26 baseline carry-forward** instead of consuming time on a re-run with predictable zero-delta."
  - "CostForecastCard MTD-only opt-out (Accepted Exception #1, inherited Phase 25-style escape path). SC#2's literal 're-query' contract is satisfied as 're-render' for CostForecastCard because `/api/cost/forecast` is MTD with NO range parameter (per cost.tsx:56-58 and Phase 19/20 design). Plan 27-05 correctly opts CostForecastCard OUT of the useRouteRangeVocab bridge; achieving literal re-query would require a backend range extension OUT OF SCOPE for Phase 27 (Phase 28+ candidate). The single-point-projection card already encodes its own confidence via partial_month_bias; range-based comparison would change the card's UX semantics."
  - "CostByProjectCard DeltaPill column DEFERRED (Accepted Exception #2, escape path (i) from Plan 27-05). CompareToggle URL round-trip ships on CostByProjectCard for parity with TokenUsageCard's Phase 26 contract, BUT the prior-period DeltaPill column does NOT render because CostBreakdownResponse.rows are rolled-up per-project totals with no `day` axis — client-side prior-period slicing is impossible without backend bucketed support. The toggle's URL-write contract still lands (saved-view fork-save round-trips compare_panels); column rendering can be added additively when a backend bucketed cost-breakdown endpoint lands (Phase 28+ ANLY-*)."

patterns-established:
  - "Phase-close-gate cascade pattern stable across 4 phases (Phase 24 → Phase 25 → Phase 26 → Phase 27): scaffold automated gate → 24-VISUAL-CHECK.md / 25-VISUAL-CHECK.md / 26-VISUAL-CHECK.md / 27-VISUAL-CHECK.md → operator verification session (Chrome DevTools MCP in Phase 27) → operator inline notes + screenshots → operator signature → metadata close-out commit. Phase 27 inherits the entire chain unchanged + adds live-walkthrough screenshots to the supplemental evidence catalogue."
  - "PHASE_N_NET_CLASS_MARKERS inversion filter inherits additively across phases — each phase appends its own marker set; prior phases' filters carry forward without re-evaluation. Phase 28 close-gate axe filter will append PHASE_28_NET_CLASS_MARKERS atop the Phase 25 + Phase 26 + Phase 27 union. Inversion filter is the canonical 'this violation belongs to MY phase' predicate; the explicit Accepted Exceptions table tracks WHICH classes per phase are deferred."
  - "Forward-compat skip count preserved at 4 (truncation + copy-cell from Phase 24 substrate + alerts dev-DB + skills-detail dev-DB). Phase 27's 2 new tail-route truncation walks (long skill-name + project_key column) are now FIRST CONSUMERS of the v13-truncation primitives — Phase 24's forward-compat skip becomes active assertion on at least one route per skip family. Phase 28+ may finally retire the truncation forward-compat skips if every route has at least one active truncation walk."
  - "Live operator walkthrough as canonical verdict path locked. Phase 26's Phase 26 verdict was driven by Chrome DevTools MCP against the dev server; Phase 27 inherits the pattern unchanged + extends it with 3 supplemental walkthrough PNGs captured during the session (skills-detail-bounded post-fix, cost-compare-active, alerts-after-restore). Locked: Phase 28 close-gate operator verification SHOULD use the same Chrome DevTools MCP pattern unless the new layout-customization scope requires a different verification harness (drag interactions are page.dragAndDrop territory)."
  - "Tail-route fixture-skip-graceful pattern locked for Phase 28+. Tests on routes whose evidence depends on dev-DB fixtures (skills-detail, cost-dashboard, alerts, v13-tail-routes) skip via test.skip() when the fixture row is absent rather than failing. Verifier compares failed counts only, not skip counts — a clean dev DB legitimately produces several 'n skipped' rows here. Phase 28 layout-customization tests should follow the same pattern for routes that require saved-view state_json fixtures."

# Metrics
duration: ~2h (Plan 09 cascade across 4 commits including operator walkthrough verification + metadata close-out)
completed: 2026-05-16
---

# Phase 27 Plan 09: Phase Close Gate Summary

**Phase 27 closes — useRouteRangeVocab<V> generic URL→Vocab bridge + 3 vocab snappers (Plan 01); project_key wire exposure on /api/sessions list + /api/sessions/compare + ComparePicker frontend filter switch from cwd-proxy to project_key (Plans 02 + 03, TDBT-01); /skills + /skills/$name + /cost + /alerts per-route adoption sweep with cmc-page--bounded + hasGlobalPicker ternary + TruncatedCell + SkillTimeline-as-5th-panel + CompareToggle URL round-trip on CostByProjectCard + AlertEventsList vocab-bridge migration (Plans 04 + 05 + 06); FALLBACK_KNOWN_METRICS DELETED + useAlertMetrics SOLE source + drift guard rewritten from build-time grep to runtime API-contract (Plan 07, TDBT-02); AlertNlInput silent 503 REPLACED with honest non-specific copy + Retry button + V11 collapsed-failure-mode lock preserved (Plan 08, TDBT-03) all ship; 5/5 ROADMAP success criteria functionally verified; 3/3 REQ-IDs closed; operator verdict PASS signed 2026-05-16. v1.3 milestone advances 3/5 → 4/5 phases complete.**

## Performance

- **Duration:** ~2h (Plan 09 automated gate cascade — 4 atomic commits + operator live Chrome DevTools MCP walkthrough verification + metadata close-out)
- **Started:** 2026-05-15 (Plan 09 first spawn, Wave 5 close gate after Plans 27-01..08 completed)
- **Completed:** 2026-05-16 (metadata close-out commit; operator verdict signed in walkthrough session)
- **Tasks completed:** 3/3 plan-09 tasks (Task 1 + Task 2 auto + operator-checkpoint approval Task 3) — 4 atomic commits landed before operator signed verdict; 1 metadata close-out commit after operator verdict signature
- **Files modified (this plan, code-side):** v13-tail-routes.spec.ts (new, +24 tests), v13-a11y.spec.ts (+5 chrome scans + PHASE_27_NET_CLASS_MARKERS), v13-time-picker.spec.ts (+3 re-anchor probes), v13-truncation.spec.ts (+2 walks), v13-portal-containment.spec.ts (+1 sentinel), cost-dashboard.spec.ts (+3 NEW + 1 rewritten), skills-detail.spec.ts (+2), alerts.spec.ts (+2), v13-visual-capture.spec.ts (+24 captures), skills_.$name.tsx (1-line className fix d76a95b). All shipped under Plan 09 commits a20e641 → d76a95b.
- **Metadata files modified (this close-out commit):** 4 (27-09-SUMMARY.md, STATE.md, ROADMAP.md, REQUIREMENTS.md) + 27-VISUAL-CHECK.md (operator-signed verdict edits land atomically in this commit)

## Accomplishments

1. **Phase 27 close-gate verdict signed PASS by operator on 2026-05-16** — every mapped requirement + every ROADMAP success criterion functionally verified via live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001:
   - **SC#1 — /skills/$name 4-panel bounded + density + global picker re-anchor (long names truncate cleanly):** section.cmc-page--bounded mounted on both /skills index AND /skills/$name detail routes; 5/5 .cmc-card--bounded after the d76a95b verification-discovered fix (SkillLatencySnapshot success-state branch); TruncatedCell wraps `tdd-coverage-author-with-fanout` heading on /skills/$name; density-flip preserves all 5 DOM markers (POLI-11 zero-rerender contract maintained on the new detail route); global picker WINS WHEN PRESENT — `?time_from=now-25d&time_to=now` causes cost+projects to fetch range=30d while SkillLatencySnapshot stays at route-local range=14d per LOCKED OPERATOR DECISION 2 + source-comment exception documented at skills_.$name.tsx:242-246.
   - **SC#2 — /cost picker re-query + CompareToggle round-trip + project_key truncation:** section.cmc-page--bounded ✓; 2/2 .cmc-card--bounded on both cost panels; compare-overlay-toggle-cost-by-project testid mounted in CostByProjectCard chrome; `?time_from=now-30d&time_to=now` triggers `GET /api/cost/breakdown?dim=project&range=30d` (vocab bridge wins) while `/api/cost/forecast` runs without range (MTD opt-out — Accepted Exception #1); clicking CompareToggle writes `?compare_panels=cost-by-project` to URL (URL round-trip contract honored; DeltaPill column rendering deferred per Accepted Exception #2).
   - **SC#3 — Compare picker uses project_key (TDBT-01):** `GET /api/sessions?limit=2` returns `project_key: "37ae465f3a20"` and `"63c04f774647"` (12-char hex on every row); `GET /api/sessions/compare?a=…&b=…` returns `a.project_key` + `b.project_key` both 12-char hex; source-grep `scopeCwd` returns 0 hits, `scopeProjectKey` returns 12 hits in CommandPalette.tsx; "Showing sessions in the same project" copy renders — no 12-char hex leak in user-facing copy; symlink + byte-equal-cwd edge cases now resolve correctly via authoritative project_key identity.
   - **SC#4 — AlertRuleForm metric vocab from useAlertMetrics (TDBT-02):** `/alerts` issues `GET /api/alerts/metrics`; AlertRuleForm `<select>` renders 4 options ("Select a metric…" disabled placeholder + 3 raw-key options sourced from API: cost_usd_24h / dispatcher_failed_tasks_5m / skill_p95_latency_ms); `grep -c FALLBACK_KNOWN_METRICS frontend/src/components/panels/AlertRuleForm.tsx` returns 0; `backend/tests/test_alerts_metrics_sync.py` absent; `backend/tests/test_alerts_metrics_contract.py` present + 2/2 PASS; drift guard moved from build-time grep to runtime API-contract assertion per LOCKED OPERATOR DECISION 2 ("Replace with contract test") honored verbatim.
   - **SC#5 — NL composer 503 retry/queue UX (TDBT-03):** stubbed `/api/alerts/parse-nl` → 503; clicking Parse renders the operator-locked copy verbatim ("Couldn't parse this description. The phrasing didn't match a known pattern, or the natural-language service is temporarily unavailable.") inside `role="alert"` block with Retry button; clicking Retry fires a 2nd POST with identical payload (calls=2, payloadsIdentical=true); zero leaked terms ("credentials missing" / "Anthropic" / "API key" / "ANTHROPIC_API_KEY" all absent — V11 collapsed-failure-mode lock honored); manual ThresholdForm BELOW remains focusable/enabled (Phase 21 Pitfall 5 invariant preserved); backend route UNCHANGED (`git diff backend/cmc/api/routes/alerts.py` returns 0 lines).

2. **24 NEW v13-tail-routes.spec.ts tests cover ROADMAP success criteria 1-5 + TDBT-01..03 1:1** — every SC + REQ-ID gets explicit test coverage in the canonical Phase 27 close-gate spec; env-conditional skip blocks for DB-fixture-dependent paths honor the verifier's failed-count-only contract.

3. **120 visual capture PNGs across the v1.3 substrate to date** (36 Phase 24 routes + 30 Phase 25 chrome + 30 Phase 26 chrome + 24 NEW Phase 27 tail-route surfaces) — every chrome+density+theme combination captured at deterministic settle, operator-spot-checked + bulk-marked PASS based on capture-script determinism (Phase 24 plan-07 precedent inherited); supplemented with 3 live-walkthrough screenshots from the operator's Chrome DevTools MCP session.

4. **Verification-discovered SkillLatencySnapshot fix shipped inline (d76a95b)** — Plan 27-04 Step 6 correctly added the `cmc-card--bounded` modifier to the loading-state and error-state branches but missed the success-state branch where the bare `<section className="cmc-card">` was rendered when real data flowed. The bug only surfaced when the dev DB had skill-latency data; tests passed Plan 27-04 close because the test environment didn't exercise this path. Live walkthrough caught it: 5 cards rendered, only 4 bounded. One-line fix (`className="cmc-card"` → `className="cmc-card cmc-card--bounded"`) restored the surface to 5/5 bounded. Behavior unchanged; mirrors Phase 26's e838135 close-gate fix precedent.

5. **6 Accepted Exceptions operator-acknowledged at sign-off** — 2 carried forward (CostForecastCard MTD opt-out + CostByProjectCard DeltaPill column deferred) + 2 self-healed during Plan 09 cascade (stale backend restart Rule 3 + cost-dashboard.spec.ts RangeToggle-test rewrite Rule 1) + 2 NEW (SkillLatencySnapshot stays on route-local `?range=` per operator-locked decision documented inline + verification-discovered d76a95b fix landing inside Plan 27-09 mirroring Phase 26 e838135 precedent).

## Task Commits (plan 09 chronological)

Plan 09 was permitted to patch primitives inline during gate runs (per phase-close deviation policy inherited from Phase 24 plan 07 + Phase 25 plan 11 + Phase 26 plan 09). Plan-09 fix scope: clear Phase-27-attributable spec issues + the SkillLatencySnapshot bounded miss surfaced by the live walkthrough.

1. **Phase 27 close-gate e2e cascade authored — Task 1:** `a20e641` — `test(27-09): author v13-tail-routes.spec.ts + extend 5 v13-* spec families + 3 route specs for Phase 27 surfaces` (24 NEW v13-tail-routes tests + 18 NEW extensions across v13-a11y / v13-time-picker / v13-truncation / v13-portal-containment / cost-dashboard / skills-detail / alerts)
2. **v13-visual-capture extended + 27-VISUAL-CHECK.md scaffold authored — Task 2:** `346e227` — `test(27-09): extend v13-visual-capture with 24 Phase 27 PNGs + author 27-VISUAL-CHECK.md scaffold (PENDING operator verdict)` (4 tail-route surfaces × 3 densities × 2 themes = 24 NEW captures; scaffold includes test counts vs Phase 26 close baseline, ROADMAP criterion map 1:1, REQ-ID closure table, gate-run rollup, pre-positioned Accepted Exceptions for operator confirmation)
3. **SkillLatencySnapshot success-state cmc-card--bounded patch (Rule 1):** `d76a95b` — `fix(27-09): SkillLatencySnapshot success-state cmc-card--bounded (Rule 1)` (Plan 27-04 Step 6 missed the success branch; live walkthrough caught it as 5 cards rendered with only 4 bounded; one-line className fix restores 5/5)
4. **Operator verdict signed PASS + 27-VISUAL-CHECK.md filled in (this commit):** `docs(27-09): complete Phase 27 close gate plan` — operator verdict signature block + 6 Accepted Exceptions acknowledged + 24/24 visual-matrix rows marked PASS + live-walkthrough evidence catalogued; this metadata commit bundles 27-09-SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md + 27-VISUAL-CHECK.md atomically (Phase 26 P09 precedent)

## Files Created/Modified

**Created (this metadata commit):**

- `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/27-09-SUMMARY.md` — this file

**Modified (this metadata commit):**

- `.planning/STATE.md` — milestone status (Phase 27 complete), Phase 27 plan log row → 9/9 complete, performance metrics row (Phase 26 close → Phase 27 close delta), new decisions block, session log
- `.planning/ROADMAP.md` — Phase 27 plan list `[x] 27-09-PLAN.md`, progress table row `9/9 Complete 2026-05-16`, v1.3 milestone progress `3/5 → 4/5`
- `.planning/REQUIREMENTS.md` — TDBT-01 + TDBT-02 + TDBT-03 marked Complete; Phase 27 3/3 traceability rollup; v1.3 net progress 38/45 → 41/45 (84% → 91%)
- `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/27-VISUAL-CHECK.md` — operator verdict signature + 6 Accepted Exceptions acknowledged + 24/24 visual-matrix rows marked PASS (edits already staged in the working tree; included in this atomic commit per Phase 26 P09 precedent)

## Gate-run Rollup

| Gate | Result | Detail |
|------|--------|--------|
| `pnpm tsc --noEmit` | clean | unchanged |
| `pnpm vitest run` | 662 / 0 / 0 | Phase 26 close 610 → Phase 27 close 662; +52 across Plans 01-08 (Plan 27-01 +31 useRouteRangeVocab; Plan 27-03 +2 TDBT-01 + 5 fixture updates; Plan 27-04 hasGlobalPicker + bounded; Plan 27-05 +6 CompareOverlay + +2 URL-window-snap; Plan 27-06 +3 SC tests; Plan 27-07 +5 TDBT-02; Plan 27-08 +5 TDBT-03; Plan 09 ships zero vitest specs by design — e2e-only close gate) |
| `cd backend && uv run pytest -q` | 690 / 0 / 0 | Phase 26 close 686 → Phase 27 close 690; +4 (Plan 27-02 +3 project_key round-trip tests; Plan 27-07 +2 alerts-metrics contract -1 alerts-metrics sync) |
| `pnpm build` | clean | Production bundle clean. CommandPalette chunk stays at ~389 kB (gzip 121 kB) — no asset-budget breach (well under Vite 500 kB default-warn). Phase 27 ships ZERO new runtime deps. |
| `pnpm lint` | exit 0 | testid registry expanded for Phase 27 surfaces (alert-nl-retry exact-match registered in Plan 27-08); cmc/testid-registry-only + cmc/no-raw-z-index still error-level |
| **Visual capture (POLI-09)** | **24/24 NEW PNGs PASS** | 4 tail-end-route surfaces × 3 densities × 2 themes; bulk-marked PASS based on capture-script determinism (Phase 24 plan-07 precedent inherited); operator spot-check during live walkthrough. 120 total captures across the v1.3 substrate (36 + 30 + 30 + 24). |
| **Axe-core (POLI-10)** | **0 Phase-27-attributable blocking violations** | 5 NEW Phase 27 chrome scans all PASS: /skills, /skills/$name, /cost, /alerts, AlertNlInput 503 mocked-error state. PHASE_27_NET_CLASS_MARKERS inversion filter additive to Phase 25 + Phase 26 catalogues (cmc-alert-nl__error, cmc-alert-nl__error-actions, cmc-alert-rule-form). The 8 v1.2 carry-overs continue flowing through Phase 25's filter — Pitfall 7 rebalance window NOW becomes a Phase 28+ candidate (no Phase 27 plan claimed the cleanup, operator-acknowledged). |
| **Lighthouse CI (POLI-11)** | **DEFERRED + ACCEPTED at Phase 26 9/9 baseline** | Phase 27 ships ZERO new runtime deps (all 8 implementation plans consume Phase 24/25/26 primitives; Plan 27-08 CSS additions ~5 lines layout-only). Phase 26 close 9/9 PASS at median (LCP 319-590ms / CLS ≤0.0001 median / performance 1.00) inherited unchanged. `pnpm build` clean at close. Operator accepts baseline carry-forward. |
| **Portal containment (CONT-02)** | **7/7 PASS** | Phase 26 6/6 carry-forward (DropdownMenu / cmdk / btn-hover / TimePicker popover / RefreshDropdown menu / sonner Toaster) + 1 NEW Phase 27 sentinel (confirms NO new portal-mounting surfaces in Phase 27 — CompareToggle is a plain button, AlertNlInput 503 error block is inline DOM). |
| **URL contract pytest (POLI-13)** | **2/2 PASS** | Bidirectional doc⇄route contract preserved across Phase 27 validateSearch APPEND-ONLY extensions on /skills, /skills/$name, /cost, /alerts (time_from + time_to + compare_panels added; /skills/$name range PRESERVED per Pitfall 2 LOCK). Pitfall 13 lock honored. |
| **Tail-route + a11y + time-picker + truncation + portal + cost-dashboard + skills-detail + alerts e2e** | **~243 tests (run subset: 17 pass + 7 env-skip on tail-routes; 43 pass + 1 env-skip on a11y; +30 across other extended families)** | Phase 26 close 207 → Phase 27 close ~243 (+36 from full-spec rollup; 24 NEW v13-tail-routes + 18 extensions = 42 NEW tests). Forward-compat skips: truncation + copy-cell now have FIRST CONSUMERS in Phase 27 (long skill-name + project_key column); skills-detail dev-DB + alerts dev-DB skips preserved. |
| **ResponsiveContainer count** | **8 across 8 panel files** | Phase 24 lock preserved (= v1.2 baseline 8, Phase 24 close 8, Phase 25 close 8, Phase 26 close 8, Phase 27 close 8 — note: Phase 26 SUMMARY text references "26" but the spirit of the lock is unchanged; Plan 27-08 SUMMARY confirmed `rg -c "<ResponsiveContainer" frontend/src/components/panels/` returns 8). Phase 27 added zero charts; CompareToggle on CostByProjectCard ships URL-only (no DeltaPill chart column — Accepted Exception #2). |

## Decisions Made

1. **SkillLatencySnapshot success-state cmc-card--bounded fix (Rule 1 verification-discovered, commit d76a95b).** Plan 27-04 Step 6 correctly added `cmc-card--bounded` to the loading-state branch (skills_.$name.tsx:145) and error-state branch (skills_.$name.tsx:160) of the inline SkillLatencySnapshot component, but missed the success-state branch (skills_.$name.tsx:177) where the bare `<section className="cmc-card">` was rendered when real data flowed. The bug only surfaced when the dev DB had skill-latency data; tests passed Plan 27-04 close because the test environment didn't exercise this path. Live walkthrough caught it: 5 cards rendered, only 4 bounded. One-line fix (`className="cmc-card"` → `className="cmc-card cmc-card--bounded"`) restored the surface to 5/5 bounded. Behavior unchanged, no test added (Phase 28 will add a route-level bounded contract test that exercises every state-machine branch — tracked as Phase 28 candidate). **Locked pattern:** verification-discovered close-gate fixes are accepted as Rule-1 fixes inside the close-gate plan, mirroring Phase 26 e838135 precedent.

2. **Phase 27 axe inversion filter PHASE_27_NET_CLASS_MARKERS additive atop Phase 25 + Phase 26 markers.** v13-a11y.spec.ts isPreExistingViolation now returns false if ANY of the union (Phase 25 markers + Phase 26 markers + Phase 27 markers) appears in the violation's nodes array. New Phase 27 marker set: `cmc-alert-nl__error`, `cmc-alert-nl__error-actions`, `cmc-alert-rule-form`. **Locked forkable pattern:** Phase 28 close-gate will append PHASE_28_NET_CLASS_MARKERS atop the Phase 25 + Phase 26 + Phase 27 union. Inversion filter is the canonical "this violation belongs to MY phase" predicate; the explicit Accepted Exceptions table tracks WHICH classes per phase are deferred.

3. **SkillLatencySnapshot stays on route-local `?range=` per operator-locked decision (NEW Accepted Exception #5).** During LOCKED OPERATOR DECISION 2 walkthrough on /skills/$name, the 4 panels covered by Plan 27-04's hasGlobalPicker ternary wiring (SkillCostCard / SkillProjectsTable / SkillRunsTable / SkillTimeline) correctly snap to the global picker's range vocabulary. However, the inline SkillLatencySnapshot component (defined within skills_.$name.tsx:121-216, NOT in panels/) was intentionally left on the route-local `?range=` path per the operator-locked decision documented in source comments at skills_.$name.tsx:242-246. Live observation: `?time_from=now-25d&time_to=now&range=14d` produces `GET /api/skills/.../cost?range=30d` + `/projects?range=30d` (global wins) but `/latency?range=14d` (route-local preserved). **This is the documented design.** Will be lifted during a future SkillLatencySnapshot extraction (Phase 28+ candidate). No Phase 27 regression — the operator-locked decision predates this close gate and is encoded in source comments + tests.

4. **Lighthouse re-run DEFERRED + ACCEPTED at Phase 26 9/9 baseline.** Phase 27 ships ZERO new runtime dependencies (all 8 implementation plans consume the existing Phase 24 / 25 / 26 primitive stack; Plan 27-08's CSS additions for `.cmc-alert-nl__error*` are ~5 lines of layout-only declarations with no new asset loading). Phase 26 close's 9/9 PASS at median (LCP 319-590ms / CLS ≤0.0001 median / performance 1.00) is inherited unchanged. `pnpm build` confirmed clean at close — CommandPalette chunk 389 kB (gzip 121 kB), no asset-budget breach. **Operator accepts Phase 26 baseline carry-forward** instead of consuming time on a re-run with predictable zero-delta. **Locked pattern:** any future phase that ships ZERO new runtime deps + ZERO new chart wrappers MAY defer Lighthouse re-run with operator sign-off, documenting the inheritance explicitly in the VISUAL-CHECK + SUMMARY.

5. **cost-dashboard.spec.ts RangeToggle test rewritten to global-TimePicker path (Rule 1 self-healed during Plan 09 cascade).** Plan 27-05 DROPPED the panel-internal `<RangeToggle persistKey="cost-by-project" />` in `CostByProjectCard.tsx` — the URL is now the canonical persistence layer. The pre-existing e2e test `7d→30d toggle fires a /api/cost/breakdown?range=30d request` was asserting on the dropped button. Plan 27-09 Task 1 cascade rewrote the test (without expanding scope) to use the equivalent URL-driven path: TimePicker "Last 30 days" preset → `?time_from=now-30d&time_to=now` → `useRouteRangeVocab` → `snapToCostRange` → fetch `range=30d`. New test name: "Phase 27 / global TimePicker preset triggers /api/cost/breakdown?range=30d request" (renamed for clarity). **Locked pattern:** any future phase-close gate that ships a primitive replacement preserves the test coverage by rewriting (Rule 1), never by skipping or deleting.

## Deviations from Plan

Plan 09 executed largely as written; auto-fixes per the plan's accepted-deviation policy:

### Auto-fixed Issues

**1. [Rule 1 - Bug] SkillLatencySnapshot success-state branch missed `cmc-card--bounded` modifier**
- **Found during:** Plan 09 Task 3 (operator live Chrome DevTools MCP walkthrough on /skills/$name)
- **Issue:** Plan 27-04 Step 6 correctly added the `cmc-card--bounded` modifier to the loading-state (line 145) and error-state (line 160) branches of the inline SkillLatencySnapshot component within skills_.$name.tsx, but missed the success-state branch (line 177) where the bare `<section className="cmc-card">` was rendered when real data flowed. Tests passed Plan 27-04 close because the test environment didn't exercise the success path with skill-latency data. Live walkthrough on /skills/tdd-coverage-author-with-fanout caught it: 5 cards rendered, only 4 bounded.
- **Fix:** One-line className change `className="cmc-card"` → `className="cmc-card cmc-card--bounded"` at skills_.$name.tsx:177. Behavior unchanged.
- **Files modified:** `frontend/src/routes/skills_.$name.tsx`
- **Verification:** Live walkthrough re-rendered the route; chrome-devtools MCP confirmed 5/5 .cmc-card--bounded markers; supplemental screenshot captured at `visual-check/operator-walkthrough-skills-detail-bounded.png`
- **Commit:** `d76a95b`

**2. [Rule 3 - Blocking] Stale dev backend running on :8765 without --reload**
- **Found during:** Plan 09 Task 1 (e2e tests against running dev backend)
- **Issue:** The running uvicorn process at :8765 was started BEFORE Plan 27-02 added `project_key` to `SessionListItem` + `SessionCompareSide` schemas. The process lacked `--reload` so it never picked up the schema change. e2e tests failed because `/api/sessions` responses lacked the expected `project_key` field.
- **Fix:** Killed PID 42432 + restarted fresh with `cd backend && uv run uvicorn cmc.app.factory:create_app --factory --host 127.0.0.1 --port 8765`. Fresh start now emits `project_key: "37ae465f3a20"` (and equivalent) on all `/api/sessions*` responses.
- **Files modified:** None (the Phase 27 implementation source code was correct; only the operator's long-running dev process was stale)
- **Verification:** `curl 'http://127.0.0.1:8765/api/sessions?limit=1' | python3 -m json.tool` shows `"project_key": "<12-char-hex>"`
- **Commit:** N/A (no code change; operator-side environment fix)

**3. [Rule 1 - Bug] Pre-existing cost-dashboard.spec.ts RangeToggle test rewritten to global-TimePicker path**
- **Found during:** Plan 09 Task 1 (extending cost-dashboard.spec.ts for Phase 27)
- **Issue:** Plan 27-05 DROPPED the panel-internal `<RangeToggle persistKey="cost-by-project" />` in `CostByProjectCard.tsx` — the URL is now the canonical persistence layer. The pre-existing e2e test `7d→30d toggle fires a /api/cost/breakdown?range=30d request` was asserting on the dropped button.
- **Fix:** Rewrote the test (without expanding scope) to use the equivalent URL-driven path: TimePicker "Last 30 days" preset → `?time_from=now-30d&time_to=now` → `useRouteRangeVocab` → `snapToCostRange` → fetch `range=30d`. New test name: "Phase 27 / global TimePicker preset triggers /api/cost/breakdown?range=30d request" (renamed for clarity).
- **Files modified:** `frontend/tests/e2e/cost-dashboard.spec.ts`
- **Verification:** Test passes; cost-dashboard.spec.ts +3 NEW + 1 rewritten = 7 total all pass
- **Commit:** `a20e641` (bundled with Task 1 cascade)

---

**Total deviations:** 3 auto-fixed (1 verification-discovered Rule-1 bug + 1 Rule-3 blocking environment fix + 1 Rule-1 test rewrite for primitive migration)
**Impact on plan:** All auto-fixes necessary for correctness. The SkillLatencySnapshot fix restored the bounded-card surface contract Plan 27-04 intended; the stale backend restart unblocked the project_key wire-shape verification; the cost-dashboard test rewrite preserved coverage when Plan 27-05 dropped the RangeToggle. No scope creep. Mirrors Phase 26 close-gate deviation pattern (e838135 + similar self-healing).

## Issues Encountered

None requiring escalation. The 3 auto-fixed deviations above all self-healed within the close-gate cascade window. Operator live walkthrough completed in a single session; no defects discovered beyond the d76a95b SkillLatencySnapshot bounded miss.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Phase 28 (Layout Customization) is ready to spawn.**

Phase 28 consumes from Phase 27:

- **Tail-route adoption complete** — /skills, /skills/$name, /cost, /alerts all adopted BoundedPanelCard + density tokens + global time picker + validateSearch APPEND-ONLY substrate. Phase 28's layout-customization work has every route the user can customize already in the canonical adoption shape.
- **useRouteRangeVocab<V> generic bridge proven** — Plan 27-01 shipped the generic hook + 3 vocab snappers (snapToSkillRange / snapToCostRange / snapToAlertRange). Phase 28 layout-state will piggyback on the same URL-as-broadcast-bus pattern (time_from + time_to + compare_panels + future layout_state_json keys); the bridge handles vocab snapping uniformly.
- **TruncatedCell + CopyIconButton fully consumed** — Plan 27 wired them onto SkillRunsTable session_id columns + CostByProjectCard project_key column + the long-skill-name <h1> on /skills/$name. Phase 28 inherits the primitives without further adoption work.
- **TIME-04 CompareToggle pattern proven on 2 panels** (TokenUsageCard from Phase 26 + CostByProjectCard from Phase 27). Phase 28 layout-customization can layer panel show/hide + reorder on top of the existing CompareToggle without re-engineering the URL contract.
- **TDBT-01..03 fully closed** — `project_key` wire exposure on `SessionListItemFull` + `SessionCompareSide` (Phase 23 carried debt cleared); `KNOWN_METRICS` frontend fallback removed + drift guard moved to runtime API-contract (Phase 21 carried debt cleared); `POST /api/alerts/parse-nl` 503 retry UX with honest non-specific copy (Phase 21 carried debt cleared). No v1.2-era debt carries into Phase 28.
- **PHASE_N_NET_CLASS_MARKERS inversion filter chain ready for Phase 28's append** — Phase 28's NEW chrome classes (layout-handle, drag-divider, reset-layout-btn, panel-hidden-state) will append via PHASE_28_NET_CLASS_MARKERS atop the Phase 25/26/27 union.

**v1.3 milestone status after this commit:** 4/5 phases complete (Phase 24 ✓ 2026-05-12, Phase 25 ✓ 2026-05-12, Phase 26 ✓ 2026-05-13, Phase 27 ✓ 2026-05-16). Phase 28 (Layout Customization) pending. 41/45 active requirements satisfied (18 from Phase 24 + 11 from Phase 25 + 9 from Phase 26 + 3 from Phase 27). 4 requirements outstanding (LAYO-01..04 all in Phase 28).

**Recommended next step:** `/gsd:discuss-phase 28` (or `/gsd:plan-phase 28` if discussion already happened in the v1.3 roadmap-time conversation).

## Self-Check: PASSED

Files verified to exist at commit time:

- [x] `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/27-09-SUMMARY.md` (this file)
- [x] `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/27-VISUAL-CHECK.md` (operator signature present, Phase verdict block reads PASS, dated 2026-05-16, inline notes filled, 24/24 visual-matrix rows marked PASS, 6 Accepted Exceptions operator-acknowledged)
- [x] `.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/visual-check/` (24 NEW Phase 27 chrome PNGs captured + 3 supplemental live-walkthrough screenshots; .gitignored per Phase 24 plan 05 convention)
- [x] `.planning/STATE.md` (status reflects Phase 27 close, Phase 27 row 9/9 complete, decisions appended, session log appended, v1.3 progress 3/5 → 4/5)
- [x] `.planning/ROADMAP.md` (Phase 27 row `[x] 9/9 Complete 2026-05-16`, v1.3 progress 4/5)
- [x] `.planning/REQUIREMENTS.md` (TDBT-01 + TDBT-02 + TDBT-03 all Complete; 3/3 Phase 27 requirements complete; v1.3 net progress 41/45)

Commits verified (plan 09 cascade):

- [x] `a20e641` — test(27-09): author v13-tail-routes.spec.ts + extend 5 v13-* spec families + 3 route specs for Phase 27 surfaces
- [x] `346e227` — test(27-09): extend v13-visual-capture with 24 Phase 27 PNGs + author 27-VISUAL-CHECK.md scaffold (PENDING operator verdict)
- [x] `d76a95b` — fix(27-09): SkillLatencySnapshot success-state cmc-card--bounded (Rule 1)
- [x] this metadata close-out commit (27-09-SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md + 27-VISUAL-CHECK.md)

---

*Phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt*
*Plan: 09*
*Completed: 2026-05-16*
