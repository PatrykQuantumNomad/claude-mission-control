import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, screen, userEvent } from '../../../test/utils'
import { ShellErrorBoundary } from '../ErrorBoundary'
import { useState } from 'react'

function Boom({ shouldThrow, message }: { shouldThrow: boolean; message: string }) {
  if (shouldThrow) {
    throw new Error(message)
  }
  return <p>All good</p>
}

describe('ShellErrorBoundary', () => {
  // React logs the caught error to console.error during render — silence it for clean test output.
  let errSpy: ReturnType<typeof vi.spyOn>
  beforeAll(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterAll(() => {
    errSpy.mockRestore()
  })

  it('renders the UI-SPEC verbatim fallback when a child throws + surfaces error.message in the detail row', () => {
    render(
      <ShellErrorBoundary>
        <Boom shouldThrow message="ECONNREFUSED" />
      </ShellErrorBoundary>,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: /Couldn't reach the dashboard server\./ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/cmc start/)).toBeInTheDocument()
    expect(screen.getByText(/cmc doctor/)).toBeInTheDocument()
    expect(screen.getByText('ECONNREFUSED')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('Retry click resets the boundary so a non-throwing child can render', async () => {
    const user = userEvent.setup()

    function Wrapper() {
      const [thrown, setThrown] = useState(true)
      return (
        <ShellErrorBoundary onReset={() => setThrown(false)}>
          <Boom shouldThrow={thrown} message="initial fail" />
        </ShellErrorBoundary>
      )
    }

    render(<Wrapper />)
    expect(screen.getByText('initial fail')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('All good')).toBeInTheDocument()
  })
})
