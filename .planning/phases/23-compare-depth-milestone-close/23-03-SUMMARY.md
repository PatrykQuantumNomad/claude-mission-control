---
phase: 23-compare-depth-milestone-close
plan: 03
subsystem: e2e
tags: [playwright, e2e, sessions-compare, cmdk, testing]

requires:
  - phase: 23-compare-depth-milestone-close
    provides: "/api/sessions/compare skill_latencies + low_sample_a/b + GET /api/sessions/{sid}/previous (Plan 23-01)"
  - phase: 23-compare-depth-milestone-close
    provides: "Per-skill latency section + Cmd+K compare-with-previous (Plan 23-02)"
provides:
  - "CMPR-06 (e2e): Playwright coverage for per-skill p95 latency section + delta suppression on /sessions/compare"
  - "CMPR-07 (e2e): Playwright coverage for Cmd+K 'Compare with previous session' visibility gate + navigation"
affects: [e2e-suite]

tech-stack:
  added: []
  patterns:
    - "API preflight via Playwright `request` fixture (`request.get(${API}/api/...)`) to inspect real backend response shape, then branch assertions or push annotations rather than mocking"
    - "Conditional branch annotations via `test.info().annotations.push({type:'note',...})` when a sub-branch is not exercisable on the current dev DB but the test as a whole still has signal"
    - "Strict-mode-safe locator anchoring with character-unique substrings (U+2026 ellipsis) when sibling option labels share a common prefix"

key-files:
  created: []
  modified:
    - frontend/tests/e2e/sessions-compare.spec.ts

key-decisions:
  - "Use the URL-driven activeSessionId source (D-10: /sessions/compare?a=<sid> treats `a` as current) instead of a Sheet-portal source for TEST-23-CMPR-07. The two session-detail Sheet entrypoints (LiveSessionsCard, SkillRunsTable) require live data on the dashboard at test time, while the URL path is reliable across all dev DB seed states."
  - "Preflight /api/sessions/{sid}/previous on each candidate session id rather than hard-coding a known-good fixture id. Lets the test discover both the visible (200) and hidden (404) branches dynamically against whatever data the dev DB happens to hold."
  - "Use stable testid anchors for the new Phase 23 surfaces (session-compare-skill-latency-section, session-compare-skill-latency-low-sample, session-compare-skill-latency-table, session-compare-skill-latency-delta-{skill}, cmdk-compare-with-previous) rather than user-facing copy. The plan's locked behavior names ('Compare with previous session', 'Per-skill p95 latency') overlap with sibling commands/sections under regex matching, and these testids already shipped in Plan 23-02 — no new decoration needed."
  - "EmptyState branch of SkillLatencySection STILL renders the section wrapper with the same testid (verified in source). The CMPR-06 mount assertion therefore passes in both data states; only the row-level + low-sample assertions need to gate on the preflight outcome."

patterns-established:
  - "When a Phase X feature adds a new Cmd+K command alongside an existing one with overlapping copy, regex-based getByRole locators in older e2e specs may break under strict mode. Mitigation: anchor regexes with character-unique substrings the new label cannot match (e.g., U+2026 ellipsis on the legacy 'Compare with…' label)."
  - "Stale long-running dev backends miss new endpoints — when a /api/... route returns HTML doctype with status 200, the SPA catch-all is serving the request because the backend was started before the route shipped. Cycle the backend (or let Playwright's webServer reuse=true boot a fresh one) to load the new code."

requirements-completed: [CMPR-06, CMPR-07]

duration: 5m
completed: 2026-05-09
---

# Phase 23 Plan 03: Compare Depth E2E Summary

**Locks Phase 23's per-skill p95 latency section and Cmd+K compare-with-previous behavior under Playwright with state-aware assertions that don't false-fail on empty dev DBs.**

## Performance

- **Duration:** ~5m
- **Started:** 2026-05-09T12:09:04Z
- **Completed:** 2026-05-09T12:14:23Z
- **Tasks:** 1/1
- **Files modified:** 1 (extended)

