import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { parseConfig } from '../src/config.js'
import { closeDatabase, createSession, createUser, findUserByLogin, issueApiKey, openDatabase, type EchologDatabase } from '../src/db.js'
import { createEchologServer } from '../src/server.js'

const GRANT_SECRET = 'echolog-admin-grant-secret-000000000000000001'

function seedIdentity(): EchologDatabase {
  const database = openDatabase(':memory:')
  createUser(database, { login: 'keeper', password: 'test-only-password', role: 'admin' })
  createUser(database, { login: 'editor', password: 'test-only-password', role: 'member' })
  return database
}

function createConfig(storageRoot: string) {
  return parseConfig({
    NODE_ENV: 'test',
    ECHOLOG_GRANT_SECRET: GRANT_SECRET,
    ECHOLOG_STORAGE_ROOT: storageRoot,
  })
}

async function setup(t: TestContext) {
  const database = seedIdentity()
  const root = await mkdtemp(join(tmpdir(), 'echolog-admin-'))
  const app = createEchologServer(createConfig(root), { database })
  t.after(async () => {
    await app.close()
    closeDatabase(database)
    await rm(root, { recursive: true, force: true })
  })
  const adminToken = issueApiKey(database, 'keeper key', 'admin').token
  const memberToken = issueApiKey(database, 'editor key', 'member').token
  return { app, database, adminToken, memberToken }
}

void test('admin credential routes demand an administrator', async (t) => {
  const { app, adminToken, memberToken } = await setup(t)

  const anonymous = await app.inject().get('/api/v1/keys')
  assert.equal(anonymous.statusCode, 401)
  assert.equal(anonymous.json().error.code, 'unauthorized')

  const member = await app.inject({ method: 'GET', url: '/api/v1/keys', headers: { authorization: `Bearer ${memberToken}` } })
  assert.equal(member.statusCode, 403)
  assert.equal(member.json().error.message, 'Administrator access is required.')

  const admin = await app.inject({ method: 'GET', url: '/api/v1/keys', headers: { authorization: `Bearer ${adminToken}` } })
  assert.equal(admin.statusCode, 200)
  assert.equal(admin.headers['cache-control'], 'no-store', 'credential listings must not be cached')
  const names = (admin.json().keys as { name: string }[]).map((key) => key.name)
  assert.deepEqual(names.sort(), ['editor key', 'keeper key'])
  assert.equal(JSON.stringify(admin.json()).includes(adminToken), false, 'a stored key never appears in a listing')
  assert.equal(JSON.stringify(admin.json()).includes('key_hash'), false)

  const users = await app.inject({ method: 'GET', url: '/api/v1/users', headers: { authorization: `Bearer ${adminToken}` } })
  assert.equal(users.statusCode, 200)
  assert.deepEqual(
    (users.json().users as { login: string; disabled: boolean }[])
      .map((user) => [user.login, user.disabled])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]), 'en')),
    [['editor', false], ['keeper', false]],
  )
})

void test('issuing a key returns the secret once and the listing keeps only the prefix', async (t) => {
  const { app, adminToken } = await setup(t)

  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/keys',
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    payload: { name: ' backup host ', role: 'member' },
  })
  assert.equal(created.statusCode, 201)
  const body = created.json() as { key: { prefix: string; name: string; role: string }; token: string }
  assert.equal(body.key.name, 'backup host', 'the name is trimmed before it is stored')
  assert.equal(body.key.role, 'member')
  assert.match(body.token, /^ecl_[A-Za-z0-9_-]{32}$/)
  assert.equal(body.key.prefix, body.token.slice(0, 12))

  const probe = await app.inject({ method: 'POST', url: '/api/v1/objects', headers: { authorization: `Bearer ${body.token}`, 'content-type': 'application/octet-stream' }, payload: Buffer.from('issued key works') })
  assert.equal(probe.statusCode, 201, 'the issued key authenticates immediately')

  const listing = await app.inject({ method: 'GET', url: '/api/v1/keys', headers: { authorization: `Bearer ${adminToken}` } })
  const listed = (listing.json().keys as { prefix: string; name: string }[]).find((key) => key.name === 'backup host')
  assert.equal(listed?.prefix, body.key.prefix)
  assert.equal(JSON.stringify(listing.json()).includes(body.token), false, 'the secret is not listed again')

  const rejected = await app.inject({
    method: 'POST',
    url: '/api/v1/keys',
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    payload: { name: 'x', role: 'root' },
  })
  assert.equal(rejected.statusCode, 400, 'role is validated against the two known roles')
})

