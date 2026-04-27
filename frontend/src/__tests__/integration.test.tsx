// End-to-end smoke test for the full Phase 5 shell.
//
// Boots the real <RouterProvider> over the generated routeTree (NOT an
// in-memory createRoute mock — those are reserved for component-level tests
// in components/ui/__tests__/*). This test exercises the entire mounted app:
// __root.tsx (QueryClientProvider + ErrorBoundary + AppShell) → routes/index
// (or activity / skills) → PlaceholderCardGrid → Card + EmptyState.
//
// `createMemoryHistory` gives a deterministic test environment without
// touching the browser history API. The selector `'h1'` discriminates page
// headings from CommandPalette items that share the same text.

import { describe, it, expect } from 'vitest'
import { render, userEvent } from '../test/utils'
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'

function makeRouter(initialEntry: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
}

describe('integration: full app', () => {
  it('mounts / and shows Command heading + at least one OPNL placeholder', async () => {
    const router = makeRouter('/')
    const { findByText } = render(<RouterProvider router={router} />)
    expect(await findByText('Command', { selector: 'h1' })).toBeInTheDocument()
    expect(await findByText('OPNL-01')).toBeInTheDocument()
    expect(await findByText('OPNL-15')).toBeInTheDocument()
  })

  it('mounts /activity and shows Activity heading + ACTV slots', async () => {
    const router = makeRouter('/activity')
    const { findByText } = render(<RouterProvider router={router} />)
    expect(await findByText('Activity', { selector: 'h1' })).toBeInTheDocument()
    expect(await findByText('ACTV-01')).toBeInTheDocument()
    expect(await findByText('ACTV-06')).toBeInTheDocument()
  })

  it('mounts /skills and shows Skills heading + HPNL/TPNL/SKLP slots', async () => {
    const router = makeRouter('/skills')
    const { findByText } = render(<RouterProvider router={router} />)
    expect(await findByText('Skills', { selector: 'h1' })).toBeInTheDocument()
    expect(await findByText('HPNL-01')).toBeInTheDocument()
    expect(await findByText('TPNL-01')).toBeInTheDocument()
    expect(await findByText('SKLP-01')).toBeInTheDocument()
  })

  it('Cmd+K opens the global CommandPalette from / route', async () => {
    const user = userEvent.setup()
    const router = makeRouter('/')
    const { findByPlaceholderText } = render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await findByPlaceholderText(/search pages/i)).toBeInTheDocument()
  })

  it('Cmd+K opens the global CommandPalette from /skills route too', async () => {
    const user = userEvent.setup()
    const router = makeRouter('/skills')
    const { findByPlaceholderText } = render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await findByPlaceholderText(/search pages/i)).toBeInTheDocument()
  })
})
