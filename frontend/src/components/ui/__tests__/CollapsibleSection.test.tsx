import { describe, it, expect, beforeEach } from 'vitest'
import { render, userEvent } from '../../../test/utils'
import { CollapsibleSection } from '../CollapsibleSection'

describe('CollapsibleSection', () => {
  beforeEach(() => window.localStorage.clear())

  it('renders title and children when defaultOpen', () => {
    const { getByText } = render(
      <CollapsibleSection id="test1" title="Section A" defaultOpen>
        <div>Inner content</div>
      </CollapsibleSection>,
    )
    expect(getByText('Section A')).toBeInTheDocument()
    expect(getByText('Inner content')).toBeInTheDocument()
  })

  it('toggles state on header click and persists to cmc.collapsible.{id}', async () => {
    const user = userEvent.setup()
    const { getByText } = render(
      <CollapsibleSection id="persist-1" title="Header" defaultOpen>
        <div>Body</div>
      </CollapsibleSection>,
    )
    // Effect runs after first commit; assert initial true persisted.
    expect(window.localStorage.getItem('cmc.collapsible.persist-1')).toBe('true')
    await user.click(getByText('Header'))
    // After toggle to closed
    expect(window.localStorage.getItem('cmc.collapsible.persist-1')).toBe('false')
  })

  it('honors persisted state on mount (overrides defaultOpen=true if storage says false)', () => {
    // Storage is namespaced by lib/storage; the helper JSON-encodes booleans.
    window.localStorage.setItem('cmc.collapsible.persist-2', 'false')
    const { queryByText } = render(
      <CollapsibleSection id="persist-2" title="Header2" defaultOpen>
        <div>Hidden body</div>
      </CollapsibleSection>,
    )
    // Under MotionConfig reducedMotion="always" framer-motion snaps to animate state.
    // When open=false, AnimatePresence does not render the Collapsible.Content child.
    expect(queryByText('Hidden body')).toBeNull()
  })

  it('emits aria-expanded on the trigger', () => {
    const { getByRole } = render(
      <CollapsibleSection id="aria-1" title="Aria" defaultOpen>
        <div>Body</div>
      </CollapsibleSection>,
    )
    const trigger = getByRole('button', { name: /Aria/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})
