# Project Research Summary

**Project:** Claude Mission Control v1.3 — Surface Redesign
**Domain:** Local single-user observability dashboard — full UX rebuild on top of a mature (v1.2) codebase
**Researched:** 2026-05-10
**Confidence:** HIGH overall — all four researchers read the actual source files; every version number verified against npm registry; every CSS/component claim verified against `frontend/src/`

---

## Executive Summary

CMC v1.3 is a surface-only redesign of a mature, green-tested local dashboard. The data layer, backend, URLs, and API contracts are frozen; only the visible UI surface changes. Three categories of overflow bugs are present today — panels exceeding viewport, Sheets/Popovers escaping parent bounds, and data overflowing card edges — and these are **CSS bugs with surgical CSS fixes**, not architectural deficits. All four researchers independently confirmed the same critical stack correction: **the repo does not use Tailwind or shadcn/ui**. It uses hand-rolled CSS variables in `src/styles.css` (1863 LOC) with `cmc-*` BEM classes and raw Radix primitives (`Dialog`, `Tooltip`, `Collapsible`, `AlertDialog` — no `Popover`, no `DropdownMenu`). Every recommendation from the research depends on extending this existing system, not replacing it.

The recommended approach is: fix the overflow primitives and shell foundation first (Phase 24), then add the backend for saved views (Phase 25), then propagate the new primitives through routes in two passes (Phases 26–27), and gate customizable layouts as a conditional Phase 28 only if requirements explicitly scope them in. New capabilities are deliberately scoped: density toggle and saved views are table stakes (cheap, extend existing patterns); customizable layouts are a differentiator with a strong "lightweight first" constraint (show/hide + 1D reorder; defer 2D drag-resize); multi-pane compare beyond 2-up is an anti-feature per reference product research and should default out. Stack additions are minimal: 3 baseline runtime deps (`@radix-ui/react-popover@1.1.15`, `@radix-ui/react-dropdown-menu@2.1.16`, `react-resizable-panels@4.11.0`) plus a conditional Alembic migration and backend route file if server-persisted saved views are confirmed.

The dominant risk is **re-introducing the three overflow bugs mid-rebuild**. Every phase that touches a shared primitive (PanelCard, DataTable, Sheet) must carry forward the `min-height: 0` ladder, portal discipline, and `min-width: 0` containment established in Phase 24. Secondary risks are URL preservation traps (any TanStack Router file rename changes the URL), density CSS variable scope traps (variables must be on `:root`, not a subtree, to cascade into Radix portals), and affordance loss during shell rework (15 keyboard/interaction affordances must be inventoried and checked at every phase close).

---

## Key Findings

### Recommended Stack

The actual installed stack is React 19.2.5 + Vite 8.0.10 + TypeScript ~6.0.0 + TanStack Router 1.168.24 + TanStack Query 5.100.5 + Recharts 3.8.1 + framer-motion 12.38.0 + cmdk 1.1.1 + lucide-react 1.11.0 + hand-rolled CSS variables. There is no Tailwind, no shadcn, no Popover primitive, no DropdownMenu primitive, no drag/resize/grid library. v1.3 is surface-only: the Python backend, FastAPI, SQLAlchemy 2.0, SQLModel, Alembic, aiosqlite, and the full observability ingest pipeline do not change.

**Net new runtime deps for v1.3 baseline (3):**
- `@radix-ui/react-popover@1.1.15` — anchored popover with portal + collision detection; fixes Sheet/Popover containment bug; consistent with existing Radix family already in repo
- `@radix-ui/react-dropdown-menu@2.1.16` — keyboard-navigable portal-rendered menu; needed for density picker, row-level action menus, header overflow menus
- `react-resizable-panels@4.11.0` — resizable split-pane primitive; covers multi-pane compare AND customizable layouts with one dep; React 19 peerDep confirmed; ~12 kB gzip; maintained by React DevTools author

**Conditional additions (require explicit requirements decision):**
- `@radix-ui/react-toggle-group@1.1.11` — optional; density toggle segmented control (hand-rolled alternative is acceptable)
- Alembic migration `0004_saved_views.py` + `backend/cmc/api/routes/views.py` — only if server-persisted named views are confirmed; no new Python deps
- `react-grid-layout` — blocked; GitHub Issue #2045 confirms unfixed React 19.2 key-prop warnings; defer until issue resolves

