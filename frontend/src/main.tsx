import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { applyTheme } from './lib/theme'
import './styles.css'

// Phase 9 Plan 05 — apply persisted theme BEFORE first paint. Sets
// document.documentElement.dataset.theme so [data-theme="light"] CSS overrides
// kick in synchronously and we never see a flash of wrong theme on cold load.
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
