// DataTable — current. Generic sortable + paginated + optionally-
// filterable table primitive. v1 has no virtualization (sufficient for the
// ≤200-row workloads current panels expose; revisit if a panel needs >500
// rows). Sort + page state are controlled via props so the parent can persist
// them via lib/storage when desired.
//
// Filtering is opt-in: when `search` is a non-empty string AND `searchKeys`
// is provided, rows are reduced to those whose value at any of the keys
// contains the search string (case-insensitive substring).

import { ReactNode } from 'react'

export interface DataTableColumn<T> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortable?: boolean
  /** Sort comparator. If sortable=true and `sort` is omitted, falls back to
   * String comparison on the cell render output (best-effort). */
  sort?: (a: T, b: T) => number
  width?: string | number
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
                {columns.map((col) => (
                  <td key={col.id}>{col.cell(row)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
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
