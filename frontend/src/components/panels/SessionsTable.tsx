// SessionsTable — ACTV-06 (Phase 6 Plan 04 / Wave 4).
//
// Paginated /api/sessions list with range/source/model filters in the panel
// header chrome and a client-side search filter on session_id + cwd. Cadence
// (30s) and placeholderData (snappy page transitions) live in lib/queries.ts
// useSessionsList — never inlined here.
//
// Rule 1 deviation note (Plan §Task 2 Step 1): the plan text uses the field
// names `id` + `project` but SessionListItemFull / backend SESS-01 expose
// `session_id` and `cwd`. Columns + searchKeys + cell renders use the real
// field names. The pagination strip lives below the DataTable and is keyed
// off `data.total` (the backend total) — not the in-memory filtered length —
// because the search filter is page-local (RESEARCH §gotcha 9 — no `q=`
// param backend-side; client search narrows whatever the current page
// returned).

import { useState, ChangeEvent } from 'react'
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

const COLUMNS: DataTableColumn<SessionListItemFull>[] = [
  {
    id: 'session_id',
    header: 'Session',
    sortable: true,
    sort: (a, b) => a.session_id.localeCompare(b.session_id),
    cell: (r) => (
      <span className="cmc-mono" title={r.session_id}>
        {r.session_id.slice(0, 8)}
        {'\u2026'}
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
]

export function SessionsTable() {
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
              columns={COLUMNS}
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
