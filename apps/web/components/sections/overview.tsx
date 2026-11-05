'use client'

import Link from 'next/link'
import {
  Archive,
  Database,
  Files,
  HardDrive,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'
import { useConsole } from '../console/provider'
import { EmptyState, Metric, Notice, Panel, StatusBadge } from '../ui/primitives'
import { SectionHeader } from '../ui/layout'
import { Timeline } from '../ui/timeline'
import { formatAge, formatBytes, formatTimestamp, maturityLabel, maturityTone } from '../../lib/format'

/**
 * The overview.
 *
 * Every number on this screen comes from an endpoint that answered. A value
 * that could not be read reads as unavailable rather than zero, and the
 * capability map is driven by the maturity the server reports.
 */

function bytes(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Unavailable' : formatBytes(value)
}

export function OverviewSection() {
  const { stats, runtime, audit, health, failure, nowMs, isAdmin } = useConsole()

  const events = audit.slice(0, 8).map((record) => ({
    id: record.id,
    timestamp: record.timestamp,
    actor: record.actor,
    action: record.action.replaceAll('_', ' '),
    target: record.target,
    outcome: record.action.includes('delete') ? ('bad' as const) : record.action.includes('hold') ? ('warn' as const) : ('muted' as const),
  }))

  const capabilities = runtime ? Object.entries(runtime.features) : []

  return (
    <div className='stack'>
      <SectionHeader
        eyebrow='PRESERVATION STATUS'
        title='Your archive, in focus.'
        description='Operational values come from the authenticated storage API. Missing capabilities are identified rather than simulated.'
      />

      {failure ? (
        <Notice tone='bad' title={failure.title}>
          {failure.message} {failure.remedy}
        </Notice>
      ) : null}

      <div className='metrics'>
        <Metric
          label='Stored objects'
          value={stats ? String(stats.objects_count) : 'Unavailable'}
          note='Authorized storage count'
          icon={Files}
          tone='good'
        />
        <Metric
          label='Committed storage'
          value={bytes(stats ? stats.committed_bytes : null)}
          note={stats ? 'Quota ' + formatBytes(stats.quota_bytes) : 'Statistics unavailable'}
          icon={Database}
        />
        <Metric
          label='Protected objects'
          value={stats ? String(stats.held_count + stats.active_retention_count) : 'Unavailable'}
          note='Legal hold plus active retention'
          icon={ShieldCheck}
          tone='warn'
        />
        <Metric
          label='S3 aliases'
          value={stats ? String(stats.s3_aliases_count) : 'Unavailable'}
          note='Aliases, not total objects'
          icon={Archive}
        />
      </div>

      <div className='columns'>
        <Panel eyebrow='INSTANCE' title='What this instance is'>
          {runtime ? (
            <dl className='detail-grid'>
              <div>
                <dt className='fine'>Identity mode</dt>
                <dd>{runtime.identity_mode.replace('_', ' ')}</dd>
              </div>
              <div>
                <dt className='fine'>Identity authority</dt>
                <dd>{runtime.identity_authority.replace('-', ' ')}</dd>
              </div>
              <div>
                <dt className='fine'>Environment</dt>
                <dd>{runtime.environment}</dd>
              </div>
              <div>
                <dt className='fine'>Version</dt>
                <dd>{runtime.version}</dd>
              </div>
              <div>
                <dt className='fine'>Storage backend</dt>
                <dd>{runtime.storage.backend}</dd>
              </div>
              <div>
                <dt className='fine'>Service health</dt>
                <dd>
                  <StatusBadge tone={health && health.ready ? 'good' : 'warn'}>
                    {health ? health.detail : 'Not reported'}
                  </StatusBadge>
                </dd>
              </div>
            </dl>
          ) : (
            <EmptyState
              title='Runtime facts unavailable'
              description='The console could not read the runtime facts endpoint, so no instance identity is claimed.'
            />
          )}
        </Panel>

        <Panel
          eyebrow='CAPABILITIES'
          title='What this instance supports'
          description='Reported by the server. Experimental capabilities are never presented as production-ready.'
        >
          {capabilities.length === 0 ? (
            <EmptyState title='Capability map unavailable' description='The server did not return a capability map.' />
          ) : (
            <ul className='capability-list'>
              {capabilities.map(([name, maturity]) => (
                <li key={name}>
                  <span>{name.replaceAll('_', ' ')}</span>
                  <StatusBadge tone={maturityTone(maturity)}>{maturityLabel(maturity)}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel eyebrow='ACTIVITY' title='Recent events' description='The most recent audit records for this credential.'>
        {events.length === 0 ? (
          <EmptyState title='No activity recorded yet' description='Once objects are deposited or lifecycle actions run, the audit trail appears here.' />
        ) : (
          <Timeline entries={events} nowMs={nowMs} />
        )}
      </Panel>

      <Panel eyebrow='NEXT' title='Preserve something'>
        <p className='fine'>
          A deposit re-hashes the bytes, stores them under their content address and returns the evidence
          receipt. The original bytes are never modified.
        </p>
        <div className='actions'>
          <Link className='btn primary' href='/deposit'>
            <UploadCloud size={15} aria-hidden='true' /> Deposit an object
          </Link>
          <Link className='btn secondary' href='/objects'>
            <Files size={15} aria-hidden='true' /> Browse stored objects
          </Link>
          {isAdmin ? (
            <Link className='btn secondary' href='/storage'>
              <HardDrive size={15} aria-hidden='true' /> Storage posture
            </Link>
          ) : null}
        </div>
        {audit[0] ? (
          <p className='fine'>Last event {formatAge(audit[0].timestamp, nowMs)} at {formatTimestamp(audit[0].timestamp).text}.</p>
        ) : null}
      </Panel>
    </div>
  )
}
