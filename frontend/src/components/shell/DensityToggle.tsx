// DensityToggle — Phase 24 Plan 02 (DENS-01).
//
// Mirrors the ThemeToggle pattern. NO React Context — density consumers read
// CSS variables, not React state. This is what makes POLI-11's zero-rerender
// gate achievable: because nobody subscribes to density via React, flipping the
// `<html data-density="…">` attribute updates the entire app via the CSS
// cascade alone, with zero React commits below this component.
//
// UX: a single icon button (Sliders) opens a Radix DropdownMenu with three
// menu items (Compact / Comfortable / Cozy). The current tier shows a Check
// icon; non-current tiers render an empty 16px-wide span so the labels stay
// vertically aligned.
//
// Persistence: setDensity() writes localStorage `cmc.density` AND sets
// `document.documentElement.dataset.density`. The toggle's local useState only
// drives the check-mark indicator — it does NOT propagate density to anyone
// else.
//
// Icon choice (Sliders, not SlidersHorizontal/Vertical) was locked during
// research — do not substitute another lucide icon.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Sliders } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getDensity, setDensity, type Density } from '../../lib/density'

const TIERS: { value: Density; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'cozy', label: 'Cozy' },
]

export function DensityToggle() {
  // Mount with the default; useEffect syncs to the persisted value AFTER
  // hydration so React 19 StrictMode doesn't double-warn about a localStorage
  // read during render. Same pattern as ThemeToggle.
  const [density, setLocal] = useState<Density>('comfortable')
  useEffect(() => {
    setLocal(getDensity())
  }, [])

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="cmc-density-toggle"
          data-testid="density-toggle-trigger"
          aria-label={`Density: ${density}. Click to change.`}
        >
          <Sliders size={16} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="cmc-dropdown" sideOffset={6} align="end">
          {TIERS.map((t) => (
            <DropdownMenu.Item
              key={t.value}
              data-testid={`density-option-${t.value}`}
              onSelect={() => {
                setDensity(t.value)
                setLocal(t.value)
              }}
              className="cmc-dropdown__item"
            >
              <span
                style={{ width: 16, display: 'inline-flex', justifyContent: 'center' }}
                aria-hidden
              >
                {density === t.value ? <Check size={14} /> : null}
              </span>
              {t.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
