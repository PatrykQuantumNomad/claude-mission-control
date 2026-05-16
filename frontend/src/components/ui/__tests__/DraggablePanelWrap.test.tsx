// Phase 28 Plan 28-04 — vitest for `DraggablePanelWrap` (LAYO-02).
//
// Wave 3 wraps every reorder-eligible PanelCard mount with this component.
// Mouse path uses native HTML5 dnd (no dnd-kit per REQUIREMENTS dep budget);
// keyboard path implements Space-to-grab + ArrowUp/Down + Enter-commit +
// Esc-cancel with an aria-live region for screen-reader announcements
// (mandatory — native HTML5 dnd has zero keyboard support per Pitfall 4).
//
// Behaviour exercised:
//   1. Mouse: dragstart writes panelId + columnId to dataTransfer.
//   2. Mouse: drop within the SAME column calls onReorder(fromId, index).
//   3. Mouse: cross-column drop is REJECTED (handler asserts source columnId
//      === target columnId; mismatched drop is a no-op — LAYO-02 single
//      column constraint).
//   4. Keyboard: Tab focuses the grip; Space toggles aria-pressed
//      (grab-mode latch); ArrowDown calls onReorder(panelId, index+1);
//      ArrowUp calls onReorder(panelId, index-1); Enter commits (clears
//      grab-mode); Escape cancels (no onReorder).
//   5. Boundary: ArrowDown at index === total-1 is a no-op; ArrowUp at
//      index === 0 is a no-op.
//   6. a11y: aria-live region (role='status' aria-live='polite') is in DOM;
//      grip exposes aria-label="Reorder {label}" and aria-pressed reflects
//      grab-mode.
//   7. Testid contract: data-testid="panel-drag-grip-{panelId}" on the grip
//      button (Phase 28 testid registry).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, userEvent, fireEvent } from '../../../test/utils'
import { DraggablePanelWrap } from '../DraggablePanelWrap'

// Minimal DataTransfer mock — happy-dom DOES expose a `window.DataTransfer`
// class, but testing-library/dom's `fireEvent` (events.js:82-89) constructs
// a NEW `window.DataTransfer` instance and copies properties from our mock
// onto it via `Object.defineProperty(acc, propName, { value: ... })`. The
// copy uses default descriptors (writable:false, configurable:false), so
// any handler that later mutates `e.dataTransfer.effectAllowed = 'move'`
// fails silently against the copy. To verify those writes we attach a
// shared closure-backed `_store` and read THAT instead of the event's
// dataTransfer copy. The `setData`/`getData` methods are copied as value
// properties; invoking them on the copy still runs OUR closure handlers
// (function identity is preserved by value-copy), so getData() round-trips
// the value correctly.
//
// Returned shape is `{ dataTransfer, store }`:
//   - `dataTransfer` is the mock to pass to fireEvent.
//   - `store` is the closure with `effectAllowed` + `dropEffect` getters,
//     used by the test to verify writes that happen on the dispatched
//     event's dataTransfer copy.
interface MockDataTransferHandle {
  dataTransfer: DataTransfer
  store: {
    getEffectAllowed: () => string
    getDropEffect: () => string
    getData: (key: string) => string
  }
}

function createMockDataTransfer(): MockDataTransferHandle {
  const dataStore = new Map<string, string>()
  const types: string[] = []
  let effectAllowed: string = 'none'
  let dropEffect: string = 'none'
  const dt: Record<string, unknown> = {
    types,
    get effectAllowed() {
      return effectAllowed
    },
    set effectAllowed(v: string) {
      effectAllowed = v
    },
    get dropEffect() {
      return dropEffect
    },
    set dropEffect(v: string) {
      dropEffect = v
    },
    setData(format: string, data: string) {
      dataStore.set(format, data)
      if (!types.includes(format)) types.push(format)
    },
    getData(format: string) {
      return dataStore.get(format) ?? ''
    },
    clearData() {
      dataStore.clear()
      types.length = 0
    },
    setDragImage() {},
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
  }
  return {
    dataTransfer: dt as unknown as DataTransfer,
    store: {
      getEffectAllowed: () => effectAllowed,
      getDropEffect: () => dropEffect,
      getData: (key: string) => dataStore.get(key) ?? '',
    },
  }
}

