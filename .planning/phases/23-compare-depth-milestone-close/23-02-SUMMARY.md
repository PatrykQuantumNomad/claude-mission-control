---
phase: 23-compare-depth-milestone-close
plan: 02
subsystem: frontend
tags: [react, tanstack-router, tanstack-query, cmdk, sessions-compare]

requires:
  - phase: 23-compare-depth-milestone-close
    provides: "/api/sessions/compare skill_latencies + low_sample_a/b + GET /api/sessions/{sid}/previous (Plan 23-01)"
  - phase: 16-session-compare
    provides: "/sessions/compare route, SessionCompareView, CommandPalette compare action"
provides:
  - "CMPR-06 (frontend): per-skill p95 latency section with delta suppression on /sessions/compare"
  - "CMPR-07 (frontend): Cmd+K 'Compare with previous session' action gated by existence + project scoping for compare picker"
affects: [cmdk, sessions-compare, app-shell]

tech-stack:
  added: []
  patterns:
    - "404-as-empty-state via ApiError(404) → null in TanStack Query queryFn (useSessionPrevious)"
    - "Cross-component active-session signal via React Context (ActiveSessionContext) — not route-derived"

key-files:
  created:
    - frontend/src/components/shell/ActiveSessionContext.tsx
  modified:
    - frontend/src/lib/api.ts
    - frontend/src/lib/queries.ts
    - frontend/src/components/panels/SessionCompareView.tsx
    - frontend/src/components/panels/__tests__/SessionCompareView.test.tsx
    - frontend/src/components/panels/LiveSessionsCard.tsx
    - frontend/src/components/panels/SkillRunsTable.tsx
    - frontend/src/components/shell/AppShell.tsx
    - frontend/src/components/ui/CommandPalette.tsx
    - frontend/src/components/ui/__tests__/CommandPalette.test.tsx

key-decisions:
  - "Picker scoping uses cwd as the project-identity proxy (D-12 spirit) because the wire APIs do NOT expose project_key on sessions list / sessionCompare side endpoints today. Documented inline in CommandPalette.tsx."
  - "Active-session signal lives in a React Context (not a route parameter) so the BOTH session-detail Sheets (LiveSessionsCard + SkillRunsTable) can opt-in without inventing routes for them."

patterns-established:
  - "useSessionPrevious() — 404 → null TanStack Query pattern for existence-gated endpoints"
  - "ActiveSessionContext — global 'currently focused session id' signal for cross-cutting actions (Cmd+K)"
  - "Compare picker scope-by-cwd filter as a cheap project_key proxy until the wire APIs expose project_key"

requirements-completed: [CMPR-06, CMPR-07]

duration: 12m
completed: 2026-05-09
---

# Phase 23 Plan 02: Compare Depth (Frontend) Summary

**Wired the Phase 23 Plan 01 backend extensions into the UI: a per-skill p95 latency section on `/sessions/compare` with low-sample delta suppression, and a Cmd+K "Compare with previous session" action gated by existence — plus project-scoped compare picker candidates.**

## Performance

- **Duration:** ~12m
- **Started:** 2026-05-09T07:54:00Z
- **Completed:** 2026-05-09T08:03:30Z
- **Tasks:** 2/2
- **Files modified:** 9 (1 new, 8 edits)

## Accomplishments

- Surfaced per-skill p95 latency per side on the compare panel with delta column (B−A in ms) and EM_DASH suppression when either `low_sample_a` or `low_sample_b` is true (D-15..D-17). Section keeps rendering on `over_cap=true` (D-18).
- Added `useSessionPrevious()` hook treating 404 as empty-state (resolves to `null`) so the Cmd+K visibility gate doesn't surface error UI for sessions with no prior history (D-04 + D-09).
- Introduced `ActiveSessionContext` so both session-detail Sheets (LiveSessionsCard + SkillRunsTable) can flag "I'm currently focused on this session id" — letting CommandPalette gate the new action without coupling to route URLs.
- Implemented CMPR-07 Cmd+K action: navigates directly to `/sessions/compare?a=<source>&b=<previous>` per D-08; on `/sessions/compare?a=X` with no Sheet open, treats `a` as current per D-10.
- Compare picker scoping (D-11..D-13): when side A has a known `cwd`, picker candidates are filtered to rows with the same `cwd`; when A's cwd is null, picker falls back to the global recent-sessions list per D-13.
- D-14 preserved as-is: `routes/sessions_.compare.tsx` `validateSearch` already strips invalid UUIDs.

