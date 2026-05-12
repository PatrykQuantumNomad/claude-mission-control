---
phase: 25-saved-views-backend-frontend
plan: 05
type: execute
wave: 3
depends_on: ["02"]
files_modified:
  - frontend/src/lib/api.ts
  - frontend/src/lib/queries.ts
  - frontend/src/lib/savedViews.ts
  - frontend/src/lib/__tests__/savedViews.test.ts
  - frontend/src/lib/__tests__/queries.savedViews.test.ts
autonomous: true

must_haves:
  truths:
    - "api.viewList(route?), api.viewGet(id), api.viewCreate, api.viewPatch, api.viewDelete all callable from any React component"
    - "useSavedViews(route?), useCreateView, usePatchView, useDeleteView TanStack Query hooks compose correctly"
    - "mutations invalidate the ['saved-views'] query key so menu refreshes after create/patch/delete"
    - "lib/savedViews.ts exposes typed localStorage helpers: getDefault(route)/setDefault, getPinned/setPinned, pushRecent(route, state) with FIFO 50-cap eviction"
    - "Recent-states FIFO cap warns the user when at 50 (via console.warn or a returned flag — TBD per implementer judgment, but observable)"
  artifacts:
    - path: "frontend/src/lib/api.ts"
      provides: "5 verbs: viewList, viewGet, viewCreate, viewPatch, viewDelete + SavedView TS types"
      contains: "viewList"
    - path: "frontend/src/lib/queries.ts"
      provides: "useSavedViews + useCreateView + usePatchView + useDeleteView with cache invalidation"
      contains: "useSavedViews"
    - path: "frontend/src/lib/savedViews.ts"
      provides: "getDefaultViewId(route), setDefaultViewId, getPinnedIds, setPinnedIds, pushRecentState, getRecentStates"
      contains: "pushRecentState"
  key_links:
    - from: "frontend/src/lib/queries.ts"
      to: "frontend/src/lib/api.ts"
      via: "mutationFn calls api.viewCreate / etc."
      pattern: "api\\.view"
    - from: "frontend/src/lib/queries.ts"
      to: "Wave 1 backend endpoints"
      via: "fetchJson against /api/views"
      pattern: "/api/views"
    - from: "frontend/src/lib/savedViews.ts"
      to: "frontend/src/lib/storage.ts"
      via: "typed cmc.* localStorage wrapper"
      pattern: "storage\\.get|storage\\.set"
---

<objective>
Ship the frontend data layer for saved views: API client verbs, TanStack Query hooks, and localStorage helpers for the default-pointer / pinned-ids / recent-ad-hoc-states (FIFO 50-cap) state. This plan is the seam that lets Wave 3 (chrome) and Wave 4 (cross-cutting) consume the backend without re-deriving types or hooks.

Purpose: Single source of truth for SavedView types + API + queries + local storage. Eliminates duplication across SavedViewMenu, SaveViewDialog, EditOrForkDialog, CommandPalette, Sidebar Pinned section, and per-route default-load logic.
Output: 5 API verbs + 4 hooks + 6 storage helpers + ~12 vitest cases covering them.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md
@.planning/phases/25-saved-views-backend-frontend/25-02-SUMMARY.md

# Reference shapes — mirror line-for-line
@frontend/src/lib/api.ts
@frontend/src/lib/queries.ts
@frontend/src/lib/storage.ts

# Backend types (for TS shape parity)
@backend/cmc/api/schemas/views.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add SavedView API verbs + types to lib/api.ts</name>
  <files>frontend/src/lib/api.ts</files>
  <action>
Extend `frontend/src/lib/api.ts` with 5 new verbs mirroring the `taskList`/`taskCreate`/etc. patterns already in the file. Search the file for `taskList`, `taskCreate`, `taskPatch`, `taskDelete` to find the convention block; place the new view verbs in the same shape near the existing task verbs.

Add these TS types at an appropriate location (near other entity types like `Task`):

```typescript
export type SavedView = {
  id: number
  name: string
  description: string
  route: string
  state_json: Record<string, unknown>  // opaque — frontend's validateSearch is the gatekeeper
  schema_version: number
  created_at: string  // ISO datetime
  updated_at: string  // ISO datetime
}

export type SavedViewListResponse = {
  items: SavedView[]
  total: number
}

export type SavedViewCreate = {
  name: string
  description?: string
  route: string
  state_json?: Record<string, unknown>
  schema_version?: number  // defaults to 1 server-side
}

export type SavedViewUpdate = {
  name?: string
  description?: string
  state_json?: Record<string, unknown>
  schema_version?: number
  // NOTE: `route` deliberately NOT patchable — see backend SavedViewUpdate docstring
}
```

