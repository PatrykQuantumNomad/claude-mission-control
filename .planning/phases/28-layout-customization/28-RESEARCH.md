# Phase 28: Layout Customization — Research

**Researched:** 2026-05-16
**Domain:** Frontend layout customization (panel show/hide, 1D drag-reorder, split-pane resize) on a React 19.2 + TanStack Router + recharts dashboard with server-persisted saved views.
**Confidence:** HIGH (single new dep with verified v4 API; everything else is additive composition on Phases 24/25/26/27 primitives)

> **No CONTEXT.md present.** This is research-first — phase 28 directory contains no prior planning artifacts (`ls .planning/phases/28-layout-customization/` returned empty). The planner / discuss-phase will treat every recommendation below as a draft to be confirmed.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAYO-01 | Per-route panel show/hide menu (DropdownMenu in panel header or page chrome). Hidden state persists into saved view's `state_json` (additive, opaque). | §1 panel-id registry, §2 state_json layout shape, §4 DropdownMenu pattern (mirrors `DensityToggle` / `SavedViewMenu`) |
| LAYO-02 | 1D drag-reorder of panels within columns (single-column reorder; no cross-column movement). Persists into saved view's `state_json`. | §3 native HTML5 dnd pattern + keyboard fallback, §2 state_json layout shape |
| LAYO-03 | Split-pane resize via `react-resizable-panels@4.11.0` on `/sessions/compare` and per-route shells where useful. Drag handle + double-click to reset. | §1 react-resizable-panels v4 API (`Group` / `Panel` / `Separator` + `defaultLayout` + `onLayoutChanged` + `disableDoubleClick`), §6 split-pane perf budget |
| LAYO-04 | Reset-to-default affordance on every layout-customizable surface — "Reset layout" button in DropdownMenu clears `state_json` layout overrides. Prevents corrupt-state lock-in. | §7 reset-to-default mechanics (partial-update of `state_json.layout`) |

---

## Summary

Phase 28 is the v1.3 milestone closer. It adds **one** new runtime dependency (`react-resizable-panels@4.11.0` — verified on the npm registry, current at 4.11.1 published 2026-05-02, peer-depends `react ^18 || ^19`, slopcheck `[OK]`, source at `github.com/bvaughn/react-resizable-panels`) and three new behaviors that all piggyback on the now-stable Phase 25 saved-views pipeline:

1. **Show/hide** is a Radix `DropdownMenu` in each panel's `CardHeader` whose state lives in the URL via an APPEND-ONLY `validateSearch` extension (`hidden_panels?: string` CSV — same shape vocabulary as Phase 26's `compare_panels`), then round-trips into `state_json` when the user saves a view.
2. **1D drag-reorder** is a native HTML5 drag-and-drop handler attached to each panel's drag-grip (`<Card>` header chrome), constrained to a single column, with a keyboard fallback (Space-to-grab + arrow-keys + Enter-to-drop + aria-live region). Persists as `panel_order?: string` CSV.
3. **Split-pane resize** uses react-resizable-panels v4's `Group` / `Panel` / `Separator` triad on `/sessions/compare` (left/right SessionCompareSide split) and is opt-in for any other route that wants it (none in scope for v1). Persists as `split_sizes?: string` CSV of percentages.

The single biggest pitfall is that v4 renamed its public API (`PanelGroup` → `Group`, `PanelResizeHandle` → `Separator`, `direction` → `orientation`) and removed `autoSaveId` in favor of a `useDefaultLayout` hook — training-data examples and shadcn-ui templates still reference the v0/v1/v2 vocabulary. **Plans MUST cite the v4 API by name**, not the legacy names, to avoid silent failures.

**Primary recommendation:** Three additive parallel-safe waves (panel registry + LAYO-01 show/hide → LAYO-02 reorder → LAYO-03 split-pane), each gated by URL contract pytest + axe + visual capture + ResponsiveContainer count delta = 0. LAYO-04 reset is a one-line `navigate({ search: stripLayoutKeys(current) })` action wired into the show/hide DropdownMenu's footer — ships in Wave 1 alongside LAYO-01.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Panel show/hide UX | Browser / Client (React) | — | DropdownMenu trigger in `CardHeader`; toggles URL search param via TanStack `useNavigate` |
| 1D drag-reorder UX | Browser / Client (React) | — | Native HTML5 dnd events on a grip handle; reorder result written to URL search param |
| Split-pane resize UX | Browser / Client (React) | — | `react-resizable-panels` Group manages flex layout via ResizeObserver-driven sizing |
| Hidden-panels state persistence | URL search param (TanStack `validateSearch`) | Saved-view `state_json` (server) | URL is single source of truth (Phase 25 invariant); save-view flow captures URL into `state_json` blob; reload re-hydrates URL from blob — same flow as Phase 26 `compare_panels` |
| Panel order persistence | URL search param | Saved-view `state_json` | Same as above |
| Split-pane sizes persistence | URL search param | Saved-view `state_json` | Same as above. **NOT** localStorage (Phase 27 lock — every per-panel state moved off localStorage into URL) |
| Reset-to-default | Browser / Client (React) | URL navigation | `navigate({ search: stripLayoutKeys(current) })` — drops the three new URL params; SavedViewMenu Edit-or-Fork flow handles save-side reset |
| Backend involvement | — | None | `state_json` is opaque to backend (Phase 25 Pitfall 6 lock). Zero schema changes, zero new endpoints. |

---

## Standard Stack

### Core (single new runtime dep)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-resizable-panels` | `^4.11.0` (latest `4.11.1` published 2026-05-02) [VERIFIED: npm view react-resizable-panels version] | Horizontal split-pane resize with controlled persistence + double-click reset (LAYO-03). | The only well-maintained React 19-compatible split-pane lib; `bvaughn` (React core team alumnus) is the maintainer; the v4 README documents `Group` / `Panel` / `Separator` as the public API and `useDefaultLayout` for storage integration [CITED: github.com/bvaughn/react-resizable-panels/README.md]. Phase 28 ships `4.11.0` per REQUIREMENTS.md constraint line 12. |

**Installation (frontend dir):**
```bash
cd frontend && pnpm add react-resizable-panels@4.11.0
```

**Version verification (run before install in Wave 1):**
```bash
npm view react-resizable-panels@4.11.0 version      # → "4.11.0"
npm view react-resizable-panels@4.11.0 dependencies # → "{}"  (zero runtime deps)
npm view react-resizable-panels peerDependencies    # → { react: '^18.0.0 || ^19.0.0', 'react-dom': '^18.0.0 || ^19.0.0' }
npm view react-resizable-panels@4.11.0 scripts.postinstall  # → empty (no postinstall script)
```

### Supporting (already installed — re-used)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@radix-ui/react-dropdown-menu` | `^2.1.16` | Panel header show/hide menu (LAYO-01) + Reset Layout footer (LAYO-04). | Every panel that participates in show/hide mounts a `DropdownMenu` in its `CardHeader` trailing slot. Pattern parity with `DensityToggle.tsx:43-77` and `SavedViewMenu.tsx`. |
| `lucide-react` | `^1.11.0` | Icons for the menu (Eye / EyeOff / GripVertical / RotateCcw). | Already vendored; no new icon dep. |
| `@tanstack/react-router` | `^1.168.24` | URL-as-state-of-truth via `validateSearch` + `useNavigate`. | Three new optional search params per route (`hidden_panels` + `panel_order` + `split_sizes`) — all CSV strings, all default `undefined`. |
| Internal | — | `frontend/src/components/savedviews/SaveViewDialog.tsx` already serializes the entire validated `useRouterState().location.search` blob into `state_json`. Layout fields auto-piggyback. | Zero changes to the save/load flow. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-resizable-panels@4.11.0` (LAYO-03) | `react-split-pane`, `allotment`, hand-rolled flexbox-with-mouse-handler | `react-split-pane` is unmaintained (last release 2019); `allotment` has 100k weekly downloads but is heavier (~30kB) and not React 19-tested; hand-rolled handlers re-implement ResizeObserver, keyboard a11y, and double-click reset — Don't-Hand-Roll territory. REQUIREMENTS.md milestone constraint line 12 locks this dep. |
| Native HTML5 dnd (LAYO-02) | `dnd-kit`, `react-beautiful-dnd` | `dnd-kit` would exceed the REQUIREMENTS.md milestone dep budget (line 12: "Stack additions limited to: `@radix-ui/react-popover`, `@radix-ui/react-dropdown-menu`, `react-resizable-panels`"). `react-beautiful-dnd` is on indefinite hiatus and has known React 19 issues. Out of Scope explicitly forbids both ("dnd-kit for layout drag … HTML5 drag API + react-resizable-panels suffice"). Native dnd is feasible for 1D-single-column reorder (the constrained case). |
| URL state for layout (Phase 28 recommendation) | localStorage-per-route | localStorage was Phase 27's escape hatch but Plan 27-05 + Plan 27-06 explicitly REPLACED `RangeToggle persistKey` localStorage with URL state — going backward to localStorage for layout would break the established invariant + the save-view round-trip would lose the data (Phase 25 Pitfall 6). |

---

## Package Legitimacy Audit

Run before Wave 1 install:

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `react-resizable-panels@4.11.0` | npm | First release 2022; v4 series active 2025-2026 | ~1.4M weekly | github.com/bvaughn/react-resizable-panels [VERIFIED: `npm view react-resizable-panels repository.url`] | [OK] [VERIFIED: `slopcheck install react-resizable-panels` returned `[OK] react-resizable-panels (npm)`, scan 1/1 OK, 2026-05-16] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

**Postinstall script check:**
```bash
npm view react-resizable-panels@4.11.0 scripts.postinstall
# → empty
```
No postinstall script. Safe to install.

**Slopcheck version notes:** slopcheck CLI does NOT accept `--json` (saw `error: unrecognized arguments: --json` at version 0.x), so the audit row above is human-validated against the human-readable `[OK]` token slopcheck emitted. If future plans need machine-readable output, fall back to manual `npm view` + GitHub source-repo verification (both confirmed above).

---

## Architecture Patterns

### System Architecture Diagram

```
                           ┌─────────────────────────────────────────┐
                           │   URL  (TanStack `validateSearch`)      │
                           │   ?hidden_panels=token-usage,attention  │
                           │   &panel_order=cmd-grid:agent-fanout,…  │
                           │   &split_sizes=compare:55,45            │
                           └────────────────────┬────────────────────┘
                                                │
                                                │  useSearch() / useRouterState()
                                                ▼
       ┌────────────────────────────────────────────────────────────────────────┐
       │   Route Component (e.g. routes/index.tsx)                              │
       │   - reads search.hidden_panels → Set<panelId>                          │
       │   - reads search.panel_order   → Record<columnId, panelId[]>          │
       │   - reads search.split_sizes   → Record<groupId, number[]>            │
       └─────────────┬──────────────────┬──────────────────┬───────────────────┘
                     │                  │                  │
                     ▼                  ▼                  ▼
       ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
       │ Layout filter    │  │ Layout sorter    │  │ Layout sizer     │
       │ - skips hidden   │  │ - reorders within│  │ - applies split  │
       │   panels (LAYO-01)│  │   column (LAYO-02)│  │   sizes (LAYO-03)│
       └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
                │                     │                     │
                └─────────┬───────────┴─────────────────────┘
                          ▼
            ┌─────────────────────────────────────────┐
            │ Rendered panel tree                     │
            │ (PanelCard / BoundedPanelCard children) │
            │ - each panel carries `panel-id` prop    │
            │ - panel header hosts:                   │
            │   • Show/Hide DropdownMenu (LAYO-01)    │
            │   • Reset Layout footer item (LAYO-04)  │
            │   • Drag grip (LAYO-02)                 │
            └─────────────┬───────────────────────────┘
                          │  user action (toggle/drag/resize)
                          ▼
            ┌─────────────────────────────────────────┐
            │ navigate({ search: { ...nextLayout } }) │
            │ (TanStack router URL write — replace:true)│
            └─────────────┬───────────────────────────┘
                          │  URL changes → validateSearch re-runs → re-render
                          │  (no remount: ResponsiveContainer + chart trees stable)
                          ▼
            ┌─────────────────────────────────────────┐
            │ Saved-view chrome (unchanged from P25)  │
            │ - UnsavedPip lights up                  │
            │ - SaveViewDialog captures URL search    │
            │   into state_json verbatim              │
            └─────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Phase 28 role | New / Modified |
