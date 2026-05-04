---
phase: 15-alert-engine-ui
plan: 04
subsystem: frontend-lib
tags: [frontend, typescript, tanstack-query, types, hooks, mutations, plumbing, kebab-prefix-qk, surgical-optimism]

# Dependency graph
requires:
  - phase: 15-alert-engine-ui
    plan: 02
    provides: "backend schemas mirrored here verbatim — AlertRule, AlertRuleListResponse, AlertRuleCreate, AlertRulePatch, AlertEvent, AlertEventsResponse, AlertAckRequest; backend AlertRange = '1d'|'7d'|'14d'|'30d' and AlertKind = 'threshold'|'anomaly'"
  - phase: 14-skills-api-page-panels
    plan: 02
    provides: "kebab-prefix qk pattern, dual-surface api.* + fetchX* aliases, narrow Range alias precedent (SkillRange → AlertRange), surgical optimism precedent (usePatchSchedule enabled-only branch)"
provides:
  - "TS types AlertRange = '1d'|'7d'|'14d'|'30d' (full 4-tier per D-01) and AlertKind = 'threshold'|'anomaly'"
  - "7 TypeScript interfaces mirroring backend cmc/api/schemas/alerts.py: AlertRule, AlertRuleListResponse, AlertRuleCreate, AlertRulePatch, AlertEvent, AlertEventsResponse, AlertAckRequest"
  - "6 fetcher entries on the api map: api.alertRules, api.alertRuleCreate, api.alertRulePatch, api.alertRuleDelete, api.alertEvents, api.alertAck (DELETE uses fetchVoid for 204 No Content)"
  - "6 standalone fetcher exports: fetchAlertRules, fetchAlertRuleCreate, fetchAlertRulePatch, fetchAlertRuleDelete, fetchAlertEvents, fetchAlertAck (thin aliases satisfying direct-import callers + must_haves grep)"
  - "2 hooks: useAlertRules() and useAlertEvents(range='7d') — refetchInterval=30_000, staleTime=20_000 (30s tier per RESEARCH.md ALRT-10)"
  - "4 mutations: useCreateAlertRule, usePatchAlertRule (surgical optimism on enabled-only patches), useDeleteAlertRule, useAckAlert"
  - "2 qk factory entries: qk.alertRules() = ['alert-rules'], qk.alertEvents(range) = ['alert-events', range] — kebab-prefixed (Pitfall 5 carried from Phase 14)"
  - "8 new vitest tests in queries.test.ts: alert qk uniqueness, surface-area pin bumped to 31 callable exports, 30s cadence assertion via QueryClient cache, mutation invalidation patterns, surgical optimism (enabled-only optimistic; threshold not)"
affects:
  - 15-05 (/alerts page panels — consumes useAlertRules, useAlertEvents, useCreateAlertRule, usePatchAlertRule, useDeleteAlertRule, useAckAlert)
  - 17 (e2e tests — useAckAlert ships even though Telegram is the primary ack surface, per D-03)

# Tech tracking
tech-stack:
  added: []                                # Pure plumbing — no new dependencies; reuses tanstack/react-query mutation idioms.
  patterns:
    - "Kebab-prefix qk for analytics surfaces (carries Pitfall 5 from Phase 14: never reuse a bare 'alerts' or 'skills' prefix; analytics keys use 'alert-*' / 'skill-*' instead)"
    - "Surgical optimism — only on idempotent single-field transitions (enabled toggle); destructive or server-validated patches stay non-optimistic so 422s preserve typed input"
    - "Dual-surface fetcher exports (api.alertX + fetchAlertX aliases) — direct callers don't reach into the api map; queries layer goes through api.*"
    - "Range narrowing per surface — AlertRange is its own alias (not a Range extension) to prevent broad-impact bikeshed across observability panels (mirrors SkillRange decision from Phase 14 D-05)"
    - "fetchVoid for 204 No Content endpoints (alertRuleDelete) — same pattern used by taskDelete / scheduleDelete"

