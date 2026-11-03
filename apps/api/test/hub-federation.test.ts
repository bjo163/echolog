import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { parseConfig } from '../src/config.js'
import { sha256Hex } from '../src/core/index.js'
import { closeDatabase, createUser, issueApiKey, openDatabase, type EchologDatabase } from '../src/db.js'
import { createEchologServer } from '../src/server.js'

const GRANT_SECRET = 'echolog-federation-grant-secret-00000000000000'
const SERVICE_KEY = 'echolog-service-key-0000000000000000000000000001'
const HUB_URL = 'http://hub.invalid:3000'
const PROTECTED_BYTES = Buffer.from('private witness bytes')
const PROTECTED_DIGEST = await sha256Hex(new Uint8Array(PROTECTED_BYTES))

interface HubCall {
  path: string
  authorization: string | undefined
  body: unknown
}

/** A stand-in for the Hub: no socket, so the contract is checked by shape alone. */
function fakeHub(options: {
  me?: () => { status: number; body?: unknown }
  authorize?: (digest: string) => number
}): { fetcher: typeof fetch; calls: HubCall[] } {
  const calls: HubCall[] = []
  const fetcher = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' || input instanceof URL ? new URL(String(input)) : new URL(input.url)
    const headers = (init.headers ?? {}) as Record<string, string>
    calls.push({
      path: url.pathname,
      authorization: headers.authorization,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    if (url.pathname === '/api/v1/auth/me') {
      const reply = (options.me?.() ?? { status: 200, body: { data: { login: 'rina', role: 'member' } } })
      return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status })
    }
    if (url.pathname === '/api/v1/witness/private-media-authorize') {
      const status = options.authorize?.(PROTECTED_DIGEST) ?? 204
      return new Response(null, { status })
    }
    throw new Error(`unexpected hub path ${url.pathname}`)
  }) as typeof fetch
  return { fetcher, calls }
}

async function setup(t: TestContext, overrides: Record<string, string | undefined>, hub: ReturnType<typeof fakeHub>) {
  const database = openDatabase(':memory:')
  createUser(database, { login: 'keeper', password: 'test-only-password', role: 'admin' })
  const root = await mkdtemp(join(tmpdir(), 'echolog-federation-'))
  const adminKey = issueApiKey(database, 'keeper key', 'admin').token
  const memberKey = issueApiKey(database, 'bot key', 'member').token
  const app = createEchologServer(parseConfig({
    NODE_ENV: 'test',
    ECHOLOG_STORAGE_ROOT: root,
    ECHOLOG_GRANT_SECRET: GRANT_SECRET,
    ...overrides,
  }), { database, fetcher: hub.fetcher })
  t.after(async () => {
    await app.close()
    closeDatabase(database)
    await rm(root, { recursive: true, force: true })
  })
  return { app, adminKey, memberKey }
}

function federated(overrides: Record<string, string | undefined> = {}) {
  return { ECHOLOG_ARSY_URL: HUB_URL, ECHOLOG_SERVICE_KEY: SERVICE_KEY, ...overrides }
}

async function upload(app: ReturnType<typeof createEchologServer>, headers: Record<string, string>, bytes = 'federation bytes') {
  return app.inject({
    method: 'POST',
    url: '/api/v1/objects',
    headers: { 'content-type': 'application/octet-stream', ...headers },
    payload: Buffer.from(bytes),
  })
}
void test('the shared service key authenticates a daemon and carries administrative rights', async (t) => {
  const hub = fakeHub({})
  const { app } = await setup(t, federated(), hub)

  const ok = await upload(app, { 'x-echolog-key': SERVICE_KEY })
  assert.equal(ok.statusCode, 201)
  assert.equal(ok.json().uploader, 'service')
  assert.equal(hub.calls.length, 0, 'a service key never needs a Hub round trip')

  const wrong = await upload(app, { 'x-echolog-key': 'echolog-service-key-wrong-wrong-wrong-wrong' })
  assert.equal(wrong.statusCode, 401)

  const gc = await app.inject({ method: 'POST', url: '/api/v1/gc', headers: { 'x-echolog-key': SERVICE_KEY } })
  assert.equal(gc.statusCode, 200, 'a service credential may sweep, exactly as the Hub variant allows')

  const keys = await app.inject({ method: 'GET', url: '/api/v1/keys', headers: { 'x-echolog-key': SERVICE_KEY } })
  assert.equal(keys.statusCode, 403, 'a service key is not an operator administrator and cannot manage credentials')

  const hold = await upload(app, { 'x-echolog-key': SERVICE_KEY, 'x-echolog-legal-hold': 'true' }, 'held bytes')
  assert.equal(hold.statusCode, 201, 'a service credential may set legal hold')
})

