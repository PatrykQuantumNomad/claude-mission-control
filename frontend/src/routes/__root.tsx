import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import { AppShell } from '../components/shell/AppShell'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

function ShellErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  // react-error-boundary v6 types `error` as `unknown`. Narrow defensively for
  // the message string — anything thrown can land here, including non-Errors.
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : JSON.stringify(error)
  return (
    <div role="alert" style={{ padding: 24 }}>
      <h2>Couldn't reach the dashboard server.</h2>
      <p>
        Check that <code>cmc start</code> is running, then refresh. If this keeps
        happening, run <code>cmc doctor</code> from your terminal.
      </p>
      <p style={{ color: 'var(--cmc-text-subtle)' }}>{message}</p>
      <button type="button" onClick={resetErrorBoundary}>
        Retry
      </button>
    </div>
  )
}

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary FallbackComponent={ShellErrorFallback}>
        <AppShell>
          <Outlet />
        </AppShell>
      </ErrorBoundary>
    </QueryClientProvider>
  ),
})
