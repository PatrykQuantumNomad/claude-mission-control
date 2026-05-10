# Roadmap: Claude Mission Control

## Milestones

- ✅ **v1.0 MVP** — Phases 1–11, 47 plans (shipped 2026-04-28) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Skills & Cost Intelligence** — Phases 12–17, 28 plans (shipped 2026-05-05) — see [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Depth & Polish** — Phases 18–23, 22 plans (shipped 2026-05-09) — see [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md) — 12/12 active requirements complete + 1 honestly deferred (SKLP-11 → v1.3 per Phase 22 spike negative finding)
- 🚧 **v1.3 Surface Redesign** — Phases 24–28, 45 active requirements (started 2026-05-10)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–11) — SHIPPED 2026-04-28</summary>

- [x] Phase 1: Foundation & Database (7/7 plans) — completed 2026-04-25
- [x] Phase 2: Data Ingestion (6/6 plans) — completed 2026-04-26
- [x] Phase 3: Read-Only APIs (5/5 plans) — completed 2026-04-26
- [x] Phase 4: Stateful APIs (5/5 plans) — completed 2026-04-26
- [x] Phase 5: Frontend Shell & Design System (4/4 plans) — completed 2026-04-27
- [x] Phase 6: Observability & Activity Panels (5/5 plans) — completed 2026-04-27
- [x] Phase 7: Command Centre Panels (4/4 plans) — completed 2026-04-27
- [x] Phase 8: Mission Control Dispatcher (4/4 plans) — completed 2026-04-27
- [x] Phase 9: Telegram, Setup & Testing (5/5 plans) — completed 2026-04-28
- [x] Phase 10: Telegram Wiring Fixes (gap closure, 1/1 plan) — completed 2026-04-28
- [x] Phase 11: v1.0 Documentation & Env Polish (gap closure, 1/1 plan) — completed 2026-04-28

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1 Skills & Cost Intelligence (Phases 12–17) — SHIPPED 2026-05-05</summary>

- [x] Phase 12: OTEL Skill Event Spike (2/2 plans) — completed 2026-05-02
- [x] Phase 13: Cost Foundation & Skill Ingest (6/6 plans) — completed 2026-05-03
- [x] Phase 14: Skills API & Page Panels (5/5 plans) — completed 2026-05-04
- [x] Phase 15: Alert Engine & UI (5/5 plans) — completed 2026-05-04
- [x] Phase 16: Session Comparison (4/4 plans) — completed 2026-05-05
- [x] Phase 17: Polish, Doctor & Tests (6/6 plans) — completed 2026-05-05

Full details: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

</details>

<details>
<summary>✅ v1.2 Depth & Polish (Phases 18–23) — SHIPPED 2026-05-09</summary>

- [x] Phase 18: Polish & Carry-Forward Cleanup (5/5 plans) — completed 2026-05-05
- [x] Phase 19: Skills Per-Project, Deltas & Badges (4/4 plans) — completed 2026-05-06
- [x] Phase 20: Cost Forecast & Per-Project Card (4/4 plans) — completed 2026-05-06
- [x] Phase 21: Alert Anomaly Depth & NL Authoring (3/3 plans) — completed 2026-05-07
- [x] Phase 22: Skill Latency Overhead — spike-gated, NO branch (2/2 plans) — completed 2026-05-08
- [x] Phase 23: Compare Depth & Milestone Close (4/4 plans) — completed 2026-05-09

Full details: [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)

</details>

### 🚧 v1.3 Surface Redesign (Phases 24–28) — IN PROGRESS

