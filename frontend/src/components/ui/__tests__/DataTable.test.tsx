import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, userEvent } from '../../../test/utils'
import { DataTable, DataTableSort } from '../DataTable'

interface Row {
  id: string
  name: string
  count: number
}

const rows: Row[] = [
  { id: '1', name: 'alpha', count: 5 },
  { id: '2', name: 'bravo', count: 12 },
  { id: '3', name: 'charlie', count: 1 },
  { id: '4', name: 'delta', count: 7 },
]

const columns = [
  {
    id: 'name',
    header: 'Name',
    cell: (r: Row) => r.name,
    sortable: true,
    sort: (a: Row, b: Row) => a.name.localeCompare(b.name),
  },
  {
    id: 'count',
    header: 'Count',
    cell: (r: Row) => r.count,
    sortable: true,
    sort: (a: Row, b: Row) => a.count - b.count,
  },
]

describe('DataTable', () => {
  it('renders rows with the supplied cell render output', () => {
    render(<DataTable<Row> rows={rows} columns={columns} rowKey={(r) => r.id} />)
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('bravo')).toBeInTheDocument()
    expect(screen.getByText('charlie')).toBeInTheDocument()
    expect(screen.getByText('delta')).toBeInTheDocument()
  })

  it('flips sort dir when an already-sorted header is clicked', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()
    const { rerender } = render(
      <DataTable<Row>
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        sort={{ col: 'name', dir: 'asc' }}
        onSortChange={onSortChange}
      />,
    )
    // Click the already-asc-sorted "Name" header — should flip to desc.
    const headers = screen.getAllByRole('columnheader')
    await user.click(headers[0])
    expect(onSortChange).toHaveBeenCalledWith({ col: 'name', dir: 'desc' })
    // And after flipping, click the count header — should request asc.
    rerender(
      <DataTable<Row>
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        sort={{ col: 'name', dir: 'desc' }}
        onSortChange={onSortChange}
      />,
    )
    await user.click(screen.getAllByRole('columnheader')[1])
    expect(onSortChange).toHaveBeenLastCalledWith({ col: 'count', dir: 'asc' })
  })

  it('paginates and updates page on next/prev click', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [page, setPage] = useState(0)
      const [sort, setSort] = useState<DataTableSort | undefined>(undefined)
      return (
        <DataTable<Row>
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          pageSize={2}
          page={page}
          onPageChange={setPage}
          sort={sort}
          onSortChange={setSort}
        />
      )
    }
    render(<Harness />)
    // Page 0: alpha + bravo visible
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('bravo')).toBeInTheDocument()
    expect(screen.queryByText('charlie')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.queryByText('alpha')).toBeNull()
    expect(screen.getByText('charlie')).toBeInTheDocument()
    expect(screen.getByText('delta')).toBeInTheDocument()
  })

  it('filters rows by searchKeys when search is provided', () => {
    render(
      <DataTable<Row>
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        search="ALPHA"
        searchKeys={['name']}
      />,
    )
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.queryByText('bravo')).toBeNull()
    expect(screen.queryByText('delta')).toBeNull()
  })
})
