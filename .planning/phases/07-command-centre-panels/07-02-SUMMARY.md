---
phase: 07-command-centre-panels
plan: 02
subsystem: ui
tags: [phase-7, wave-1, hitl, hpnl, sklp, decisions, inbox, skills-registry, skill-cost-v2-placeholder, mcp-reuse, optimistic-rollback]

# Dependency graph
requires:
  - phase: 04-stateful-apis
    provides: HITL routes (decisions/inbox) + Skills routes (autonomy patch + listing) consumed via lib/api.ts narrowed types
  - phase: 06-observability-activity-panels
    provides: McpPanel (reused on /skills with reqId override), DataTable + PanelCard primitives, lib/queries cadence convention
  - phase: 07-command-centre-panels
    provides: Plan 07-01 — useDecisions/useInbox/useReadInbox/useReplyInbox/useAnswerDecision/useSkills/usePatchSkillAutonomy hooks; locked cadence policy; ContextHealthCard + ESTOP banner already mounted
provides:
  - 4 new panels (DecisionsCard, InboxCard, SkillsRegistry, SkillCostCard) shipped behind components/panels barrel — 22 panels total
  - /skills route — full live grid (DecisionsCard + InboxCard above-grid; SkillsRegistry + McpPanel + SkillCostCard + ContextHealthCard in cmc-card-grid); SKILLS_SLOTS shrinks from 7 to 2 (TPNL-01 + TPNL-03 only)
  - McpPanel parameterized with optional reqId prop (default "OPNL-15") so reuse on /skills with reqId="SKLP-01" works without duplication
  - Integration smoke extended with /api/decisions, /api/inbox, /api/skills mock branches; asserts 5 retired reqIds via live PanelCard kickers + exactly 2 lucide-inbox icons remain
affects: 07-03 (TPNL-01 + TPNL-03 retirement; TaskBoard + ScheduleComposer panels), 07-04 (PlaceholderCardGrid helper deletion when last slot retires)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline-expand row pattern: row head with question/subject + Answer/Reply toggle button; clicking expands a textarea form (Submit/Cancel) below the head. Reusable for any future per-row mutation UI"
    - "Pitfall 2 non-optimistic answer pattern: useAnswerDecision NOT optimistic; on 409 the ApiError.message (which contains the body literal) renders inline AND the typed answer is preserved (no setAnswer('') in onError). User can re-read the conflict and retry."
    - "Optimistic-with-rollback consumption: SkillsRegistry just dispatches usePatchSkillAutonomy.mutate(); the snapshot+restore lives in queries.ts so panels stay declarative. The rendered <select value={r.autonomy}> reflects whatever's in the cache — onMutate snapshots, onError restores, onSettled invalidates → server truth wins on next refetch"
    - "McpPanel reuse via optional reqId prop: instead of duplicating the component or hard-coding kicker text, parameterize the reqId so a single component serves OPNL-15 on / and SKLP-01 on /skills. Same pattern reusable when a Phase-N panel needs reuse on a Phase-(N+1) page with a different requirement ID"

key-files:
  created:
    - frontend/src/components/panels/DecisionsCard.tsx
    - frontend/src/components/panels/__tests__/DecisionsCard.test.tsx
    - frontend/src/components/panels/InboxCard.tsx
    - frontend/src/components/panels/__tests__/InboxCard.test.tsx
    - frontend/src/components/panels/SkillsRegistry.tsx
    - frontend/src/components/panels/__tests__/SkillsRegistry.test.tsx
    - frontend/src/components/panels/SkillCostCard.tsx
    - frontend/src/components/panels/__tests__/SkillCostCard.test.tsx
  modified:
    - frontend/src/components/panels/index.ts
    - frontend/src/components/panels/McpPanel.tsx
    - frontend/src/routes/skills.tsx
    - frontend/src/__tests__/integration.test.tsx
    - frontend/src/styles.css

