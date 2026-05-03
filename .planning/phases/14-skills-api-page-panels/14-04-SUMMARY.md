---
phase: 14-skills-api-page-panels
plan: 04
subsystem: ui

tags: [frontend, react, recharts, tanstack-query, useQueries, useFirehose, panel-rewrite, panel-new, skills-page, server-driven-low-sample, cost-attribution]

# Dependency graph
requires:
  - phase: 14
    provides: "Plan 14-01 (skills router endpoints + SSE attrs_skill_name) + Plan 14-02 (frontend api.ts/queries.ts plumbing — SkillRange + 7 interfaces + 4 fetchers + 4 hooks + qk entries + OtelEvent.attrs_skill_name)"
  - phase: 13
    provides: "pricing module + Decimal-as-JSON-string convention; the cost_usd template-literal display pattern (`$${data.cost_usd}` — never Number-coerce) is a direct consequence of Phase 13's pricing.py choice."
provides:
  - "SkillCostCard reactivated (SKLP-02) — closes v1.0 v2-deferral placeholder; per-skill panel reusable on /skills/$name (Plan 05) and on Skills page via top-1 wrapper (D-07)"
  - "SkillLatencyTable NEW (SKLP-05) — sortable per-skill p50/p95/max table; useQueries fan-out per row; server-driven low_sample badge (no frontend MIN_LATENCY_SAMPLES constant)"
  - "SkillTimeline NEW (SKLP-06) — live skill_activated firehose stream with pause/resume + skill-name filter; useFirehose with BARE event name + camelCase prop (D-06)"
  - "SkillCostCardForTopSkill inline wrapper in routes/skills.tsx — page-level top-1 default that forwards to per-name SkillCostCard (D-07)"
  - "panels/index.ts gains 2 new exports (SkillLatencyTable + SkillTimeline)"
  - "/skills page now renders 3 live skill-analytics panels alongside the existing tasks/schedules/registry/MCP grid"
affects: [14-05, /skills/$name detail route (Plan 05 composes SkillCostCard + SkillLatencyTable per-skill); future Skills detail features]

# Tech tracking
tech-stack:
  added: ["useQueries from @tanstack/react-query (NEW project usage — first per-row dynamic fan-out site)"]
  patterns:
    - "useQueries for dynamic per-row query fan-out where row count varies between renders (Rules of Hooks correctness — replaces the would-be useSkillLatency-in-.map() bug)"
    - "Page-level top-N wrapper component co-located in routes/* — keeps the underlying per-name panel signature clean for shared use across detail routes (D-07 SkillCostCardForTopSkill is the canon for future top-1 patterns)"
    - "Server-driven low_sample badge: panel reads response.low_sample directly; NO frontend min-sample constant (D-04 from Plan 14-01 — server is source of truth, prevents constant drift)"
    - "Decimal-as-JSON-string display via template literal `$${data.cost_usd}` — recharts-internal Number coercion only OK for chart axis (approximate; not a money source)"
    - "BARE event name + camelCase prop for useFirehose: useFirehose({ eventName: 'skill_activated' }) — D-06 / Phase 12 SPIKE.md LOCK-1 (ingest strips claude_code. prefix on write; SSE matches column post-strip)"
    - "Defensive optional-chains on .rows / .trend in panel render so integration mocks (which serve a generic /api/skills shape) never crash the page"

key-files:
  created:
    - "frontend/src/components/panels/SkillLatencyTable.tsx (185 lines — sortable DataTable + useQueries fan-out + server low_sample badge)"
    - "frontend/src/components/panels/__tests__/SkillLatencyTable.test.tsx (5 tests covering 3-row render, low_sample isolation, default p95 desc sort, sort-direction toggle, empty state)"
    - "frontend/src/components/panels/SkillTimeline.tsx (132 lines — useFirehose live stream + pause/filter)"
    - "frontend/src/components/panels/__tests__/SkillTimeline.test.tsx (5 tests covering bare-eventName subscribe, filter narrows, pause flips enabled, status pill, '—' fallback)"
  modified:
    - "frontend/src/components/panels/SkillCostCard.tsx (108 lines — full rewrite: v2 EmptyState placeholder → real per-skill cost panel with cost_usd-as-string + 3 token tiles + 14d sparkline + rates_as_of caption + cost_attribution caption)"
    - "frontend/src/components/panels/__tests__/SkillCostCard.test.tsx (5 tests covering string-not-float regression, rates_as_of, empty trend, range toggle, attribution caption)"
    - "frontend/src/components/panels/index.ts (+2 exports: SkillLatencyTable + SkillTimeline)"
    - "frontend/src/routes/skills.tsx (SkillCostCardForTopSkill inline wrapper + 2 new panels in card grid + updated layout-comment block)"

