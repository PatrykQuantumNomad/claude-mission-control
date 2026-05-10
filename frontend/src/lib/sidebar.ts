// Sidebar collapsed-state module — Phase 24 Plan 04 (SHEL-04).
//
// Mirror of `lib/theme.ts` and `lib/density.ts`. Persists the user's
// expanded/collapsed preference under localStorage `cmc.sidebar.collapsed`
// and reflects it as `<html data-sidebar-collapsed="true|false">` so CSS can
// branch (`[data-sidebar-collapsed="true"] .cmc-sidebar { width: 52px; }`).
//
// applySidebar() is invoked from main.tsx BEFORE ReactDOM.createRoot so the
// data-sidebar-collapsed attribute is set during the first paint — avoids a
// flash of the wrong sidebar width on cold load. Per CONTEXT, Cmd+B (or
// Ctrl+B on non-Mac) is the only keyboard toggle; the chrome control button
// in the sidebar header is the alternative entry point.
//
// Pitfall guard: SSR-safe — every accessor checks `typeof window` /
// `typeof document` before touching localStorage / DOM, matching the
// conventions used by lib/theme.ts and lib/density.ts.

export const SIDEBAR_KEY = 'cmc.sidebar.collapsed'

export function isSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_KEY) === 'true'
}

export function setSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_KEY, collapsed ? 'true' : 'false')
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.sidebarCollapsed = collapsed ? 'true' : 'false'
  }
}

// Apply the persisted collapsed state to <html data-sidebar-collapsed="…">
// on boot. Call from main.tsx before ReactDOM.createRoot — guarantees no
// flash of the wrong sidebar width.
export function applySidebar(): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.sidebarCollapsed = isSidebarCollapsed()
    ? 'true'
    : 'false'
}