|-----------|---------------|----------------|
| `frontend/src/lib/layout/panelRegistry.ts` | Const map: `route → panelId → { columnId, defaultOrder, defaultVisible }`. Single source of truth for valid panel ids per route. | NEW |
| `frontend/src/lib/searchSchemas.ts` | Add `asHiddenPanels` + `asPanelOrder` + `asSplitSizes` validators (mirror `asComparePanels` shape — CSV strings). | MODIFIED (append-only) |
| `frontend/src/lib/layout/useLayoutState.ts` | Hook: reads URL search → returns `{ isHidden(id) → bool, orderedPanels(columnId) → string[], splitSizes(groupId) → number[], setHidden / setOrder / setSplit / reset }`. | NEW |
| `frontend/src/components/ui/PanelHeaderMenu.tsx` | Radix DropdownMenu trigger that mounts in `CardHeader` trailing slot. Items: "Hide this panel", "Reset layout". | NEW |
| `frontend/src/components/ui/DraggablePanelWrap.tsx` | Wrapper that adds a `<button>` drag-grip + HTML5 dnd handlers + keyboard fallback. Mounts an `aria-live="polite"` region for screen reader feedback. | NEW |
| `frontend/src/components/ui/ResizablePanelGroup.tsx` | Thin wrapper around `Group` / `Panel` / `Separator` from react-resizable-panels. Reads/writes `split_sizes` URL param via the same `useLayoutState` hook. | NEW |
| `frontend/src/components/ui/PanelCard.tsx` | Add optional `panelId?: string` prop. When present, mount `PanelHeaderMenu` in the trailing slot AND emit `data-panel-id` attribute. | MODIFIED (append-only) |
| `frontend/src/components/panels/SessionCompareView.tsx` | Wrap the two-column CompareBody in `<ResizablePanelGroup groupId="compare" defaultSizes={[50, 50]}>`. | MODIFIED |
| `frontend/src/routes/{index,cost,skills,alerts,activity}.tsx` | Read `panel_order` + `hidden_panels` via `useLayoutState`, filter+sort `.cmc-card-grid` children before render. | MODIFIED |
| `docs/url-contract.md` | Append "Phase 28 effects on URL contract" section enumerating the three new params on each route. | MODIFIED (append-only) |
| `docs/testid-registry.md` | Add dynamic `panel-header-menu-{panelId}`, `panel-hide-{panelId}`, `panel-drag-grip-{panelId}`, `panel-reset-layout-{route}`, `resize-handle-{groupId}` + exact testids. | MODIFIED (append-only) |
| `backend/tests/test_url_contract.py` | No change — the URL contract pytest only verifies route-file ↔ doc consistency; per-route search-shape additions are documented in `url-contract.md` and not asserted by the test. | UNCHANGED |

### Pattern 1 — Panel registry (single source of truth)

**What:** A const map enumerating valid panel ids per route, their column id, and their default-visible state.

**When to use:** Anywhere code needs to know whether a panel id is legal for a route (validateSearch filtering of stale URL params, reset-to-default, defaults seeding).

**Example:**
```ts
// frontend/src/lib/layout/panelRegistry.ts
// Single source of truth for layout-customizable panels per route. Adding a
// new panel to a route means adding its id here. URL params that reference
// unknown ids are silently dropped by validateSearch (Phase 25 Pitfall 6
// invariant — saved views are best-effort hydration).

export interface PanelDescriptor {
  panelId: string
  columnId: string    // single-column reorder uses columnId='main' for routes with one grid
  label: string       // shown in "Show hidden panels" submenu
  defaultVisible: boolean
}

export const PANEL_REGISTRY: Record<string, PanelDescriptor[]> = {
  '/': [
    { panelId: 'system-health',    columnId: 'top',  label: 'System pressure',    defaultVisible: true },
    { panelId: 'kpi-row',          columnId: 'top',  label: 'KPI row',            defaultVisible: true },
    { panelId: 'attention-bar',    columnId: 'top',  label: 'Attention',          defaultVisible: true },
    { panelId: 'live-sessions',    columnId: 'top',  label: 'Live sessions',      defaultVisible: true },
    { panelId: 'token-usage',      columnId: 'main', label: 'Token usage',        defaultVisible: true },
    { panelId: 'cache-efficiency', columnId: 'main', label: 'Cache efficiency',   defaultVisible: true },
    // … (one entry per panel rendered by routes/index.tsx)
  ],
  '/cost': [
    { panelId: 'cost-forecast',    columnId: 'main', label: 'Cost forecast',       defaultVisible: true },
    { panelId: 'cost-by-project',  columnId: 'main', label: 'Cost by project',     defaultVisible: true },
  ],
  // … one block per layout-customizable route
}

export function isValidPanelId(route: string, panelId: string): boolean {
  return PANEL_REGISTRY[route]?.some((p) => p.panelId === panelId) ?? false
}
```

[ASSUMED — exact panel-id list is the planner's call; this example uses
slugified component names matching the cmc-* CSS convention. The planner
should walk every route file's render JSX during Wave 1 Plan 01 and emit
the canonical list. Each id MUST be lowercase alphanumeric plus `_`/`-`
to match the `asComparePanels` regex (`/^[a-z0-9_-]+(?:,[a-z0-9_-]+)*$/`)
which Phase 28 reuses by lifting the regex into a shared CSV validator.]

### Pattern 2 — APPEND-ONLY validateSearch extension

**What:** Three new optional fields on every layout-customizable route — `hidden_panels?`, `panel_order?`, `split_sizes?` — all CSV strings, all default `undefined`.

**When to use:** Every Phase 28 route plan must extend its `validateSearch` exactly once.

**Example:**
```ts
// frontend/src/lib/searchSchemas.ts — append-only

// Phase 28 / LAYO-01. Same CSV vocabulary as `asComparePanels` (lowercase
// alphanumeric + `_`/`-` ids joined by `,`). Empty string → undefined.
const CSV_ID_RE = /^[a-z0-9_-]+(?:,[a-z0-9_-]+)*$/

export function asHiddenPanels(v: unknown): string | undefined {
  if (typeof v !== 'string' || v === '') return undefined
  return CSV_ID_RE.test(v) ? v : undefined
}

// Phase 28 / LAYO-02. CSV of `<columnId>:<panelId1>,<panelId2>` groups,
// joined by `;`. e.g. `main:token-usage,cache-efficiency;top:kpi-row`.
const PANEL_ORDER_RE =
  /^[a-z0-9_-]+:[a-z0-9_-]+(?:,[a-z0-9_-]+)*(?:;[a-z0-9_-]+:[a-z0-9_-]+(?:,[a-z0-9_-]+)*)*$/

export function asPanelOrder(v: unknown): string | undefined {
  if (typeof v !== 'string' || v === '') return undefined
  return PANEL_ORDER_RE.test(v) ? v : undefined
}

// Phase 28 / LAYO-03. CSV of `<groupId>:<int1>,<int2>,…` groups
// (percentages 0–100, sum-validated client-side), joined by `;`.
// e.g. `compare:55,45`.
const SPLIT_SIZES_RE =
  /^[a-z0-9_-]+:\d{1,3}(?:,\d{1,3})+(?:;[a-z0-9_-]+:\d{1,3}(?:,\d{1,3})+)*$/

export function asSplitSizes(v: unknown): string | undefined {
  if (typeof v !== 'string' || v === '') return undefined
  return SPLIT_SIZES_RE.test(v) ? v : undefined
}
```

Then each route's `validateSearch` appends three lines:
```ts
// routes/index.tsx — append-only diff
return {
  schemaVersion: coerceSchemaVersion(raw),
  time_from: asTimeToken(raw.time_from),
  time_to: asTimeToken(raw.time_to),
  compare_panels: asComparePanels(raw.compare_panels),
  hidden_panels: asHiddenPanels(raw.hidden_panels),       // NEW
  panel_order: asPanelOrder(raw.panel_order),             // NEW
  split_sizes: asSplitSizes(raw.split_sizes),             // NEW — `/sessions/compare` is the only v1 consumer
}
```