key-decisions:
  - "D-06 enforced at runtime: SkillTimeline subscribes to the BARE event name 'skill_activated' (NOT 'claude_code.skill_activated' from the OTLP wire form) using the camelCase prop `eventName`. The ingest layer strips the 'claude_code.' prefix on write per Phase 12 SPIKE.md LOCK-1; SSE filter at /api/firehose?event_name=… matches the column post-strip. Test asserts via spying on the mock useFirehose call args."
  - "D-07 enforced at routes/skills.tsx: SkillCostCardForTopSkill inline wrapper reads top-1 from useSkillUsage('14d', 1) and forwards skill_name to per-name SkillCostCard. The per-name SkillCostCard signature stays clean ({ name }: { name: string }) for /skills/$name (Plan 05). SKLP-02 traceability runs through BOTH the per-name panel and this wrapper."
  - "useQueries (not useSkillLatency in .map()) for per-row latency fan-out — Rules of Hooks correctness. data.rows.length varies between renders (undefined → 0 → N → re-fetch → toggled-N) so calling a hook inside .map() would throw 'Rendered more hooks than during the previous render'. useQueries accepts a single array argument and keeps the React-internal hook count constant at one. This is a hard correctness gate, not a style preference."
  - "Server-driven low_sample badge per D-04 from Plan 14-01: SkillLatencyTable reads response.low_sample directly. NO MIN_LATENCY_SAMPLES constant on the frontend. Prevents constant drift if backend ever retunes the threshold."
  - "Decimal-as-JSON-string display lock per Plan 14-02 D-02 / Pitfall 5: SkillCostCard renders cost_usd as `$${data.cost_usd}` (template literal, never Number-coerce). Chart axis Number coercion is acceptable because recharts approximates anyway and it's not a money source-of-truth. Test asserts the exact string '$1.234' when mocked cost_usd is the string '1.234'."
  - "cost_attribution caption surfaces the backend's dual-path JOIN result so the operator sees whether per-request attribution succeeded ('request') or fell back to session-scoped ('session'). Visible debug for D-02 from Plan 14-01."
  - "Per-row latency queries inside useQueries reuse qk.skillLatency keys + match the locked 60s/45s cadence from lib/queries.ts — keeps cache coherent with any /skills/$name detail route that also calls useSkillLatency directly."

patterns-established:
  - "useQueries dynamic fan-out: when a panel needs N independent queries with N varying between renders, build the queries array via `data?.rows?.map(...)` (DEFENSIVE optional-chain on .rows) and pass to useQueries — this is the first such site in the codebase; future panels with similar per-row fetch needs should mirror SkillLatencyTable.tsx."
  - "Page-level top-N wrapper colocated in routes/*: when a generic per-name panel needs a top-1 default for a non-detail page, define a small inline wrapper in the route file (SkillCostCardForTopSkill) — keeps the underlying panel reusable across both top-1 and per-name contexts without prop bloat."
  - "Defensive optional-chain on response shapes: `data?.rows?.[0]` and `!d.trend || d.trend.length === 0` patterns guard against integration-mock shape mismatches. Production response shape is the source of truth, but defensive chains prevent the page-level wrapper from crashing the ErrorBoundary on alternate shapes."

# Metrics
duration: ~11 min
completed: 2026-05-03
---

# Phase 14 Plan 04: Skills API & Page Panels — SkillCostCard reactivation (SKLP-02) + SkillLatencyTable NEW (SKLP-05) + SkillTimeline NEW (SKLP-06) + Skills-page wiring Summary

