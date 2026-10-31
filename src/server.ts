import Fastify, { LogController } from 'fastify'
import type { EchologConfig } from './config.js'
import type { EchologDatabase } from './db.js'
import type { EchologServerOptions } from './modules/objects/index.js'
import { registerObjectRoutes } from './modules/objects/index.js'
import { registerSessionRoutes } from './modules/session/index.js'
import { registerS3Routes } from './modules/s3/routes.js'

export interface EchologServerConfig extends EchologServerOptions {
  database: EchologDatabase
}

export function createEchologServer(config: EchologConfig, options: EchologServerConfig) {
  const app = Fastify({
    logger: options.logger ?? false,
    // Keep Fastify's hard ceiling above the app-specific stream guard so the
    // object driver can discard its temp file on ordinary over-limit streams.
    bodyLimit: Math.min(Number.MAX_SAFE_INTEGER, config.maxUploadBytes + 64 * 1024),
    logController: new LogController({ disableRequestLogging: true }),
  })

  // The media host is only reachable over HTTPS through the proxy, and the proxy
  // answers plain HTTP with a 302 rather than a browser-pinned redirect (M44-08).
  app.addHook('onSend', (_request, reply, _payload, done) => {
    reply.header('strict-transport-security', 'max-age=15552000')
    done()
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

  const { ensureStorageReady, s3Keys } = registerObjectRoutes(app, config, options)
  registerSessionRoutes(app, config, { database: options.database, ...(options.now ? { now: options.now } : {}) })
  registerS3Routes(app, config, s3Keys, options.now)

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