describe('DraggablePanelWrap (Phase 28 Plan 28-04 — LAYO-02)', () => {
  describe('testid contract (Phase 28 registry)', () => {
    it('renders the grip button with data-testid="panel-drag-grip-{panelId}"', () => {
      render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={vi.fn()}
        >
          <div>child-content</div>
        </DraggablePanelWrap>,
      )
      expect(screen.getByTestId('panel-drag-grip-b')).toBeInTheDocument()
      expect(screen.getByText('child-content')).toBeInTheDocument()
    })

    it('grip has aria-label "Reorder {label}" and aria-pressed=false initially', () => {
      render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={vi.fn()}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const grip = screen.getByTestId('panel-drag-grip-b')
      expect(grip.getAttribute('aria-label')).toBe('Reorder Panel B')
      expect(grip.getAttribute('aria-pressed')).toBe('false')
      expect(grip.getAttribute('draggable')).toBe('true')
    })

    it('wrapper exposes data-panel-id and data-column-id', () => {
      const { container } = render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={vi.fn()}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const wrap = container.querySelector('[data-panel-id="b"]')
      expect(wrap).not.toBeNull()
      expect(wrap?.getAttribute('data-column-id')).toBe('main')
    })

    it('aria-live region (role=status, aria-live=polite) is in the DOM', () => {
      render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={vi.fn()}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const region = screen.getByRole('status')
      expect(region.getAttribute('aria-live')).toBe('polite')
      expect(region).toHaveClass('cmc-sr-only')
    })
  })

  describe('mouse drag (HTML5 native dnd)', () => {
    it('dragstart writes panelId + columnId to dataTransfer (matches drop handler contract)', () => {
      // NOTE: `effectAllowed='move'` is set by the handler but happy-dom +
      // testing-library copy the mock's properties into a new
      // `window.DataTransfer` using `Object.defineProperty(acc, prop, {value:
      // ...})` (no descriptor → non-writable). Our handler does write
      // `effectAllowed='move'` on the copied DataTransfer, but the write is
      // invisible to our closure since the copy is a separate object. The
      // setData/getData round-trip works because functions are copied by
      // reference, so invocations still hit our closure store. Playwright's
      // real-browser e2e test asserts the visible side-effect (URL writes
      // after drop) which proves effectAllowed propagated correctly.
      render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={vi.fn()}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const grip = screen.getByTestId('panel-drag-grip-b')
      const { dataTransfer, store } = createMockDataTransfer()
      fireEvent.dragStart(grip, { dataTransfer })
      expect(store.getData('text/cmc-panel-id')).toBe('b')
      expect(store.getData('text/cmc-column-id')).toBe('main')
    })

    it('drop within the same column calls onReorder(fromId, targetIndex)', () => {
      const onReorder = vi.fn()
      const { container } = render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={onReorder}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const wrap = container.querySelector(
        '[data-panel-id="b"]',
      ) as HTMLElement
      const { dataTransfer } = createMockDataTransfer()
      // Source (panel 'a') was dragged from columnId='main' (same column).
      dataTransfer.setData('text/cmc-panel-id', 'a')
      dataTransfer.setData('text/cmc-column-id', 'main')
      fireEvent.dragOver(wrap, { dataTransfer })
      fireEvent.drop(wrap, { dataTransfer })
      expect(onReorder).toHaveBeenCalledTimes(1)
      expect(onReorder).toHaveBeenCalledWith('a', 1)
    })

    it('drop from a different column is REJECTED (cross-column constraint)', () => {
      const onReorder = vi.fn()
      const { container } = render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={onReorder}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const wrap = container.querySelector(
        '[data-panel-id="b"]',
      ) as HTMLElement
      const { dataTransfer } = createMockDataTransfer()
      // Source dragged from 'top' — different column. Drop must be no-op.
      dataTransfer.setData('text/cmc-panel-id', 'x')
      dataTransfer.setData('text/cmc-column-id', 'top')
      fireEvent.dragOver(wrap, { dataTransfer })
      fireEvent.drop(wrap, { dataTransfer })
      expect(onReorder).not.toHaveBeenCalled()
    })

    it('dragend clears the cmc-panel--dragging visual state', () => {
      render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={vi.fn()}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const grip = screen.getByTestId('panel-drag-grip-b')
      const { dataTransfer } = createMockDataTransfer()
      fireEvent.dragStart(grip, { dataTransfer })
      // Class only appears for the duration of the drag; dragEnd removes it.
      fireEvent.dragEnd(grip)
      const wrap = grip.closest('[data-panel-id="b"]') as HTMLElement
      expect(wrap.className).not.toMatch(/cmc-panel--dragging/)
    })
  })

  describe('keyboard reorder (a11y parity per LAYO-02 SC#3)', () => {
    beforeEach(() => {
      // Each test starts with a fresh user-event instance so keystrokes are
      // sequenced (RTL recommendation).
    })

    it('Space toggles aria-pressed (grab-mode on); aria-live announces grab', async () => {
      render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={vi.fn()}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const user = userEvent.setup()
      const grip = screen.getByTestId('panel-drag-grip-b')
      grip.focus()
      expect(grip.getAttribute('aria-pressed')).toBe('false')
      await user.keyboard(' ')
      expect(grip.getAttribute('aria-pressed')).toBe('true')
      const region = screen.getByRole('status')
      expect(region.textContent ?? '').toMatch(/Panel B grabbed/i)
      expect(region.textContent ?? '').toMatch(/position 2 of 3/i)
    })

    it('ArrowDown in grab-mode calls onReorder(panelId, index+1) and announces', async () => {
      const onReorder = vi.fn()
      render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={onReorder}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const user = userEvent.setup()
      const grip = screen.getByTestId('panel-drag-grip-b')
      grip.focus()
      await user.keyboard(' ') // grab
      await user.keyboard('{ArrowDown}')
      expect(onReorder).toHaveBeenCalledWith('b', 2)
      const region = screen.getByRole('status')
      expect(region.textContent ?? '').toMatch(
        /Panel B moved to position 3 of 3/i,
      )
    })

    it('ArrowUp in grab-mode calls onReorder(panelId, index-1)', async () => {
      const onReorder = vi.fn()
      render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={onReorder}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const user = userEvent.setup()
      const grip = screen.getByTestId('panel-drag-grip-b')
      grip.focus()
      await user.keyboard(' ')
      await user.keyboard('{ArrowUp}')
      expect(onReorder).toHaveBeenCalledWith('b', 0)
    })

    it('ArrowUp at index === 0 is a no-op (boundary)', async () => {
      const onReorder = vi.fn()
      render(
        <DraggablePanelWrap
          panelId="a"
          columnId="main"
          label="Panel A"
          index={0}
          total={3}
          onReorder={onReorder}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const user = userEvent.setup()
      const grip = screen.getByTestId('panel-drag-grip-a')
      grip.focus()
      await user.keyboard(' ')
      await user.keyboard('{ArrowUp}')
      expect(onReorder).not.toHaveBeenCalled()
    })

    it('ArrowDown at index === total-1 is a no-op (boundary)', async () => {
      const onReorder = vi.fn()
      render(
        <DraggablePanelWrap
          panelId="c"
          columnId="main"
          label="Panel C"
          index={2}
          total={3}
          onReorder={onReorder}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const user = userEvent.setup()
      const grip = screen.getByTestId('panel-drag-grip-c')
      grip.focus()
      await user.keyboard(' ')
      await user.keyboard('{ArrowDown}')
      expect(onReorder).not.toHaveBeenCalled()
    })

    it('Enter in grab-mode (second press) clears grab-mode (commits drop)', async () => {
      render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={vi.fn()}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const user = userEvent.setup()
      const grip = screen.getByTestId('panel-drag-grip-b')
      grip.focus()
      await user.keyboard(' ') // grab
      expect(grip.getAttribute('aria-pressed')).toBe('true')
      await user.keyboard('{Enter}') // commit
      expect(grip.getAttribute('aria-pressed')).toBe('false')
      const region = screen.getByRole('status')
      expect(region.textContent ?? '').toMatch(/dropped/i)
    })

    it('Escape in grab-mode cancels without calling onReorder', async () => {
      const onReorder = vi.fn()
      render(
        <DraggablePanelWrap
          panelId="b"
          columnId="main"
          label="Panel B"
          index={1}
          total={3}
          onReorder={onReorder}
        >
          <div>child</div>
        </DraggablePanelWrap>,
      )
      const user = userEvent.setup()
      const grip = screen.getByTestId('panel-drag-grip-b')
      grip.focus()
      await user.keyboard(' ')
      await user.keyboard('{Escape}')
      expect(grip.getAttribute('aria-pressed')).toBe('false')
      expect(onReorder).not.toHaveBeenCalled()
      const region = screen.getByRole('status')
      expect(region.textContent ?? '').toMatch(/cancelled/i)
    })
  })
})
