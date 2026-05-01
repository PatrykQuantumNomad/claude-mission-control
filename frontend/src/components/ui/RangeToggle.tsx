// RangeToggle — current. Segmented control for switching between
// today / 7d / 30d windows. Controlled component (value + onChange); when
// `persistKey` is provided the selection round-trips through lib/storage
// under `cmc.filter.<key>.range` so reloading the page returns to the same
// window the user last picked.
//
// className-passthrough + variant modifier for the active button matches
// the current forwardRef shape (implementation entry contract).

import { useEffect } from 'react'
import { storage } from '../../lib/storage'

export interface RangeOption<V extends string = string> {
  value: V
  label: string
}

interface RangeToggleProps<V extends string = string> {
  value: V
  onChange: (next: V) => void
  options?: RangeOption<V>[]
  persistKey?: string
  className?: string
  ariaLabel?: string
}

const DEFAULT_OPTIONS: RangeOption[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

function persistGet<V extends string>(persistKey?: string): V | null {
  if (!persistKey) return null
  return storage.get<V>(`filter.${persistKey}.range`)
}

function persistSet<V extends string>(persistKey: string | undefined, v: V): void {
  if (!persistKey) return
  storage.set(`filter.${persistKey}.range`, v)
}

export function RangeToggle<V extends string = string>({
  value,
  onChange,
  options = DEFAULT_OPTIONS as unknown as RangeOption<V>[],
  persistKey,
  className = '',
  ariaLabel = 'Time range',
}: RangeToggleProps<V>) {
  // On mount: if persistKey is set and a stored value exists that differs
  // from the current `value`, fire onChange to bring controller in sync.
  // Caller is the source of truth for `value`; we only nudge them once.
  useEffect(() => {
    const stored = persistGet<V>(persistKey)
    if (stored && stored !== value && options.some((o) => o.value === stored)) {
      onChange(stored)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClick = (next: V) => {
    persistSet(persistKey, next)
    onChange(next)
  }

  return (
    <div
      className={`cmc-range-toggle ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            className={`cmc-range-toggle__btn ${active ? 'cmc-range-toggle__btn--active' : ''}`.trim()}
            aria-pressed={active}
            onClick={() => handleClick(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
