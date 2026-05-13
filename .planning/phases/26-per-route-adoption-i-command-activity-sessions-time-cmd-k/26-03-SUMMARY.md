---
phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
plan: 03
subsystem: ui
tags: [time-picker, refresh-dropdown, auto-refresh, radix-popover, react-day-picker, sonner, tanstack-router, tanstack-query, clipboard-hotkeys]

# Dependency graph
requires:
  - phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k/01
    provides: sonner@2.0.7 + react-day-picker@10 + date-fns@4 installed; parseGrafanaToken / coerceToAbsolute / rangeToVocab / serializeRange / parseRangeFromText shipped; sonner Toaster mounted in AppShell
  - phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k/02
    provides: asTimeToken exported from searchSchemas; validateSearch on /, /activity, /sessions/compare accepts time_from?/time_to?
provides:
  - "TimePicker (Radix Popover trigger + 3-group preset list + dual-month RDP calendar) mounted in AppShellHeader on every route"
  - "RefreshDropdown (off / 30s / 1m / 5m + pulse indicator + Paused state) adjacent to TimePicker"
  - "AutoRefreshController zero-render effect (window setInterval + queryClient.invalidateQueries on time-anchored keys; pauses on absolute window)"
  - "Window-level Cmd+Shift+C / Cmd+Shift+V hotkeys for clipboard copy-paste of time range; sonner toast feedback on every event"
  - "isTimeAnchoredKey predicate exported from lib/queries.ts for any future caller (e.g. manual refresh button)"
  - "cmc:auto-refresh-changed same-tab event for cross-component interval-change notification"
affects:
  - 26-04 (sidebar Recents — co-resident in AppShellHeader/AppShell; no contract overlap)
  - 26-05+ (per-route time-anchored adoption — Activity / Sessions / Cost panels will read time_from/time_to + the auto-refresh ticks will invalidate their cached queries)

# Tech tracking
tech-stack:
  added: []  # All deps were installed in Plan 01; this plan is the first consumer of @radix-ui/react-popover + react-day-picker
  patterns:
    - "Function-form navigate (search: (prev) => ({...prev, time_from, time_to})) for stale-closure-safe URL updates from header chrome"
    - "Window-level keydown listener bound by mounted component for global hotkeys (mirrors Sidebar Cmd+B pattern)"
    - "Two-component / single-source-of-truth observation: RefreshDropdown + AutoRefreshController both read URL state independently rather than sharing context"
    - "Same-tab notification via window.dispatchEvent(new Event('cmc:auto-refresh-changed')) (storage events do not fire in the same tab that wrote them)"
    - "Tick-counter pattern for re-running effects on external event without polluting deps"
    - "isTimeAnchoredKey predicate centralized in lib/queries.ts so AutoRefreshController + future callers share the same matcher"

key-files:
  created:
    - frontend/src/components/time/TimePicker.tsx
    - frontend/src/components/time/PresetList.tsx
    - frontend/src/components/time/CustomRangeCalendar.tsx
    - frontend/src/components/time/RefreshDropdown.tsx
    - frontend/src/components/time/AutoRefreshController.tsx
    - frontend/src/components/time/__tests__/TimePicker.test.tsx
    - frontend/src/components/time/__tests__/RefreshDropdown.test.tsx
    - frontend/src/components/time/__tests__/AutoRefreshController.test.tsx
  modified:
    - frontend/src/components/shell/AppShellHeader.tsx
    - frontend/src/components/shell/AppShell.tsx
    - frontend/src/components/shell/__tests__/AppShellHeader.test.tsx
    - frontend/src/lib/queries.ts
    - frontend/src/styles.css
    - docs/testid-registry.md
    - docs/affordance-checklist.md

key-decisions:
  - "Reject opening the Popover for an applied custom range (calendar emits absolute ISO timestamps that auto-pause AutoRefreshController) — mirrors brush-zoom semantics so the two write paths converge"
  - "Tick-counter inside AutoRefreshController over inline event-listener tear-down — keeps the useEffect dep list explicit and avoids stale-closure invalidation calls"
  - "isTimeAnchoredKey TIME_ANCHORED set lives in lib/queries.ts alongside qk.* factory rather than in AutoRefreshController so the predicate can be reused by any future manual-refresh control without re-encoding the list"
  - "humanLabel reverse-lookup table mirrors PresetList exactly (8 short/standard slugs) so the paste toast surfaces a friendly label; absolute ranges fall through to from→to display"
  - "Same-tab cmc:auto-refresh-changed event over alternatives (BroadcastChannel, shared context) because RefreshDropdown is the only writer and storage events fire only in OTHER tabs; the named event keeps the write→re-evaluate hop visible in DevTools"

