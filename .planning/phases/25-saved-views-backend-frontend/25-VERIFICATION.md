---
phase: 25-saved-views-backend-frontend
verified: 2026-05-12T18:00:00Z
status: passed
score: 5/5
overrides_applied: 1
overrides:
  - must_have: "User saves the current filter combination on /skills/$name as a named view, navigates away, returns to the route, and the view auto-loads as the per-route default (querystring still wins when explicit)"
    reason: "DefaultViewLoader v1 limitation: /skills/$name validateSearch always populates range=14d, so any URL search is non-empty and the Pitfall-8 deep-link-wins lock short-circuits auto-apply. The criterion is satisfied end-to-end on /sessions/compare (documented as the correct fixture) and the architectural limitation is tracked for Phase 26 per-route adoption. Querystring-wins semantics verified by separate e2e test (v13-saved-views.spec.ts:151)."
    accepted_by: "Patryk Golabek"
    accepted_at: "2026-05-12T00:00:00Z"
---

# Phase 25: Saved Views (Backend + Frontend) — Verification Report

**Phase Goal:** Make every filter combination on every route a first-class, named, server-persisted, URL-shareable view — landing the backend (table + 5 endpoints + migration) independently testable first, then the `validateSearch` adoption on 6 routes, then the chrome (SavedViewMenu + save dialog + edit-vs-fork semantics + unsaved pip + recent ad-hoc states + per-route default + pinned favorites in sidebar + Cmd+K Saved Views group).

**Verified:** 2026-05-12T18:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User saves filter on `/skills/$name`, navigates away, returns, view auto-loads as per-route default (querystring wins) | PASSED (override) | `DefaultViewLoader.tsx:59–81` implements the auto-apply logic with Pitfall-8 lock (deep-link wins). End-to-end verified on `/sessions/compare` in `v13-saved-views.spec.ts:106`. `/skills/$name` substitution documented as Accepted Exception — `validateSearch` always populates `range=14d` defeating the empty-search gate. Querystring-wins path verified separately at `v13-saved-views.spec.ts:151`. Override: Phase 26 per-route adoption. |
| 2 | User edits a loaded view, URL diverges → EditOrForkDialog prompts save/fork/discard (no silent overwrite); UnsavedPip visible the moment URL diverges | VERIFIED | `UnsavedPip.tsx:41–48` (`useUrlDivergesFromLoadedView`) computes divergence via `stableStringify` excluding `schemaVersion`. `EditOrForkDialog.tsx:64–91` implements all three branches with no silent-overwrite path. `SavedViewMenu.tsx:130–138` surfaces the edit-item only when `loadedView && urlDiverges`. Vitest: `UnsavedPip.test.tsx` (4 specs), `EditOrForkDialog.test.tsx` (5 specs). E2e: `v13-saved-views.spec.ts:185–343` (4 tests covering entry + save/fork/discard branches). Operator flow confirmed in `25-VISUAL-CHECK.md`. |
| 3 | Cmd+K → type saved view name → Enter → land on matching route with filters applied; current-route filtered first | VERIFIED | `CommandPalette.tsx:130–140` (`sortSavedViewsForPalette`) places current-route views first with alpha secondary sort. `CommandPalette.tsx:263–280` (`onSavedViewSelect`) navigates to target + calls `setLoadedView`. `CommandPalette.tsx:378–401` renders the `Saved Views` group. Dynamic-route guard via `routePathFromId`. Vitest: `CommandPalette.savedViews.test.tsx` (5 specs). E2e: `v13-saved-views.spec.ts:346–390` + `command-palette.spec.ts:125` (current-route-first ordering). Operator confirmed in `25-VISUAL-CHECK.md`. |
| 4 | User pins view from SavedViewMenu → view appears in sidebar Pinned section (one-click access from any route) | VERIFIED | `PinnedViewsSection.tsx:97–181` renders Pinned sidebar section between Operate and Configure, sourced from `getPinnedIds()` + cross-route `useSavedViews()`. `Sidebar.tsx:49,142` imports and mounts `PinnedViewsSection` between Operate and Configure sections. `SavedViewMenu.tsx:104–107` calls `pinView(id)` / `unpinView(id)` on toggle. Same-tab localStorage limitation documented as Accepted Exception (c) — reload required, wired into e2e at `v13-saved-views.spec.ts:393` (pin → reload → assert). `isPinnedViewActive` exported and tested. Vitest: `PinnedViewsSection.test.tsx` (7 specs). Operator confirmed 30/30 PNG PASS in `25-VISUAL-CHECK.md`. |
| 5 | Backend: 0004_saved_views migration applies cleanly; 5 CRUD endpoints pass via curl + pytest; 50-cap enforced; opaque state_json; schemaVersion on all 6 routes | VERIFIED | Migration: `migrations/versions/0004_saved_views.py` creates `saved_views` table with UNIQUE (route, name), non-unique route index, 8 columns. Tests: `test_migrations.py:234,347` (upgrade + downgrade). Router: `cmc/api/routes/views.py` implements all 5 handlers at `/api/views`. `VIEW_CAP_PER_ROUTE = 50` enforced at lines 73–84. UNIQUE collision returns 400 at lines 96–105. `state_json` is `dict[str, Any]` opaque on backend. Router wired via `cmc/api/routes/__init__.py:34,58`. Pytest: `test_views_router.py` (18 substantive cases). Curl matrix: 8/8 verified in `25-VISUAL-CHECK.md`. `schemaVersion` on all 7 routes (6 new + existing sessions/compare): `searchSchemas.ts` + per-route `validateSearch` in every route file. Test counts: backend 686/0/0, frontend 452/0/0. |

