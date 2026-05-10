// SidebarNavLink — Phase 24 Plan 04 (SHEL-01, SHEL-03, SHEL-04).
//
// Single nav row inside the sidebar. Wraps a TanStack Router <Link> so the
// router's `activeProps` mechanism applies the active highlight class
// (`cmc-sidebar__navlink--active`) automatically when the route matches —
// CSS does the rest (3px accent-blue border-left + tinted background).
//
// In collapsed mode, the label is hidden via CSS and the icon centers; we
// wrap the link in the existing `ui/Tooltip` (Radix-portaled) with
// side="right" so the route label appears OUTSIDE the sidebar boundary
// toward the main content area (research-locked).

import { Link } from '@tanstack/react-router'
import type { ComponentType } from 'react'
import { Tooltip } from '../ui/Tooltip'

interface Props {
  to: string
  label: string
  Icon: ComponentType<{
    size?: number | string
    className?: string
    'aria-hidden'?: boolean
  }>
  collapsed: boolean
  exact?: boolean
}

export function SidebarNavLink({ to, label, Icon, collapsed, exact }: Props) {
  // Slug for the per-link data-testid. `/` becomes `home`; other routes
  // strip the leading slash and replace non-word chars with `-`.
  const slug = to.replace(/^\//, '').replace(/\W/g, '-') || 'home'
  const link = (
    <Link
      to={to}
      className="cmc-sidebar__navlink"
      activeProps={{
        className: 'cmc-sidebar__navlink cmc-sidebar__navlink--active',
      }}
      activeOptions={{ exact: exact ?? to === '/' }}
      data-testid={`sidebar-link-${slug}`}
    >
      <Icon className="cmc-sidebar__navlink-icon" aria-hidden />
      <span className="cmc-sidebar__navlink-label">{label}</span>
    </Link>
  )
  return collapsed ? (
    <Tooltip content={label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}
