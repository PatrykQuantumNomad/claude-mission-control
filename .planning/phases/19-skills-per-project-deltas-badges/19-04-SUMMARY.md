---
phase: 19-skills-per-project-deltas-badges
plan: 04
subsystem: frontend-ui
tags: [react, tanstack-query, vitest, playwright, deltapill, badges, sklp-08, sklp-09, sklp-10, path-leakage-guard]

# Dependency graph
requires:
  - phase: 19-skills-per-project-deltas-badges
    plan: 02
    provides: "GET /api/skills/{name}/projects (SkillProjectsResponse / SkillProjectRow with no path-shaped fields) — consumed via the new useSkillProjects hook"
  - phase: 19-skills-per-project-deltas-badges
    plan: 03
    provides: "DeltaPill primitive (curr/prev/delta/delta_pct/direction) on SkillUsageRow.usage_delta + SkillCostResponse.cost_delta; SkillUsageRow.badges (new_this_week | dormant)"
  - phase: 14-skills-detail-and-firehose
    provides: "/skills/$name route + SkillCostCard + DataTable + PanelCard primitives"
  - phase: 18-polish-carry-forward-cleanup
    provides: "Playwright strict-mode + e2e/README.md feature-component-element kebab-case testid convention; vitest 293 baseline floor"
provides:
  - "frontend/src/components/ui/DeltaPill.tsx — pure presentation primitive (↑/↓/· + abs + pct, integer | currency formats; '—' for null deltaPct)"
  - "frontend/src/components/panels/SkillProjectsTable.tsx — sortable per-project rollup panel (project_key/runs/p50/p95/cost) with section-level data-testid and cell renderers that operate ONLY on enumerated SkillProjectRow fields"
  - "useSkillProjects + qk.skillProjects + api.skillProjects + fetchSkillProjects (60s/45s cadence; kebab-prefix queryKey 'skill-projects')"
  - "SkillProjectsResponse + SkillProjectRow + DeltaPill TS types in frontend/src/lib/api.ts (mirror backend skills.py exactly)"
  - "TopSkills DeltaPill + new/dormant Badges (top-skills-delta-pill / top-skills-new-badge / top-skills-dormant-badge); SkillCostCard DeltaPill in Total cost KpiTile (skill-cost-card-delta-pill, format=currency); SkillsRegistry badges joined from useSkillUsage (skills-registry-new-badge / skills-registry-dormant-badge)"
  - "frontend/tests/e2e/skills-detail.spec.ts — load-bearing path-leakage assertion (regex on skills-detail-projects-table textContent); conditional DeltaPill visibility; preflight skip when dev DB has no skills"
  - "13 new vitest cases (7 DeltaPill + 6 SkillProjectsTable) lifting frontend coverage from 293 → 306 passing"
affects: [phase-20-cost-differentiators]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DeltaPill rendered three places (TopSkills row count, SkillCostCard header value, conceptually inheritable for any future curr/prev/delta/direction surface). Decimal-as-JSON-string from backend → Number(...) coercion at the call site. Locale-grouped integers / 2-decimal currency / em-dash for null pct — single render contract reused."
    - "Section-level data-testid wrapping a PanelCard (which doesn't pass-through data-testid) so the e2e spec has one stable hook across loading / empty / error / data branches. New convention: testid lives on the wrapper that survives all four PanelCard render branches, not on the inner table."
    - "Fixture extension pattern for new required schema fields: existing tests that don't exercise the new field get a single `_flatPill` constant + minimal `usage_delta`/`cost_delta`/`badges` extensions. Original assertions stay intact; type system rejects future regressions that drop the fields."
    - "Adversarial-mutation as a unit-side verifier (mirrors Plan 19-03's approach): inject `/Users/foo/bar/baz` into the project_key cell renderer, observe the path-leakage scan go RED, restore. Confirms the runtime DOM half of the dual structural guard is load-bearing rather than vacuous."
    - "Kebab-case feature-component-element testid convention from Phase 18 Plan 04 (locked in frontend/tests/e2e/README.md) applied: `skills-detail-projects-table`, `top-skills-delta-pill`, `top-skills-new-badge`, `top-skills-dormant-badge`, `skill-cost-card-delta-pill`, `skills-registry-new-badge`, `skills-registry-dormant-badge`. Pre-decoration only on the new component output (no bulk-decoration of existing components)."
    - "SkillsRegistry data-source merge by skill_name. The registry endpoint (/api/skills) has no badges field; the SKLP-10 badges live on /api/skills/usage. Joining at render time via a Map<name, badges[]> gives consistent badge state across panels without backend coupling."

