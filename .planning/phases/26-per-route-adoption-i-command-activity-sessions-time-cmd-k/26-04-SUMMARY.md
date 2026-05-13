---
phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
plan: 04
subsystem: ui
tags: [react, tanstack-router, localstorage, sidebar, recents, zero-render-effect]

# Dependency graph
requires:
  - phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
    provides: "Plan 02: cmc.recents.routes FIFO ring (pushRecentRoute / getRecentRoutes / clearRecentRoutes in frontend/src/lib/recents.ts)"
  - phase: 25-saved-views-cross-route
    provides: "Plan 09 PinnedViewsSection sibling-section pattern; Plan 10 zero-render-effect mount-point convention (DefaultViewLoader + RecentStateTracker inside LoadedViewProvider); routeNormalize.ts /skills/$name coercion contract"
  - phase: 24-shell-density-containment-primitives
    provides: "SidebarSection + SidebarNavLink primitives; Configure empty-body precedent; testid registry + cmc/testid-registry-only ESLint rule"
provides:
  - "RecentRoutesTracker zero-render effect — writes cmc.recents.routes on every IN_SCOPE_ROUTES navigation"
  - "Sidebar RecentlyVisitedSection — top 3 recent routes between Pinned and Configure (CONTEXT-reconciled IA)"
  - "Mount point convention extended: AppShell now hosts THREE zero-render effects inside LoadedViewProvider (DefaultViewLoader → RecentStateTracker → RecentRoutesTracker)"
  - "Surface for SHEL-05 satisfied end-to-end (ring + sidebar render). Future Cmd+K Recents group (Plan 08, CMDK-04) reads the same ring."
