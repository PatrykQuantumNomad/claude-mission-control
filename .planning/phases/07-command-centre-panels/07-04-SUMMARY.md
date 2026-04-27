---
phase: 07-command-centre-panels
plan: 04
subsystem: ui
tags: [react, tanstack-query, schedules, cron, cronstrue, hitl, placeholder-retirement, phase-close]

# Dependency graph
requires:
  - phase: 04-stateful-apis
    provides: SCHD-01..06 endpoints (POST/GET/PATCH/DELETE /api/schedules, parse-nl); HITL/Tasks/Skills CRUD that 07-02 + 07-03 already wired
  - phase: 05-frontend-shell-design-system
    provides: Sheet, AlertDialog, CollapsibleSection, Button, Card family, RelativeTime, DataTable, Badge, MotionConfig render util, lib/storage helper
  - phase: 06-observability-activity-panels
    provides: McpPanel (reused with reqId override), PanelCard 4-branch render contract, integration smoke harness with URL-aware fetch mock
  - phase: 07-01
    provides: lib/cron-utils (partsToCron + prettyCron), AlertDialog primitive, queries.ts Phase-7 hooks (useSchedules, usePatchSchedule, useScheduleRuns lazy, useCreateSchedule, useParseNlCron, useSkills, useDecisions, useInbox, useTasks, useSystemState), EmergencyStopBanner global mount
  - phase: 07-02
    provides: DecisionsCard (HPNL-01), InboxCard (HPNL-02), SkillsRegistry (SKLP-04), SkillCostCard (SKLP-02 v2), McpPanel reqId override pattern (SKLP-01 on /skills)
  - phase: 07-03
    provides: TaskBoard (TPNL-01), TaskComposer (TPNL-02) globally mounted via TaskComposerProvider, AttentionBar live counts (Phase 6 deferral closed atomically)
provides:
  - SchedulesCard (TPNL-03) — list schedules with cronstrue preview, optimistic enabled toggle, lazy run-history (Pitfall 9), 48h stale detection
  - ScheduleComposer (TPNL-04) — Sheet with native time picker, 7 bespoke aria-pressed day chips, live cron preview (Pitfall 3 keep-typing fallback), advanced cron textarea, NL-cron secondary entry surfacing 503 body literal verbatim (V11), inline task_template, skill picker from useSkills cache, draft persistence under cmc.composer.schedule.draft
  - /skills route final form — DecisionsCard + InboxCard above-grid; cmc-card-grid hosts TaskBoard + SchedulesCard + SkillsRegistry + McpPanel(SKLP-01) + SkillCostCard + ContextHealthCard. SKILLS_SLOTS array DELETED; PlaceholderCardGrid import REMOVED
  - PlaceholderCardGrid retirement — frontend/src/components/PlaceholderCardGrid.tsx + its __tests__ file DELETED; last consumer eliminated; STATE.md L251 (Plan 05-04) contract closed; typecheck-time guard (no remaining imports compile-pass)
  - Phase 7 close — 11/11 reqIds live (HPNL-01/02 + TPNL-01/02/03/04/05 + SKLP-01/02/03/04); visual quality bar APPROVED by user 2026-04-27 against ROADMAP success criteria 1-5
affects: phase-08-mission-control-dispatcher (UI feature-complete; Phase 8 is purely backend dispatcher work — DISP-* requirements)

# Tech tracking
tech-stack:
  added: [] # No new deps in 07-04 — all stack added by 07-01 (cronstrue 3.14.0, AlertDialog from Radix)
  patterns:
    - "Bespoke aria-pressed day chips (NOT Radix toggle group) per RESEARCH §Day-of-week chips v1 ruling"
    - "skipPersistRef pattern reused from TaskComposer (07-03) for ScheduleComposer draft clear+reset on submit"
    - "Pitfall 3 mid-typing cron preview fallback (Keep typing… until blur)"
    - "Pitfall 9 lazy run-history — useScheduleRuns(id, open) only fires when CollapsibleSection expanded; verified by test asserting NO GET /runs on mount"
    - "V11 single-message NL-cron 503 surfacing — frontend renders body literal verbatim, never branches on cause"
    - "PlaceholderCardGrid file deletion is the strongest possible Pitfall 10 guard (typecheck-time, not just runtime test)"

