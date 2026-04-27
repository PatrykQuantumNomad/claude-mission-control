---
phase: 05-frontend-shell-design-system
plan: 04
subsystem: ui
tags: [react-19, tanstack-react-router, css-grid, auto-fit, responsive, placeholder, requirement-traceability, integration-test, vitest-4, react-testing-library-16, happy-dom, command-palette, cmd-k]

# Dependency graph
requires:
  - phase: 05-frontend-shell-design-system
    plan: 01
    provides: AppShell + 3 routes (/, /activity, /skills); QueryClientProvider + ErrorBoundary at route-tree root; design tokens on :root (--cmc-* + --space-* + --size-* + --weight-*); render() helper at src/test/utils.tsx; routeTree.gen.ts already includes /activity + /skills
  - phase: 05-frontend-shell-design-system
    plan: 02
    provides: Card compound (Card/Header/Title/Description/Content/Footer), EmptyState (heading + body + icon? + action?), Skeleton family, RelativeTime — all importable from frontend/src/components/ui barrel
  - phase: 05-frontend-shell-design-system
    plan: 03
    provides: CommandPalette mounted globally in AppShell as a sibling of <main> (Cmd+K + Ctrl+K bound on every route); Sheet + CollapsibleSection primitives also available via barrel
provides:
  - "frontend/src/components/PlaceholderCardGrid.tsx — generic helper that maps a list of {reqId, title, dataNoun} into Card+EmptyState pairs; the canonical Phase 6/7 entry contract for placing real panels (replace each placeholder Card by reqId — kicker remains the requirement ID for traceability)"
  - "frontend/src/routes/index.tsx — Command page wired with 14 OPNL-* slots (OPNL-01 + OPNL-03..15); KpiRow OPNL-02 INTENTIONALLY DEFERRED to Phase 6 per CONTEXT focal-point hierarchy (Phase 6 plan adds the slot above the panel grid)"
  - "frontend/src/routes/activity.tsx — Activity page wired with 6 ACTV-01..06 slots"
  - "frontend/src/routes/skills.tsx — Skills page wired with 8 HPNL-01..02 + TPNL-01 + TPNL-03 + SKLP-01..04 slots (TPNL-02/04/05 deferred to Phase 7 — they are not panel-shaped requirements; TaskComposer slide-out + cron preview + run history live elsewhere in the page composition)"
  - "frontend/src/styles.css — appended .cmc-card-grid (display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); grid-auto-rows: 1fr; gap: var(--space-lg)) per DESG-04 + .cmc-page header rules (kicker + gradient h1 + subheading) + page-level fade-in keyframe (cmc-page-in 300ms ease-out, prefers-reduced-motion override)"
  - "frontend/src/__tests__/integration.test.tsx — first true end-to-end smoke test booting the REAL <RouterProvider> over the generated routeTree (NOT in-memory createRoute mocks reserved for unit tests) — verifies all 3 routes render via createMemoryHistory + Cmd+K opens palette globally on / AND /skills; the selector { selector: 'h1' } discriminates page heading from CommandPalette palette item with the same name"
  - "frontend/src/components/__tests__/PlaceholderCardGrid.test.tsx — unit-level coverage of the helper (reqId kicker, title, EmptyState body interpolation, article landmarks, empty-array case)"
  - "8 new test cases (3 PlaceholderCardGrid + 5 integration smoke) bringing the frontend suite from 54 → 62 green"
  - "Phase 6/7 entry contract: PlaceholderCardGrid is the geometry. To swap a real panel in, edit the route file's slot list — keep the reqId as the kicker (traceability) — and replace the Card body's <EmptyState> with the real component fed by lib/api"
affects: [06-observability-activity-panels, 07-command-centre-panels]

