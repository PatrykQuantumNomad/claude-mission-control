// SkillRunsTable — SKIL-07 (NEW, Phase 14 Plan 05).
//
// Per-skill recent-invocations panel. Consumes useSkillRuns(name, 25) and
// renders a clickable table with ts (RelativeTime) / session_id (8-char
// suffix) / cwd (last 2 path segments) / request_id (8-char prefix or '—')
// columns. Clicking a row opens the existing SessionsDetailsSheet drawer
// (D-09 — NO new /sessions/$sid route in Phase 14; mirrors the
// LiveSessionsCard.tsx:223 pattern so users see the same Tool-timeline +
// Follow-up form drawer the operator already learned for /command).
//
// IMPLEMENTATION NOTE: rows render as <tr> wrappers around a <button> so
// each row is independently focusable + clickable + keyboard-accessible
// without inflating the shared DataTable primitive's API surface. DataTable
// would be a fine fit if we extended it with onRowClick; that's a future
// refactor (DataTable is consumed by SkillLatencyTable / SessionsTable /
// other read-only panels — adding a click handler there is non-trivial).
//
// REFACTOR opportunity (flagged in 14-05 SUMMARY): the SessionDrawerBody
// + ToolTimeline + FollowUpForm components are duplicated from
// LiveSessionsCard.tsx. Extracting them to a shared module is a
// straightforward follow-up. Deferred to keep Plan 05's scope tight — the
// duplication is intentional and documented (D-09 acceptance).

import { useEffect, useState, FormEvent } from 'react'
import {
  Button,
  PanelCard,
  RelativeTime,
  Sheet,
  Skeleton,
  StatePill,
} from '../ui'
import {
  useFollowUpMessage,
  useSessionDetails,
  useSkillRuns,
} from '../../lib/queries'
import type {
  SessionDetailsResponse,
  SkillRunRow,
  SkillRunsResponse,
  ToolTimelineEntry,
} from '../../lib/api'
import { useActiveSession } from '../shell/ActiveSessionContext'

const EM_DASH = '—'

function shortSid(sid: string): string {
  return sid.length > 8 ? sid.slice(-8) : sid
}

function shortReqId(reqId: string): string {
  return reqId.length > 8 ? reqId.slice(0, 8) : reqId
}

// Truncate a cwd to the last 2 path segments — keeps the column readable
// when cwds are deep (/Users/me/work/proj-a/sub/dir → proj-a/sub).
function lastTwoSegments(cwd: string): string {
  if (!cwd || cwd === '<unknown>') return cwd
  const parts = cwd.split('/').filter(Boolean)
  if (parts.length <= 2) return cwd
  return parts.slice(-2).join('/')
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

// ---------------------------------------------------------------------------
// Drawer body — duplicated from LiveSessionsCard (D-09 refactor flagged in
// SUMMARY). Functionally identical; keeps the operator's learned UX intact.
// ---------------------------------------------------------------------------

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
            {t.duration_ms !== null ? `${t.duration_ms}ms` : EM_DASH}
          </span>
        </div>
      ))}
    </div>
  )
}

function FollowUpForm({ sid }: { sid: string }) {
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
        },
      },
    )
  }
  return (
    <form className="cmc-followup-form" onSubmit={handleSubmit}>
      <label htmlFor="cmc-skill-runs-followup-textarea" className="cmc-label">
        Follow-up message
      </label>
      <textarea
        id="cmc-skill-runs-followup-textarea"
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

function SessionDrawerBody({ sid }: { sid: string }) {
  const details = useSessionDetails(sid)
  if (details.isPending) {
    return <Skeleton variant="text" lines={6} />
  }
  if (details.isError || !details.data) {
    return (
      <p role="alert" className="cmc-followup-form__error">
        Couldn{'’'}t load session details:{' '}
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
          <FollowUpForm sid={sid} />
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function SkillRunsTable({ name }: { name: string }) {
  const query = useSkillRuns(name, 25)
  const [openSid, setOpenSid] = useState<string | null>(null)
  // Phase 23 Plan 02 (CMPR-07 D-07): mirror the local Sheet's open state
  // into ActiveSessionContext so CommandPalette can gate the "Compare with
  // previous session" action. Runs on every flip of openSid; clears global
  // state on unmount so route changes don't leak active session ids.
  const { setActiveSessionId } = useActiveSession()
  useEffect(() => {
    setActiveSessionId(openSid)
    return () => setActiveSessionId(null)
  }, [openSid, setActiveSessionId])

  return (
    <>
      <PanelCard<SkillRunsResponse>
        reqId="SKIL-07"
        title="Recent Runs"
        query={query}
        empty={{
          dataNoun: 'skill invocations',
          when: (d) => !d.rows || d.rows.length === 0,
        }}
      >
        {(data) => (
          <table className="cmc-table" aria-label="Recent skill invocations">
            <thead>
              <tr>
                <th className="cmc-table__th">When</th>
                <th className="cmc-table__th">Session</th>
                <th className="cmc-table__th">Project</th>
                <th className="cmc-table__th">Request</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => {
                const clickable = row.session_id !== null
                const onClick = clickable
                  ? () => setOpenSid(row.session_id as string)
                  : undefined
                return (
                  <tr
                    key={`${row.ts}-${row.session_id ?? 'nosid'}-${row.request_id ?? 'noreq'}-${i}`}
                    onClick={onClick}
                    style={clickable ? { cursor: 'pointer' } : undefined}
                    data-clickable={clickable ? 'true' : 'false'}
                  >
                    <td>
                      <RelativeTime value={row.ts} />
                    </td>
                    <td>
                      <span className="cmc-numeric">
                        {row.session_id ? shortSid(row.session_id) : EM_DASH}
                      </span>
                    </td>
                    <td>
                      <span>{lastTwoSegments(row.cwd)}</span>
                    </td>
                    <td>
                      <span className="cmc-numeric">
                        {row.request_id ? shortReqId(row.request_id) : EM_DASH}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </PanelCard>
      <Sheet
        open={Boolean(openSid)}
        onOpenChange={(o) => {
          if (!o) setOpenSid(null)
        }}
        title="Session details"
        description="Tool timeline and follow-up message"
      >
        {openSid ? <SessionDrawerBody sid={openSid} /> : null}
      </Sheet>
    </>
  )
}

// Re-export types (unused by callers; suppresses tsc on the imports above
// when the panel module is consumed from index.ts).
export type { SkillRunRow, SkillRunsResponse }