key-files:
  created:
    - frontend/src/components/panels/SchedulesCard.tsx (TPNL-03 — 184 lines)
    - frontend/src/components/panels/ScheduleComposer.tsx (TPNL-04 — 498 lines)
    - frontend/src/components/panels/__tests__/SchedulesCard.test.tsx (8 cases)
    - frontend/src/components/panels/__tests__/ScheduleComposer.test.tsx (10 cases)
  modified:
    - frontend/src/components/panels/index.ts (exports SchedulesCard + ScheduleComposer; barrel grows from 23 to 25 names)
    - frontend/src/routes/skills.tsx (final form — SKILLS_SLOTS DELETED; PlaceholderCardGrid import REMOVED; 8 panels: 2 above-grid + 6 in cmc-card-grid)
    - frontend/src/__tests__/integration.test.tsx (added /api/schedules fetch-mock branch; /skills assertion expects TPNL-03 + zero lucide-inbox icons)
    - frontend/src/styles.css (Wave 2 part 2 section: cmc-schedules-list/row + stale modifier + cron-preview + day-chips + nl-cron — tokens only)
  deleted:
    - frontend/src/components/PlaceholderCardGrid.tsx (54 lines — last consumer eliminated)
    - frontend/src/components/__tests__/PlaceholderCardGrid.test.tsx (37 lines — helper file gone, no surface to test)

key-decisions:
  - "Bespoke day-of-week chips (7 buttons with aria-pressed) ship for v1; deferred Radix toggle group to v2 per RESEARCH ruling"
  - "skipPersistRef pattern reused from TaskComposer for ScheduleComposer onSuccess clear+reset (avoids empty-default localStorage re-write race)"
  - "Lazy useScheduleRuns(id, open) — Pitfall 9 verified at TEST level (not just inspection): RED test asserts NO fetch to /api/schedules/<id>/runs on mount; expand-triggered test asserts the GET fires once"
  - "PlaceholderCardGrid file deletion (NOT just route-level import removal) chosen as Pitfall 10 final lockdown — typecheck enforces no consumer can ever resurrect"
  - "Pitfall 10 lucide-inbox discriminator already retired in Plan 06-05; integration test for 07-04 asserts count==0 across / and /activity (already true) + /skills now also count==0 (was 2 in Plan 07-02 — TPNL-01/03 placeholders)"

patterns-established:
  - "Phase close pattern: human-verify checkpoint (visual quality bar against ROADMAP success criteria) gates the docs commit; user types 'approved' to release"
  - "Pitfall 9 lazy hook test pattern: spy on fetch URL, assert NO call on mount, expand the section, assert exactly one call afterward — reusable for any TanStack Query hook gated on a UI open state"
  - "Pitfall 3 cron preview pattern: mid-typing fallback uses cmc-text-subtle 'Keep typing…'; error renders only after blur (advancedBlurred local state). Reusable for any UX where validators run on every keystroke but errors should only appear on commit"

# Metrics
duration: ~28 min
completed: 2026-04-27
---

# Phase 7 Plan 04: SchedulesCard + ScheduleComposer + Phase 7 Close-out Summary

**TPNL-03 SchedulesCard with cronstrue preview + lazy run-history (Pitfall 9) + TPNL-04 ScheduleComposer with bespoke day chips + Pitfall-3-safe cron preview + V11 NL-cron 503 surfacing; PlaceholderCardGrid file DELETED — Phase 7 closes with 11/11 reqIds live and visual quality bar approved by user.**

## Performance

- **Duration:** ~28 min (3 commits + checkpoint wait excluded)
- **Started:** 2026-04-27T17:15Z (continuation from 07-03 close)
- **Completed:** 2026-04-27T17:45Z (checkpoint approval received)
- **Docs commit:** 2026-04-27T18:00Z (this commit)
- **Tasks:** 3 (Task 1 TDD: RED+GREEN; Task 2 retirement+integration smoke; Task 3 human-verify checkpoint)
- **Files created:** 4 (2 panels + 2 test files)
- **Files modified:** 4 (panels barrel + skills route + integration smoke + styles.css)
- **Files deleted:** 2 (PlaceholderCardGrid component + its test)

## Accomplishments

