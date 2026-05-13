// TimePicker — Phase 26 Plan 03 (TIME-01, TIME-03).
//
// Trigger button + Radix Popover hosting PresetList + CustomRangeCalendar.
// Mounted ONCE in AppShellHeader; visible on every route (CONTEXT decision —
// picker remains visible on non-time routes even if no panels consume it;
// Cmd+Shift+V writes to URL on any route and is consumed on next time-aware
// navigation).
//
// Cmd+Shift+C / Cmd+Shift+V hotkeys bind at window level (mirror Sidebar's
// Cmd+B pattern) so they fire even when focus is inside the cmdk palette
// or a Sheet. preventDefault blocks the default browser copy-paste behavior
// ONLY when both metaKey+shiftKey are pressed AND key is c/v.

import { useEffect, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Clock } from 'lucide-react'
import { PresetList, type Preset } from './PresetList'
import { CustomRangeCalendar } from './CustomRangeCalendar'
import { serializeRange, parseRangeFromText } from '../../lib/time/clipboard'
import { asTimeToken } from '../../lib/searchSchemas'

function readClipboard(): Promise<string> {
  return navigator.clipboard.readText()
}
function writeClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}

function humanLabel(from: string, to: string): string {
  // Preset reverse-lookup for the paste toast. Falls back to raw tokens.
  const map: Record<string, string> = {
    'now-5m..now': 'last 5 minutes',
    'now-15m..now': 'last 15 minutes',
    'now-1h..now': 'last 1 hour',
    'now-6h..now': 'last 6 hours',
    'now-24h..now': 'last 24 hours',
    'now-7d..now': 'last 7 days',
    'now-30d..now': 'last 30 days',
    'now-90d..now': 'last 90 days',
  }
  return map[`${from}..${to}`] ?? `${from} → ${to}`
}

export function TimePicker() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const search = (location.search ?? {}) as Record<string, unknown>
  const timeFrom = typeof search.time_from === 'string' ? search.time_from : undefined
  const timeTo = typeof search.time_to === 'string' ? search.time_to : undefined

  function applyRange(from: string, to: string) {
    navigate({
      to: location.pathname as never,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        time_from: from,
        time_to: to,
      })) as never,
      replace: false,
    })
  }

  function onPresetApply(p: Preset) {
    applyRange(p.from, p.to)
    setOpen(false)
  }

  // Cmd+Shift+C / Cmd+Shift+V — TIME-03.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return
      const k = e.key.toLowerCase()
      if (k === 'c') {
        e.preventDefault()
        if (!timeFrom || !timeTo) {
          toast.error('No time range to copy')
          return
        }
        writeClipboard(serializeRange(timeFrom, timeTo))
          .then(() => toast.success('Time range copied'))
          .catch(() => toast.error('Could not access clipboard'))
      } else if (k === 'v') {
        e.preventDefault()
        readClipboard()
          .then((text) => {
            const parsed = parseRangeFromText(text)
            if (!parsed) {
              toast.error('No time range on clipboard')
              return
            }
            // Re-validate via asTimeToken before applying (defense in depth).
            const f = asTimeToken(parsed.time_from)
            const t = asTimeToken(parsed.time_to)
            if (!f || !t) {
              toast.error('No time range on clipboard')
              return
            }
            applyRange(f, t)
            toast.message(`Pasted: ${humanLabel(f, t)}`)
          })
          .catch(() => toast.error('Could not access clipboard'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeFrom, timeTo, location.pathname])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="cmc-time-picker__trigger cmc-btn"
          data-testid="time-picker-trigger"
          aria-label="Time range"
        >
          <Clock size={14} aria-hidden />
          <span>{timeFrom && timeTo ? humanLabel(timeFrom, timeTo) : 'Last 7 days'}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="cmc-time-picker__popover"
          data-testid="time-picker-popover"
          align="end"
          sideOffset={6}
        >
          <PresetList current={{ from: timeFrom, to: timeTo }} onApply={onPresetApply} />
          <CustomRangeCalendar
            onApply={(from, to) => {
              applyRange(from, to)
              setOpen(false)
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
