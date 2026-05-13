// Command page (`/`) with the top-strip and analytical-grid panels.
//
// Layout:
//   1. Page header (gradient title)
//   2. SystemHealthStrip (OPNL-01)  ┐
//   3. KpiRow            (OPNL-02)  ├ Top strip — full-width above grid
//   4. AttentionBar      (OPNL-03)  │  (AttentionBar disappears via
//   5. LiveSessionsCard  (OPNL-04)  ┘   PanelCard hiddenWhenEmpty)
//   6. .cmc-card-grid containing OPNL-05..15 live analytical panels
//      (the placeholder helper is no longer used here — its last
//       consumer for / was the OPNL-05..15 slot list, now superseded.)

import { createFileRoute } from '@tanstack/react-router'
import {
  AgentFanoutCard,
  AttentionBar,
  CacheEfficiencyCard,
  EditAcceptanceCard,
  HookActivityCard,
  KpiRow,
  LiveSessionsCard,
  McpPanel,
  PressurePanel,
  ProductivityCard,
  ProjectBreakdownCard,
  SessionOutcomesCard,
  SystemHealthStrip,
  TokenUsageCard,
  ToolLatencyCard,
} from '../components/panels'
import {
  SCHEMA_VERSION,
  asTimeToken,
  coerceSchemaVersion,
} from '../lib/searchSchemas'

// Phase 25 / VIEW-01. The `/` route lands NO new filters in Phase 25 — only the
// `schemaVersion` field so future saved views can hydrate against a typed shape.
// `schemaVersion` is OPTIONAL on input (so existing `<Link to="/">` sites stay
// untouched) but always populated on output by `validateSearch`. Unknown fields
// drop silently (RESEARCH Pitfall 6) so a stale state_json blob from a saved
// view doesn't crash the page on load.
//
// Phase 26 / TIME-01 (Plan 02). Append-only extension: ACCEPT `time_from?` +
// `time_to?` Grafana-style tokens on `/`. Both default to `undefined` — the
// per-route 24h fallback is applied AT THE PANEL READ SITE (Wave 3 plans),
// NOT in the validator. Defaulting here would defeat DefaultViewLoader's
// bare-URL gate (RESEARCH Pitfall 13).
export type IndexSearch = {
  schemaVersion?: typeof SCHEMA_VERSION
  time_from?: string | undefined
  time_to?: string | undefined
}

export function validateSearch(raw: Record<string, unknown>): IndexSearch {
  return {
    schemaVersion: coerceSchemaVersion(raw),
    time_from: asTimeToken(raw.time_from),
    time_to: asTimeToken(raw.time_to),
  }
}

function CommandPage() {
  return (
    <section className="cmc-page" aria-labelledby="cmd-heading">
      <header className="cmc-page__header">
        <span className="cmc-label" style={{ color: 'var(--cmc-text-subtle)' }}>
          Mission Control
        </span>
        <h1
          id="cmd-heading"
          className="cmc-page__heading cmc-page__heading--gradient"
        >
          Command
        </h1>
        <p className="cmc-page__subheading">
          Live view of every Claude Code agent session, token spend, and tool latency.
        </p>
      </header>
      <SystemHealthStrip />
      <KpiRow />
      <AttentionBar />
      <LiveSessionsCard />
      <div className="cmc-card-grid">
        <TokenUsageCard />
        <CacheEfficiencyCard />
        <SessionOutcomesCard />
        <ToolLatencyCard />
        <HookActivityCard />
        <ProjectBreakdownCard />
        <AgentFanoutCard />
        <EditAcceptanceCard />
        <ProductivityCard />
        <PressurePanel />
        <McpPanel />
      </div>
    </section>
  )
}

export const Route = createFileRoute('/')({
  validateSearch,
  component: CommandPage,
})
