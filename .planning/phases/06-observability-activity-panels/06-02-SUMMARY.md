---
phase: 06-observability-activity-panels
plan: 02
subsystem: ui
tags: [react, tanstack-query, panelcard, sheet, sse, follow-up, command-page]

# Dependency graph
requires:
  - phase: 06-observability-activity-panels
    provides: PanelCard primitive (loading/empty/error/data branches + hiddenWhenEmpty); lib/queries.ts cadence layer (5s/10s/15s/30s/...); useFollowUpMessage mutation; ui barrel (StatePill/Sheet/Button/Skeleton/RelativeTime/KpiTile)
  - phase: 04-stateful-apis
    provides: SESS-06 follow-up endpoint (POST /api/sessions/live/{sid}/message)
  - phase: 03-read-only-apis
    provides: /api/system/health, /api/attention, /api/summary, /api/sessions/live, /api/sessions/{sid}/details
  - phase: 05-frontend-shell-design-system
    provides: AppShell + 12-primitive ui barrel + .cmc-page wrapper

provides:
  - SystemHealthStrip (OPNL-01) — 5s pills + uptime/memory/tzname stats
  - KpiRow (OPNL-02) — 4-up KpiTile row sourced from /api/summary (15s)
  - AttentionBar (OPNL-03) — full-width warning bar, hides via PanelCard hiddenWhenEmpty when nothing actionable
  - LiveSessionsCard (OPNL-04) — live row list + Sheet drawer with tool timeline + follow-up textarea/Send
  - frontend/src/components/panels/index.ts barrel — Wave 3 (06-03) appends analytical panels here
  - routes/index.tsx now renders the top strip ABOVE PlaceholderCardGrid; OPNL-01/03/04 removed from COMMAND_SLOTS
affects: [06-03, 06-04, 06-05, phase-07]

# Tech tracking
tech-stack:
  added: []  # No new deps — every primitive consumed already shipped in 05/06-01
  patterns:
    - "Panel = PanelCard<TData> + lib/queries hook; never inline refetchInterval"
    - "Bare-array endpoints (no items envelope) handled via custom empty.when predicate on PanelCard"
    - "Sheet drawer consumes Radix Portal — tests must query document.body, not the test container"
    - "URL-aware fetch mock pattern for tests where multiple TanStack Query hooks may auto-refetch"

key-files:
  created:
    - frontend/src/components/panels/SystemHealthStrip.tsx
    - frontend/src/components/panels/KpiRow.tsx
    - frontend/src/components/panels/AttentionBar.tsx
    - frontend/src/components/panels/LiveSessionsCard.tsx
    - frontend/src/components/panels/index.ts
    - frontend/src/components/panels/__tests__/SystemHealthStrip.test.tsx
    - frontend/src/components/panels/__tests__/KpiRow.test.tsx
    - frontend/src/components/panels/__tests__/AttentionBar.test.tsx
    - frontend/src/components/panels/__tests__/LiveSessionsCard.test.tsx
  modified:
    - frontend/src/routes/index.tsx (OPNL-01/03/04 removed from COMMAND_SLOTS; top strip wired)
    - frontend/src/styles.css (top-strip + drawer + follow-up CSS classes)

key-decisions:
  - "Bare-array LiveSessionItem[] response shape preserved via PanelCard custom empty.when ((d) => Array.isArray(d) && d.length === 0) — no envelope adaptation in panel/api layer"
  - "Sheet drawer uses Radix Portal (mounts to document.body); test assertions on portal content use document.body.querySelectorAll, NOT the rendered container ref"
  - "Follow-up form Send disabled rule = mutation.isPending OR !text.trim(); inline error rendered verbatim from mutation.error.message (backend HTTPException handler returns {error: detail}; ApiError.message includes that body via Plan 05-01's fetchJson wrapper)"
  - "When session.ended_at != null the form is REPLACED by a styled notice (.cmc-followup-form__ended) — no disabled-form half-state — matches plan must-have"
  - "URL-aware fetch mock locked as the LiveSessionsCard test pattern: per-URL response branching prevents staleTime:0 hooks from corrupting the cache when a follow-up POST resolves with a queued envelope"
  - "OPNL-01/03/04 removed from COMMAND_SLOTS as required; the panel reqIds (OPNL-01..04) still appear at runtime via PanelCard's CardDescription kicker, satisfying the integration smoke test's existing OPNL-01 assertion"