**3 Skills-page panels — SkillCostCard reactivated with per-skill cost + 14d sparkline + Decimal-as-string display, SkillLatencyTable NEW with useQueries fan-out + server-driven low_sample badge, SkillTimeline NEW with BARE-eventName useFirehose stream + pause/filter — all wired into routes/skills.tsx via the SkillCostCardForTopSkill top-1 wrapper.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-05-03T22:26:14Z
- **Completed:** 2026-05-03T22:37:00Z
- **Tasks:** 3
- **Files modified:** 7 (4 new — 2 panels + 2 tests; 3 modified — SkillCostCard rewrite + index.ts + skills.tsx); SkillCostCard.test.tsx fully replaced

## Accomplishments

- **SKLP-02 reactivated** — SkillCostCard.tsx body fully rewritten from v2 EmptyState placeholder to a real per-skill cost panel: cost_usd as Decimal-string display, 3 token KpiTiles (input / output / cache-aggregate), 14-day Recharts cost-trend sparkline, "Rates as of YYYY-MM-DD" caption, and "Attribution: {request|session}" caption (D-02 dual-path branch surfaced to operator).
- **SKLP-05 NEW** — SkillLatencyTable: sortable DataTable with skill_name / sample_count / p50 / p95 (default desc) / max / error_rate columns; per-row latency fetched via useQueries fan-out (NOT useSkillLatency-in-.map() — Rules of Hooks correctness); Badge variant="warning" "Low sample" rendered ONLY where response.low_sample === true (server-driven, no frontend MIN_LATENCY_SAMPLES constant).
- **SKLP-06 NEW** — SkillTimeline: useFirehose({ eventName: 'skill_activated', enabled: !paused }) — BARE event name + camelCase prop per D-06. Pause/resume button toggles enabled, skill-name filter input narrows by attrs_skill_name, newest events at top, StatePill mirrors firehose status, '—' fallback when attrs_skill_name is null.
- **Skills page wired** — routes/skills.tsx adds SkillCostCardForTopSkill (D-07 inline wrapper that picks top-1 from useSkillUsage('14d', 1) and forwards to SkillCostCard) + SkillLatencyTable + SkillTimeline; layout-comment block updated.
- **panels/index.ts barrel** — 2 new exports added; existing entries preserved.
- **15 new vitest tests** (5 per panel) all green; full frontend suite 251/252 (sole failure is pre-existing SchedulesCard staleness test, documented in deferred-items.md from Plan 14-02).

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite SkillCostCard.tsx + tests for SKLP-02 reactivation** — `54f13e6` (feat)
2. **Task 2: Create SkillLatencyTable.tsx + tests (SKLP-05 NEW)** — `d35b81d` (feat)
3. **Task 3: Create SkillTimeline.tsx + tests + wire skills.tsx + index.ts (SKLP-06 NEW)** — `bcf3573` (feat)

**Plan metadata:** TBD (final docs commit at end)

## Files Created/Modified

### Created (4)
- `frontend/src/components/panels/SkillLatencyTable.tsx` — Sortable per-skill latency table with useQueries fan-out + server-driven low_sample badge (185 lines).
- `frontend/src/components/panels/__tests__/SkillLatencyTable.test.tsx` — 5 vitest tests (3-row render, low_sample badge isolation, default p95 desc sort, sort-direction toggle on header click, empty state).
- `frontend/src/components/panels/SkillTimeline.tsx` — Live skill_activated firehose stream cloned from OtelPanel structure; pause/resume + skill-name filter (132 lines).
- `frontend/src/components/panels/__tests__/SkillTimeline.test.tsx` — 5 vitest tests (BARE-eventName + render-all, filter narrows, pause flips enabled, status pill open/connecting, '—' fallback when null).

### Modified (3)
- `frontend/src/components/panels/SkillCostCard.tsx` — Full body rewrite: v2 EmptyState placeholder → real per-skill cost panel (108 lines).
- `frontend/src/components/panels/__tests__/SkillCostCard.test.tsx` — Full body rewrite: v2-placeholder assertions → 5 real-data assertions.
- `frontend/src/components/panels/index.ts` — Added 2 exports for SkillLatencyTable + SkillTimeline; existing entries preserved.
- `frontend/src/routes/skills.tsx` — Added SkillCostCardForTopSkill inline wrapper (D-07) + 2 new panels in card grid + useSkillUsage import + updated layout-comment block.

