// CommandPalette — UI-SPEC FESH-07. Wraps cmdk's Command.Dialog with a global
// Cmd+K (and Ctrl+K) hotkey. Mounted once at AppShell level so the binding
// fires regardless of the active route.
//
// Effect cleanup is mandatory (RESEARCH §Pitfall 3) — React 19 StrictMode
// double-invokes effects in dev, and without removeEventListener we'd register
// the handler twice and Cmd+K would toggle twice per press.
//
// "Quick task" closes the palette as a no-op per CONTEXT decision; Phase 7
// (TPNL-03) will replace `close()` with a TaskComposer-open call.
//
// Empty-state body and input placeholder copy are verbatim from
// UI-SPEC §Copywriting — do not paraphrase without re-reading the spec.

import { Command } from 'cmdk'
import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

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

  const close = () => setOpen(false)

  return (
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
              // Phase 7 wires TaskComposer (TPNL-03) — for now, close as a no-op.
              close()
            }}
            className="cmc-cmdk__item"
          >
            Quick task
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
