import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { USER_ADD_USAGE, UserAddUsageError, parseUserAddArgs, runUserAdd } from '../src/cli/user-add.js'
import { findApiKey, findUserByLogin, openDatabase, verifyPassword } from '../src/db.js'

const PASSWORD = 'a-sufficiently-long-secret'

async function storePath(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'echolog-user-add-'))
  return { path: join(root, 'echolog.db'), cleanup: () => rm(root, { recursive: true, force: true }) }
}

function environment(databasePath: string, extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { NODE_ENV: 'test', ECHOLOG_STORAGE_ROOT: databasePath.replace(/[^/\\]*$/, ''), ECHOLOG_DATABASE_PATH: databasePath, ...extra }
}

void test('user:add defaults to member and derives the key name from the login', () => {
  const request = parseUserAddArgs(['--login', 'keeper', '--password', PASSWORD])
  assert.deepEqual(request, {
    login: 'keeper',
    password: PASSWORD,
    role: 'member',
    key: false,
    keyName: 'keeper api key',
  })
})

void test('user:add accepts inline values and reads the password from the environment', () => {
  assert.equal(parseUserAddArgs(['--login=archivist', '--role=admin'], { ECHOLOG_USER_PASSWORD: PASSWORD }).role, 'admin')
  const fromEnv = parseUserAddArgs(['--login=archivist'], { ECHOLOG_USER_PASSWORD: PASSWORD })
  assert.equal(fromEnv.password, PASSWORD)
})

void test('user:add rejects a missing, duplicated, unknown or unvalued argument', () => {
  assert.throws(() => parseUserAddArgs([]), UserAddUsageError)
  assert.throws(() => parseUserAddArgs(['--login', 'a', '--login', 'b', '--password', PASSWORD]), /only once/)
  assert.throws(() => parseUserAddArgs(['--login', 'a', '--password', PASSWORD, '--nope']), /Unknown argument: --nope/)
  assert.throws(() => parseUserAddArgs(['--login', '--role', 'admin']), /--login requires a value/)
  assert.throws(() => parseUserAddArgs(['positional', '--login', 'a']), /Unexpected argument/)
  assert.throws(() => parseUserAddArgs(['--login', 'a', '--key', '--key', '--password', PASSWORD]), /--key may be provided only once/)
})

void test('user:add refuses a password shorter than the service bootstrap rule', () => {
  assert.throws(() => parseUserAddArgs(['--login', 'a', '--password', 'short']), /password: at least 12 characters/)
})

void test('user:add writes the account and one usable API key into the configured store', async () => {
  const store = await storePath()
  try {
    const report = runUserAdd(environment(store.path), ['--login', 'operator-1', '--role', 'admin', '--key', '--password', PASSWORD])
    assert.match(report, /Created admin "operator-1"/)
    const token = report.match(/ecl_[A-Za-z0-9_-]+/)?.[0]
    assert.ok(token, 'the report must show the issued key once')

    const database = openDatabase(store.path)
    const user = findUserByLogin(database, 'operator-1')
    assert.ok(user)
    assert.equal(user.role, 'admin')
    assert.equal(verifyPassword(user.password_hash, PASSWORD), true)
    assert.equal(verifyPassword(user.password_hash, 'wrong-password'), false)
    assert.equal(findApiKey(database, token ?? '')?.role, 'admin')
    database.handle.close()

    assert.throws(
      () => runUserAdd(environment(store.path), ['--login', 'operator-1', '--password', PASSWORD]),
      /already exists/,
      'a second account with the same login must not overwrite the first',
    )
    assert.equal(report.includes(PASSWORD), false, 'the password must never be echoed back')
  } finally {
    await store.cleanup()
  }
})

void test('user:add usage names every supported flag', () => {
  for (const flag of ['--login', '--role', '--password', '--key', '--key-name', 'ECHOLOG_USER_PASSWORD']) {
    assert.ok(USER_ADD_USAGE.includes(flag), `usage documents ${flag}`)
  }
})