- [ ] **Phase 24: Shell + Density + Containment Primitives** — Foundation phase establishing the shell chrome, 3-tier density infrastructure, three overflow bug fixes (global), and quality-gate scaffolding (visual checkpoint pattern, axe-core, perf budget, URL contract, testid registry) every later phase consumes.
- [ ] **Phase 25: Saved Views (Backend + Frontend)** — Server-persisted, per-route, URL-shareable saved views; Alembic migration `0004_saved_views`; 5 CRUD endpoints; `validateSearch` adoption on 6 routes; SavedViewMenu chrome; pinned favorites in sidebar; Cmd+K Saved Views group.
- [ ] **Phase 26: Per-Route Adoption I (Command/Activity/Sessions) + Time + Cmd+K** — High-traffic routes adopt `BoundedPanelCard bounded` + density tokens; global time picker (sync/copy-paste/compare-overlay/brush-zoom); Cmd+K density/time-range/recents groups; sidebar recently-visited.
- [ ] **Phase 27: Per-Route Adoption II (Skills/Cost/Alerts) + Tech Debt** — Tail-end routes adopt primitives; v1.2 carried tech debt closure (`project_key` wire exposure, `KNOWN_METRICS` removal, NL composer 503 retry/queue UX).
- [ ] **Phase 28: Layout Customization** — Per-route panel show/hide, 1D drag-reorder, split-pane resize via `react-resizable-panels@4.11.0`, reset-to-default. Layout state piggybacks on saved-view `state_json` (no new DB table).

## Phase Details

### Phase 24: Shell + Density + Containment Primitives
**Goal**: Lay every primitive and quality-gate the rest of v1.3 will consume — fix the three overflow bugs globally, establish 3-tier density, extract `AppShellHeader`, install Radix Popover/DropdownMenu, document z-index ladder + URL contract + testid registry, and gate every future phase behind a formal visual checkpoint + axe-core + perf budget pattern. No per-route work.
**Depends on**: Nothing (first v1.3 phase, builds on v1.2 close baseline pytest 661 / vitest 326 / Playwright 13)
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04, CONT-05, SHEL-01, SHEL-02, SHEL-03, SHEL-04, DENS-01, DENS-02, DENS-03, POLI-09, POLI-10, POLI-11, POLI-12, POLI-13, POLI-14
**Success Criteria** (what must be TRUE):
  1. User toggles density (Compact / Comfortable / Cozy) via top-bar control and the entire dashboard re-spaces with no flash, no layout shift, no React re-renders (CSS-only swap), and the choice persists across reloads
  2. User opens any Sheet, Popover, or DropdownMenu on any existing route and the overlay renders inside the viewport with correct z-index, never clipped by an ancestor's `overflow: hidden` and never escaping the stacking context (root cause `recharts` `ResponsiveContainer` transform audit complete + Radix Portal universal)
  3. User scrolls a long table inside any panel and the panel itself stays bounded — internal scroll appears, the page does not grow taller than the viewport, and long cell content (session IDs, cwd paths, skill names) truncates with tooltip-on-hover instead of breaking out of card padding
  4. User collapses the new left sidebar to icon-only via toggle or keyboard shortcut, the choice persists in localStorage across reloads, and the active route stays visually highlighted in either expanded or icon-only mode
  5. Phase ships with: `docs/z-index-ladder.md` documenting overlay layers; `docs/url-contract.md` + `tests/test_url_contract.py` enforcing every preserved URL pattern; `docs/affordance-checklist.md` enumerating 15 keyboard/interaction affordances; `docs/testid-registry.md` + ESLint rule; axe-core wired into Playwright; React DevTools profiler perf evidence; visual checkpoint at `.planning/phases/24/VISUAL-CHECK.md`; backend pytest + frontend vitest + Playwright e2e all green vs Phase 18 baseline
**Plans**: TBD
**UI hint**: yes

