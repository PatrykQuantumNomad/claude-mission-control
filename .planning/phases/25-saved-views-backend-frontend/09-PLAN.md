---
phase: 25-saved-views-backend-frontend
plan: 09
type: execute
wave: 5
depends_on: ["05", "06"]
files_modified:
  - frontend/src/components/savedviews/PinnedViewsSection.tsx
  - frontend/src/components/shell/Sidebar.tsx
  - frontend/src/components/savedviews/__tests__/PinnedViewsSection.test.tsx
  - docs/testid-registry.md
autonomous: true

must_haves:
  truths:
    - "Sidebar exposes a new 'Pinned' SidebarSection that lists every saved view whose id is in cmc.savedView.pinned"
    - "Pinned section renders empty (header still visible) when no views are pinned — mirrors the existing 'Configure' empty-body precedent"
    - "Clicking a pinned view navigates to its route + applies its state_json + sets it as the loaded view"
    - "A pinned view's row shows the active-state accent only when both pathname AND search match the loaded view (Pitfall 9 recommendation)"
    - "Sidebar collapsed mode hides the section's label text but preserves clickable pinned-view rows"
  artifacts:
    - path: "frontend/src/components/savedviews/PinnedViewsSection.tsx"
      provides: "Sidebar section listing pinned saved views with active-state highlighting"
      contains: "SidebarSection"
    - path: "frontend/src/components/shell/Sidebar.tsx"
      provides: "PinnedViewsSection mounted in the sidebar IA (above Configure)"
      contains: "PinnedViewsSection"
  key_links:
    - from: "frontend/src/components/shell/Sidebar.tsx"
      to: "frontend/src/components/savedviews/PinnedViewsSection.tsx"
      via: "JSX mount in sidebar IA"
      pattern: "PinnedViewsSection"
    - from: "frontend/src/components/savedviews/PinnedViewsSection.tsx"
      to: "frontend/src/lib/savedViews.ts (getPinnedIds) + frontend/src/lib/queries.ts (useSavedViews)"
      via: "intersection of pinned ids with the fetched view list"
      pattern: "getPinnedIds|useSavedViews"
---

<objective>
Ship SHEL-06: a sidebar "Pinned" section that surfaces user-favorited saved views for one-click access from any route. Mirrors the existing `Configure` empty-section precedent — section header always visible, body is the dynamic list.

Purpose: A persistent quick-access path independent of CommandPalette and SavedViewMenu, scoped per user (localStorage `cmc.savedView.pinned`).
Output: Sidebar IA grows to include a Pinned section between Operate and Configure. Each pinned view is a navlink-like row with the view's name + a small route indicator. Clicking navigates + sets the loaded view.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md
@.planning/phases/25-saved-views-backend-frontend/25-05-SUMMARY.md
@.planning/phases/25-saved-views-backend-frontend/25-06-SUMMARY.md

# Reference patterns
@frontend/src/components/shell/Sidebar.tsx
@frontend/src/components/shell/SidebarSection.tsx
@frontend/src/components/shell/SidebarNavLink.tsx
@frontend/src/components/savedviews/UnsavedPip.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create PinnedViewsSection component</name>
  <files>frontend/src/components/savedviews/PinnedViewsSection.tsx, docs/testid-registry.md</files>
  <action>
Create `frontend/src/components/savedviews/PinnedViewsSection.tsx`:

```typescript
import { useMemo } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Pin } from 'lucide-react'
import { SidebarSection } from '../shell/SidebarSection'
import { useSavedViews } from '../../lib/queries'
import { getPinnedIds } from '../../lib/savedViews'
import { useLoadedView } from './LoadedViewContext'
import type { SavedView } from '../../lib/api'

/** Stable structural compare (same shape as UnsavedPip's stableStringify). */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj) ?? 'null'
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`
  const o = obj as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => k !== 'schemaVersion').sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
}

