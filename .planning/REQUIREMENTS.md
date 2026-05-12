# Requirements: Claude Mission Control — v1.3 Surface Redesign

**Defined:** 2026-05-10
**Core Value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, what each skill costs and how often it fails, queue and approve tasks, compare two sessions side-by-side, get paged when metrics breach thresholds, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

**Milestone goal:** Rebuild the dashboard's UX from the ground up — fix daily-use friction (panels exceed viewport / Sheets+Popovers escape parent bounds / data overflows card edges), shift the aesthetic from IDE-references (Linear/Raycast/Vercel) to dashboard-product references (Honeycomb/Datadog/PostHog/Grafana family), unlock targeted new capabilities (3-tier density, server-persisted saved views, lightweight customizable layouts, global time picker), without breaking URLs, API contracts, or test suites.

**Constraints:**
- Existing URLs / deep links preserved — TanStack route file renames, parent layout insertion, and non-additive `validateSearch` changes are forbidden
- Existing API contracts extend-not-break — new endpoints additive only; response shapes append-only
- Backend pytest + frontend vitest + Playwright e2e stay green at every phase close (test-suite stability is a verifier rule, not a polish item)
- Stack additions limited to: `@radix-ui/react-popover@1.1.15`, `@radix-ui/react-dropdown-menu@2.1.16`, `react-resizable-panels@4.11.0` (3 baseline deps); plus 1 Alembic migration (`0004_saved_views`) — zero Python deps added
- macOS-only single-user localhost (no auth, no cloud, no outbound)

**Bite size:** Open-ended — ship when ready.

---

## v1.3 Requirements

Categorized by surface area. Each maps to exactly one phase in `ROADMAP.md` once the roadmap is created.

### Containment (CONT) — fix the three named overflow failure modes

- [x] **CONT-01**: Panels do not exceed viewport height. Page-height constraint via `.cmc-page--bounded` modifier; `min-height: 0` flex ladder; internal panel scroll on bounded content.
- [x] **CONT-02**: Sheets, Popovers, and DropdownMenus render via Radix Portal at viewport-fixed coordinates without clipping or escaping their stacking context. Root-cause audit (recharts `ResponsiveContainer` transform creates new containing block for `position: fixed` descendants) lands as a Phase 24 deliverable.
- [x] **CONT-03**: Data inside cards (tables, charts, badges, KPI numbers) does not break out of card padding. Single global one-line fix: `min-width: 0` on `.cmc-card` (CSS Grid implicit min-content rule) — benefits every route. Plus `cmc-table-wrap` utility on DataTable + `cmc-cell--truncate` on overflowable cells.
- [x] **CONT-04**: `BoundedPanelCard` primitive + `bounded` prop on `PanelCard` + `.cmc-page--bounded` page modifier — opt-in, backward-compatible. Existing legacy "scroll the whole page" behavior preserved when not opted in.
- [x] **CONT-05**: z-index ladder documented in `docs/z-index-ladder.md` and respected by all overlay primitives (Sheet, Popover, DropdownMenu, AlertDialog, Cmd+K). _(complete 2026-05-12 — Phase 24 plans 06 + 07; doc shipped in 3698bf3, ESLint `cmc/no-raw-z-index` rule in 5e6bb73 enforces, operator verified at phase close)_

### Shell (SHEL) — new dashboard-product chrome

- [x] **SHEL-01**: Persistent collapsible left sidebar with section grouping (Observe / Operate / Configure). Replaces existing top NavBar pattern. _(Phase 24 Plan 04 — Sidebar.tsx + SidebarSection.tsx + SidebarNavLink.tsx; NavBar.tsx deleted)_
- [x] **SHEL-02**: Top bar (`AppShellHeader` extracted from existing NavBar) hosting Cmd+K trigger, global time picker, density toggle, save-view button, theme toggle. URL-shareable across routes. _(Phase 24 Plan 04 — AppShellHeader.tsx; time-picker-trigger + save-view-button ship as disabled+display:none placeholders pre-registered for Phases 25/26)_
- [x] **SHEL-03**: Active-route indicator in sidebar (highlight + section header collapse-aware). _(Phase 24 Plan 04 — `cmc-sidebar__navlink--active` via TanStack `activeProps`; 3px `border-left` accent bar survives 240→52px collapse flip)_
- [x] **SHEL-04**: Sidebar collapses to icon-only mode with persistent toggle state (localStorage). Toggleable via chrome control + keyboard shortcut. _(Phase 24 Plan 04 — lib/sidebar.ts + window-level Cmd+B/Ctrl+B keydown with preventDefault + chrome `sidebar-collapse-toggle` button; pre-mount applySidebar() in main.tsx prevents flash)_
- [ ] **SHEL-05**: Sidebar "Recently visited" section auto-tracks last 5 routes/views (localStorage; renders below main nav).
- [ ] **SHEL-06**: Sidebar "Pinned" section for user-favorited saved views — depends on VIEW-04. One-click access from sidebar.

