---
phase: 23-compare-depth-milestone-close
verified: 2026-05-09T09:00:00Z
status: passed
score: 4/4
overrides_applied: 0
---

# Phase 23: Compare Depth & Milestone Close — Verification Report

**Phase Goal:** Close the v1.2 milestone by deepening the v1.1 compare lane — user sees per-skill latency delta in `/sessions/compare` AND can jump from any session view to compare-with-previous via Cmd+K — then run the milestone-close audit (full test suite green, REQUIREMENTS.md traceability, archive-ready ROADMAP).
**Verified:** 2026-05-09T09:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `GET /api/sessions/compare` returns `skill_latencies` per side via `_build_compare_side`, with `low_sample_a/b` flags at <30 samples; CMPR-04 9-SQL budget and over-cap fallback still hold | VERIFIED | See detail below |
| 2 | User can open Cmd+K from any session view and trigger "Compare with previous session"; `GET /api/sessions/{sid}/previous` returns most-recent same-`project_key` session with `ended_at IS NOT NULL`; action conditionally visible; self-compare guard present | VERIFIED | See detail below |
| 3 | Milestone-close audit: backend pytest green, frontend vitest green, Playwright e2e green, `cmc doctor` clean; REQUIREMENTS.md traceability 12/12 active Complete + SKLP-11 Deferred to v1.3; ROADMAP archive-ready | VERIFIED | See detail below |
| 4 | CMPR-05 tabular-only invariant: no diff library (`diff`, `jsdiff`, `react-diff`) in shipped frontend code | VERIFIED | See detail below |

**Score:** 4/4 truths verified

---

## Must-Have 1: CMPR-06 Backend

**Truth:** `GET /api/sessions/compare` returns `skill_latencies` dict on each side via `_build_compare_side`, with `low_sample_a/b` flags suppressing delta when sample count <30; existing CMPR-04 9-SQL budget and over-cap fallback both hold.

### Artifact Checks

| Artifact | Status | Evidence |
|----------|--------|---------|
| `backend/cmc/api/routes/sessions.py` | VERIFIED | File exists; `_build_compare_side` function at line 171 computes `skill_latencies` dict and `duration_sample_count` via `_COMPARE_SKILLS_LATENCIES_SQL` (single rollup CTE). Returns `(SessionCompareSide, int)` tuple. |
| `backend/cmc/api/schemas/sessions.py` | VERIFIED | `SessionCompareSide.skill_latencies: dict[str, int] = Field(default_factory=dict)` at line 157. `SessionCompareResponse.low_sample_a: bool = False` and `low_sample_b: bool = False` at lines 191-192. |
| `backend/tests/test_sessions_router.py` | VERIFIED | 40 tests pass (`uv run pytest tests/test_sessions_router.py -v` → "40 passed in 6.87s"). |

### Key Logic Checks

**`_build_compare_side` computes `skill_latencies`:** Lines 205-213 run `_COMPARE_SKILLS_LATENCIES_SQL` (a WITH-clause query combining `skill_events`, `skills_seen`, `ranked`, `per_skill_p95`, `total_samples`) and builds `skill_latencies: dict[str, int]` from the result. This is one SQL statement per side — replaces the Phase-16 skill-set-only query, preserving CMPR-04 budget.

**`low_sample_a/b` set at <30:** Line 386-387: `low_sample_a=duration_samples_a < 30`, `low_sample_b=duration_samples_b < 30`.

**SQL budget test (9 under-cap, 8 over-cap):** `test_compare_sql_budget_preserved_under_cap_and_over_cap` (line 960) uses `_count_sql_statements` context manager (SQLAlchemy `before_cursor_execute` event). Asserts `c1["n"] == 9` (under-cap) and `c2["n"] == 8` (over-cap side A skips tool_counts query). Both pass in the 40-test suite.

**Low-sample boundary test:** `test_compare_low_sample_threshold_boundary` (line 905) seeds 29 events for side A (→ `low_sample_a=True`) and 30 events for side B (→ `low_sample_b=False`). Passes.

**Over-cap still returns `skill_latencies`:** Line 708-712 in tests assert `isinstance(body["a"]["skill_latencies"], dict)` even when side is over-cap. Route logic confirms: skills rollup runs unconditionally; only `_COMPARE_TOOL_COUNTS_SQL` is skipped on over-cap.

