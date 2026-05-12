---
phase: 25-saved-views-backend-frontend
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/lib/searchSchemas.ts
  - frontend/src/routes/index.tsx
  - frontend/src/routes/activity.tsx
  - frontend/src/routes/skills.tsx
  - frontend/src/routes/cost.tsx
  - frontend/src/routes/alerts.tsx
  - frontend/src/routes/sessions_.compare.tsx
  - frontend/src/lib/__tests__/searchSchemas.test.ts
autonomous: true

must_haves:
  truths:
    - "Every in-scope route has a validateSearch returning a typed Search shape with schemaVersion: 1"
    - "Existing deep links (e.g. /sessions/compare?a=<uuid>&b=<uuid>) still resolve identically — append-only invariant honored"
    - "Unknown search params are dropped silently by validateSearch (so saved views with stale fields don't crash)"
    - "test_url_contract.py still passes (no route renames; no new files)"
  artifacts:
    - path: "frontend/src/lib/searchSchemas.ts"
      provides: "Shared SCHEMA_VERSION constant + helpers + per-route Search types re-export point"
      contains: "export const SCHEMA_VERSION = 1"
    - path: "frontend/src/routes/index.tsx"
      provides: "validateSearch returning { schemaVersion: 1 }"
      contains: "validateSearch"
    - path: "frontend/src/routes/sessions_.compare.tsx"
      provides: "Existing validateSearch extended with schemaVersion: 1 (append-only)"
      contains: "schemaVersion"
  key_links:
    - from: "every Route in scope"
      to: "frontend/src/lib/searchSchemas.ts"
      via: "import { SCHEMA_VERSION } or local type"
      pattern: "SCHEMA_VERSION|schemaVersion"
    - from: "frontend/tests/e2e/routes.spec.ts (existing)"
      to: "every Route's validateSearch"
      via: "navigation smoke through all routes still green"
      pattern: "routes.spec.ts"
---

<objective>
Land `validateSearch` on the 5 routes that don't have it yet (`/`, `/activity`, `/skills`, `/cost`, `/alerts`) and add `schemaVersion: 1` to the existing `/sessions/compare` validator (VIEW-01). This is mechanically simple — 10 LOC per route. The non-trivial route `/skills/$name` lives in Plan 04 because it requires hoisting a `range` filter to satisfy success criterion 1.

Purpose: Give every in-scope route a typed URL search shape that future saved views can hydrate against, and a `schemaVersion` field that enables append-only schema evolution per `docs/url-contract.md:21-24`.
Output: Each route's `createFileRoute(...)` call wraps a `validateSearch` function returning a typed shape. Existing URL contracts unchanged. Future Phase 25 work (chrome, save dialog) can read `useSearch()` and trust the shape.

This plan deliberately does NOT touch panel rendering or threading new params through the JSX. The schema lands first; per-route filter migration is Phase 26/27.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md
@docs/url-contract.md

# Reference (only existing validateSearch in the repo):
@frontend/src/routes/sessions_.compare.tsx

# Routes to extend (read first to confirm current shape):
@frontend/src/routes/index.tsx
@frontend/src/routes/activity.tsx
@frontend/src/routes/skills.tsx
@frontend/src/routes/cost.tsx
@frontend/src/routes/alerts.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create shared searchSchemas.ts + add validateSearch on 5 routes + extend sessions/compare</name>
  <files>frontend/src/lib/searchSchemas.ts, frontend/src/routes/index.tsx, frontend/src/routes/activity.tsx, frontend/src/routes/skills.tsx, frontend/src/routes/cost.tsx, frontend/src/routes/alerts.tsx, frontend/src/routes/sessions_.compare.tsx</files>
  <action>
Step A — Create `frontend/src/lib/searchSchemas.ts` with the shared constant and a helper:

```typescript
/**
 * Shared schema-version constant for all route `validateSearch` shapes.
 *
 * Phase 25 / VIEW-01. Bumping this is APPEND-ONLY: any new search param must
 * default to a value reproducing pre-bump behavior. See docs/url-contract.md.
 *
 * Saved views (Phase 25) store the validated search blob into the backend's
 * opaque state_json column; the frontend's validateSearch is the only
 * gatekeeper of shape on read (Pitfall 6 in 25-RESEARCH.md).
 */
export const SCHEMA_VERSION = 1 as const

/**
 * Coerce a raw search record to the documented schemaVersion. Today this
 * always returns 1. Future versions branch on raw.schemaVersion.
 */
export function coerceSchemaVersion(raw: Record<string, unknown>): typeof SCHEMA_VERSION {
  // Future: if (raw.schemaVersion === 2) return 2 (etc.)
  return SCHEMA_VERSION
}
```

