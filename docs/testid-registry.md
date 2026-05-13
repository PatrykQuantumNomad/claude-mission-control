# data-testid registry

Every Playwright-targeted (or vitest-targeted) DOM element MUST have its `data-testid` value listed here. Adding a new testid without updating this doc fails the `cmc/testid-registry-only` ESLint rule (`frontend/eslint-rules/testid-registry-only.cjs`).

Established: Phase 24 (POLI-14). Skip count locked at the v1.2 baseline of 2 known skips (`alerts.spec.ts:40 TEST-05a`, `skills-detail.spec.ts:25 SKLP-08/09/10`); exceeding 2 skips fails phase verification.

## Static testids (exact-match)

### Shell (Phase 24)
- `density-toggle-trigger` — `frontend/src/components/shell/DensityToggle.tsx`
- `density-option-compact` — DensityToggle DropdownMenu item (rendered via dynamic pattern; the three exact values `compact`/`comfortable`/`cozy` are also registered as exact-matches so non-template usage in tests works)
- `density-option-comfortable` — DensityToggle DropdownMenu item
- `density-option-cozy` — DensityToggle DropdownMenu item
- `sidebar-collapse-toggle` — `frontend/src/components/shell/Sidebar.tsx`
- `time-picker-trigger` — `frontend/src/components/time/TimePicker.tsx` (Phase 26 Plan 03 — Radix Popover.Trigger; Clock icon + current-range label; replaces the Phase 24 hidden placeholder in AppShellHeader)
- `time-picker-popover` — `frontend/src/components/time/TimePicker.tsx` (Phase 26 Plan 03 — Radix Popover.Content; Portal-mounted at --cmc-z-popover: 40; hosts PresetList + CustomRangeCalendar)
- `time-picker-calendar` — `frontend/src/components/time/CustomRangeCalendar.tsx` (Phase 26 Plan 03 — react-day-picker mode="range" wrapper)
- `time-picker-custom-apply` — `frontend/src/components/time/CustomRangeCalendar.tsx` (Phase 26 Plan 03 — "Apply custom range" button; disabled until both range endpoints chosen)
- `refresh-dropdown-trigger` — `frontend/src/components/time/RefreshDropdown.tsx` (Phase 26 Plan 03 — Radix DropdownMenu.Trigger; RefreshCw icon + current interval label or "Paused" badge)
- `refresh-active-indicator` — `frontend/src/components/time/RefreshDropdown.tsx` (Phase 26 Plan 03 — pulse dot inside the trigger; rendered only while an interval is selected AND the URL window is NOT absolute)
- `reset-zoom-button` — `frontend/src/components/ui/ResetZoomButton.tsx` (Phase 26 Plan 05 TIME-05 — chart-header chrome `<button>` rendered only when URL `time_from` matches `/^\d{4}-\d{2}-\d{2}T/` (absolute ISO). Click clears `time_from`/`time_to` from the URL via `useNavigate`, which also unfreezes AutoRefreshController. Currently mounted by ChartsStrip on `/activity`.)
- `charts-strip-brush-chrome` — `frontend/src/components/panels/ChartsStrip.tsx` (Phase 26 Plan 05 TIME-05 — `<div class="cmc-charts-strip__chrome">` row that hosts the conditional `ResetZoomButton`. Always present in the DOM so the chart layout doesn't reflow when the button mounts/unmounts; tests scope to it via `within(...)` to disambiguate from other panel chrome.)
- `save-view-button` — `frontend/src/components/shell/AppShellHeader.tsx` (Removed in Phase 25 Plan 06 — replaced by `saved-view-chrome` wrapper hosting `SavedViewMenu` + `UnsavedPip`. Retained here for audit traceability.)
- `cmdk-trigger` — `frontend/src/components/shell/AppShellHeader.tsx`

### Saved Views (Phase 25)
- `saved-view-chrome` — `frontend/src/components/shell/AppShellHeader.tsx` (wrapper hosting SavedViewMenu + UnsavedPip in the action area)
- `saved-view-menu-trigger` — `frontend/src/components/savedviews/SavedViewMenu.tsx` (Bookmark-icon DropdownMenu trigger)
- `saved-view-menu-content` — SavedViewMenu DropdownMenu.Content (portal-mounted)
- `saved-view-menu-save-new` — SavedViewMenu top-of-list "Save current view…" item
- `unsaved-pip` — `frontend/src/components/savedviews/UnsavedPip.tsx` (visible when URL state diverges from loaded view, VIEW-08)
- `save-view-dialog` — `frontend/src/components/savedviews/SaveViewDialog.tsx` (Radix Dialog.Content)
- `save-view-dialog-name-input` — SaveViewDialog name `<input>`
- `save-view-dialog-description-input` — SaveViewDialog description `<textarea>`
- `save-view-dialog-submit` — SaveViewDialog submit `<button>`
- `save-view-dialog-cancel` — SaveViewDialog cancel `<button>`
- `edit-or-fork-dialog` — `frontend/src/components/savedviews/EditOrForkDialog.tsx` (Radix Dialog.Content — 3-button Edit/Fork/Discard chooser, Plan 07 VIEW-07)
- `edit-or-fork-dialog-save` — EditOrForkDialog "Save changes" `<button>` (calls usePatchView)
- `edit-or-fork-dialog-fork` — EditOrForkDialog "Save as new (fork)" `<button>` (invokes onFork prop)
- `edit-or-fork-dialog-discard` — EditOrForkDialog "Discard changes" `<button>` (navigates back to loaded view's state_json)
- `saved-view-menu-edit-current` — `frontend/src/components/savedviews/SavedViewMenu.tsx` (top-of-menu "Edit '<loaded view name>'…" item; renders only when loadedView && URL diverges)
- `sidebar-section-pinned` — `frontend/src/components/savedviews/PinnedViewsSection.tsx` (Phase 25 Plan 09 SHEL-06: root element of the Sidebar's "Pinned" section, passed via the `testId` prop on `SidebarSection`. Always present in the DOM — the section header renders even when no views are pinned, mirroring the Phase 24 Configure empty-body precedent.)
- `sidebar-pinned-empty` — PinnedViewsSection empty-state copy ("Pin a saved view from the header menu"); rendered only when `getPinnedIds()` is empty OR all pinned ids reference views no longer present in the catalog.

### Recents (Phase 26)
- `sidebar-section-recently-visited` — `frontend/src/components/recents/RecentlyVisitedSection.tsx` (Phase 26 Plan 04 SHEL-05: root element of the Sidebar's "Recently Visited" section, passed via the `testId` prop on `SidebarSection`. Always present in the DOM — the section header renders even when the `cmc.recents.routes` ring is empty, mirroring the Phase 25 Pinned + Phase 24 Configure empty-body precedent. Per-row addressing reuses SidebarNavLink's existing `sidebar-link-{slug}` testid; tests scope via `within(section)` to disambiguate from the Observe / Operate sections.)

### Compare-overlay (Phase 26 Plan 07)
- `compare-overlay-hint` — `frontend/src/components/panels/TokenUsageCard.tsx` (Phase 26 Plan 07 TIME-04: inline `<p>` that surfaces when `compare_panels` includes a panel id whose v1 range vocabulary doesn't support the prior-period overlay (today, 30d). Currently scoped to TokenUsageCard; future adopters that support a richer prior-period contract will not need the hint.)

### UI primitives (Phase 24)
- `cell-copy-btn` — `frontend/src/components/ui/CopyIconButton.tsx`

### Theme (v1.2 baseline)
- `theme-toggle` — `frontend/src/components/shell/ThemeToggle.tsx`

### Cmd+K (v1.2 baseline)
- `cmdk-compare-picker-list` — `frontend/src/components/cmdk/*` (Compare-picker list container)
- `cmdk-compare-with-previous` — Compare-with-previous command item
- `cmdk-saved-views-empty` — `frontend/src/components/ui/CommandPalette.tsx` (Phase 25 Plan 08 CMDK-01: empty-state body inside the "Saved Views" Command.Group when useSavedViews returns zero items)
- `cmdk-recents-empty` — `frontend/src/components/ui/CommandPalette.tsx` (Phase 26 Plan 06 CMDK-04: empty-state body inside the "Recents" Command.Group when both `getRecentRoutes()` and `getAllRecentStates()` return empty arrays. Rendered as a `<div>` (not a Command.Item) so cmdk's search filter doesn't score it.)
- `cmdk-time-range-copy` — `frontend/src/components/ui/CommandPalette.tsx` (Phase 26 Plan 06 CMDK-03: "Copy time range (Cmd+Shift+C)" Command.Item inside the "Time range" group. Selection mirrors the TimePicker's Cmd+Shift+C codepath via `serializeRange()` + `navigator.clipboard.writeText()`.)
- `cmdk-time-range-paste` — `frontend/src/components/ui/CommandPalette.tsx` (Phase 26 Plan 06 CMDK-03: "Paste time range (Cmd+Shift+V)" Command.Item inside the "Time range" group. Selection mirrors the TimePicker's Cmd+Shift+V codepath via `navigator.clipboard.readText()` + `parseRangeFromText()` + function-form `navigate()`.)

### Cost route (v1.2 baseline)
- `cost-by-project-card` — `frontend/src/components/panels/CostByProjectCard.tsx`
- `cost-by-project-card-table` — CostByProjectCard inner table
- `cost-forecast-card` — `frontend/src/components/panels/CostForecastCard.tsx`
- `cost-forecast-card-mtd` — CostForecastCard MTD field
- `cost-forecast-card-projected` — CostForecastCard projected field
- `cost-forecast-card-bias-banner` — CostForecastCard bias banner
- `cost-forecast-card-insufficient-message` — CostForecastCard insufficient-data message

### Sessions Compare route (v1.2 baseline)
- `session-compare-skill-latency-section` — `frontend/src/components/panels/SessionCompareView.tsx`
- `session-compare-skill-latency-low-sample` — Low-sample badge
- `session-compare-skill-latency-table` — Latency comparison table

### Skills route (v1.2 baseline)
- `skill-cost-card-delta-pill` — `frontend/src/components/panels/SkillCostCard.tsx`
- `skills-detail-projects-table` — Skill detail projects table
- `skills-registry-dormant-badge` — Skills registry row badge
- `skills-registry-new-badge` — Skills registry row badge
- `top-skills-delta-pill` — TopSkillsCard
- `top-skills-dormant-badge` — TopSkillsCard
- `top-skills-new-badge` — TopSkillsCard

### Alerts route (v1.2 baseline)
- `cmc-cron-preview-error` — `frontend/src/components/panels/ScheduleComposer.tsx`
- `schedule-composer-name` — ScheduleComposer name input

### Generic UI test fixtures (v1.2 baseline — vitest-only, used in `src/components/**/__tests__/*.test.tsx`)
- `sheet-body` — Sheet body test marker
- `page` — generic page-body marker in AppShell test
- `row` — generic row marker in CopyIconButton test
- `rows` — generic rows marker in PanelCard test
- `inner` — generic inner-child marker in DensityProvider test
- `lhs` — left-side icon marker in Button test
- `rhs` — right-side icon marker in Button test
- `ico` — icon marker in StatList / EmptyState tests
- `some-test-id` — passthrough-prop marker in DeltaPill test

These generic IDs exist only in `__tests__/*.test.tsx` files. They are not Playwright selectors; they are vitest sentinel attributes. The ESLint rule fires on `src/` AND `tests/`, so they must be registered to avoid noise.

## Dynamic testids (pattern-match)

These testids are constructed at runtime from variable input (e.g., row id, route slug). The ESLint rule recognizes them as template literals with at least one `${...}` expression and matches the reconstructed shape against the patterns below.

- `sidebar-link-{slug}` — `frontend/src/components/shell/SidebarNavLink.tsx`. Slug is derived from `to` prop. Phase 24 routes: `home`, `activity`, `sessions-compare`, `skills`, `cost`, `alerts`.
- `density-option-{value}` — `frontend/src/components/shell/DensityToggle.tsx`. Value is `compact`/`comfortable`/`cozy` (the three exact-match entries above cover Playwright assertions, the pattern covers the JSX construction site).
- `session-compare-skill-latency-delta-{skill_name}` — `frontend/src/components/panels/SessionCompareView.tsx`. Skill name comes from a CMPR-05 row.
- `saved-view-item-{id}` — `frontend/src/components/savedviews/SavedViewMenu.tsx`. Per-view DropdownMenu.SubTrigger row. Id is the SavedView.id from the backend.
- `saved-view-open-{id}` — SavedViewMenu submenu Open action.
- `saved-view-set-default-{id}` — SavedViewMenu submenu Set-as-default action.
- `saved-view-pin-{id}` — SavedViewMenu submenu Pin/Unpin toggle.
- `saved-view-fork-{id}` — SavedViewMenu submenu "Save as new (fork)" action.
- `saved-view-delete-{id}` — SavedViewMenu submenu Delete action.
- `cmdk-saved-view-{id}` — `frontend/src/components/ui/CommandPalette.tsx` (Phase 25 Plan 08 CMDK-01: per-view Command.Item inside the "Saved Views" Command.Group; id is the SavedView.id from the backend).
- `sidebar-pinned-view-{id}` — `frontend/src/components/savedviews/PinnedViewsSection.tsx` (Phase 25 Plan 09 SHEL-06: per-view button row inside the Sidebar Pinned section. Id is the SavedView.id from the backend. Each row also carries `data-active="true|false"` reflecting the locked active-state algorithm — pathname-match AND structural search-state match.)
- `time-picker-preset-{slug}` — `frontend/src/components/time/PresetList.tsx` (Phase 26 Plan 03 — per-preset `<button role="option">`; slug derived from the preset label by lowercasing + replacing whitespace with `-`. Slugs in use: `last-5-minutes`, `last-15-minutes`, `last-1-hour`, `last-6-hours`, `last-24-hours`, `last-7-days`, `last-30-days`, `last-90-days`, `today`, `yesterday`, `this-week`, `last-week`, `this-month`.)
- `refresh-option-{value}` — `frontend/src/components/time/RefreshDropdown.tsx` (Phase 26 Plan 03 — per-interval DropdownMenu.Item. Values: `off`, `30s`, `1m`, `5m`.)
- `cmdk-recents-route-{slug}` — `frontend/src/components/ui/CommandPalette.tsx` (Phase 26 Plan 06 CMDK-04: per-route Command.Item inside the "Recents" group. Slug is derived from the route pathname via `routeToTestidSlug()` — root `/` collapses to `home`; other pathnames have leading slash stripped and remaining slashes hyphenated. Same slug vocabulary as `sidebar-link-{slug}`. Slugs in use: `home`, `activity`, `sessions-compare`, `skills`, `skills-name`, `cost`, `alerts`.)
- `cmdk-recents-state-{idx}` — `frontend/src/components/ui/CommandPalette.tsx` (Phase 26 Plan 06 CMDK-04: per-state Command.Item inside the "Recents" group for cross-route ad-hoc states aggregated from `getAllRecentStates()`. Index is the integer position in the top-5 truncation (0..4).)
- `cmdk-time-range-{value}` — `frontend/src/components/ui/CommandPalette.tsx` (Phase 26 Plan 06 CMDK-03: per-preset Command.Item inside the "Time range" group. Values: `1h`, `24h`, `7d`, `30d` (the four condensed CMDK_TIME_PRESETS — the full 13-preset grid lives in TimePicker). The Copy/Paste items are registered as exact-match testids `cmdk-time-range-copy` and `cmdk-time-range-paste` above so the pattern only covers the navigable preset rows.)
- `cmdk-density-{value}` — `frontend/src/components/ui/CommandPalette.tsx` (Phase 26 Plan 06 CMDK-02: per-density Command.Item inside the "Density" group. Values: `compact`, `comfortable`, `cozy` (same vocabulary as `density-option-{value}` on DensityToggle). Selection calls `setDensity(value)` directly — Pitfall 3 lock: NO React Context bridge between Cmd+K and the density CSS-variable cascade.)
- `compare-overlay-toggle-{panel-id}` — `frontend/src/components/time/CompareToggle.tsx` (Phase 26 Plan 07 TIME-04: per-panel "Compare with previous period" toggle. Panel id matches the shape accepted by `asComparePanels` in `lib/searchSchemas.ts` (lowercase alphanumeric plus `_` and `-`). Panel ids in use today: `token-usage` (TokenUsageCard). Future adopters mount the toggle with their own panel id; the dynamic pattern covers them. Each toggle reads/writes the shared `?compare_panels=` CSV URL param; multiple toggles are independent.)

## Skip count

- v1.2 baseline: 2 known skips (`alerts.spec.ts:40 TEST-05a`, `skills-detail.spec.ts:25 SKLP-08/09/10`).
- Phase 24 additions: 0 (no new skips introduced).
- Skip count locked at 2. Exceeding it fails phase verification.

## ESLint enforcement

`frontend/eslint-rules/testid-registry-only.cjs` bans:

- JSX `data-testid="..."` literals not present in this doc's static-testids list.
- JSX `data-testid={`...${expr}...`}` template literals whose reconstructed shape does not match any dynamic-testid pattern in this doc.

To add a new testid:

1. Add a bullet to the relevant section above (exact-match → static; templated → dynamic).
2. Use the testid in code.
3. ESLint passes; commit lands.