void test('a key cannot revoke itself, and a revoked key stops authenticating', async (t) => {
  const { app, adminToken, memberToken } = await setup(t)

  const issued = await app.inject({
    method: 'POST',
    url: '/api/v1/keys',
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    payload: { name: 'victim', role: 'member' },
  })
  const victim = issued.json() as { key: { prefix: string }; token: string }

  const retired = await app.inject({ method: 'DELETE', url: `/api/v1/keys/${victim.key.prefix}`, headers: { authorization: `Bearer ${adminToken}` } })
  assert.equal(retired.statusCode, 204, 'an administrator may retire a key that is not their own')

  const memberRevoke = await app.inject({ method: 'DELETE', url: `/api/v1/keys/${victim.key.prefix}`, headers: { authorization: `Bearer ${memberToken}` } })
  assert.equal(memberRevoke.statusCode, 403, 'a member cannot retire credentials at all')

  const afterRevoke = await app.inject({ method: 'GET', url: '/api/v1/objects/sha256/' + 'b'.repeat(64), headers: { authorization: `Bearer ${victim.token}` } })
  assert.equal(afterRevoke.statusCode, 401, 'a revoked key is rejected at once')

  const twice = await app.inject({ method: 'DELETE', url: `/api/v1/keys/${victim.key.prefix}`, headers: { authorization: `Bearer ${adminToken}` } })
  assert.equal(twice.statusCode, 404, 'revoking an already retired key reports not found')
  assert.equal(twice.json().error.code, 'not_found')

  const current = await app.inject({ method: 'DELETE', url: '/api/v1/keys/ecl_aaaaaaaa', headers: { authorization: `Bearer ${adminToken}` } })
  assert.equal(current.statusCode, 404)

  const adminKey = await app.inject({ method: 'GET', url: '/api/v1/keys', headers: { authorization: `Bearer ${adminToken}` } })
  const own = (adminKey.json().keys as { name: string; prefix: string }[]).find((key) => key.name === 'keeper key')
  assert.ok(own)
  const selfLockout = await app.inject({ method: 'DELETE', url: `/api/v1/keys/${own.prefix}`, headers: { authorization: `Bearer ${adminToken}` } })
  assert.equal(selfLockout.statusCode, 409, 'the authenticating key cannot lock itself out')
  assert.equal(selfLockout.json().error.code, 'self_lockout')

  const malformed = await app.inject({ method: 'DELETE', url: '/api/v1/keys/not-a-prefix', headers: { authorization: `Bearer ${adminToken}` } })
  assert.equal(malformed.statusCode, 400, 'the prefix is validated before the store is touched')
})

void test('disabling an account kills its live session but keeps its objects', async (t) => {
  const { app, database, adminToken } = await setup(t)

  const editor = findUserByLogin(database, 'editor')
  assert.ok(editor)
  const session = createSession(database, editor.id, 60 * 60 * 1000)
  const cookie = { cookie: `echolog_session=${session.token}` }

  const before = await app.inject({ method: 'GET', url: '/api/v1/me', headers: cookie })
  assert.equal(before.statusCode, 200)
  assert.deepEqual(before.json(), { login: 'editor', role: 'member', kind: 'session' })

  const disabled = await app.inject({
    method: 'PATCH',
    url: '/api/v1/users/editor',
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    payload: { disabled: true },
  })
  assert.equal(disabled.statusCode, 200)
  assert.deepEqual(disabled.json(), { login: 'editor', disabled: true })

  const afterSession = await app.inject({ method: 'GET', url: '/api/v1/me', headers: cookie })
  assert.equal(afterSession.statusCode, 401, 'a session that outlived its account is unauthenticated')
  const afterListing = await app.inject({ method: 'GET', url: '/api/v1/users', headers: { authorization: `Bearer ${adminToken}` } })
  assert.equal((afterListing.json().users as { login: string; disabled: boolean }[]).find((user) => user.login === 'editor')?.disabled, true)

  const restored = await app.inject({
    method: 'PATCH',
    url: '/api/v1/users/editor',
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    payload: { disabled: false },
  })
  assert.equal(restored.statusCode, 200)
  const stillDead = await app.inject({ method: 'GET', url: '/api/v1/me', headers: cookie })
  assert.equal(stillDead.statusCode, 401, 'a session minted before the lock-out stays dead after re-enabling')

  const freshSignIn = await app.inject({
    method: 'POST',
    url: '/api/v1/session',
    headers: { 'content-type': 'application/json' },
    payload: { login: 'editor', password: 'test-only-password' },
  })
  assert.equal(freshSignIn.statusCode, 200, 'the re-enabled account can sign in again')

  const missing = await app.inject({
    method: 'PATCH',
    url: '/api/v1/users/ghost',
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    payload: { disabled: true },
  })
  assert.equal(missing.statusCode, 404)

  const signedIn = await app.inject({
    method: 'POST',
    url: '/api/v1/session',
    headers: { 'content-type': 'application/json' },
    payload: { login: 'keeper', password: 'test-only-password' },
  })
  assert.equal(signedIn.statusCode, 200)
  const keeperCookie = { cookie: signedIn.headers['set-cookie']?.toString().split(';')[0] ?? '' }
  const selfDisable = await app.inject({
    method: 'PATCH',
    url: '/api/v1/users/keeper',
    headers: { ...keeperCookie, 'content-type': 'application/json' },
    payload: { disabled: true },
  })
  assert.equal(selfDisable.statusCode, 409, 'an administrator cannot disable the account they use')
  assert.equal(selfDisable.json().error.code, 'self_lockout')
})
