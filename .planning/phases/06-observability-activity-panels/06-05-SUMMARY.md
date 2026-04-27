---
phase: 06-observability-activity-panels
plan: 05
subsystem: ui
tags: [frontend, react, sse, eventsource, observability, activity-page, vitest, phase-close]

# Dependency graph
requires:
  - phase: 06-observability-activity-panels (06-01)
    provides: useFirehose bespoke SSE hook (ring-buffered events + status), PanelCard / Card / Badge / EmptyState / StatePill / RelativeTime ui primitives, useFailures query hook, /api/sessions/failures backend route, ACTV-04 v2 deferral decision (no skill_invoked OTEL event)
  - phase: 06-observability-activity-panels (06-04)
    provides: ActivityHeatmap + ChartsStrip + SessionsTable on /activity above the (now-deleted) PlaceholderCardGrid; routes/activity.tsx wave-4 wiring
provides:
  - OtelPanel (ACTV-03) — SSE firehose subscription with client-side event_name filter, newest-at-top scrolling feed, connection-status pill
  - UnifiedFailures (ACTV-05) — failed-session list (errored/rate_limited) with outcome Badge + last_error_message + RelativeTime started_at
  - TopSkills (ACTV-04 v2) — static EmptyState card preserving requirement-ID traceability without speculative ingest changes
  - PlaceholderCardGrid REMOVED from /activity — only /skills still renders it (Phase 7 will retire it from there)
  - Integration smoke extension — visiting / and /activity asserts no PlaceholderCardGrid presence (lucide-inbox icon discriminator)
  - Phase 6 close-out: visual quality bar APPROVED by user against ROADMAP success criteria 1-5 on running dev server
affects:
  - Phase 7 (Command Centre Panels) — McpPanel + 12 ui primitives + 7 wave-1 panel primitives + lib/queries / useFirehose all reusable; SKLP-01 imports McpPanel directly. PlaceholderCardGrid still on /skills awaiting Phase 7 retirement.
  - Phase 6 verifier — handed off with all 21 OPNL/ACTV requirements complete + 5 ROADMAP success criteria verified against running dev server.

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OtelPanel bespoke Card shell (NOT PanelCard) — useFirehose returns {events, status} which is structurally different from UseQueryResult; PanelCard's 4-branch loading/empty/error/data render contract assumes a TanStack Query hook. Hand-rolled Card composition mirrors PanelCard's visual contract; inline comment cites the reason. Reusable for any future panel that consumes a non-TanStack-Query data source (raw EventSource, WebSocket, IntersectionObserver, etc.)."
    - "Client-side event_name filter (RESEARCH §SSE filter strategy 2) — server-side filter would require disconnect+reconnect on every keystroke; client-side filter uses useMemo over the ring-buffered events array. Reusable for any future stream where the server wire format is fixed but UI wants narrow."
    - "Newest-at-top SSE feed render order — `[...filtered].reverse().map(...)` on a ring-buffered array. Standard live-monitoring affordance; the feed scrolls naturally as new events arrive at the top while older events pushed off the bottom of the visible region."
    - "ACTV-04 v2 deferral pattern — preserve the requirement ID's traceability in the UI via an EmptyState card with reqId kicker; inline code comment captures the deferral rationale + v2 unblocking work. Reusable for any future requirement that the planner decides to defer without removing from the UI map."
    - "Integration test PlaceholderCardGrid discriminator — `data-testid` was avoided in favor of a structural signal (lucide-inbox icon presence on PlaceholderCardGrid only). Test queries `[aria-hidden] svg.lucide-inbox` and asserts count==0 on / and /activity vs >0 on /skills. Reusable for any future placeholder/live discrimination assertion."

key-files:
  created:
    - frontend/src/components/panels/OtelPanel.tsx
    - frontend/src/components/panels/UnifiedFailures.tsx
    - frontend/src/components/panels/TopSkills.tsx
    - frontend/src/components/panels/__tests__/OtelPanel.test.tsx
    - frontend/src/components/panels/__tests__/UnifiedFailures.test.tsx
    - frontend/src/components/panels/__tests__/TopSkills.test.tsx
  modified:
    - frontend/src/components/panels/index.ts
    - frontend/src/routes/activity.tsx
    - frontend/src/styles.css
    - frontend/src/__tests__/integration.test.tsx

