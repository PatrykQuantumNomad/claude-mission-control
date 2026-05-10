import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { applyDensity } from './lib/density'
import { applyTheme } from './lib/theme'
import { applySidebar } from './lib/sidebar'
import './styles.css'

// Phase 24 Plan 01 — apply persisted density BEFORE theme so density tokens
// resolve on :root before any [data-theme="light"] override depends on them.
// Phase 24 Plan 04 (SHEL-04) — applySidebar() reflects the persisted
// collapsed state into <html data-sidebar-collapsed> before paint so the
// Sidebar mounts at its remembered width without a flash. All three run
// BEFORE first paint to avoid a flash of wrong density/theme/width.
applyDensity()
applyTheme()
applySidebar()

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById('root')!
ReactDOM.createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