# Tech tracking
tech-stack:
  added:
    runtime: []  # No new dependencies — this plan composes Wave 0/1/2 primitives only
    dev: []
  patterns:
    - "Named-but-empty placeholder grid pattern: each Card carries a kicker = future-requirement ID + a stable title + a noun-substituted EmptyState body. Phase 6/7 plans replace cards by ID, NOT by index — the slot ordering is decoupled from the rendered DOM via React's key={reqId}."
    - "DESG-04 matched-height responsive grid: `grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))` + `grid-auto-rows: 1fr`. No media-query breakpoints — the grid reflows from N-up to 1-up automatically as viewport narrows. Reusable for any Phase 6/7 multi-panel arrangement (Activity heatmap + token charts row, Skills page panels, etc.)."
    - "Page-level entrance animation: `.cmc-page` runs the cmc-page-in keyframe (opacity 0→1 + translateY 8px→0, 300ms ease-out) on mount per UI-SPEC §Motion Contract. `@media (prefers-reduced-motion: reduce)` zeroes the animation. Apply to any future top-level page wrapper (no per-card stagger — that would over-animate per UI-SPEC restraint)."
    - "Integration smoke test pattern: real RouterProvider + createMemoryHistory over the generated routeTree. This is the FIRST test in the codebase that asserts the WHOLE app boot path works (vs. component tests which use in-memory createRoute scaffolding). Future phases adding routes get a regression guard for free; the file lives at src/__tests__/integration.test.tsx as the conventional spot for whole-app tests."
    - "Selector discrimination idiom: `findByText('Command', { selector: 'h1' })` distinguishes page headings (which render only on the matching route) from CommandPalette items with the same label (which always render in the global palette). Pattern reusable when the same text appears in nav and content."

key-files:
  created:
    - "frontend/src/components/PlaceholderCardGrid.tsx — 54 lines, generic Card+EmptyState mapper; exports PlaceholderSlot interface + PlaceholderCardGrid component"
    - "frontend/src/components/__tests__/PlaceholderCardGrid.test.tsx — 3 unit tests (multi-slot render + reqId/title/EmptyState body assertions; empty-array case)"
    - "frontend/src/__tests__/integration.test.tsx — 5 end-to-end smoke tests (3 routes × heading+slot assertion + 2 Cmd+K invocations from / and /skills)"
  modified:
    - "frontend/src/routes/index.tsx — replaced placeholder body with cmc-page section + Mission Control kicker + gradient h1 + subheading + PlaceholderCardGrid wired to 14 OPNL-* slots"
    - "frontend/src/routes/activity.tsx — replaced placeholder body with the same cmc-page header + PlaceholderCardGrid wired to 6 ACTV-* slots"
    - "frontend/src/routes/skills.tsx — replaced placeholder body with the same cmc-page header + PlaceholderCardGrid wired to 8 HPNL/TPNL/SKLP slots"
    - "frontend/src/styles.css — appended .cmc-card-grid + .cmc-page + .cmc-page__header/heading/subheading + .cmc-page__heading--gradient + cmc-page-in keyframe + prefers-reduced-motion override (under a Plan 05-04 section header that follows Plan 05-03's Interactive primitives section)"

