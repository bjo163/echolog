/**
 * ECHOLOG authentication — local first, optionally federated with a Hub.
 *
 * Four credential kinds are accepted, in this order:
 *
 *   x-echolog-key: <service key>   daemon access; only when ECHOLOG_SERVICE_KEY is set
 *   Authorization: Bearer ecl_…    local machine API key (hashed, revocable)
 *   Authorization: Bearer <token>  an ARSY session, resolved by ARSY's own
 *                                  /api/v1/auth/me — only when ECHOLOG_ARSY_URL is set
 *   Cookie: echolog_session=…      operator console session (hashed, expiring)
 *
 * With no Hub configured this service decides alone: an unreachable identity
 * provider cannot take storage down. Setting ECHOLOG_ARSY_URL is the federation
 * switch of the withdrawal contract — the bearer is no longer ours to interpret,
 * and the private-witness ACL decision moves back to the Hub (D06).
 */
import type { FastifyRequest } from 'fastify'
import { sha256Hex } from './core/index.js'
import type { EchologDatabase, Role } from './db.js'
import { findApiKey, findSessionUser } from './db.js'

export const SESSION_COOKIE = 'echolog_session'
const AUTH_CACHE_TTL_MS = 2_000
const AUTH_CACHE_MAX = 500
const TOKEN_MAX_LENGTH = 4096
const API_KEY_PREFIX = 'ecl_'

export interface EchologPrincipal {
  kind: 'session' | 'key' | 'service' | 'arsy'
  uploader: string
  role: string
  userId?: string
  keyId?: string
}

export type AuthResult =
  | { ok: true; principal: EchologPrincipal }
  | { ok: false; status: 401 | 503; code: 'unauthorized' | 'auth_unavailable' }

interface CacheEntry {
  principal: EchologPrincipal
  expiresAt: number
}

export interface AuthOptions {
  database: EchologDatabase
  /** Shared daemon credential. Empty disables the `x-echolog-key` mode entirely. */
  serviceKey?: string
  /** Hub base URL. Empty keeps authentication local. */
  arsyUrl?: string
  fetcher?: typeof fetch
  now?: () => number
}

/** Administrative power in this instance's own model. */
export function isAdmin(principal: EchologPrincipal): boolean {
  return principal.role === 'admin'
}

/**
 * What the withdrawal contract calls an administrator: this instance's own
 * admin, or the shared service credential a trusted daemon presents.
 */
export function isPrivileged(principal: EchologPrincipal): boolean {
  return principal.kind === 'service' || isAdmin(principal)
}

export function createEchologAuthenticator(options: AuthOptions) {
  const now = options.now ?? Date.now
  const fetcher = options.fetcher ?? fetch
  const cache = new Map<string, CacheEntry>()
  const authMeUrl = options.arsyUrl ? new URL('/api/v1/auth/me', options.arsyUrl) : null

  /** Resolve an opaque Hub session through the Hub's own boundary, briefly cached. */
  async function resolveArsySession(token: string): Promise<AuthResult> {
    if (!authMeUrl) return { ok: false, status: 401, code: 'unauthorized' }

    const tokenId = await sha256Hex(new TextEncoder().encode(token))
    const cached = cache.get(tokenId)
    if (cached && cached.expiresAt > now()) return { ok: true, principal: cached.principal }
    cache.delete(tokenId)

    let response: Response
    try {
      response = await fetcher(authMeUrl, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(3_000),
        redirect: 'error',
      })
    } catch {
      return { ok: false, status: 503, code: 'auth_unavailable' }
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: 401, code: 'unauthorized' }
    }
    if (!response.ok) return { ok: false, status: 503, code: 'auth_unavailable' }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      return { ok: false, status: 503, code: 'auth_unavailable' }
    }
    const data = isRecord(body) ? (isRecord(body.data) ? body.data : body) : null
    const uploader = data && typeof data.login === 'string' ? data.login : null
    const role = data && typeof data.role === 'string' ? data.role : null
    if (!uploader || !role) return { ok: false, status: 503, code: 'auth_unavailable' }

    const principal: EchologPrincipal = { kind: 'arsy', uploader, role }
    if (cache.size >= AUTH_CACHE_MAX) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(tokenId, { principal, expiresAt: now() + AUTH_CACHE_TTL_MS })
    return { ok: true, principal }
  }

  return async function authenticate(request: FastifyRequest): Promise<AuthResult> {
    const serviceHeader = request.headers['x-echolog-key']
    const serviceKey = Array.isArray(serviceHeader) ? null : serviceHeader
    if (serviceKey !== undefined && serviceKey !== null) {
      const configured = options.serviceKey ?? ''
      if (configured.length > 0 && await constantTimeEqual(serviceKey, configured)) {
        return { ok: true, principal: { kind: 'service', uploader: 'service', role: 'service' } }
      }
      return { ok: false, status: 401, code: 'unauthorized' }
    }

    const authorization = request.headers.authorization
    if (Array.isArray(authorization)) return { ok: false, status: 401, code: 'unauthorized' }
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''

    if (token.startsWith(`${API_KEY_PREFIX}`)) {
      if (token.length > TOKEN_MAX_LENGTH) return { ok: false, status: 401, code: 'unauthorized' }
      const record = findApiKey(options.database, token)
      if (!record) return { ok: false, status: 401, code: 'unauthorized' }
      return {
        ok: true,
        principal: { kind: 'key', uploader: record.name, role: record.role, keyId: record.id },
      }
    }

    if (token.length > 0) {
      if (token.length > TOKEN_MAX_LENGTH) return { ok: false, status: 401, code: 'unauthorized' }
      if (!options.arsyUrl) return { ok: false, status: 401, code: 'unauthorized' }
      return resolveArsySession(token)
    }

    const sessionToken = readCookie(request, SESSION_COOKIE)
    if (!sessionToken || sessionToken.length > TOKEN_MAX_LENGTH) {
      return { ok: false, status: 401, code: 'unauthorized' }
    }
    const found = findSessionUser(options.database, sessionToken, now())
    if (!found) return { ok: false, status: 401, code: 'unauthorized' }
    return {
      ok: true,
      principal: {
        kind: 'session',
        uploader: found.user.login,
        role: found.user.role satisfies Role,
        userId: found.user.id,
      },
    }
  }
}

/** Read one cookie value without pulling in a cookie plugin. */
export function readCookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie
  if (typeof header !== 'string') return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== name) continue
    return decodeURIComponent(part.slice(separator + 1).trim())
  }
  return undefined
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  if (left.length === 0 || left.length !== right.length) return false
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(left)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(right)),
  ])
  const leftBytes = new Uint8Array(leftDigest)
  const rightBytes = new Uint8Array(rightDigest)
  let mismatch = 0
  for (let index = 0; index < leftBytes.length; index += 1) mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  return mismatch === 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