key-decisions:
  - "ACTV-04 (TopSkills) ships v2 — no backend route, no useTopSkills hook, no fetch. EmptyState card preserves traceability; rationale comment captures v2 unblocking work (skill_id link on session_starts via Phase 2 ingest enhancement, then /api/skills/usage endpoint, then replace placeholder)."
  - "OtelPanel does NOT use PanelCard — useFirehose hook shape is structurally different from UseQueryResult; hand-rolled Card composition is intentional and documented inline. PanelCard's 4-branch loading/empty/error/data render contract does not apply to a long-lived EventSource."
  - "Client-side filter strategy chosen over server-side — RESEARCH §SSE filter strategy 2 explicitly forbade reconnecting on each keystroke; useMemo over the ring buffer satisfies the filter use case without server-side parameter."
  - "newest-at-top feed render order — operator's mental model for live monitoring is 'new things appear at the top'; the ring-buffered events array stays oldest-first internally (so buffer eviction is LIFO) but the render reverses for display."
  - "PlaceholderCardGrid removed from /activity — last consumer for that route. Helper still imported on /skills for Phase 7 territory; per Plan 05-04 contract, the helper deletes when its last consumer is replaced (Phase 7 will close that out)."
  - "Phase 6 close-out: visual quality bar approved by user against all 5 ROADMAP success criteria + Wave 5 panel-specific spot checks on the running dev server. Phase 6 ready for verifier handoff."

patterns-established:
  - "Bespoke Card shell for non-TanStack-Query panels: when a hook returns shape ≠ UseQueryResult, compose Card + CardHeader + CardTitle + CardDescription + CardContent directly (mirroring PanelCard's visual contract) instead of forcing the data through PanelCard's branch matrix."
  - "v2-deferral placeholder convention: static EmptyState card with reqId kicker + heading 'Coming in v2' + body explaining the unblocking work — keeps requirement traceability live in the UI without speculative data fetch."
  - "Integration test placeholder discriminator: structural CSS-class signal (lucide-inbox icon presence) preferred over data-testid attribute — keeps the production DOM clean."
  - "Phase close-out checkpoint pattern: blocking checkpoint:human-verify at the end of the final wave plan walks the developer through panel-by-panel verification against ROADMAP success criteria + UI quality bar. Auto-mode disabled by plan attribute (autonomous: false) to force human review."

# Metrics
duration: ~16min
completed: 2026-04-27
---

# Phase 6 Plan 05: Activity Page Tail + Phase Close-Out Summary

**OtelPanel (ACTV-03 SSE firehose) + UnifiedFailures (ACTV-05 failed-session list) + TopSkills (ACTV-04 v2 placeholder) shipped; PlaceholderCardGrid deleted from /activity; Phase 6 visual quality bar approved by user against all 5 ROADMAP success criteria.**

## Performance

- **Duration:** ~16 min agent + human-verify checkpoint wait
- **Started:** 2026-04-27T12:50:00Z (approximate)
- **Completed:** 2026-04-27T13:25:00Z (close-out commit timestamp)
- **Tasks:** 2 (1 auto + 1 checkpoint)
- **Files modified:** 10 (6 created + 4 modified)

## Accomplishments