- **TPNL-03 SchedulesCard** ships with cronstrue-rendered preview text per row, optimistic `enabled` toggle (`usePatchSchedule({enabled: ...})`), `next_run_at` + `last_run_at` via `RelativeTime`, 48h stale detection (border-left warning modifier), and an expandable run-history `CollapsibleSection` that lazy-loads `useScheduleRuns(id, open)` only when expanded (Pitfall 9 verified at test level — RED test asserts NO `/api/schedules/<id>/runs` fetch on mount; expand-triggered test asserts the GET fires exactly once).
- **TPNL-04 ScheduleComposer** ships as a `Sheet` with native `<input type="time">`, 7 bespoke day-of-week chips (aria-pressed buttons — RESEARCH ruling for v1), live cronstrue preview reflecting day/time changes, advanced cron textarea (manual override), Pitfall-3-safe preview ("Keep typing…" mid-edit; inline error only after blur), NL-cron secondary entry that surfaces the 503 body literal `natural-language schedules unavailable` verbatim (V11 — single message regardless of cause), inline task_template fields (title/description/model/mode/priority/quadrant/risk/approval/dry_run), skill picker reading from `useSkills` cache, and draft persistence under `cmc.composer.schedule.draft` reusing the `skipPersistRef` clear+reset pattern from TaskComposer.
- **/skills route final form** lands as 2 above-grid panels (DecisionsCard + InboxCard) + a 6-panel `.cmc-card-grid` (TaskBoard + SchedulesCard + SkillsRegistry + McpPanel(reqId="SKLP-01") + SkillCostCard + ContextHealthCard). The `SKILLS_SLOTS` array is DELETED; the `PlaceholderCardGrid` import is REMOVED.
- **PlaceholderCardGrid retirement is final**: the helper file `frontend/src/components/PlaceholderCardGrid.tsx` (54 lines) and its test file `frontend/src/components/__tests__/PlaceholderCardGrid.test.tsx` (37 lines) are DELETED. The Plan 05-04 contract (STATE.md L251) closes atomically: typecheck enforces that no consumer can ever resurrect the helper — the strongest possible Pitfall 10 guard.
- **Phase 7 closes with 11/11 reqIds live** (HPNL-01 DecisionsCard, HPNL-02 InboxCard, TPNL-01 TaskBoard, TPNL-02 TaskComposer via Cmd+K, TPNL-03 SchedulesCard, TPNL-04 ScheduleComposer via "+ New", TPNL-05 EmergencyStopBanner globally in NavBar, SKLP-01 McpPanel, SKLP-02 SkillCostCard v2 placeholder, SKLP-03 ContextHealthCard, SKLP-04 SkillsRegistry). Visual quality bar approved by user 2026-04-27 against ROADMAP success criteria 1-5.

## Task Commits

Each task committed atomically per per-task-commit protocol:

1. **Task 1 RED — Failing tests for SchedulesCard + ScheduleComposer (18 cases)** — `eca3d87` (`test`)
2. **Task 1 GREEN — SchedulesCard + ScheduleComposer panels** — `30b17d0` (`feat`)
3. **Task 2 — /skills final overhaul + PlaceholderCardGrid retirement + integration smoke** — `404f93d` (`feat`, includes deletions)

**Plan metadata:** (this commit) — `docs(07-04): complete Phase 7 close-out — schedules + composer + visual quality bar approved`

## Test Deltas

| Suite | Pre-07-04 | Post-07-04 | Delta |
|-------|-----------|------------|-------|
| Frontend | 219 (07-03 baseline) | 234 | +18 new (8 SchedulesCard + 10 ScheduleComposer) − 3 retired (deleted PlaceholderCardGrid.test.tsx) = +15 net |
| Backend | 209 (07-03 baseline) | 209 | 0 — no backend changes in 07-04 |

Note: Phase 7 verification target was 234/234 frontend. Pre-existing `test_phase4_estop` flake (network-call related, intermittent) is logged in `deferred-items.md`; it is NOT introduced by 07-04 and is out-of-scope per the resume contract.

## Files Created/Modified/Deleted

### Created

