# Phase 23: Compare Depth & Milestone Close - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Deepen the existing session comparison lane by:

- Extending the compare API + UI to show **per-skill p95 latency** per side and suppress deltas when low-sample
- Adding a Cmd+K action from session views: **Compare with previous session**
- Closing the v1.2 milestone with full test/audit gates (green suites, traceability, archive-ready roadmap)

</domain>

<decisions>
## Implementation Decisions

### Previous-session endpoint contract (`GET /api/sessions/{sid}/previous`)
- **D-01:** “Same project” is **same `project_key` only**.
- **D-02:** “Previous” is **most recent by `ended_at` strictly less than current session’s `ended_at`**, ignoring sessions with `ended_at IS NULL`.
- **D-03:** Tie-breaker is **highest `started_at`** when multiple candidates tie.
- **D-04:** If no previous session exists, return **404** with `{error: "no previous session"}`.
- **D-05:** No additional skipping rules (no minimum tool calls, no “successful only” filter).
- **D-06:** Response body is **ID-only**: `{session_id: <uuid>}`.

### Cmd+K “Compare with previous session” UX
- **D-07:** Action is available **only on session detail views** (“from any session view”).
- **D-08:** Action behavior: **navigate directly** to `/sessions/compare?a=<current>&b=<previous>`.
- **D-09:** Action is **hidden unless a previous session exists**.
- **D-10:** If user is on `/sessions/compare` and `a` exists, treat `a` as current and set `b` to previous-of-`a`.

### Compare picker scoping
- **D-11:** When choosing session B (picker/helper flows), candidate list is **scoped to Side A’s `project_key`**.
- **D-12:** Scoping identity is **`project_key` everywhere**.
- **D-13:** If Side A has no `project_key`, **do not scope** (fall back to global list).
- **D-14:** Keep current `/sessions/compare` behavior of **stripping invalid UUIDs** for `a`/`b` (do not hard-fail).

### Per-skill latency delta data contract
- **D-15:** `skill_latencies` is **per-skill p95 latency** per side.
- **D-16:** Low-sample threshold is **30**; expose `low_sample_a` / `low_sample_b`.
- **D-17:** If either side is low-sample, **suppress delta calculation** (still return raw per-skill latencies + low-sample flags).
- **D-18:** `over_cap` should **still include `skill_latencies`**; only skip the heavy tool-counts query as today.

### Claude's Discretion
None — decisions above are locked.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/ROADMAP.md` — Phase 23 goal + success criteria + requirements (CMPR-06, CMPR-07).
- `.planning/REQUIREMENTS.md` — requirement definitions for CMPR-06/CMPR-07 + v1.2 milestone-close traceability contract.
- `.planning/PROJECT.md` — locked product constraints (localhost-only, tabular-only compare, no raw message diff).

### Backend compare + sessions routes
- `backend/cmc/api/routes/sessions.py` — `GET /api/sessions/compare`, `_build_compare_side`, over-cap behavior, existing guards.
- `backend/cmc/api/schemas/sessions.py` — `SessionCompareResponse` / `SessionCompareSide` schema to extend.
- `backend/cmc/db/models/sessions.py` — `Session` model fields including `project_key`, `ended_at`, `started_at`.

### Frontend compare route + command palette
- `frontend/src/routes/sessions_.compare.tsx` — `/sessions/compare` route + `validateSearch` behavior.
- `frontend/src/components/panels/SessionCompareView.tsx` — compare rendering composition + current diff rows.
- `frontend/src/components/ui/CommandPalette.tsx` — existing compare action + picker patterns to extend.
- `frontend/src/components/panels/SessionsTable.tsx` — row-level “Compare” navigation entrypoint.

### Existing compare tests
- `backend/tests/test_sessions_router.py` — existing compare endpoint tests + over-cap behavior assertions.
- `frontend/tests/e2e/sessions-compare.spec.ts` — e2e compare flow coverage.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/ui/CommandPalette.tsx`: already has a compare action + `ComparePicker` pattern and navigation helpers.
- `frontend/src/components/panels/SessionCompareView.tsx`: already composes side A/B columns and diff rows; can add a skill-latency delta row/section without introducing diff libraries.

### Established Patterns
- Compare backend uses `_build_compare_side` and skips expensive work when `over_cap` (currently: skip tool_counts query and return `{}`).
- Frontend routing uses TanStack Router file routes and `validateSearch` to sanitize `a`/`b`.

### Integration Points
- Backend: `backend/cmc/api/routes/sessions.py` for new `/previous` endpoint and compare-side extension.
- Frontend: `CommandPalette` for the new context-aware action; session detail route(s) for providing “current session id”.

</code_context>

<specifics>
## Specific Ideas

No additional specifics — follow established patterns and the locked decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 23-Compare Depth & Milestone Close*
*Context gathered: 2026-05-08*
