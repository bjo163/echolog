/**
 * Session routes — the operator login surface.
 *
 * A successful login sets one opaque httpOnly cookie. The token is random,
 * stored only as a SHA-256 hash, and expires server-side; logging out deletes
 * the row so a copied cookie stops working immediately.
 */
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { EchologConfig } from '../../config.js'
import type { EchologDatabase } from '../../db.js'
import { createSession, deleteSession, findSessionUser, findUserByLogin, verifyPassword } from '../../db.js'
import { SESSION_COOKIE, createEchologAuthenticator, readCookie } from '../../auth.js'

const LOGIN_WINDOW_MS = 60_000
const LOGIN_MAX_ATTEMPTS = 10

export interface SessionRouteOptions {
  database: EchologDatabase
  now?: () => number
  fetcher?: typeof fetch
}

const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  },
} as const

const principalSchema = {
  type: 'object',
  required: ['login', 'role', 'kind'],
  properties: { login: { type: 'string' }, role: { type: 'string' }, kind: { type: 'string' } },
} as const

export function registerSessionRoutes(
  app: FastifyInstance,
  config: EchologConfig,
  options: SessionRouteOptions,
): void {
  const now = options.now ?? Date.now
  const authenticate = createEchologAuthenticator({
    database: options.database,
    serviceKey: config.serviceKey,
    arsyUrl: config.arsyUrl,
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    ...(options.now ? { now: options.now } : {}),
  })

  // One bounded counter per login name; enough to make online guessing slow
  // without adding a dependency or an unbounded map.
  const attempts = new Map<string, { count: number; resetAt: number }>()

  const tooManyAttempts = (login: string): boolean => {
    const entry = attempts.get(login)
    if (!entry) return false
    if (entry.resetAt <= now()) {
      attempts.delete(login)
      return false
    }
    return entry.count >= LOGIN_MAX_ATTEMPTS
  }

  const recordFailure = (login: string): void => {
    const entry = attempts.get(login)
    const resetAt = now() + LOGIN_WINDOW_MS
    if (!entry || entry.resetAt <= now()) {
      attempts.set(login, { count: 1, resetAt })
      return
    }
    entry.count += 1
  }

  const secureCookie = (): boolean =>
    config.cookieSecure === 'true' ||
    (config.cookieSecure === 'auto' && config.nodeEnv === 'production')

  const setCookie = (reply: FastifyReply, token: string, maxAgeSeconds: number): void => {
    reply.header(
      'set-cookie',
      `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureCookie() ? '; Secure' : ''}`,
    )
  }

  app.post('/api/v1/session', {
    schema: {
      body: {
        type: 'object',
        required: ['login', 'password'],
        additionalProperties: false,
        properties: {
          login: { type: 'string', minLength: 1, maxLength: 60 },
          password: { type: 'string', minLength: 1, maxLength: 256 },
        },
      },
      response: { 200: principalSchema, 401: errorSchema, 429: errorSchema },
    },
  }, async (request, reply) => {
    const { login, password } = request.body as { login: string; password: string }
    if (tooManyAttempts(login)) {
      return reply.code(429).send({ error: { code: 'too_many_attempts', message: 'Too many sign-in attempts. Try again shortly.' } })
    }
    const user = findUserByLogin(options.database, login)
    if (!user || user.disabled !== 0 || !verifyPassword(user.password_hash, password)) {
      recordFailure(login)
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'Invalid login or password.' } })
    }
    attempts.delete(login)
    const ttlMs = config.sessionTtlHours * 60 * 60 * 1000
    const session = createSession(options.database, user.id, ttlMs, now())
    setCookie(reply, session.token, Math.floor(ttlMs / 1000))
    return reply.header('cache-control', 'no-store').send({ login: user.login, role: user.role, kind: 'session' })
  })

  app.delete('/api/v1/session', {
    schema: { response: { 204: { type: 'null' } } },
  }, async (request, reply) => {
    const token = readCookie(request, SESSION_COOKIE)
    if (token) deleteSession(options.database, token)
    reply.header('set-cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
    return reply.code(204).send()
  })

  app.get('/api/v1/me', {
    schema: { response: { 200: principalSchema, 401: errorSchema } },
  }, async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) {
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'Authentication is required.' } })
    }
    return reply.header('cache-control', 'no-store').send({
      login: auth.principal.uploader,
      role: auth.principal.role,
      kind: auth.principal.kind,
    })
  })

  // A session that outlived its account (deleted or disabled) is treated as
  // unauthenticated on the next request; this endpoint makes that explicit.
  app.get('/api/v1/session', {
    schema: { response: { 200: principalSchema, 401: errorSchema } },
  }, async (request, reply) => {
    const token = readCookie(request, SESSION_COOKIE)
    const found = token ? findSessionUser(options.database, token, now()) : null
    if (!found) {
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'No active session.' } })
    }
    return reply.header('cache-control', 'no-store').send({
      login: found.user.login,
      role: found.user.role,
      kind: 'session',
    })
  })
}