- `frontend/src/components/panels/SchedulesCard.tsx` — TPNL-03 panel (184 lines). `useSchedules()` + lazy `useScheduleRuns(id, open)` + optimistic enabled toggle via `usePatchSchedule`; renders one `<ScheduleRow>` per item with cronstrue preview, RelativeTime next/last, stale modifier, and an expandable bespoke run-history `CollapsibleSection`. The `+ New` button is wired to a local `composerOpen` useState that mounts `ScheduleComposer`.
- `frontend/src/components/panels/ScheduleComposer.tsx` — TPNL-04 panel (498 lines). Sheet-wrapped form: name input, native time picker, 7 day chips (bespoke aria-pressed buttons), live cronstrue preview (`partsToCron` + `prettyCron`), advanced cron textarea override, NL-cron sub-form (`useParseNlCron` — onSuccess fills advancedCron; on 503 surfaces body literal), inline task_template fields, skill picker (from `useSkills` cache), draft persistence under `cmc.composer.schedule.draft` with skipPersistRef pattern. Submit calls `useCreateSchedule` (NOT optimistic — preserves user input on 409/422).
- `frontend/src/components/panels/__tests__/SchedulesCard.test.tsx` (8 cases) — renders 2 schedules / empty state / cronstrue preview text / enabled toggle PATCH / stale row class on >48h `last_run_at` / lazy `useScheduleRuns` (NO `/api/schedules/<id>/runs` GET on mount — Pitfall 9) / expanding the CollapsibleSection triggers exactly one GET / `+ New` opens ScheduleComposer Sheet.
- `frontend/src/components/panels/__tests__/ScheduleComposer.test.tsx` (10 cases) — Sheet open=true renders form fields including time picker, 7 day chips, advanced cron textarea / default Mon-Fri 09:00 preview / Tuesday-off updates the preview text (deterministic via cronstrue) / advanced cron textarea overrides chips / mid-typing invalid cron shows "Keep typing…" (Pitfall 3) / blurring invalid cron shows inline error / NL-cron Parse calls `useParseNlCron` and onSuccess fills advancedCron / NL-cron 503 mock surfaces body literal `natural-language schedules unavailable` verbatim (V11) / Submit fires `useCreateSchedule` with the typed body shape / 409 duplicate-name renders inline error AND form NOT cleared (user can fix and retry).

### Modified

- `frontend/src/components/panels/index.ts` — appends `export { SchedulesCard } from './SchedulesCard'` + `export { ScheduleComposer } from './ScheduleComposer'`. Barrel grows from 23 to 25 names total.
- `frontend/src/routes/skills.tsx` — REPLACED entirely. `SKILLS_SLOTS` array DELETED; `PlaceholderCardGrid` import REMOVED. Final form: `<DecisionsCard />` + `<InboxCard />` above the grid; `.cmc-card-grid` containing `<TaskBoard />`, `<SchedulesCard />`, `<SkillsRegistry />`, `<McpPanel reqId="SKLP-01" />`, `<SkillCostCard />`, `<ContextHealthCard />`. Doc-comment retains a single reference to `PlaceholderCardGrid` explaining it was retired in Plan 07-04.
- `frontend/src/__tests__/integration.test.tsx` — adds `/api/schedules` fetch-mock branch; `/skills` assertion expects TPNL-03 visible as a live PanelCard kicker; counts `lucide-inbox` icons === 0 on `/skills` (was 2 in Plan 07-02 — TPNL-01/03 placeholders); doc comment updated to declare `PlaceholderCardGrid.tsx` was DELETED in Plan 07-04 and the typecheck-time guarantee.
- `frontend/src/styles.css` — Wave 2 part 2 section appended (120 lines): `.cmc-schedules-list`, `.cmc-schedules-row` + `--stale` modifier (border-left `var(--cmc-status-warning)` 3px), `.cmc-schedules-row__head/__toggle/__times`, `.cmc-cron-preview` (aria-live target), `.cmc-day-chips` (role=group flex), `.cmc-day-chip` + `--on` modifier (uses `var(--cmc-accent-blue)`), `.cmc-nl-cron`. Tokens only — no inline hex.

### Deleted

- `frontend/src/components/PlaceholderCardGrid.tsx` (was 54 lines) — last consumer (`/skills` SKILLS_SLOTS) eliminated; the helper has nowhere to render. Closes Plan 05-04 STATE.md L207 contract: "helper deletes when last placeholder is replaced".
- `frontend/src/components/__tests__/PlaceholderCardGrid.test.tsx` (was 37 lines, 3 cases) — helper file gone; the 3 surface-level tests have no production surface to assert against. Test delta: −3 (offset by +18 from new tests).

