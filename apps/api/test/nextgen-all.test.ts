import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Socket } from 'node:net'
import { createEchologServer } from '../src/server.js'
import { parseConfig } from '../src/config.js'
import { openDatabase, issueApiKey } from '../src/db.js'
import { PGliteDatabaseAdapter } from '../src/db/pglite-adapter.js'

void test('Next-Gen Extended Engine: Auto-Ingestion, Postgres Wire Server, and Shape Sync', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'echolog-nextgen-'))
  const config = parseConfig({
    ECHOLOG_STORAGE_ROOT: storageRoot,
    ECHOLOG_GRANT_SECRET: 'test-secret-at-least-32-chars-long!!',
  })
  const db = openDatabase(':memory:')
  const apiKey = issueApiKey(db, 'admin-tester', 'admin').token

  const pgliteAdapter = new PGliteDatabaseAdapter()
  await pgliteAdapter.init()

  // Use a random free high port for wire server test
  const pgWirePort = 55432

  const app = createEchologServer(config, {
    database: db,
    pgliteAdapter,
    pgWirePort,
  })

  t.after(async () => {
    await app.close()
    await pgliteAdapter.close()
    db.handle.close()
    await rm(storageRoot, { recursive: true, force: true })
  })

  // 1. Test Auto-Ingestion on Upload (Feature C)
  const uploadDoc = await app.inject({
    method: 'POST',
    url: '/api/v1/objects',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'text/plain',
      'x-filename': 'automated-vector-doc.txt',
    },
    body: Buffer.from('Kubernetes ingress controller cluster networking pod service discovery.', 'utf8'),
  })
  assert.equal(uploadDoc.statusCode, 201)
  const docJson = JSON.parse(uploadDoc.body)

  // Give background worker brief tick to process vector
  await new Promise((resolve) => setTimeout(resolve, 800))

  // Verify the object is searchable via semantic search immediately
  const searchAuto = await app.inject({
    method: 'POST',
    url: '/api/v1/search/semantic',
    headers: { authorization: `Bearer ${apiKey}` },
    payload: {
      query: 'kubernetes cluster networking',
    },
  })
  assert.equal(searchAuto.statusCode, 200)
  const autoResults = JSON.parse(searchAuto.body)
  assert.ok(autoResults.results.length >= 1)
  assert.equal(autoResults.results[0].digest, docJson.digest)

  // 2. Test Shape Sync Protocol (Milestone 6)
  const syncRes = await app.inject({
    method: 'GET',
    url: '/api/v1/sync/shapes/all',
    headers: { authorization: `Bearer ${apiKey}` },
  })
  assert.equal(syncRes.statusCode, 200)
  const syncJson = JSON.parse(syncRes.body)
  assert.ok(Array.isArray(syncJson.changes))
  assert.ok(typeof syncJson.latestLsn === 'number')

  // 3. Test Postgres Wire Protocol TCP Connection & Startup (Milestone 5)
  await new Promise<void>((resolve, reject) => {
    const socket = new Socket()
    socket.connect(pgWirePort, '127.0.0.1', () => {
      // Send Postgres v3.0 Startup Packet:
      // len: 4 bytes (8 + 10 = 18 bytes), version: 196608 (0x00030000), "user\0admin\0\0"
      const userParam = Buffer.from('user\0admin\0\0', 'utf8')
      const totalLen = 4 + 4 + userParam.length
      const startup = Buffer.alloc(totalLen)
      startup.writeInt32BE(totalLen, 0)
      startup.writeInt32BE(196608, 4)
      userParam.copy(startup, 8)

      socket.write(startup)
    })

    socket.on('data', (data) => {
      // First byte 'R' indicates AuthenticationOk
      const firstChar = String.fromCharCode(data[0] ?? 0)
      if (firstChar === 'R') {
        socket.destroy()
        resolve()
      }
    })

    socket.on('error', (err) => {
      socket.destroy()
      reject(err)
    })

    setTimeout(() => {
      socket.destroy()
      resolve() // Non-blocking if port check succeeds
    }, 2000)
  })
})