key-decisions:
  - "PlaceholderCardGrid is a NEW component, NOT reused from Wave 1. Phase 6/7 plans will eventually delete this helper as each placeholder is replaced by a domain panel — the helper has no long-term role beyond the Wave 3 transition. Locating it at frontend/src/components/PlaceholderCardGrid.tsx (NOT in components/ui) signals that intent — the ui/ barrel is reserved for primitives that survive Phase 6/7."
  - "OPNL-02 (KpiRow) INTENTIONALLY DEFERRED out of the / placeholder grid. Per Phase 5 CONTEXT, the KpiRow is a focal-point row that lives ABOVE the panel grid (full-width, multi-column KPI layout) — Phase 6 introduces both the slot and the KpiRow component in the same plan. Placing a KpiRow placeholder Card here would set the wrong geometry (constrained to grid auto-fit). Phase 6 planner: insert the KpiRow above the existing PlaceholderCardGrid, not as another slot inside it."
  - "TPNL-02/04/05 NOT placed on /skills. Reason: TPNL-02 is the Task composer slide-out (Phase 7 will mount it via Sheet, NOT a Card), TPNL-04/05 are filter/search affordances (live in the page header chrome, not the grid). Placing Cards for them would lock the wrong geometry for Phase 7."
  - "Page header convention: every route renders the same `cmc-page__header` shape — Mission Control kicker (cmc-label class, cmc-text-subtle color, JetBrains Mono uppercase) + gradient h1 (--cmc-gradient-hero via background-clip:text) + subheading (cmc-text-dim). Phase 6/7 must keep this shape so the visual rhythm across routes stays consistent — the only tunable per-route is the heading text + subheading copy."
  - "Card kicker uses cmc-label class (defined in Plan 05-01's styles.css token block) — JetBrains Mono 12px, uppercase, letter-spacing — chosen so the future-requirement ID is visually anchored as a 'data-engineering label' per UI-SPEC's Linear/Raycast tone, not as a casual subtitle. CardDescription wraps the kicker so Card's compound API stays intact; the className override applies the label tokens."
  - "Integration smoke test file lives at src/__tests__/integration.test.tsx (NOT alongside components). This is the first whole-app test in the codebase — future end-to-end tests (Playwright in Phase 9 + any future RouterProvider integration tests) should converge on this directory."
  - "human-verify checkpoint APPROVED by user 2026-04-27 — every visual + interactive + console check on the orchestrator's UI-SPEC quality bar passed against the running dev server. No revisions needed; no deferred visual issues."

patterns-established:
  - "PlaceholderCardGrid as Phase 6/7 entry contract — replace each Card by reqId, keep the kicker as the traceability anchor; the helper itself can be deleted once Phase 6/7 ship every panel"
  - "DESG-04 grid (auto-fit minmax(320px, 1fr) + auto-rows-fr) — reusable for any future multi-panel responsive layout"
  - "Page-level entrance fade — apply via .cmc-page wrapper class; do NOT stagger per-card (UI-SPEC restraint principle)"
  - "Integration smoke pattern — real RouterProvider + createMemoryHistory + routeTree.gen for whole-app regression coverage; reserve in-memory createRoute scaffolding for component-level tests in components/ui/__tests__/*"
  - "Selector discrimination via { selector: 'h1' } — when the same text appears in nav, palette, and content, scope assertions to the role-bearing element"

# Metrics
duration: ~12min agent + human-verify wait
completed: 2026-04-27
---

# Phase 5 Plan 04: Placeholder Card Grids + Visual Quality Bar Summary

**Three named-but-empty placeholder card grids landed across /, /activity, /skills (28 Cards total carrying Phase-6/7 requirement IDs as kickers — the canonical entry contract for downstream panel work); DESG-04 auto-fit responsive grid + page-level fade-in CSS; first true end-to-end RouterProvider integration smoke test (5 cases); human-verify visual quality bar APPROVED — Phase 5 shell ships matching the Linear/Raycast/Vercel reference and Cmd+K is wired globally.**

## Performance

- **Duration:** ~12 min agent work + human-verify wait
- **Started:** 2026-04-27T00:27:36Z (approx — directly after Plan 05-03 close commit f9e5ea9)
- **Completed:** 2026-04-27 (post-human-approval)
- **Tasks:** 1 auto + 1 checkpoint:human-verify (approved)
- **Files created:** 3 (PlaceholderCardGrid.tsx + 2 test files)
- **Files modified:** 4 (3 route files + styles.css)

## Accomplishments

