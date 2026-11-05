import type { CapabilityMaturity } from '@echolog/contract'

/**
 * Byte formatting lives in the shared package so the console and any other
 * consumer render the same size the same way.
 */
export { formatBytes } from '@echolog/shared'

/**
 * Presentation helpers shared by every screen.
 *
 * Two rules hold here. A value the server did not report is never rendered as
 * a zero — it reads as "Not available". And a timestamp always carries its
 * timezone, because an audit record without one is ambiguous evidence.
 */

export const NOT_AVAILABLE = 'Not available'

export type Availability = 'known' | 'unknown'

/** Renders a number only when it was actually measured. */
export function optionalNumber(value: number | null | undefined): { text: string; availability: Availability } {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { text: NOT_AVAILABLE, availability: 'unknown' }
  }
  return { text: value.toLocaleString('en-US'), availability: 'known' }
}

/** An absolute timestamp with an explicit timezone, plus the ISO value. */
export function formatTimestamp(value: string | null | undefined): { text: string; iso: string | null } {
  if (!value) return { text: 'Not recorded', iso: null }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return { text: value, iso: null }
  const zone = parsed.toLocaleString('en-US', { timeZoneName: 'short' }).split(' ').pop() ?? ''
  return {
    text: `${parsed.toLocaleString('en-GB', { hour12: false })} ${zone}`,
    iso: parsed.toISOString(),
  }
}

/**
 * Age of a record, used for stale checks.
 *
 * `null` means the age is unknown, which is different from "brand new" and
 * must never be collapsed into zero.
 */
export function formatAge(timestamp: string | null | undefined, nowMs: number): string | null {
  if (!timestamp) return null
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed)) return null
  const seconds = Math.max(0, Math.round((nowMs - parsed) / 1000))
  if (seconds < 60) return `${String(seconds)}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${String(minutes)}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${String(hours)}h ago`
  return `${String(Math.floor(hours / 24))}d ago`
}

/** Records older than the given window are stale, never current. */
export function isStale(timestamp: string | null | undefined, nowMs: number, maxAgeMs: number): boolean {
  if (!timestamp) return false
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed)) return false
  return nowMs - parsed > maxAgeMs
}

/** Shortens a digest for display without hiding that it was shortened. */
export function truncateDigest(digest: string, head = 10, tail = 8): string {
  if (digest.length <= head + tail + 1) return digest
  return `${digest.slice(0, head)}…${digest.slice(-tail)}`
}

/** Object keys can be long; the middle is what an operator rarely needs. */
export function truncateMiddle(value: string, head = 18, tail = 12): string {
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

/**
 * Human label for a capability maturity reported by the server.
 *
 * The wording never upgrades a capability: `experimental` stays experimental and
 * `unavailable` stays unavailable, whatever the surrounding design implies.
 */
export function maturityLabel(maturity: CapabilityMaturity): string {
  switch (maturity) {
    case 'available':
      return 'Available'
    case 'experimental':
      return 'Experimental'
    case 'unavailable':
      return 'Not supported'
  }
}

export function maturityTone(maturity: CapabilityMaturity): 'good' | 'warn' | 'muted' {
  switch (maturity) {
    case 'available':
      return 'good'
    case 'experimental':
      return 'warn'
    case 'unavailable':
      return 'muted'
  }
}

/** Turns a service action into a readable sentence without inventing a result. */
export function humaniseAction(action: string): string {
  const spaced = action.replaceAll('_', ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
