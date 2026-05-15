---
phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
plan: 03
subsystem: ui
tags: [react, tanstack-router, cmdk, vitest, project-key, tdbt-01, compare-picker]

# Dependency graph
requires:
  - phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
    provides: "Plan 27-02 — project_key: str on SessionListItem + SessionCompareSide wire payloads (additive required field on GET /api/sessions and GET /api/sessions/compare; 3 round-trip pytest cases lock the wire-shape promise)"
  - phase: 23-cost-attribution-and-compare-debt
    provides: "ComparePicker scaffolding (CMPR-07 D-11..D-13 cwd-as-proxy scoping)"
  - phase: 16-sessions-compare-foundation
    provides: "SessionCompareSide TS type + useSessionCompare hook + qk.sessionCompare cache key"
provides:
  - "SessionListItemFull.project_key: string (required) — frontend TS mirror of the Plan 27-02 wire field"
  - "SessionCompareSide.project_key: string (required) — frontend TS mirror of the Plan 27-02 wire field"
  - "ComparePicker filter switched from cwd-string-equality to project_key authoritative equality (closes SC#3 / TDBT-01 frontend half)"
  - "5 vitest fixture factories updated with the new required field — required-field TS contract preserved"
  - "2 new vitest cases lock the picker filter behavior under both symlink-collapse and byte-equal-cwd edge cases + assert the description copy never leaks the 12-char project_key hex"
affects:
  - 27-04-skills-route-global-picker-adoption
  - 27-09-close-gate

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Authoritative-identity vs proxy-equality — when a backend canonical id (sha1[:12] of realpath) lands on the wire, switch consumer filters from the proxy field (cwd string-equality) to the canonical id immediately; the proxy mis-classifies the symlink-collapsed and byte-equal-cwd edge cases"
    - "Load-bearing precedence at UI boundaries — filter switch on canonical id, display label preserved on human-readable proxy (row.cwd). Don't render canonical hash ids in user-facing copy; replace with shape-honest English ('the same project')"
    - "Cache-key coercion idiom — useSessionCompare(currentA, undefined) coerces b → '' in the queryKey (queries.ts:402 qk.sessionCompare(a ?? '', b ?? '')); pre-seed setQueryData(qk.sessionCompare(UUID_A, ''), …) to populate the picker's scope derivation without firing a real fetch"

key-files:
  created: []
  modified:
    - "frontend/src/lib/api.ts — SessionListItemFull.project_key + SessionCompareSide.project_key (additive required string fields with Phase 27 TDBT-01 doc blocks)"
    - "frontend/src/components/ui/CommandPalette.tsx — aCwd → aProjectKey derivation, ComparePicker prop scopeCwd → scopeProjectKey, filter row.cwd === scopeCwd → row.project_key === scopeProjectKey, description copy switched to 'Showing sessions in the same project.', row display label preserved as {row.cwd ?? '—'}"
    - "frontend/src/components/ui/__tests__/CommandPalette.test.tsx — makeSessionRow gains optional 3rd project_key arg (default '0123456789ab'); 2 new TDBT-01 tests + SessionCompareResponse/SessionCompareSide imports"
    - "frontend/src/components/panels/__tests__/SessionsTable.test.tsx — makeRow factory adds per-row sentinel project_key 'pk00000000NN'"
    - "frontend/src/components/panels/__tests__/SessionCompareView.test.tsx — makeSide factory adds project_key sentinel '0123456789ab'"
    - "frontend/src/components/panels/__tests__/SkillRunsTable.test.tsx — makeFullSession factory adds project_key sentinel '0123456789ab'"
    - "frontend/src/components/panels/__tests__/LiveSessionsCard.test.tsx — makeFullSession factory adds project_key sentinel '0123456789ab'"