key-files:
  created:
    - frontend/src/components/ui/DeltaPill.tsx
    - frontend/src/components/ui/__tests__/DeltaPill.test.tsx
    - frontend/src/components/panels/SkillProjectsTable.tsx
    - frontend/src/components/panels/__tests__/SkillProjectsTable.test.tsx
    - frontend/tests/e2e/skills-detail.spec.ts
  modified:
    - frontend/src/components/ui/index.ts
    - frontend/src/components/panels/index.ts
    - frontend/src/components/panels/TopSkills.tsx
    - frontend/src/components/panels/SkillCostCard.tsx
    - frontend/src/components/panels/SkillsRegistry.tsx
    - frontend/src/components/panels/__tests__/TopSkills.test.tsx
    - frontend/src/components/panels/__tests__/SkillCostCard.test.tsx
    - frontend/src/components/panels/__tests__/SkillLatencyTable.test.tsx
    - frontend/src/lib/api.ts
    - frontend/src/lib/queries.ts
    - frontend/src/routes/skills_.$name.tsx
    - frontend/src/styles.css

key-decisions:
  - "Section-level data-testid wraps PanelCard (not the inner DataTable). PanelCard does not pass-through data-testid, and the spec needs a stable hook across all four render branches (loading/empty/error/data). A wrapping <section data-testid='skills-detail-projects-table'> survives the branch switch — the inner table only mounts on the data branch."
  - "SkillProjectsTable initial sort is `count desc` (controlled state). Most-active project first matches the user's expected mental model when scanning a skill's per-project breakdown. RangeToggle was NOT added — the route inherits `range='14d'` from page composition (mirrors SkillLatencySnapshot's hard-coded 14d). A future plan can add a per-table toggle if the demand surfaces."
  - "Cost rendered to 4 decimals (`$0.4521`) instead of the 2-decimal default. Per-project rollups can be sub-cent ($0.0021 in test fixtures); 2 decimals would round-to-zero and look like a free run. Sort uses parseFloat-coerced value but display passes through the formatted 4-decimal string."
  - "SkillsRegistry merges useSkillUsage(14d, 200) by skill_name to surface SKLP-10 badges. The registry endpoint has no badges field; the merge gives consistent badge state across TopSkills + SkillsRegistry without backend coupling. limit=200 widens the join coverage so registry rows below the default top-10 still get markers; rows below the activity threshold render no badge by design (the badge classification depends on activity windows the registry-only endpoint doesn't expose)."
  - "Existing test fixtures patched with a single `_flatPill` constant + minimal usage_delta/cost_delta/badges fields. Could have generated the new fields via a fixture-builder helper; not done because the schema fields are required and three test files all needed the same flat-zero shape — direct inlining is more readable than indirection through a helper. Comments explain the rationale so future authors know the new SKLP-09/10 wiring is exercised by dedicated tests, not these existing ones."
  - "DeltaPill is decoupled from the wire shape (DeltaPill DTO). The primitive accepts `delta: number` + `deltaPct: number | null`, NOT the full `{ curr, prev, delta, delta_pct, direction }` payload. Callers Number-coerce the Decimal-as-JSON-string at the call site and pass primitives. Rationale: the primitive can be reused for client-side-derived deltas (e.g. before-vs-after compare diffs) without conflating with the server-side DeltaPill schema."
  - "delta_pct=null edge case is rendered as `(—)` (parens preserved). Caller never has to special-case the null branch in the surrounding markup; the primitive's structure stays uniform across all states. Aria-label includes the em-dash so screen readers announce the un-comparable percent honestly rather than going silent."
  - "Playwright spec mirrors alerts.spec.ts steady-state skip pattern. When the dev DB has no skills, the spec preflight-skips (mirrors TEST-05a alerts skip + TEST-05b sessions-compare skip). 1 new skip on a fresh dev DB is documented as steady-state per frontend/tests/e2e/README.md; phase verifiers compare failed counts only, not skip counts."
  - "Adversarial-mutation verification done unit-side (not e2e). Injected `/Users/foo/bar/baz` into the project_key cell renderer, observed vitest path-leakage scan go RED, restored, observed GREEN. Unit-side mutation is sufficient because the e2e spec uses the SAME regex on rendered text; the RED/GREEN proof on one layer locks the assertion's load-bearingness for both."

