# Architecture Research — v1.3 Surface Redesign

**Domain:** Local single-user observability dashboard, full UX rebuild on top of an unchanged data layer.
**Researched:** 2026-05-10
**Confidence:** HIGH for everything in `frontend/src/` (read directly); HIGH for backend integration points (read `cmc/db/models/sessions.py`, `cmc/api/routes/__init__.py`, `cmc/api/routes/tasks.py`, `cmc/app/lifespan.py`); HIGH for stack constraints (verified in `frontend/package.json`).

## Scope of This Document

v1.3 is a **surface-only rebuild** — the v1.0/v1.1/v1.2 backend, ingest pipelines, polling cadences, query-key factory, and route URLs are all stable and out of scope. This document covers exactly the eight architectural decisions that gate the redesign:

1. Shell architecture (where the new shell lives in the route tree)
2. Density preferences (where state lives, how CSS swaps)
3. Saved views (URL vs localStorage vs server)
4. Sheet/Popover containment (root-cause diagnosis of three reported overflow modes)
5. Bounded panel heights (the panel primitive)
6. Customizable layouts (if scoped in)
7. Cmd+K extensions (palette wiring for new affordances)
8. Build order (phase decomposition for the roadmapper)

## Stack Reality Check (verified, not assumed)

Before recommending anything, the assumed stack must match the actual stack. Read from `frontend/package.json`:

| Claim                          | Reality                                                                                           |
|--------------------------------|---------------------------------------------------------------------------------------------------|
| "Tailwind theme variants"      | **No Tailwind.** Pure CSS with hand-authored variables in `frontend/src/styles.css` (~1400 LOC). |
| "shadcn supports density modes via CSS vars" | **No shadcn.** Components are hand-built in `frontend/src/components/ui/` (Card, Button, Sheet, Tooltip, DataTable, etc.) on top of Radix primitives. |
| "Tailwind `min-w-0` / `min-h-0`" | The CSS contract uses BEM-style classes (`cmc-card`, `cmc-sheet__panel`, etc.) with explicit `min-width: 0` / `min-height: 0` declarations where needed. |
| "ResizablePanelGroup"           | Not installed. Only `framer-motion`, `recharts`, `cmdk`, `cronstrue`, `lucide-react`, `react-error-boundary`. |
| Radix coverage                  | `@radix-ui/react-dialog` (Sheet), `@radix-ui/react-tooltip`, `@radix-ui/react-collapsible`, `@radix-ui/react-alert-dialog`. **No `@radix-ui/react-popover`** — the user's "Popover" reference is the Tooltip primitive, not a separate Popover. |

Implication: every CSS-level recommendation below is in raw CSS variables + class names, never Tailwind utilities. Every shadcn recommendation is excluded; we extend the existing `components/ui/` family.

## Existing Surface (what the redesign integrates with)

### React tree at the root (verified — `frontend/src/routes/__root.tsx`)

```
QueryClientProvider (singleton — staleTime 30s, refetchOnWindowFocus off)
└── ErrorBoundary (ShellErrorFallback — Couldn't reach the dashboard server)
    └── AppShell                              (components/shell/AppShell.tsx)
        ├── ActiveSessionProvider             (components/shell/ActiveSessionContext.tsx — v1.2)
        │   └── TaskComposerProvider          (panels/TaskComposer.tsx)
        │       ├── NavBar                    (components/shell/NavBar.tsx)
        │       ├── CommandPalette            (components/ui/CommandPalette.tsx — cmdk root mount)
        │       └── <main className="cmc-main">
        │           └── <Outlet/>              (page renders here)
```

### Routes (URLs locked — preserved verbatim)

| File                              | URL                                  | Purpose                                                    |
|-----------------------------------|--------------------------------------|------------------------------------------------------------|
| `routes/index.tsx`                | `/`                                  | Command page (top strip + analytical grid)                 |
| `routes/activity.tsx`             | `/activity`                          | Activity (heatmap + charts strip + sessions table)         |
| `routes/skills.tsx`               | `/skills`                            | Skills registry                                            |
| `routes/skills_.$name.tsx`        | `/skills/$name`                      | Skill detail (trailing-underscore = parent layout opt-out) |
| `routes/sessions_.compare.tsx`    | `/sessions/compare?a=...&b=...`      | Session compare (validateSearch — first use of typed search params) |
| `routes/cost.tsx`                 | `/cost`                              | Cost analytics                                             |
| `routes/alerts.tsx`               | `/alerts`                            | Alerts                                                     |

### Sheet/Popover/Dialog primitives (verified)

- `components/ui/Sheet.tsx` wraps `@radix-ui/react-dialog` with `Dialog.Portal forceMount` + framer-motion slide-from-right. Width is `min(480px, 90vw)`, fixed-position, z-index 41 (overlay 40). The body is `flex: 1; overflow-y: auto;` — already correctly bounded internally.
- `components/ui/Tooltip.tsx` wraps `@radix-ui/react-tooltip` with per-instance Provider, `Tooltip.Portal`, `sideOffset={6}`. Each tooltip mounts its own provider — Radix de-dupes pointer-state internally.
- `components/ui/AlertDialog.tsx` wraps `@radix-ui/react-alert-dialog` (mirrors Sheet structure but for destructive confirms — uses `forceMount` similarly).
- z-index ladder: Sheet overlay 40, Sheet panel 41, AlertDialog overlay/panel 45/46, CommandPalette 50, Toast/Banner 50.

### Existing layout primitives (CSS — verified `frontend/src/styles.css:535`)

