---
phase: 18-polish-carry-forward-cleanup
plan: 04
subsystem: frontend-e2e
tags: [playwright, strict-mode, data-testid, selector-discipline, e2e, documentation]

# Dependency graph
requires:
  - phase: 17-skill-perf-baselines-and-comparator
    provides: stable Playwright baseline (8 specs, chromium-only, vite preview + uvicorn)
provides:
  - "Strict-mode-clean schedule-composer.spec.ts (was failing pre-fix on getByLabel('Name') collision with SkillTimeline aria-label)"
  - "Locked data-testid convention documented in frontend/tests/e2e/README.md (feature-component-element kebab-case path-style)"
  - "Source-component data-testid attribute on ScheduleComposer Name input — prototype for future composer disambiguation"
  - "Steady-state Playwright baseline: 7 passed / 1 skipped (alerts TEST-05a) / 0 failed under strict mode"
affects: [18-05-baseline-and-phase-close, all-future-e2e-spec-authoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-component data-testid pattern: data-testid lives on the React component (ScheduleComposer.tsx), NOT on a test-only wrapper. Specs reach it via page.getByTestId('feature-component-element')."
    - "Selector hierarchy discipline: getByRole > getByLabel > getByText > getByTestId (fallback). Test IDs added only when strict mode collides — never preemptive decoration."
    - "Pitfall-4 documentation: Playwright getByLabel matches aria-label substrings under strict mode. README explicitly calls this out so authors don't repeat the trap."

key-files:
  created:
    - "frontend/tests/e2e/README.md"
  modified:
    - "frontend/src/components/panels/ScheduleComposer.tsx"
    - "frontend/tests/e2e/schedule-composer.spec.ts"

key-decisions:
  - "data-testid lives on the source React component (ScheduleComposer.tsx:193 — the Name <input>), per CONTEXT D-data-testid-convention. Test-only wrappers were rejected to avoid render-layer maintenance burden."
  - "Convention locked at feature-component-element kebab-case path-style. README documents 5 example testids spanning composer, alerts firehose, skills detail — predictable for grep, scoped by feature."
  - "Convention documentation lives in frontend/tests/e2e/README.md (NEW), NOT CONTRIBUTING.md, per CONTEXT D-Documentation-location lock. Rule lives next to the tooling that enforces it."
  - "Only the colliding selector got a testid. getByLabel('Advanced cron'), getByRole('button', {name: 'Create schedule'}), getByRole('button', {name: '+ New'}) all stay as-is — full-suite strict-mode run confirmed they are unique on /skills. Pre-decoration is an anti-pattern (RESEARCH §Anti-Patterns)."
  - "Steady-state alerts.spec.ts skip preserved (Pitfall 6). README documents that '1 skipped' is the baseline so verifiers don't regress on it."

patterns-established:
  - "Pattern: 'fix only what strict mode flags' — sweep all e2e specs in strict mode but decorate only colliding selectors. Keeps source files clean."
  - "Pattern: 'rebuild before re-run' — vite preview serves dist/, so source-component edits require pnpm run build before the new data-testid is reachable from Playwright."

# Metrics
duration: ~5min
completed: 2026-05-05
---

# Phase 18 Plan 04: Playwright Strict-Mode Disambiguation + e2e README Summary

**Strict-mode-clean Playwright e2e suite (7 pass / 1 steady-state skip / 0 fail) plus the locked `feature-component-element` `data-testid` convention documented in a new `frontend/tests/e2e/README.md` — the destination future e2e specs will reach for when role/label selectors collide.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-05T20:17:09Z
- **Completed:** 2026-05-05T20:22:00Z (approx)
- **Tasks:** 3 (Task 3 was verification-only — no commit)
- **Files modified:** 3 (1 created, 2 modified)
- **Commits:** 2 of mine + 1 shared (README landed in Plan 18-03's commit, see Deviations)

## Pre-fix vs Post-fix Playwright Counts

| Run | Tests | Passed | Skipped | Failed | Strict-mode violations |
| --- | ----- | ------ | ------- | ------ | ---------------------- |
| Pre-fix (baseline) | 8 | 6 | 1 (alerts TEST-05a) | 1 (`schedule-composer`) | 1 — `getByLabel('Name')` resolved to 2 elements |
| Post-fix (final) | 8 | **7** | 1 (alerts TEST-05a) | **0** | **0** |

The single steady-state skip on `alerts.spec.ts` (TEST-05a) is preserved per Pitfall 6 — that test requires a recently-failed task in the dev DB, which is not present today.

## Accomplishments

- Eliminated the only active strict-mode collision in the suite — `schedule-composer.spec.ts:54` now uses `page.getByTestId('schedule-composer-name')` instead of `page.getByLabel('Name')`, which previously matched both ScheduleComposer's wrapped `<input>` AND SkillTimeline's `aria-label="Filter skill name"`.
- Added a single `data-testid="schedule-composer-name"` attribute to the source `<input>` in `ScheduleComposer.tsx:193` — no other source-component changes; no other selectors decorated (full-suite strict-mode run showed no other collisions on /skills).
- Created `frontend/tests/e2e/README.md` documenting selector hierarchy, the locked `feature-component-element` kebab-case convention with 5 examples, the "source not test wrapper" rule, the runbook (`pnpm run test:e2e`, ports, reuseExistingServer), and the steady-state `alerts.spec.ts` 1-skip baseline.
- Confirmed `CONTRIBUTING.md` is NOT modified (CONTEXT lock).
- Confirmed `frontend/package.json` and `frontend/pnpm-lock.yaml` are unchanged — zero net-new dependencies.
- Verified determinism: full suite green under both default workers and `--workers=1`.

## Task Commits

1. **Task 1 — frontend/tests/e2e/README.md created** — landed in commit `3457c32` (see Deviations: parallel-execution race; README content is mine, commit message is Plan 18-03's).
2. **Task 2 — disambiguate ScheduleComposer Name input** — `9db5f32` (`fix(18-04): disambiguate ScheduleComposer Name input under Playwright strict mode`).
3. **Task 3 — full-suite verification** — verification-only, no commit.

## Files Created/Modified

- `frontend/tests/e2e/README.md` (new, ~150 lines) — 7 sections: Header/Purpose, Selector Hierarchy, When to Add data-testid, Naming Convention, Where the Attribute Lives, Running the Suite, Known Steady-State Skips, plus a closing Strict Mode section.
- `frontend/src/components/panels/ScheduleComposer.tsx` (modified, +1 line) — `data-testid="schedule-composer-name"` added to the Name `<input>` props at line 193. No logic, props, or visible behavior change.
- `frontend/tests/e2e/schedule-composer.spec.ts` (modified, +5 / -1 lines) — replaced `page.getByLabel('Name').fill(name)` with `page.getByTestId('schedule-composer-name').fill(name)` plus an explanatory comment block documenting the Pitfall-4 rationale and pointing at the new README.

## Source Components Decorated with `data-testid`

| File:line | testid string |
| --------- | ------------- |
| `frontend/src/components/panels/ScheduleComposer.tsx:193` | `schedule-composer-name` |

Only one component received a testid this plan. `schedule-composer-cron` and `schedule-composer-submit` were considered but the full-suite strict-mode run did NOT flag those selectors — pre-decoration was deliberately avoided (RESEARCH §Anti-Patterns).

## E2E Specs Updated to `getByTestId`

| File:line | Replacement |
| --------- | ----------- |
| `frontend/tests/e2e/schedule-composer.spec.ts:58` | `page.getByLabel('Name')` → `page.getByTestId('schedule-composer-name')` |

No other spec file required edits — the full-suite strict-mode run found zero collisions outside `schedule-composer.spec.ts`.

## CONTRIBUTING.md Confirmation

`git status` confirms `CONTRIBUTING.md` (or any top-level docs file) was NOT touched. The convention lives in `frontend/tests/e2e/README.md` per CONTEXT D-Documentation-location lock.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Production build rebuilt to make data-testid reachable from Playwright**
- **Found during:** Task 2 (first re-run of `schedule-composer` after editing the source component).
- **Issue:** Playwright's `vite preview` webServer serves `dist/` (production build). The newly-added `data-testid="schedule-composer-name"` was in source TSX but not yet in `dist/assets/panels-*.js`, so `page.getByTestId('schedule-composer-name')` timed out for 30s.
- **Fix:** Ran `pnpm run build` in `frontend/`, then killed the stale vite preview on port 4173 so Playwright's `reuseExistingServer=true` path would re-launch from the new build. Documented in the spec comment (and in `frontend/tests/e2e/README.md` "Running the Suite" section) that the production build must be regenerated when source components change.
- **Files modified:** `frontend/dist/` (build artifact, gitignored — not a source change).
- **Commit:** Pre-existing as part of `9db5f32` (the same commit that adds the testid).

### Parallel-Execution Coordination Notes

**Wave-2 race: README landed in Plan 18-03's commit**
- Plan 18-03 was running concurrently (per the wave-2 split). Their pre-commit hook re-staged tracked files in the working tree at the moment they invoked `git commit`, which absorbed my staged `frontend/tests/e2e/README.md` into commit `3457c32`. The README content is exactly what Plan 18-04 specified and was authored by this agent; only the commit boundary differs.
- This is a transient artifact of parallel execution against the same working tree. No destructive resolution attempted (per "stay strictly within your file scope" and the destructive-git-prohibition). The README is in the tree, in the right path, with the right content; the only consequence is that the commit message says `test(18-03): pin Date.now()...` rather than `docs(18-04): add e2e README...`.
- Future wave-N parallelization should consider per-agent worktrees or a lockfile-style staging gate to prevent this kind of cross-plan commit absorption.

### Out-of-Scope Discoveries

None. The full-suite strict-mode run did not surface any additional selector ambiguities outside the one this plan was scoped to fix. No deferred items to elevate to STATE.md.

## POLI-08 Success-Criterion Audit

| Plan SC | Status | Evidence |
| ------- | ------ | -------- |
| SC1 — strict-mode lock (schedule-composer + 0 violations) | PASS | 7 passed / 1 skipped / 0 failed; `grep -i 'strict mode violation'` on log returns 0 lines. |
| SC2 — README documents `feature-component-element` + 4+ examples + source-not-wrapper rule | PASS | README has 5 examples (composer-name, composer-submit, composer-cron, alerts-firehose-skill-filter, skills-detail-projects-table) and explicit "source React component, NOT test-only wrapper" section. |
| SC3 — `data-testid="schedule-composer-name"` on source `<input>` | PASS | `grep -c` returns 1 occurrence at `ScheduleComposer.tsx:193`. |
| SC4 — CONTRIBUTING.md NOT modified | PASS | `git status` shows no edit. |
| SC5 — full Playwright >=7 passed; skip stays at exactly 1 (no NEW skips) | PASS | 7 passed; alerts.spec.ts steady-state 1 skip preserved. |
| SC6 — zero net-new dependencies | PASS | `git diff --name-only frontend/package.json frontend/pnpm-lock.yaml` returns 0 lines. |
| SC7 — no source component logic/props/visible-behavior change | PASS | Only `data-testid` attribute added; render output, prop signatures, and event handlers unchanged. |

All 7 success criteria pass.

## Verifier Notes

- The `alerts.spec.ts` steady-state 1-skip baseline is documented in the new README so verifier comparisons should focus on failed counts only, not skip counts. Phase 18-05 (BASELINE.md) will pin the post-Plan-04 numbers as the v1.2 e2e baseline.
- The production build (`dist/`) must be regenerated before re-running the e2e suite if source components change between runs. The Playwright config's existing `reuseExistingServer=true` does NOT auto-detect source diffs.

## Self-Check: PASSED

- [x] `frontend/tests/e2e/README.md` exists (verified `test -f`)
- [x] Commit `3457c32` exists (README landed here per parallel-race deviation note above)
- [x] Commit `9db5f32` exists (`git log --oneline | grep 9db5f32`)
- [x] `grep -c 'data-testid="schedule-composer-name"' frontend/src/components/panels/ScheduleComposer.tsx` returns 1
- [x] `grep -c "getByTestId('schedule-composer-name')" frontend/tests/e2e/schedule-composer.spec.ts` returns 1
- [x] Full Playwright suite reports 7 passed / 1 skipped / 0 failed
- [x] `grep -i 'strict mode violation' /tmp/phase18-plan04-final.log` returns no matches
- [x] `git diff --name-only frontend/package.json frontend/pnpm-lock.yaml | wc -l` returns 0
