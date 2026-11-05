'use client'

import type { ReactNode } from 'react'
import { formatAge, formatTimestamp } from '../../lib/format'

/**
 * An event timeline.
 *
 * Each entry shows the absolute time with its timezone, the relative age, the
 * actor, the action and the outcome, because a record without all five cannot
 * be read as evidence later.
 */

export interface TimelineEntry {
  id: string
  timestamp: string | null
  actor: string
  action: string
  target?: string
  outcome: 'good' | 'warn' | 'bad' | 'muted'
  detail?: ReactNode
}

export function Timeline({ entries, nowMs }: { entries: readonly TimelineEntry[]; nowMs: number }) {
  if (entries.length === 0) {
    return <p className='fine'>No events have been recorded for this credential.</p>
  }
  return (
    <ol className='timeline'>
      {entries.map((entry) => {
        const absolute = formatTimestamp(entry.timestamp)
        const age = formatAge(entry.timestamp, nowMs)
        return (
          <li key={entry.id} className='timeline-item'>
            <span className={'timeline-dot tone-' + entry.outcome} aria-hidden='true' />
            <div className='timeline-body'>
              <div className='timeline-head'>
                <b>{entry.action}</b>
                <span className='fine'>
                  {absolute.text}
                  {age ? ' · ' + age : ''}
                </span>
              </div>
              <p className='fine'>
                {entry.actor}
                {entry.target ? ' · ' + entry.target : ''}
              </p>
              {entry.detail ? <div className='timeline-detail'>{entry.detail}</div> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
