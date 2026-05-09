// ActiveSessionContext — Phase 23 Plan 02 (CMPR-07 D-07).
//
// Tracks "what session detail view is the user currently focused on?". The
// CommandPalette reads this to decide whether the "Compare with previous
// session" action is even visible (D-07 lock: action is available ONLY on
// session detail views). When the user has no session detail open, the
// active id is null and the Cmd+K action stays hidden.
//
// Why a context (instead of route-derived state)? The two session-detail
// surfaces — `LiveSessionsCard` and `SkillRunsTable` — both render their
// detail in a Sheet portal, NOT a TanStack Router route. Route-derived
// inference (`location.pathname.startsWith('/sessions/')`) would miss them
// entirely and would also produce false positives on the activity table
// (`/activity`) which lists session rows but does not surface a detail view.
// A small global context lets each Sheet OWNER explicitly opt-in: open Sheet
// → setActiveSessionId(sid); close Sheet → setActiveSessionId(null).
//
// The context value is referentially stable across re-renders of the
// provider's tree EXCEPT when the active id changes — useState + an inline
// object literal would create a new object every render and force every
// consumer to re-render. We intentionally accept the inline object cost here
// because (a) consumer count is small (CommandPalette + the two card
// owners), (b) re-renders only fire when the id flips between non-null and
// null, which is a meaningful UX event the consumers DO need to react to.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

interface ActiveSessionValue {
  /** Currently focused session id (null when no session detail Sheet open). */
  activeSessionId: string | null
  /** Set or clear the active session. Pass null on Sheet close. */
  setActiveSessionId: (sid: string | null) => void
}

const ActiveSessionContext = createContext<ActiveSessionValue | null>(null)

export function ActiveSessionProvider({ children }: { children: ReactNode }) {
  const [activeSessionId, setActiveSessionIdRaw] = useState<string | null>(null)
  // Wrap the setter in useCallback so consumers depending on it as an effect
  // dep don't re-run on every Provider render.
  const setActiveSessionId = useCallback((sid: string | null) => {
    setActiveSessionIdRaw(sid)
  }, [])
  // useMemo so the value object identity is stable across renders that don't
  // change the active id — keeps consumer re-renders tied to actual id flips.
  const value = useMemo<ActiveSessionValue>(
    () => ({ activeSessionId, setActiveSessionId }),
    [activeSessionId, setActiveSessionId],
  )
  return (
    <ActiveSessionContext.Provider value={value}>
      {children}
    </ActiveSessionContext.Provider>
  )
}

/**
 * Read the current active session id + setter.
 *
 * Consumers MUST be wrapped in `<ActiveSessionProvider>` (mounted once at
 * AppShell level — see AppShell.tsx). Using this hook outside the provider
 * returns a no-op default so unit tests of leaf components don't have to
 * wrap themselves in the provider when the active-session feature is not
 * under test. The default's setter is a no-op — calling it is silent and
 * safe.
 */
export function useActiveSession(): ActiveSessionValue {
  const ctx = useContext(ActiveSessionContext)
  if (ctx) return ctx
  // No-op default: leaf components (e.g. SkillRunsTable in isolation) can
  // call setActiveSessionId without mandating provider mounting in tests
  // that don't exercise the Cmd+K visibility gate.
  return { activeSessionId: null, setActiveSessionId: () => undefined }
}