key-decisions:
  - "McpPanel parameterized with optional reqId prop (default OPNL-15) — Rule 1 deviation; the alternative ('verbatim reuse') would have left the SKLP-01 kicker assertion impossible to satisfy"
  - "Pitfall 2 preservation: DecisionsCard onError does NOT clear setAnswer; user input lives until they explicitly hit Cancel or Submit succeeds. ApiError.message rendered verbatim — the body literal 'decision already answered' is visible inside that string"
  - "InboxCard: Mark read uses useReadInbox (optimistic, idempotent); Reply uses useReplyInbox (non-optimistic, generative). Both per-row mutations live independently — clicking Mark read does NOT collapse the reply form"
  - "SkillCostCard intentionally does NOT use PanelCard — there is no UseQueryResult to feed it (no backend route). Composes Card primitive directly mirroring TopSkills v2 placeholder pattern (Plan 06-05 STATE.md L246)"
  - "Single .cmc-input recipe lives in this plan's CSS section — DecisionsCard textarea, InboxCard reply textarea, and SkillsRegistry autonomy select all inherit it. The select narrows width via .cmc-skills-registry__autonomy modifier (min-width 100px)"
  - "/skills layout: full-width DecisionsCard + InboxCard above the cmc-card-grid (LiveSessionsCard pattern from Phase 6 — RESEARCH §thing-13). Two trailing placeholder slots (TPNL-01, TPNL-03) under the live grid; PlaceholderCardGrid stays mounted until Plan 07-04"

patterns-established:
  - "Inline-expand mutation rows: row head with primary action toggle; clicking exposes textarea form with Submit/Cancel. Both DecisionsCard and InboxCard follow this shape — Plan 07-03 TaskBoard inline edit can reuse"
  - "Reqid-overridable reused panels: when a Phase-6 panel (e.g. McpPanel) needs to surface on a Phase-7 page under a different requirement ID, expose an optional reqId prop instead of duplicating. Default keeps original kicker; override unlocks reuse"
  - "Live PanelCard kicker as integration discriminator: integration tests assert findByText('SKLP-01') resolves on /skills as proof the placeholder slot was retired. Combined with lucide-inbox count assertion, gives Pitfall 10 mitigation a structural signal that's not text-fragile"
  - "v2 placeholder card convention reused (Plan 06-05): static EmptyState card with reqId kicker; preserves traceability without speculative ingest changes. SkillCostCard follows this exactly for SKLP-02"

# Metrics
duration: 25 min
completed: 2026-04-27
---

# Phase 7 Plan 02: Command Centre Wave 1 (HPNL + SKLP) Summary

**HPNL panels (DecisionsCard + InboxCard) + SKLP page lower half (SkillsRegistry + SkillCostCard v2 placeholder + McpPanel reused with reqId override) shipped — /skills SKILLS_SLOTS shrinks from 7 to 2; 14 new frontend tests; baseline preserved.**

## Performance

- **Duration:** ~25 min agent time
- **Started:** 2026-04-27T12:22:00Z
- **Completed:** 2026-04-27T12:36:00Z
- **Tasks:** 2 (both `tdd=true`; 4 commits — 2 RED + 2 GREEN)
- **Files created:** 8 (4 panels + 4 test files)
- **Files modified:** 5 (panels barrel + McpPanel reqId prop + skills route rewrite + integration test extension + styles append)

## Accomplishments