key-files:
  created:
    - .planning/phases/15-alert-engine-ui/15-04-SUMMARY.md
  modified:
    - frontend/src/lib/api.ts (AlertRange + AlertKind + 7 interfaces + 6 api.alert* methods + 6 fetchAlert* aliases — +136 lines)
    - frontend/src/lib/queries.ts (extended type imports + 2 qk entries + 2 hooks + 4 mutations + cadence-bucket comment update — +98 lines)
    - frontend/src/lib/__tests__/queries.test.ts (alert keys uniqueness test + surface-area bump to 31 + cadence assertions + 5 mutation tests — +311 lines via full rewrite)

key-decisions:
  - "D-01 (carried from PLAN): AlertRange is the full 4-tier '1d'|'7d'|'14d'|'30d' (mirrors backend AlertRange Literal). Alerts events may be queried at all four ranges depending on user context (immediate triage vs. monthly review). Skills analytics narrowed to 14d|30d because <14d gives noisy invocation counts; alerts events have no such constraint."
  - "D-02 (carried from PLAN): usePatchAlertRule is OPTIMISTIC ONLY when body is exactly { enabled: boolean } (idempotent single-field transition; pattern mirrors usePatchSchedule). Threshold patches are NOT optimistic — server may 422 on threshold-without-fire / clear>=fire validation, and the user MUST see the failure with their typed input preserved. useCreateAlertRule and useDeleteAlertRule are also non-optimistic (destructive / validated). useAckAlert is non-optimistic (server returns acked_until; not a useful UI flip without it)."
  - "D-03 (carried from PLAN): useAckAlert ships even though Telegram is the primary ack surface in this phase. Cost is ~10 LOC across api.ts + queries.ts; symmetry + future Phase 17 e2e tests + UI flexibility (a future 'Ack' button on AlertEventsList row) all justify shipping it now."
  - "Cadence interpretation: 30s bucket per RESEARCH.md ALRT-10. Same tier as Pressure/Latency/Failures/SessionsList — alerts are operationally urgent without being a per-second firehose. Locked HERE in queries.ts; panels in Plan 05 must NEVER inline refetchInterval."
  - "qk invalidation prefix selection: useAckAlert invalidates ['alert-events'] (NOT ['alert-rules']) — ack changes alert_state.acked_until which surfaces in event status, not in the rules list. Tested explicitly to prevent future drift."

patterns-established:
  - "Surgical optimism: only when the patch body is exactly one idempotent field. The check `keys.length === 1 && keys[0] === 'enabled' && typeof body.enabled === 'boolean'` rejects { enabled, name } compound patches as well as { enabled: undefined } accidents — both would be unsafe to apply optimistically."
  - "Kebab-prefix qk invariant test pattern: assert `qk.alertRules()[0]` is the literal 'alert-rules' AND not 'alerts'. Same shape as the skill-keys uniqueness test added in Phase 14 Plan 02 — future analytics surfaces should follow this assertion shape."
  - "Cadence assertion in tests: render the hook in a QueryClient harness, then read `entry.observers[0].options.refetchInterval` from the query cache. Encodes the cadence bucket as a hard test assertion, not a comment."

# Metrics
metrics:
  duration_minutes: 7
  completed_date: 2026-05-04
  tasks: 2
  commits: 2
  files_created: 0
  files_modified: 3
---

# Phase 15 Plan 04: Alerts API & Hooks (Frontend Plumbing) Summary

Frontend plumbing layer that the /alerts page (Plan 05) consumes. Seven TypeScript interfaces mirror the Plan 02 backend schemas, six typed fetchers route to the alerts router endpoints, two hooks at the 30s tier expose alerts + events, and four mutations cover full rule CRUD plus ack — with surgical optimism on the enabled toggle only. Zero panel logic; Plan 05 owns rendering.

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-04T13:44:23Z
- **Completed:** 2026-05-04T13:50:48Z
- **Tasks:** 2 (both `auto` + `tdd=true`)
- **Files modified:** 3 (api.ts, queries.ts, queries.test.ts)
- **Commits:** 2 task commits + this metadata commit