**Self-compare guard:** Line 334-336: `if a == b: raise HTTPException(status_code=400, detail="cannot compare a session with itself")`.

**Result: VERIFIED**

---

## Must-Have 2: CMPR-07 Backend + UX

**Truth:** `GET /api/sessions/{sid}/previous` returns most-recent same-`project_key` session with `ended_at IS NOT NULL`; Cmd+K action conditionally visible only when previous exists; self-compare guard prevents `a=b` URLs.

### Artifact Checks

| Artifact | Status | Evidence |
|----------|--------|---------|
| `backend/cmc/api/routes/sessions.py` — `/previous` endpoint | VERIFIED | `@router.get("/sessions/{sid}/previous")` at line 391. Filters `SessionModel.project_key == current.project_key` AND `SessionModel.ended_at.is_not(None)` AND `SessionModel.ended_at < current.ended_at`. Returns `{"session_id": prev_sid}` or 404. |
| `backend/cmc/api/schemas/sessions.py` — `SessionPreviousResponse` | VERIFIED | `SessionPreviousResponse` interface exists at line 213 in `frontend/src/lib/api.ts` (frontend schema). Backend returns raw `dict` — correct per ID-only design. |
| `frontend/src/lib/api.ts` | VERIFIED | `api.sessionsPrevious(sid)` defined at line 1103; `SessionPreviousResponse` interface at line 213; `SessionCompareSide.skill_latencies: Record<string, number>` at line 182; `low_sample_a/b: boolean` at lines 205-206. |
| `frontend/src/lib/queries.ts` | VERIFIED | `qk.sessionPrevious(sid)` cache key at line 135; `useSessionPrevious()` hook at line 419 with 404-→-null queryFn pattern (ApiError 404 caught, returns null). |
| `frontend/src/components/shell/ActiveSessionContext.tsx` | VERIFIED | File exists (new). Exports `ActiveSessionProvider` and `useActiveSession()`. Provides `activeSessionId` + `setActiveSessionId`. |
| `frontend/src/components/shell/AppShell.tsx` | VERIFIED | `ActiveSessionProvider` imported at line 5 and wraps the shell tree at line 39-47. |
| `frontend/src/components/ui/CommandPalette.tsx` | VERIFIED | Imports `useActiveSession` (line 67) and `useSessionPrevious` (line 64). `compareWithPreviousSourceId = activeSessionId ?? currentA ?? null` (line 104). `showCompareWithPrevious = Boolean(compareWithPreviousSourceId) && previousSid !== null` (line 115). Command.Item with `data-testid="cmdk-compare-with-previous"` rendered conditionally at lines 286-294. |
| `frontend/src/components/panels/LiveSessionsCard.tsx` | VERIFIED | `useActiveSession()` imported at line 26; `setActiveSessionId(activeSid)` called in `useEffect` at line 195-196 with cleanup on unmount. |
| `frontend/src/components/panels/SkillRunsTable.tsx` | VERIFIED | `useActiveSession()` imported at line 44; `setActiveSessionId(openSid)` at line 222 with cleanup at line 223. |

### Key Logic Checks

**`ended_at IS NOT NULL` filter:** `SessionModel.ended_at.is_not(None)` in the WHERE clause at line 424.

**`project_key`-based matching:** Line 423: `SessionModel.project_key == current.project_key`. (Note: REQUIREMENTS.md line 30 describes this as "same-cwd session" — a documentation inconsistency. The ROADMAP success criteria (the authoritative contract) correctly states "same-`project_key` session" and the implementation correctly uses `project_key`.)

**Ordered by `ended_at DESC, started_at DESC` with LIMIT 1:** Line 428-430.

**Empty case is 404:** Line 433: `raise HTTPException(status_code=404, detail="no previous session")`.

**Tests for `/previous`:** Tests at lines 1024-1180+ cover: happy path ordering, ignores `ended_at IS NULL` candidates, tie-breaker by `started_at`, 404 on no previous, 404 when current has no `project_key`. All 40 backend tests pass.

**Result: VERIFIED**

---

## Must-Have 3: Milestone-Close Audit

**Truth:** backend pytest, frontend vitest, Playwright e2e all green; `cmc doctor` clean; REQUIREMENTS.md traceability 13/13 v1.2 requirements accounted for (12 active Complete + 1 honestly Deferred to v1.3 for SKLP-11); ROADMAP.md archive-ready.