## Decisions Made

See `key-decisions` in frontmatter — 7 decisions including BARE-eventName lockdown (D-06), top-1 wrapper pattern (D-07), useQueries-not-hook-in-map enforcement (Rules of Hooks correctness), server-driven low_sample badge (D-04 from Plan 14-01), Decimal-as-JSON-string display (D-02 from Plan 14-02), cost_attribution surfaced as caption, and per-row useQueries cadence parity with the central queries.ts cadence policy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Patched routes/skills.tsx call site in Task 1 to keep tsc green between tasks**
- **Found during:** Task 1 commit (pre-commit hook frontend-quality / tsc gate)
- **Issue:** SkillCostCard signature changed from `()` to `({ name }: { name: string })` in Task 1, but the call site `<SkillCostCard />` in routes/skills.tsx becomes a TS2741 error because Task 3 owns the proper SkillCostCardForTopSkill wrapper. Pre-commit hook blocked the Task 1 commit.
- **Fix:** Added a temporary `<SkillCostCard name="(none)" />` with an inline TODO comment that Task 3 will swap to the wrapper. Plan-author intended Task 3 to resolve this, but the pre-commit hook makes per-task tsc green a hard gate.
- **Files modified:** frontend/src/routes/skills.tsx (1 line + 1 comment)
- **Verification:** pnpm tsc --noEmit clean; Task 3 commit (bcf3573) replaces the placeholder with the proper SkillCostCardForTopSkill wrapper.
- **Committed in:** 54f13e6 (Task 1 commit)

**2. [Rule 3 - Blocking] Defensive optional-chain on usage.data?.rows in SkillCostCardForTopSkill + SkillLatencyTable + empty.when**
- **Found during:** Task 3 full vitest run (after wiring routes/skills.tsx)
- **Issue:** Integration tests (`src/__tests__/integration.test.tsx`) mock `/api/skills` with `{ items: [] }`, but `useSkillUsage` typing expects `{ rows: [...] }`. The wrapper `usage.data?.rows[0]` and SkillLatencyTable's `data?.rows.map(...)` crash with "Cannot read properties of undefined" because data exists but has the wrong shape.
- **Fix:** Added defensive optional-chain everywhere a `.rows` or `.trend` access could hit a non-conformant mock shape: `usage.data?.rows?.[0]?.skill_name`, `usageQuery.data?.rows?.map(...)`, `(d) => !d.rows || d.rows.length === 0` (SkillLatencyTable empty.when), `(d) => !d.trend || d.trend.length === 0` (SkillCostCard empty.when). Production response shape is still the source of truth, but the wrapper now never crashes the ErrorBoundary on alternate shapes.
- **Files modified:** frontend/src/routes/skills.tsx, frontend/src/components/panels/SkillLatencyTable.tsx, frontend/src/components/panels/SkillCostCard.tsx
- **Verification:** Full `pnpm vitest run` — 251/252 pass (sole failure is the pre-existing SchedulesCard test, documented in deferred-items.md from Plan 14-02 — unrelated, out of scope per SCOPE BOUNDARY).
- **Committed in:** bcf3573 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 3 - Blocking)
**Impact on plan:** Both auto-fixes essential to satisfy the pre-commit tsc gate (Task 1 fix) and to keep the integration test suite green (Task 3 fix). No scope creep — both stay within the declared `files_modified` set. The Task 1 patch was a transient state explicitly resolved in Task 3.

## Issues Encountered