## Accomplishments

- Added **TEST-23-CMPR-06** to `sessions-compare.spec.ts`: asserts the per-skill p95 latency section (testid `session-compare-skill-latency-section`) mounts on `/sessions/compare`. Branches on the preflight `/api/sessions/compare` response — when both sides have empty `skill_latencies`, mounts-only is enough; when populated, asserts the rows table testid AND the low-sample/delta suppression behavior.
- Added **TEST-23-CMPR-07** to `sessions-compare.spec.ts`: scans `/api/sessions/{sid}/previous` against candidate sessions in the dev DB to find one of each branch (200 and 404), then exercises both. Visible branch: opens Cmd+K, asserts `cmdk-compare-with-previous` is visible, selects it, asserts URL navigates to `/sessions/compare?a=<sid>&b=<prev>`. Hidden branch: asserts the same testid has `count(0)` in the palette dialog.
- Both new tests use `test.skip()` with actionable reason text when the DB has no sessions (range=7d for compare; range=30d for previous-scan), so empty-environment runs report a single skip per test rather than a hard failure.
- Both tests use `test.info().annotations.push({type:'note', ...})` to surface "this branch wasn't exercisable on the current DB" without pretending the assertion ran. This keeps signal visible in the Playwright report without inflating the skip count.

## Task Commits

1. **Task 23-03-01: Extend Playwright compare spec for skill latencies + Cmd+K previous-session** — `8f5b009` (test)

## Files Created/Modified

- `frontend/tests/e2e/sessions-compare.spec.ts` — Added two new tests (TEST-23-CMPR-06, TEST-23-CMPR-07) totalling +288 / -3 LOC. Also fixed an unrelated strict-mode collision in the legacy TEST-05b (regex now anchors on U+2026 ellipsis).

## Decisions Made

1. **Preflight backend instead of mocking.** Plan and project conventions both prefer real-backend e2e — see `frontend/tests/e2e/README.md` and `playwright.config.ts` (no MSW, no test-DB seed). The new tests issue Playwright `request` calls against `/api/sessions/compare` and `/api/sessions/{sid}/previous` to read the real shape, then branch assertions accordingly. This costs ~1 extra HTTP roundtrip per test but avoids both flake (mocked-vs-real divergence) and false failures on empty seed states.

2. **URL-driven active-session source for CMPR-07.** Per D-07 the action is "available only on session detail views" and Plan 23-02 wired two sources: ActiveSessionContext (set by Sheet portals on `/` and `/skills/<name>`) AND the `/sessions/compare?a=<sid>` URL (D-10). The Sheet sources require live-session data on the dashboard at test time which is unreliable; the URL source is reliable across all dev DBs that have ≥1 ended session in any project. So the test uses `/sessions/compare?a=<sid>` to drive `compareWithPreviousSourceId`.

3. **Testid anchors over user-facing copy.** Phase 23 Plan 02 already shipped stable testids for both new surfaces (`session-compare-skill-latency-*` on the latency section + `cmdk-compare-with-previous` on the new command item). Used these directly rather than role+text anchors, because:
   - The "Per-skill p95 latency" copy is also the section's `aria-label` AND its `<h4>` text — multiple matches under role/text strict mode.
   - The "Compare with previous session" command label collides with the legacy "Compare with…" command under any regex that doesn't anchor on the trailing space-or-end.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed strict-mode collision in TEST-05b after introducing CMPR-07 command**
