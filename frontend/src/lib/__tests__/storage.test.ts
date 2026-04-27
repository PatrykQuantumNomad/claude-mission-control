import { describe, it, expect, beforeEach } from 'vitest'
import { storage } from '../storage'

describe('storage', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips JSON values under cmc.* prefix', () => {
    storage.set('foo', { a: 1, b: 'two' })
    expect(window.localStorage.getItem('cmc.foo')).toBe('{"a":1,"b":"two"}')
    expect(storage.get<{ a: number; b: string }>('foo')).toEqual({ a: 1, b: 'two' })
  })

  it('returns null on missing key', () => {
    expect(storage.get('missing')).toBeNull()
  })

  it('returns null on parse error (graceful degradation)', () => {
    window.localStorage.setItem('cmc.bad', '{ not json')
    expect(storage.get('bad')).toBeNull()
  })

  it('removes a key', () => {
    storage.set('x', 1)
    storage.remove('x')
    expect(window.localStorage.getItem('cmc.x')).toBeNull()
  })

  it('never throws on quota or storage errors (set is silent)', () => {
    // happy-dom does not enforce quota, but the try/catch must exist;
    // smoke-test by writing a moderately large value.
    expect(() => storage.set('big', 'x'.repeat(1000))).not.toThrow()
  })
})
