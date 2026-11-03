import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEchologServer } from '../src/server.js'
import { parseConfig } from '../src/config.js'
import { openDatabase, issueApiKey } from '../src/db.js'
import { PGliteDatabaseAdapter } from '../src/db/pglite-adapter.js'
import { Echolog } from '@echolog/sdk'

void test('Official @echolog/sdk end-to-end integration', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'echolog-sdk-'))
  const config = parseConfig({
    ECHOLOG_STORAGE_ROOT: storageRoot,
    ECHOLOG_GRANT_SECRET: 'test-secret-at-least-32-chars-long!!',
  })
  const db = openDatabase(':memory:')
  const apiKey = issueApiKey(db, 'sdk-tester', 'admin').token

  const pgliteAdapter = new PGliteDatabaseAdapter()
  await pgliteAdapter.init()

  const app = createEchologServer(config, {
    database: db,
    pgliteAdapter,
  })

  // Start fastify listening on localhost ephemeral port
  const address = await app.listen({ port: 0, host: '127.0.0.1' })

  t.after(async () => {
    await app.close()
    await pgliteAdapter.close()
    db.handle.close()
    await rm(storageRoot, { recursive: true, force: true })
  })

  // Initialize official Echolog SDK instance
  const client = new Echolog({
    endpoint: address,
    apiKey,
  })

  // 1. Upload file via SDK
  const uploaded = await client.storage.upload(
    'sdk-test-doc.txt',
    'SDK autonomous embedding content document for AI semantic search test.',
    'text/plain'
  )
  assert.ok(uploaded.digest)
  assert.equal(uploaded.filename, 'sdk-test-doc.txt')

  // Wait 600ms for background auto-ingestion
  await new Promise((resolve) => setTimeout(resolve, 600))

  // 2. Query AI Semantic Search via SDK
  const searchRes = await client.ai.search('embedding semantic search')
  assert.ok(searchRes.results.length >= 1)
  assert.equal(searchRes.results[0].filename, 'sdk-test-doc.txt')

  // 3. Test Zero-Copy Bucket Branching via SDK
  const branch = await client.branches.create({ name: 'sdk-feature-branch' })
  assert.equal(branch.name, 'sdk-feature-branch')

  const branches = await client.branches.list()
  assert.ok(branches.some((b: any) => b.name === 'sdk-feature-branch'))

  // 4. Test Honeypot Canary via SDK
  const canary = await client.security.createCanary({
    name: 'SDK Trap',
    fakeFilename: 'sdk_secret_key.env',
    digest: uploaded.digest,
    quarantineAction: 'alert_only',
  })
  assert.equal(canary.fake_filename, 'sdk_secret_key.env')

  // 5. Test Tools Pastebin via SDK
  const paste = await client.tools.createPaste({
    content: 'hello from echolog sdk pastebin!',
    title: 'sdk-paste',
  })
  assert.ok(paste.slug)
})