Then add 5 verbs to the `api` object (or wherever the verbs live in the file — match the existing pattern). Use `fetchJson` for the 4 JSON verbs and `fetchVoid` for DELETE (precedent: `taskDelete` at api.ts:1343-1344 uses `fetchVoid`; `fetchVoid` exists at api.ts:1024-1028).

```typescript
viewList: (route?: string) =>
  fetchJson<SavedViewListResponse>(
    route ? `/api/views?route=${encodeURIComponent(route)}` : '/api/views'
  ),
viewGet: (id: number) =>
  fetchJson<SavedView>(`/api/views/${id}`),
viewCreate: (body: SavedViewCreate) =>
  fetchJson<SavedView>('/api/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
viewPatch: (id: number, body: SavedViewUpdate) =>
  fetchJson<SavedView>(`/api/views/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
viewDelete: (id: number) =>
  fetchVoid(`/api/views/${id}`, { method: 'DELETE' }),
```

IMPORTANT:
- Match the existing api object structure — if it's a literal object with keys, add these as keys; if it uses a class, add methods.
- `state_json` is `Record<string, unknown>` on the TS side (opaque per VIEW-02). Do NOT introduce per-route discriminated unions here — that belongs to each route's validateSearch.
- DELETE uses `fetchVoid` (returns void on 204); do NOT call `.json()` on the response.
- `encodeURIComponent` on the route param — paths like `/skills/$name` contain `$`.
  </action>
  <verify>
`cd frontend && pnpm tsc --noEmit` clean. Sanity-import test: `pnpm test --run src/lib/__tests__/api.savedViews.test.ts` (if creating an api smoke spec — optional, since Task 3's queries test indirectly covers these).
  </verify>
  <done>
5 verbs added; types exported; tsc passes. Verbs can be imported as `import { api } from '../lib/api'` (or whatever the existing convention is) and called with proper types.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add TanStack Query hooks + cache invalidation to lib/queries.ts</name>
  <files>frontend/src/lib/queries.ts</files>
  <action>
Extend `frontend/src/lib/queries.ts` with 4 hooks mirroring `useCreateTask` / `useUpdateTask` / `useDeleteTask` patterns (precedent at `queries.ts:680-755` per research).

```typescript
import { api, type SavedView, type SavedViewCreate, type SavedViewUpdate } from './api'

const SAVED_VIEWS_KEY = ['saved-views'] as const

export function useSavedViews(route?: string) {
  return useQuery({
    queryKey: [...SAVED_VIEWS_KEY, route ?? '__all__'] as const,
    queryFn: () => api.viewList(route),
    // Saved views are user-modified rarely; trust cache aggressively.
    staleTime: 30_000,
  })
}

export function useSavedView(id: number | null) {
  return useQuery({
    queryKey: [...SAVED_VIEWS_KEY, 'single', id] as const,
    queryFn: () => api.viewGet(id!),
    enabled: id !== null,
  })
}

export function useCreateView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SavedViewCreate) => api.viewCreate(body),
    onSuccess: () => {
      // Invalidate every saved-views key (route-filtered + global).
      qc.invalidateQueries({ queryKey: SAVED_VIEWS_KEY })
    },
  })
}

export function usePatchView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: SavedViewUpdate }) =>
      api.viewPatch(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SAVED_VIEWS_KEY })
    },
  })
}

