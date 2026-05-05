// CommandPalette — UI-SPEC FESH-07. Wraps cmdk's Command.Dialog with a global
// Cmd+K (and Ctrl+K) hotkey. Mounted once at AppShell level so the binding
// fires regardless of the active route.
//
// Effect cleanup is mandatory (design notes) — React 19 StrictMode
// double-invokes effects in dev, and without removeEventListener we'd register
// the handler twice and Cmd+K would toggle twice per press.
//
// "Quick task" opens the global TaskComposer (TPNL-02) via the
// TaskComposerProvider context that AppShell wraps the tree with. current
// implementation wired this — earlier comments referenced "TPNL-03" by mistake;
// the composer is TPNL-02 (Schedules slide-out is TPNL-04, later work).
//
// Empty-state body and input placeholder copy are verbatim from
// UI-SPEC §Copywriting — do not paraphrase without re-reading the spec.
//
// Phase 16 Plan 03 (CMPR-03) — context-aware "Compare with…" / "Compare
// sessions" item under the Actions group. Behaviour branches on the current
// route via `useRouterState({ select: (s) => s.location })`:
//   1. Default (anywhere except /sessions/compare with `a` set): label is
//      "Compare sessions". Selecting navigates to /sessions/compare with no
//      params — the page renders its idle empty-state prompting the user to
//      pick two sessions.
//   2. On `/sessions/compare?a=X` with no `b`: label is "Compare with…".
//      Selecting opens a session-picker Sheet listing recent sessions
//      (useSessionsList({ range: '7d', limit: 50 })). Choosing a row calls
//      navigate({ search: (prev) => ({ ...prev, b: chosenSid }) }) — function
//      form per Pitfall 4 (no stale-closure infinite loop).
//   3. On `/sessions/compare?a=X&b=Y`: label is "Pick a different session B".
//      Same picker behaviour; selection replaces `b`.
//
// Self-compare guard: the picker's row click is disabled when
// `chosenSid === currentA` (defensive — backend already 400-rejects a==b
// per Plan 16-01, but the UI shouldn't even let the user try).