## Hook & Mutation Signatures (for Plan 15-05 consumers)

```ts
// 30s tier (30_000 / 20_000) — same as Pressure/Latency/Failures
useAlertRules():                                 UseQueryResult<AlertRuleListResponse>
useAlertEvents(range: AlertRange = '7d'):        UseQueryResult<AlertEventsResponse>

// Mutations
useCreateAlertRule(): UseMutationResult<AlertRule, Error, AlertRuleCreate>
usePatchAlertRule():  UseMutationResult<AlertRule, Error, { id: number; body: AlertRulePatch }>
useDeleteAlertRule(): UseMutationResult<void, Error, number>
useAckAlert():        UseMutationResult<{ ok: true; acked_until: string }, Error, AlertAckRequest>
```

Cadence is encoded HERE per project convention (panels never inline `refetchInterval`). To change cadence, change ONE site in queries.ts.

## URL Path Map

| Hook / Mutation        | Method | URL                                       | Body / Params                           |
| ---------------------- | ------ | ----------------------------------------- | --------------------------------------- |
| useAlertRules          | GET    | /api/alerts/rules?limit=200&offset=0      | —                                       |
| useAlertEvents         | GET    | /api/alerts/events?range=7d               | range: AlertRange                       |
| useCreateAlertRule     | POST   | /api/alerts/rules                         | AlertRuleCreate                         |
| usePatchAlertRule      | PATCH  | /api/alerts/rules/{id}                    | AlertRulePatch                          |
| useDeleteAlertRule     | DELETE | /api/alerts/rules/{id} (204 → fetchVoid)  | —                                       |
| useAckAlert            | POST   | /api/alerts/_ack                          | { rule_id, scope_hash }                 |

## qk Invalidation Map

| Mutation             | Invalidates              | Optimistic?                                              |
| -------------------- | ------------------------ | -------------------------------------------------------- |
| useCreateAlertRule   | ['alert-rules']          | NO (server may 422 on validation)                        |
| usePatchAlertRule    | ['alert-rules']          | YES iff body is exactly `{ enabled: boolean }`           |
| useDeleteAlertRule   | ['alert-rules']          | NO (destructive)                                         |
| useAckAlert          | ['alert-events']         | NO (server returns acked_until)                          |

## Accomplishments

- 7 typed interfaces mirror backend `cmc/api/schemas/alerts.py` field-by-field (AlertRule has all 13 columns + ORM timestamps; AlertRuleCreate / AlertRulePatch separate optional-field shapes; AlertEvent + AlertEventsResponse for events history; AlertAckRequest for the ack body).
- 6 fetchers exposed as both `api.alert*` map entries (idiomatic for the queries layer) and `fetchAlert*` standalone aliases (idiomatic for direct callers + must_haves grep).
- 2 hooks at locked 30s cadence (refetchInterval=30_000, staleTime=20_000) — encoded only in queries.ts.
- 4 mutations with correct invalidation keys; surgical optimism on `usePatchAlertRule` for the enabled-only single-field patch.
- 8 new vitest tests cover: alert qk uniqueness (no bare 'alerts' prefix), surface-area pin bumped to 31 callable exports, hook cadence assertions via QueryClient cache introspection, mutation invalidation patterns (each mutation invalidates the correct prefix), surgical optimism (enabled-only fires; threshold-only does NOT touch the cache mid-flight).

## Task Commits

1. **Task 1: Add AlertRange + 7 interfaces + 6 fetchers (both api.* + standalone) to api.ts** — `46df7d0` (feat)
2. **Task 2: Add qk entries + 2 hooks + 4 mutations to queries.ts + cadence + invalidation tests** — `dd40b3d` (feat)

