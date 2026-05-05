// SessionsTable — ACTV-06 (current).
//
// Paginated /api/sessions list with range/source/model filters in the panel
// header chrome and a client-side search filter on session_id + cwd. Cadence
// (30s) and placeholderData (snappy page transitions) live in lib/queries.ts
// useSessionsList — never inlined here.
//
// SessionListItemFull / backend SESS-01 expose `session_id` and `cwd`, so
// columns, searchKeys, and cell renders use those real field names. The
// pagination strip is keyed off `data.total` (the backend total), not the
// in-memory filtered length, because the search filter is page-local.
//
// Phase 16 Plan 03 (CMPR-03) — added a 7th 'actions' column rendering a
// per-row "Compare" button. Default behaviour navigates to
// /sessions/compare?a={r.session_id}; when the optional `onCompareClick`
// prop is provided, the button calls that handler instead (used by the
// Cmd+K picker drawer to set `b` rather than `a` when the table is mounted
// inside the compare-route picker). The button stops event propagation so
// future onRowClick wiring on DataTable doesn't double-fire.
//
// COLUMNS is now built inside the component (useMemo) so the `navigate` /
// `onCompareClick` callback is in scope. Keeping the array stable across
// renders preserves DataTable's referential-equality fast path. `onCompareClick`
// flows through the dep array — when the consumer flips the handler the
// columns rebuild once, no perf concern at the ≤50-row workload.

import { useState, useMemo, ChangeEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, DataTable, PanelCard, RelativeTime } from '../ui'
import type { DataTableColumn } from '../ui'
import { useSessionsList } from '../../lib/queries'
import type { Range, SessionListItemFull, SessionListResponse } from '../../lib/api'

const RANGE_OPTIONS: ReadonlyArray<{ value: Range; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

const PAGE_SIZE = 50

interface SessionsTableProps {
  /**
   * Optional override for the per-row Compare button click handler. When
   * provided, the button calls `onCompareClick(row.session_id)` instead of
   * navigating to `/sessions/compare?a={sid}`. Used by the Cmd+K compare
   * picker drawer to set `b` on the existing route rather than starting a
   * fresh comparison. Self-compare guard (button disabled when sid ===
   * `currentA`) is the consumer's responsibility — typically the picker
   * passes a `disabled` set or the handler is a no-op for the matching sid.
   */
  onCompareClick?: (session_id: string) => void
}

export function SessionsTable({ onCompareClick }: SessionsTableProps = {}) {
  const navigate = useNavigate()
  const [range, setRange] = useState<Range>('7d')
  const [source, setSource] = useState<string>('')
  const [model, setModel] = useState<string>('')
  const [search, setSearch] = useState<string>('')
  const [page, setPage] = useState<number>(0)

  const query = useSessionsList({
    range,
    source: source.trim() || undefined,
    model: model.trim() || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const columns: DataTableColumn<SessionListItemFull>[] = useMemo(
    () => [
      {
        id: 'session_id',
        header: 'Session',
        sortable: true,
        sort: (a, b) => a.session_id.localeCompare(b.session_id),
        cell: (r) => (
          <span className="cmc-mono" title={r.session_id}>
            {r.session_id.slice(0, 8)}
            {'…'}
          </span>
        ),
      },
      {
        id: 'cwd',
        header: 'Project',
        cell: (r) => <span className="cmc-mono">{r.cwd ?? '—'}</span>,
      },
      {
        id: 'model',
        header: 'Model',
        cell: (r) => <span>{r.model ?? '—'}</span>,
      },
      {
        id: 'started_at',
        header: 'Started',
        cell: (r) => <RelativeTime value={r.started_at} />,
      },
      {
        id: 'tokens_input',
        header: 'In',
        cell: (r) => <span className="cmc-numeric">{r.tokens_input.toLocaleString()}</span>,
      },
      {
        id: 'tokens_output',
        header: 'Out',
        cell: (r) => <span className="cmc-numeric">{r.tokens_output.toLocaleString()}</span>,
      },
      {
        id: 'actions',
        header: '',
        width: '100px',
        cell: (r) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              // stopPropagation is forward-compat: if a future refactor
              // wires onRowClick on the DataTable primitive (deferred per
              // SkillRunsTable.tsx:11-15), this prevents the row handler
              // from also firing when the user clicks Compare.
              e.stopPropagation()
              if (onCompareClick) {
                onCompareClick(r.session_id)
              } else {
                navigate({
                  to: '/sessions/compare',
                  search: { a: r.session_id },
                })
              }
            }}
            aria-label={`Compare session ${r.session_id}`}
          >
            Compare
          </Button>
        ),
      },
    ],
    [navigate, onCompareClick],
  )

  function bumpPage(delta: number) {
    setPage((p) => Math.max(0, p + delta))
  }

  function handleRangeChange(e: ChangeEvent<HTMLSelectElement>) {
    setRange(e.target.value as Range)
    setPage(0)
  }
  function handleSourceChange(e: ChangeEvent<HTMLInputElement>) {
    setSource(e.target.value)
    setPage(0)
  }
  function handleModelChange(e: ChangeEvent<HTMLInputElement>) {
    setModel(e.target.value)
    setPage(0)
  }
  function handleSearchChange(e: ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value)
  }

  const trailing = (
    <div className="cmc-sessions-table-header">
      <div className="cmc-sessions-table-header__field">
        <span className="cmc-sessions-table-header__label">Range</span>
        <select
          className="cmc-table"
          value={range}
          onChange={handleRangeChange}
          aria-label="Range filter"
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="cmc-sessions-table-header__field">
        <span className="cmc-sessions-table-header__label">Source</span>
        <input
          type="text"
          value={source}
          onChange={handleSourceChange}
          placeholder="all"
          aria-label="Source filter"
        />
      </div>
      <div className="cmc-sessions-table-header__field">
        <span className="cmc-sessions-table-header__label">Model</span>
        <input
          type="text"
          value={model}
          onChange={handleModelChange}
          placeholder="all"
          aria-label="Model filter"
        />
      </div>
      <div className="cmc-sessions-table-header__field">
        <span className="cmc-sessions-table-header__label">Search</span>
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="id or cwd"
          aria-label="Search session id or cwd"
        />
      </div>
    </div>
  )

  return (
    <PanelCard<SessionListResponse>
      reqId="ACTV-06"
      title="Sessions"
      query={query}
      trailing={trailing}
      empty={{
        dataNoun: 'session history',
        when: (d) => d.items.length === 0 && page === 0,
      }}
    >
      {(data) => {
        const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
        const isFirst = page <= 0
        const isLast = (page + 1) * PAGE_SIZE >= data.total
        return (
          <div>
            <DataTable<SessionListItemFull>
              rows={data.items}
              columns={columns}
              rowKey={(r) => r.session_id}
              search={search}
              searchKeys={['session_id', 'cwd']}
              ariaLabel="Sessions table"
            />
            <div className="cmc-sessions-table-pagination" aria-live="polite">
              <span>
                Page {page + 1} of {totalPages} ({data.total.toLocaleString()} total)
              </span>
              <div className="cmc-sessions-table-pagination__controls">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isFirst}
                  onClick={() => bumpPage(-1)}
                  aria-label="Previous page"
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isLast}
                  onClick={() => bumpPage(1)}
                  aria-label="Next page"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )
      }}
    </PanelCard>
  )
}
