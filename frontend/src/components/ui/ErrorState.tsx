// ErrorState — Phase 6 Plan 01. In-card error block with retry button.
// Used by PanelCard's `query.isError` branch and any future panel that needs
// to render a recoverable error inside a Card without bouncing the whole
// dashboard to ShellErrorBoundary.
//
// Copy follows UI-SPEC §Copywriting voice: "Couldn't load {dataNoun}.
// Refresh or check `cc doctor`." — concrete noun, actionable hint.

import { Button } from './Button'

interface ErrorStateProps {
  message: string
  dataNoun?: string
  onRetry?: () => void
}

export function ErrorState({ message, dataNoun = 'data', onRetry }: ErrorStateProps) {
  return (
    <div className="cmc-error-state" role="alert">
      <p className="cmc-error-state__msg">
        Couldn{'\u2019'}t load {dataNoun}. Refresh or check <code>cc doctor</code>.
      </p>
      <p className="cmc-error-state__hint">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}
