'use client'

import { Database, HardDrive, Server } from 'lucide-react'
import { useConsole } from '../console/provider'
import { EmptyState, Metric, Notice, Panel, StatusBadge } from '../ui/primitives'
import { SectionHeader } from '../ui/layout'
import { formatBytes } from '../../lib/format'

/**
 * The storage screen.
 *
 * Capacity is reported from the storage statistics endpoint. Backup and
 * restore are listed with the maturity the server reports, so an instance
 * without them says so rather than offering a button that cannot work.
 */

export function StorageSection() {
  const { stats, runtime, aliases } = useConsole()
  const backup = runtime ? runtime.features.backup : 'unavailable'
  const restore = runtime ? runtime.features.restore : 'unavailable'
  const quota = runtime ? runtime.storage.quota_bytes : 0
  const used = stats ? stats.committed_bytes : 0
  const ratio = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0

  return (
    <div className='stack'>
      <SectionHeader
        eyebrow='STORAGE'
        title='Where the bytes live'
        description='Filesystem-backed content-addressed storage with a configured quota. Capacity comes from the storage statistics endpoint.'
      />

      <div className='metrics'>
        <Metric label='Committed bytes' value={stats ? formatBytes(stats.committed_bytes) : 'Unavailable'} icon={Database} />
        <Metric label='Object count' value={stats ? String(stats.objects_count) : 'Unavailable'} icon={HardDrive} />
        <Metric label='S3 aliases' value={stats ? String(stats.s3_aliases_count) : 'Unavailable'} tone='muted' />
        <Metric label='Quota' value={runtime ? formatBytes(runtime.storage.quota_bytes) : 'Unavailable'} tone='muted' />
      </div>

      <Panel eyebrow='CAPACITY' title='Quota use'>
        {stats ? (
          <>
            <div className='usage-track' role='progressbar' aria-valuenow={ratio} aria-valuemin={0} aria-valuemax={100}>
              <div className='usage-fill' style={{ width: String(ratio) + '%' }} />
            </div>
            <p className='fine'>
              {formatBytes(stats.committed_bytes)} committed of {formatBytes(stats.quota_bytes)} quota ({String(ratio)}%).
            </p>
          </>
        ) : (
          <EmptyState title='Capacity unavailable' description='The storage statistics endpoint did not answer.' />
        )}
      </Panel>

      <div className='columns'>
        <Panel eyebrow='RECOVERY' title='Backup'>
          {backup === 'unavailable' ? (
            <EmptyState
              title='No backup on this instance'
              description='ECHOLOG stores the original bytes once, on the configured storage root. There is no replica and no scheduled copy, so no backup can be claimed.'
            />
          ) : (
            <StatusBadge tone='warn'>Reported as {backup}</StatusBadge>
          )}
        </Panel>
        <Panel eyebrow='RECOVERY' title='Restore'>
          {restore === 'unavailable' ? (
            <EmptyState
              title='No restore path'
              description='Without a backup there is nothing to restore from. A restore is therefore not offered, rather than offered and failing.'
            />
          ) : (
            <StatusBadge tone='warn'>Reported as {restore}</StatusBadge>
          )}
        </Panel>
      </div>

      <Panel eyebrow='ALIASES' title='Alias inventory'>
        {aliases.length === 0 ? (
          <EmptyState title='No aliases' description='No S3 alias has been created on this instance.' />
        ) : (
          <p className='fine'>
            {String(aliases.length)} alias(es) are visible to this credential. An alias is a name for an object; it
            is not a second copy of the bytes.
          </p>
        )}
      </Panel>

      <Notice tone='info' title='Storage boundary'>
        <Server size={14} aria-hidden='true' /> ECHOLOG is a bounded storage service. It preserves original
        bytes and storage-level metadata; it does not decide what those bytes mean.
      </Notice>
    </div>
  )
}
