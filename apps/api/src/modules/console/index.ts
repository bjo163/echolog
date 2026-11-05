/**
 * Runtime facts for the operator console.
 *
 * The console must answer questions only the server can answer honestly: which
 * identity mode is in force, which environment the instance runs in, what the
 * real upload and quota limits are, and which capabilities exist at all.
 * Guessing any of those from a display name is exactly the inference the D19
 * boundary forbids.
 *
 * Everything here is non-secret by construction. Secrets, database and storage
 * paths, the service key, the grant-signing secret and the S3 credential pair
 * are deliberately absent.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { EchologConfig } from '../../config.js'
import type { EchologDatabase } from '../../db.js'
import { createEchologAuthenticator } from '../../auth.js'

export type CapabilityMaturity = 'available' | 'experimental' | 'unavailable'

export interface ConsoleRuntimeFacts {
  product: 'ECHOLOG'
  domain: 'D19'
  version: string
  environment: 'development' | 'test' | 'production'
  identity_mode: 'standalone' | 'arsy_federated'
  identity_authority: 'local-echolog' | 'arsy-d00'
  storage: {
    backend: 'filesystem'
    quota_bytes: number
    max_upload_bytes: number
    allowed_mime_types: string[]
  }
  session_ttl_hours: number
  metrics_enabled: boolean
  features: Record<string, CapabilityMaturity>
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

/**
 * The version is read from the manifest that ships with this module. The lookup
 * walks up because the module sits at a different depth in `src/` and in
 * `dist/`, and an unreadable manifest must never take the service down.
 */
function readPackageVersion(): string {
  let directory = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 6; depth += 1) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { name?: string; version?: string }
      if (manifest.name === '@echolog/api' && typeof manifest.version === 'string') return manifest.version
    } catch {
      // Keep walking; an unreadable manifest is not fatal for the console.
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return 'unknown'
}

export interface ConsoleRouteOptions {
  database: EchologDatabase
  /** Capabilities this instance actually registered, not the whole roadmap. */
  features: Record<string, CapabilityMaturity>
  now?: () => number
  fetcher?: typeof fetch
}

export function registerConsoleRoutes(app: FastifyInstance, config: EchologConfig, options: ConsoleRouteOptions): void {
  const authenticate = createEchologAuthenticator({
    database: options.database,
    serviceKey: config.serviceKey,
    arsyUrl: config.arsyUrl,
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    ...(options.now ? { now: options.now } : {}),
  })

  app.get('/api/v1/console/runtime', {
    schema: {
      response: {
        200: {
          type: 'object',
          required: [
            'product', 'domain', 'version', 'environment', 'identity_mode', 'identity_authority',
            'storage', 'session_ttl_hours', 'metrics_enabled', 'features',
          ],
          properties: {
            product: { type: 'string' },
            domain: { type: 'string' },
            version: { type: 'string' },
            environment: { type: 'string' },
            identity_mode: { type: 'string' },
            identity_authority: { type: 'string' },
            storage: {
              type: 'object',
              required: ['backend', 'quota_bytes', 'max_upload_bytes', 'allowed_mime_types'],
              properties: {
                backend: { type: 'string' },
                quota_bytes: { type: 'integer' },
                max_upload_bytes: { type: 'integer' },
                allowed_mime_types: { type: 'array', items: { type: 'string' } },
              },
            },
            session_ttl_hours: { type: 'integer' },
            metrics_enabled: { type: 'boolean' },
            features: { type: 'object', additionalProperties: { type: 'string' } },
          },
        },
        401: errorSchema,
        503: errorSchema,
      },
    },
  }, async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) {
      return reply.code(auth.status).send({
        error: {
          code: auth.code,
          message: auth.code === 'auth_unavailable'
            ? 'The identity store is unavailable.'
            : 'Authentication is required.',
        },
      })
    }
    const federated = config.arsyUrl.length > 0
    const facts: ConsoleRuntimeFacts = {
      product: 'ECHOLOG',
      domain: 'D19',
      version: readPackageVersion(),
      environment: config.nodeEnv,
      identity_mode: federated ? 'arsy_federated' : 'standalone',
      identity_authority: federated ? 'arsy-d00' : 'local-echolog',
      storage: {
        backend: 'filesystem',
        quota_bytes: config.storageQuotaBytes,
        max_upload_bytes: config.maxUploadBytes,
        allowed_mime_types: [...config.allowedMimeTypes],
      },
      session_ttl_hours: config.sessionTtlHours,
      metrics_enabled: config.metrics.enabled,
      features: { ...options.features },
    }
    return reply.header('cache-control', 'no-store').send(facts)
  })
}