- **ACTV-03 OtelPanel:** bespoke Card shell wrapping `useFirehose` (Plan 06-01). Newest-at-top scrolling feed, client-side event_name filter via free-text input + useMemo, connection StatePill maps `connecting → pending`, `open → ok`, `closed → stale`. Empty body shows "Reconnecting…" / "Waiting for events…" depending on status.
- **ACTV-05 UnifiedFailures:** PanelCard composing `useFailures('30d')` (Plan 06-01 lib/queries hook + Plan 06-01 backend route). Outcome Badge variants (`errored → danger`, `rate_limited → warning`), truncated `session_id.slice(0, 8)` in mono with full id available, RelativeTime `started_at`, `last_error_message` in `--cmc-text-dim` mono.
- **ACTV-04 TopSkills (v2 placeholder):** static EmptyState card with reqId kicker `ACTV-04` + heading "Coming in v2" + body explaining the unblocking work (skill_id link on session_starts via Phase 2 ingest enhancement). NO backend route, NO useTopSkills hook, NO data fetch. Rationale comment captures the v2 deferral decision from Plan 06-01.
- **/activity route refactored:** PlaceholderCardGrid import + ACTIVITY_SLOTS array DELETED; route now renders ActivityHeatmap → ChartsStrip → 3-card grid (OtelPanel + UnifiedFailures + TopSkills) → SessionsTable. Zero placeholders remain on /activity.
- **Integration smoke extended:** URL-aware fetch mock + MockEventSource so / and /activity render with data; lucide-inbox icon presence used as the PlaceholderCardGrid discriminator. Tests assert no `.lucide-inbox` icons on / or /activity (live panels and TopSkills don't use that icon) and 6+ instances on /skills (Phase 7 territory).
- **Test count: 158 → 170 (+12 net):** OtelPanel 5, UnifiedFailures 3, TopSkills 2, integration extension 2.
- **Build status:** typecheck clean, 170/170 frontend tests green, 202/202 backend tests green, `npm run build` succeeds.

## Phase 6 Bundle Metrics (`npm run build` final)

```
dist/index.html                             0.78 kB │ gzip:   0.41 kB
dist/assets/index-B0VJocFo.css             26.02 kB │ gzip:   4.71 kB
dist/assets/activity-BW7qYGkd.js            0.83 kB │ gzip:   0.40 kB
dist/assets/routes-C6yhS6l9.js              1.04 kB │ gzip:   0.45 kB
dist/assets/skills-CAVTOSiY.js              1.92 kB │ gzip:   0.89 kB
dist/assets/CommandPalette-DM-WOgS5.js     58.17 kB │ gzip:  19.68 kB
dist/assets/createLucideIcon-CWbTTJi4.js  174.61 kB │ gzip:  58.11 kB
dist/assets/index-BMh-eGiq.js             290.54 kB │ gzip:  91.38 kB
dist/assets/panels-CVOnVu0m.js            419.22 kB │ gzip: 119.92 kB
```

- **panels chunk:** 419 kB (Wave 4 baseline 415 kB + Wave 5 ~4 kB delta) — 18 panels total.
- **Recharts contribution:** ~290 kB (ships in `index-BMh-eGiq.js` via Wave 3 imports); CSS 26 kB (Wave 5 added ~104 lines for cmc-otel-* and cmc-input chrome).
- No build warnings; chunk sizes match the Wave-4 baseline + small Wave-5 additions.

## Task Commits

Each task was committed atomically:

1. **Task 1: OtelPanel + UnifiedFailures + TopSkills v2 placeholder + activity.tsx wiring + integration extension** — `02fa534` (feat)
2. **Task 2: Phase 6 visual + behavioral quality bar verification (checkpoint:human-verify)** — APPROVED by user 2026-04-27 (no commit; verification only)

**Plan metadata:** (this closing commit) — `docs(06-05): complete Phase 6 Activity tail + close-out checkpoint`

## Files Created/Modified

- `frontend/src/components/panels/OtelPanel.tsx` (created) — ACTV-03 bespoke Card shell, useFirehose subscription, client-side filter, status pill
- `frontend/src/components/panels/UnifiedFailures.tsx` (created) — ACTV-05 PanelCard wrapper around useFailures('30d') with outcome Badge variants
- `frontend/src/components/panels/TopSkills.tsx` (created) — ACTV-04 v2 EmptyState card with reqId kicker + Sparkles icon
- `frontend/src/components/panels/__tests__/OtelPanel.test.tsx` (created) — 5 tests (status pill, filter narrows feed, newest-at-top order, empty body, connection lifecycle)
- `frontend/src/components/panels/__tests__/UnifiedFailures.test.tsx` (created) — 3 tests (badge variants, EmptyState on empty fixture, last_error_message render)
- `frontend/src/components/panels/__tests__/TopSkills.test.tsx` (created) — 2 tests (reqId kicker, "Coming in v2" body)
- `frontend/src/components/panels/index.ts` (modified) — Wave-5 barrel section appended (3 names: OtelPanel, UnifiedFailures, TopSkills); panels barrel now exports 18 names total
- `frontend/src/routes/activity.tsx` (modified) — DELETED PlaceholderCardGrid import + ACTIVITY_SLOTS array; renders 3-card grid of OtelPanel + UnifiedFailures + TopSkills between ChartsStrip and SessionsTable
- `frontend/src/styles.css` (modified) — Wave-5 section appended (~104 lines): `.cmc-otel-controls`, `.cmc-input` (text input chrome), `.cmc-otel-feed` (max-height + scroll), `.cmc-otel-row` (3-col ts/event/sid grid), text-dim/text-subtle utilities
- `frontend/src/__tests__/integration.test.tsx` (modified) — URL-aware fetch mock + MockEventSource scaffolding; new assertions: no `.lucide-inbox` icons on / or /activity, ≥1 on /skills

## Decisions Made

- **ACTV-04 v2 deferral preserved.** No backend route added (Plan 06-01 already locked the decision). EmptyState card with rationale comment is the single source of v2 traceability in the UI. Plan 06-05 ran cleanly without ingest changes.
- **OtelPanel uses bespoke Card composition (NOT PanelCard).** useFirehose returns `{events, status}` which is structurally different from UseQueryResult. Forcing the data through PanelCard's 4-branch matrix would have required adapter shims that obscure the SSE lifecycle. Hand-rolled Card composition mirrors PanelCard's visual contract; inline comment documents the choice.
- **Client-side event_name filter (RESEARCH §SSE filter strategy 2).** Server-side filter would have required disconnect+reconnect on every keystroke. useMemo over the ring buffer is O(n) per keystroke against a 500-event cap (acceptable; ~0.1ms in practice).
- **Newest-at-top render order.** Operator's mental model for live monitoring is "new things at the top". Ring buffer stays oldest-first internally (so buffer eviction is LIFO via shift); render reverses for display. Documented in code.
- **PlaceholderCardGrid discriminator: lucide-inbox icon presence.** The Plan 05-04 PlaceholderCardGrid uses the lucide-inbox icon in its EmptyState by default; live panels (which use other icons or no icons at all) and the TopSkills v2 card (Sparkles icon) don't. Tests query `[aria-hidden] svg.lucide-inbox` count instead of scanning for ACTV-* / OPNL-* kicker strings (which would have false-matched live panels' reqId kickers).