- **Found during:** First e2e run (Task 23-03-01 verification)
- **Issue:** The legacy TEST-05b in `sessions-compare.spec.ts` used `getByRole('option', { name: /Compare with|Pick a different session B/i })` to anchor the Plan 16-03 picker action. After Plan 23-02 added the sibling "Compare with previous session" command, the regex now matches BOTH options when the chosen session has a previous match in the dev DB — Playwright raises a strict-mode violation and the test fails. This is a pre-existing-shape bug introduced by Plan 23-02 (the regex was not updated when the new command shipped) but only surfaces when (a) the test runs against a populated DB and (b) `sessionA` has a previous session.
- **Fix:** Anchored the regex on `U+2026` ellipsis: `/Compare with…|Pick a different session B/i`. The new command's label is `"Compare with previous session"` (no ellipsis), so this regex resolves to a single option deterministically.
- **Files modified:** `frontend/tests/e2e/sessions-compare.spec.ts` (TEST-05b only)
- **Commit:** `8f5b009` (folded into the task commit because the fix is in the same file under the same plan)

### Environment Issues (not deviations — environmental)

**Stale dev backend during e2e runs**
- The host had an `uvicorn` backend running on port 8765 from before commit `bdc0e74` (Plan 23-01) — the new `/api/sessions/{sid}/previous` route was not loaded. The SPA catch-all served `index.html` with status 200 for that path, breaking TEST-23-CMPR-07's preflight `r.json()` parse.
- Resolution: killed the stale process; Playwright's `webServer.reuseExistingServer=true` re-booted a fresh backend on the next test invocation.
- This is documented for future agents who hit the same symptom: when an `/api/...` route returns `<!doctype html>` with status 200, the backend is missing that route and the SPA catch-all is serving the request — restart the backend.

## Issues Encountered

- **First e2e run failed on TEST-05b strict-mode collision** (Rule 1 fix above).
- **Stale backend not loading Plan 23-01 endpoint** — restarted to let Playwright boot fresh.
- No flakes; all 3 sessions-compare tests now pass deterministically. Full e2e suite: 13 passed, 2 skipped (matches steady-state baseline).

## User Setup Required

None — no env vars, no migrations, no external service configuration. The new tests are environment-aware (skip with actionable reason when the dev DB lacks the data needed to exercise either branch).

## Threat Surface

T-23-07 (Repudiation: flaky e2e assertions) — **mitigated** as planned:
- Mount assertions use stable testid anchors (`session-compare-skill-latency-section`, `cmdk-compare-with-previous`) that exist regardless of data state.
- Data-dependent assertions (low-sample badge, delta value, navigation URL) are gated on the preflight `/api/sessions/compare` and `/api/sessions/{sid}/previous` response shapes. When the preflight indicates the branch is not exercisable, the test pushes a `note` annotation and continues rather than failing.
- Skips are scoped to the minimum needed (test-level `test.skip()` only when ZERO branches are exercisable; sub-branch annotations otherwise).

No new boundaries introduced; this plan is test-only.

## Verification

- **`cd backend && pytest tests/test_sessions_router.py -x -q`** — 40 passed in 6.93s (gate per `23-VALIDATION.md`).
- **`cd frontend && pnpm test:e2e tests/e2e/sessions-compare.spec.ts`** — 3 passed (TEST-05b + TEST-23-CMPR-06 + TEST-23-CMPR-07).
- **`cd frontend && pnpm test:e2e`** (full suite) — 13 passed, 2 skipped. Steady-state baseline preserved (1-3 skipped per `frontend/tests/e2e/README.md`); the 2 skips are `alerts.spec.ts` TEST-05a (no recently-failed task) and one `cost-dashboard.spec.ts` skip when no `project_key` rows.
- **`cd frontend && pnpm tsc --noEmit`** — clean.
- pre-commit `frontend typecheck (tsc)` ran on the task commit and passed.

## Next Phase Readiness

Phase 23 e2e coverage is locked. Remaining Phase 23 plan:
- **23-04** — Milestone-close gate: full test/audit gates green, ROADMAP archive-ready, REQUIREMENTS traceability final.

## Self-Check: PASSED

- Found `frontend/tests/e2e/sessions-compare.spec.ts` (modified)
- Found commit `8f5b009` (Task 23-03-01)
- Verified backend tests green: 40 passed (`tests/test_sessions_router.py`)
- Verified e2e tests green: 3 passed for `sessions-compare.spec.ts` + 13 passed / 2 skipped full suite