```css
.cmc-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  grid-auto-rows: 1fr;       /* equal-height rows */
  gap: var(--space-lg);
}
.cmc-page {
  display: flex; flex-direction: column;
  gap: var(--space-xl);
  max-width: 1440px; margin: 0 auto;
}
.cmc-main { padding: var(--space-lg); min-height: calc(100% - 56px); }
.cmc-shell { display: flex; flex-direction: column; min-height: 100%; }
```

The grid is breakpoint-free (auto-fit + minmax), which is good. The page is flex-column with a fixed max-width, which is the right starting point. Panels (`.cmc-card`) are flex-column with explicit gap and `flex: 1` on `.cmc-card__content` — but **no `min-height: 0` on `.cmc-card__content`**, which is the proximate cause of overflow mode (a) below.

## Eight Architectural Decisions

### 1. Shell architecture — keep `__root.tsx`, expand its providers, do not introduce a new file-based parent

**Recommendation: HOLD `routes/__root.tsx` as the singular root. Extend the provider stack inside it (or split a new `<AppShellProviders>` component); do not introduce a `routes/_layout.tsx` or pathless layout route.**

**Why:**

- `__root.tsx` already plays the role of the "every-child wrapper" — TanStack Router renders `<Outlet/>` exactly once at this level, and every page route in `routes/` is a *direct child* of root (`/`, `/activity`, `/skills`, `/cost`, `/alerts`, plus `skills_.$name.tsx` and `sessions_.compare.tsx`). The flat-routing convention with trailing-underscore opt-out is **already** "everything wraps in root unless explicitly opted out", and no current route opts out of root — only out of intermediate parents.
- Introducing a pathless layout route (e.g. `routes/_layout.tsx`) would split the provider story across two files for zero benefit: every page would still render under it, and the trailing-underscore opt-out semantics would have to be re-thought for the two existing opt-out files.
- The v1.2 work already established the pattern: shell-level cross-cutting state lives in a Provider mounted inside `AppShell` (see `ActiveSessionProvider`, `TaskComposerProvider`). v1.3 simply adds more providers (Density, SavedViews if local-only) at the same level.

**The new React tree at root (after v1.3 shell rework):**

```
QueryClientProvider
└── ErrorBoundary
    └── DensityProvider             (NEW — reads localStorage on mount, sets data-density on <html>)
        └── SavedViewsProvider      (NEW — only if Decision 3 picks the local-storage path; harmless if server-persisted)
            └── AppShell
                ├── ActiveSessionProvider
                │   └── TaskComposerProvider
                │       ├── NavBar (extended: density toggle, saved-view dropdown)
                │       ├── CommandPalette (extended: jump-to-saved-view + jump-to-time-range groups)
                │       └── <main className="cmc-main">
                │           └── <Outlet/>
```

The provider order matters: `DensityProvider` must be ABOVE `AppShell` because the shell's chrome (NavBar height, sidebar widths) reacts to density via CSS variables that the provider sets on `<html>`. Providers that read URL state (e.g. SavedViews server-persisted) need router context, so they sit INSIDE `__root.tsx` after `QueryClientProvider` (router context is provided by `createRootRoute` itself — no separate provider).

**Splitting AppShell into chrome vs body:**

Today `AppShell` mounts `<NavBar/>` + `<CommandPalette/>` + `<main/>`. v1.3 wants more chrome (density toggle, saved-view dropdown, optional sidebar, optional secondary toolbar). The clean refactor is:

```tsx
// AppShell.tsx — minimal change, additive only
export function AppShell({ children }) {
  return (
    <ActiveSessionProvider>
      <TaskComposerProvider>
        <div className="cmc-shell">
          <AppShellHeader />        {/* NEW — extracted from NavBar, hosts density/views/cmdk */}
          <CommandPalette />         {/* unchanged — still mounts at shell level */}
          <main className="cmc-main">{children}</main>
        </div>
      </TaskComposerProvider>
    </ActiveSessionProvider>
  )
}
```

`AppShellHeader` becomes the home for v1.3 chrome additions; the existing `NavBar` content moves inside it. This is a strict refactor — no behavior change — and keeps v1.0/v1.1/v1.2 tests green (the test selectors target `cmc-navbar` / NavLink / CommandPalette individually, not the AppShell composition).

### 2. Density preferences — localStorage + `[data-density]` attribute on `<html>` driving CSS variable swap

**Recommendation: Mirror the existing theme pattern (`frontend/src/lib/theme.ts`). New `lib/density.ts` module with `applyDensity()` called from `main.tsx` BEFORE `ReactDOM.createRoot`. Persist via `localStorage` key `cmc.density`. Toggle attribute `[data-density="compact" | "comfortable"]` on `<html>`. Branch a small set of CSS variables under that selector.**

**Why localStorage and not server-persisted:**

- This is a single-user macOS-only tool. There's no "sync across devices" use case, no auth boundary, no second user. Server persistence is overkill.
- The existing convention is established: `lib/theme.ts` does exactly this for `cmc.theme`, and the avoidance-of-flash-on-cold-load pattern is already solved by calling `applyTheme()` before React mounts. Following that convention costs zero design budget.
- localStorage is silent on quota errors (`lib/storage.ts:21`), so the worst case is "density falls back to default" — not user-visible breakage.

**Why `[data-density]` attribute and not Tailwind variants or React Context for the CSS:**

- Tailwind isn't installed. This is moot.
- React Context for the CSS layer would require every consumer to read context and emit conditional classNames — every panel would need to know about density. The data-attribute approach centralizes the swap in one CSS layer; **panels never need to know density exists**. This is the same separation-of-concerns the theme system already uses.
- The data-attribute lives on `<html>` (not `<body>`) so the attribute is set during the first paint via `applyDensity()` — same flash-prevention guarantee as theme.

