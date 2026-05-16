// Phase 28 / LAYO-01..04 — single source of truth for layout-customizable
// panels per route.
//
// What this module owns:
//   1. `PanelDescriptor` — the shape of one entry in the registry.
//   2. `PANEL_REGISTRY` — frozen `Record<route, PanelDescriptor[]>` enumerating
//      every PanelCard/BoundedPanelCard that the user can hide / reorder /
//      split-resize on the 5 in-scope routes (/, /activity, /cost, /skills,
//      /alerts) plus `/sessions/compare`.
//   3. `isValidPanelId(route, panelId)` — membership test used by
//      `useLayoutState` to filter unknown ids out of stale saved-view URLs
//      (Pitfall 7 — defense in depth; saved views from forward versions or
//      after a panel deletion still load, the dropped id is just ignored).
//   4. `normalizeRouteId(pathname)` — pathname → slug coercion for the
//      `panel-reset-layout-{route}` testid family (`/` → `home`,
//      `/sessions/compare` → `sessions-compare`, etc.). Throws on unknown
//      pathnames so a typo at a call site surfaces immediately instead of
//      silently producing a malformed testid.
//   5. `getPanelLabel(route, panelId)` — registry lookup with graceful
//      fallback to `panelId` for unknown panels or unknown routes (Pitfall 7).
//      Used by Plan 28-04 `DraggablePanelWrap` for the `aria-label` of the
//      drag grip + the aria-live announcement on reorder.
//
// Append-only invariant (Pitfall 9):
//   Once a panel id ships, it cannot be renamed or repurposed. A panel can
//   be removed from the registry (entry deleted) but its id remains reserved.
//   Saved views referencing a removed id resolve to a no-op via
//   `useLayoutState`'s registry-membership filter — never a crash.
//
// Why a central registry instead of per-panel `panelId` props with no map:
//   `useLayoutState.orderedPanels(columnId)` needs to enumerate ALL valid
//   ids for a column to filter URL params + reset-to-default. Without a
//   registry, every route component would inline the same enumeration —
//   duplication (RESEARCH §4 Q4).
//
// Naming convention:
//   Lowercase ASCII alphanumeric plus `_` / `-` only (matches the
//   `asHiddenPanels` regex). Kebab-case slugified user-facing label —
//   operator-visible, not the component file name.
//   `TokenUsageCard` → `token-usage`, `SystemHealthStrip` → `system-pressure`,
//   `SessionCompareView` → `session-compare`.
//
// columnId vocabulary:
//   - `top`: full-width panels rendered ABOVE the `.cmc-card-grid` container
//     (e.g. `SystemHealthStrip`, `KpiRow`, `AttentionBar`, `LiveSessionsCard`
//     on `/`; `ActivityHeatmap`, `ChartsStrip`, `SessionsTable` on
//     `/activity`).
//   - `main`: panels INSIDE the `.cmc-card-grid` flow.
//   - On `/sessions/compare` the single PanelCard descendant lives in `main`.

export interface PanelDescriptor {
  /** Stable panel id — lowercase ASCII alphanumeric plus `_` / `-`. Append-only. */
  panelId: string
  /** Column / grid group this panel renders in (`top` / `main`). */
  columnId: string
  /** Operator-visible label — shown in show/hide submenu + drag-grip aria-label. */
  label: string
  /** Whether the panel renders by default when the URL has no layout overrides. */
  defaultVisible: boolean
}