## Decisions Made

- **Bespoke aria-pressed day chips (NOT Radix toggle group)** — per RESEARCH §Day-of-week chips v1 ruling; 7 `<button>` elements with `aria-pressed={isOn}` + `cmc-day-chip--on` modifier when active. Toggle group is a v2 candidate.
- **skipPersistRef pattern reused from TaskComposer** — onSuccess `setDraft(defaultDraft())` would re-run the persistence `useEffect` immediately and overwrite the just-cleared localStorage with the fresh-default body. The skipPersistRef guard (set true before reset, cleared on next change) preserves the cleared draft. Pattern shared by TaskComposer (07-03) and ScheduleComposer (07-04) — extract to a helper if a third composer ships.
- **Lazy useScheduleRuns(id, open) verified at test level** — RED test asserts NO `/api/schedules/<id>/runs` fetch on mount; expand-triggered test asserts exactly one GET fires after `setHistoryOpen(true)`. The test pattern (URL-aware fetch mock + spy + collapse-mount snapshot) is reusable for any TanStack Query hook gated on a UI open state.
- **PlaceholderCardGrid FILE deletion (not just route-level import removal)** — chosen as the Pitfall 10 final lockdown. Removing only the import would leave the helper in `git ls-files` and a future change could resurrect it; deleting the file makes typecheck enforce that no consumer can ever import it again. The strongest possible guarantee.
- **Phase 7 close human-verify checkpoint passed** — all 14 verification steps in the Plan 07-04 Task 3 checklist (TPNL-05 banner state machine; HPNL-01 + HPNL-02 live curl→refresh paths; TPNL-01 + TPNL-02 Cmd+K composer + approval banner; TPNL-03 + TPNL-04 cron preview live + NL parse + lazy run-history; SKLP-01..04 spot checks; AttentionBar real counts; PlaceholderCardGrid grep returns no matches; visual quality bar matches Phase 6) approved by user 2026-04-27.

## Deviations from Plan

None — Plan 07-04 executed exactly as written. The plan body's three RED-test deviations from prior plans (NL-cron 503 path, Pitfall 3 mid-typing, lazy run-history) were spec'd directly into the test cases up-front; no auto-fixes required.

## Issues Encountered

None during 07-04 execution. Pre-existing intermittent `test_phase4_estop` flake (backend, network/timing related) is logged in `deferred-items.md` and is out-of-scope per the resume contract.

## User Setup Required

None — no external service configuration introduced by 07-04. Existing Plan 07-01 deps (`cronstrue`, `@radix-ui/react-alert-dialog`, optional `ANTHROPIC_API_KEY` for NL-cron) cover the runtime surface.

## Phase 7 Close Summary

**11/11 reqIds live on /skills** (visible directly OR accessible via established affordances):

| reqId | Surface | Render path |
|-------|---------|-------------|
| HPNL-01 | DecisionsCard | Above-grid on /skills |
| HPNL-02 | InboxCard | Above-grid on /skills |
| TPNL-01 | TaskBoard | cmc-card-grid on /skills |
| TPNL-02 | TaskComposer | Sheet — opened via Cmd+K → "Quick task" from any route |
| TPNL-03 | SchedulesCard | cmc-card-grid on /skills |
| TPNL-04 | ScheduleComposer | Sheet — opened via SchedulesCard "+ New" button |
| TPNL-05 | EmergencyStopBanner | NavBar header — visible globally on every route |
| SKLP-01 | McpPanel (reused with reqId="SKLP-01") | cmc-card-grid on /skills |
| SKLP-02 | SkillCostCard (v2 placeholder) | cmc-card-grid on /skills |
| SKLP-03 | ContextHealthCard | cmc-card-grid on /skills |
| SKLP-04 | SkillsRegistry | cmc-card-grid on /skills |

