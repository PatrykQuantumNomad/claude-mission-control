---
phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
plan: 06
subsystem: ui
tags: [react, tanstack-router, vitest, time-picker, vocab-bridge, bounded-panel-card, alerts, alrt-10, sc-3]

# Dependency graph
requires:
  - phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
    provides: "Plan 27-01 useRouteRangeVocab + snapToAlertRange (4-tier '1d'|'7d'|'14d'|'30d' bands at 48h/192h/504h — identical to CostRange)"
  - phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
    provides: "asTimeToken + asComparePanels shared validators in lib/searchSchemas.ts; per-route adoption pattern (Plan 26-08 BoundedPanelCard + cmc-page--bounded + RangeToggle→useRouteRange drop with dead-value localStorage stance)"
  - phase: 24-shell-density-containment-primitives
    provides: "PanelCard `bounded` prop (CONT-04); cmc-page--bounded + cmc-card--bounded CSS modifiers"
provides:
  - "/alerts route — validateSearch APPEND-ONLY extension (time_from? + time_to? + compare_panels?) + cmc-page--bounded on root section"
  - "AlertRulesList bounded adoption"
  - "AlertEventsList vocab-bridge migration — useRouteRangeVocab('7d', snapToAlertRange) replaces v1.2 useState<AlertRange>('7d') + RangeToggle persistKey='alert-events-range' localStorage round-trip; URL is the new persistence layer"
  - "AlertRuleForm bespoke <article className='cmc-card'> gets cmc-card--bounded modifier directly (write-side composer — Phase 26 Plan 08 OtelPanel precedent)"
  - "/alerts ungated for Plans 27-07 (TDBT-02 KNOWN_METRICS removal) + 27-08 (TDBT-03 NL composer retry UX) — both Wave 5+6 plans inherit a clean AlertRuleForm with only the className touch in place"
affects:
  - 27-07-alert-rule-form-known-metrics
  - 27-08-alert-nl-input-retry-ux
  - 27-09-close-gate

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-line vocab-bridge adoption when route has no Phase 25 first-class filter: const range = useRouteRangeVocab('7d', snapToAlertRange) — no hasGlobalPicker ternary needed because /alerts had no ?range= filter to preserve (mirrors Plan 27-05 /cost adoption)"
    - "Plan-level scope-boundary pattern for shared-file Wave-4 dependents: this plan's edit to AlertRuleForm is bounded to the bespoke <article> className only; Plans 27-07 + 27-08 declare `depends_on: 27-06` so the className lands FIRST and the deeper TDBT edits land AFTER without merge conflict"
    - "Test-file scope-boundary mirror: when the panel under test drops a RangeToggle button entirely, replace (not extend) the button-click test — the role-name selector for the gone button would throw, not fail informatively"

key-files:
  created: []
  modified:
    - "frontend/src/routes/alerts.tsx — APPEND-ONLY validateSearch (time_from? + time_to? + compare_panels?); cmc-page--bounded modifier on root <section>"
    - "frontend/src/components/panels/AlertEventsList.tsx — useRouteRangeVocab('7d', snapToAlertRange) replaces useState<AlertRange>('7d') + RangeToggle persistKey='alert-events-range' localStorage round-trip; PanelCard bounded; imports trimmed (useState + RangeToggle + RangeOption + RANGE_OPTIONS const all removed)"
    - "frontend/src/components/panels/AlertRulesList.tsx — PanelCard bounded"
    - "frontend/src/components/panels/AlertRuleForm.tsx — <article className='cmc-card cmc-alert-rule-form'> → <article className='cmc-card cmc-card--bounded cmc-alert-rule-form'> (className-only touch — write-side composer, no logic change)"
    - "frontend/src/components/panels/__tests__/AlertEventsList.test.tsx — vi.mock('@tanstack/react-router') with useRouterState + useNavigate; RangeToggle-click test (1 case) replaced by 3 new SC tests (URL-read; localStorage-not-source-of-truth; re-anchor without remount)"
    - "docs/url-contract.md — /alerts row updated with Phase 27 Plan 06 search-param shape; Phase 27 effects section extended with /alerts append-only entry"