- **PlaceholderCardGrid** ships the Phase 6/7 entry contract: a generic, deletable helper that maps a `{reqId, title, dataNoun}` slot list into Card + EmptyState pairs. The kicker is the future requirement ID (OPNL-04, ACTV-01, SKLP-02, etc.); the EmptyState body uses the UI-SPEC verbatim template `Once {dataNoun} arrives it will appear here. Run sync from the header to refresh.` The helper sits at `frontend/src/components/` (NOT in `components/ui/`) to signal it has no long-term role beyond Wave 3.
- **/ (Command page)** wires 14 OPNL-* slots: OPNL-01 (System Health Strip), OPNL-03 (Attention), OPNL-04..15 (Live Sessions, Token Usage, Cache Efficiency, Session Outcomes, Tool Latency, Hook Activity, Project Breakdown, Agent Fanout, Edit Acceptance, Productivity, Pressure Panel, MCP Servers). OPNL-02 (KpiRow) intentionally deferred to Phase 6 per CONTEXT focal-point hierarchy — the KpiRow is a full-width focal row that lives ABOVE the panel grid, not inside it.
- **/activity** wires 6 ACTV-01..06 slots (30-Day Heatmap, 14-Day Token Charts, OTEL Firehose, Top Skills, Unified Failures, Sessions Table).
- **/skills** wires 8 HPNL/TPNL/SKLP slots (HPNL-01 Decisions, HPNL-02 Inbox, TPNL-01 Task Board, TPNL-03 Schedules, SKLP-01..04 MCP Panel + Skill Cost + Context Health + Skills Registry). TPNL-02 (Task composer slide-out — uses Sheet not Card), TPNL-04/05 (filter/search — live in page chrome) intentionally NOT placed.
- **Page header convention** locked across all 3 routes: cmc-page__header with Mono uppercase "MISSION CONTROL" kicker, gradient display-size h1 (cmc-page__heading--gradient via --cmc-gradient-hero + background-clip:text), and dim-text subheading describing the page.
- **DESG-04 grid wired**: `.cmc-card-grid` uses `grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))` + `grid-auto-rows: 1fr` so cards reflow N-up → 1-up at viewport thresholds and heights match within a row, all without media queries.
- **Page-level entrance** animation per UI-SPEC §Motion Contract: `.cmc-page` runs cmc-page-in (opacity 0→1 + translateY 8px→0, 300ms ease-out) on mount; `@media (prefers-reduced-motion: reduce)` zeroes the animation. No per-card stagger (UI-SPEC restraint principle).
- **First true end-to-end integration smoke test** (`frontend/src/__tests__/integration.test.tsx`) boots the real `<RouterProvider>` over the generated `routeTree.gen` via `createMemoryHistory`. 5 cases cover all 3 routes (heading + at least one placeholder slot) + Cmd+K from `/` AND `/skills`. This is the first test that asserts the WHOLE app boot path works (vs. component tests which use in-memory `createRoute` scaffolding).
- **PlaceholderCardGrid unit test** (3 cases) covers multi-slot render with reqId kicker + title + EmptyState body interpolation + article landmark count + empty-array case.
- **Test suite: 54 → 62 green** (54 baseline + 3 PlaceholderCardGrid + 5 integration). `npm run typecheck` exits 0; `npm run build` exits 0; dev server `npm run dev` boots clean and was the artifact under user inspection during the human-verify checkpoint.
- **Human-verify checkpoint APPROVED by user 2026-04-27** against the UI-SPEC visual quality bar — every visual + interactive + console check passed (radial-gradient backdrop, Inter body + JetBrains Mono labels, gradient brand text, accent-blue active-nav underline, Cmd+K chip, palette open + fuzzy match + Esc, 14px card radius, EmptyState icon at 48px, prefers-reduced-motion respected, zero console warnings, font network requests succeed). No revisions requested.

## Task Commits

1. **Task 1: PlaceholderCardGrid + 3 routes + .cmc-card-grid CSS + integration smoke test** — `40dbe80` (feat)
   - 3 files created (PlaceholderCardGrid + 2 test files); 4 files modified (3 routes + styles.css)
   - Suite 54 → 62 green; typecheck + build clean
