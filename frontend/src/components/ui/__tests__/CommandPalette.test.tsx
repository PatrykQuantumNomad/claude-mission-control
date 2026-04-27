import { describe, it, expect } from 'vitest'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { render, screen, userEvent, waitFor } from '../../../test/utils'
import { CommandPalette } from '../CommandPalette'
import { TaskComposerProvider } from '../../panels/TaskComposer'

// Render the CommandPalette inside an in-memory TanStack Router so its
// useNavigate() hook resolves. Mirrors the pattern used by AppShell.test.tsx
// (createMemoryHistory + createRoute) — preferred over `createFileRoute` here
// because file-route helpers expect a file-system convention that vitest
// cannot model in-memory.
function makeRouter(component: () => ReactNode = () => <CommandPalette />) {
  const rootRoute = createRootRoute({ component })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const activityRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/activity',
    component: () => null,
  })
  const skillsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/skills',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute, activityRoute, skillsRoute])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

describe('CommandPalette', () => {
  it('does not show input until Cmd+K pressed', async () => {
    const router = makeRouter()
    await router.load()
    const { queryByPlaceholderText } = render(<RouterProvider router={router} />)
    expect(queryByPlaceholderText(/search pages/i)).toBeNull()
  })

  it('opens on Cmd+K and shows the 3 page items + Quick task', async () => {
    const user = userEvent.setup()
    const router = makeRouter()
    await router.load()
    const { findByPlaceholderText, findByText } = render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await findByPlaceholderText(/search pages/i)).toBeInTheDocument()
    expect(await findByText('Command')).toBeInTheDocument()
    expect(await findByText('Activity')).toBeInTheDocument()
    expect(await findByText('Skills')).toBeInTheDocument()
    expect(await findByText('Quick task')).toBeInTheDocument()
  })

  it('also opens on Ctrl+K (Linux/Windows binding)', async () => {
    const user = userEvent.setup()
    const router = makeRouter()
    await router.load()
    const { findByPlaceholderText } = render(<RouterProvider router={router} />)
    await user.keyboard('{Control>}k{/Control}')
    expect(await findByPlaceholderText(/search pages/i)).toBeInTheDocument()
  })

  it('closes on Esc', async () => {
    const user = userEvent.setup()
    const router = makeRouter()
    await router.load()
    const { queryByPlaceholderText, findByPlaceholderText } = render(
      <RouterProvider router={router} />,
    )
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await findByPlaceholderText(/search pages/i)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(queryByPlaceholderText(/search pages/i)).toBeNull()
  })

  it('shows empty-state copy when search yields no matches', async () => {
    const user = userEvent.setup()
    const router = makeRouter()
    await router.load()
    const { findByPlaceholderText, findByText } = render(<RouterProvider router={router} />)
    await user.keyboard('{Meta>}k{/Meta}')
    const input = await findByPlaceholderText(/search pages/i)
    await user.type(input, 'zzzzznoresults')
    expect(await findByText(/No matches/i)).toBeInTheDocument()
  })

  it('selecting "Quick task" opens TaskComposer (Sheet visible) and closes the palette', async () => {
    // Phase 7 Plan 03 wiring — composer is opened via the new TaskComposerProvider
    // context. Mount the palette inside the provider; selecting the Quick task
    // item must flip composerOpen=true and close the palette in one click.
    function Mount() {
      return (
        <TaskComposerProvider>
          <CommandPalette />
        </TaskComposerProvider>
      )
    }
    function Wrap({ children }: { children: ReactNode }) {
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      })
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }
    const router = makeRouter(() => (
      <Wrap>
        <Mount />
      </Wrap>
    ))
    await router.load()
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    // Open the palette
    await user.keyboard('{Meta>}k{/Meta}')
    const quickTask = await screen.findByText('Quick task')
    await user.click(quickTask)
    // The TaskComposer Sheet (Radix Dialog) should now be visible. Sheet uses
    // role="dialog" and renders its title 'New task' inside the portal.
    await waitFor(() => {
      expect(screen.getByText('New task')).toBeInTheDocument()
    })
    // Palette is closed (Search input gone)
    expect(screen.queryByPlaceholderText(/search pages/i)).toBeNull()
  })
})
