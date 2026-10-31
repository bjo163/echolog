/**
 * ECHOLOG authentication — local only.
 *
 * Two credential kinds are accepted, both verified against the SQLite store:
 *
 *   Authorization: Bearer ecl_…   machine API key (hashed, revocable)
 *   Cookie: echolog_session=…     operator console session (hashed, expiring)
 *
 * There is no Hub, no service key environment variable and no outbound call on
 * the request path: an unreachable identity provider cannot take storage down.
 */
import type { FastifyRequest } from 'fastify'
import type { EchologDatabase, Role } from './db.js'
import { findApiKey, findSessionUser } from './db.js'

export const SESSION_COOKIE = 'echolog_session'
const TOKEN_MAX_LENGTH = 4096

export interface EchologPrincipal {
  kind: 'session' | 'key'
  uploader: string
  role: Role
  userId?: string
  keyId?: string
}

export type AuthResult =
  | { ok: true; principal: EchologPrincipal }
  | { ok: false; status: 401 | 503; code: 'unauthorized' | 'auth_unavailable' }

export interface AuthOptions {
  database: EchologDatabase
  now?: () => number
}

export function isAdmin(principal: EchologPrincipal): boolean {
  return principal.role === 'admin'
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

export function createEchologAuthenticator(options: AuthOptions) {
  const now = options.now ?? Date.now

  return async function authenticate(request: FastifyRequest): Promise<AuthResult> {
    const authorization = request.headers.authorization
    if (Array.isArray(authorization)) return { ok: false, status: 401, code: 'unauthorized' }

    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      const token = authorization.slice(7).trim()
      if (!token || token.length > TOKEN_MAX_LENGTH) return { ok: false, status: 401, code: 'unauthorized' }
      const record = findApiKey(options.database, token)
      if (!record) return { ok: false, status: 401, code: 'unauthorized' }
      return {
        ok: true,
        principal: { kind: 'key', uploader: record.name, role: record.role, keyId: record.id },
      }
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
        role: found.user.role,
        userId: found.user.id,
      },
    }
  }
}
