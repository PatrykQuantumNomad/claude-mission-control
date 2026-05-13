// CommandPalette — UI-SPEC FESH-07. Wraps cmdk's Command.Dialog with a global
// Cmd+K (and Ctrl+K) hotkey. Mounted once at AppShell level so the binding
// fires regardless of the active route.
//
// Effect cleanup is mandatory (design notes) — React 19 StrictMode
// double-invokes effects in dev, and without removeEventListener we'd register
// the handler twice and Cmd+K would toggle twice per press.
//
// "Quick task" opens the global TaskComposer (TPNL-02) via the
// TaskComposerProvider context that AppShell wraps the tree with. current
// implementation wired this — earlier comments referenced "TPNL-03" by mistake;
// the composer is TPNL-02 (Schedules slide-out is TPNL-04, later work).
//
// Empty-state body and input placeholder copy are verbatim from
// UI-SPEC §Copywriting — do not paraphrase without re-reading the spec.
//
// Phase 16 Plan 03 (CMPR-03) — context-aware "Compare with…" / "Compare
// sessions" item under the Actions group. Behaviour branches on the current
// route via `useRouterState({ select: (s) => s.location })`:
//   1. Default (anywhere except /sessions/compare with `a` set): label is
//      "Compare sessions". Selecting navigates to /sessions/compare with no
//      params — the page renders its idle empty-state prompting the user to
//      pick two sessions.
//   2. On `/sessions/compare?a=X` with no `b`: label is "Compare with…".
//      Selecting opens a session-picker Sheet listing recent sessions
//      (useSessionsList({ range: '7d', limit: 50 })). Choosing a row calls
//      navigate({ search: (prev) => ({ ...prev, b: chosenSid }) }) — function
//      form per Pitfall 4 (no stale-closure infinite loop).
//   3. On `/sessions/compare?a=X&b=Y`: label is "Pick a different session B".
//      Same picker behaviour; selection replaces `b`.
//
// Self-compare guard: the picker's row click is disabled when
// `chosenSid === currentA` (defensive — backend already 400-rejects a==b
// per Plan 16-01, but the UI shouldn't even let the user try).
//
// Phase 25 Plan 08 (CMDK-01) — "Saved Views" Command.Group surfaces every
// saved view across every route (cross-route useSavedViews() with no filter).
// Sort: current-route's views first (using normalizeRouteId(location.pathname)
// to map `/skills/foo` → `/skills/$name`), then other routes' views — secondary
// sort is alphabetical by name. Selecting a view does TWO things: navigate to
// its route with state_json as search params, AND setLoadedView(v) so the
// header chrome (SavedViewMenu trigger label + UnsavedPip + EditOrForkDialog)
// wires correctly post-navigation. Dynamic-segment routes (`/skills/$name`)
// have a v1 limitation: state_json is search-only, so the view is navigable
// ONLY when the user is already on a matching pathname (e.g. /skills/foo). When
// the user is elsewhere, selecting the view is a no-op + console.warn. Future
// improvement: add a `params` field on SavedView (Phase 26+) if this is a UX
// pain point. routePathFromId() encapsulates the navigability decision.
//
// Phase 23 Plan 02 (CMPR-07) — "Compare with previous session" action +
// project_key picker scoping (D-07..D-14):
//   - Visibility: action only renders when there is an "active session" to
//     compare from. The active session is either:
//       (a) the session whose detail Sheet is open (provided by
//           useActiveSession() — set by LiveSessionsCard / SkillRunsTable
//           on Sheet open/close), OR
//       (b) the `a` URL param when on /sessions/compare with `a` set
//           (D-10 — treat `a` as current and resolve previous-of-`a`).
//   - Existence gate: useSessionPrevious(activeSid) returns null on 404
//     (no previous). Action is HIDDEN while loading and when null returns.
//   - Action: navigate({ to: '/sessions/compare', search: { a: current,
//     b: previous } }). On the compare route, also clear stale `b` so the
//     new pair lands cleanly even if the user previously had a `b` set.
//   - Picker scoping (D-11..D-13): when the compare picker opens with side
//     A known, scope candidates to A's PROJECT IDENTITY. The wire APIs
//     (sessions list + sessionCompare) do NOT expose `project_key` directly
//     today — the only project-shaped field on those rows is `cwd`. So
//     we use `cwd` equality as the project-identity proxy: rows whose
//     `cwd` matches A's cwd remain visible; others are filtered out. If
//     A has no cwd (null/empty), do NOT filter (D-13 fallback to global).