**Invariant:** Default `undefined` — NEVER a per-route fallback (Phase 25 Pitfall 8 + Phase 26 Pitfall 13 lock — defaulting in the validator defeats `DefaultViewLoader`'s bare-URL gate).

### Pattern 3 — react-resizable-panels v4 split-pane

**What:** Wrap a two-column layout in `<Group>` / `<Panel>` / `<Separator>` and persist sizes via `defaultLayout` (read from URL) + `onLayoutChanged` (write to URL on pointer release).

**Why `onLayoutChanged` not `onLayoutChange`:** v4 fires `onLayoutChange` every pointer-move tick — too frequent for URL writes. `onLayoutChanged` fires only on pointer release [CITED: github.com/bvaughn/react-resizable-panels/README.md "For layout changes caused by pointer events, this method is not called until the pointer has been released. This method is recommended when saving layouts to some storage api."].

**Example (for SessionCompareView):**
```tsx
// frontend/src/components/ui/ResizablePanelGroup.tsx — NEW
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useCallback, type ReactNode } from 'react'

interface ResizablePanelGroupProps {
  groupId: string                  // matches the URL `split_sizes` group key
  defaultSizes: number[]           // percentages, must sum to ~100
  orientation?: 'horizontal' | 'vertical'  // v4 prop name; default 'horizontal'
  children: ReactNode[]            // alternating <Panel> children (Separator inserted by this wrapper)
}

// Reads/writes URL `?split_sizes=<groupId>:s1,s2;...` via TanStack navigate.
// Layout state piggybacks on the saved-view state_json round-trip (Phase 25).
export function ResizablePanelGroup({
  groupId,
  defaultSizes,
  orientation = 'horizontal',
  children,
}: ResizablePanelGroupProps) {
  const navigate = useNavigate()
  const search = useRouterState({ select: (s) => s.location.search })

  // Parse split_sizes URL param → number[] for this groupId, or fall back
  // to defaultSizes. Shape error → ignore (defense in depth, Pitfall 6).
  const fromUrl = parseSplitSizes(search.split_sizes as string | undefined, groupId)
  const initial: Layout = fromUrl ?? defaultSizes

  const handleLayoutChanged = useCallback((layout: Layout) => {
    // Round to 1-decimal to keep URL short; serialize all groups (not just this one).
    const nextParam = serializeSplitSizes({
      ...parseAllSplitSizes(search.split_sizes as string | undefined),
      [groupId]: layout.map((n) => Math.round(n)),
    })
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, split_sizes: nextParam }),
      replace: true,
    })
  }, [groupId, navigate, search.split_sizes])

  // Separator is auto-inserted between Panel children. Double-click resets to
  // defaultSize (v4 built-in behavior — see README Separator > disableDoubleClick:
  // when false (default) double-clicking resets the adjacent Panel to defaultSize).
  return (
    <Group
      orientation={orientation}
      defaultLayout={initial}
      onLayoutChanged={handleLayoutChanged}
      className="cmc-resizable-group"
    >
      {children.flatMap((child, i, arr) => {
        const idx = i  // capture for keys
        return i < arr.length - 1
          ? [child, <Separator key={`sep-${groupId}-${idx}`} className="cmc-resizable-separator" />]
          : [child]
      })}
    </Group>
  )
}
```

**Call site (SessionCompareView):**
```tsx
// Wraps the two-column KPI strip + chart + diff table region. Each column
// becomes a <Panel defaultSize={50} minSize={20}>{...sideContent}</Panel>.
return (
  <PanelCard reqId="CMPR-02" title="Session Compare" query={query} bounded
             panelId="session-compare" empty={{...}}>
    {(data) => (
      <ResizablePanelGroup groupId="compare" defaultSizes={[50, 50]}>
        <Panel id="side-a" defaultSize={50} minSize={20}>{renderSide(data.a)}</Panel>
        <Panel id="side-b" defaultSize={50} minSize={20}>{renderSide(data.b)}</Panel>
      </ResizablePanelGroup>
    )}
  </PanelCard>
)
```

### Anti-Patterns to Avoid

- **`useDefaultLayout({ storage: localStorage })`** — Don't use react-resizable-panels' built-in localStorage helper. Layout state MUST flow through URL → saved-view `state_json` for round-trip integrity (Phase 25 Pitfall 6). Use `defaultLayout` + `onLayoutChanged` and bridge to URL manually.
- **`<Group autoSaveId="...">`** — autoSaveId is the v0/v1/v2 prop name. It was REMOVED in v4 and replaced by `useDefaultLayout` (which we're also not using). Anyone copying old code or AI suggestions will write this prop; it will silently no-op.
- **Re-mounting children on every resize** — Don't memoize child trees by key-ing on container size. ResponsiveContainer's ResizeObserver handles re-flow without re-mounting [CITED: github.com/recharts/recharts ResponsiveContainer source]. Children stay stable across drags.
- **Component-level reorder via React state** — Don't store panel order in `useState`. It MUST live in URL (single-source-of-truth invariant). Use `useLayoutState` hook everywhere.
- **`PanelGroup` / `PanelResizeHandle` / `direction` (v0/v1/v2 names)** — These are the legacy names. v4 uses `Group` / `Separator` / `orientation`. shadcn-ui still ships a wrapper that uses old names against v4 internals — known broken [CITED: github.com/shadcn-ui/ui/issues/9136]. Plans must lint-grep for the legacy names and fail.
- **Mutable per-panel localStorage for hide state** — Phase 27 deliberately moved per-panel state OFF localStorage (Plan 27-05 cost-by-project, Plan 27-06 alerts). Phase 28 must NOT re-introduce localStorage as a layout persistence channel.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Split-pane resize | Custom mouse-down handler + ResizeObserver + percentage math + double-click reset | `react-resizable-panels@4.11.0` (`Group` / `Panel` / `Separator`) | Library handles touch + keyboard a11y + WAI-ARIA `role="separator"` + cursor styles + min/max constraints + double-click reset (`disableDoubleClick` controllable). Hand-rolling this in single-user-localhost code is a Phase-19-style time sink. REQUIREMENTS.md milestone constraint approves this dep. |
| Show/hide DropdownMenu | Custom open-state + click-outside detection + portal mount | Radix `DropdownMenu` (already installed) | Phase 24's POLI-12 affordance checklist locks Radix Portal containment + focus management invariants for all overlay primitives. Pattern verbatim from `DensityToggle.tsx:43-77`. |
| URL state read/write | Direct `window.location` manipulation | TanStack `useNavigate({ search: ... })` + `validateSearch` | Phase 25 Pitfall 3 + Phase 26 Pitfall 13 lock — every URL param flows through `validateSearch`. Direct `window.history.pushState` breaks the type contract + bypasses validators. |
| Save into `state_json` | Custom serializer | SaveViewDialog auto-captures `useRouterState().location.search` | Existing flow at `SaveViewDialog.tsx:67` reads the entire validated search blob via `useRouterState({ select: (s) => s.location.search })` and posts it to `/api/views`. Phase 28's three new URL params auto-piggyback — zero change to the dialog. |
| Drag-and-drop list reorder (single-column, no cross-list) | Full library import (`dnd-kit`, `react-beautiful-dnd`) | Native HTML5 `draggable` + `onDragStart` / `onDragOver` / `onDrop` + keyboard fallback | REQUIREMENTS.md Out of Scope explicitly forbids dnd-kit; libraries exceed the dep budget. The native API is quirky but sufficient for the constrained 1D case (no cross-column, no nested drop targets). Library use is justified for general DnD; not for the LAYO-02 constrained shape. Caveat: native HTML5 DnD has NO keyboard support — Phase 28 must implement the keyboard fallback manually (Pattern in §3 below). |

**Key insight:** Phase 28 looks like "build three things" but is actually "configure three thin wrappers around primitives that already exist (Radix DropdownMenu + react-resizable-panels) + write one native dnd handler". Total new component count is ≤6, total new lines should be < 600. The hard part is the panel-registry inventory + the matrix of validateSearch updates across 5–7 routes, not the dnd handler.

---

## Common Pitfalls

### Pitfall 1: react-resizable-panels v4 API name confusion

**What goes wrong:** Plans copy v0/v1/v2 examples (the AI-training-data norm) and write `<PanelGroup direction="horizontal"><PanelResizeHandle/></PanelGroup>`. Code compiles (TypeScript types resolve), but runtime crashes with "PanelGroup is not exported from react-resizable-panels".

**Why it happens:** v4 (released 2025) renamed `PanelGroup` → `Group`, `PanelResizeHandle` → `Separator`, `direction` → `orientation` to align with the ARIA `separator` role. Training data + shadcn-ui templates still reference the v0/v1/v2 vocabulary [CITED: github.com/shadcn-ui/ui/issues/9136].

**How to avoid:**
1. Every Phase 28 plan that imports from `react-resizable-panels` MUST use `import { Group, Panel, Separator } from 'react-resizable-panels'` — NEVER `PanelGroup` or `PanelResizeHandle`.
2. Add a lint-grep step to plan-verification: `! rg -F "PanelGroup\|PanelResizeHandle\|direction=" frontend/src/components/ui/ResizablePanelGroup.tsx` must return exit 1.
3. The `orientation` prop value is `"horizontal"` (default) or `"vertical"` — NOT `"row"` / `"column"`.

**Warning signs:** `pnpm build` fails with "is not exported" error on first run.

### Pitfall 2: APPEND-ONLY validateSearch — three new params must default `undefined`

**What goes wrong:** A planner writes `hidden_panels: asHiddenPanels(raw.hidden_panels) ?? ''` (defaulting to empty string) thinking it's harmless. DefaultViewLoader (Phase 25 Plan 10) reads `Object.keys(search).filter(k => k !== 'schemaVersion').length === 0` to detect "bare URL"; the empty-string default makes the URL look non-bare and the per-route default view stops applying.

**Why it happens:** Phase 26 Pitfall 13 documented this exact failure mode for `time_from` / `time_to`. The same lock applies here. **NO per-route default in the validator.** Default is `undefined`.

**How to avoid:** All three new validators (`asHiddenPanels`, `asPanelOrder`, `asSplitSizes`) return `string | undefined` — never empty string, never a fallback. Tests must include a "bare URL" round-trip case proving `validateSearch({})` returns the three fields as `undefined`.

**Warning signs:** DefaultViewLoader's "apply default when search is empty" gate stops firing in Playwright.

### Pitfall 3: SaveViewDialog already captures the URL — don't duplicate

**What goes wrong:** A Phase 28 plan adds an explicit "save layout" affordance that POSTs `state_json: { layout: {...} }` separately from `SaveViewDialog`. Now two write paths exist for the same data; they diverge.

**Why it happens:** Designers think "layout state is conceptually different from filter state" and want a separate save flow.

**How to avoid:** The URL is the contract. `SaveViewDialog.tsx:67-75` already reads `useRouterState({ select: s => s.location.search })` and POSTs the entire validated blob. Phase 28's three new URL params get serialized into `state_json` automatically with **zero changes** to the dialog. Verify in a Playwright round-trip test: (1) hide a panel, (2) open SaveViewDialog, (3) save view "Compact home", (4) navigate away, (5) load the view via SavedViewMenu → assert URL `?hidden_panels=...` re-appears and the panel re-hides.

**Warning signs:** A diff that touches `SaveViewDialog.tsx` or `lib/queries.ts` `useCreateView`.

### Pitfall 4: Native HTML5 dnd has zero keyboard support

**What goes wrong:** Plans implement `draggable={true}` + `onDragStart` + `onDragOver` + `onDrop` for LAYO-02. Mouse works fine. Keyboard users (Tab to panel, then…?) have no way to reorder. axe-core silently passes (it doesn't audit dnd behavior). User a11y is broken.

**Why it happens:** Native HTML5 DnD spec has no keyboard equivalent. Mouse-only by design [CITED: react-spectrum.adobe.com/blog/drag-and-drop "it's not clear how keyboard-only assistive technology users can perform this simple task"].

**How to avoid:** Each draggable panel MUST also expose a keyboard interface:
1. The drag-grip element is a `<button data-testid="panel-drag-grip-{id}">` with `aria-label="Reorder {panel.label}"`.
2. Focus on the grip + Space/Enter → enter "grab mode" (button's `aria-pressed="true"`).
3. In grab mode: ArrowUp / ArrowDown moves the panel one slot within its column. Enter or Space drops. Esc cancels.
4. An `aria-live="polite"` region announces "{panel.label} grabbed. Position 3 of 5." on each move.
5. axe-core has no rule for this — verification must be a Playwright keyboard-only spec asserting reorder reproducibility.

**Reference pattern:** Dragon Drop ([github.com/schne324/dragon-drop](https://github.com/schne324/dragon-drop)) is the canonical accessible-list-reorder pattern; Phase 28 implements a subset (single column, no cross-list moves) inline without taking the dep.

**Warning signs:** No keyboard spec in `v13-layout.spec.ts`. Visual checkpoint silent on a11y for drag.

### Pitfall 5: ResponsiveContainer count drift

**What goes wrong:** A Phase 28 plan accidentally introduces a new chart (e.g., a "layout preview" mini-chart) or duplicates a `<ResponsiveContainer>` inside the `ResizablePanelGroup` wrapper. The Phase 24 lock (`grep -E "^[[:space:]]*<ResponsiveContainer" frontend/src/components/panels/*.tsx | wc -l` = 8) breaks.

**Why it happens:** The wrapper might (incorrectly) wrap each child in its own ResponsiveContainer.

**How to avoid:**
1. `ResizablePanelGroup` is a flex wrapper — it does NOT introduce ResponsiveContainer. Children are rendered as-is.
2. Add a grep gate to Phase 28 close: count MUST equal Phase 27 close baseline of 8.
3. Verified Phase 27 baseline 2026-05-16: `/usr/bin/grep -rE "^[[:space:]]*<ResponsiveContainer" frontend/src/components/panels/` → 8 [CITED: 27-VISUAL-CHECK.md line 60].

**Warning signs:** `grep -rE "^[[:space:]]*<ResponsiveContainer" frontend/src/components/panels/*.tsx | wc -l` returns anything other than 8 at phase close.

### Pitfall 6: Split-pane re-mounts charts on drag (perceived perf regression)

**What goes wrong:** During a split-pane resize drag, the chart visibly flickers — operator perceives "the chart is re-rendering on every pixel of drag".

**Why it happens:** Three plausible root causes:
1. `ResizablePanelGroup` re-renders on every `onLayoutChange` tick (the per-pixel callback) — and a non-memoized child tree re-renders too.
2. A parent component re-creates the child memo key on every drag tick.
3. ResponsiveContainer is correctly re-measuring (this is fine — the SVG tree is stable; ResponsiveContainer just updates width/height attrs on the existing `<svg>` element).

**How to avoid:**
1. Use `onLayoutChanged` (release-only) for URL writes; do NOT subscribe to `onLayoutChange` (per-tick) anywhere except a debug logger.
2. The data flowing into charts MUST be memoized: useMemo on the query's `data` derivation already runs in panels; verify no Phase 28 wrapper introduces a fresh array literal on every render.
3. Verify "zero chart re-mounts during drag" via a Playwright probe: mount-counter (Phase 24's DOM-identity probe pattern from 27-VISUAL-CHECK.md line 56) on the chart `<svg>` element across 10 drag ticks — element identity preserved.
4. `react-resizable-panels` uses CSS flex-basis sizing (not React state-driven width prop), so the chart parent's `<div>` reflows via CSS only — no React re-render cascade [VERIFIED: github.com/bvaughn/react-resizable-panels README "data-panel" div is a CSS flex child; resize is via CSS flex-basis].
5. ResponsiveContainer uses ResizeObserver internally — re-fires on container resize without re-mounting the chart tree [CITED: recharts ResponsiveContainer source].

**Warning signs:** Visual checkpoint shows chart flicker during drag; mount-counter probe shows DOM identity changes.

### Pitfall 7: Panel registry drift — URL references a deleted panel

**What goes wrong:** A future phase deletes a panel from a route. Existing saved views still reference its id in `state_json.hidden_panels`. On load, the panel id resolves to "not found" but a stale entry now silently lives in the URL forever.

**Why it happens:** `state_json` is opaque to the backend; only the client's `validateSearch` filters.

**How to avoid:**
1. `useLayoutState` ignores unknown panel ids (Set-membership test against `PANEL_REGISTRY[route]`).
2. The "Show hidden panels" submenu only lists ids registered for the current route — unknown ids are not user-visible.
3. The reset-layout footer is the explicit escape hatch — operator runs it and the URL params are stripped.
4. Do NOT garbage-collect stale ids on URL read; that creates write-amplification on every render (Phase 25 Pitfall 7).

**Warning signs:** A saved view loads but a panel "stays hidden" with no way to surface it — user must reset layout.

### Pitfall 8: `state_json.layout` shape vs flat URL params

**What goes wrong:** A planner reads "state_json layout shape" in the requirements and creates a nested `state_json.layout = { hidden: [...], order: {...}, sizes: {...} }` object — then has to serialize/deserialize between that nested shape and the URL's flat CSV params on every read/write.

**Why it happens:** "Layout sub-object" sounds like a clean API.

**How to avoid:** `state_json` is the EXACT shape of the URL search after `validateSearch`. No nested transformation. `state_json.hidden_panels` is the same flat CSV string as `?hidden_panels=...`. Saving captures `useRouterState({ select: s => s.location.search })` verbatim; loading does `navigate({ search: state_json })`. This is what Phase 26 did with `compare_panels` and what Phase 27 did for time-anchored URL state. **No new abstraction layer.**

**Warning signs:** A plan introduces `serializeLayoutToStateJson()` or `parseLayoutFromStateJson()` helpers — DELETE them and use the flat URL shape directly.

### Pitfall 9: Panel-id collision with future panels

**What goes wrong:** Phase 28 picks `panelId="token-usage"`. A future phase renames `TokenUsageCard.tsx` to `TokenSpendCard.tsx` and changes the id to `token-spend`. Existing saved views still reference `token-usage` — soft-broken.

**Why it happens:** Panel ids are user-state — renaming them silently breaks deep links.

**How to avoid:**
1. Document the panel-id locked-vocabulary invariant in `docs/url-contract.md` Phase 28 section.
2. Panel ids are append-only — a panel can be removed (registry entry deleted) but its id can never be repurposed.
3. Add the locked invariant to REQUIREMENTS.md's "Locked v1.3 invariants" list: "Panel ids are append-only — once registered, they cannot be renamed or repurposed."

**Warning signs:** A code-review diff that renames a panel id.

### Pitfall 10: Visual checkpoint matrix grows by 6–12 PNGs

**What goes wrong:** Phase 28 close ships visual capture for "hidden panel" + "reordered panels" + "split-pane custom size" states — but Phase 27 already has 120 PNGs; the matrix becomes unwieldy.

**Why it happens:** Every new behavior wants its own visual record.

**How to avoid:** Cap Phase 28's visual additions at 3 surfaces × 3 densities × 2 themes = 18 PNGs MAX:
- `layout-default` — bare-URL on `/` (no layout overrides) — baseline.
- `layout-customized` — `/?hidden_panels=token-usage&panel_order=main:cache-efficiency,session-outcomes` — proves both work in concert.
- `compare-resized` — `/sessions/compare?a=...&b=...&split_sizes=compare:70,30` — proves split-pane URL round-trip.

Combined v1.3 visual capture surface at Phase 28 close: ≤138 PNGs (120 + 18).

**Warning signs:** A Plan 28-NN proposes more than 18 new PNG cells.

### Pitfall 11: cmc-card-grid `auto-rows: 1fr` defeats single-column reorder

**What goes wrong:** Plan implements panel-order CSS via flex order property, but `.cmc-card-grid` (styles.css:662-667) uses `display: grid` with `auto-rows: 1fr` and `auto-fit` columns — the `order` CSS property works inside a grid container but interacts with row-flow in surprising ways.

**Why it happens:** Grid auto-flow + `order` can cause holes when an item with `order: 3` is "moved" past an item with `order: 1` in a row.

**How to avoid:** Use **render order** (re-sort children before render) — NOT CSS `order` property. The grid is auto-fit so children fill in DOM order; rearranging the JSX children re-flows correctly. `useLayoutState.orderedPanels(columnId)` returns the panel-id array in render order; the route component spreads them into the grid.

**Warning signs:** Visual capture shows grid holes between reordered cards.

### Pitfall 12: BoundedPanelCard's `contain: layout paint` interaction with drag-grip

**What goes wrong:** Drag operations need access to coordinates outside the panel's bounding box (ghost image, drop indicator). `.cmc-card--bounded { contain: layout paint }` (styles.css:2263) restricts paint scope. The drag visual feedback is clipped.

**Why it happens:** CSS containment is opt-in performance optimization for bounded panels — but it has UX side effects.

**How to avoid:**
1. Use native HTML5 dnd's built-in ghost image (the browser composites it OUTSIDE the page's layout, so containment doesn't affect it).
2. The drop indicator is a thin line `<hr>` rendered as a SIBLING of the card grid (NOT inside any bounded card). The grid itself is not bounded (only individual cards are).
3. Verified: `.cmc-page--bounded > .cmc-card-grid` (styles.css:2245-2249) does NOT have `contain` set — the grid container is free for absolutely-positioned drop indicators.

**Warning signs:** Drop indicator invisible during drag; ghost image cropped.

---

## Runtime State Inventory

Phase 28 is **NOT** a rename / refactor / migration. No existing user data carries a name that changes.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — phase introduces new URL params + new `state_json` keys (additive). Existing saved views have no `hidden_panels` / `panel_order` / `split_sizes` keys; their absence is interpreted as defaults (all visible, registry order, 50/50 split). No data migration. | none |
| Live service config | **None** — no external services (Datadog tags, n8n workflows, Tailscale ACLs) reference panel ids. | none |
| OS-registered state | **None** — no Windows Task Scheduler / launchd / systemd entries. macOS-only single-user localhost per REQUIREMENTS.md line 14. | none |
| Secrets / env vars | **None** — Phase 28 changes no env-var-driven behavior. | none |
| Build artifacts / installed packages | The new `react-resizable-panels@4.11.0` install will appear in `frontend/pnpm-lock.yaml`. No stale artifacts to purge. | run `cd frontend && pnpm install` after `pnpm add react-resizable-panels@4.11.0` |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22.x (frontend tooling) | All Phase 28 frontend work | ✓ (verified by Phases 24-27 having shipped) | — | — |
| pnpm 10.26.2 | `pnpm add react-resizable-panels@4.11.0` | ✓ | `^10.26.2` per `frontend/package.json:6` | — |
| npm registry access | `npm view` + `pnpm add` | ✓ (verified `npm view react-resizable-panels version` returned `4.11.1` 2026-05-16) | — | — |
| Playwright 1.59.1 | e2e specs for LAYO-01..04 user journeys | ✓ (already vendored in `frontend/devDependencies`) | `^1.59.1` | — |
| @axe-core/playwright 4.11.3 | a11y gate on new chrome | ✓ | `^4.11.3` | — |
| react-resizable-panels 4.11.0 | LAYO-03 split-pane | ✗ (to be installed in Wave 3 Plan 03-01) | — | none — no fallback; library is the requirement |

**Missing dependencies with no fallback:** react-resizable-panels (intended — Phase 28's primary install)
**Missing dependencies with fallback:** none

---

## Validation Architecture

Per `.planning/config.json` — `workflow.nyquist_validation` is not set, treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | pytest (Python 3.12+, uv-managed) |
| Frontend unit framework | vitest 4.1.5 + happy-dom + @testing-library/react |
| Frontend e2e framework | Playwright 1.59.1 (config: `frontend/playwright.config.ts`) |
| a11y | @axe-core/playwright 4.11.3 (matrix in `frontend/tests/v13-a11y.spec.ts`) |
| Visual | Playwright screenshots into `.planning/phases/28-layout-customization/visual-check/` |
| Quick run command | `cd frontend && pnpm test --run` (vitest, ~6 sec on a clean diff) |
| Frontend e2e | `cd frontend && pnpm test:e2e v13-layout.spec.ts` (NEW spec for Phase 28) |
| Full suite command | `cd backend && uv run pytest && cd ../frontend && pnpm test --run && pnpm test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAYO-01 | Hide panel via header DropdownMenu, persist into saved view, reload re-hides | e2e (Playwright) | `pnpm test:e2e v13-layout.spec.ts -g "hide and persist"` | ❌ Wave 0 — new spec |
| LAYO-01 | URL `?hidden_panels=token-usage` filters TokenUsageCard from render | unit (vitest) | `pnpm test src/lib/layout/__tests__/useLayoutState.test.ts` | ❌ Wave 0 — new file |
| LAYO-01 | `asHiddenPanels` validator returns `undefined` for bare URL (Pitfall 2) | unit (vitest) | `pnpm test src/lib/__tests__/searchSchemas.test.ts -t "asHiddenPanels"` | ❌ Wave 0 — new file (extend existing) |
| LAYO-02 | Mouse drag a panel within column, panel order updates URL, re-render reflects new order | e2e (Playwright) | `pnpm test:e2e v13-layout.spec.ts -g "reorder via drag"` | ❌ Wave 0 |
| LAYO-02 | Keyboard reorder: Tab to grip, Space, ArrowDown, Enter → panel moves down one slot | e2e (Playwright) | `pnpm test:e2e v13-layout.spec.ts -g "reorder via keyboard"` | ❌ Wave 0 |
| LAYO-02 | `asPanelOrder` accepts `main:p1,p2;top:p3` and rejects malformed input | unit (vitest) | `pnpm test src/lib/__tests__/searchSchemas.test.ts -t "asPanelOrder"` | ❌ Wave 0 |
| LAYO-03 | Drag the Separator on `/sessions/compare`, URL `?split_sizes=compare:70,30` appears, refresh preserves | e2e (Playwright) | `pnpm test:e2e v13-layout.spec.ts -g "split-pane resize persists"` | ❌ Wave 0 |
| LAYO-03 | Double-click Separator → sizes return to default 50/50 + URL param dropped | e2e (Playwright) | `pnpm test:e2e v13-layout.spec.ts -g "double-click reset"` | ❌ Wave 0 |
| LAYO-03 | ResponsiveContainer count = 8 after Phase 28 (no chart re-mount during drag) | shell + e2e probe | `grep -rE "^[[:space:]]*<ResponsiveContainer" frontend/src/components/panels/*.tsx \| wc -l` + Playwright DOM-identity probe | ❌ Wave 0 (probe new) |
| LAYO-04 | "Reset layout" footer item clears `?hidden_panels`, `?panel_order`, `?split_sizes` from URL | e2e (Playwright) | `pnpm test:e2e v13-layout.spec.ts -g "reset layout"` | ❌ Wave 0 |
| LAYO-04 | Reset does NOT clear `?time_from`, `?time_to`, `?compare_panels`, `?range` | unit (vitest) | `pnpm test src/lib/layout/__tests__/useLayoutState.test.ts -t "reset preserves non-layout params"` | ❌ Wave 0 |
| URL contract preservation | All 7 in-scope routes still resolve via `tests/test_url_contract.py` | pytest | `cd backend && uv run pytest tests/test_url_contract.py -v` | ✅ exists (Phase 24) — extend `docs/url-contract.md` so it stays in sync |
| Round-trip saved view | Save layout state into saved view, navigate away, load → URL params re-appear | e2e (Playwright) | `pnpm test:e2e v13-saved-views.spec.ts -g "layout state round-trips"` | ✅ exists (Phase 25) — extend |
| Visual matrix | 3 surfaces × 3 densities × 2 themes = 18 PNGs at phase close | Playwright | `pnpm test:e2e v13-visual-capture.spec.ts` (extend) | ✅ exists — extend |
| a11y | New chrome (PanelHeaderMenu, drag grip, Separator) passes axe-core on `/`, `/cost`, `/sessions/compare` | Playwright + axe | `pnpm test:e2e v13-a11y.spec.ts` (extend) | ✅ exists — extend |

### Sampling Rate

- **Per task commit:** `cd frontend && pnpm test --run` (vitest, fastest gate; ~6 sec)
- **Per wave merge:** `pnpm test --run && pnpm test:e2e v13-layout.spec.ts v13-saved-views.spec.ts` (~3 min)
- **Phase gate:** full suite green + visual checkpoint operator-signed + URL contract pytest 2/2 + axe ≥27 PASS + ResponsiveContainer count = 8

### Wave 0 Gaps

- [ ] `frontend/src/lib/layout/__tests__/useLayoutState.test.ts` — covers LAYO-01, LAYO-02, LAYO-04
- [ ] `frontend/src/lib/__tests__/searchSchemas.test.ts` — extend with `asHiddenPanels` / `asPanelOrder` / `asSplitSizes` cases (existing file)
- [ ] `frontend/src/components/ui/__tests__/PanelHeaderMenu.test.tsx` — covers LAYO-01 UI
- [ ] `frontend/src/components/ui/__tests__/DraggablePanelWrap.test.tsx` — covers LAYO-02 mouse + keyboard
- [ ] `frontend/src/components/ui/__tests__/ResizablePanelGroup.test.tsx` — covers LAYO-03 URL round-trip
- [ ] `frontend/tests/v13-layout.spec.ts` — NEW Playwright spec covering all 4 LAYO-* user journeys
- [ ] Extend `frontend/tests/v13-saved-views.spec.ts` — add "save layout into view, reload, layout restored"
- [ ] Extend `frontend/tests/v13-a11y.spec.ts` — axe scan with `?hidden_panels=...` URL + drag-grip a11y
- [ ] Extend `frontend/tests/v13-visual-capture.spec.ts` — 18 NEW PNG cells
- [ ] Extend `docs/url-contract.md` — Phase 28 effects section
- [ ] Extend `docs/testid-registry.md` — Phase 28 testids

---

## Security Domain

`security_enforcement` is not configured explicitly; default is **enabled**. Phase 28 has minimal security surface (no auth, no data ingest, no new endpoints).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | macOS-only localhost; no auth in Mission Control v1.3 |
| V3 Session Management | no | no sessions |
| V4 Access Control | no | single-user local |
| V5 Input Validation | yes | `validateSearch` is the gatekeeper. New CSV validators (`asHiddenPanels` / `asPanelOrder` / `asSplitSizes`) use anchored regex (`/^…$/`) — malformed input drops to `undefined` (no injection vector). `state_json` is treated as opaque blob server-side. |
| V6 Cryptography | no | no crypto |
| V11 Business Logic | yes | Reset-to-default MUST clear only layout keys — not time / range / compare keys — to prevent silent loss of unrelated filters |

### Known Threat Patterns for v1.3 dashboard

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious URL params crash `validateSearch` | Denial-of-service | Anchored regex validators return `undefined` on shape mismatch — never throw |
| Stale panel-id in `state_json` from forward-version save view | Tampering / data integrity | `useLayoutState` filters against `PANEL_REGISTRY`; unknown ids ignored silently (defense in depth) |
| Split-sizes percentages don't sum to 100 (e.g. `?split_sizes=compare:70,70`) | Tampering | `react-resizable-panels` clamps to min/max and normalizes layout internally; URL serialization re-reads the post-clamp values |
| Cross-origin saved-view import (operator pastes a malicious URL) | Spoofing | Local single-user — operator owns their URLs. CSV regex limits character set; no JSON-blob injection vector. |

---

## Architecture Patterns — Deeper Detail (per the 11 questions)

### Question 1 — react-resizable-panels v4.11.0 API surface

**Components (verified from upstream README):**
- `Group` (formerly `PanelGroup`) — root container. Props:
  - `orientation`: `'horizontal' | 'vertical'` (default `'horizontal'`).
  - `defaultLayout`: array of numbers (percentages or pixel strings) — initial sizes per panel.
  - `onLayoutChange(layout)`: per-pointer-tick callback. **Avoid for storage**.
  - `onLayoutChanged(layout)`: post-pointer-release callback. **Use for URL writes**.
  - `groupRef`: imperative API `{ getLayout(): Layout, setLayout(layout: Layout): void }`.
  - `disabled` / `disableCursor` / `id` / `className` / `style`.
- `Panel` — child of `Group`. Props:
  - `id`: stable identifier — **required** for layout persistence association.
  - `defaultSize`: percentage or pixel value (numeric = pixels, string = parsed by unit).
  - `minSize` / `maxSize`: clamp constraints (defaults 0% / 100%).
  - `collapsible` / `collapsedSize` / `disabled`.
  - `onResize(panelSize, id, prevPanelSize)`: fired when this Panel's size changes.
  - `panelRef`: imperative API `{ collapse, expand, getSize, isCollapsed, resize(size) }`.
  - `groupResizeBehavior`: `'preserve-relative-size' | 'preserve-pixel-size'` (default first).
- `Separator` (formerly `PanelResizeHandle`) — sibling between two `Panel`s. Props:
  - `disableDoubleClick`: when **true**, disables built-in double-click-to-reset. **Leave false (default) to satisfy LAYO-03 success criterion 2.**
  - `disabled` / `id` / `className` / `style`.
- `useDefaultLayout({ groupId, storage })` — convenience hook for localStorage-backed persistence. **Phase 28 does NOT use this** — bridges to URL instead (see Pattern 3 above).

**React 19 compatibility:** Peer dep `react ^18.0.0 || ^19.0.0` [VERIFIED: `npm view react-resizable-panels peerDependencies`]. v2.1.5+ explicitly added React 19. v4.x maintains [CITED: changelog summary 2026-05-16].

**Version verification (run before install):**
```bash
npm view react-resizable-panels@4.11.0 version
npm view react-resizable-panels@4.11.0 peerDependencies
```

**URL-persistence pattern (controlled):**
- Read URL `split_sizes` param → parse → pass as `defaultLayout`.
- Write URL on `onLayoutChanged` (post-release) — uses `navigate({ search, replace: true })`.
- Controlled vs uncontrolled: `defaultLayout` is the "initial value, then library owns state". For URL round-trip we re-init from URL on every mount; no need for full controlled mode via `groupRef.setLayout()`.

**Default ratio + double-click reset:**
- `<Panel defaultSize={50} />` sets the default.
- Built-in double-click on `<Separator />` resets the adjacent panel to its `defaultSize` (no extra wiring).
- Verification in e2e: double-click Separator → assert URL `split_sizes` param is removed.

**Confidence: HIGH** — API surface verified against upstream README via `curl -sSL https://raw.githubusercontent.com/bvaughn/react-resizable-panels/main/README.md` 2026-05-16; version verified via npm registry.

### Question 2 — state_json layout shape

**Recommendation:** **Do not introduce a `state_json.layout` sub-object.** `state_json` is the EXACT flat shape of the URL search after `validateSearch` (Pitfall 8 above).

**Concrete `state_json` shape after Phase 28 on `/` (example):**
```json
{
  "schemaVersion": 1,
  "time_from": "now-7d",
  "time_to": "now",
  "compare_panels": "token-usage",
  "hidden_panels": "system-pressure,attention-bar",
  "panel_order": "main:cache-efficiency,token-usage,session-outcomes",
  "split_sizes": null
}
```

(Field is `undefined` when absent — that's how it serializes to JSON when not present in `useRouterState().location.search`.)

**Backwards-compat strategy:**
- Saved views written BEFORE Phase 28 lack the three new keys. On load via `navigate({ search: state_json })`, the route's `validateSearch` sees `hidden_panels: undefined` etc. — bare-URL behavior. **No migration.**
- Saved views from a future version that ship MORE keys → unknown fields drop silently in `validateSearch` (Phase 25 Pitfall 6 invariant).
- Saved views referencing a deleted panel id → `useLayoutState` filters via `PANEL_REGISTRY` (Pitfall 7 above).

**Why not a nested sub-object:** It creates a serialize/deserialize boundary that breaks the "URL = state_json" invariant. The Phase 25/26/27 contract is: write URL → URL is the saved blob → load URL is the read. No transformation.

**Confidence: HIGH** — pattern is identical to how `compare_panels` (Phase 26 Plan 07) round-trips. Verified at `SaveViewDialog.tsx:67-75`.

### Question 3 — 1D drag-reorder WITHOUT dnd-kit

**Recommendation:** Native HTML5 drag-and-drop + keyboard fallback. ~150 lines total in `DraggablePanelWrap.tsx`.

**Mouse path (HTML5 dnd API):**
1. The drag grip is a `<button>` inside the panel header (top-left corner, `GripVertical` icon from lucide-react). Set `draggable={true}` on the `<button>` (or the wrapping `<div>` if button styling blocks drag — verify in plan).
2. `onDragStart(e)`: write the panel-id to `e.dataTransfer.setData('text/cmc-panel-id', panelId)` + `e.dataTransfer.effectAllowed = 'move'`. Add a `cmc-panel--dragging` class to the panel for visual feedback (opacity dim).
3. `onDragOver(e)` on sibling drop targets: `e.preventDefault()` (required to allow drop), determine insert-above-or-below via pointer Y vs target center; render the drop indicator `<hr>` accordingly.
4. `onDrop(e)`: read `text/cmc-panel-id`, compute new order, write `navigate({ search: { panel_order: nextCsv }, replace: true })`.
5. `onDragEnd`: clean up classes + drop indicator.

**Constraints enforced by handler:**
- Cross-column moves rejected: each grid container has `data-column-id` attr; drop handler aborts if drag-source columnId !== drop-target columnId.
- Self-drop (drop onto own slot) is no-op.

**Keyboard path:**
1. Drag grip button is a real `<button data-testid="panel-drag-grip-{id}" aria-label="Reorder {panel.label}">`. Tab-reachable.
2. Space/Enter on grip → toggle `aria-pressed`. When `true`, panel enters "grab mode": visual outline + status text in aria-live region "{panel.label} grabbed. Position 3 of 5."
3. In grab mode: ArrowDown / ArrowUp → swap with neighbor + update aria-live ("position 4 of 5").
4. Enter / Space → commit (write URL via `navigate`, toggle `aria-pressed` false).
5. Esc → cancel (no URL write, exit grab mode).

**a11y reference pattern (cited, not vendored):** Dragon Drop ([github.com/schne324/dragon-drop](https://github.com/schne324/dragon-drop)) — aria-live live-region pattern for screen reader announcements during reorder.

**Trade-offs vs dnd-kit:**
- Native dnd ghost image is browser-default (ugly). Acceptable for v1; future polish phase can add a `setDragImage()` call with a styled clone.
- No animated tween (dnd-kit and react-beautiful-dnd animate). Acceptable for v1; framer-motion (already vendored) can add a layout-shift fade later.
- Touch screens: HTML5 dnd is desktop-only — touch fires `touchstart` not `dragstart`. Phase 28 is desktop-only per REQUIREMENTS.md Out of Scope ("Mobile drag-resize / customization"). No touch handler needed.

**Estimated complexity:** ~150 LOC for `DraggablePanelWrap.tsx` + ~80 LOC for the keyboard interaction + ~50 LOC for the drop-indicator. Total < 300 LOC vs ~2500 LOC for adding dnd-kit + reimplementing the constraint.

**Confidence: MEDIUM** — pattern is well-documented but the implementation has a high pitfall-density (browser quirks in DataTransfer, drop-zone hit-testing, focus management). The planner should budget extra time for the keyboard fallback's edge cases.

### Question 4 — Panel registry / ID scheme

**Recommendation:** Central registry in `frontend/src/lib/layout/panelRegistry.ts` (Pattern 1 example above). Each panel mounts via `<PanelCard panelId="token-usage" ...>` (new optional prop). The id is also emitted as `data-panel-id="token-usage"` on the rendered `<Card>` for e2e scoping.

**Naming convention:**
- Lowercase ASCII alphanumeric + `_` + `-` only (matches `asComparePanels` regex — Phase 28 lifts this to a shared `CSV_ID_RE`).
- Convention: kebab-case slugified component name. `TokenUsageCard` → `token-usage`. `CacheEfficiencyCard` → `cache-efficiency`. `SystemHealthStrip` → `system-pressure` (use the user-visible label, not the component name — operator-facing).
- **Locked invariant (add to REQUIREMENTS.md):** Panel ids are append-only — once registered, they cannot be renamed or repurposed (Pitfall 9).

**Where to register:**
- **Central** (PANEL_REGISTRY const map). Single source of truth. Easier to audit + lint.
- Alternative considered: per-panel `panelId` prop with no central registry. Rejected because `useLayoutState.orderedPanels(columnId)` needs to enumerate all valid ids for a column to validate URL params and reset-to-default; without a registry, the route component would need to enumerate inline (duplication).

**Serialization to state_json:** Via URL (Pattern 2). Three flat CSV strings.

**Confidence: HIGH** — pattern mirrors Phase 26's `compare_panels` exactly, just with more keys.

### Question 5 — Routes in scope

**Recommendation (per Phase 28 Success Criterion 1+2+3, refined):**

| Route | Show/Hide | 1D Reorder | Split-Pane | Rationale |
|-------|-----------|------------|------------|-----------|
| `/` (Command) | YES | YES | NO | 11 panels in `.cmc-card-grid` — high-value reorder target |
| `/activity` | YES | YES | NO | 3 panels in grid + 3 above (ActivityHeatmap, ChartsStrip, SessionsTable) — reorder applies to the 3-panel grid only |
| `/sessions/compare` | NO | NO | YES | Single panel (`PanelCard` wrapping `CompareBody`) — only meaningful customization is the left/right split |
| `/cost` | YES | YES | NO | 2 panels in grid — reorder meaningful (CostForecast vs CostByProject) |
| `/skills` | YES | YES | NO | 8 panels in grid — high-value reorder target |
| `/skills/$name` | NO | NO | NO | Single-column stack (per Phase 27 design) — no grid to reorder, no split-pane meaningful. **Out of scope for v1** to keep scope manageable. |
| `/alerts` | YES | YES | NO | AlertRulesList + AlertRuleForm in a 2-column grid (top), AlertEventsList full-width below — reorder applies to top 2-panel grid only; AlertEventsList stays full-width below |

**5 routes get show/hide + reorder:** `/`, `/activity`, `/cost`, `/skills`, `/alerts`.
**1 route gets split-pane:** `/sessions/compare`.
**1 route is intentionally out of scope:** `/skills/$name` (single-column stack — nothing to customize).

**Rationale to exclude `/skills/$name`:** Phase 27 explicitly chose single-column stack (see `routes/skills_.$name.tsx:280-298` comments: "Single-column stack — each panel is wide enough on its own"). Adding show/hide to a 5-panel single-column stack provides marginal value and adds visual matrix surface. Defer to v1.4 if user-requested.

**Confidence: HIGH** — based on direct grep of each route file 2026-05-16.

### Question 6 — Perf budget mechanics

**Phase 24's perf budget invariants (carried into Phase 28):**
1. ResponsiveContainer count locked at 8 (verified `grep -rE "^[[:space:]]*<ResponsiveContainer" frontend/src/components/panels/*.tsx | wc -l` → 8 at Phase 27 close 2026-05-16).
2. Density toggle is CSS-only (no React re-renders below `<html data-density>`) — Phase 24 POLI-11.
3. Lighthouse CWV at median: LCP < 700ms, CLS < 0.01, performance 1.0 — Phase 24 lighthouserc.json.

**How react-resizable-panels avoids re-mounts during drag:**
- The library uses **CSS flex-basis** sizing on the Panel root divs. Drag pointer events update flex-basis via inline style; React tree under each Panel is unaffected.
- ResponsiveContainer detects the panel's div resizing via ResizeObserver and updates the SVG `width`/`height` attributes on the existing `<svg>` element — chart tree stays mounted [CITED: github.com/recharts/recharts ResponsiveContainer source 2026-05-16].
- Data hooks (TanStack Query) are unchanged — same `queryKey`, same data, no refetch.

**Concrete patterns to avoid re-mounts:**
1. `ResizablePanelGroup` does NOT memoize children — passes them through directly. The children's `<PanelCard>` already memoizes via React Query's stable data references.
2. `useLayoutState` returns values memoized on the URL search keys. Reorder changes the URL → `useLayoutState` returns a new ordered array reference, BUT the panel COMPONENT instances inside the JSX must be keyed by panel-id so React reuses the DOM tree across reorders.

**Verification gate (carried from Phase 24's DOM-identity probe pattern):**
```ts
// frontend/tests/v13-layout.spec.ts — perf probe inside resize-persist test
const chartHandle = page.locator('[data-panel-id="token-usage"] svg').first()
const beforeId = await chartHandle.evaluate((el) => el.id || el.outerHTML.slice(0, 50))
await page.locator('[data-testid="resize-handle-compare"]').hover()
// ... drag steps ...
const afterId = await chartHandle.evaluate((el) => el.id || el.outerHTML.slice(0, 50))
expect(afterId).toBe(beforeId)  // DOM identity preserved
```

**Confidence: HIGH** — pattern verified against Phase 24's DOM-identity probe at 27-VISUAL-CHECK.md line 56 ("DOM-identity zero-rerender probe substituted for React DevTools profiler — 3/3 chart + 15/15 card markers preserved").

### Question 7 — Reset-to-default mechanics

**Recommendation:** "Reset layout" is a footer item in **every** panel's header DropdownMenu — operator can access it from any panel, not just one designated chrome location. The single action clears the three layout URL params atomically:

```ts
// frontend/src/lib/layout/useLayoutState.ts (excerpt)
function reset() {
  void navigate({
    to: '.',
    search: (prev) => {
      const next = { ...prev }
      delete next.hidden_panels
      delete next.panel_order
      delete next.split_sizes
      return next
    },
    replace: true,
  })
}
```

**UX:**
- No confirm dialog (single-user local, low blast radius). The action is instantly reversible by re-toggling individual panels.
- No live preview before save (no "save" step — URL IS the state; reset commits immediately).
- The toast affordance is OPTIONAL. Phase 26 vendored `sonner` for toasts; a quick `toast.success('Layout reset')` is the recommended affordance — surfaces the action's effect since the visual change may be subtle if the operator hasn't customized much.

**Critical invariant (LAYO-04 success criterion 3):** Reset clears ONLY the three layout keys — `time_from`, `time_to`, `compare_panels`, `range` (on `/skills/$name`), `a`, `b` (on `/sessions/compare`) are PRESERVED. Test: `useLayoutState.test.ts -t "reset preserves non-layout params"`.

**Where the menu item lives:**
- Phase 28 ships the "Reset layout" item in **every** PanelHeaderMenu (so it's accessible from any visible panel).
- If all panels are hidden, the operator can still reach reset via SavedViewMenu's "Reset layout" item — add this as a sibling to "Save as new view" in `SavedViewMenu.tsx`. **This is the corrupt-state lock-in escape hatch.** Without this, hiding every panel would lock the operator out.

**Confidence: HIGH** — pattern is dead simple URL navigation; the only design choice is the location of the menu item.

### Question 8 — Visual checkpoint contract

**Phase 24 established the contract** (see `.planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md`). Phase 27 is the most recent reference (`.planning/phases/27-per-route-adoption-ii-skills-cost-alerts-tech-debt/27-VISUAL-CHECK.md`).

**Required sections in `28-VISUAL-CHECK.md` (canonicalized from 27-VISUAL-CHECK.md structure):**

1. **Front matter:** operator name, date capture run, date verdict signed, phase number/name, plan that produced evidence (the close-gate plan), status (PASS / PROVISIONAL / FAIL).
2. **Capture commands:** the exact `pnpm test:e2e ...` + `pnpm test --run` + `uv run pytest` invocations that produce the evidence.
3. **Captured PNGs directory** + count (Phase 28 cap: 18 NEW = 138 cumulative v1.3).
4. **ROADMAP Success Criteria Mapping table** — 5 rows, one per success criterion in `ROADMAP.md Phase 28` (currently SC#1 hide-and-persist, SC#2 split-pane resize+reset, SC#3 reorder+reset, SC#4 single-dep zero-chart-remount, SC#5 test suites green).
5. **REQ-ID Closure table** — 4 rows (LAYO-01..04), each linking to the plan that closed it.
6. **Automated Evidence Summary table** — baseline vs measured: backend pytest, frontend vitest, Playwright e2e, Lighthouse 9/9, axe blocking, portal containment, URL contract 2/2, visual capture PNG total, ResponsiveContainer count.
7. **Visual capture verdict table** — 18 rows, one per `surface × density × theme` cell.
8. **Accepted Exceptions** — any deferred items (e.g., `/skills/$name` show/hide deferred to v1.4) with operator-signed rationale.
9. **Operator verdict line** — final PASS / FAIL with signature.

**Confidence: HIGH** — 27-VISUAL-CHECK.md is a fresh template (signed 2026-05-16, 2 days ago).

### Question 9 — URL contract preservation

**Current state of `tests/test_url_contract.py`** (file at `/Users/patrykattc/work/git/claude-mission-control/backend/tests/test_url_contract.py`, 111 lines):
- The test parses `docs/url-contract.md` and asserts:
  1. Every URL pattern documented in the doc has a corresponding file in `frontend/src/routes/`.
  2. Every file in `frontend/src/routes/` (excluding `__root.tsx` and `routeTree.gen.ts`) is documented in the doc.
- The test does NOT enforce search-shape contents (per `25-RESEARCH.md` Pitfall 3).

**What Phase 28 must do:**
1. Append a "Phase 28 effects on URL contract" section to `docs/url-contract.md` enumerating the three new append-only params on each route in scope (5 routes for `hidden_panels` + `panel_order`; 1 route for `split_sizes`).
2. Update the per-route `validateSearch shape` cell in the routes table to mention the three new fields (or just append "Phase 28 / LAYO-01..04 APPENDS …").
3. Verify `cd backend && uv run pytest tests/test_url_contract.py -v` stays 2/2 PASS (zero route renames — phase 28 only modifies in-place).

**Append-only invariant:** Confirmed maintainable. New fields are all optional + default `undefined` → existing deep links resolve identically.

**Confidence: HIGH** — test mechanism verified by `wc -l tests/test_url_contract.py` + grep of test file's contract assertions.

### Question 10 — Test surface

**vitest (unit) — estimated +35 tests:**
- `searchSchemas.test.ts` +9 (3 validators × 3 cases each: valid CSV, empty string, malformed regex)
- `useLayoutState.test.ts` +12 (isHidden, orderedPanels, splitSizes, setHidden, setOrder, setSplit, reset, reset preserves non-layout, validateSearch returns undefined for bare URL, registry filter ignores unknown ids × 3)
- `panelRegistry.test.ts` +4 (isValidPanelId TRUE/FALSE, registry shape lock — one test per route)
- `PanelHeaderMenu.test.tsx` +4 (renders trigger, opens menu, hides panel on click, reset menu item visible)
- `DraggablePanelWrap.test.tsx` +3 (mouse dragstart sets dataTransfer, keyboard Space toggles grab mode, ArrowDown moves panel)
- `ResizablePanelGroup.test.tsx` +3 (reads URL sizes, writes onLayoutChanged, double-click reset clears URL)

**Playwright e2e — estimated +18 tests in `v13-layout.spec.ts`:**
- 4 hide-and-persist tests (1 per route in scope)
- 4 reorder-via-drag tests
- 4 reorder-via-keyboard tests (a11y critical)
- 3 split-pane tests (resize, refresh-preserve, double-click reset)
- 1 reset-layout test (clears the three layout keys, preserves others)
- 1 saved-view round-trip test (hide + save view + load view + assert hidden)
- 1 ResponsiveContainer DOM-identity probe (preserved across drag)

**Coverage targets:** vitest covers logic units; Playwright covers user journeys. Estimated phase delta: vitest 662 → ~697 (+35), Playwright ~243 → ~261 (+18). Lighthouse target unchanged (9/9 PASS).

**Snapshot strategy:** Visual capture is screenshot-based (Playwright `await page.screenshot(...)`) — already established Phase 24 pattern. No content snapshots (no `.snap` files); operator verdict is the gate.

**Confidence: MEDIUM** — exact test counts are estimates; planner will refine.

### Question 11 — Pitfalls from prior phases that constrain Phase 28

Cross-referenced from Phase 24 / 25 / 26 / 27 RESEARCH.md + VISUAL-CHECK.md:

1. **Phase 24 — Density tokens on `:root`, NEVER on a subtree.** Phase 28's new chrome (PanelHeaderMenu, drag grip, Separator) mounts inside Radix Portal → ensure CSS uses `:root` density tokens, not scoped overrides. [Phase 24 Pitfall 3]
2. **Phase 24 — Transform-bearing ancestor breaks Radix Portal.** PanelHeaderMenu trigger is a `<button>`; do NOT apply `transform: translateY(-2px)` on its hover state — that creates a new containing block that breaks Portal positioning. [Phase 24 Pitfall 2]
3. **Phase 24 — z-index ladder lock.** PanelHeaderMenu uses `--cmc-z-dropdown` (already in ladder); the panel's drag-grip drop-indicator `<hr>` must use a z-index ≤ `--cmc-z-overlay-base` (locked). No raw z-index values — ESLint rule `cmc/no-raw-z-index` will fail otherwise. [Phase 24 CONT-05]
4. **Phase 25 — `validateSearch` is APPEND-ONLY.** The three new params are append-only. SCHEMA_VERSION stays at 1 (additive). Removing any existing field would break URL contract pytest. [Phase 25 Pitfall 3]
5. **Phase 25 — `state_json` is opaque to backend.** No new endpoint, no schema validation server-side, no Pydantic model changes. The blob is `Record<string, unknown>` from the SQLite `state_json` TEXT column's perspective. [Phase 25 Pitfall 6]
6. **Phase 25 — DefaultViewLoader gate fires on bare URL.** All three new validators MUST default to `undefined` (not empty string, not per-route default). [Phase 25 Pitfall 8 + Phase 26 Pitfall 13]
7. **Phase 25 — `useSearch()` returns new object refs on internal ticks.** Use stable-key-ordered JSON.stringify for comparisons (e.g., reset preserves non-layout — assert via `stableStringify` not `===`). [Phase 25 Pitfall 7]
8. **Phase 26 — ResponsiveContainer count is locked.** New layout chrome must NOT introduce any chart. Phase 28 doesn't need charts; verified. [Phase 26 Pitfall 4]
9. **Phase 26 — testid registry lock.** Every new testid (estimated 10–15 new entries) MUST be added to `docs/testid-registry.md` in the same commit as the source usage. [Phase 26 Pitfall 5]
10. **Phase 26 — axe-core gate.** New chrome (drag grip button, Separator) must pass axe AA contrast + aria roles. Separator already has `role="separator"` built-in via react-resizable-panels. Drag grip must have `aria-label`. [Phase 26 Pitfall 14]
11. **Phase 27 — per-panel state lives in URL, not localStorage.** Phase 27 explicitly REPLACED `RangeToggle persistKey` localStorage with URL state. Phase 28 must continue this — no `cmc.layout.*` localStorage keys. [Phase 27 Plan 27-05, Plan 27-06]
12. **Phase 27 — Accepted Exceptions are operator-acknowledged, not hidden.** If Phase 28 chooses to defer `/skills/$name` show/hide, document explicitly in `28-VISUAL-CHECK.md` Accepted Exceptions. [Phase 27 close pattern]
13. **Phase 26 — sonner toast is portal-mounted.** Any test that asserts toast presence must query `document.body` or `vi.mock('sonner')`. [Phase 26 Pitfall 11]
14. **Phase 27 — `cmc-page--bounded` flex ladder.** Routes with `.cmc-page cmc-page--bounded` already have `min-height: 0` in the flex ladder. ResizablePanelGroup on `/sessions/compare` must inherit this — the Group must be a flex-child with `min-height: 0` or it will overflow the bounded page. [Phase 24 CONT-04 + Phase 27 d76a95b verification fix]

---

## Code Examples

### Show/hide DropdownMenu in panel header

```tsx
// frontend/src/components/ui/PanelHeaderMenu.tsx — NEW
// Source: pattern verbatim from DensityToggle.tsx:43-77
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { EyeOff, RotateCcw, Settings } from 'lucide-react'
import { useLayoutState } from '../../lib/layout/useLayoutState'
import { useRouterState } from '@tanstack/react-router'

interface PanelHeaderMenuProps {
  panelId: string
  label: string
}

export function PanelHeaderMenu({ panelId, label }: PanelHeaderMenuProps) {
  const route = useRouterState({ select: (s) => normalizeRouteId(s.location.pathname) })
  const { setHidden, reset } = useLayoutState(route)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="cmc-icon-button"
          aria-label={`Customize ${label}`}
          data-testid={`panel-header-menu-${panelId}`}
        >
          <Settings size={14} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="cmc-dropdown" sideOffset={6} align="end">
          <DropdownMenu.Item
            onSelect={() => setHidden(panelId, true)}
            data-testid={`panel-hide-${panelId}`}
          >
            <EyeOff size={14} aria-hidden /> Hide this panel
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="cmc-dropdown__separator" />
          <DropdownMenu.Item
            onSelect={reset}
            data-testid={`panel-reset-layout-${normalizeRouteId(route)}`}
          >
            <RotateCcw size={14} aria-hidden /> Reset layout
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
```

### Split-pane on SessionCompareView (excerpt)

```tsx
// frontend/src/components/panels/SessionCompareView.tsx — modified
import { Panel } from 'react-resizable-panels'
import { ResizablePanelGroup } from '../ui/ResizablePanelGroup'

// Inside CompareBody — wrap the two-column KPI strip / chart / diff regions:
return (
  <ResizablePanelGroup groupId="compare" defaultSizes={[50, 50]}>
    <Panel id="side-a" defaultSize={50} minSize={25}>
      <div className="cmc-compare__side">
        {renderKpis(data.a)}
        {renderTokensChart(data.a)}
        {/* Side A's slice of the skill-set diff + tool-counts table */}
      </div>
    </Panel>
    <Panel id="side-b" defaultSize={50} minSize={25}>
      <div className="cmc-compare__side">
        {renderKpis(data.b)}
        {renderTokensChart(data.b)}
        {/* Side B's slice */}
      </div>
    </Panel>
  </ResizablePanelGroup>
)
```

### Native HTML5 drag-reorder (keyboard + mouse)

```tsx
// frontend/src/components/ui/DraggablePanelWrap.tsx — NEW (excerpt)
import { useState, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'

interface DraggablePanelWrapProps {
  panelId: string
  columnId: string
  label: string
  index: number
  total: number
  onReorder: (fromId: string, toIndex: number) => void
  children: ReactNode
}

export function DraggablePanelWrap({
  panelId, columnId, label, index, total, onReorder, children,
}: DraggablePanelWrapProps) {
  const [grabbed, setGrabbed] = useState(false)
  const [announce, setAnnounce] = useState('')

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!grabbed) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setGrabbed(true)
        setAnnounce(`${label} grabbed. Position ${index + 1} of ${total}.`)
      }
      return
    }
    if (e.key === 'Escape') {
      setGrabbed(false)
      setAnnounce(`Reorder cancelled.`)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setGrabbed(false)
      setAnnounce(`${label} dropped at position ${index + 1}.`)
      return
    }
    if (e.key === 'ArrowDown' && index < total - 1) {
      e.preventDefault()
      onReorder(panelId, index + 1)
      setAnnounce(`${label} moved to position ${index + 2} of ${total}.`)
    } else if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault()
      onReorder(panelId, index - 1)
      setAnnounce(`${label} moved to position ${index} of ${total}.`)
    }
  }

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/cmc-panel-id', panelId)
    e.dataTransfer.setData('text/cmc-column-id', columnId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/cmc-column-id')) {
      e.preventDefault()  // required to allow drop
      e.dataTransfer.dropEffect = 'move'
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const fromId = e.dataTransfer.getData('text/cmc-panel-id')
    const fromColumn = e.dataTransfer.getData('text/cmc-column-id')
    if (fromColumn !== columnId) return  // cross-column drops ignored
    onReorder(fromId, index)
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-panel-id={panelId}
      data-column-id={columnId}
    >
      <button
        draggable
        onDragStart={handleDragStart}
        onKeyDown={handleKeyDown}
        aria-label={`Reorder ${label}`}
        aria-pressed={grabbed}
        data-testid={`panel-drag-grip-${panelId}`}
        className="cmc-panel-grip"
      >
        <GripVertical size={14} aria-hidden />
      </button>
      <div role="status" aria-live="polite" className="cmc-sr-only">
        {announce}
      </div>
      {children}
    </div>
  )
}
```

### Read URL → derive layout state

```ts
// frontend/src/lib/layout/useLayoutState.ts (excerpt)
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useMemo } from 'react'
import { PANEL_REGISTRY } from './panelRegistry'

export function useLayoutState(route: string) {
  const navigate = useNavigate()
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>

  const hidden = useMemo<Set<string>>(() => {
    const csv = typeof search.hidden_panels === 'string' ? search.hidden_panels : ''
    return new Set(csv ? csv.split(',') : [])
  }, [search.hidden_panels])

  function isHidden(panelId: string): boolean {
    return hidden.has(panelId)
  }

  function setHidden(panelId: string, hide: boolean) {
    const next = new Set(hidden)
    if (hide) next.add(panelId); else next.delete(panelId)
    const csv = Array.from(next).sort().join(',') || undefined
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, hidden_panels: csv }),
      replace: true,
    })
  }

  // ... orderedPanels / setOrder / splitSizes / setSplit / reset omitted for brevity
  return { isHidden, setHidden, /* …, */ reset }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PanelGroup` / `PanelResizeHandle` / `direction` (react-resizable-panels v0/v1/v2/v3) | `Group` / `Separator` / `orientation` (v4) | v4.0.0 (2025) | Plans must use v4 names; shadcn-ui templates still use legacy names against v4 internals — known broken (Issue #9136) |
| `autoSaveId` prop for localStorage persistence | `useDefaultLayout({ groupId, storage })` hook (or manual URL bridge — Phase 28 choice) | v4.0.0 | Phase 28 bridges to URL manually for `state_json` round-trip |
| `onCollapse` / `onExpand` callbacks | Compute from `onResize(panelSize, id, prevPanelSize)` by comparing prev vs current | v4.0.0 + v4.2.0 (`prevPanelSize` param) | Phase 28 doesn't use collapse — non-issue |
| `react-grid-layout` (full 2D drag-resize grid) | NOT used; blocked by Issue #2045 (React 19.2 key-prop warnings) per REQUIREMENTS.md LAYO-05 deferral | Per v1.3 Out of Scope | Defer to v1.4+; Phase 28 ships show/hide + 1D reorder + split-pane only |
| `dnd-kit` for general drag-and-drop | NOT used; native HTML5 dnd suffices for 1D-single-column constrained case | Phase 28 design decision; REQUIREMENTS.md Out of Scope forbids dnd-kit | Net: ≤300 LOC inline vs ~2500 LOC + new dep |
| localStorage per-panel state (Phase 14-23) | URL state via `validateSearch` (Phase 25 onward) | Phase 27 Plan 27-05/27-06 | Phase 28 continues — zero new `cmc.layout.*` localStorage keys |

**Deprecated/outdated:**
- shadcn-ui `Resizable` component — generates code referencing v0/v1/v2 API names against v4 internals; will not work [CITED: github.com/shadcn-ui/ui/issues/9136]. **Do not copy from shadcn-ui examples.**
- Any AI-generated example using `<PanelGroup direction="horizontal">` — pre-v4 syntax. Reject in code review.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Panel id naming convention `kebab-case slugified user-facing label` | §1 Panel registry | LOW — convention is debatable; planner can pick differently as long as ids match `CSV_ID_RE` and are append-only |
| A2 | Reset menu item lives in BOTH per-panel header + SavedViewMenu | §7 Reset-to-default | LOW — single-location is also viable but "hide every panel" locks operator out without the SavedViewMenu escape hatch |
| A3 | 5 routes get show/hide + reorder (`/`, `/activity`, `/cost`, `/skills`, `/alerts`); 1 route gets split-pane (`/sessions/compare`); 1 route deferred (`/skills/$name`) | §5 Routes in scope | MEDIUM — operator may want `/skills/$name` show/hide; deferral should be a discuss-phase confirmation, NOT an implementation lock |
| A4 | Native HTML5 dnd is sufficient for LAYO-02 (no library needed) | §3 Drag-reorder | MEDIUM — keyboard fallback adds ~150 LOC complexity; if the planner discovers ergonomic issues, falling back to dnd-kit would require relaxing REQUIREMENTS.md milestone constraint line 12 |
| A5 | URL `panel_order` CSV shape `<columnId>:<panelId1>,<panelId2>;<columnId>:...` is workable | §2 Pattern 2 | LOW — alternative is one URL param per column (`?panel_order_main=...&panel_order_top=...`) — shorter regex, more params; planner can pick |
| A6 | "Reset layout" should NOT prompt confirmation (single-user local, low blast radius) | §7 | LOW — operator preference; discuss-phase should confirm |
| A7 | 18 NEW visual capture PNGs is the cap for Phase 28 close | §10 Visual checkpoint | LOW — purely a scope decision |
| A8 | `state_json` round-trip is unchanged — SaveViewDialog already captures the validated URL blob; no Save-flow changes | §3 Pitfall 3 | LOW — verified at `SaveViewDialog.tsx:67-75` |
| A9 | `/sessions/compare` is the only v1 consumer of split-pane | §5 | LOW — adding more later is additive (new URL group key) |
| A10 | Panel ids are an append-only locked invariant (no rename, no repurpose) | §9 Pitfall 9 | LOW — straightforward to enforce via ESLint or code review |
| A11 | `slopcheck` `[OK]` verdict on `react-resizable-panels` is sufficient legitimacy signal | §Package Legitimacy Audit | LOW — package has multi-million weekly downloads + bvaughn maintenance |

**If this table is empty:** It isn't — discuss-phase should walk through these and confirm before planning starts.

---

## Open Questions

1. **Operator preference: confirm dialog on "Reset layout" or instant action?**
   - What we know: §7 recommends instant (single-user local, low blast radius); REQUIREMENTS.md LAYO-04 says "Prevents corrupt-state lock-in" — implies the action is the escape hatch.
   - What's unclear: whether the operator wants a soft "Are you sure?" given the action wipes 3 URL params silently.
   - Recommendation: instant action + sonner toast "Layout reset" (toast is the affordance, not the confirm).

2. **Operator preference: include `/skills/$name` in show/hide scope?**
   - What we know: §5 defers it (single-column stack — marginal value); Phase 27 deliberately chose single-column stack for the detail page.
   - What's unclear: whether the operator finds value in hiding individual sections (e.g., hide `SkillRunsTable` to see `SkillCostCard` + `SkillProjectsTable` only).
   - Recommendation: discuss-phase confirms; v1 stays out of scope unless explicit request.

3. **Panel-id locked-vocabulary enforcement: ESLint rule or pure documentation?**
   - What we know: §Pitfall 9 + §Assumption A10 lock the invariant.
   - What's unclear: whether to enforce via a new ESLint rule (parallels `cmc/testid-registry-only`, `cmc/no-raw-z-index`) or via PR review.
   - Recommendation: documentation only for v1 — ESLint rule has marginal value pre-rename event. Promote to ESLint rule if a rename is ever proposed.

4. **Where does the "Show hidden panels" submenu live?**
   - What we know: §LAYO-01 says "DropdownMenu in panel header" — but if all panels in a column are hidden, there's no header to attach to.
   - What's unclear: whether to also expose the unhide action via the AppShellHeader's SavedViewMenu, or via a small "+ Show panels" affordance at the column top.
   - Recommendation: discuss-phase decides; surface in SavedViewMenu as fallback (already a chrome surface) + add a column-header "+ Show panels" affordance only if visual checkpoint flags the empty-column state as confusing.

5. **`split_sizes` URL param shape (CSV groups vs single-group):**
   - What we know: §2 Pattern 2 proposes `<groupId>:<n1>,<n2>;<groupId>:...` to support multiple groups per route.
   - What's unclear: whether `/sessions/compare` will ever need more than one split group (currently no).
   - Recommendation: ship the multi-group shape for forward-compat (string parsing handles single group as a special case); cost is ~5 LOC.

---

## Sources

### Primary (HIGH confidence)

- **react-resizable-panels README** (`https://raw.githubusercontent.com/bvaughn/react-resizable-panels/main/README.md`, fetched 2026-05-16 via curl) — `Group` / `Panel` / `Separator` API surface, `defaultLayout` / `onLayoutChange` / `onLayoutChanged` / `groupRef` / `disableDoubleClick` props, orientation values.
- **npm registry** (`npm view react-resizable-panels` 2026-05-16) — version 4.11.1 (latest), peer deps `react ^18 || ^19`, no postinstall script, repository `git+https://github.com/bvaughn/react-resizable-panels.git`.
- **slopcheck** (CLI `slopcheck install react-resizable-panels` 2026-05-16) — `[OK]` legitimacy verdict.
- **Phase 24 RESEARCH.md** — Pitfall 2 (transform-bearing ancestor), Pitfall 3 (density scope), Pitfall 4 (min-width: 0 flex ladder), Pitfall 7 (axe contrast).
- **Phase 25 RESEARCH.md** — Pitfall 3 (validateSearch append-only), Pitfall 6 (state_json opacity), Pitfall 7 (useSearch returns new refs), Pitfall 8 (DefaultViewLoader gate).
- **Phase 25 Plan 06 source** — `SaveViewDialog.tsx:67-75` confirms `useRouterState({ select: s => s.location.search })` is the state_json source.
- **Phase 26 RESEARCH.md** — Pitfall 4 (ResponsiveContainer count), Pitfall 5 (testid registry), Pitfall 11 (sonner portal in tests), Pitfall 13 (validateSearch undefined default for DefaultViewLoader).
- **Phase 27 VISUAL-CHECK.md** — Live walkthrough verdict template; ResponsiveContainer count 8 baseline; bounded-card flex-ladder fix (d76a95b) precedent.
- **`docs/url-contract.md`** — append-only contract, Phase 26 + Phase 27 effects sections (the template for Phase 28's section).
- **`docs/testid-registry.md`** — testid lint rule template; 89 existing entries.
- **`backend/tests/test_url_contract.py`** — 111 LOC; tests doc ↔ route-file bidirectional consistency.
- **`frontend/src/lib/searchSchemas.ts`** — `asTimeToken` + `asComparePanels` precedent for `asHiddenPanels` / `asPanelOrder` / `asSplitSizes`.
- **`frontend/src/components/ui/PanelCard.tsx`** + **`BoundedPanelCard.tsx`** — `bounded` prop precedent for `panelId` prop.
- **`frontend/src/routes/{index,activity,cost,skills,alerts}.tsx`** + **`sessions_.compare.tsx`** + **`skills_.$name.tsx`** — current route file structure verified 2026-05-16.

### Secondary (MEDIUM confidence)

- **WebSearch summaries** for `react-resizable-panels v4 breaking changes Group Separator migration` and `HTML5 drag-and-drop API React 19 list reorder accessibility keyboard pattern` (2026-05-16) — cross-verified findings against the primary README + Adobe React Aria blog on dnd a11y.
- **GitHub issue [shadcn-ui/ui#9136](https://github.com/shadcn-ui/ui/issues/9136)** — confirms raw v4 usage works; only the shadcn wrapper is broken.
- **react-resizable-panels CHANGELOG summary** (WebFetch) — v4.0.0 breaking changes, v4.2/4.4/4.6/4.8 additions, React 19 peer support.
- **recharts ResponsiveContainer source/docs** — ResizeObserver + ref-based listener; no re-mount on parent resize.

### Tertiary (LOW confidence — none for Phase 28)

None — all primary claims verified against authoritative sources or the existing codebase.

---

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` exists at the repo root (verified 2026-05-16 via `Read` tool — `File does not exist`). No project-level CLAUDE.md directives to enforce. Frontend conventions enforced via ESLint (`cmc/testid-registry-only`, `cmc/no-raw-z-index`) + `docs/affordance-checklist.md` + `docs/z-index-ladder.md` (Phase 24 POLI-12/POLI-13/POLI-14).

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — single new dep, v4 API verified against upstream README + npm registry
- Architecture: HIGH — pattern is identical to Phase 26's `compare_panels` URL round-trip
- Pitfalls: HIGH — 14 pitfalls cross-referenced from Phases 24/25/26/27
- Native HTML5 dnd a11y: MEDIUM — pattern is documented but implementation density is high; planner should budget extra time for the keyboard interaction's edge cases
- Phase 28 success criterion 4 ("zero chart re-mounts during drag"): HIGH — verified mechanism via react-resizable-panels CSS flex-basis + ResponsiveContainer ResizeObserver

**Research date:** 2026-05-16
**Valid until:** 2026-06-15 (30 days — stable dep; only fast-moving piece is v4 minor releases, which are additive)

---

## RESEARCH COMPLETE

**Phase:** 28 — Layout Customization
**Confidence:** HIGH

### Key Findings

- **react-resizable-panels v4 ≠ v0/v1/v2/v3 API.** Plans must use `Group` / `Panel` / `Separator` + `orientation` + `defaultLayout` + `onLayoutChanged` — NOT `PanelGroup` / `PanelResizeHandle` / `direction` / `autoSaveId`. Verified upstream README 2026-05-16. slopcheck `[OK]`.
- **No new abstractions.** `state_json` is the flat URL search blob (Phase 25/26/27 invariant); Phase 28 appends three optional CSV params (`hidden_panels`, `panel_order`, `split_sizes`) — SaveViewDialog auto-captures them with zero changes.
- **5 routes get show/hide + 1D reorder; 1 route gets split-pane.** `/`, `/activity`, `/cost`, `/skills`, `/alerts` for the first two; `/sessions/compare` for split-pane. `/skills/$name` deferred (single-column stack — marginal value).
- **Native HTML5 dnd is sufficient for the constrained 1D case** — ~300 LOC inline vs adding dnd-kit. Keyboard a11y MUST be implemented manually (Space-to-grab + arrows + Enter-to-drop + aria-live). Reference pattern: Dragon Drop (cited, not vendored).
- **`SavedViewMenu` MUST surface "Reset layout"** in addition to per-panel headers — operator can hide every panel, locking themselves out without the SavedViewMenu escape hatch.

### File Created

`/Users/patrykattc/work/git/claude-mission-control/.planning/phases/28-layout-customization/28-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Single new dep, v4 API verified against upstream README + npm registry + slopcheck |
| Architecture | HIGH | Pattern is identical to Phase 26's `compare_panels` URL round-trip |
| Pitfalls | HIGH | 14 pitfalls cross-referenced from Phases 24/25/26/27 RESEARCH.md + VISUAL-CHECK.md |
| Native HTML5 dnd a11y | MEDIUM | Pattern is documented but implementation density is high; planner should budget extra time |

### Open Questions

5 open questions enumerated above — all are operator-preference / scope-confirmation items for discuss-phase, none block the planner.

### Ready for Planning

Research complete. Planner can now create PLAN.md files. Recommended wave structure (NOT prescriptive — planner refines):

- **Wave 0 (test scaffolding):** new vitest files + extend Playwright `v13-layout.spec.ts` + extend `docs/url-contract.md` + extend `docs/testid-registry.md` — gates everything downstream.
- **Wave 1 (LAYO-01 + LAYO-04):** panel registry + `useLayoutState` + `PanelHeaderMenu` + "Reset layout" in SavedViewMenu + validateSearch extension on 5 routes for `hidden_panels` — closes 2 of 4 REQ-IDs.
- **Wave 2 (LAYO-02):** `DraggablePanelWrap` + keyboard a11y + validateSearch extension for `panel_order` + route render-order wiring — closes LAYO-02.
- **Wave 3 (LAYO-03):** install `react-resizable-panels@4.11.0` + `ResizablePanelGroup` wrapper + wire into `SessionCompareView` + validateSearch extension for `split_sizes` — closes LAYO-03.
- **Wave 4 (close gate):** v1.3 milestone close — visual capture matrix expansion to 18 NEW PNGs + full suite green + URL contract 2/2 + axe blocking 0 + ResponsiveContainer count = 8 + operator verdict in `28-VISUAL-CHECK.md`.

Sources:
- [react-resizable-panels README (raw)](https://raw.githubusercontent.com/bvaughn/react-resizable-panels/main/README.md)
- [react-resizable-panels CHANGELOG v4.0.0+](https://github.com/bvaughn/react-resizable-panels/blob/main/CHANGELOG.md)
- [shadcn-ui Issue #9136 — Resizable broken on v4](https://github.com/shadcn-ui/ui/issues/9136)
- [react-resizable-panels on npm](https://www.npmjs.com/package/react-resizable-panels)
- [Adobe React Aria — Drag and drop a11y](https://react-aria.adobe.com/blog/drag-and-drop)
- [Dragon Drop — accessible list reorder pattern](https://github.com/schne324/dragon-drop)
- [recharts ResponsiveContainer source](https://github.com/recharts/recharts/blob/main/src/component/ResponsiveContainer.tsx)
