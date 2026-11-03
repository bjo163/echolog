import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { eventBus, type EchologBroadcastEvent } from './event-bus.js'

export function registerRealtimeRoutes(app: FastifyInstance): void {
  /**
   * Server-Sent Events (SSE) CDC stream.
   * Clients connect to this endpoint to receive live real-time updates of
   * object mutations, AI indexing progress, security honeypot alarms, etc.
   */
  app.get(
    '/api/v1/realtime/stream',
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
      reply.raw.setHeader('Connection', 'keep-alive')
      reply.raw.setHeader('X-Accel-Buffering', 'no')
      reply.raw.flushHeaders()

      // Send initial connection handshake
      reply.raw.write(
        `event: connected\ndata: ${JSON.stringify({
          message: 'ECHOLOG Realtime SSE Gateway Connected',
          timestamp: new Date().toISOString(),
        })}\n\n`,
      )

      // Forward events from the in-process event bus
      const unsubscribe = eventBus.subscribeAll((event: EchologBroadcastEvent) => {
        try {
          reply.raw.write(
            `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
          )
        } catch {
          // Client disconnected
        }
      })

      // Keepalive ping every 15 seconds to prevent proxy timeouts
      const keepAliveTimer = setInterval(() => {
        try {
          reply.raw.write(': keepalive\n\n')
        } catch {
          clearInterval(keepAliveTimer)
        }
      }, 15_000)

      request.raw.on('close', () => {
        clearInterval(keepAliveTimer)
        unsubscribe()
      })

      // Keep the response stream open indefinitely
      await new Promise<void>((resolve) => {
        request.raw.on('close', resolve)
        request.raw.on('end', resolve)
      })
    },
  )

  /**
   * Endpoint to publish an event or test broadcast (useful for webhooks or testing).
   */
  app.post(
    '/api/v1/realtime/broadcast',
    async (
      request: FastifyRequest<{
        Body: {
          type: string
          data: any
        }
      }>,
      reply: FastifyReply,
    ) => {
      const { type, data } = request.body || {}
      if (!type || !data) {
        return reply.status(400).send({ error: 'type and data are required' })
      }

      const published = eventBus.publish(type as any, data)
      return reply.send({ success: true, event: published })
    },
  )
}