import { Command } from 'cmdk'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useTaskComposer } from '../panels/TaskComposer'
import {
  useSavedViews,
  useSessionCompare,
  useSessionPrevious,
  useSessionsList,
} from '../../lib/queries'
import { useActiveSession } from '../shell/ActiveSessionContext'
import { useLoadedView } from '../savedviews/LoadedViewContext'
import { normalizeRouteId } from '../savedviews/SavedViewMenu'
import type { SavedView } from '../../lib/api'
import { Sheet } from './Sheet'
import { getRecentRoutes } from '../../lib/recents'
import { getAllRecentStates } from '../../lib/savedViews'
import { serializeRange, parseRangeFromText } from '../../lib/time/clipboard'
import { asTimeToken } from '../../lib/searchSchemas'

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function parseSearchUuid(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_RE.test(value) ? value : undefined
}

// Phase 26 Plan 06 (CMDK-04) — IN_SCOPE_ROUTES for cross-route ad-hoc recent
// states aggregation. Mirror of RecentRoutesTracker.tsx and
// RecentStateTracker.tsx route sets — keep these three lists in sync. If a new
// route opts into validateSearch + push-on-mount tracking it MUST also be
// listed here so the Cmd+K palette surfaces its recents.
const RECENTS_IN_SCOPE_ROUTES: readonly string[] = [
  '/',
  '/activity',
  '/sessions/compare',
  '/skills',
  '/skills/$name',
  '/cost',
  '/alerts',
] as const

/**
 * Phase 26 Plan 06 (CMDK-04) — slug the route pathname for use inside
 * `cmdk-recents-route-{slug}`. The root path collapses to `home`; all other
 * pathnames have leading slash stripped and remaining slashes hyphenated.
 * Mirror of SidebarNavLink's slug derivation so the surfaces speak the same
 * vocabulary in tests (`sidebar-link-home` ↔ `cmdk-recents-route-home`).
 */