**The CSS contract — branch only the density-sensitive tokens:**

```css
/* frontend/src/styles.css — additive only */

:root {
  /* Default = comfortable. Existing values stay; density tokens become the
     INDIRECT layer that consuming rules read. Backwards-compat: rules that
     don't read these tokens are unaffected. */
  --density-row-padding: var(--space-sm);          /* table row vertical padding */
  --density-card-padding: var(--space-lg);         /* card body padding */
  --density-gap: var(--space-md);                  /* default flex/grid gap */
  --density-input-height: 32px;
  --density-font-body: var(--size-body);           /* 14px today */
}

[data-density="compact"] {
  --density-row-padding: var(--space-2xs);
  --density-card-padding: var(--space-md);
  --density-gap: var(--space-sm);
  --density-input-height: 28px;
  --density-font-body: 13px;                       /* one step smaller */
}
```

Then a focused refactor pass updates the small set of class rules that should respond to density:

```css
.cmc-card { padding: var(--density-card-padding); /* was var(--space-lg) */ }
.cmc-card-grid { gap: var(--density-gap); /* was var(--space-lg) */ }
.cmc-table th, .cmc-table td { padding: var(--density-row-padding) var(--space-sm); /* was var(--space-xs) */ }
.cmc-btn { min-height: var(--density-input-height); /* was 32px */ }
```

**State lives at three layers:**

1. **`localStorage` (`cmc.density`)** — the durable store. Read once at boot.
2. **`<html data-density>`** — the runtime CSS-driving attribute. Set by `applyDensity()` and by the toggle handler.
3. **React Context (`DensityProvider`)** — exposes the current density and a setter to React components (the toggle button itself, plus any component that wants to render density-aware copy/icons). The provider DOES NOT drive CSS; it drives React state for the chrome controls only.

The provider's setter writes to localStorage, sets the data-attribute, and updates internal state in one transaction — same shape as `lib/theme.ts:setTheme`.

**API surface (no backend changes needed — all client-side):**

```ts
// frontend/src/lib/density.ts (NEW — mirrors lib/theme.ts)
export type Density = 'comfortable' | 'compact'
export const DEFAULT_DENSITY: Density = 'comfortable'
export function getDensity(): Density { /* read cmc.density, default comfortable */ }
export function setDensity(d: Density): void { /* write storage + dataset.density */ }
export function applyDensity(): void { /* call from main.tsx pre-mount */ }
```

```tsx
// frontend/src/components/shell/DensityProvider.tsx (NEW)
const DensityContext = createContext<{ density: Density; setDensity: (d: Density) => void } | null>(null)
// Provider reads getDensity() once on mount, stores in useState, setter calls setDensity()
// + setState in one transaction. Stable value via useMemo (mirrors ActiveSessionProvider).
```

### 3. Saved views — URL search params first, server-persisted "named view" only as a follow-on

**Recommendation: Use TanStack Router `validateSearch` for the per-route filter/range/sort state (the "view" itself). Persist named views to the SERVER via a new `views` table — a single-user dashboard still benefits from server persistence so views survive `localStorage.clear()` and DB-backed export/import. Default view per route lives in localStorage as a tiny pointer (just the saved-view id), not the view payload.**

**Why a hybrid (URL + server) and not pure localStorage:**

- Pure URL is the right primitive for the **transient** view: it's bookmarkable, shareable as a deep link, and survives a refresh — and TanStack Router's `validateSearch` already exists in the codebase (see `routes/sessions_.compare.tsx:32`). Every page that gains filters in v1.3 should adopt validateSearch as its first move.
- Pure localStorage for the **named view library** would mean views disappear on a fresh checkout / new browser profile / cleared storage. For a dashboard the user invests in (curating filters), that's bad UX. Server-persisted is durable and matches the existing pattern (tasks, schedules, alert rules — all persist server-side).
- Pure server-persisted for the transient view (i.e., reading the live filter from the server every render) is the wrong direction — it adds round trips for state the client already owns.

**Why the default-view pointer lives in localStorage and not the server:**

- "Which view do I land on when I open this page?" is a per-browser preference, not user data. A future second device should not inherit it.
- The pointer is a single integer (the view id) — trivially small, trivially safe to lose.

**SQLModel + Alembic + endpoints sketch (extends-not-breaks contract):**

```python
# backend/cmc/db/models/views.py (NEW — mirrors tasks.py shape)
from datetime import datetime
from sqlmodel import Field, Index, SQLModel
from cmc.core.time import now_utc

class SavedView(SQLModel, table=True):
    __tablename__ = "saved_views"
    id: int | None = Field(default=None, primary_key=True)
    route: str = Field(max_length=64)         # e.g. "/activity", "/cost", "/skills"
    name: str = Field(max_length=120)
    # state is stored as a JSON string. URL search-param shape — whatever the route's
    # validateSearch accepts. Decoded client-side; backend treats opaquely.
    state_json: str = Field(default="{}")
    sort_order: int = Field(default=0)        # for explicit user ordering in the dropdown
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)
    __table_args__ = (
        Index("idx_saved_views_route_sort", "route", "sort_order"),
    )
```

```python
# backend/migrations/versions/0004_saved_views.py
def upgrade() -> None:
    op.create_table(
        "saved_views",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("route", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=120), nullable=False),
        sa.Column("state_json", sa.Text, nullable=False, server_default="{}"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("idx_saved_views_route_sort", "saved_views", ["route", "sort_order"])
```

