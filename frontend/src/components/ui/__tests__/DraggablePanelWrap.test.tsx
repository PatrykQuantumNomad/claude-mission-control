// Phase 28 Plan 01 — Skeleton vitest for `DraggablePanelWrap`.
//
// Wave 2 (Plan 28-04) ships `frontend/src/components/ui/DraggablePanelWrap.tsx`
// — a wrapper that exposes a GripVertical handle (testid
// `panel-drag-grip-{panelId}`) supporting BOTH native HTML5 mouse drag
// AND keyboard grab-mode (Space/Enter to grab, ArrowUp/Down to reorder,
// Esc to cancel, Enter/Space again to commit). The component is also
// responsible for the cross-column drop guard — a `/cost` column-A panel
// MUST NOT be droppable onto a `/cost` column-B drop zone.

import { describe, it } from 'vitest'

describe('DraggablePanelWrap (Phase 28 Plan 28-04 — LAYO-02)', () => {
  describe('mouse drag (HTML5 native dnd)', () => {
    it.todo(
      'dragstart writes panelId to dataTransfer (matches drop handler contract)',
    )
    it.todo('dragend clears in-progress visual state regardless of drop outcome')
    it.todo('cross-column drop is ignored (columnId mismatch guard)')
  })

  describe('keyboard reorder (a11y parity per LAYO-02 SC#3)', () => {
    it.todo(
      'Space toggles aria-pressed (grab-mode on); the grip is `button` role with aria-grabbed semantics',
    )
    it.todo('ArrowDown in grab-mode calls onReorder with index+1')
    it.todo('ArrowUp in grab-mode calls onReorder with index-1 (clamped to 0)')
    it.todo('Esc cancels grab-mode without writing URL')
    it.todo('Enter commits the new order via useLayoutState.setOrder(...)')
  })

  describe('testid contract (Phase 28 registry)', () => {
    it.todo('renders the grip button with data-testid="panel-drag-grip-{panelId}"')
  })
})