patterns-established:
  - "Phase 6 panel shape (locked for 06-03..05): import { PanelCard, ... } from '../ui'; import { useX } from '../../lib/queries'; render-prop body inside PanelCard; never inline refetchInterval/staleTime"
  - "PanelCard hiddenWhenEmpty pattern is the AttentionBar shape — every future panel that should disappear when clean uses the same: empty.when predicate + hiddenWhenEmpty"
  - "Sheet test pattern: query portal content via document.body.querySelectorAll('.cmc-tool-timeline__row') (Radix Portal target); use waitFor when subsequent useQuery hooks light up only after activeSid state is set"
  - "URL-aware vi.fn fetch mock template (LiveSessionsCard.test.tsx) reusable for any future panel that mounts multiple useQuery hooks with overlapping fetch surfaces"

# Metrics
duration: ~17min
completed: 2026-04-27
---

# Phase 6 Plan 02: Top-Strip Panels Summary

**Command-page operator strip — SystemHealthStrip + KpiRow + AttentionBar + LiveSessionsCard wired above PlaceholderCardGrid; AttentionBar disappears when clean; LiveSessionsCard ships full Sheet drawer + follow-up flow against backend mock.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-04-27T11:48:00Z (approx; resumed from STATE.md @ 07:50 last update)
- **Completed:** 2026-04-27T12:05:03Z
- **Tasks:** 2 (1 multi-panel batch + 1 LiveSessionsCard with drawer + routes wiring)
- **Files created:** 9
- **Files modified:** 2 (routes/index.tsx + styles.css)

## Accomplishments

- 4 Phase-6 panels (OPNL-01..04) live above the panel grid on `/`
- AttentionBar's hiddenWhenEmpty contract verified by integration test — bar element returns null and disappears from layout when empty.when predicate matches (zero items + zero stuck + null staleness)
- LiveSessionsCard tool timeline + follow-up form work end-to-end against URL-aware mock fetch (drawer opens on row click, Send queues message via SESS-06 endpoint, mutation.isError surfaces backend body verbatim, ended sessions get notice instead of form)
- Routes/index.tsx renders the top strip ABOVE PlaceholderCardGrid; OPNL-01/03/04 entries removed from COMMAND_SLOTS so no double-rendering
- 16 new frontend tests bring suite from 97 → 113 green; backend remains 202/202

## Task Commits

1. **Task 1: SystemHealthStrip + KpiRow + AttentionBar (3 panels + barrel + CSS + 12 tests)** — `6ab49cc` (feat)
2. **Task 2: LiveSessionsCard with Sheet drawer + follow-up + routes wiring + 4 tests** — `5114efb` (feat)

**Plan metadata commit:** (this closing commit) — SUMMARY.md + STATE.md + ROADMAP.md

## Files Created/Modified

### Created
- `frontend/src/components/panels/SystemHealthStrip.tsx` — OPNL-01 panel with server/otel/daemon pills + uptime/memory/tzname stats
- `frontend/src/components/panels/KpiRow.tsx` — OPNL-02 panel with 4 KpiTile tiles (sessions/tokens/tool-calls/errors); always renders 4 tiles
- `frontend/src/components/panels/AttentionBar.tsx` — OPNL-03 panel; PanelCard hiddenWhenEmpty hides when no items + no stuck + no stale dispatcher
- `frontend/src/components/panels/LiveSessionsCard.tsx` — OPNL-04 panel + Sheet drawer; tool timeline + follow-up form (textarea + Send) + ended-session notice
- `frontend/src/components/panels/index.ts` — Phase 6 panels barrel
- 4 test files under `frontend/src/components/panels/__tests__/` — 16 new tests total