- **Pre-commit hook tsc gate** — the project's pre-commit hook runs `pnpm tsc --noEmit` and refuses to commit on any TS error. This makes per-task tsc green a hard gate (not just per-plan). Task 1 introduced a SkillCostCard signature change that Task 3 was planned to resolve at the routes/skills.tsx call site; the gate forced an inline temp-fix in Task 1 (deviation #1 above).
- **Integration test mock shape mismatch** — `src/__tests__/integration.test.tsx` mocks `/api/skills` with `{ items: [] }` (the catalog shape) but `useSkillUsage` expects `{ rows: [...] }` (the usage-analytics shape). Rather than retrofit the integration mock with a separate `/api/skills/usage` branch (which would belong to Plan 14-02 / Plan 14-03 territory), I added defensive optional-chains to the panels (deviation #2 above) — same effect, narrower blast radius.
- **TopSkills.tsx unstaged Plan 14-03 work** — Plan 14-03 was executing in parallel and had TopSkills.tsx + integration.test.tsx + TopSkills.test.tsx in modified-but-unstaged state during my Task 1+2 commits. Pre-commit hook auto-stashed my unstaged Plan-14-03 work and restored after each commit (normal pre-commit behavior). My commits stayed within the declared files_modified set.

## TDD Gate Compliance

This plan ran TDD per the `tdd="true"` task attribute. Each task followed RED → GREEN. Per-task gate evidence:

- **Task 1:** RED — wrote SkillCostCard.test.tsx with 5 failing tests (5/5 fail because old `SkillCostCard()` signature doesn't accept `name` prop); GREEN — rewrote SkillCostCard.tsx with new `({ name })` signature, all 5 tests pass.
- **Task 2:** RED — wrote SkillLatencyTable.test.tsx (module-not-found error confirms RED); GREEN — wrote SkillLatencyTable.tsx, all 5 tests pass.
- **Task 3:** RED — wrote SkillTimeline.test.tsx (module-not-found), GREEN — wrote SkillTimeline.tsx, all 5 tests pass.

NOTE: TDD commits in this plan are squashed into a single per-task commit (RED + GREEN combined) rather than 2 commits per task. This matches the existing project convention from Phases 13/14-01/14-02 where the executor committed feat() commits with both test+impl together. The RED gate evidence is preserved in this SUMMARY's verification trace; if a future audit needs strict RED/GREEN gate-commit separation, this plan can be retroactively split via `git rebase -i`.

## Verification Trace

```
=== eventName: 'skill_activated' BARE check ===  → 1 (≥1 required)
=== MIN_LATENCY_SAMPLES (must be 0) ===          → 0 (correct)
=== "Coming in v2" (must be 0) ===               → 0 (correct)
=== panels/index.ts exports (≥2 required) ===    → 2
=== routes/skills.tsx wiring (≥4 required) ===   → 6
=== useQueries in SkillLatencyTable ===          → 6 (≥1 required)
=== cost_attribution in SkillCostCard ===        → 3 (≥1 required)

pnpm tsc --noEmit                  → 0 errors (clean)
pnpm vitest run                    → 251/252 pass (sole failure pre-existing in SchedulesCard, deferred-items.md)
pnpm vitest SkillCostCard          → 5/5 green
pnpm vitest SkillLatencyTable      → 5/5 green
pnpm vitest SkillTimeline          → 5/5 green
pnpm vitest integration.test.tsx   → 7/7 green
```

## User Setup Required

None — no external service configuration required. The 3 panels consume backend endpoints already shipped in Plan 14-01 (`/api/skills/usage`, `/api/skills/{name}/cost`, `/api/skills/{name}/latency`) and the SSE attrs_skill_name field also from Plan 14-01.

## Next Phase Readiness

- **Plan 14-05 (skills.$name file-based dynamic route — SKLP-07) is unblocked.** All 3 panels SkillCostCard / SkillLatencyTable / SkillTimeline are now stable templates the per-skill detail route can compose. The SkillCostCard signature `({ name }: { name: string })` is production-ready for `<SkillCostCard name={params.name}/>` in /skills/$name. The useQueries fan-out pattern in SkillLatencyTable is the canon for any future per-row analytics panel.
- **Server-driven low_sample badge pattern is locked.** Plan 05 must NOT re-add a frontend MIN_LATENCY_SAMPLES constant — the badge data flows server → response.low_sample → panel render with no frontend duplication.
- **BARE event name + camelCase prop pattern for useFirehose** is now exercised twice in production (OtelPanel reads bare event_name from the column; SkillTimeline subscribes with bare 'skill_activated'). Future SSE-consumer panels should follow the same shape.
- **No blockers.** Phase 14 is at 4/5 plans complete (after this plan); Plan 05 is the final piece.

## Self-Check: PASSED

All 9 declared file artifacts exist on disk; all 3 task commits exist in git history (54f13e6, d35b81d, bcf3573).

---
*Phase: 14-skills-api-page-panels*
*Completed: 2026-05-03*
