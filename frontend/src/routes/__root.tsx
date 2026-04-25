import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="cmc-shell">
      <header className="cmc-header">Claude Mission Control</header>
      <Outlet />
    </div>
  ),
})