### Modified
- `frontend/src/routes/index.tsx` — top strip wired (SystemHealthStrip → KpiRow → AttentionBar → LiveSessionsCard); COMMAND_SLOTS reduced to OPNL-05..15
- `frontend/src/styles.css` — appended top-strip CSS (SystemHealthStrip, KpiRow grid, AttentionBar) + drawer body classes (LiveSessionsCard, ToolTimeline, FollowUpForm)

## Decisions Made

See key-decisions in frontmatter for full list. Highlights:

- Bare-array `/api/sessions/live` shape preserved end-to-end — no envelope adaptation; PanelCard's empty.when override handles it directly
- Sheet drawer is Radix-Portal-mounted; portal content tests query `document.body`, not the rendered container ref. Will recur for any future Sheet test
- Follow-up form replaces (not disables) when ended_at != null
- OPNL-01..04 reqIds still appear at runtime via PanelCard's CardDescription kicker — integration test's existing `findByText('OPNL-01')` assertion still passes without modification

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] LiveSessionsCard test fetch mock corrupted cache via auto-refetch**
- **Found during:** Task 2 (drawer-open + follow-up tests)
- **Issue:** Initial test mocked `fetch` with a single resolved Response carrying `{queued, session_id, queue_path}` for all URLs. TanStack Query hooks (useLiveSessions and useSessionDetails both have `staleTime: 0`) auto-refetch on mount, and the queued-envelope payload was written into both caches → `items.map is not a function` on the live-sessions array path
- **Fix:** Switched to a URL-aware `vi.fn` fetch implementation that branches on URL+method: GET `/api/sessions/live` → bare array; GET `/api/sessions/{sid}/details` → SessionDetailsResponse; POST `/api/sessions/live/{sid}/message` → queued envelope. The `.../details` branch also conditionally returns an `ended_at != null` payload for the second test session
- **Files modified:** frontend/src/components/panels/__tests__/LiveSessionsCard.test.tsx
- **Verification:** All 4 LiveSessionsCard tests pass; full frontend suite 113/113 green
- **Committed in:** 5114efb (Task 2 commit)
- **Pattern note:** This is the locked test pattern for any future panel that mounts multiple TanStack Query hooks against overlapping URLs; documented in patterns-established

**2. [Rule 1 - Bug] Sheet portal content not visible inside test container ref**
- **Found during:** Task 2 (drawer-open test)
- **Issue:** Sheet uses Radix Dialog with `Dialog.Portal` (mounts to document.body). Original test queried `container.querySelectorAll('.cmc-tool-timeline__row')` which only sees the test render scope, not the portal target — assertion saw 0 timeline rows even though the drawer was open
- **Fix:** Switched to `document.body.querySelectorAll(...)` for portal-mounted content; wrapped in `waitFor` because useSessionDetails activates only after activeSid state flips
- **Files modified:** frontend/src/components/panels/__tests__/LiveSessionsCard.test.tsx
- **Verification:** Drawer-open test asserts 2 timeline rows + "1234ms" latency cell visible
- **Committed in:** 5114efb (Task 2 commit)
- **Pattern note:** Locked Sheet/Dialog test pattern for the rest of Phase 6 + Phase 7 EmergencyStopModal etc.

**3. [Rule 3 - Blocking] panels barrel forward-references LiveSessionsCard before Task 2 ships its body**
- **Found during:** Task 1 (typecheck after creating barrel with all 4 exports)
- **Issue:** Plan said to write the full 4-export barrel in Task 1's single file write. But Task 1's file list does NOT include LiveSessionsCard.tsx; without a body, `export { LiveSessionsCard } from './LiveSessionsCard'` fails typecheck and breaks Task 1's commit boundary
- **Fix:** Stubbed `LiveSessionsCard.tsx` to a `function LiveSessionsCard() { return null }` placeholder during Task 1; Task 2 overwrites it with the full implementation. Committed as part of Task 1 with a comment marking it as a stub
- **Files modified:** frontend/src/components/panels/LiveSessionsCard.tsx (stub) → (full body in Task 2)
- **Verification:** Task 1 typecheck + tests pass; Task 2 typecheck + tests + build pass with the full body
- **Committed in:** 6ab49cc (Task 1 stub) → 5114efb (Task 2 full)
- **Pattern note:** When a plan asks for a single barrel write that forward-references a file landing in a subsequent task, ship a typed-but-empty stub of the deferred file in the earlier commit — keeps each task's commit boundary clean without forcing two barrel edits

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 bugs / 1 blocking)
**Impact on plan:** All three were test-infrastructure or boundary-keeping fixes — no architectural change, no scope creep, no production-code semantic change.