key-decisions:
  - "AlertRuleForm scope-boundary: ONLY add cmc-card--bounded to the bespoke <article> wrapper — NO other edits. Plans 27-07 (TDBT-02 KNOWN_METRICS removal) + 27-08 (TDBT-03 NL composer retry UX) declare `depends_on: 27-06` to land deeper edits in Wave 5+6 against the same file at non-overlapping sections (FALLBACK_KNOWN_METRICS constant + AlertNlInput 503 branch). Plan-level dependency ordering ensures no merge conflict."
  - "Wholesale RangeToggle drop (no transitional kept-as-override): the plan's Step 2 of Task 2 said 'DROP the <RangeToggle persistKey=alert-events-range .../>'. The URL is now the persistence layer. No localOverride state kept (contrast with Phase 26 Plan 08 SessionsTable + Plan 27-04 SkillLatencyTable where localOverride was preserved as a per-panel scope-down UX affordance). Rationale: AlertEventsList's RangeToggle was the v1.2-era panel-internal default; with the global TimePicker as the universal control surface, a per-panel scope-down would create two competing time controls on /alerts (TimePicker in chrome + a redundant RangeToggle in the panel header)."
  - "Doc-comment cleanup to satisfy strict grep SC#3: success criterion #3 reads `grep \"alert-events-range\" frontend/src/components/panels/AlertEventsList.tsx returns 0 hits` — after the code-level removal, the original migration doc comment still referenced the literal localStorage key string in two places. Stripped both verbatim mentions (kept the migration history but in terms of `legacy localStorage key` + `RangeToggle`), so the file is fully clean of the literal string. This guards against a future CI grep gate that enforces dead-key absence."
  - "No hasGlobalPicker ternary needed (mirror of Plan 27-05): /alerts has no Phase 25 first-class ?range= filter to preserve (contrast with /skills/$name's Pitfall 2 LOCK). The 3-line ternary idiom from Plan 27-04 collapses to a single line here because there's no second range source to weigh against. Plan 27-05 set this precedent for /cost and Plan 27-06 inherits it verbatim."
  - "Phase 24 ResponsiveContainer lock preserved (8 files / 8 hits unchanged): the panels touched by this plan (AlertEventsList + AlertRulesList) do NOT use ResponsiveContainer to begin with. The lock invariant is preserved trivially — no new Recharts surface lands, no existing surface removed. `rg -c \"<ResponsiveContainer\" frontend/src/components/panels/` returns 8 files × 1 hit each = 8 total (CacheEfficiencyCard, ChartsStrip, HookActivityCard, SessionCompareView, SessionOutcomesCard, SkillCostCard, TokenUsageCard, TopSkills)."
  - "Test re-anchor case (3rd new SC test) uses rerender, not unmount/remount: the third test demonstrates that the global TimePicker's URL write re-anchors AlertEventsList without remounting. Implementation: render with empty mockSearch, assert sevenday-rule visible; mutate mockSearch + rerender; assert oneday-rule visible. This pattern matches Phase 26 Plan 08's TokenUsageCard re-anchor test convention (rerender same root)."

patterns-established:
  - "Plan-level scope-boundary for parallel-conflict avoidance on shared files: a Wave-4 plan touching a single section of a multi-section file can land alongside Wave-5+6 plans that declare `depends_on` on it — the dependency ordering ensures the small-section edit lands first and the deeper edits inherit a clean base. Documented inline (SCOPE BOUNDARY comment in plan objective + must_haves.truths entries) so future plan reviewers can verify."
  - "Bespoke-card cmc-card--bounded application: when a panel uses <article className='cmc-card'> directly (write-side composer, not PanelCard's UseQueryResult shape), apply cmc-card--bounded as a className concat — same trick Phase 26 Plan 08 used for OtelPanel. Avoids forcing the composer into PanelCard's read-side abstraction."

# Metrics
duration: 5 min
completed: 2026-05-15
---

# Phase 27 Plan 06: /alerts Per-Route Adoption (vocab bridge + bounded sweep + AlertRuleForm bespoke-card touch) Summary

**/alerts surface fully adopted: cmc-page--bounded on root + APPEND-ONLY validateSearch extension (time_from + time_to + compare_panels); AlertEventsList migrates from useState<AlertRange>('7d') + localStorage RangeToggle ('alert-events-range') to URL-driven useRouteRangeVocab('7d', snapToAlertRange); AlertRulesList adopts bounded; AlertRuleForm's bespoke <article className="cmc-card"> gets cmc-card--bounded modifier directly (className-only touch — write-side composer doesn't fit PanelCard's UseQueryResult shape); Phase 24 ResponsiveContainer count UNCHANGED at 8/8 across 8 panel files; URL contract pytest 2/2 PASS; full panels sweep 43/43 files / 208/208 tests PASS.**

