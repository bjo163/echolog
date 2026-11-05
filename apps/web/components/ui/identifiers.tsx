'use client'

import { useState } from 'react'
import { Check, Copy, Eye, EyeOff } from 'lucide-react'

/**
 * Identifier rendering.
 *
 * A truncated digest is a display convenience, never the record. Every
 * identifier here can be revealed in full and copied, so an operator pasting a
 * digest into a verification tool copies the real value and not the shortened
 * one that happens to be on screen.
 */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type='button'
      className='icon-btn'
      aria-label={label}
      title={label}
      onClick={() => {
        const clipboard = navigator.clipboard
        if (!clipboard) return
        void clipboard.writeText(value).then(
          () => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
          },
          () => setCopied(false),
        )
      }}
    >
      {copied ? <Check size={14} aria-hidden='true' /> : <Copy size={14} aria-hidden='true' />}
    </button>
  )
}

export function DigestField({ digest }: { digest: string }) {
  const [revealed, setRevealed] = useState(false)
  const short = digest.length > 20 ? digest.slice(0, 10) + '…' + digest.slice(-8) : digest
  return (
    <span className='identifier'>
      <code className='digest' title={revealed ? digest : 'Content identity, SHA-256'}>
        {revealed ? digest : short}
      </code>
      <button
        type='button'
        className='icon-btn'
        aria-label={revealed ? 'Hide the full digest' : 'Show the full digest'}
        title={revealed ? 'Hide the full digest' : 'Show the full digest'}
        aria-pressed={revealed}
        onClick={() => setRevealed((value) => !value)}
      >
        {revealed ? <EyeOff size={14} aria-hidden='true' /> : <Eye size={14} aria-hidden='true' />}
      </button>
      <CopyButton value={digest} label='Copy the full digest' />
    </span>
  )
}

export function ObjectKeyField({ objectKey }: { objectKey: string }) {
  const [revealed, setRevealed] = useState(false)
  const short = objectKey.length > 30 ? objectKey.slice(0, 18) + '…' + objectKey.slice(-10) : objectKey
  return (
    <span className='identifier'>
      <code className='object-key' title={revealed ? objectKey : 'Object key'}>
        {revealed ? objectKey : short}
      </code>
      {objectKey.length > 30 ? (
        <button
          type='button'
          className='icon-btn'
          aria-label={revealed ? 'Hide the full object key' : 'Show the full object key'}
          title={revealed ? 'Hide the full object key' : 'Show the full object key'}
          aria-pressed={revealed}
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? <EyeOff size={14} aria-hidden='true' /> : <Eye size={14} aria-hidden='true' />}
        </button>
      ) : null}
      <CopyButton value={objectKey} label='Copy the full object key' />
    </span>
  )
}