void test('a foreign bearer is resolved by the Hub, cached briefly, and never treated as a local key', async (t) => {
  const hub = fakeHub({})
  const { app, adminKey } = await setup(t, federated(), hub)

  const first = await upload(app, { authorization: 'Bearer arsy-session-token-1' })
  assert.equal(first.statusCode, 201)
  assert.equal(first.json().uploader, 'rina', 'the Hub login becomes the uploader recorded in the sidecar')

  const second = await upload(app, { authorization: 'Bearer arsy-session-token-1' }, 'federation bytes two')
  assert.equal(second.statusCode, 201)
  const identityCalls = hub.calls.filter((call) => call.path === '/api/v1/auth/me')
  assert.equal(identityCalls.length, 1, 'the two requests share one cached Hub resolution')
  assert.equal(identityCalls[0]?.authorization, 'Bearer arsy-session-token-1', 'the bearer is forwarded unchanged')

  const denied = await upload(app, { authorization: 'Bearer expired-session' })
  assert.equal(denied.statusCode, 201, 'the cached identity is reused inside the TTL window')

  const local = await upload(app, { authorization: `Bearer ${adminKey}` }, 'a local key uploads its own bytes')
  assert.equal(local.statusCode, 201, 'an ecl_ key is still resolved locally, without the Hub')
  assert.equal(local.json().uploader, 'keeper key')
  assert.equal(hub.calls.filter((call) => call.authorization === `Bearer ${adminKey}`).length, 0,
    'a local credential is never forwarded to the Hub as if it were a Hub session')
})

void test('a Hub that refuses or is unreachable cannot be worked around', async (t) => {
  const refusing = fakeHub({ me: () => ({ status: 401 }) })
  const refusedApp = await setup(t, federated(), refusing)
  const refused = await upload(refusedApp.app, { authorization: 'Bearer unknown-session' })
  assert.equal(refused.statusCode, 401)

  const silentHub = fakeHub({ me: () => ({ status: 500 }) })
  const { app } = await setup(t, federated(), silentHub)
  const unavailable = await upload(app, { authorization: 'Bearer hub-is-sick' })
  assert.equal(unavailable.statusCode, 503)
  assert.equal(unavailable.json().error.code, 'auth_unavailable')

  const member = fakeHub({})
  const memberApp = await setup(t, federated(), member)
  const hold = await upload(memberApp.app, { authorization: 'Bearer arsy-member', 'x-echolog-legal-hold': 'true' }, 'member hold')
  assert.equal(hold.statusCode, 403, 'a Hub member may not set legal hold')
  assert.equal(hold.json().error.message, 'Only a service or administrator may set legal hold.')
})

void test('with a Hub configured, its answer decides for Hub subjects and never for local credentials', async (t) => {
  const hub = fakeHub({ authorize: () => 204 })
  const { app, adminKey } = await setup(t, federated(), hub)

  const marked = await upload(app, {
    authorization: 'Bearer arsy-session-token-1',
    'x-echolog-private-witness': 'true',
  }, PROTECTED_BYTES.toString())
  assert.equal(marked.statusCode, 201)
  assert.equal(marked.json().digest, PROTECTED_DIGEST)

  const asOwner = await app.inject({ method: 'GET', url: `/api/v1/objects/sha256/${PROTECTED_DIGEST}/meta`, headers: { authorization: 'Bearer arsy-session-token-1' } })
  assert.equal(asOwner.statusCode, 200, 'the Hub authorized this bearer, so the sidecar is readable')

  const authorizeCalls = hub.calls.filter((call) => call.path === '/api/v1/witness/private-media-authorize')
  assert.ok(authorizeCalls.length > 0, 'reading a marked digest asks the Hub first')
  assert.deepEqual(authorizeCalls[0]?.body, { digest: PROTECTED_DIGEST })

  const adminKeyRead = await app.inject({ method: 'GET', url: `/api/v1/objects/sha256/${PROTECTED_DIGEST}/meta`, headers: { authorization: `Bearer ${adminKey}` } })
  assert.equal(adminKeyRead.statusCode, 200, 'this instance keeps its own administrator rule')
  assert.equal(hub.calls.filter((call) => call.path === '/api/v1/witness/private-media-authorize'
    && call.authorization === `Bearer ${adminKey}`).length, 0, 'and never offers a local key to the Hub as a subject')

  const serviceRead = await app.inject({ method: 'GET', url: `/api/v1/objects/sha256/${PROTECTED_DIGEST}`, headers: { 'x-echolog-key': SERVICE_KEY } })
  assert.equal(serviceRead.statusCode, 404, 'the service credential cannot mint a grant for protected bytes')
})

