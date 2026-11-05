'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Trash2 } from 'lucide-react'
import { readSidecar, requestGrant, type Principal } from '@echolog/shared'
import type { ObjectSidecar } from '@echolog/contract'
import { useConsole } from '../console/provider'
import { EmptyState, Notice, Panel, StatusBadge } from '../ui/primitives'
import { SectionHeader } from '../ui/layout'
import { DigestField } from '../ui/identifiers'
import { JsonViewer } from '../ui/json-viewer'
import { ConfirmDialog } from '../ui/overlays'
import { PrivacyIndicator, PrivacyNotice, VerificationPanel } from '../ui/verification'
import { formatBytes, formatTimestamp } from '../../lib/format'

/**
 * The object detail screen.
 *
 * The metadata comes from the object metadata endpoint. The privacy state is
 * reported by whether the endpoint answered at all, because a private-witness
 * object is indistinguishable from a missing one for a credential without the
 * witness. That is the intended behaviour and the screen says so.
 */

export function ObjectDetailSection({ digest }: { digest: string }) {
  const router = useRouter()
  const { runtime, isAdmin, nowMs, removeObject } = useConsole()
  const [sidecar, setSidecar] = useState<ObjectSidecar | null>(null)
  const [missing, setMissing] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [grant, setGrant] = useState<{ url: string; expires_at: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setFailure(null)
    try {
      const record = await readSidecar(digest)
      setSidecar(record)
      setMissing(false)
    } catch (error) {
      setSidecar(null)
      setMissing(true)
      setFailure(error instanceof Error ? error.message : 'The object could not be read.')
    }
  }, [digest])

  useEffect(() => {
    void load()
  }, [load])

  const request = async () => {
    try {
      const granted = await requestGrant(digest)
      setGrant(granted)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'A download grant could not be issued.')
    }
  }

  if (missing) {
    return (
      <div className='stack'>
        <SectionHeader eyebrow='OBJECT' title='This object is not available' description='The API did not return metadata for this content identity.' />
        <Panel>
          <EmptyState
            title='Not found, or not visible to this credential'
            description='A private-witness object answers with the same not-found response as an object that never existed, so the console cannot tell the two apart and does not guess.'
            action={
              <button type='button' className='btn secondary' onClick={() => router.push('/objects')}>
                Back to stored objects
              </button>
            }
          />
          <PrivacyNotice />
        </Panel>
      </div>
    )
  }

  if (!sidecar) {
    return (
      <div className='stack'>
        <SectionHeader eyebrow='OBJECT' title='Reading the object metadata…' description='One metadata endpoint, one answer.' />
        {failure ? (
          <Notice tone='bad' title='The request failed'>
            {failure}
          </Notice>
        ) : null}
      </div>
    )
  }

  const verificationState = runtime && runtime.features.fixity_history !== 'unavailable' ? 'not_checked' : 'unavailable'

  return (
    <div className='stack'>
      <SectionHeader
        eyebrow='OBJECT'
        title={sidecar.filename}
        description='Storage-level metadata for one preserved object.'
        actions={
          <div className='actions'>
            <button type='button' className='btn secondary' onClick={() => void request()}>
              <Download size={15} aria-hidden='true' /> Request a download grant
            </button>
            {isAdmin ? (
              <button type='button' className='btn danger' onClick={() => setConfirming(true)}>
                <Trash2 size={15} aria-hidden='true' /> Delete
              </button>
            ) : null}
          </div>
        }
      />

      {failure ? (
        <Notice tone='bad' title='The request failed'>
          {failure}
        </Notice>
      ) : null}

      {grant ? (
        <Notice tone='warn' title='Short-lived download grant'>
          <div className='stack'>
            <span>
              This grant is a temporary capability, not a durable reference. It expires at{' '}
              {formatTimestamp(grant.expires_at).text}.
            </span>
            <code className='digest'>{grant.url}</code>
          </div>
        </Notice>
      ) : null}

      <div className='columns'>
        <Panel eyebrow='IDENTITY' title='Content identity'>
          <div className='stack'>
            <DigestField digest={sidecar.digest} />
            <PrivacyIndicator privateWitness={false} visible />
            <dl className='detail-grid'>
              <div>
                <dt className='fine'>Filename</dt>
                <dd>{sidecar.filename}</dd>
              </div>
              <div>
                <dt className='fine'>Uploader</dt>
                <dd>{sidecar.uploader}</dd>
              </div>
              <div>
                <dt className='fine'>Created</dt>
                <dd>{formatTimestamp(sidecar.created_at).text}</dd>
              </div>
              <div>
                <dt className='fine'>Scan state</dt>
                <dd>
                  <StatusBadge tone='muted'>{sidecar.scan}</StatusBadge>
                </dd>
              </div>
              <div>
                <dt className='fine'>Retention until</dt>
                <dd>{sidecar.retention_until ? formatTimestamp(sidecar.retention_until).text : 'Not retained'}</dd>
              </div>
              <div>
                <dt className='fine'>Legal hold</dt>
                <dd>
                  {sidecar.legal_hold ? <StatusBadge tone='bad'>Held</StatusBadge> : <StatusBadge tone='muted'>Not held</StatusBadge>}
                </dd>
              </div>
            </dl>
            {sidecar.tags.length > 0 ? (
              <p className='fine'>Tags: {sidecar.tags.join(', ')}</p>
            ) : null}
          </div>
        </Panel>

        <Panel eyebrow='INTEGRITY' title='Verification'>
          <VerificationPanel
            nowMs={nowMs}
            facts={{
              state: verificationState,
              expectedDigest: sidecar.digest,
              observedDigest: null,
              checkedAt: null,
              source: 'no per-object verification record on this instance',
            }}
          />
        </Panel>
      </div>

      <Panel eyebrow='RAW' title='Stored metadata'>
        <JsonViewer value={sidecar} label='Object metadata' />
      </Panel>

      <ConfirmDialog
        open={confirming}
        title='Delete this object'
        destructive
        confirmLabel='Delete permanently'
        body={
          <p>
            Deleting removes the stored bytes for <b>{sidecar.filename}</b>. There is no mirror copy on this
            instance, so the bytes are gone once the request succeeds.
          </p>
        }
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setBusy(true)
          void removeObject(sidecar.digest).finally(() => {
            setBusy(false)
            setConfirming(false)
            router.push('/objects')
          })
        }}
      />
    </div>
  )
}
