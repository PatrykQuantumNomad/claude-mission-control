// Theme module — Phase 9 Plan 05 Task 1 (Q1=A locked).
//
// Minimal theme persistence layer for the dashboard. The TEST-04 contract is
// "theme toggle persists across reload" — we satisfy that with a single
// localStorage key (`cmc.theme`) and the `[data-theme="..."]` attribute on
// <html>. CSS variables in styles.css branch on [data-theme="light"]; the
// default (:root) is dark, matching the existing palette.
//
// applyTheme() is invoked from main.tsx BEFORE ReactDOM.createRoot so the
// data-theme attribute is set during the first paint — avoids a flash of
// wrong theme on cold load.
//
// Pitfall guard: SSR-safe — every accessor checks `typeof window` before
// touching localStorage / document. This codebase doesn't ship SSR, but the
// guard keeps unit tests clean and matches the conventions used by
// lib/storage.ts.

export type Theme = 'dark' | 'light'

export const DEFAULT_THEME: Theme = 'dark'

const KEY = 'cmc.theme'

export function getTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME
  const v = window.localStorage.getItem(KEY)
  return v === 'light' ? 'light' : 'dark'
}

export function setTheme(theme: Theme): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, theme)
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
}

// Apply the persisted theme to <html data-theme="…"> on boot. Call from
// main.tsx before ReactDOM.createRoot — guarantees no flash of wrong theme.
export function applyTheme(): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = getTheme()
}
