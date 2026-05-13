// Sidebar — Phase 24 Plan 04 (SHEL-01, SHEL-03, SHEL-04) + Phase 25 Plan 09 (SHEL-06)
// + Phase 26 Plan 04 (SHEL-05).
//
// Persistent left sidebar that replaces the old top NavBar. Renders:
//   - brand "Mission Control" + chrome collapse-toggle in the header,
//   - top-level Home link (above the section grouping),
//   - Observe section (Activity / Sessions Compare / Skills / Cost),
//   - Operate section (Alerts),
//   - Pinned section (Phase 25 Plan 09 — cross-route saved views the user
//     has pinned via the SavedViewMenu submenu; header always renders),
//   - Recently Visited section (Phase 26 Plan 04 — auto-curated top 3
//     recent routes from cmc.recents.routes; header always renders;
//     currently-active route filtered out per Pitfall 8 option b),
//   - Configure section (header rendered, body empty — reserved for future
//     Settings / Doctor work; locked in CONTEXT).
//
// IA RECONCILIATION (Phase 26 Plan 04 — rationale_for_deviation): CONTEXT.md
// originally described "Pinned → Recently Visited → Operate → Configure",
// but Phase 25 Plan 09 SUMMARY locked Pinned BETWEEN Operate and Configure
// (current shape: Observe → Operate → Pinned → Configure). Re-locating
// Pinned is out of scope for Phase 26, so Recently Visited is inserted
// BELOW Pinned, ABOVE Configure. Final order:
//   Home → Observe → Operate → Pinned → Recently Visited → Configure
// This preserves the CONTEXT spirit (both starting-point sections —
// user-curated Pinned + auto-curated Recently Visited — adjacent at the
// end of the sidebar).
//
// Collapsed mode (52px width vs 240px expanded):
//   - Section headers + nav labels hide via CSS `[data-sidebar-collapsed]`.
//   - Each nav row's icon centers; hovering shows a Radix Tooltip
//     (side="right") with the label.
//   - Toggle: Cmd+B (Mac) / Ctrl+B (Win/Linux) global keydown listener,
//     OR click the chrome control button (testid `sidebar-collapse-toggle`).
//
// Cmd+B implementation pitfall (research §"Cmd+B keyboard handling"):
//   - Listener is attached to `window`, NOT a specific element. This is
//     deliberate — Cmd+B must work even when focus is inside a Radix Sheet,
//     a `<textarea>`, or the Cmd+K palette.
//   - `e.preventDefault()` blocks the macOS bold-shortcut from inserting a
//     bold marker if focus happens to be in a contentEditable region.
//
// Persistence: collapsed-state round-trips through `lib/sidebar.ts` (mirror
// of `lib/density.ts` / `lib/theme.ts`). `applySidebar()` is called once at
// boot in `main.tsx` to avoid a flash of the wrong width on cold load.

import { useEffect, useState } from 'react'
import {
  Activity,
  Bell,
  DollarSign,
  GitCompare,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from 'lucide-react'
import { isSidebarCollapsed, setSidebarCollapsed } from '../../lib/sidebar'
import { SidebarSection } from './SidebarSection'
import { SidebarNavLink } from './SidebarNavLink'
// Phase 25 Plan 09 (SHEL-06) — cross-route Pinned section. Mounts BETWEEN
// Operate and Configure per the locked IA addition (the 4 original Phase 24
// sections — Home / Observe / Operate / Configure — remain in their locked
// positions; Pinned is the FIRST sidebar IA addition since the Phase 24 lock).
import { PinnedViewsSection } from '../savedviews/PinnedViewsSection'
// Phase 26 Plan 04 (SHEL-05) — auto-curated "Recently Visited" section.
// Mounts BELOW Pinned, ABOVE Configure per the locked IA reconciliation
// documented in the file header. Cap = 3 rows (CONTEXT-locked); current
// pathname filtered out (Pitfall 8 option b).
import { RecentlyVisitedSection } from '../recents/RecentlyVisitedSection'

export function Sidebar() {
  // Mount with the SSR-safe default (false). useEffect syncs to the
  // persisted value AFTER hydration so React 19 StrictMode doesn't
  // double-warn about a localStorage read during render. (Same pattern as
  // ThemeToggle / DensityToggle.)
  const [collapsed, setCollapsed] = useState<boolean>(false)
  useEffect(() => {
    setCollapsed(isSidebarCollapsed())
  }, [])

  // Cmd+B / Ctrl+B keyboard toggle — window-level so it captures even when
  // focus is inside an input, a Radix Sheet, or the Cmd+K palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        const next = !collapsed
        setCollapsed(next)
        setSidebarCollapsed(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    setSidebarCollapsed(next)
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <aside className="cmc-sidebar" aria-label="Primary navigation">
      <div className="cmc-sidebar__header">
        <span className="cmc-brand cmc-sidebar__brand">Mission Control</span>
        <button
          type="button"
          className="cmc-sidebar__collapse-toggle"
          data-testid="sidebar-collapse-toggle"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          <ToggleIcon size={16} aria-hidden />
        </button>
      </div>

      {/* Top-level Home — sits above the named sections per locked IA. */}
      <SidebarNavLink to="/" label="Home" Icon={Home} collapsed={collapsed} exact />

      <SidebarSection title="Observe">
        <SidebarNavLink
          to="/activity"
          label="Activity"
          Icon={Activity}
          collapsed={collapsed}
        />
        <SidebarNavLink
          to="/sessions/compare"
          label="Sessions Compare"
          Icon={GitCompare}
          collapsed={collapsed}
        />
        <SidebarNavLink
          to="/skills"
          label="Skills"
          Icon={Sparkles}
          collapsed={collapsed}
        />
        <SidebarNavLink
          to="/cost"
          label="Cost"
          Icon={DollarSign}
          collapsed={collapsed}
        />
      </SidebarSection>

      <SidebarSection title="Operate">
        <SidebarNavLink
          to="/alerts"
          label="Alerts"
          Icon={Bell}
          collapsed={collapsed}
        />
      </SidebarSection>

      {/* Phase 25 Plan 09 (SHEL-06) — cross-route pinned saved-views list.
       * Section header ALWAYS renders (mirrors the Configure empty-body
       * precedent below); body is dynamic from localStorage pin state. */}
      <PinnedViewsSection />

      {/* Phase 26 Plan 04 (SHEL-05) — auto-curated Recently Visited list.
       * Section header ALWAYS renders; body is top 3 from cmc.recents.routes
       * (current pathname filtered out). */}
      <RecentlyVisitedSection collapsed={collapsed} />

      {/* Configure section reserved — header rendered, body empty. */}
      <SidebarSection title="Configure" />
    </aside>
  )
}
