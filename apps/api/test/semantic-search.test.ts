import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEchologServer } from '../src/server.js'
import { parseConfig } from '../src/config.js'
import { openDatabase, issueApiKey } from '../src/db.js'
import { PGliteDatabaseAdapter } from '../src/db/pglite-adapter.js'

void test('PGlite + pgvector semantic vector search & auto-indexing lifecycle', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'echolog-semantic-'))
  const config = parseConfig({
    ECHOLOG_STORAGE_ROOT: storageRoot,
    ECHOLOG_GRANT_SECRET: 'test-secret-at-least-32-chars-long!!',
  })
  const db = openDatabase(':memory:')
  const apiKey = issueApiKey(db, 'admin-tester', 'admin').token

  // Initialize PGlite in-memory adapter with pgvector
  const pgliteAdapter = new PGliteDatabaseAdapter()
  await pgliteAdapter.init()

  const app = createEchologServer(config, {
    database: db,
    pgliteAdapter,
  })

  t.after(async () => {
    await app.close()
    await pgliteAdapter.close()
    db.handle.close()
    await rm(storageRoot, { recursive: true, force: true })
  })

  // 1. Check AI stats endpoint
  const statsRes = await app.inject({
    method: 'GET',
    url: '/api/v1/search/stats',
    headers: { authorization: `Bearer ${apiKey}` },
  })
  assert.equal(statsRes.statusCode, 200)
  const stats = JSON.parse(statsRes.body)
  assert.equal(stats.vector_extension, 'active')
  assert.equal(stats.dimensions, 384)

  // 2. Upload Document A (Financial report)
  const uploadDocA = await app.inject({
    method: 'POST',
    url: '/api/v1/objects',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'text/plain',
      'x-filename': 'q3-financial-report.txt',
    },
    body: Buffer.from('Laporan keuangan kuartal 3 anggaran laba rugi dan neraca kas deviden.', 'utf8'),
  })
  assert.equal(uploadDocA.statusCode, 201)
  const docA = JSON.parse(uploadDocA.body)

  // 3. Upload Document B (Linux Kernel Documentation)
  const uploadDocB = await app.inject({
    method: 'POST',
    url: '/api/v1/objects',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'text/plain',
      'x-filename': 'linux-kernel-drivers.txt',
    },
    body: Buffer.from('Linux operating system kernel memory management interrupt handling and device drivers.', 'utf8'),
  })
  assert.equal(uploadDocB.statusCode, 201)
  const docB = JSON.parse(uploadDocB.body)

  // 4. Ingest both documents into vector database
  const ingestARes = await app.inject({
    method: 'POST',
    url: `/api/v1/search/ingest/${docA.digest}`,
    headers: { authorization: `Bearer ${apiKey}` },
  })
  assert.equal(ingestARes.statusCode, 200)

  const ingestBRes = await app.inject({
    method: 'POST',
    url: `/api/v1/search/ingest/${docB.digest}`,
    headers: { authorization: `Bearer ${apiKey}` },
  })
  assert.equal(ingestBRes.statusCode, 200)

  // 5. Query Semantic Search for "anggaran laba dan laporan kas finansial"
  const searchFinance = await app.inject({
    method: 'POST',
    url: '/api/v1/search/semantic',
    headers: { authorization: `Bearer ${apiKey}` },
    payload: {
      query: 'laporan kas anggaran finansial',
    },
  })
  assert.equal(searchFinance.statusCode, 200)
  const financeResults = JSON.parse(searchFinance.body)
  assert.ok(financeResults.results.length >= 1)
  // Top result must be Document A
  assert.equal(financeResults.results[0].digest, docA.digest)
  assert.equal(financeResults.results[0].filename, 'q3-financial-report.txt')

  // 6. Query Semantic Search for "kernel memory device drivers"
  const searchLinux = await app.inject({
    method: 'POST',
    url: '/api/v1/search/semantic',
    headers: { authorization: `Bearer ${apiKey}` },
    payload: {
      query: 'device drivers kernel memory system',
    },
  })
  assert.equal(searchLinux.statusCode, 200)
  const linuxResults = JSON.parse(searchLinux.body)
  assert.ok(linuxResults.results.length >= 1)
  // Top result must be Document B
  assert.equal(linuxResults.results[0].digest, docB.digest)
  assert.equal(linuxResults.results[0].filename, 'linux-kernel-drivers.txt')
})
