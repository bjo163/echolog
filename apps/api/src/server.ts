import Fastify, { LogController } from 'fastify'
import type { EchologConfig } from './config.js'
import type { EchologDatabase } from './db.js'
import type { EchologServerOptions } from './modules/objects/index.js'
import { registerObjectRoutes } from './modules/objects/index.js'
import { registerSessionRoutes } from './modules/session/index.js'
import { registerAdminRoutes } from './modules/admin/index.js'
import { registerS3Routes } from './modules/s3/routes.js'
import { registerOciRoutes } from './modules/oci/routes.js'
import { registerToolsRoutes } from './modules/tools/index.js'
import { registerSemanticSearchRoutes } from './modules/ai/routes.js'
import { BackgroundVectorIngestor } from './modules/ai/worker.js'
import { ShapeSyncManager, registerShapeSyncRoutes } from './modules/sync/shape-stream.js'
import { BranchManager, registerBranchRoutes } from './modules/branch/index.js'
import { HoneypotManager, registerHoneypotRoutes } from './modules/security/honeypot.js'
import { registerRealtimeRoutes } from './modules/realtime/routes.js'
import { registerOpenAiRoutes } from './modules/openai/routes.js'
import { AutonomousBitScrubber } from './modules/scrubber/worker.js'
import { registerAnalyticsRoutes } from './modules/analytics/routes.js'
import { PGliteDatabaseAdapter } from './db/pglite-adapter.js'
import { metricsPlugin } from './middleware/metrics.middleware.js'
import { requestIdPlugin } from './middleware/request-id.middleware.js'
import { registerRateLimiter } from './middleware/rate-limit.middleware.js'

export interface EchologServerConfig extends EchologServerOptions {
  database: EchologDatabase
  pgliteAdapter?: PGliteDatabaseAdapter
  pgWirePort?: number
}