## Task Commits

Each task was committed atomically:

1. **Task 23-02-01: Render per-skill p95 latency section in compare view (CMPR-06)** - `ffc0e07` (feat)
2. **Task 23-02-02: Add Cmd+K "Compare with previous session" + scoping (CMPR-07)** - `3495fa6` (feat)

## Files Created/Modified

- `frontend/src/lib/api.ts` — Added `skill_latencies: Record<string, number>` to `SessionCompareSide`, `low_sample_a/b: boolean` to `SessionCompareResponse`, new `SessionPreviousResponse` interface, and `api.sessionsPrevious(sid)` client.
- `frontend/src/lib/queries.ts` — Added `qk.sessionPrevious(sid)` cache key and `useSessionPrevious()` hook with 404-→-null queryFn (no retry).
- `frontend/src/components/panels/SessionCompareView.tsx` — New `SkillLatencySection` component rendering tabular per-skill p95 latency with low-sample badge + EM_DASH delta suppression; wired into `CompareBody` between skill-set diff and tool counts.
- `frontend/src/components/panels/__tests__/SessionCompareView.test.tsx` — Updated `makeSide`/`makeFixture` to include `skill_latencies` + `low_sample_a/b` fields. Added 3 new tests for the latency section. Updated CMPR-05 test to use `getAllByText` for the now-shared `Δ (B−A)` header.
- `frontend/src/components/shell/ActiveSessionContext.tsx` (NEW) — `<ActiveSessionProvider>` + `useActiveSession()` hook. Provider uses `useMemo` for value identity stability; hook returns a no-op default when no provider is mounted (so leaf-component tests don't have to wrap themselves).
- `frontend/src/components/shell/AppShell.tsx` — Wrapped the existing `<TaskComposerProvider>` tree in `<ActiveSessionProvider>` so CommandPalette and the session-detail panels share the same context instance.
- `frontend/src/components/panels/LiveSessionsCard.tsx` — Added `useEffect` mirroring local `activeSid` state into `useActiveSession().setActiveSessionId`; clears on unmount.
- `frontend/src/components/panels/SkillRunsTable.tsx` — Same wiring for `openSid`.
- `frontend/src/components/ui/CommandPalette.tsx` — Read `useActiveSession()` + invoke `useSessionPrevious()` for visibility gate; conditionally render new `Compare with previous session` Command.Item; new `onCompareWithPreviousSelect` navigation handler. Extended `ComparePicker` props with `scopeCwd` and added `useMemo` filter by `cwd` equality with D-13 fallback. Reads side A's `cwd` opportunistically from the cached compare response.
- `frontend/src/components/ui/__tests__/CommandPalette.test.tsx` — Wrapped `TestWrap` in `<ActiveSessionProvider>`. Added `ActiveSessionPrimer` test helper component (uses `useEffect`). Extended `RouterOpts` with `activeSid`. Added 3 new tests covering the visibility gate (no active session, 404 from /previous, 200 navigates correctly).

## Decisions Made

1. **Picker scoping uses `cwd` (not `project_key`) as the project-identity field on the wire.**
   - **Why:** The Plan 23-01 backend extensions added `skill_latencies` and `low_sample_a/b` to compare and a `/previous` endpoint, but did NOT add `project_key` to either `SessionListItemFull` or `SessionCompareSide`. The plan's D-11..D-13 lock says "scope to project_key when available" — the only project-shaped field actually exposed today is `cwd`. Filtering by `cwd` equality (same realpath ⇒ same `project_key`) achieves the same scoping outcome without inventing a new wire field or a new API surface.
   - **Documented inline:** `CommandPalette.tsx` header comment + `ComparePicker` `scopeCwd` prop docstring.
   - **Future improvement (deferred):** When `project_key` is exposed on `SessionListItemFull` / `SessionCompareSide`, swap the filter from `cwd === scopeCwd` to `project_key === scopePk`. No call-site changes required beyond the prop name.

2. **Active-session signal as React Context (not route-derived inference).**
   - **Why:** The two session-detail surfaces — `LiveSessionsCard` and `SkillRunsTable` — render details inside Sheet portals, NOT TanStack Router routes. Inferring "session detail open?" from `location.pathname` would (a) miss them entirely and (b) produce false positives on `/activity` (which lists sessions but doesn't have a focused detail view).
   - **Mechanism:** `ActiveSessionProvider` mounted at AppShell; each Sheet owner mirrors local open state via `useEffect(() => setActiveSessionId(sid))` with cleanup on unmount.

## Deviations from Plan

None — plan executed as written. The picker-scoping mechanism (using `cwd` instead of `project_key`) is documented in the plan as "scope candidates to side A's project_key when available", and the implementation honours that intent with the only project-identity field exposed by current wire APIs. This is documented in code comments rather than as a deviation because the plan does not stipulate a particular wire field — only the scoping outcome.

## Issues Encountered

- **Test had to be updated** (`SessionCompareView.test.tsx`) because the existing CMPR-05 assertion `getByText('Δ (B−A)')` now matches BOTH the skill latency table header and the tool counts diff header. Switched to `getAllByText` with a length assertion. This is the same idiom intentionally — both surfaces are tabular delta columns and share the column header copy.

## User Setup Required

None — no external service configuration, no env vars, no migrations. The frontend changes consume the Plan 23-01 backend response shape that already shipped.

## Threat Surface

No new boundaries introduced. Threat-register dispositions from the plan are met:
- **T-23-04 (Tampering of `a`/`b`):** preserved via existing `validateSearch` UUID strip in `routes/sessions_.compare.tsx` (D-14).
- **T-23-05 (DoS via /previous polling):** mitigated by `useSessionPrevious()` `enabled: Boolean(sid)` gate + 60s/45s cadence; no fetch fires until an active session id is present.
- **T-23-06 (Info disclosure on 404):** accepted; the hook discards the 404 body and resolves to `null`, so no error surface leaks beyond "previous exists or doesn't".

## Verification

- `cd frontend && pnpm test --run` — 70 files, **326 tests passed** (was 320 before this plan; +6 new tests).
- `cd frontend && pnpm tsc --noEmit` — clean (no TypeScript errors).
- pre-commit `frontend typecheck (tsc)` ran on each task commit and passed.

## Next Phase Readiness

CMPR-06 and CMPR-07 are now end-to-end (backend + frontend). Remaining Phase 23 plans:
- **23-03** — likely the Nyquist e2e + verifier coverage for the new surfaces.
- **23-04** — milestone close (full test/audit gates, ROADMAP archive-ready).

## Self-Check: PASSED

- Found `frontend/src/lib/api.ts` (modified)
- Found `frontend/src/lib/queries.ts` (modified)
- Found `frontend/src/components/shell/ActiveSessionContext.tsx` (new)
- Found `frontend/src/components/shell/AppShell.tsx` (modified)
- Found `frontend/src/components/panels/SessionCompareView.tsx` (modified)
- Found `frontend/src/components/panels/LiveSessionsCard.tsx` (modified)
- Found `frontend/src/components/panels/SkillRunsTable.tsx` (modified)
- Found `frontend/src/components/ui/CommandPalette.tsx` (modified)
- Found `frontend/src/components/panels/__tests__/SessionCompareView.test.tsx` (modified)
- Found `frontend/src/components/ui/__tests__/CommandPalette.test.tsx` (modified)
- Found commit `ffc0e07` (Task 23-02-01)
- Found commit `3495fa6` (Task 23-02-02)