### Test Suite Results (Live Runs)

| Suite | Command | Result | Evidence |
|-------|---------|--------|---------|
| Backend pytest (sessions router) | `uv run pytest tests/test_sessions_router.py -v` | 40 passed | Executed during verification: "40 passed in 6.87s" |
| Backend pytest (full suite) | `uv run pytest --tb=no` | 661 passed | Executed during verification: "661 passed, 32 warnings in 183.48s" |
| Frontend vitest | `pnpm test --run` | 326 passed | Executed during verification: "Tests 326 passed (326), 70 files" |
| Playwright e2e | Documented in 23-VALIDATION.md | 13 passed, 0 failed, 2 skipped | Per VALIDATION.md gate table (both skips are documented dev-DB-state-dependent, pre-existing, not Phase 23 regressions) |
| `cmc doctor` | Documented in 23-VALIDATION.md | 7 ✓, 0 ✗, 1 ⚠ | Port-perms warning is psutil-needs-root, pre-existing across all v1.2 phases |

### REQUIREMENTS.md Traceability

| Check | Result |
|-------|--------|
| Active requirements with `[x]` | 12 (grep count confirmed) |
| SKLP-11 status | Preserved under "Future Requirements (deferred)" section — "Deferred to v1.3 (Phase 22 spike negative finding)" |
| CMPR-06 marked Complete | Confirmed at line 29 with commit references |
| CMPR-07 marked Complete | Confirmed at line 30 with commit references |
| ALRT-13 backfill | Confirmed at line 24 with commit reference `c2a7793` (was stale `[ ]`, fixed in task 23-04-02) |
| Coverage block | "13 total (12 active + 1 honestly deferred to v1.3)" at line 102 |
| Traceability table | 13 rows mapped: 12 Complete + 1 Deferred |

### ROADMAP Archive

| Check | Result |
|-------|--------|
| `.planning/milestones/v1.2-ROADMAP.md` exists | Yes — 21,906 bytes (~21KB) |
| ROADMAP.md v1.2 status | `✅ v1.2 Depth & Polish — Phases 18–23, 22 plans (shipped 2026-05-09)` |
| Phase 23 progress row | 4/4 Complete 2026-05-09 (confirmed in ROADMAP.md) |

**Result: VERIFIED**

---

## Must-Have 4: CMPR-05 Tabular-Only Invariant

**Truth:** No diff library (`diff`, `jsdiff`, `react-diff`) in shipped frontend code.

### Checks

| Check | Command | Result |
|-------|---------|--------|
| Import scan: `from "diff"` / `from 'diff'` in `frontend/src/**` | `grep -rn "\"diff\"\|'diff'" frontend/src/ --include="*.ts" --include="*.tsx"` | 0 matches (only a comment in `SessionCompareView.tsx` line 24 mentioning "NO react-diff-viewer/jsdiff") |
| Import scan: `react-diff` in `frontend/src/**` | Same grep with `react-diff` | 0 matches |
| `jsdiff` in `frontend/src/**` | Same grep with `jsdiff` | 0 matches |
| Package.json dependencies | `python3` JSON parse of all dep names containing 'diff' | 0 matches (no diff library in dependencies or devDependencies) |
| `pnpm list` for diff packages | `pnpm list 2>&1 \| grep -i diff` | 0 results |

The only occurrence of "diff" in `frontend/src/` source files is:
- `SessionCompareView.tsx` line 24: a comment `// CMPR-05 (structured tabular only): NO react-diff-viewer / jsdiff /` — this explicitly prohibits the pattern.
- Various uses of "diff" as a domain noun (skill-set diff, tool counts diff, `SkillSetDiff` type) — these are data model names, not library imports.

