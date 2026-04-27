import { describe, it, expect } from 'vitest'
import {
  qk,
  useAttention,
  useByProject,
  useCache,
  useEdits,
  useFailures,
  useFanout,
  useFollowUpMessage,
  useHeatmap,
  useHooks,
  useLatency,
  useLiveSessions,
  useMcpServers,
  useMcpTools,
  useOutcomes,
  usePressure,
  useProductivity,
  useSessionDetails,
  useSessionsList,
  useSummary,
  useSystemHealth,
  useTokens,
} from '../queries'

describe('queries.qk factory', () => {
  it('builds the expected token-usage key shape', () => {
    expect(qk.tokens('7d')).toEqual(['usage', 'tokens', '7d'])
  })

  it('builds the expected session-details key shape', () => {
    expect(qk.sessionDetails('abc')).toEqual(['sessions', 'abc', 'details'])
  })

  it('keys are range-scoped so cache slices do not collide', () => {
    expect(qk.outcomes('today')).not.toEqual(qk.outcomes('30d'))
    expect(qk.byProject('all')).not.toEqual(qk.byProject('30d'))
  })

  it('liveSessions and sessionsList have stable prefix shapes', () => {
    expect(qk.liveSessions()).toEqual(['sessions', 'live'])
    const params = { range: '7d' as const, limit: 50, offset: 0 }
    expect(qk.sessionsList(params)).toEqual(['sessions', 'list', params])
  })

  it('mcpTools key is server-scoped', () => {
    expect(qk.mcpTools('git')).toEqual(['mcp', 'git', 'tools'])
    expect(qk.mcpTools('git')).not.toEqual(qk.mcpTools('fs'))
  })
})

describe('queries surface area', () => {
  it('exports the 20 panel hooks + the follow-up mutation', () => {
    // Smoke test: importing the names succeeds. If any export is removed
    // or renamed, the import line at the top of this file would have
    // failed at module-load time. This test pins the surface explicitly
    // so a reviewer can grep for it.
    const exported = [
      useSystemHealth,
      useAttention,
      useSummary,
      usePressure,
      useLiveSessions,
      useSessionDetails,
      useTokens,
      useCache,
      useOutcomes,
      useLatency,
      useHooks,
      useByProject,
      useFanout,
      useEdits,
      useProductivity,
      useMcpServers,
      useMcpTools,
      useHeatmap,
      useFailures,
      useSessionsList,
      useFollowUpMessage,
    ]
    // 20 query hooks + 1 mutation = 21 callable exports
    expect(exported).toHaveLength(21)
    for (const fn of exported) {
      expect(typeof fn).toBe('function')
    }
  })
})
