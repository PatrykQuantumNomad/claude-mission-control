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
- `time-picker-trigger` — `frontend/src/components/shell/AppShellHeader.tsx` (Placeholder; disabled + display:none in Phase 24; wired in Phase 26)
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

### UI primitives (Phase 24)
- `cell-copy-btn` — `frontend/src/components/ui/CopyIconButton.tsx`

### Theme (v1.2 baseline)
- `theme-toggle` — `frontend/src/components/shell/ThemeToggle.tsx`

### Cmd+K (v1.2 baseline)
- `cmdk-compare-picker-list` — `frontend/src/components/cmdk/*` (Compare-picker list container)
- `cmdk-compare-with-previous` — Compare-with-previous command item

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