key-decisions:
  - "Required string (NOT string | null) on the TS interface — mirrors the backend Plan 27-02 invariant: DB column is non-nullable with default='', migration 0003 backfilled all historical rows. Empty string is the 'no cwd recorded' sentinel; the FILTER treats empty as no-scope (Boolean(scopeProjectKey) gate)"
  - "Row display label preserved as {row.cwd ?? '—'} — the 12-char hex project_key is not human-readable; UX would regress if we surfaced the hash. The filter (machine-comparable) switched independently of the display (human-readable)"
  - "Description copy switched from 'Showing sessions from {scopeCwd} only.' to 'Showing sessions in the same project.' — project-shape-honest phrasing. Does not leak the canonical hash; matches the project_key identity semantics exactly. UX strictly improves: prior copy revealed a path the user did not necessarily want exposed in a UI label"
  - "Optional 3rd param on makeSessionRow (project_key = '0123456789ab' default) — the new tests need rows with DISTINCT project_keys, but legacy callers should compile unchanged. Default-value param is the surgical surface that satisfies both requirements without forcing every existing call site to opt in"
  - "Pre-seed compare cache via setQueryData(qk.sessionCompare(UUID_A, ''), fixture) — useSessionCompare(undefined-b) coerces b → '' in the cache key (queries.ts:402). Setting the slot directly lets the new tests exercise scope-active behavior without needing both a + b in the URL (which would change the palette item label to 'Pick a different session B' and complicate the test flow)"
  - "Two new tests, not one — separate the FILTER invariant (symlink + byte-equal cwd edge cases) from the COPY invariant (no hex leakage). Each test has one assertion target so a future regression in either dimension fails the right test name"

patterns-established:
  - "When a backend additive wire-shape field arrives via dependency plan, the consumer side runs the type-mirror + fixture-update step BEFORE any consumer-logic refactor, in one commit. tsc fails on the first commit (required field unsatisfied) without the fixture updates, so the test mock updates are not 'optional polish' — they're part of the type-shape gate"
  - "When switching a consumer filter from a proxy field (cwd) to a canonical identifier (project_key), keep the DISPLAY surface on the proxy and switch only the FILTER. Comment block at the prop definition cites both the new canonical filter source AND the edge cases the proxy got wrong — this is load-bearing for future readers"

# Metrics
duration: 7 min
completed: 2026-05-15
---

# Phase 27 Plan 03: ComparePicker frontend half — switch filter from cwd-proxy to project_key Summary

**Authoritative `project_key: string` mirrored on `SessionListItemFull` + `SessionCompareSide` TS types; ComparePicker filter switched from `row.cwd === scopeCwd` (cwd-string-equality proxy) to `row.project_key === scopeProjectKey` (sha1[:12]-of-realpath canonical identity), closing SC#3 / TDBT-01 frontend half — the symlink-collapsed-realpath and byte-equal-cwd-distinct-realpath edge cases now resolve correctly.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-15T19:52:56Z
- **Completed:** 2026-05-15T19:59:45Z
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 7 (1 TS surface + 1 component + 5 test fixtures, last of which gained 2 new tests)
- **LOC delta:** +281 / -44 (net +237; +43/-1 in Task 1 type-mirror commit; +238/-43 in Task 2 filter-switch commit)
- **Vitest delta:** 325 → 327 in panels + ui sweep (+2 new TDBT-01 tests; 70 test files all pass)

## Accomplishments

- Added `project_key: string` (required, additive) to **both** `SessionListItemFull` (the list/details fetcher shape) and `SessionCompareSide` (the compare endpoint shape) in `frontend/src/lib/api.ts`. Both fields carry a Phase 27 TDBT-01 doc block explaining the sha1[:12]-of-realpath derivation, the wire-shape origin (Plan 27-02 backend), and the symlink/realpath edge cases that motivate canonical-identity equality.
- Updated **5 vitest fixture factories** (`makeRow` in SessionsTable; `makeSide` in SessionCompareView; `makeFullSession` in SkillRunsTable + LiveSessionsCard; `makeSessionRow` in CommandPalette) to supply the new required field. SessionsTable uses a per-row sentinel `pk0000000001..pk00000000NN` (12 chars each, distinct so future filter-style tests can rely on per-row uniqueness); the other three use a fixed `'0123456789ab'` sentinel. CommandPalette's factory gained an OPTIONAL 3rd param `(project_key = '0123456789ab')` so legacy call sites compile unchanged and the new TDBT-01 tests can pass distinct values per row.
- Switched the **ComparePicker scoping** filter from `row.cwd === scopeCwd` to `row.project_key === scopeProjectKey`. Refactor surface:
  - `aCwd` derivation site → `aProjectKey` (reads `data.{a,b}.project_key` from the compare cache, with `|| null` empty-string fallback)
  - `ComparePicker` prop `scopeCwd: string | null` → `scopeProjectKey: string | null` (renamed at definition + call site)
  - Filter predicate switched
  - Description copy switched from `Showing sessions from ${scopeCwd} only.` to `'Showing sessions in the same project.'` (project-shape-honest; does NOT leak the 12-char hex). Empty-list fallback copy switched analogously.
  - **Row display label PRESERVED** as `{row.cwd ?? '—'}` — load-bearing precedence: the filter switches on the canonical id, the display label stays on the human-readable proxy. Users still see the cwd they recognize.
