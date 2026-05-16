// Phase 28 Plan 01 — Skeleton vitest for `PanelHeaderMenu`.
//
// Wave 2 (Plan 28-03) ships `frontend/src/components/ui/PanelHeaderMenu.tsx`
// — a Radix DropdownMenu mounted in the PanelCard trailing slot exposing
// "Hide this panel" + "Reset layout" entries. The testid families
// `panel-header-menu-{panelId}` / `panel-hide-{panelId}` /
// `panel-reset-layout-{route}` are pre-registered in
// `docs/testid-registry.md` by Task 3 below so the ESLint
// `cmc/testid-registry-only` rule does not block Plan 28-03 commits.

import { describe, it } from 'vitest'

describe('PanelHeaderMenu (Phase 28 Plan 28-03 — LAYO-01 + LAYO-04)', () => {
  it.todo(
    'renders DropdownMenu.Trigger with data-testid="panel-header-menu-{panelId}"',
  )
  it.todo('opens the menu on trigger click (Radix DropdownMenu.Content portal)')
  it.todo(
    'Hide item (data-testid="panel-hide-{panelId}") calls setHidden(panelId, true) via useLayoutState',
  )
  it.todo(
    'Reset layout item (data-testid="panel-reset-layout-{route}") calls reset() and writes URL without hidden_panels/panel_order/split_sizes',
  )
  it.todo(
    'Reset layout item preserves time_from/time_to/compare_panels (Pitfall 11 + LAYO-04 SC#3)',
  )
})