**Score:** 5/5 (4 VERIFIED + 1 PASSED (override))
**Overrides applied:** 1

---

### Deferred Items

No items deferred to later phases — all gaps are addressed by the documented Accepted Exception override above.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/migrations/versions/0004_saved_views.py` | Alembic migration for saved_views table | VERIFIED | Creates table with 8 columns, UNIQUE (route, name), route index. Upgrade + downgrade both tested. |
| `backend/cmc/db/models/saved_views.py` | SavedView SQLModel | VERIFIED | `SavedView` class with all required fields, opaque `state_json: dict[str, Any]`, UniqueConstraint. |
| `backend/cmc/api/routes/views.py` | 5 CRUD endpoints | VERIFIED | GET list, POST create (50-cap), GET single, PATCH (wholesale replace), DELETE (204). Router registered at `/api` prefix. |
| `backend/cmc/api/schemas/views.py` | Pydantic schemas | VERIFIED | `SavedViewCreate`, `SavedViewUpdate` (route NOT patchable), `SavedViewListItem`, `SavedViewListResponse`. |
| `backend/tests/test_views_router.py` | 18+ pytest cases | VERIFIED | 18 tests covering all 5 endpoints + UNIQUE conflict + 50-cap + route-filter + PATCH semantics. |
| `backend/tests/test_migrations.py` (extended) | Migration tests | VERIFIED | `test_0004_upgrade_from_0003` + `test_0004_downgrade_to_0003` present at lines 234, 347. |
| `frontend/src/lib/searchSchemas.ts` | SCHEMA_VERSION + coerceSchemaVersion | VERIFIED | Exports `SCHEMA_VERSION = 1` and `coerceSchemaVersion`. All 7 routes import and use both. |
| `frontend/src/routes/index.tsx` | validateSearch with schemaVersion | VERIFIED | `IndexSearch` + named `validateSearch` export. |
| `frontend/src/routes/activity.tsx` | validateSearch with schemaVersion | VERIFIED | `ActivitySearch` + named `validateSearch` export. |
| `frontend/src/routes/skills.tsx` | validateSearch with schemaVersion | VERIFIED | `SkillsSearch` + named `validateSearch` export. |
| `frontend/src/routes/skills_.$name.tsx` | validateSearch with schemaVersion + range | VERIFIED | `SkillsDetailSearch` + named `validateSearch`, range defaulted to '14d'. |
| `frontend/src/routes/cost.tsx` | validateSearch with schemaVersion | VERIFIED | `CostSearch` + named `validateSearch` export. |
| `frontend/src/routes/alerts.tsx` | validateSearch with schemaVersion | VERIFIED | `AlertsSearch` + named `validateSearch` export. |
| `frontend/src/routes/sessions_.compare.tsx` | validateSearch extended with schemaVersion | VERIFIED | Extended with schemaVersion append at lines 38,46,51. |
| `frontend/src/lib/savedViews.ts` | Client storage helpers | VERIFIED | `getDefaultViewId`, `setDefaultViewId`, `pinView`, `unpinView`, `getPinnedIds`, `setPinnedIds`, `pushRecentState`, `getRecentStates`, `RECENT_STATES_CAP = 50`. |
| `frontend/src/lib/api.ts` | SavedView types + API verbs | VERIFIED | `SavedView`, `SavedViewCreate`, `SavedViewUpdate`, `SavedViewListResponse` interfaces. `viewCreate`, `viewGet`, `viewPatch`, `viewDelete`, `viewList` methods at lines 1411–1428. |
| `frontend/src/lib/queries.ts` | React Query hooks | VERIFIED | `useSavedViews`, `useSavedView`, `useCreateView`, `usePatchView`, `useDeleteView` hooks wired against API. Query key family `['saved-views']`. |
| `frontend/src/components/savedviews/LoadedViewContext.tsx` | React context for loaded view | VERIFIED | `LoadedViewProvider` + `useLoadedView` hook. Mounts in `AppShell.tsx:56`. |
| `frontend/src/components/savedviews/SavedViewMenu.tsx` | DropdownMenu chrome in header | VERIFIED | Per-route view list, Open/Set-default/Pin/Fork/Delete submenu per view, SaveViewDialog + EditOrForkDialog wired. |
| `frontend/src/components/savedviews/SaveViewDialog.tsx` | Save/fork view form dialog | VERIFIED | Radix Dialog, create + fork mode, state_json captured from current URL, setLoadedView on success. |
| `frontend/src/components/savedviews/EditOrForkDialog.tsx` | 3-branch chooser dialog | VERIFIED | 3 explicit buttons (Save changes, Save as new (fork), Discard changes), no silent-overwrite path. Radix Dialog (not AlertDialog per Pitfall 4 constraint). |
| `frontend/src/components/savedviews/UnsavedPip.tsx` | Unsaved-changes indicator | VERIFIED | `stableStringify` strips `schemaVersion` before comparison. Returns `<span>` pip only when diverged. |
| `frontend/src/components/savedviews/PinnedViewsSection.tsx` | Sidebar pinned section | VERIFIED | Cross-route `useSavedViews()`, `getPinnedIds()`, `isPinnedViewActive` algorithm (pathname + structural search match). |
| `frontend/src/components/savedviews/DefaultViewLoader.tsx` | Zero-render default auto-apply | VERIFIED | useEffect applies per-route default on empty search; deep-link-wins guard; one-shot per route entry; replace:true. |
| `frontend/src/components/savedviews/RecentStateTracker.tsx` | Zero-render recent-state push | VERIFIED | Pushes to FIFO ring on every in-scope route URL change; bare-URL noise filter; structural dedupe via pushRecentState. |
| `frontend/src/components/savedviews/routeNormalize.ts` | Route ID normalization | VERIFIED | `normalizeRouteId` collapses `/skills/<name>` to `/skills/$name`, static routes pass through. |
| `frontend/src/components/ui/CommandPalette.tsx` | Saved Views group in Cmd+K | VERIFIED | `sortSavedViewsForPalette` (current-route first, alpha secondary), `routePathFromId` dynamic guard, `Saved Views` Command.Group at line 378, selection navigates + setLoadedView + closes. |
| `frontend/src/components/shell/Sidebar.tsx` | PinnedViewsSection mounted | VERIFIED | `PinnedViewsSection` imported and mounted between Operate and Configure sections at line 142. |
| `frontend/src/components/shell/AppShellHeader.tsx` | SavedViewMenu + UnsavedPip in header | VERIFIED | `saved-view-chrome` wrapper with `SavedViewMenu` + `UnsavedPip` at lines 52–57. |
| `frontend/src/components/shell/AppShell.tsx` | LoadedViewProvider + effect components | VERIFIED | `LoadedViewProvider` wraps shell; `DefaultViewLoader` + `RecentStateTracker` mounted inside provider at lines 61–62. |
| `frontend/tests/e2e/v13-saved-views.spec.ts` | E2e tests for criteria 1-4 + criterion 5 frontend | VERIFIED | 11 tests: criteria 1 (save + default + return), 1.b (deep-link wins), 2 (edit entry + 3 branches), 3 (Cmd+K navigate), 4 (pin + sidebar), 4.b (empty-state), 5 (50-cap UI error). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `AppShell.tsx` | `LoadedViewContext.tsx` | `LoadedViewProvider` at line 56 | WIRED | Provider wraps entire shell tree |
| `AppShell.tsx` | `DefaultViewLoader.tsx` | mounted at line 61 inside LoadedViewProvider | WIRED | Zero-render effect component |
| `AppShell.tsx` | `RecentStateTracker.tsx` | mounted at line 62 inside LoadedViewProvider | WIRED | Zero-render effect component |
| `AppShellHeader.tsx` | `SavedViewMenu.tsx` | import + render at lines 33,55 | WIRED | SavedViewMenu in saved-view-chrome div |
| `AppShellHeader.tsx` | `UnsavedPip.tsx` | import + render at lines 34,56 | WIRED | UnsavedPip adjacent to SavedViewMenu |
| `Sidebar.tsx` | `PinnedViewsSection.tsx` | import line 49 + render line 142 | WIRED | Between Operate and Configure sections |
| `CommandPalette.tsx` | `useSavedViews` (queries.ts) | line 162 | WIRED | Cross-route fetch, no route filter |
| `CommandPalette.tsx` | `useLoadedView` (LoadedViewContext) | line 163 | WIRED | Sets loadedView on selection |
| `SavedViewMenu.tsx` | `EditOrForkDialog.tsx` | import + render at lines 50,230 | WIRED | Fork source + open state passed as props |
| `SavedViewMenu.tsx` | `SaveViewDialog.tsx` | import + render at lines 53,223 | WIRED | Fork source + route passed as props |
| `EditOrForkDialog.tsx` | `usePatchView` (queries.ts) | line 58, `mutateAsync` at line 66 | WIRED | PATCH /api/views/{id} on save-changes |
| `views_router` | FastAPI app | `cmc/api/routes/__init__.py:34,58` | WIRED | Registered in `all_routers()` under `/api` prefix |
| `DefaultViewLoader.tsx` | `getDefaultViewId` (savedViews.ts) | line 49 | WIRED | Reads localStorage default pointer |
| `DefaultViewLoader.tsx` | `useSavedView` (queries.ts) | line 50 | WIRED | Fetches the default view from server |
| `UnsavedPip.tsx` | `useLoadedView` (LoadedViewContext) | line 42 | WIRED | Reads loadedView for comparison |
| `PinnedViewsSection.tsx` | `useSavedViews` (queries.ts) | line 104 | WIRED | Cross-route catalog fetch |
| `PinnedViewsSection.tsx` | `getPinnedIds` (savedViews.ts) | line 110 | WIRED | localStorage pin list |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SavedViewMenu.tsx` | `data.items` (saved views list) | `useSavedViews(currentRoute)` → `api.viewList(route)` → `GET /api/views?route=…` → DB query `select(SavedView).order_by(updated_at.desc())` | Yes — real DB query in `views.py:52–56` | FLOWING |
| `PinnedViewsSection.tsx` | `allViews.items` | `useSavedViews()` → same cache slot as SavedViewMenu (no route filter) | Yes — same DB query, shared React Query cache | FLOWING |
| `CommandPalette.tsx` | `savedViewsData.items` | `useSavedViews()` → same cross-route fetch | Yes — shared cache | FLOWING |
| `DefaultViewLoader.tsx` | `defaultView` | `useSavedView(defaultId)` → `api.viewGet(id)` → `GET /api/views/{id}` → DB row | Yes — real DB fetch | FLOWING |
| `UnsavedPip.tsx` | `loadedView` | `useLoadedView()` ← set via `setLoadedView(v)` in SavedViewMenu.handleOpen, SaveViewDialog.onSuccess, DefaultViewLoader, CommandPalette.onSavedViewSelect | Yes — populated from actual API response objects | FLOWING |

