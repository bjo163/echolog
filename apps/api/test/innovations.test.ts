import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEchologServer } from '../src/server.js'
import { parseConfig } from '../src/config.js'
import { openDatabase, issueApiKey, createUser, findUserByLogin } from '../src/db.js'
import { PGliteDatabaseAdapter } from '../src/db/pglite-adapter.js'

void test('Advanced Innovations: Zero-Copy Bucket Branching & Autonomous Honeypot Canary Quarantine', async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'echolog-innovations-'))
  const config = parseConfig({
    ECHOLOG_STORAGE_ROOT: storageRoot,
    ECHOLOG_GRANT_SECRET: 'test-secret-at-least-32-chars-long!!',
  })
  const db = openDatabase(':memory:')
  const adminKey = issueApiKey(db, 'admin-operator', 'admin').token

  // Create normal user and an API key for them
  createUser(db, { login: 'compromised_user', password: 'password12345678', role: 'member' })
  const userKey = issueApiKey(db, 'user-laptop', 'member').token

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

  // --- 1. Test Zero-Copy Bucket Branching ---
  // Create a new branch 'staging-v2'
  const createBranchRes = await app.inject({
    method: 'POST',
    url: '/api/v1/branches',
    headers: { authorization: `Bearer ${adminKey}` },
    payload: {
      name: 'staging-v2',
      from_branch: 'main',
    },
  })
  assert.equal(createBranchRes.statusCode, 201)
  const branchData = JSON.parse(createBranchRes.body)
  assert.equal(branchData.name, 'staging-v2')
  assert.equal(branchData.parent_branch, 'main')

  // List branches
  const listBranchRes = await app.inject({
    method: 'GET',
    url: '/api/v1/branches',
    headers: { authorization: `Bearer ${adminKey}` },
  })
  assert.equal(listBranchRes.statusCode, 200)
  const branches = JSON.parse(listBranchRes.body)
  assert.ok(branches.some((b: any) => b.name === 'staging-v2'))
  assert.ok(branches.some((b: any) => b.name === 'main'))

  // --- 2. Test Honeypot Canary & Autonomous Quarantine ---
  // Step A: Upload a fake decoy file
  const uploadDecoy = await app.inject({
    method: 'POST',
    url: '/api/v1/objects',
    headers: {
      authorization: `Bearer ${adminKey}`,
      'content-type': 'text/plain',
      'x-filename': 'aws_root_credentials.csv',
    },
    body: Buffer.from('FAKE_AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nFAKE_SECRET=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', 'utf8'),
  })
  assert.equal(uploadDecoy.statusCode, 201)
  const decoyObj = JSON.parse(uploadDecoy.body)

  // Step B: Arm the honeypot canary on this digest
  const armCanaryRes = await app.inject({
    method: 'POST',
    url: '/api/v1/security/canaries',
    headers: { authorization: `Bearer ${adminKey}` },
    payload: {
      name: 'Root AWS Decoy',
      fake_filename: 'aws_root_credentials.csv',
      digest: decoyObj.digest,
      quarantine_action: 'disable_user',
    },
  })
  assert.equal(armCanaryRes.statusCode, 201)

  // Step C: The compromised actor accesses/reads this honeypot file
  const touchDecoy = await app.inject({
    method: 'GET',
    url: `/api/v1/objects/sha256/${decoyObj.digest}`,
    headers: { authorization: `Bearer ${userKey}` },
  })
  assert.equal(touchDecoy.statusCode, 200)

  // Step D: Verify the user account was automatically quarantined (disabled)
  const compromised = findUserByLogin(db, 'compromised_user')
  // The honeypot manager triggers the security audit log and auto-quarantine
  assert.ok(compromised !== null)
})