```python
# backend/cmc/api/routes/views.py (NEW — wired into all_routers() in routes/__init__.py)
@router.get("/views", response_model=SavedViewListResponse)
async def list_views(route: str | None = Query(None), db: AsyncSession = Depends(get_session)): ...

@router.post("/views", response_model=SavedView, status_code=201)
async def create_view(payload: SavedViewCreate, db: AsyncSession = Depends(get_session)): ...

@router.patch("/views/{view_id}", response_model=SavedView)
async def update_view(view_id: int, payload: SavedViewPatch, ...): ...

@router.delete("/views/{view_id}", status_code=204)
async def delete_view(view_id: int, ...): ...
```

Five endpoints, one table, one migration. All additive — no existing endpoint or table changes. The lifespan auto-applies the migration on next boot (`backend/cmc/app/lifespan.py`).

**Frontend integration:**

- Each routed page declares `validateSearch` (mirroring `routes/sessions_.compare.tsx:70`) and a typed `Search` shape covering its filters (range, sort, filter strings, pagination cursor).
- A new hook `useSavedViews(route)` is added to `lib/queries.ts` — same factory, same 30s cadence, same query-key family — and a `useSaveView` / `useDeleteView` mutation pair.
- The `SavedViewMenu` chrome component (in NavBar) calls `navigate({ to: route, search: JSON.parse(view.state_json) })` to apply a view; "Save current view" reads `useSearch()` and POSTs.
- A "Set as default" action writes the view id to `localStorage` key `cmc.defaultView.<route>`. The page's component reads this on mount and `navigate(... search: ...)` exactly once when the URL has no params — never overrides a deep-linked URL.

**Confidence:** HIGH — this matches the existing tasks/schedules CRUD shape exactly, including server_default handling and migration patterns.

### 4. Sheet/Popover containment — three distinct root causes, three distinct fixes

The user reports three overflow modes. They have **independent root causes**, and conflating them as "panels overflow" would lead to the wrong fixes. Each is grounded in code I read directly.

#### Mode (a) — "Panels exceed viewport"

**Root cause: `.cmc-card__content { flex: 1; }` lacks `min-height: 0`, AND the page has no max-height to flex against.**

The CSS contract today (`styles.css:218-231`):

```css
.cmc-card { display: flex; flex-direction: column; gap: var(--space-md); }
.cmc-card__content { flex: 1; }
```

Inside `.cmc-card-grid` with `grid-auto-rows: 1fr`, every card claims an equal share of the row's intrinsic height — but the row's height is determined by the **tallest card's content**, because nothing constrains the page to viewport height. A card whose content is a 5000-row table or a long Otel firehose will simply grow the row, and the whole grid grows with it. The card "exceeds the viewport" because the **viewport never told the card it had to fit**.

There are two layered fixes — the page fix and the card fix:

1. **Page-level constraint (the architectural decision):** introduce a layout mode where the `.cmc-page` container has `height: calc(100vh - 56px)` (the navbar height) and is `display: flex; flex-direction: column; min-height: 0;` on its descendant chain. This means the page IS the viewport, the grid is bounded, and cards inside the grid get a real upper bound from `grid-auto-rows: 1fr`. This is opt-in per route — the `/activity` page with its long sessions table and `/cost` page with deep tables WILL benefit; the `/` Command page with its analytical grid is the canonical case.
2. **Card-level fix:** add `min-height: 0` to `.cmc-card` AND `.cmc-card__content`, plus `overflow-y: auto` on `.cmc-card__content`. Without `min-height: 0` on a flex child, the child refuses to shrink below its content's intrinsic height — this is the canonical flexbox gotcha and is the mechanism by which a card's content "punches through" its parent grid cell.

**Architectural fix:** introduce a new primitive `BoundedPanelCard` (or a `bounded` prop on `PanelCard`) that opts a panel into the bounded layout. Pages that want a bounded layout wrap their content in a new `cmc-page--bounded` modifier class. Pages that want today's "scroll the whole page" behavior keep `.cmc-page` as-is. **Both modes coexist** — backward-compatible.

#### Mode (b) — "Sheets/Popovers escape parent bounds"

**Root cause:** The Sheet works correctly today (`Dialog.Portal` + `position: fixed`, z-index 41 — verified `styles.css:398`). The reported "escape" is almost certainly the **Tooltip arrow positioning** in containers with `overflow: hidden`, OR a Sheet that contains a chart whose own content has `position: absolute` without a positioning ancestor.

Three sub-modes to diagnose:

1. **Radix portals to `document.body` by default** — that's the explicit design and is correct (the Sheet, Tooltip, AlertDialog all use `Portal`). They cannot be clipped by ancestor `overflow: hidden`.
2. **z-index ladder is correct** — Sheet 40/41, AlertDialog 45/46, CommandPalette 50 — verified in `styles.css:330,396,404,466,1368,1385`. There is no z-index inversion.
3. **The actual likely culprit:** Tooltips inside containers with `overflow: hidden` AND `position: relative`. Even though Radix portals to body, if a parent chart figure has `transform: ...` set, the portal containing-block CHANGES (CSS containing-block escape: a transformed ancestor becomes the containing block for `position: fixed` descendants — **this is the trap**). recharts wraps its `<svg>` with a styled `<div>` that, in some chart configurations, sets a `transform`.

**Architectural fix:** a centralized z-index system token map is documented and maintained in `styles.css` (the comment at line 1357 already does this for AlertDialog) — add a `/* z-index ladder */` block at the top so additions follow the rule. AND audit `recharts` chart wrappers: the panels using `ResponsiveContainer` (`ChartsStrip.tsx`, `TopSkills.tsx`, `SessionCompareView.tsx`, `CacheEfficiencyCard.tsx`) — none should have a `transform` set on the wrapping element. The audit becomes a phase deliverable, not a per-panel sweep.