Step B — Add `validateSearch` to each of the 5 routes. For each, read the current `createFileRoute('...', { component: ... })` call and wrap it as below. ALL 5 follow the same shape; the route filename and the route path differ.

Pattern — apply to `index.tsx`, `activity.tsx`, `skills.tsx`, `cost.tsx`, `alerts.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { SCHEMA_VERSION, coerceSchemaVersion } from '../lib/searchSchemas'
// ... existing imports

export type IndexSearch = {     // rename per route: IndexSearch / ActivitySearch / SkillsSearch / CostSearch / AlertsSearch
  schemaVersion: typeof SCHEMA_VERSION
}

function validateSearch(raw: Record<string, unknown>): IndexSearch {
  // Phase 25 lands NO new filters on this route; future filters land additively.
  // Unknown fields are dropped silently (so a stale saved view's state_json
  // doesn't crash the page on load).
  return { schemaVersion: coerceSchemaVersion(raw) }
}

export const Route = createFileRoute('/')({  // path differs per route
  validateSearch,
  component: ComponentName,  // existing
})
```

Per-route detail:
- `frontend/src/routes/index.tsx` → type `IndexSearch`, path `'/'`.
- `frontend/src/routes/activity.tsx` → type `ActivitySearch`, path `'/activity'`.
- `frontend/src/routes/skills.tsx` → type `SkillsSearch`, path `'/skills'`.
- `frontend/src/routes/cost.tsx` → type `CostSearch`, path `'/cost'`.
- `frontend/src/routes/alerts.tsx` → type `AlertsSearch`, path `'/alerts'`.

Step C — Extend `frontend/src/routes/sessions_.compare.tsx`'s existing validator at lines 32-38 to include `schemaVersion: 1`. The existing UUID coercion stays untouched.

```typescript
import { SCHEMA_VERSION, coerceSchemaVersion } from '../lib/searchSchemas'

export type CompareSearch = {
  schemaVersion: typeof SCHEMA_VERSION  // NEW — append-only
  a?: string
  b?: string
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function validateSearch(raw: Record<string, unknown>): CompareSearch {
  const a = typeof raw.a === 'string' && UUID_RE.test(raw.a) ? raw.a : undefined
  const b = typeof raw.b === 'string' && UUID_RE.test(raw.b) ? raw.b : undefined
  return { schemaVersion: coerceSchemaVersion(raw), a, b }
}
```

CRITICAL invariants (Research Pitfall 3):
- Every field must DEFAULT to the pre-Phase-25 behavior. We add only `schemaVersion`; we do NOT remove or coerce existing fields.
- Do NOT rename route files. Do NOT rename existing search params.
- Do NOT change return shape of existing routes' components — they don't read `useSearch()` yet; today's runtime behavior is unchanged.
- Existing localStorage-backed panel state (`RangeToggle persistKey`) is ORTHOGONAL — leave it alone. Until panels are migrated (Phase 26/27), saved views simply won't capture it. That's intentional.

The routeTree.gen.ts will need regeneration since TanStack Router infers search types from validators. Run `pnpm dev` or `pnpm build` to trigger the codegen (or `pnpm tanstack-router generate` if a direct script exists in package.json scripts). Verify routeTree.gen.ts compiles by running `pnpm tsc --noEmit`.
  </action>
  <verify>
    <automated>cd frontend && pnpm tsc --noEmit && pnpm test --run</automated>
  </verify>
  <done>
All 6 route files have validateSearch returning a shape that includes `schemaVersion: 1`. routeTree.gen.ts regenerated and type-checks. No runtime behavior change on any route.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add vitest covering validateSearch behavior + URL contract regression smoke</name>
  <files>frontend/src/lib/__tests__/searchSchemas.test.ts</files>
  <action>
Create `frontend/src/lib/__tests__/searchSchemas.test.ts` with vitest cases asserting:

1. `SCHEMA_VERSION === 1`.
2. `coerceSchemaVersion({})` returns `1`.
3. `coerceSchemaVersion({ schemaVersion: 99 })` returns `1` (today; future versions branch).
4. Each route's `validateSearch` (imported from the route files via the exported `Route.options.validateSearch`):
   - Returns `{ schemaVersion: 1 }` for an empty record.
   - Drops unknown fields silently (e.g. `validateSearch({ foo: "bar" })` returns `{ schemaVersion: 1 }` only).
   - For `/sessions/compare`: preserves `a` + `b` when they are valid UUIDs (regression-safe).

Vitest pattern (see existing specs in `frontend/src/lib/__tests__/` for fixture shape):

```typescript
import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, coerceSchemaVersion } from '../searchSchemas'
import { Route as IndexRoute } from '../../routes/index'
import { Route as CompareRoute } from '../../routes/sessions_.compare'

describe('SCHEMA_VERSION', () => {
  it('is 1 at Phase 25', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })
})

describe('per-route validateSearch', () => {
  it('index returns schemaVersion 1 + drops unknowns', () => {
    const fn = IndexRoute.options.validateSearch
    expect(fn({ foo: 'bar' })).toEqual({ schemaVersion: 1 })
  })

  it('sessions/compare preserves a + b UUIDs, adds schemaVersion', () => {
    const fn = CompareRoute.options.validateSearch
    const uuid = '12345678-1234-1234-1234-123456789012'
    expect(fn({ a: uuid, b: uuid })).toEqual({
      schemaVersion: 1,
      a: uuid,
      b: uuid,
    })
  })

  it('sessions/compare drops non-UUID a/b', () => {
    const fn = CompareRoute.options.validateSearch
    expect(fn({ a: 'not-uuid' })).toEqual({ schemaVersion: 1, a: undefined, b: undefined })
  })
})
```

(Repeat the "schemaVersion 1 + drops unknowns" assertion for each of the 6 routes — copy the pattern.)

The exact import path for accessing `Route.options.validateSearch` depends on TanStack Router's API. If `Route.options.validateSearch` is not directly accessible, import the `validateSearch` function as a named export from the route file (you may need to add `export { validateSearch }` to each route file).

IMPORTANT:
- This test is the regression net for the append-only invariant. Future plans MUST NOT break it.
- If `routeTree.gen.ts` is the only consumer of the validator, exporting `validateSearch` from each route file as a named export is the cleanest way to test it — do that if `Route.options.validateSearch` is internal.
  </action>
  <verify>
    <automated>cd frontend && pnpm test --run src/lib/__tests__/searchSchemas.test.ts && pnpm tsc --noEmit</automated>
  </verify>
  <done>
searchSchemas.test.ts passes; vitest count up by 6+ (one per route + SCHEMA_VERSION + coerceSchemaVersion). Append-only invariant captured by tests.
  </done>
</task>

</tasks>

<verification>
1. `cd frontend && pnpm tsc --noEmit` — clean.
2. `cd frontend && pnpm test --run` — all vitest green; count up by 6+ specs.
3. `cd frontend && pnpm lint` — clean (no testid/no-raw-z-index violations; no new testids introduced).
4. `cd frontend && pnpm build` — production build succeeds.
5. `cd backend && uv run pytest tests/test_url_contract.py -v` — 2/2 PASS unchanged (no route file renames).
6. Manual smoke (operator): open every route in browser — pages render identically to Phase 24 close. No console errors. Deep-link `/sessions/compare?a=<uuid>&b=<uuid>` still loads both sides.
</verification>

<success_criteria>
- 6 route files have validateSearch returning a shape with schemaVersion: 1.
- /sessions/compare's existing a/b UUID handling preserved.
- routeTree.gen.ts compiles after regeneration; tsc clean.
- vitest count up by ≥6 cases; lint clean; build green.
- test_url_contract.py unchanged (no route renames).
- This plan can run in parallel with Plan 04 (different files); both feed Plan 05's hook layer.
</success_criteria>

<output>
After completion, create `.planning/phases/25-saved-views-backend-frontend/25-03-SUMMARY.md` documenting:
- 6 route files modified
- Export pattern used (Route.options.validateSearch vs named export) — Plan 04 must match
- vitest count delta
- Any panel-internal filter state left in localStorage (foreshadow Phase 26/27 migration)
</output>