void test('a refusal from the Hub hides the object instead of leaking its shape', async (t) => {
  const hub = fakeHub({ authorize: () => 403 })
  const { app } = await setup(t, federated(), hub)
  const read = await app.inject({ method: 'GET', url: `/api/v1/objects/sha256/${PROTECTED_DIGEST}/meta`, headers: { authorization: 'Bearer arsy-session-token-1' } })
  assert.equal(read.statusCode, 404)
  assert.equal(read.json().error.code, 'not_found')

  const boom = fakeHub({ authorize: () => { throw new Error('hub down') } })
  const boomApp = await setup(t, federated(), boom)
  await upload(boomApp.app, { authorization: 'Bearer arsy-session-token-1', 'x-echolog-private-witness': 'true' }, PROTECTED_BYTES.toString())
  const failed = await boomApp.app.inject({ method: 'GET', url: `/api/v1/objects/sha256/${PROTECTED_DIGEST}/meta`, headers: { authorization: 'Bearer arsy-session-token-1' } })
  assert.equal(failed.statusCode, 503, 'an unreachable ACL authority is a failure, never an implicit yes')
})

void test('without a Hub configured the instance keeps its own administrative rule', async (t) => {
  const hub = fakeHub({})
  const { app, adminKey, memberKey } = await setup(t, { ECHOLOG_SERVICE_KEY: SERVICE_KEY }, hub)

  const marked = await upload(app, { authorization: `Bearer ${adminKey}`, 'x-echolog-private-witness': 'true' }, PROTECTED_BYTES.toString())
  assert.equal(marked.statusCode, 201)

  const adminRead = await app.inject({ method: 'GET', url: `/api/v1/objects/sha256/${PROTECTED_DIGEST}/meta`, headers: { authorization: `Bearer ${adminKey}` } })
  assert.equal(adminRead.statusCode, 200, 'standalone mode answers with its own admin gate')

  const memberRead = await app.inject({ method: 'GET', url: `/api/v1/objects/sha256/${PROTECTED_DIGEST}/meta`, headers: { authorization: `Bearer ${memberKey}` } })
  assert.equal(memberRead.statusCode, 404)

  const grant = await app.inject({ method: 'GET', url: `/api/v1/objects/sha256/${PROTECTED_DIGEST}`, headers: { authorization: `Bearer ${adminKey}` } })
  assert.equal(grant.statusCode, 200)
  const url = new URL(grant.json().url, 'http://echolog.invalid')
  assert.equal(url.pathname, `/api/v1/objects/sha256/${PROTECTED_DIGEST}`, 'the Hub validates one path, so the grant must keep it')
  assert.equal(url.hash, '')
  assert.equal(url.searchParams.getAll('grant').length, 1, 'the Hub rejects a grant URL with more than one token')
  assert.ok((url.searchParams.get('grant') ?? '').length <= 2048)
  assert.equal(hub.calls.length, 0, 'no Hub was configured, so none was called')
})

void test('configuration refuses a short service key and a non-absolute Hub URL', () => {
  assert.throws(
    () => parseConfig({ ECHOLOG_SERVICE_KEY: 'too-short' }),
    /ECHOLOG_SERVICE_KEY must be at least 32 characters/,
  )
  assert.throws(() => parseConfig({ ECHOLOG_ARSY_URL: 'hub.invalid:3000' }), /must be an absolute http\(s\) URL/)
  assert.equal(parseConfig({}).arsyUrl, '', 'federation is off unless it is explicitly configured')
})
