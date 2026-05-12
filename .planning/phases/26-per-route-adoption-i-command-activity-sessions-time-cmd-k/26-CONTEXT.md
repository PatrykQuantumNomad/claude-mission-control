# Phase 26: Per-Route Adoption I (Command/Activity/Sessions) + Time + Cmd+K - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Three concerns ship together in Phase 26, all gated by the Phase 24 primitives and Phase 25 saved-view infrastructure already in place:

1. **Global time picker** in the top bar (TIME-01..05) — Grafana-style relative+absolute syntax, preset list, copy/paste across routes, recharts brush-zoom, compare-to-previous overlay, auto-refresh intervals.
2. **Cmd+K extensions** (CMDK-02 density, CMDK-03 time-range, CMDK-04 recents) plus the **sidebar Recently Visited** section (SHEL-05).
3. **Per-route adoption** of `BoundedPanelCard bounded` + density tokens on the three highest-traffic routes (`/`, `/activity`, `/sessions/compare`) — validates the adoption pattern before Phase 27 repeats it on `/skills`, `/cost`, `/alerts`.

Out of scope (other phases): tail-end route adoption (Phase 27), v1.2 tech-debt closure (Phase 27), layout customization / drag-reorder / split-pane (Phase 28).

</domain>

<decisions>
## Implementation Decisions

### Time picker syntax & URL contract
- **Canonical syntax: Grafana-style relative + absolute.** Tokens like `now-7d`, `now-1h`, `now/d` (today), `now-1d/d` (yesterday) live in URL state and on the clipboard; backend coerces relative → absolute at query time.
- Relative-time symbols are **preserved** through copy/paste, saved-view round-trips, and brush-zoom-reset. A "last 7 days" link stays "last 7 days" tomorrow.
- Absolute ISO timestamps are accepted for custom-range picker output and brush-zoom commits (zoomed range freezes to absolute).
- URL params: `?time_from=&time_to=` (already declared as preserved in Phase 24's URL contract).

### Time picker preset list
Dropdown groups (top → bottom):
- **Short windows**: last 5m, 15m, 1h, 6h, 24h — operational debugging on `/activity`
- **Standard windows**: last 7d, 30d, 90d — analytics defaults (already dominant in `/cost`, `/skills`)
- **Calendar anchors**: today, yesterday, this week, last week, this month — day-boundary aligned
- **Custom range picker**: calendar dual-month + time inputs at the bottom of the preset list, falls back to absolute timestamps

### Default range when URL has no time params and no saved-view default
- **Per-route hardcoded defaults**:
  - `/` → last 24h
  - `/activity` → last 1h
  - `/sessions/compare` → last 7d
- Each route declares its own default in code. Saved-view default still wins. Explicit URL params always win over both.

### Auto-refresh interval control
- **Two adjacent dropdowns in the header**: `[time range ▾] [refresh: off ▾]`. Intervals: off / 30s / 1m / 5m.
- Visual badge or pulse dot when refresh is active.
- Familiar Grafana/Datadog pattern.

### Brush-zoom semantics (recharts)
- **Snap = freeform**: range maps to exact pixel-to-time at brush release.
- **Reset zoom = "Reset zoom" button in chart header** when a brush-zoom is active. Discoverable chrome affordance, doesn't conflict with chart gestures.
- **Brush-zoom + auto-refresh = pause refresh while zoomed**. Brush-zoom freezes range to absolute; refresh badge displays "paused" until user clears zoom. Matches Grafana intuition (zoom = investigation; refresh = live monitoring).
- Per ROADMAP success criterion 3: brushing on `/activity` must update the global time picker, re-anchor every other panel on the page, AND update the URL.

### Compare-to-previous overlay (TIME-04)
- **Off by default; toggle lives in panel header**, not the time picker.
- **"Previous" window = same-length-prior**: last 7d → 14d-ago..7d-ago. Range width is preserved.
- Per-panel state is opaque and persists inside the saved view's `state_json` (consumes Phase 25's `state_json` model).

### Copy / paste time range (TIME-02)
- **Keyboard-only affordance**: `Cmd+Shift+C` to copy, `Cmd+Shift+V` to paste. No visible header button.
- **Discoverability via Cmd+K commands** ("Copy time range", "Paste time range") + entry in `docs/affordance-checklist.md`.
- **Clipboard format**: app URL fragment `?time_from=now-7d&time_to=now`. Plain text — also pastes legibly into Slack, GitHub issues.
- **Toast feedback** on every event: "Time range copied", "Pasted: last 7 days", "No time range on clipboard" (invalid payload).
- **Behavior on routes with no time-anchored panels**: paste writes to URL anyway; range is consumed when the user navigates to the next time-aware route.

### Cmd+K group ordering (top → bottom)
1. Recents (CMDK-04 — new)
2. Saved Views (Phase 25, CMDK-01 — shipped)
3. Pages (existing)
4. Time range (CMDK-03 — new)
5. Density (CMDK-02 — new)
6. Actions (existing)