patterns-established:
  - "Time-anchored chrome lives in the AppShellHeader, not per-route — TimePicker + RefreshDropdown are mounted ONCE for every route to consume"
  - "Window-level Cmd+Shift+* hotkeys for clipboard plumbing (TIME-03) — bound by the visible header component, paired with sonner toast feedback per Affordance #16"
  - "Zero-render effect siblings (DefaultViewLoader, RecentStateTracker, RecentRoutesTracker, AutoRefreshController) cluster inside LoadedViewProvider for a single useNavigate/useRouterState/useQueryClient context"
  - "Portal-mounted overlays (Popover, DropdownMenu) live in the same stacking context as the trigger's Portal — no per-overlay z-index escalation"

# Metrics
duration: 9m17s
completed: 2026-05-13
---

# Phase 26 Plan 03: Time Picker + Refresh Dropdown + Auto-Refresh Controller Summary

**Global TIME-01 chrome shipped: Radix Popover TimePicker (3-group presets + dual-month RDP calendar) + adjacent RefreshDropdown (off/30s/1m/5m + pause-on-absolute) + zero-render AutoRefreshController that fires queryClient.invalidateQueries on a window setInterval against the new isTimeAnchoredKey predicate; Cmd+Shift+C/V copy-paste hotkeys bound at AppShell scope with sonner toast feedback.**

## Performance

- **Duration:** 9m17s
- **Started:** 2026-05-13T10:49:21Z
- **Completed:** 2026-05-13T10:58:38Z
- **Tasks:** 2 (both atomic, both type=auto, no checkpoints)
- **Files created:** 8 (5 production components + 3 vitest specs)
- **Files modified:** 7 (AppShellHeader / AppShell / AppShellHeader.test / lib/queries / styles.css / testid-registry / affordance-checklist)
- **Specs added:** 13 (7 TimePicker + 3 RefreshDropdown + 3 AutoRefreshController + 0 AppShellHeader regression rewrite)
- **Vitest:** 556 / 556 pass (up from 533 baseline — Plan 02 added some specs before this plan)
- **tsc --noEmit:** clean
- **ESLint:** clean (no raw z-index; no unregistered testids)

## Accomplishments

- Global TimePicker visible on every route — clicking a preset writes function-form `navigate({ search: (prev) => ({...prev, time_from, time_to}) })` so deep-links and existing query params survive
- Dual-month react-day-picker mode="range" calendar inside the same Popover; Apply emits absolute ISO timestamps which auto-pause AutoRefreshController
- RefreshDropdown persists `cmc.autoRefresh.interval` to localStorage AND dispatches `cmc:auto-refresh-changed` for same-tab notification
- AutoRefreshController invalidates ALL time-anchored queries on tick via the new `isTimeAnchoredKey` predicate — orthogonal layer on top of per-query `refetchInterval` so panel cadence policy stays untouched
- Cmd+Shift+C / Cmd+Shift+V hotkeys fire from any route; sonner `toast.success` / `toast.message` / `toast.error` covers happy + error paths; clipboard payload is re-validated via `asTimeToken` (defense in depth) before navigate
- 8 new testids registered (5 time-picker + 3 refresh); `time-picker-trigger` un-placeholdered in registry
- Affordance row 16 added (Cmd+Shift+C/V copy-paste); count bumped 15 → 16

## Task Commits

Each task was committed atomically:

1. **Task 1: PresetList + CustomRangeCalendar + TimePicker (Radix Popover trigger) + Cmd+Shift+C/V copy-paste** — `9e60307` (feat)
2. **Task 2: RefreshDropdown + AutoRefreshController + AppShell wiring** — `9d3ee0c` (feat)

## Files Created/Modified

