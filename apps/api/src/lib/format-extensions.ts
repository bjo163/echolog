/**
 * Format extensions — utility functions for formatting/transforming data
 * used across the ECHOLOG console and API layer.
 *
 * These helpers are intentionally kept in the `src/lib` layer (server-side,
 * not client-facing) so they can be used by both the REST API routes and the
 * console client without creating circular dependencies.
 */
import type { EchologPrincipal } from '../auth.js'

/**
 * Format bytes into a human-readable size string (B, KB, MB, GB).
 *
 * @param bytes - The number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Human-readable size string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`
}

/**
 * Format a date/time string into a relative human-readable format.
 *
 * @param isoString - ISO 8601 date string
 * @returns Relative time string (e.g., "2 minutes ago", "Yesterday")
 */
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 30) {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (diffDays >= 2) {
    return `${diffDays} days ago`
  }

  if (diffDays === 1) {
    return 'yesterday'
  }

  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  }

  if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`
  }

  return `${diffSeconds} second${diffSeconds > 1 ? 's' : ''} ago`
}

/**
 * Sanitize and truncate a string for safe display in UI.
 *
 * @param value - The string to sanitize
 * @param maxLength - Maximum length in characters (default: 100)
 * @returns Sanitized and potentially truncated string
 */
export function sanitizeDisplay(value: string | null | undefined, maxLength = 100): string {
  if (value === undefined || value === null) return '-'

  const raw = value.replace(/\\/g, '/').split('/').at(-1) ?? ''
  const cleaned = Array.from(raw, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? '_' : character
  }).join('').trim()

  return cleaned.length > maxLength ? cleaned.slice(0, maxLength - 3) + '...' : cleaned
}

/**
 * Format an EchologPrincipal for display in logs or UI.
 *
 * @param principal - The principal to format
 * @returns A human-readable principal description
 */
export function formatPrincipal(principal: EchologPrincipal | null | undefined): string {
  if (!principal) return 'anonymous'

  const kindLabels: Record<EchologPrincipal['kind'], string> = {
    key: 'API key',
    session: 'Session',
    service: 'Service',
    arsy: 'ARSY session',
  }

  const kindLabel = kindLabels[principal.kind] ?? principal.kind
  const identifier = principal.uploader || principal.keyId || principal.userId || 'unknown'

  return `${kindLabel} (${identifier})`
}

/**
 * Determine if a principal has administrative privileges.
 *
 * @param principal - The principal to check
 * @returns True if the principal is admin or service
 */
export function isPrincipalAdmin(principal: EchologPrincipal | null | undefined): boolean {
  if (!principal) return false
  return principal.role === 'admin' || principal.kind === 'service'
}

/**
 * Format object metadata for display in API responses or console.
 *
 * @param metadata - Object metadata input
 * @returns Formatted object summary
 */
export function formatObjectMetadata(
  metadata: {
    filename?: string
    content_type?: string
    size?: number
    uploader?: string
    retention?: string | null
    legal_hold?: boolean | null
  }
): string {
  const parts: string[] = []

  if (metadata.filename) {
    parts.push(`"${sanitizeDisplay(metadata.filename, 30)}"`)
  }

  if (metadata.content_type) {
    parts.push(metadata.content_type)
  }

  if (metadata.size !== undefined) {
    parts.push(`${formatBytes(metadata.size)}`)
  }

  if (metadata.uploader) {
    parts.push(metadata.uploader)
  }

  if (metadata.retention) {
    parts.push(`retains until ${formatDateTime(metadata.retention)}`)
  }

  if (metadata.legal_hold) {
    parts.push('legal hold')
  }

  return parts.join(' | ')
}

export default {
  formatBytes,
  formatDateTime,
  sanitizeDisplay,
  formatPrincipal,
  isPrincipalAdmin,
  formatObjectMetadata,
}
