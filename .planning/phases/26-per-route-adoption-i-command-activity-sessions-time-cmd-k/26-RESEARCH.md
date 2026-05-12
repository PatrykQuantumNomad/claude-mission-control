# Phase 26: Per-Route Adoption I (Command/Activity/Sessions) + Time + Cmd+K — Research

**Researched:** 2026-05-12
**Domain:** Frontend chrome (global time picker, Cmd+K extensions, sidebar Recently Visited) + per-route adoption sweep on `/`, `/activity`, `/sessions/compare`
**Confidence:** HIGH for stack + invariants, MEDIUM for brush-zoom coupling architecture (one open decision flagged), HIGH for pitfalls

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Time picker syntax & URL contract
- **Canonical syntax: Grafana-style relative + absolute.** Tokens like `now-7d`, `now-1h`, `now/d` (today), `now-1d/d` (yesterday) live in URL state and on the clipboard; backend coerces relative → absolute at query time.
- Relative-time symbols are **preserved** through copy/paste, saved-view round-trips, and brush-zoom-reset. A "last 7 days" link stays "last 7 days" tomorrow.
- Absolute ISO timestamps are accepted for custom-range picker output and brush-zoom commits (zoomed range freezes to absolute).
- URL params: `?time_from=&time_to=`.

#### Time picker preset list (top → bottom)
- **Short windows**: last 5m, 15m, 1h, 6h, 24h
- **Standard windows**: last 7d, 30d, 90d
- **Calendar anchors**: today, yesterday, this week, last week, this month
- **Custom range picker**: dual-month calendar + time inputs at the bottom, falls back to absolute timestamps

#### Default range per route (when URL has no time params and no saved-view default)
- `/` → last 24h
- `/activity` → last 1h
- `/sessions/compare` → last 7d
- Saved-view default still wins. Explicit URL params always win over both.

#### Auto-refresh interval control
- **Two adjacent dropdowns in the header**: `[time range ▾] [refresh: off ▾]`. Intervals: off / 30s / 1m / 5m.
- Visual badge or pulse dot when refresh is active.

#### Brush-zoom semantics (recharts)
- **Snap = freeform** (exact pixel-to-time at brush release).
- **Reset zoom = explicit "Reset zoom" button in chart header**.
- **Brush-zoom + auto-refresh = pause refresh while zoomed.**
- Brushing on `/activity` MUST update the global time picker, re-anchor every other panel on the page, AND update the URL.

#### Compare-to-previous overlay (TIME-04)
- Off by default; toggle lives in panel header, not the time picker.
- "Previous" window = same-length-prior.
- Per-panel state is opaque and persists inside the saved view's `state_json`.

#### Copy / paste time range (TIME-02)
- Keyboard-only affordance: `Cmd+Shift+C` / `Cmd+Shift+V`. No visible header button.
- Discoverability via Cmd+K commands + entry in `docs/affordance-checklist.md`.
- Clipboard format: app URL fragment `?time_from=now-7d&time_to=now`.
- Toast feedback on every event.

#### Cmd+K group ordering (top → bottom)
1. Recents (CMDK-04 — new)
2. Saved Views (CMDK-01 — shipped)
3. Pages (existing)
4. Time range (CMDK-03 — new)
5. Density (CMDK-02 — new)
6. Actions (existing)

#### Cmd+K density command (CMDK-02)
Three discrete commands with active-state checkmark; applies via existing `applyDensity()`; re-paints without navigation.

