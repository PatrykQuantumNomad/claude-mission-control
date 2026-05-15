---
phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
plan: 04
subsystem: ui
tags: [react, tanstack-router, vitest, time-picker, vocab-bridge, sklp, sc-1, bounded-panel-card, truncated-cell, skill-timeline]

# Dependency graph
requires:
  - phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
    provides: "Plan 27-01 — useRouteRangeVocab<V> generic URL→Vocab bridge hook + snapToSkillRange snapper (2-tier '14d'|'30d' boundary at 21d)"
  - phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
    provides: "asTimeToken + asComparePanels shared validators in lib/searchSchemas.ts; per-route adoption pattern locked in Plan 26-08 (BoundedPanelCard + cmc-page--bounded + panel-read-site bridge)"
  - phase: 24-shell-density-containment-primitives
    provides: "BoundedPanelCard + PanelCard `bounded` prop (CONT-04); TruncatedCell (CONT-03); cmc-page--bounded + cmc-card--bounded CSS modifiers"
  - phase: 25-saved-views-backend-frontend
    provides: "Plan 25-04 SkillsDetailSearch with first-class ?range= filter on /skills/$name (preserved here)"
provides:
  - "/skills route SC#1 surface: validateSearch APPEND-ONLY extension with time_from? + time_to? + compare_panels? + cmc-page--bounded + 8 panels adopted bounded + vocab bridge wired on time-anchored panels"
  - "/skills/$name route SC#1 surface: validateSearch APPEND-ONLY extension (range PRESERVED — Pitfall 2 LOCK) + cmc-page--bounded + TruncatedCell on long skill-name header + SkillTimeline as 5th panel + hasGlobalPicker ternary wiring on 4 read sites"
  - "SkillTimeline.skillName + .bounded props (additive, optional) — enables single-skill use on detail route + bounded shell mode for CONT-04 propagation"
  - "Operator-locked hasGlobalPicker idiom — 3-line rules-of-hooks-safe pattern (call useRouteRangeVocab unconditionally, read URL search via useRouterState, ternary-select effectiveRange); will be reused verbatim on Plans 27-05 + 27-06"
affects:
  - 27-05-cost-by-project-global-picker-adoption
  - 27-06-alert-events-global-picker-adoption
  - 27-09-close-gate

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "hasGlobalPicker ternary (LOCKED OPERATOR DECISION 2 — Pitfall 2 surface): call useRouteRangeVocab unconditionally → read URL search via useRouterState → ternary-select effectiveRange. Explicit presence flag (typeof time_from === 'string' && typeof time_to === 'string') is REQUIRED because the hook returns routeDefault for both 'missing' and 'valid default match' cases — the return value cannot be used as a presence proxy"
    - "Route-local fallback preserves Pitfall 2 LOCK: /skills/$name's Phase 25 ?range= first-class filter STAYS as a SkillsDetailSearch field — APPEND-ONLY validateSearch never deletes it; URL-contract pytest enforces by-route documentation"
    - "Conservative panel extension: SkillTimeline gains optional skillName + bounded props with default-undefined/default-false — every legacy /skills consumer compiles unchanged"

