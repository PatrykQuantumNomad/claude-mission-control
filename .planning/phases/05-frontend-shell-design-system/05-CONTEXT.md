# Phase 5: Frontend Shell & Design System - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the React app shell (3 routes: /, /activity, /skills) + bespoke component library + dark-theme design tokens. This phase produces the visual container and primitives that Phase 6 (Observability/Activity panels) and Phase 7 (Command Centre panels) will fill. No domain-specific cards, no charts, no composers — those belong to 6/7.

The visual contract is already locked in `05-UI-SPEC.md` (310 lines, approved 2026-04-26): design tokens, component APIs, motion durations, copy, accessibility. This CONTEXT captures the **implementation** decisions UI-SPEC intentionally left open for the planner.

</domain>

<decisions>
## Implementation Decisions

### Pre-domain shell content (what renders before Phase 6/7 land)

- **All three routes ship a placeholder grid** of named-but-empty cards. Each card uses Phase 5's `Card` + `EmptyState` primitives with the panel's noun passed in (e.g., card titled "Live Sessions" containing the EmptyState body "Once sessions arrive they will appear here…"). This validates the grid layout in Phase 5 before Phase 6 fills the cards with data.
- **KpiRow slot is NOT reserved on /.** Although UI-SPEC declares KpiRow the visual focal point, Phase 6 introduces both the slot and the component. Phase 5 does not paint placeholder tiles in that slot. The focal-point contract remains documented in UI-SPEC for Phase 6 to honor.
- **Same treatment everywhere** — /activity and /skills also ship placeholder card grids matching the / treatment. Card slot names should derive from Phase 6/7 requirement IDs (OPNL-01..15, ACTV-01..06, HPNL-*, TPNL-*, SKLP-*) — planner can pull labels from REQUIREMENTS.md headings.
- **Header is bare:** brand ("Mission Control") + Cmd+K trigger chip only. No live `/api/health` StatePill, no last-sync RelativeTime in v1. Phase 6 introduces health/sync indicators when it has more domain context to surface.

### CommandPalette v1 scope

