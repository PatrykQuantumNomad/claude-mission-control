// ThemeToggle — Phase 9 Plan 05 Task 1 (TEST-04).
//
// Single-button dark/light toggle, mounted in NavBar's right-side action
// area. Round-trips through lib/theme.ts so the localStorage key (`cmc.theme`)
// and the data-theme attribute stay in sync.
//
// Q1=A locked: this is the minimal palette flip per the plan. Light theme is
// functional, not polished; visual polish is deferred to v2.
//
// Inline SVGs (sun + moon) — keep the bundle small and avoid a new icon
// dependency. The existing Lucide library could supply icons, but for ~30 LOC
// the inline path data is simpler and ships nothing new.

import { useEffect, useState } from 'react'
import { getTheme, setTheme, type Theme } from '../../lib/theme'

export function ThemeToggle() {
  // Mount with the default; useEffect syncs to the persisted value AFTER
  // hydration so React 19 StrictMode doesn't double-warn about a localStorage
  // read during render.
  const [theme, setLocal] = useState<Theme>('dark')
  useEffect(() => {
    setLocal(getTheme())
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setLocal(next)
  }

  const nextLabel = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={`Switch to ${nextLabel} theme`}
      className="cmc-theme-toggle"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}