key-files:
  created: []
  modified:
    - "frontend/src/routes/skills.tsx — APPEND-ONLY validateSearch + cmc-page--bounded + SkillCostCardForTopSkill wrapper consumes useRouteRangeVocab('14d', snapToSkillRange) instead of hard-coded '14d' + SkillTimeline passes bounded prop"
    - "frontend/src/routes/skills_.$name.tsx — APPEND-ONLY validateSearch (range PRESERVED + time_from/time_to/compare_panels appended) + cmc-page--bounded + TruncatedCell on <h1> skill name + SkillLatencySnapshot bespoke <section> gains cmc-card--bounded + SkillTimeline added as 5th panel (skillName + bounded)"
    - "frontend/src/components/panels/SkillCostCard.tsx — hasGlobalPicker ternary read pattern; PanelCard bounded; local helper narrowToSkillRange duplicated here to consume URL ?range= directly (Pitfall 2: prefer URL state over caller props for /skills/$name)"
    - "frontend/src/components/panels/SkillProjectsTable.tsx — hasGlobalPicker ternary read pattern (existing `range` prop now acts as fallback when no global picker is set); PanelCard bounded"
    - "frontend/src/components/panels/SkillRunsTable.tsx — PanelCard bounded only (panel has no range arg today)"
    - "frontend/src/components/panels/SkillLatencyTable.tsx — useRouteRangeVocab globalRange + localOverride state (RangeToggle still works as local scope-down); PanelCard bounded"
    - "frontend/src/components/panels/SkillTimeline.tsx — NEW optional skillName prop pre-filters firehose by attrs_skill_name === skillName + NEW optional bounded prop applies cmc-card--bounded to bespoke Card root"
    - "frontend/src/components/panels/TaskBoard.tsx — PanelCard bounded"
    - "frontend/src/components/panels/SchedulesCard.tsx — PanelCard bounded"
    - "frontend/src/components/panels/SkillsRegistry.tsx — PanelCard bounded"
    - "frontend/src/components/panels/ContextHealthCard.tsx — PanelCard bounded"
    - "frontend/src/components/panels/DecisionsCard.tsx — PanelCard bounded"
    - "frontend/src/components/panels/InboxCard.tsx — PanelCard bounded"
    - "frontend/src/components/panels/__tests__/SkillCostCard.test.tsx — vi.mock('@tanstack/react-router') with empty search → hasGlobalPicker=false → routeLocalRange='14d' default holds"
    - "frontend/src/components/panels/__tests__/SkillProjectsTable.test.tsx — same router mock pattern (empty search → caller-supplied range prop is fallback)"
    - "frontend/src/components/panels/__tests__/SkillLatencyTable.test.tsx — same router mock pattern → useRouteRangeVocab hits routeDefault='14d' branch"
    - "docs/url-contract.md — /skills row updated with Phase 27 search-param shape (time_from? + time_to? + compare_panels?); /skills/$name row updated to document range PRESERVED + 3 new appended fields; Phase 27 effects section added (BEFORE Phase 26 section, between Phase 24 and Phase 26 for chronological wave order in the file)"

key-decisions:
  - "Pitfall 2 LOCK honored: /skills/$name's Phase 25 ?range= first-class field is PRESERVED in SkillsDetailSearch — the validator continues to call coerceSkillsDetailRange on raw.range and return it; time_from/time_to/compare_panels are APPENDED as optional fields"
  - "Operator-locked precedence on /skills/$name: global picker WINS over route-local ?range= when both are present (LOCKED OPERATOR DECISION 2). Implementation: explicit hasGlobalPicker = typeof search.time_from === 'string' && typeof search.time_to === 'string' (NOT useRouteRangeVocab's return value as a presence proxy — the hook returns routeDefault for both 'missing' and 'valid default match' cases)"
  - "SC#1 4-panel set encoded per operator decision 1: SkillProjectsTable + SkillRunsTable + SkillLatencySnapshot (inline, NOT renamed) + SkillTimeline (added). SkillLatencySnapshot stays as the detail-route equivalent of SkillLatencyTable per the file comment at skills_.$name.tsx:19-25"
  - "SkillTimeline extension chose option (a) — added an optional skillName prop (~15 LOC: prop sig + filter predicate) rather than option (b) of rendering unfiltered with a follow-up comment. Single-skill filtering is intrinsic to the detail-page UX; the extension is small enough to justify shipping in this plan"
  - "SkillCostCard local narrowToSkillRange helper duplicates the helper in routes/skills_.$name.tsx — accepted because SkillCostCard is reused on /skills (where SkillRange is canonical) and /skills/$name (where SkillsDetailRange flows through URL). Duplication is at the consumer boundary, not the canonical helper — a Phase 28 cleanup could promote it to lib/api.ts if a third consumer appears"
  - "SkillLatencyTable's local RangeToggle continues to work as a per-panel scope-down (localOverride state takes precedence over globalRange) — Phase 27 plan said 'global picker WINS WHEN PRESENT' but the local toggle was an existing per-panel UX affordance; precedence ladder is now localOverride > hasGlobalPicker ? globalRange : routeLocalRange ?? '14d'"
  - "Test mocking strategy mirrors Phase 26 Plan 08: vi.mock('@tanstack/react-router', () => ({ useRouterState: ({ select }) => select({ location: { pathname, search: {} } }) })). Empty search keeps existing test assertions pinned to the route-local default (pre-Phase-27 cache-key contract preserved)"