**Visual quality bar APPROVED by user 2026-04-27** against ROADMAP success criteria 1-5: decisions polling tight; task board actions (approve/reject/rerun/delete) feel direct; task composer fields complete; schedule composer cron preview live-updates; emergency stop banner reachable from every route. Skills page matches Linear/Raycast/Vercel quality bar Phase 6 set: no spinners (only skeletons), smooth Sheet slide-in, AlertDialog centers correctly, EmergencyStopBanner pulse animation when armed.

**PlaceholderCardGrid is fully retired**: `grep -rn PlaceholderCardGrid frontend/src/` returns only doc-comment references in `routes/skills.tsx`, `routes/activity.tsx`, and `__tests__/integration.test.tsx` (no imports, no JSX usage). `ls frontend/src/components/PlaceholderCardGrid.tsx` returns "No such file".

## Phase 8 Entry Contract

- **UI is feature-complete.** Every Phase 1–7 reqId has a live surface on `/`, `/activity`, or `/skills` (or via Cmd+K / NavBar). No frontend work is required for Phase 8.
- **Phase 8 is purely backend** — DISP-* requirements implementing the Mission Control Dispatcher (claude -p subprocess spawning, the schedule poller advancing `next_run_at` post-fire, the awaiting_approval → running transition). Phase 4's `cmc.dispatcher.oneshot` stub + `Settings.dispatcher_oneshot_cmd` argv field are the locked entry points.
- **Schedules entry contract for Phase 8 (DISP-01)**: dispatcher reads `WHERE enabled=1 AND next_run_at IS NOT NULL AND next_run_at <= now_utc`; `idx_schedules_enabled_next_run` supports the query (Plan 04-04). Schedules router is the INITIAL writer (POST + PATCH); dispatcher is the recurring writer (post-fire UPDATE). Both honor the disabled-clears-`next_run_at` rule.
- **TaskBoard entry contract for Phase 8**: `awaiting_approval` rows render in the above-board banner (Plan 07-03 Pitfall 11 lock); approve transitions to `pending`; dispatcher picks up `pending` rows and transitions to `running`.

## Deferred Follow-ups

- **SKLP-02 SkillCostCard remains v2-placeholder** until Phase 8+ ingest emits `claude_code.skill_invoked` OTEL events. The v2 deferral kicker stays visible; no UI changes required when the data lands — wire the `useSkillUsage` hook (already typed in `lib/queries.ts`) and replace the EmptyState with a DataTable.
- **Test deferred:** `test_phase4_estop` intermittent flake (logged in `deferred-items.md`); pre-existing, out-of-scope for 07-04.

## Next Phase Readiness

- Phase 7 closes ready for verifier handoff.
- ROADMAP.md update for the phase + verifier run will be performed by the orchestrator AFTER this docs commit (per the resume contract — 07-04 docs commit does NOT touch ROADMAP).
- Phase 8 (Mission Control Dispatcher) ready to plan.

## Self-Check: PASSED

**Files verified to exist:**
- `frontend/src/components/panels/SchedulesCard.tsx` — FOUND
- `frontend/src/components/panels/ScheduleComposer.tsx` — FOUND
- `frontend/src/components/panels/__tests__/SchedulesCard.test.tsx` — FOUND
- `frontend/src/components/panels/__tests__/ScheduleComposer.test.tsx` — FOUND

**Files verified to be deleted:**
- `frontend/src/components/PlaceholderCardGrid.tsx` — `ls`: "No such file"
- `frontend/src/components/__tests__/PlaceholderCardGrid.test.tsx` — `ls`: "No such file"

**Commits verified to exist via `git log --oneline --grep="07-04"`:**
- `eca3d87` test(07-04): RED — SchedulesCard + ScheduleComposer behavior — FOUND
- `30b17d0` feat(07-04): SchedulesCard + ScheduleComposer panels — FOUND
- `404f93d` feat(07-04): retire PlaceholderCardGrid + finalize /skills — FOUND

**Test suites verified green at close:**
- Frontend: 234/234 passed (59 test files; 4.50s)
- Backend: 209/209 passed (103.23s)

**Grep verification (PlaceholderCardGrid retirement):**
- `grep -rn PlaceholderCardGrid frontend/src/` returns ONLY doc-comment references in `routes/skills.tsx`, `routes/activity.tsx`, and `__tests__/integration.test.tsx` — NO source imports remain.

---
*Phase: 07-command-centre-panels*
*Completed: 2026-04-27*
