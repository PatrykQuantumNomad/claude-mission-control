// InboxCard — HPNL-02 (Phase 7 Plan 02 / Wave 1).
//
// Lists unread agent-to-user messages with two row actions:
//   - Mark read: useReadInbox (OPTIMISTIC — idempotent so safe to flip UI
//     synchronously then rollback on error). The row gets data-read="true"
//     immediately on click; the actual fetch happens in the background.
//   - Reply: expands an inline textarea; submit calls useReplyInbox
//     (NON-optimistic). On success the row disappears via refetch.
//
// Cadence is locked at 10_000ms in lib/queries.ts (useInbox) — this panel
// does NOT inline refetchInterval.

import { useState, FormEvent } from 'react'
import { Button, PanelCard, RelativeTime } from '../ui'
import {
  useInbox,
  useReadInbox,
  useReplyInbox,
} from '../../lib/queries'
import type { InboxListItem, InboxListResponse } from '../../lib/api'

function InboxRow({ message }: { message: InboxListItem }) {
  const [expanded, setExpanded] = useState(false)
  const [reply, setReply] = useState('')
  const replyMutation = useReplyInbox()
  const readMutation = useReadInbox()

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!reply.trim() || replyMutation.isPending) return
    replyMutation.mutate(
      { id: message.id, body: { reply } },
      {
        onSuccess: () => {
          setExpanded(false)
          setReply('')
        },
      },
    )
  }

  function handleMarkRead() {
    if (message.read || readMutation.isPending) return
    readMutation.mutate(message.id)
  }

  return (
    <li className="cmc-inbox-row" data-read={message.read ? 'true' : 'false'}>
      <div className="cmc-inbox-row__head">
        <div className="cmc-inbox-row__copy">
          {message.subject ? (
            <span className="cmc-inbox-row__subject">{message.subject}</span>
          ) : null}
          <span className="cmc-inbox-row__body">{message.body}</span>
          <RelativeTime value={message.created_at} />
        </div>
        <div className="cmc-inbox-row__actions">
          {!expanded ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setExpanded(true)}
            >
              Reply
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleMarkRead}
            disabled={message.read}
          >
            Mark read
          </Button>
        </div>
      </div>
      {expanded ? (
        <form className="cmc-inbox-row__reply-form" onSubmit={handleSubmit}>
          <textarea
            className="cmc-input"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type your reply…"
            disabled={replyMutation.isPending}
            rows={3}
          />
          {replyMutation.isError ? (
            <p className="cmc-decisions-row__error" role="alert">
              {replyMutation.error instanceof Error
                ? replyMutation.error.message
                : 'Reply failed'}
            </p>
          ) : null}
          <div className="cmc-inbox-row__form-actions">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={replyMutation.isPending || !reply.trim()}
            >
              {replyMutation.isPending ? 'Sending\u2026' : 'Send reply'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setExpanded(false)
                replyMutation.reset()
              }}
              disabled={replyMutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  )
}

export function InboxCard() {
  const query = useInbox()
  return (
    <PanelCard<InboxListResponse>
      reqId="HPNL-02"
      title="Inbox"
      description="Unread messages from agents"
      query={query}
      empty={{ dataNoun: 'agent-to-user messages' }}
    >
      {(data) => (
        <ul className="cmc-inbox-list">
          {data.items.map((item) => (
            <InboxRow key={item.id} message={item} />
          ))}
        </ul>
      )}
    </PanelCard>
  )
}