import { Command } from 'cmdk'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTaskComposer } from '../panels/TaskComposer'
import { useSessionsList } from '../../lib/queries'
import { Sheet } from './Sheet'

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function parseSearchUuid(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_RE.test(value) ? value : undefined
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const navigate = useNavigate()
  const composer = useTaskComposer()

  // Read the live router location so the Compare item label + behaviour can
  // branch on whether we're already on the /sessions/compare route. The
  // selector form keeps the subscription tight — re-renders only when
  // pathname/search actually change, never on every router internal tick.
  const location = useRouterState({ select: (s) => s.location })
  const isOnCompareRoute = location.pathname === '/sessions/compare'
  const search = (location.search ?? {}) as Record<string, unknown>
  const currentA = isOnCompareRoute ? parseSearchUuid(search.a) : undefined
  const currentB = isOnCompareRoute ? parseSearchUuid(search.b) : undefined

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const close = useCallback(() => setOpen(false), [])
  const closePicker = useCallback(() => setPickerOpen(false), [])

  // Cmd+K Compare item label. Branches per the plan's decision §1.
  let compareLabel: string
  if (currentA && !currentB) {
    compareLabel = 'Compare with…'
  } else if (currentA && currentB) {
    compareLabel = 'Pick a different session B'
  } else {
    compareLabel = 'Compare sessions'
  }

  const onCompareSelect = useCallback(() => {
    if (currentA) {
      // Picker mode: open the session-list Sheet so the user can pick the
      // second (or replacement) session. Closing the palette here keeps the
      // visual focus on the Sheet that's about to mount.
      close()
      setPickerOpen(true)
    } else {
      // Default mode: just navigate to the compare page; it renders an idle
      // pick-two empty-state.
      navigate({ to: '/sessions/compare' })
      close()
    }
  }, [currentA, navigate, close])

  // Picker selection: function-form `search: (prev) => ...` is the documented
  // TanStack Router idiom (Pitfall 4 in 16-RESEARCH.md). Eliminates the
  // stale-closure infinite-render loop that the object form is prone to.
  const onPickerSelect = useCallback(
    (chosenSid: string) => {
      if (chosenSid === currentA) return // self-compare guard (defensive)
      navigate({
        to: '/sessions/compare',
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          b: chosenSid,
        }),
      })
      closePicker()
    },
    [currentA, navigate, closePicker],
  )

  return (
    <>
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Mission Control command palette"
        className="cmc-cmdk"
        contentClassName="cmc-cmdk__content"
      >
        <Command.Input
          placeholder="Search pages, sessions, schedules…"
          className="cmc-cmdk__input"
        />
        <Command.List className="cmc-cmdk__list">
          <Command.Empty className="cmc-cmdk__empty">
            No matches. Try fewer letters or open the page directly.
          </Command.Empty>
          <Command.Group heading="Pages" className="cmc-cmdk__group">
            <Command.Item
              onSelect={() => {
                navigate({ to: '/' })
                close()
              }}
              className="cmc-cmdk__item"
            >
              Command
            </Command.Item>
            <Command.Item
              onSelect={() => {
                navigate({ to: '/activity' })
                close()
              }}
              className="cmc-cmdk__item"
            >
              Activity
            </Command.Item>
            <Command.Item
              onSelect={() => {
                navigate({ to: '/skills' })
                close()
              }}
              className="cmc-cmdk__item"
            >
              Skills
            </Command.Item>
          </Command.Group>
          <Command.Group heading="Actions" className="cmc-cmdk__group">
            <Command.Item
              onSelect={() => {
                close()
                composer.setOpen(true)
              }}
              className="cmc-cmdk__item"
            >
              Quick task
            </Command.Item>
            <Command.Item
              onSelect={onCompareSelect}
              className="cmc-cmdk__item"
            >
              {compareLabel}
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command.Dialog>
      <ComparePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentA={currentA}
        onSelect={onPickerSelect}
      />
    </>
  )
}

interface ComparePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentA: string | undefined
  onSelect: (sid: string) => void
}

function ComparePicker({
  open,
  onOpenChange,
  currentA,
  onSelect,
}: ComparePickerProps) {
  // Reuse the existing list hook (lib/queries.ts:188) so we get the same
  // 30s polling cadence + placeholderData that powers the SessionsTable
  // panel. Default range '7d' / limit 50 mirrors the plan's decision §4.
  // The hook is always mounted (so cmdk pre-warms data even before the
  // Sheet opens) — `open` only gates the visual render.
  const query = useSessionsList({ range: '7d', limit: 50 })
  const items = query.data?.items ?? []

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Pick a session to compare"
      description={
        currentA
          ? 'Select a session to set as side B for the comparison.'
          : 'Select a session to start comparing.'
      }
    >
      {query.isPending && !query.data ? (
        <p className="cmc-empty">Loading recent sessions…</p>
      ) : items.length === 0 ? (
        <p className="cmc-empty">No sessions in the last 7 days.</p>
      ) : (
        <ul className="cmc-cmdk-picker">
          {items.map((row) => {
            const disabled = row.session_id === currentA
            return (
              <li key={row.session_id} className="cmc-cmdk-picker__row">
                <button
                  type="button"
                  className="cmc-btn cmc-btn--ghost cmc-btn--sm"
                  disabled={disabled}
                  onClick={() => onSelect(row.session_id)}
                  aria-label={`Compare with session ${row.session_id}`}
                >
                  <span className="cmc-mono">
                    {row.session_id.slice(0, 8)}
                    {'…'}
                  </span>
                  <span style={{ marginLeft: 8, color: 'var(--cmc-text-subtle)' }}>
                    {row.cwd ?? '—'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