## Issues Encountered

None beyond the deviation-rule-handled items above.

## Plan 06-03 Entry Contract

After this plan:
- `frontend/src/components/panels/index.ts` exports 4 panels (SystemHealthStrip / KpiRow / AttentionBar / LiveSessionsCard); Plan 06-03 APPENDS the analytical-grid panels (TokenUsage / Cache / Outcomes / Latency / etc.)
- `frontend/src/routes/index.tsx` `COMMAND_SLOTS` array still lists 11 placeholder slots: **OPNL-05..15** — Plan 06-03 replaces all of these with live panels. When the last slot is replaced, Plan 06-03 also DELETES the `<PlaceholderCardGrid slots={COMMAND_SLOTS} />` usage entirely from `/` (per the PlaceholderCardGrid contract: helper deletes when last placeholder is replaced)
- `frontend/src/styles.css` is the shared CSS surface; Plan 06-03 appends its own `/* Phase 6 Plan 03 */` section after the Plan 02 block (UI-SPEC token-only convention enforced)
- The bare-array `/api/sessions/live` shape and PanelCard hiddenWhenEmpty pattern are the only non-default PanelCard contracts established in this plan; Phase 6 Plans 03..05 default-shape (envelope-with-items) panels can simply rely on the default PanelCard empty detection
- **AttentionBar v1 ignores pending_decisions and failed_tasks** — these stay 0 in the response; when Phase 7 lands tasks/decisions tables, edit AttentionBar (or extend the items[] feed) to surface them. Inline comment in AttentionBar.tsx flags this

## UI-SPEC visual notes (dev-server smoke)

Dev server smoke not run in this autonomous executor pass (the plan was fully automated against tests + types + build). The Phase 6 verifier checkpoint will catch any pixel-level inconsistencies — anticipated items to verify:
- StatePill colors at full opacity for the running pill (dispatcher/jsonl_sync) — UI-SPEC FESH-06
- KpiTile typography display-size (28px) on the 4-up grid — should match the 14px radius cards
- Sheet drawer width on narrow viewports (Sheet ships only `side="right"` v1)
- AttentionBar Badge wrapping behavior when many items — flex-wrap row already handles this in CSS

## Next Phase Readiness

- Phase 6 Wave 2 closed; Wave 3 (Plan 06-03 — analytical panels) READY. Plan 06-03 appends to panels barrel and replaces OPNL-05..15 in COMMAND_SLOTS
- Frontend baseline: 113 / 113 green
- Backend baseline: 202 / 202 green (unchanged — no backend changes in this plan)
- Build clean (vite build): 290.49 kB main bundle / 91.35 kB gzip; 167.75 kB PlaceholderCardGrid chunk (will shrink as 06-03 deletes it)

## Self-Check: PASSED

- frontend/src/components/panels/SystemHealthStrip.tsx — FOUND
- frontend/src/components/panels/KpiRow.tsx — FOUND
- frontend/src/components/panels/AttentionBar.tsx — FOUND
- frontend/src/components/panels/LiveSessionsCard.tsx — FOUND
- frontend/src/components/panels/index.ts — FOUND
- frontend/src/components/panels/__tests__/SystemHealthStrip.test.tsx — FOUND
- frontend/src/components/panels/__tests__/KpiRow.test.tsx — FOUND
- frontend/src/components/panels/__tests__/AttentionBar.test.tsx — FOUND
- frontend/src/components/panels/__tests__/LiveSessionsCard.test.tsx — FOUND
- Commit 6ab49cc — FOUND in git log
- Commit 5114efb — FOUND in git log

---
*Phase: 06-observability-activity-panels*
*Completed: 2026-04-27*
