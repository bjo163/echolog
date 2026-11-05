import { ApiError } from '@echolog/shared'

/**
 * Failure classification for the console.
 *
 * The console must never tell an operator that the service is broken when the
 * real problem is that their session expired, and it must never show an empty
 * result set as if the archive were empty. Every failure is therefore mapped
 * to an explicit class with its own wording and its own next step.
 */

export type FailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'too_large'
  | 'unsupported_media'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'service_unavailable'
  | 'network'
  | 'offline'
  | 'unknown'

export interface Failure {
  kind: FailureKind
  title: string
  message: string
  /** What the operator can actually do about it. Empty when there is nothing. */
  remedy: string
  status: number | null
  code: string | null
}

const OFFLINE_HINT = 'The browser reports no network connection.'

export function classifyStatus(status: number, code: string | null): FailureKind {
  if (status === 401) return 'unauthenticated'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 413) return 'too_large'
  if (status === 415) return 'unsupported_media'
  if (status === 429) return 'rate_limited'
  if (status === 507) return 'quota_exceeded'
  if (status === 503) return 'service_unavailable'
  if (code === 'quota_exceeded') return 'quota_exceeded'
  if (code === 'too_large') return 'too_large'
  if (code === 'unsupported_media_type') return 'unsupported_media'
  return 'unknown'
}

/** Turns any thrown value into a failure the console can explain. */
export function describeFailure(error: unknown): Failure {
  if (error instanceof ApiError) {
    const kind = classifyStatus(error.status, error.code)
    return { kind, ...wording(kind, error.message, error.status, error.code) }
  }
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    const kind = typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'network'
    return { kind, ...wording(kind, 'The ECHOLOG API could not be reached.', null, null) }
  }
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
  return { kind: 'unknown', ...wording('unknown', message, null, null) }
}

function wording(kind: FailureKind, message: string, status: number | null, code: string | null) {
  const base = { status, code }
  switch (kind) {
    case 'unauthenticated':
      return {
        ...base,
        title: 'Session expired',
        message: message || 'The operator session is no longer valid.',
        remedy: 'Sign in again to continue.',
      }
    case 'forbidden':
      return {
        ...base,
        title: 'Not permitted',
        message: message || 'This credential is not allowed to perform that action.',
        remedy: 'Ask an administrator for the required role.',
      }
    case 'not_found':
      return {
        ...base,
        title: 'Not found',
        message: message || 'The requested record does not exist for this credential.',
        remedy: 'Private-witness objects stay hidden from credentials without the witness.',
      }
    case 'conflict':
      return {
        ...base,
        title: 'Conflict',
        message: message || 'The object already exists with different bytes at that key.',
        remedy: 'Object memory is immutable; compare the digests before retrying.',
      }
    case 'too_large':
      return {
        ...base,
        title: 'Too large',
        message: message || 'The request exceeds the limit configured for this instance.',
        remedy: 'Split the payload or raise the configured upload limit.',
      }
    case 'unsupported_media':
      return {
        ...base,
        title: 'Content type rejected',
        message: message || 'This instance does not accept that content type.',
        remedy: 'Use one of the content types listed under Settings.',
      }
    case 'quota_exceeded':
      return {
        ...base,
        title: 'Storage quota reached',
        message: message || 'The instance cannot accept more bytes right now.',
        remedy: 'Run garbage collection or raise the configured quota.',
      }
    case 'rate_limited':
      return {
        ...base,
        title: 'Rate limited',
        message: message || 'Too many requests were sent in a short window.',
        remedy: 'Wait for the window to reset, then retry.',
      }
    case 'service_unavailable':
      return {
        ...base,
        title: 'Service unavailable',
        message: message || 'The identity or storage backend could not answer.',
        remedy: 'Check service health, then retry.',
      }
    case 'network':
      return {
        ...base,
        title: 'Cannot reach ECHOLOG',
        message: message || 'The request did not complete.',
        remedy: 'Confirm the API is reachable, then retry.',
      }
    case 'offline':
      return {
        ...base,
        title: 'Browser offline',
        message: OFFLINE_HINT,
        remedy: 'Reconnect and retry.',
      }
    case 'unknown':
      return {
        ...base,
        title: 'Request failed',
        message: message || 'The request did not complete.',
        remedy: 'Retry, and check the diagnostics screen if it keeps failing.',
      }
  }
}
