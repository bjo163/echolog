import type { ObjectSidecar } from '../types.js'
import { ApiError, toApiError } from './api.js'

/**
 * The console's own credential path: one httpOnly session cookie issued by
 * POST /api/v1/session. Tokens are never kept in state, storage or a bundle —
 * the browser holds the cookie and the server resolves it.
 *
 * Every failure surfaces the server's code and message unchanged, so a
 * `self_lockout` or a `legal_hold` refusal reads exactly as the service wrote it.
 */

export interface Principal {
  login: string
  role: 'admin' | 'member'
  kind: 'session' | 'key'
}

export interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  role: 'admin' | 'member'
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface UserRow {
  id: string
  login: string
  role: 'admin' | 'member'
  created_at: string
  disabled: boolean
}

export interface IssuedKey {
  key: { id: string; name: string; prefix: string; role: string; created_at: string }
  token: string
}

export interface GcOutcome {
  deleted: string[]
  held: Array<{ object_key: string; reason: string }>
  bytes_freed: number
}

const jsonHeaders = { accept: 'application/json' } as const

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { ...jsonHeaders, ...(init.headers ?? {}) },
  })
  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function signIn(login: string, password: string): Promise<Principal> {
  return request<Principal>('/api/v1/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login, password }),
  })
}

export async function signOut(): Promise<void> {
  await request<void>('/api/v1/session', { method: 'DELETE' })
}

/** `null` means "not signed in", never an error: the shell renders the login card. */
export async function whoAmI(): Promise<Principal | null> {
  try {
    return await request<Principal>('/api/v1/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  return (await request<{ keys: ApiKeyRow[] }>('/api/v1/keys')).keys
}

export async function issueApiKey(name: string, role: 'admin' | 'member'): Promise<IssuedKey> {
  return request<IssuedKey>('/api/v1/keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, role }),
  })
}

export async function revokeApiKey(prefix: string): Promise<void> {
  await request<void>(`/api/v1/keys/${encodeURIComponent(prefix)}`, { method: 'DELETE' })
}

export async function listUsers(): Promise<UserRow[]> {
  return (await request<{ users: UserRow[] }>('/api/v1/users')).users
}

export async function setUserDisabled(login: string, disabled: boolean): Promise<void> {
  await request<void>(`/api/v1/users/${encodeURIComponent(login)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ disabled }),
  })
}

export async function runGarbageCollection(): Promise<GcOutcome> {
  return request<GcOutcome>('/api/v1/gc', { method: 'POST' })
}

export async function readSidecar(digest: string): Promise<ObjectSidecar> {
  return request<ObjectSidecar>(`/api/v1/objects/sha256/${encodeURIComponent(digest)}/meta`)
}

export async function requestGrant(digest: string): Promise<{ url: string; expires_at: string }> {
  return request<{ url: string; expires_at: string }>(`/api/v1/objects/sha256/${encodeURIComponent(digest)}`)
}

export async function deleteSidecar(digest: string): Promise<void> {
  await request<void>(`/api/v1/objects/sha256/${encodeURIComponent(digest)}`, { method: 'DELETE' })
}

/**
 * One place decides how an API failure reads, so no view invents its own
 * wording for a refusal the service already explained.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof ApiError) return `${error.message} (${error.code})`
  if (error instanceof Error) return error.message
  return 'Unexpected console failure.'
}
