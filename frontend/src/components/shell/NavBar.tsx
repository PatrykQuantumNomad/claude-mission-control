import { Link } from '@tanstack/react-router'

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
      <button
        type="button"
        className="cmc-cmdk-trigger cmc-label"
        aria-label="Open command palette (Cmd+K)"
      >
        <span aria-hidden>Cmd+K</span>
      </button>
    </nav>
  )
}
