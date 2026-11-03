import { test } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { registerRateLimiter } from '../src/middleware/rate-limit.middleware.js'

async function buildApp(options: { windowMs?: number; max: number; exemptPaths?: string[]; extraRoutes?: string[] }) {
  const app = Fastify()
  registerRateLimiter(app, {
    windowMs: options.windowMs ?? 60_000,
    max: options.max,
    ...(options.exemptPaths ? { exemptPaths: options.exemptPaths } : {}),
  })
  app.get('/limited', async () => ({ ok: true }))
  app.get('/health', async () => ({ ok: true }))
  for (const route of options.extraRoutes ?? []) {
    app.get(route, async () => ({ ok: true }))
  }
  await app.ready()
  return app
}

void test('allows max requests then refuses the next with 429 and Retry-After', async (t) => {
  const app = await buildApp({ max: 3 })
  t.after(() => app.close())

  for (let index = 0; index < 3; index += 1) {
    const response = await app.inject({ method: 'GET', url: '/limited', remoteAddress: '203.0.113.7' })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['ratelimit-limit'], '3')
    assert.equal(response.headers['ratelimit-remaining'], String(2 - index))
  }

  const refused = await app.inject({ method: 'GET', url: '/limited', remoteAddress: '203.0.113.7' })
  assert.equal(refused.statusCode, 429)
  assert.equal(refused.headers['retry-after'], '60')
  assert.equal(refused.headers['ratelimit-remaining'], '0')
  assert.equal(JSON.parse(refused.body).error.code, 'rate_limited')
})

void test('buckets are independent per peer address', async (t) => {
  const app = await buildApp({ max: 1 })
  t.after(() => app.close())

  assert.equal((await app.inject({ method: 'GET', url: '/limited', remoteAddress: '203.0.113.1' })).statusCode, 200)
  assert.equal((await app.inject({ method: 'GET', url: '/limited', remoteAddress: '203.0.113.1' })).statusCode, 429)
  assert.equal((await app.inject({ method: 'GET', url: '/limited', remoteAddress: '203.0.113.2' })).statusCode, 200)
})

void test('a credential gets its own bucket instead of sharing the peer bucket', async (t) => {
  const app = await buildApp({ max: 1 })
  t.after(() => app.close())

  const first = await app.inject({
    method: 'GET',
    url: '/limited',
    remoteAddress: '203.0.113.9',
    headers: { authorization: 'Bearer key-one' },
  })
  assert.equal(first.statusCode, 200)

  const second = await app.inject({
    method: 'GET',
    url: '/limited',
    remoteAddress: '203.0.113.9',
    headers: { authorization: 'Bearer key-two' },
  })
  assert.equal(second.statusCode, 200)
})

void test('exempt paths never return 429', async (t) => {
  const app = await buildApp({ max: 1, exemptPaths: ['/health', '/metrics*'], extraRoutes: ['/metrics'] })
  t.after(() => app.close())

  for (let index = 0; index < 25; index += 1) {
    const response = await app.inject({ method: 'GET', url: '/health', remoteAddress: '198.51.100.4' })
    assert.equal(response.statusCode, 200)
  }
  for (let index = 0; index < 5; index += 1) {
    const response = await app.inject({ method: 'GET', url: '/metrics?x=1', remoteAddress: '198.51.100.4' })
    assert.equal(response.statusCode, 200)
  }

  // The same peer is still limited on a non-exempt route.
  assert.equal((await app.inject({ method: 'GET', url: '/limited', remoteAddress: '198.51.100.4' })).statusCode, 200)
  assert.equal((await app.inject({ method: 'GET', url: '/limited', remoteAddress: '198.51.100.4' })).statusCode, 429)
})

void test('the window resets after it elapses', async (t) => {
  const app = await buildApp({ max: 1, windowMs: 1_000 })
  t.after(() => app.close())

  assert.equal((await app.inject({ method: 'GET', url: '/limited', remoteAddress: '198.51.100.8' })).statusCode, 200)
  assert.equal((await app.inject({ method: 'GET', url: '/limited', remoteAddress: '198.51.100.8' })).statusCode, 429)

  await new Promise((resolve) => setTimeout(resolve, 1_050))
  assert.equal((await app.inject({ method: 'GET', url: '/limited', remoteAddress: '198.51.100.8' })).statusCode, 200)
})
