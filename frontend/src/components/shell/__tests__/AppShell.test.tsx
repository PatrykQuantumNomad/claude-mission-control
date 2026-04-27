import { describe, it, expect } from 'vitest'
import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { render } from '../../../test/utils'
import { AppShell } from '../AppShell'

function makeRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell>
        <div data-testid="page">Page body</div>
      </AppShell>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const routeTree = rootRoute.addChildren([indexRoute])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

describe('AppShell', () => {
  it('renders NavBar and children inside <main>', async () => {
    const router = makeRouter()
    await router.load()
    const { findByText, getByRole, getByTestId } = render(
      <RouterProvider router={router} />,
    )
    expect(await findByText('Mission Control')).toBeInTheDocument()
    expect(getByRole('main')).toBeInTheDocument()
    expect(getByTestId('page')).toBeInTheDocument()
  })
})