export function useDeleteView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.viewDelete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SAVED_VIEWS_KEY })
    },
  })
}
```

IMPORTANT:
- The query key composition is `['saved-views', <route or '__all__'>]`. Wave 3 + Wave 4 consumers will read this same pattern. Document the convention inline.
- `useSavedView(null)` is a no-op (`enabled: false`) — for the Sidebar Pinned section that may not have an id loaded yet.
- ALL mutations invalidate the entire `['saved-views']` key family (not just the route's slice) — keeps the Cmd+K cross-route view fresh after edit on a different route.
- Match the existing import block / placement convention in queries.ts. Read the existing file's organization (sections by entity) and slot saved-views logically.
  </action>
  <verify>
`cd frontend && pnpm tsc --noEmit` clean. Vitest covered by Task 4 below.
  </verify>
  <done>
4 hooks exported from queries.ts; tsc passes; cache invalidation key documented in inline comment.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create lib/savedViews.ts localStorage helpers (default / pinned / recent FIFO 50-cap)</name>
  <files>frontend/src/lib/savedViews.ts</files>
  <action>
Create `frontend/src/lib/savedViews.ts` exposing typed wrappers over `lib/storage.ts` for the 3 client-side state surfaces.

```typescript
/**
 * Saved-views client-side state helpers.
 *
 * Phase 25 / VIEW-06 (per-route default-view pointer), SHEL-06 (pinned ids),
 * VIEW-09 (recent ad-hoc states FIFO with 50-cap).
 *
 * Backed by the typed `cmc.*` localStorage wrapper at lib/storage.ts.
 */
import { storage } from './storage'

// ────────────────────────────────────────────────
// Per-route default-view pointer (VIEW-06)
// ────────────────────────────────────────────────

/** Returns the saved-view id flagged as default for the given route, or null. */
export function getDefaultViewId(route: string): number | null {
  return storage.get<number>(`savedView.default.${route}`) ?? null
}

export function setDefaultViewId(route: string, id: number | null): void {
  if (id === null) {
    storage.remove(`savedView.default.${route}`)
  } else {
    storage.set(`savedView.default.${route}`, id)
  }
}

// ────────────────────────────────────────────────
// Pinned view ids (SHEL-06)
// ────────────────────────────────────────────────

/** Returns the user-pinned saved-view ids in insertion order. */
export function getPinnedIds(): number[] {
  return storage.get<number[]>('savedView.pinned') ?? []
}

export function setPinnedIds(ids: number[]): void {
  storage.set('savedView.pinned', ids)
}

/** Add an id to the pinned list (deduped, insertion-ordered). */
export function pinView(id: number): void {
  const current = getPinnedIds()
  if (!current.includes(id)) {
    setPinnedIds([...current, id])
  }
}

export function unpinView(id: number): void {
  setPinnedIds(getPinnedIds().filter((x) => x !== id))
}

// ────────────────────────────────────────────────
// Recent ad-hoc states (VIEW-09)
// ────────────────────────────────────────────────

export const RECENT_STATES_CAP = 50

export type RecentAdHocState = {
  route: string
  state: Record<string, unknown>   // validated search object (sans schemaVersion-only diffs is fine)
  visitedAt: number                // Date.now() at write time
}

const recentKey = (route: string) => `savedView.recent.${route}` as const

/** Push a state into the route's recent list. FIFO with cap = RECENT_STATES_CAP. */
export function pushRecentState(state: RecentAdHocState): { atCap: boolean } {
  const current = storage.get<RecentAdHocState[]>(recentKey(state.route)) ?? []

  // Dedupe: drop any prior entry whose state matches (by JSON.stringify) — prevents flooding
  // the recent list when the user oscillates between the same N states.
  const filtered = current.filter(
    (e) => JSON.stringify(e.state) !== JSON.stringify(state.state),
  )

  // Prepend new entry, then truncate.
  const next = [state, ...filtered].slice(0, RECENT_STATES_CAP)
  const atCap = current.length >= RECENT_STATES_CAP

  storage.set(recentKey(state.route), next)
  if (atCap) {
    // Surface for user feedback (CommandPalette can show a toast/note).
    console.warn(`[savedViews] recent ad-hoc states cap (${RECENT_STATES_CAP}) reached for route ${state.route}; oldest evicted`)
  }
  return { atCap }
}

export function getRecentStates(route: string): RecentAdHocState[] {
  return storage.get<RecentAdHocState[]>(recentKey(route)) ?? []
}

export function clearRecentStates(route: string): void {
  storage.remove(recentKey(route))
}

