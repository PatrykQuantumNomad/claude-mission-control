// RecentlyVisitedSection — Phase 26 Plan 04 (SHEL-05).
//
// Sidebar section rendering the top 3 recent routes (NOT 5 — CONTEXT
// narrows to 3 for the sidebar; the future Cmd+K Recents group will show
// top 5 from the same ring). Filters out the currently-active route
// (Pitfall 8 option b): the cleanest UX, side-steps the one-frame flicker
// that would otherwise appear because pushRecentRoute runs in useEffect
// AFTER the navigation has committed.
//
// Section header ALWAYS renders (mirrors PinnedViewsSection — Phase 25
// Plan 09 — and the Configure empty-body precedent from Phase 24 Plan 04).
// First-time users see only the header until they navigate around — by
// design.
//
// Active-state: the routes shown here are by definition NOT the currently-
// active route (filtered out), so no active-state styling is needed. Each
// row reuses SidebarNavLink — its standard hover affordance + the
// per-link `sidebar-link-{slug}` testid carry over. We do NOT add a new
// testid prop to SidebarNavLink (out-of-scope blast-radius rule); the
// section root testid `sidebar-section-recently-visited` combined with
// `within()` scoping is sufficient for vitest + Playwright.
//
// Re-render trigger: `useRouterState({ select: s => s.location.pathname })`
// fires on every navigation, which re-runs the useMemo that reads
// `getRecentRoutes()` from localStorage. This is intentional — Pitfall 8
// option b says "rely on the next navigation to re-read"; no custom
// storage-event channel is needed for v1.

import { useMemo } from 'react'
import {
  Activity,
  Bell,
  DollarSign,
  GitCompare,
  Home,
  Sparkles,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { SidebarSection } from '../shell/SidebarSection'
import { SidebarNavLink } from '../shell/SidebarNavLink'
import { getRecentRoutes } from '../../lib/recents'

type IconC = ComponentType<{
  size?: number | string
  className?: string
  'aria-hidden'?: boolean
}>

const ROUTE_META: Record<string, { label: string; Icon: IconC; to: string }> = {
  '/': { label: 'Home', Icon: Home, to: '/' },
  '/activity': { label: 'Activity', Icon: Activity, to: '/activity' },
  '/sessions/compare': {
    label: 'Sessions Compare',
    Icon: GitCompare,
    to: '/sessions/compare',
  },
  '/skills': { label: 'Skills', Icon: Sparkles, to: '/skills' },
  // /skills/$name v1 fallback: navigates to the skills index because the
  // ring entry does not carry the resolved dynamic value (mirrors the
  // PinnedViewsSection dynamic-route limitation locked in Phase 25 Plan 09).
  '/skills/$name': { label: 'Skill detail', Icon: Sparkles, to: '/skills' },
  '/cost': { label: 'Cost', Icon: DollarSign, to: '/cost' },
  '/alerts': { label: 'Alerts', Icon: Bell, to: '/alerts' },
}

function normalizeRouteId(pathname: string): string {
  // Mirror of RecentRoutesTracker's normalize helper — keep the
  // recents/ module self-contained.
  if (pathname.startsWith('/skills/') && pathname !== '/skills/') {
    return '/skills/$name'
  }
  return pathname
}

interface Props {
  collapsed?: boolean
}

export function RecentlyVisitedSection({ collapsed = false }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const top3 = useMemo(() => {
    const all = getRecentRoutes()
    // Pitfall 8 option b: filter the currently-active route out of the
    // display list. Then slice to the CONTEXT-locked 3-row cap.
    const current = normalizeRouteId(pathname)
    return all.filter((r) => r.route !== current).slice(0, 3)
  }, [pathname])

  return (
    <SidebarSection
      title="Recently Visited"
      testId="sidebar-section-recently-visited"
    >
      {top3.map((r) => {
        const meta = ROUTE_META[r.route]
        if (!meta) return null
        return (
          <SidebarNavLink
            key={r.route}
            to={meta.to}
            label={meta.label}
            Icon={meta.Icon}
            collapsed={collapsed}
          />
        )
      })}
    </SidebarSection>
  )
}
