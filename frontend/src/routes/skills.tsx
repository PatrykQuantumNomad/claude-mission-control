import { createFileRoute } from '@tanstack/react-router'

function SkillsPage() {
  return (
    <section aria-labelledby="skills-heading">
      <h1
        id="skills-heading"
        style={{
          fontSize: 'var(--size-display)',
          fontWeight: 'var(--weight-semibold)',
          margin: '0 0 var(--space-lg)',
        }}
      >
        Skills
      </h1>
      <p style={{ color: 'var(--cmc-text-dim)' }}>
        Phase 5 placeholder — the panel grid lands in Plan 05-04.
      </p>
    </section>
  )
}

export const Route = createFileRoute('/skills')({ component: SkillsPage })