/** Cross-route: aggregate recents across all known routes (for Cmd+K). */
export function getAllRecentStates(routes: readonly string[]): RecentAdHocState[] {
  return routes.flatMap((r) => getRecentStates(r))
}
```

IMPORTANT:
- All keys use the `savedView.*` prefix on top of `storage`'s implicit `cmc.` prefix — final keys are `cmc.savedView.default.<route>`, `cmc.savedView.pinned`, `cmc.savedView.recent.<route>`.
- `pushRecentState` returns `{ atCap }` so the caller can surface UI feedback (VIEW-09 requires "user warning at cap"). The console.warn is the minimum visible signal; Plan 10 may upgrade to a toast.
- Dedupe is by structural JSON.stringify — re-pushing the same state at position 0 doesn't blow up the cap with duplicates.
- `RECENT_STATES_CAP = 50` is a const so vitest can import + verify the boundary.
- Verify `storage.remove(key)` exists in `lib/storage.ts`; if it does NOT, add it (the typed wrapper should support remove via `localStorage.removeItem`).
  </action>
  <verify>
`cd frontend && pnpm tsc --noEmit` clean. Test coverage lands in Task 4.
  </verify>
  <done>
savedViews.ts exists with 8 exports (getDefaultViewId / setDefaultViewId / getPinnedIds / setPinnedIds / pinView / unpinView / pushRecentState / getRecentStates / clearRecentStates / getAllRecentStates + RECENT_STATES_CAP constant + RecentAdHocState type). tsc clean.
  </done>
</task>

<task type="auto">
  <name>Task 4: Add vitest covering savedViews helpers + queries hooks integration</name>
  <files>frontend/src/lib/__tests__/savedViews.test.ts, frontend/src/lib/__tests__/queries.savedViews.test.ts</files>
  <action>
Create TWO vitest files.

**File 1: `frontend/src/lib/__tests__/savedViews.test.ts`** — pure unit tests against the storage helpers. Use the existing pattern in `frontend/src/lib/__tests__/` (read one of `density.test.ts` or `theme.test.ts` for shape). Mock or clear localStorage between tests.

Required cases (≥10):

```typescript
import { describe, expect, it, beforeEach } from 'vitest'
import {
  getDefaultViewId, setDefaultViewId,
  getPinnedIds, setPinnedIds, pinView, unpinView,
  pushRecentState, getRecentStates, clearRecentStates,
  RECENT_STATES_CAP,
} from '../savedViews'

beforeEach(() => {
  localStorage.clear()
})

describe('default-view pointer (VIEW-06)', () => {
  it('returns null when unset', () => {
    expect(getDefaultViewId('/cost')).toBeNull()
  })
  it('roundtrips per route', () => {
    setDefaultViewId('/cost', 42)
    setDefaultViewId('/alerts', 7)
    expect(getDefaultViewId('/cost')).toBe(42)
    expect(getDefaultViewId('/alerts')).toBe(7)
  })
  it('clears with null', () => {
    setDefaultViewId('/cost', 42)
    setDefaultViewId('/cost', null)
    expect(getDefaultViewId('/cost')).toBeNull()
  })
})

describe('pinned ids (SHEL-06)', () => {
  it('starts empty', () => {
    expect(getPinnedIds()).toEqual([])
  })
  it('pinView dedupes', () => {
    pinView(1); pinView(2); pinView(1)
    expect(getPinnedIds()).toEqual([1, 2])
  })
  it('unpinView filters', () => {
    pinView(1); pinView(2); pinView(3)
    unpinView(2)
    expect(getPinnedIds()).toEqual([1, 3])
  })
})

