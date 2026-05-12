---
phase: 25-saved-views-backend-frontend
plan: 04
subsystem: frontend/routes
tags: [VIEW-01, validateSearch, url-state, append-only, skills-detail]
requires:
  - frontend/src/lib/searchSchemas.ts (Plan 03)
  - frontend/src/lib/api.ts SkillRange (Phase 14 baseline)
provides:
  - /skills/$name URL search state with { schemaVersion: 1, range: '7d'|'14d'|'30d' }
  - SkillsDetailRange + SkillsDetailSearch exported types
  - validateSearch as named export (vitest-targetable)
  - narrowToSkillRange helper bridging URL → backend SkillRange
affects:
  - frontend/src/routes/skills_.$name.tsx (validateSearch added; SkillLatencySnapshot prop-lift; Link search prop)
key_files:
  created:
    - frontend/src/lib/__tests__/skillsDetailRange.test.tsx
  modified:
    - frontend/src/routes/skills_.$name.tsx
tech_stack:
  added: []
  patterns:
    - "validateSearch as named export (vitest entry point pattern, mirrors Plan 03)"
    - "URL-state vs backend-state divergence bridge (narrowToSkillRange) — pattern for future Phase 26+ filter hoists"
decisions:
  - "URL `range` accepts '7d'|'14d'|'30d' (superset of backend SkillRange = '14d'|'30d'); '7d' narrows to '14d' at the data-hook boundary so deep-links/saved-views survive while backend stays untouched"
  - "Default `range` is '14d' (locked invariant — Pitfall 3; preserves pre-Phase-25 page behavior for every deep-link without ?range=)"
  - "SkillCostCard's internal user-facing RangeToggle stays untouched per Plan 04 Task 1 explicit instruction (user-facing toggle remains panel-local; Phase 26/27 may unify with page-level URL state)"
  - "validateSearch exported as named function (not just via Route.options.validateSearch) — mirrors Plan 03's export convention so vitest entry stays direct"
  - "Plan 04 Task 1 (panel audit) produced NO panel-file edits — SkillProjectsTable already accepts `range`; SkillRunsTable has no range concept (uses limit); SkillLatencySnapshot lives inline in the route file (not a standalone panel); SkillCostCard's range stays internal. Audit-only conclusion documented; no spurious refactor"
metrics:
  duration: "~6 min"
  completed_date: 2026-05-12
  vitest_delta: "353 → 361 (+8 new specs)"
  tasks_completed: 3
  commits: 2
---

# Phase 25 Plan 04: /skills/$name range filter hoisted to URL state — Summary

## One-liner

`/skills/$name` now accepts `?range=7d|14d|30d` URL search state via `validateSearch` (default `14d` preserves pre-plan behavior), threading the value into `SkillProjectsTable` and the inline `SkillLatencySnapshot` so Phase 25 success criterion 1 (user-saveable named views on the skill-detail page) is now achievable — the URL contains a meaningful filter to save.

## Why this plan was the only Phase 25 route adding a new search field

Per Phase 25 RESEARCH §Per-Route Search-Shape Delta and ROADMAP success criterion 1, `/skills/$name` is the demonstration route for the saved-views feature: it had a hard-coded `'14d'` literal in two places (`SkillLatencySnapshot` line 48; `SkillProjectsTable` invocation line 172) that — pre-plan — was inaccessible to URL state or to a future saved-view hydration. Without lifting that literal to URL search state, there would be nothing meaningful to save on `/skills/$name`.

## What changed

### `frontend/src/routes/skills_.$name.tsx` (modified)

