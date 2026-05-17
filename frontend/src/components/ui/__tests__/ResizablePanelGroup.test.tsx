// ResizablePanelGroup — Phase 28 Plan 28-05 (LAYO-03).
//
// Test strategy:
//   - Mock `react-resizable-panels` because happy-dom does not fully implement
//     CSS layout (the real library reads bounding boxes during drag). The mock
//     exposes Group / Panel / Separator as plain <div>s plus a captured handle
//     to the `onLayoutChanged` prop so tests can synthesise a release-end
//     layout payload without driving the actual pointer-events pipeline.
//   - Real TanStack in-memory router so `useLayoutState(pathname)` reads/writes
//     real URL search state (mirror PanelHeaderMenu.test.tsx pattern).
//   - The real `useLayoutState` hook is exercised — NOT mocked — so the
//     setSplit(groupId, null) prune path is verified end-to-end against the
//     Plan 28-02 contract.
//
// DEVIATION from RESEARCH.md §1 (`Layout = number[]`):
//   The actual library type is `Layout = { [panelId: string]: number }`.
//   ResizablePanelGroup accepts a positional `panelIds` array prop and
//   serializes between the URL CSV (positional) and the library map (id-keyed).
//   Tests below assert this mapping by invoking the captured onLayoutChanged
//   with a real id-keyed map and checking the URL gains positional CSV.
//
// Behaviour exercised (per the plan's <behavior> block):
//   1. defaultLayout passed to Group is {'side-a': 70, 'side-b': 30} when URL
//      has split_sizes=compare:70,30
//   2. defaultLayout falls back to defaultSizes mapped against panelIds when
//      URL has no split_sizes
//   3. onLayoutChanged({'side-a': 60, 'side-b': 40}) → URL gains
//      split_sizes=compare:60,40
//   4. onLayoutChanged({'side-a': 50, 'side-b': 50}) (matches defaultSizes)
//      → URL DROPS split_sizes (prune via setSplit(groupId, null))
//   5. Group receives onLayoutChanged but NOT onLayoutChange (Pitfall 6 gate)

import { describe, it, expect, vi } from 'vitest'

// Module-scoped capture of the onLayoutChanged prop so tests can invoke it
// imperatively (simulating a release-end pointerup from the real library).
const lastGroupProps: { props?: Record<string, unknown> } = {}

vi.mock('react-resizable-panels', () => ({
  Group: (props: Record<string, unknown>) => {
    lastGroupProps.props = props
    const { defaultLayout, orientation, children, className } = props as {
      defaultLayout?: Record<string, number>
      orientation?: string
      children?: unknown
      className?: string
    }
    return (
      <div
        data-testid="rrp-group"
        data-layout={JSON.stringify(defaultLayout)}
        data-orientation={orientation}
        className={className}
      >
        {children as React.ReactNode}
      </div>
    )
  },
  Panel: (props: { id?: string; children?: React.ReactNode }) => (
    <div data-testid={`rrp-panel-${props.id ?? ''}`}>{props.children}</div>
  ),
  Separator: (props: Record<string, unknown>) => (
    <div data-testid="rrp-separator" {...props} />
  ),
}))

import {
  createRouter,
  RouterProvider,
  createRootRoute,
  createMemoryHistory,
} from '@tanstack/react-router'
import { render, screen } from '../../../test/utils'
import { ResizablePanelGroup } from '../ResizablePanelGroup'
import { Panel } from 'react-resizable-panels'
import { act } from 'react'

function makeRouter(initialUrl: string, children: React.ReactNode) {
  const rootRoute = createRootRoute({
    component: () => <>{children}</>,
  })
  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  })
}

async function renderGroup(initialUrl: string) {
  const router = makeRouter(
    initialUrl,
    <ResizablePanelGroup
      groupId="compare"
      panelIds={['side-a', 'side-b']}
      defaultSizes={[50, 50]}
    >
      <Panel id="side-a" defaultSize={50} minSize={20}>
        a
      </Panel>
      <Panel id="side-b" defaultSize={50} minSize={20}>
        b
      </Panel>
    </ResizablePanelGroup>,
  )
  await router.load()
  render(<RouterProvider router={router} />)
  return router
}

function invokeReleaseLayout(layout: Record<string, number>) {
  const onLayoutChanged = lastGroupProps.props?.onLayoutChanged as
    | ((layout: Record<string, number>) => void)
    | undefined
  if (!onLayoutChanged) throw new Error('Group did not receive onLayoutChanged')
  act(() => {
    onLayoutChanged(layout)
  })
}

describe('ResizablePanelGroup (Phase 28 Plan 28-05 — LAYO-03)', () => {
  describe('URL round-trip', () => {
    it('reads split_sizes from the URL on mount and seeds defaultLayout', async () => {
      await renderGroup('/sessions/compare?split_sizes=compare:70,30')
      const group = await screen.findByTestId('rrp-group')
      const layout = JSON.parse(group.getAttribute('data-layout') ?? '{}')
      expect(layout).toEqual({ 'side-a': 70, 'side-b': 30 })
    })

    it('falls back to the defaultSizes prop when the URL has no split_sizes', async () => {
      await renderGroup('/sessions/compare')
      const group = await screen.findByTestId('rrp-group')
      const layout = JSON.parse(group.getAttribute('data-layout') ?? '{}')
      expect(layout).toEqual({ 'side-a': 50, 'side-b': 50 })
    })

    it('writes URL on onLayoutChanged (NOT onLayoutChange — Pitfall 6 perf gate)', async () => {
      const router = await renderGroup('/sessions/compare')
      // The Group MUST receive onLayoutChanged (release-only) and MUST NOT
      // receive onLayoutChange (per-pointer-tick — Pitfall 6).
      expect(lastGroupProps.props?.onLayoutChanged).toBeDefined()
      expect(lastGroupProps.props?.onLayoutChange).toBeUndefined()

      invokeReleaseLayout({ 'side-a': 60, 'side-b': 40 })
      await router.invalidate()

      const search = router.state.location.search as { split_sizes?: string }
      expect(search.split_sizes).toBe('compare:60,40')
    })

    it('omits split_sizes when sizes return to defaults (prune via setSplit(groupId, null))', async () => {
      const router = await renderGroup(
        '/sessions/compare?split_sizes=compare:70,30',
      )
      // Pre-condition — URL has split_sizes.
      const before = router.state.location.search as {
        split_sizes?: string
      }
      expect(before.split_sizes).toBe('compare:70,30')

      // Release at the default [50, 50] — wrapper should detect the match and
      // prune the group from split_sizes, removing the URL param entirely.
      invokeReleaseLayout({ 'side-a': 50, 'side-b': 50 })
      await router.invalidate()

      const after = router.state.location.search as { split_sizes?: string }
      expect(after.split_sizes).toBeUndefined()
    })
  })

  describe('Separator + orientation', () => {
    it('renders a Separator with data-testid="resize-handle-{groupId}"', async () => {
      await renderGroup('/sessions/compare')
      const sep = await screen.findByTestId('resize-handle-compare')
      expect(sep).toBeInTheDocument()
    })

    it('defaults orientation to horizontal', async () => {
      await renderGroup('/sessions/compare')
      const group = await screen.findByTestId('rrp-group')
      expect(group.getAttribute('data-orientation')).toBe('horizontal')
    })
  })
})
