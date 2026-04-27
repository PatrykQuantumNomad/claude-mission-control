import { ReactNode } from 'react'
import { NavBar } from './NavBar'

interface AppShellProps {
  children: ReactNode
}

/**
 * Pure-presentational top-level layout. Mounts <NavBar> + a semantic <main>
 * wrapping the page body. NOT responsible for QueryClientProvider /
 * ErrorBoundary — those mount one level up at the route-tree root in
 * routes/__root.tsx so AppShell stays trivially unit-testable.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="cmc-shell">
      <NavBar />
      <main className="cmc-main">{children}</main>
    </div>
  )
}