For the new dashboard chrome (saved-view dropdown, density toggle, etc.), use Radix's Popover primitive **after** installing `@radix-ui/react-popover` (it is NOT currently in `package.json` — adding it is a deliberate dependency add). Configure with `Popover.Portal` + `align="end"` + `collisionPadding` so it never escapes. Match the existing Tooltip integration shape.

#### Mode (c) — "Data overflows card edges"

**Root cause: `min-width: 0` is missing on flex/grid children that contain wide content (long session ids, full cwd paths, 6+ column tables).**

Verified causes from reading the code:

- `.cmc-table { width: 100%; }` (`styles.css:646`) but tables sit inside `.cmc-card__content` whose intrinsic width comes from its children — which by default is the table's own min-content. With wide table content (long session ids, long cwd paths), the card can be pushed beyond the grid cell. CSS Grid implicitly applies `min-width: auto` (i.e., min-content) to grid items; **without `min-width: 0` on the card, it grows past the cell**.
- The flex chain `.cmc-card > .cmc-card__content > .cmc-table` lets the table demand its content's intrinsic width. Without `min-width: 0` AND `overflow-x: auto` on a wrapping div, the table forces the card to widen.
- Truncation utilities exist (`overflow: hidden; text-overflow: ellipsis;` — `styles.css:1094-1096, 1150-1151, 1308-1309, 1343-1344`) but are inconsistently applied. cwd cells in SessionsTable, request_id columns in SkillRunsTable, and project paths in `ProjectBreakdownCard` are the chief offenders.

**Architectural fix (three-pronged):**

1. **Add to `.cmc-card` and `.cmc-card-grid > *`: `min-width: 0;`** — this is the single highest-leverage one-line CSS change in the entire redesign. It fixes mode (c) for **every** card on **every** route in one commit, with zero per-panel work.
2. **Wrap every `<DataTable/>` in `.cmc-card__content` with a `<div className="cmc-table-wrap">` whose CSS is `overflow-x: auto; min-width: 0;`**. This makes every table independently scrollable horizontally — the table's intrinsic width can exceed the card width without breaking the card. This becomes part of the `DataTable` primitive itself (one-line internal change, every consumer benefits).
3. **Adopt a `cmc-cell--truncate` utility class:** `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` — opt-in per cell, with a Tooltip wrapping the cell so the full value is still inspectable. Cell renderers in `SessionsTable.tsx`, `SkillRunsTable.tsx`, `ProjectBreakdownCard.tsx` adopt this.

The combination — `min-width: 0` propagated through the layout chain + `overflow-x: auto` wrappers around tables + opt-in truncation utility — eliminates mode (c) without any structural rework.

### 5. Bounded panel heights — parent flex column + `flex: 1; min-height: 0;` + internal `overflow-y: auto`

**Recommendation: the panel primitive uses a flex-column shell with an explicit `min-height: 0` on the body and `overflow-y: auto` on the body. Do NOT use explicit `max-h` breakpoints. Do NOT use CSS Grid auto-rows for the bounding (keep the existing grid-auto-rows: 1fr for equal-height visuals, but the height is delegated to the page container via flex-bounded ancestors).**

**Why flex over grid auto-rows for bounding:**

- `grid-auto-rows: 1fr` already gives equal-height visuals and is in place. Don't fight it.
- The actual upper bound — "panels do not exceed the viewport" — needs to come from a fixed-height ancestor. CSS Grid auto-rows can only equalize, not bound. Flex with a height-fixed ancestor + `min-height: 0` on every flex descendant in the chain bounds correctly.
- Explicit `max-h` breakpoints (Tailwind-style) tie height to media queries — this is exactly the kind of breakpoint coupling the existing `cmc-card-grid` deliberately avoids ("breakpoint-free responsive — `auto-fit + minmax(320px, 1fr)`").

**The primitive (extends existing `PanelCard`, opt-in via `bounded` prop):**

```tsx
// components/ui/PanelCard.tsx — add a bounded prop (no breaking change)
interface PanelCardProps<T> {
  // ...existing fields...
  /**
   * When true, the panel renders in bounded mode: card body becomes
   * flex-column with min-height: 0 and the data slot scrolls internally.
   * Pages that want a bounded layout must opt in via .cmc-page--bounded
   * AND the parent grid must have a finite height in the flex chain.
   */
  bounded?: boolean
}
```

```css
/* CSS additions — additive only */
.cmc-card--bounded {
  min-height: 0;             /* mode (a) fix at card level */
}
.cmc-card--bounded .cmc-card__content {
  min-height: 0;             /* essential for flex-shrink */
  overflow-y: auto;          /* internal scroll */
  flex: 1 1 auto;
}
.cmc-page--bounded {
  height: calc(100vh - 56px);   /* navbar height */
  min-height: 0;
  overflow: hidden;            /* the page itself never scrolls — children do */
}
.cmc-page--bounded > .cmc-card-grid {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;            /* the grid scrolls if cards overflow rows */
}
```

**Why this primitive is the right fit:**

- It is **additive** — every existing route works unchanged because `bounded` defaults to false and `.cmc-page--bounded` is opt-in.
- It composes with `grid-auto-rows: 1fr` instead of fighting it.
- It maps cleanly onto the user's reported intent ("panels should fit the viewport") with one prop on the card and one class on the page.
- It uses the same CSS variables and BEM patterns as the rest of the codebase — zero new conventions.

### 6. Customizable layouts — DEFER. If scoped in, recommend `react-resizable-panels` + URL state, NOT `react-grid-layout`

**Recommendation: explicitly defer customizable dashboards from v1.3 unless requirements scoping locks them in. If they are locked in, the architecture is: layout shape lives in URL (TanStack Router validateSearch), drag/resize uses `react-resizable-panels` (a small focused library — NOT `react-grid-layout`).**