export function PinnedViewsSection() {
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const { data: allViews } = useSavedViews()  // no route filter; cross-route
  const { setLoadedView } = useLoadedView()

  const pinnedIds = getPinnedIds()
  const pinnedViews = useMemo<SavedView[]>(() => {
    if (!allViews) return []
    const byId = new Map(allViews.items.map((v) => [v.id, v]))
    return pinnedIds.map((id) => byId.get(id)).filter((v): v is SavedView => Boolean(v))
  }, [allViews, pinnedIds])

  const currentSearchString = stableStringify(location.search)

  return (
    <SidebarSection title="Pinned" testId="sidebar-section-pinned">
      {pinnedViews.length === 0 && (
        <div className="cmc-sidebar__empty" data-testid="sidebar-pinned-empty">
          Pin a saved view from the header menu
        </div>
      )}
      {pinnedViews.map((v) => {
        const isActive =
          location.pathname.startsWith(v.route.replace(/\/\$\w+$/, '')) &&
          stableStringify(v.state_json) === currentSearchString

        return (
          <button
            key={v.id}
            type="button"
            className={`cmc-sidebar__navlink ${isActive ? 'cmc-sidebar__navlink--active' : ''}`}
            data-testid={`sidebar-pinned-view-${v.id}`}
            data-active={isActive ? 'true' : 'false'}
            onClick={() => {
              const target = routePathForPinned(v.route, location.pathname)
              if (target === null) {
                console.warn(`[Sidebar] Pinned view "${v.name}" requires a specific entity — navigate to its base route first.`)
                return
              }
              navigate({ to: target, search: v.state_json as Record<string, unknown> })
              setLoadedView(v)
            }}
            title={`${v.name} (${v.route})`}
            aria-current={isActive ? 'page' : undefined}
          >
            <Pin size={14} aria-hidden />
            <span className="cmc-sidebar__navlink-label">{v.name}</span>
          </button>
        )
      })}
    </SidebarSection>
  )
}

function routePathForPinned(routeId: string, currentPathname: string): string | null {
  if (!routeId.includes('$')) return routeId
  const base = routeId.split('/$')[0]
  if (currentPathname.startsWith(base + '/')) return currentPathname
  return null
}
```

Register new testids in `docs/testid-registry.md`:
- `sidebar-section-pinned` — exact match
- `sidebar-pinned-empty` — exact match
- `sidebar-pinned-view-{id}` — dynamic pattern

IMPORTANT:
- Active-state algorithm uses BOTH pathname-prefix match AND full search-state structural match (Research Pitfall 9 recommendation). A pinned view on `/cost` with `{range: '30d'}` is "active" only when the user is on `/cost` AND `?range=30d` is the current URL state.
- `routePathForPinned` is duplicated from Plan 08's `routePathFromId` — extract to a shared util if convenient, but inline is acceptable for v1 (note in SUMMARY).
- Collapsed-sidebar mode handles label text via existing `[data-sidebar-collapsed='true']` CSS — match the convention in `SidebarNavLink.tsx`. The Pin icon stays visible; the label-span hides. If the existing CSS doesn't auto-handle a generic `<button>` (vs the existing `SidebarNavLink` which is the route-link primitive), add `[data-sidebar-collapsed='true'] .cmc-sidebar__navlink-label { display: none }` (or whatever the existing convention is) to `styles.css`.
- The empty state mirrors Phase 24's `Configure` empty-body convention (Sidebar.tsx:133) — section header always visible.
- The `SidebarSection` component may not accept a `testId` prop — read it first; if it doesn't, add the prop with the obvious passthrough to the section's root element.
  </action>
  <verify>
`pnpm tsc --noEmit` clean. `pnpm lint` clean. Manual: open sidebar — see "Pinned" section header; pin a view from the SavedViewMenu — see it appear in the sidebar Pinned section after a localStorage write + re-render (you may need to refresh once — localStorage doesn't fire 'storage' events on the same tab; document this limitation in SUMMARY).
  </verify>
  <done>
PinnedViewsSection renders; empty state visible when no pins; active-state highlighted on full search match; testids registered.
  </done>
</task>

<task type="auto">
  <name>Task 2: Mount PinnedViewsSection in Sidebar between Operate and Configure</name>
  <files>frontend/src/components/shell/Sidebar.tsx</files>
  <action>
Edit `frontend/src/components/shell/Sidebar.tsx`. Read the existing IA (Home → Observe → Operate → Configure per Phase 24 plan-04 SUMMARY). Insert `<PinnedViewsSection />` BETWEEN Operate and Configure, mirroring the indentation + spacing of the existing section calls.

```tsx
import { PinnedViewsSection } from '../savedviews/PinnedViewsSection'

