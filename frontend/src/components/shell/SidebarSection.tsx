// SidebarSection — Phase 24 Plan 04 (SHEL-01).
//
// Renders a section header (Observe / Operate / Configure) followed by its
// nav links. When the sidebar is collapsed the header is hidden via CSS
// (`[data-sidebar-collapsed="true"] .cmc-sidebar__section-header { display: none }`)
// and a thin 1px divider appears between adjacent sections instead.
//
// `children` is optional so the Configure section can render its header
// alone — the body is reserved for future Settings / Doctor work.
//
// Phase 25 Plan 09 (SHEL-06): optional `testId` prop forwarded to the
// section's root element so PinnedViewsSection (and any future cross-cutting
// section) can be uniquely addressed by Playwright + vitest. The 4 original
// sections (Home / Observe / Operate / Configure) omit it — they're addressed
// via their child SidebarNavLinks' testids.

import type { ReactNode } from 'react'

interface Props {
  title: string
  children?: ReactNode
  /** Optional data-testid forwarded to the section's root element. Used by
   * Phase 25 Plan 09's Pinned section; the 4 original Phase 24 sections
   * leave it undefined and are addressed via per-link testids. */
  testId?: string
}

export function SidebarSection({ title, children, testId }: Props) {
  return (
    <div className="cmc-sidebar__section" data-testid={testId}>
      <div className="cmc-sidebar__section-header">{title}</div>
      {children}
    </div>
  )
}
