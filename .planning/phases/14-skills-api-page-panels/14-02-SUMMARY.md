---
phase: 14-skills-api-page-panels
plan: 02
subsystem: frontend-lib
tags: [frontend, typescript, tanstack-query, types, hooks, plumbing, sse]

# Dependency graph
requires:
  - phase: 14-skills-api-page-panels
    plan: 01
    provides: "5 backend response schemas (SkillUsageResponse, SkillCostResponse, SkillLatencyResponse, SkillRunsResponse, SkillSparklineRow + SkillUsageRow + SkillRunRow), 4 path operations (/api/skills/usage, /api/skills/{name}/cost, /api/skills/{name}/latency, /api/skills/{name}/runs), SSE payload extension (attrs_skill_name)"
provides:
  - "TS type SkillRange = '14d' | '30d' (separate from existing Range; D-05)"
  - "7 TypeScript interfaces mirroring backend schemas: SkillSparklineRow, SkillUsageRow, SkillUsageResponse, SkillCostResponse, SkillLatencyResponse, SkillRunRow, SkillRunsResponse — cost_usd typed as string per Pydantic v2 Decimal default"
  - "4 fetcher entries on the api map: api.skillUsage(range, limit), api.skillCost(name, range), api.skillLatency(name, range), api.skillRuns(name, limit) — encodeURIComponent on name (defense-in-depth per T-14-02-01)"
  - "4 standalone fetcher exports: fetchSkillUsage, fetchSkillCost, fetchSkillLatency, fetchSkillRuns (thin aliases over api.skill* — satisfy direct-import callers and the Plan 14-02 must_haves grep checks)"
  - "4 hooks: useSkillUsage / useSkillCost / useSkillLatency at 60_000 / 45_000 (matches useCache, useTokens — daily-aggregate bucket); useSkillRuns at 30_000 / 15_000 (matches useSchedules urgency tier)"
  - "4 qk factory entries: skillUsage(range), skillCost(name, range), skillLatency(name, range), skillRuns(name, limit) — distinct prefixes prevent collision with the bare 'skills' key (Pitfall 5)"
  - "OtelEvent.attrs_skill_name: string | null — matches the SSE payload extension shipped in Plan 14-01 (cmc/api/sse.py) so Plan 14-04 SkillTimeline can label firehose rows"
affects: [14-03 (TopSkills + SkillCostCard panels — consume useSkillUsage/useSkillCost), 14-04 (SkillLatencyTable + SkillTimeline panels — consume useSkillLatency, useSkillRuns, OtelEvent.attrs_skill_name), 14-05 (/skills/$name detail route — consumes all four hooks)]

# Tech tracking
tech-stack:
  added: []  # Pure plumbing — no new dependencies; reuses existing api/queries patterns.
  patterns: [
    "Decimal-as-JSON-string preserved as TS string (NEVER coerce via Number() for display) — single-line in cost_usd field",
    "encodeURIComponent on skill name path param (defense-in-depth even with backend _SKILL_NAME_RE)",
    "Separate SkillRange alias from observability Range (avoids broad-impact bikeshed; SkillRange tightly scoped to skills endpoints)",
    "60s daily-aggregate cadence (60_000 / 45_000) for skill rollups; 30s for runs (matches useSchedules urgency)",
    "qk factory: distinct kebab prefixes ('skill-usage', 'skill-cost', 'skill-latency', 'skill-runs') so analytics keys never collide with the catalog 'skills' key on invalidation",
    "Standalone fetcher exports as thin aliases — satisfies direct-import callers without forcing a refactor of the existing api map",
  ]

key-files:
  created:
    - .planning/phases/14-skills-api-page-panels/14-02-SUMMARY.md
    - .planning/phases/14-skills-api-page-panels/deferred-items.md
  modified:
    - frontend/src/lib/api.ts (SkillRange + 7 interfaces + 4 api.skill* methods + 4 fetchSkill* aliases)
    - frontend/src/lib/queries.ts (4 qk entries + 4 useSkill* hooks + extended type imports)
    - frontend/src/lib/useFirehose.ts (OtelEvent.attrs_skill_name field)
    - frontend/src/lib/__tests__/queries.test.ts (skill-keys uniqueness test + bumped surface-area count to 25)
    - frontend/src/lib/__tests__/useFirehose.test.ts (mock objects updated with attrs_skill_name: null)
    - frontend/src/components/panels/__tests__/OtelPanel.test.tsx (mock objects updated with attrs_skill_name: null — Rule 3 fan-out from OtelEvent shape change)

