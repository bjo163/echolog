import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseConfig } from '../src/config.js'
import { createUser, issueApiKey, openDatabase } from '../src/db.js'
import { createEchologServer } from '../src/server.js'

void test('experimental realtime, analytics and OpenAI-compatible routes enforce authentication', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'echolog-experimental-auth-'))
  const database = openDatabase(':memory:')
  createUser(database, { login: 'admin', password: 'test-only-password', role: 'admin' })
  createUser(database, { login: 'member', password: 'test-only-password', role: 'member' })
  const admin = issueApiKey(database, 'test admin', 'admin')
  const member = issueApiKey(database, 'test member', 'member')
  const app = createEchologServer(parseConfig({ ECHOLOG_STORAGE_ROOT: storageRoot }), { database })

  t.after(async () => {
    await app.close()
    database.handle.close()
    await rm(storageRoot, { recursive: true, force: true })
  })

  const anonymousRequests = [
    { method: 'GET', url: '/api/v1/realtime/stream' },
    { method: 'POST', url: '/api/v1/realtime/broadcast', payload: { type: 'probe', data: { safe: true } } },
    { method: 'GET', url: '/api/v1/analytics/overview' },
    { method: 'POST', url: '/api/v1/analytics/scrub', payload: {} },
    { method: 'GET', url: '/v1/models' },
    { method: 'GET', url: '/api/v1/models' },
    { method: 'POST', url: '/v1/embeddings', payload: { input: 'probe' } },
    { method: 'POST', url: '/api/v1/embeddings', payload: { input: 'probe' } },
    { method: 'POST', url: '/v1/chat/completions', payload: { messages: [{ role: 'user', content: 'probe' }] } },
    { method: 'POST', url: '/api/v1/chat/completions', payload: { messages: [{ role: 'user', content: 'probe' }] } },
  ] as const

  for (const request of anonymousRequests) {
    const response = await app.inject(request)
    assert.equal(response.statusCode, 401, `anonymous ${request.method} ${request.url} must be rejected`)
  }

  const memberHeaders = { authorization: `Bearer ${member.token}` }
  for (const request of [
    { method: 'GET', url: '/api/v1/analytics/overview' },
    { method: 'POST', url: '/api/v1/analytics/scrub', payload: {} },
    { method: 'POST', url: '/api/v1/realtime/broadcast', payload: { type: 'probe', data: { safe: true } } },
  ] as const) {
    const response = await app.inject({ ...request, headers: memberHeaders })
    assert.equal(response.statusCode, 403, `member ${request.method} ${request.url} must be denied`)
  }

  const adminHeaders = { authorization: `Bearer ${admin.token}` }
  assert.equal((await app.inject({ method: 'GET', url: '/v1/models', headers: adminHeaders })).statusCode, 200)
  assert.equal((await app.inject({ method: 'POST', url: '/v1/embeddings', headers: adminHeaders, payload: { input: ['hello', 'world'] } })).statusCode, 200)
  assert.equal((await app.inject({ method: 'POST', url: '/v1/chat/completions', headers: adminHeaders, payload: { messages: [{ role: 'user', content: 'hello' }] } })).statusCode, 200)
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/analytics/overview', headers: adminHeaders })).statusCode, 200)
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/realtime/broadcast', headers: adminHeaders, payload: { type: 'probe', data: { safe: true } } })).statusCode, 200)

  const tooManyInputs = await app.inject({ method: 'POST', url: '/v1/embeddings', headers: adminHeaders, payload: { input: Array.from({ length: 33 }, () => 'x') } })
  assert.equal(tooManyInputs.statusCode, 413)
  const tooManyMessages = await app.inject({ method: 'POST', url: '/v1/chat/completions', headers: adminHeaders, payload: { messages: Array.from({ length: 65 }, () => ({ role: 'user', content: 'x' })) } })
  assert.equal(tooManyMessages.statusCode, 413)
})
