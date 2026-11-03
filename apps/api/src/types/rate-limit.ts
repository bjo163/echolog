import type { FastifyRequest } from 'fastify'

export interface RateLimitConfig {
  windowMs: number
  max: number
  keyGenerator?: (request: FastifyRequest) => string
}

export interface RateLimitStore {
  consume(key: string, amount?: number): { allowed: boolean; remaining: number; resetAt: number }
}