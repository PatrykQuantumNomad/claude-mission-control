// Global Vitest setup — current (design notes)").
// Three sections, in order: (a) act() bridge, (b) Radix/jsdom shims, (c) per-test cleanup.

import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// ────────────────────────────────────────────────────────────────────────────
// (a) Pitfall 5 mitigation — IS_REACT_ACT_ENVIRONMENT bridge
// React 19 reads IS_REACT_ACT_ENVIRONMENT off `globalThis`, but RTL 16 sets it
// off `self`. happy-dom keeps these separate, so without a bridge React logs
// "An update to X inside a test was not wrapped in act(...)" warnings even
// though the test code is fine. The bridge writes through to globalThis.self
// so both reads see the same value.
// ────────────────────────────────────────────────────────────────────────────
// In happy-dom + node, `globalThis.self === globalThis`, so a setter that
// re-assigns `globalThis.self.IS_REACT_ACT_ENVIRONMENT` would recurse forever.
// Approach: install ONE shared property on globalThis (via Object.defineProperty
// for configurability), and only also install on `self` when it is a distinct
// object reference. Both views read/write the same backing variable.
let _actEnv: boolean | undefined = true

const actDescriptor: PropertyDescriptor = {
  configurable: true,
  enumerable: false,
  get() {
    return _actEnv
  },
  set(v: boolean | undefined) {
    _actEnv = v
  },
}

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actDescriptor)

// Pitfall 5 bridge — only install a separate descriptor on `self` if it is a
// distinct object (e.g. some non-browser global setups). In happy-dom it isn't,
// so the property already exists via globalThis. The check prevents infinite
// recursion observed in happy-dom 20.x.
if (typeof globalThis.self !== 'undefined' && globalThis.self !== (globalThis as unknown)) {
  Object.defineProperty(globalThis.self, 'IS_REACT_ACT_ENVIRONMENT', actDescriptor)
}

// ────────────────────────────────────────────────────────────────────────────
// (b) Pitfall 1 + 2 mitigation — Radix UI / framer-motion / jsdom shims
// happy-dom (and jsdom) lack: HTMLElement.prototype.hasPointerCapture,
// .releasePointerCapture, .setPointerCapture, .scrollIntoView; ResizeObserver;
// matchMedia. Radix primitives + cmdk + framer-motion crash without these.
// ────────────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>
  if (typeof proto.hasPointerCapture !== 'function') {
    proto.hasPointerCapture = function () {
      return false
    }
  }
  if (typeof proto.releasePointerCapture !== 'function') {
    proto.releasePointerCapture = function () {}
  }
  if (typeof proto.setPointerCapture !== 'function') {
    proto.setPointerCapture = function () {}
  }
  if (typeof proto.scrollIntoView !== 'function') {
    proto.scrollIntoView = function () {}
  }

  if (typeof window.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(window as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
      ResizeObserverStub
  }

  if (typeof window.matchMedia === 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// (c) Pitfall 8 mitigation — per-test cleanup
// RTL 16 + Vitest 4 do NOT auto-cleanup; explicit cleanup() prevents nodes
// from leaking between tests, and clearing localStorage prevents the
// `cmc.*` namespaced helpers from leaking values across tests.
// ────────────────────────────────────────────────────────────────────────────
afterEach(() => {
  cleanup()
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear()
  }
})
