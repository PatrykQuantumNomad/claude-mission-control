// DraggablePanelWrap — Phase 28 Plan 28-04 (LAYO-02).
//
// Wraps a single PanelCard mount with:
//   - a Settings-icon-sibling drag grip (GripVertical) exposing native HTML5
//     drag-and-drop for mouse users
//   - a keyboard reorder path (Space-to-grab + ArrowUp/Down + Enter-commit +
//     Esc-cancel) — mandatory because native HTML5 dnd has ZERO keyboard
//     support per RESEARCH §3 Pitfall 4
//   - an aria-live region (role='status' aria-live='polite') for screen-reader
//     announcements on grab/move/drop/cancel
//
// Cross-column constraint (LAYO-02 single-column-only):
//   handleDrop reads the source columnId from the dataTransfer payload and
//   compares against THIS wrapper's columnId. Mismatched columns ⇒ no-op
//   (the parent panel won't reorder, the URL stays unchanged). Threat T-28-08
//   (cross-column drop attempt) is mitigated here.
//
// dataTransfer payload format (internal contract — Pitfall 7 + 8):
//   'text/cmc-panel-id'  → source panelId
//   'text/cmc-column-id' → source columnId
//   effectAllowed='move' on dragstart; dropEffect='move' set on dragover when
//   the payload contains our column-id key.
//
// Paint-perf invariant (Pitfall 12 — bounded paint clipping):
//   The grip lives INSIDE the panel's `contain: layout paint` boundary.
//   Native dnd ghost image is browser-composited OUTSIDE the layout tree, so
//   the containment box doesn't clip the drag visual. URL writes fire on
//   DROP only (not on every dragover) so a drag operation produces exactly
//   ONE setState — no per-pixel re-renders.
//
// a11y contract:
//   - Grip is a real <button> (no role override; focusable by default).
//   - aria-label="Reorder {label}" so the AT user knows what they grabbed.
//   - aria-pressed reflects keyboard grab-mode (true while grabbed).
//   - aria-live region updates with "Panel grabbed. Position N of M." then
//     "Moved Panel to position N of M" on each arrow keypress, then "Panel
//     dropped at position N of M" on Enter / "Reorder cancelled" on Escape.

import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { GripVertical } from 'lucide-react'

interface DraggablePanelWrapProps {
  /** Stable panel id from PANEL_REGISTRY — drives the testid + dataTransfer. */
  panelId: string
  /** Column id (e.g. 'main' / 'top'). Cross-column drops are rejected. */
  columnId: string
  /** Operator-visible label — used in aria-label + aria-live announcements. */
  label: string
  /** Current 0-based index inside `orderedPanels(columnId)`. */
  index: number
  /** Total panels in the column (drives "Position N of M" announcement). */
  total: number
  /** Reorder callback. Called with the source panelId + the TARGET index
   *  (this wrapper's `index`) when a within-column drop or keyboard arrow
   *  fires. Cross-column drops + boundary attempts (ArrowUp at 0, ArrowDown
   *  at total-1) are no-ops — onReorder is NOT called. */
  onReorder: (fromPanelId: string, toIndex: number) => void
  children: ReactNode
}

const PANEL_ID_KEY = 'text/cmc-panel-id'
const COLUMN_ID_KEY = 'text/cmc-column-id'

export function DraggablePanelWrap({
  panelId,
  columnId,
  label,
  index,
  total,
  onReorder,
  children,
}: DraggablePanelWrapProps) {
  const [grabbed, setGrabbed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [announce, setAnnounce] = useState('')
  const indexRef = useRef(index)
  indexRef.current = index

  // ──────────────────────────────────────────────────────────────────
  // Mouse path (native HTML5 dnd)
  // ──────────────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLButtonElement>) => {
      e.dataTransfer.setData(PANEL_ID_KEY, panelId)
      e.dataTransfer.setData(COLUMN_ID_KEY, columnId)
      e.dataTransfer.effectAllowed = 'move'
      setDragging(true)
    },
    [panelId, columnId],
  )

  const handleDragEnd = useCallback(() => {
    setDragging(false)
  }, [])

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      // dataTransfer.types is a DOMStringList during real dnd; in our test
      // mock it's a plain array. Both support `Array.from`.
      const types = Array.from(e.dataTransfer.types) as string[]
      if (!types.includes(COLUMN_ID_KEY)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    [],
  )

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const fromColumn = e.dataTransfer.getData(COLUMN_ID_KEY)
      const fromPanelId = e.dataTransfer.getData(PANEL_ID_KEY)
      if (!fromPanelId || !fromColumn) return
      // Cross-column drop is rejected — LAYO-02 single-column-only.
      if (fromColumn !== columnId) return
      // No-op when dropping a panel onto itself.
      if (fromPanelId === panelId) return
      onReorder(fromPanelId, indexRef.current)
    },
    [columnId, panelId, onReorder],
  )

  // ──────────────────────────────────────────────────────────────────
  // Keyboard path (mandatory a11y parity — Pitfall 4)
  // ──────────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      // Space / Enter: toggle grab mode (or commit when already grabbed).
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!grabbed) {
          setGrabbed(true)
          setAnnounce(
            `${label} grabbed. Position ${index + 1} of ${total}.`,
          )
        } else {
          setGrabbed(false)
          setAnnounce(
            `${label} dropped at position ${index + 1} of ${total}.`,
          )
        }
        return
      }
      if (e.key === 'Escape') {
        if (!grabbed) return
        e.preventDefault()
        setGrabbed(false)
        setAnnounce('Reorder cancelled.')
        return
      }
      if (!grabbed) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (index >= total - 1) return
        const nextIdx = index + 1
        onReorder(panelId, nextIdx)
        setAnnounce(
          `${label} moved to position ${nextIdx + 1} of ${total}.`,
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (index <= 0) return
        const nextIdx = index - 1
        onReorder(panelId, nextIdx)
        setAnnounce(
          `${label} moved to position ${nextIdx + 1} of ${total}.`,
        )
        return
      }
    },
    [grabbed, index, total, panelId, label, onReorder],
  )

  // ──────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────

  const wrapClass = [
    'cmc-draggable-wrap',
    grabbed ? 'cmc-draggable-wrap--grabbed' : '',
    dragging ? 'cmc-panel--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={wrapClass}
      data-panel-id={panelId}
      data-column-id={columnId}
      style={{ display: 'contents' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <button
        type="button"
        draggable
        aria-label={`Reorder ${label}`}
        aria-pressed={grabbed}
        data-testid={`panel-drag-grip-${panelId}`}
        className="cmc-panel-grip"
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onKeyDown={handleKeyDown}
      >
        <GripVertical size={14} aria-hidden />
      </button>
      <div role="status" aria-live="polite" className="cmc-sr-only">
        {announce}
      </div>
      {children}
    </div>
  )
}