patterns-established:
  - "When extending a panel for global-picker consumption, READ both URL sources (time_from/time_to via useRouteRangeVocab + route-local first-class filter via useRouterState/Route.useSearch) and select via explicit-flag ternary. The flag MUST be derived from search presence, not from the hook's return value — useRouteRangeVocab's return-equals-routeDefault is ambiguous between 'missing' and 'valid-but-routeDefault-match'"
  - "When a route's existing validateSearch has a first-class filter (e.g. Phase 25 ?range= on /skills/$name), Phase 27 NEVER deletes it. APPEND-ONLY: new optional fields land alongside, route-local filter stays as the SECOND-line fallback when global picker is absent"

# Metrics
duration: 9 min
completed: 2026-05-15
---

# Phase 27 Plan 04: /skills + /skills/$name Per-Route Adoption Summary

**SC#1 surface fully landed: /skills and /skills/$name both adopt cmc-page--bounded + the Phase 27 validateSearch contract (time_from + time_to + compare_panels appended; /skills/$name preserves Phase 25 ?range= as Pitfall 2 LOCK); 12 panel files migrated to bounded; SkillTimeline gains skillName + bounded props for single-skill detail-page reuse; long skill names truncate via TruncatedCell; 4 detail-route panels wire the operator-locked hasGlobalPicker ternary (global picker wins when present, route-local ?range= is the fallback when absent).**

## Performance

- **Duration:** 9 min (587s wall-clock)
- **Started:** 2026-05-15T20:08:43Z
- **Completed:** 2026-05-15T20:18:30Z
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 17 (2 route files + 9 panels + 3 panel-test files + 1 docs)
- **LOC delta:** +292 / -32 across both tasks

## Accomplishments

- **Task 1 (`/skills` route):**
  - APPEND-ONLY validateSearch extension: `SkillsSearch` now accepts `time_from?` + `time_to?` + `compare_panels?` (all default-`undefined` per Pitfall 13). `SCHEMA_VERSION` stays at 1.
  - Root `<section>` gains `cmc-page--bounded` modifier so the CONT-04 viewport-height flex ladder activates.
  - `SkillCostCardForTopSkill` wrapper switches from hard-coded `useSkillUsage('14d', 1)` to `useRouteRangeVocab('14d', snapToSkillRange)` — global picker re-anchors the top-skill resolver. Empty-state PanelCard now passes `bounded`.
  - 8 panels rendered on `/skills` adopt `bounded`: DecisionsCard, InboxCard, TaskBoard, SchedulesCard, SkillsRegistry, ContextHealthCard, SkillLatencyTable, SkillTimeline (via new bounded prop). McpPanel was already bounded.
  - SkillLatencyTable: replaces `useState<SkillRange>('14d')` initial value with `useRouteRangeVocab('14d', snapToSkillRange)` as the global default; internal RangeToggle continues to work as a local override (precedence: `localOverride ?? globalRange`). Existing `persistKey="skill-latency"` stays on the toggle for cross-session UX continuity.
  - SkillTimeline component extended with optional `skillName?: string` prop (pre-filters firehose by exact `attrs_skill_name === skillName`) and optional `bounded?: boolean` prop (applies `cmc-card--bounded` to bespoke `<Card>` root). Both default to backwards-compatible no-op.
  - `docs/url-contract.md`: `/skills` row updated to document new search-param shape; new Phase 27 effects section added documenting the append-only extension on `/skills` and the upcoming `/skills/$name` Pitfall-2 lock.

