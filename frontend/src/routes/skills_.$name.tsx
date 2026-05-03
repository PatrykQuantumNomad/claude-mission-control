// Skill detail page (URL `/skills/$name`) — first file-based dynamic route
// in the project (Phase 14 Plan 05).
//
// FILENAME CHOICE (`skills_.$name.tsx`, not `skills.$name.tsx`):
//   TanStack Router flat-routing treats `skills.$name.tsx` as a CHILD of
//   `skills.tsx` automatically. SkillsPage doesn't render <Outlet/>, so
//   nesting would silently swallow the detail page — visiting `/skills/foo`
//   would render the SkillsPage panels with no detail UI.
//   The trailing-underscore convention `skills_.$name.tsx` opts the route
//   OUT of the parent layout. The URL stays `/skills/$name`, but the route
//   id is `/skills_/$name` (used by `createFileRoute` + `useParams.from`).
//
// Composition (3 sections):
//   1. SkillCostCard          — per-skill cost (SKLP-02 / Plan 04, name-prop)
//   2. Per-skill latency      — KpiTiles inline-consuming useSkillLatency
//                               (one-off — reusing SkillLatencyTable would
//                                force the multi-skill useQueries fan-out
//                                hook, which is the wrong shape for a
//                                single-skill view).
//   3. SkillRunsTable         — recent invocations (SKIL-07 / Plan 05),
//                               row-click opens SessionsDetailsSheet (D-09).
//
// The page intentionally renders the 3 panels stacked (single column,
// not .cmc-card-grid) — each panel is wide enough to warrant the full
// content width on the detail page. /skills (the index) keeps using the
// grid layout for its multi-panel dashboard.
//
// Cross-link from /activity TopSkills (Plan 03) lands here via TanStack
// Link `to="/skills/$name"` (the public URL — not the underscore-id form).

import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { KpiTile } from '../components/ui'
import {
  SkillCostCard,
  SkillRunsTable,
} from '../components/panels'
import { useSkillLatency } from '../lib/queries'

const nf = new Intl.NumberFormat('en')

function SkillLatencySnapshot({ name }: { name: string }) {
  // Single-skill latency view — inline-consuming useSkillLatency. Reusing
  // SkillLatencyTable would force the multi-skill useQueries fan-out which
  // is the wrong shape for one skill. This snapshot is intentionally
  // un-extracted (one consumer, one route) — promote to a panel only if
  // a second consumer appears.
  const query = useSkillLatency(name, '14d')
  const renderedReqId = (
    <span className="cmc-label" style={{ color: 'var(--cmc-text-subtle)' }}>
      SKIL-06 · 14d
    </span>
  )
  if (query.isPending) {
    return (
      <section className="cmc-card" aria-label="Skill latency snapshot">
        <header className="cmc-panel-card__header">
          <div>
            {renderedReqId}
            <h3 className="cmc-card__title">Latency</h3>
          </div>
        </header>
        <div className="cmc-card__body" style={{ color: 'var(--cmc-text-subtle)' }}>
          Loading…
        </div>
      </section>
    )
  }
  if (query.isError) {
    return (
      <section className="cmc-card" aria-label="Skill latency snapshot">
        <header className="cmc-panel-card__header">
          <div>
            {renderedReqId}
            <h3 className="cmc-card__title">Latency</h3>
          </div>
        </header>
        <div className="cmc-card__body" role="alert">
          Couldn{'’'}t load latency:{' '}
          {query.error instanceof Error ? query.error.message : 'unknown error'}
        </div>
      </section>
    )
  }
  const data = query.data
  if (!data) return null
  return (
    <section className="cmc-card" aria-label="Skill latency snapshot">
      <header className="cmc-panel-card__header">
        <div>
          {renderedReqId}
          <h3 className="cmc-card__title">Latency</h3>
          <p className="cmc-caption">
            {data.low_sample
              ? 'Low sample — interpret with care.'
              : 'Quantiles over the trailing 14 days.'}
          </p>
        </div>
      </header>
      <div
        className="cmc-card__body"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 'var(--space-sm)',
        }}
      >
        <KpiTile label="Samples" value={nf.format(data.sample_count)} mono />
        <KpiTile
          label="p50"
          value={data.p50_ms === null ? '—' : `${data.p50_ms}ms`}
          mono
        />
        <KpiTile
          label="p95"
          value={data.p95_ms === null ? '—' : `${data.p95_ms}ms`}
          mono
        />
        <KpiTile
          label="max"
          value={data.max_ms === null ? '—' : `${data.max_ms}ms`}
          mono
        />
        <KpiTile
          label="Error %"
          value={`${(data.error_rate * 100).toFixed(1)}%`}
          mono
        />
      </div>
    </section>
  )
}

function SkillDetailPage() {
  // NOTE on the underscore: the file is named `skills_.$name.tsx` to
  // OPT OUT of being nested under the `routes/skills.tsx` parent layout
  // (TanStack Router flat-routing convention — trailing `_` on a segment
  // un-nests it from its sibling parent). The URL is still `/skills/$name`,
  // but the route's stable id (used here for `from:` and elsewhere by
  // `createFileRoute`) is `/skills_/$name`. Without the underscore, this
  // page would render as a child of SkillsPage which has no <Outlet/>,
  // and the detail UI would never appear.
  const { name } = useParams({ from: '/skills_/$name' })
  return (
    <section className="cmc-page" aria-labelledby="skill-detail-heading">
      <header className="cmc-page__header">
        <Link
          to="/skills"
          className="cmc-label"
          style={{ color: 'var(--cmc-text-subtle)', textDecoration: 'none' }}
        >
          {'←'} Back to Skills
        </Link>
        <span className="cmc-label" style={{ color: 'var(--cmc-text-subtle)' }}>
          Skills • {name}
        </span>
        <h1
          id="skill-detail-heading"
          className="cmc-page__heading cmc-page__heading--gradient"
        >
          {name}
        </h1>
        <p className="cmc-page__subheading">
          Per-skill cost, latency, and recent invocations.
        </p>
      </header>
      {/* Single-column stack — each panel is wide enough on its own. */}
      <SkillCostCard name={name} />
      <SkillLatencySnapshot name={name} />
      <SkillRunsTable name={name} />
    </section>
  )
}

export const Route = createFileRoute('/skills_/$name')({
  component: SkillDetailPage,
})
