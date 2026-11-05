'use client'

import { Package } from 'lucide-react'
import { useConsole } from '../console/provider'
import { EmptyState, Notice, Panel, StatusBadge } from '../ui/primitives'
import { SectionHeader } from '../ui/layout'

/**
 * The preservation packages screen.
 *
 * A package would bundle an object with its metadata and its lifecycle
 * context into one portable unit. The instance does not implement that, so
 * the screen describes the intent and states plainly that the capability is
 * absent rather than drawing a package builder that could not work.
 */

export function PackagesSection() {
  const { runtime } = useConsole()
  const maturity = runtime ? runtime.features.preservation_packages : 'unavailable'

  return (
    <div className='stack'>
      <SectionHeader
        eyebrow='PACKAGES'
        title='Portable preservation units'
        description='A package would carry an object together with its metadata and lifecycle context as one unit.'
      />

      <Panel eyebrow='STATUS' title='Availability'>
        <div className='actions'>
          <StatusBadge tone={maturity === 'available' ? 'good' : maturity === 'experimental' ? 'warn' : 'muted'}>
            {maturity === 'available' ? 'Available' : maturity === 'experimental' ? 'Experimental' : 'Not supported'}
          </StatusBadge>
        </div>
        {maturity === 'unavailable' ? (
          <EmptyState
            title='Packages are not implemented'
            description='The instance exposes no package endpoint, so there is nothing to build, list or export. The screen is a statement of intent, not a disabled feature.'
          />
        ) : (
          <p className='fine'>The instance reports a package capability.</p>
        )}
      </Panel>

      <Panel eyebrow='INTENT' title='What a package would contain'>
        <ul className='capability-list'>
          <li>
            <span>The original object bytes, unmodified</span>
          </li>
          <li>
            <span>The content identity the bytes hash to</span>
          </li>
          <li>
            <span>The storage-level metadata: filename, uploader, creation time</span>
          </li>
          <li>
            <span>The lifecycle state: retention window and legal hold</span>
          </li>
        </ul>
      </Panel>

      <Notice tone='info' title='Boundary'>
        <Package size={14} aria-hidden='true' /> A package is a transport format for storage-level facts. It
        would not carry witness meaning, rights, consent or editorial status, because ECHOLOG does not own those.
      </Notice>
    </div>
  )
}