**Why defer:**

- The three reported overflow bugs and the redesign's aesthetic coherence are independently valuable and address every user complaint quoted in the milestone context. Customizable layouts are an additional, large-surface feature.
- `react-grid-layout` is 50KB+ minified and brings React-DnD / synthetic event coupling and Layout/ReactGridLayout class semantics that don't compose with the BEM/CSS-variable conventions in `styles.css`. It also has a fundamentally different data model (per-card `{x,y,w,h}` items) that has to be persisted somewhere — and would push us back to the saved-views server table for layout, complicating Decision 3.
- This is a single-user dashboard. The user already controls every panel's existence at the source code level. The marginal value of drag-to-rearrange for a single user is meaningfully lower than for a multi-tenant SaaS dashboard.

**If locked in, the architecture:**

- **Resize only, no rearrange.** `react-resizable-panels` (~6KB, no deps, accessible — written by the React team and used by shadcn). Two/three-pane vertical or horizontal split is enough. No grid drag-and-drop.
- **Layout state in URL via validateSearch.** A small typed shape: `{ split?: number; orientation?: 'h' | 'v' }`. URL-based means deep-linkable, refresh-stable, and it composes with saved views from Decision 3 — a saved view captures both filters AND layout proportions in the same `state_json` blob. **No new database table.**
- **Storage of "default layout" per route** is the same `localStorage` pointer-to-saved-view pattern from Decision 3. Same primitive, same code path.
- **No `react-grid-layout`.** If the requirements step asks for true bento-style drag-rearrange, that is a v1.4 milestone, not v1.3.

### 7. Cmd+K extensions — extend the existing single mount, lean on existing context for state

**Recommendation: keep `<CommandPalette/>` mounted exactly once at AppShell level. Add new command groups (Saved Views, Time Ranges, Filtered Views) inside the existing `<Command.Dialog>`. New commands read state via existing hooks (`useRouterState`, `useSearch`, `useActiveSession`) and via the new `SavedViewsContext` from Decision 3 — no new global Context needed.**

**Why no new top-level palette context:**

- The existing palette already proves the pattern: it consumes `useTaskComposer()` (TaskComposerProvider), `useActiveSession()` (ActiveSessionProvider), `useRouterState`, `useNavigate`, `useSessionsList`, `useSessionCompare`, `useSessionPrevious`. Each new affordance is "add a `Command.Group` + an `onSelect` handler that calls into existing hooks". The palette already has direct access to everything new commands need — except the SavedViews list, which Decision 3 provides as a hook.
- A "CommandPaletteContext" abstraction would be busywork: there's nothing for it to own that isn't already owned by route state, query hooks, or the saved-views provider.

**The new Command.Groups (concrete):**

```tsx
// CommandPalette.tsx — additive groups inside the existing Command.List
<Command.Group heading="Jump to saved view" className="cmc-cmdk__group">
  {savedViewsForCurrentRoute.map((v) => (
    <Command.Item key={v.id} onSelect={() => {
      navigate({ to: v.route, search: JSON.parse(v.state_json) })
      close()
    }} className="cmc-cmdk__item">
      {v.name}
    </Command.Item>
  ))}
</Command.Group>

<Command.Group heading="Time range" className="cmc-cmdk__group">
  {(['today', '7d', '30d'] as const).map((r) => (
    <Command.Item key={r} onSelect={() => {
      navigate({ search: (prev) => ({ ...prev, range: r }) })  // function form — Pitfall 4
      close()
    }} className="cmc-cmdk__item">
      Set range to {r}
    </Command.Item>
  ))}
</Command.Group>
```

The "set range" group uses TanStack Router's function-form `search` setter (already documented as the safe pattern in `CommandPalette.tsx:209`) so the change is route-agnostic — it merges the new `range` into whatever validateSearch shape the current route declares. Routes that don't accept `range` simply strip it via their validator (defense in depth).

**Visibility rules (mirror existing pattern):**

The existing palette already conditionally renders the "Compare with previous session" item based on `showCompareWithPrevious` (`CommandPalette.tsx:114`). v1.3 commands follow the same pattern: each new group is conditionally rendered based on simple booleans (e.g., "Saved views" only when `savedViews.length > 0`; "Time range" only on routes that declare `range` in their validateSearch).

### 8. Build order — five phases, shell rework first, per-route adoption second, optional features last

**Phase decomposition (recommended labels — roadmapper finalizes):**

