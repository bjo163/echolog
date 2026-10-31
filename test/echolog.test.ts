import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { sha256Hex } from '../src/core/index.js'
import { parseConfig } from '../src/config.js'
import { createUser, issueApiKey, openDatabase, type EchologDatabase } from '../src/db.js'
import { createEchologServer } from '../src/server.js'

/** A fresh in-memory identity store per test; the service owns its own auth. */
function openTestDatabase(): EchologDatabase {
  const database = openDatabase(':memory:')
  createUser(database, { login: 'admin', password: 'test-only-password', role: 'admin' })
  return database
}

async function getAvailablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  return address.port
}

void test('every ECHOLOG response pins HTTPS with HSTS', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'echolog-hsts-'))
  const app = createEchologServer(parseConfig({ ECHOLOG_STORAGE_ROOT: storageRoot }), { database: openTestDatabase() })
  t.after(async () => {
    await app.close()
    await rm(storageRoot, { recursive: true, force: true })
  })

  const healthy = await app.inject({ method: 'GET', url: '/health' })
  assert.equal(healthy.headers['strict-transport-security'], 'max-age=15552000')
  const missing = await app.inject({ method: 'GET', url: '/no-such-route' })
  assert.equal(missing.headers['strict-transport-security'], 'max-age=15552000')
})

void test('ECHOLOG boots on an explicit port and exposes only honest health surfaces', async (t) => {
  const port = await getAvailablePort()
  const storageRoot = await mkdtemp(join(tmpdir(), 'echolog-health-'))
  const config = parseConfig({ ECHOLOG_STORAGE_ROOT: storageRoot }, ['--port', String(port)])
  const app = createEchologServer(config, { database: openTestDatabase() })
  t.after(async () => {
    await app.close()
    await rm(storageRoot, { recursive: true, force: true })
  })

  const address = await app.listen({ host: config.host, port: config.port })
  const health = await fetch(`${address}/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok', app: 'echolog', port })

  const ready = await fetch(`${address}/health/ready`)
  assert.equal(ready.status, 200)
  assert.deepEqual(await ready.json(), {
    status: 'ready',
    app: 'echolog',
    storage: 'fs',
  })

  assert.ok(app.printRoutes().includes('api/v1/') && app.printRoutes().includes('objects (POST)'))
})

void test('ECHOLOG config rejects an invalid port with a readable message', () => {
  assert.throws(
    () => parseConfig({ ECHOLOG_PORT: '70000' }),
    /Invalid ECHOLOG configuration: port: Too big: expected number to be <=65535/,
  )
  assert.throws(
    () => parseConfig({}, ['--port', 'not-a-port']),
    /Invalid ECHOLOG configuration: port:/,
  )
})

void test('ECHOLOG readiness fails when the configured storage root is not a directory', async (t) => {
  const port = await getAvailablePort()
  const parent = await mkdtemp(join(tmpdir(), 'echolog-not-ready-'))
  const storageRoot = join(parent, 'blocked-root')
  await writeFile(storageRoot, 'not a directory')
  const config = parseConfig({ ECHOLOG_STORAGE_ROOT: storageRoot }, ['--port', String(port)])
  const app = createEchologServer(config, { database: openTestDatabase() })
  t.after(async () => {
    await app.close()
    await rm(parent, { recursive: true, force: true })
  })

  const address = await app.listen({ host: config.host, port: config.port })
  const ready = await fetch(`${address}/health/ready`)
  assert.equal(ready.status, 503)
  assert.deepEqual(await ready.json(), { status: 'not_ready', app: 'echolog', reason: 'storage unavailable' })
})

void test('ECHOLOG uses ECHOLOG_PORT and ignores the inherited Radio PORT', () => {
  assert.equal(parseConfig({ PORT: '3000' }).port, 3006)
  assert.equal(parseConfig({ PORT: '3000', ECHOLOG_PORT: '3006' }).port, 3006)
})

void test('ECHOLOG production config requires a grant signing secret', () => {
  assert.throws(
    () => parseConfig({ NODE_ENV: 'production' }),
    /ECHOLOG_GRANT_SECRET is required/,
  )
})

void test('ECHOLOG core computes SHA-256 using the Web Crypto API', async () => {
  assert.equal(
    await sha256Hex(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
})