key-decisions:
  - "D-05 (carried from PLAN): SkillRange is a separate alias from Range, NOT an extension. Tightest types, lowest blast radius — does not perturb every existing Range consumer (heatmap, by-project, tokens, etc.)"
  - "Cadence interpretation: plan specified '60s matches useCache/useLatency'. The 60s daily-aggregate bucket in queries.ts uses 60_000 / 45_000 (useCache, useTokens, useOutcomes). useLatency is actually in the 30s bucket (30_000 / 20_000 — pressure, latency, failures). Locked to 60_000 / 45_000 for the three skill rollups (Usage/Cost/Latency are daily aggregates) and 30_000 / 15_000 for useSkillRuns (recent invocations need fresher data)."
  - "Standalone fetcher exports added (fetchSkillUsage etc.) as thin aliases over the api map. Project pattern uses api.* via the queries layer — but the must_haves spec called out fetchSkill* names. Both surfaces present so direct callers and the queries layer have idiomatic access."

# Metrics
metrics:
  duration_minutes: 11
  completed_date: 2026-05-03
  tasks: 3
  commits: 3
  files_created: 2
  files_modified: 6
---

# Phase 14 Plan 02: Skills API & Hooks (Frontend Plumbing) Summary

Frontend plumbing layer that Wave 3 panels (Plans 03 + 04) and the /skills/$name detail route (Plan 05) consume. Six new TypeScript interfaces mirror the Plan 14-01 backend schemas, four typed fetchers route to the four new endpoints, four hooks at locked cadences expose the data, and one field is added to OtelEvent so SkillTimeline can label firehose rows. Pure plumbing — no UI, no behavioral logic.

## Hook Signatures (for Wave 3 consumers)

```ts
// 60s daily-aggregate cadence (60_000 / 45_000) — matches useCache, useTokens
useSkillUsage(range: SkillRange, limit: number = 10): UseQueryResult<SkillUsageResponse>
useSkillCost(name: string, range: SkillRange):       UseQueryResult<SkillCostResponse>
useSkillLatency(name: string, range: SkillRange):    UseQueryResult<SkillLatencyResponse>

// 30s urgency tier (30_000 / 15_000) — matches useSchedules; recent runs need fresher data
useSkillRuns(name: string, limit: number = 20):      UseQueryResult<SkillRunsResponse>
```

Cadence is encoded HERE per project convention (panels never inline `refetchInterval` — see queries.ts header). To change cadence, change ONE site in queries.ts.

## URL Path Map

| Hook            | URL                                                            | Backend default |
| --------------- | -------------------------------------------------------------- | --------------- |
| useSkillUsage   | `/api/skills/usage?range={range}&limit={limit}`                | range=14d, limit=10 |
| useSkillCost    | `/api/skills/{encoded-name}/cost?range={range}`                | range=14d           |
| useSkillLatency | `/api/skills/{encoded-name}/latency?range={range}`             | range=14d           |
| useSkillRuns    | `/api/skills/{encoded-name}/runs?limit={limit}`                | limit=20            |

## Defense-in-Depth Notes (for downstream panels)

1. **Skill name URL encoding** — every fetcher routes `name` through `encodeURIComponent` even though the backend rejects malformed names via `_SKILL_NAME_RE`. Mitigates T-14-02-01 (Tampering) at the network boundary.
2. **`cost_usd` is `string`, not `number`** — Pydantic v2 serializes `Decimal` as a JSON string to preserve precision. Plan 14-03 panel implementations MUST NOT call `Number(cost_usd)` for display (would silently lose precision on values like `"0.000123456789"`). Render as-is or use a string-aware formatter. T-14-02-03.
3. **`SkillRange` is separate from `Range`** — passing `'1d'` or `'7d'` to `useSkillUsage(range, ...)` is a TypeScript compile error. The narrow alias means a future panel needing `'1d'` for a skills endpoint must extend SkillRange explicitly (D-05).
4. **`low_sample` is server-side authoritative** — `useSkillLatency` returns `low_sample: boolean` directly from the server (`MIN_LATENCY_SAMPLES=30` is the backend constant). Plan 14-04 SkillLatencyTable should render the empty state when `low_sample === true` and re-assert the bool defensively but NEVER hardcode the 30 threshold (matches CacheEfficiencyCard pattern; SKLP-05).

## Confirmation: No Existing Consumers Regressed