- **Full keyboard navigation is in scope** (locked, not Claude's discretion): Up/Down arrows move selection, Enter activates, Esc closes. cmdk gives this for free.
- **Palette content** (Claude's discretion — recommended): 3 routes only as searchable items in v1. Adding placeholder action stubs invites confusion ("why is this disabled?") without unblocking Phase 6/7. Phase 7 wires the action surface when TaskComposer/ScheduleComposer arrive.
- **"Quick task" behavior in v1** (Claude's discretion — recommended): selecting it closes the palette and is otherwise a no-op. The action label appears in the palette to satisfy FESH-07's "quick-task action" wording, but Phase 7 owns the wiring.
- **Recents** (Claude's discretion — recommended): no recents list in v1. localStorage persistence is exercised via FESH-03 + the namespaced helper (see below); a second use case isn't needed in Phase 5.

### Primitive build approach (locked dependency choices)

- **Sheet (FESH-04)**: `@radix-ui/react-dialog` styled with our CSS vars. Get focus trap, Esc-to-close, aria-modal, scroll lock for free.
- **Tooltip (FESH-06 + FESH-10 RelativeTime)**: `@radix-ui/react-tooltip`. Handles the locked 200ms delay, portal rendering, ARIA describedby.
- **CollapsibleSection (FESH-03)**: `@radix-ui/react-collapsible` for ARIA semantics (`aria-expanded`, `aria-controls`) + framer-motion `<motion.div>` to drive the 220ms height animation. Both deps required.
- **CommandPalette engine (FESH-07)**: `cmdk` library. Battle-tested fuzzy match + composable item/group API. Phase 7 will extend the action surface — cmdk's structure scales better than a hand-rolled matcher.
- **Other locked deps** (already in UI-SPEC but reaffirmed): `lucide-react` (icons), `framer-motion` (height + mount animations).

### Data layer

- **Phase 5 wires React Query.** Install `@tanstack/react-query`, add `<QueryClientProvider>` in AppShell, expose typed fetcher helpers in `frontend/src/lib/api.ts`. Phase 6 inherits a ready-to-use fetching layer with caching, dedup, and request lifecycle.
- Consequence: planner adds `@tanstack/react-query` to `frontend/package.json`. lib/api.ts exposes one typed fetcher per backend endpoint already shipped (Phases 3 + 4 endpoints) — but Phase 5 only USES it for the bare header (which we've decided NOT to add live indicators to). So `lib/api.ts` ships the fetcher infrastructure + endpoint type definitions; Phase 6 starts calling them.

### Testing scope

- **Vitest + React Testing Library** is set up in Phase 5. Co-located `__tests__/` per primitive (mirrors backend per-phase test discipline).
- Per-primitive tests cover: render, key props (variants, sizes), keyboard interaction (Sheet Esc, Tooltip on focus, Collapsible toggle), localStorage persistence (CollapsibleSection), and `prefers-reduced-motion` short-circuit.
- Phase 9's Playwright e2e (TEST-01..04) remains the integration-level gate; Phase 5's Vitest tests are the regression net for the primitive library.

### Persistence pattern

- **Namespaced localStorage helper now**: `frontend/src/lib/storage.ts` with `get<T>(key)` / `set<T>(key, value)` / `remove(key)` helpers. All keys prefixed with `cmc.` (e.g., `cmc.collapsible.live-sessions`). Phase 6/7 import this helper instead of touching `window.localStorage` directly.
- FESH-03's CollapsibleSection is the v1 consumer. The pattern is in place for Phase 6 (filter persistence on /activity tables) and Phase 7 (composer drafts) without a refactor.

### Plan structure (Claude's discretion — recommended)

Wave-structured, mirroring the Phase 4 pattern that worked well:
- **Wave 0 (foundation)**: deps + design tokens + lib/storage + lib/api scaffolding + AppShell + NavBar + TanStack Router 3 routes + Vitest infra.
- **Wave 1 (parallel — both depend on Wave 0)**:
  - Layout primitives plan: Card family, Button, Badge, StatePill, Tooltip, Skeleton, EmptyState, RelativeTime, ErrorBoundary.
  - Interactive primitives plan: Sheet, CollapsibleSection, CommandPalette.
- **Wave 2 (depends on Wave 1)**: pre-domain placeholder routes (the named-but-empty card grids on /, /activity, /skills) + integration smoke tests.

Estimated 4 plans. Planner finalizes the wave shape after research; this is the recommended starting point.

### Claude's Discretion

- Exact CommandPalette item ordering and group headers
- Skeleton pulse timing curve (UI-SPEC says 1.5s ease-in-out — exact keyframe math)
- Card grid breakpoints and column counts on / vs /activity vs /skills (UI-SPEC declares card surface but not grid geometry)
- Whether `lib/api.ts` exposes raw `fetch` wrappers or React Query hooks (`useSessions`, `useHealth`, etc.) — choose during Wave 0 planning
- Vitest config details (jsdom vs happy-dom, coverage thresholds)
- localStorage key collision/migration strategy (probably none needed in v1)

</decisions>

<specifics>
## Specific Ideas

- The user's strong preference throughout discussion was **clean shell boundary**: header bare-minimum, KpiRow slot unreserved, no recents in palette, no live status indicators in v1. The signal is "Phase 5 ships the container, Phase 6/7 ship the content." Don't sneak Phase 6 features into Phase 5.
- The named-but-empty placeholder grid is the one exception to that minimalism — it lets the user **see** the layout that Phase 6 will fill. This is intentional vision-validation, not feature creep.
- Dependency philosophy: lean on vetted upstream (Radix, cmdk, framer-motion, React Query, lucide-react) rather than hand-rolling accessibility-critical primitives. The user picked Radix for all three options where it was offered.
- Test discipline mirrors backend phases: per-phase test infra + per-primitive `__tests__/` co-location. The user has not asked for this explicitly, but the choice tracks the project's existing testing posture.

</specifics>

<deferred>
## Deferred Ideas

- **Live `/api/health` StatePill in header** — surfaced as an option, deferred to Phase 6 when more domain context joins it
- **Last-sync RelativeTime indicator in header** — same deferral, Phase 6
- **Palette recents (localStorage-backed)** — deferred; not needed for FESH-07's stated scope
- **Theme toggle** — UI-SPEC explicitly notes v1 ships dark-only; Phase 9's TEST-04 verifies the localStorage persistence pattern via CollapsibleSection state, not a theme toggle
- **Card grid layout details (breakpoints, column counts)** — left to planner during Wave 0 since they are pure CSS decisions with no user-vision implications
- **Quick-task wiring to TaskComposer** — Phase 7 (TPNL-03)
- **Action surface beyond pages in palette** (New task, New schedule, Emergency stop, etc.) — Phase 7 introduces all of these

</deferred>

---

*Phase: 05-frontend-shell-design-system*
*Context gathered: 2026-04-26*