- Shipped **2 new vitest cases** in `CommandPalette.test.tsx` locking both halves of the new contract:
  - `TDBT-01: ComparePicker filters candidates by project_key, not cwd (symlink + byte-equal edge cases)` — seeds 3 rows constructed to surface both edge cases: a symlink-collapsed row (different cwd, same project_key) MUST appear; a byte-equal-cwd row with a different project_key MUST be filtered out. Assertions use `screen.getByRole('button', { name: ... })` for inclusion and `queryByRole(... )` for exclusion.
  - `TDBT-01: ComparePicker description copy does not leak the 12-char project_key hex` — asserts `/showing sessions in the same project/i` IS visible, `aaaaaaaaaaaa` is NOT visible, and the row's cwd label IS still rendered.
- All 14 prior CommandPalette tests pass (16 total). All 26 panel-test-suite tests pass after fixture update. Broader sweep: 327 / 327 across `src/components/panels` + `src/components/ui`. **Pre-commit hooks (frontend tsc) clean on both task commits.**
- Success-criteria greps satisfied: `grep "scopeCwd" CommandPalette.tsx` returns **0 hits** (renamed prop + scrubbed comment phrasing); `grep "row.cwd === scopeCwd"` returns **0 hits**; `grep "scopeProjectKey"` returns **12 hits**.

## Task Commits

1. **Task 1: Mirror project_key on frontend TS types + update 5 vitest fixtures** — `32763bd` (feat)
2. **Task 2: Switch ComparePicker filter to project_key + new vitest coverage** — `0b052b1` (feat)

Each task committed atomically per execute-plan convention. The split is deliberate: Task 1 is the type-shape gate (tsc fails until every consumer mock has the sentinel; no consumer behavior changes), Task 2 is the consumer-logic switch (filter + copy refactor + new coverage). A reader bisecting through this plan can land at `32763bd` and verify the type contract independently from the filter-behavior switch at `0b052b1`.

## Files Modified

- `frontend/src/lib/api.ts` (+30 / 0) — `SessionListItemFull.project_key: string` (Phase 27 TDBT-01 doc block, line 103-117 region) + `SessionCompareSide.project_key: string` (same doc pattern, line 160-185 region). Both fields are required-string (NOT `string | null`) to mirror the backend Plan 27-02 invariant.
- `frontend/src/components/ui/CommandPalette.tsx` (+39 / -27) — header comment block updated to cite Plan 27-02 + 27-03 closure with edge-case rationale; `aCwd` → `aProjectKey` derivation site; `ComparePicker` prop scope-name + filter + description + empty-state copy all switched; row display `{row.cwd ?? '—'}` PRESERVED at line 810.
- `frontend/src/components/ui/__tests__/CommandPalette.test.tsx` (+167 / -2) — imports gain `SessionCompareResponse` + `SessionCompareSide`; `makeSessionRow` gains optional 3rd arg `(project_key = '0123456789ab')`; describe-block tail gains `SCOPE_PROJECT_KEY` + `OTHER_PROJECT_KEY` constants, `makeCompareSide` helper, `seedCompareCacheForA` helper, and 2 new `it(...)` cases.
- `frontend/src/components/panels/__tests__/SessionsTable.test.tsx` (+5 / -1) — `makeRow` factory gains `project_key: 'pk' + padStart(10, '0')` (12-char sentinel, distinct per row).
- `frontend/src/components/panels/__tests__/SessionCompareView.test.tsx` (+6 / -1) — `makeSide` factory gains `project_key: '0123456789ab'` sentinel + doc comment.
- `frontend/src/components/panels/__tests__/SkillRunsTable.test.tsx` (+7 / -1) — `makeFullSession` factory gains `project_key: '0123456789ab'` + 4-line doc comment explaining the fixed sentinel choice.
- `frontend/src/components/panels/__tests__/LiveSessionsCard.test.tsx` (+4 / -1) — `makeFullSession` factory gains `project_key: '0123456789ab'` + 2-line doc comment.

## Verifications