describe('recent ad-hoc states (VIEW-09)', () => {
  it('starts empty', () => {
    expect(getRecentStates('/cost')).toEqual([])
  })

  it('prepends new states (FIFO order)', () => {
    pushRecentState({ route: '/cost', state: { range: '7d' }, visitedAt: 1 })
    pushRecentState({ route: '/cost', state: { range: '30d' }, visitedAt: 2 })
    const recents = getRecentStates('/cost')
    expect(recents[0].state).toEqual({ range: '30d' })
    expect(recents[1].state).toEqual({ range: '7d' })
  })

  it('dedupes identical state', () => {
    pushRecentState({ route: '/cost', state: { range: '7d' }, visitedAt: 1 })
    pushRecentState({ route: '/cost', state: { range: '7d' }, visitedAt: 2 })
    expect(getRecentStates('/cost')).toHaveLength(1)
  })

  it('truncates to RECENT_STATES_CAP', () => {
    for (let i = 0; i < RECENT_STATES_CAP + 5; i++) {
      pushRecentState({ route: '/cost', state: { i }, visitedAt: i })
    }
    expect(getRecentStates('/cost')).toHaveLength(RECENT_STATES_CAP)
  })

  it('returns atCap=true when at boundary', () => {
    for (let i = 0; i < RECENT_STATES_CAP; i++) {
      pushRecentState({ route: '/cost', state: { i }, visitedAt: i })
    }
    const r = pushRecentState({ route: '/cost', state: { extra: 1 }, visitedAt: 999 })
    expect(r.atCap).toBe(true)
  })

  it('isolates routes', () => {
    pushRecentState({ route: '/cost', state: { x: 1 }, visitedAt: 1 })
    pushRecentState({ route: '/alerts', state: { y: 1 }, visitedAt: 2 })
    expect(getRecentStates('/cost')).toHaveLength(1)
    expect(getRecentStates('/alerts')).toHaveLength(1)
  })
})
```

**File 2: `frontend/src/lib/__tests__/queries.savedViews.test.ts`** — hook + cache invalidation integration. Use the existing TanStack-Query-test pattern (`renderHook` + `QueryClientProvider` wrapper). Mock `api.viewList` / etc. via `vi.mock('../api', ...)`.

Required cases (≥4):

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSavedViews, useCreateView, usePatchView, useDeleteView } from '../queries'

vi.mock('../api', () => ({
  api: {
    viewList: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
    viewCreate: vi.fn(() => Promise.resolve({ id: 1, name: 'x', /* … */ })),
    viewPatch: vi.fn(() => Promise.resolve({ id: 1, name: 'y', /* … */ })),
    viewDelete: vi.fn(() => Promise.resolve()),
  },
}))

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('useSavedViews', () => {
  it('fetches with route filter', async () => {
    const { result } = renderHook(() => useSavedViews('/cost'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useCreateView', () => {
  it('invalidates saved-views key on success', async () => {
    // Set up a parent useSavedViews that should re-fetch after the mutation invalidates the key
    // Assert the mock api.viewList is called twice (once initial, once after invalidation)
  })
})

// Similar minimal cases for usePatchView + useDeleteView.
```

Note: if the test framework wrapper or mocking style differs from above, follow the EXACT pattern already established in `frontend/src/lib/__tests__/` — search for a test that uses `useMutation` + `QueryClientProvider` and copy its boilerplate.

IMPORTANT:
- These tests are the regression net for the data layer. They MUST run in CI green; future plans that touch the API or hooks must keep them passing.
- Don't import from `../../routes/*` — that would couple this test to a route's runtime, which is brittle. Mock at the api layer.
  </action>
  <verify>
`cd frontend && pnpm test --run src/lib/__tests__/savedViews.test.ts src/lib/__tests__/queries.savedViews.test.ts` — all cases pass. Full vitest matrix still green: `pnpm test --run` shows >= prior count + 14.
  </verify>
  <done>
~14 new vitest cases passing; covers default pointer, pinned, recent FIFO + cap, hook fetch + mutation invalidation.
  </done>
</task>

</tasks>

<verification>
1. `cd frontend && pnpm tsc --noEmit` clean.
2. `cd frontend && pnpm test --run` — full vitest green; count up by ~14.
3. `cd frontend && pnpm lint` clean.
4. `cd frontend && pnpm build` succeeds.
5. Manual: with `cmc start` running, open browser DevTools console on any route and execute `fetch('/api/views').then(r=>r.json())` — see `{items: [], total: 0}` (proves the api client + backend round-trip).
</verification>

<success_criteria>
- 5 api verbs exist + 4 query hooks exist + 8 localStorage helpers exist.
- Cache invalidation works on every mutation (verified by hook test).
- Recent-state cap enforces at 50 with atCap flag.
- Plan 06 (SavedViewMenu) and Plan 09 (Sidebar Pinned section) can import all dependencies from these files without re-deriving types or hooks.
</success_criteria>

<output>
After completion, create `.planning/phases/25-saved-views-backend-frontend/25-05-SUMMARY.md` documenting:
- Final hook signatures (useSavedViews, useCreateView, usePatchView, useDeleteView, useSavedView)
- Query key convention (`['saved-views', route ?? '__all__']`)
- Storage key convention (`cmc.savedView.default.<route>`, `cmc.savedView.pinned`, `cmc.savedView.recent.<route>`)
- vitest count delta
- "Where to look first" hint for Plan 06 (chrome): import api / hooks from these files
</output>
