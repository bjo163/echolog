import type {
  AuditLogRecord,
  ConsoleRuntimeFacts,
  DownloadGrant,
  FixityScanReport,
  GcResult,
  ObjectSidecar,
  OciRepositoryItem,
  S3KeyRecord,
  ShortLinkRecord,
  StorageStats,
} from '@echolog/contract'

/**
 * Thin client for the documented ECHOLOG REST surface.
 *
 * Two credentials are possible and neither is a secret of the service: an
 * `ecl_…` API key passed here as a bearer token (daemon style), or nothing at
 * all — the console signs in with POST /api/v1/session and the httpOnly cookie
 * rides along because every call sets `credentials: 'include'`. The
 * grant-signing secret and the S3 SigV4 pair are server-side only and never
 * reach this layer by design.
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export interface UploadInput {
  bytes: ArrayBuffer
  contentType: string
  filename: string
  retentionUntil: string | null
  legalHold: boolean
  privateWitness?: boolean
}

/** Without a token the session cookie authenticates, so no header is sent. */
function authHeaders(token?: string): Record<string, string> {
  return token
    ? { authorization: `Bearer ${token}`, accept: 'application/json' }
    : { accept: 'application/json' }
}

/**
 * Every failure keeps the server's `error.message` verbatim — the console
 * shows refusal reasons (including 409 retention holds) exactly as sent.
 * Exported so the pass-through discipline is directly testable.
 */
export async function toApiError(response: Response): Promise<ApiError> {
  let code = 'request_failed'
  let message = `Request failed with status ${String(response.status)}.`
  try {
    const body = await response.json() as { error?: { code?: unknown; message?: unknown } }
    if (typeof body.error?.code === 'string') code = body.error.code
    if (typeof body.error?.message === 'string') message = body.error.message
  } catch {
    // Non-JSON failure body: keep the generated message.
  }
  return new ApiError(response.status, code, message)
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init })
  if (!response.ok) throw await toApiError(response)
  return (await response.json()) as T
}

export function fetchObjectMeta(digest: string, token?: string): Promise<ObjectSidecar> {
  return requestJson<ObjectSidecar>(`/api/v1/objects/sha256/${encodeURIComponent(digest)}/meta`, {
    method: 'GET',
    headers: authHeaders(token),
  })
}

export function requestDownloadGrant(digest: string, token?: string): Promise<DownloadGrant> {
  return requestJson<DownloadGrant>(`/api/v1/objects/sha256/${encodeURIComponent(digest)}`, {
    method: 'GET',
    headers: authHeaders(token),
  })
}

