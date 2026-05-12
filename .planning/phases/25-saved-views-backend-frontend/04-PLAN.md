---
phase: 25-saved-views-backend-frontend
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/routes/skills_.$name.tsx
  - frontend/src/components/panels/SkillProjectsTable.tsx
  - frontend/src/components/panels/SkillRunsTable.tsx
  - frontend/src/components/panels/SkillLatencySnapshot.tsx
  - frontend/src/components/panels/SkillCostCard.tsx
  - frontend/src/lib/__tests__/skillsDetailRange.test.tsx
autonomous: true

must_haves:
  truths:
    - "/skills/$name validateSearch accepts ?range=7d|14d|30d (default 14d preserves existing behavior)"
    - "Panels SkillProjectsTable, SkillRunsTable, SkillLatencySnapshot, SkillCostCard read the range from URL state, not from hard-coded literals"
    - "Phase 25 success criterion 1 (user saves filter combination on /skills/$name) is now achievable — there is meaningful URL state to save"
    - "Deep links without ?range= still load with the same default (14d) the page had before this plan"
  artifacts:
    - path: "frontend/src/routes/skills_.$name.tsx"
      provides: "validateSearch with schemaVersion: 1 + range field; threads range into existing panel props"
      contains: "validateSearch"
    - path: "frontend/src/lib/__tests__/skillsDetailRange.test.tsx"
      provides: "Vitest covering ?range= deep-link round-trip + default fallback"
      contains: "skills_.$name"
  key_links:
    - from: "frontend/src/routes/skills_.$name.tsx"
      to: "frontend/src/lib/searchSchemas.ts (Plan 03)"
      via: "SCHEMA_VERSION + coerceSchemaVersion import"
      pattern: "SCHEMA_VERSION"
    - from: "frontend/src/routes/skills_.$name.tsx"
      to: "panels (SkillProjectsTable, SkillRunsTable, SkillLatencySnapshot, SkillCostCard)"
      via: "useSearch() reads range; prop passed down"
      pattern: "useSearch|range="
---

<objective>
Hoist the `range` filter on `/skills/$name` from hard-coded literals (`'14d'` in 2 places) into URL search state via `validateSearch`. This is the ONLY route in Phase 25 that adds a meaningful new search field, per Research §Per-Route Search-Shape Delta — because ROADMAP Phase 25 success criterion 1 demands "user saves the current filter combination on `/skills/$name` as a named view".

Without a real filter in the URL, there's nothing to save — the success criterion would be unrenderable.

Purpose: Make the skill-detail page's range filter URL-shareable AND saveable as a named view.
Output: `?range=7d`, `?range=14d`, `?range=30d` deep links work. Default (no `range`) renders identically to the pre-plan page (14d). Panels accept `range` prop (verify they already do; if a panel hard-codes the literal internally, lift it to a prop).
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md
@.planning/phases/25-saved-views-backend-frontend/25-03-SUMMARY.md

# Reference route + panels (read first):
@frontend/src/routes/skills_.$name.tsx
@frontend/src/components/panels/SkillProjectsTable.tsx
@frontend/src/components/panels/SkillRunsTable.tsx
@frontend/src/components/panels/SkillLatencySnapshot.tsx
@frontend/src/components/panels/SkillCostCard.tsx

# Lock context:
@docs/url-contract.md
@frontend/src/components/ui/RangeToggle.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit panels for existing `range` prop + lift any internal hard-codes to props</name>
  <files>frontend/src/components/panels/SkillProjectsTable.tsx, frontend/src/components/panels/SkillRunsTable.tsx, frontend/src/components/panels/SkillLatencySnapshot.tsx, frontend/src/components/panels/SkillCostCard.tsx</files>
  <action>
For EACH of the 4 panels:

1. Read the panel's source.
2. Check whether it already accepts a `range` prop. (Research notes `SkillProjectsTable` is invoked with `range='14d'` from `routes/skills_.$name.tsx:172`, which implies the prop exists.)
3. If a panel hard-codes the literal `'14d'` internally (e.g. `SkillLatencySnapshot` is referenced at `routes/skills_.$name.tsx:48` with `'14d'`), lift the literal to a prop with the same default to preserve current behavior.

Concrete actions:

- `SkillProjectsTable.tsx`: verify it accepts `range?: '7d' | '14d' | '30d'` (with default `'14d'`). If yes, no change needed. If no, add the prop with that default.
- `SkillRunsTable.tsx`: same check.
- `SkillLatencySnapshot.tsx`: same check — research notes it currently uses `'14d'`. Lift to prop if internal; preserve default `'14d'`.
- `SkillCostCard.tsx`: same check.

