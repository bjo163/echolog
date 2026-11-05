'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, ShieldAlert, X } from 'lucide-react'
import { uploadObjectWithProgress } from '@echolog/shared'
import { useConsole } from '../console/provider'
import { EmptyState, Notice, Panel, StatusBadge } from '../ui/primitives'
import { SectionHeader } from '../ui/layout'
import { JsonViewer } from '../ui/json-viewer'
import { DigestField } from '../ui/identifiers'
import { validateUpload, type UploadIssue } from '../../lib/upload-validate'
import { formatBytes } from '../../lib/format'

/**
 * The deposit screen.
 *
 * The file is validated against the limits this instance reports before a
 * single byte is sent, the transfer reports real progress, and the receipt
 * shows the content identity the server computed. The bytes are never
 * modified on the way in.
 */

export function DepositSection() {
  const router = useRouter()
  const { runtime, stats, setNotice, isAdmin } = useConsole()
  const [file, setFile] = useState<File | null>(null)
  const [retentionUntil, setRetentionUntil] = useState('')
  const [legalHold, setLegalHold] = useState(false)
  const [issues, setIssues] = useState<UploadIssue[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const limits = {
    maxUploadBytes: runtime ? runtime.storage.max_upload_bytes : 0,
    allowedMimeTypes: runtime ? runtime.storage.allowed_mime_types : [],
    storageQuotaBytes: runtime ? runtime.storage.quota_bytes : 0,
    usedBytes: stats ? stats.committed_bytes : null,
  }

  const pick = (next: File | null) => {
    setFile(next)
    setReceipt(null)
    setFailure(null)
    if (!next) {
      setIssues([])
      return
    }
    const validation = validateUpload(
      {
        filename: next.name,
        contentType: next.type,
        size: next.size,
        retentionUntil: retentionUntil ? new Date(retentionUntil).toISOString() : null,
        legalHold,
      },
      limits,
    )
    setIssues(validation.issues)
  }

  const upload = async () => {
    if (!file) return
    const validation = validateUpload(
      {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        retentionUntil: retentionUntil ? new Date(retentionUntil).toISOString() : null,
        legalHold,
      },
      limits,
    )
    setIssues(validation.issues)
    if (!validation.canUpload) return

    setBusy(true)
    setFailure(null)
    setProgress(0)
    const controller = new AbortController()
    abort.current = controller
    try {
      const bytes = await file.arrayBuffer()
      const sidecar = await uploadObjectWithProgress(
        {
          bytes,
          contentType: file.type || 'application/octet-stream',
          filename: file.name,
          retentionUntil: retentionUntil ? new Date(retentionUntil).toISOString() : null,
          legalHold,
        },
        (event) => setProgress(event.percent),
        { signal: controller.signal },
      )
      setReceipt(sidecar as unknown as Record<string, unknown>)
      setProgress(null)
      setNotice({ tone: 'good', text: 'The object was preserved and its content identity was recorded.' })
    } catch (error) {
      setProgress(null)
      setFailure(error instanceof Error ? error.message : 'The upload failed.')
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  const blocking = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')

  return (
    <div className='stack'>
      <SectionHeader
        eyebrow='PRESERVE'
        title='Deposit an original object'
        description='The bytes are hashed, stored under their content address and recorded. The original is preserved byte for byte.'
      />

      <Panel eyebrow='SOURCE' title='Choose the original'>
        <div className='stack'>
          <label htmlFor='deposit-file'>Original file</label>
          <input
            id='deposit-file'
            type='file'
            onChange={(event) => pick(event.target.files ? event.target.files[0] ?? null : null)}
          />
          {file ? (
            <p className='fine'>
              {file.name} · {formatBytes(file.size)} · {file.type || 'application/octet-stream'}
            </p>
          ) : (
            <EmptyState
              title='No file chosen'
              description='Pick the original file to preserve. Nothing is uploaded until you confirm.'
            />
          )}
        </div>
      </Panel>

      <Panel eyebrow='LIFECYCLE' title='Retention and hold'>
        <div className='stack'>
          <label htmlFor='deposit-retention'>Retain until</label>
          <input
            id='deposit-retention'
            type='date'
            value={retentionUntil}
            onChange={(event) => {
              setRetentionUntil(event.target.value)
              if (file) pick(file)
            }}
          />
          <p className='fine'>A retention date keeps the object out of garbage collection until that date passes.</p>
          <label className='checkbox-row' htmlFor='deposit-hold'>
            <input
              id='deposit-hold'
              type='checkbox'
              checked={legalHold}
              onChange={(event) => {
                setLegalHold(event.target.checked)
                if (file) pick(file)
              }}
            />
            <span>Apply a legal hold</span>
          </label>
          {!isAdmin ? (
            <p className='fine'>
              <ShieldAlert size={14} aria-hidden='true' /> A legal hold requires an administrator or a service
              credential.
            </p>
          ) : null}
        </div>
      </Panel>

      {issues.length > 0 ? (
        <Panel eyebrow='VALIDATION' title='Before sending'>
          <ul className='issue-list'>
            {blocking.map((issue) => (
              <li key={issue.field + issue.message} className='issue-error'>
                {issue.message}
              </li>
            ))}
            {warnings.map((issue) => (
              <li key={issue.field + issue.message} className='issue-warning'>
                {issue.message}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {failure ? (
        <Notice tone='bad' title='The upload failed'>
          {failure}
        </Notice>
      ) : null}

      <div className='actions'>
        <button
          type='button'
          className='btn primary'
          onClick={() => void upload()}
          disabled={!file || busy || blocking.length > 0}
        >
          <FileUp size={15} aria-hidden='true' /> {busy ? 'Preserving…' : 'Preserve this object'}
        </button>
        {busy ? (
          <button type='button' className='btn secondary' onClick={() => (abort.current ? abort.current.abort() : undefined)}>
            <X size={14} aria-hidden='true' /> Cancel
          </button>
        ) : null}
      </div>

      {progress !== null ? (
        <div className='progress-block'>
          <div
            className='usage-track'
            role='progressbar'
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className='usage-fill' style={{ width: String(progress) + '%' }} />
          </div>
          <span className='fine'>{String(progress)}% transferred</span>
        </div>
      ) : null}

      {receipt ? (
        <Panel
          eyebrow='EVIDENCE RECEIPT'
          title='What the server recorded'
          description='The content identity is derived from the bytes. It proves byte consistency only.'
          actions={
            <button
              type='button'
              className='btn secondary'
              onClick={() => router.push('/objects/' + encodeURIComponent(String(receipt.digest ?? '')))}
            >
              Open the object
            </button>
          }
        >
          <div className='stack'>
            <div className='actions'>
              <StatusBadge tone='good'>Committed</StatusBadge>
              {receipt.digest ? <DigestField digest={String(receipt.digest)} /> : null}
            </div>
            <JsonViewer value={receipt} label='Stored metadata' />
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