2. **Task 2: Visual quality bar verification — UI-SPEC checkpoint** — APPROVED by user (no commit; gate only)

**Plan metadata:** [this final commit] (docs: complete Phase 5)

## Public API Surface (for Phase 6/7)

```ts
// frontend/src/components/PlaceholderCardGrid.tsx
export interface PlaceholderSlot {
  reqId: string         // e.g. "OPNL-04" — surfaced as kicker (cmc-label class)
  title: string         // e.g. "Live Sessions"
  dataNoun: string      // e.g. "live session activity" — substituted into UI-SPEC empty body
}

export function PlaceholderCardGrid({ slots }: { slots: PlaceholderSlot[] }): JSX.Element
```

Plan 05-04 import path is intentionally NOT through the `components/ui` barrel — the helper has no long-term role; it's a Wave 3 transition aid only.

## Phase 6 / Phase 7 Entry Contract

**The geometry is set. Each placeholder Card is the slot for a real panel.**

For Phase 6 plans (Observability + Activity Panels):

| reqId | Slot location | Replace with |
|---|---|---|
| OPNL-01 | `frontend/src/routes/index.tsx` slot 1 | SystemHealthStrip — REPLACE the Card body with a real header strip (consider whether OPNL-01 should remain in the grid or move to the page header chrome) |
| OPNL-02 | NOT in grid yet | KpiRow — INSERT a new full-width row ABOVE the PlaceholderCardGrid (not as a Card slot) |
| OPNL-03 | `frontend/src/routes/index.tsx` slot 2 | AttentionBar — REPLACE Card body |
| OPNL-04..15 | `frontend/src/routes/index.tsx` slots 3..14 | Live Sessions / Token Usage / Cache Efficiency / Session Outcomes / Tool Latency / Hook Activity / Project Breakdown / Agent Fanout / Edit Acceptance / Productivity / Pressure Panel / MCP Servers — REPLACE each Card body with the matching panel; kicker stays for traceability or is removed when the panel ships its own internal kicker |
| ACTV-01..06 | `frontend/src/routes/activity.tsx` slots 1..6 | 30-Day Heatmap / 14-Day Token Charts / OTEL Firehose / Top Skills / Unified Failures / Sessions Table |

For Phase 7 plans (Command Centre Panels):

| reqId | Slot location | Replace with |
|---|---|---|
| HPNL-01 | `frontend/src/routes/skills.tsx` slot 1 | Pending Decisions panel |
| HPNL-02 | `frontend/src/routes/skills.tsx` slot 2 | Inbox panel |
| TPNL-01 | `frontend/src/routes/skills.tsx` slot 3 | Task Board (3-column kanban via CardContent) |
| TPNL-02 | NOT in grid | Task composer slide-out — uses Sheet primitive (Plan 05-03), NOT a Card. Mounts as a sibling of the page or via CommandPalette Quick task action |
| TPNL-03 | `frontend/src/routes/skills.tsx` slot 4 | Schedules list with run history drawer |
| TPNL-04/05 | NOT in grid | Filter chips + search input — live in page header chrome (NOT in PlaceholderCardGrid) |
| SKLP-01..04 | `frontend/src/routes/skills.tsx` slots 5..8 | MCP Panel / Skill Cost / Context Health / Skills Registry |

**Replacement procedure:**
1. Edit the route file's slot list — replace the matching `{reqId, title, dataNoun}` entry with the real component import + render.
2. Keep `reqId` as a Card-level kicker (via `<CardDescription className="cmc-label">{reqId}</CardDescription>`) for as long as the panel benefits from traceability; remove when the panel ships its own internal kicker.
3. Wire data via `lib/api` (Plan 05-01 entry contract) — `useQuery({ queryKey, queryFn: api.<endpoint> })` per Phase 5 CONTEXT.
4. The grid auto-reflows; no styling changes needed.
5. When all slots in a route are real panels, delete the `PlaceholderCardGrid` import from that route. When all 3 routes are converted, delete `frontend/src/components/PlaceholderCardGrid.tsx` and its test file.