#### Recents data source (CMDK-04 + SHEL-05)
- Single localStorage source of truth: `cmc.recents.routes` (FIFO route history, dedup on push).
- Cmd+K Recents group: last 5 routes + last 5 ad-hoc URL states (latter from Phase 25's `cmc.savedView.recent.<route>`).
- Sidebar Recently Visited section: **last 3 routes only**.

#### Sidebar Recently Visited placement (SHEL-05)
- Slot: between Pinned and Operate. Final order: Pinned → Recently Visited → Operate → Configure.
- Visible in expanded and icon-only collapsed sidebar modes.

#### Per-route adoption sweep
- Panels migrate to `BoundedPanelCard bounded` + consume density tokens + adopt `TruncatedCell` / `CopyIconButton`.
- Sheets on `/sessions/compare` must stay inside viewport at every density × viewport ≥ 1024px wide.
- Time-anchored panels re-query against the global picker's range.
- All three routes already adopted `validateSearch` with `schemaVersion` in Phase 25 plans 3 + 4 — no schema migration needed.

### Claude's Discretion
- Exact recharts brush component (`<Brush />` vs custom drag handler).
- Time picker popover layout; calendar dep (may need new dep — flag).
- Toast library choice (sonner is natural fit — planner must budget new dep).
- Visual treatment of compare-overlay.
- Auto-refresh pause-on-blur, picker visibility on non-time routes, saved-view interaction with range freezing.
- Cmd+Shift+C/V payload inclusion of auto-refresh interval (keep narrow unless reason).
- Pulse / badge styling for active auto-refresh state.

### Deferred Ideas (OUT OF SCOPE)
- Tail-end route adoption (`/skills`, `/skills/$name`, `/cost`, `/alerts`) — Phase 27.
- Tech-debt closure (TDBT-01..03) — Phase 27.
- Layout customization (LAYO-01..04) — Phase 28.
- Auto-refresh sliding-window mode — rejected.
- Compare overlay with fixed "this day last week" semantics — rejected.
- Visible copy/paste icon affordance — rejected.
- Single "Cycle density" Cmd+K command — rejected.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHEL-05 | Sidebar Recently Visited section auto-tracks last 5 routes/views | CONTEXT narrows to 3 routes (sidebar); 5 routes + 5 ad-hoc states surface in Cmd+K. See "Recents pipeline" pattern. |
| TIME-01 | Global time picker in top bar (Grafana relative + absolute, auto-refresh selector) | Pre-registered `time-picker-trigger` slot in `AppShellHeader.tsx`. See "Time picker architecture" and "Grafana time syntax" sections. |
| TIME-02 | All time-anchored panels sync to global picker via `validateSearch` time params | `time_from` / `time_to` added per-route (append-only); see "URL-state-as-source-of-truth" and the Append-Only validateSearch invariant. |
| TIME-03 | Copy/paste time range (Cmd+Shift+C/V) | Keyboard-only; clipboard format `?time_from=now-7d&time_to=now`. See "Clipboard format". |
| TIME-04 | Compare-to-previous overlay toggle on supported charts | State piggybacks `state_json` of saved views; toggle lives in panel header. See "Compare-overlay state model". |
| TIME-05 | Brush-zoom on time-series charts updates global picker | Recharts `<Brush />` exists; `onChange` returns indices not timestamps. See "Brush-zoom architecture" — load-bearing decision. |
| CMDK-02 | Set Density command (Compact / Comfortable / Cozy) with current-state indicator | Reuses existing `applyDensity()`; mirror DensityToggle's check-mark pattern. |
| CMDK-03 | Time Range commands (predefined + copy/paste) | Same commands fired from the time picker presets. See "Cmd+K time-range integration". |
| CMDK-04 | Recents group (last 5 routes + last N ad-hoc states) | Reads from `cmc.recents.routes` (NEW for SHEL-05) + `cmc.savedView.recent.<route>` (Phase 25 plan 10, shipped). |

**Requirement vs CONTEXT divergence (resolve via planner):** REQUIREMENTS.md SHEL-05 says "last 5 routes/views" in the sidebar; CONTEXT narrows sidebar to "last 3 routes only" — this is a deliberate UX narrowing from the discuss-phase. Both numbers feed the same `cmc.recents.routes` store; the difference is how many slice off for sidebar vs Cmd+K. Honor CONTEXT (3 routes in sidebar, 5 in Cmd+K).
</phase_requirements>

## Summary

Phase 26 ships three integrated concerns that all hang off a single new piece of chrome state — the global time range. The **time picker** (top-bar trigger + popover with presets + dual-month calendar + adjacent refresh dropdown) writes `time_from` / `time_to` Grafana-style tokens into the URL via `validateSearch` (append-only on three routes); time-anchored panels re-query when those params change. **Brush-zoom on `/activity` charts** mutates the same URL params (snap-freeze to absolute). **Cmd+K** gains three new groups (Recents at top, Time range, Density) wired to the same picker state and the existing `applyDensity()`. **Sidebar Recently Visited** reads from a new `cmc.recents.routes` localStorage ring that's written on every navigation. **Per-route adoption** migrates panels on `/`, `/activity`, `/sessions/compare` to `BoundedPanelCard bounded` + density tokens + `TruncatedCell` / `CopyIconButton` — these primitives shipped in Phase 24 with zero current consumers, so adoption is purely additive.

The phase has one **load-bearing architectural decision** — how brush-zoom mutates global URL state — and three **new runtime-dep budget asks** (sonner for toasts is mandatory; react-day-picker + date-fns are needed for the custom calendar). The phase also has a **backend ask that's smaller than it looks** because the canonical mental model "URL holds relative tokens → backend coerces" is *blocked by* the fact that no current backend route accepts `time_from`/`time_to` (each panel sends `?range=today|7d|30d`). Resolving this is the pivot the planner must work through; see "Relative-token coerce strategy" for the recommended path (frontend-coerce; defer backend acceptance to a separate request).

**Primary recommendation:** Land the time picker as a standalone vertical (popover + URL writes + auto-refresh) before adoption work. Wire brush-zoom with recharts' built-in `<Brush />` and a synchronous URL write on `onDragEnd`. Frontend coerces relative tokens to absolute before forming the existing `?range=` request — backend stays unchanged this phase. Use sonner for toasts (1 dep), react-day-picker for the calendar (pulls date-fns as a transitive dep — 2 effective new deps). The adoption sweep on the three routes is "swap PanelCard → BoundedPanelCard + add `bounded`, replace string-truncated-cell-codepaths with `TruncatedCell`, replace inline copy-buttons with `CopyIconButton`" — mechanical, but verify each panel header to ensure `RangeToggle` chrome can coexist with the global picker (CONTEXT punts to discretion: per-panel RangeToggle stays for v1.3, global picker layers on top).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Time picker UI (popover, presets, calendar) | Browser / Client | — | Pure chrome; reads/writes URL state. |
| `time_from`/`time_to` URL state | Browser / Client | — | URL is the source of truth (TIME-02 contract). |
| Relative → absolute coercion (`now-7d` → ISO) | **Browser / Client** (Phase 26) | Backend (future) | Backend currently accepts only `?range=today|7d|30d` (vocab) and `?since=<ISO>` (SSE). Frontend coerces before forming requests; backend acceptance of `time_from`/`time_to` deferred. |
| Brush-zoom event → URL write | Browser / Client | — | Recharts onChange fires in the page; coupling goes URL → all panels (not chart → chart). |
| Auto-refresh interval | Browser / Client | — | React Query `queryClient.invalidateQueries` on a window-level interval. |
| Compare-to-previous overlay queries | Browser / Client (compose two range queries) | Backend (existing) | Backend already exposes prev-period CTE pattern (Phase 19 SKLP delta). Use existing `range`-based hooks twice with offset windows. |
| Toast notifications | Browser / Client | — | sonner Toaster mounts once at AppShell. |
| Recents tracking | Browser / Client | — | `cmc.recents.routes` localStorage ring; writes on navigation. |
| Sidebar Recently Visited render | Browser / Client | — | Subscribes to router-state change in Sidebar (currently does not — see Pitfall §"Sidebar same-tab update channel"). |
| Cmd+K density command | Browser / Client | — | Calls `applyDensity()` (no React state, CSS cascade). |
| Density-token adoption on panels | Browser / Client (CSS only) | — | Panels migrate to use `--space-sm`/`--space-md` density vars in their own CSS. No React re-render. |
| BoundedPanelCard adoption | Browser / Client | — | Per-panel JSX swap; no API change. |

## Standard Stack

### Core (already installed — verified in `frontend/package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `recharts` | `^3.8.1` [VERIFIED: package.json] | `<Brush />` for TIME-05 brush-zoom; existing 26 `<ResponsiveContainer />` usage [VERIFIED: 8 files] | `<Brush />` is built into recharts; no extra dep [CITED: context7.com/recharts/recharts]. |
| `@radix-ui/react-popover` | `^1.1.15` [VERIFIED: package.json] | Time picker popover anchor | Installed, NEVER consumed yet — Phase 26 is its first use [VERIFIED: zero matches for `@radix-ui/react-popover` import in `frontend/src/`]. |
| `@radix-ui/react-dropdown-menu` | `^2.1.16` [VERIFIED: package.json] | Auto-refresh interval dropdown | Mirror DensityToggle pattern; already used by SavedViewMenu, DensityToggle. |
| `cmdk` | `^1.1.1` [VERIFIED: package.json] | Cmd+K palette — extend with 3 new `Command.Group` | Already wraps `Command.Dialog` at `AppShell` level; new groups slot into existing JSX. |
| `@tanstack/react-router` | `^1.168.24` [VERIFIED: package.json] | `validateSearch` append-only extension on 3 routes; `useRouterState` for picker state subscription | Existing pattern in `lib/searchSchemas.ts`. |
| `@tanstack/react-query` | `^5.100.5` [VERIFIED: package.json] | Auto-refresh via `queryClient.invalidateQueries`; per-query `refetchInterval` already encoded in `lib/queries.ts` | Existing pattern (see `lib/queries.ts:167-459`). |
| `lucide-react` | `^1.11.0` [VERIFIED: package.json] | Icons (Clock, RefreshCw, Calendar, History, etc.) | Already the project's icon vocab. |

### Supporting — NEW DEPS (planner must budget)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `sonner` | `2.0.7` [VERIFIED: npm view sonner version, 2025-08-02] | Toast notifications (TIME-02 paste feedback, copy confirmation, "No time range on clipboard", brush-zoom-reset, cap warnings from Phase 25 Plan 10's `pushRecentState`) | **REQUIRED** — no toast lib in tree today [VERIFIED: 0 matches for `toast` / `sonner` import in `frontend/src/`]. React 19 compatible [VERIFIED: `peerDependencies.react = "^18 || ^19"`]. ~9 KB gzip [CITED: emilkowalski/sonner README]. |
| `react-day-picker` | `10.0.0` [VERIFIED: npm view react-day-picker version, 2026-05-08] | Custom-range calendar at bottom of preset list (dual-month, range mode) | **RECOMMENDED** — alternatives (rolling your own) are dramatically more work; date-math edge cases are notorious. React ≥16.8 [VERIFIED: `peerDependencies`]. |
| `date-fns` | `4.1.0` [VERIFIED: npm view date-fns version] | Coerce `now-7d` / `now/d` / `now-1d/d` → absolute Date; format ISO; range math for compare-to-previous (same-length-prior); preset-list label rendering ("Last 7 days") | **REQUIRED transitively** by `react-day-picker@10` [VERIFIED: `npm view react-day-picker dependencies` returns `{ "@date-fns/tz": "^1.4.1", "date-fns": "^4.1.0" }`]. Even without RDP, the relative-token coerce needs date math; `Date` arithmetic for `now/d` (start of day in local TZ) is annoying enough that date-fns pulls its weight. |

### Net new runtime deps for Phase 26
- `sonner` — direct, ~9 KB
- `react-day-picker` — direct
- `date-fns` + `@date-fns/tz` — transitive via react-day-picker (and consumed directly for token coerce)

Three new runtime deps. CONTEXT explicitly flagged this and asked for an honest assessment: this is the honest count. Each is the lowest-friction option for its problem; rolling toast/calendar/date-math by hand for a small surface is a known anti-pattern (see Don't Hand-Roll table below).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sonner` | `react-hot-toast`, `@radix-ui/react-toast` | Radix Toast is the most "Radix-idiom-pure" choice but requires per-trigger Toast.Provider wiring; sonner has one mount point and the cleanest API. `react-hot-toast` is older and uses Promise-style toasts that don't fit the multi-event pattern here. **Sonner wins on ergonomics.** |
| `react-day-picker` | Roll calendar with `<input type="date">` + Radix Popover content | `<input type="date">` styling is browser-vendor-controlled and Chrome's range picker UI is poor. Two `<input>`s loses the "dual-month visual" affordance the preset-list design requires. **RDP wins on UX.** |
| `date-fns` | `Temporal` API polyfill, native `Date` only, `dayjs` | `Temporal` not in production-ready browser support yet. Native `Date` is fine for `now-7d` (`Date.now() - 7*86400_000`) but `now/d` (start of *local* day) requires manual handoff to Date constructors. `dayjs` competes — but RDP pulls date-fns regardless. **date-fns wins on transitive cost.** |
| Recharts `<Brush />` | Custom drag overlay on top of chart | Recharts `<Brush />` is keyboard-accessible out of the box (Tab to chart → arrow keys move travellers [CITED: github.com/recharts/recharts storybook/stories/API/Accessibility.mdx]); a custom drag handler would need re-implementation of focus/keyboard nav. **Recharts wins on a11y.** |

**Installation:**
```bash
pnpm add sonner@^2 react-day-picker@^10 date-fns@^4
```

**Version verification:** All three confirmed against npm registry on 2026-05-12. Lockfile must capture transitively-installed `@date-fns/tz`.

## Architecture Patterns

### System Architecture Diagram

```
                                ┌─────────────────────────────────────┐
                                │       URL  (TanStack Router)        │
                                │  ?time_from=now-7d&time_to=now      │
                                │  ?schemaVersion=1   (+ existing)    │
                                └──┬──────────┬───────────────────┬───┘
                                   │ write    │ read              │ read
                                   │          │                   │
   ┌───────────────────┐           │          │                   │
   │ AppShellHeader    │           │          │                   │
   │ ┌───────────────┐ │           │   ┌──────▼──────┐   ┌────────▼──────────┐
   │ │TimePicker     │─┼───────────┘   │ Panels on   │   │ CommandPalette    │
   │ │  trigger      │ │               │ /, /activity│   │  Recents group    │
   │ │  +popover     │ │               │ /sessions/  │   │  Time range group │
   │ └───────────────┘ │               │  compare    │   │  Density group    │
   │ ┌───────────────┐ │               │  ↓ coerce   │   └───────────────────┘
   │ │RefreshDropdown│ │               │ relative→abs│             │
   │ └───────────────┘ │               │ via date-fns│             │ keyboard
   └───────────────────┘               └─────┬───────┘             │ events
            │                                │ queryFn             │ Cmd+K
            │ click preset                   │                     │ Cmd+Shift+C
            │ ↓ navigate({ search: ... })    │ refetch on URL chg  │ Cmd+Shift+V
            │                                ▼                     │
            │                          ┌───────────────┐           │
            │                          │ React Query   │           │
            │                          │ cache         │           │
            │                          │ (per-key      │           │
            │                          │  refetchInter)│           │
            │                          └───────┬───────┘           │
   ┌────────▼──────────────┐                   │ http               │
   │ window setInterval()  │                   │                    │
   │ on auto-refresh tick  │                   ▼                    │
   │ queryClient.invalidate│            ┌────────────────┐          │
   │ Queries({…}) PAUSED   │            │ Backend        │          │
   │ if absolute window    │            │ /api/...?range=│          │
   │ (brush-zoom)          │            │   today|7d|30d │          │
   └───────────────────────┘            └────────────────┘          │
                                                                    │
   ┌───────────────────────┐    write on every navigation           │
   │ RecentStateTracker    │────────────────────────────┐           │
   │ (Phase 25 plan 10)    │                            ▼           │
   │ writes ad-hoc states  │                  ┌───────────────────┐ │
   └───────────────────────┘                  │ localStorage      │ │
                                              │ cmc.recents.routes│ │
   ┌───────────────────────┐    write on      │ cmc.savedView.    │◀┘
   │ NEW: RecentRoutes     │    every nav     │   recent.<route>  │
   │ Tracker effect        │─────────────────▶│                   │ read
   └───────────────────────┘                  └─────────┬─────────┘ ↓ on render
                                                        │       ┌────────────────┐
                                                        │       │ Sidebar Recently│
                                                        └──────▶│ Visited section │
                                                                │ (last 3 routes) │
                                                                └────────────────┘
                                              ┌─────────────────────────────────┐
                                              │ Sonner <Toaster /> at AppShell  │
                                              │ toast.success("Time range copied")│
                                              │ toast.message("Pasted: last 7d")│
                                              │ toast.error("No range on clip") │
                                              └─────────────────────────────────┘
```

### Recommended file additions / changes

```
frontend/src/
├── components/
│   ├── shell/
│   │   ├── AppShellHeader.tsx          # Mount <TimePicker /> + <RefreshDropdown />
│   │   │                                # (un-hide pre-registered time-picker-trigger)
│   │   └── Sidebar.tsx                  # Mount <RecentlyVisitedSection /> between
│   │                                    #  Pinned and Operate
│   ├── time/                            # NEW directory
│   │   ├── TimePicker.tsx              # Popover trigger + preset list + RDP calendar
│   │   ├── RefreshDropdown.tsx         # Adjacent dropdown (off / 30s / 1m / 5m)
│   │   ├── AutoRefreshController.tsx   # Zero-render effect: window setInterval +
│   │   │                                 queryClient.invalidateQueries; pauses if
│   │   │                                 time_from/_to are absolute (brush-zoom)
│   │   ├── ChartBrushController.tsx    # Wraps a chart's <Brush /> → navigate(...)
│   │   ├── CompareToggle.tsx           # Panel-header toggle (TIME-04)
│   │   └── __tests__/*.test.tsx
│   ├── recents/                         # NEW directory
│   │   ├── RecentRoutesTracker.tsx     # Zero-render effect: write cmc.recents.routes
│   │   ├── RecentlyVisitedSection.tsx  # Sidebar section: read top-3 routes
│   │   └── __tests__/*.test.tsx
│   └── ui/
│       └── ResetZoomButton.tsx         # Chart-header chrome (TIME-05)
├── lib/
│   ├── time/                            # NEW directory
│   │   ├── grafanaSyntax.ts            # Parse 'now-7d' / 'now/d' → { offsetMs,
│   │   │                                 snap: 'd'|'w'|'M'|null, sign: -|+ }
│   │   ├── coerce.ts                   # coerceToAbsolute({ token, refDate }) → Date
│   │   ├── rangeToVocab.ts             # bridge: { from, to } → 'today'|'7d'|'30d'
│   │   │                                 (best-fit mapping for back-compat with
│   │   │                                  existing useTokens/useCache/etc.)
│   │   ├── clipboard.ts                # serializeRange / parseRangeFromText
│   │   └── __tests__/*.test.ts
│   ├── recents.ts                       # NEW — cmc.recents.routes FIFO ring
│   ├── searchSchemas.ts                 # Append { time_from, time_to } extractor
│   │                                     (does NOT bump SCHEMA_VERSION — adding a
│   │                                     field with default undefined is additive,
│   │                                     existing deep-links continue to resolve)
│   └── queries.ts                       # Optional: add a useGlobalRange() hook so
│                                          panels read time_from/_to off the URL
│                                          and call existing useTokens etc with the
│                                          coerced vocab. (Discretion zone — see
│                                          "Bridge strategy" below.)
└── routes/
    ├── index.tsx                        # validateSearch += time_from?, time_to?
    ├── activity.tsx                     # validateSearch += time_from?, time_to?
    └── sessions_.compare.tsx            # validateSearch += time_from?, time_to?
                                           (a, b stay; schemaVersion stays at 1)
```

### Pattern 1: URL-state-as-source-of-truth

**What:** The global time range lives ONLY in `useSearch()` — never in React state, never in a Provider/Context. Every consumer (panels, brush handlers, Cmd+K commands) reads from `useRouterState({ select: (s) => s.location.search })` or `Route.useSearch()`. Writes go through `navigate({ search: (prev) => ({ ...prev, time_from, time_to }) })`.

**When to use:** Always for the time range. URL is the natural home — saved views serialize it for free, Cmd+Shift+C copy is a URL fragment, brush-zoom updates it, deep-links bookmark it. Mirrors Phase 25's pattern verbatim.

**Example:**
```typescript
// Source: existing pattern in frontend/src/components/ui/CommandPalette.tsx:152
import { useNavigate, useRouterState } from '@tanstack/react-router'

function TimePickerTrigger() {
  const location = useRouterState({ select: (s) => s.location })
  const navigate = useNavigate()
  const search = (location.search ?? {}) as Record<string, unknown>
  const timeFrom = typeof search.time_from === 'string' ? search.time_from : undefined
  const timeTo = typeof search.time_to === 'string' ? search.time_to : undefined

  function applyPreset(from: string, to: string) {
    // Function-form per Pitfall 4 of 16-RESEARCH.md (no stale-closure loop).
    navigate({
      to: location.pathname as any,
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        time_from: from,
        time_to: to,
      }),
    })
  }
  // ...
}
```

### Pattern 2: Append-only validateSearch (LOCKED INVARIANT)

**What:** Add `time_from?: string | undefined` and `time_to?: string | undefined` to `IndexSearch`, `ActivitySearch`, `CompareSearch`. Validator strips unknown values to `undefined`. SCHEMA_VERSION **stays at 1** — new fields with `undefined` default reproduce pre-Phase-26 behavior identically [VERIFIED: `searchSchemas.ts:40-54` + `docs/url-contract.md:21`].

**Validator example:**
```typescript
// frontend/src/routes/activity.tsx — Phase 26 extension
const GRAFANA_REL = /^now(?:[-+]\d+[smhdwMy](?:\/[dwMy])?|\/[dwMy])?$/
const ISO_ABS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/  // start of ISO-8601
function asTimeToken(v: unknown): string | undefined {
  return typeof v === 'string' && (GRAFANA_REL.test(v) || ISO_ABS.test(v))
    ? v : undefined
}
export function validateSearch(raw: Record<string, unknown>): ActivitySearch {
  return {
    schemaVersion: coerceSchemaVersion(raw),
    time_from: asTimeToken(raw.time_from),
    time_to: asTimeToken(raw.time_to),
  }
}
```

### Pattern 3: Zero-render effect components for cross-cutting wiring

**What:** Like Phase 25's `DefaultViewLoader` and `RecentStateTracker`, side-effecting components return `null` and live inside `AppShell`. Phase 26 adds two of these: `AutoRefreshController` (window setInterval + invalidateQueries) and `RecentRoutesTracker` (writes `cmc.recents.routes`).

**Example:**
```typescript
// frontend/src/components/recents/RecentRoutesTracker.tsx
import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { pushRecentRoute } from '../../lib/recents'
const IN_SCOPE = new Set(['/', '/activity', '/skills', '/skills/$name',
  '/cost', '/alerts', '/sessions/compare'])

export function RecentRoutesTracker() {
  const location = useRouterState({ select: (s) => s.location })
  useEffect(() => {
    const route = location.pathname  // normalize as needed
    if (!IN_SCOPE.has(route)) return
    pushRecentRoute({ route, visitedAt: Date.now() })
    // Optionally: window.dispatchEvent(new CustomEvent('cmc:recents-changed'))
    //  if Sidebar consumers don't already re-render on navigation.
  }, [location.pathname])
  return null
}
```

### Pattern 4: Brush-zoom → URL via onChange + onDragEnd

**What:** Place `<Brush />` inside the time-series chart on `/activity`. Bind `onDragEnd` (commit) to a navigate-back-up handler that writes absolute `time_from` / `time_to`. The chart re-receives data via the URL flow (re-query with new range) — chart does NOT update its own state. This is "URL is the source of truth" applied to brush-zoom.

**Why `onDragEnd` and not `onChange`:** `onChange` fires on every mouse-move during the drag (high frequency). `onDragEnd` fires once on commit. [VERIFIED: github.com/recharts/recharts/blob/main/src/cartesian/Brush.tsx — `onChange?: OnBrushUpdate; onDragEnd?: OnBrushUpdate;`]

**Index → timestamp mapping:** Brush's onChange/onDragEnd receives `{ startIndex, endIndex }` (numeric indices into the data array), NOT timestamps [CITED: same source]. Caller must map index back to the data row's timestamp:
```typescript
function onDragEnd({ startIndex, endIndex }: { startIndex: number; endIndex: number }) {
  const fromTs = data[startIndex].day  // ISO or 'YYYY-MM-DD'
  const toTs = data[endIndex].day
  navigate({
    to: location.pathname,
    search: (prev) => ({ ...prev, time_from: fromTs, time_to: toTs }),
  })
}
```

**The chart on `/activity` that gets the Brush:** `ChartsStrip.tsx` (the 14-day token trend BarChart — line 43-62) is the clearest fit because it already operates on a time-axis dataset. ActivityHeatmap renders a `HeatmapGrid` (not a recharts chart), so it's not a Brush candidate. **Recommendation:** Wire Brush on `ChartsStrip` first; document the pattern; defer additional chart-level brushes to Phase 27 if any.

### Pattern 5: Auto-refresh layered on existing per-query intervals

**What:** Existing panels already have per-query `refetchInterval` in `lib/queries.ts` (5s for live system health, 60s for usage charts, etc.). Auto-refresh is an ORTHOGONAL window-level interval that *additionally* invalidates the same query keys at the user-chosen cadence.

**Two valid implementations — recommend (a):**
- (a) **Window setInterval + `queryClient.invalidateQueries({ predicate })`**, predicated on a tag list of "time-anchored query keys". Effect cleans up when interval changes. Pauses when `time_from`/`time_to` are absolute (brush-zoom commit produces absolute timestamps; absolute → window is frozen → refresh is paused per CONTEXT lock).
- (b) Modify each panel hook's `refetchInterval` based on the picker state. Wider blast radius (touches every existing query factory). Rejected.

### Anti-Patterns to Avoid

- **React Context for the time range.** Mirrors the `DensityProvider` mistake we already correctly avoided: URL is already a free Provider — Context would be redundant *and* desync-prone.
- **`useState` in the picker for from/to.** Local state for "is popover open" is fine; local state for the range value is not — it'll race the URL on saved-view application, brush-zoom, and Cmd+Shift+V paste.
- **Sending time_from/time_to to backend without coercion.** Backend doesn't accept the params today (verified — see Pitfall 1). Coerce client-side and send via existing `?range=` vocab or via per-route best-fit (see "Bridge strategy").
- **Per-panel "global picker disabled this panel" flags.** TIME-02 says panels not time-aware opt out cleanly — they opt out by NOT reading `time_from`/`time_to`. Don't gate them with a flag.
- **Adding refresh-interval to the URL.** It's chrome state, not navigation state. Save in localStorage `cmc.autoRefresh.interval` for persistence; do NOT serialize into copy/paste clipboard payloads (CONTEXT punted to Claude — recommendation: keep narrow).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast notifications | Custom portal + auto-dismiss state machine | `sonner` | Stacking, position config, keyboard shortcut to focus toasts, RTL, queue, animation timing — all solved [CITED: emilkowalski/sonner Toaster props]. |
| Date math (now-1d, now/d, now-1d/d) | Math on `Date.getTime()` | `date-fns` (`startOfDay`, `subDays`, `subWeeks`, `startOfMonth`, `format`) | `now/d` is "start of the local day" — varies by TZ. `now-1d/d` is "start of yesterday". Edge cases (DST transitions) are easy to get wrong. |
| Range calendar UI | Two `<input type="date">` | `react-day-picker` mode="range" | Native date inputs don't support range selection; can't show two months side-by-side; cross-browser inconsistent styling. RDP solves all three [CITED: gpbl/react-day-picker docs/selections/range-mode.mdx]. |
| Brush-zoom on time-series | Custom drag overlay | recharts `<Brush />` | Built-in keyboard a11y (Tab to chart → arrows move travellers) [CITED: recharts storybook/stories/API/Accessibility.mdx]. `onDragEnd` callback fires on commit. |
| Localized day/week/month boundaries | Manual math | `date-fns/locale` + `startOfDay` / `startOfWeek` (configurable weekStartsOn) | Locale week-start (Sunday vs Monday) is locale-aware; we likely don't care for v1.3 (single user) but the helper is free. |
| Grafana-style token parsing | Regex + arithmetic from scratch | A tight inline parser in `lib/time/grafanaSyntax.ts` (vocab is small; an external lib like `rte-moment` would be overkill) | Lightweight enough to hand-roll (vocab: `now`, `now-Nx`, `now/x`, `now-Nx/x` where `x ∈ {s,m,h,d,w,M,y}`) **but** the math behind it goes through date-fns. |

**Key insight:** This phase's tempting hand-rolls all sit on top of well-known JS pain points (calendar UI, toasts, date math, brush drag). Each is the wrong place to spend time.

## Runtime State Inventory

> Phase 26 is greenfield additive (new chrome + per-route adoption). Not a rename/refactor/migration. Section intentionally minimal.

- **localStorage keys added:**
  - `cmc.recents.routes` (NEW — FIFO ring of `{ route, visitedAt }`, CONTEXT cap not specified — recommend 20 to keep ahead of the sidebar's 3 + Cmd+K's 5)
  - `cmc.autoRefresh.interval` (NEW — persists last selected refresh interval; CONTEXT punts to Claude, recommend persisting)
- **localStorage keys consumed (existing):**
  - `cmc.savedView.recent.<route>` (Phase 25 — for Cmd+K Recents ad-hoc-states slot)
  - `cmc.density` (existing — Cmd+K density command writes via `setDensity()`)
- **URL params added (additive):** `time_from`, `time_to` on `/`, `/activity`, `/sessions/compare`. Already preserved in `docs/url-contract.md:11-12` as "Phase 26 may add."
- **No backend state changes this phase.** Backend route signatures unchanged.
- **No build artifacts.** Pure source-tree additions.

## Common Pitfalls

### Pitfall 1: Backend doesn't accept `time_from`/`time_to` — only `?range=` vocab
**What goes wrong:** A naïve implementation passes `?time_from=now-7d&time_to=now` directly to `/api/usage/tokens` — backend silently ignores or 422s.
**Why it happens:** Backend routes use `Literal["today", "7d", "30d"]` (Pydantic-validated, closed sets) — see `backend/cmc/api/routes/alerts.py:267`, `backend/cmc/api/routes/sessions.py:262`, `backend/cmc/api/routes/skills.py:91`. Only SSE `/api/system/otel-events?since=<ISO>` accepts an absolute timestamp.
**Frequency of pattern across backend routes:** every analytical endpoint that the time-anchored panels on `/` and `/activity` consume.
**How to avoid:**
- **Recommended (frontend-coerce):** A `useGlobalRange()` hook reads `time_from`/`time_to` from the URL, calls a `rangeToVocab()` helper that maps `[from, to]` → best-fit `Range` literal (e.g., `now-1h..now` → snap to `'today'`, `now-7d..now` → `'7d'`, `now-30d..now` → `'30d'`, custom absolute → `'30d'` as the conservative widest). Panels use the vocab to call existing `useTokens(vocab)` etc.; client-side slices the result to the picker's exact range. Server-side coerce is deferred.
- **Alternative (backend extension):** Add `time_from?: str | None, time_to?: str | None` to every analytical endpoint, accept ISO + Grafana tokens, coerce server-side. Larger blast radius, +N pytests, defers panel work.
- **CONTEXT bias:** "backend coerces relative → absolute at query time" — suggests Alternative. **But** the phase scope on the FE side is already large; the recommended pragmatic path is to land frontend-coerce in Phase 26 and queue backend acceptance as a Phase 27 polish task. Planner should call this out and let user lock the path.
**Warning signs:** If you find yourself writing `?time_from=...` into a fetch URL, stop and check whether the backend route accepts that param.

### Pitfall 2: validateSearch is APPEND-ONLY — must default to behavior reproducer
**What goes wrong:** Adding `time_from: string` (non-optional) breaks every existing deep-link.
**Why it happens:** `docs/url-contract.md:21` lock: "Adding a search param to an existing route is BACKWARDS-COMPATIBLE if and only if the new param has a default value that reproduces the pre-change behavior."
**How to avoid:** `time_from?: string | undefined` — when absent, the panel falls back to the per-route hardcoded default (`/` → 24h, `/activity` → 1h, `/sessions/compare` → 7d). Test: `/activity` with no search params still renders identically to pre-Phase-26 modulo the default-range default.
**Warning signs:** Phase 24 `backend/tests/test_url_contract.py` enforces the doc/route bidirectional contract — but it does NOT enforce backward-compat of `validateSearch`. A new e2e probe might be needed (e.g., navigate to bare `/activity`, assert no error toast).

### Pitfall 3: `<html data-density>` lives at `:root` — Cmd+K command must NOT add Context
**What goes wrong:** A well-meaning refactor adds a `<DensityContext>` so Cmd+K density command can read current value. POLI-11 "zero-rerender gate" breaks; Phase 24 `DensityProvider` test fixtures break.
**Why it happens:** `lib/density.ts:7-9` invariant — "Density tokens MUST live on `:root` so Radix Portal-mounted content inherits them." Cmd+K command should call `setDensity(d)` and read current value via `getDensity()` directly (same as `DensityToggle.tsx:38-39`).
**How to avoid:** Use the same idiom as `DensityToggle` — local `useState` mirrors the current value for the checkmark indicator; the actual state lives in `<html data-density>` / localStorage.
**Warning signs:** Any `import { useDensity }` reference in a new file.

### Pitfall 4: 26 `<ResponsiveContainer>`s — count must stay flat
**What goes wrong:** A new chart adds a 27th ResponsiveContainer; some other gate counts on the existing 26 (visual diff fixtures, capacity assumption, etc.).
**Why it happens:** CONTEXT explicitly calls out: "recharts (with 26 `ResponsiveContainer`s, count must stay flat)." [VERIFIED: 3+3+3+4+3+3+3+4 = 26 across `frontend/src/components/panels/*.tsx`].
**How to avoid:** Brush-zoom adds NO new chart. It places `<Brush />` *inside* `ChartsStrip`'s existing `<BarChart>` — which is wrapped by an existing `<ResponsiveContainer>`. Count stays at 26.
**Warning signs:** A grep diff showing a net-new `<ResponsiveContainer>` in the Phase 26 commits.

### Pitfall 5: testid registry — every new testid must be registered before lint passes
**What goes wrong:** Adding `data-testid="time-picker-popover"` without updating `docs/testid-registry.md` fails `cmc/testid-registry-only` ESLint rule.
**Why it happens:** Phase 24 POLI-14 locked rule.
**How to avoid:** Every new testid added in Phase 26 must be added to `docs/testid-registry.md` IN THE SAME COMMIT. Expected additions:
- `time-picker-trigger` (already registered; un-hide in JSX)
- `time-picker-popover`
- `time-picker-preset-{value}` (dynamic, e.g., `time-picker-preset-7d`)
- `time-picker-calendar`
- `time-picker-custom-apply`
- `refresh-dropdown-trigger`
- `refresh-option-{interval}` (dynamic — off|30s|1m|5m)
- `refresh-active-indicator`
- `reset-zoom-button`
- `compare-overlay-toggle-{panel-id}` (dynamic)
- `cmdk-density-{value}` (dynamic — compact|comfortable|cozy)
- `cmdk-time-range-{value}` (dynamic — 1h|24h|7d|30d|copy|paste)
- `cmdk-recents-route-{slug}` (dynamic)
- `cmdk-recents-state-{idx}` (dynamic)
- `sidebar-section-recently-visited`
- `sidebar-recently-visited-route-{slug}` (dynamic)
- `toast` and per-event toast bodies are sonner-internal; sonner's testids are NOT this codebase's testids. Sonner mounts in a document.body portal; if Playwright needs to find a specific toast body, use sonner's `data-` attributes or aria-roles.
**Warning signs:** ESLint `cmc/testid-registry-only` error in CI.

### Pitfall 6: z-index ladder — time picker popover at 40, calendar inside must NOT escalate
**What goes wrong:** A nested popover inside the time picker reaches for a higher z-index ad hoc and breaks the ladder.
**Why it happens:** `docs/z-index-ladder.md:15` reserves `--cmc-z-popover: 40` for "Time picker (Phase 26), info popovers".
**How to avoid:** Use `--cmc-z-popover` for the popover itself. The RDP calendar mounts INSIDE the popover content — same stacking context — no new variable needed. Toasts (sonner) use `--cmc-z-toast: 90` which already exists in the ladder.
**Warning signs:** A new `--cmc-z-time-picker-calendar` variable or a `style={{ zIndex: 50 }}` in any new component.

### Pitfall 7: 8 v1.2 carry-over contrast/aria classes — Phase 25 close-discovered, they all land on Phase 26's routes
**What goes wrong:** Phase 26 adoption sweep touches `SessionsTable.tsx`, `ActivityHeatmap.tsx`, `OtelPanel.tsx`, `SystemHealthStrip.tsx` — these contain the 8 carry-over classes. If Phase 26 PRs don't fix them, axe-core continues to allow them as Accepted Exception (b). If Phase 26 PRs do touch the same elements, the axe gate may newly attribute the violations to Phase 26 chrome.
**Why it happens:** Phase 25 25-VISUAL-CHECK.md §"Accepted Exception (b)" enumerates: `.cmc-system-health-strip__*` (on `/`), `.cmc-numeric` (on `/`, `/activity`), `.cmc-heatmap-cell` (on `/activity`), `.cmc-otel-feed` (on `/activity`), `.cmc-sessions-table-header__label` (on `/activity`), `<select aria-label="Range filter">` (on `/activity`). Phase 26 sweeps three of these four route surfaces. [CITED: `.planning/phases/25-saved-views-backend-frontend/25-VISUAL-CHECK.md:131-133, 354-356`]
**Decision required:** Two coherent options —
- **(A) Fix carry-overs as part of Phase 26 adoption.** Pro: VISUAL-CHECK becomes cleaner; the swap to density tokens is a natural moment to rebalance `--cmc-text-subtle`. Con: more scope; coordination with the `--cmc-text-subtle` token rebalance (Phase 25 close cited Phase 26/27 as the rebalance moment).
- **(B) Punt to Phase 27 token rebalance.** Pro: Phase 26 stays scoped to time/Cmd+K/adoption-mechanical. Con: 8 violations carry forward another phase; axe-gate exception list grows stale.
- **Recommendation: (A) lite** — fix `.cmc-numeric` and `.cmc-system-health-strip__*` (mechanical: bump body-text color from `--cmc-text-subtle` to `--cmc-text-default`), defer the `.cmc-heatmap-cell` `aria-prohibited-attr` and `.cmc-otel-feed` `scrollable-region-focusable` to Phase 27 (those are semantic-pattern fixes, not contrast). Planner should choose.
**Warning signs:** Phase 26 VISUAL-CHECK with the same 8 violations listed.

### Pitfall 8: SHEL-05 Sidebar Recently Visited needs a same-tab update channel
**What goes wrong:** User navigates to `/activity`. `RecentRoutesTracker` writes `cmc.recents.routes` in `useEffect`. Sidebar Pinned section re-renders because `useRouterState` is its dep; Recently Visited section re-renders too (if mounted in Sidebar) because the Sidebar's parent commits a new tree on navigation. **BUT** the localStorage write happens in `useEffect`, which runs AFTER the render — so the Sidebar's read of `getRecentRoutes()` sees the PRE-navigation state for one frame.
**Why it happens:** This is exactly the Phase 25 plan 09 Accepted Exception (c) pattern.
**How to avoid:** Three options, in order of preference:
- (a) Read `cmc.recents.routes` from a `useSyncExternalStore` subscription that listens to a custom `window.dispatchEvent(new CustomEvent('cmc:recents-changed'))` fired AFTER the `pushRecentRoute()` write. Component re-renders once the effect completes. **Recommended** — surgical, no new dep.
- (b) Treat the "one frame stale" as accepted (mirror Phase 25 plan 09's resolution for pin-write). User navigates → URL changes → second render reads the fresh state. Visual cost: the *previous* route appears at the top of Recently Visited for one frame. **Acceptable v1**, especially because RecentRoutes already filters out the current route from its display list (recommended UX: don't show the route you're currently on at the top of "Recently Visited").
- (c) Hoist recents into a React Context with state. Adds a Provider that re-renders on every navigation — Phase 24 explicitly avoided this for Density; should avoid here too.
- **Recommendation:** (b) for v1, with (a) as fallback if VISUAL-CHECK flags the flicker. The currently-active route filter is the cleanest user-facing behavior anyway.
**Warning signs:** Operator screenshot shows "Activity" at the top of "Recently Visited" while standing on `/activity`.

### Pitfall 9: `state_json` opacity (Phase 25 invariant) — compare-overlay state must not break round-trip
**What goes wrong:** A panel reads `state_json.compareOverlay = true`, sets local state, but DOESN'T re-emit the key on save → next load of the same saved view forgets the toggle state.
**Why it happens:** Phase 25 25-RESEARCH Pitfall 6 — `state_json` is opaque to backend; round-trip integrity is enforced ONLY by `validateSearch`. If the toggle's value isn't in the URL, it's not in the saved view.
**How to avoid:** Compare-overlay state must live in URL search params (e.g., `?cmp_panel_id=true,&cmp_other_panel=true`), then `validateSearch` extracts it. Per CONTEXT: "Per-panel state is opaque and persists inside the saved view's `state_json`." This means URL → validateSearch → state_json — the same flow Phase 25 uses. **Don't store compare-toggle in localStorage** (it would not save with the view).
- **Open Q:** what's the URL-key shape for per-panel compare-overlay flags? CONTEXT says "opaque" — recommend a single `compare_panels=panel1,panel2` comma-list (one URL param, additive-safe, easy to validate, easy to fork-save).
**Warning signs:** Saved-view test reveals a compare-toggle that doesn't round-trip.

### Pitfall 10: cmdk `Command.Group` heading ordering is JSX order — not config
**What goes wrong:** Planner expects to pass a `priority={...}` prop or similar. cmdk doesn't have one — visual ordering of groups in `Command.List` follows JSX child order.
**Why it happens:** cmdk is a tiny lib (~5K loc). Group order is structural.
**How to avoid:** JSX top-to-bottom matches CONTEXT's group order: Recents → Saved Views → Pages → Time range → Density → Actions. Rearrange the existing JSX in `CommandPalette.tsx` rather than introducing an order-config layer.
**Warning signs:** Cmd+K test "Recents shows first" fails because Saved Views comes first in JSX.

### Pitfall 11: Toasts in tests — sonner mounts a portal that needs document.body access
**What goes wrong:** Vitest tests for "Cmd+Shift+C fires toast.success" can't find the toast in the rendered output.
**Why it happens:** `<Toaster />` portals to `document.body`, not the rendered tree.
**How to avoid:** Mount `<Toaster />` in the AppShell once; tests either use `screen.getByText(...)` against `document.body` (works because sonner DOM exists globally) OR mock `import('sonner')` with `vi.mock` to capture the call. The latter is the cleaner unit-test pattern; the former works for integration.
**Warning signs:** A test wraps a component in a custom test fixture that doesn't include `<Toaster />`, then asserts on toast presence.

### Pitfall 12: Per-route default range vs DefaultViewLoader collision
**What goes wrong:** User has set a saved-view-as-default for `/activity`. Visits bare `/activity`. DefaultViewLoader applies the saved-view's `state_json` (which includes `time_from`/`time_to`). The per-route hardcoded default (last 1h) NEVER fires — correct!
**But:** If DefaultViewLoader's apply is async (replace navigation), the panel might render once with no time params, falling back to the hardcoded default, then re-render with the saved view's range. Flash of wrong range.
**How to avoid:** Mirror Phase 25 plan 10's DefaultViewLoader pattern — `replace: true` navigation, one-shot per route entry. The first paint of the panel is "skeleton or loading" until search resolves. Phase 25 25-VERIFICATION line 30 confirms the Pitfall-8 lock is implemented.
**Warning signs:** Visual flicker on cold-load of a route with a default view that has time params.

### Pitfall 13: Phase 25 Accepted Exception (a) — `/skills/$name` semantic defaults break DefaultViewLoader
**What goes wrong:** The phase planner copies the Phase 25 DefaultViewLoader test pattern to `/`, `/activity`, `/sessions/compare` and discovers one of them has `validateSearch`-filled semantic defaults beyond `schemaVersion`. DefaultViewLoader's gate ("only fire when search is bare") is defeated.
**Why it happens:** `/skills/$name`'s validateSearch fills `range=14d` by default — that's how Accepted Exception (a) manifests. [CITED: `25-VERIFICATION.md:30, 354`]
**Inventory check** [VERIFIED: read `frontend/src/routes/index.tsx`, `activity.tsx`, `sessions_.compare.tsx`]:
- `/` validateSearch: returns ONLY `{ schemaVersion }` — clean.
- `/activity` validateSearch: returns ONLY `{ schemaVersion }` — clean.
- `/sessions/compare` validateSearch: returns `{ schemaVersion, a, b }` — `a` and `b` are OPTIONAL on input (undefined when not present), so this is clean too.
- **Conclusion:** All three Phase 26 routes are clean for DefaultViewLoader purposes. **Phase 26 must NOT add `time_from`/`time_to` with non-undefined defaults** — they MUST default to `undefined`, with per-route fallback applied AT THE PANEL READ SITE (not in the validator). This keeps DefaultViewLoader's gate working.
**Warning signs:** A validator like `time_from: typeof raw.time_from === 'string' ? raw.time_from : 'now-1h'` — that defaults the field and would defeat DefaultViewLoader.

### Pitfall 14: axe-core gate — net new accessibility violations fail VISUAL-CHECK
**What goes wrong:** New chrome (popover with calendar, dropdown with intervals) ships with non-AA contrast or missing aria-labels.
**Why it happens:** Phase 24 POLI-12 axe gate is enforced.
**How to avoid:** Each new interactive needs aria-label (sonner Toaster comes with role="region" pre-built; Radix Popover/DropdownMenu come with focus-management). RDP has accessibility built-in [CITED: gpbl/react-day-picker docs]. The new tests:
- Cmd+K palette opens and Recents group is reachable via Tab.
- Time picker trigger is keyboard-operable from header.
- Auto-refresh active state is announced (aria-live or visual-only — CONTEXT punts; recommend aria-live="polite" + visual pulse).
**Warning signs:** New axe violations during phase close.

## Code Examples

### Grafana token parser (recommended skeleton)
```typescript
// frontend/src/lib/time/grafanaSyntax.ts
// Tight inline parser. Vocab matches Grafana 2024-01-28: now, now-Nu, now/u, now-Nu/u
// where u ∈ {s, m, h, d, w, M, y}. Returns parsed structure; coerce.ts does Date math.

const TOKEN_RE = /^now(?:([-+])(\d+)([smhdwMy]))?(?:\/([dwMy]))?$/

export interface ParsedToken {
  sign: -1 | 1
  amount: number
  unit: 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'y' | null
  snap: 'd' | 'w' | 'M' | 'y' | null
}

export function parseGrafanaToken(t: string): ParsedToken | null {
  if (t === 'now') return { sign: 1, amount: 0, unit: null, snap: null }
  const m = TOKEN_RE.exec(t)
  if (!m) return null
  const [, signRaw, amountRaw, unitRaw, snapRaw] = m
  return {
    sign: signRaw === '-' ? -1 : 1,
    amount: amountRaw ? Number(amountRaw) : 0,
    unit: (unitRaw as ParsedToken['unit']) ?? null,
    snap: (snapRaw as ParsedToken['snap']) ?? null,
  }
}
```

### Coerce to absolute (using date-fns)
```typescript
// frontend/src/lib/time/coerce.ts
// Source pattern: github.com/grafana/grafana/blob/main/packages/grafana-data/src/datetime/rangeutil.ts
import { addSeconds, addMinutes, addHours, addDays, addWeeks, addMonths, addYears,
         startOfDay, startOfWeek, startOfMonth, startOfYear } from 'date-fns'
import { parseGrafanaToken } from './grafanaSyntax'

const ADDERS = { s: addSeconds, m: addMinutes, h: addHours,
                 d: addDays, w: addWeeks, M: addMonths, y: addYears }
const STARTS = { d: startOfDay, w: startOfWeek, M: startOfMonth, y: startOfYear }

export function coerceToAbsolute(token: string, ref: Date = new Date()): Date | null {
  // Already absolute?
  if (/^\d{4}-\d{2}-\d{2}T/.test(token)) return new Date(token)
  const parsed = parseGrafanaToken(token)
  if (!parsed) return null
  let d = ref
  if (parsed.unit && parsed.amount > 0) {
    d = ADDERS[parsed.unit](d, parsed.sign * parsed.amount)
  }
  if (parsed.snap) {
    d = STARTS[parsed.snap](d)
  }
  return d
}
```

### Clipboard serialization (TIME-02)
```typescript
// frontend/src/lib/time/clipboard.ts
export function serializeRange(timeFrom: string, timeTo: string): string {
  // Format chosen for legibility in Slack / GitHub issues paste.
  const params = new URLSearchParams({ time_from: timeFrom, time_to: timeTo })
  return `?${params.toString()}`
}
export function parseRangeFromText(text: string): { time_from: string; time_to: string } | null {
  // Accept ?time_from=...&time_to=... as a fragment OR a full URL.
  const idx = text.indexOf('?')
  if (idx < 0) return null
  try {
    const params = new URLSearchParams(text.slice(idx + 1))
    const f = params.get('time_from'), t = params.get('time_to')
    if (!f || !t) return null
    // Optional: validate against asTimeToken before returning.
    return { time_from: f, time_to: t }
  } catch { return null }
}
```

### Sonner Toaster mount (one-time at AppShell)
```typescript
// frontend/src/components/shell/AppShell.tsx — Phase 26 addition
import { Toaster } from 'sonner'
// ...inside the JSX, as a sibling of <CommandPalette />:
<Toaster
  position="bottom-right"
  theme="system"
  richColors
  closeButton
  duration={3000}
/>
```

### Cmd+K Recents group structure
```tsx
// frontend/src/components/ui/CommandPalette.tsx — Phase 26 addition (top of Command.List)
<Command.Group heading="Recents" className="cmc-cmdk__group">
  {recentRoutes.slice(0, 5).map((r) => (
    <Command.Item
      key={`route-${r.route}`}
      value={`recent-route-${r.route}`}
      data-testid={`cmdk-recents-route-${slugify(r.route)}`}
      onSelect={() => { navigate({ to: r.route }); close() }}
    >
      <span>{routeLabel(r.route)}</span>
      <span className="cmc-cmdk__item-meta">{formatRelative(r.visitedAt, now)}</span>
    </Command.Item>
  ))}
  {recentAdHocStates.slice(0, 5).map((s, i) => (
    <Command.Item
      key={`state-${i}`}
      value={`recent-state-${i}-${s.route}`}
      data-testid={`cmdk-recents-state-${i}`}
      onSelect={() => { navigate({ to: s.route as any, search: s.state }); close() }}
    >
      <span>{routeLabel(s.route)}</span>
      <span className="cmc-cmdk__item-meta">{summarizeSearch(s.state)}</span>
    </Command.Item>
  ))}
</Command.Group>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `?range=today|7d|30d` literal vocab | `?time_from=&time_to=` Grafana relative tokens | This phase | Backend accepts vocab today; FE coerces; backend extension deferred. |
| Per-panel `RangeToggle` chrome | Global time picker in header | This phase (additive) | RangeToggle persists on individual panels for v1.3 — global picker is the *default*; per-panel toggles override locally (CONTEXT punts to discretion). |
| No toasts | Sonner | This phase | First toast lib in tree; new dep. |
| Density flips via header DensityToggle only | Density flips ALSO via Cmd+K | This phase | Two equally-discoverable paths. |
| No "Recently Visited" surface | Sidebar + Cmd+K Recents | This phase | New localStorage `cmc.recents.routes` ring. |

**Deprecated/outdated:**
- Plotly/Datadog double-click-to-reset for brush-zoom — CONTEXT rejects in favor of explicit "Reset zoom" button.
- Sliding-window auto-refresh — rejected.
- Compare overlay with fixed "same day last week" — rejected (use same-length-prior).

## Project Constraints (from CLAUDE.md)

> `./CLAUDE.md` does NOT exist in the working directory [VERIFIED: Read attempt at `/Users/patrykattc/work/git/claude-mission-control/CLAUDE.md` returned `File does not exist`]. No project-level CLAUDE.md directives to honor. The phase still inherits all locked invariants from `docs/url-contract.md`, `docs/testid-registry.md`, `docs/z-index-ladder.md`, `docs/affordance-checklist.md`, and the Phase 24 ESLint rules.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Frontend-coerce-to-vocab" is the right Phase 26 bridge (Pitfall 1, Pattern 5 alt). | Pitfall 1 / Bridge strategy | If user wants backend acceptance in Phase 26, planner must expand scope by ~3 backend pytests + a coerce helper in `backend/cmc/core/time.py`. Recommended path is friendly to that future change. |
| A2 | A custom `window.dispatchEvent('cmc:recents-changed')` is overkill for v1; accepted-flicker (Pitfall 8 option b) is the right v1. | Pitfall 8 | If VISUAL-CHECK flags the flicker, planner falls back to option (a) — surgical. |
| A3 | `ChartsStrip` (token bar chart) is the correct brush-zoom carrier on `/activity`. | Pattern 4 | If user wants brush-zoom on `ActivityHeatmap` instead, RDP-style heatmap brush is not built into recharts (heatmap is a `HeatmapGrid` custom component). Recommendation: keep brush on ChartsStrip; if heatmap brush is later desired, custom drag overlay required. |
| A4 | Per-panel `RangeToggle` widgets stay alongside the global picker. | State of the Art | If user wants RangeToggle removed entirely, that's a deletion across 8+ panels — coordination cost. CONTEXT punted this to discretion. |
| A5 | Compare-overlay flags live in URL params (not localStorage). | Pitfall 9 | If user wants pure localStorage, saved views won't capture the overlay state. CONTEXT explicitly said state_json piggyback — confirms URL path. |
| A6 | Sonner is the right toast lib (alternatives considered, none beat it). | Standard Stack | Low risk — well-trodden choice. |
| A7 | `react-day-picker@10` is the right calendar lib (pulls date-fns transitively). | Standard Stack | If user prefers a "no calendar lib" path, custom calendar would be ~400 LOC + edge cases. Strongly not recommended. |
| A8 | Hardcoded per-route defaults are applied AT THE PANEL READ SITE, not in `validateSearch`. | Pitfall 13 | Critical — defaulting in the validator breaks DefaultViewLoader's bare-search gate. |
| A9 | Phase 26 fixes `.cmc-numeric` and `.cmc-system-health-strip__*` carry-overs; defers `.cmc-heatmap-cell` aria + `.cmc-otel-feed` semantic to Phase 27. | Pitfall 7 | Planner may choose all-or-nothing; recommendation is the "lite" path. |

**If this table is non-empty:** A1, A8, A9 should be confirmed by the user (or by the planner consulting prior phase verdicts) before plans lock the architecture. A2-A7 are recommendations within Claude's Discretion (CONTEXT explicitly punted these).

## Open Questions

1. **Backend acceptance of `time_from`/`time_to` — Phase 26 or deferred?**
   - What we know: CONTEXT says "backend coerces relative → absolute at query time" — implies backend extension. But the current backend has zero routes accepting absolute time range params (only `?range=` vocab and `?since=`).
   - What's unclear: whether Phase 26 includes the backend ask or defers it. Adoption sweep + time picker + Cmd+K is already a 6-10-plan phase by Phase 25 sizing precedent.
   - Recommendation: Defer backend acceptance to Phase 27 as part of TDBT polish. Phase 26 frontend coerces vocab via `rangeToVocab()`. **User decision required.**

2. **Compare-overlay URL-key shape — single comma-list or per-panel param?**
   - What we know: CONTEXT says state lives in `state_json` opaque. Pitfall 9 forces URL-roundtripping.
   - What's unclear: `?compare_panels=tokenusage,sessionoutcomes` vs `?cmp_tokenusage=true&cmp_sessionoutcomes=true`.
   - Recommendation: single comma-list — easier to validate, easier to fork-save, lower URL noise. Planner decides during plan-cut.

3. **Auto-refresh interval persistence — localStorage or URL?**
   - What we know: It's chrome state. CONTEXT says toast feedback when active, badge/pulse styling.
   - What's unclear: Whether refresh-interval round-trips through a saved view (probably no) and through Cmd+Shift+C/V clipboard (CONTEXT punted — "keep narrow unless reason").
   - Recommendation: localStorage `cmc.autoRefresh.interval` (persists across reloads); NOT in URL (out of clipboard scope); NOT in saved views (orthogonal to URL state).

4. **`RangeToggle` chrome on per-panel cards after Phase 26 — keep or remove?**
   - What we know: Existing panels have per-panel `RangeToggle` widgets (HookActivityCard, TopSkills, others).
   - What's unclear: Whether global picker replaces them (clutter) or layers on (per-panel override).
   - Recommendation: Keep them in v1.3 (per-panel "override the global default") — removing them is a wider deletion than Phase 26 scope. Phase 28 might consolidate.

5. **Sidebar Recently Visited count — REQUIREMENTS says 5, CONTEXT says 3.**
   - What we know: REQUIREMENTS.md `SHEL-05` says "last 5 routes/views"; CONTEXT narrows to "last 3 routes only" in the sidebar.
   - What's unclear: This is a deliberate narrow from CONTEXT discussion. The 5 stays for Cmd+K; the 3 is sidebar-only.
   - Recommendation: Honor CONTEXT (3 in sidebar, 5 in Cmd+K). Planner should note this divergence in the relevant PLAN.md so future readers don't think the spec is contradictory.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `sonner` (registry) | TIME-02 toast feedback | ✓ (registry) | 2.0.7 | None — required |
| `react-day-picker` (registry) | Custom-range calendar | ✓ (registry) | 10.0.0 | Roll calendar with `<input type="date">` × 2 (not recommended) |
| `date-fns` (registry) | Token coerce, range math | ✓ (registry) | 4.1.0 | Native `Date` arithmetic (works for `now-Nu`, fragile for `now/u`) |
| `recharts.Brush` | TIME-05 brush-zoom | ✓ (already installed) | 3.8.1 | Custom drag overlay (not recommended) |
| `@radix-ui/react-popover` | Time picker popover | ✓ (already installed) | 1.1.15 | DropdownMenu (visually wrong fit) |
| Node 20+ for pnpm install | Dev environment | ✓ (existing) | (already verified by Phase 24) | — |

**Missing dependencies with no fallback:** None — all three new packages exist in npm and are React 19 compatible.
**Missing dependencies with viable fallbacks:** None block — recommendation is to install the three new deps.

## Validation Architecture

> `.planning/config.json` does not list `workflow.nyquist_validation` — treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest@^4.1.5` (unit) + `@playwright/test@^1.59.1` (e2e) |
| Config file | `frontend/vitest.config.ts`, `frontend/playwright.config.ts` |
| Quick run command | `pnpm --filter cmc-frontend test` (vitest) |
| Full suite command | `pnpm --filter cmc-frontend test && pnpm --filter cmc-frontend test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHEL-05 | Sidebar Recently Visited shows last 3 routes in order | unit + e2e | `pnpm vitest run src/components/recents/__tests__/RecentlyVisitedSection.test.tsx` | ❌ Wave 0 |
| TIME-01 | Time picker popover opens, presets apply to URL | unit + e2e | `pnpm vitest run src/components/time/__tests__/TimePicker.test.tsx` + `tests/e2e/v13-time-picker.spec.ts` | ❌ Wave 0 |
| TIME-02 | Cmd+Shift+C copies; Cmd+Shift+V pastes; toasts fire | unit + e2e | `pnpm vitest run src/lib/time/__tests__/clipboard.test.ts` + `tests/e2e/v13-time-picker.spec.ts` (paste between routes) | ❌ Wave 0 |
| TIME-03 | Cmd+K time-range commands set URL; relative tokens preserved | unit | `pnpm vitest run src/components/ui/__tests__/CommandPalette.timeRange.test.tsx` | ❌ Wave 0 |
| TIME-04 | Compare-overlay toggle in panel header round-trips through saved view | unit + e2e | `pnpm vitest run src/components/panels/__tests__/<panel>.compareOverlay.test.tsx` + `v13-saved-views.spec.ts` extension | ❌ Wave 0 |
| TIME-05 | Brush-zoom on `/activity` ChartsStrip writes `time_from`/`time_to` to URL | unit + e2e | `pnpm vitest run src/components/panels/__tests__/ChartsStrip.brush.test.tsx` + `tests/e2e/v13-time-picker.spec.ts` (brush spec) | ❌ Wave 0 |
| CMDK-02 | Cmd+K density command flips `<html data-density>` + persists | unit | `pnpm vitest run src/components/ui/__tests__/CommandPalette.density.test.tsx` | ❌ Wave 0 |
| CMDK-03 | Cmd+K "Last 7 days" sets URL without navigation | unit | `pnpm vitest run src/components/ui/__tests__/CommandPalette.timeRange.test.tsx` | ❌ Wave 0 |
| CMDK-04 | Cmd+K Recents group renders last 5 routes + last 5 ad-hoc states | unit | `pnpm vitest run src/components/ui/__tests__/CommandPalette.recents.test.tsx` | ❌ Wave 0 |
| Adoption (`/`) | All Card-rendered panels on `/` use `BoundedPanelCard bounded` or document a structural opt-out | grep audit | `git grep "<PanelCard" frontend/src/components/panels/ | wc` against expected count after sweep | ✅ existing |
| Adoption (`/activity`) | Same on `/activity`; SessionsTable + OtelPanel sheet/scroll bound to viewport | unit + e2e | `pnpm vitest run src/components/panels/__tests__/SessionsTable.bounded.test.tsx` + `v13-portal-containment.spec.ts` | ✅ existing (extend) |
| Adoption (`/sessions/compare`) | Sheets stay inside viewport at every density × ≥1024px width | e2e | `tests/e2e/v13-portal-containment.spec.ts` extension | ✅ existing (extend) |

### Sampling Rate
- **Per task commit:** `pnpm --filter cmc-frontend test --run <changed-file>` (~1-5s per file)
- **Per wave merge:** `pnpm --filter cmc-frontend test && pnpm --filter cmc-frontend typecheck && pnpm --filter cmc-frontend lint`
- **Phase gate:** Full suite green (vitest + playwright + axe + lighthouse) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/components/time/__tests__/TimePicker.test.tsx` — covers TIME-01
- [ ] `frontend/src/components/time/__tests__/RefreshDropdown.test.tsx` — covers TIME-01 auto-refresh
- [ ] `frontend/src/components/time/__tests__/AutoRefreshController.test.tsx` — covers TIME-01 interval invalidation + pause-while-zoomed
- [ ] `frontend/src/components/time/__tests__/ChartBrushController.test.tsx` — covers TIME-05
- [ ] `frontend/src/components/recents/__tests__/RecentRoutesTracker.test.tsx` — covers SHEL-05/CMDK-04 ring write
- [ ] `frontend/src/components/recents/__tests__/RecentlyVisitedSection.test.tsx` — covers SHEL-05 render
- [ ] `frontend/src/lib/time/__tests__/grafanaSyntax.test.ts` — covers token parser
- [ ] `frontend/src/lib/time/__tests__/coerce.test.ts` — covers Grafana → absolute Date
- [ ] `frontend/src/lib/time/__tests__/rangeToVocab.test.ts` — covers Bridge mapping
- [ ] `frontend/src/lib/time/__tests__/clipboard.test.ts` — covers TIME-02
- [ ] `frontend/src/lib/__tests__/recents.test.ts` — covers `cmc.recents.routes` ring helpers
- [ ] `frontend/src/components/ui/__tests__/CommandPalette.recents.test.tsx` — covers CMDK-04
- [ ] `frontend/src/components/ui/__tests__/CommandPalette.density.test.tsx` — covers CMDK-02
- [ ] `frontend/src/components/ui/__tests__/CommandPalette.timeRange.test.tsx` — covers CMDK-03
- [ ] `frontend/tests/e2e/v13-time-picker.spec.ts` — covers TIME-01..05 e2e integration
- [ ] Compare-overlay unit test on at least one panel that supports it (TokenUsageCard is the natural fit) — covers TIME-04
- [ ] Framework install: `pnpm --filter cmc-frontend add sonner@^2 react-day-picker@^10 date-fns@^4` — required before Wave 1

## Security Domain

> `.planning/config.json` does not list `security_enforcement` — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user local product; no auth surface added |
| V3 Session Management | no | Same |
| V4 Access Control | no | Same |
| V5 Input Validation | **yes** | `validateSearch` coerces unknown `time_from`/`time_to` to `undefined`; clipboard paste payload is regex-validated before applying; sanitize ISO timestamp into `Date` constructor inside try/catch |
| V6 Cryptography | no | No crypto added |
| V8 Data Protection | no | localStorage already in scope; new keys (`cmc.recents.routes`, `cmc.autoRefresh.interval`) are non-sensitive UX state |
| V14 Configuration | yes | Three new runtime deps require lockfile audit on land |

### Known Threat Patterns for the stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Clipboard payload injection (Cmd+Shift+V applies an attacker-crafted URL fragment) | Tampering | `parseRangeFromText` regex-validates each token via `asTimeToken`; reject + toast.error if invalid. Never `eval()`. |
| localStorage prototype-pollution via JSON.parse | Tampering | `lib/storage.ts` wraps every `JSON.parse` in try/catch and returns null on error [VERIFIED: lines 11-20]. Phase 26 uses the same wrapper. |
| XSS via cross-tab `storage` event (Recently Visited subscribes to changes from other tabs) | Tampering | Read-only: SidebarRecentlyVisitedSection RENDERS values, doesn't innerHTML them. React escapes by default. |
| Time-token regex DoS (catastrophic backtracking) | DoS | The Grafana token regex `^now(?:([-+])(\d+)([smhdwMy]))?(?:\/([dwMy]))?$` is anchored, linear — no catastrophic-backtracking risk. |
| Date arithmetic overflow (now+9999999999d) | DoS | Bound the parsed numeric amount before passing to date-fns; reject amounts > 5 years' worth of the unit. |
| Brush-zoom URL injection | Tampering | `validateSearch` is the only ingress; brush-zoom's navigate goes through the same validator pipe. |

## Sources

### Primary (HIGH confidence)
- `frontend/package.json` — verified installed deps + versions (no toast lib, no calendar lib, no date lib, recharts 3.8.1, all Radix popover/dropdown/dialog in place)
- `frontend/src/components/shell/AppShellHeader.tsx` — pre-registered `time-picker-trigger` placeholder
- `frontend/src/components/shell/AppShell.tsx` — Provider stack + `DefaultViewLoader` + `RecentStateTracker` mount sites
- `frontend/src/components/shell/Sidebar.tsx` — current order (Home → Observe → Operate → Pinned → Configure); does NOT subscribe to `useRouterState`
- `frontend/src/components/savedviews/RecentStateTracker.tsx` — Phase 25 plan 10 implementation pattern (zero-render effect, `IN_SCOPE_ROUTES`, bare-URL filter)
- `frontend/src/components/savedviews/PinnedViewsSection.tsx` — pattern for active-state algorithm + same-tab localStorage limitation
- `frontend/src/components/ui/CommandPalette.tsx` — extension surface for Cmd+K new groups
- `frontend/src/lib/savedViews.ts` — `pushRecentState` pattern (FIFO ring, structural dedupe, cap warning)
- `frontend/src/lib/density.ts` — `applyDensity()` invocation pattern for CMDK-02
- `frontend/src/lib/storage.ts` — `cmc.` prefixed localStorage wrapper
- `frontend/src/lib/searchSchemas.ts` — `SCHEMA_VERSION = 1`, append-only invariant
- `frontend/src/lib/api.ts` — backend `Range` type (`'today' | '7d' | '30d'`), `SkillRange`, `AlertRange`, `CostRange`
- `frontend/src/lib/queries.ts` — per-query `refetchInterval` patterns
- `frontend/src/routes/index.tsx`, `activity.tsx`, `sessions_.compare.tsx` — current validateSearch shapes
- `frontend/src/components/ui/BoundedPanelCard.tsx`, `PanelCard.tsx` — adoption mechanics
- `backend/cmc/api/routes/sessions.py`, `alerts.py`, `skills.py`, `system.py` — backend accepts `range=` vocab + `since=ISO`; NO `time_from`/`time_to`
- `docs/url-contract.md` — append-only validateSearch lock, `time_from`/`time_to` reserved for Phase 26
- `docs/testid-registry.md` — `time-picker-trigger` pre-registered
- `docs/z-index-ladder.md` — `--cmc-z-popover: 40` reserved for Phase 26 time picker
- `docs/affordance-checklist.md` — Phase 26 expected to add TIME-02 copy/paste affordance entry
- `.planning/REQUIREMENTS.md` — SHEL-05, TIME-01..05, CMDK-02..04 requirement texts
- `.planning/phases/25-saved-views-backend-frontend/25-VERIFICATION.md` — Phase 25 Accepted Exceptions a/b/c (esp. carry-over class list and same-tab localStorage pattern)
- `.planning/phases/25-saved-views-backend-frontend/25-VISUAL-CHECK.md` — 8 v1.2 carry-over classes enumerated

### Secondary (MEDIUM confidence — Context7 + official docs)
- [Context7 /recharts/recharts](https://context7.com/recharts/recharts) — `<Brush />` API, `startIndex`/`endIndex` initial range, keyboard a11y
- [recharts Brush.tsx source](https://github.com/recharts/recharts/blob/main/src/cartesian/Brush.tsx) — `onChange` vs `onDragEnd` callbacks, `BrushStartEndIndex` payload shape
- [Context7 /emilkowalski/sonner](https://context7.com/emilkowalski/sonner) — `<Toaster />` props, `toast.success/error/message` API
- [Context7 /gpbl/react-day-picker](https://context7.com/gpbl/react-day-picker) — `mode="range"` semantics, `selected` / `onSelect` callback shape, dual-month layout
- [Grafana time range docs](https://grafana.com/docs/grafana/latest/dashboards/use-dashboards/#time-range-controls) — canonical relative-time syntax: `now`, `now-Nu`, `now/u`, `now-Nu/u`, u ∈ {s, m, h, d, w, M, Q, y, fQ, fy}

### Tertiary (LOW confidence — needs validation)
- [Frezc/relative-time-expression — rte-moment](https://github.com/Frezc/relative-time-expression) — alternative parser library; mentioned in web search but NOT recommended since vocab is small enough to hand-roll
- ESLint rules `cmc/testid-registry-only` and `cmc/no-raw-z-index` — verified to exist in `frontend/eslint-rules/`; specific behavior re: dynamic templating verified by inspection of `frontend/src/components/shell/Sidebar.tsx`'s `sidebar-link-{slug}` usage but not re-tested for new patterns

## Metadata

**Confidence breakdown:**
- Standard Stack: **HIGH** — three new deps confirmed against npm registry; React 19 peer-dep compat verified
- Architecture: **MEDIUM-HIGH** — brush-zoom-as-source-of-truth has one open architectural decision (frontend-coerce-vs-backend-extension; recommendation is honest and reversible)
- Pitfalls: **HIGH** — 14 enumerated; all verified against codebase or Phase 25 verification docs
- Compatibility with Phase 24/25 invariants: **HIGH** — every Phase 24 invariant (density:root, ResponsiveContainer count, z-ladder, testid registry, axe gate) and Phase 25 invariant (state_json opacity, validateSearch append-only, schemaVersion contract) reviewed and respected

**Research date:** 2026-05-12
**Valid until:** 2026-06-11 (30 days — stack is stable; revisit if sonner / react-day-picker / recharts major release lands)
