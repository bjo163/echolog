'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Rows3, Rows4, Trash2, UploadCloud } from 'lucide-react'
import { useConsole } from '../console/provider'
import { DataTable, type Column } from '../ui/data-table'
import { ConfirmDialog, DetailDrawer } from '../ui/overlays'
import { DigestField, ObjectKeyField } from '../ui/identifiers'
import { EmptyState, Notice, Panel, StatusBadge } from '../ui/primitives'
import { SearchField, SectionHeader, Toolbar } from '../ui/layout'
import { filterRows, nextSort, paginate, sortRows, type PageState, type SortState } from '../../lib/table'
import { formatBytes, formatTimestamp } from '../../lib/format'
import type { S3KeyRecord } from '@echolog/contract'

/**
 * The object browser.
 *
 * The API exposes the stored objects through the S3 alias list, so an object
 * without an alias is not visible here and the screen says so. Sorting,
 * paging and selection are local, because the endpoint has no parameters for
 * them, and the screen says that too.
 */

export function ObjectsSection() {
  const router = useRouter()
  const { aliases, removeObject, isAdmin, stats } = useConsole()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>({ key: 'last_modified', direction: 'desc' })
  const [page, setPage] = useState<PageState>({ page: 1, pageSize: 25 })
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable')
  const [selected, setSelected] = useState<string[]>([])
  const [inspect, setInspect] = useState<S3KeyRecord | null>(null)
  const [pendingDelete, setPendingDelete] = useState<S3KeyRecord | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(
    () => filterRows(aliases, query, ['key', 'object_key', 'digest', 'content_type']),
    [aliases, query],
  )
  const sorted = useMemo(
    () => sortRows(filtered, sort, (row, key) => (row as unknown as Record<string, unknown>)[key]),
    [filtered, sort],
  )
  const paged = useMemo(() => paginate(sorted, page), [sorted, page])

  const columns: Column<S3KeyRecord>[] = [
    {
      key: 'key',
      header: 'Object key',
      sortKey: 'key',
      render: (row) => <ObjectKeyField objectKey={row.key} />,
    },
    {
      key: 'digest',
      header: 'Content identity',
      sortKey: 'digest',
      secondary: true,
      render: (row) => <DigestField digest={row.digest} />,
    },
    {
      key: 'size',
      header: 'Size',
      sortKey: 'size',
      align: 'right',
      render: (row) => <span className='usage-number'>{formatBytes(row.size)}</span>,
    },
    {
      key: 'content_type',
      header: 'Type',
      sortKey: 'content_type',
      secondary: true,
      render: (row) => <span className='fine'>{row.content_type}</span>,
    },
    {
      key: 'last_modified',
      header: 'Last modified',
      sortKey: 'last_modified',
      render: (row) => <span className='fine'>{formatTimestamp(row.last_modified).text}</span>,
    },
    {
      key: 'lifecycle',
      header: 'Lifecycle',
      secondary: true,
      render: (row) =>
        row.legal_hold ? (
          <StatusBadge tone='warn'>Legal hold</StatusBadge>
        ) : row.retention_until ? (
          <StatusBadge tone='info'>Retained</StatusBadge>
        ) : (
          <StatusBadge tone='muted'>Unrestricted</StatusBadge>
        ),
    },
  ]

  const aliasCount = stats ? stats.s3_aliases_count : null

  return (
    <div className='stack'>
      <SectionHeader
        eyebrow='OBJECT MEMORY'
        title='Stored objects'
        description='Every object this credential can reach, listed through its S3 alias. Sorting, paging and selection run in the browser because the endpoint offers no such parameters.'
      />

      {aliases.length === 0 ? (
        <Panel>
          <EmptyState
            title='No objects stored yet'
            description='Nothing has been deposited under this credential. The archive is empty, not unreadable.'
            action={
              <button type='button' className='btn primary' onClick={() => router.push('/deposit')}>
                <UploadCloud size={15} aria-hidden='true' /> Deposit the first object
              </button>
            }
          />
        </Panel>
      ) : (
        <>
          <Toolbar>
            <SearchField
              label='Filter stored objects'
              value={query}
              onChange={(value) => {
                setQuery(value)
                setPage({ ...page, page: 1 })
              }}
              placeholder='Filter by key, digest or type…'
            />
            <div className='actions'>
              <button
                type='button'
                className='icon-btn'
                aria-label={density === 'comfortable' ? 'Switch to the compact table' : 'Switch to the comfortable table'}
                title={density === 'comfortable' ? 'Compact rows' : 'Comfortable rows'}
                aria-pressed={density === 'compact'}
                onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
              >
                {density === 'comfortable' ? <Rows4 size={15} aria-hidden='true' /> : <Rows3 size={15} aria-hidden='true' />}
              </button>
              <button type='button' className='btn primary' onClick={() => router.push('/deposit')}>
                <UploadCloud size={15} aria-hidden='true' /> Deposit object
              </button>
            </div>
            <small className='fine'>
              {String(paged.rows.length)} shown of {String(sorted.length)} matching
              {aliasCount !== null ? ' · ' + String(aliasCount) + ' alias(es) on this instance' : ''}
            </small>
          </Toolbar>

          {selected.length > 0 ? (
            <Notice tone='info' title='Selection'>
              {String(selected.length)} object(s) selected. Bulk deletion is deliberately not offered: object memory
              is immutable and deletion must be confirmed one record at a time.
            </Notice>
          ) : null}

          <Panel className='table-panel'>
            <DataTable
              caption='Stored objects'
              rows={paged.rows}
              columns={columns}
              rowKey={(row) => row.digest + ':' + row.key}
              density={density}
              sort={sort}
              onSortChange={(next) => {
                setSort(next)
                setPage({ ...page, page: 1 })
              }}
              selected={selected}
              onToggle={(key) =>
                setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
              }
              onOpen={(row) => setInspect(row)}
              page={page}
              totalRows={sorted.length}
              onPageChange={(next) => setPage({ ...page, page: next })}
              rowTone={(row) => (row.legal_hold ? 'warn' : undefined)}
              empty={
                <EmptyState
                  title='Nothing matches that filter'
                  description='Clear the filter to see every stored object again.'
                  action={
                    <button type='button' className='btn secondary' onClick={() => setQuery('')}>
                      Clear the filter
                    </button>
                  }
                />
              }
            />
          </Panel>
        </>
      )}

      <DetailDrawer
        open={inspect !== null}
        title={inspect ? inspect.key : ''}
        subtitle={inspect ? 'S3 alias record' : undefined}
        onClose={() => setInspect(null)}
        footer={
          inspect ? (
            <div className='actions'>
              <button
                type='button'
                className='btn secondary'
                onClick={() => router.push('/objects/' + encodeURIComponent(inspect.digest))}
              >
                Open object detail
              </button>
              {isAdmin ? (
                <button type='button' className='btn danger' onClick={() => setPendingDelete(inspect)}>
                  <Trash2 size={14} aria-hidden='true' /> Delete
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {inspect ? (
          <dl className='detail-grid'>
            <div>
              <dt className='fine'>Object key</dt>
              <dd>
                <ObjectKeyField objectKey={inspect.key} />
              </dd>
            </div>
            <div>
              <dt className='fine'>Content identity</dt>
              <dd>
                <DigestField digest={inspect.digest} />
              </dd>
            </div>
            <div>
              <dt className='fine'>Size</dt>
              <dd>{formatBytes(inspect.size)}</dd>
            </div>
            <div>
              <dt className='fine'>Content type</dt>
              <dd>{inspect.content_type}</dd>
            </div>
            <div>
              <dt className='fine'>Last modified</dt>
              <dd>{formatTimestamp(inspect.last_modified).text}</dd>
            </div>
            <div>
              <dt className='fine'>Retention until</dt>
              <dd>{inspect.retention_until ? formatTimestamp(inspect.retention_until).text : 'Not retained'}</dd>
            </div>
          </dl>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={pendingDelete !== null}
        title='Delete this object'
        destructive
        busy={busy}
        confirmLabel='Delete permanently'
        confirmDisabled={!pendingDelete || confirmText !== pendingDelete.key}
        body={
          <div className='stack'>
            <p>
              Deleting removes the stored bytes for <b>{pendingDelete ? pendingDelete.key : ''}</b>. The content
              address is derived from those bytes, so the same bytes uploaded later would produce the same
              identity again.
            </p>
            <Notice tone='warn' title='This cannot be undone'>
              <AlertTriangle size={14} aria-hidden='true' /> Type the object key to confirm.
            </Notice>
            <label htmlFor='confirm-object-key'>Object key</label>
            <input
              id='confirm-object-key'
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={pendingDelete ? pendingDelete.key : ''}
            />
          </div>
        }
        onCancel={() => {
          setPendingDelete(null)
          setConfirmText('')
        }}
        onConfirm={() => {
          if (!pendingDelete || confirmText !== pendingDelete.key) return
          setBusy(true)
          void removeObject(pendingDelete.digest).finally(() => {
            setBusy(false)
            setPendingDelete(null)
            setConfirmText('')
          })
        }}
      />
    </div>
  )
}
