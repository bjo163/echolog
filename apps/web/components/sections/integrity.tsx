'use client'

import { ShieldCheck, ShieldX, ScanLine } from 'lucide-react'
import { useConsole } from '../console/provider'
import { EmptyState, Metric, Notice, Panel, StatusBadge } from '../ui/primitives'
import { SectionHeader } from '../ui/layout'
import { formatAge, formatTimestamp } from '../../lib/format'

/**
 * The integrity centre.
 *
 * The instance can re-hash the stored bytes and compare them with the content
 * address. That is a real byte-level check and it is reported here as such.
 * What the instance cannot do is keep per-object verification history or
 * quarantine a mismatch, and those panels say exactly that instead of
 * showing an empty list that would read as a clean bill of health.
 */

export function IntegritySection() {
  const { fixity, runtime, isAdmin, runScan, nowMs } = useConsole()
  const capability = runtime ? runtime.features.fixity_scan : 'unavailable'
  const history = runtime ? runtime.features.fixity_history : 'unavailable'
  const quarantine = runtime ? runtime.features.verification_quarantine : 'unavailable'

  const state =
    capability === 'unavailable'
      ? 'unavailable'
      : !fixity || !fixity.lastScrubTime
        ? 'not_checked'
        : fixity.corruptionsFound > 0
          ? 'mismatch'
          : 'verified'

  const tone = state === 'verified' ? 'good' : state === 'mismatch' ? 'bad' : state === 'not_checked' ? 'warn' : 'muted'
  const label =
    state === 'verified'
      ? 'Verified'
      : state === 'mismatch'
        ? 'Content mismatch'
        : state === 'not_checked'
          ? 'Not verified'
          : 'Not supported'

  return (
    <div className='stack'>
      <SectionHeader
        eyebrow='INTEGRITY'
        title='Prove the bytes are still the bytes'
        description='A content address is a claim about bytes. Verification is the evidence that the claim still holds.'
      />

      <Panel
        eyebrow='FIXITY SCAN'
        title='Full-read verification'
        description='The scan re-reads every stored object, re-hashes it and compares the result with its content address.'
        actions={
          isAdmin ? (
            <button type='button' className='btn primary' onClick={() => void runScan()}>
              <ScanLine size={15} aria-hidden='true' /> Run a fixity scan
            </button>
          ) : (
            <StatusBadge tone='muted'>Administrator action</StatusBadge>
          )
        }
      >
        <div className='actions' style={{ marginBottom: '12px' }}>
          <StatusBadge tone={tone}>{label}</StatusBadge>
          {capability === 'experimental' ? (
            <StatusBadge tone='warn'>Experimental capability</StatusBadge>
          ) : null}
        </div>
        {state === 'unavailable' ? (
          <EmptyState
            title='No fixity verification on this instance'
            description='The instance exposes no fixity endpoint, so nothing about the stored bytes can be claimed here.'
          />
        ) : (
          <>
            <div className='metrics'>
              <Metric label='Objects re-hashed' value={fixity ? String(fixity.objectsScanned) : 'Not run yet'} icon={ShieldCheck} />
              <Metric
                label='Content mismatches'
                value={fixity ? String(fixity.corruptionsFound) : 'Not run yet'}
                icon={ShieldX}
                tone={fixity && fixity.corruptionsFound > 0 ? 'bad' : 'muted'}
              />
              <Metric label='Auto-healed' value={fixity ? String(fixity.autoHealed) : 'Not run yet'} tone='muted' />
            </div>
            <p className='fine'>
              {fixity && fixity.lastScrubTime
                ? 'Last scan ' + formatTimestamp(fixity.lastScrubTime).text + (formatAge(fixity.lastScrubTime, nowMs) ? ' (' + formatAge(fixity.lastScrubTime, nowMs) + ')' : '') + '.'
                : 'No scan has been recorded on this instance yet.'}
            </p>
          </>
        )}
      </Panel>

      <div className='columns'>
        <Panel eyebrow='HISTORY' title='Verification history'>
          {history === 'unavailable' ? (
            <EmptyState
              title='No durable verification history'
              description='Per-object scan outcomes are published to an in-process event bus and are not persisted, so there is no history to show.'
            />
          ) : (
            <p className='fine'>The instance reports a verification history.</p>
          )}
        </Panel>
        <Panel eyebrow='QUARANTINE' title='Quarantine and repair'>
          {quarantine === 'unavailable' ? (
            <EmptyState
              title='No quarantine or repair action'
              description='The instance cannot set aside a mismatching object or restore it from a mirror. A mismatch is reported, never silently repaired.'
            />
          ) : (
            <p className='fine'>The instance reports a quarantine capability.</p>
          )}
        </Panel>
      </div>

      <Notice tone='info' title='What a digest proves'>
        A matching digest proves that the stored bytes are the same bytes that were hashed. It does not prove
        authorship, truth, consent or legal admissibility, and it never will.
      </Notice>
    </div>
  )
}