affects: [26-08 cmd-k-recents-group, 26-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sibling-section pattern (extends Phase 25 Plan 09): a sidebar IA addition mounts its own component in Sidebar.tsx between PinnedViewsSection and Configure, with the section header always rendering even when the body is empty."
    - "Zero-render effect stack pattern: AppShell hosts a growing list of `null`-returning effect components inside LoadedViewProvider (now 3 — Plan 03 will bring it to 4 with AutoRefreshController). Each isolates one cross-cutting concern (default-view auto-load, ad-hoc-state recents, route recents, time-aware refresh)."
    - "Pitfall 8 option (b) for same-tab localStorage-backed render coherence: post-render useEffect push + filter currently-active route from display + rely on next navigation's useRouterState re-render. No custom storage event channel."

key-files:
  created:
    - "frontend/src/components/recents/RecentRoutesTracker.tsx"
    - "frontend/src/components/recents/RecentlyVisitedSection.tsx"
    - "frontend/src/components/recents/__tests__/RecentRoutesTracker.test.tsx"
    - "frontend/src/components/recents/__tests__/RecentlyVisitedSection.test.tsx"
  modified:
    - "frontend/src/components/shell/AppShell.tsx"
    - "frontend/src/components/shell/Sidebar.tsx"
    - "docs/testid-registry.md"

key-decisions:
  - "Phase 26 Plan 04: SHEL-05 ships zero-render RecentRoutesTracker (writes cmc.recents.routes) + Sidebar RecentlyVisitedSection (top 3, current-route filtered) wired between Pinned and Configure."
  - "IA reconciliation: CONTEXT proposed `Pinned → Recently Visited → Operate → Configure` but Phase 25 Plan 09 locked Pinned between Operate and Configure. Final order locked here: Home → Observe → Operate → Pinned → Recently Visited → Configure. Documented in Sidebar.tsx header and in plan frontmatter rationale_for_deviation."
  - "Pitfall 8 option (b) — accept one-frame flicker AND filter currently-active route from the displayed list. Cleanest UX; no custom storage-event same-tab channel needed for v1."
  - "Reused SidebarNavLink as-is — did NOT add a `data-testid` prop. Section root testid (`sidebar-section-recently-visited`) + within()-scoped `sidebar-link-{slug}` lookups are sufficient for vitest + Playwright. Blast-radius rule preserved."
  - "normalizeRouteId inline-duplicated in components/recents/ rather than imported from components/savedviews/routeNormalize.ts — keeps the new recents/ module self-contained. Breadcrumb comment in both files."
  - "/skills/$name v1 navigability fallback: Recently Visited row navigates to `/skills` index (not the dynamic detail) because the ring entry does not carry the resolved dynamic value. Mirrors the PinnedViewsSection limitation locked in Phase 25 Plan 09."

patterns-established:
  - "AppShell zero-render-effect stack convention (3 effects today, designed to absorb more): DefaultViewLoader, RecentStateTracker, RecentRoutesTracker — all inside LoadedViewProvider, all returning null."
  - "Sidebar sibling-section pattern v2 — Recently Visited joins Pinned as a second cross-route auto/user-curated section type. Future sections following this shape: own component file under a domain-named subdirectory, own testId-prop-on-SidebarSection root, header-always-renders empty-body fallback."

# Metrics
duration: 7min
completed: 2026-05-13
---

# Phase 26 Plan 04: Recently Visited (SHEL-05) Summary

**Sidebar Recently Visited section + zero-render RecentRoutesTracker landing the SHEL-05 surface end-to-end — top 3 routes from cmc.recents.routes between Pinned and Configure, with the currently-active route filtered out via Pitfall 8 option b.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-13T10:48:03Z
- **Completed:** 2026-05-13T10:55:00Z (approx)
- **Tasks:** 2
- **Files modified:** 7 (4 created + 3 modified)

## Accomplishments

- `RecentRoutesTracker` zero-render effect mounts in AppShell and pushes every IN_SCOPE_ROUTES navigation into `cmc.recents.routes` (head-deduped, 20-cap — Plan 02's ring).
- Dynamic `/skills/<name>` pathnames normalize to `/skills/$name` in the ring (mirror of Phase 25 routeNormalize.ts).
- `RecentlyVisitedSection` reads the ring on render (re-triggered by `useRouterState`-driven navigation), filters out the currently-active route, slices to top 3, and renders `SidebarNavLink` rows.
- Sidebar IA finalized: `Home → Observe → Operate → Pinned → Recently Visited → Configure`. Reconciliation rationale documented in `Sidebar.tsx` header (CONTEXT proposed `Pinned → Recently Visited → Operate` but Phase 25 Plan 09 had already locked Pinned between Operate and Configure, so Recently Visited slots BELOW Pinned).
- 10 new vitest specs (5 + 5) — all pass. Project total: 540 → 550 (+10, includes sibling Plan 03 land in-flight 7 deltas already on disk).
- 1 new testid registered: `sidebar-section-recently-visited`. Per-row addressing reuses the existing `sidebar-link-{slug}` dynamic pattern via `within(section)` scoping — no SidebarNavLink prop change (blast-radius rule).

## Task Commits

Each task was committed atomically:

1. **Task 1: RecentRoutesTracker zero-render effect + AppShell mount** — `28dd978` (feat)
2. **Task 2: RecentlyVisitedSection + Sidebar wire-up + testid registration** — `4010a8b` (feat)

## Files Created/Modified

- `frontend/src/components/recents/RecentRoutesTracker.tsx` — created. Zero-render effect; writes cmc.recents.routes on IN_SCOPE_ROUTES navigation.
- `frontend/src/components/recents/RecentlyVisitedSection.tsx` — created. Sidebar section: top 3 recents, current route filtered.
- `frontend/src/components/recents/__tests__/RecentRoutesTracker.test.tsx` — created. 5 specs.
- `frontend/src/components/recents/__tests__/RecentlyVisitedSection.test.tsx` — created. 5 specs.
- `frontend/src/components/shell/AppShell.tsx` — added `<RecentRoutesTracker />` as the third zero-render effect inside `<LoadedViewProvider>`.
- `frontend/src/components/shell/Sidebar.tsx` — imported `RecentlyVisitedSection`, inserted between `<PinnedViewsSection />` and the Configure section; updated header docblock with the IA reconciliation rationale.
- `docs/testid-registry.md` — registered `sidebar-section-recently-visited` under a new "### Recents (Phase 26)" subsection.

## Decisions Made

- **Pitfall 8 option (b):** accept one-frame flicker AND filter the currently-active route from the displayed list. Cleanest UX; no custom storage-event same-tab channel needed for v1. Documented inline in both new components.
- **CONTEXT-reconciled IA:** Home → Observe → Operate → Pinned → Recently Visited → Configure. Recently Visited sits BELOW Pinned because Phase 25 Plan 09 locked Pinned between Operate and Configure; re-locating Pinned is out of scope for Phase 26.
- **No SidebarNavLink prop change:** kept the section minimal — reuse the existing `sidebar-link-{slug}` dynamic testid and address rows via `within(section)` scoping. Blast-radius rule preserved.
- **Inline normalizeRouteId duplication:** both `RecentRoutesTracker.tsx` and `RecentlyVisitedSection.tsx` carry an inline `normalizeRouteId` mirror of `savedviews/routeNormalize.ts`. Keeps the new `recents/` module self-contained; breadcrumb comments in both files flag the duplication if it ever needs to diverge.
- **Dynamic-segment v1 navigability:** `/skills/$name` ring entries navigate to the `/skills` index (not the dynamic detail) because the ring does not carry the resolved name. Mirrors the same v1 limitation Phase 25 Plan 09 locked for PinnedViewsSection.

## Deviations from Plan

None — plan executed exactly as written, with one deliberate, plan-allowed simplification:

The plan offered an optional `sidebar-recently-visited-route-{slug}` dynamic testid IF SidebarNavLink could be extended; it explicitly permitted omitting it ("keep blast radius minimal"). I chose the minimal path: relied on `SidebarNavLink`'s existing registered `sidebar-link-{slug}` pattern + `within(section)` scoping. Tests pass via this approach.

## Issues Encountered

- **Parallel sibling agent (Plan 03) had unstaged in-flight changes to `frontend/src/components/time/*` and `frontend/src/styles.css` during my run.** Full-project `tsc --noEmit` surfaced two errors in `src/components/time/__tests__/TimePicker.test.tsx` (lines 158 — sibling's WIP code, not mine). Per SCOPE BOUNDARY rule these are out of scope; my own files compile cleanly (pre-commit hook stashed sibling unstaged work and `tsc` passed on the staged subset both times). Did NOT touch sibling files — only staged my Task 1/2 artifacts.
- **No file conflicts in `AppShell.tsx`** — sibling had not yet modified it at the time I edited. My surgical edit added imports + the third zero-render effect only.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **SHEL-05 surface satisfied end-to-end.** Ring writes from every IN_SCOPE_ROUTES navigation; sidebar renders top 3 with current-route filter; testid registered.
- **Plan 08 (CMDK-04) ready to consume:** `getRecentRoutes()` from `frontend/src/lib/recents.ts` exposes the same ring for the future Cmd+K Recents group (top 5).
- **Mount-point stack ready for Plan 03's `AutoRefreshController`:** my edit reserves space immediately after `<RecentRoutesTracker />` inside `<LoadedViewProvider>`. Plan 03's surgical edit should add a single import + a single line.
- **No blockers.**

## Self-Check: PASSED

All 8 claimed artifact paths exist on disk; both commit hashes resolve in `git log --all`. Verified 2026-05-13T10:55Z.

- Files: `RecentRoutesTracker.tsx`, `RecentlyVisitedSection.tsx`, both `__tests__/*.test.tsx`, `AppShell.tsx`, `Sidebar.tsx`, `docs/testid-registry.md`, this `26-04-SUMMARY.md` — all FOUND.
- Commits: `28dd978` (Task 1), `4010a8b` (Task 2) — both FOUND.
- Vitest: 550/550 PASS (project baseline 533 + Plan 03 in-flight 7 already on disk + Plan 04's 10 new specs = 550).
- tsc on staged subset: clean (pre-commit hook PASSED both task commits).
- Lint: clean for new files (only sibling's in-flight `time/*` work-in-progress had a tsc complaint on UNSTAGED files — out of scope per SCOPE BOUNDARY rule).

---
*Phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k*
*Completed: 2026-05-13*
