/**
 * Credential and account administration — admin only.
 *
 * A standalone ECHOLOG owns its identity, so it must also own the ways out:
 * a leaked API key has to be revocable, and an operator who leaves has to be
 * locked out without deleting the objects they uploaded. Issued secrets are
 * returned exactly once, because only their SHA-256 hash is stored.
 *
 * Two fail-safe rules protect the instance from itself: the key or session a
 * caller is authenticated with can never be revoked or disabled by that same
 * caller, so one mistaken click cannot lock every administrator out.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { EchologDatabase, Role } from '../../db.js'
import type { EchologPrincipal } from '../../auth.js'
import { createEchologAuthenticator, isAdmin } from '../../auth.js'
import {
  findApiKeyByPrefix,
  issueApiKey,
  listApiKeys,
  listUsers,
  revokeApiKey,
  setUserDisabled,
} from '../../db.js'
import { HttpProblem } from '../../limits.js'

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

const apiKeySchema = {
  type: 'object',
  required: ['id', 'name', 'prefix', 'role', 'created_at', 'last_used_at', 'revoked_at'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    prefix: { type: 'string' },
    role: { type: 'string' },
    created_at: { type: 'string' },
    last_used_at: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    revoked_at: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
} as const

const userSchema = {
  type: 'object',
  required: ['id', 'login', 'role', 'created_at', 'disabled'],
  properties: {
    id: { type: 'string' },
    login: { type: 'string' },
    role: { type: 'string' },
    created_at: { type: 'string' },
    disabled: { type: 'boolean' },
  },
} as const

const prefixPattern = '^ecl_[A-Za-z0-9_-]{8,}$'
const loginPattern = '^[^/\\\\]{1,60}$'

export interface AdminRouteOptions {
  database: EchologDatabase
  now?: () => number
}

type Authority =
  | { ok: true; principal: EchologPrincipal }
  | { ok: false; reply: FastifyReply }

export function registerAdminRoutes(app: FastifyInstance, options: AdminRouteOptions): void {
  const authenticate = createEchologAuthenticator({
    database: options.database,
    ...(options.now ? { now: options.now } : {}),
  })

  /** Either the authenticated administrator, or a reply that is already sent. */
  const authorize = async (request: FastifyRequest, reply: FastifyReply): Promise<Authority> => {
    const auth = await authenticate(request)
    if (!auth.ok) {
      const message = auth.code === 'auth_unavailable'
        ? 'The identity store is unavailable.'
        : 'Administrator authentication is required.'
      return { ok: false, reply: await reply.code(auth.status).send({ error: { code: auth.code, message } }) }
    }
    if (!isAdmin(auth.principal)) {
      return { ok: false, reply: await reply.code(403).send({ error: { code: 'forbidden', message: 'Administrator access is required.' } }) }
    }
    return { ok: true, principal: auth.principal }
  }

  app.get('/api/v1/keys', {
    schema: { response: { 200: { type: 'object', required: ['keys'], properties: { keys: { type: 'array', items: apiKeySchema } } }, 401: errorSchema, 403: errorSchema } },
  }, async (request, reply) => {
    const authority = await authorize(request, reply)
    if (!authority.ok) return authority.reply
    return reply.header('cache-control', 'no-store').send({ keys: listApiKeys(options.database) })
  })

  app.post('/api/v1/keys', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'role'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 60 },
          role: { type: 'string', enum: ['admin', 'member'] },
        },
      },
      response: {
        201: {
          type: 'object',
          required: ['key', 'token'],
          properties: {
            key: {
              type: 'object',
              required: ['id', 'name', 'prefix', 'role', 'created_at'],
              properties: {
                id: { type: 'string' }, name: { type: 'string' }, prefix: { type: 'string' },
                role: { type: 'string' }, created_at: { type: 'string' },
              },
            },
            token: { type: 'string' },
          },
        },
        401: errorSchema,
        403: errorSchema,
      },
    },
  }, async (request, reply) => {
    const authority = await authorize(request, reply)
    if (!authority.ok) return authority.reply
    const { name, role } = request.body as { name: string; role: Role }
    const issued = issueApiKey(options.database, name.trim(), role)
    return reply
      .code(201)
      .header('cache-control', 'no-store')
      .send({
        key: {
          id: issued.id, name: issued.name, prefix: issued.prefix,
          role: issued.role, created_at: issued.createdAt,
        },
        token: issued.token,
      })
  })

  app.delete('/api/v1/keys/:prefix', {
    schema: {
      params: {
        type: 'object',
        required: ['prefix'],
        properties: { prefix: { type: 'string', pattern: prefixPattern } },
      },
      response: { 204: { type: 'null' }, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema },
    },
  }, async (request, reply) => {
    const authority = await authorize(request, reply)
    if (!authority.ok) return authority.reply
    const { prefix } = request.params as { prefix: string }
    if (authority.principal.keyId && findApiKeyByPrefix(options.database, prefix)?.id === authority.principal.keyId) {
      throw new HttpProblem(409, 'self_lockout', 'The API key authenticating this request cannot revoke itself.')
    }
    if (!revokeApiKey(options.database, prefix)) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'No active key with that prefix.' } })
    }
    return reply.code(204).send()
  })

  app.get('/api/v1/users', {
    schema: { response: { 200: { type: 'object', required: ['users'], properties: { users: { type: 'array', items: userSchema } } }, 401: errorSchema, 403: errorSchema } },
  }, async (request, reply) => {
    const authority = await authorize(request, reply)
    if (!authority.ok) return authority.reply
    return reply.header('cache-control', 'no-store').send({
      users: listUsers(options.database).map((user) => ({
        id: user.id,
        login: user.login,
        role: user.role,
        created_at: user.created_at,
        disabled: user.disabled !== 0,
      })),
    })
  })

  app.patch('/api/v1/users/:login', {
    schema: {
      params: {
        type: 'object',
        required: ['login'],
        properties: { login: { type: 'string', pattern: loginPattern } },
      },
      body: {
        type: 'object',
        required: ['disabled'],
        additionalProperties: false,
        properties: { disabled: { type: 'boolean' } },
      },
      response: {
        200: {
          type: 'object',
          required: ['login', 'disabled'],
          properties: { login: { type: 'string' }, disabled: { type: 'boolean' } },
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
    },
  }, async (request, reply) => {
    const authority = await authorize(request, reply)
    if (!authority.ok) return authority.reply
    const { login } = request.params as { login: string }
    const { disabled } = request.body as { disabled: boolean }
    if (authority.principal.kind === 'session' && disabled && authority.principal.uploader === login) {
      throw new HttpProblem(409, 'self_lockout', 'You cannot disable the account you are signed in with.')
    }
    if (!setUserDisabled(options.database, login, disabled)) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'No such account.' } })
    }
    return reply.header('cache-control', 'no-store').send({ login, disabled })
  })
}
