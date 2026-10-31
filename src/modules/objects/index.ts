import { FsStorageDriver, ObjectHeldError, QuotaExceededError } from '../../core/index.js'
import type { ObjectMetadataInput } from '../../core/index.js'
import type { FastifyInstance, FastifyServerOptions } from 'fastify'
import type { EchologConfig } from '../../config.js'
import type { EchologDatabase } from '../../db.js'
import { createEchologAuthenticator, isAdmin } from '../../auth.js'
import { createDownloadGrant, verifyDownloadGrant } from '../../grants.js'
import {
  contentDisposition,
  enforceSizeLimit,
  headerFlag,
  HttpProblem,
  normalizedMimeType,
  parseRetention,
  safeStoredFilename,
} from '../../limits.js'
import { createObjectService } from './service.js'
import { FsS3KeyStore } from '../s3/store.js'

const DOWNLOAD_GRANT_TTL_MS = 5 * 60 * 1000
const digestPattern = '^[a-f0-9]{64}$'
const sidecarSchema = {
  type: 'object',
  required: ['object_key', 'digest', 'size', 'content_type', 'filename', 'uploader', 'created_at', 'retention_until', 'legal_hold', 'scan', 'tags'],
  properties: {
    object_key: { type: 'string' }, digest: { type: 'string' }, size: { type: 'integer' },
    content_type: { type: 'string' }, filename: { type: 'string' }, uploader: { type: 'string' },
    created_at: { type: 'string' }, retention_until: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    legal_hold: { type: 'boolean' }, scan: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } },
  },
} as const

export interface EchologServerOptions {
  logger?: FastifyServerOptions['logger']
  database: EchologDatabase
  now?: () => number
}

export interface RegisteredObjectRoutes {
  ensureStorageReady: () => Promise<void>
  s3Keys: FsS3KeyStore
}