**Anti-deps (do not add):**
- `tailwindcss` — multi-week migration, conflicts with `cmc-*` system
- `@shadcn/ui` — not in repo; requires Tailwind; use raw `@radix-ui/*` directly
- `react-grid-layout` — React 19 compat broken (Issue #2045 open)
- `dnd-kit` — stale (last published 2024-12-05)
- Any competing styling system (MUI, Mantine, Chakra) — conflicts with `cmc-*`

### Expected Features

**Must have — table stakes:**
- Overflow fixes (3 named bugs) — foundational pre-requisite for everything else
- Persistent collapsible sidebar with section grouping (Observe / Operate / Configure) and active-route indicator
- Top bar shell hosting global time picker, density toggle, save-view button
- Three-tier density toggle (Compact / Comfortable / Cozy) with CSS-variable token migration and localStorage persistence
- Saved views per-route, named, URL-shareable, default-view affordance, SQLite persistence — cheapest of the four new capabilities
- Global time picker with relative time symbol resolution, all-panels sync, auto-refresh interval
- Cmd+K extensions (open saved view, set density, jump to time range, recent items)

**Should have — differentiators (scope individually in requirements step):**
- Sidebar recently-visited section and pinned saved-view favourites
- Panel show/hide toggle and 1D panel reorder (covers 80% of customization intent)
- Saved views: edit-vs-fork explicit semantics, unsaved-changes pip, recent ad-hoc states
- Time-range copy/paste shortcuts, compare-to-previous-period overlay, brush-zoom on charts
- Per-route density default

**Defer to v2+ — anti-features:**
- Multi-pane compare beyond 2-up: no reference product ships 3-way; value-per-pane drops sharply; default OUT
- Full 2D drag-resize grid: single-user ROI questionable; defer unless show/hide + 1D reorder proves insufficient
- Top-tabs as primary nav, hamburger-only nav, three-pane global layout, cross-org switcher, notification-bell + avatar

### Architecture Approach

v1.3 extends the existing React tree at `routes/__root.tsx` without introducing new layout files. New providers (`DensityProvider`, `SavedViewsProvider`) mount above `AppShell`. The `NavBar` refactors into `AppShellHeader` for v1.3 chrome. `CommandPalette` stays mounted once at shell level with additive `Command.Group` blocks. Density is CSS-only: `lib/density.ts` (mirrors `lib/theme.ts`) sets `[data-density]` on `<html>` pre-mount; panels are density-unaware and read CSS variables. Saved views use a hybrid URL + server model.

**Major new/changed components:**
1. `lib/density.ts` + `DensityProvider` — mirrors `lib/theme.ts`; sets `[data-density]` on `<html>`; no Context-driven CSS
2. `AppShellHeader` — extracted from `NavBar`; hosts `SavedViewMenu`, `DensityToggle`, Cmd+K trigger, `ThemeToggle`
3. `BoundedPanelCard` / `bounded` prop on `PanelCard` + `.cmc-page--bounded` modifier — opt-in; backward-compatible
4. `SavedViewsProvider` + `useSavedViews(route)` hook — reads from server via TanStack Query
5. `backend/cmc/api/routes/views.py` — 5 CRUD endpoints; mirrors `tasks.py` shape; single Alembic migration
6. `CommandPalette` extensions — additive `Command.Group` blocks; no new context

**Three overflow bugs — root causes and one-line diagnosis:**
- Mode (a) panels exceed viewport: `.cmc-card__content { flex: 1 }` lacks `min-height: 0` AND page has no viewport height constraint
- Mode (b) Sheets/Popovers escape: likely `transform` on recharts `ResponsiveContainer` wrappers triggering CSS containing-block escape for `position: fixed` descendants — Phase 24 audit deliverable
- Mode (c) data overflows card edges: missing `min-width: 0` on `.cmc-card` (CSS Grid implicit min-content rule) — ONE one-line fix benefits every route

### Critical Pitfalls

1. **Re-introducing the three overflow bugs mid-rebuild** — Drop `min-height: 0` from any flex rung, mount a Sheet without `*.Portal`, or use blanket `overflow-visible` and bugs return. Prevention: `BoundedPanelCard` primitive encodes the ladder; ESLint `no-bare-radix-content` rule; Playwright containment spec covering all three modes at every phase close.

2. **URL preservation traps** — TanStack Router file renames silently change URLs; non-additive `validateSearch` schema changes break Telegram deep-links. Prevention: `docs/url-contract.md` + CI test; ban route file renames; `validateSearch` schemas are append-only.

3. **Density CSS variable scope traps** — Variables scoped to a subtree instead of `:root` do not cascade into Radix portal content (Sheets, Popovers, Cmd+K). Prevention: density tokens exclusively on `:root`; Playwright tests in both density modes including portaled UI.

4. **Saved-views default semantics and schema versioning** — Ambiguous cold-load vs always auto-apply breaks share-link semantics; unversioned schemas break silently on field rename. Prevention: two-tier semantics documented (cold-load only; querystring wins); `schemaVersion` field required; 50-view cap with UI warning.

5. **Affordance loss during shell rework** — 15 accumulated keyboard/interaction affordances (Esc-to-close, focus-return, Tab-cycle inside Sheet, theme toggle, Cmd+K context commands, etc.) can silently drop in a shell rewrite. Prevention: `docs/affordance-checklist.md` checked at every phase close; `tests/e2e/v13-affordances.spec.ts` covering all 15.

---

## Implications for Roadmap

### Phase 24: Shell + Density + Containment Primitives

**Rationale:** Overflow bugs are pre-existing and must be fixed before any route adoption. Shell primitives are dependencies for every later phase. No per-route work in this phase — only primitive and infrastructure establishment. All existing tests stay green (changes are additive).

**Delivers:** `lib/density.ts` + `DensityProvider` + `[data-density]` CSS variable branch; `AppShellHeader` extraction; Mode (c) global fix (`min-width: 0` on `.cmc-card`); `BoundedPanelCard` + `.cmc-page--bounded` infrastructure (mode a); recharts `ResponsiveContainer` transform audit (mode b); z-index ladder documentation; Playwright containment spec; affordance inventory (`docs/affordance-checklist.md`); URL contract files (`docs/url-contract.md`); `data-testid` registry + Playwright selector hardening; Radix Popover + DropdownMenu installed as baseline dep add.

**Addresses:** Panel containment table stakes; shell + nav table stakes (sidebar structure, active indicator); density toggle infrastructure.

**Avoids:** Pitfall 1 (overflow trio); Pitfall 2 (installs visual regression infra); Pitfall 5 (test hardening day 1); Pitfall 6 (URL contract files); Pitfall 10 (affordance inventory).

---

### Phase 25: Saved Views (Backend + Shell Integration)

**Rationale:** Server-side (table + 5 endpoints) lands first and is independently testable. Per-route `validateSearch` adoption is uniform — mirrors `sessions_.compare.tsx` pattern. `SavedViewsProvider` and `SavedViewMenu` mount into `AppShellHeader` from Phase 24. Cmd+K Saved Views group is additive.

**Delivers:** `saved_views` Alembic migration `0004_saved_views`; `backend/cmc/api/routes/views.py` (5 endpoints); `useSavedViews(route)` hook; `validateSearch` adoption on `/activity`, `/skills`, `/cost`, `/alerts`; `SavedViewsProvider`; `SavedViewMenu` chrome; "Set as default" via `localStorage` pointer; Cmd+K Saved Views group.

**Addresses:** Saved views table stakes; URL state extension to all routes (pre-requisite for global time picker); Cmd+K open-saved-view action.

**Avoids:** Pitfall 6 (validateSearch append-only); Pitfall 7 (density vars on `:root`); Pitfall 8 (two-tier state, schema versioning, default semantics).

**Stack additions:** Alembic migration + backend route file (no new Python deps); frontend hooks (no new deps).

---

### Phase 26: Per-Route Adoption I — Command / Activity / Sessions

**Rationale:** Highest-traffic routes validated first. `/` and `/activity` share panels. `/sessions/compare` is already the `validateSearch` reference. One panel sweep, two+ page rollout. URLs unchanged.

**Delivers:** `BoundedPanelCard bounded` and `.cmc-page--bounded` on `/`, `/activity`, `/sessions/compare`; `cmc-table-wrap` applied inside `DataTable` primitive; `cmc-cell--truncate` on `SessionsTable` + `LiveSessionsCard`; density token consumption propagated; Cmd+K Time-Range group (depends on Phase 25 `validateSearch`).

**Addresses:** Panel containment differentiators; density toggle adopted on first routes; UX rebuild begins for Command + Activity surfaces.

**Avoids:** Pitfall 1 (BoundedPanelCard enforces min-height ladder); Pitfall 4 (CSS-only density, no chart re-mounts); Pitfall 7 (density audit checklist per phase).

---

### Phase 27: Per-Route Adoption II — Skills / Cost / Alerts

**Rationale:** Tail-end routes pick up the same primitives. Also addresses v1.2 tech debt: wire APIs expose `project_key`; `AlertRuleForm` redesign removes `KNOWN_METRICS` fallback; 503 NL composer collapse gets retry/queue UX.

**Delivers:** `/skills`, `/skills/$name`, `/cost`, `/alerts` adopt `BoundedPanelCard` + density + truncate; Cmd+K Time-Range group activates; `SessionListItemFull`/`SessionCompareSide` extended to include `project_key` (additive); `KNOWN_METRICS` frontend fallback removed; `POST /api/alerts/parse-nl` retry/queue UX.

**Addresses:** Full UX rebuild complete for all 7 routes; global time picker operational everywhere.

**Avoids:** Pitfall 1 (containment propagated to remaining routes); Pitfall 3 (axe-core per route at close); Pitfall 10 (affordance checklist per route).

---

### Phase 28: Optional Customizable Layouts (Conditional on Requirements)

**Rationale:** Gated on requirements scoping. Even if scoped, defer 2D drag-resize — ship show/hide + 1D reorder + constrained resize only. `react-resizable-panels` covers both multi-pane compare and panel resize with one dep. No `react-grid-layout` (Issue #2045 open).

**Delivers (if scoped):** `react-resizable-panels` installed; per-route `validateSearch` extended with optional `split`/`orientation`; split state in `SavedView.state_json` (no new DB table); panel show/hide + 1D reorder; conditional 3-way compare URL extension.

**Addresses:** Customizable dashboards differentiators; multi-pane compare differentiator (if scoped).

**Avoids:** Pitfall 9 (layout validation on read, reset-to-default affordance, per-page-per-density storage, drag persistence throttled).

---

### Phase Ordering Rationale

- Shell first, per-route second: Phase 24 establishes primitives every later phase adopts; running per-route adoption without BoundedPanelCard means touching every route twice.
- Backend before frontend for saved views: Phase 25 backend is independently testable; frontend wiring is blocked on having endpoints.
- Command/Activity/Sessions before Skills/Cost/Alerts: highest-traffic routes validate the pattern on shared panels; second pass is a faster repeat.
- Customizable layouts last: depends on stable `validateSearch` shapes (Phase 25) and layout state fitting in `state_json`. Introduces the only new runtime dep with a real scope-decision gate.
- Multi-pane compare beyond 2-up defaults out: no reference product ships 3-way; value-per-pane drops sharply past 2.

### Research Flags

**Phases likely needing `/gsd-research-phase` during planning:**
- **Phase 28 (if 2D drag-resize scoped):** `react-resizable-panels` + `validateSearch` + `state_json` interaction not prototyped; React 19 / RGL Issue #2045 status should be re-checked at planning time.
- **Phase 28 (if 3-way compare scoped):** KPI strip with anchor-column delta logic for 3 panes; URL shape `?a=&b=&c=&anchor=`; viewport minimum documentation.

**Phases with standard patterns (skip research):**
- **Phase 24:** CSS-variable density mirrors `lib/theme.ts` exactly; overflow fixes are verified root-cause CSS changes.
- **Phase 25:** Saved views backend mirrors `tasks.py` CRUD; `validateSearch` mirrors `sessions_.compare.tsx`; both established patterns.
- **Phase 26 / Phase 27:** Pure adoption of Phase 24 primitives; pattern is uniform across routes.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via `npm view` on 2026-05-10; `package.json` read directly; React 19 peerDeps individually confirmed; anti-dep reasoning grounded in open GitHub issues |
| Features | HIGH on reference behaviour; MEDIUM on single-user translation | All four reference products' documented behaviours sourced from official docs/changelogs; single-user pattern translation is judgement call |
| Architecture | HIGH | All components read directly from source; root causes of overflow bugs grounded in actual CSS rules and component code |
| Pitfalls | HIGH for codebase-anchored; MEDIUM for industry parallels | Every fingerprint cites real file/component or v1.2 invariant; industry redesign regression references are illustrative |

**Overall confidence:** HIGH

### Gaps to Address

- **Density two-tier vs three-tier:** Architecture researcher proposes `comfortable | compact` (2-tier); Stack and Features researchers align on `compact / comfortable / cozy` (3-tier per MUI X / Salesforce Lightning). Requirements step should confirm; CSS implementation cost is the same either way.
- **Saved views: server-persisted vs localStorage-only:** Stack researcher leans URL + localStorage (no server); Architecture researcher recommends URL + server (SQLite is local, more durable than localStorage). Requirements decision. Both implementation paths fully sketched in research.
- **3-way compare scoping:** Research consensus is default-out. Requirements step should ask for a concrete triangulation workflow before scoping in. If in, Phase 28 needs a research pass.
- **Phase 28 scope granularity:** Three distinct levels of customizable layouts (show/hide + 1D reorder only / constrained resize / full 2D drag-resize) should each be a separate binary in/out decision in requirements.
- **Visual quality bar checkpoint cadence:** v1.3 is the largest milestone yet. Phase 24 should establish an explicit visual checkpoint checklist matching the v1.0 Phases 5/6/7 pattern; subsequent phases reuse it.

---

## Sources

### Primary (HIGH confidence — read directly from repo or npm registry on 2026-05-10)
- `frontend/package.json` — actual installed deps (React 19.2.5, no Tailwind, no shadcn)
- `frontend/src/styles.css` — CSS-variable token system (1863 LOC)
- `frontend/src/routes/__root.tsx` — root provider stack
- `frontend/src/components/ui/Sheet.tsx`, `AlertDialog.tsx`, `Tooltip.tsx`, `CommandPalette.tsx`, `PanelCard.tsx`, `DataTable.tsx`, `Card.tsx` — existing Radix primitive wrappers
- `frontend/src/routes/sessions_.compare.tsx` — `validateSearch` reference implementation
- `frontend/src/lib/theme.ts`, `lib/storage.ts`, `lib/queries.ts` — density/theme/query pattern models
- `backend/cmc/api/routes/tasks.py`, `cmc/db/models/sessions.py`, `cmc/app/lifespan.py` — backend CRUD + migration patterns
- `npm view <pkg> version peerDependencies` — all version and peerDep claims verified

### Secondary (HIGH confidence — official documentation)
- Honeycomb Boards docs + changelog — `docs.honeycomb.io/observe/boards`
- Datadog dashboards, saved views, navigation redesign — `datadoghq.com/blog`, `docs.datadoghq.com`
- PostHog dashboards, command palette, nav redesign — `posthog.com/docs`, `posthog.com/blog`
- Grafana dynamic dashboards GA, URL variables, time-range copy/paste — `grafana.com/whats-new`, `grafana.com/docs`
- Linear UI refresh 2026-03, keyboard shortcuts — `linear.app/changelog`
- Vercel dashboard navigation redesign rollout 2026-02 — `vercel.com/changelog`
- MUI X DataGrid density, Salesforce Lightning density — `mui.com/x`, `developer.salesforce.com/blogs`
- react-resizable-panels docs (Context7 `/bvaughn/react-resizable-panels`)

### Known issues referenced (HIGH confidence — GitHub issue tracker)
- `react-grid-layout` Issue #2045 — React 19 key-prop warnings (open as of 2026-05-10)
- TanStack Router Issues #3120, #2878, #3282 — validateSearch / file-based routing edge cases
- Radix Primitives Issues #1317, #1253 — z-index conflicts, non-portalled positioning
- Recharts Issues #281, #1624 — deep-compare re-renders, animation on poll tick
- react-grid-layout Issues #2066, #83 — drag performance
- TanStack Router Issue #4973 + Discussion #1207 — URL↔localStorage sync feature gap
- PostHog Issue #19069 — URL filter state gap (counter-example)

---
*Research completed: 2026-05-10*
*Ready for roadmap: yes*