If a panel uses an internal `useState('14d')` for a `RangeToggle`, that's the user-facing range UI INSIDE the panel — leave it for now. The Task here is solely about whether the panel's data-fetch key reads from a `range` PROP. The user-facing toggle stays internal; Phase 26/27 may revisit.

CRITICAL invariant: NO behavior change today. Default arm of every panel must render identical query parameters to its pre-plan state.

If you discover a panel that requires significant refactoring to thread a `range` prop down to its data hook, OPEN A CHECKPOINT decision before making the change. The intent of Task 1 is a small surface lift, not a refactor.
  </action>
  <verify>
`cd frontend && pnpm tsc --noEmit` clean. Existing vitest specs for each panel still green: `pnpm test --run src/components/panels/__tests__/SkillProjectsTable.test.tsx src/components/panels/__tests__/SkillRunsTable.test.tsx src/components/panels/__tests__/SkillLatencySnapshot.test.tsx src/components/panels/__tests__/SkillCostCard.test.tsx` (skip the files that don't have tests). Page renders identically in `pnpm dev` against the pre-plan baseline (default `?` URL on `/skills/$name`).
  </verify>
  <done>
Each of the 4 panels exposes (or already exposed) a `range` prop with default `'14d'`. No visual regression on `/skills/<any-skill>` with empty querystring.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add validateSearch with `range` field to /skills/$name + thread URL state into the 4 panels</name>
  <files>frontend/src/routes/skills_.$name.tsx</files>
  <action>
Edit `frontend/src/routes/skills_.$name.tsx` to:

1. Add a `validateSearch` function returning `{ schemaVersion: 1, range: '7d' | '14d' | '30d' }`. Default to `'14d'` (matches pre-plan behavior).
2. Replace hard-coded `'14d'` props on the 4 panels with `range` read from `Route.useSearch()`.

EXACT pattern:

```typescript
import { createFileRoute, useParams } from '@tanstack/react-router'
import { SCHEMA_VERSION, coerceSchemaVersion } from '../lib/searchSchemas'
// ... existing imports

export type SkillsDetailRange = '7d' | '14d' | '30d'
export type SkillsDetailSearch = {
  schemaVersion: typeof SCHEMA_VERSION
  range: SkillsDetailRange
}

const VALID_RANGES: readonly SkillsDetailRange[] = ['7d', '14d', '30d'] as const

function validateSearch(raw: Record<string, unknown>): SkillsDetailSearch {
  const range = (typeof raw.range === 'string' && (VALID_RANGES as readonly string[]).includes(raw.range))
    ? (raw.range as SkillsDetailRange)
    : '14d'  // default reproduces pre-Phase-25 behavior (Pitfall 3)
  return {
    schemaVersion: coerceSchemaVersion(raw),
    range,
  }
}

export const Route = createFileRoute('/skills/$name')({
  validateSearch,
  component: SkillsDetailPage,
})

function SkillsDetailPage() {
  const { name } = Route.useParams()
  const { range } = Route.useSearch()
  // ... rest of page

  return (
    <>
      <SkillLatencySnapshot skillName={name} range={range} />
      <SkillProjectsTable skillName={name} range={range} />
      <SkillRunsTable skillName={name} range={range} />
      <SkillCostCard skillName={name} range={range} />
      {/* other JSX unchanged */}
    </>
  )
}
```

IMPORTANT:
- DEFAULT MUST be `'14d'` — this preserves Phase 24 behavior. ANY other default is a breaking change to deep links (Pitfall 3).
- If the file already exports `validateSearch` as a named export (per Plan 03's pattern), follow the same export convention here for vitest reachability.
- Verify TanStack Router path is `/skills/$name` (NOT `/skills_/$name`); the filename `skills_.$name.tsx` produces the underscore-dot routing convention that maps to `/skills/$name` URL.
- The page component may not currently be named `SkillsDetailPage` — match the existing export name.
- Keep all existing prop signatures on the 4 panels — only change the `range` value to `useSearch().range`.

This is the route where ROADMAP success criterion 1 lands: "User saves the current filter combination on `/skills/$name` as a named view ... and the view auto-loads as the per-route default."
  </action>
  <verify>
`cd frontend && pnpm tsc --noEmit` clean (after routeTree.gen.ts regeneration). `pnpm test --run` — full vitest green. Manual: `/skills/<any-skill>` renders default 14d data; `/skills/<any-skill>?range=7d` re-anchors panels to 7d (verify by inspecting RangeToggle or panel API URLs in Network tab).
  </verify>
  <done>
`/skills/$name` route has validateSearch with `range`; deep link `?range=30d` overrides default; default `14d` preserved. Panels receive `range` via prop, not literal.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add vitest covering range deep-link round-trip + default fallback</name>
  <files>frontend/src/lib/__tests__/skillsDetailRange.test.tsx</files>
  <action>
Create `frontend/src/lib/__tests__/skillsDetailRange.test.tsx` with vitest cases asserting:

1. `validateSearch({})` returns `{ schemaVersion: 1, range: '14d' }` — default reproduces pre-plan behavior.
2. `validateSearch({ range: '7d' })` returns `{ schemaVersion: 1, range: '7d' }`.
3. `validateSearch({ range: '14d' })` returns `{ schemaVersion: 1, range: '14d' }`.
4. `validateSearch({ range: '30d' })` returns `{ schemaVersion: 1, range: '30d' }`.
5. `validateSearch({ range: 'bogus' })` returns `{ schemaVersion: 1, range: '14d' }` — invalid coerced to default.
6. `validateSearch({ range: 30 })` returns `{ schemaVersion: 1, range: '14d' }` — non-string coerced to default.
7. `validateSearch({ foo: 'bar' })` drops unknown fields and returns the default.

Pattern (similar to Plan 03's searchSchemas test shape):

```typescript
import { describe, expect, it } from 'vitest'
import { Route } from '../../routes/skills_.$name'

const validateSearch = Route.options.validateSearch
// or: import { validateSearch } from '../../routes/skills_.$name' (if exported)

describe('/skills/$name validateSearch (Phase 25 / VIEW-01)', () => {
  it('defaults to 14d when range is absent', () => {
    expect(validateSearch({})).toEqual({ schemaVersion: 1, range: '14d' })
  })

  it.each(['7d', '14d', '30d'] as const)('preserves valid range %s', (r) => {
    expect(validateSearch({ range: r })).toEqual({ schemaVersion: 1, range: r })
  })

  it('coerces invalid range to default 14d', () => {
    expect(validateSearch({ range: 'bogus' })).toEqual({ schemaVersion: 1, range: '14d' })
  })

  it('coerces non-string range to default 14d', () => {
    expect(validateSearch({ range: 30 })).toEqual({ schemaVersion: 1, range: '14d' })
  })

  it('drops unknown fields', () => {
    expect(validateSearch({ foo: 'bar' })).toEqual({ schemaVersion: 1, range: '14d' })
  })
})
```

This test is the regression net for ROADMAP success criterion 1. If a future plan accidentally bumps the default away from `'14d'`, this test fails loudly.
  </action>
  <verify>
`cd frontend && pnpm test --run src/lib/__tests__/skillsDetailRange.test.tsx` — all 7+ cases pass. `cd frontend && pnpm tsc --noEmit` clean.
  </verify>
  <done>
skillsDetailRange.test.tsx green; vitest count up by 7+. Append-only + default-preserves-behavior invariants captured.
  </done>
</task>

</tasks>

<verification>
1. `cd frontend && pnpm tsc --noEmit` clean.
2. `cd frontend && pnpm test --run` full vitest green; count up by 7+.
3. `cd frontend && pnpm lint` clean.
4. `cd frontend && pnpm build` succeeds.
5. `cd backend && uv run pytest tests/test_url_contract.py` — 2/2 PASS (no route renames).
6. Manual: `/skills/<skill-name>` renders identically to pre-plan baseline; `/skills/<skill-name>?range=7d` re-anchors panels.
</verification>

<success_criteria>
- `/skills/$name` accepts `?range=7d|14d|30d`; default `14d` preserved.
- All 4 detail panels read `range` from URL state, not hardcoded literals.
- Phase 25 success criterion 1 ("user saves the current filter combination on `/skills/$name`") becomes achievable — the URL state now contains a meaningful filter to save.
- This plan can run in parallel with Plan 03 (different files; both feed Plan 05's hook layer).
</success_criteria>

<output>
After completion, create `.planning/phases/25-saved-views-backend-frontend/25-04-SUMMARY.md` documenting:
- Final search shape `{ schemaVersion: 1, range: '7d'|'14d'|'30d' }`
- Default value chosen (`'14d'`) and the pre-plan behavior it preserves
- Which (if any) panel needed an internal hard-code lifted to a prop
- vitest count delta
- "Where to look first" hint for Plan 11 (e2e gate): the demo scenario for success criterion 1 lives on `/skills/<any-real-skill-name>` with the `range` filter
</output>
