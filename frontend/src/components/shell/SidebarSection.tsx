// SidebarSection — Phase 24 Plan 04 (SHEL-01).
//
// Renders a section header (Observe / Operate / Configure) followed by its
// nav links. When the sidebar is collapsed the header is hidden via CSS
// (`[data-sidebar-collapsed="true"] .cmc-sidebar__section-header { display: none }`)
// and a thin 1px divider appears between adjacent sections instead.
//
// `children` is optional so the Configure section can render its header
// alone — the body is reserved for future Settings / Doctor work.

import type { ReactNode } from 'react'

interface Props {
  title: string
  children?: ReactNode
}

export function SidebarSection({ title, children }: Props) {
  return (
    <div className="cmc-sidebar__section">
      <div className="cmc-sidebar__section-header">{title}</div>
      {children}
    </div>
  )
}
