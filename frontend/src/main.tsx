import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { applyDensity } from './lib/density'
import { applyTheme } from './lib/theme'
import './styles.css'

// Phase 24 Plan 01 — apply persisted density BEFORE theme so density tokens
// resolve on :root before any [data-theme="light"] override depends on them.
// Both run BEFORE first paint to avoid a flash of wrong density/theme.
applyDensity()
applyTheme()

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