### Density (DENS) — 3-tier dashboard density

- [x] **DENS-01**: 3-tier density toggle (Compact / Comfortable / Cozy) implemented as `[data-density]` attribute on `<html>` via `lib/density.ts` (mirrors `lib/theme.ts` pattern). Default Comfortable. CSS-only swap; no React re-renders on toggle. _(Phase 24 Plan 02 — DensityToggle.tsx)_
- [x] **DENS-02**: CSS-variable token migration across ~30 panels. Spacing, font-size, icon-size, line-height, control-height all density-aware. Density tokens scoped to `:root` (not subtree) so they cascade into Radix Portal content (Sheets, Popovers, Cmd+K). _(Phase 24 Plan 01 + Plan 02 — :root cascade pinned by vitest at html-element scope; full Portal-descendant runtime cascade verified by Plan 05 Playwright fixture per documented happy-dom limitation)_
- [x] **DENS-03**: localStorage persistence with pre-mount apply (no flash). DensityProvider stacks alongside existing ActiveSessionProvider + TaskComposerProvider in `__root.tsx`. _(Phase 24 Plan 02 — DensityProvider.tsx is intentionally NOT a React Context; mount-time useEffect re-applies density for HMR safety; root.tsx wiring deferred to Plan 04 shell rework)_

### Saved Views (VIEW) — server-persisted, per-route, URL-shareable

- [x] **VIEW-01**: URL state via TanStack `validateSearch` extended to `/`, `/activity`, `/skills`, `/skills/$name`, `/cost`, `/alerts` (sessions/compare is already the reference implementation). Append-only schemas; `schemaVersion` field on every route. ✅ 2026-05-12 (Plans 03 + 04)
- [x] **VIEW-02**: `saved_views` SQLite table + Alembic migration `0004_saved_views`. Columns at minimum: `id`, `name`, `description`, `route`, `state_json`, `schema_version`, `created_at`, `updated_at`. Pattern mirrors `tasks.py` shape. ✅ 2026-05-12 (Plan 01)
- [ ] **VIEW-03**: 5 CRUD endpoints (`GET /api/views?route=`, `POST /api/views`, `GET /api/views/{id}`, `PATCH /api/views/{id}`, `DELETE /api/views/{id}`). Independently testable via curl before frontend wires up.
- [ ] **VIEW-04**: SavedViewMenu mounted in `AppShellHeader`. Lists current-route's views; menu actions: open, set as default, edit/fork, delete. Per-route filtering.
- [ ] **VIEW-05**: Save-view dialog with name + optional description; current URL state captured into `state_json`.
- [ ] **VIEW-06**: Per-route default-view affordance — user can mark a saved view as "default for this route". Cold-loads on visit. Persistence: localStorage pointer (route → saved view id). Querystring always wins over default.
- [ ] **VIEW-07**: Edit-vs-fork explicit semantics — when user modifies a loaded saved view, AlertDialog prompts: save changes / save as new (fork) / discard. No silent overwrite.
- [ ] **VIEW-08**: Unsaved-changes pip indicator in chrome — visible badge when current URL state diverges from the loaded saved view.
- [ ] **VIEW-09**: Recent ad-hoc states list — last N URL states tracked in localStorage even if not saved as a view. Surfaced via Cmd+K (CMDK-04). 50-state cap with FIFO eviction; user warning at cap.

### Time-Anchored Navigation (TIME) — global time picker