1. **`validateSearch` added** returning `{ schemaVersion: 1, range: '7d' | '14d' | '30d' }` with default `'14d'`. Exported as named function so vitest can import it directly (mirrors Plan 03's convention on `routes/index.tsx`, `routes/activity.tsx`, etc.).
2. **`SkillLatencySnapshot` lifted** from internal hard-coded `'14d'` to a `range?: SkillsDetailRange = '14d'` prop. The prop default preserves the pre-Phase-25 default for any (current or future) caller that omits it. Caption + reqId label now interpolate the live range value.
3. **Page reads `range` from `Route.useSearch()`** and threads it into both panels via prop.
4. **`narrowToSkillRange` helper** maps URL's `SkillsDetailRange` ('7d' | '14d' | '30d') down to backend's `SkillRange` ('14d' | '30d') by mapping `'7d' → '14d'`. The URL value stays canonical (so the validateSearch round-trip is lossless and saved views work as-is); only the data-hook boundary narrows.
5. **`<Link to="/skills">` updated** with `search={{ schemaVersion: SCHEMA_VERSION }}` — required because Plan 03 added `validateSearch` to `/skills` making `schemaVersion` mandatory on `<Link>` navigation. Rule 3 deviation (blocking issue caused by parallel Plan 03 changes in my file's import graph).

### `frontend/src/lib/__tests__/skillsDetailRange.test.tsx` (created)

8 vitest specs:
1. `validateSearch({})` defaults to `{ schemaVersion: 1, range: '14d' }`
2-4. `it.each(['7d', '14d', '30d'])` preserves each valid range
5. Invalid string range (`'bogus'`) coerced to default
6. Non-string range (`30`) coerced to default
7. Unknown fields (`{ foo: 'bar' }`) dropped
8. `schemaVersion` is always `1` — explicit regression guard against silent version drift

## Tasks executed

### Task 1 — Audit panels for `range` prop & lift internal hard-codes

Audit-only task. Findings:

| Panel | Has `range` prop? | Action |
|---|---|---|
| `SkillProjectsTable` | YES — accepts `range: SkillRange` | No change needed |
| `SkillRunsTable` | NO range concept (uses `limit: number = 25`) | No change needed — range is N/A for this panel |
| `SkillLatencySnapshot` | Inline in route file (not a standalone panel); hard-coded `'14d'` | Lifted to prop in Task 2 (same file) |
| `SkillCostCard` | Internal `useState('14d')` + RangeToggle (user-facing toggle) | LEFT per plan Task 1 instruction: "the user-facing toggle stays internal; Phase 26/27 may revisit" |

**Task 1 produced no separate commit** because no panel files needed modification. The plan's `<files>` list overstated the scope; the only file requiring edits (`skills_.$name.tsx`) is also Task 2's target. This is consistent with Task 1's stated intent: "a small surface lift, not a refactor". The audit conclusion is documented here (not in a commit) so future readers can verify the audit was performed.

Commit: none (audit-only).

### Task 2 — Add validateSearch + thread URL state

Commit `5e79a22` — `feat(25-04): hoist /skills/$name range filter to URL search state`

77 insertions / 10 deletions in `frontend/src/routes/skills_.$name.tsx`.

- `validateSearch` exported.
- `SkillLatencySnapshot` accepts optional `range` prop with default `'14d'`.
- `<SkillProjectsTable range={skillRange}>` + `<SkillLatencySnapshot range={range}>` now read from URL.
- `narrowToSkillRange` helper bridges URL ↔ backend range.
- `<Link to="/skills">` updated with `search={{ schemaVersion: SCHEMA_VERSION }}`.

### Task 3 — Vitest covering range deep-link round-trip + default fallback

Commit `625dc01` — `test(25-04): cover /skills/$name validateSearch range round-trip`

60 insertions; new file `frontend/src/lib/__tests__/skillsDetailRange.test.tsx`. 8 specs pass.

## Verification results

| Gate | Result | Notes |
|---|---|---|
| `cd frontend && pnpm test --run` | **361/361 pass** | Was 353 baseline; +8 from this plan |
| `cd frontend && pnpm tsc --noEmit` on my files | **clean** | Plan 03's parallel uncommitted work has tsc errors in `CommandPalette.tsx`, `SessionsTable.tsx`, `sessions_.compare.tsx`, `activity.tsx`, etc.; those are Plan 03's responsibility — pre-commit hook auto-stashes them so my commits gate against ONLY my files + already-committed state |
| `cd frontend && pnpm lint` | **exit 0** | ESLint flat config clean |
| `cd frontend && pnpm build` | **clean** | Vite build succeeds; emits `skills_._name-D9j0BxWa.js` |
| `cd backend && uv run pytest tests/test_url_contract.py` | **2/2 PASS** | No route renames; `/skills/$name` documented; route file still at `routes/skills_.$name.tsx` |

## Deviations from plan

### Rule 3 — Blocking issue auto-fixed

**1. [Rule 3 — Blocking] `<Link to="/skills">` required `search` prop**

- **Found during:** Task 2 tsc verification.
- **Issue:** Plan 03 (running in parallel) added `validateSearch` to `routes/skills.tsx` with required `schemaVersion` field. This made every `<Link to="/skills">` callsite require a `search` prop — including the back-link in my file's header.
- **Fix:** Added `search={{ schemaVersion: SCHEMA_VERSION }}` to the back-link and imported `SCHEMA_VERSION` from `../lib/searchSchemas`.
- **Why this fix is mine (not Plan 03's):** The error landed inside MY file (`skills_.$name.tsx:209`). Pre-commit hook would have blocked my commit otherwise. Plan 03's responsibility is the other unmodified files (`CommandPalette.tsx`, `sessions_.compare.tsx`, etc.) which I deliberately did NOT touch.
- **Files modified:** `frontend/src/routes/skills_.$name.tsx`.
- **Commit:** `5e79a22` (folded into Task 2's commit).

### Rule 2 — Missing critical functionality auto-added

**2. [Rule 2 — Missing] URL `SkillsDetailRange = '7d'|'14d'|'30d'` vs backend `SkillRange = '14d'|'30d'` mismatch**

- **Found during:** Task 2 implementation.
- **Issue:** The plan mandates `range: '7d' | '14d' | '30d'` on the URL, but backend `cmc/api/schemas/skills.py:30` defines `SkillRange = Literal["14d", "30d"]`. Without bridging, a deep-link `?range=7d` would either tsc-fail at the panel call site (if forwarded as-is) or cause backend 422 (if cast through).
- **Fix:** Introduced `narrowToSkillRange(r: SkillsDetailRange): SkillRange` that maps `'7d' → '14d'`; URL state stays canonical (so `validateSearch({ range: '7d' })` → `{ range: '7d' }` per plan test), and the page narrows at the data-hook boundary. Documented in the route file's header comment.
- **Why this is Rule 2:** Without this helper, the plan's contract (`?range=7d` works as a deep-link) would silently break in production. The bridge is correctness work, not new architecture.
- **Forward note for Phase 26+:** When the backend broadens `SkillRange` to include `'7d'`, drop `narrowToSkillRange` and the two surfaces become identical.
- **Files modified:** `frontend/src/routes/skills_.$name.tsx`.
- **Commit:** `5e79a22` (folded into Task 2's commit).

### Scope-boundary deviations (out-of-scope, NOT fixed)

The full `pnpm tsc --noEmit` shows additional errors in:

- `frontend/src/components/ui/CommandPalette.tsx` (5 errors)
- `frontend/src/components/panels/SessionsTable.tsx` (1 error)
- `frontend/src/routes/sessions_.compare.tsx` (1 error)
- Plan 03's other modified routes (`activity.tsx`, `cost.tsx`, `alerts.tsx`, etc.) — uncommitted work-in-progress in the parallel agent's worktree

All of these are caused by Plan 03's parallel changes (adding `validateSearch` with `schemaVersion` to multiple routes, making `<Link>` calls require `search`). They are NOT in this plan's `<files>` list and NOT directly caused by my changes. Per `<scope_boundary>` rule, I logged them here and did NOT touch them — Plan 03 owns those fixes.

Pre-commit hook handles the cross-plan tsc state correctly: it stashes unstaged files before tsc, runs against the committed state + staged files, then restores. Both my commits passed the hook gate cleanly.

## Authentication gates encountered

None.

## Known stubs

None. URL range value flows end-to-end to live data hooks (`useSkillLatency`, `useSkillProjects`).

## Where to look first (for Plan 11 / e2e gate)

**Demo scenario for Phase 25 success criterion 1** ("user saves the current filter combination on `/skills/$name` as a named view"):

1. Navigate to `/skills/<any-real-skill-name>` (find one via `GET /api/skills` or by clicking through from `/skills`).
2. Verify default page renders `range=14d` data (no `?range=` in URL).
3. Hit `/skills/<name>?range=7d` — `SkillLatencySnapshot` caption + reqId label reflect `7d`; `SkillProjectsTable` re-anchors to `14d` (backend-narrowed; mention this in operator notes — it is intentional and documented).
4. Hit `/skills/<name>?range=30d` — both panels re-anchor to `30d`.
5. Hit `/skills/<name>?range=bogus` — page renders default `14d` (validateSearch silently coerces).
6. The validateSearch shape `{ schemaVersion: 1, range }` is the blob that the Phase 25 saved-views feature will persist into `saved_views.state_json`. Plan 05's `useSavedView` hook + Plan 11's e2e should round-trip a saved view here.

**Entry-point file:** `frontend/src/routes/skills_.$name.tsx` — single source of truth for the route's search shape; `validateSearch` is exported by name.

## Test command quick-reference

```bash
cd frontend && pnpm test --run src/lib/__tests__/skillsDetailRange.test.tsx
cd frontend && pnpm test --run src/components/panels/__tests__/SkillProjectsTable.test.tsx
cd frontend && pnpm build
cd backend && uv run pytest tests/test_url_contract.py
```

## Self-Check: PASSED

- FOUND `frontend/src/routes/skills_.$name.tsx`
- FOUND `frontend/src/lib/__tests__/skillsDetailRange.test.tsx`
- FOUND `.planning/phases/25-saved-views-backend-frontend/25-04-SUMMARY.md`
- FOUND commit `5e79a22` — `feat(25-04): hoist /skills/$name range filter to URL search state`
- FOUND commit `625dc01` — `test(25-04): cover /skills/$name validateSearch range round-trip`
- Vitest 361/361 PASS (was 353 baseline; +8 new specs >= +7 plan requirement)
- pnpm tsc clean on plan-04 files; pnpm lint clean; pnpm build clean
- `tests/test_url_contract.py` 2/2 PASS
- Default `range='14d'` preserves pre-Phase-25 behavior (Pitfall 3 invariant honored)
