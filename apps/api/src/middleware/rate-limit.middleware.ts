import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export interface RateLimitOptions {
  windowMs: number
  max: number
  /** Paths that are never rate limited (health probes, metrics scrapes). */
  exemptPaths?: readonly string[]
  /** Upper bound for distinct buckets kept in memory. */
  maxEntries?: number
}

interface Bucket {
  count: number
  resetAt: number
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

/**
 * Bucket by the credential when one is present, plus the peer address. Hashing
 * keeps raw keys and cookies out of the in-memory store.
 */
export function rateLimitKey(request: FastifyRequest): string {
  const serviceKey = request.headers['x-echolog-key']
  const authorization = request.headers.authorization
  let identity: string | undefined

  if (typeof serviceKey === 'string' && serviceKey.length > 0) {
    identity = `service:${digest(serviceKey)}`
  } else if (typeof authorization === 'string' && authorization.length > 0) {
    identity = `auth:${digest(authorization)}`
  } else if (typeof request.headers.cookie === 'string') {
    const match = /(?:^|;\s*)echolog_session=([^;]+)/.exec(request.headers.cookie)
    if (match?.[1]) identity = `session:${digest(decodeURIComponent(match[1]))}`
  }

  const peer = request.ip || 'unknown'
  return identity ? `${identity}|${peer}` : `ip:${peer}`
}

/**
 * Fixed-window limiter. The window is per bucket and the store is pruned on a
 * schedule plus hard-capped, so a stream of unique credentials cannot turn it
 * into an unbounded leak.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const store = new Map<string, Bucket>()
  const exemptPaths = options.exemptPaths ?? []
  const maxEntries = options.maxEntries ?? 10_000
  let nextSweep = 0

  const isExempt = (url: string): boolean => {
    const path = url.split('?', 1)[0] ?? url
    return exemptPaths.some((exempt) => path === exempt || (exempt.endsWith('*') && path.startsWith(exempt.slice(0, -1))))
  }

  const sweep = (now: number): void => {
    if (now < nextSweep) return
    nextSweep = now + options.windowMs
    for (const [key, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(key)
    }
    while (store.size > maxEntries) {
      const oldest = store.keys().next().value
      if (oldest === undefined) break
      store.delete(oldest)
    }
  }

  return async function rateLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (isExempt(request.url)) return

    const now = Date.now()
    sweep(now)

    const key = rateLimitKey(request)
    let bucket = store.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs }
      store.set(key, bucket)
    }
    bucket.count += 1

    const remaining = Math.max(0, options.max - bucket.count)
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    reply.header('ratelimit-limit', String(options.max))
    reply.header('ratelimit-remaining', String(remaining))
    reply.header('ratelimit-reset', String(resetSeconds))
    reply.header('x-ratelimit-limit', String(options.max))
    reply.header('x-ratelimit-remaining', String(remaining))
    reply.header('x-ratelimit-reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > options.max) {
      reply.header('retry-after', String(resetSeconds))
      reply.code(429).send({
        error: {
          code: 'rate_limited',
          message: `Rate limit exceeded: ${options.max} requests per ${Math.round(options.windowMs / 1000)} seconds.`,
        },
      })
    }
  }
}

export function registerRateLimiter(app: FastifyInstance, options: RateLimitOptions): void {
  app.addHook('preHandler', createRateLimiter(options))
}
