'use client'

import { useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { useConsole } from '../console/provider'
import { EmptyState, Notice, Panel, StatusBadge } from '../ui/primitives'
import { SectionHeader, SearchField, Toolbar } from '../ui/layout'
import { Timeline, type TimelineEntry } from '../ui/timeline'

/**
 * The activity screen.
 *
 * The audit trail is read from the service audit endpoint and rendered as a
 * timeline. The screen states where the records come from and what their
 * limits are, because a record without its provenance is not evidence.
 */

export function ActivitySection() {
  const { audit, nowMs } = useConsole()
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('all')

  const actions = useMemo(() => {
    const unique = new Set(audit.map((record) => record.action))
    return Array.from(unique).sort()
  }, [audit])

  const entries: TimelineEntry[] = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return audit
      .filter((record) => action === 'all' || record.action === action)
      .filter(
        (record) =>
          !needle ||
          record.actor.toLowerCase().includes(needle) ||
          record.action.toLowerCase().includes(needle) ||
          record.target.toLowerCase().includes(needle),
      )
      .map((record) => ({
        id: record.id,
        timestamp: record.timestamp,
        actor: record.actor,
        action: record.action.replaceAll('_', ' '),
        target: record.target,
        outcome: record.action.includes('delete')
          ? ('bad' as const)
          : record.action.includes('hold')
            ? ('warn' as const)
            : ('muted' as const),
        detail: record.details ? <span className='fine'>{record.details}</span> : null,
      }))
  }, [audit, query, action])

  return (
    <div className='stack'>
      <SectionHeader
        eyebrow='ACTIVITY'
        title='What happened, and to which object'
        description='The service audit trail. Every record names its actor, its action and its target.'
      />

      <Toolbar>
        <SearchField
          label='Filter audit records'
          value={query}
          onChange={setQuery}
          placeholder='Filter by actor, action or target…'
        />
        <label className='sr-only' htmlFor='audit-action'>
          Filter by action
        </label>
        <select id='audit-action' value={action} onChange={(event) => setAction(event.target.value)}>
          <option value='all'>All actions</option>
          {actions.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <small className='fine'>{String(entries.length)} record(s)</small>
      </Toolbar>

      <Panel eyebrow='TRAIL' title='Audit records'>
        {audit.length === 0 ? (
          <EmptyState
            title='No audit records'
            description='The audit trail is empty for this credential. That means nothing was recorded, not that nothing can be read.'
          />
        ) : (
          <Timeline entries={entries} nowMs={nowMs} />
        )}
      </Panel>

      <Notice tone='info' title='Where these records come from'>
        <History size={14} aria-hidden='true' /> Records are read from the service audit endpoint, which keeps
        them in the ECHOLOG local database. The console shows the most recent hundred records and filters them in
        the browser, so a filter never claims to cover records it did not read.
      </Notice>

      <p className='fine'>
        <StatusBadge tone='muted'>Scope</StatusBadge> The console renders records, it never writes them.
      </p>
    </div>
  )
}
