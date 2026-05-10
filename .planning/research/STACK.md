# Stack Research — v1.3 Surface Redesign

**Domain:** Local-only single-user observability dashboard — Surface Redesign (UX rebuild, density toggle, saved views, customizable layouts, Sheet/Popover containment).
**Researched:** 2026-05-10
**Confidence:** HIGH for additions (every version verified via `npm view` against current registry on 2026-05-10; React 19 peerDeps individually confirmed). MEDIUM for the "stay" recommendations on charts and layouts (call-out notes flag the conditions that would flip them).

## TL;DR (for the roadmapper)

| Concern | Recommendation | Net new deps |
|---|---|---|
| 1. Bounded panel heights / overflow containment | **No new dep** — CSS Grid + `min-height: 0` + `overflow:auto` on PanelCard body. Codify in styles.css + a `<PanelCard scrollable>` prop. | 0 |
| 2. Sheet/Popover/Menu containment | **Add `@radix-ui/react-popover` + `@radix-ui/react-dropdown-menu`.** Existing Dialog/AlertDialog/Tooltip are already Radix; this fills the gaps. Portal-based, z-index already coordinated for current Radix primitives. | 2 |
| 3. Density toggle (compact / comfortable / cozy) | **No new dep** — extend the CSS-variable system already in `src/styles.css` (`:root` + `[data-theme="light"]`). Add `[data-density="compact|comfortable|cozy"]` on `<html>` and remap the existing `--space-*`, `--size-*`, row-height, and `--radius-*` tokens. Persist via `localStorage` mirrored into a TanStack Router root-route search param. | 0 |
| 4. Saved views persistence | **URL-first via TanStack `validateSearch` + new `useDebouncedSearchSync` hook for write-back.** Server-persisted "named views" come **only** if a phase plan elevates cross-session naming/sharing. Default: URL-state for ephemeral filters; `localStorage` for "last view I had open"; **defer** server-persisted named views until a phase explicitly needs them — that phase adds `saved_views` table + `/v1/saved-views` route. | 0 in URL-only mode; +1 Alembic migration + 1 route file if/when server-persisted lane lands |
| 5. Customizable dashboards (drag-resize panels) | **Hybrid: ship `react-resizable-panels@4.11.0` for split-pane / multi-pane compare layouts FIRST. Defer `react-grid-layout` until requirements lock that we actually need free-form Grafana-style grid rearrange.** Reasoning under §"Customizable Layouts". | +1 (immediate) / +2 (only if grid is locked) |
| 6. Chart library scaling | **Stay on `recharts@3.8.1`. DO NOT switch to visx unless a specific dense panel hits a measurable perf wall (>1k SVG nodes / >16ms paint in Chrome perf tab on 2-week sliding-window panels).** If any single panel needs that level, add `visx` *only for that panel* — don't bulk-replace. | 0 (or scoped +1 only if a specific panel needs it) |
| 7. Multi-pane compare beyond 2-up | **`react-resizable-panels` (same dep as #5) gives N-up split-pane for free** — `<PanelGroup direction="horizontal">` with N `<Panel>`s and `<PanelResizeHandle>`. No separate primitive needed. | 0 (covered by #5) |

**Total net new runtime deps for v1.3:** **3 in the baseline plan** (`@radix-ui/react-popover`, `@radix-ui/react-dropdown-menu`, `react-resizable-panels`). +0–2 conditional (server saved-views Alembic migration; `react-grid-layout` only if free-form grid rearrange is locked).

---

## Existing stack — what's actually in package.json (verified 2026-05-10)

`/Users/patrykattc/work/git/claude-mission-control/frontend/package.json` (verified by reading the file directly, not relying on the prompt):

- **React 19.2.5** (NOT React 18 as the prompt's `<milestone_context>` claims — this is critical because it eliminates `react-grid-layout` from the comfortable-default zone — see §Customizable Layouts).
- **Vite 8.0.10** + **TypeScript ~6.0.0**.
- **TanStack Router 1.168.24**, TanStack React Query 5.100.5.
- **Radix primitives present:** `@radix-ui/react-alert-dialog@^1.1.15`, `@radix-ui/react-collapsible@^1.1.12`, `@radix-ui/react-dialog@^1.1.15`, `@radix-ui/react-tooltip@^1.2.8`. **No Popover, no DropdownMenu, no Select, no ToggleGroup, no Menubar.**
- **Recharts 3.8.1**, **framer-motion 12.38.0**, **cmdk 1.1.1**, **lucide-react 1.11.0**.
- **NO Tailwind CSS, NO shadcn/ui library installed.** The prompt's `<milestone_context>` is wrong about this. The repo uses **hand-rolled CSS variables in `src/styles.css` (1863 LOC)** with custom primitives in `src/components/ui/*.tsx` (PanelCard, Sheet, AlertDialog, Tooltip, CollapsibleSection, DataTable, etc.). Every primitive that *looks* shadcn-shaped is a local file styled via `cmc-*` classes against CSS variables. This shapes every recommendation below.
- **No drag/resize/grid library installed** (verified by grep).
- **`validateSearch` is used in exactly one place:** `routes/sessions_.compare.tsx`. Hand-written validator, no zod/valibot — there's a deliberate in-code comment explaining why no schema lib was added.

**Implication for the roadmap:** Density tokens, saved views, and overflow fixes all extend the **existing CSS-variable + custom-primitive system**, not Tailwind utility classes. Every "use Tailwind" recommendation you see in generic dashboard tutorials is wrong for this repo.

---

## Recommended stack additions

### Layout primitives — for customizable layouts AND multi-pane compare

| Library | Version | Purpose | Why for v1.3 specifically |
|---|---|---|---|
| **react-resizable-panels** | **4.11.0** (latest 2026-05-02; peerDeps `react: ^18 \|\| ^19`) | Resizable split panes — horizontal, vertical, nested; keyboard + touch + mouse; PanelGroup state can be persisted via `autoSaveId` (localStorage) or controlled via `onLayout`. | (1) v1.3 explicitly wants multi-pane compare beyond 2-up — this gives N-up via `<PanelGroup direction="horizontal">` with no separate primitive. (2) The Sheet/firehose/sessions surfaces benefit from drag-to-resize without committing to a full grid system. (3) Peerdeps are React 18 OR 19 — confirmed compatible with the repo's React 19.2. (4) Maintained by Brian Vaughn (React DevTools author) — high-quality TS types ship in the package. (5) Bundle ~12 kB gzip, no runtime deps beyond React. |
| **CSS Grid + `min-height: 0` + scroll containment** | n/a (built-in) | Bounded panel heights with internal scroll. | Three concrete v1.3 overflow bugs (panels exceed viewport, data overflows card edges, tables/charts overflow) are **CSS bugs, not library bugs**. The fix is: add `min-height: 0` to grid children that need to shrink (the canonical flexbox/grid scroll-containment fix), give PanelCard a new `scrollable` prop that wraps `<CardContent>` in `overflow:auto`, and standardise this in styles.css. **Adding a layout library to fix a CSS bug is the wrong shape.** |

#### Anti-deps for layout (DO NOT add)

| Avoid | Why for v1.3 specifically |
|---|---|
| **react-grid-layout** | Latest is 2.2.3 (2026-03-24). React 19 has known unfixed issues — GitHub #2045 reports persistent `Each child in a list should have a unique "key" prop` warnings under React 19, and the maintained community fork `react-grid-layout-19` exists precisely because the upstream hasn't shipped a clean React 19 release. The repo is on **React 19.2.5**. Adopting RGL means either (a) eating console-noise warnings on every drag, (b) forking, or (c) downgrading React — all three are unacceptable for a "polish & redesign" milestone. **Defer until requirements explicitly lock free-form grid rearrange (Grafana-style)** — and at that point, re-evaluate against the React 19 issue tracker. For "drag-resize a couple of panels" use cases, react-resizable-panels covers the need without the React 19 risk. |
| **dnd-kit** | Latest `@dnd-kit/core@6.3.1` was last published 2024-12-05 (>17 months ago). Stale relative to React 19's release cycle. v1.3 needs **resize**, not arbitrary drag-and-drop reorder of arbitrary elements; if a phase later wants reorderable cards inside a column, re-evaluate then. |
| **react-split-pane** | Unmaintained (last release 2020). React 19 incompatible. |
| **MUI Grid / Mantine Grid / Chakra Grid** | Brings a competing styling system that conflicts with the existing CSS-variable + `cmc-*` class system. Replacing the design system is out of v1.3 scope. |
| **flexlayout-react** | Heavyweight tab-dock semantics (closer to VS Code's editor area). v1.3 is a **dashboard surface**, not a docked-tabbed editor. Mismatch of metaphor. |

---

### Sheet / Popover / Menu containment — Radix primitive coverage

| Library | Version | Purpose | Why for v1.3 specifically |
|---|---|---|---|
| **@radix-ui/react-popover** | **1.1.15** (peerDeps `react: ^16.8 \|\| ^17 \|\| ^18 \|\| ^19`) | Anchored, portal-rendered popover with collision detection, focus trap, dismissable, controlled/uncontrolled. | The "Popover escapes parent bounds" bug in v1.3 happens because today **there is no Popover primitive in the codebase** — anchored UI is being faked with absolutely-positioned divs that inherit the parent's `overflow:hidden`. Radix Popover renders into a portal (escaping the overflow trap) AND provides collision detection (so it doesn't escape the *viewport* either). This is the canonical fix. The other Radix primitives the repo already uses (Dialog/AlertDialog/Tooltip) all share the same Portal infrastructure — adding Popover is consistent with the existing pattern, not a new architectural commitment. |
| **@radix-ui/react-dropdown-menu** | **2.1.16** (peerDeps `react: ^16.8 \|\| ^17 \|\| ^18 \|\| ^19`) | Keyboard-navigable menu (arrow keys, type-ahead, sub-menus), portal-rendered. | v1.3 surface redesign needs row-level "more actions" menus (e.g., per-skill, per-session, per-alert dropdowns), header overflow menus, and density picker. Building these on top of `<button>` + custom outside-click would re-create the same overflow/portal issues. DropdownMenu uses the same Portal + collision pattern as Popover — adding both together (single phase) costs one PR's worth of style work in `styles.css`. |
| **@radix-ui/react-toggle-group** | **1.1.11** | Segmented control (mutually exclusive selection). | The density toggle (compact / comfortable / cozy) is a 3-way segmented control. Building it on `<button>` + manual aria is fine but `ToggleGroup` is ~1 kB gzip and gets keyboard arrow-key navigation + aria-pressed for free. **Optional** — a hand-rolled segmented control is acceptable if the team wants to avoid a third Radix add. Listed here so the roadmapper can choose. |

#### Anti-deps for menus/popovers (DO NOT add)

| Avoid | Why for v1.3 specifically |
|---|---|
| **shadcn/ui (`npx shadcn add popover` etc.)** | shadcn/ui is a code-generator over Tailwind. **The repo has no Tailwind.** Pulling in shadcn-generated components would either (a) require adding Tailwind (out of scope, breaks every existing `cmc-*` class), or (b) require rewriting the generated files to use CSS variables — at which point you've just done what you'd do anyway with raw `@radix-ui/*`. Skip the middleman; install `@radix-ui/*` directly and style with the existing `cmc-*` system. The prompt's `<milestone_context>` mentions shadcn primitives — **these are not actually present in the repo**, and adding them would force a Tailwind migration. |
| **Headless UI** | Different a11y semantics than Radix; mixing two headless systems doubles the surface area for the design system to keep aligned. The repo already uses `@radix-ui/react-dialog` etc. Stay in one family. |
| **Floating UI directly** | Radix Popover/Dropdown internally use Floating UI. Using Floating UI directly means re-implementing focus management, aria, Portal, and dismissable from scratch — strictly more work for the same dependency. |

---

### Density toggle — CSS variables, no library

| Approach | Why for v1.3 specifically |
|---|---|
| **Extend the existing `:root` CSS-variable system in `src/styles.css`.** Add `[data-density="compact"]`, `[data-density="cozy"]` selectors on `<html>` (mirrors the existing `[data-theme="light"]` pattern). Density-sensitive tokens to remap: `--space-2xs`/`--space-xs`/`--space-sm`/`--space-md`, `--size-label`/`--size-body`/`--size-heading`, plus new tokens `--row-height-table`, `--row-height-list`, `--padding-card`, `--padding-cell`. Components consume these tokens — they don't read `data-density` directly. | (1) Repo already has the `:root` + `[data-theme="light"]` pattern (`src/styles.css` lines 1-72). Adding `[data-density]` is the same pattern, zero novelty. (2) **No library does this better than CSS custom properties.** Tailwind's preset/theme extension would require adding Tailwind itself. CSS-in-JS (styled-components, vanilla-extract) requires runtime overhead per component. Native CSS variables are 0-runtime, 0-bundle, server-irrelevant (this is local-only anyway). (3) The token list above is small enough that the change set is tractable per-phase: density-mode phase touches `styles.css` + adds the picker UI; subsequent surface-rebuild phases convert hard-coded `padding: 12px` to `padding: var(--padding-card)` as they touch each panel. |

#### Anti-deps for density (DO NOT add)

| Avoid | Why |
|---|---|
| **Tailwind CSS + `@apply` density variants** | Adding Tailwind to retrofit one feature is a multi-thousand-line migration. Out of scope. |
| **CSS-in-JS (styled-components, emotion)** | Runtime cost on every render in a dashboard that polls every 5/10/30s. CSS variables have zero runtime cost — every styling decision is a CSS recalc, not a JS call. |
| **Theme provider libraries (next-themes, theme-ui)** | The repo already has a working `data-theme` toggle in `ThemeToggle.tsx`. Same pattern handles `data-density`. No abstraction needed for two attributes. |

---

### Saved views — URL-first, `localStorage`-mirrored, server-persisted only on demand

| Approach | Why for v1.3 specifically |
|---|---|
| **Tier 1 (default): TanStack Router `validateSearch` per route.** Each surface (`/activity`, `/skills`, `/cost`, `/alerts`) gets its own search-param schema validated by a hand-written validator (matching the existing `sessions_.compare.tsx` pattern). Filters, density, time-range, panel-layout-id all live in the URL. Deep links work; back/forward works; sharing works (within local-only context, "share" = "I copy-pasted the URL into a note"). | Already the established pattern — `routes/sessions_.compare.tsx` includes a comment-block explaining why no schema library was added. Repeat the pattern for the other routes. **No new dep.** |
| **Tier 2 (mirror): `localStorage` for "last view I had open per route".** A small `useDebouncedSearchSync(routeId)` hook reads URL on mount and writes URL → localStorage on change (debounced ~250ms). On next visit to the route, if the URL has no params, hydrate from localStorage; if URL has params, URL wins. | TanStack Router does NOT yet have built-in URL↔localStorage sync (verified — confirmed feature-gap in TanStack Router GitHub Issue #4973 and Discussion #1207). Hand-rolling this hook is ~30 LOC and avoids pulling in a state library. **No new dep.** |
| **Tier 3 (named, server-persisted): defer until requirements lock it.** When a phase explicitly says "users name a view and pick from a list" (vs "users bookmark URLs"), introduce: a new Alembic migration `0004_saved_views.py` (table: `id, route_key, name, search_params JSON, created_at, updated_at`), a new route file `backend/cmc/api/routes/saved_views.py` (CRUD: `GET /v1/saved-views?route_key=...`, `POST /v1/saved-views`, `DELETE /v1/saved-views/{id}`), and a frontend `useSavedViews(routeKey)` hook on top of TanStack Query. | The roadmapper should treat Tier 3 as a **conditional addition** — surface it in `FEATURES.md` so the requirements decision phase decides. The cost is small (~1 migration + 1 route + ~150 LOC frontend) but only worth paying if naming + sharing are actually needed. For a single-user local-only dashboard, "I bookmark the URL" is often enough. |

#### Anti-deps for saved views (DO NOT add)

| Avoid | Why |
|---|---|
| **Zustand** | The repo's state is already split between TanStack Query (server state) and TanStack Router search params (URL state). Adding Zustand for saved views creates a third state lane; the URL is sufficient. |
| **Redux / Redux Toolkit** | Same reason; an order of magnitude more code than needed. |
| **Recoil / Jotai** | Atomic state libraries are useful for cross-component derived state. Saved views are flat (filters object), URL-shaped, debounced — overkill. |
| **Zod / Valibot for `validateSearch`** | The repo deliberately rejected this in `sessions_.compare.tsx`. Hand-written validators with TypeScript types stay simple, zero-bundle, easy to read. **Only revisit if the validator count exceeds ~5–6 routes** AND the validators repeat enough patterns to warrant abstraction. |
| **A "saved views" SaaS / cloud sync** | Out of scope — dashboard is single-user local-only by hard constraint. |

---

### Charts — stay on Recharts, scope-add visx only on demonstrated need

| Approach | Why for v1.3 specifically |
|---|---|
| **Keep recharts@3.8.1 as the default chart library.** Currently used in `ChartsStrip.tsx`, `CacheEfficiencyCard.tsx`, `EditAcceptanceCard.tsx`, `CostForecastCard.tsx`, etc. Recharts 3.8.1 supports React 19. | Switching everything to visx is a multi-week refactor of every chart in the repo for hypothetical perf gains. The actual v1.3 problems are **layout/overflow bugs** (charts overflowing card edges) — those are fixed by responsive containers and `overflow:hidden` on chart parents, not by switching chart engines. |
| **Only add visx if a specific panel hits a measurable perf wall.** The bar to add visx for a single panel: open Chrome DevTools → Performance, record interaction with that panel under realistic data (2-week window, all sessions), and demonstrate >16ms paint or jank. If yes, add `@visx/visx` (or the specific subpackages — `@visx/scale`, `@visx/shape`, `@visx/axis`) **for that panel only**. Recharts elsewhere stays. | visx beats recharts measurably only past ~1k SVG nodes per chart — most CMC charts are nowhere near that. The dense observability surfaces (heatmap grids, sparklines) already use custom-built primitives in `HeatmapGrid.tsx`, not Recharts. |

#### Anti-deps for charts (DO NOT add)

| Avoid | Why |
|---|---|
| **Chart.js** | Canvas-based; harder to make pixel-perfect against the existing CSS-variable design system; loses SVG accessibility. |
| **Nivo** | Bigger bundle than Recharts for similar features; no compelling differentiator. |
| **Apache ECharts** | Excellent library, but ~900 kB minified — out of proportion for a local dashboard. |
| **D3 directly** | Recharts and visx already wrap D3-scale/D3-shape internally. Re-implementing chart primitives in raw D3 is what the visx escape-hatch is for; don't reinvent it. |
| **Plotly** | Bundle is huge; mostly useful for scientific plots not dashboards. |

---

## Backend additions (only if Tier 3 saved-views lands)

The backend stack does NOT change for v1.3 unless the requirements phase explicitly elects Tier 3 server-persisted named views. If it does:

| Addition | Version | Purpose |
|---|---|---|
| Alembic migration `0004_saved_views.py` | n/a | Adds `saved_views` table — single migration, one file. |
| New API route file `backend/cmc/api/routes/saved_views.py` | n/a | CRUD endpoints under `/v1/saved-views`. Follows existing route patterns (`sessions.py`, `alerts.py`). |

No new Python dependencies. SQLAlchemy 2.0 + SQLModel + FastAPI cover all of it.

---

## Installation (when each addition is greenlit by a phase)

```bash
# Phase: Sheet/Popover containment (likely Phase 1 or 2 of v1.3)
pnpm add @radix-ui/react-popover@^1.1.15 @radix-ui/react-dropdown-menu@^2.1.16

# Phase: Density toggle (likely Phase 1 or 2)
# OPTIONAL — only if you want segmented-control a11y for free; otherwise hand-rolled is fine:
pnpm add @radix-ui/react-toggle-group@^1.1.11

# Phase: Customizable layouts / multi-pane compare
pnpm add react-resizable-panels@^4.11.0

# Phase: Saved views (Tier 1+2 — no install)
# (URL-state hooks + localStorage sync are hand-rolled; no install.)

# Phase: Free-form grid rearrange (CONDITIONAL — only if requirements lock Grafana-style grid; verify React 19 issue tracker for #2045 status FIRST)
# pnpm add react-grid-layout@^2.2.3

# Phase: Single dense panel needs visx (CONDITIONAL — only after measured perf wall)
# pnpm add @visx/scale@^3.12.0 @visx/shape@^3.12.0 @visx/axis@^3.12.0
```

No `@types/*` packages needed — `react-resizable-panels`, all `@radix-ui/*` packages, and `recharts` ship their own TypeScript types in 2026.

---

## Version compatibility matrix (verified 2026-05-10 via `npm view`)

| Package | Version | React peerDep | Last published | Notes |
|---|---|---|---|---|
| `react-resizable-panels` | 4.11.0 | `^18 \|\| ^19` | 2026-05-02 | Confirmed compatible with React 19.2 |
| `@radix-ui/react-popover` | 1.1.15 | `^16.8 \|\| ^17 \|\| ^18 \|\| ^19 \|\| ^19.0.0-rc` | 2025-12-24 | Same family/version cadence as the existing `@radix-ui/react-dialog@^1.1.15` already in repo |
| `@radix-ui/react-dropdown-menu` | 2.1.16 | `^16.8 \|\| ^17 \|\| ^18 \|\| ^19 \|\| ^19.0.0-rc` | 2025-12-24 | — |
| `@radix-ui/react-toggle-group` | 1.1.11 | `^16.8 \|\| ^17 \|\| ^18 \|\| ^19 \|\| ^19.0.0-rc` | 2025-12-24 | — |
| `react-grid-layout` (avoided) | 2.2.3 | `>= 16.3.0` (loose) | 2026-03-24 | Loose peerDep masks **known unfixed React 19 key-prop warnings** (GitHub #2045). Reason for avoidance. |
| `@visx/visx` (conditional) | 3.12.0 | `>= 16.8` | 2026-04-14 | If added, prefer importing subpackages (`@visx/scale`, `@visx/shape`, `@visx/axis`) — main `visx` umbrella is heavier than needed |
| `recharts` (held) | 3.8.1 | `^16.8 \|\| ^17 \|\| ^18 \|\| ^19` | 2026-03-25 | Already at latest; supports React 19 |

---

## Bundle-size impact estimate (gzip, approximate)

| Addition | Approx. gzip cost | Lazy-loadable? |
|---|---|---|
| `@radix-ui/react-popover` | ~6 kB | Yes (dynamic import per route) |
| `@radix-ui/react-dropdown-menu` | ~5 kB | Yes |
| `@radix-ui/react-toggle-group` (optional) | ~1.5 kB | n/a (used in shell) |
| `react-resizable-panels` | ~12 kB | Yes (only loaded for routes that use split-pane) |
| **Baseline v1.3 add total** | **~23 kB gzip** for the three baseline deps | — |
| `react-grid-layout` (conditional) | ~30 kB + react-draggable + react-resizable transitives | Yes |
| `visx` per-panel (conditional) | ~30–50 kB per chart subpackage set | Yes |

For a local-only dashboard at `localhost:8765`, network bundle size matters less than parse/compile time. All numbers above are well within "doesn't move the needle" range — but the principle of **add only what a phase commits to using** still applies.

---

## What stays UNCHANGED from v1.2

Everything in the v1.2 STACK.md core technologies table is held — Python 3.13, FastAPI, SQLAlchemy 2.0 async, SQLModel, Alembic, aiosqlite WAL, anthropic SDK, ruff, pyright, pytest, Playwright, Vitest. The frontend core (React 19.2.5, Vite 8, TypeScript 6, TanStack Router/Query, framer-motion, cmdk, lucide-react, recharts) is also held. **v1.3 is a surface-layer milestone — backend and core frontend do not move.**

---

## Stack patterns by variant

**If the requirements phase locks "free-form Grafana-style grid rearrange":**
- Re-evaluate `react-grid-layout` against the React 19 issue tracker at that moment.
- If GitHub #2045 is fixed, add `react-grid-layout@latest` + `@types/react-grid-layout`.
- If still open, evaluate the `react-grid-layout-19` community fork OR ship a constrained-grid built on react-resizable-panels nested in a fixed CSS Grid (drag-resize within fixed slots; no free-form re-arrange).
- This decision belongs in the customizable-layouts phase, not the v1.3 stack lock.

**If the requirements phase locks "named, server-persisted saved views":**
- Add Alembic migration + saved_views API route file (no new Python deps).
- Frontend: hand-rolled `useSavedViews(routeKey)` hook on top of TanStack Query (no new frontend deps).
- This belongs in the saved-views phase.

**If a specific dense panel hits a perf wall during implementation:**
- Profile in Chrome DevTools first. Confirm >16ms paint with realistic data.
- Add visx subpackages **scoped to that one panel only** (`@visx/scale`, `@visx/shape`, `@visx/axis`).
- Leave every other Recharts panel alone.

---

## Sources

- `/Users/patrykattc/work/git/claude-mission-control/frontend/package.json` — verified actual installed deps (NOT the prompt's claims).
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/styles.css` — verified CSS-variable token system (1863 LOC).
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/ui/Sheet.tsx` and `AlertDialog.tsx` — verified existing Radix primitives in use.
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/routes/sessions_.compare.tsx` — verified existing `validateSearch` hand-written-validator pattern.
- `npm view <pkg> version peerDependencies time.modified` against the public npm registry on 2026-05-10 — verified every version + peerDep claim above. **HIGH confidence.**
- Context7 `/bvaughn/react-resizable-panels` — verified library is current and well-documented.
- TanStack Router GitHub Issue #4973 + Discussion #1207 — verified URL↔localStorage sync is a recognised feature gap (not yet built in). [https://github.com/TanStack/router/issues/4973](https://github.com/TanStack/router/issues/4973), [https://github.com/TanStack/router/discussions/1207](https://github.com/TanStack/router/discussions/1207).
- react-grid-layout GitHub Issue #2045 — verified React 19 key-prop warning is open. [https://github.com/react-grid-layout/react-grid-layout/issues/2045](https://github.com/react-grid-layout/react-grid-layout/issues/2045).
- Grafana confirmed using react-grid-layout — [https://github.com/grafana/react-grid-layout](https://github.com/grafana/react-grid-layout). MEDIUM confidence on this being the *right* lib for our case (Grafana uses it, but Grafana is on React 18 and pinned).
- visx vs recharts comparison — [https://www.pkgpulse.com/guides/recharts-vs-chartjs-vs-nivo-vs-visx-react-charting-2026](https://www.pkgpulse.com/guides/recharts-vs-chartjs-vs-nivo-vs-visx-react-charting-2026). MEDIUM confidence on the perf claim threshold (~1k nodes); use as guidance, profile to confirm.

---

*Stack research for: Claude Mission Control v1.3 Surface Redesign*
*Researched: 2026-05-10*
*Confidence: HIGH on additions and version numbers; MEDIUM on the conditional adds (depend on phase requirements); HIGH on the anti-deps (each backed by either an existing in-repo equivalent or a verified compatibility issue).*
