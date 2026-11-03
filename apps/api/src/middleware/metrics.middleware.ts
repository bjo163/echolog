import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export interface MetricsOptions {
  enabled: boolean
  endpoint: string
  /** Empty means the endpoint is loopback-only. */
  token?: string
}

interface Series {
  count: number
  sum: number
  buckets: number[]
  bytes: number
}

const DURATION_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function labels(values: Record<string, string>): string {
  const entries = Object.entries(values)
  if (entries.length === 0) return ''
  return `{${entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(',')}}`
}

function payloadBytes(payload: unknown): number {
  if (typeof payload === 'string') return Buffer.byteLength(payload)
  if (payload instanceof Uint8Array) return payload.byteLength
  return 0
}

function loopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

function tokenMatches(supplied: string, expected: string): boolean {
  const left = createHash('sha256').update(supplied).digest()
  const right = createHash('sha256').update(expected).digest()
  return timingSafeEqual(left, right)
}

/**
 * Fastify plugin exposing Prometheus text metrics. The histogram uses real
 * cumulative buckets, `_sum` and `_count`; labels are restricted to method,
 * matched route and status so cardinality stays bounded.
 */
export function metricsPlugin(app: FastifyInstance, options: MetricsOptions): void {
  if (!options.enabled) return

  const series = new Map<string, Series>()
  const bytesByRequest = new WeakMap<FastifyRequest, number>()
  let inFlight = 0

  const record = (request: FastifyRequest, reply: FastifyReply, bytes: number): void => {
    const method = request.method
    const route = request.routeOptions?.url ?? 'unmatched'
    const status = String(reply.statusCode)
    const key = `${method}\u0000${route}\u0000${status}`
    const durationMs = typeof reply.elapsedTime === 'number' ? reply.elapsedTime : 0
    const duration = Math.max(0, durationMs) / 1000

    let entry = series.get(key)
    if (!entry) {
      entry = { count: 0, sum: 0, buckets: DURATION_BUCKETS.map(() => 0), bytes: 0 }
      series.set(key, entry)
    }
    entry.count += 1
    entry.sum += duration
    entry.bytes += bytes
    for (let index = 0; index < DURATION_BUCKETS.length; index += 1) {
      if (duration <= DURATION_BUCKETS[index]!) entry.buckets[index] = (entry.buckets[index] ?? 0) + 1
    }
  }

  app.addHook('onRequest', async () => {
    inFlight += 1
  })

  app.addHook('onSend', async (request, _reply, payload) => {
    bytesByRequest.set(request, payloadBytes(payload))
    return payload
  })

  app.addHook('onResponse', async (request, reply: FastifyReply) => {
    inFlight = Math.max(0, inFlight - 1)
    record(request, reply, bytesByRequest.get(request) ?? 0)
  })

  const render = (): string => {
    const lines: string[] = []
    const sorted = [...series.entries()].sort(([left], [right]) => left.localeCompare(right))
    const parseLabels = (key: string): Record<string, string> => {
      const [method = '', route = '', status = ''] = key.split('\u0000')
      return { method, route, status }
    }

    lines.push('# HELP echolog_http_requests_total Total HTTP requests handled.')
    lines.push('# TYPE echolog_http_requests_total counter')
    for (const [key, entry] of sorted) {
      lines.push(`echolog_http_requests_total${labels(parseLabels(key))} ${entry.count}`)
    }

    lines.push('# HELP echolog_http_request_duration_seconds Request duration in seconds.')
    lines.push('# TYPE echolog_http_request_duration_seconds histogram')
    for (const [key, entry] of sorted) {
      const base = parseLabels(key)
      for (let index = 0; index < DURATION_BUCKETS.length; index += 1) {
        lines.push(
          `echolog_http_request_duration_seconds_bucket${labels({ ...base, le: String(DURATION_BUCKETS[index]) })} ${entry.buckets[index] ?? 0}`,
        )
      }
      lines.push(`echolog_http_request_duration_seconds_bucket${labels({ ...base, le: '+Inf' })} ${entry.count}`)
      lines.push(`echolog_http_request_duration_seconds_sum${labels(base)} ${entry.sum.toFixed(6)}`)
      lines.push(`echolog_http_request_duration_seconds_count${labels(base)} ${entry.count}`)
    }

    lines.push('# HELP echolog_http_response_bytes_total Response payload bytes.')
    lines.push('# TYPE echolog_http_response_bytes_total counter')
    for (const [key, entry] of sorted) {
      lines.push(`echolog_http_response_bytes_total${labels(parseLabels(key))} ${entry.bytes}`)
    }

    lines.push('# HELP echolog_http_requests_in_flight Requests currently being handled.')
    lines.push('# TYPE echolog_http_requests_in_flight gauge')
    lines.push(`echolog_http_requests_in_flight ${inFlight}`)

    return `${lines.join('\n')}\n`
  }

  app.get(options.endpoint, async (request, reply) => {
    const token = options.token ?? ''
    const authorization = request.headers.authorization
    const supplied = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    const allowed = token.length > 0 ? tokenMatches(supplied, token) : loopback(request.ip)
    if (!allowed) {
      return reply.code(404).header('cache-control', 'no-store').send({
        error: { code: 'not_found', message: 'Not found.' },
      })
    }
    return reply
      .header('cache-control', 'no-store')
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(render())
  })
}