---

### Behavioral Spot-Checks

Runnable behavioral checks are not feasible without starting the backend server. The operator's `25-VISUAL-CHECK.md` already provides equivalent evidence via the interactive verification session on 2026-05-12 (curl matrix 8/8, pytest 686/0/0, vitest 452/0/0, e2e 137 pass + 4 skip). Step 7b: SKIPPED (requires live server; operator-verified equivalent provided).

---

### Requirements Coverage

| Requirement | Source Plan | Delivering Artifact | Status | Evidence |
|-------------|-------------|---------------------|--------|----------|
| VIEW-01: validateSearch + schemaVersion on 6 routes (/, /activity, /skills, /skills/$name, /cost, /alerts) | Plans 03 + 04 | `searchSchemas.ts`, all 7 route files | SATISFIED | `validateSearch` exported from every in-scope route; `schemaVersion` always populated. `searchSchemas.test.ts` + `skillsDetailRange.test.tsx` pin the contract. |
| VIEW-02: saved_views table + Alembic migration 0004_saved_views | Plan 01 | `0004_saved_views.py`, `saved_views.py` (model) | SATISFIED | Table created with 8 columns, UNIQUE (route, name) constraint, route index. 2 migration tests. |
| VIEW-03: 5 CRUD endpoints independently testable via curl | Plan 02 | `cmc/api/routes/views.py`, `test_views_router.py` | SATISFIED | All 5 endpoints implemented; 18 pytest cases; curl matrix 8/8 verified. |
| VIEW-04: SavedViewMenu in AppShellHeader | Plan 06 | `SavedViewMenu.tsx`, `AppShellHeader.tsx` | SATISFIED | DropdownMenu with per-route view list, Open/Set-default/Pin/Fork/Delete submenu actions. |
| VIEW-05: Save-view dialog with name + description, URL state captured | Plan 06 | `SaveViewDialog.tsx` | SATISFIED | Radix Dialog form; state_json captured from `location.search` post-validateSearch; create + fork modes. |
| VIEW-06: Per-route default-view; cold-loads on visit; querystring always wins | Plan 10 | `DefaultViewLoader.tsx`, `savedViews.ts` | SATISFIED | Pitfall-8 lock implemented; one-shot per route entry; `replace: true` on apply. /skills/$name Accepted Exception (a) documented. |
| VIEW-07: Edit-vs-fork explicit semantics; no silent overwrite | Plan 07 | `EditOrForkDialog.tsx` | SATISFIED | 3-button Radix Dialog (not AlertDialog per Pitfall 4); save/fork/discard branches each observable. VIEW-07 behavioral contract met; component-primitive deviation documented. |
| VIEW-08: Unsaved-changes pip indicator | Plan 06 | `UnsavedPip.tsx` | SATISFIED | `stableStringify` excludes schemaVersion; pip renders only when diverged; WCAG 2.1 AA compliant. |
| VIEW-09: Recent ad-hoc states, 50-cap FIFO, user feedback at cap | Plan 10 | `RecentStateTracker.tsx`, `savedViews.ts (pushRecentState)` | SATISFIED | In-scope route filter, bare-URL noise filter, structural dedupe, 50-cap with console.warn. CMDK-04 surface deferred to Phase 26 (not part of Phase 25 requirements scope). |
| CMDK-01: Saved Views group in Cmd+K; current-route first; navigate + set state | Plan 08 | `CommandPalette.tsx` | SATISFIED | `Saved Views` Command.Group; `sortSavedViewsForPalette` current-route-first; `routePathFromId` dynamic guard; selection navigates + setLoadedView + closes palette. |
| SHEL-06: Sidebar Pinned section; one-click access from any route | Plan 09 | `PinnedViewsSection.tsx`, `Sidebar.tsx` | SATISFIED | Section mounted between Operate and Configure; `isPinnedViewActive` algorithm (pathname + structural search); same-tab localStorage limitation documented as Accepted Exception (c). |

