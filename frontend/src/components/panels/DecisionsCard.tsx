// DecisionsCard — HPNL-01 (current).
//
// Lists pending agent decisions and lets the operator answer inline. Each row
// expands to a textarea + Submit/Cancel; submission goes through
// useAnswerDecision (NON-optimistic — Pitfall 2). On 409 ("decision already
// answered") the error body literal surfaces inline and the user's typed
// answer is PRESERVED so they can re-read the live state and retry.
//
// Cadence is locked at 5_000ms in lib/queries.ts (useDecisions) — this panel
// does NOT inline refetchInterval.

import { useState, FormEvent } from 'react'
import { Button, PanelCard, RelativeTime, type LayoutCustomizableProps } from '../ui'
import { useAnswerDecision, useDecisions } from '../../lib/queries'
import type { DecisionListItem, DecisionListResponse } from '../../lib/api'

function DecisionRow({ decision }: { decision: DecisionListItem }) {
  const [expanded, setExpanded] = useState(false)
  const [answer, setAnswer] = useState('')
  const mutation = useAnswerDecision()

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!answer.trim() || mutation.isPending) return
    mutation.mutate(
      { id: decision.id, body: { answer, answered_by: 'dashboard' } },
      {
        onSuccess: () => {
          setExpanded(false)
          setAnswer('')
        },
        // onError: NO action — Pitfall 2: preserve typed answer so the user
        // can re-read the 409 body literal and retry against the live state.
      },
    )
  }

  function handleCancel() {
    setExpanded(false)
    mutation.reset()
  }

  return (
    <li className="cmc-decisions-row">
      <div className="cmc-decisions-row__head">
        <span className="cmc-decisions-row__question">{decision.prompt}</span>
        <RelativeTime value={decision.created_at} />
        {!expanded ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setExpanded(true)}
          >
            Answer
          </Button>
        ) : null}
      </div>
      {expanded ? (
        <form className="cmc-decisions-row__form" onSubmit={handleSubmit}>
          <textarea
            className="cmc-input"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer…"
            disabled={mutation.isPending}
            rows={3}
          />
          {mutation.isError ? (
            <p className="cmc-decisions-row__error" role="alert">
              {mutation.error instanceof Error
                ? mutation.error.message
                : 'Submit failed'}
            </p>
          ) : null}
          <div className="cmc-decisions-row__actions">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={mutation.isPending || !answer.trim()}
            >
              {mutation.isPending ? 'Submitting\u2026' : 'Submit'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  )
}

export function DecisionsCard({ panelId, headerMenu }: LayoutCustomizableProps = {}) {
  const query = useDecisions()
  return (
    <PanelCard<DecisionListResponse>
      bounded
      reqId="HPNL-01"
      title="Decisions"
      description="Pending agent decisions awaiting your answer"
      query={query}
      panelId={panelId}
      headerMenu={headerMenu}
      empty={{ dataNoun: 'pending decisions' }}
    >
      {(data) => (
        <ul className="cmc-decisions-list">
          {data.items.map((item) => (
            <DecisionRow key={item.id} decision={item} />
          ))}
        </ul>
      )}
    </PanelCard>
  )
}
