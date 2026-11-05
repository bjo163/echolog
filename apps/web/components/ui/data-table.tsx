'use client'

import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react'
import type { PageState, SortState } from '../../lib/table'

/**
 * The console data table.
 *
 * The object list endpoint offers no sort, page or selection parameters, so
 * the table owns that behaviour locally and states it. Sorting is announced
 * through the header button, selection is a real checkbox rather than a row
 * click, and a narrow viewport switches to a stacked card layout instead of
 * forcing a horizontal scroll.
 */

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  /** Sort key handed back to the caller; omit to make the column unsortable. */
  sortKey?: string
  align?: 'left' | 'right'
  /** Hidden in the stacked mobile layout to keep the card readable. */
  secondary?: boolean
}

export interface DataTableProps<T> {
  caption: string
  rows: readonly T[]
  columns: readonly Column<T>[]
  rowKey: (row: T) => string
  empty: ReactNode
  sort?: SortState
  onSortChange?: (sort: SortState) => void
  selected?: readonly string[]
  onToggle?: (key: string) => void
  onOpen?: (row: T) => void
  density?: 'comfortable' | 'compact'
  page?: PageState
  /** Total rows before pagination, so the last page can be disabled. */
  totalRows?: number
  onPageChange?: (page: number) => void
  rowTone?: (row: T) => 'good' | 'warn' | 'bad' | 'muted' | undefined
}

export function DataTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  empty,
  sort,
  onSortChange,
  selected = [],
  onToggle,
  onOpen,
  density = 'comfortable',
  page,
  totalRows = 0,
  onPageChange,
  rowTone,
}: DataTableProps<T>) {
  const selectable = typeof onToggle === 'function'
  const paged = page && onPageChange ? page : null
  const pageCount = Math.max(1, Math.ceil(totalRows / Math.max(1, page ? page.pageSize : 1)))

  if (rows.length === 0) {
    return <div className='table-wrap'>{empty}</div>
  }

  return (
    <div className='table-wrap'>
      <table className={'data-table density-' + density}>
        <caption className='sr-only'>{caption}</caption>
        <thead>
          <tr>
            {selectable ? (
              <th scope='col' className='cell-select'>
                <span className='sr-only'>Select</span>
              </th>
            ) : null}
            {columns.map((column) => {
              const active = sort && column.sortKey ? sort.key === column.sortKey : false
              return (
                <th
                  key={column.key}
                  scope='col'
                  className={(column.secondary ? 'cell-secondary ' : '') + (column.align === 'right' ? 'cell-right' : '')}
                  aria-sort={active ? (sort && sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.sortKey && onSortChange ? (
                    <button
                      type='button'
                      className='column-sort'
                      onClick={() => onSortChange({ key: column.sortKey as string, direction: active && sort && sort.direction === 'asc' ? 'desc' : 'asc' })}
                    >
                      <span>{column.header}</span>
                      {active ? (
                        sort && sort.direction === 'asc' ? <ArrowUp size={13} aria-hidden='true' /> : <ArrowDown size={13} aria-hidden='true' />
                      ) : (
                        <ChevronsUpDown size={13} aria-hidden='true' className='sort-idle' />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row)
            const tone = rowTone ? rowTone(row) : undefined
            return (
              <tr key={key} className={tone ? 'row-tone-' + tone : undefined}>
                {selectable ? (
                  <td className='cell-select'>
                    <input
                      type='checkbox'
                      checked={selected.includes(key)}
                      aria-label={'Select ' + key}
                      onChange={() => onToggle && onToggle(key)}
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={(column.secondary ? 'cell-secondary ' : '') + (column.align === 'right' ? 'cell-right' : '')}
                  >
                    {column.render(row)}
                  </td>
                ))}
                {onOpen ? (
                  <td className='cell-open'>
                    <button type='button' className='text-btn' onClick={() => onOpen(row)}>
                      Open
                    </button>
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
      {paged ? (
        <TablePagination page={paged} pageCount={pageCount} onPageChange={onPageChange as (page: number) => void} />
      ) : null}
    </div>
  )
}

function TablePagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: PageState
  pageCount: number
  onPageChange: (page: number) => void
}) {
  return (
    <nav className='pagination' aria-label='Table pages'>
      <button
        type='button'
        className='btn secondary'
        disabled={page.page <= 1}
        onClick={() => onPageChange(Math.max(1, page.page - 1))}
      >
        <ChevronLeft size={14} aria-hidden='true' /> Previous
      </button>
      <span className='fine' aria-live='polite'>
        Page {String(page.page)} of {String(pageCount)}
      </span>
      <button
        type='button'
        className='btn secondary'
        disabled={page.page >= pageCount}
        onClick={() => onPageChange(Math.min(pageCount, page.page + 1))}
      >
        Next <ChevronRight size={14} aria-hidden='true' />
      </button>
    </nav>
  )
}