**Created:**
- `frontend/src/components/time/TimePicker.tsx` — Radix Popover.Trigger button + Popover.Portal content hosting PresetList + CustomRangeCalendar; window-level Cmd+Shift+C/V keydown handlers
- `frontend/src/components/time/PresetList.tsx` — 3-group preset button list (Short / Standard / Anchors); slug-derived `time-picker-preset-{slug}` testids
- `frontend/src/components/time/CustomRangeCalendar.tsx` — react-day-picker mode="range" dual-month calendar + Apply button (emits ISO timestamps)
- `frontend/src/components/time/RefreshDropdown.tsx` — Radix DropdownMenu (off / 30s / 1m / 5m); pulse indicator while active; "Paused" when URL window absolute
- `frontend/src/components/time/AutoRefreshController.tsx` — zero-render `useEffect`; window setInterval → `queryClient.invalidateQueries({ predicate: isTimeAnchoredKey })`
- `frontend/src/components/time/__tests__/TimePicker.test.tsx` — 7 specs (default label, popover open, preset navigate, Cmd+Shift+C/V happy + error paths)
- `frontend/src/components/time/__tests__/RefreshDropdown.test.tsx` — 3 specs (localStorage persist + event dispatch, Paused visualization, active pulse)
- `frontend/src/components/time/__tests__/AutoRefreshController.test.tsx` — 3 specs (interval invalidation, absolute-window skip, `isTimeAnchoredKey` truth table)

**Modified:**
- `frontend/src/components/shell/AppShellHeader.tsx` — removed hidden time-picker-trigger placeholder; mounted `<TimePicker />` + `<RefreshDropdown />` in DOM order before saved-view-chrome
- `frontend/src/components/shell/AppShell.tsx` — mounted `<AutoRefreshController />` as the fourth zero-render effect sibling inside `LoadedViewProvider`
- `frontend/src/components/shell/__tests__/AppShellHeader.test.tsx` — locked-order testid expectation updated to include `refresh-dropdown-trigger`; placeholder-hidden spec rewritten to verify wired TimePicker renders "Last 7 days" default label; sonner mocked at test-file scope
- `frontend/src/lib/queries.ts` — appended `TIME_ANCHORED` set + `isTimeAnchoredKey(queryKey)` predicate (covers bare prefixes like `tokens`, `sessions` AND kebab-prefix scoped keys like `skill-cost`, `cost-forecast`, `session-compare`, `alert-events`)
- `frontend/src/styles.css` — appended `.cmc-time-picker__{trigger,popover,presets,group,preset,preset--active,calendar,custom-apply}` block + `.cmc-refresh-dropdown__{trigger,trigger--active,pulse}` + `.cmc-dropdown-menu` alias (mirrors `.cmc-dropdown`); pulse uses opacity-only `@keyframes cmc-refresh-pulse` per Phase 24 CONT-02 transform invariant
- `docs/testid-registry.md` — 6 new exact-match entries (time-picker-trigger un-placeholdered, time-picker-popover, time-picker-calendar, time-picker-custom-apply, refresh-dropdown-trigger, refresh-active-indicator) + 2 new dynamic patterns (`time-picker-preset-{slug}`, `refresh-option-{value}`)
- `docs/affordance-checklist.md` — row 16 added for Cmd+Shift+C/V; header count bumped 15 → 16

## Decisions Made

- **humanLabel reverse-lookup table** mirrors PresetList's 8 short/standard slugs exactly so the paste toast reads "Pasted: last 7 days" rather than "Pasted: now-7d → now". Absolute ranges fall through to `from → to` display.
- **Tick-counter inside AutoRefreshController** drives effect re-runs on external `storage` / `cmc:auto-refresh-changed` events. The alternative — destroying the interval inline inside the storage handler — would create a stale-closure trap on `queryClient` / `isTimeAnchoredKey` if the predicate ever takes a closure-captured arg. Tick-counter keeps the useEffect deps list explicit (`[timeFrom, queryClient, tick]`).
- **`TIME_ANCHORED` set co-located with `qk.*` factory** so future query-key additions are visible in a single observable site. Set covers both bare prefixes (`tokens`, `sessions`, `summary`) and the post-Phase-14 kebab-prefix scoped keys (`skill-cost`, `cost-forecast`, `session-compare`). Default-view, saved-views, decisions, schedules, mcp, attention, system are intentionally OMITTED — they're not time-anchored.
- **Same-tab `cmc:auto-refresh-changed` event** over BroadcastChannel or a shared React context. RefreshDropdown is the only writer and storage events fire only in OTHER tabs; a named CustomEvent keeps the write→re-evaluate hop debug-visible without shipping a new context.
- **Opacity-only pulse keyframe** (no transform) per Phase 24 Plan 03 (CONT-02 lock): transforms on a Portal trigger create a containing block for Portal descendants, breaking the z-ladder for downstream overlays.