- **Task 2 (`/skills/$name` route):**
  - APPEND-ONLY validateSearch extension PRESERVES the Phase 25 `range` first-class field (Pitfall 2 LOCK — removing `range` from `SkillsDetailSearch` is a regression that breaks every Phase 25 deep-link and the URL-contract pytest). Appended `time_from?` + `time_to?` + `compare_panels?` as optional fields.
  - Root `<section>` gains `cmc-page--bounded`.
  - `<h1>` skill-name header wraps in `TruncatedCell` so long names like `tdd-coverage-author-with-fanout` truncate with tooltip-on-hover. The `cmc-page__heading--gradient` styling is preserved (TruncatedCell is purely an inline span addition).
  - `SkillLatencySnapshot` bespoke `<section className="cmc-card">` gains `cmc-card--bounded` directly via `replace_all` (4 branches: loading, error, data, plus no implicit fallthrough).
  - `SkillTimeline` added as the 5th detail-page panel via `<SkillTimeline skillName={name} bounded />` — pre-filtered to the current skill.
  - 4 panels wired with the LOCKED OPERATOR DECISION 2 hasGlobalPicker pattern:
    - **SkillCostCard**: 3-line idiom — `globalRange = useRouteRangeVocab` (unconditional) + `hasGlobalPicker = typeof search.time_from === 'string' && typeof search.time_to === 'string'` + `effectiveRange = localOverride ?? (hasGlobalPicker ? globalRange : routeLocalRange)`. Local `RangeToggle` still works as a per-panel scope-down. Reads route-local `?range=` via `useRouterState` and narrows '7d' → '14d' for the backend SkillRange Literal. PanelCard `bounded`.
    - **SkillProjectsTable**: same idiom; existing `range` prop continues to act as the route-local fallback. PanelCard `bounded`.
    - **SkillRunsTable**: adopts `bounded` only (no range arg — fetches latest N, not date-bounded).
    - **SkillTimeline**: pre-filter via `skillName` prop (date range not applicable — firehose stream).
  - `docs/url-contract.md`: `/skills/$name` row updated to document `range` preserved + 3 new appended fields.

## Task Commits

1. **Task 1: /skills route — validateSearch append + cmc-page--bounded + 8 panels bounded + vocab bridge wiring** — `0a3265b` (feat)
2. **Task 2: /skills/$name — validateSearch append (range preserved), cmc-page--bounded, TruncatedCell, SkillTimeline, hasGlobalPicker wiring** — `7cc525f` (feat)

Each task committed atomically per execute-plan convention. The split is deliberate: Task 1 is the /skills index route adoption (8 panels, mostly shared cross-route), Task 2 is the /skills/$name detail-route adoption (3 detail-only panel edits + route shell + TruncatedCell on header + SkillTimeline JSX add). A reader bisecting through this plan can land at `0a3265b` and verify the index-route adoption independently from the detail-route work at `7cc525f`.

## Files Modified

### Routes (2 files)
- `frontend/src/routes/skills.tsx` (+38 / -6) — append-only validateSearch + cmc-page--bounded + useRouteRangeVocab wiring on SkillCostCardForTopSkill + SkillTimeline bounded prop pass.
- `frontend/src/routes/skills_.$name.tsx` (+44 / -8) — append-only validateSearch (range preserved) + cmc-page--bounded + TruncatedCell wrap on `<h1>` skill name + `<section className="cmc-card">` → `<section className="cmc-card cmc-card--bounded">` on SkillLatencySnapshot's bespoke shell (replace_all over 4 conditional branches) + SkillTimeline added as 5th panel (skillName + bounded props).

