// DensityToggle — Phase 24 Plan 02 (DENS-01 + DENS-03).
//
// Test strategy:
//   - Reset localStorage and the <html data-density> attribute in beforeEach
//     so each test starts from a known clean slate.
//   - Use @testing-library/user-event from test/utils for realistic Radix
//     dropdown interaction (pointerdown/up sequencing).
//   - Verify both halves of the persistence contract: localStorage AND
//     document.documentElement.dataset.density. setDensity() in lib/density.ts
//     writes both; this test pins that contract from the toggle's surface.
//
// Behaviour exercised:
//   1. Initial mount with localStorage='compact' → trigger aria-label reflects
//      'compact' after the useEffect sync (DENS-03 boot path).
//   2. Click trigger → menu opens with 3 options; selecting Compact persists
//      to localStorage and dataset.density.
//   3. Re-render simulates page refresh: a fresh DensityToggle reads the
//      persisted value in useEffect and reflects it in the trigger aria-label.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { DensityToggle } from '../DensityToggle'

describe('DensityToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.density
  })

  afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.density
  })

  it('reflects persisted density in trigger aria-label after mount', async () => {
    localStorage.setItem('cmc.density', 'compact')
    render(<DensityToggle />)

    const trigger = await screen.findByTestId('density-toggle-trigger')
    // useEffect sync runs after first render — wait for the aria-label flip.
    await waitFor(() => {
      expect(trigger.getAttribute('aria-label')).toContain('compact')
    })
  })

  it('persists selection to localStorage AND <html data-density>', async () => {
    localStorage.setItem('cmc.density', 'comfortable')
    render(<DensityToggle />)

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('density-toggle-trigger')
    // Wait for useEffect sync so aria-label settles before interaction.
    await waitFor(() => {
      expect(trigger.getAttribute('aria-label')).toContain('comfortable')
    })

    await user.click(trigger)

    // Radix DropdownMenu items are rendered into a Portal under document.body.
    const compactItem = await screen.findByTestId('density-option-compact')
    await user.click(compactItem)

    await waitFor(() => {
      expect(localStorage.getItem('cmc.density')).toBe('compact')
      expect(document.documentElement.dataset.density).toBe('compact')
    })
  })

  it('reflects updated density across remount (page-refresh simulation)', async () => {
    localStorage.setItem('cmc.density', 'comfortable')
    const first = render(<DensityToggle />)
    const user = userEvent.setup()
    const trigger = await screen.findByTestId('density-toggle-trigger')
    await waitFor(() => {
      expect(trigger.getAttribute('aria-label')).toContain('comfortable')
    })

    await user.click(trigger)
    await user.click(await screen.findByTestId('density-option-cozy'))

    await waitFor(() => {
      expect(localStorage.getItem('cmc.density')).toBe('cozy')
    })

    // Simulate page refresh: unmount then mount fresh.
    first.unmount()
    render(<DensityToggle />)
    const trigger2 = await screen.findByTestId('density-toggle-trigger')
    await waitFor(() => {
      expect(trigger2.getAttribute('aria-label')).toContain('cozy')
    })
  })

  it('renders all three density options in the menu', async () => {
    render(<DensityToggle />)
    const user = userEvent.setup()
    const trigger = await screen.findByTestId('density-toggle-trigger')
    await user.click(trigger)

    expect(await screen.findByTestId('density-option-compact')).toBeInTheDocument()
    expect(await screen.findByTestId('density-option-comfortable')).toBeInTheDocument()
    expect(await screen.findByTestId('density-option-cozy')).toBeInTheDocument()
  })
})
