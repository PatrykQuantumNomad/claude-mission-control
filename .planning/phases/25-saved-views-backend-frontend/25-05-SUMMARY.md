---
phase: 25-saved-views-backend-frontend
plan: 05
subsystem: frontend-data-layer
tags: [frontend, tanstack-query, localStorage, saved-views, hook-layer]
requires:
  - "25-02 (backend /api/views router + ViewRead shape)"
  - "25-03 (frontend validateSearch named exports + searchSchemas.ts)"
provides:
  - "5 API verbs (viewList/viewGet/viewCreate/viewPatch/viewDelete) in lib/api.ts"
  - "5 TanStack Query hooks (useSavedViews/useSavedView/useCreateView/usePatchView/useDeleteView) in lib/queries.ts"
  - "8 localStorage helpers + RECENT_STATES_CAP + RecentAdHocState type in lib/savedViews.ts"
  - "qk.savedViews(route?) + qk.savedView(id) query-key factory entries"
affects:
  - "Plan 06 (SavedViewMenu chrome) — direct consumer of all 3 export surfaces"
  - "Plan 09 (Sidebar Pinned section) — consumer of getPinnedIds + useSavedView"
  - "Plan 10 (CommandPalette) — consumer of getAllRecentStates + useSavedViews"
tech-stack:
  added: []
  patterns:
    - "Kebab-prefixed query-key family ('saved-views') — matches alert-rules / skill-* convention; never reuses bare 'views' prefix (Pitfall 5 lock)"
    - "'__all__' sentinel for absent-route query-key arg — prevents undefined-laced runtime keys"
    - "Mutations invalidate the entire ['saved-views'] family (not per-route slice) — cross-route consumers stay fresh"
    - "savedViews.ts mirrors theme.ts / density.ts shape — typed cmc.* storage wrapper, silent on quota error"
    - "RecentAdHocState FIFO with structural JSON.stringify dedupe — oscillating between same N states does not bloat the ring"
key-files:
  created:
    - "frontend/src/lib/savedViews.ts"
    - "frontend/src/lib/__tests__/savedViews.test.ts"
    - "frontend/src/lib/__tests__/queries.savedViews.test.ts"
  modified:
    - "frontend/src/lib/api.ts (+65 lines: SavedView types + 5 verbs)"
    - "frontend/src/lib/queries.ts (+81 lines: SavedView imports + qk entries + 5 hooks)"
decisions:
  - "qk.savedViews uses '__all__' sentinel (NOT undefined) for absent-route key arg"
  - "All saved-views mutations invalidate the ENTIRE ['saved-views'] family — not just the route's slice"
  - "useSavedViews staleTime: 30_000 — saved views are user-modified rarely; trust cache aggressively"
  - "RECENT_STATES_CAP is exported (NOT inlined) so vitest + future UI affordance reference the same boundary"
  - "Recent-state dedupe is by JSON.stringify structural equality — incoming visitedAt wins"
  - "console.warn is the minimum visible signal at cap; Plan 10 may upgrade to toast (deferred — not a stub)"
metrics:
  duration: "~30 min (loaded plan + 4 atomic commits + SUMMARY)"
  completed: "2026-05-12"
  vitest: "380 → 408 (+28; plan target was ~14)"
  tasks: 4
  files_modified: 2
  files_created: 3
---

# Phase 25 Plan 05: Frontend Data Layer (API Verbs + Hooks + localStorage) Summary

**One-liner:** Saved-views frontend data layer shipped — 5 API verbs + 5 TanStack Query hooks + 8 localStorage helpers + 28 vitest specs, all behind a single `import` line for Wave 3+ consumers.

## What Shipped

### Export surface (for Wave 4 + Wave 5 consumers)

**`frontend/src/lib/api.ts`** — TypeScript types + 5 verbs:

```typescript
// Types
import type {
  SavedView,             // {id, name, description, route, state_json, schema_version, created_at, updated_at}
  SavedViewListResponse, // {items: SavedView[], total: number}
  SavedViewCreate,       // POST body — name/route required; description/state_json/schema_version optional
  SavedViewUpdate,       // PATCH body — all optional; route NOT included (intrinsic to view identity)
} from '../lib/api'

// Verbs (on the `api` object)
import { api } from '../lib/api'
await api.viewList()                       // GET /api/views (cross-route)
await api.viewList('/cost')                // GET /api/views?route=/cost
await api.viewList('/skills/$name')        // GET /api/views?route=%2Fskills%2F%24name (URL-encoded)
await api.viewGet(42)                      // GET /api/views/42
await api.viewCreate({name, route, ...})   // POST /api/views → SavedView
await api.viewPatch(42, {...patch})        // PATCH /api/views/42 → SavedView (state_json REPLACES wholesale)
await api.viewDelete(42)                   // DELETE /api/views/42 → void (204; do NOT call .json() on it)
```