_Note: Both tasks are TDD-style but the test contract is `pnpm tsc --noEmit` for Task 1 (pure type/fetch additions; types ARE the assertion) and vitest for Task 2 (hooks + mutations + qk are runtime-observable)._

## Files Created/Modified

- `frontend/src/lib/api.ts` — +136 lines: AlertRange + AlertKind + 7 interfaces (~80 lines), 6 api.* entries (~30 lines), 6 fetchAlert* aliases (~14 lines), section comment headers.
- `frontend/src/lib/queries.ts` — +98 lines: 7 type imports added (alphabetic order), 2 qk entries with kebab-prefix comment, 2 hooks at 30s cadence with bucket-header update, 4 mutations (~75 lines including the surgical-optimism block).
- `frontend/src/lib/__tests__/queries.test.ts` — full rewrite (124 → 397 lines): added imports for 6 alert hooks/mutations, helpers (makeClient, makeWrapper, jsonResponse, RULE/RULES_RESPONSE fixtures), 1 alert-qk-uniqueness test, surface-area pin bumped from 25 → 31, 2 cadence-assertion tests, 5 mutation tests (create invalidate, patch optimistic-on-enabled, patch NOT-optimistic-on-threshold, delete invalidate, ack invalidate alert-events not alert-rules).

## Decisions Made

All decisions were planner-locked (D-01, D-02, D-03 from the plan frontmatter); none required executor judgment. See the frontmatter `key-decisions` block above for the rationale on each. The only executor-side decision was test-style:

- **Cadence assertion shape**: chose to read `entry.observers[0].options.refetchInterval` from the QueryClient cache rather than mocking timers. This is type-stable in tanstack-query v4/v5 and survives version bumps better than testing the timer behavior.
- **Mutation test mock layer**: chose `vi.spyOn(globalThis, 'fetch')` over module-mocking the `api` import. Matches the existing `EmergencyStopBanner.test.tsx` pattern in this project — keeps the test exercising the full chain (mutation → api.alertRuleCreate → fetchJson → fetch).

## Deviations from Plan

None — plan executed exactly as written.

Both Task 1 and Task 2 verifications passed on first attempt (no Rule 1/2/3 fixes triggered). The optional Refactor stage was not needed — code matches the precedent set by Phase 14 Plan 02 verbatim. No CLAUDE.md exists in the repo so no project-specific overrides applied.

## Issues Encountered

- **Linter sync mid-edit:** during Task 2 a pre-commit / linter cycle synced the queries.ts file mid-edit and the tooling reported one of my Edits as conflicting with a parallel modification. The qk additions and 30s-bucket-header comment were already applied; the remediation was to re-read and apply the missing edits (section header + alert hooks + mutations). No content was lost.
- **Parallel branch noise:** Plan 15-01 (parallel-safe wave-1 sibling) committed `ad15b58` between my two task commits — backend test additions for the threshold detector. The two plans share zero files (per STATE.md "parallel-safe with Plan 15-01 which only touches `cmc/alerts/`") so this is informational only; the staged-file discipline (only `git add` files in our scope) kept the scopes cleanly separated.

## Threat Surface

No new external surface introduced — all alert endpoints are server-side (Plan 02). The lib layer adds only typed wrappers over `fetchJson` / `fetchVoid`, which inherit the existing `ApiError` propagation. Threat register dispositions from PLAN.md are honored:

- **T-15-04-01 (Tampering, qk typos):** mitigated via the `alertRules()[0]` / `alertEvents('7d')[0]` literal-string assertions in the qk uniqueness test. A typo would fail the test at module-import or assertion time.
- **T-15-04-02 (Information Disclosure, stale alerts):** accepted — 30s cadence + onSettled invalidation keep the cache within a one-tick window.
- **T-15-04-03 (Tampering, optimistic threshold):** mitigated — `usePatchAlertRule` only enters the optimistic branch when `keys.length === 1 && keys[0] === 'enabled' && typeof body.enabled === 'boolean'`. Threshold patches see no cache mutation pre-server-response. The negative-test case (`does NOT apply optimistic update for a threshold-only patch`) asserts the cache is byte-equal to its pre-mutation snapshot during the in-flight window.