## Deviations from Plan

**None — plan executed exactly as written.** Two minor textual deviations against the plan's literal code blocks, both for production safety:

1. **`useState` rename to avoid shadowing `setInterval`** (Task 2): The plan's RefreshDropdown code block uses `const [interval, setInterval] = useState<Interval>('off')`, which shadows the global `setInterval` symbol. AutoRefreshController separately calls `window.setInterval` so there's no runtime collision, but the shadow trips up ESLint `no-shadow-restricted-names` in some configs. Renamed local setter to `setIntervalState`. No behavior change.
2. **Tick-counter pattern over storage-handle clear** (Task 2): The plan's AutoRefreshController code block destroys the interval inline inside the storage handler. Switched to a tick-counter that gates a single `useEffect` so the dep list stays explicit and the effect re-mounts cleanly when localStorage changes. Functionally equivalent — covered by the 3 AutoRefreshController specs.

No new top-level CSS z-index variables. No new dependencies. ResponsiveContainer count delta = 0 (TimePicker + Refresh primitives use no recharts). 

## Issues Encountered

- **Coordination race with sibling Plan 04 agent on `AppShell.tsx` and `docs/testid-registry.md`:** Sibling agent landed `4010a8b` + `057fb54` (RecentRoutesTracker + RecentlyVisitedSection) mid-execution. Resolution: re-read each shared file just-in-time, applied surgical Edit operations (insert AutoRefreshController next to RecentRoutesTracker; append time-picker / refresh testids alongside the freshly-added Recents section). No content overwrites; both plans coexist in the same files.
- **TypeScript `as string` cast on `mock.calls[0][0]` rejected:** Vitest v4 narrows `mock.calls` to `[]` until the spy fires at least once. Switched to `expect(calls.length).toBeGreaterThan(0)` gate + `String(calls[0][0] ?? '')` extract; `vi.fn((_msg?: unknown) => undefined)` signatures preserve the spy parameter shape for type inference.
- **Existing AppShellHeader.test.tsx regression:** The Phase 24 / Phase 25 spec hard-coded the time-picker-trigger as a hidden placeholder. Rewrote that spec to verify the wired TimePicker renders "Last 7 days" by default and is enabled; locked-order testid array updated to include `refresh-dropdown-trigger`. Counts toward the 556/556 vitest baseline.

## Known Stubs

None. All five components ship wired functionality:
- TimePicker preset clicks → live URL navigate via function-form
- TimePicker custom range → live URL navigate with ISO timestamps
- RefreshDropdown selection → live localStorage write + same-tab event
- AutoRefreshController tick → live queryClient.invalidateQueries
- Cmd+Shift+C/V → live clipboard read/write + sonner toast

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 2 surface complete:
- **TIME-01 entire surface shipped:** picker visible on every route, presets write URL, custom range writes absolute ISO, auto-refresh ticks the time-anchored queries
- **TIME-03 entire surface shipped:** Cmd+Shift+C/V bound at AppShell scope; toast feedback covers all three branches
- **Wave 3 ready:** per-route adoption (Activity / Sessions / Cost) can now read `time_from` / `time_to` from `useSearch()` and consume the `rangeToVocab` bridge to compute their own bucket size; AutoRefreshController will invalidate their queries on every tick without per-route opt-in
- **Plan 04 coexists cleanly:** RecentRoutesTracker + RecentlyVisitedSection live alongside the TIME-01 surface; both AppShell tracker namespaces are independent

## Self-Check: PASSED

Created files (8/8 found):
- `frontend/src/components/time/TimePicker.tsx` — FOUND
- `frontend/src/components/time/PresetList.tsx` — FOUND
- `frontend/src/components/time/CustomRangeCalendar.tsx` — FOUND
- `frontend/src/components/time/RefreshDropdown.tsx` — FOUND
- `frontend/src/components/time/AutoRefreshController.tsx` — FOUND
- `frontend/src/components/time/__tests__/TimePicker.test.tsx` — FOUND
- `frontend/src/components/time/__tests__/RefreshDropdown.test.tsx` — FOUND
- `frontend/src/components/time/__tests__/AutoRefreshController.test.tsx` — FOUND

Commits exist (2/2 found):
- `9e60307` — FOUND
- `9d3ee0c` — FOUND

---
*Phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k*
*Plan: 03*
*Completed: 2026-05-13*