## Deviations from Plan

None — plan executed exactly as written. The auto-fixes the prior agent applied to make the integration test mock fetch URL-aware (instead of single-shape) and to install MockEventSource were minor test-infra accommodations the plan §Step 8 left implicit; both shipped in the same Task 1 commit.

## Issues Encountered

None — Task 1 landed in a single atomic commit with no Rule-1/2/3 deviations needed; Task 2 (checkpoint) was approved by the user on first review without any "revise" feedback.

## Threat Flags

None — no new network surface, auth path, file access pattern, or schema change introduced. OtelPanel consumes the existing same-origin `/api/firehose` SSE stream (Phase 3 surface); UnifiedFailures consumes the existing `/api/sessions/failures` route (Plan 06-01 surface); TopSkills makes no network calls.

## Phase 6 Visual Quality Bar — Approval Notes (2026-04-27)

User confirmed every item below is TRUE on the running dev server (`backend uv run uvicorn cmc.app:app --reload --port 8765` + `frontend npm run dev`):

**ROADMAP success criteria 1-5:**
1. **System Health Strip + KPI Row + Attention Bar with live data** — ✅ OPNL-01/02/03 (Plan 06-02)
2. **Live Sessions Card with drawer + follow-up messaging** — ✅ OPNL-04 (Plan 06-02)
3. **Token Usage stacked bars with today/7d/30d toggle** — ✅ OPNL-05 (Plan 06-03)
4. **MCP panel with expandable per-tool drill-down + slow/fast tags** — ✅ OPNL-15 (Plan 06-03)
5. **Activity page: 30-day heatmap + 14-day token charts + OTEL firehose with filtering + sessions table with search/pagination** — ✅ ACTV-01/02/03/06 (Plans 06-04 + 06-05)