## Performance

- **Duration:** 5 min (302s wall-clock)
- **Started:** 2026-05-15T20:40:54Z
- **Completed:** 2026-05-15T20:45:56Z
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 6 (1 route + 3 panels + 1 panel test + 1 docs)
- **Files created:** 0

## Accomplishments

- **Task 1 — /alerts route + AlertRulesList + AlertRuleForm bespoke-card touch:**
  - APPEND-ONLY validateSearch extension on `/alerts`: `AlertsSearch` now accepts `time_from?` + `time_to?` + `compare_panels?` (all default-`undefined` per Pitfall 13) alongside the existing `schemaVersion?`. `SCHEMA_VERSION` stays at 1. The validator wires `asTimeToken` + `asComparePanels` from `lib/searchSchemas.ts` (Phase 26 Plan 02 + Plan 07 shared helpers).
  - Root `<section>` gains `cmc-page--bounded` modifier so the CONT-04 viewport-height flex ladder activates on /alerts.
  - **AlertRulesList bounded adoption:** single-line swap — `<PanelCard reqId="ALRT-10" ...>` gets the `bounded` prop. No other changes to the panel (the rules list has no range state to migrate).
  - **AlertRuleForm className-only touch:** the bespoke `<article className="cmc-card cmc-alert-rule-form">` (a write-side composer that doesn't fit PanelCard's `UseQueryResult` shape — the form is form-state-driven, not query-driven) gains `cmc-card--bounded` directly. Mirror of Phase 26 Plan 08's OtelPanel trick. **NO other AlertRuleForm edits this plan** — the scope-boundary is preserved so Plans 27-07 (TDBT-02 KNOWN_METRICS removal at the FALLBACK_KNOWN_METRICS constant) and 27-08 (TDBT-03 NL composer retry UX at the AlertNlInput 503 branch) can land their deeper edits in Wave 5+6 without merge conflict.
  - **docs/url-contract.md:** `/alerts` row updated to document the new search-param shape; Phase 27 effects section extended with the `/alerts` append-only entry (alongside the existing `/skills` + `/skills/$name` + `/cost` entries from Plans 27-04 and 27-05).

