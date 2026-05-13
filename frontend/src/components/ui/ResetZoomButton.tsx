// ResetZoomButton — Phase 26 Plan 05 (TIME-05).
//
// Chart-header chrome. Visible only when the URL window is absolute (a
// brush-zoom commit has fired). Click clears time_from/time_to from URL,
// which lets the panel's per-route fallback (Wave 4 plans wire this) take
// over again. Also unfreezes AutoRefreshController.

import { useNavigate, useRouterState } from '@tanstack/react-router'
import { ZoomOut } from 'lucide-react'

const ISO_RE = /^\d{4}-\d{2}-\d{2}T/

export function ResetZoomButton() {
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })
  const search = (location.search ?? {}) as Record<string, unknown>
  const timeFrom = typeof search.time_from === 'string' ? search.time_from : undefined
  const isZoomed = ISO_RE.test(timeFrom ?? '')
  if (!isZoomed) return null

  function resetZoom() {
    navigate({
      to: location.pathname as never,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        time_from: undefined,
        time_to: undefined,
      })) as never,
      replace: false,
    })
  }

  return (
    <button
      type="button"
      className="cmc-reset-zoom-button cmc-btn cmc-btn--ghost cmc-btn--sm"
      data-testid="reset-zoom-button"
      aria-label="Reset zoom"
      onClick={resetZoom}
    >
      <ZoomOut size={14} aria-hidden />
      <span>Reset zoom</span>
    </button>
  )
}
