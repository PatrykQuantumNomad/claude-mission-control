// Session compare page (URL `/sessions/compare?a={uuid}&b={uuid}`) — first
// `validateSearch` use in the codebase (Phase 16 Plan 02).
//
// FILENAME CHOICE (`sessions_.compare.tsx`, NOT `sessions.compare.tsx`):
//   The trailing-underscore convention opts the route OUT of the parent
//   layout (TanStack Router flat-routing — same precedent as
//   `skills_.$name.tsx` Phase 14 Plan 05). There is no `routes/sessions.tsx`
//   parent today, so the underscore is technically optional — but the lock
//   in 16-02-PLAN.md decisions §1 keeps it for forward compat: if a future
//   sessions index page lands at `routes/sessions.tsx`, the underscore
//   prevents silent nesting and keeps `/sessions/compare` rendering its
//   own page rather than an empty <Outlet/> placeholder.
//
// SEARCH-PARAM VALIDATION:
//   Hand-written validator — NO zod, NO valibot (verified absent from
//   package.json; this is the FIRST validateSearch use in the codebase, so
//   adding a schema lib would be unjustified surface). Both `a` and `b` must
//   be canonical UUIDv4-shape (lowercase 8-4-4-4-12 hex with dashes — case-
//   insensitive). Anything else strips to `undefined` so the page never sends
//   bad params to the backend (defense in depth: backend also rejects with
//   400 on malformed UUID — see backend/cmc/api/routes/sessions.py:_UUID_RE
//   + Phase 16 Plan 01 SUMMARY error contract).

import { createFileRoute, Link } from '@tanstack/react-router'
import { SessionCompareView } from '../components/panels/SessionCompareView'
import {
  SCHEMA_VERSION,
  asTimeToken,
  coerceSchemaVersion,
} from '../lib/searchSchemas'

// Phase 25 / VIEW-01 extends this validator with `schemaVersion` (append-only;
// existing UUID coercion of `a`/`b` untouched). Existing deep-links of the
// shape `/sessions/compare?a=<uuid>&b=<uuid>` resolve identically — the
// validator just augments the returned object with `schemaVersion: 1` so the
// future saved-views layer can persist this route's search shape verbatim
// without a special case.
//
// Phase 26 / TIME-01 (Plan 02). Append-only extension: ACCEPT `time_from?` +
// `time_to?` Grafana-style tokens on `/sessions/compare`. Both default to
// `undefined` — the per-route 7d fallback is applied AT THE PANEL READ SITE
// (Wave 3 plans), NOT in the validator. Defaulting here would defeat
// DefaultViewLoader's bare-URL gate (RESEARCH Pitfall 13).
export type CompareSearch = {
  // OPTIONAL on input — existing `<Link to="/sessions/compare" search={{ a, b }}>`
  // and `navigate({ to: '/sessions/compare', search: { a, b } })` call sites
  // stay untouched; the validator always populates the field on output.
  schemaVersion?: typeof SCHEMA_VERSION
  a?: string
  b?: string
  time_from?: string | undefined
  time_to?: string | undefined
}

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function validateSearch(raw: Record<string, unknown>): CompareSearch {
  const a =
    typeof raw.a === 'string' && UUID_RE.test(raw.a) ? raw.a : undefined
  const b =
    typeof raw.b === 'string' && UUID_RE.test(raw.b) ? raw.b : undefined
  return {
    schemaVersion: coerceSchemaVersion(raw),
    a,
    b,
    time_from: asTimeToken(raw.time_from),
    time_to: asTimeToken(raw.time_to),
  }
}

function SessionComparePage() {
  const { a, b } = Route.useSearch()
  return (
    <section className="cmc-page" aria-labelledby="session-compare-heading">
      <header className="cmc-page__header">
        <Link
          to="/activity"
          className="cmc-label"
          style={{ color: 'var(--cmc-text-subtle)', textDecoration: 'none' }}
        >
          {'←'} Back to Activity
        </Link>
        <span className="cmc-label" style={{ color: 'var(--cmc-text-subtle)' }}>
          Sessions • Compare
        </span>
        <h1
          id="session-compare-heading"
          className="cmc-page__heading cmc-page__heading--gradient"
        >
          Session Compare
        </h1>
        <p className="cmc-page__subheading">
          Two-up paired metrics, skill-set diff, and tool-counts comparison.
        </p>
      </header>
      <SessionCompareView a={a} b={b} />
    </section>
  )
}

export const Route = createFileRoute('/sessions_/compare')({
  validateSearch,
  component: SessionComparePage,
})