export function routeToTestidSlug(route: string): string {
  if (route === '/') return 'home'
  return route.replace(/^\//, '').replace(/\//g, '-').replace(/\$/g, '')
}

// Phase 26 Plan 06 (CMDK-03) — Time range presets for the Cmd+K palette.
// Condensed mirror of the 13-preset TimePicker list (lib/time/PresetList.tsx).
// CONTEXT.md picks the four most-used windows for the palette; the full grid
// stays in the TimePicker popover.
const CMDK_TIME_PRESETS: readonly {
  value: string
  label: string
  from: string
  to: string
}[] = [
  { value: '1h', label: 'Last 1 hour', from: 'now-1h', to: 'now' },
  { value: '24h', label: 'Last 24 hours', from: 'now-24h', to: 'now' },
  { value: '7d', label: 'Last 7 days', from: 'now-7d', to: 'now' },
  { value: '30d', label: 'Last 30 days', from: 'now-30d', to: 'now' },
] as const

/**
 * Phase 25 Plan 08 (CMDK-01) — resolve a SavedView.route id into a navigable
 * pathname relative to the user's current location.
 *
 * - Static routes (no `$`): returns the route id verbatim.
 * - Dynamic-segment routes (e.g. `/skills/$name`): navigable ONLY when the
 *   current pathname is on the same base prefix (so the dynamic param value
 *   is implicitly preserved). Returns the current pathname in that case;
 *   returns `null` otherwise — caller should NOT navigate.
 *
 * v1 limitation: a saved view's `state_json` is search-params only — it does
 * NOT carry the resolved dynamic param value. If the user saves a view on
 * `/skills/foo` and later opens the Cmd+K palette from `/cost`, we cannot
 * reconstruct `/skills/foo` without that param. Phase 26+ may add a `params`
 * field on SavedView to lift this restriction.
 */
export function routePathFromId(
  routeId: string,
  currentPathname: string,
): string | null {
  if (!routeId.includes('$')) return routeId
  const base = routeId.split('/$')[0] // e.g. '/skills/$name' → '/skills'
  if (currentPathname === base) return null
  if (currentPathname.startsWith(base + '/')) return currentPathname
  return null
}

/**
 * Phase 25 Plan 08 (CMDK-01) — produce the cross-route saved-views list
 * sorted with the current-route's views first, then everything else, with a
 * stable alphabetical secondary sort by name. Pure function (no hooks) so
 * the test suite can exercise the ordering invariant without rendering the
 * Command.Dialog. The CommandPalette body memoizes the result with the
 * current route + the raw items array as deps.
 */
export function sortSavedViewsForPalette(
  items: SavedView[],
  currentRoute: string,
): SavedView[] {
  return [...items].sort((a, b) => {
    const aIsCurrent = a.route === currentRoute ? 0 : 1
    const bIsCurrent = b.route === currentRoute ? 0 : 1
    if (aIsCurrent !== bIsCurrent) return aIsCurrent - bIsCurrent
    return a.name.localeCompare(b.name)
  })
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const navigate = useNavigate()
  const composer = useTaskComposer()

  // Read the live router location so the Compare item label + behaviour can
  // branch on whether we're already on the /sessions/compare route. The
  // selector form keeps the subscription tight — re-renders only when
  // pathname/search actually change, never on every router internal tick.
  const location = useRouterState({ select: (s) => s.location })
  const isOnCompareRoute = location.pathname === '/sessions/compare'
  const search = (location.search ?? {}) as Record<string, unknown>
  const currentA = isOnCompareRoute ? parseSearchUuid(search.a) : undefined
  const currentB = isOnCompareRoute ? parseSearchUuid(search.b) : undefined

  // Phase 25 Plan 08 (CMDK-01) — cross-route saved-views list. No route
  // filter ⇒ every view across every route is fetched. Sort places the
  // current-route's views first (via normalizeRouteId — same coercion site
  // SavedViewMenu uses). setLoadedView wires the chrome after selection.
  const { data: savedViewsData } = useSavedViews()
  const { setLoadedView } = useLoadedView()
  const currentRouteForViews = normalizeRouteId(location.pathname)
  const sortedSavedViews = useMemo(
    () =>
      sortSavedViewsForPalette(
        savedViewsData?.items ?? [],
        currentRouteForViews,
      ),
    [savedViewsData, currentRouteForViews],
  )

  // Phase 23 Plan 02 (CMPR-07): "Compare with previous session" needs to know
  // the user's currently focused session id. Two sources, in priority order:
  //   1. ActiveSessionContext (set by LiveSessionsCard / SkillRunsTable when
  //      their detail Sheet is open) — D-07 lock: "available only on session
  //      detail views".
  //   2. URL `a` on /sessions/compare — D-10 lock: "treat `a` as current and
  //      set `b` to previous-of-`a`".
  // The two sources are mutually compatible: if the user is on
  // /sessions/compare and has no Sheet open, source 2 wins. The ranking
  // matters when both are present (rare) — we prefer the explicit Sheet.
  const { activeSessionId } = useActiveSession()
  const compareWithPreviousSourceId = activeSessionId ?? currentA ?? null
  const previousQuery = useSessionPrevious(compareWithPreviousSourceId)
  // Action visibility (D-09): hide unless previous exists. Loading state
  // (data === undefined) also hides — better to flicker the action in than
  // navigate to a 404. `previousQuery.data === null` is the explicit
  // "no previous" empty-state from useSessionPrevious().
  const previousSid =
    previousQuery.data && !previousQuery.isError
      ? previousQuery.data.session_id
      : null
  const showCompareWithPrevious =
    Boolean(compareWithPreviousSourceId) && previousSid !== null

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const close = useCallback(() => setOpen(false), [])
  const closePicker = useCallback(() => setPickerOpen(false), [])

  // Cmd+K Compare item label. Branches per the plan's decision §1.
  let compareLabel: string
  if (currentA && !currentB) {
    compareLabel = 'Compare with…'
  } else if (currentA && currentB) {
    compareLabel = 'Pick a different session B'
  } else {
    compareLabel = 'Compare sessions'
  }

  const onCompareSelect = useCallback(() => {
    if (currentA) {
      // Picker mode: open the session-list Sheet so the user can pick the
      // second (or replacement) session. Closing the palette here keeps the
      // visual focus on the Sheet that's about to mount.
      close()
      setPickerOpen(true)
    } else {
      // Default mode: just navigate to the compare page; it renders an idle
      // pick-two empty-state.
      navigate({ to: '/sessions/compare' })
      close()
    }
  }, [currentA, navigate, close])

  // Phase 23 Plan 02 (CMPR-07 D-08 / D-10): "Compare with previous session"
  // action handler. Navigates directly to /sessions/compare with both
  // params resolved — no picker Sheet involved. When triggered from the
  // compare route itself (D-10), the existing `b` (if any) is REPLACED
  // by the resolved previous; we don't preserve stale `b` because the
  // user's intent is "show me the prior comparison anchor", not "tweak
  // the current one".
  const onCompareWithPreviousSelect = useCallback(() => {
    if (!compareWithPreviousSourceId || !previousSid) return // gated; defensive
    navigate({
      to: '/sessions/compare',
      search: { a: compareWithPreviousSourceId, b: previousSid } as Record<
        string,
        unknown
      >,
    })
    close()
  }, [compareWithPreviousSourceId, previousSid, navigate, close])

  // Phase 25 Plan 08 (CMDK-01) — saved-view selection handler. Dynamic-route
  // guard: routePathFromId returns null when the view's route requires a
  // pathname param the current location can't supply (e.g. a /skills/$name
  // view selected from /cost). In that case we soft-warn and exit; the user
  // can still navigate to the right base route and re-open the palette.
  // Successful navigation also runs setLoadedView(v) so the SavedViewMenu
  // trigger label + UnsavedPip + EditOrForkDialog wire correctly.
  const onSavedViewSelect = useCallback(
    (v: SavedView) => {
      const target = routePathFromId(v.route, location.pathname)
      if (target === null) {
        console.warn(
          `[CommandPalette] Saved view "${v.name}" requires a specific entity (route ${v.route}) — navigate to ${v.route.split('/$')[0]}/<id> first.`,
        )
        close()
        return
      }
      navigate({
        to: target,
        search: v.state_json as Record<string, unknown>,
      })
      setLoadedView(v)
      close()
    },
    [navigate, setLoadedView, close, location.pathname],
  )

  // Picker scoping (D-11..D-13): when side A is known, fetch its compare-side
  // payload to read `cwd` (the project-identity proxy — see header note).
  // The compare hook is enabled-gated by Boolean(a && b), so passing a single
  // id with `b=undefined` keeps it idle. We only need `a`'s cwd, so we read
  // from the compare cache opportunistically: if the user has already
  // visited /sessions/compare?a=X&b=Y the cwd is already cached. Otherwise
  // we still attempt a single-side resolution via a no-op b — but to keep
  // this surgical (and avoid a fresh API surface for "session by id metadata"),
  // we fall back to NOT scoping when no cached compare-side is available.
  // This honours D-13's spirit (no scope when project identity is unknown)
  // without inventing a new endpoint.
  //
  // Future improvement: if SessionListItem grew a `cwd` projection that the
  // picker could read directly, we could scope without consulting the
  // compare cache. SessionListItemFull DOES expose cwd today (per api.ts),
  // so picker filtering can also use the picker's OWN row data: filter by
  // (row.cwd === aCwd). That's the path we take below — see ComparePicker.
  //
  // Pass currentA's cwd lookup down to the picker. The picker will perform
  // the actual filter on its row dataset (which already has cwd).
  const aCompareQuery = useSessionCompare(currentA, currentB)
  const aCwd: string | null = useMemo(() => {
    if (!currentA) return null
    const data = aCompareQuery.data
    if (!data) return null
    // `a` may be either side depending on URL ordering. Match by session_id.
    if (data.a.session_id === currentA) return data.a.cwd ?? null
    if (data.b.session_id === currentA) return data.b.cwd ?? null
    return null
  }, [currentA, aCompareQuery.data])

  // Picker selection: function-form `search: (prev) => ...` is the documented
  // TanStack Router idiom (Pitfall 4 in 16-RESEARCH.md). Eliminates the
  // stale-closure infinite-render loop that the object form is prone to.
  const onPickerSelect = useCallback(
    (chosenSid: string) => {
      if (chosenSid === currentA) return // self-compare guard (defensive)
      navigate({
        to: '/sessions/compare',
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          b: chosenSid,
        }),
      })
      closePicker()
    },
    [currentA, navigate, closePicker],
  )

  // Phase 26 Plan 06 (CMDK-04) — Recents group data. Read via plain function
  // calls from the localStorage-backed rings (cmc.recents.routes for routes
  // and cmc.savedView.recent.<route> for ad-hoc states). Memoised on
  // pathname so the list refreshes after each navigation push: useRouterState
  // already re-renders this component on navigation, which is when the rings
  // grow. Top-5 truncation per CONTEXT.md decision.
  const recentRoutes = useMemo(() => {
    return getRecentRoutes().slice(0, 5)
  }, [location.pathname])

  const recentAdHocStates = useMemo(() => {
    return getAllRecentStates(RECENTS_IN_SCOPE_ROUTES).slice(0, 5)
  }, [location.pathname])

  // Phase 26 Plan 06 (CMDK-03) — Time range commands. applyTimeRange writes
  // the time_from/time_to URL params via function-form navigate (Pitfall 4:
  // no stale-closure infinite-loop). Matches TimePicker preset apply exactly
  // so Cmd+K is a genuine second access path with no extra contract.
  const applyTimeRange = useCallback(
    (from: string, to: string) => {
      navigate({
        to: location.pathname as never,
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          time_from: from,
          time_to: to,
        })) as never,
      })
    },
    [navigate, location.pathname],
  )

  const onCopyTimeRange = useCallback(async () => {
    const currentSearch = (location.search ?? {}) as Record<string, unknown>
    const timeFrom =
      typeof currentSearch.time_from === 'string'
        ? currentSearch.time_from
        : undefined
    const timeTo =
      typeof currentSearch.time_to === 'string'
        ? currentSearch.time_to
        : undefined
    close()
    if (!timeFrom || !timeTo) {
      toast.error('No time range to copy')
      return
    }
    try {
      await navigator.clipboard.writeText(serializeRange(timeFrom, timeTo))
      toast.success('Time range copied')
    } catch {
      toast.error('Could not access clipboard')
    }
  }, [location.search, close])

  const onPasteTimeRange = useCallback(async () => {
    close()
    try {
      const text = await navigator.clipboard.readText()
      const parsed = parseRangeFromText(text)
      if (!parsed) {
        toast.error('No time range on clipboard')
        return
      }
      const f = asTimeToken(parsed.time_from)
      const t = asTimeToken(parsed.time_to)
      if (!f || !t) {
        toast.error('No time range on clipboard')
        return
      }
      applyTimeRange(f, t)
      toast.message('Pasted time range')
    } catch {
      toast.error('Could not access clipboard')
    }
  }, [close, applyTimeRange])

  return (
    <>
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Mission Control command palette"
        className="cmc-cmdk"
        contentClassName="cmc-cmdk__content"
      >
        <Command.Input
          placeholder="Search pages, sessions, schedules…"
          className="cmc-cmdk__input"
        />
        <Command.List className="cmc-cmdk__list">
          <Command.Empty className="cmc-cmdk__empty">
            No matches. Try fewer letters or open the page directly.
          </Command.Empty>
          {/* Phase 26 Plan 06 (CMDK-04) — Recents group. Top-5 recent routes
              from cmc.recents.routes + top-5 cross-route ad-hoc states from
              cmc.savedView.recent.<route>. JSX position is the FIRST group
              (Pitfall 10: cmdk renders by JSX child position — frequency-first
              ordering per CONTEXT.md). */}
          <Command.Group heading="Recents" className="cmc-cmdk__group">
            {recentRoutes.length === 0 && recentAdHocStates.length === 0 ? (
              <div
                className="cmc-cmdk__empty"
                data-testid="cmdk-recents-empty"
              >
                No recents yet
              </div>
            ) : (
              <>
                {recentRoutes.map((r) => {
                  const slug = routeToTestidSlug(r.route)
                  return (
                    <Command.Item
                      key={`recent-route-${r.route}`}
                      value={`recent-route-${r.route}`}
                      className="cmc-cmdk__item"
                      data-testid={`cmdk-recents-route-${slug}`}
                      onSelect={() => {
                        navigate({ to: r.route as never })
                        close()
                      }}
                    >
                      <span className="cmc-cmdk__item-name">
                        {r.route === '/' ? 'Home' : r.route}
                      </span>
                      <span className="cmc-cmdk__item-meta">route</span>
                    </Command.Item>
                  )
                })}
                {recentAdHocStates.map((s, i) => (
                  <Command.Item
                    key={`recent-state-${i}-${s.route}-${s.visitedAt}`}
                    value={`recent-state-${i}-${s.route}`}
                    className="cmc-cmdk__item"
                    data-testid={`cmdk-recents-state-${i}`}
                    onSelect={() => {
                      navigate({
                        to: s.route as never,
                        search: s.state as never,
                      })
                      close()
                    }}
                  >
                    <span className="cmc-cmdk__item-name">{s.route}</span>
                    <span className="cmc-cmdk__item-meta">
                      {Object.keys(s.state ?? {}).length} filters
                    </span>
                  </Command.Item>
                ))}
              </>
            )}
          </Command.Group>
          <Command.Group heading="Saved Views" className="cmc-cmdk__group">
            {sortedSavedViews.length === 0 ? (
              <div
                className="cmc-cmdk__empty"
                data-testid="cmdk-saved-views-empty"
              >
                No saved views yet
              </div>
            ) : (
              sortedSavedViews.map((v) => (
                <Command.Item
                  key={v.id}
                  // cmdk searches against `value`; include name + route so
                  // typing either surface filters the item in.
                  value={`saved-view-${v.id} ${v.name} ${v.route}`}
                  className="cmc-cmdk__item"
                  data-testid={`cmdk-saved-view-${v.id}`}
                  onSelect={() => onSavedViewSelect(v)}
                >
                  <span className="cmc-cmdk__item-name">{v.name}</span>
                  <span className="cmc-cmdk__item-meta">{v.route}</span>
                </Command.Item>
              ))
            )}
          </Command.Group>
          <Command.Group heading="Pages" className="cmc-cmdk__group">
            <Command.Item
              onSelect={() => {
                navigate({ to: '/' })
                close()
              }}
              className="cmc-cmdk__item"
            >
              Command
            </Command.Item>
            <Command.Item
              onSelect={() => {
                navigate({ to: '/activity' })
                close()
              }}
              className="cmc-cmdk__item"
            >
              Activity
            </Command.Item>
            <Command.Item
              onSelect={() => {
                navigate({ to: '/skills' })
                close()
              }}
              className="cmc-cmdk__item"
            >
              Skills
            </Command.Item>
          </Command.Group>
          {/* Phase 26 Plan 06 (CMDK-03) — Time range group. 4 condensed
              presets + Copy + Paste. Selection writes time_from/time_to via
              function-form navigate (Pitfall 4) — identical to the
              TimePicker preset apply codepath. Copy/Paste reuse the
              Cmd+Shift+C/V codepaths from TimePicker via the same clipboard
              helpers from lib/time/clipboard.ts. */}
          <Command.Group heading="Time range" className="cmc-cmdk__group">
            {CMDK_TIME_PRESETS.map((p) => (
              <Command.Item
                key={`time-${p.value}`}
                value={`time-range-${p.value} ${p.label}`}
                className="cmc-cmdk__item"
                data-testid={`cmdk-time-range-${p.value}`}
                onSelect={() => {
                  applyTimeRange(p.from, p.to)
                  close()
                }}
              >
                {p.label}
              </Command.Item>
            ))}
            <Command.Item
              value="time-range-copy"
              className="cmc-cmdk__item"
              data-testid="cmdk-time-range-copy"
              onSelect={() => {
                void onCopyTimeRange()
              }}
            >
              Copy time range (Cmd+Shift+C)
            </Command.Item>
            <Command.Item
              value="time-range-paste"
              className="cmc-cmdk__item"
              data-testid="cmdk-time-range-paste"
              onSelect={() => {
                void onPasteTimeRange()
              }}
            >
              Paste time range (Cmd+Shift+V)
            </Command.Item>
          </Command.Group>
          {/* Phase 26 Plan 06 (CMDK-02) — Density group lands in Task 2 of
              this same plan. JSX slot is RESERVED here so the locked 6-group
              order matches the final layout: Recents → Saved Views → Pages →
              Time range → Density → Actions (Pitfall 10). Filled in atomically
              by the next commit; no intermediate state reaches main. */}
          <Command.Group heading="Actions" className="cmc-cmdk__group">
            <Command.Item
              onSelect={() => {
                close()
                composer.setOpen(true)
              }}
              className="cmc-cmdk__item"
            >
              Quick task
            </Command.Item>
            <Command.Item
              onSelect={onCompareSelect}
              className="cmc-cmdk__item"
            >
              {compareLabel}
            </Command.Item>
            {showCompareWithPrevious ? (
              <Command.Item
                onSelect={onCompareWithPreviousSelect}
                className="cmc-cmdk__item"
                data-testid="cmdk-compare-with-previous"
              >
                Compare with previous session
              </Command.Item>
            ) : null}
          </Command.Group>
        </Command.List>
      </Command.Dialog>
      <ComparePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentA={currentA}
        scopeCwd={aCwd}
        onSelect={onPickerSelect}
      />
    </>
  )
}