Frequency-first ordering: what the user did recently → curated state → navigation → context modifiers → actions.

### Cmd+K density command (CMDK-02)
- **Three discrete commands** with active-state checkmark:
  - `✓ Set density: Compact`
  - `Set density: Comfortable`
  - `Set density: Cozy`
- Selecting one applies density via the existing `applyDensity()` from Phase 24 and closes the palette.
- Re-paints without navigation per ROADMAP success criterion 4.

### Recents data source (CMDK-04 + SHEL-05)
- **Single localStorage source of truth**: `cmc.recents.routes` (FIFO route history, dedup on push).
- **Cmd+K Recents group**: last 5 routes + last 5 ad-hoc URL states (the latter pulled from `cmc.savedView.recent.<route>` already shipped by Phase 25 plan 10, VIEW-09).
- **Sidebar Recently Visited section**: last 3 routes only — chrome real estate is tight.

### Sidebar Recently Visited placement (SHEL-05)
- **Slot: between Pinned and Operate.** Final sidebar order: Pinned → Recently Visited → Operate → Configure.
- Both "starting point" sections (user-curated Pinned, auto-curated Recently Visited) live above the nav hierarchy.
- Section visible in expanded and icon-only collapsed sidebar modes (consistent with Phase 24's collapse behavior).

### Per-route adoption sweep (`/`, `/activity`, `/sessions/compare`)
- **Adoption contract**: panels on each route migrate to `BoundedPanelCard bounded` + consume density tokens + adopt truncation primitives (`TruncatedCell`, `CopyIconButton`) from Phase 24.
- **Sheets on `/sessions/compare`** (compare picker, session detail) must stay inside viewport at every density × viewport from 1024px wide upward. Long session IDs and cwd paths truncate with tooltip.
- **Time-anchored panels** on these three routes re-query against the global picker's range (relative tokens coerced server-side).
- All three routes already adopted `validateSearch` with `time_from`/`time_to`/`schemaVersion` in Phase 25 plans 3 and 4 — no schema migration needed.

### Claude's Discretion
- Exact recharts brush component (`<Brush />` vs custom drag handler — research will surface the cleanest fit).
- Time picker popover layout, calendar component (the custom range picker may need a dep — flag for planning).
- Toast library choice — sonner is the natural fit and matches Radix idiom; planner must explicitly budget this new runtime dep.
- Visual treatment of compare-overlay (dotted line vs translucent fill vs alternate color) — designer/planner call within "muted secondary series" conventions.
- Auto-refresh pause-on-blur behavior, picker visibility on non-time routes, saved-view interaction with range freezing — punted edges, downstream agents resolve from context.
- Cmd+Shift+C/V payload inclusion of auto-refresh interval (range only vs range + interval) — keep narrow (range only) unless research surfaces a reason to include.
- Pulse / badge styling for active auto-refresh state.

</decisions>

<specifics>
## Specific Ideas

- **Grafana / Datadog mental model** for the time picker — adjacent range + refresh dropdowns, relative-symbol-preserving copy, brush-zoom-pauses-refresh semantics.
- **Linear / Raycast** for Cmd+K group ordering — Recents at top, frequency-first.
- **Linear / Slack** for sidebar layout — user-curated and auto-curated "starting points" above the nav hierarchy.
- **Plotly/Datadog double-click-to-reset is rejected** in favor of an explicit "Reset zoom" button in the chart header — discoverable for new users.
- **Compare-overlay state piggybacks on saved-view `state_json`** (additive, opaque) — same pattern Phase 28 will use for layout customization. No new DB column for compare state.
- **Clipboard format is human-readable** (`?time_from=now-7d&time_to=now`) — same string can be pasted into Slack/issues as a "look at this range" hint.

</specifics>

<deferred>
## Deferred Ideas

- **Tail-end route adoption** (`/skills`, `/skills/$name`, `/cost`, `/alerts`) — Phase 27.
- **Tech-debt closure** (`project_key` wire exposure, `KNOWN_METRICS` removal, NL composer 503 retry/queue UX) — Phase 27.
- **Layout customization** (panel show/hide, 1D drag-reorder, split-pane resize, reset-to-default) — Phase 28.
- **Auto-refresh sliding-window mode** (refresh advances both `time_from` and `time_to`) — rejected in favor of "pause while zoomed"; can revisit post-v1.3 if users ask for live-monitoring panels.
- **Compare overlay with fixed "this day last week" semantics** — rejected in favor of same-length-prior; revisit if seasonality patterns demand it.
- **Visible copy/paste icon affordance on the time picker** — rejected in favor of keyboard + Cmd+K discovery; revisit if onboarding shows users miss it.
- **Single "Cycle density" command** in Cmd+K — rejected in favor of three discrete commands; revisit if compact palettes become a constraint.

</deferred>

---

*Phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k*
*Context gathered: 2026-05-12*
