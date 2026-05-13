// frontend/src/lib/time/__tests__/grafanaSyntax.test.ts — Phase 26 Plan 01 (TIME-01).
//
// Covers the Grafana-style relative-time token parser. Vocab is fixed:
// `now`, `now-Nu`, `now+Nu`, `now/u`, `now-Nu/u` where u ∈ {s,m,h,d,w,M,y}
// for the delta unit and u ∈ {d,w,M,y} for the snap unit. Anything else
// returns null (no exception thrown — callers degrade gracefully).

import { describe, it, expect } from 'vitest'
import { parseGrafanaToken } from '../grafanaSyntax'

describe('parseGrafanaToken — valid vocab', () => {
  it('parses "now" as the identity token', () => {
    expect(parseGrafanaToken('now')).toEqual({
      sign: 1,
      amount: 0,
      unit: null,
      snap: null,
    })
  })

  it('parses "now-7d" as a 7-day negative delta', () => {
    expect(parseGrafanaToken('now-7d')).toEqual({
      sign: -1,
      amount: 7,
      unit: 'd',
      snap: null,
    })
  })

  it('parses "now+1h" as a 1-hour positive delta', () => {
    expect(parseGrafanaToken('now+1h')).toEqual({
      sign: 1,
      amount: 1,
      unit: 'h',
      snap: null,
    })
  })

  it('parses "now/d" as a pure snap-to-day with no delta', () => {
    expect(parseGrafanaToken('now/d')).toEqual({
      sign: 1,
      amount: 0,
      unit: null,
      snap: 'd',
    })
  })

  it('parses "now-1d/d" as delta + snap (yesterday-start-of-day)', () => {
    expect(parseGrafanaToken('now-1d/d')).toEqual({
      sign: -1,
      amount: 1,
      unit: 'd',
      snap: 'd',
    })
  })

  it('parses "now-30d" as a 30-day negative delta', () => {
    expect(parseGrafanaToken('now-30d')).toEqual({
      sign: -1,
      amount: 30,
      unit: 'd',
      snap: null,
    })
  })

  it('parses "now-90d" as a 90-day negative delta', () => {
    expect(parseGrafanaToken('now-90d')).toEqual({
      sign: -1,
      amount: 90,
      unit: 'd',
      snap: null,
    })
  })

  it('parses "now-15m" as a 15-minute negative delta', () => {
    expect(parseGrafanaToken('now-15m')).toEqual({
      sign: -1,
      amount: 15,
      unit: 'm',
      snap: null,
    })
  })

  it('parses "now/M" as a snap-to-month', () => {
    expect(parseGrafanaToken('now/M')).toEqual({
      sign: 1,
      amount: 0,
      unit: null,
      snap: 'M',
    })
  })

  it('parses "now-1y/y" as a 1-year delta plus snap-to-year', () => {
    expect(parseGrafanaToken('now-1y/y')).toEqual({
      sign: -1,
      amount: 1,
      unit: 'y',
      snap: 'y',
    })
  })
})

describe('parseGrafanaToken — invalid vocab returns null', () => {
  it('rejects "bogus" as not matching the regex', () => {
    expect(parseGrafanaToken('bogus')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(parseGrafanaToken('')).toBeNull()
  })

  it('rejects "7d" (no `now` prefix)', () => {
    expect(parseGrafanaToken('7d')).toBeNull()
  })

  it('rejects "now-1z" (z is not a valid unit)', () => {
    expect(parseGrafanaToken('now-1z')).toBeNull()
  })

  it('rejects "now-1.5h" (non-integer amount)', () => {
    expect(parseGrafanaToken('now-1.5h')).toBeNull()
  })
})