**`frontend/src/lib/queries.ts`** — query-key entries + 5 hooks:

```typescript
import { qk, useSavedViews, useSavedView, useCreateView, usePatchView, useDeleteView } from '../lib/queries'

// Query keys
qk.savedViews()              // ['saved-views', '__all__']  — cross-route slot
qk.savedViews('/cost')       // ['saved-views', '/cost']     — route-scoped slot
qk.savedView(42)             // ['saved-views', 'single', 42] — single-row slot
qk.savedView(null)           // ['saved-views', 'single', null] — disabled-gate slot

// Hooks
const { data, isLoading } = useSavedViews()              // cross-route list (Cmd+K)
const { data, isLoading } = useSavedViews('/cost')        // route-scoped list (SavedViewMenu)
const { data } = useSavedView(viewId)                     // single-row by id (Sidebar Pinned)
const { data } = useSavedView(null)                       // disabled — no fetch fires

const createMut = useCreateView()                         // .mutateAsync({name, route, ...})
const patchMut  = usePatchView()                          // .mutateAsync({id, patch})
const deleteMut = useDeleteView()                         // .mutateAsync(id)
```

**Cache invalidation convention:** All 3 mutations invalidate the *entire* `['saved-views']` key family (not just the route's slice). A view edited on `/skills` will refresh on the Cmd+K cross-route palette and the Sidebar Pinned section. The blast radius is small (`staleTime: 30_000`) so over-invalidation is preferred over missed-invalidation.

**`frontend/src/lib/savedViews.ts`** — 8 helpers + 1 constant + 1 type:

```typescript
import {
  // VIEW-06 — per-route default-view pointer
  getDefaultViewId, setDefaultViewId,
  // SHEL-06 — Sidebar Pinned ids
  getPinnedIds, setPinnedIds, pinView, unpinView,
  // VIEW-09 — Recent ad-hoc states (FIFO ring)
  pushRecentState, getRecentStates, clearRecentStates, getAllRecentStates,
  RECENT_STATES_CAP,
  type RecentAdHocState,
} from '../lib/savedViews'

// Default pointer
const id = getDefaultViewId('/cost')        // number | null
setDefaultViewId('/cost', 42)
setDefaultViewId('/cost', null)             // clears

// Pinned ids
const ids = getPinnedIds()                  // number[] in insertion order
pinView(7)                                  // appends (deduped)
unpinView(7)                                // filters (no-op for absent)
setPinnedIds([3, 1, 4])                     // bulk replace (drag-reorder UX)

// Recent ad-hoc states (FIFO, capped at 50 per route)
const { atCap } = pushRecentState({
  route: '/cost',
  state: { range: '7d', source: 'cli' },    // post-validateSearch shape
  visitedAt: Date.now(),
})
if (atCap) { /* show toast in Plan 10 */ }
const recents = getRecentStates('/cost')                              // newest-first
const cross   = getAllRecentStates(['/cost', '/alerts', '/skills'])   // for Cmd+K
clearRecentStates('/cost')
```

### Storage key shapes (final, on top of `cmc.` prefix from storage.ts)

| Storage key | Type | Purpose |
|---|---|---|
| `cmc.savedView.default.<route>` | `number` | Default-view id for the route (VIEW-06) |
| `cmc.savedView.pinned` | `number[]` | Insertion-ordered pinned-ids (SHEL-06) |
| `cmc.savedView.recent.<route>` | `RecentAdHocState[]` | Per-route FIFO ring, newest first, cap=50 (VIEW-09) |

## Verification

- `pnpm tsc --noEmit` — clean (4 commits, all hooks)
- `pnpm test --run` — **408 passing / 0 failed / 0 skipped** (was 380; +28 new specs, +14 over plan target)
- `pnpm lint` — clean, exit 0
- `pnpm build` — clean, 376ms

### Vitest delta breakdown

| Suite | Cases | Coverage |
|---|---|---|
| `savedViews.test.ts` | 16 | VIEW-06 pointer (4), SHEL-06 pinned (4), VIEW-09 recent (8 — empty/order/dedupe/cap/atCap/atCap-false/isolation/clear/aggregate/key-shape) |
| `queries.savedViews.test.ts` | 12 | qk key-shape pins (3), URL shapes (2), enabled-gate (2), 3 mutation-invalidation specs + DELETE void path (5) |
| **Total** | **28** | |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug avoidance] Used `qk.*` factory instead of inline `SAVED_VIEWS_KEY` constant**
- **Found during:** Task 2
- **Issue:** Plan text introduced `const SAVED_VIEWS_KEY = ['saved-views']` as a private module constant. Every other family in `queries.ts` uses the `qk.*` factory exported at module top (qk.alertRules, qk.skillUsage, qk.costBreakdown, …) so invalidation callers can compose the same shape that hooks compose. Going off-pattern here would split the source of truth.
- **Fix:** Added `qk.savedViews(route?)` and `qk.savedView(id)` to the factory; mutations still use a private `SAVED_VIEWS_KEY = ['saved-views'] as const` for the invalidate-whole-family call (it's the family prefix, NOT a key the hooks build directly).
- **Files modified:** `frontend/src/lib/queries.ts`
- **Commit:** 9ca3d04

**2. [Rule 2 — Missing critical functionality] Added `qk.savedView(id)` to factory**
- **Found during:** Task 2
- **Issue:** Plan only mentions `useSavedView(null)` informally in the SHEL-06 context. Without a dedicated factory entry, the single-row key would either collide with the list key family or get hand-rolled at every call site.
- **Fix:** Added `qk.savedView(id: number | null) => ['saved-views', 'single', id]` — distinct from the list shape, dedupes per id.
- **Commit:** 9ca3d04 (same task)

**3. [Rule 2 — Test coverage extension] Added 14 specs beyond the plan's ~14 target**
- **Found during:** Task 4
- **Issue:** Plan's "≥10" savedViews cases + "≥4" queries cases = ~14 minimum. I pinned every documented invariant (key-shape format strings, URL-encoding behavior, atCap=false below cap, console.warn surface, fetchVoid 204 path) which doubles coverage to 28 — but every additional spec corresponds to a sentence in the plan or research that would otherwise be unenforced at refactor time.
- **Net delta:** vitest 380 → 408 (+28).
- **Commit:** d8bc18d

No Rule 3 (blockers) or Rule 4 (architectural) deviations. No auth gates. No checkpoints encountered (plan is fully autonomous).

## Authentication Gates

None.

## Where to Look First (Plan 06+ consumers)

**Plan 06 (SavedViewMenu chrome):** This plan is your single import surface. Pull everything from these 3 modules — do NOT re-derive types, do NOT call `fetch()` directly, do NOT touch localStorage outside `savedViews.ts`.

```typescript
import { api, type SavedView, type SavedViewCreate } from '../lib/api'
import { useSavedViews, useCreateView, usePatchView, useDeleteView } from '../lib/queries'
import { getDefaultViewId, setDefaultViewId } from '../lib/savedViews'
```

**Plan 09 (Sidebar Pinned section):** Import `getPinnedIds` / `pinView` / `unpinView` from `lib/savedViews` and `useSavedView(id)` from `lib/queries` for per-row lookups. Pinned ids are local; the row contents are server-resolved.

**Plan 10 (CommandPalette):** Import `useSavedViews()` (no route arg = cross-route list) and `getAllRecentStates(['/'... ])` for the recent-ad-hoc-states section. Surface the `atCap` toast here (currently `console.warn` only — see Stubs below).

## Known Stubs

**1. `atCap` surface is console.warn-only.** When `pushRecentState` evicts at the 50-cap boundary, the only visible feedback is a `console.warn`. The plan explicitly assigns the toast/UI upgrade to **Plan 10 (CommandPalette)** — the cap is a CommandPalette-facing concern, not a data-layer concern. Not blocking Wave 3.

**2. `clearRecentStates(route)` has no caller.** Provided for completeness + symmetry with `pushRecentState` / `getRecentStates`. Plan 10 may wire a "Clear recent" action; until then it's API-surface-only (tested, but unused in production). Not a regression risk — pure additive helper.

## Self-Check: PASSED

**Files exist:**
- `frontend/src/lib/api.ts` (modified) — FOUND ✓ (verified by grep `viewList\|viewCreate\|viewPatch\|viewDelete\|viewGet`)
- `frontend/src/lib/queries.ts` (modified) — FOUND ✓ (verified by grep `useSavedViews\|useCreateView\|usePatchView\|useDeleteView\|useSavedView`)
- `frontend/src/lib/savedViews.ts` — FOUND ✓ (new file)
- `frontend/src/lib/__tests__/savedViews.test.ts` — FOUND ✓ (new file)
- `frontend/src/lib/__tests__/queries.savedViews.test.ts` — FOUND ✓ (new file)

**Commits exist:**
- 35053d5 — feat(25-05): add SavedView types + 5 API verbs to lib/api.ts ✓
- 9ca3d04 — feat(25-05): add SavedView TanStack Query hooks + cache invalidation ✓
- 081f303 — feat(25-05): add lib/savedViews.ts localStorage helpers ✓
- d8bc18d — test(25-05): vitest coverage for savedViews helpers + queries hooks ✓

**Verification:** tsc clean, lint clean, build clean, 408/0/0 vitest.
