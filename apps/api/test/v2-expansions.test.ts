import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEchologServer } from '../src/server.js'
import { parseConfig } from '../src/config.js'
import { openDatabase } from '../src/db.js'
import { PGliteDatabaseAdapter } from '../src/db/pglite-adapter.js'
import { eventBus } from '../src/modules/realtime/event-bus.js'

test('OpenAI Gateway: /v1/models, /v1/embeddings, /v1/chat/completions', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'echolog-openai-'))
  const pgliteAdapter = new PGliteDatabaseAdapter()
  await pgliteAdapter.init()

  const config = parseConfig({ ECHOLOG_STORAGE_ROOT: storageRoot })
  const app = createEchologServer(config, {
    database: openDatabase(':memory:'),
    pgliteAdapter,
  })

  t.after(async () => {
    await app.close()
    await pgliteAdapter.close()
    await rm(storageRoot, { recursive: true, force: true })
  })

  // 1. GET /v1/models
  const modelsRes = await app.inject({
    method: 'GET',
    url: '/v1/models',
  })
  assert.equal(modelsRes.statusCode, 200)
  const modelsJson = JSON.parse(modelsRes.payload)
  assert.equal(modelsJson.object, 'list')
  assert.ok(modelsJson.data.some((m: any) => m.id === 'text-embedding-384'))

  // 2. POST /v1/embeddings
  const embedRes = await app.inject({
    method: 'POST',
    url: '/v1/embeddings',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({
      input: 'Autonomous cloud storage and database architecture',
      model: 'text-embedding-384',
    }),
  })
  assert.equal(embedRes.statusCode, 200)
  const embedJson = JSON.parse(embedRes.payload)
  assert.equal(embedJson.object, 'list')
  assert.equal(embedJson.data.length, 1)
  assert.equal(embedJson.data[0].embedding.length, 384)

  // 3. POST /v1/chat/completions
  const chatRes = await app.inject({
    method: 'POST',
    url: '/v1/chat/completions',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({
      messages: [{ role: 'user', content: 'What is ECHOLOG?' }],
    }),
  })
  assert.equal(chatRes.statusCode, 200)
  const chatJson = JSON.parse(chatRes.payload)
  assert.equal(chatJson.object, 'chat.completion')
  assert.ok(chatJson.choices[0].message.content.length > 0)
})

test('Real-Time CDC Event Bus & Analytics Overview', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'echolog-realtime-'))
  const config = parseConfig({ ECHOLOG_STORAGE_ROOT: storageRoot })
  const app = createEchologServer(config, {
    database: openDatabase(':memory:'),
  })

  t.after(async () => {
    await app.close()
    await rm(storageRoot, { recursive: true, force: true })
  })

  // 1. Event Bus subscription & publish
  let receivedEvent: any = null
  const unsubscribe = eventBus.subscribe('object.created', (event) => {
    receivedEvent = event
  })

  eventBus.publish('object.created', {
    digest: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    key: 'sha256/abcdef',
    filename: 'test.txt',
    contentType: 'text/plain',
    size: 42,
    timestamp: new Date().toISOString(),
  })

  assert.ok(receivedEvent !== null)
  assert.equal(receivedEvent.data.filename, 'test.txt')
  unsubscribe()

  // 2. GET /api/v1/analytics/overview
  const analyticsRes = await app.inject({
    method: 'GET',
    url: '/api/v1/analytics/overview',
  })
  assert.equal(analyticsRes.statusCode, 200)
  const analyticsJson = JSON.parse(analyticsRes.payload)
  assert.equal(analyticsJson.status, 'healthy')
  assert.ok(analyticsJson.telemetry.autonomousScrubber !== undefined)
})
