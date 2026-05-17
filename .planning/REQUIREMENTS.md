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
- [x] **SHEL-05**: Sidebar "Recently visited" section auto-tracks last 5 routes/views (localStorage; renders below main nav). ✅ 2026-05-13 (Phase 26 Plan 04 — RecentRoutesTracker zero-render effect + RecentlyVisitedSection slotted between Pinned and Configure; Pitfall 8 option b filters current pathname; cap=20 in cmc.recents.routes; sidebar IA grows to 6 sections; Plan 09 close gate verified)
- [x] **SHEL-06**: Sidebar "Pinned" section for user-favorited saved views — depends on VIEW-04. One-click access from sidebar.

### Density (DENS) — 3-tier dashboard density

- [x] **DENS-01**: 3-tier density toggle (Compact / Comfortable / Cozy) implemented as `[data-density]` attribute on `<html>` via `lib/density.ts` (mirrors `lib/theme.ts` pattern). Default Comfortable. CSS-only swap; no React re-renders on toggle. _(Phase 24 Plan 02 — DensityToggle.tsx)_
- [x] **DENS-02**: CSS-variable token migration across ~30 panels. Spacing, font-size, icon-size, line-height, control-height all density-aware. Density tokens scoped to `:root` (not subtree) so they cascade into Radix Portal content (Sheets, Popovers, Cmd+K). _(Phase 24 Plan 01 + Plan 02 — :root cascade pinned by vitest at html-element scope; full Portal-descendant runtime cascade verified by Plan 05 Playwright fixture per documented happy-dom limitation)_
- [x] **DENS-03**: localStorage persistence with pre-mount apply (no flash). DensityProvider stacks alongside existing ActiveSessionProvider + TaskComposerProvider in `__root.tsx`. _(Phase 24 Plan 02 — DensityProvider.tsx is intentionally NOT a React Context; mount-time useEffect re-applies density for HMR safety; root.tsx wiring deferred to Plan 04 shell rework)_

### Saved Views (VIEW) — server-persisted, per-route, URL-shareable