## Visual Quality Bar — User-Approved Checkpoints

The user verified each item on the UI-SPEC visual quality bar against the running dev server (`npm run dev`, http://localhost:5173, dark mode, Chrome/Safari on macOS). All passed:

- [x] `#0a0a0f` body bg with subtle radial gradients (top-left blueish, bottom-right purple-ish — DESG-02)
- [x] Header bar ~56px tall with "Mission Control" gradient brand text (background-clip:text → blue→purple)
- [x] Nav links Command / Activity / Skills with hover-color brighten + 2px accent-blue active underline tracking the route
- [x] Cmd+K chip in JetBrains Mono inside an 8px-radius bordered button on the right of the header; hover brightens border
- [x] Cmd+K opens CommandPalette with backdrop blur; placeholder "Search pages, sessions, schedules…" visible
- [x] Type "act" → fuzzy-matches Activity → Enter navigates to /activity → palette closes
- [x] Empty-state copy "No matches. Try fewer letters or open the page directly." renders on no-match search
- [x] Card grids on / (14 OPNL kickers), /activity (6 ACTV kickers), /skills (8 HPNL/TPNL/SKLP kickers) — all with JetBrains Mono uppercase kicker, real titles, EmptyState bodies with substituted dataNoun
- [x] Card grid auto-reflow at viewport widths (4-up → 3-up → 2-up → 1-up); heights match within a row (DESG-04)
- [x] Card radius 14px; padding 24-32px range
- [x] EmptyState Lucide Inbox icon centered above heading at ~48px in --cmc-text-dim
- [x] Page header on every route: kicker + gradient h1 + dim subheading
- [x] DevTools → Network → Fonts: Inter + JetBrains Mono load from fonts.gstatic.com
- [x] DevTools → Console: zero React warnings, zero "missing Dialog Title" errors, zero act() warnings
- [x] DevTools → Elements: `.cmc-card` has `background-color: rgb(18, 18, 26)` (#12121a) and `border-radius: 14px`
- [x] Reduce Motion (macOS) ON → palette opens without scale animation; OFF → restored
- [x] Tab focus rings: 2px accent-blue + 2px offset; no accidental focus-trap
- [x] Visual feel: matches Linear/Raycast/Vercel dark dashboard reference

## Deviations from Plan

None — plan executed exactly as written. Task 1 landed all artifacts on first build/typecheck/test pass; the human-verify checkpoint required no revisions.

## Auth Gates

None.

## Threat Flags

None — this plan ships UI placeholder composition with no new network endpoints, auth surface, file access patterns, or schema changes at trust boundaries. The CommandPalette navigation surface was already established in Plan 05-03; this plan only adds page bodies that consume the PlaceholderCardGrid helper.

## Issues Encountered

None. Dev server boot, hot reload during human-verify, and graceful shutdown via `pkill -f "vite.*frontend"` all worked without intervention.

## Phase 5 — Final Test Count + Build Status

- **Test suite:** 62 / 62 green (12 baseline from 05-01 + 30 new from 05-02 + 12 new from 05-03 + 8 new from 05-04 = 62)
- **`npm run typecheck`:** exits 0
- **`npm run build`:** exits 0 (dist/ produced; route chunks for index/activity/skills emitted)
- **`npm run dev`:** boots clean on http://localhost:5173 (verified during checkpoint; stopped post-approval via `lsof -ti :5173 | xargs kill -9`)
- **`npm ls @radix-ui/react-dialog`:** ONE deduped entry (Pitfall 4 mitigation still active end-to-end)
- **Console during dev server:** zero React warnings, zero "missing Dialog Title" errors

## Phase 5 — Decisions Locked Across the Phase

- **Design tokens locked at UI-SPEC values** (Plan 05-01 styles.css :root) — every Phase 6/7 component MUST reference `var(--cmc-*)` / `var(--space-*)` / `var(--size-*)` / `var(--weight-*)`; never inline color literals
- **`lib/storage` `cmc.*` prefix** is the canonical persistence carrier (CollapsibleSection uses `cmc.collapsible.{id}`; Phase 6/7 reuse the pattern: `cmc.filter.{name}`, `cmc.composer.draft`, etc.)
- **CommandPalette mounted in AppShell as a sibling of `<main>`** so Cmd+K is global on every route — Phase 6/7 add a new route and inherit Cmd+K binding automatically
- **12-primitive `frontend/src/components/ui` barrel** is the single import surface for all design-system primitives (Card family, Button, Badge, StatePill, Tooltip, Skeleton, EmptyState, RelativeTime, ShellErrorBoundary/ShellErrorFallback, Sheet, CollapsibleSection, CommandPalette, plus formatRelative helper)
- **PlaceholderCardGrid is the Phase 6/7 entry contract** for panel placement geometry — DELETE the helper once every reqId slot is replaced by a real panel
- **DESG-04 grid recipe** (`auto-fit, minmax(320px, 1fr)` + `auto-rows-fr`) is the locked responsive layout for any future multi-panel arrangement
- **Visual quality bar approved by user 2026-04-27** — Phase 5 shell ships matching the Linear/Raycast/Vercel reference; Phase 6/7 composers must preserve the established visual rhythm (page header shape, card geometry, gradient restraint, status-color discipline)

## Next Phase Readiness

**Phase 6 ready to plan.** Entry contract:
- 3 routes with PlaceholderCardGrid wired and visually approved
- 12 design-system primitives locked + available via `frontend/src/components/ui`
- `lib/api` covers all Phase 3 GET endpoints — Phase 6 layers React Query on top via `useQuery({ queryKey, queryFn: api.<endpoint> })`
- KpiRow OPNL-02 requires both slot insertion (above PlaceholderCardGrid in `routes/index.tsx`) AND component creation in the same Phase 6 plan
- Replace, don't add: edit slot lists in route files; do NOT introduce parallel grid containers
- Convert one route at a time; the helper survives until the last placeholder is replaced

**Phase 7 ready to plan in parallel with Phase 6** (per ROADMAP wave structure):
- TPNL-02 task composer = Sheet primitive (Plan 05-03), NOT a Card — mount as a sibling of the page or trigger from CommandPalette Quick task `// Phase 7 wires TaskComposer (TPNL-03)` marker
- TPNL-04/05 filter+search = page header chrome, NOT grid Card slots
- ESTOP modal = Sheet OR new centered Dialog primitive; if stacking with Sheet, replace fixed `cmc-sheet-desc` id with `useId()`

NO blockers; NO open questions for Phase 6/7.

## Self-Check: PASSED

Verified before submission:

- [x] frontend/src/components/PlaceholderCardGrid.tsx exists
- [x] frontend/src/components/__tests__/PlaceholderCardGrid.test.tsx exists
- [x] frontend/src/__tests__/integration.test.tsx exists
- [x] frontend/src/routes/index.tsx contains "OPNL-01" and "OPNL-15"
- [x] frontend/src/routes/activity.tsx contains "ACTV-01" and "ACTV-06"
- [x] frontend/src/routes/skills.tsx contains "SKLP-01" and "SKLP-04"
- [x] frontend/src/styles.css contains "auto-fit, minmax(320px, 1fr)" and ".cmc-page" + cmc-page-in keyframe
- [x] Commit 40dbe80 (Task 1) exists in git log
- [x] `npm run test` exits 0 with 62/62 passing
- [x] `npm run typecheck` exits 0
- [x] `npm run build` exits 0
- [x] Dev server stopped (port 5173 freed via lsof + kill -9)
- [x] Human-verify checkpoint user reply "approved" recorded 2026-04-27

---
*Phase: 05-frontend-shell-design-system*
*Completed: 2026-04-27*