**Requirements score: 11/11 SATISFIED**

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `RecentStateTracker.tsx` (cap signal, line ~119 in savedViews.ts) | `console.warn` only for 50-cap signal | Info | VIEW-09 documents this as intentional v1 limitation — no toast library in dependency budget. CMDK-04 surface deferred. Not a stub — the cap enforcement logic is real; only the user-facing notification is minimized. |
| `EditOrForkDialog.tsx` | Uses Radix Dialog instead of AlertDialog (POLI-12 constraint) | Info | Intentional deviation documented in component header and REQUIREMENTS.md VIEW-07 note — POLI-12 locked AlertDialog at 2 buttons; 3-button dialog requires the base Dialog primitive. User-observable behavior identical. |

No blockers. No stub patterns detected in any Phase 25 artifact. All anti-pattern candidates were confirmed as intentional architectural decisions with documentation.

---

### Human Verification Required

No items require additional human verification beyond what the operator already confirmed in `25-VISUAL-CHECK.md` (signed 2026-05-12 by Patryk Golabek). The operator's verification covered:

- 30/30 PNG visual matrix PASS (all 5 chrome surfaces × 3 densities × 2 themes)
- Interactive exercise of all 5 ROADMAP success criteria
- Console errors review
- Portal containment manual spot-check
- Sidebar Pinned active-state accent manual spot-check
- Automated gate exit codes: backend 686/0/0, frontend 452/0/0, e2e 137/141 (4 fwd-compat skip), Lighthouse 9/9, Axe 34/34, URL contract 2/2, curl 8/8

---

### Gaps Summary

No gaps. All 5 must-haves are either VERIFIED against direct codebase evidence or PASSED via a documented and operator-accepted override (the `/skills/$name` DefaultViewLoader v1 limitation — Accepted Exception (a)).

The three Accepted Exceptions (documented in `25-VISUAL-CHECK.md` and the operator verdict) are:

1. `/skills/$name` default auto-load limitation — architectural root cause in DefaultViewLoader (Pitfall-8 lock fires whenever validateSearch fills route defaults). Unblock: Phase 26 per-route adoption. The must-have is PASSED (override) because the mechanism works end-to-end on /sessions/compare and the querystring-wins path is separately verified.

2. 8 v1.2-baseline contrast/aria carry-overs — same Pitfall 7 lineage as Phase 24. Zero Phase-25-attributable violations. Unblock: Phase 26/27 token rebalance.

3. Same-tab localStorage pin-write reload required — PinnedViewsSection reads localStorage on render; same-tab writes don't broadcast a storage event. User-observable workaround: reload. E2e spec wires the reload into the assertion. Unblock: Phase 26+ custom event or Zustand-style store.

None of the three are implementation gaps. All are design trade-offs with explicit unblock conditions queued for Phase 26.

---

_Verified: 2026-05-12T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