- [x] **VIEW-01**: URL state via TanStack `validateSearch` extended to `/`, `/activity`, `/skills`, `/skills/$name`, `/cost`, `/alerts` (sessions/compare is already the reference implementation). Append-only schemas; `schemaVersion` field on every route. ✅ 2026-05-12 (Plans 03 + 04)
- [x] **VIEW-02**: `saved_views` SQLite table + Alembic migration `0004_saved_views`. Columns at minimum: `id`, `name`, `description`, `route`, `state_json`, `schema_version`, `created_at`, `updated_at`. Pattern mirrors `tasks.py` shape. ✅ 2026-05-12 (Plan 01)
- [x] **VIEW-03**: 5 CRUD endpoints (`GET /api/views?route=`, `POST /api/views`, `GET /api/views/{id}`, `PATCH /api/views/{id}`, `DELETE /api/views/{id}`). Independently testable via curl before frontend wires up. ✅ 2026-05-12 (Plan 02)
- [x] **VIEW-04**: SavedViewMenu mounted in `AppShellHeader`. Lists current-route's views; menu actions: open, set as default, edit/fork, delete. Per-route filtering. ✅ 2026-05-12 (Plan 06)
- [x] **VIEW-05**: Save-view dialog with name + optional description; current URL state captured into `state_json`. ✅ 2026-05-12 (Plan 06)
- [x] **VIEW-06**: Per-route default-view affordance — user can mark a saved view as "default for this route". Cold-loads on visit. Persistence: localStorage pointer (route → saved view id). Querystring always wins over default. ✅ 2026-05-12 (Plan 10 — DefaultViewLoader zero-render effect; Pitfall 8 deep-link-wins lock; e2e fixture substitution for /skills/$name documented as Accepted Exception (a) deferred to Phase 26)
- [x] **VIEW-07**: Edit-vs-fork explicit semantics — when user modifies a loaded saved view, AlertDialog prompts: save changes / save as new (fork) / discard. No silent overwrite. ✅ 2026-05-12 (Plan 07; component-deviation note: shipped as Radix Dialog NOT AlertDialog per Pitfall 4 — user-observable behavior identical: 3 explicit choices, no silent overwrite path)
- [x] **VIEW-08**: Unsaved-changes pip indicator in chrome — visible badge when current URL state diverges from the loaded saved view. ✅ 2026-05-12 (Plan 06)
- [x] **VIEW-09**: Recent ad-hoc states list — last N URL states tracked in localStorage even if not saved as a view. Surfaced via Cmd+K (CMDK-04). 50-state cap with FIFO eviction; user warning at cap. ✅ 2026-05-12 (Plan 10 — RecentStateTracker zero-render effect; FIFO 50-cap with structural JSON.stringify dedupe via Plan 05's pushRecentState; IN_SCOPE_ROUTES hard-coded Set; bare-URL filter skips schemaVersion-only URLs; cap-warning surfaced as console.warn — CMDK-04 surface deferred to Phase 26)

### Time-Anchored Navigation (TIME) — global time picker

- [x] **TIME-01**: Global time picker in top bar (`AppShellHeader`). Relative time symbols (`now-7d`, `now-1h`) + absolute datetime range. Auto-refresh interval selector (off / 30s / 1m / 5m). ✅ 2026-05-13 (Phase 26 Plan 03 — TimePicker (Radix Popover + 3-group PresetList + dual-month react-day-picker calendar) + RefreshDropdown (off / 30s / 1m / 5m + active pulse + Paused on absolute time_from) + AutoRefreshController zero-render effect firing queryClient.invalidateQueries on isTimeAnchoredKey predicate; mounted in AppShellHeader for every route; commits 9e60307 + 9d3ee0c)
- [x] **TIME-02**: All time-anchored panels sync to global time picker via `validateSearch` time params. Panels not previously time-aware (e.g., live sessions) opt out cleanly. ✅ 2026-05-13 (Phase 26 Plans 02 + 03 + 08 — URL contract validateSearch time_from/time_to APPEND-ONLY on /, /activity, /sessions/compare per Pitfall 13 (Plan 02); TimePicker writes time params via function-form navigate (Plan 03); 21 panels migrated to BoundedPanelCard `bounded` mode + useRouteRange URL→Range bridge hook reads time_from/time_to from useRouterState and coerces to backend Range vocab via rangeToVocab (Plan 08); 9 time-anchored panels on / consume the bridge with effectiveRange = localRange ?? globalRange; OtelPanel live SSE opt-out preserved; Plan 09 close gate v13-time-picker.spec.ts:182/194 verified)
- [x] **TIME-03**: Copy/paste time-range shortcuts — Cmd+Shift+C copies current time range to clipboard; Cmd+Shift+V applies clipboard time range. Grafana 2024-01-28 convention. ✅ 2026-05-13 (Phase 26 Plan 03 — window-level keydown listener mounted by TimePicker; serializeRange + parseRangeFromText + asTimeToken defense-in-depth; sonner toast.success / toast.message / toast.error feedback on every event; commit 9e60307; affordance-checklist row 16)
- [x] **TIME-04**: Compare-to-previous-period overlay toggle — checkbox in time picker chrome enables prior-period overlay on supported charts (cost, tokens, latency). Reuses Phase 19 prev-period CTE pattern. ✅ 2026-05-13 (Phase 26 Plan 07 — asComparePanels validator (CSV regex) + APPEND-ONLY validateSearch on /, /activity, /sessions/compare accepting compare_panels?: string per Pitfall 13; CompareToggle component reads/writes single CSV via useRouterState + useNavigate function-form, sorted + de-duped on write for deterministic fork-save round-trip, route-agnostic; TokenUsageCard prior-period overlay gates on compare_panels — useTokens('30d') + client-side slice [-14, -7) for prior week, merge under prior_total dataKey, render Bar with stackId='prior' + fillOpacity=0.25 + var(--cmc-text-subtle); v1 scope range='7d' on TokenUsageCard; Plan 09 close gate verified including Rule-1 click hit-test patch (e838135) for portal-overlay-resilience; v13-time-picker.spec.ts:285 + v13-saved-views.spec.ts:473/501 round-trip verified)
- [x] **TIME-05**: Brush-zoom on time-series charts — drag-select on a chart zoom into that range; updates global time picker. Recharts `Brush` component used natively. ✅ 2026-05-13 (Phase 26 Plan 05 — useChartBrush hook + ResetZoomButton chrome on /activity ChartsStrip; brush commits write ABSOLUTE ISO time_from/time_to (date-only coerced to start-of-day / end-of-day ISO) — deliberately triggers AutoRefreshController's pause branch (Plan 03 pre-wired); always-mounted 28px chrome row with reserved min-height for ResetZoomButton conditional mount/unmount — no layout shift; ResponsiveContainer count preserved at 8; Plan 09 close gate v13-time-picker.spec.ts:326/345 verified)

### Layout Customization (LAYO) — show/hide + reorder + split-pane resize

- [x] **LAYO-01**: Per-route panel show/hide menu accessible via DropdownMenu in panel header (or page chrome). Hidden state persists into saved view's `state_json` (additive, opaque). ✅ 2026-05-16 (Phase 28 Plan 03 — PanelHeaderMenu component NEW with Radix DropdownMenu Settings-icon trigger + Hide + Reset Layout items mounted in PanelCard.headerMenu chrome slot from Plan 28-02; commits e669258 + eccb5a7 + 45ab4c7; APPEND-ONLY hidden_panels validateSearch on / + /activity + /cost + /skills + /alerts via asHiddenPanels validator from Plan 28-02 (Pitfall 2 undefined-default lock); render-time filter via useLayoutState.isHidden across all 5 routes with per-route PANELS render-array pattern (36 panel mounts total); LayoutCustomizableProps forwarding-prop shape exported from components/ui/index.ts so 35 panel components share a single convention; AlertRuleForm bespoke <article> root emits data-panel-id explicitly; SaveViewDialog UNTOUCHED — round-trip Playwright verifies hidden_panels persists into saved view's state_json via existing Phase 25 auto-capture pipeline (Pitfall 3 lock honored); Playwright 7/7 PASS on hide-and-persist + round-trip)
- [x] **LAYO-04**: Reset-to-default affordance on every layout-customizable surface — "Reset layout" button in DropdownMenu clears `state_json` layout overrides. Prevents corrupt-state lock-in. ✅ 2026-05-16 (Phase 28 Plan 02 ships chrome-level half: SavedViewMenu Reset Layout DropdownMenu.Item with panel-reset-layout-{route} testid + sonner toast.success('Layout reset') — RotateCcw icon + aria-label "Reset layout to default" — escape hatch for "all panels hidden" corrupt-state-lock-in per RESEARCH §7 + A2; safeRouteSlug() try/catch wraps normalizeRouteId so SavedViewMenu mounts on out-of-scope routes (/skills/foo) without crashing — Reset Layout simply does not render there; commit e042402. Phase 28 Plan 03 ships per-panel half: PanelHeaderMenu Reset Layout item with panel-reset-layout-{route} testid + sonner toast.success('Layout reset') in every panel's chrome on the 5 in-scope routes; Playwright LAYO-04 per-panel reset on /cost asserts the three layout keys (hidden_panels/panel_order/split_sizes) drop while time_from/time_to/compare_panels/range/a/b/schemaVersion survive verbatim (LAYO-04 SC#3 + Pitfall 11 destructuring-delete lock validated end-to-end). Two-surface coverage: operator can always escape regardless of whether any panels remain visible. commits e669258 + 45ab4c7)
- [x] **LAYO-02**: 1D drag-reorder of panels within columns (single-column reorder; no cross-column movement). Persists into saved view's `state_json`. ✅ 2026-05-16 (Phase 28 Plan 04 — DraggablePanelWrap component NEW (233 LOC) with native HTML5 dnd mouse path + keyboard reorder grab-mode (Space toggle aria-pressed + ArrowUp/Down move ±1 with boundary clamping + Enter commit + Esc cancel) + aria-live region announcing grab/move/drop/cancel (role='status' aria-live='polite' class='cmc-sr-only'); cross-column drops REJECTED by handleDrop's source-vs-target columnId match (T-28-08 mitigated); commits 59a4c03 + 13880b7 + 2a0c594; APPEND-ONLY panel_order validateSearch on / + /activity + /cost + /skills + /alerts via asPanelOrder validator from Plan 28-02 (Pitfall 2 undefined-default lock); render-order driven by useLayoutState.orderedPanels(MAIN_COLUMN) — replaces static JSX order; 26 reorder-eligible main-column panel mounts wrapped in DraggablePanelWrap across 5 in-scope routes; PANEL_REGISTRY['/alerts'] regrouped (alert-events-list 'main' → 'below') to mirror the route's actual two-grid layout; SaveViewDialog UNTOUCHED — panel_order persists into saved view's state_json via the existing Phase 25 auto-capture pipeline (Pitfall 3 lock honored); Playwright LAYO-02 4/4 PASS (mouse-drag on /cost + keyboard reorder on / and /cost + Escape-cancel on /cost); Phase 28 axe 5/5 PASS — drag grip surface (cmc-panel-grip + aria-label + aria-pressed + aria-live region) introduces ZERO serious/critical violations on /, /activity, /cost, /skills, /alerts; PHASE_28_NET_CLASS_MARKERS + violationTouchesPhase28 helper extends inversion filter to honor all four phases (25/26/27/28); 15 vitest assertions green on DraggablePanelWrap.test.tsx)
- [x] **LAYO-03**: Split-pane resize via `react-resizable-panels@4.11.0` on `/sessions/compare` (left/right resize) and per-route shells where useful. Single new dep covers this. Drag handle + double-click to reset. ✅ 2026-05-17 (Phase 28 Plan 05 — react-resizable-panels@4.11.0 installed at EXACT pin (single new runtime dep this phase; legitimacy gated via slopcheck [OK] + blocking-human npmjs.com verification — maintainer bvaughn, weekly DLs 32M+, no postinstall script, peer deps react ^18 || ^19 compatible with React 19.2.5); ResizablePanelGroup wrapper NEW (200 LOC) using v4 vocabulary verbatim Group/Panel/Separator/orientation (Pitfall 1 grep gate clean); URL writes on onLayoutChanged release-only (Pitfall 6 perf gate); double-click reset detection (±1% tolerance) → setSplit(groupId, null) prune via Plan 28-02 contract → URL drops split_sizes entirely (Pitfall 2 bare-URL gate preserved); Layout map ↔ positional CSV bridge via panelIds prop (Rule 1 deviation: v4 Layout type is `{[panelId]: number}` not number[] as RESEARCH.md §1 stated); APPEND-ONLY validateSearch ?split_sizes via asSplitSizes on /sessions/compare; SessionCompareView CompareBody refactored so per-side content (SessionId + KPIs + BarChart) bundles into <Panel id="side-a/b" defaultSize="50%" minSize="20%"> — STRING percentages required because v4 docs: "Numeric values are assumed to be pixels"; shared diff sections (skill-diff, skill-latency, tool-counts, rates-as-of) stay BELOW the resizable region; NO PanelHeaderMenu — single-panel route out of LAYO-01/02 scope; commits 5e26a5c + 8af2cae + 8bde9d9 + e908f0d; SaveViewDialog UNTOUCHED — split_sizes persists into saved view's state_json via the existing Phase 25 auto-capture pipeline (Pitfall 3 lock honored); Playwright LAYO-03 4/4 PASS (pointer drag URL write, refresh restore 70/30, double-click prune, chart svg DOM identity preserved across 3 drag-cycles — Pitfall 6 verified); Phase 28 axe scan extension on /sessions/compare?split_sizes=70,30 clean; 6 vitest assertions green covering URL round-trip × 4 + Separator testid + default orientation; bundle delta +10.4 KB gzipped on SessionCompareView chunk (≤15 KB budget); 6 documented Rule-1 deviations in 28-05-SUMMARY.md)

### Command Palette (CMDK) — additive Command.Group blocks

- [x] **CMDK-01**: Saved Views group — open view by name (current route filtered first), set as default, jump to view's URL. No new context; reuses `useSavedViews(route)` from VIEW-04. _(complete 2026-05-12, Phase 25 Plan 08 — CommandPalette "Saved Views" Command.Group, cross-route useSavedViews(), current-route-first sort, routePathFromId dynamic-route guard, selection navigates+setLoadedView+closes; 11 vitest specs)_
- [x] **CMDK-02**: Set Density command (Compact / Comfortable / Cozy) with current-state indicator. ✅ 2026-05-13 (Phase 26 Plan 06 Task 2 — Density Command.Group with 3 discrete items + ✓ check-prefix on currently-active; selection calls setDensity() directly via lib/density.ts — Pitfall 3 lock NO React Context bridge; POLI-11 zero-rerender preserved; 5 vitest cases; cmdk-density-{value} dynamic testid)
- [x] **CMDK-03**: Time Range commands — set predefined ranges (last 1h / 24h / 7d / 30d), copy current range, paste clipboard range. ✅ 2026-05-13 (Phase 26 Plan 06 Task 1 — Time range Command.Group with 4 condensed presets + Copy/Paste commands reusing lib/time/clipboard.ts serializeRange/parseRangeFromText + sonner toasts exactly; function-form navigate writes time_from/time_to mirroring TimePicker Plan 03 URL contract; 6 vitest cases; cmdk-time-range-{value} dynamic + cmdk-time-range-copy/paste exact testids)
- [x] **CMDK-04**: Recent items group — last 5 visited routes (SHEL-05) + last N ad-hoc states (VIEW-09). Cross-route surfacing. ✅ 2026-05-13 (Phase 26 Plan 06 Task 1 — Recents Command.Group at top of palette reading getRecentRoutes() top-5 from cmc.recents.routes Plan 02 + getAllRecentStates() top-5 cross-route ad-hoc states from Phase 25 Plan 10; empty-state cmdk-recents-empty surfaces when both rings empty; 6 vitest cases; cmdk-recents-route-{slug}/state-{idx} dynamic testids; routeToTestidSlug() pure helper mirrors SidebarNavLink slug vocabulary)

### Polish & Quality (POLI) — extends existing POLI prefix

- [x] **POLI-09**: Formal per-phase visual checkpoint pattern. Each phase ends with operator-driven visual review documented in `.planning/phases/{N}/VISUAL-CHECK.md` (screenshots + verdict). Verifier gates on visual checkpoint pass. _(complete 2026-05-12 — Phase 24 plans 05 (v13-visual-capture.spec.ts 36-row matrix) + 07 (24-VISUAL-CHECK.md operator verdict PASS); 437e848 evidence assembly; 36/36 PNGs PASS at phase close)_
- [x] **POLI-10**: Accessibility audit per phase via axe-core integration. WCAG AA contrast requirement on all new chrome (especially dark-theme text/background pairs in headers/sidebar). Focus rings on all interactive elements. _(complete 2026-05-12 — Phase 24 plans 05 (v13-a11y.spec.ts 30-run matrix) + 07 (06f09a2 cleared 3 Phase-24 regressions: Skeleton role="status", sidebar section-header --cmc-text-subtle→--cmc-text-dim, networkidle→domcontentloaded); 6 pre-existing v1.2-baseline contrast classes Accepted-Exception-deferred to Phase 26/27 per RESEARCH Pitfall 7)_
- [x] **POLI-11**: Perf budget per phase — density toggle is CSS-only (no React re-renders confirmed via React DevTools profiler at phase close); chart polling stays <16ms paint; no `ResponsiveContainer` ResizeObserver pile-up regression. _(complete 2026-05-12 — Phase 24 plans 05 (lighthouserc.json + perf budget scaffolding) + 07 (Lighthouse 9/9 PASS: LCP 559-572ms / CLS 0-0.0032 / performance 1.0; DOM-identity zero-rerender probe substituted for React DevTools profiler — 3/3 chart + 15/15 card markers preserved across 2 density flips, functionally identical to "0 React commits below DensityToggle" with architectural backing from Plan 02's no-React-Context DensityProvider; ResponsiveContainer count delta 0 = 26 == v1.2 baseline 26; INP excluded from auto-assertions with inline rationale in 88e8417))_
- [x] **POLI-12**: Affordance checklist `docs/affordance-checklist.md` — 15 keyboard/interaction affordances enumerated (Esc-to-close, focus-return, Tab-cycle inside Sheet, Cmd+K context commands, scroll-position-restore on Sheet close, drag handles, click-outside-to-close, theme toggle, density toggle, etc.). Verified at every phase close. _(complete 2026-05-11 — Phase 24 plan 06; commit 3698bf3)_
- [x] **POLI-13**: URL contract documentation `docs/url-contract.md` + CI test (`tests/test_url_contract.py`) — enumerates every preserved URL pattern + validateSearch shape; CI fails if any preserved pattern breaks. _(complete 2026-05-11 — Phase 24 plans 05 + 06; commits 3698bf3 (docs) + cdeda8d (pytest); 2/2 passing)_
- [x] **POLI-14**: `data-testid` registry (`docs/testid-registry.md`) + ESLint rule (`testid-registry-only`) — prevents Playwright selector churn during shell rework. Skip count locked at v1.2 baseline (2 known skips). _(complete 2026-05-11 — Phase 24 plan 06; commits e700a9e + 5e6bb73; pnpm lint enforces)_

### Tech Debt Closure (TDBT) — Phase 27 bundles

- [x] **TDBT-01**: Expose `project_key` on `SessionListItemFull` and `SessionCompareSide` wire shapes (additive). Frontend compare picker switches from cwd-as-proxy to authoritative `project_key` (per Phase 23 carried debt). ✅ 2026-05-16 (Plans 27-02 backend + 27-03 frontend + Plan 27-09 close-gate verification — live `GET /api/sessions?limit=2` returns `project_key: "37ae465f3a20"` + `"63c04f774647"` 12-char hex; live `GET /api/sessions/compare?a=…&b=…` returns both sides' project_key; `scopeCwd` source-grep = 0 hits, `scopeProjectKey` = 12 hits in CommandPalette.tsx; "Showing sessions in the same project" copy verified — no 12-char hex leak)
- [x] **TDBT-02**: Remove `KNOWN_METRICS` frontend fallback constant. Rely solely on `useAlertMetrics` hook (per Phase 21 carried debt). Cross-language drift guard rewritten from build-time grep (`test_alerts_metrics_sync.py` — DELETED) to runtime API-contract assertion (`test_alerts_metrics_contract.py` — CREATED, asserts `sorted(_SCOPE_EXTRACTORS.keys()) == sorted(GET /api/alerts/metrics → metrics)`) per LOCKED OPERATOR DECISION 2 "Replace with contract test". ✅ 2026-05-16 (Plan 27-07 commits 38424a1 + c611da3 + Plan 27-09 close-gate verification — live `/alerts` issues `GET /api/alerts/metrics`; AlertRuleForm `<select>` renders 4 options including 3 raw-key options from API: cost_usd_24h / dispatcher_failed_tasks_5m / skill_p95_latency_ms; `grep -c FALLBACK_KNOWN_METRICS frontend/src/components/panels/AlertRuleForm.tsx` returns 0; `backend/tests/test_alerts_metrics_sync.py` absent; `backend/tests/test_alerts_metrics_contract.py` present + 2/2 PASS)
- [x] **TDBT-03**: Add retry UX to `POST /api/alerts/parse-nl` 503 collapse. Surface honest non-specific affordance (Retry button + locked copy) instead of silent error (per Phase 21 carried debt). ✅ 2026-05-16 (Plan 27-08 commit 1b6d690 + Plan 27-09 close-gate verification — Queue UX intentionally NOT shipped per LOCKED OPERATOR DECISION 3 "honor V11; non-specific copy + retry"; V11 collapsed-failure-mode lock preserved — backend route UNCHANGED; live walkthrough verified stubbed `/api/alerts/parse-nl` → 503 renders operator-locked copy verbatim ("Couldn't parse this description. The phrasing didn't match a known pattern, or the natural-language service is temporarily unavailable.") inside `role="alert"` block with Retry button; clicking Retry fires 2nd POST with identical payload — calls=2, payloadsIdentical=true; zero leaked terms — "credentials missing" / "Anthropic" / "API key" / "ANTHROPIC_API_KEY" all absent honoring V11 lock; manual ThresholdForm BELOW remains focusable/enabled preserving Phase 21 Pitfall 5 invariant).

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
| SHEL-05 | Phase 26 | ✅ Complete (plan 04 + plan 09 close gate, 2026-05-13) |
| SHEL-06 | Phase 25 | ✅ Complete (plan 09, 2026-05-12) |
| DENS-01 | Phase 24 | ✅ Complete (plans 02 + 05 e2e, 2026-05-11) |
| DENS-02 | Phase 24 | ✅ Complete (plans 02 + 05 runtime Portal cascade fixture, 2026-05-11) |
| DENS-03 | Phase 24 | ✅ Complete (plans 02 + 05 e2e persistence, 2026-05-11) |
| VIEW-01 | Phase 25 | ✅ Complete (plans 03 + 04, 2026-05-12) |
| VIEW-02 | Phase 25 | ✅ Complete (plan 01, 2026-05-12) |
| VIEW-03 | Phase 25 | ✅ Complete (plan 02, 2026-05-12) |
| VIEW-04 | Phase 25 | ✅ Complete (plan 06, 2026-05-12) |
| VIEW-05 | Phase 25 | ✅ Complete (plan 06, 2026-05-12) |
| VIEW-06 | Phase 25 | ✅ Complete (plan 10, 2026-05-12) |
| VIEW-07 | Phase 25 | ✅ Complete (plan 07, 2026-05-12) |
| VIEW-08 | Phase 25 | ✅ Complete (plan 06, 2026-05-12) |
| VIEW-09 | Phase 25 | ✅ Complete (plan 10, 2026-05-12) |
| TIME-01 | Phase 26 | ✅ Complete (plan 03, 2026-05-13) |
| TIME-02 | Phase 26 | ✅ Complete (plans 02 + 03 + 08 + plan 09 close gate, 2026-05-13) |
| TIME-03 | Phase 26 | ✅ Complete (plan 03, 2026-05-13) |
| TIME-04 | Phase 26 | ✅ Complete (plan 07 + plan 09 close gate, 2026-05-13) |
| TIME-05 | Phase 26 | ✅ Complete (plan 05 + plan 09 close gate, 2026-05-13) |
| LAYO-01 | Phase 28 | ✅ Complete (plan 03, 2026-05-16) |
| LAYO-02 | Phase 28 | ✅ Complete (plan 04, 2026-05-16) |
| LAYO-03 | Phase 28 | ✅ Complete (plan 05, 2026-05-17) |
| LAYO-04 | Phase 28 | ✅ Complete (plans 02 + 03, 2026-05-16) |
| CMDK-01 | Phase 25 | ✅ Complete (plan 08, 2026-05-12) |
| CMDK-02 | Phase 26 | ✅ Complete (plan 06 Task 2, 2026-05-13) |
| CMDK-03 | Phase 26 | ✅ Complete (plan 06 Task 1, 2026-05-13) |
| CMDK-04 | Phase 26 | ✅ Complete (plan 06 Task 1, 2026-05-13) |
| POLI-09 | Phase 24 | ✅ Complete (plans 05 + 07, 2026-05-12) |
| POLI-10 | Phase 24 | ✅ Complete (plans 05 + 07, 2026-05-12) |
| POLI-11 | Phase 24 | ✅ Complete (plans 05 + 07, 2026-05-12) |
| POLI-12 | Phase 24 | ✅ Complete (plan 06, 2026-05-11) |
| POLI-13 | Phase 24 | ✅ Complete (plans 05+06, 2026-05-11) |
| POLI-14 | Phase 24 | ✅ Complete (plan 06, 2026-05-11) |
| TDBT-01 | Phase 27 | ✅ Complete 2026-05-16 — backend half (plan 02: project_key on /sessions list + /sessions/compare wire shapes; 3 round-trip pytest cases lock the wire-shape promise) + frontend half (plan 03: SessionListItemFull + SessionCompareSide TS mirror; ComparePicker filter switched from row.cwd === scopeCwd to row.project_key === scopeProjectKey; 2 vitest cases lock symlink-collapse + byte-equal-cwd edge cases + copy-no-hex-leak invariant) + Plan 27-09 close-gate verification (live `GET /api/sessions?limit=2` returns 12-char hex on both rows; live `GET /api/sessions/compare?a=…&b=…` returns both sides' project_key; source-grep scopeCwd=0 + scopeProjectKey=12 in CommandPalette.tsx; description copy "Showing sessions in the same project" with no hex leak verified) |
| TDBT-02 | Phase 27 | ✅ Complete 2026-05-16 — Plan 27-07: FALLBACK_KNOWN_METRICS constant deleted from AlertRuleForm.tsx; useAlertMetrics is the SOLE frontend metric-vocabulary source; disabled <select> 3-branch state covers the brief loading window ("Loading metric vocabulary…" / "No metrics available" / "Select a metric…"); empty-string sentinel + buildBody empty-metric guard; drift guard rewritten from build-time grep test_alerts_metrics_sync.py (DELETED) to runtime API-contract test_alerts_metrics_contract.py (CREATED — 2 async tests asserting sorted(_SCOPE_EXTRACTORS.keys()) == sorted(GET /api/alerts/metrics → metrics)) per LOCKED OPERATOR DECISION 2 "Replace with contract test"; commits 38424a1 + c611da3 + Plan 27-09 close-gate verification (live `/alerts` issues `GET /api/alerts/metrics` returning {"metrics": ["cost_usd_24h", "dispatcher_failed_tasks_5m", "skill_p95_latency_ms"]} driving AlertRuleForm `<select>` 4-option render; grep -c FALLBACK_KNOWN_METRICS AlertRuleForm.tsx returns 0; test_alerts_metrics_sync.py absent; test_alerts_metrics_contract.py 2/2 PASS) |
| TDBT-03 | Phase 27 | ✅ Complete 2026-05-16 — Plan 27-08: AlertNlInput's silent inline `<p>Could not parse — please rephrase</p>` 503 branch REPLACED with a `<div role='alert' class='cmc-alert-nl__error'>` block containing the LOCKED OPERATOR DECISION 3 honest non-specific copy ('Couldn't parse this description. The phrasing didn't match a known pattern, or the natural-language service is temporarily unavailable.') + Retry button (data-testid='alert-nl-retry') that re-fires useParseAlertNl.mutate({ description: text }) with the same payload as Parse; DoS guard via disabled={m.isPending}; hadError latched-state keeps the error block mounted across the retry's pending window (works around React Query's automatic isError→false reset on next mutate() call — Rule 2 missing-critical); V11 collapsed-failure-mode lock preserved verbatim — backend route UNCHANGED; Queue UX intentionally NOT shipped per LOCKED OPERATOR DECISION 3 "honor V11; non-specific copy + retry"; 5 new vitest cases + alert-nl-retry exact-match testid registered; commit 1b6d690 + Plan 27-09 close-gate verification (live stubbed /api/alerts/parse-nl → 503 renders honest copy verbatim inside role="alert" block with Retry button; clicking Retry fires 2nd POST with identical payload — calls=2, payloadsIdentical=true; zero leaked terms — "credentials missing" / "Anthropic" / "API key" / "ANTHROPIC_API_KEY" all absent honoring V11 lock; manual ThresholdForm BELOW remains focusable/enabled preserving Phase 21 Pitfall 5 invariant) |

**Coverage:**
- v1.3 active requirements: 45 total
- Mapped to phases: 45 ✓
- Unmapped: 0
- Duplicates (mapped to >1 phase): 0

**Progress (updated 2026-05-17 — Phase 28 close + v1.3 milestone SHIPPED):**
- ✅ Phase 24 closed (operator verdict PASS, 2026-05-12): 18/18 requirements complete — SHEL-01..04, DENS-01..03, CONT-01..05, POLI-09..14
- ✅ Phase 25 closed (operator verdict PASS, 2026-05-12): 11/11 requirements complete — VIEW-01..09, CMDK-01, SHEL-06
- ✅ Phase 26 closed (operator verdict PASS, 2026-05-13): 9/9 requirements complete — SHEL-05, TIME-01..05, CMDK-02..04
- ✅ Phase 27 closed (operator verdict PASS via live Chrome DevTools MCP walkthrough, 2026-05-16): 3/3 requirements complete — TDBT-01, TDBT-02, TDBT-03
- ✅ Phase 28 closed (operator verdict PASS via live Chrome DevTools MCP walkthrough, 2026-05-17): 4/4 requirements complete — LAYO-01 (Plan 28-03), LAYO-02 (Plan 28-04), LAYO-03 (Plan 28-05), LAYO-04 (Plans 28-02 + 28-03)
- **Net v1.3 progress: 45/45 (100%) — v1.3 Surface Redesign milestone SHIPPED 2026-05-17**

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
*Last updated: 2026-05-17 after Phase 28 close — LAYO-01..04 all marked Complete via Phase 28 Plans 02-05; Plan 28-06 (close gate) operator verdict PASS signed by Patryk Golabek via live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001; Phase 28 4/4 requirements satisfied; v1.3 Surface Redesign milestone SHIPPED 2026-05-17 — 5/5 phases verified, 45/45 active requirements satisfied (96% → 100%); single new runtime dep this milestone react-resizable-panels@4.11.0 at exact pin (Plan 28-05); APPEND-ONLY URL contract preserved across all v1.3 phases per Pitfall 13 lock.*