export const PANEL_REGISTRY: Record<string, PanelDescriptor[]> = {
  // routes/index.tsx — verified by grep of `<Panel/>`-equivalent component
  // mounts in `frontend/src/routes/index.tsx` (2026-05-16).
  //
  // Top-strip panels render above .cmc-card-grid; .cmc-card-grid contents
  // are `main` column. AttentionBar is `hiddenWhenEmpty` at the panel level
  // — `defaultVisible: true` still applies (visibility is empty-state-driven,
  // not layout-customization-driven).
  '/': [
    { panelId: 'system-pressure', columnId: 'top', label: 'System pressure', defaultVisible: true },
    { panelId: 'kpi-row', columnId: 'top', label: 'KPIs', defaultVisible: true },
    { panelId: 'attention-bar', columnId: 'top', label: 'Attention', defaultVisible: true },
    { panelId: 'live-sessions', columnId: 'top', label: 'Live sessions', defaultVisible: true },
    { panelId: 'token-usage', columnId: 'main', label: 'Token usage', defaultVisible: true },
    { panelId: 'cache-efficiency', columnId: 'main', label: 'Cache efficiency', defaultVisible: true },
    { panelId: 'session-outcomes', columnId: 'main', label: 'Session outcomes', defaultVisible: true },
    { panelId: 'tool-latency', columnId: 'main', label: 'Tool latency', defaultVisible: true },
    { panelId: 'hook-activity', columnId: 'main', label: 'Hook activity', defaultVisible: true },
    { panelId: 'project-breakdown', columnId: 'main', label: 'Project breakdown', defaultVisible: true },
    { panelId: 'agent-fanout', columnId: 'main', label: 'Agent fanout', defaultVisible: true },
    { panelId: 'edit-acceptance', columnId: 'main', label: 'Edit acceptance', defaultVisible: true },
    { panelId: 'productivity', columnId: 'main', label: 'Productivity', defaultVisible: true },
    { panelId: 'pressure-panel', columnId: 'main', label: 'Pressure', defaultVisible: true },
    { panelId: 'mcp-panel', columnId: 'main', label: 'MCP servers', defaultVisible: true },
  ],
  // routes/activity.tsx — top strip is ActivityHeatmap + ChartsStrip; .cmc-card-grid
  // is OtelPanel + UnifiedFailures + TopSkills; SessionsTable is full-width
  // below the grid (registered under `top` since it lives outside the grid
  // flow; layout-customization treats `top` as the non-grid column).
  '/activity': [
    { panelId: 'activity-heatmap', columnId: 'top', label: 'Activity heatmap', defaultVisible: true },
    { panelId: 'charts-strip', columnId: 'top', label: 'Charts strip', defaultVisible: true },
    { panelId: 'sessions-table', columnId: 'top', label: 'Sessions table', defaultVisible: true },
    { panelId: 'otel-panel', columnId: 'main', label: 'OTEL firehose', defaultVisible: true },
    { panelId: 'unified-failures', columnId: 'main', label: 'Failed sessions', defaultVisible: true },
    { panelId: 'top-skills', columnId: 'main', label: 'Top skills', defaultVisible: true },
  ],
  // routes/cost.tsx — 2 panels in the .cmc-card-grid; no top strip.
  '/cost': [
    { panelId: 'cost-forecast', columnId: 'main', label: 'Cost forecast', defaultVisible: true },
    { panelId: 'cost-by-project', columnId: 'main', label: 'Cost by project', defaultVisible: true },
  ],
  // routes/skills.tsx — DecisionsCard + InboxCard render above .cmc-card-grid
  // (`top`); the grid hosts the SKLP-* + TPNL-* family. SkillCostCardForTopSkill
  // is the SKLP-02 wrapper around SkillCostCard for the top-1 skill.
  '/skills': [
    { panelId: 'decisions', columnId: 'top', label: 'Decisions', defaultVisible: true },
    { panelId: 'inbox', columnId: 'top', label: 'Inbox', defaultVisible: true },
    { panelId: 'task-board', columnId: 'main', label: 'Task board', defaultVisible: true },
    { panelId: 'schedules', columnId: 'main', label: 'Schedules', defaultVisible: true },
    { panelId: 'skills-registry', columnId: 'main', label: 'Skills registry', defaultVisible: true },
    { panelId: 'mcp-servers', columnId: 'main', label: 'MCP servers', defaultVisible: true },
    { panelId: 'skill-cost', columnId: 'main', label: 'Skill cost', defaultVisible: true },
    { panelId: 'skill-latency', columnId: 'main', label: 'Skill latency', defaultVisible: true },
    { panelId: 'skill-timeline', columnId: 'main', label: 'Skill timeline', defaultVisible: true },
    { panelId: 'context-health', columnId: 'main', label: 'Context health', defaultVisible: true },
  ],
  // routes/alerts.tsx — AlertRulesList + AlertRuleForm in one .cmc-card-grid;
  // AlertEventsList in a second full-width .cmc-card-grid below. All three
  // share `main` since they all live inside grid containers.
  '/alerts': [
    { panelId: 'alert-rules-list', columnId: 'main', label: 'Alert rules', defaultVisible: true },
    { panelId: 'alert-rule-form', columnId: 'main', label: 'New alert rule', defaultVisible: true },
    { panelId: 'alert-events-list', columnId: 'main', label: 'Firing history', defaultVisible: true },
  ],
  // routes/sessions_.compare.tsx — single PanelCard descendant containing the
  // ResizablePanelGroup with `groupId="compare"`. The split-pane lives INSIDE
  // this panel; the panel itself is the only layout-customizable surface for
  // show/hide (it doesn't make sense to hide the only panel on the page —
  // but the registry entry is required so SavedViewMenu's Reset Layout still
  // resolves a route slug for the testid).
  '/sessions/compare': [
    { panelId: 'session-compare', columnId: 'main', label: 'Session compare', defaultVisible: true },
  ],
}

