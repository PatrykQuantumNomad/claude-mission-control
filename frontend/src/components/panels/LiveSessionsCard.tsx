// LiveSessionsCard — OPNL-04 (current).
//
// Lists active sessions and opens a Sheet drawer with the tool timeline +
// follow-up message form when a row is clicked. Cadences are owned by
// lib/queries.ts:
//   - useLiveSessions(): 5s, returns a BARE LiveSessionItem[] (no items envelope)
//   - useSessionDetails(sid): 5s while drawer is open, paused otherwise
//   - useFollowUpMessage(): mutation; invalidates liveSessions on success
//
// Backend HTTPException handler emits {error: detail} (cmc.core.errors). The
// follow-up form surfaces that body verbatim when mutation.isError fires
// (409 ended session / 400 invalid sid / 404 missing).

import { useState, FormEvent } from 'react'
import { Button, PanelCard, RelativeTime, Sheet, Skeleton, StatePill } from '../ui'
import {
  useFollowUpMessage,
  useLiveSessions,
  useSessionDetails,
} from '../../lib/queries'
import type {
  LiveSessionItem,
  SessionDetailsResponse,
  ToolTimelineEntry,
} from '../../lib/api'

function shortSid(sid: string): string {
  return sid.length > 8 ? sid.slice(-8) : sid
}

type RowState = 'ok' | 'running' | 'pending' | 'stale' | 'error'
function rowState(state: string | null): RowState {
  if (!state) return 'pending'
  const s = state.toLowerCase()
  if (s === 'running' || s === 'live') return 'running'
  if (s === 'idle') return 'ok'
  if (s === 'stale') return 'stale'
  if (s === 'error' || s === 'errored') return 'error'
  if (s === 'ok' || s === 'done') return 'ok'
  return 'pending'
}

function ToolTimeline({ tools }: { tools: ToolTimelineEntry[] }) {
  if (tools.length === 0) {
    return (
      <p style={{ color: 'var(--cmc-text-subtle)', margin: 0 }}>
        No tool calls recorded yet.
      </p>
    )
  }
  return (
    <div className="cmc-tool-timeline">
      {tools.map((t) => (
        <div key={t.tool_use_id} className="cmc-tool-timeline__row">
          <span className="cmc-tool-timeline__name">{t.tool_name}</span>
          <RelativeTime value={t.started_at} />
          <span className="cmc-tool-timeline__status">{t.status}</span>
          <span className="cmc-tool-timeline__latency">
            {t.duration_ms !== null ? `${t.duration_ms}ms` : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

function FollowUpForm({
  sid,
  onClose: _onClose,
}: {
  sid: string
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const mutation = useFollowUpMessage()
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!text.trim() || mutation.isPending) return
    mutation.mutate(
      { sid, message: text },
      {
        onSuccess: () => {
          setText('')
          // Drawer stays open — let the operator confirm timeline updates.
        },
      },
    )
  }
  return (
    <form className="cmc-followup-form" onSubmit={handleSubmit}>
      <label htmlFor="cmc-followup-textarea" className="cmc-label">
        Follow-up message
      </label>
      <textarea
        id="cmc-followup-textarea"
        className="cmc-followup-form__textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a follow-up to queue for this session…"
        disabled={mutation.isPending}
      />
      {mutation.isError ? (
        <p className="cmc-followup-form__error" role="alert">
          {mutation.error instanceof Error ? mutation.error.message : 'Send failed'}
        </p>
      ) : null}
      <div className="cmc-followup-form__actions">
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={mutation.isPending || !text.trim()}
        >
          {mutation.isPending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  )
}

function SessionDrawerBody({
  sid,
  onClose,
}: {
  sid: string
  onClose: () => void
}) {
  const details = useSessionDetails(sid)
  if (details.isPending) {
    return <Skeleton variant="text" lines={6} />
  }
  if (details.isError || !details.data) {
    return (
      <p role="alert" className="cmc-followup-form__error">
        Couldn{'\u2019'}t load session details:{' '}
        {details.error instanceof Error ? details.error.message : 'unknown error'}
      </p>
    )
  }
  const data: SessionDetailsResponse = details.data
  const ended = data.session.ended_at !== null
  return (
    <div className="cmc-session-drawer">
      <header className="cmc-session-drawer__header">
        <span className="cmc-session-drawer__sid">{data.session.session_id}</span>
        <h3 className="cmc-session-drawer__heading">
          {data.session.model ?? 'Unknown model'}
        </h3>
        <div className="cmc-session-drawer__meta">
          <span>
            Started <RelativeTime value={data.session.started_at} />
          </span>
          {data.session.ended_at ? (
            <span>
              Ended <RelativeTime value={data.session.ended_at} />
            </span>
          ) : null}
          <StatePill
            state={rowState(data.session.outcome)}
            label={data.session.outcome ?? 'live'}
          />
        </div>
      </header>
      <section>
        <h4 className="cmc-label" style={{ marginBottom: 'var(--space-xs)' }}>
          Tool timeline
        </h4>
        <ToolTimeline tools={data.tools} />
      </section>
      <section>
        {ended ? (
          <p className="cmc-followup-form__ended">
            This session has ended; follow-ups disabled.
          </p>
        ) : (
          <FollowUpForm sid={sid} onClose={onClose} />
        )}
      </section>
    </div>
  )
}

export function LiveSessionsCard() {
  const [activeSid, setActiveSid] = useState<string | null>(null)
  const query = useLiveSessions()
  return (
    <>
      <PanelCard<LiveSessionItem[]>
        reqId="OPNL-04"
        title="Live Sessions"
        query={query}
        empty={{
          dataNoun: 'live sessions',
          when: (d) => Array.isArray(d) && d.length === 0,
        }}
      >
        {(items) => (
          <div className="cmc-live-sessions-list">
            {items.map((row) => (
              <button
                key={row.session_id}
                type="button"
                className="cmc-live-sessions-list__row"
                data-active={activeSid === row.session_id ? 'true' : 'false'}
                onClick={() => setActiveSid(row.session_id)}
              >
                <span className="cmc-live-sessions-list__sid">
                  {shortSid(row.session_id)}
                </span>
                <span className="cmc-live-sessions-list__model">
                  {row.model ?? 'unknown'}
                </span>
                <RelativeTime value={row.started_at} />
                <span className="cmc-live-sessions-list__tool">
                  {row.current_tool ?? '—'}
                </span>
                <StatePill state={rowState(row.state)} label={row.state ?? 'unknown'} />
              </button>
            ))}
          </div>
        )}
      </PanelCard>
      <Sheet
        open={Boolean(activeSid)}
        onOpenChange={(o) => {
          if (!o) setActiveSid(null)
        }}
        title="Session details"
        description="Tool timeline and follow-up message"
      >
        {activeSid ? (
          <SessionDrawerBody sid={activeSid} onClose={() => setActiveSid(null)} />
        ) : null}
      </Sheet>
    </>
  )
}
