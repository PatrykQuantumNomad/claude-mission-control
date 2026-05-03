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
  useSkillCost,
  useSkillLatency,
  useSkillRuns,
  useSkillUsage,
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

  // Phase 14 (SKIL-04..07) — verify skill-* keys are uniquely scoped (Pitfall 5
  // from 14-RESEARCH.md: never reuse the bare 'skills' prefix used by the
  // catalog endpoint or the analytics keys would collide on invalidation).
  it('skill analytics keys are scoped per dimension and per param', () => {
    expect(qk.skillUsage('14d')).toEqual(['skill-usage', '14d'])
    expect(qk.skillUsage('30d')).not.toEqual(qk.skillUsage('14d'))

    expect(qk.skillCost('analyze', '14d')).toEqual(['skill-cost', 'analyze', '14d'])
    expect(qk.skillCost('analyze', '14d')).not.toEqual(qk.skillCost('build', '14d'))
    expect(qk.skillCost('analyze', '14d')).not.toEqual(qk.skillCost('analyze', '30d'))

    expect(qk.skillLatency('analyze', '14d')).toEqual([
      'skill-latency',
      'analyze',
      '14d',
    ])

    expect(qk.skillRuns('analyze', 20)).toEqual(['skill-runs', 'analyze', 20])
    expect(qk.skillRuns('analyze', 20)).not.toEqual(qk.skillRuns('analyze', 50))

    // None of the skill-analytics keys collide with the catalog 'skills' key.
    const catalog = qk.skills() as readonly string[]
    expect(catalog).toEqual(['skills'])
    expect(qk.skillUsage('14d')[0]).not.toBe(catalog[0])
    expect(qk.skillCost('a', '14d')[0]).not.toBe(catalog[0])
  })
})

describe('queries surface area', () => {
  it('exports the 24 panel hooks + the follow-up mutation', () => {
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
      // Phase 14 (SKIL-04..07) — 4 new analytics hooks
      useSkillUsage,
      useSkillCost,
      useSkillLatency,
      useSkillRuns,
      useFollowUpMessage,
    ]
    // 24 query hooks + 1 mutation = 25 callable exports
    expect(exported).toHaveLength(25)
    for (const fn of exported) {
      expect(typeof fn).toBe('function')
    }
  })
})