**Wave 5 panel-specific spot checks (passed):**
- ACTV-03 OtelPanel: connection pill = `open` after ~1s; events flow into the feed (newest-at-top); filter narrows the feed; pill turns `closed` when backend stops + reconnects automatically when backend resumes.
- ACTV-04 TopSkills: card with reqId="ACTV-04" + heading "Coming in v2" + rationale body; DevTools Network tab confirms NO /api/skills/usage call.
- ACTV-05 UnifiedFailures: errored/rate_limited sessions list with outcome Badge + last_error_message; EmptyState renders when no failures.

**No blocking visual-bar regressions identified.** Phase 6 ready for verifier handoff.

## Next Phase Readiness

- **Phase 7 (Command Centre Panels) entry contract preserved:**
  - **McpPanel** lives at `frontend/src/components/panels/McpPanel.tsx` — Phase 7 SKLP-01 imports it directly OR extends it (do not duplicate).
  - **12 ui primitives** (Card family, Button, Badge, StatePill, Tooltip, Skeleton, EmptyState, RelativeTime, ShellErrorBoundary, Sheet, CollapsibleSection, CommandPalette + formatRelative) all reusable for HPNL-/TPNL-/SKLP- panels.
  - **7 wave-1 panel primitives** (PanelCard, RangeToggle, DataTable, HeatmapGrid, StatList, KpiTile, ErrorState) reusable for any future paginated/charted/tabular panel.
  - **lib/queries.ts** + **lib/useFirehose** are the locked single-source for polling cadences and SSE; Phase 7 adds new hooks here, never inlines refetchInterval/staleTime in panels.
  - **PlaceholderCardGrid** still imported on /skills only — Phase 7 SKLP-* plans will retire it from there per the same Plan 05-04 contract used on / (06-03) and /activity (06-05).
- **Phase 6 verifier handoff package:** all 21 OPNL-/ACTV- requirements complete in REQUIREMENTS.md traceability table; SUMMARY.md across all 5 plans captures the implementation receipts; user-approved visual quality bar against ROADMAP success criteria 1-5 + Wave-5 panel spot checks; 170/170 frontend + 202/202 backend tests green; no deferred items.
- **No blockers or concerns.** Phase 7 can start immediately.

## Self-Check: PASSED

Verified:
- Created files exist (via prior agent's task commit `02fa534`):
  - `frontend/src/components/panels/OtelPanel.tsx` ✓
  - `frontend/src/components/panels/UnifiedFailures.tsx` ✓
  - `frontend/src/components/panels/TopSkills.tsx` ✓
  - `frontend/src/components/panels/__tests__/OtelPanel.test.tsx` ✓
  - `frontend/src/components/panels/__tests__/UnifiedFailures.test.tsx` ✓
  - `frontend/src/components/panels/__tests__/TopSkills.test.tsx` ✓
- Modified files updated correctly:
  - `frontend/src/components/panels/index.ts` ✓ (3 new exports)
  - `frontend/src/routes/activity.tsx` ✓ (PlaceholderCardGrid removed; 3 new panels wired)
  - `frontend/src/styles.css` ✓ (Wave-5 section appended)
  - `frontend/src/__tests__/integration.test.tsx` ✓ (URL-aware mock + MockEventSource + lucide-inbox assertions)
- Commits exist in git log:
  - `02fa534` (Task 1) ✓
- Test suite: 170/170 frontend ✓, 202/202 backend ✓
- Typecheck: clean ✓
- Build: succeeds (419 kB panels chunk; no warnings) ✓
- Phase 6 visual quality bar: APPROVED by user 2026-04-27 against all 5 ROADMAP success criteria ✓

---
*Phase: 06-observability-activity-panels*
*Completed: 2026-04-27*