- [ ] **TIME-01**: Global time picker in top bar (`AppShellHeader`). Relative time symbols (`now-7d`, `now-1h`) + absolute datetime range. Auto-refresh interval selector (off / 30s / 1m / 5m).
- [ ] **TIME-02**: All time-anchored panels sync to global time picker via `validateSearch` time params. Panels not previously time-aware (e.g., live sessions) opt out cleanly.
- [ ] **TIME-03**: Copy/paste time-range shortcuts — Cmd+Shift+C copies current time range to clipboard; Cmd+Shift+V applies clipboard time range. Grafana 2024-01-28 convention.
- [ ] **TIME-04**: Compare-to-previous-period overlay toggle — checkbox in time picker chrome enables prior-period overlay on supported charts (cost, tokens, latency). Reuses Phase 19 prev-period CTE pattern.
- [ ] **TIME-05**: Brush-zoom on time-series charts — drag-select on a chart zoom into that range; updates global time picker. Recharts `Brush` component used natively.

### Layout Customization (LAYO) — show/hide + reorder + split-pane resize

- [ ] **LAYO-01**: Per-route panel show/hide menu accessible via DropdownMenu in panel header (or page chrome). Hidden state persists into saved view's `state_json` (additive, opaque).
- [ ] **LAYO-02**: 1D drag-reorder of panels within columns (single-column reorder; no cross-column movement). Persists into saved view's `state_json`.
- [ ] **LAYO-03**: Split-pane resize via `react-resizable-panels@4.11.0` on `/sessions/compare` (left/right resize) and per-route shells where useful. Single new dep covers this. Drag handle + double-click to reset.
- [ ] **LAYO-04**: Reset-to-default affordance on every layout-customizable surface — "Reset layout" button in DropdownMenu clears `state_json` layout overrides. Prevents corrupt-state lock-in.

### Command Palette (CMDK) — additive Command.Group blocks

- [ ] **CMDK-01**: Saved Views group — open view by name (current route filtered first), set as default, jump to view's URL. No new context; reuses `useSavedViews(route)` from VIEW-04.
- [ ] **CMDK-02**: Set Density command (Compact / Comfortable / Cozy) with current-state indicator.
- [ ] **CMDK-03**: Time Range commands — set predefined ranges (last 1h / 24h / 7d / 30d), copy current range, paste clipboard range.
- [ ] **CMDK-04**: Recent items group — last 5 visited routes (SHEL-05) + last N ad-hoc states (VIEW-09). Cross-route surfacing.

### Polish & Quality (POLI) — extends existing POLI prefix