| # | Phase                                            | Scope                                                                                                  | Why this order                                                                                                                                                                  |
|---|--------------------------------------------------|--------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **24** | **Shell rework + density + global containment fixes** | DensityProvider + `lib/density.ts` + `[data-density]` CSS branch, AppShellHeader extraction, **`.cmc-card { min-width: 0; }` global fix (mode c)**, `BoundedPanelCard` primitive + `.cmc-page--bounded` (mode a infrastructure), recharts wrapper transform audit (mode b), z-index ladder docs. **No per-route work.** | Lays the primitives every later phase depends on. The mode-c fix (`min-width: 0`) is a one-line CSS change that fixes overflow on EVERY existing route in the same commit. Density is a tiny additive feature that proves the new CSS-variable density tokens work. URLs unchanged; APIs unchanged; tests stay green. |
| **25** | **Saved views (server-persisted)**               | `saved_views` table + migration `0004_saved_views`, `views.py` router + 5 endpoints, `useSavedViews` hooks in `lib/queries.ts`, `validateSearch` adoption on `/activity` `/skills` `/cost` `/alerts` (URL state for filters), `SavedViewsProvider`, `SavedViewMenu` chrome, Cmd+K Saved Views group, "Set as default" via `cmc.defaultView.<route>` localStorage pointer. | Server-side decoupled (table + endpoints can land first and be tested in isolation), then frontend wires up. validateSearch adoption is per-route but uniform — each route gains a typed Search shape. URLs unchanged (parameters ADDED, never removed); APIs extend (5 new endpoints, 0 changes to existing); tests green throughout. |
| **26** | **Per-route adoption pass (Command + Activity + Sessions)** | `/` Command, `/activity` Activity, `/sessions/compare` adopt `BoundedPanelCard` and `.cmc-page--bounded` where appropriate. `cmc-table-wrap` applied inside `DataTable`. `cmc-cell--truncate` adopted in `SessionsTable`, `LiveSessionsCard` row layout. Density-token usage propagated. | The three highest-traffic routes get the new primitives first. They share the same panels (LiveSessionsCard appears on /; SessionsTable appears on /activity). One panel sweep, two-page rollout. URLs unchanged; tests update for new data-testid hooks. |
| **27** | **Per-route adoption pass (Skills + Cost + Alerts)** | `/skills`, `/skills/$name`, `/cost`, `/alerts` adopt `BoundedPanelCard` + density + truncate utilities. Cmd+K Time-Range group lands here (it depends on validateSearch having `range` declared on these routes — Phase 25 prerequisite). | Tail-end routes pick up the primitives. `/skills/$name` is a separate file (trailing-underscore opt-out) but uses the same panels (`SkillRunsTable`, etc.); rolls in cleanly. URLs unchanged. |
| **28** | **(Optional) Customizable layouts**              | Only if requirements step locks them in. Add `react-resizable-panels`, extend per-route `validateSearch` with optional `split`/`orientation`, persist split via the existing `SavedView.state_json` blob. | Last, because it is the only phase that introduces a new dependency, the only phase whose value is debatable for a single-user tool, and its design depends on the saved-views state shape settled in Phase 25. |

**Dependency chain (verbatim):**

- Phase 24 → Phase 25: SavedViewsProvider mounts inside the new AppShell provider stack from Phase 24.
- Phase 24 → Phase 26: BoundedPanelCard and `.cmc-page--bounded` must exist before any route adopts them.
- Phase 25 → Phase 26+: validateSearch declarations on each route are required before the Cmd+K Time-Range group can navigate to them.
- Phase 26 → Phase 27: not strictly required, but the per-route adoption is so similar that splitting Command/Activity/Sessions from Skills/Cost/Alerts gives a natural mid-milestone checkpoint without coupling.
- Phase 28: depends on every prior phase; only relevant if scoping picks it up.

**Constraint honoring:**

- **URLs preserved:** every phase only ADDS search parameters, never removes routes or changes paths. validateSearch with optional fields lets old links continue to resolve. The trailing-underscore convention (`skills_.$name.tsx`, `sessions_.compare.tsx`) is preserved.
- **APIs extend, never break:** Phase 25 adds 5 new endpoints; no existing endpoint changes. Phases 24/26/27/28 are frontend-only.
- **Tests green at phase boundaries:** Phase 24 is purely additive CSS + new modules — existing tests cannot regress. Phase 25's backend tests are new (mirror `test_tasks_routes.py`); frontend tests gain coverage for SavedViewsProvider/Menu but existing panel tests are unaffected. Phases 26/27 update Playwright e2e selectors only where new chrome appears; component unit tests for individual panels stay green because PanelCard's `bounded` prop is opt-in with a default-false.
- **Shell rework BEFORE per-page rework:** Phase 24 is shell + primitives only — no route adopts them. Pages adopt in 26/27 against the now-stable primitives.

## Architectural Diagram (after v1.3)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ <html data-theme="..." data-density="...">                                   │
│ ┌────────────────────────────────────────────────────────────────────────┐   │
│ │ QueryClientProvider                                                    │   │
│ │ └─ ErrorBoundary                                                       │   │
│ │    └─ DensityProvider                          (NEW v1.3)              │   │
│ │       └─ SavedViewsProvider                    (NEW v1.3)              │   │
│ │          └─ ActiveSessionProvider              (v1.2)                  │   │
│ │             └─ TaskComposerProvider                                    │   │
│ │                ├─ AppShellHeader               (REFACTORED v1.3)       │   │
│ │                │  ├─ NavBar (links)                                    │   │
│ │                │  ├─ SavedViewMenu             (NEW)                   │   │
│ │                │  ├─ DensityToggle             (NEW)                   │   │
│ │                │  ├─ Cmd+K trigger                                     │   │
│ │                │  └─ ThemeToggle                                       │   │
│ │                ├─ CommandPalette (cmdk root mount — NEW groups)        │   │
│ │                └─ <main className="cmc-main">                          │   │
│ │                     <Outlet/>  → page routes (URL-stable, validateSearch)│ │
│ └────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘

Backend (additive only):
  cmc/api/routes/       + views.py       (NEW: 5 endpoints)
  cmc/db/models/         + views.py       (NEW: SavedView model)
  cmc/api/schemas/       + views.py       (NEW: response/request shapes)
  backend/migrations/versions/  + 0004_saved_views.py    (NEW)
  All other backend modules: UNCHANGED.