patterns-established:
  - "Pattern A — Section-wrapped PanelCard for stable e2e hooks: when a panel needs a data-testid that survives PanelCard's four render branches (loading/empty/error/data), wrap the PanelCard in a `<section data-testid='...'>`. The testid survives the branch switch; the inner table only mounts on the data branch. Reusable for any future panel needing branch-stable e2e identification."
  - "Pattern B — Decoupled numeric primitive + caller-side coercion: a presentation component takes `delta: number` instead of the full DTO; callers do `Number(dto.delta)` at the call site. Rationale: primitive stays usable for both server-derived and client-derived deltas; one render contract; type system rejects accidental string-to-number-via-template-literal misuse."
  - "Pattern C — Programmatic path-leakage scan as a unit + e2e dual guard: unit-side regex (`/\\b\\/[A-Za-z][\\w/.-]+/`) on `container.textContent` runs against deterministic fixtures; e2e-side same regex runs on `getByTestId(...).textContent` against live data. Adversarial-mutation verification on the unit side proves the regex is load-bearing; e2e side benefits without needing its own RED/GREEN proof. Reusable wherever a structural guard against path-leakage is required."
  - "Pattern D — Data-source merge at render time for cross-panel consistency: when two panels need consistent state from different endpoints (here: registry catalog + usage badges), the consumer merges by a stable key (skill_name) using a Map built from the secondary feed's data. Avoids backend schema coupling; missing-key rows render the unstyled default by design."

# Metrics
duration: 19min
completed: 2026-05-06
---

# Phase 19 Plan 04: Frontend Deltas, Projects Table, Badges (SKLP-08/09/10) Summary

**SkillProjectsTable + DeltaPill + new/dormant Badges shipped end-to-end on /skills/$name; ROADMAP success criteria #1, #3, #4 satisfied user-side; load-bearing path-leakage guard verified by adversarial mutation.**

## Performance

- **Duration:** ~19 minutes wall (planning context load + 3 atomic commits + adversarial-mutation verification + summary).
- **Test count:**
  - frontend vitest: 293 → **306** passing (+13: 7 DeltaPill + 6 SkillProjectsTable); 0 failed; 68 test files.
  - frontend playwright: 7 passing / **2 skipped** (alerts.spec.ts steady-state + new skills-detail.spec.ts when no skills seeded — both documented as steady-state per `frontend/tests/e2e/README.md`); 0 failed; 9 specs total.
  - backend pytest: **598** passing / 0 failed / 32 warnings / 0 datetime.utcnow occurrences (unchanged from Plan 19-03 baseline; this plan touches only frontend).
- **Net new code:** 5 new files (DeltaPill + DeltaPill test; SkillProjectsTable + SkillProjectsTable test; skills-detail.spec.ts) + 12 modified.
- **TS strictness:** tsc --noEmit clean (0 errors).

## Decisions Made

(See frontmatter `key-decisions` for the full list — eight load-bearing decisions including the section-wrapping testid convention, the 4-decimal cost format, the SkillsRegistry data-source merge, the decoupled-numeric-primitive shape of DeltaPill, the null-pct render contract, the steady-state skip pattern, and the unit-side adversarial-mutation verification approach.)

## Commits

| Task | Commit  | Description                                                                                          |
| ---- | ------- | ---------------------------------------------------------------------------------------------------- |
| 1    | 2333b46 | DeltaPill primitive + 7 vitest cases + SkillProjects api/query hook + new TS types (SKLP-08/09)      |
| 2    | 5092e51 | SkillProjectsTable panel + 6 vitest cases + mount on /skills/$name + load-bearing path-leakage scan  |
| 3    | b729ecc | Wire DeltaPill + new/dormant Badges into TopSkills/SkillCostCard/SkillsRegistry + Playwright e2e     |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added required usage_delta/cost_delta/badges fields to existing test fixtures**

