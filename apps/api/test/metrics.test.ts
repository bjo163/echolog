import { test } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { metricsPlugin } from '../src/middleware/metrics.middleware.js'

void test('metrics renders valid Prometheus text with cumulative histogram buckets', async (t) => {
  const app = Fastify()
  metricsPlugin(app, { enabled: true, endpoint: '/metrics' })
  app.get('/thing/:id', async () => ({ ok: true }))
  await app.ready()
  t.after(() => app.close())

  await app.inject({ method: 'GET', url: '/thing/a' })
  await app.inject({ method: 'GET', url: '/thing/b' })

  const response = await app.inject({ method: 'GET', url: '/metrics', remoteAddress: '127.0.0.1' })
  assert.equal(response.statusCode, 200)
  assert.match(response.headers['content-type'] ?? '', /^text\/plain/)
  const body = response.body

  assert.match(body, /# HELP echolog_http_requests_total/)
  assert.match(body, /# TYPE echolog_http_requests_total counter/)
  assert.match(body, /echolog_http_requests_total\{method="GET",route="\/thing\/:id",status="200"\} 2/)
  assert.match(body, /# TYPE echolog_http_request_duration_seconds histogram/)
  assert.match(body, /echolog_http_request_duration_seconds_bucket\{[^}]*le="\+Inf"\} 2/)
  assert.match(body, /echolog_http_request_duration_seconds_sum\{[^}]*\} \d+\.\d{6}/)
  assert.match(body, /echolog_http_request_duration_seconds_count\{[^}]*\} 2/)
  assert.match(body, /# TYPE echolog_http_response_bytes_total counter/)
  assert.match(body, /echolog_http_requests_in_flight \d+/)

  // Cumulative: every finite bucket must be <= the +Inf bucket.
  const finite = [...body.matchAll(/duration_seconds_bucket\{[^}]*le="([\d.]+)"\} (\d+)/g)]
  assert.ok(finite.length > 0)
  for (const match of finite) assert.ok(Number(match[2]) <= 2)
})

void test('a metrics token replaces the loopback rule', async (t) => {
  const app = Fastify()
  metricsPlugin(app, { enabled: true, endpoint: '/metrics', token: 'scrape-token-123456' })
  await app.ready()
  t.after(() => app.close())

  const denied = await app.inject({ method: 'GET', url: '/metrics', remoteAddress: '203.0.113.5' })
  assert.equal(denied.statusCode, 404)
  assert.equal(JSON.parse(denied.body).error.code, 'not_found')

  const wrong = await app.inject({
    method: 'GET',
    url: '/metrics',
    remoteAddress: '203.0.113.5',
    headers: { authorization: 'Bearer wrong-token' },
  })
  assert.equal(wrong.statusCode, 404)

  const allowed = await app.inject({
    method: 'GET',
    url: '/metrics',
    remoteAddress: '203.0.113.5',
    headers: { authorization: 'Bearer scrape-token-123456' },
  })
  assert.equal(allowed.statusCode, 200)
})

void test('loopback alone is not enough when a token is configured', async (t) => {
  const app = Fastify()
  metricsPlugin(app, { enabled: true, endpoint: '/metrics', token: 'scrape-token-123456' })
  await app.ready()
  t.after(() => app.close())

  const response = await app.inject({ method: 'GET', url: '/metrics', remoteAddress: '127.0.0.1' })
  assert.equal(response.statusCode, 404)
})

void test('disabled metrics registers no endpoint', async (t) => {
  const app = Fastify()
  metricsPlugin(app, { enabled: false, endpoint: '/metrics' })
  await app.ready()
  t.after(() => app.close())

  const response = await app.inject({ method: 'GET', url: '/metrics', remoteAddress: '127.0.0.1' })
  assert.equal(response.statusCode, 404)
})