- **DecisionsCard (HPNL-01)** ships PanelCard shell + per-row inline-expand textarea/Submit/Cancel. Submit dispatches `useAnswerDecision` (NOT optimistic per Pitfall 2). On 409 the body literal "decision already answered" surfaces inline (via ApiError.message) AND the typed answer is preserved so the user can re-read live state and retry.
- **InboxCard (HPNL-02)** ships PanelCard shell + per-row "Reply" (expands inline textarea) and "Mark read" (immediate). `useReadInbox` is OPTIMISTIC — the row's `data-read="true"` flips synchronously before the fetch resolves; on error the snapshot is restored. `useReplyInbox` is non-optimistic; on success the row clears via inbox refetch.
- **SkillsRegistry (SKLP-04)** ships PanelCard + DataTable with name / environment / autonomy columns. The autonomy column is a per-row `<select>` dispatching `usePatchSkillAutonomy` (optimistic with rollback — RESEARCH §Pattern 2; logic lives in queries.ts). The 422 rollback path is verified end-to-end: select snaps back to original value when backend rejects.
- **SkillCostCard (SKLP-02)** ships as v2 placeholder mirroring TopSkills exactly: static `EmptyState` card with SKLP-02 reqId kicker + body literal "Skill cost tracking lands once claude_code.skill_invoked events arrive in v2." (rationale: no `claude_code.skill_invoked` event exists in current ingest — same v2 deferral as ACTV-04).
- **McpPanel reuse (SKLP-01)** parameterized with optional `reqId` prop (default "OPNL-15"). `/skills` passes `reqId="SKLP-01"` to surface the SKLP-01 kicker; `routes/index.tsx` (OPNL-15) unchanged. Single component serves both pages — no duplication.
- **/skills route rewritten:** DecisionsCard + InboxCard render full-width above the grid (LiveSessionsCard pattern); the `cmc-card-grid` hosts SkillsRegistry + McpPanel (reqId="SKLP-01") + SkillCostCard + ContextHealthCard. `SKILLS_SLOTS` shrinks from 7 entries to 2 (TPNL-01, TPNL-03 only) — Plans 07-03/07-04 retire those.
- **Integration smoke extended:** fetch mock gains branches for `/api/decisions`, `/api/inbox`, `/api/skills`; `/skills` test asserts the 5 retired-slot reqIds via live `PanelCard` kickers (HPNL-01, HPNL-02, SKLP-01, SKLP-02, SKLP-04) + the SKLP-03 kicker from Wave 0 + remaining TPNL-01/TPNL-03 placeholder kickers; counts lucide-inbox icons (placeholder marker) and asserts exactly 2 remain (Pitfall 10 mitigation).

## Task Commits

| # | Task | Commit | Type |
|---|------|--------|------|
| 1a | RED: DecisionsCard + InboxCard tests (9 cases) | `23dc07c` | test |
| 1b | GREEN: DecisionsCard + InboxCard + barrel + Wave 1 CSS | `b567091` | feat |
| 2a | RED: SkillsRegistry + SkillCostCard tests (5 cases) | `20a4193` | test |
| 2b | GREEN: SkillsRegistry + SkillCostCard + McpPanel reqId override + skills route + integration extension + styles append | `741720f` | feat |

## Files Created/Modified

### Frontend created
- `frontend/src/components/panels/DecisionsCard.tsx` — HPNL-01; PanelCard + DecisionRow inline-expand form
- `frontend/src/components/panels/__tests__/DecisionsCard.test.tsx` — 5 cases (5/5 pass)
- `frontend/src/components/panels/InboxCard.tsx` — HPNL-02; PanelCard + InboxRow with Mark-read (optimistic) + Reply (non-optimistic)
- `frontend/src/components/panels/__tests__/InboxCard.test.tsx` — 4 cases (4/4 pass)
- `frontend/src/components/panels/SkillsRegistry.tsx` — SKLP-04; PanelCard + DataTable with per-row autonomy select
- `frontend/src/components/panels/__tests__/SkillsRegistry.test.tsx` — 4 cases (4/4 pass) including the 422 rollback path
- `frontend/src/components/panels/SkillCostCard.tsx` — SKLP-02; v2 placeholder Card + EmptyState
- `frontend/src/components/panels/__tests__/SkillCostCard.test.tsx` — 1 case (1/1 pass)