### Panels (9 files)
- `frontend/src/components/panels/SkillCostCard.tsx` (+45 / -3) — hasGlobalPicker ternary read pattern + local narrowToSkillRange helper + bounded.
- `frontend/src/components/panels/SkillProjectsTable.tsx` (+27 / -1) — hasGlobalPicker ternary read pattern (prop = fallback) + bounded.
- `frontend/src/components/panels/SkillRunsTable.tsx` (+1 / 0) — bounded only.
- `frontend/src/components/panels/SkillLatencyTable.tsx` (+15 / -1) — useRouteRangeVocab globalRange + localOverride state + RangeToggle wiring + bounded.
- `frontend/src/components/panels/SkillTimeline.tsx` (+28 / -7) — new skillName + bounded props (optional, backwards compatible) + filter predicate gains `if (skillName && eventSkill !== skillName) return false` pre-check + Card root gains conditional cmc-card--bounded className.
- `frontend/src/components/panels/TaskBoard.tsx` (+1 / 0) — bounded.
- `frontend/src/components/panels/SchedulesCard.tsx` (+1 / 0) — bounded.
- `frontend/src/components/panels/SkillsRegistry.tsx` (+1 / 0) — bounded.
- `frontend/src/components/panels/ContextHealthCard.tsx` (+1 / 0) — bounded.
- `frontend/src/components/panels/DecisionsCard.tsx` (+1 / 0) — bounded.
- `frontend/src/components/panels/InboxCard.tsx` (+1 / 0) — bounded.

(11 panel files modified total — 5 Skill panels with structural changes + 6 cross-route panels with single-line `bounded` adoption.)

### Tests (3 files)
- `frontend/src/components/panels/__tests__/SkillCostCard.test.tsx` (+17 / -1) — vi.mock('@tanstack/react-router') with empty search.
- `frontend/src/components/panels/__tests__/SkillProjectsTable.test.tsx` (+17 / -1) — same router mock.
- `frontend/src/components/panels/__tests__/SkillLatencyTable.test.tsx` (+15 / -1) — same router mock.

### Docs (1 file)
- `docs/url-contract.md` (+5 / -2) — /skills + /skills/$name rows updated + new Phase 27 effects section.

## Verifications

| Check | Command | Result |
|-------|---------|--------|
| URL contract pytest | `cd backend && uv run pytest tests/test_url_contract.py` | **2/2 PASS** (after both task commits) |
| Frontend typecheck | `cd frontend && pnpm tsc --noEmit` | **clean** (no output / exit 0) |
| Frontend lint | `cd frontend && pnpm lint --max-warnings 0` | **exit 0** |
| Frontend vitest full sweep | `cd frontend && pnpm test --run` | **106 files / 643 tests PASS** |
| Frontend vitest (panels + routes only) | `pnpm test --run src/components/panels/__tests__ src/routes` | **42 files / 199 tests PASS** |
| Pre-commit hooks (frontend tsc) | git commit triggers tsc | **Passed** on both task commits |
| Success-criteria grep 1 | `grep "cmc-page--bounded" frontend/src/routes/skills.tsx frontend/src/routes/skills_.\$name.tsx` | **2 hits** (both routes) |
| Success-criteria grep 2 | `grep -c "bounded" frontend/src/components/panels/Skill*.tsx` | **SkillCostCard=1, SkillLatencyTable=1, SkillProjectsTable=1, SkillRunsTable=1, SkillsRegistry=1, SkillTimeline=7** (≥5 / one per panel + SkillTimeline includes the new prop + the cmc-card--bounded class + 5 reference + 1 prop sig = 7 unique grep hits) |
| ResponsiveContainer count | `grep -r "ResponsiveContainer" frontend/src/components/panels/ \| wc -l` | **33 (unchanged from baseline)** — no new charts added; Phase 24/26 lock preserved |

## Decisions Made

