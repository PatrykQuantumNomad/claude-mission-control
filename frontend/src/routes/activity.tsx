import { createFileRoute } from '@tanstack/react-router'

function ActivityPage() {
  return (
    <section aria-labelledby="activity-heading">
      <h1
        id="activity-heading"
        style={{
          fontSize: 'var(--size-display)',
          fontWeight: 'var(--weight-semibold)',
          margin: '0 0 var(--space-lg)',
        }}
      >
        Activity
      </h1>
      <p style={{ color: 'var(--cmc-text-dim)' }}>
        Phase 5 placeholder — the panel grid lands in Plan 05-04.
      </p>
    </section>
  )
}

export const Route = createFileRoute('/activity')({ component: ActivityPage })