interface ComparePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentA: string | undefined
  /**
   * Phase 23 Plan 02 (CMPR-07 D-11..D-13): when non-null, the picker scopes
   * its candidate list to rows whose `cwd` equals `scopeCwd` (project-
   * identity proxy — see CommandPalette header comment for the full
   * rationale). When null, no scoping is applied (D-13 fallback to global).
   */
  scopeCwd: string | null
  onSelect: (sid: string) => void
}

function ComparePicker({
  open,
  onOpenChange,
  currentA,
  scopeCwd,
  onSelect,
}: ComparePickerProps) {
  // Reuse the existing list hook (lib/queries.ts:188) so we get the same
  // 30s polling cadence + placeholderData that powers the SessionsTable
  // panel. Default range '7d' / limit 50 mirrors the plan's decision §4.
  // The hook is always mounted (so cmdk pre-warms data even before the
  // Sheet opens) — `open` only gates the visual render.
  const query = useSessionsList({ range: '7d', limit: 50 })
  const allItems = query.data?.items ?? []
  // D-11..D-13: filter by cwd when scopeCwd is non-null+non-empty. D-13:
  // when scopeCwd is null OR an empty string, do not filter.
  const items = useMemo(() => {
    if (!scopeCwd) return allItems
    return allItems.filter((row) => row.cwd === scopeCwd)
  }, [allItems, scopeCwd])

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Pick a session to compare"
      description={
        scopeCwd
          ? `Showing sessions from ${scopeCwd} only.`
          : currentA
            ? 'Select a session to set as side B for the comparison.'
            : 'Select a session to start comparing.'
      }
    >
      {query.isPending && !query.data ? (
        <p className="cmc-empty">Loading recent sessions…</p>
      ) : items.length === 0 ? (
        <p className="cmc-empty">
          {scopeCwd
            ? `No sessions in ${scopeCwd} in the last 7 days.`
            : 'No sessions in the last 7 days.'}
        </p>
      ) : (
        <ul className="cmc-cmdk-picker" data-testid="cmdk-compare-picker-list">
          {items.map((row) => {
            const disabled = row.session_id === currentA
            return (
              <li key={row.session_id} className="cmc-cmdk-picker__row">
                <button
                  type="button"
                  className="cmc-btn cmc-btn--ghost cmc-btn--sm"
                  disabled={disabled}
                  onClick={() => onSelect(row.session_id)}
                  aria-label={`Compare with session ${row.session_id}`}
                >
                  <span className="cmc-mono">
                    {row.session_id.slice(0, 8)}
                    {'…'}
                  </span>
                  <span style={{ marginLeft: 8, color: 'var(--cmc-text-subtle)' }}>
                    {row.cwd ?? '—'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}
