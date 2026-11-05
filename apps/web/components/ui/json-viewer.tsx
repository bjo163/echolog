'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy } from 'lucide-react'

/**
 * A JSON viewer for the metadata the API actually returns.
 *
 * Collapsed branches show a real key count rather than a placeholder, and the
 * raw document can always be copied out in one piece, so an operator is never
 * forced to read a screenshot to move a value somewhere else.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

function typeOf(value: Json): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function isExpandable(value: Json): boolean {
  return value !== null && typeof value === 'object'
}

function preview(value: Json): string {
  if (Array.isArray(value)) return 'array, ' + String(value.length) + ' items'
  if (value !== null && typeof value === 'object') return 'object, ' + String(Object.keys(value).length) + ' keys'
  return ''
}

function Node({ name, value, depth }: { name: string; value: Json; depth: number }) {
  const [open, setOpen] = useState(depth < 1)
  const expandable = isExpandable(value)
  const kind = typeOf(value)

  if (!expandable) {
    return (
      <div className='json-row' style={{ paddingLeft: String(depth * 14 + 8) + 'px' }}>
        <span className='json-key'>{name}</span>
        <span className='json-colon'>:</span>
        <span className={'json-value json-' + kind}>{JSON.stringify(value)}</span>
      </div>
    )
  }

  const entries: Array<[string, Json]> = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value)

  return (
    <div className='json-node'>
      <button type='button' className='json-row json-toggle' onClick={() => setOpen((state) => !state)} aria-expanded={open}>
        {open ? <ChevronDown size={13} aria-hidden='true' /> : <ChevronRight size={13} aria-hidden='true' />}
        <span className='json-key'>{name}</span>
        <span className='json-colon'>:</span>
        <span className='json-kind'>{preview(value)}</span>
      </button>
      {open ? (
        <div>
          {entries.map(([key, item]) => (
            <Node key={key} name={key} value={item} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function JsonViewer({ value, label = 'JSON document' }: { value: unknown; label?: string }) {
  const [copied, setCopied] = useState(false)
  const document_ = (value ?? {}) as Json
  const serialised = useState(() => {
    try {
      return JSON.stringify(document_, null, 2)
    } catch {
      return ''
    }
  })[0]

  return (
    <div className='json-viewer'>
      <div className='json-head'>
        <span className='fine'>{label}</span>
        <button
          type='button'
          className='icon-btn'
          aria-label='Copy the raw JSON'
          title='Copy the raw JSON'
          onClick={() => {
            const clipboard = navigator.clipboard
            if (!clipboard) return
            void clipboard.writeText(serialised).then(
              () => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1600)
              },
              () => setCopied(false),
            )
          }}
        >
          <Copy size={14} aria-hidden='true' />
          {copied ? <span className='fine'>Copied</span> : null}
        </button>
      </div>
      <div className='json-body' role='region' aria-label={label}>
        <Node name='root' value={document_} depth={0} />
      </div>
    </div>
  )
}