export function registerObjectRoutes(
  app: FastifyInstance,
  config: EchologConfig,
  options: EchologServerOptions,
): RegisteredObjectRoutes {
  for (const mimeType of config.allowedMimeTypes) {
    if (!app.hasContentTypeParser(mimeType)) {
      app.addContentTypeParser(mimeType, (_request, payload, done) => done(null, payload))
    }
  }

  const driver = new FsStorageDriver({ root: config.storageRoot, quotaBytes: config.storageQuotaBytes })
  const s3Keys = new FsS3KeyStore({ root: config.storageRoot, driver, ...(options.now ? { now: options.now } : {}) })
  const objects = createObjectService(driver, (at) => s3Keys.collect(at))
  const authenticate = createEchologAuthenticator({
    database: options.database,
    ...(options.now ? { now: options.now } : {}),
  })
  const grantSecret = config.grantSigningSecret || generateEphemeralGrantSecret()

  app.post('/api/v1/objects', {
    schema: {
      response: {
        201: sidecarSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        413: errorSchema,
        415: errorSchema,
        500: errorSchema,
        503: errorSchema,
        507: errorSchema,
      },
    },
  }, async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) return reply.code(auth.status).send(authFailureBody(auth.code))

    const contentTypeHeader = singleHeader(request.headers['content-type'])
    const contentType = normalizedMimeType(contentTypeHeader)
    if (!contentType || !config.allowedMimeTypes.includes(contentType)) {
      throw new HttpProblem(415, 'unsupported_media_type', 'This content type is not allowed.')
    }

    const body = request.body
    if (!isByteStream(body)) throw new HttpProblem(400, 'invalid_body', 'Upload body must be a byte stream.')
    const filename = safeStoredFilename(singleHeader(request.headers['x-filename']))
    const retentionUntil = parseRetention(singleHeader(request.headers['x-echolog-retention-until']))
    const legalHold = headerFlag(singleHeader(request.headers['x-echolog-legal-hold']), 'x-echolog-legal-hold')
    const privateWitness = headerFlag(singleHeader(request.headers['x-echolog-private-witness']), 'x-echolog-private-witness')
    if (legalHold && !isAdmin(auth.principal)) {
      throw new HttpProblem(403, 'forbidden', 'Only an administrator may set legal hold.')
    }
    const metadata: ObjectMetadataInput = {
      filename,
      content_type: contentType,
      uploader: auth.principal.uploader,
      retention_until: retentionUntil,
      legal_hold: legalHold,
      scan: 'skipped',
    }
    const contentLength = singleHeader(request.headers['content-length'])
    if (contentLength !== undefined && (!/^\d+$/.test(contentLength) || Number(contentLength) > config.maxUploadBytes)) {
      throw new HttpProblem(413, 'too_large', 'Upload exceeds the configured size limit.')
    }
    try {
      const sidecar = await objects.upload(
        enforceSizeLimit(body, config.maxUploadBytes),
        metadata,
        privateWitness ? async (object) => s3Keys.markPrivateWitness(object.digest) : undefined,
      )
      if (!privateWitness && await s3Keys.isPrivateWitness(sidecar.digest)) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Object not found.' } })
      }
      return reply.code(201).header('cache-control', 'no-store').send(sidecar)
    } catch (error) {
      if (error instanceof QuotaExceededError) throw new HttpProblem(507, 'quota_exceeded', 'ECHOLOG storage quota is full.')
      throw error
    }
  })

  app.get('/api/v1/objects/sha256/:digest/meta', {
    schema: {
      params: { type: 'object', required: ['digest'], properties: { digest: { type: 'string', pattern: digestPattern } } },
      response: { 200: sidecarSchema, 401: errorSchema, 404: errorSchema, 503: errorSchema },
    },
  }, async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) return reply.code(auth.status).send(authFailureBody(auth.code))
    const { digest } = request.params as { digest: string }
    const object = await objects.get(`sha256/${digest}`)
    if (!object) return reply.code(404).send({ error: { code: 'not_found', message: 'Object not found.' } })
    if (await s3Keys.isPrivateWitness(digest) && !isAdmin(auth.principal)) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Object not found.' } })
    }
    return reply.header('cache-control', 'no-store').send(object.sidecar)
  })

  app.post('/api/v1/objects/sha256/:digest/private-witness', {
    schema: {
      params: { type: 'object', required: ['digest'], properties: { digest: { type: 'string', pattern: digestPattern } } },
      body: {
        type: 'object',
        required: ['objectKey'],
        properties: {
          objectKey: { type: 'string', minLength: 1, maxLength: 1024 },
          requireAlreadyMarked: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      response: { 200: sidecarSchema, 400: errorSchema, 401: errorSchema, 404: errorSchema, 503: errorSchema },
    },
  }, async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) return reply.code(auth.status).send(authFailureBody(auth.code))
    const { digest } = request.params as { digest: string }
    const { objectKey, requireAlreadyMarked } = request.body as { objectKey: string; requireAlreadyMarked?: boolean }
    const object = await objects.get(`sha256/${digest}`)
    let keyMatches = objectKey === `sha256/${digest}`
    if (!keyMatches) {
      try {
        const indexed = await s3Keys.resolveForPrivateMarker(objectKey)
        keyMatches = indexed?.digest === digest
      } catch {
        keyMatches = false
      }
    }
    if (!object || !keyMatches || (!isAdmin(auth.principal)
      && object.sidecar.uploader !== auth.principal.uploader)) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Object not found.' } })
    }
    if (requireAlreadyMarked && !await s3Keys.isPrivateWitness(digest)) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Object not found.' } })
    }
    try {
      await s3Keys.markPrivateWitness(digest)
    } catch {
      return reply.code(503).send({ error: { code: 'storage_unavailable', message: 'ECHOLOG is temporarily unavailable.' } })
    }
    return reply.code(200).header('cache-control', 'private, no-store').send(object.sidecar)
  })

  app.get('/api/v1/objects/sha256/:digest', {
    schema: {
      params: { type: 'object', required: ['digest'], properties: { digest: { type: 'string', pattern: digestPattern } } },
      querystring: { type: 'object', properties: { grant: { type: 'string', maxLength: 2048 } }, additionalProperties: false },
    },
  }, async (request, reply) => {
    const { digest } = request.params as { digest: string }
    const { grant: grantToken } = request.query as { grant?: string }
    const objectKey = `sha256/${digest}`
    if (grantToken) {
      const valid = await verifyDownloadGrant(grantSecret, grantToken, objectKey, options.now?.() ?? Date.now())
      if (!valid) return reply.code(401).send({ error: { code: 'unauthorized', message: 'A valid download grant is required.' } })
      const marker = await s3Keys.privateWitnessMarker(digest)
      const issuedAt = grantIssuedAt(grantToken)
      if (marker && (issuedAt === null || issuedAt <= Date.parse(marker.marked_at))) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Object not found.' } })
      }
      const object = await objects.get(objectKey)
      if (!object) return reply.code(404).send({ error: { code: 'not_found', message: 'Object not found.' } })
      return reply
        .header('cache-control', 'private, no-store')
        .header('content-disposition', contentDisposition(object.sidecar.filename))
        .type(object.sidecar.content_type)
        .send(object.bytes)
    }

    const auth = await authenticate(request)
    if (!auth.ok) return reply.code(auth.status).send(authFailureBody(auth.code))
    if (await s3Keys.isPrivateWitness(digest) && !isAdmin(auth.principal)) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Object not found.' } })
    }
    const object = await objects.get(objectKey)
    if (!object) return reply.code(404).send({ error: { code: 'not_found', message: 'Object not found.' } })
    const now = options.now?.() ?? Date.now()
    const grant = await createDownloadGrant(grantSecret, objectKey, now)
    const url = `/api/v1/objects/${objectKey}?grant=${encodeURIComponent(grant.token)}`
    return reply.header('cache-control', 'no-store').send({ url, expires_at: new Date(grant.expiresAt * 1000).toISOString() })
  })

  app.delete('/api/v1/objects/sha256/:digest', {
    schema: {
      params: {
        type: 'object',
        required: ['digest'],
        properties: { digest: { type: 'string', pattern: digestPattern } },
      },
      response: { 204: { type: 'null' }, 401: errorSchema, 404: errorSchema, 409: errorSchema, 503: errorSchema },
    },
  }, async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) return reply.code(auth.status).send(authFailureBody(auth.code))
    const { digest } = request.params as { digest: string }
    if (await s3Keys.isPrivateWitness(digest)) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Object not found.' } })
    }
    try {
      await objects.delete(`sha256/${digest}`)
    } catch (error) {
      if (error instanceof ObjectHeldError) {
        return reply.code(409).send({ error: { code: error.reason, message: 'Object is protected by retention policy.' } })
      }
      if (!(error instanceof Error) || !error.message.startsWith('Object key must be')) throw error
      return reply.code(404).send({ error: { code: 'not_found', message: 'Object not found.' } })
    }
    return reply.code(204).send()
  })

  app.post('/api/v1/gc', {
    schema: {
      response: {
        200: {
          type: 'object',
          required: ['deleted', 'held', 'bytes_freed'],
          properties: {
            deleted: { type: 'array', items: { type: 'string' } },
            held: {
              type: 'array',
              items: {
                type: 'object',
                required: ['object_key', 'reason'],
                properties: {
                  object_key: { type: 'string' },
                  reason: { type: 'string', enum: ['legal_hold', 'retention_active'] },
                },
              },
            },
            bytes_freed: { type: 'integer' },
          },
        },
        401: errorSchema,
        403: errorSchema,
        503: errorSchema,
      },
    },
  }, async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) return reply.code(auth.status).send(authFailureBody(auth.code))
    if (!isAdmin(auth.principal)) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Administrator access is required.' } })
    }
    return reply.header('cache-control', 'no-store').send(await objects.collect())
  })

  return {
    ensureStorageReady: async () => {
      await objects.ready()
      await s3Keys.ready()
    },
    s3Keys,
  }
}

export { DOWNLOAD_GRANT_TTL_MS }

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

function authFailureBody(code: string) {
  const message = code === 'auth_unavailable' ? 'ECHOLOG authentication is temporarily unavailable.' : 'Authentication is required.'
  return { error: { code, message } }
}

function isByteStream(value: unknown): value is AsyncIterable<Uint8Array> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function generateEphemeralGrantSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Buffer.from(bytes).toString('base64url')
}

function grantIssuedAt(token: string): number | null {
  const [payload] = token.split('.')
  if (!payload) return null
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8')
    const parts = decoded.split('\n')
    if (parts.length !== 3 || !/^sha256\/[a-f0-9]{64}$/.test(parts[0] ?? '')) return null
    const issuedAt = Number(parts[1])
    return Number.isSafeInteger(issuedAt) && issuedAt >= 0 ? issuedAt : null
  } catch {
    return null
  }
}
