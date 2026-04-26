// Smoke test — confirms the Vitest 4 + happy-dom + setup.ts harness boots cleanly.
// Verifies all pitfall mitigations install without throwing during module load.

import { describe, it, expect } from 'vitest'

describe('test harness', () => {
  it('exposes window.localStorage (happy-dom env active)', () => {
    expect(window.localStorage).toBeDefined()
    expect(typeof window.localStorage.setItem).toBe('function')
  })

  it('shimmed HTMLElement.prototype.hasPointerCapture (Pitfall 1)', () => {
    expect(typeof window.HTMLElement.prototype.hasPointerCapture).toBe('function')
  })

  it('shimmed ResizeObserver (Pitfall 1)', () => {
    expect(typeof window.ResizeObserver).toBe('function')
  })

  it('shimmed matchMedia (Pitfall 1)', () => {
    expect(typeof window.matchMedia).toBe('function')
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false)
  })

  it('IS_REACT_ACT_ENVIRONMENT is true on globalThis and self (Pitfall 5)', () => {
    expect((globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT).toBe(true)
    expect((globalThis.self as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT).toBe(true)
  })
})
