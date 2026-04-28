import { Link } from '@tanstack/react-router'
import { EmergencyStopBanner } from './EmergencyStopBanner'
import { ThemeToggle } from './ThemeToggle'

const routes = [
  { to: '/', label: 'Command' },
  { to: '/activity', label: 'Activity' },
  { to: '/skills', label: 'Skills' },
] as const

export function NavBar() {
  return (
    <nav aria-label="Primary" className="cmc-navbar">
      <span className="cmc-brand">Mission Control</span>
      <ul className="cmc-navbar__links">
        {routes.map(({ to, label }) => (
          <li key={to}>
            <Link
              to={to}
              activeOptions={{ exact: to === '/' }}
              activeProps={{ className: 'cmc-navlink cmc-navlink--active' }}
              className="cmc-navlink"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
      {/* Phase 7 Plan 01 — TPNL-05. EmergencyStopBanner is mounted in the
          right-side action area so it is visible on every route from boot. */}
      <EmergencyStopBanner />
      <button
        type="button"
        className="cmc-cmdk-trigger cmc-label"
        aria-label="Open command palette (Cmd+K)"
      >
        <span aria-hidden>Cmd+K</span>
      </button>
      {/* Phase 9 Plan 05 — TEST-04 / Q1=A. ThemeToggle ships at far right of
          NavBar's action area. Persists via localStorage `cmc.theme`. */}
      <ThemeToggle />
    </nav>
  )
}
