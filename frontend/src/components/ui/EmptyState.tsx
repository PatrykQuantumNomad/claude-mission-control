// EmptyState — UI-SPEC FESH-09 + §Copywriting voice rules. Centered layout
// with: optional icon (rendered at 48px in --cmc-text-dim via CSS), heading,
// body, optional action slot (typically a primary Button).
//
// This ships only the structural primitive; current supplies the noun-
// substituted body string per the UI-SPEC's "Once {data-noun} arrives it will
// appear here" template.

import { ReactNode } from 'react'

interface EmptyStateProps {
  heading: string
  body: string
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({ heading, body, icon, action }: EmptyStateProps) {
  return (
    <div className="cmc-empty-state">
      {icon ? (
        <div className="cmc-empty-state__icon" aria-hidden>
          {icon}
        </div>
      ) : null}
      <h3 className="cmc-empty-state__heading">{heading}</h3>
      <p className="cmc-empty-state__body">{body}</p>
      {action ? <div className="cmc-empty-state__action">{action}</div> : null}
    </div>
  )
}
