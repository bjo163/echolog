import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

/**
 * Echo a caller-supplied request id when it is safe, otherwise mint a UUID.
 * The id is attached to `request.id` (so Fastify logs and handlers share it)
 * and returned as `x-request-id`.
 */
export function requestIdPlugin(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    const supplied = request.headers['x-request-id']
    request.id = typeof supplied === 'string' && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID()
  })

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id)
    return payload
  })
}
