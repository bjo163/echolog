'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, ShieldAlert, Trash2 } from 'lucide-react'
import { useConsole } from '../console/provider'
import { DataTable, type Column } from '../ui/data-table'
import { ConfirmDialog } from '../ui/overlays'
import { EmptyState, Metric, Notice, Panel, StatusBadge } from '../ui/primitives'
import { SectionHeader } from '../ui/layout'
import { formatBytes, formatTimestamp } from '../../lib/format'
import type { S3KeyRecord } from '@echolog/contract'

/**
 * The retention screen.
 *
 * Retention and legal hold fail closed: an object under either is never
 * removed by garbage collection, and the screen names the objects that are
 * being protected and the reason they are being held.
 */

function daysUntil(timestamp: string | null, nowMs: number): number | null {
  if (!timestamp) return null
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed)) return null
  return Math.ceil((parsed - nowMs) / 86_400_000)
}

export function RetentionSection() {
  const { aliases, stats, isAdmin, collectGarbage, nowMs } = useConsole()
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)

  const retained = useMemo(() => aliases.filter((alias) => alias.retention_until), [aliases])
  const held = useMemo(() => aliases.filter((alias) => alias.legal_hold), [aliases])
  const expiringSoon = useMemo(
    () =>
      retained.filter((alias) => {
        const days = daysUntil(alias.retention_until, nowMs)
        return days !== null && days <= 30
      }),
    [retained, nowMs],
  )

  const columns: Column<S3KeyRecord>[] = [
    { key: 'key', header: 'Object key', render: (row) => <code className='object-key'>{row.key}</code> },
    {
      key: 'retention_until',
      header: 'Retain until',
      render: (row) => <span className='fine'>{formatTimestamp(row.retention_until).text}</span>,
    },
    {
      key: 'remaining',
      header: 'Remaining',
      align: 'right',
      render: (row) => {
        const days = daysUntil(row.retention_until, nowMs)
        if (days === null) return <span className='fine'>Unknown</span>
        if (days < 0) return <StatusBadge tone='warn'>Expired</StatusBadge>
        if (days <= 30) return <StatusBadge tone='warn'>{String(days)} day(s)</StatusBadge>
        return <span className='fine'>{String(days)} day(s)</span>
      },
    },
    {
      key: 'hold',
      header: 'Legal hold',
      render: (row) =>
        row.legal_hold ? <StatusBadge tone='bad'>Held</StatusBadge> : <StatusBadge tone='muted'>Not held</StatusBadge>,
    },
  ]

  return (
    <div className='stack'>
      <SectionHeader
        eyebrow='RETENTION'
        title='Keep what you promised to keep'
        description='Retention windows and legal holds keep objects out of garbage collection. Both fail closed: an object under either is never removed.'
      />

      <div className='metrics'>
        <Metric
          label='Retained objects'
          value={stats ? String(stats.active_retention_count) : 'Unavailable'}
          note='Retention window active'
          icon={CalendarClock}
        />
        <Metric
          label='Legal holds'
          value={stats ? String(stats.held_count) : 'Unavailable'}
          note='Never collected'
          icon={ShieldAlert}
          tone='warn'
        />
        <Metric
          label='Expiring within 30 days'
          value={String(expiringSoon.length)}
          note='From the visible aliases'
          tone={expiringSoon.length > 0 ? 'warn' : 'muted'}
        />
      </div>

      <Panel eyebrow='RETAINED' title='Objects with an active retention window'>
        {retained.length === 0 ? (
          <EmptyState
            title='No retained objects'
            description='No visible object carries a retention date. Objects without one remain collectable once they are not held.'
          />
        ) : (
          <DataTable
            caption='Retained objects'
            rows={retained}
            columns={columns}
            rowKey={(row) => row.digest + ':' + row.key}
            rowTone={(row) => (row.legal_hold ? 'bad' : undefined)}
            empty={<EmptyState title='Nothing retained' description='No object carries a retention window.' />}
          />
        )}
      </Panel>

      <Panel eyebrow='HELD' title='Objects under legal hold'>
        {held.length === 0 ? (
          <EmptyState title='No legal holds' description='Nothing visible to this credential is under legal hold.' />
        ) : (
          <ul className='capability-list'>
            {held.map((alias) => (
              <li key={alias.digest + alias.key}>
                <span>{alias.key}</span>
                <StatusBadge tone='bad'>Held</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        eyebrow='COLLECTION'
        title='Garbage collection'
        description='Removes objects that are neither retained nor held. Retained and held objects are reported as held, never deleted.'
        actions={
          isAdmin ? (
            <button type='button' className='btn danger' onClick={() => setConfirming(true)}>
              <Trash2 size={15} aria-hidden='true' /> Run garbage collection
            </button>
          ) : (
            <StatusBadge tone='muted'>Administrator action</StatusBadge>
          )
        }
      >
        <p className='fine'>
          {stats
            ? formatBytes(stats.eligible_gc_bytes) + ' across ' + String(stats.eligible_gc_count) + ' object(s) are currently eligible.'
            : 'Eligibility could not be read, so no size is claimed.'}
        </p>
      </Panel>

      <ConfirmDialog
        open={confirming}
        title='Run garbage collection'
        destructive
        busy={busy}
        confirmLabel='Collect eligible objects'
        confirmDisabled={confirmText !== 'COLLECT'}
        body={
          <div className='stack'>
            <p>
              Eligible objects are deleted permanently. Retained objects and objects under legal hold are reported
              as held and left untouched.
            </p>
            <Notice tone='warn' title='Deletion is permanent'>
              <ShieldAlert size={14} aria-hidden='true' /> There is no undo and no mirror copy on this instance.
            </Notice>
            <label htmlFor='confirm-gc'>Type COLLECT to confirm</label>
            <input
              id='confirm-gc'
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder='COLLECT'
              autoComplete='off'
            />
          </div>
        }
        onCancel={() => {
          setConfirming(false)
          setConfirmText('')
        }}
        onConfirm={() => {
          if (confirmText !== 'COLLECT') return
          setBusy(true)
          void collectGarbage().finally(() => {
            setBusy(false)
            setConfirming(false)
            setConfirmText('')
          })
        }}
      />
    </div>
  )
}
