// PresetList — Phase 26 Plan 03 (TIME-01).
//
// Preset button list shown at the top of the TimePicker Popover. Three
// groups per CONTEXT decision (top → bottom):
//   - Short windows: last 5m, 15m, 1h, 6h, 24h
//   - Standard windows: last 7d, 30d, 90d
//   - Calendar anchors: today, yesterday, this week, last week, this month

import { useCallback } from 'react'

export interface Preset {
  label: string
  from: string
  to: string
}

const SHORT: Preset[] = [
  { label: 'Last 5 minutes', from: 'now-5m', to: 'now' },
  { label: 'Last 15 minutes', from: 'now-15m', to: 'now' },
  { label: 'Last 1 hour', from: 'now-1h', to: 'now' },
  { label: 'Last 6 hours', from: 'now-6h', to: 'now' },
  { label: 'Last 24 hours', from: 'now-24h', to: 'now' },
]
const STANDARD: Preset[] = [
  { label: 'Last 7 days', from: 'now-7d', to: 'now' },
  { label: 'Last 30 days', from: 'now-30d', to: 'now' },
  { label: 'Last 90 days', from: 'now-90d', to: 'now' },
]
const ANCHORS: Preset[] = [
  { label: 'Today', from: 'now/d', to: 'now' },
  { label: 'Yesterday', from: 'now-1d/d', to: 'now/d' },
  { label: 'This week', from: 'now/w', to: 'now' },
  { label: 'Last week', from: 'now-1w/w', to: 'now/w' },
  { label: 'This month', from: 'now/M', to: 'now' },
]

interface Props {
  onApply: (preset: Preset) => void
  current?: { from?: string; to?: string }
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-')
}

export function PresetList({ onApply, current }: Props) {
  const handle = useCallback((p: Preset) => onApply(p), [onApply])
  return (
    <div className="cmc-time-picker__presets" role="listbox" aria-label="Time range presets">
      <div className="cmc-time-picker__group" role="group" aria-label="Short windows">
        {SHORT.map((p) => (
          <PresetButton
            key={p.label}
            preset={p}
            active={current?.from === p.from && current?.to === p.to}
            onClick={handle}
          />
        ))}
      </div>
      <div className="cmc-time-picker__group" role="group" aria-label="Standard windows">
        {STANDARD.map((p) => (
          <PresetButton
            key={p.label}
            preset={p}
            active={current?.from === p.from && current?.to === p.to}
            onClick={handle}
          />
        ))}
      </div>
      <div className="cmc-time-picker__group" role="group" aria-label="Calendar anchors">
        {ANCHORS.map((p) => (
          <PresetButton
            key={p.label}
            preset={p}
            active={current?.from === p.from && current?.to === p.to}
            onClick={handle}
          />
        ))}
      </div>
    </div>
  )
}

function PresetButton({
  preset,
  active,
  onClick,
}: {
  preset: Preset
  active: boolean
  onClick: (p: Preset) => void
}) {
  return (
    <button
      type="button"
      className={`cmc-time-picker__preset${active ? ' cmc-time-picker__preset--active' : ''}`}
      data-testid={`time-picker-preset-${slugify(preset.label)}`}
      onClick={() => onClick(preset)}
      role="option"
      aria-selected={active}
    >
      {preset.label}
    </button>
  )
}