/**
 * Membership test — is `panelId` registered on `route`?
 *
 * Returns `false` for unknown routes (defense in depth — never crashes if
 * a caller passes a route slug that isn't in the registry, e.g.
 * `/skills/$name` which is intentionally out of scope per RESEARCH §5 A3).
 */
export function isValidPanelId(route: string, panelId: string): boolean {
  return PANEL_REGISTRY[route]?.some((p) => p.panelId === panelId) ?? false
}

/**
 * Lookup the operator-visible label for a panel.
 *
 * Returns the registered `label` when found; falls back to `panelId` itself
 * when the route is unknown OR the panel id is not in the route's registry.
 * The fallback preserves graceful degradation when a saved view references
 * a panel that has been removed from the registry (Pitfall 7).
 *
 * Used by Plan 28-04 `DraggablePanelWrap` for the drag-grip `aria-label`
 * and the aria-live reorder announcement.
 */
export function getPanelLabel(route: string, panelId: string): string {
  return (
    PANEL_REGISTRY[route]?.find((p) => p.panelId === panelId)?.label ?? panelId
  )
}

// Static set of in-scope route pathnames. Kept inline (not exported) since
// the only consumer is `normalizeRouteId` and any other module that wants
// to iterate routes should walk `Object.keys(PANEL_REGISTRY)` directly.
const ROUTE_SLUGS: Record<string, string> = {
  '/': 'home',
  '/activity': 'activity',
  '/cost': 'cost',
  '/skills': 'skills',
  '/alerts': 'alerts',
  '/sessions/compare': 'sessions-compare',
}

/**
 * Pathname → slug coercion for the `panel-reset-layout-{route}` testid family.
 *
 * Slug vocabulary matches `sidebar-link-{slug}` and `cmdk-recents-route-{slug}`
 * (docs/testid-registry.md). Throws when the pathname is not a known Phase
 * 28 in-scope route — defense in depth so a typo at a call site surfaces
 * immediately instead of silently producing a malformed testid that
 * Playwright would then fail to locate with a less-actionable error.
 *
 * NOTE: This is distinct from `frontend/src/components/savedviews/
 * routeNormalize.ts` `normalizeRouteId` which coerces dynamic-segment
 * pathnames (`/skills/foo`) back to their route id (`/skills/$name`) for
 * the saved_views DB column. The two normalizers operate on different
 * vocabularies (route id vs. testid slug) — by design.
 */
export function normalizeRouteId(pathname: string): string {
  const slug = ROUTE_SLUGS[pathname]
  if (slug === undefined) {
    throw new Error(
      `normalizeRouteId: unknown pathname "${pathname}" — expected one of ${Object.keys(
        ROUTE_SLUGS,
      ).join(', ')}`,
    )
  }
  return slug
}