export async function deleteObject(digest: string, token?: string): Promise<void> {
  const response = await fetch(`/api/v1/objects/sha256/${encodeURIComponent(digest)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(token),
  })
  if (!response.ok) throw await toApiError(response)
}

export function uploadObject(input: UploadInput, token?: string): Promise<ObjectSidecar> {
  const headers: Record<string, string> = {
    ...authHeaders(token),
    'content-type': input.contentType,
    'x-filename': input.filename,
  }
  if (input.retentionUntil) headers['x-echolog-retention-until'] = input.retentionUntil
  if (input.legalHold) headers['x-echolog-legal-hold'] = 'true'
  if (input.privateWitness) headers['x-echolog-private-witness'] = 'true'
  return requestJson<ObjectSidecar>('/api/v1/objects', { method: 'POST', headers, body: input.bytes })
}

export function runGarbageCollection(token?: string): Promise<GcResult> {
  return requestJson<GcResult>('/api/v1/gc', { method: 'POST', headers: authHeaders(token) })
}

/**
 * Runtime facts straight from the server.
 *
 * The console never infers the identity mode, the environment, the version or
 * the capability set from a label; it asks the instance that is actually
 * answering the request.
 */
export function fetchRuntimeFacts(token?: string): Promise<ConsoleRuntimeFacts> {
  return requestJson<ConsoleRuntimeFacts>('/api/v1/console/runtime', { method: 'GET', headers: authHeaders(token) })
}

/**
 * Aggregated result of the last full-read fixity scan.
 *
 * The scan is a real byte-level re-hash of stored objects, but it reports
 * aggregates only: per-object outcomes are published to an in-process event bus
 * and are not durable history.
 */
export async function fetchFixityReport(token?: string): Promise<FixityScanReport | null> {
  const overview = await requestJson<{
    telemetry?: { autonomousScrubber?: FixityScanReport | null }
  }>('/api/v1/analytics/overview', { method: 'GET', headers: authHeaders(token) })
  return overview.telemetry?.autonomousScrubber ?? null
}

/** Trigger an on-demand full-read fixity scan. Administrator only. */
export function runFixityScan(token?: string): Promise<{ success: boolean; results: FixityScanReport }> {
  return requestJson<{ success: boolean; results: FixityScanReport }>('/api/v1/analytics/scrub', {
    method: 'POST',
    headers: authHeaders(token),
  })
}

export interface UploadProgress {
  loaded: number
  total: number | null
  /** `null` when the total size is not known yet, so no fake percentage is shown. */
  percent: number | null
}

/**
 * Upload with real byte progress.
 *
 * `fetch` cannot report how much of a request body has been sent, so the
 * browser transport uses `XMLHttpRequest`, which does. Servers and test
 * environments fall back to the plain fetch path without progress rather than
 * inventing a percentage.
 */
export function uploadObjectWithProgress(
  input: UploadInput,
  onProgress: (progress: UploadProgress) => void,
  options: { token?: string; signal?: AbortSignal } = {},
): Promise<ObjectSidecar> {
  if (typeof XMLHttpRequest === 'undefined') {
    return uploadObject(input, options.token)
  }
  return new Promise<ObjectSidecar>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', '/api/v1/objects', true)
    request.withCredentials = true
    request.setRequestHeader('content-type', input.contentType)
    request.setRequestHeader('x-filename', input.filename)
    if (input.retentionUntil) request.setRequestHeader('x-echolog-retention-until', input.retentionUntil)
    if (input.legalHold) request.setRequestHeader('x-echolog-legal-hold', 'true')
    if (input.privateWitness) request.setRequestHeader('x-echolog-private-witness', 'true')
    if (options.token) request.setRequestHeader('authorization', `Bearer ${options.token}`)

    request.upload.addEventListener('progress', (event) => {
      const total = event.lengthComputable ? event.total : null
      onProgress({
        loaded: event.loaded,
        total,
        percent: total && total > 0 ? Math.round((event.loaded / total) * 100) : null,
      })
    })

    request.addEventListener('load', () => {
      let body: unknown = null
      try {
        body = JSON.parse(request.responseText) as unknown
      } catch {
        body = null
      }
      if (request.status >= 200 && request.status < 300) {
        resolve(body as ObjectSidecar)
        return
      }
      const failure = body as { error?: { code?: string; message?: string } } | null
      const code = failure?.error?.code ?? 'request_failed'
      const message = failure?.error?.message ?? `Upload failed with status ${String(request.status)}.`
      reject(new ApiError(request.status, code, message))
    })
    request.addEventListener('error', () => {
      reject(new ApiError(0, 'network_error', 'The upload could not reach ECHOLOG. Check service availability and retry.'))
    })
    request.addEventListener('abort', () => {
      reject(new ApiError(0, 'upload_cancelled', 'The upload was cancelled before it completed.'))
    })

    options.signal?.addEventListener('abort', () => request.abort(), { once: true })
    request.send(input.bytes)
  })
}

export function fetchStorageStats(token?: string): Promise<StorageStats> {
  return requestJson<StorageStats>('/api/v1/storage/stats', { method: 'GET', headers: authHeaders(token) })
}

export function listS3Keys(token?: string): Promise<S3KeyRecord[]> {
  return requestJson<S3KeyRecord[]>('/api/v1/s3-keys', { method: 'GET', headers: authHeaders(token) })
}

export function fetchAuditLogs(limit = 100, token?: string): Promise<AuditLogRecord[]> {
  return requestJson<AuditLogRecord[]>(`/api/v1/audit-logs?limit=${encodeURIComponent(limit)}`, {
    method: 'GET',
    headers: authHeaders(token),
  })
}

export function listOciRepositories(token?: string): Promise<OciRepositoryItem[]> {
  return requestJson<OciRepositoryItem[]>('/api/v1/registry/repositories', { method: 'GET', headers: authHeaders(token) })
}

export function createPaste(payload: { content: string; title?: string | undefined; retention_hours?: number | undefined; burn_after_reading?: boolean | undefined; custom_slug?: string | undefined }, token?: string) {
  return requestJson<{ slug: string; digest: string; url: string; raw_url: string; burn_after_reading: boolean; expires_at: string | null }>(
    '/api/v1/tools/paste',
    { method: 'POST', headers: { ...authHeaders(token), 'content-type': 'application/json' }, body: JSON.stringify(payload) }
  )
}

export function listShortLinks(token?: string): Promise<ShortLinkRecord[]> {
  return requestJson<ShortLinkRecord[]>('/api/v1/tools/short-links', { method: 'GET', headers: authHeaders(token) })
}

export function createShortLinkApi(payload: { digest: string; custom_slug?: string | undefined; burn_after_reading?: boolean | undefined; expires_hours?: number | undefined }, token?: string) {
  return requestJson<ShortLinkRecord>('/api/v1/tools/short-links', {
    method: 'POST',
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function deleteShortLinkApi(slug: string, token?: string): Promise<void> {
  return requestJson<void>(`/api/v1/tools/short-links/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}

export function markPrivateWitness(digest: string, token?: string): Promise<void> {
  return requestJson<void>(`/api/v1/objects/sha256/${encodeURIComponent(digest)}/private-witness`, {
    method: 'POST',
    headers: authHeaders(token),
  })
}

export interface HealthSnapshot {
  reachable: boolean
  ready: boolean
  detail: string
}

export async function fetchHealth(): Promise<HealthSnapshot> {
  try {
    const health = await fetch('/health/ready', { headers: { accept: 'application/json' } })
    const body = await health.json() as { status?: unknown; reason?: unknown; storage?: unknown }
    const ready = health.status === 200 && body.status === 'ready'
    const reason = typeof body.reason === 'string' ? body.reason : typeof body.storage === 'string' ? `storage ${body.storage}` : 'unknown'
    return { reachable: true, ready, detail: ready ? 'storage ready' : `not ready: ${reason}` }
  } catch {
    return { reachable: false, ready: false, detail: 'ECHOLOG is not reachable on this origin' }
  }
}

/** Client-side SHA-256 (Web Crypto) used only to preview the content address. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
