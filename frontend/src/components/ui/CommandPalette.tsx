// CommandPalette — UI-SPEC FESH-07. Wraps cmdk's Command.Dialog with a global
// Cmd+K (and Ctrl+K) hotkey. Mounted once at AppShell level so the binding
// fires regardless of the active route.
//
// Effect cleanup is mandatory (RESEARCH §Pitfall 3) — React 19 StrictMode
// double-invokes effects in dev, and without removeEventListener we'd register
// the handler twice and Cmd+K would toggle twice per press.
//
// "Quick task" opens the global TaskComposer (TPNL-02) via the
// TaskComposerProvider context that AppShell wraps the tree with. Phase 7
// Plan 03 wired this — earlier comments referenced "TPNL-03" by mistake;
// the composer is TPNL-02 (Schedules slide-out is TPNL-04, Wave 3 territory).
//
// Empty-state body and input placeholder copy are verbatim from
// UI-SPEC §Copywriting — do not paraphrase without re-reading the spec.

import { Command } from 'cmdk'
import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTaskComposer } from '../panels/TaskComposer'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const composer = useTaskComposer()

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
              close()
              composer.setOpen(true)
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
