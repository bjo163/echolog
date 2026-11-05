'use client'

import { EyeOff, ShieldCheck, ShieldQuestion, ShieldX } from 'lucide-react'
import { StatusBadge, type Tone } from './primitives'
import { formatAge, formatTimestamp } from '../../lib/format'

/**
 * Integrity and privacy indicators.
 *
 * The four verification states are kept distinct on purpose. A digest that
 * matches proves byte consistency only, a digest that differs is a real
 * finding, an object that was never checked is not a passing object, and an
 * instance without the capability must say so rather than look healthy.
 */

export type VerificationState = 'verified' | 'mismatch' | 'not_checked' | 'unavailable'

export interface VerificationFacts {
  state: VerificationState
  expectedDigest: string | null
  observedDigest: string | null
  checkedAt: string | null
  source: string
}

const STATE_COPY: Record<VerificationState, { label: string; tone: Tone; explanation: string }> = {
  verified: {
    label: 'Verified',
    tone: 'good',
    explanation: 'The stored bytes were re-hashed and match the content address.',
  },
  mismatch: {
    label: 'Mismatch',
    tone: 'bad',
    explanation: 'The re-hashed bytes do not match the content address. This is a real finding.',
  },
  not_checked: {
    label: 'Not verified',
    tone: 'warn',
    explanation: 'No fixity scan has covered this object yet, so its bytes are unproven.',
  },
  unavailable: {
    label: 'Not supported',
    tone: 'muted',
    explanation: 'This instance exposes no fixity verification endpoint, so nothing can be claimed.',
  },
}

export function VerificationPanel({ facts, nowMs }: { facts: VerificationFacts; nowMs: number }) {
  const copy = STATE_COPY[facts.state]
  const checked = formatTimestamp(facts.checkedAt)
  const age = formatAge(facts.checkedAt, nowMs)
  return (
    <div className='verification-panel'>
      <div className='verification-head'>
        <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
        <span className='fine'>Source: {facts.source}</span>
      </div>
      <p className='fine'>{copy.explanation}</p>
      <dl className='detail-grid detail-columns-2'>
        <div>
          <dt className='fine'>Expected digest</dt>
          <dd>
            <code className='digest'>{facts.expectedDigest ?? 'Not available'}</code>
          </dd>
        </div>
        <div>
          <dt className='fine'>Observed digest</dt>
          <dd>
            <code className='digest'>{facts.observedDigest ?? 'Not available'}</code>
          </dd>
        </div>
        <div>
          <dt className='fine'>Checked</dt>
          <dd>
            {checked.text}
            {age ? <small className='fine'>{age}</small> : null}
          </dd>
        </div>
      </dl>
    </div>
  )
}

export function PrivacyIndicator({
  privateWitness,
  visible,
  reason,
}: {
  privateWitness: boolean
  visible: boolean
  reason?: string
}) {
  if (!privateWitness) {
    return (
      <StatusBadge tone='muted' title='This object is not marked as private-witness material.'>
        Standard visibility
      </StatusBadge>
    )
  }
  if (visible) {
    return (
      <StatusBadge tone='warn' title='This object is private-witness material and this credential may read it.'>
        <ShieldCheck size={13} aria-hidden='true' /> Private witness · visible to you
      </StatusBadge>
    )
  }
  return (
    <StatusBadge tone='bad' title={reason ?? 'This object is private-witness material and stays hidden.'}>
      <EyeOff size={13} aria-hidden='true' /> Private witness · withheld
    </StatusBadge>
  )
}

export function PrivacyNotice() {
  return (
    <p className='fine privacy-notice'>
      <ShieldQuestion size={14} aria-hidden='true' /> A private-witness object stays hidden from credentials
      without the witness: the API answers with the same 404 it would give for an object that never existed.
    </p>
  )
}

export function MismatchMarker() {
  return (
    <StatusBadge tone='bad' title='The observed bytes do not match the content address.'>
      <ShieldX size={13} aria-hidden='true' /> Content mismatch
    </StatusBadge>
  )
}