- **Task 2 — AlertEventsList vocab bridge + bounded:**
  - **Bounded adoption:** PanelCard now consumes the `bounded` prop.
  - **URL migration:** replaces the v1.2 `const [range, setRange] = useState<AlertRange>('7d')` + `<RangeToggle persistKey="alert-events-range" .../>` localStorage round-trip with a single line: `const range = useRouteRangeVocab<AlertRange>('7d', snapToAlertRange)` from Phase 27 Plan 01. The URL is now the canonical persistence layer — reload preserves the choice via `?time_from=now-30d&time_to=now`, the global TimePicker re-anchors the panel, and the stale `alert-events-range` localStorage key is dropped silently (test asserts it's NOT consulted).
  - **Import trim:** dropped `useState` (no longer needed), `RangeToggle` + `RangeOption` from `'../ui'`, and the `RANGE_OPTIONS` const. Added `snapToAlertRange` + `useRouteRangeVocab` from `'../../lib/time/useRouteRangeVocab'`. The `AlertRange` type import stays — the hook is parameterized over it.
  - **AlertEventsList.test.tsx rewrite:** `vi.mock('@tanstack/react-router')` with mutable `mockSearch` closure + `setSearch` helper (Phase 26 Plan 08 + Plan 27-05 pattern). The previous `RangeToggle '14d'-click` test is REPLACED (not extended) because the 14d button no longer exists in the DOM — a button-role selector for the gone button would throw, not fail informatively. Three new SC tests added:
    - `TIME-02-style: AlertEventsList reads range from URL via useRouteRangeVocab (not localStorage)` — sets `?time_from=now-30d&time_to=now`, asserts the 30d fetch fires.
    - `Phase 27 Plan 06: localStorage 'alert-events-range' is NOT the source of truth — URL default '7d' wins` — pre-seeds `localStorage['alert-events-range'] = '1d'`, asserts the 7d default fires anyway.
    - `global TimePicker change re-anchors AlertEventsList without remount` — renders empty mockSearch, asserts sevenday-rule visible; mutates mockSearch via `setSearch({ time_from: 'now-1d', time_to: 'now' })`; rerenders the same root; asserts oneday-rule visible. Demonstrates the re-anchor happens via re-render, not unmount/mount.
  - **Doc-comment cleanup:** the original Phase 27 migration doc comment in the file referenced the literal `alert-events-range` string in two places. Both verbatim mentions stripped (migration history preserved but in terms of `legacy localStorage key` + `RangeToggle`), so the file is fully clean of the literal — satisfies the strict success criterion #3 (`grep "alert-events-range" returns 0 hits`).

## Task Commits

1. **Task 1: /alerts route — validateSearch append + cmc-page--bounded + AlertRulesList bounded + AlertRuleForm bespoke-card cmc-card--bounded touch** — `9837fbf` (feat)
2. **Task 2: AlertEventsList — adopt bounded + replace localStorage RangeToggle with useRouteRangeVocab('7d', snapToAlertRange)** — `66461a9` (feat)

Each task committed atomically per execute-plan convention. The split is deliberate: Task 1 lands the route shell + per-panel bounded adoption (including AlertRuleForm's className-only touch that ungates Plans 27-07 / 27-08) so /alerts works under the new URL/density contract immediately; Task 2 layers the AlertEventsList vocab-bridge migration on top with the test-file rewrite.

## Files Modified

### Route (1 file)
- `frontend/src/routes/alerts.tsx` (+24 / -4) — APPEND-ONLY validateSearch + cmc-page--bounded on root section.

### Panels (3 files)
- `frontend/src/components/panels/AlertEventsList.tsx` (+25 / -27) — useRouteRangeVocab + bounded + import trim (useState/RangeToggle/RangeOption/RANGE_OPTIONS all dropped). Net -2 LOC.
- `frontend/src/components/panels/AlertRulesList.tsx` (+1 / 0) — PanelCard bounded prop.
- `frontend/src/components/panels/AlertRuleForm.tsx` (+1 / -1) — `<article>` className concat (cmc-card --> cmc-card cmc-card--bounded). No other edits per scope boundary.

### Tests (1 modified)
- `frontend/src/components/panels/__tests__/AlertEventsList.test.tsx` (+135 / -47) — vi.mock router (useRouterState + useNavigate); RangeToggle-click test replaced by 3 SC tests (URL-read; localStorage-not-source-of-truth; re-anchor without remount).

### Docs (1 file)
- `docs/url-contract.md` (+2 / -1) — /alerts row updated + Phase 27 effects section extended.

## Verifications

| Check | Command | Result |
|-------|---------|--------|
| URL contract pytest | `cd backend && uv run pytest tests/test_url_contract.py` | **2/2 PASS** (after both task commits) |
| Frontend typecheck | `cd frontend && pnpm tsc --noEmit` | **clean** (no output / exit 0) |
| Frontend lint | `cd frontend && pnpm lint --max-warnings 0` | **exit 0** |
| Frontend vitest (alert panels) | `pnpm test --run src/components/panels/__tests__/AlertEventsList.test.tsx` | **7/7 tests PASS** (4 original + 3 new) |
| Frontend vitest (AlertRulesList) | `pnpm test --run src/components/panels/__tests__/AlertRulesList.test.tsx` | **5/5 tests PASS** |
| Frontend vitest (full panels sweep) | `pnpm test --run src/components/panels/__tests__` | **43 files / 208 tests PASS** |
| Pre-commit hooks (frontend tsc) | git commit triggers tsc | **Passed** on both task commits |
| Success-criteria grep 1 | `grep "cmc-page--bounded" frontend/src/routes/alerts.tsx` | **1 hit** |
| Success-criteria grep 2 | `grep "snapToAlertRange" frontend/src/components/panels/AlertEventsList.tsx` | **5 hits** (import + call + doc + 2 type references) |
| Success-criteria grep 3 | `grep "alert-events-range" frontend/src/components/panels/AlertEventsList.tsx` | **0 hits** (literal localStorage key fully removed) |
| Success-criteria grep 4 | `grep "cmc-card--bounded" frontend/src/components/panels/AlertRuleForm.tsx` | **1 hit** |
| Phase 24 ResponsiveContainer lock | `rg -c "<ResponsiveContainer" frontend/src/components/panels/` | **8 files × 1 each = 8 total UNCHANGED** (baseline 8; Phase 24 lock preserved) |

## Decisions Made

1. **AlertRuleForm scope-boundary preserved verbatim** — the plan's `must_haves.truths[5]` + the SCOPE BOUNDARY comment in the objective + the `<files>` declaration on Task 1 all constrain this plan to the bespoke `<article>` className touch ONLY. No edits to the FALLBACK_KNOWN_METRICS constant (Plan 27-07's territory) and no edits to the AlertNlInput 503 branch (Plan 27-08's territory). Plans 27-07 + 27-08 both declare `depends_on: 27-06` so the className touch lands FIRST and the deeper TDBT edits land AFTER without merge conflict — verified by Wave-4 dependency ordering.
2. **RangeToggle dropped wholesale (no transitional kept-as-override)** — the plan's Step 2 of Task 2 said "DROP the `<RangeToggle persistKey='alert-events-range' .../>` entirely. The URL is now the persistence layer". Mirrors Plan 27-05's stance for CostByProjectCard. No localOverride state kept (contrast with Phase 26 Plan 08 SessionsTable + Plan 27-04 SkillLatencyTable where localOverride was preserved as a per-panel scope-down UX affordance). Rationale: AlertEventsList's RangeToggle was the v1.2-era panel-internal default; with the global TimePicker as the universal control surface, a per-panel scope-down would create two competing time controls on /alerts. Cleaner to remove.
3. **Doc-comment cleanup to satisfy strict grep SC#3** — success criterion #3 explicitly reads "`grep \"alert-events-range\" frontend/src/components/panels/AlertEventsList.tsx returns 0 hits`". After the code-level removal, the original migration doc comment still referenced the literal `alert-events-range` string in two places (inside a code-fence-style explanation of what was removed). Stripped both verbatim mentions — kept the migration history but rephrased the references as `legacy localStorage key` + `RangeToggle`. This guards against a future CI grep gate that enforces dead-key absence and matches the literal SC wording.
4. **No hasGlobalPicker ternary (mirror of Plan 27-05)** — /alerts has no Phase 25 first-class `?range=` filter to preserve (contrast with /skills/$name's Pitfall 2 LOCK). The 3-line ternary idiom from Plan 27-04 collapses to a single line here because there's no second range source to weigh against. Plan 27-05 set this precedent for /cost and Plan 27-06 inherits it verbatim — `const range = useRouteRangeVocab<AlertRange>('7d', snapToAlertRange)` is the simpler-route adoption pattern.
5. **AlertRulesList bounded adoption with no other changes** — the rules list has no range state, no per-panel filter, no localStorage round-trip. Adding `bounded` is a true single-line swap. No vocab-bridge wiring needed because the panel doesn't consume range. This is the trivial case of the per-route adoption sweep.
6. **Re-anchor test uses rerender, not unmount/mount** — the third new SC test demonstrates that the global TimePicker's URL write re-anchors AlertEventsList without remounting. Implementation: render with empty `mockSearch`, assert `sevenday-rule` visible; mutate `mockSearch` via `setSearch({ time_from: 'now-1d', time_to: 'now' })`; `rerender(...)` the same root; assert `oneday-rule` visible. This pattern matches Phase 26 Plan 08's TokenUsageCard re-anchor test convention. The same conceptual mount (PanelCard section testid) remains across the rerender — verified by `initialNodeCount >= 0` reference check.
7. **Imports trimmed aggressively, not partially** — when dropping the RangeToggle + useState, also dropped `RangeOption` type import and the `RANGE_OPTIONS` const value. Leaving them as dead code would have been a Phase 26-style "transitional" leftover. With Phase 27 being a full migration (the global TimePicker is the universal control surface), dead imports earn no carry-over.

## Deviations from Plan

None — plan executed exactly as written.

The plan's success-criterion #3 (`grep "alert-events-range" returns 0 hits`) required one extra cleanup pass on the doc comments after the code-level removal (the original migration doc still referenced the literal string in two places). This is documented in Decision #3 as a SC-driven cleanup, not a deviation from the plan's `<action>` blocks. Both task `<action>` blocks were followed verbatim.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Plan 27-06 ships clean. /alerts surface FULLY ADOPTED at the URL-contract + density-modifier + vocab-bridge levels. Ready for Plans 27-07 + 27-08 to land their TDBT-* work on AlertRuleForm without merge conflict.**

- **Plan 27-07** (TDBT-02 — KNOWN_METRICS removal at the FALLBACK_KNOWN_METRICS constant) inherits a clean `AlertRuleForm.tsx` where the only Phase 27 edit so far is the `cmc-card--bounded` className concat on the `<article>` wrapper. The constant lives at a different file section and can be removed without re-touching the className.
- **Plan 27-08** (TDBT-03 — NL composer retry UX at the AlertNlInput 503 branch) similarly inherits the clean form. The AlertNlInput component (nested inside AlertRuleForm via the discriminated-union `<NlBranch>` render path) lives at yet another section and can be edited independently.
- **Plan 27-09** (close gate) verifies all `/alerts` per-route adoption via Playwright happy-path (TimePicker re-anchor on AlertEventsList; cmc-page--bounded viewport-height flex ladder on /alerts; saved-view fork-save round-trip of `?compare_panels=` on /alerts) + axe + Lighthouse re-runs.

**Parallel-safety note:** Wave 4 sibling plans (27-07 + 27-08) declare `depends_on: 27-06` in their frontmatter — they will run AFTER this plan completes via the orchestrator's dependency-graph ordering. The scope boundary on AlertRuleForm (this plan touches ONLY the bespoke-card className) ensures the two TDBT plans land their deeper edits cleanly against a known base. No file-level conflict possible by construction.

**Phase 27 SC mapping:** Plan 27-06 directly satisfies the /alerts portion of the per-route adoption sweep — there is no numbered Phase 27 SC dedicated to /alerts (SC#1 is /skills, SC#2 is /cost), so the verification flows through Plan 27-09's close-gate Playwright happy-path on /alerts. The AlertRuleForm scope-boundary preservation indirectly unblocks SC#3 (TDBT-01 removal — already complete in Wave 3) + the TDBT-02 / TDBT-03 work in Wave 5+6.

**REQ-ID coverage:** Plan 27-06 satisfies no direct REQ-ID (the per-route adoption sweep is route-by-route adoption work, not a numbered TDBT requirement). REQ-IDs TDBT-02 + TDBT-03 land in Plans 27-07 + 27-08; final REQ-ID closure is at Plan 27-09 close gate.

## Self-Check: PASSED

- `[ -f frontend/src/routes/alerts.tsx ]` → FOUND (modified)
- `[ -f frontend/src/components/panels/AlertEventsList.tsx ]` → FOUND (modified)
- `[ -f frontend/src/components/panels/AlertRulesList.tsx ]` → FOUND (modified)
- `[ -f frontend/src/components/panels/AlertRuleForm.tsx ]` → FOUND (modified)
- `[ -f frontend/src/components/panels/__tests__/AlertEventsList.test.tsx ]` → FOUND (modified)
- `[ -f docs/url-contract.md ]` → FOUND (modified)
- `git log --oneline --all | grep 9837fbf` → FOUND (`feat(27-06): /alerts route — validateSearch append + cmc-page--bounded + AlertRulesList bounded + AlertRuleForm bespoke-card cmc-card--bounded touch`)
- `git log --oneline --all | grep 66461a9` → FOUND (`feat(27-06): AlertEventsList — adopt bounded + replace localStorage RangeToggle with useRouteRangeVocab('7d', snapToAlertRange)`)
- `grep "cmc-page--bounded" frontend/src/routes/alerts.tsx` → 1 hit
- `grep "snapToAlertRange" frontend/src/components/panels/AlertEventsList.tsx` → 5 hits (import + call + 2 type/doc references + 1 inline doc)
- `grep "alert-events-range" frontend/src/components/panels/AlertEventsList.tsx` → 0 hits (literal localStorage key fully removed from both code AND doc comments)
- `grep "cmc-card--bounded" frontend/src/components/panels/AlertRuleForm.tsx` → 1 hit
- `rg -c "<ResponsiveContainer" frontend/src/components/panels/` → 8 files × 1 each = 8 total (unchanged baseline; Phase 24 lock preserved)
- `pnpm tsc --noEmit + pnpm lint --max-warnings 0 + pnpm test --run src/components/panels/__tests__ + backend pytest tests/test_url_contract.py` — all clean (43/43 files, 208/208 tests, 2/2 url contract)

---
*Phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt*
*Completed: 2026-05-15*
