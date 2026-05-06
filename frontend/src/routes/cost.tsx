// Cost page (`/cost`) — Phase 20 Plan 03 (ANLY-06 + ANLY-07).
//
// First user-facing surface for the cost dashboard. Two panels composed in
// the standard .cmc-card-grid layout:
//   - CostForecastCard   (ANLY-06 — projected month total + bias banner +
//                          insufficient-data branch when days_elapsed < 7)
//   - CostByProjectCard  (ANLY-07 — sortable per-project breakdown with
//                          7d/30d toggle; sourced from /api/cost/breakdown
//                          ?dim=project. Path-leakage-resistant by
//                          construction — Plan 20-01 SQL refactor + the
//                          schema half of the dual guard.)
//
// /cost is a top-level page (sibling of /skills, /activity, /alerts) — NO
// parent layout nesting. createFileRoute('/cost') auto-registers via
// @tanstack/router-plugin/vite on `pnpm build`.

import { createFileRoute } from '@tanstack/react-router'
import {
  CostByProjectCard,
  CostForecastCard,
} from '../components/panels'

function CostPage() {
  return (
    <section className="cmc-page" aria-labelledby="cost-heading">
      <header className="cmc-page__header">
        <span className="cmc-label" style={{ color: 'var(--cmc-text-subtle)' }}>
          Mission Control
        </span>
        <h1
          id="cost-heading"
          className="cmc-page__heading cmc-page__heading--gradient"
        >
          Cost
        </h1>
        <p className="cmc-page__subheading">
          Monthly forecast and per-project cost breakdown.
        </p>
      </header>
      <div className="cmc-card-grid">
        <CostForecastCard />
        <CostByProjectCard />
      </div>
    </section>
  )
}

export const Route = createFileRoute('/cost')({ component: CostPage })