| Check | Command | Result |
|-------|---------|--------|
| Type contract — required field | `cd frontend && pnpm tsc --noEmit` | **Clean (no output)** |
| Lint — zero warnings | `cd frontend && pnpm lint --max-warnings 0` | **Clean (exit 0)** |
| Per-file panel suite | `pnpm test --run src/components/panels/__tests__/{SessionsTable,SessionCompareView,SkillRunsTable,LiveSessionsCard}.test.tsx` | **26 tests passed (4 files)** |
| CommandPalette suite | `pnpm test --run src/components/ui/__tests__/CommandPalette.test.tsx` | **16 tests passed (14 prior + 2 new TDBT-01)** |
| Broader regression sweep | `pnpm test --run src/components/panels src/components/ui` | **327 tests passed (70 files)** — zero regressions |
| Success-criteria grep 1 | `grep "scopeCwd" frontend/src/components/ui/CommandPalette.tsx` | **0 hits** |
| Success-criteria grep 2 | `grep "row.cwd === scopeCwd" frontend/src/components/ui/CommandPalette.tsx` | **0 hits** |
| Success-criteria grep 3 | `grep "scopeProjectKey" frontend/src/components/ui/CommandPalette.tsx` | **12 hits** (prop + filter + derivation + description copy) |
| Pre-commit frontend typecheck | (auto on commit) | **Passed** for both `32763bd` + `0b052b1` |

## Decisions Made