### Phase 25: Saved Views (Backend + Frontend)
**Goal**: Make every filter combination on every route a first-class, named, server-persisted, URL-shareable view — landing the backend (table + 5 endpoints + migration) independently testable first, then the `validateSearch` adoption on 6 routes, then the chrome (SavedViewMenu + save dialog + edit-vs-fork semantics + unsaved pip + recent ad-hoc states + per-route default + pinned favorites in sidebar + Cmd+K Saved Views group).
**Depends on**: Phase 24 (consumes `AppShellHeader`, density tokens, URL contract, testid registry, Radix Popover/DropdownMenu, axe-core gate)
**Requirements**: VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05, VIEW-06, VIEW-07, VIEW-08, VIEW-09, CMDK-01, SHEL-06
**Success Criteria** (what must be TRUE):
  1. User saves the current filter combination on `/skills/$name` as a named view, navigates away, returns to the route, and the view auto-loads as the per-route default (querystring still wins when explicit)
  2. User edits a loaded saved view, modifies a filter, and is prompted with an explicit save / save-as-fork / discard AlertDialog before any silent overwrite — the unsaved-changes pip in the chrome is visible the moment URL state diverges from the loaded view
  3. User opens Cmd+K, types a saved view name, hits Enter, and lands on the matching route with the saved filters applied (current-route filtered first in the Saved Views command group)
  4. User pins a saved view from the SavedViewMenu and the view appears in the sidebar Pinned section for one-click access from any route
  5. Backend `saved_views` Alembic migration `0004_saved_views` applies cleanly; 5 CRUD endpoints (`GET /api/views?route=`, `POST`, `GET /{id}`, `PATCH`, `DELETE`) pass independently via curl + pytest before frontend wires; 50-view-per-route cap enforced with UI warning at cap; opaque `state_json` validated only via route's `validateSearch` on read; `schemaVersion` field on every route's search shape
**Plans**: TBD
**UI hint**: yes

### Phase 26: Per-Route Adoption I (Command/Activity/Sessions) + Time + Cmd+K
**Goal**: Roll the Phase 24 primitives + Phase 25 saved-view infrastructure through the three highest-traffic routes (`/`, `/activity`, `/sessions/compare`) and ship the global time picker (with copy/paste, compare-to-previous overlay, brush-zoom) plus the Cmd+K density / time-range / recents groups and sidebar recently-visited section. Validates the adoption pattern before Phase 27 repeats it on tail-end routes.
**Depends on**: Phase 24 (BoundedPanelCard, density tokens, AppShellHeader), Phase 25 (`validateSearch` schemas with `time_from`/`time_to` adopted on `/`, `/activity`, `/sessions/compare`)
**Requirements**: SHEL-05, TIME-01, TIME-02, TIME-03, TIME-04, TIME-05, CMDK-02, CMDK-03, CMDK-04
**Success Criteria** (what must be TRUE):
  1. User sets the global time picker to `now-7d` in the top bar and every time-anchored panel on `/`, `/activity`, and `/sessions/compare` re-queries against that range; user toggles the auto-refresh interval (off / 30s / 1m / 5m) and the picker honors it
  2. User copies the current time range with Cmd+Shift+C, navigates to a different route, presses Cmd+Shift+V, and the receiving route's panels re-anchor to the pasted range (relative-time symbols preserved, not collapsed to absolutes)
  3. User drags a region on a recharts time-series on `/activity` and the chart zooms to that range — the global time picker updates to match, every other panel on the page re-anchors, the URL `?time_from=&time_to=` updates
  4. User opens Cmd+K and the Recent items group shows the last 5 visited routes (SHEL-05) plus last N ad-hoc states (VIEW-09 from Phase 25); user invokes "Set density: Compact" or "Last 7 days" command and the dashboard re-paints without navigating
  5. User opens any Sheet on `/sessions/compare` (compare picker, session detail) and the Sheet stays inside the viewport at every density and viewport size from 1024px upward; long session IDs and cwd paths truncate with tooltip; pages stay bounded with internal panel scroll
**Plans**: TBD
**UI hint**: yes

