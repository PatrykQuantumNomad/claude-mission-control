// ShellErrorBoundary — UI-SPEC §Copywriting "Error state — shell-level fetch
// failure boundary". Wraps children with react-error-boundary and renders the
// canonical shell-level fallback that quotes the UI-SPEC error copy verbatim.
//
// react-error-boundary v6 typed FallbackProps.error as `unknown` (Plan 05-01
// decision); we narrow defensively here so any throw shape produces a readable
// message string in the .cmc-error-fallback__detail row.
//
// Note: routes/__root.tsx already inlines an inline ShellErrorFallback for the
// root tree. This module exposes a reusable wrapper that downstream callers
// (Phase 6 panel-level fallback boundaries, Plan 05-04 page-grid wrappers) can
// import. Plan 05-04 may consolidate the inline copy into this primitive.

import { ErrorBoundary as REBoundary, FallbackProps } from 'react-error-boundary'
import { ReactNode } from 'react'

function asMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function ShellErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div role="alert" className="cmc-error-fallback">
      <h2 className="cmc-error-fallback__heading">Couldn&apos;t reach the dashboard server.</h2>
      <p className="cmc-error-fallback__body">
        Check that <code>cmc start</code> is running, then refresh. If this keeps happening,
        run <code>cmc doctor</code> from your terminal.
      </p>
      <p className="cmc-error-fallback__detail">{asMessage(error)}</p>
      <button
        type="button"
        className="cmc-btn cmc-btn--secondary cmc-btn--md"
        onClick={resetErrorBoundary}
      >
        Retry
      </button>
    </div>
  )
}

interface ShellErrorBoundaryProps {
  children: ReactNode
  onReset?: () => void
}

export function ShellErrorBoundary({ children, onReset }: ShellErrorBoundaryProps) {
  return (
    <REBoundary FallbackComponent={ShellErrorFallback} onReset={onReset}>
      {children}
    </REBoundary>
  )
}