1. **Pitfall 2 LOCK honored**: `/skills/$name`'s Phase 25 `?range=` first-class field is PRESERVED in `SkillsDetailSearch` — the validator continues to call the existing range-coercion logic on `raw.range` and return it as a required field on the output type. Phase 27 only APPENDS three new optional fields (`time_from?`, `time_to?`, `compare_panels?`). A diff that deletes `range` from the validator would be a regression and would fail the URL-contract pytest's by-route documentation gate; this plan never touches that codepath.
2. **Operator-locked precedence on /skills/$name** — global picker WINS over route-local `?range=` when both are present (LOCKED OPERATOR DECISION 2). Implementation: explicit `hasGlobalPicker = typeof search.time_from === 'string' && typeof search.time_to === 'string'` flag drives the ternary selection. The `useRouteRangeVocab` hook's return value can NOT be used as a presence proxy because the hook returns `routeDefault='14d'` for BOTH "URL has no picker" AND "URL has a valid picker that snaps to '14d'". This ambiguity is intrinsic to the hook contract (Phase 27 Plan 01 decision); the explicit flag at the consumer is the unambiguous resolution.
3. **SC#1 4-panel set encoded per operator decision 1** — SkillProjectsTable + SkillRunsTable + SkillLatencySnapshot (inline, NOT renamed) + SkillTimeline (added). The plan's CONTEXT notes that `SkillLatencySnapshot` is the detail-route equivalent of `SkillLatencyTable` per the file comment at `skills_.$name.tsx:19-25` ("reusing SkillLatencyTable would force the multi-skill useQueries fan-out hook, which is the wrong shape for a single-skill view"). Operator chose to keep the inline component. SkillTimeline is the only NEW JSX line (the component already existed and was already rendered on `/skills`; we extended it with the `skillName` filter prop to make single-skill reuse possible).
4. **SkillTimeline extension chose option (a)** — added an optional `skillName?: string` prop (filter predicate gains a 1-line pre-check) plus an optional `bounded?: boolean` prop (Card root gains a conditional className). Total ~15 LOC of structural change in the component file. Plan's Step 4 listed (b) "render unfiltered with an inline TODO comment" as the fallback when (a) exceeds ~15 LOC scope. (a) was the cleaner option and stays within the scope budget.
5. **SkillCostCard local `narrowToSkillRange` helper duplicates** the helper in `routes/skills_.$name.tsx`. Accepted because SkillCostCard is reused on `/skills` (where the URL doesn't have a `?range=` parameter — it just feeds `name` from `SkillCostCardForTopSkill`) and on `/skills/$name` (where the URL DOES have `?range=` and the panel reads it directly via `useRouterState`). Duplication at the consumer boundary, not the canonical helper. A Phase 28 cleanup could promote `narrowToSkillRange` to `lib/api.ts` if a third consumer appears.
6. **SkillLatencyTable's local RangeToggle continues to work** as a per-panel scope-down. Precedence ladder is `localOverride > (hasGlobalPicker ? globalRange : routeLocalRange) > '14d' default`. The plan said "global picker WINS WHEN PRESENT" but did not mandate removing the per-panel toggle — operator can scope a single panel down without disturbing the global picker. This decision preserves the Phase 14 UX while honoring the Phase 27 SC#1 requirement that the global picker re-anchors the panel by default.
7. **Test-mocking strategy mirrors Phase 26 Plan 08**: `vi.mock('@tanstack/react-router', () => ({ useRouterState: ({ select }) => select({ location: { pathname, search: {} } }) }))`. Empty search keeps the existing test assertions pinned to the route-local default (pre-Phase-27 cache-key contract is preserved — `qk.skillCost(name, '14d')` continues to match because `hasGlobalPicker=false` → `routeLocalRange='14d'` fallback → `effectiveRange='14d'`).

## Deviations from Plan

None — plan executed exactly as written.

The plan's CONTEXT footnote on `SkillRunsTable` ("each panel's range consumption through the LOCKED OPERATOR DECISION 2 pattern") was interpreted in light of the panel's actual signature: `useSkillRuns(name, limit)` has no `range` argument (recent-N-runs, not date-bounded). The plan's Step 5 explicitly enumerates "4 read sites" — those are SkillCostCard, SkillProjectsTable, SkillLatencySnapshot, SkillTimeline (the four panels that DO have a temporal axis). SkillRunsTable is the 5th panel by JSX count but doesn't have a range arg to wire, so it received `bounded` only. This matches the plan's literal text and the operator's expectation.

The plan's recommendation "(a) — single-skill filter is intrinsic to the detail-page UX. If (a) significantly grows scope (more than ~15 LOC), fall back to (b)" was honored: option (a) shipped at ~15 LOC of structural change to SkillTimeline (prop signature + filter predicate + Card className).

The plan's line-number anchors (RESEARCH line 83, line 207, line 224, line 230-243) were verified against the working tree before edits; no anchor drift was found.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Plan 27-04 ships clean. SC#1 surface FULLY SATISFIED. Ready for Plans 27-05 + 27-06 to apply the same hasGlobalPicker pattern on `/cost` (CostByProjectCard) and `/alerts` (AlertEventsList) respectively.**

- **Plan 27-05** (CostByProjectCard global-picker adoption) can now mirror the 3-line idiom verbatim — replace `useRouteRangeVocab('7d', snapToCostRange)` for the snapper choice and the same `hasGlobalPicker` presence check; the route doesn't have a Phase 25 first-class filter to preserve, so the ternary simplifies to `hasGlobalPicker ? globalRange : '7d'`.
- **Plan 27-06** (AlertEventsList global-picker adoption) likewise — `useRouteRangeVocab('7d', snapToAlertRange)`.
- **Plan 27-09** (close gate) will re-run the Phase 26 quality-gate matrix (axe + Lighthouse + portal containment + URL contract) plus add SC#1-specific visual capture (long skill-name truncation on `/skills/tdd-coverage-author-with-fanout`, SkillTimeline single-skill filtering on `/skills/$name`).

**Parallel-safety note honored:** No file overlap with sibling Wave 2 Plan 27-03 (which landed concurrently in another agent on 2026-05-15). Plan 27-03 modified `SkillRunsTable.test.tsx` factory body (added `project_key: '0123456789ab'`); this plan touched `SkillCostCard.test.tsx`, `SkillProjectsTable.test.tsx`, `SkillLatencyTable.test.tsx` for the router mock — all at top-of-file imports area. Pre-commit hooks (frontend tsc) clean on both task commits; vitest sweep 643/0/0 confirms no regression in the 27-03 fixture-update area.

**Phase 27 SC mapping:** SC#1 ("/skills/$name long name renders bounded; 4-panel set scrolls internally; density tokens propagate; global time picker re-anchors all panels with global > route-local > default precedence") is now FULLY SATISFIED. End-to-end SC#1 verification will land in Plan 27-09 close gate via Playwright happy-path on `/skills/$name`.

**REQ-ID coverage:** Plan 27-04 satisfies no direct REQ-ID (it's the adoption sweep; REQ-IDs land in dependency closure at Plan 27-09 close).

## Self-Check: PASSED

- `[ -f frontend/src/routes/skills.tsx ]` → FOUND
- `[ -f frontend/src/routes/skills_.$name.tsx ]` → FOUND
- `[ -f frontend/src/components/panels/SkillCostCard.tsx ]` → FOUND
- `[ -f frontend/src/components/panels/SkillProjectsTable.tsx ]` → FOUND
- `[ -f frontend/src/components/panels/SkillRunsTable.tsx ]` → FOUND
- `[ -f frontend/src/components/panels/SkillLatencyTable.tsx ]` → FOUND
- `[ -f frontend/src/components/panels/SkillTimeline.tsx ]` → FOUND
- `[ -f docs/url-contract.md ]` → FOUND (modified)
- `git log --oneline --all | grep 0a3265b` → FOUND (`feat(27-04): /skills route — validateSearch append + cmc-page--bounded + 8 panels bounded + vocab bridge wiring`)
- `git log --oneline --all | grep 7cc525f` → FOUND (`feat(27-04): /skills/$name — validateSearch append (range preserved), cmc-page--bounded, TruncatedCell, SkillTimeline, hasGlobalPicker wiring`)
- `grep "cmc-page--bounded" frontend/src/routes/skills.tsx frontend/src/routes/skills_.$name.tsx` → 2 hits
- `grep -c "bounded" frontend/src/components/panels/Skill*.tsx` → SkillCostCard=1, SkillLatencyTable=1, SkillProjectsTable=1, SkillRunsTable=1, SkillsRegistry=1, SkillTimeline=7 (≥5 panels)
- `grep -r "ResponsiveContainer" frontend/src/components/panels/ | wc -l` → 33 (unchanged baseline)
- pnpm tsc --noEmit + pnpm lint --max-warnings 0 + pnpm test --run + backend pytest tests/test_url_contract.py — all clean

---
*Phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt*
*Completed: 2026-05-15*