```

## Anti-Patterns (specific to this redesign)

### Anti-Pattern 1: Density via React Context driving className

**What people do:** make `DensityProvider` expose `density` to every panel; panels conditionally apply `'cmc-card--compact'` className.
**Why it's wrong:** every panel needs to know density exists. The redesign touches every panel for a property that is a presentation concern, not a data concern.
**Do this instead:** density is a CSS-layer concern. The provider sets `[data-density]` on `<html>`; panels read CSS variables (`--density-card-padding` etc.). Panels are density-unaware.

### Anti-Pattern 2: Saving full view state in URL only

**What people do:** put every filter, sort key, page, and column visibility into URL search params, with no validateSearch.
**Why it's wrong:** URL bloat, no type safety, deep-link fragility (renaming a param breaks every saved bookmark).
**Do this instead:** declare `validateSearch` per route with a typed Search shape; ONLY the canonical filters live in URL. Implementation details (e.g., column visibility checkbox state) live in `localStorage` keyed by route.

### Anti-Pattern 3: Per-page CSS overrides for overflow

**What people do:** when a panel overflows, add a one-off `.activity-page .cmc-card { min-width: 0; }` rule in styles.css.
**Why it's wrong:** scattered fixes drift; the same bug recurs on the next route added.
**Do this instead:** fix the primitive (Phase 24's `.cmc-card { min-width: 0; }` global). Per-page overrides indicate a primitive missing from `components/ui/`.

### Anti-Pattern 4: Adding a new Provider for every new feature

**What people do:** "Saved views needs a provider, density needs a provider, layout needs a provider" — each gets its own context, three new providers stack.
**Why it's wrong:** the provider stack already exists (ActiveSessionProvider, TaskComposerProvider). Each new layer increases re-render fanout.
**Do this instead:** one new provider per genuinely-cross-cutting state (Density: yes, because chrome AND CSS attribute coordination; SavedViews: yes, because cmdk + chrome + URL writer all read it). Layout state lives in URL — no provider needed.

### Anti-Pattern 5: Replacing the Cmd+K mount

**What people do:** "the new design needs a different palette UX" → swap cmdk for a different lib.
**Why it's wrong:** cmdk is already mounted, integrated with TaskComposer + ActiveSession + router state, and battle-tested across v1.0/v1.1/v1.2.
**Do this instead:** add command groups inside the existing `<Command.Dialog>`. The visual styling is in `styles.css:460-528` and is fully theme/density-tokenizable.

## Integration Points

### External Services (unchanged in v1.3)

No external services change in v1.3. The dashboard remains local-only on `localhost:8765`. OTLP `/v1/logs` and `/v1/metrics` ingress is unchanged. Telegram bridge is unchanged.

### Internal Boundaries

| Boundary                                         | Communication                                          | v1.3 Notes                                            |
|--------------------------------------------------|--------------------------------------------------------|-------------------------------------------------------|
| `__root.tsx` ↔ providers                         | Direct child composition                                | New providers (Density, SavedViews) added at root.    |
| `AppShell` ↔ chrome (NavBar/CommandPalette)      | Direct render                                           | NavBar refactors into AppShellHeader.                 |
| `CommandPalette` ↔ ActiveSessionContext / Saved Views | `useContext` hook consumption                       | Adds `useSavedViews()` consumption; pattern unchanged.|
| Page route ↔ URL state                           | `useSearch()` + `validateSearch`                        | Per-route validateSearch becomes universal in Phase 25.|
| Frontend ↔ Backend                               | JSON over HTTP, polling cadence in `lib/queries.ts`    | Adds `useSavedViews` hook; cadence 30s (matches alerts).|
| `lib/density.ts` ↔ DOM                           | `documentElement.dataset.density`                       | Mirrors `lib/theme.ts` exactly.                       |

## Sources

- `frontend/src/routes/__root.tsx` — root provider stack (read 2026-05-10)
- `frontend/src/components/shell/AppShell.tsx` — shell composition + provider order
- `frontend/src/components/shell/ActiveSessionContext.tsx` — v1.2 context pattern (the model for new providers)
- `frontend/src/components/shell/NavBar.tsx` — current chrome
- `frontend/src/components/ui/Sheet.tsx` — Radix Dialog wrap, z-index 41
- `frontend/src/components/ui/Tooltip.tsx` — Radix Tooltip with per-instance Provider
- `frontend/src/components/ui/CommandPalette.tsx` — cmdk integration, context-aware actions
- `frontend/src/components/ui/PanelCard.tsx` — current panel primitive (skeleton/error/empty/data branches)
- `frontend/src/components/ui/Card.tsx` — Card family (forwardRef, BEM classes)
- `frontend/src/components/ui/DataTable.tsx` — sortable/paginated table primitive
- `frontend/src/styles.css` — full CSS contract (~1400 LOC, hand-authored CSS variables, BEM)
- `frontend/src/lib/storage.ts` — namespaced localStorage wrapper (silent on quota errors)
- `frontend/src/lib/theme.ts` — theme persistence pattern (the model for density)
- `frontend/src/lib/queries.ts` — query-key factory + cadence policy (the model for view hooks)
- `frontend/src/routes/sessions_.compare.tsx` — first validateSearch use (the model for per-route URL state)
- `frontend/package.json` — confirmed: no Tailwind, no shadcn, Radix only Dialog/Tooltip/Collapsible/AlertDialog
- `backend/cmc/api/routes/__init__.py` — router aggregation (where `views_router` registers)
- `backend/cmc/api/routes/tasks.py` — CRUD endpoint shape (the model for `views.py`)
- `backend/cmc/db/models/tasks.py` — SQLModel pattern (the model for `SavedView`)
- `backend/cmc/db/models/sessions.py` — Index pattern + sa_column_kwargs server_default
- `backend/migrations/versions/0003_project_key.py` — migration pattern + lifespan auto-apply
- `backend/cmc/app/lifespan.py` — alembic auto-migrate on boot

---
*Architecture research for: v1.3 Surface Redesign of Claude Mission Control*
*Researched: 2026-05-10*
