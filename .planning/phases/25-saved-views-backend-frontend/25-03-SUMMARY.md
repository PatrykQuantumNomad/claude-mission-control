---
phase: 25-saved-views-backend-frontend
plan: 03
subsystem: frontend-search-shapes
tags: [validateSearch, schemaVersion, tanstack-router, view-01, append-only]
requires:
  - "@tanstack/react-router (existing)"
provides:
  - "SCHEMA_VERSION=1 + coerceSchemaVersion helper (frontend/src/lib/searchSchemas.ts)"
  - "validateSearch named export on /, /activity, /skills, /cost, /alerts, /sessions/compare"
  - "Per-route IndexSearch / ActivitySearch / SkillsSearch / CostSearch / AlertsSearch / CompareSearch types"
  - "vitest regression net pinning the append-only invariant (19 new specs)"
affects:
  - "Future saved-views hook (Plan 05) — reads each route's validated search shape on save"
  - "Plan 04 — must mirror named-export pattern for /skills/$name (already done)"
tech-stack:
  added: []
  patterns:
    - "validateSearch as named export from each route file (testable via direct import)"
    - "schemaVersion?: optional on input type, always-populated on output (preserves existing Link/navigate call shapes)"
key-files:
  created:
    - "frontend/src/lib/searchSchemas.ts"
    - "frontend/src/lib/__tests__/searchSchemas.test.ts"
  modified:
    - "frontend/src/routes/index.tsx"
    - "frontend/src/routes/activity.tsx"
    - "frontend/src/routes/skills.tsx"
    - "frontend/src/routes/cost.tsx"
    - "frontend/src/routes/alerts.tsx"
    - "frontend/src/routes/sessions_.compare.tsx"
decisions:
  - "Named-export `validateSearch` from each route file (not Route.options.validateSearch) — cleanest testability + zero TanStack Router internals coupling"
  - "schemaVersion?: optional on input type — preserves every existing `<Link to=...>` / `navigate({ to })` call site untouched"
  - "SCHEMA_VERSION lives at module-init in lib/searchSchemas.ts (single source of truth across all routes)"
  - "coerceSchemaVersion is the migration seam — today returns 1 regardless; future versions branch on raw.schemaVersion"
metrics:
  duration_seconds: 470
  completed_date: "2026-05-12"
  tasks_completed: 2
  files_created: 2
  files_modified: 6
  vitest_delta: "+19 specs (353 → 372 in plan-03 isolation; co-existing with Plan 04 net is 380)"
---

# Phase 25 Plan 03: validateSearch + schemaVersion on 6 frontend routes — Summary

VIEW-01 lands the append-only `schemaVersion: 1` shape on every in-scope frontend route via a `validateSearch` named export, with `lib/searchSchemas.ts` as the single source of truth for the version constant + coercion helper. Future saved views (Plan 05+) can hydrate against a typed shape; existing deep-links (`/sessions/compare?a=...&b=...`) resolve identically; `pnpm tsc/lint/build` clean; vitest count +19.

## What was built

### Task 1 — validateSearch on 6 routes (commit 062c2d4)

**Shared module** (`frontend/src/lib/searchSchemas.ts`, 51 LOC):
- `export const SCHEMA_VERSION = 1 as const` — single source of truth.
- `export function coerceSchemaVersion(_raw: Record<string, unknown>): typeof SCHEMA_VERSION` — the migration seam for forward-version blobs (returns `1` today regardless of input).
- Module-level JSDoc captures the append-only invariant, the optional-on-input/always-on-output contract, and the "backend-opaque" persistence rule (RESEARCH Pitfall 6).

**5 new validators** (`index.tsx`, `activity.tsx`, `skills.tsx`, `cost.tsx`, `alerts.tsx`):
- Each route gained an exported `XxxSearch` type with `schemaVersion?: typeof SCHEMA_VERSION` (optional on input, always populated on output).
- Each route gained an exported `validateSearch(raw: Record<string, unknown>): XxxSearch` that returns `{ schemaVersion: coerceSchemaVersion(raw) }`.
- Each route's `createFileRoute(...)({ component })` was extended to `createFileRoute(...)({ validateSearch, component })`.
- No filters were threaded into any panel — that is explicitly Phase 26/27 work.

**1 extended validator** (`sessions_.compare.tsx`):
- `CompareSearch` gained `schemaVersion?: typeof SCHEMA_VERSION` (append-only).
- Existing UUID coercion of `a`/`b` left untouched — invalid UUIDs still drop to `undefined`.
- Internal `validateSearch` function promoted to a named export (was previously module-scope-only).
- The `Route.useSearch()` consumer at `SessionComparePage` was untouched — `{ a, b }` destructure still works because `schemaVersion` is optional on the input destructure.