**Result: VERIFIED**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/cmc/api/routes/sessions.py` | `_build_compare_side` with `skill_latencies` + `previous` endpoint | VERIFIED | Lines 171-256 (`_build_compare_side`) and 391-435 (`previous_session`) |
| `backend/cmc/api/schemas/sessions.py` | `skill_latencies` on `SessionCompareSide`; `low_sample_a/b` on `SessionCompareResponse` | VERIFIED | Lines 157, 191-192 |
| `backend/tests/test_sessions_router.py` | SQL budget assertions + low-sample tests | VERIFIED | `_count_sql_statements` at line 76; budget test at line 960; low-sample boundary test at line 905 |
| `frontend/src/components/panels/SessionCompareView.tsx` | `SkillLatencySection` with delta suppression | VERIFIED | `SkillLatencySection` at line 372; wired at line 615 |
| `frontend/src/components/ui/CommandPalette.tsx` | `compare-with-previous` command conditionally rendered | VERIFIED | `cmdk-compare-with-previous` testid at line 290; guarded by `showCompareWithPrevious` |
| `frontend/src/components/shell/ActiveSessionContext.tsx` | New context with `activeSessionId` and `setActiveSessionId` | VERIFIED | File created; exports `ActiveSessionProvider` and `useActiveSession()` |
| `frontend/src/components/shell/AppShell.tsx` | `ActiveSessionProvider` wired | VERIFIED | Wraps tree at lines 39-47 |
| `frontend/src/lib/api.ts` | `SessionPreviousResponse` + `api.sessionsPrevious` | VERIFIED | Lines 213, 1103-1104 |
| `frontend/src/lib/queries.ts` | `qk.sessionPrevious` + `useSessionPrevious` with 404-→-null | VERIFIED | Lines 135, 419-438 |
| `frontend/tests/e2e/sessions-compare.spec.ts` | TEST-23-CMPR-06 + TEST-23-CMPR-07 | VERIFIED | 3 test blocks in file: TEST-05b (line 22), TEST-23-CMPR-06 (line 142), TEST-23-CMPR-07 (line 273) |
| `.planning/REQUIREMENTS.md` | CMPR-06/07 Complete, SKLP-11 Deferred | VERIFIED | 12 `[x]` items; SKLP-11 under "Future Requirements (deferred)" |
| `.planning/milestones/v1.2-ROADMAP.md` | Exists, ~21KB, retrospective structure | VERIFIED | 21,906 bytes; "Status: SHIPPED 2026-05-09" in header |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `CommandPalette.tsx` | `ActiveSessionContext` | `useActiveSession()` import | WIRED | Import at line 67; `activeSessionId` read at line 103 |
| `CommandPalette.tsx` | `useSessionPrevious` | `queries.ts` hook | WIRED | Import at line 64; called at line 105 with `compareWithPreviousSourceId` |
| `CommandPalette.tsx` | `/sessions/compare` route | `navigate({ to: '/sessions/compare', search: ... })` | WIRED | `onCompareWithPreviousSelect` at lines 163-173 |
| `LiveSessionsCard.tsx` | `ActiveSessionContext` | `setActiveSessionId` in useEffect | WIRED | Lines 193-196 mirror `activeSid` into context with cleanup |
| `SkillRunsTable.tsx` | `ActiveSessionContext` | `setActiveSessionId` in useEffect | WIRED | Lines 220-224 mirror `openSid` into context with cleanup |
| `AppShell.tsx` | `ActiveSessionProvider` | Provider wraps tree | WIRED | Lines 39-47 |
| `SessionCompareView.tsx` | `SkillLatencySection` | Rendered in `CompareBody` | WIRED | Line 615 |
| `_build_compare_side` | `_COMPARE_SKILLS_LATENCIES_SQL` | `await db.execute(...)` | WIRED | Lines 205-218 |
| `compare_sessions` handler | `low_sample_a/b` | `duration_samples < 30` | WIRED | Lines 386-387 |
| `previous_session` handler | `project_key` filter | SQLAlchemy `WHERE` clause | WIRED | Lines 423-424 |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SessionCompareView.tsx` | `data` (SessionCompareResponse) | `useSessionCompare()` → `api.sessionCompare(a, b)` → `GET /api/sessions/compare` | Yes — `_build_compare_side` runs SQL queries against otel_events table | FLOWING |
| `SkillLatencySection` | `data.a.skill_latencies`, `data.b.skill_latencies` | `_COMPARE_SKILLS_LATENCIES_SQL` CTE per side | Yes — reads `otel_events.body` for `duration_ms` attribute | FLOWING |
| `CommandPalette.tsx` | `previousSid` | `useSessionPrevious(activeSessionId)` → `api.sessionsPrevious(sid)` → `GET /api/sessions/{sid}/previous` | Yes — DB query on sessions table for `project_key` + `ended_at` | FLOWING |
| `CommandPalette.tsx` | `showCompareWithPrevious` | `Boolean(compareWithPreviousSourceId) && previousSid !== null` | Yes — gated on real DB lookup, not static | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend sessions router tests (SQL budget + low-sample) | `cd backend && uv run pytest tests/test_sessions_router.py -v` | 40 passed in 6.87s | PASS |
| Full backend pytest suite | `cd backend && uv run pytest --tb=no` | 661 passed, 32 warnings | PASS |
| Frontend vitest suite | `cd frontend && pnpm test --run` | 326 passed across 70 files | PASS |
| `frontend/src/` diff-library grep | `grep -rn "\"diff\"\|'diff'\|react-diff\|jsdiff" frontend/src/` | 0 import matches | PASS |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No stubs, placeholder returns, or hardcoded empty data found in Phase 23 files. All dynamic data paths are connected to real backend queries.