### Phase 27: Per-Route Adoption II (Skills/Cost/Alerts) + Tech Debt
**Goal**: Complete the per-route adoption sweep on the tail-end routes (`/skills`, `/skills/$name`, `/cost`, `/alerts`) by consuming Phase 24 primitives + Phase 25 saved views + Phase 26 time picker, AND close the v1.2 carried tech debt items that the new shell makes natural to fix (`project_key` wire exposure, `KNOWN_METRICS` removal, NL composer 503 retry/queue UX).
**Depends on**: Phase 24 (primitives), Phase 25 (`validateSearch` on `/skills`, `/skills/$name`, `/cost`, `/alerts`), Phase 26 (global time picker contract proven on first three routes)
**Requirements**: TDBT-01, TDBT-02, TDBT-03
**Success Criteria** (what must be TRUE):
  1. User opens `/skills/$name` for a long skill name (e.g. `tdd-coverage-author-with-fanout`), the per-skill detail page stays bounded, the SkillProjectsTable + SkillRunsTable + SkillLatencyTable + SkillTimeline panels each scroll internally, density tokens propagate, and the global time picker re-anchors all four panels
  2. User opens `/cost`, toggles the 7d/30d range via global time picker (or saves a custom range as a saved view), and the CostForecastCard + CostByProjectCard re-query and re-render — long project paths truncate cleanly, the compare-to-previous overlay (TIME-04) renders against last week / last 30d
  3. User opens the compare picker on `/sessions/compare` and the picker uses authoritative `project_key` (additive on `SessionListItemFull` and `SessionCompareSide` wire shapes) instead of cwd-as-proxy — edge cases with cwd realpath differences without sha1 collision now resolve correctly (TDBT-01)
  4. User opens `AlertRuleForm` on `/alerts` and the metric vocabulary loads exclusively from `useAlertMetrics` hook — `KNOWN_METRICS` frontend fallback constant is fully removed; cross-language drift guard `test_alerts_metrics_sync.py` still passes (TDBT-02)
  5. User triggers the NL alert composer on `/alerts` while Anthropic credentials are missing or unreachable, the 503 collapse surfaces a graceful retry / queue UX with honest "credentials missing — retry" affordance instead of silent error (TDBT-03)
**Plans**: TBD
**UI hint**: yes

### Phase 28: Layout Customization
**Goal**: Make the dashboard surface user-customizable on top of the now-stable shell — per-route panel show/hide, 1D drag-reorder within columns, split-pane resize via `react-resizable-panels@4.11.0` on `/sessions/compare` and per-route shells, and reset-to-default to prevent corrupt-state lock-in. Layout state piggybacks on saved-view `state_json` (no new DB table, no new endpoint).
**Depends on**: Phase 24 (primitives, perf budget — drag must not regress paint), Phase 25 (`state_json` schema stable, `validateSearch` shapes append-only on every route), Phase 26 (time picker contract), Phase 27 (per-route adoption complete on every route the user can customize)
**Requirements**: LAYO-01, LAYO-02, LAYO-03, LAYO-04
**Success Criteria** (what must be TRUE):
  1. User opens the panel header DropdownMenu on `/`, hides "System Pressure", saves the layout into a saved view (or just leaves the URL state), navigates away, returns, and the panel stays hidden — the hidden state lives inside the saved view's `state_json` (additive, opaque, no schema break)
  2. User drags the divider on `/sessions/compare` to resize the left/right panes, refreshes the page, and the resize persists into URL state and the loaded saved view; double-click on the divider resets to the default 50/50 split
  3. User reorders panels within a column via 1D drag on `/cost` (no cross-column movement), the new order persists into the active saved view, and the reset-to-default affordance in the panel DropdownMenu clears layout overrides cleanly
  4. `react-resizable-panels@4.11.0` is the only new runtime dependency added in Phase 28 — no `react-grid-layout`, no `dnd-kit`, no `@shadcn/ui`, no Tailwind; React DevTools profiler shows zero chart re-mounts during a layout drag (data memoized; `ResponsiveContainer` count unchanged); axe-core remains clean; visual checkpoint at `.planning/phases/28/VISUAL-CHECK.md` documents the closed milestone
  5. Backend pytest + frontend vitest + Playwright e2e all green at phase close vs every prior v1.3 phase baseline; URL contract test (`tests/test_url_contract.py`) confirms every preserved URL pattern still resolves; v1.3 milestone close gate met
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:** Phases execute in numeric order. Phase numbering is continuous across milestones (never restarts at 01).