### Task 2 — vitest regression net (commit e1a2cd2)

**19 new specs** in `frontend/src/lib/__tests__/searchSchemas.test.ts`:

| Describe block | Specs | What it pins |
|---|---|---|
| `SCHEMA_VERSION (Phase 25 / VIEW-01)` | 1 | Constant is `1` — bumping forces deliberate test update |
| `coerceSchemaVersion` | 3 | Empty input → 1; future-version stale blob → 1; pre-Phase-25 blob (no field) → 1 |
| Per-route `validateSearch` | 10 | Each of 5 routes (`/`, `/activity`, `/skills`, `/cost`, `/alerts`) × 2 specs (empty → `{schemaVersion: 1}`; unknown fields dropped) |
| `/sessions/compare` append-only | 5 | Both-UUIDs preserved; a-alone preserved; non-UUID coerced to `undefined`; unknown fields dropped; empty input → schemaVersion 1 + a/b undefined |

Combined with Plan 04's 8 specs (`skillsDetailRange.test.tsx`) the two nets cover all 7 in-scope routes for VIEW-01.

## Decisions made

### Decision 1 (locked) — Named-export `validateSearch`, not `Route.options.validateSearch`

**Why:** `Route.options.validateSearch` is technically accessible at runtime via TanStack Router's internal `Route` instance, but the property's exact shape is an internal API and changes across minor versions. Named export is:

1. Zero coupling to TanStack Router internals — uses only the public `createFileRoute` API for the route wiring.
2. Trivially testable via direct import — `import { validateSearch } from '../../routes/index'` is a one-liner.
3. Visible at the file's top — readers see the validator without scrolling past the JSX component.
4. Same pattern Plan 04 must use (already did) — no cross-plan API drift.

**Plan 04 must mirror this pattern.** Verified: `git log --oneline` shows `625dc01 test(25-04): cover /skills/$name validateSearch range round-trip` and `5e79a22 feat(25-04): hoist /skills/$name range filter to URL search state` already shipped using the same named-export pattern (`import { validateSearch } from '../../routes/skills_.$name'`).

### Decision 2 (locked) — `schemaVersion?:` optional on input type

**Why:** TanStack Router infers the navigation input type from the validator's return type. If `schemaVersion` were `: typeof SCHEMA_VERSION` (required), every existing `<Link to="/activity">` / `navigate({ to: '/cost' })` call site in the codebase would need a `search={{ schemaVersion: 1 }}` prop. That's ~8 call sites across CommandPalette, SessionsTable, SessionComparePage. Marking `schemaVersion?:` optional:

1. Preserves every existing call site untouched.
2. Keeps the runtime guarantee intact — the validator always populates `schemaVersion` on read.
3. Lets future plans (Plan 05+) safely assume `useSearch().schemaVersion === 1` at runtime — the optional marker is a type-system concession to the navigation surface, not a runtime concession.

**Discovered during execution (Rule 2 — auto-add missing critical functionality).** The plan as written specified `schemaVersion: typeof SCHEMA_VERSION` (required). The first `pnpm tsc --noEmit` after applying that shape surfaced 8 TS errors at CommandPalette / SessionsTable / SessionComparePage Link/navigate call sites. The minimal fix was the `?` marker, not threading `search={{ schemaVersion: 1 }}` everywhere.

### Decision 3 (locked) — `coerceSchemaVersion(_raw: ...)` parameter name underscore-prefixed

**Why:** Today's implementation always returns `SCHEMA_VERSION` regardless of input — the parameter is unused. ESLint's `no-unused-vars` is configured to allow underscore-prefixed parameters as the documented "deliberately unused" signal (per Phase 24 Plan 06 ESLint config). Future versions will read `raw.schemaVersion` and the underscore can be dropped at that point.

## Panel-internal filter state left in localStorage (foreshadow Phase 26/27)

Per the plan's success criterion #1, this plan does NOT touch panel rendering or thread params into JSX. The following panel-internal state remains in `localStorage` under existing `RangeToggle persistKey` / `useLocalStorage` hooks; saved views (Plan 05+) will NOT capture these until per-route adoption migrates them into the search shape:

| Route | Panel | localStorage key | Phase that migrates |
|---|---|---|---|
| `/activity` | ActivityHeatmap range | `cmc.activity-heatmap-range` | Phase 26 |
| `/activity` | ChartsStrip range | (panel-internal state) | Phase 26 |
| `/activity` | SessionsTable sort/filter | (panel-internal state) | Phase 26 |
| `/cost` | CostByProjectCard 7d/30d toggle | (panel-internal state) | Phase 27 |
| `/alerts` | AlertEventsList range | `cmc.alert-events-range` | Phase 27 |
| `/skills` | (none — `/skills/$name` was already hoisted by Plan 04) | n/a | n/a |

This is intentional and documented as the locked sequencing: schema lands first (Plan 03/04), hook layer lands second (Plan 05), per-route filter migration lands third (Phase 26/27 per the v1.3 roadmap).

## Deviations from Plan

### Rule 2 — Auto-add missing critical functionality

**1. `schemaVersion?:` (optional) instead of `schemaVersion:` (required) on input type**

- **Found during:** Task 1 first `pnpm tsc --noEmit` run.
- **Issue:** The plan's type definition (`schemaVersion: typeof SCHEMA_VERSION`) made the field required on TanStack Router's inferred navigation input type, breaking 8 existing `<Link>` / `navigate()` call sites at `CommandPalette.tsx:151,167,214,244,253,262`, `SessionsTable.tsx:129`, `sessions_.compare.tsx:56` (the `Link to="/activity"` inside SessionComparePage), and `skills_.$name.tsx:209`.
- **Fix:** Marked `schemaVersion?:` optional in all 6 route Search type definitions. Validator output is unchanged (always populates the field). Documented in module-level JSDoc on `searchSchemas.ts` and on each route's `XxxSearch` type comment as "OPTIONAL on input, always-populated on output".
- **Files modified:** all 6 route files + `lib/searchSchemas.ts`.
- **Commit:** 062c2d4 (folded into Task 1 commit — the issue was discovered during Task 1 verification, before commit).

### Rule 3 — Auto-fix blocking issues

**1. Parallel-agent staging cleanup before Task 1 commit**

- **Found during:** Task 1 staging step.
- **Issue:** When I ran `git status` before committing, `frontend/src/lib/__tests__/skillsDetailRange.test.tsx` was pre-staged (`A` line) by Plan 04's parallel agent. Per the orchestrator's coordination instructions, including it in my commit would corrupt Plan 04's atomic-commit narrative.
- **Fix:** `git reset HEAD frontend/src/lib/__tests__/skillsDetailRange.test.tsx` unstaged Plan 04's file before my scoped `git add` for my own files. Plan 04 re-staged + re-committed it as `625dc01` on its next cycle.
- **Files affected:** none of mine; just staging hygiene.
- **Commit:** 062c2d4 (cleanup was pre-commit; no separate commit).

## Authentication Gates

None.

## Self-Check: PASSED

**Files created (verified on disk):**
- FOUND: `frontend/src/lib/searchSchemas.ts`
- FOUND: `frontend/src/lib/__tests__/searchSchemas.test.ts`

**Files modified (verified via `git log -p`):**
- FOUND: `frontend/src/routes/index.tsx` (validateSearch + IndexSearch export)
- FOUND: `frontend/src/routes/activity.tsx` (validateSearch + ActivitySearch export)
- FOUND: `frontend/src/routes/skills.tsx` (validateSearch + SkillsSearch export)
- FOUND: `frontend/src/routes/cost.tsx` (validateSearch + CostSearch export)
- FOUND: `frontend/src/routes/alerts.tsx` (validateSearch + AlertsSearch export)
- FOUND: `frontend/src/routes/sessions_.compare.tsx` (CompareSearch extended with schemaVersion?)

**Commits (verified via `git log --oneline`):**
- FOUND: `062c2d4 feat(25-03): add validateSearch with schemaVersion to 6 routes (VIEW-01)`
- FOUND: `e1a2cd2 test(25-03): vitest covering SCHEMA_VERSION + per-route validateSearch`

**Verification gates (all green at plan close):**
- `pnpm tsc --noEmit` — clean
- `pnpm test --run` — 78 files / 380 specs PASS (baseline 353 + my 19 + Plan 04's 8 = 380)
- `pnpm lint` — exit 0
- `pnpm build` — vite production build clean
- `cd backend && uv run pytest tests/test_url_contract.py -v` — 2/2 PASS unchanged

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The frontend `validateSearch` shape is locally-scoped TypeScript inference + a JSON record coercion; saved-view persistence (Plan 05+) is the only consumer that touches the backend, and the persistence channel (state_json BLOB) is opaque per Phase 25 PROJECT decisions.
