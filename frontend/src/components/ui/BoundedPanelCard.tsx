// BoundedPanelCard — Phase 24 Plan 03 (CONT-04).
//
// Ergonomic preset of PanelCard with `bounded` forced to true. Use this at
// call sites where bounded is the intent (a table panel that must scroll
// internally instead of growing the page). Underlying behavior + className
// composition is identical to <PanelCard bounded ... />.
//
// Per-route adoption (Phase 26/27): swap PanelCard imports to BoundedPanelCard
// at sites that should pin to parent height. Mid-phase rewrites are explicitly
// out of scope for Phase 24 — this file ships the primitive only.

import { ReactNode } from 'react'
import { UseQueryResult } from '@tanstack/react-query'
import { PanelCard, type PanelCardEmpty } from './PanelCard'

interface BoundedPanelCardProps<TData> {
  reqId: string
  title: string
  description?: ReactNode
  trailing?: ReactNode
  query: UseQueryResult<TData, Error>
  empty: PanelCardEmpty<TData>
  skeleton?: ReactNode
  hiddenWhenEmpty?: boolean
  /** Phase 28 / LAYO-01 — see PanelCard.panelId JSDoc. APPEND-ONLY optional. */
  panelId?: string
  /** Phase 28 / LAYO-01 — see PanelCard.headerMenu JSDoc. APPEND-ONLY optional. */
  headerMenu?: ReactNode
  children: (data: TData) => ReactNode
}

export function BoundedPanelCard<T>(props: BoundedPanelCardProps<T>) {
  return <PanelCard<T> {...props} bounded />
}