1. **Required string (NOT `string | null`)** — mirrors the backend Plan 27-02 contract. The DB column is non-nullable with `default=''`; migration 0003 backfilled all historical rows. Empty string is the canonical "no cwd recorded" sentinel. The picker's scope filter treats empty as no-scope via `if (!scopeProjectKey) return allItems` (line 764), which is exactly the D-13 fallback behavior — so the empty-string case degrades correctly to global scope without needing a separate null check.
2. **Row display label preserved as `{row.cwd ?? '—'}`** — the 12-char hex `project_key` is not human-readable; if the picker rendered hex strings as row labels, users would lose all visual identity for the rows. The filter (machine-comparable) and the display (human-readable) were ALWAYS conceptually orthogonal; the prior code just happened to align them because cwd was the only project-shaped field on the wire. Plan 27-02 fixed that, and this plan completes the separation.
3. **Description copy: "Showing sessions in the same project." (project-shape-honest)** — the prior copy `Showing sessions from ${scopeCwd} only.` interpolated the cwd into a UI label. Switching to project_key would have surfaced the 12-char hex; switching to project_key AND keeping the interpolation would have been worse UX than the cwd version. The right answer is to switch the copy to a project-shape-honest English phrasing that matches the new canonical filter semantics. Bonus: the new copy is also strictly more privacy-respecting (does not surface user filesystem paths in palette UI text).
4. **Optional 3rd param on `makeSessionRow(session_id, cwd, project_key = '0123456789ab')`** — the two new TDBT-01 tests need rows with DISTINCT project_keys to exercise the filter's inclusion + exclusion paths. Adding a required 3rd param would force every legacy call site (4 existing tests use makeSessionRow with the 2-arg signature) to opt in. An optional param with a sensible default satisfies BOTH requirements: legacy tests compile unchanged, new tests opt in to distinct values.
5. **Pre-seed via `setQueryData(qk.sessionCompare(UUID_A, ''), fixture)`** — the new tests need `aProjectKey` to resolve to a non-null value WITHOUT both `a` + `b` in the URL (which would change the palette item label from "Compare with…" to "Pick a different session B"). Reading `queries.ts:402` revealed that `useSessionCompare(a, undefined)` coerces the cache key to `['session-compare', a, '']` via `qk.sessionCompare(a ?? '', b ?? '')`. Seeding that exact slot is the surgical surface that activates scope without altering the URL or the palette label. Three lines of helper code (`seedCompareCacheForA`); structurally locks the cache-key coercion idiom for future readers.
6. **Two new tests, not one** — separate the FILTER invariant (symlink + byte-equal cwd edge cases) from the COPY invariant (no hex leakage). Each test has one assertion target so a future regression in either dimension fails the right test by name. The fixture seeding overhead duplicates somewhat but the cost is 30 LOC vs. losing the diagnosis precision; favored precision.
7. **Comment phrasing scrubbed in two places** — initial `grep "scopeCwd"` after the rename returned 2 hits inside doc comments referring to the OLD identifier (one in the header comment block explaining the migration, one in the new JSDoc explaining the prop's replacement). Rewrote both phrasings to avoid the literal token (`row-cwd / scope-cwd string-equality` and `prior cwd-string-equality scope filter`) so the success-criteria grep contract is unambiguous. The historical context is preserved in English; only the exact token is gone.

## Deviations from Plan

None — plan executed exactly as written.

The plan's example test code referenced spreading `/* ...rest */` over partial SessionListItemFull mocks; in practice I used the existing `makeSessionRow` factory with the new optional 3rd arg to construct rows. This is a more idiomatic surface for this test file (which already uses factories) and satisfies the plan's intent exactly. The plan's "Step 8" example sketch was an outline of test intent, not literal code to ship; the actual tests use the project's existing helpers + helpers I added (`makeCompareSide`, `seedCompareCacheForA`) to land the same assertions in the file's idiom.

The plan's line-number anchors (line 362-371 for aCwd derivation; line 710 for ComparePicker prop signature; line 747-750 for filter; line 758-762 for description copy; line 790-792 for row display) were close but slightly off due to prior edits since 27-RESEARCH.md was authored. Used line-context anchoring (Read + Edit with surrounding context) instead of exact line numbers — this is normal Read-then-Edit hygiene, not a deviation.

I added one minor comment-phrasing scrub (Decision #7 above) that's NOT explicitly called out in the plan's success criteria but is required to satisfy the literal `grep "scopeCwd" CommandPalette.tsx` returns 0 invariant. Following the spirit of the success criteria (the file should not name `scopeCwd` even in comments now that it's the OLD identifier) — not a deviation, just careful adherence.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Plan 27-03 ships clean. TDBT-01 (frontend half) complete. REQ-ID TDBT-01 now CLOSED via Plans 27-02 + 27-03 in tandem.**

- **Plan 27-04** (Skills route global-picker adoption) is unblocked. The orchestrator's sequencing note flagged that 27-04 also touches `SkillRunsTable.test.tsx` to add `vi.mock('@tanstack/react-router')`. The fixture update in this plan only changed the `makeFullSession` factory body (added `project_key` field with 4-line doc comment); 27-04's mock addition will land at the top of the file (imports area) with zero conflict at the factory site. Pre-commit hooks confirmed both Task 1 and Task 2 commits clean; no leftover state for 27-04 to inherit.
- **Plan 27-09** (close gate) will re-run the full frontend vitest + Playwright sweep. The +2 vitest delta is preserved in close-gate baselines: 325 → 327 in panels+ui (612 → 614 across the full vitest suite if all other plans add zero — confirm at 27-09 time).
- **Parallel-safety honored:** no file overlap with any sibling Wave 2 plan. The compare cache key coercion idiom (`qk.sessionCompare(a, b ?? '')`) discovered while writing the new tests is now documented in this SUMMARY's patterns-established for future picker-related plans.

**Phase 27 SC mapping:** SC#3 ("compare picker uses authoritative project_key instead of cwd-as-proxy") is now FULLY SATISFIED. End-to-end SC#3 verification will land in Plan 27-09 close gate via the Playwright happy-path on /sessions/compare.

**REQ-ID coverage:** TDBT-01 = Plan 27-02 backend + Plan 27-03 frontend = CLOSED.

## Self-Check: PASSED

- `[ -f frontend/src/lib/api.ts ]` → FOUND (modified +30 LOC, project_key on both interfaces)
- `[ -f frontend/src/components/ui/CommandPalette.tsx ]` → FOUND (modified +39 / -27 LOC)
- `[ -f frontend/src/components/ui/__tests__/CommandPalette.test.tsx ]` → FOUND (modified +167 / -2 LOC, 14 → 16 tests)
- `[ -f frontend/src/components/panels/__tests__/SessionsTable.test.tsx ]` → FOUND (modified +5 / -1 LOC)
- `[ -f frontend/src/components/panels/__tests__/SessionCompareView.test.tsx ]` → FOUND (modified +6 / -1 LOC)
- `[ -f frontend/src/components/panels/__tests__/SkillRunsTable.test.tsx ]` → FOUND (modified +7 / -1 LOC)
- `[ -f frontend/src/components/panels/__tests__/LiveSessionsCard.test.tsx ]` → FOUND (modified +4 / -1 LOC)
- `git log --oneline --all | grep 32763bd` → FOUND (`feat(27-03): mirror project_key on frontend SessionListItemFull + SessionCompareSide types`)
- `git log --oneline --all | grep 0b052b1` → FOUND (`feat(27-03): switch ComparePicker filter from cwd to project_key (TDBT-01 frontend half)`)
- Vitest count delta in panels+ui sweep: 325 → 327 (+2 as predicted)
- `grep "scopeCwd" frontend/src/components/ui/CommandPalette.tsx` → 0 hits (success criteria 2)
- `grep "row.cwd === scopeCwd" frontend/src/components/ui/CommandPalette.tsx` → 0 hits (success criteria 3)
- `grep "scopeProjectKey" frontend/src/components/ui/CommandPalette.tsx` → 12 hits (prop + filter + derivation + copy)
- pnpm tsc --noEmit + pnpm lint --max-warnings 0 — both clean

---
*Phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt*
*Completed: 2026-05-15*