## Verification

```bash
$ cd frontend && pnpm tsc --noEmit
(exit 0 — clean)

$ cd frontend && pnpm vitest run lib/__tests__/queries.test.ts
Test Files  1 passed (1)
Tests       15 passed (15)

# Surface assertions
$ grep -c "alertRules\|alertRuleCreate\|alertRulePatch\|alertRuleDelete\|alertEvents\|alertAck" frontend/src/lib/api.ts
12   # ≥12 (6 api.* entries + 6 fetchAlert* aliases) ✓

$ grep -c "AlertRule\|AlertEvent\|AlertAck\|AlertRange\|AlertKind" frontend/src/lib/api.ts
31   # ≥9 (5 type symbols + 4 interfaces sharing prefixes) ✓

$ grep -c "alertRules\|alertEvents\|useAlertRules\|useAlertEvents\|useCreateAlertRule\|usePatchAlertRule\|useDeleteAlertRule\|useAckAlert" frontend/src/lib/queries.ts
20   # ≥12 (2 qk + 2 hooks + 4 mutations × multiple occurrences) ✓

# Pitfall 5 invariant: no bare 'alerts' prefix in qk
$ grep -nE "(['\"]alerts['\"])" frontend/src/lib/queries.ts
102:  // 14-RESEARCH.md: never reuse a bare 'alerts' prefix; each surface gets
# ✓ Only match is inside a comment — no qk key uses bare 'alerts'.

# Wider regression check
$ cd frontend && pnpm vitest run
Test Files  1 failed | 61 passed (62)
Tests       1 failed | 263 passed (264)
# ✓ Only the pre-existing SchedulesCard failure (baseline noise per STATE.md).
```

## Requirements Closed

- **ALRT-09**: User can hit GET/POST/PATCH/DELETE /api/alerts/rules and GET /api/alerts/events?range= → frontend lib surface complete (api.alertRules, api.alertRuleCreate, api.alertRulePatch, api.alertRuleDelete, api.alertEvents). Backend route shipped by Plan 15-02.
- **ALRT-10**: User can navigate to /alerts route with 30s polling → hook cadence locked here (useAlertRules + useAlertEvents @ 30_000/20_000). Page composer shipped by Plan 15-05.

Both requirements track to passing tests in queries.test.ts (qk uniqueness + cadence assertions).

## Next Phase Readiness

Plan 15-05 unblocked — it can now `import { useAlertRules, useAlertEvents, useCreateAlertRule, usePatchAlertRule, useDeleteAlertRule, useAckAlert, qk } from '../lib/queries'` and `import { AlertRange, AlertKind, AlertRule, AlertRuleCreate, AlertRulePatch, AlertEvent, AlertEventsResponse, AlertAckRequest } from '../lib/api'`. Every API contract is locked; panel work in Plan 05 is pure UI.

## Self-Check: PASSED

- frontend/src/lib/api.ts modifications: FOUND (12-token grep ≥12, 31-token type grep ≥9)
- frontend/src/lib/queries.ts modifications: FOUND (20-token grep ≥12)
- frontend/src/lib/__tests__/queries.test.ts: FOUND (15 tests pass; surface-area pin = 31)
- Commit 46df7d0 (Task 1): FOUND in `git log --oneline`
- Commit dd40b3d (Task 2): FOUND in `git log --oneline`
- pnpm tsc --noEmit: exits 0 (clean)
- pnpm vitest run lib/__tests__/queries.test.ts: 15/15 passed
- Pitfall 5 invariant: only comment match for 'alerts' literal — no qk key uses bare prefix

---
*Phase: 15-alert-engine-ui*
*Plan: 04*
*Completed: 2026-05-04*
