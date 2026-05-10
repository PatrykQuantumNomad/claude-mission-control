# Feature Research — v1.3 Surface Redesign

**Domain:** Local-only single-user observability dashboard for Claude Code agent sessions — full-surface UX rebuild informed by Honeycomb / Datadog / PostHog / Grafana dashboard-product UX patterns.
**Researched:** 2026-05-10
**Confidence:** HIGH on the four reference products' documented behaviour (every claim below is sourced from official docs, official changelogs, or the products' own public design-system pages); MEDIUM on what's right for a *single-user local* tool, since none of the four references are single-user (they're team SaaS) — single-user implications are pattern-translation, not direct quotation.

---

## Scope Note

v1.3 is **surface redesign**, not feature expansion. Every existing v1.0 / v1.1 / v1.2 feature stays — what changes is how those ~30 panels across 7 routes feel, fit, and compose. The four targeted new capabilities (density toggle, saved views, customizable dashboards, multi-pane compare) are *cross-cutting surface primitives*, not new domain features.

This document categorises the eight pattern surfaces (shell+nav, panel containment, density toggles, saved views, customizable dashboards, multi-pane compare, time-anchored navigation, command palette) into **table stakes** (v1.3 cannot ship without — every reference product has them, missing them = product feels broken), **differentiators** (some references have them, some don't — pick based on user value), and **anti-features** (references explicitly avoid these or got them wrong; v1.3 should avoid them too).

The downstream `/gsd-define-requirements` step will use the table-stakes column to scope active v1.3 requirements, will individually scope each differentiator via AskUserQuestion (in/out for v1.3), and will dump anti-features into PROJECT.md OUT OF SCOPE.

---

## Reference Product Profiles (one-liner each)

| Product | Density Personality | Customisation Level | Saved Views | Command Palette | Single-User Fit |
|---------|---------------------|---------------------|-------------|-----------------|-----------------|
| **Honeycomb** | Boards (Manual or Auto layout, opinionated) | Low — Boards are curated; "launchpad" philosophy | Per-Board defaults (time/granularity); Triggers/SLOs first-class | Less prominent than Linear's | LOW — team-collaboration assumed |
| **Datadog** | "High density mode" auto-enabled on wide screens (12 → 2×12 column grid) | High — 12-column drag/resize, widget groups | Saved views (Logs, RUM, infrastructure list) with shareable URLs (`?saved_view=305130`) | `cmd+K` quick nav (recently visited views) | LOW — multi-tenant / RBAC throughout |
| **PostHog** | Tile-based dashboards with Edit-layout mode (`E` to enter); folders for nav | High — react-grid-layout drag/resize (only on wide viewports); auto-stack on narrow | Folder-organised dashboards; weak URL filter persistence (open issue #19069) | `cmd+K` palette + `cmd+shift+K` for keyboard-first navigation | MEDIUM — strong dev-tool aesthetic |
| **Grafana** | Two layouts: Custom (manual x/y/w/h) or Auto Grid (uniform) | Highest — full grid-coordinate control via JSON; `t z` zoom out, `t c/v` copy/paste time range | URL variables (`var-foo=bar`); `${__all_variables}` template | `?` shows all shortcuts; `g h/p/a` global jumps | LOW — operator-tier complexity |

**Translation rule for single-user local:** Take Datadog/Grafana for shell + density, take PostHog for typography/cmdk, take Honeycomb for *what NOT to over-build* (Honeycomb's "Boards are launchpads, not dashboards" philosophy is a north star against feature creep).

---

## Feature Landscape

### 1. Shell + Nav Layout

#### Table Stakes — every reference product has these

| Pattern | Why Expected | Complexity | Reference Behaviour |
|---------|--------------|------------|---------------------|
| **Persistent left sidebar** with route list (current 7 routes + tasks/schedules/inbox surfaces) | Linear, Notion, Vercel, Datadog, PostHog, Grafana **all** ship sidebar-first navigation. Top-tabs cap out around 5-7 items; v1.3 has 9-12 surfaces. | LOW (shadcn/ui has the component) | Vercel moved *from* horizontal tabs *to* sidebar specifically because tabs don't scale past ~6 items (Vercel changelog 2026-02). Datadog uses left rail with search bar + recents at top, integrations at bottom. |
| **Collapsible to icon-only** (~64px) with tooltips on hover | Power users navigate faster from icons alone after ~1 week of muscle memory; 240-280px expanded → 64px collapsed is the standard breakpoint. | LOW (shadcn `Sidebar` ships this; cookie-persisted) | shadcn/ui sidebar component exposes `collapsible="icon"` mode with cookie-based persistence; same primitive Vercel/Supabase use. |
| **Active-route indicator** (filled background or left-border accent) | Without it, the current location ambiguates fast on dense routes like `/skills/$name`. | LOW | Linear, Datadog, PostHog all dim non-active routes and brighten the active one (Linear's recent UI refresh explicitly does this). |
| **Section grouping** (e.g., "Observe": Home/Activity/Skills; "Operate": Tasks/Schedules/Inbox; "Configure": Alerts/Cost) | 9-12 flat items overwhelm; grouped headers (uppercase/dim labels) chunk to 3 sections of 3-4 items. | LOW | Datadog 2024 nav redesign explicitly grouped by "how users interact"; Honeycomb groups by Environment → Home/Query/Boards/Triggers/SLOs/Service Map. |
| **Cmd+K invocation from anywhere** (handled in category 8 too, but the keybinding is shell-tier) | Datadog, PostHog, Linear all bind `cmd+K`. Without it, sidebar becomes the only nav and that fails for power users. | NONE — already shipped | Existing v1.0+ cmdk implementation already global. |

#### Differentiators — pick based on value

| Pattern | Value Proposition | Complexity | Notes / Risk |
|---------|-------------------|------------|--------------|
| **Recently visited section** (top of sidebar, last 3-5 routes) | Datadog's quick-nav menu top section = "recently accessed pages" (monitors, dashboards, notebooks). For a solo dev cycling between `/skills/code-reviewer` → `/sessions/compare?a=…&b=…` → `/cost`, recents are 1-click. | LOW (track in localStorage, dedupe by route+key params) | Risk: with 7-9 routes total, recents may overlap heavily with the static list. Test: would the user actually use this, or is the static sidebar already short enough? |
| **Pinned favourites** (star a route to lift it above grouped sections) | Datadog explicitly gave "more space for favorites" in 2024 redesign citing "lengthy titles". For us, the analogue is starring a specific saved view (e.g., "Skills > my code-reviewer last 30d compare"). | MEDIUM (depends on saved-views implementation — see category 4) | Couples to saved-views; deferred until saved-views ships. |
| **Sidebar-resizable handle** (drag the right edge to widen for long view names) | PostHog and Vercel both ship this. For long Skill names like `tdd-coverage-author-with-fanout` it earns its keep. | LOW | shadcn Sidebar exposes resize via `--sidebar-width-icon` and `--sidebar-width`. |
| **Per-route inner sub-nav** (e.g., on `/skills`, a left tab list of installed skills) | Linear pattern: outer sidebar = workspace; inner sub-list = current section's contents. Useful at `/skills` (list of skills as left rail) and `/sessions/compare` (list of session pairs). | MEDIUM | Adds visual complexity. Defer unless route-specific overflow demands it (current `/skills/$name` does NOT have a list-rail and works fine — so keep it that way). |
| **Top bar with breadcrumbs + page-level actions** (Save view, Share, density toggle live here) | Datadog and Grafana both ship a thin top bar above the panel grid with breadcrumb + time picker + actions. Decouples page-level controls from sidebar. | LOW | Single-user means no breadcrumbs across orgs/teams/etc, so breadcrumbs reduce to `Project > Section > Detail` which is mostly redundant for `/skills/$name` (route already says it). Lean: top bar for *actions* (save view, share, density), no breadcrumbs. |

#### Anti-Features — avoid

| Anti-Feature | Why It Fails | What To Do Instead |
|--------------|--------------|--------------------|
| **Top-tabs as primary nav** (no sidebar) | Caps at 5-7 items. Vercel migrated AWAY from this in 2026 specifically because it didn't scale. v1.3 has 9-12 surfaces. | Sidebar with grouping. |
| **Hamburger-only / drawer-only nav** on a desktop-first single-user tool | Hamburger is for mobile / narrow viewports. Local dashboard at localhost:8765 has a desktop browser as the only context. Hiding nav by default punishes the user every session. | Persistent sidebar, optionally collapsed to icon-only. |
| **Cross-org / cross-tenant switcher in the sidebar header** | Datadog and PostHog both ship a top-of-sidebar tenant switcher. Single-user has no tenants. Including it would be cargo-culting the look without the function. | Skip the slot entirely OR use it for a different signal (e.g., "system status" health pill). |
| **Notification-bell + user-avatar dropdown in top-right** | SaaS conventions assume team accounts. Single-user single-machine has neither inbox-notifications-from-others nor a user identity to switch. Empty/decorative widgets erode trust. | The HITL inbox already lives at a route — surface its unread count as a sidebar badge on the inbox route, not as a separate bell. No avatar. |
| **Three-pane layout** (sidebar + middle list + right detail) globally | Works for email-style apps (Linear inbox, Slack). Doesn't work for *dashboard* surfaces where the centre needs full width for grids of panels. | Keep two-pane (sidebar + content). Use the third pane *only* in compare view (handled in category 6) and drawer/sheet overlays for session detail. |

---

### 2. Panel Containment

**Critical:** This category contains the three v1.3 overflow bugs (panels exceeding viewport / Sheets+Popovers escaping bounds / data overflowing card edges). Containment patterns from references resolve all three.

#### Table Stakes

| Pattern | Why Expected | Complexity | Reference Behaviour |
|---------|--------------|------------|---------------------|
| **Bounded panel max-height with internal scroll** (`max-h: clamp(...)` + `overflow-y: auto` inside the card) | Without bounded height, a panel with 200 rows pushes every panel below it off the viewport — exactly the "panels exceed viewport" bug. Datadog widget guidelines explicitly size widgets to viewport-fitting columns. | LOW (Tailwind `max-h-[480px] overflow-y-auto` on the panel body) | Datadog: Stream widgets ≥6 cols wide; timeseries ≥4 cols. Honeycomb Boards use Manual/Auto layout to keep panels bounded. Grafana Auto Grid enforces uniform sizes. |
| **Sticky panel header inside the bounded scroll container** | When the body scrolls, the title + filters + action menu must stay visible. CSS `position: sticky; top: 0` on the header *inside* the `overflow-y: auto` parent. Critical: parent must NOT be `overflow: hidden` or sticky breaks. | LOW (CSS) | Standard pattern documented by Smashing / NN/Group. |
| **Sheet/Popover/Dropdown stays bounded by viewport** (uses Radix Floating UI / portal) | The "Sheets+Popovers escape bounds" bug is exactly portal-misuse — content rendered inside a panel that's `overflow: hidden` gets clipped. Radix `Portal` renders to `document.body` and uses Floating UI's collision detection. | LOW (use Radix `Sheet`/`Popover`/`DropdownMenu` correctly with portals) | shadcn/ui ships these primitives with Portal-by-default. The fix is auditing usage, not adding infrastructure. |
| **Cells that ellipsis or wrap, never overflow horizontally** ("data overflows card edges" bug) | Long Skill names, long session IDs, long error messages: each must `truncate` (single line) or `break-words` (multi-line) — never escape the card. | LOW (Tailwind `truncate` on cells; tooltip on hover for full text) | Linear, Vercel, Datadog all do this. Datadog's effective-dashboards guide is explicit about not letting widgets squash content. |
| **Panel-internal pagination or "see more" affordance** when row count > N (typical N = 10) | A "Top Skills" panel with 47 skills should show 10 + "See all (47)" link. Avoids both unbounded height and infinite-scroll inside a dashboard cell. | LOW | Datadog top-list widgets cap at configurable N; Honeycomb Query Results cap displayed rows then link to full Query view. |
| **All panels respect a shared min-height baseline** (so the grid doesn't get jagged) | Without it, a 1-row "KPI" sits next to a 12-row table and the row's bottom edge zigzags. Datadog uses 12-column grid with widget min/max. | LOW (CSS grid + `min-h` token) | Datadog 12-col grid; Grafana Auto Grid; both enforce alignment. |

#### Differentiators

| Pattern | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **"Expand" button on panels** (toggle a panel between grid-cell-bounded and viewport-bounded) | Datadog has full-screen widget mode. For "Activity Heatmap" or "OTEL Firehose" the user occasionally wants the whole viewport. | MEDIUM (modal-style overlay, route-state preserved) | Risk: if the same data is on a dedicated route (e.g., `/activity` IS the heatmap route), expand is redundant. Audit: which panels are *also* full-route? Skip expand for those. |
| **Resize handle on individual panels** (drag bottom-right corner) | Grafana / PostHog / Datadog all ship this. For a single-user tool, MAYBE useful — but it's the marquee customizable-dashboard feature. Pulled into category 5 properly. | (see category 5) | Don't double-count. |
| **Loading skeletons that match final panel shape** (not generic shimmer rectangles) | Linear and Vercel both ship per-component skeletons. Reduces "layout shift" jank when slow queries resolve. | MEDIUM (one skeleton per panel type) | Worth doing IF the panel-level stutter is a real problem; verify with Phase-X measurement before committing. |
| **Sticky column-header inside data tables** (when table scrolls vertically inside a bounded panel) | Long sessions tables, skill runs tables — when the table itself scrolls, the column header should stick. Different from sticky-panel-header (which is title bar). | LOW (Tailwind `sticky top-0` on `<thead>`) | Standard pattern; tanstack-table integrates cleanly. |

#### Anti-Features

| Anti-Feature | Why It Fails | What To Do Instead |
|--------------|--------------|--------------------|
| **Unbounded panel height** ("just let the panel grow") | This is the exact "panels exceed viewport" bug being fixed. Lets one bad query destroy page usability. | Bounded `max-h` with internal scroll. Always. |
| **Infinite scroll inside a panel** | Inside a dashboard grid, infinite scroll fights with page-level scroll, traps the wheel, and prevents reaching panels below. Datadog explicitly does NOT do this in widgets. | Pagination or "see all" link to a dedicated route. |
| **Horizontal scroll inside a panel** (without explicit "wide table" intent) | Hidden horizontal scroll = invisible content. Datadog side-panel guideline: "no horizontal scrolling". | Truncate cells; offer a "Wide view" toggle that opens the panel in a viewport-bounded modal. |
| **Custom-built portal/overlay primitives** (homegrown z-index management) | Source of the "Sheets+Popovers escape bounds" bug — custom overlays don't compose with Radix portals already in use. Z-index wars ensue. | Use Radix Floating UI / shadcn primitives uniformly. Audit any custom overlay and migrate. |
| **Panels that hide overflow** (CSS `overflow: hidden`) without ANY scroll indicator | Silently truncates data; user has no way to know there's more. NN/G usability finding: invisible overflow scores badly on every UX heuristic. | `overflow-y: auto` + scrollbar visible by default OR an explicit "+47 more" footer. |

---

### 3. Density Toggles

#### Table Stakes

| Pattern | Why Expected | Complexity | Reference Behaviour |
|---------|--------------|------------|---------------------|
| **Three-tier density: Compact / Comfortable / Cozy** | MUI X DataGrid, Salesforce Lightning, Material Design all converged on three modes. Three is the right N: two feels arbitrary, four is decision fatigue. | MEDIUM | MUI X: `density="standard"\|"compact"\|"comfortable"`. Salesforce: Compact = 30% denser than Comfy. |
| **Persisted preference** (localStorage; survives reload) | Density preference is per-user, not per-session. Flipping every reload = ragequit. | LOW (`localStorage`; or extend `ActiveSessionContext` pattern) | All three references persist density once set. |
| **CSS variables drive spacing tokens** (not hard-coded `gap-4`) | Density toggle that re-themes 30 panels has to ride on tokens, not direct utilities. `--space-card-padding`, `--space-row-gap`, `--font-size-data`. | MEDIUM (token migration is the work; toggle itself is trivial) | Tailwind 4 CSS-first config supports this natively; shadcn uses CSS variables already. |
| **Density-aware data tables** (row height shrinks; column padding shrinks; font-size MAY shrink) | The panel categories that benefit most are tables (SkillRunsTable, SessionsTable, SkillProjectsTable). Compact = 40% more rows visible without scroll. | LOW once tokens exist | tanstack-table has no opinion; row-height comes from CSS. |
| **Density does NOT shrink charts** (chart axes/labels need readable size) | Charts have their own density (data-points-per-pixel); CSS density should leave them alone. | LOW | Datadog's high-density-mode reflows widget *layout* but doesn't shrink chart internals. |

#### Differentiators

| Pattern | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Per-route density default** (e.g., `/sessions/compare` defaults Compact for table-heavy comparison; `/` defaults Comfortable for KPI emphasis) | Honest signal: not every page benefits from the same density. Datadog activates "high density" only on wide screens. Asymmetric defaults are higher polish. | MEDIUM | Risk: surprises power users who expect global preference. Mitigation: route default applies on first visit; explicit toggle overrides and persists per-route. |
| **Auto-density based on viewport width** (wide monitor → comfortable defaults; smaller → compact) | Datadog's pattern exactly. Works because the user's screen IS a strong signal. | MEDIUM | Risk: `localhost:8765` users may have one screen size. Less value than for SaaS. Defer. |
| **Cmd+K action: "Toggle density"** (cycle compact → comfortable → cozy) | Power users discover the feature via the palette. | LOW | Trivial once palette extension API exists. |
| **Density setting in URL** (`?d=compact`) for shareable view URLs | Coupling density into saved views means a "compact comparison view" is shareable as a URL. Otherwise saved views are density-agnostic and the recipient sees their own preference. | LOW | Decision: should density be part of saved-view URL state, or strictly user-preference? Lean: user-preference (closer to font-size — personal not content-state). |

#### Anti-Features

| Anti-Feature | Why It Fails | What To Do Instead |
|--------------|--------------|--------------------|
| **Per-panel density toggle** (each panel has its own toggle in its header) | Decision fatigue × 30 panels = visual chaos. Inconsistent density across the page is worse than uniform medium-density. Linear, Vercel, Datadog all keep density global. | One global toggle, in the top bar (or settings). Per-panel override is anti-pattern. |
| **Five+ density levels** ("airy", "spacious", "comfortable", "compact", "dense", "ultra") | Decision fatigue. Three is the sweet spot all the references converged on. | Three: Compact / Comfortable / Cozy. |
| **Density that changes data semantics** (e.g., compact mode hides columns; comfortable mode shows them) | Now density is a filter, not a layout setting. Users lose data without realising. | Density changes spacing/typography only. Hidden columns get a separate "Columns" menu (table feature, not density feature). |
| **Default = densest**, with no nudge toward Comfortable for first-time use | First impression on dense data UI overwhelms. NN/G research: first-run density should be Comfortable; power users opt INTO Compact. | Default = Comfortable. Compact = opt-in. |

---

### 4. Saved Views

**Pre-requisite:** v1.2 already shipped URL-state machinery on `/sessions/compare?a=…&b=…` (and `/cost?range=…`). Saved views = naming + persistence + retrieval on top of URL state. **This is the cheapest of the four new capabilities** because most of the work is already done.

#### Table Stakes

| Pattern | Why Expected | Complexity | Reference Behaviour |
|---------|--------------|------------|---------------------|
| **URL state captures the full filter set** (time range, skill filter, project filter, sort, density-or-not — see anti-features) | Without URL state, "save" has nothing to save. v1.2 already does this on compare and cost; v1.3 extends to ALL routes. | MEDIUM (per-route URL-state plumbing — Skills, Activity, Alerts) | Grafana: every variable becomes `var-foo=bar` in URL. PostHog: open issue #19069 because they DON'T have this. Datadog: strong URL-state on Logs Explorer. |
| **"Save current view" action** in the page top bar + Cmd+K | One-click capture of current state into a named view. | LOW | Datadog: "Save selections as view" from dropdown menu. Grafana: variables auto-included via `${__all_variables}`. |
| **Named saved-view menu, scoped per-route** (Skills' saved views ≠ Compare's saved views) | Cross-route saved views confuse — "my skill view" is meaningless on `/cost`. Each route has its own set. | LOW | Datadog Logs has its own saved views; Datadog Dashboards have their own. They don't bleed. |
| **Saved views are URL-shareable** (paste URL → opens that named view) | Even single-user users want to bookmark, paste into notes, or send to themselves across browsers. The view-name appears in URL: `/skills?view=code-reviewer-deep-dive`. | LOW (server-resolves view name → param expansion, OR view stores the param string and route hydrates) | Datadog: `?saved_view=305130`. Both name-based and ID-based refs work. |
| **Default-view affordance per route** ("when I open `/skills`, open this saved view by default") | Datadog Logs ships this as "default saved view"; without it, users open the route and re-apply their saved filter every time. | LOW | Single-user means single default — no per-user-team logic. |
| **Local persistence (SQLite or JSON)** since this is single-user local | No org account = no cloud sync. Persisted to the same SQLite the dashboard already uses (extend schema with `saved_views` table). | LOW | SQLite already ships. New table: `saved_views(id, route, name, params_json, is_default, created_at)`. |

#### Differentiators

| Pattern | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Edit + overwrite vs Fork-as-new semantics** | When user opens a saved view, tweaks a filter, and clicks Save: do they overwrite the view, or fork a new one? Datadog & Tableau both offer both via different buttons ("Save" vs "Save as"). | LOW once UI is built | Pattern: "Save" overwrites if a saved view is currently loaded; "Save as…" forks. Greys out "Save" if no view is loaded (user is in ad-hoc state). |
| **Pinned views** (marked favourites surface in sidebar or top-bar) | The sidebar-pinned-favourites pattern from category 1 hooks into saved views — pin "code-reviewer-7d" to sidebar for one-click recall. | LOW (extends sidebar) | Couples categories 1 + 4. |
| **"Recently viewed" auto-saved-view** (last 5 ad-hoc states retrievable) | Honest: you tweaked filters for 10 minutes, navigated away, want to come back. No explicit "save" needed — auto-history. | MEDIUM (LRU localStorage cache; UX surface in Cmd+K under "Recent views") | Risk: clutters the saved-views list. Mitigation: separate "Saved" vs "Recent" sections. |
| **NL "load view" via Cmd+K** ("show my code-reviewer view") | Already have Haiku in the stack for ALRT-14 (NL alerts) and the schedule composer NL-cron. Extending the same pattern to saved-view fuzzy resolution is cheap. | LOW (fuzzy match name first; only escalate to LLM if no exact match) | Don't LLM-call by default — fuzzy match handles 90%. |
| **View tags / categories** (group views into "investigations" vs "regulars") | Honeycomb-style organisation for users with 30+ saved views. | MEDIUM | Risk: solo-user with <10 views doesn't need tags. Defer until view count exceeds threshold. |

#### Anti-Features

| Anti-Feature | Why It Fails | What To Do Instead |
|--------------|--------------|--------------------|
| **Saved views that include user-preference state** (density, dark mode, sidebar collapsed) | Conflates "what data am I looking at" with "how do I prefer the UI". Recipient of a shared URL gets your density, density toggle becomes pointless. | Saved views capture data filters + time range only. Personal preferences live in `localStorage`. |
| **Saved views that auto-update when underlying state changes** (e.g., a view "Last 7d" silently re-defines its time range) | Datadog: shared dashboards "instantly reflect" content/layout changes — that's correct for shared dashboards. But saved views should be snapshots of *intent*, not live mutations. "Last 7d" should resolve at view-open time, not at view-save time. | Relative time ranges (`last-7d`) are stored as the relative expression, not as absolute timestamps. Absolute ranges store the timestamps. Document the semantics. |
| **Server-persisted views with no local fallback** | Single-user local: there IS no server-but-not-local. Storing in SQLite IS local. Don't add a separate cloud-sync layer that doesn't apply. | SQLite. Done. |
| **Cross-route saved views** ("save my whole dashboard state") | Every route has different params. A cross-route view is just a route + that route's view. Linking views across routes confuses scope. | Saved views are per-route. Cross-route navigation goes via Cmd+K. |
| **No "unsaved changes" indicator** (open view A, edit, navigate away, lose changes silently) | Users learn distrust fast. | Show a "•" pip on the view name when current state diverges from saved state, with "Save / Discard" buttons. Linear and Notion both do this. |

#### v1.0/v1.1/v1.2 dependency map

- Already-have: URL state on `/sessions/compare`, `/cost`, `?range=` query handling.
- v1.3 needs: URL-state plumbing extended to `/`, `/activity`, `/skills`, `/skills/$name`, `/alerts` (per-route filter sync hooks).
- New SQLite table + 3 endpoints (`POST /api/views`, `GET /api/views?route=…`, `DELETE /api/views/{id}`).
- Cmd+K extension to expose "Save view" and "Open view {name}" actions.

---

### 5. Customizable Dashboards (drag-resize)

**Honest framing:** This is the riskiest of the four new capabilities. Grafana ships full drag-resize because it's an operator's customisation tool for thousands of users with diverse needs. Single-user single-machine has *one* user with stable workflow needs. The cost-benefit shifts.

#### Table Stakes

| Pattern | Why Expected | Complexity | Reference Behaviour |
|---------|--------------|------------|---------------------|
| **Pre-set high-quality default layouts** | Honeycomb's "Boards or Launchpads" philosophy: a great default layout is worth more than letting users build their own bad one. Default `/` layout should be the curated v1.3 redesign — that IS the layout for 95% of use. | MEDIUM (layout work IS the v1.3 redesign) | Honeycomb explicitly de-emphasises drag-resize: "Boards are launchpads, not dashboards". |
| **Panel show/hide toggle** ("hide System Pressure on `/`") | Lower-cost than full drag-resize and covers 80% of "I want to customise" intent. | LOW (per-route panel-visibility map in localStorage; checkbox menu) | Datadog widget visibility per saved view. Grafana panel `hide` flag. |
| **Reorder panels via simple up/down or drag-handle** (single column / row reordering, not free 2D drag) | One axis of customisation (vertical order) covers most ergonomic complaints with a fraction of the complexity. | MEDIUM (use `dnd-kit` Sortable; not full grid) | Linear's view ordering, Vercel project ordering — both 1D drag. |

#### Differentiators

| Pattern | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Full 2D drag-resize grid** (Grafana / Datadog / PostHog model) | Highest-flexibility customisation. Ceiling of UX power. | HIGH (react-grid-layout integration; layout-state schema; mobile fallback; collision-detection edge cases; layout migration when panels added/removed) | **Risk:** for ONE user across 30 panels × 7 routes, ROI questionable. Single-user means ≤1 person ever benefits from each layout edit. **Recommendation:** start with show/hide + 1D reorder; only add 2D drag-resize if friction with that minimal model proves real. |
| **Panel resize on a 1D axis** (just height, just width within row) | Compromise between full 2D and zero customisation. Useful for "make this chart taller / shorter" without committing to full grid math. | MEDIUM | Less mature library support; might require custom logic. |
| **Multiple saved layouts per route** ("dense layout" vs "presentation layout" — switch via dropdown) | Different sessions of work have different visual needs. Like saved-views (category 4) but for layout. | MEDIUM | Couples to saved views. Risk of confusing two namespaces. Defer. |
| **Layout snapshot in saved views** ("this view also locks layout") | If saved views capture filters AND layout, a "Skill deep dive" view positions the SkillCostCard prominently. | MEDIUM | Adds ambiguity to saved-view semantics. Lean: keep saved views = filters only; layouts are separately persisted. |

#### Anti-Features

| Anti-Feature | Why It Fails | What To Do Instead |
|--------------|--------------|--------------------|
| **Building react-grid-layout for v1.3 just because reference products have it** | Cargo-cult. Datadog ships drag-resize because 1000-user orgs have 1000 layout opinions. Single-user dashboard has one. Shipping the heavy infrastructure for one user is the wrong tradeoff. | Show/hide + 1D reorder first. Measure friction. Add full grid IF and only if friction is real. |
| **Mobile drag-resize support** | macOS-only single-user local at localhost:8765 has no mobile context. PostHog's grid auto-stacks on small viewports — a feature we don't need. | Desktop-only customisation; mobile out of scope (already aligned with project constraints). |
| **Editable widget content** (let users edit a panel's underlying SQL like Grafana) | This crosses from "dashboard customisation" into "dashboard authoring tool". Out of scope for v1.3. v1.x has no path toward an authoring tool. | Panels are author-time defined. Customisation = visibility, order, resize only. |
| **Resetting layout requires confirm modal × 2** ("Are you sure?" "Are you REALLY sure?") | Modal fatigue. Linear single-confirms with Cmd+Z available. | One confirm; Cmd+Z restores; or "Restore default layout" button always available. |
| **Layout state in localStorage only (no URL/SQLite)** | Cross-browser, post-cache-clear loss. Single-user is forgiving but not infinitely so. | SQLite-persisted, with cookie/localStorage as cache for instant render. |

---

### 6. Multi-Pane Compare Beyond 2-up

**Honest verdict surfaced first:** The strongest signal from research is that **3-way compare is rare in observability dashboards because the value-per-pane drops sharply past 2**. None of the four reference products ship 3-way as a first-class compare. v1.3's existing two-up `/sessions/compare` is the well-trodden path. 3-way is a differentiator at best, not table stakes.

#### Table Stakes

| Pattern | Why Expected | Complexity | Reference Behaviour |
|---------|--------------|------------|---------------------|
| **Two-up compare (already shipped at v1.1)** | The base case is well-understood. Side-by-side panels at ≥1024px, KPI strip on top, diff rows. | NONE — exists | Existing `/sessions/compare?a=&b=` covers this. |
| **Highlighted diff signals** (delta arrows, signed deltas, conditional formatting) | Without diff highlighting, side-by-side is just two views — the value of compare is *seeing the difference*. v1.2 added per-skill p95 latency delta. | NONE — partly exists | Standard pattern. |
| **Sync interactions across panes** (hover row in left → highlight same row in right) | When the left pane scrolls, the right should NOT scroll with it (panes have different content) — but tabular row hover should mirror across. | MEDIUM | Linear's split view does this for code/diffs. |

#### Differentiators

| Pattern | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **3-way compare** (a/b/c) | Honest use cases: "regression triangulation" (good run / bad run / neutral baseline). For solo dev iterating on skills, the question is rarer than 2-up but real. | HIGH | **Layout reality:** 3 panes × 320px-min = 960px content + 240px sidebar = 1200px viewport floor. macOS-only single-user often runs full-screen on 1440+ monitors → fits. **Recommendation:** scope as differentiator (in/out for v1.3). If in: a/b/c URL params, KPI strip per pane, diff matrix needs an "anchor" column to compute deltas against (default = a). |
| **N-way overlay (not side-by-side)** — overlay multiple sessions' time series on one chart | Different intent: not "compare side-by-side", but "see the families of curves". Datadog's "compare to past" overlays last week's data; Grafana repeating panels do this. | MEDIUM | More useful for time series than for tabular skill data. Likely fits as a `/cost` chart toggle, not as a compare-route extension. Different feature entirely. |
| **"Anchor + variants" pattern** (one anchor pane + N comparison panes computed against it) | Avoids the combinatorial diff problem of 3-way (do you show a-b, a-c, AND b-c?). User picks the anchor; other panes show signed deltas relative to anchor. | MEDIUM | Cleaner UX than symmetric N-way. |
| **Vertical-stack compare on narrow viewports** (panes stack instead of going side-by-side below 1024px) | Standard responsive pattern. macOS-only desktop almost never narrow → low value. | LOW | Defer. |

#### Anti-Features

| Anti-Feature | Why It Fails | What To Do Instead |
|--------------|--------------|--------------------|
| **N-way compare with N > 4** | Information density past 4 panes is unusable on any viewport. None of the references ship it. | Cap at 3 (or 4 in extreme cases). |
| **Compare that collapses below readable widths instead of stacking** | At 800px viewport, a 2-up at 320px each = 640px content + sidebar overflow + cells truncated to 12 chars = useless. PostHog's pattern: stack to single column on small. | Either stack to single column OR show a "viewport too narrow for compare" message with explicit pivot to single-pane mode. |
| **Diff-matrix that shows every pairwise delta** (a-b, a-c, b-c for 3-way) | n² panels for n inputs. Visually unparseable. | Anchor-based: fix one as reference; show deltas of others against it. User toggles which is anchor. |
| **Compare without an explicit "anchor" or "baseline" choice** in 3-way+ | Symmetric compare is meaningless past 2 panes — "which one is the reference?" must be explicit. | Anchor pane visually distinguished (border, background tint); user can re-anchor with one click. |
| **Building 3-way compare without a clear use case** | The strongest research finding: 3-way is rare. Building it speculatively on a single-user tool risks 200 LOC for zero usage. | **Lean:** scope 3-way as a differentiator question to the user during requirements; default OUT unless the user names a real triangulation workflow. |

---

### 7. Time-Anchored Navigation

#### Table Stakes

| Pattern | Why Expected | Complexity | Reference Behaviour |
|---------|--------------|------------|---------------------|
| **Global time picker in top bar** (relative quick-picks: 1h / 24h / 7d / 30d + custom range + "now") | Every reference product has this. Without it, time is implicit per-panel and the user has no global mental model. | MEDIUM (top-bar component; URL state for `?range=…` and `?from=&to=`) | Datadog: top-right time picker; Grafana: master picker between zoom/refresh; Honeycomb: per-Board defaults that override per-query. |
| **Relative time ranges expressed symbolically** (`last-7d`, `last-24h`, `last-30d`) — NOT resolved to absolute timestamps until query time | A saved view with "Last 7d" should mean "last 7d at the time of viewing", not "those exact 7d frozen". | LOW (resolver utility; existing `?range=` already does this in v1.2) | Grafana, Datadog, PostHog all do this. |
| **All panels respect the global picker by default** (unless explicitly overridden per-panel) | Without sync, two panels may show different time windows and the user spots the discrepancy hours into investigation. | MEDIUM (each panel reads `useGlobalTime()` hook unless `?panelTime` override) | Grafana's exact pattern: when dashboard time changes, panel overrides revert unless explicitly set. |
| **"Now" indicator** (auto-refresh option: off / 30s / 1m / 5m) | Without auto-refresh, the user has to manually F5. With it, "now" stays live. Match v1.0 SSE OTEL Firehose semantics. | LOW (existing useEffect-poll plumbing) | All four references ship this. Datadog has "live tail" mode; Grafana has refresh interval picker; Honeycomb has streaming. |
| **URL-state for time range** (`?from=…&to=…` or `?range=last-7d`) | Already partly shipped. Critical for saved views (category 4). | LOW (extend to all routes) | Grafana: `var-` URL pattern; Datadog: native time URL; PostHog: gap (issue #19069). |

#### Differentiators

| Pattern | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Time-range copy/paste** (Grafana 2024: `t c` copies, `t v` pastes) | Move time context across routes / browser tabs without re-entering. Niche but loved by power users. | LOW (clipboard API + parse) | Grafana ships this exactly; pattern is small and complete. |
| **"Compare to previous period" overlay** (last-7d shows last-7d data + dimmed prev-7d data on same chart) | DeltaPill (v1.2) shows the number; the overlay shows the *shape*. Datadog's "Change overlay" docs ship this. | MEDIUM | Naturally extends DeltaPill ergonomics. |
| **Time-range presets as Cmd+K commands** ("last-7d", "last-30d", "yesterday", "this month") | Cmd+K already exists; adding time-jump actions is cheap and discoverable. | LOW | Linear pattern: `g`-prefix commands cover navigation; time presets fit in palette. |
| **Per-panel time override** (advanced: this panel uses last-30d while page is last-7d) | Grafana ships this; rarely used. Useful for "context panels" (e.g., 30d cost on a 7d page). | MEDIUM | Risk: confusion when override is invisible. Show explicit badge on overridden panels. |
| **Time-range zoom/pan via brush selection on charts** (drag a region on a time series → zoom to that range) | Grafana, Datadog both ship. Strong for investigation workflows. | MEDIUM | Recharts supports brush; integration cost moderate. |

#### Anti-Features

| Anti-Feature | Why It Fails | What To Do Instead |
|--------------|--------------|--------------------|
| **Per-panel time picker shown by default on every panel** | Visual clutter × 30 panels. Decision fatigue. | One global picker. Per-panel override is opt-in via panel overflow menu, not default UI. |
| **Auto-refresh defaulting ON at high frequency** (e.g., 5s default refresh) | Local SQLite query churn × always-on = wasteful. Battery / fan / log noise. | Default OFF; user opts in to refresh interval. |
| **Time picker as modal/dialog instead of inline popover** | Modal blocks page; inline popover keeps context. All four references use inline popover. | Inline popover anchored to picker button. |
| **Mixing absolute + relative without a clear toggle** ("From: 2026-04-01 To: now-1h") | Confusing semantics. Either both ends are absolute or one is anchored. | Either Quick (relative) tab + Custom (absolute range) tab — Datadog's pattern. Don't allow mixed without explicit semantics. |
| **Resetting time on every navigation** (going `/` → `/skills` resets time picker) | Defeats the purpose of global. | Time persists across routes (URL-param + session). |

---

### 8. Command Palette in Dashboards

**Existing baseline:** Cmd+K already ships at v1.0+. v1.2 added "compare-with-previous". v1.3 extends, doesn't rebuild.

#### Table Stakes

| Pattern | Why Expected | Complexity | Reference Behaviour |
|---------|--------------|------------|---------------------|
| **Cmd+K opens from anywhere globally** (already shipped) | Datadog, PostHog, Linear all global. | NONE — exists | Datadog: `cmd+K` quick nav; PostHog: `cmd+K` palette + `cmd+shift+K` keyboard-first. |
| **Search/filter as you type** (fuzzy match across actions, routes, recent items) | Any palette without fuzzy = palette failed. cmdk library is built around this. | NONE — cmdk handles | Linear, Raycast, Vercel all use the cmdk library. |
| **Grouped sections** (Navigate / Actions / Recent / Saved Views / Time Range) | Without groups, scanning 50+ commands fails. Linear groups by section: Issues / Cycles / Settings. | LOW (cmdk supports `<CommandGroup>`) | Linear visible pattern; PostHog command palette docs. |
| **Keyboard shortcuts shown next to commands** (right-aligned hint per row) | Without it, users never learn shortcuts; palette teaches the keymap. | LOW | Linear shows `G I`, `G T`, etc on each row; standard cmdk pattern. |
| **Keyboard navigation: arrows to move, Enter to fire, Esc to close** | cmdk handles. | NONE | Standard. |
| **Action-mode**: typing executes a command (opens view, jumps route); not just navigation | The palette IS the action surface, not just a search bar. | NONE — exists | All four references. |

#### Differentiators (v1.3 SHOULD add these)

| Pattern | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Jump-to saved view** (`Open view: code-reviewer-7d`) | Hooks into category 4 saved views. Fastest path to recall a curated state. | LOW (cmdk action that fetches saved views and routes via params) | Datadog: saved-views accessible via Cmd+K with `?saved_view=…` URL. |
| **Jump-to time range** (`Last 7 days`, `Last 24h`, `Yesterday`, `This month`) | Hooks into category 7. Cheap and discoverable. | LOW | Linear pattern of presets in palette. |
| **Jump-to filter shortcut** (`Filter: skill = code-reviewer`) | Pre-applies a filter without going to UI controls. For repeat investigations of the same skill/project. | MEDIUM (palette knows current route's filterable fields; needs introspection per route) | Risk: each route's filter set is different; building a shared abstraction for palette-introspectable filters is non-trivial. Defer until 1-2 routes prove the pattern. |
| **NL command** ("show me yesterday's compare for code-reviewer") | Hooks Haiku into palette as a fallback when fuzzy match yields no results. Aligns with v1.2 NL alert authoring. | MEDIUM | Risk: latency spike vs instant fuzzy. UX rule: only call LLM when fuzzy returns 0 hits AND user holds Enter for 250ms (deliberate gesture). |
| **Density toggle in palette** (`Set density: Compact`) | Hooks into category 3. Trivial extension. | LOW | One palette action per density level. |
| **Recent items section** (last 5 routes/views visited) | Datadog's pattern: top of quick-nav menu is recents. | LOW | localStorage-backed; surfaces at top when palette opens with empty query. |
| **"Compare with previous"** (already shipped v1.2) | Existing pattern. Establish that pattern as the template for category-7 jumps. | NONE — exists | — |

#### Anti-Features

| Anti-Feature | Why It Fails | What To Do Instead |
|--------------|--------------|--------------------|
| **Palette with 100+ commands, ungrouped** | Linear power users have 50+ commands BUT they're grouped and the search is fuzzy. Flat = scanning cost = unused. | Group + show shortcut hints + keep search aggressive. |
| **Palette as the ONLY way to do an action** (no UI button) | Cmd+K is for power users; UI buttons are for discovery. Each high-value action should have BOTH a palette command AND a visible UI affordance. | Dual surface: visible button + palette command. |
| **Palette commands that take parameters via separate prompt steps** ("Open view → which view? → enter name → ENTER") | Multi-step palette is friction. Linear does single-shot: "Open view: code-reviewer-7d" all in one query. | One-shot fuzzy match. Inline parameter completion via cmdk's nested patterns. |
| **NL palette as default mode** (every keystroke calls LLM) | Latency, cost, noise. PostHog's keyboard-first palette is fuzzy-only by design. | Fuzzy-first; LLM as fallback only when fuzzy returns 0. |
| **Recent items that include destructive actions** ("Recent: deleted alert rule X") | Re-firing destructive actions accidentally is bad UX. | Recents = navigations + reads only. Mutations show one-shot, not in recents. |

---

## Feature Dependencies

```
[Saved views (cat 4)]
    └──requires──> [URL state for all routes (extends v1.2)]
    └──requires──> [SQLite saved_views table + 3 endpoints]
    └──extends────> [Cmd+K palette (cat 8) — Save/Open view actions]
    └──extends────> [Sidebar pinned favourites (cat 1) — pin a saved view]

[Density toggle (cat 3)]
    └──requires──> [CSS variable token migration (most of the work)]
    └──requires──> [localStorage persistence]
    └──extends────> [Cmd+K palette (cat 8) — set density action]

[Customizable dashboards (cat 5)]
    └──requires──> [Per-route panel-visibility persistence (SQLite)]
    └──conflicts──> [Saved views layout coupling — keep separate namespaces]

[Multi-pane compare 3-way (cat 6)]
    └──requires──> [URL state extension `?a=&b=&c=&anchor=`]
    └──requires──> [Per-pane KPI strip + delta-against-anchor logic]
    └──conflicts──> [Narrow-viewport stacking — 3-way doesn't fit; document explicit unsupported state]

[Global time picker (cat 7)]
    └──requires──> [Top bar shell (cat 1)]
    └──requires──> [URL state for time on every route]
    └──extends────> [Saved views (cat 4) — saved view captures time]
    └──extends────> [Cmd+K (cat 8) — jump-to-time-range actions]

[Panel containment (cat 2)]
    └──pre-requisite──> [Resolves three v1.3 overflow bugs]
    └──independent of every other category — landing this fixes the "feels broken" symptoms even if no other category ships]

[Shell + nav (cat 1)]
    └──hosts──> [Top bar with global time picker]
    └──hosts──> [Sidebar with saved-view favourites]
    └──hosts──> [Cmd+K invoke point]
    └──foundational — every other category renders inside this shell]
```

### Dependency Notes

- **Panel containment is a pre-requisite for everything else.** With overflow bugs unfixed, the rest of the redesign rests on broken foundations. Phase 1 of v1.3 must land containment before density / saved-views / etc. The downstream `/gsd-define-requirements` step should treat containment as P0.
- **Saved views inherit URL-state machinery from v1.2's compare and cost routes.** New work is plumbing the same machinery to `/`, `/activity`, `/skills`, `/skills/$name`, `/alerts`. The pattern is established — copy-and-adapt, not invent.
- **Density toggle's real cost is token migration, not the toggle itself.** ~30 panels × dozens of hard-coded spacing utilities → token-based. Without the migration, the toggle has nothing to act on.
- **Customizable dashboards has the highest cost-to-value ratio for a single-user tool.** Recommended scope (see below) lands the lighter alternatives (show/hide + 1D reorder) before the heavyweight react-grid-layout integration. Defer the heavyweight unless real friction emerges.
- **3-way compare conflicts with narrow viewports** — single-user macOS-only mostly fine, but document explicit unsupported state below 1280px to avoid ambiguity.
- **Cmd+K extensions are nearly free across categories 3, 4, 7.** One palette command per category × ~5 commands total is <100 LOC of palette glue. Leveraging the existing palette is the highest-ROI surface.

---

## v1.3 Definition

### Land in v1.3 (Active Requirements — Table Stakes Across All 8 Categories)

These are non-negotiable. Without them, v1.3 doesn't ship.

- [ ] **Panel containment fixes** (cat 2 table stakes) — fixes 3 named overflow bugs; bounded heights; sticky panel headers; Radix portals correctly used; cell truncation/wrap; pagination/see-all; min-height baseline
- [ ] **Shell + sidebar redesign** (cat 1 table stakes) — persistent sidebar with collapsible icon-only mode; section grouping (Observe / Operate / Configure); active-route indicator; Cmd+K invocation preserved
- [ ] **Top bar shell** (cat 1 differentiator that's table-stakes for cats 4+7) — hosts global time picker, density toggle, save-view button
- [ ] **Density toggle: 3-tier with localStorage persistence + CSS variable tokens** (cat 3 table stakes) — Compact / Comfortable / Cozy; default Comfortable; tokens applied to all ~30 panels
- [ ] **Saved views: per-route, named, URL-shareable, default-view-per-route, SQLite-persisted** (cat 4 table stakes) — extends v1.2 URL machinery to all routes
- [ ] **Global time picker + sync semantics + relative time symbol resolution + auto-refresh interval** (cat 7 table stakes) — uniform time mental model
- [ ] **Cmd+K extensions for v1.3 categories** (cat 8 table stakes + low-cost differentiators) — Open saved view, Set density, Jump-to time range, Recent items

### Differentiators (Scope Individually Via AskUserQuestion in Requirements Step)

Each is a yes/no scoping decision. Bundling them into v1.3 wholesale would inflate the milestone; deferring them all undersells the redesign. The user picks per item.

- [ ] **Sidebar recently-visited section** (cat 1)
- [ ] **Sidebar pinned saved-view favourites** (cat 1; couples to saved-views)
- [ ] **Resizable sidebar** (cat 1)
- [ ] **Panel "Expand to viewport" mode** (cat 2)
- [ ] **Per-component loading skeletons** (cat 2)
- [ ] **Density: per-route default + auto-density by viewport width** (cat 3)
- [ ] **Saved views: edit-vs-fork explicit semantics + unsaved-changes pip** (cat 4)
- [ ] **Saved views: NL load via Haiku fallback** (cat 4)
- [ ] **Saved views: recent ad-hoc states** (cat 4)
- [ ] **Customizable dashboards: panel show/hide** (cat 5)
- [ ] **Customizable dashboards: 1D panel reorder** (cat 5)
- [ ] **Customizable dashboards: full 2D drag-resize grid (react-grid-layout)** (cat 5) — *highest cost; recommend default OUT*
- [ ] **Multi-pane 3-way compare** (cat 6) — *recommend default OUT unless user names a triangulation workflow*
- [ ] **N-way time-series overlay on `/cost` and `/activity` charts** (cat 6 — different feature than 3-way compare)
- [ ] **Time-range copy/paste shortcuts (`t c`, `t v`)** (cat 7)
- [ ] **Compare-to-previous-period overlay** (cat 7; extends DeltaPill)
- [ ] **Per-panel time override** (cat 7)
- [ ] **Brush-zoom on charts** (cat 7)
- [ ] **Cmd+K NL fallback when fuzzy returns 0 hits** (cat 8)
- [ ] **Cmd+K filter-shortcut commands** (cat 8)

### Out Of Scope for v1.3 (Anti-Features for PROJECT.md)

These are documented as explicit non-goals so future scope creep can be checked against them.

- [ ] Top-tabs as primary nav, hamburger nav, three-pane email-style global layout
- [ ] Cross-org/team switcher in sidebar header; notification-bell + user-avatar (single-user)
- [ ] Unbounded panel heights; infinite scroll inside panels; horizontal scroll inside panels; custom portal/overlay primitives
- [ ] Per-panel density toggle (must stay global); five+ density levels; density-changes-data-semantics; density-defaults-densest
- [ ] Saved views that capture user-preference state; cross-route saved views; auto-mutating saved views; server-only persistence
- [ ] Mobile drag-resize support; editable widget content (authoring tool); cloud-sync layer
- [ ] N-way compare with N>4; symmetric pairwise diff matrix; compare without anchor in 3+ way
- [ ] Per-panel time picker by default; auto-refresh defaulting ON at high frequency; time picker as modal; mixing absolute+relative ambiguously
- [ ] Cmd+K as only path to actions (no UI button); multi-step palette parameter prompts; NL-by-default palette; destructive actions in recents

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Notes |
|---------|------------|---------------------|----------|-------|
| Panel containment fixes (3 overflow bugs) | HIGH | LOW | **P1** | Resolves named bugs; foundational |
| Shell + sidebar redesign with collapsible | HIGH | LOW | **P1** | shadcn ships the primitive |
| Top bar with global time picker | HIGH | MEDIUM | **P1** | Shell foundation for cats 4+7 |
| Density toggle (3-tier, persisted) | HIGH | MEDIUM | **P1** | Real cost is token migration |
| Saved views (per-route, URL-shareable, SQLite) | HIGH | MEDIUM | **P1** | Cheapest of 4 new caps; extends v1.2 |
| Global time picker + sync semantics | HIGH | MEDIUM | **P1** | Unifies time mental model |
| Cmd+K extensions (open view / set density / time jump / recents) | HIGH | LOW | **P1** | <100 LOC palette glue |
| Customizable dashboards: show/hide + 1D reorder | MEDIUM | MEDIUM | **P2** | 80% of customisation value |
| Customizable dashboards: full 2D drag-resize | LOW (single-user) | HIGH | **P3** | Cargo-cult risk; defer |
| Multi-pane 3-way compare | LOW (rare workflow) | HIGH | **P3** | No reference product ships this; verify use case before building |
| Compare-to-previous overlay | MEDIUM | MEDIUM | **P2** | Extends DeltaPill (v1.2) cleanly |
| NL Cmd+K fallback | LOW | MEDIUM | **P3** | Latency cost; fuzzy handles 90% |
| Filter-shortcut Cmd+K commands | MEDIUM | MEDIUM | **P2** | Useful but route-specific abstraction is non-trivial |
| Time-range copy/paste | LOW | LOW | **P2** | Power-user only; cheap |
| Brush-zoom on charts | MEDIUM | MEDIUM | **P2** | Good investigation UX |

**Priority key:**
- **P1** = table stakes, must land in v1.3
- **P2** = strong differentiator, should land if scope permits
- **P3** = niche or speculative; defer unless requirements step surfaces real demand

---

## Reference Behaviour Cheatsheet (concrete behaviours, not generalisations)

| Reference | Behaviour | Source |
|-----------|-----------|--------|
| Honeycomb | "Boards or Launchpads?" — explicit philosophy AGAINST building dashboards-as-a-feature; prefers curated launchpads | honeycomb.io/blog/dashboards-or-launchpads |
| Honeycomb | Boards `layout_generation: manual\|auto` — auto-layout for opinionated default | docs.honeycomb.io/observe/boards |
| Honeycomb | Boards have default time range + granularity that all queries inherit | changelog.honeycomb.io/time-range-granularity-defaults-for-boards-325761 |
| Honeycomb | Boards: change time range on all graphs at once | changelog.honeycomb.io/boards-change-the-time-range-on-all-graphs-131602 |
| Datadog | `cmd+K` quick-nav with recents at top | datadoghq.com/blog/datadog-quick-nav-menu/ |
| Datadog | "High density mode" auto-on wide screens; toggle in top-right; 12-col → 2×12 grid | datadoghq.com/blog/datadog-dashboards/ |
| Datadog | Saved views URL: `?saved_view=305130` with override-friendly param structure | docs.datadoghq.com/logs/explorer/saved_views |
| Datadog | Side panels: vertical scroll OK, horizontal NOT OK; important info above the fold | docs.datadoghq.com/real_user_monitoring/explorer/events |
| Datadog | 2024 nav redesign grouped by usage frequency; favourites get more space | datadoghq.com/blog/datadog-navigation-redesign/ |
| PostHog | `cmd+K` palette + `cmd+shift+K` keyboard-first nav; "Jump to timestamp" supported | posthog.com/docs/cmd-k |
| PostHog | Edit-layout mode (`E` to enter); react-grid-layout drag/resize; auto-stack on small viewports | posthog.com/docs/product-analytics/dashboards |
| PostHog | URL filter persistence is a known gap (issue #19069) — counter-example, not pattern to follow | github.com/PostHog/posthog/issues/19069 |
| PostHog | Folders for dashboard organisation (2024 nav) | posthog.com/blog/redesigned-nav-menu |
| Grafana | Two layouts: Custom (manual x/y/w/h) vs Auto Grid (uniform) | grafana.com/whats-new/2026-04-08-dynamic-dashboards-is-now-generally-available/ |
| Grafana | URL variables `var-foo=bar`; `${__all_variables}` for full state in shareable links | grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/create-dashboard-url-variables |
| Grafana | Time-range copy/paste: `t c` / `t v` shortcuts | grafana.com/whats-new/2024-01-28-copy-and-paste-time-range/ |
| Grafana | `g` prefix for global navigation (`g h` home, `g p` profile, `g a` alerts) | defkey.com/grafana-shortcuts |
| Grafana | Panel time override reverts when dashboard time changes to absolute | community.grafana.com/t/how-to-sync-panel-specific-custom-time-ranges-with-global-dashboard-time-picker/159861 |
| Linear | `g` prefix navigation: `g i` inbox, `g m` my issues, `g t` triage, `g a` active, `g b` backlog, `g c` cycles, `g p` projects, `g s` settings | linear.app/docs/inbox + keycombiner.com/collections/linear |
| Linear | UI refresh 2026-03: dimmer sidebar, focus on main content; explicit density commitment | linear.app/changelog/2026-03-12-ui-refresh |
| Linear | Compact tabs at top (rounded corners, smaller icons); preserves info density without overwhelming | linear.app/now/how-we-redesigned-the-linear-ui |
| Vercel | Migrated from horizontal tabs → resizable sidebar in 2026-02 explicitly because tabs don't scale | vercel.com/changelog/dashboard-navigation-redesign-rollout |
| shadcn/ui | Sidebar component ships `collapsible="icon"`, cookie-based state persistence | ui.shadcn.com/docs/components/radix/sidebar |
| MUI X DataGrid | Standard 3-tier density: standard / compact / comfortable | mui.com/x/react-data-grid/accessibility |
| Salesforce Lightning | Cozy = labels-on-top spacious; Compact = labels-left, 30% denser | developer.salesforce.com/blogs/2018/08/new-density-settings-for-the-lightning-experience-ui-in-winter-19 |

---

## Sources

**Primary references (all four named in project context):**
- [Honeycomb Boards documentation](https://docs.honeycomb.io/observe/boards/)
- [Honeycomb: Dashboards or Launchpads? (philosophy)](https://www.honeycomb.io/blog/dashboards-or-launchpads)
- [Datadog dashboards experience blog](https://www.datadoghq.com/blog/datadog-dashboards/)
- [Datadog navigation redesign blog](https://www.datadoghq.com/blog/datadog-navigation-redesign/)
- [Datadog Saved Views (Logs Explorer)](https://docs.datadoghq.com/logs/explorer/saved_views/)
- [Datadog quick-nav menu](https://www.datadoghq.com/blog/datadog-quick-nav-menu/)
- [Datadog effective-dashboards guidelines](https://github.com/DataDog/effective-dashboards/blob/main/guidelines.md)
- [PostHog dashboards](https://posthog.com/docs/product-analytics/dashboards)
- [PostHog command palette](https://posthog.com/docs/cmd-k)
- [PostHog redesigned nav blog](https://posthog.com/blog/redesigned-nav-menu)
- [Grafana dynamic dashboards GA](https://grafana.com/whats-new/2026-04-08-dynamic-dashboards-is-now-generally-available/)
- [Grafana URL variables](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/create-dashboard-url-variables/)
- [Grafana copy/paste time range](https://grafana.com/whats-new/2024-01-28-copy-and-paste-time-range/)
- [Grafana panel/dashboard time sync](https://community.grafana.com/t/how-to-sync-panel-specific-custom-time-ranges-with-global-dashboard-time-picker/159861)

**Adjacent references (cited for primitives or counter-examples):**
- [Linear UI redesign part II](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Linear UI refresh 2026-03](https://linear.app/changelog/2026-03-12-ui-refresh)
- [Linear keyboard shortcuts](https://keycombiner.com/collections/linear/)
- [Vercel dashboard navigation redesign rollout](https://vercel.com/changelog/dashboard-navigation-redesign-rollout)
- [shadcn/ui Sidebar component](https://ui.shadcn.com/docs/components/radix/sidebar)
- [MUI X DataGrid density](https://mui.com/x/react-data-grid/accessibility/)
- [Salesforce Lightning density settings](https://developer.salesforce.com/blogs/2018/08/new-density-settings-for-the-lightning-experience-ui-in-winter-19)
- [react-grid-layout (Grafana fork)](https://github.com/grafana/react-grid-layout)
- [Smashing Magazine: sticky headers + full-height combination](https://www.smashingmagazine.com/2024/09/sticky-headers-full-height-elements-tricky-combination/)
- [NN/G: sticky headers UX](https://www.nngroup.com/articles/sticky-headers/)

**Counter-example (intentional):**
- [PostHog issue #19069 — URL filter state gap](https://github.com/PostHog/posthog/issues/19069) — cited as the WRONG pattern; v1.3 should match Datadog/Grafana, not the PostHog gap.

---

*Feature research for: dashboard-product UX patterns informing v1.3 Surface Redesign of Claude Mission Control*
*Researched: 2026-05-10*
*Confidence: HIGH on reference behaviour (sourced); MEDIUM on single-user-local pattern translation (judgement call where references don't directly apply)*