- `pnpm tsc --noEmit` — exits 0 (full frontend; no NEW errors introduced).
- `pnpm vitest run src/lib/` — 4 files, 23 tests, all green (queries.test.ts gained 1 new test; useFirehose.test.ts mocks updated to include the new required field).
- `pnpm vitest run src/components/panels/__tests__/OtelPanel.test.tsx` — 1 file, 5 tests, all green (mocks updated to include `attrs_skill_name: null`).
- Existing OtelPanel.tsx + McpPanel.tsx + every component using `Range` / `useCache` / `useLatency` / etc. compiles unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] OtelPanel.test.tsx mocks needed `attrs_skill_name: null`**
- **Found during:** Task 3 (after extending OtelEvent in useFirehose.ts)
- **Issue:** OtelPanel.test.tsx contains 4 mock OtelEvent literals fed into a typed `dispatchOtel` helper. Once `attrs_skill_name: string | null` became required on OtelEvent, all 4 literals failed `tsc --noEmit` with TS2345.
- **Fix:** Added `attrs_skill_name: null` to all 4 mock literals (single `replace_all`).
- **Files modified:** `frontend/src/components/panels/__tests__/OtelPanel.test.tsx`
- **Commit:** a450f56

**2. [Cadence interpretation] Plan said "60s matches useCache/useLatency" — actual buckets resolved on read**
- **Found during:** Task 2
- **Issue:** Plan referenced "useCache/useLatency cadence pattern at line 140-145" but useLatency is actually in the 30s bucket (30_000 / 20_000), not 60s. The plan's intent (daily-aggregate bucket) is unambiguous from context.
- **Fix:** Locked useSkillUsage / useSkillCost / useSkillLatency to 60_000 / 45_000 (matches useCache, useTokens, useOutcomes — true daily-aggregate bucket). useSkillRuns at 30_000 / 15_000 per the plan's explicit instruction.
- **Files modified:** `frontend/src/lib/queries.ts`

**3. [Surface] Standalone fetchSkill* exports added in addition to api.skill* map entries**
- **Found during:** Task 1
- **Issue:** The plan's must_haves spec calls out `fetchSkillUsage(range, limit)` etc. as exported fetchers. The project pattern uses an `api` const map (`api.skillUsage`) consumed by the queries layer. Reading the existing api.ts shows zero standalone `fetch*` exports — the only standalone is `fetchJson`/`fetchVoid` (the apiFetch helper).
- **Fix:** Added BOTH surfaces. `api.skillUsage` is the project-pattern map entry consumed by `queries.ts` hooks. `fetchSkillUsage = api.skillUsage` is exported as a thin alias so direct-import callers and the Plan 14-02 must_haves grep checks both succeed. Functionally identical; zero divergence risk.
- **Files modified:** `frontend/src/lib/api.ts`

### No Threat Flags

The threat surface is identical to Plan 14-01 — only the typed contract changed; no new network endpoints, no new data flows, no new trust boundaries.

## Deferred Items

See `.planning/phases/14-skills-api-page-panels/deferred-items.md`:
- Pre-existing test failure in `SchedulesCard.test.tsx` (stale-row class assertion) — failed at baseline `e8af6b2` before any Plan 14-02 commits; unrelated to skills-API plumbing; deferred per SCOPE BOUNDARY rule.

## Self-Check

**Files claimed modified — verify on disk:**

- `frontend/src/lib/api.ts` — FOUND
- `frontend/src/lib/queries.ts` — FOUND
- `frontend/src/lib/useFirehose.ts` — FOUND
- `frontend/src/lib/__tests__/queries.test.ts` — FOUND
- `frontend/src/lib/__tests__/useFirehose.test.ts` — FOUND
- `frontend/src/components/panels/__tests__/OtelPanel.test.tsx` — FOUND

**Commits claimed — verify in git log:**

- efb9f9b (Task 1) — FOUND
- 9c7ac45 (Task 2) — FOUND
- a450f56 (Task 3) — FOUND

**Surface checks:**

- `grep -c "export type SkillRange" frontend/src/lib/api.ts` → 1
- `grep -cE "export interface Skill(Usage|Cost|Latency|Runs|Sparkline|Run)" frontend/src/lib/api.ts` → 7
- `grep -cE "export const fetchSkill(Usage|Cost|Latency|Runs)" frontend/src/lib/api.ts` → 4
- `grep -cE "export const useSkill(Usage|Cost|Latency|Runs)" frontend/src/lib/queries.ts` → 4
- `grep -cE "skill(Usage|Cost|Latency|Runs):" frontend/src/lib/queries.ts` → 4
- `grep -c "attrs_skill_name" frontend/src/lib/useFirehose.ts` → 1

## Self-Check: PASSED