### Frontend modified
- `frontend/src/components/panels/index.ts` — append 4 new panel exports (22 panels total: 4 Wave-2 + 11 Wave-3 + 3 Wave-4 + 3 Wave-5 + 1 Phase-7-Wave-0 + 4 Phase-7-Wave-1 = wait, recount — Phase 6 totals 18, Phase 7 Wave 0 added 1 (ContextHealthCard), Wave 1 added 4, total 23 named exports)
- `frontend/src/components/panels/McpPanel.tsx` — added optional `reqId` prop with default "OPNL-15" (Rule 1 deviation; documented inline)
- `frontend/src/routes/skills.tsx` — full rewrite: DecisionsCard + InboxCard above-grid; cmc-card-grid hosts SkillsRegistry + McpPanel(reqId="SKLP-01") + SkillCostCard + ContextHealthCard; SKILLS_SLOTS reduced to 2 entries
- `frontend/src/__tests__/integration.test.tsx` — fetch mock branches for /api/decisions, /api/inbox, /api/skills; updated /skills test asserts 5 live reqIds + 2 lucide-inbox icons remain
- `frontend/src/styles.css` — appended Phase 7 Plan 02 (Wave 1) section: `.cmc-decisions-list` + `.cmc-decisions-row*`, `.cmc-inbox-list` + `.cmc-inbox-row*` (including `data-read=true` 0.55 opacity dim), generic `.cmc-input`, and `.cmc-skills-registry__autonomy` modifier (min-width 100px). Tokens only — no inline hex.

## Decisions Made