---

## Requirements Coverage

| Requirement | Phase | Status | Evidence |
|-------------|-------|--------|---------|
| CMPR-06 | 23 | SATISFIED | `skill_latencies` dict on each `SessionCompareSide`; `low_sample_a/b` on `SessionCompareResponse`; SkillLatencySection in UI; TEST-23-CMPR-06 in e2e |
| CMPR-07 | 23 | SATISFIED | `/api/sessions/{sid}/previous` endpoint; `useSessionPrevious` hook; `ActiveSessionContext`; `cmdk-compare-with-previous` command; TEST-23-CMPR-07 in e2e |

---

## Notes on Known Deviations (Accepted, Not Gaps)

**Picker scoping uses `cwd` instead of `project_key`:** The frontend compare picker filters candidates by `cwd` equality as a project-identity proxy (D-12 intent honored — same `realpath` implies same `project_key`). The wire APIs (`SessionListItemFull`, `SessionCompareSide`) do not expose `project_key` directly. This is explicitly documented in `CommandPalette.tsx` header comments and the 23-02 SUMMARY as an intentional design choice, not a gap. The backend `/previous` endpoint correctly uses `project_key` for the authoritative resolution.

**REQUIREMENTS.md CMPR-07 wording uses "same-cwd":** Line 30 of REQUIREMENTS.md describes the `/previous` endpoint as "returns most-recent same-cwd session". The ROADMAP success criteria (the authoritative contract) correctly says "same-`project_key` session". The implementation uses `project_key`. This is a minor documentation inconsistency in REQUIREMENTS.md — the code is correct.

**Two Playwright skips at milestone close:** `alerts.spec.ts:40 TEST-05a` (no recently-failed task in dev DB) and `skills-detail.spec.ts:25 SKLP-08/09/10` (no seeded skill row). Both are dev-DB-state-dependent, pre-existing, and documented via the `skip-with-reason` pattern. Neither is a Phase 23 regression.

---

## Human Verification Required

None — all must-haves verified programmatically.

---

## Gaps Summary

No gaps. All four must-have truths are VERIFIED against the actual codebase:

1. **CMPR-06 backend:** `_build_compare_side` extension with `skill_latencies` dict, `low_sample_a/b` flags at <30 threshold, and SQL budget pinned at 9 (under-cap) / 8 (over-cap) via counter assertions — all confirmed in live code and 40-test suite (all pass).

2. **CMPR-07 backend + UX:** `/previous` endpoint uses `project_key` + `ended_at IS NOT NULL` filter with correct ordering; `ActiveSessionContext` wired through `AppShell` into `LiveSessionsCard`, `SkillRunsTable`, and `CommandPalette`; `cmdk-compare-with-previous` Command.Item conditionally rendered; self-compare guard at route level — all confirmed.

3. **Milestone-close audit:** 661 backend tests pass, 326 frontend tests pass; REQUIREMENTS.md has 12 `[x]` active complete + SKLP-11 honestly deferred; ROADMAP.md marked SHIPPED 2026-05-09; `.planning/milestones/v1.2-ROADMAP.md` exists at 21,906 bytes — all confirmed.

4. **CMPR-05 invariant:** Zero diff-library imports in `frontend/src/**` confirmed by grep; zero diff packages in `package.json` confirmed by parse — invariant holds.

---

_Verified: 2026-05-09T09:00:00Z_
_Verifier: Claude (gsd-verifier)_
