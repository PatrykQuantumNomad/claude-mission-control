// DataTable — current. Generic sortable + paginated + optionally-
// filterable table primitive. v1 has no virtualization (sufficient for the
// ≤200-row workloads current panels expose; revisit if a panel needs >500
// rows). Sort + page state are controlled via props so the parent can persist
// them via lib/storage when desired.
//
// Filtering is opt-in: when `search` is a non-empty string AND `searchKeys`
// is provided, rows are reduced to those whose value at any of the keys
// contains the search string (case-insensitive substring).
//
// Phase 24 Plan 03 (CONT-03): cells whose `cell()` render returns a primitive
// string are auto-wrapped in <TruncatedCell>. Render-fn columns returning JSX
// (Badges, Links, custom layouts) retain full control over their cell output —
// TruncatedCell is applied automatically only to columns rendering raw string
// values. Per-column opt-out via `wrap: true`; per-column copy affordance via
// `copyable: true`.

import { ReactNode } from 'react'
import { TruncatedCell } from './TruncatedCell'

export interface DataTableColumn<T> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortable?: boolean
  /** Sort comparator. If sortable=true and `sort` is omitted, falls back to
   * String comparison on the cell render output (best-effort). */
  sort?: (a: T, b: T) => number
  width?: string | number
  /**
   * Phase 24 Plan 03 (CONT-03). When true, cell content wraps to multiple
   * lines instead of truncating. Default: false (truncate via TruncatedCell).
   * Use for notes/description columns where multi-line rendering is desired.
   */
  wrap?: boolean
  /**
   * Phase 24 Plan 03 (CONT-03). When true, render the copy-icon affordance
   * via TruncatedCell. Use for known-long fields (session-id, cwd, skill-name).
   * Only applies to string-valued cells; render-fn columns are unaffected.
   */
  copyable?: boolean
}

/**
 * Heuristic: cells that render as a primitive string (or number coerced to
 * string) are eligible for TruncatedCell auto-wrapping. JSX nodes (objects),
 * booleans, null, undefined fall through to the legacy raw-render path.
 */
function isPlainTextCell(value: ReactNode): value is string | number {
  return typeof value === 'string' || typeof value === 'number'
}

export interface DataTableSort {
  col: string
  dir: 'asc' | 'desc'
}

interface DataTableProps<T> {
  rows: T[]
  columns: DataTableColumn<T>[]
  rowKey: (row: T) => string
  sort?: DataTableSort
  onSortChange?: (next: DataTableSort) => void
  page?: number
  pageSize?: number
  onPageChange?: (next: number) => void
  search?: string
  searchKeys?: (keyof T)[]
  ariaLabel?: string
  emptyMessage?: ReactNode
}

function applySearch<T>(rows: T[], search: string | undefined, keys: (keyof T)[] | undefined): T[] {
  if (!search || !keys || keys.length === 0) return rows
  const needle = search.toLowerCase()
  return rows.filter((r) =>
    keys.some((k) => String(r[k] ?? '').toLowerCase().includes(needle)),
  )
}

function applySort<T>(rows: T[], sort: DataTableSort | undefined, columns: DataTableColumn<T>[]): T[] {
  if (!sort) return rows
  const col = columns.find((c) => c.id === sort.col)
  if (!col?.sortable) return rows
  const cmp = col.sort
  if (!cmp) return rows
  const sorted = [...rows].sort(cmp)
  return sort.dir === 'desc' ? sorted.reverse() : sorted
}

function applyPage<T>(rows: T[], page: number | undefined, pageSize: number | undefined): T[] {
  if (typeof page !== 'number' || typeof pageSize !== 'number') return rows
  const start = page * pageSize
  return rows.slice(start, start + pageSize)
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  sort,
  onSortChange,
  page,
  pageSize,
  onPageChange,
  search,
  searchKeys,
  ariaLabel,
  emptyMessage,
}: DataTableProps<T>) {
  const filtered = applySearch(rows, search, searchKeys)
  const sorted = applySort(filtered, sort, columns)
  const paginated = applyPage(sorted, page, pageSize)
  const totalRows = filtered.length
  const totalPages =
    typeof pageSize === 'number' && pageSize > 0 ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1
  const currentPage = typeof page === 'number' ? page : 0

  const handleHeaderClick = (col: DataTableColumn<T>) => {
    if (!col.sortable || !onSortChange) return
    if (sort?.col === col.id) {
      onSortChange({ col: col.id, dir: sort.dir === 'asc' ? 'desc' : 'asc' })
    } else {
      onSortChange({ col: col.id, dir: 'asc' })
    }
  }

  return (
    <div>
      <div className="cmc-table-wrap">
      <table className="cmc-table" aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((col) => {
              const isSorted = sort?.col === col.id
              const arrow = isSorted ? (sort?.dir === 'asc' ? '\u25b2' : '\u25bc') : null
              return (
                <th
                  key={col.id}
                  className="cmc-table__th"
                  data-sortable={col.sortable ? '' : undefined}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleHeaderClick(col) : undefined}
                  aria-sort={
                    isSorted ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  {col.header}
                  {arrow ? <span className="cmc-table__th-arrow">{arrow}</span> : null}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {paginated.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--cmc-text-dim)' }}>
                {emptyMessage ?? 'No rows.'}
              </td>
            </tr>
          ) : (
            paginated.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => {
                  const rendered = col.cell(row)
                  // wrap=true opts out of truncation; render exactly as before.
                  // Otherwise, plain-text cells get TruncatedCell wrapping
                  // (CONT-03). JSX cells pass through untouched.
                  if (col.wrap === true || !isPlainTextCell(rendered)) {
                    return <td key={col.id}>{rendered}</td>
                  }
                  return (
                    <td key={col.id}>
                      <TruncatedCell value={String(rendered)} copyable={col.copyable} />
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
      {typeof pageSize === 'number' && totalRows > pageSize ? (
        <div className="cmc-table__pagination">
          <span>
            Page {currentPage + 1} of {totalPages} ({totalRows} rows)
          </span>
          <div className="cmc-table__pagination-controls">
            <button
              type="button"
              className="cmc-btn cmc-btn--ghost cmc-btn--sm"
              disabled={currentPage <= 0}
              onClick={() => onPageChange?.(Math.max(0, currentPage - 1))}
              aria-label="Previous page"
            >
              {'\u2190'}
            </button>
            <button
              type="button"
              className="cmc-btn cmc-btn--ghost cmc-btn--sm"
              disabled={currentPage >= totalPages - 1}
              onClick={() => onPageChange?.(Math.min(totalPages - 1, currentPage + 1))}
              aria-label="Next page"
            >
              {'\u2192'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