- [x] **POLI-09**: Formal per-phase visual checkpoint pattern. Each phase ends with operator-driven visual review documented in `.planning/phases/{N}/VISUAL-CHECK.md` (screenshots + verdict). Verifier gates on visual checkpoint pass. _(complete 2026-05-12 — Phase 24 plans 05 (v13-visual-capture.spec.ts 36-row matrix) + 07 (24-VISUAL-CHECK.md operator verdict PASS); 437e848 evidence assembly; 36/36 PNGs PASS at phase close)_
- [x] **POLI-10**: Accessibility audit per phase via axe-core integration. WCAG AA contrast requirement on all new chrome (especially dark-theme text/background pairs in headers/sidebar). Focus rings on all interactive elements. _(complete 2026-05-12 — Phase 24 plans 05 (v13-a11y.spec.ts 30-run matrix) + 07 (06f09a2 cleared 3 Phase-24 regressions: Skeleton role="status", sidebar section-header --cmc-text-subtle→--cmc-text-dim, networkidle→domcontentloaded); 6 pre-existing v1.2-baseline contrast classes Accepted-Exception-deferred to Phase 26/27 per RESEARCH Pitfall 7)_
- [x] **POLI-11**: Perf budget per phase — density toggle is CSS-only (no React re-renders confirmed via React DevTools profiler at phase close); chart polling stays <16ms paint; no `ResponsiveContainer` ResizeObserver pile-up regression. _(complete 2026-05-12 — Phase 24 plans 05 (lighthouserc.json + perf budget scaffolding) + 07 (Lighthouse 9/9 PASS: LCP 559-572ms / CLS 0-0.0032 / performance 1.0; DOM-identity zero-rerender probe substituted for React DevTools profiler — 3/3 chart + 15/15 card markers preserved across 2 density flips, functionally identical to "0 React commits below DensityToggle" with architectural backing from Plan 02's no-React-Context DensityProvider; ResponsiveContainer count delta 0 = 26 == v1.2 baseline 26; INP excluded from auto-assertions with inline rationale in 88e8417))_
- [x] **POLI-12**: Affordance checklist `docs/affordance-checklist.md` — 15 keyboard/interaction affordances enumerated (Esc-to-close, focus-return, Tab-cycle inside Sheet, Cmd+K context commands, scroll-position-restore on Sheet close, drag handles, click-outside-to-close, theme toggle, density toggle, etc.). Verified at every phase close. _(complete 2026-05-11 — Phase 24 plan 06; commit 3698bf3)_
- [x] **POLI-13**: URL contract documentation `docs/url-contract.md` + CI test (`tests/test_url_contract.py`) — enumerates every preserved URL pattern + validateSearch shape; CI fails if any preserved pattern breaks. _(complete 2026-05-11 — Phase 24 plans 05 + 06; commits 3698bf3 (docs) + cdeda8d (pytest); 2/2 passing)_
- [x] **POLI-14**: `data-testid` registry (`docs/testid-registry.md`) + ESLint rule (`testid-registry-only`) — prevents Playwright selector churn during shell rework. Skip count locked at v1.2 baseline (2 known skips). _(complete 2026-05-11 — Phase 24 plan 06; commits e700a9e + 5e6bb73; pnpm lint enforces)_

### Tech Debt Closure (TDBT) — Phase 27 bundles

- [ ] **TDBT-01**: Expose `project_key` on `SessionListItemFull` and `SessionCompareSide` wire shapes (additive). Frontend compare picker switches from cwd-as-proxy to authoritative `project_key` (per Phase 23 carried debt).
- [ ] **TDBT-02**: Remove `KNOWN_METRICS` frontend fallback constant. Rely solely on `useAlertMetrics` hook (per Phase 21 carried debt). `test_alerts_metrics_sync.py` cross-language drift guard remains.
- [ ] **TDBT-03**: Add retry/queue UX to `POST /api/alerts/parse-nl` 503 collapse. Surface honest "credentials missing — retry" affordance instead of silent error (per Phase 21 carried debt).

**Total v1.3 active requirements: 45**

| Category | Count | Notes |
|----------|-------|-------|
| CONT | 5 | Three overflow bugs + primitive + z-index ladder |
| SHEL | 6 | Sidebar + top bar + 3 sidebar differentiators |
| DENS | 3 | 3-tier toggle + token migration + persistence |
| VIEW | 9 | URL state + table + endpoints + chrome + 4 differentiators |
| TIME | 5 | Picker + sync + 3 differentiators |
| LAYO | 4 | Show/hide + reorder + resize + reset |
| CMDK | 4 | Saved views + density + time + recents |
| POLI | 6 | Visual checkpoint + a11y + perf + affordances + URL contract + testid registry |
| TDBT | 3 | project_key wire + KNOWN_METRICS removal + NL composer retry |

---

## v1.4+ Future Requirements

Acknowledged but deferred. Not in v1.3 roadmap.

### Layout Customization

- **LAYO-05**: Full 2D drag-resize grid via `react-grid-layout`. Blocked by GitHub Issue #2045 (React 19.2 key-prop warnings). Defer until issue resolves AND show/hide + 1D reorder + split-pane resize prove insufficient.

### Multi-pane Compare

- **CMPR-10**: 3+ way session compare. Default OUT for v1.3 — no reference product (Honeycomb/Datadog/PostHog/Grafana/Linear) ships >2-way compare; layout collapses below 1024px; value-per-pane drops sharply. Re-evaluate only if user names a concrete triangulation workflow.

### Carried v1.3+ Backlog (deferred again unless evaluated next milestone)

- **SKLP-11** retry — per-skill body/subagent/tool latency overhead breakdown, gated on upstream OTEL data availability change
- **SKLP-12** — SKLP-11 percentile-split (p50 / p95 / p99 per overhead category)
- **SKLP-13** — heatmap toggle on per-project skill breakdown
- **ANLY-08** — confidence band on monthly cost forecast (residual-stddev-derived ± range)
- **ANLY-09** — per-project cost budgets with alert integration (cross-lane, bridges cost ↔ alerts)
- **ALRT-15** — predictive alerts (forecast × anomaly combination)
- **ALRT-16** — NL queries beyond AlertRule schema (separate-milestone candidate)
- **CMPR-08** — sessions-table right-click "compare with previous" (LOW differentiator vs existing Cmd+K)
- **CMPR-09** — per-skill cost delta in compare (depends on per-skill cost rollup not yet wired)
- **PLAT-01** — Linux / systemd support (currently macOS-only)
- **AUTO-01..03** — NL schedules beyond cron, auto-retry policy for failed scheduled tasks, task dependencies

---

## Out of Scope

Explicit exclusions for v1.3. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Tailwind CSS migration | Multi-week migration; conflicts with established `cmc-*` BEM CSS-variable system |
| `@shadcn/ui` adoption | Not present in repo; would require Tailwind first (anti-pattern); use raw `@radix-ui/*` primitives directly |
| `react-grid-layout` (full 2D drag-resize grid) | React 19.2 compat broken (Issue #2045 open); single-user ROI questionable; show/hide + 1D reorder + split-pane covers expected need |
| `dnd-kit` for layout drag | Stale (last published 2024-12-05); HTML5 drag API + react-resizable-panels suffice for 1D reorder + split-pane |
| Competing styling systems (MUI, Mantine, Chakra) | Conflicts with `cmc-*` system |
| Per-panel time override | Anti-feature — Honeycomb explicitly removed this. Global time picker syncs all panels by design |
| Auto-density-by-viewport-width | Single-screen local context — would be noise, not signal |
| 3+ way session compare | No reference product ships >2-way; layout collapses; value-per-pane drops |
| NL fallback for Cmd+K commands | Hard-validated commands only — mirrors v1.2 ALRT-14 invariant ("return None on hallucination, no fallback") |
| Cross-org switcher / notification bell + avatar | Single-user tool by design |
| Top-tabs as primary nav | Anti-pattern at 8+ surfaces; sidebar required |
| Hamburger-only mobile-style nav | Desktop-first dashboard; sidebar is correct primitive |
| Three-pane global layout (Linear-style) | Single-page-at-a-time observability use case; three-pane noise |
| Mobile drag-resize / customization | Desktop-only |
| Cloud-sync of saved views, density, layout state | Localhost only; SQLite-persisted server saves are sufficient durability |
| Storybook | Visual checkpoint (POLI-09) covers regression detection without Storybook overhead |
| `react-grid-layout-19` community fork | Unmaintained risk; defer until upstream `react-grid-layout` resolves Issue #2045 |
| URL state stored anywhere other than querystring | URL is single source of truth for navigation state — append-only validateSearch contract |

**Locked v1.3 invariants (carried into v1.4+ Out of Scope):**

- Density variables MUST be on `:root` — never on a subtree (Radix Portal cascade requirement)
- `validateSearch` schemas MUST be append-only — non-additive changes break Telegram deep-links + browser bookmarks
- All Sheet/Popover/DropdownMenu content MUST go through Radix Portal — no bare positioning
- Density toggle MUST be CSS-only (no React re-renders) — perf invariant
- BoundedPanelCard MUST be opt-in via `bounded` prop — backward compatibility for legacy "scroll whole page" behavior
- Saved view `state_json` MUST be opaque to backend — schema validation lives in route's `validateSearch` on read
- `data-testid` MUST come from registry — Playwright selector stability invariant
- 50-view cap on saved views per route + 50-state cap on recent ad-hoc states — bounded localStorage growth

---

## Traceability

Each requirement maps to exactly one phase. Mapping authored 2026-05-10 by `gsd-roadmapper` against ROADMAP.md Phases 24–28.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONT-01 | Phase 24 | Complete |
| CONT-02 | Phase 24 | Complete |
| CONT-03 | Phase 24 | Complete |
| CONT-04 | Phase 24 | Complete |
| CONT-05 | Phase 24 | ✅ Complete (plans 06 + 07, 2026-05-12) |
| SHEL-01 | Phase 24 | Complete |
| SHEL-02 | Phase 24 | Complete |
| SHEL-03 | Phase 24 | Complete |
| SHEL-04 | Phase 24 | Complete |
| SHEL-05 | Phase 26 | Pending |
| SHEL-06 | Phase 25 | Pending |
| DENS-01 | Phase 24 | ✅ Complete (plans 02 + 05 e2e, 2026-05-11) |
| DENS-02 | Phase 24 | ✅ Complete (plans 02 + 05 runtime Portal cascade fixture, 2026-05-11) |
| DENS-03 | Phase 24 | ✅ Complete (plans 02 + 05 e2e persistence, 2026-05-11) |
| VIEW-01 | Phase 25 | ✅ Complete (plans 03 + 04, 2026-05-12) |
| VIEW-02 | Phase 25 | ✅ Complete (plan 01, 2026-05-12) |
| VIEW-03 | Phase 25 | Pending |
| VIEW-04 | Phase 25 | Pending |
| VIEW-05 | Phase 25 | Pending |
| VIEW-06 | Phase 25 | Pending |
| VIEW-07 | Phase 25 | Pending |
| VIEW-08 | Phase 25 | Pending |
| VIEW-09 | Phase 25 | Pending |
| TIME-01 | Phase 26 | Pending |
| TIME-02 | Phase 26 | Pending |
| TIME-03 | Phase 26 | Pending |
| TIME-04 | Phase 26 | Pending |
| TIME-05 | Phase 26 | Pending |
| LAYO-01 | Phase 28 | Pending |
| LAYO-02 | Phase 28 | Pending |
| LAYO-03 | Phase 28 | Pending |
| LAYO-04 | Phase 28 | Pending |
| CMDK-01 | Phase 25 | Pending |
| CMDK-02 | Phase 26 | Pending |
| CMDK-03 | Phase 26 | Pending |
| CMDK-04 | Phase 26 | Pending |
| POLI-09 | Phase 24 | ✅ Complete (plans 05 + 07, 2026-05-12) |
| POLI-10 | Phase 24 | ✅ Complete (plans 05 + 07, 2026-05-12) |
| POLI-11 | Phase 24 | ✅ Complete (plans 05 + 07, 2026-05-12) |
| POLI-12 | Phase 24 | ✅ Complete (plan 06, 2026-05-11) |
| POLI-13 | Phase 24 | ✅ Complete (plans 05+06, 2026-05-11) |
| POLI-14 | Phase 24 | ✅ Complete (plan 06, 2026-05-11) |
| TDBT-01 | Phase 27 | Pending |
| TDBT-02 | Phase 27 | Pending |
| TDBT-03 | Phase 27 | Pending |

**Coverage:**
- v1.3 active requirements: 45 total
- Mapped to phases: 45 ✓
- Unmapped: 0
- Duplicates (mapped to >1 phase): 0

**Progress (updated 2026-05-12):**
- ✅ Phase 24 closed (operator verdict PASS, 2026-05-12): 18/18 requirements complete — SHEL-01..04, DENS-01..03, CONT-01..05, POLI-09..14
- ⏳ Phases 25-28 pending: 27/45 requirements outstanding
- Net v1.3 progress: 18/45 (40%)

**Per-phase rollup:**

| Phase | Requirement Count | Requirement IDs |
|-------|-------------------|-----------------|
| Phase 24 | 18 | CONT-01..05, SHEL-01..04, DENS-01..03, POLI-09..14 |
| Phase 25 | 11 | VIEW-01..09, CMDK-01, SHEL-06 |
| Phase 26 | 9 | SHEL-05, TIME-01..05, CMDK-02..04 |
| Phase 27 | 3 | TDBT-01..03 (plus per-route adoption work that consumes Phase 24 primitives + Phase 25 saved views + Phase 26 time picker for `/skills`, `/skills/$name`, `/cost`, `/alerts` — adoption work has no dedicated REQ-ID; success criteria gated via SC#1–SC#2 in ROADMAP.md Phase 27) |
| Phase 28 | 4 | LAYO-01..04 |

**Phase 27 note:** Phase 27 carries only 3 explicit REQ-IDs (TDBT-01..03) but performs the bulk of the per-route adoption sweep on the tail-end routes (`/skills`, `/skills/$name`, `/cost`, `/alerts`). The adoption work consumes Phase 24 primitives + Phase 25 saved views + Phase 26 time picker without introducing new requirements — this is structurally analogous to Phase 26 (which carries SHEL-05, TIME-01..05, CMDK-02..04 alongside its own per-route adoption on `/`, `/activity`, `/sessions/compare`). The split is honest: every requirement that introduces NEW capability lands in Phases 24-26 + 28; Phase 27 is the necessary tail-end adoption + tech-debt closure phase.

---

*Requirements defined: 2026-05-10*
*Traceability authored: 2026-05-10 (45/45 mapped, 0 orphans, 0 duplicates)*
*Last updated: 2026-05-12 after Phase 24 close — POLI-09/10/11 + CONT-05 marked Complete; Phase 24 18/18 requirements satisfied*