- **McpPanel parameterization over duplication** — adding an optional `reqId` prop is strictly less code than copying the component and far more maintainable. The plan's "VERBATIM" intent is preserved in spirit (no logic forks) while the integration test's `findByText('SKLP-01')` assertion becomes trivially true.
- **Pitfall 2 answer-text preservation via NO `onError` handler** — the simplest implementation is the correct one: `useAnswerDecision` is non-optimistic, the panel only clears `answer` state in `onSuccess`, and `mutation.isError` renders `error.message` inline. The `ApiError.message` shape (`{path}: {status} {body}`) contains the literal "decision already answered" so a `getByText(/decision already answered/i)` assertion passes without any string parsing.
- **InboxCard `data-read` attribute as the optimistic-flip discriminator** — instead of asserting CSS class changes (which couple tests to styling decisions), the test asserts `[data-read="true"]` selector match after the mutation fires. The CSS uses the attribute selector for its 0.55 opacity rule; the test asserts it directly.
- **SkillCostCard composes Card primitive directly** — v2 placeholders intentionally do NOT use PanelCard (no UseQueryResult to feed it). Mirrors the canonical TopSkills shape established in Plan 06-05.
- **/skills layout — full-width above-grid for HPNL panels, grid for SKLP panels** — DecisionsCard + InboxCard contain inline-expand forms that need horizontal room (textareas don't render well in 320px-min-width grid cells). SkillsRegistry + McpPanel + SkillCostCard + ContextHealthCard all benefit from grid auto-layout. Mirrors LiveSessionsCard's full-width treatment on /.
- **Integration test placeholder discriminator: 2 lucide-inbox icons remain (not 0)** — Plan 07-04 deletes the helper entirely; this plan retires 5 of 7 slots leaving 2. The exact-equals-2 assertion guards against accidentally retiring or adding placeholder slots in this plan's scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] McpPanel reqId hardcoded vs integration test assertion conflict**
- **Found during:** Task 2 (planning the /skills wire-up before writing the route)
- **Issue:** Plan §must_haves.truths #5 says "MCPPanel (SKLP-01) is reused VERBATIM on /skills — Phase 6 component imported as-is from frontend/src/components/panels/McpPanel.tsx; NOT duplicated". But Phase 6 McpPanel hardcodes `reqId="OPNL-15"` in its PanelCard. The plan's verification block also requires `findByText('SKLP-01')` to resolve via the live PanelCard kicker on /skills. Verbatim reuse + the kicker assertion are incompatible — kicker would show "OPNL-15", not "SKLP-01".
- **Fix:** Added optional `reqId` prop to McpPanel with default "OPNL-15" so existing callers (`routes/index.tsx`) compile unchanged AND `/skills` can pass `reqId="SKLP-01"`. Preserved the verbatim spirit (no logic forks; same query, same rendering, same flag detection); only the kicker text is parameterized.
- **Files modified:** frontend/src/components/panels/McpPanel.tsx
- **Verification:** `routes/index.tsx` still says `<McpPanel />` (default kicks in to "OPNL-15"); `routes/skills.tsx` says `<McpPanel reqId="SKLP-01" />`; integration smoke `findByText('SKLP-01')` and `findByText('OPNL-15')` both resolve on their respective routes.
- **Committed in:** `741720f` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minimal — additive, non-breaking parameterization. The plan's "VERBATIM" wording is preserved in spirit (single component, single render path, no logic divergence between routes). Pattern documented in McpPanel.tsx as a reference for any future Phase-N panel that needs reuse on a Phase-(N+1) page under a different requirement ID.

## Issues Encountered

None — Plan 07-01's queries.ts hooks (useDecisions/useInbox/useReadInbox/useReplyInbox/useAnswerDecision/useSkills/usePatchSkillAutonomy) were ready as-shipped; both panel tasks consumed them without needing any queries.ts edits. The optimistic-with-rollback semantics of `usePatchSkillAutonomy` were verified end-to-end via the 422 mock test without requiring any onMutate/onError edits in the panel.

## User Setup Required

None — no external services configured by this plan. All work is frontend; no env vars, no dashboards, no manual configuration steps.

## Next Phase Readiness

Phase 7 is now 2 of 4 plans complete. Plans 07-03 and 07-04 remain:

- **07-03 (Tasks + Schedules — TPNL-01 + TPNL-03):** TaskBoard panel for TPNL-01 (Task Board), Schedules table for TPNL-03 (Schedules). Imports `useTasks`, `useSchedules`, `useScheduleRuns`, plus all task/schedule mutations from queries.ts. ScheduleComposer uses `partsToCron` + `prettyCron` from cron-utils.ts (Wave 0 contract). TaskBoard delete uses the AlertDialog primitive (Wave 0 contract).
- **07-04 (Final close-out):** retires the last placeholder slots; deletes `frontend/src/components/PlaceholderCardGrid.tsx` once the helper has zero callers (Pitfall 10 closes naturally — no remaining `lucide-inbox` icons in the production DOM after 07-04).

Phase 7 entry contract for those plans:
- `/skills` SKILLS_SLOTS contains exactly `[{ TPNL-01 }, { TPNL-03 }]` — 07-03 retires both
- `frontend/src/components/panels/index.ts` exports 4 new Phase-7 panels (DecisionsCard, InboxCard, SkillsRegistry, SkillCostCard) plus ContextHealthCard from 07-01
- `McpPanel` accepts an optional `reqId` prop; future panel reuse should follow the same shape if a different requirement ID is needed
- Frontend baseline: 202 / 202 tests green; Backend baseline: 208 / 208 tests green (unchanged)

Bundle delta (`npm run build`):
- CSS: 30.51 KB total / 5.24 KB gzipped (up from 28.40 KB / 5.02 KB after Plan 07-01 — Wave 1 CSS section is the addition)
- panels chunk: 581.99 KB total / 174.03 KB gzipped (up from 577 KB / 172 KB — 4 small new panel modules)
- index chunk: 371.62 KB / 116.10 KB gzipped (up from 369 KB / 115 KB — neutral)

---
*Phase: 07-command-centre-panels*
*Plan: 07-02 — Wave 1 (HPNL panels + SKLP page lower half)*
*Completed: 2026-04-27*

## Self-Check: PASSED

Verified post-write:
- All 8 created files exist on disk: DecisionsCard.tsx, DecisionsCard.test.tsx, InboxCard.tsx, InboxCard.test.tsx, SkillsRegistry.tsx, SkillsRegistry.test.tsx, SkillCostCard.tsx, SkillCostCard.test.tsx
- All 4 task commits exist in git log: 23dc07c, b567091, 20a4193, 741720f
- Frontend tests: 202 / 202 passing (188 baseline + 14 new — close to ~16 plan target; 9 from Task 1 + 5 from Task 2)
- Backend tests: 208 / 208 passing (unchanged from baseline; no backend edits this plan)
- typecheck green; build green
- All `must_haves.truths` from plan frontmatter hold (with the McpPanel reqId-prop deviation documented above)
- All `must_haves.artifacts` exist with required exports/contains