export function createEchologServer(config: EchologConfig, options: EchologServerConfig) {
  if (options.pgWirePort !== undefined) {
    throw new Error('ECHOLOG Postgres wire gateway is disabled: the experimental protocol handler does not implement client authentication or TLS.')
  }

  const app = Fastify({
    logger: options.logger ?? false,
    // Keep Fastify's hard ceiling above the app-specific stream guard so the
    // object driver can discard its temp file on ordinary over-limit streams.
    bodyLimit: Math.min(Number.MAX_SAFE_INTEGER, config.maxUploadBytes + 64 * 1024),
    logController: new LogController({ disableRequestLogging: true }),
    exposeHeadRoutes: false,
    trustProxy: config.trustProxy,
  })

  // The media host is only reachable over HTTPS through the proxy, and the proxy
  // answers plain HTTP with a 302 rather than a browser-pinned redirect (M44-08).
  app.addHook('onSend', (_request, reply, _payload, done) => {
    reply.header('strict-transport-security', 'max-age=15552000')
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'strict-origin-when-cross-origin')
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()')
    reply.header('cross-origin-resource-policy', 'same-origin')
    done()
  })

  // Hook order matters: Fastify copies the hook chain into each route when the
  // route is registered, so request id, rate limiting and metrics must all be
  // installed before any module registers a handler.
  requestIdPlugin(app)
  registerRateLimiter(app, {
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    exemptPaths: [
      '/health',
      '/health/ready',
      ...(config.metrics.enabled ? [config.metrics.endpoint] : []),
    ],
  })
  metricsPlugin(app, {
    enabled: config.metrics.enabled,
    endpoint: config.metrics.endpoint,
    token: config.metrics.token,
  })

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 500
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'storage_error'
    const message = (statusCode >= 400 && statusCode < 500 || code === 'quota_exceeded') && error instanceof Error
      ? error.message
      : 'Object operation failed.'
    return reply.code(statusCode).send({ error: { code, message } })
  })

  const ingestWorker = new BackgroundVectorIngestor(
    // Will be attached after registerObjectRoutes
    null as any,
    options.pgliteAdapter
  )

  const branchManager = new BranchManager()
  const honeypotManager = new HoneypotManager()

  const { ensureStorageReady, s3Keys, driver, access } = registerObjectRoutes(app, config, {
    ...options,
    onObjectCommitted: (digest) => {
      ingestWorker.enqueue(digest)
      if (options.onObjectCommitted) options.onObjectCommitted(digest)
    },
    onObjectAccessed: (digest, actor, ip) => {
      void honeypotManager.triggerCanary(digest, options.database, actor, ip)
      if (options.onObjectAccessed) options.onObjectAccessed(digest, actor, ip)
    },
  })
  ;(ingestWorker as any).driver = driver
  registerSessionRoutes(app, config, {
    database: options.database,
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    ...(options.now ? { now: options.now } : {}),
  })
  registerAdminRoutes(app, {
    database: options.database,
    serviceKey: config.serviceKey,
    arsyUrl: config.arsyUrl,
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    ...(options.now ? { now: options.now } : {}),
  })
  registerS3Routes(app, config, s3Keys, options.now)
  registerOciRoutes(app, config, {
    driver,
    database: options.database,
    access,
    ...(options.now ? { now: options.now } : {}),
  })
  registerToolsRoutes(app, config, {
    driver,
    database: options.database,
    access,
    ...(options.now ? { now: options.now } : {}),
  })
  registerSemanticSearchRoutes(app, config, {
    driver,
    database: options.database,
    pgliteAdapter: options.pgliteAdapter,
  })

  // Local-First Shape Sync
  if (options.pgliteAdapter) {
    const shapeSync = new ShapeSyncManager(options.pgliteAdapter)
    registerShapeSyncRoutes(app, shapeSync, options.database)
  }

  // Zero-Copy Bucket Branching & Time-Travel
  registerBranchRoutes(app, branchManager, options.database, options.pgliteAdapter)

  // Autonomous Honeypot Canary Engine
  registerHoneypotRoutes(app, honeypotManager, options.database)

  // Real-Time CDC Server-Sent Events (SSE)
  registerRealtimeRoutes(app, { database: options.database, serviceKey: config.serviceKey, arsyUrl: config.arsyUrl, ...(options.fetcher ? { fetcher: options.fetcher } : {}), ...(options.now ? { now: options.now } : {}) })

  // OpenAI-Compatible Local AI Gateway (/v1/models, /v1/embeddings, /v1/chat/completions)
  registerOpenAiRoutes(app, { database: options.database, serviceKey: config.serviceKey, arsyUrl: config.arsyUrl, pgliteAdapter: options.pgliteAdapter, ...(options.fetcher ? { fetcher: options.fetcher } : {}), ...(options.now ? { now: options.now } : {}) })

  // Autonomous Bit-Scrubber & Self-Healing Engine
  const scrubber = new AutonomousBitScrubber(driver, config.storageRoot)

  // Columnar Analytical OLAP Layer & Telemetry
  registerAnalyticsRoutes(app, { database: options.database, serviceKey: config.serviceKey, arsyUrl: config.arsyUrl, scrubber, ...(options.fetcher ? { fetcher: options.fetcher } : {}), ...(options.now ? { now: options.now } : {}) })

  app.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          required: ['status', 'app', 'port'],
          properties: { status: { type: 'string' }, app: { type: 'string' }, port: { type: 'integer' } },
        },
      },
    },
  }, async () => ({
    status: 'ok',
    app: 'echolog',
    port: config.port,
  }))

  app.get('/health/ready', {
    schema: {
      response: {
        200: {
          type: 'object',
          required: ['status', 'app', 'storage'],
          properties: { status: { type: 'string' }, app: { type: 'string' }, storage: { type: 'string' } },
        },
        503: {
          type: 'object',
          required: ['status', 'app', 'reason'],
          properties: { status: { type: 'string' }, app: { type: 'string' }, reason: { type: 'string' } },
        },
      },
    },
  }, async (_request, reply) => {
    try {
      await ensureStorageReady()
      return reply.code(200).send({ status: 'ready', app: 'echolog', storage: 'fs' })
    } catch {
      return reply.code(503).send({ status: 'not_ready', app: 'echolog', reason: 'storage unavailable' })
    }
  })

  return app
}