| Phase | Milestone | Plans Complete | Status   | Completed  |
| ----- | --------- | -------------- | -------- | ---------- |
| 1. Foundation & Database | v1.0 | 7/7 | Complete | 2026-04-25 |
| 2. Data Ingestion | v1.0 | 6/6 | Complete | 2026-04-26 |
| 3. Read-Only APIs | v1.0 | 5/5 | Complete | 2026-04-26 |
| 4. Stateful APIs | v1.0 | 5/5 | Complete | 2026-04-26 |
| 5. Frontend Shell & Design System | v1.0 | 4/4 | Complete | 2026-04-27 |
| 6. Observability & Activity Panels | v1.0 | 5/5 | Complete | 2026-04-27 |
| 7. Command Centre Panels | v1.0 | 4/4 | Complete | 2026-04-27 |
| 8. Mission Control Dispatcher | v1.0 | 4/4 | Complete | 2026-04-27 |
| 9. Telegram, Setup & Testing | v1.0 | 5/5 | Complete | 2026-04-28 |
| 10. Telegram Wiring Fixes (gap closure) | v1.0 | 1/1 | Complete | 2026-04-28 |
| 11. v1.0 Documentation & Env Polish (gap closure) | v1.0 | 1/1 | Complete | 2026-04-28 |
| 12. OTEL Skill Event Spike | v1.1 | 2/2 | Complete | 2026-05-02 |
| 13. Cost Foundation & Skill Ingest | v1.1 | 6/6 | Complete | 2026-05-03 |
| 14. Skills API & Page Panels | v1.1 | 5/5 | Complete | 2026-05-04 |
| 15. Alert Engine & UI | v1.1 | 5/5 | Complete | 2026-05-04 |
| 16. Session Comparison | v1.1 | 4/4 | Complete | 2026-05-05 |
| 17. Polish, Doctor & Tests | v1.1 | 6/6 | Complete | 2026-05-05 |
| 18. Polish & Carry-Forward Cleanup | v1.2 | 5/5 | Complete | 2026-05-05 |
| 19. Skills Per-Project, Deltas & Badges | v1.2 | 4/4 | Complete | 2026-05-06 |
| 20. Cost Forecast & Per-Project Card | v1.2 | 4/4 | Complete | 2026-05-06 |
| 21. Alert Anomaly Depth & NL Authoring | v1.2 | 3/3 | Complete | 2026-05-07 |
| 22. Skill Latency Overhead (spike-gated) | v1.2 | 2/2 | Complete | 2026-05-08 |
| 23. Compare Depth & Milestone Close | v1.2 | 4/4 | Complete | 2026-05-09 |
| 24. Shell + Density + Containment Primitives | v1.3 | 0/0 | Not started | — |
| 25. Saved Views (Backend + Frontend) | v1.3 | 0/0 | Not started | — |
| 26. Per-Route Adoption I + Time + Cmd+K | v1.3 | 0/0 | Not started | — |
| 27. Per-Route Adoption II + Tech Debt | v1.3 | 0/0 | Not started | — |
| 28. Layout Customization | v1.3 | 0/0 | Not started | — |

**v1.0 milestone shipped: 47/47 plans, 11/11 phases verified (9 base + 2 audit gap-closure).**
**v1.1 milestone shipped: 28/28 plans, 6/6 phases verified, 41/41 requirements satisfied.**
**v1.2 milestone shipped: 22/22 plans, 6/6 phases verified, 12/12 active requirements satisfied + 1 honestly deferred (SKLP-11 → v1.3).**
**v1.3 milestone in progress: 0/5 phases complete, 0/45 active requirements satisfied. Plans authored per-phase via `/gsd:plan-phase {N}`.**