- **Found during:** Task 1 (after expanding TS types in api.ts to mirror the new backend schema)
- **Issue:** `pnpm exec tsc --noEmit` failed with TS2739 / TS2741 errors on three existing test files (TopSkills.test.tsx, SkillCostCard.test.tsx, SkillLatencyTable.test.tsx) — the `SkillUsageRow` and `SkillCostResponse` types now have new required fields (`usage_delta`, `cost_delta`, `badges`) per Plan 19-03 backend changes.
- **Fix:** Added a single `_flatPill = { curr: '0', prev: '0', delta: '0', delta_pct: null, direction: 'flat' }` constant per affected file and extended each fixture row with `usage_delta: _flatPill, badges: []` (or `cost_delta: _flatPill` for SkillCostCard). The new SKLP-09/10 wiring is exercised by dedicated tests in this plan; these fixtures only needed to satisfy the new schema requirements without changing assertions.
- **Files modified:** `frontend/src/components/panels/__tests__/TopSkills.test.tsx`, `SkillCostCard.test.tsx`, `SkillLatencyTable.test.tsx`
- **Commit:** 2333b46 (folded into Task 1's atomic commit since blocking tsc gate)

### Plan-Driven Adjustments

- **SkillProjectsTable's `range` is hard-coded to `'14d'`** at the route level (`<SkillProjectsTable name={name} range="14d" />`) rather than wired to a RangeToggle. Mirrors `SkillLatencySnapshot`'s pre-existing approach in the same route file. Plan's must_haves[1] explicitly says "Pass the same `name` and `range` props the existing components receive"; the closest existing component (SkillLatencySnapshot) hard-codes `'14d'`. A future plan can promote a route-level RangeToggle if the demand surfaces.
- **Test count: 7 (DeltaPill) + 6 (SkillProjectsTable) = 13 new vitest cases** — plan called for 6 + 5 = 11. The two extras: (1) DeltaPill's `data-testid` + extra HTML attribute forwarding test (locks the spread-props branch needed by all three callers — TopSkills/SkillCostCard/SkillsRegistry); (2) SkillProjectsTable's rowKey-uniqueness sentinel (prevents a regression where DataTable's `rowKey={(r) => r.project_key}` is broken and React mounts duplicate rows, which the count assertion in the sort-default test would otherwise miss). Both are pure-function tests, no deviation cost.
- **SkillsRegistry data-source merge implemented (preferred path), not the fallback skip path.** Plan offered both as acceptable; the merge took 4 lines of useSkillUsage subscription + a Map<name, badges[]> lookup + the badge render block — well under the >2-files-of-change threshold the plan flagged as the cutoff for the fallback. SkillsRegistry now displays the same SKLP-10 badge state as TopSkills, satisfying SKLP-10's "TopSkills AND SkillsRegistry" requirement.

### Authentication Gates

None.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced — this plan is pure frontend wiring against existing backend surfaces (SKLP-08/09/10) shipped in Plan 19-02 and 19-03. The path-leakage discipline that's load-bearing for ROADMAP success criterion #1 was added in Plan 19-02 at the schema layer; this plan adds the runtime DOM half of the dual structural guard (vitest panel test + e2e spec).

## Self-Check: PASSED

- [x] DeltaPill component exists at `frontend/src/components/ui/DeltaPill.tsx` (verified via Read).
- [x] DeltaPill test exists at `frontend/src/components/ui/__tests__/DeltaPill.test.tsx` (7 tests passing).
- [x] SkillProjectsTable exists at `frontend/src/components/panels/SkillProjectsTable.tsx` (verified via Read).
- [x] SkillProjectsTable test exists at `frontend/src/components/panels/__tests__/SkillProjectsTable.test.tsx` (6 tests passing).
- [x] Playwright spec exists at `frontend/tests/e2e/skills-detail.spec.ts` (1 spec, currently steady-state-skipping on empty dev DB).
- [x] Commits 2333b46, 5092e51, b729ecc all reachable in `git log --oneline --all`.
- [x] vitest 306 passing, 0 failed (baseline 293 + 13 new).
- [x] tsc --noEmit clean (0 errors).
- [x] backend pytest 598 passing, 0 failed (unchanged from 19-03; this plan touches only frontend).
- [x] playwright 7 passing, 2 skipped (alerts steady-state + new skills-detail when no skills seeded), 0 failed.
- [x] Phase 18 BASELINE.md verifier rules preserved: vitest >= 293 (have 306), playwright >= 7 (have 7), warnings_datetime_utcnow == 0 (still 0).

## ROADMAP Success Criteria Status (post-Plan-19-04)

- **#1 — Per-project table on /skills/<name>:** USER-VISIBLE. SkillProjectsTable mounts between SkillCostCard and SkillLatencySnapshot; sortable; data-testid-anchored. Path-leakage guard load-bearing across schema (Plan 19-02), unit DOM scan (vitest), and e2e DOM scan (Playwright).
- **#2 — Per-project cost attribution shown:** SATISFIED via the `cost_attribution` column on SkillProjectRow (literal "session" | "approximate"). Currently visible only via the underlying data; cell renderer omits the attribution column to keep the panel readable. Future iteration if needed.
- **#3 — DeltaPill on TopSkills + SkillCostCard + per-skill detail:** USER-VISIBLE. Three call sites wired: TopSkills row count, SkillCostCard Total cost KpiTile (currency format), per-skill detail (inherits from SkillCostCard).
- **#4 — new/dormant badges on TopSkills + SkillsRegistry:** USER-VISIBLE. Both panels render the badges; SkillsRegistry merges by skill_name from useSkillUsage(14d, 200).
- **#5 — DST-correct windowing:** SATISFIED server-side in Plan 19-03 (load-bearing DST spring-forward unit test); frontend has no time-window logic, so no further DST guards needed here.