// inside the Sidebar return, in the section stack:
{/* Existing: Home / Observe / Operate */}
<PinnedViewsSection />
{/* Existing: Configure */}
```

That's the only change to Sidebar.tsx itself — the section component owns its rendering.

CRITICAL invariants from Phase 24 plan-04 SUMMARY:
- Sidebar IA is LOCKED AS SHIPPED for the 4 ORIGINAL sections (Home / Observe / Operate / Configure). Phase 25's Pinned section is the FIRST addition since the lock — slot it BETWEEN Operate and Configure (per the natural read: operational stuff → pinned items → settings).
- Do NOT modify the existing 4 sections' contents.
- Do NOT change the sidebar's brand area, the collapse-toggle, or the active-route-accent CSS.
  </action>
  <verify>
`pnpm tsc --noEmit` clean. Manual: open sidebar in `pnpm dev` — see Pinned section visually between Operate and Configure; collapsed-mode hides the label but section structure persists; existing 4 sections render identically to Phase 24 close.
  </verify>
  <done>
Sidebar renders 5 sections (Home / Observe / Operate / Pinned / Configure); existing IA preserved.
  </done>
</task>

<task type="auto">
  <name>Task 3: Vitest coverage for PinnedViewsSection</name>
  <files>frontend/src/components/savedviews/__tests__/PinnedViewsSection.test.tsx</files>
  <action>
Create `frontend/src/components/savedviews/__tests__/PinnedViewsSection.test.tsx`. Mock `useSavedViews` + `getPinnedIds` + `useNavigate` + `useRouterState` + wrap in `LoadedViewProvider`.

Required cases (≥5):
- Renders empty state when no pinned ids ("Pin a saved view from the header menu").
- Renders only the views whose ids are in `getPinnedIds()` (filters out non-pinned).
- Click navigates to the static route + calls setLoadedView.
- Active state (`data-active="true"`) appears when location.pathname AND search match the pinned view.
- Active state does NOT appear when pathname matches but search differs.
- Dynamic-segment views are guarded: clicking from a non-matching pathname does NOT navigate.

Pattern (similar to Plan 06 / 07 tests for mocking shape):

```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PinnedViewsSection } from '../PinnedViewsSection'
import { LoadedViewProvider } from '../LoadedViewContext'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useRouterState: vi.fn(() => ({ pathname: '/cost', search: { range: '7d', schemaVersion: 1 } })),
}))
vi.mock('../../../lib/queries', () => ({
  useSavedViews: () => ({
    data: {
      items: [
        { id: 1, name: 'cost 7d', route: '/cost', state_json: { range: '7d', schemaVersion: 1 } },
        { id: 2, name: 'cost 30d', route: '/cost', state_json: { range: '30d', schemaVersion: 1 } },
        { id: 3, name: 'unpinned', route: '/alerts', state_json: { schemaVersion: 1 } },
      ],
      total: 3,
    },
  }),
}))
vi.mock('../../../lib/savedViews', () => ({
  getPinnedIds: () => [1, 2],
}))

describe('PinnedViewsSection', () => {
  it('renders only pinned ids', () => {
    render(<LoadedViewProvider><PinnedViewsSection /></LoadedViewProvider>)
    expect(screen.getByTestId('sidebar-pinned-view-1')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-pinned-view-2')).toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-pinned-view-3')).toBeNull()
  })
  // …other cases follow the same pattern
})
```

For the active-state tests, vary the `useRouterState` mock between cases.

IMPORTANT:
- Active-state algorithm is the heart of Pitfall 9 — these tests are the regression net.
- If a test triggers a `vi.mocked(useRouterState).mockReturnValue(...)` pattern, follow `frontend/src/components/shell/__tests__/Sidebar.test.tsx` (the existing precedent) for the right `vi.mock` shape.
  </action>
  <verify>
`pnpm test --run src/components/savedviews/__tests__/PinnedViewsSection.test.tsx` — all 5+ cases pass.
  </verify>
  <done>
~5+ vitest cases passing; active-state logic verified.
  </done>
</task>

</tasks>

<verification>
1. `cd frontend && pnpm tsc --noEmit` clean.
2. `cd frontend && pnpm test --run` — full vitest green; count up by ~5.
3. `cd frontend && pnpm lint` clean.
4. `cd frontend && pnpm build` succeeds.
5. Manual: pin a view from SavedViewMenu, refresh page (localStorage limitation), see it appear in Sidebar Pinned section; navigate from another route — see it accent when both pathname AND search match.
6. Visual smoke: sidebar collapse via Cmd+B — Pinned section's label hides; Pin icon remains clickable.
</verification>

<success_criteria>
- SHEL-06 satisfied: Pinned section exists between Operate and Configure; pinned views render; clicks navigate; active state on full search match.
- Phase 24's sidebar IA invariant preserved (existing 4 sections unchanged).
- Collapsed-sidebar mode handles the new section gracefully.
- Plan 11 e2e can extend v13-sidebar.spec.ts to cover pin/unpin → visible.
</success_criteria>

<output>
After completion, create `.planning/phases/25-saved-views-backend-frontend/25-09-SUMMARY.md` documenting:
- Section position in IA (between Operate and Configure)
- Active-state algorithm (pathname prefix + full search match)
- localStorage limitation (same-tab pin doesn't re-render until refresh; future plan can use a custom event)
- vitest count delta
- Hint for Plan 11: `v13-sidebar.spec.ts` extension covers pin/unpin/active-state
</output>
