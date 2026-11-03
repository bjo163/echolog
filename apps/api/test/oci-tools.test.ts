import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEchologServer } from '../src/server.js'
import { parseConfig } from '../src/config.js'
import { issueApiKey, openDatabase } from '../src/db.js'

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

async function build() {
  const storageRoot = await mkdtemp(join(tmpdir(), 'echolog-oci-tools-'))
  const config = parseConfig({
    ECHOLOG_STORAGE_ROOT: storageRoot,
    ECHOLOG_GRANT_SECRET: 'test-secret-at-least-32-chars-long!!',
  })
  const db = openDatabase(':memory:')
  const admin = issueApiKey(db, 'admin-key', 'admin').token
  const member = issueApiKey(db, 'member-key', 'member').token
  const other = issueApiKey(db, 'other-key', 'member').token
  const app = createEchologServer(config, { database: db })
  await app.ready()
  return {
    app,
    storageRoot,
    async close() {
      await app.close()
      db.handle.close()
      await rm(storageRoot, { recursive: true, force: true })
    },
    admin,
    member,
    other,
  }
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` }
}

function basic(token: string) {
  return { authorization: `Basic ${Buffer.from(`user:${token}`).toString('base64')}` }
}

test('tools refuse anonymous writes', async (t) => {
  const context = await build()
  t.after(() => context.close())

  const paste = await context.app.inject({
    method: 'POST',
    url: '/api/v1/tools/paste',
    payload: { content: 'anonymous' },
  })
  assert.equal(paste.statusCode, 401)

  const cli = await context.app.inject({
    method: 'POST',
    url: '/paste',
    headers: { 'content-type': 'text/plain' },
    payload: 'anonymous',
  })
  assert.equal(cli.statusCode, 401)

  const drop = await context.app.inject({
    method: 'PUT',
    url: '/drop/anon.txt',
    headers: { 'content-type': 'text/plain' },
    payload: 'anonymous',
  })
  assert.equal(drop.statusCode, 401)

  const link = await context.app.inject({
    method: 'POST',
    url: '/api/v1/tools/short-links',
    payload: { digest: 'a'.repeat(64) },
  })
  assert.equal(link.statusCode, 401)
})

test('pastebin escapes hostile filenames and content and sends a strict CSP', async (t) => {
  const context = await build()
  t.after(() => context.close())

  const created = await context.app.inject({
    method: 'POST',
    url: '/api/v1/tools/paste',
    headers: bearer(context.member),
    payload: {
      content: '<script>alert(1)</script>',
      title: '<img src=x onerror=alert(1)>',
      retention_hours: 1,
    },
  })
  assert.equal(created.statusCode, 201)
  const link = JSON.parse(created.body) as { slug: string; digest: string }
  assert.ok(link.slug)

  const raw = await context.app.inject({
    method: 'GET',
    url: `/p/${link.slug}`,
    headers: { accept: 'text/plain' },
  })
  assert.equal(raw.statusCode, 200)
  assert.equal(raw.body, '<script>alert(1)</script>')

  const html = await context.app.inject({
    method: 'GET',
    url: `/p/${link.slug}`,
    headers: { accept: 'text/html' },
  })
  assert.equal(html.statusCode, 200)
  assert.match(html.headers['content-security-policy'] ?? '', /default-src 'none'/)
  assert.ok(!html.body.includes('<script>alert(1)</script>'))
  assert.ok(!html.body.includes('<img src=x'))
  assert.ok(html.body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(html.body.includes('&lt;img src=x'))
})

test('dropzone honours authentication, the MIME allow-list and filename sanitising', async (t) => {
  const context = await build()
  t.after(() => context.close())

  const accepted = await context.app.inject({
    method: 'PUT',
    url: '/drop/..%2F..%2Fevil.txt',
    headers: { ...bearer(context.member), 'content-type': 'text/plain' },
    payload: 'dropzone file content',
  })
  assert.equal(accepted.statusCode, 201)
  assert.match(accepted.body, /File: evil\.txt/)
  assert.doesNotMatch(accepted.body, /\.\.\//)

  const rejected = await context.app.inject({
    method: 'PUT',
    url: '/drop/evil.exe',
    headers: { ...bearer(context.member), 'content-type': 'application/x-msdownload' },
    payload: 'MZ',
  })
  assert.equal(rejected.statusCode, 415)
})

test('short links are owner-scoped, burn once, and pin their objects for GC', async (t) => {
  const context = await build()
  t.after(() => context.close())

  const upload = await context.app.inject({
    method: 'POST',
    url: '/api/v1/objects',
    headers: { ...bearer(context.member), 'content-type': 'text/plain', 'x-filename': 'note.txt' },
    payload: 'burn me',
  })
  assert.equal(upload.statusCode, 201)
  const digest = (JSON.parse(upload.body) as { digest: string }).digest

  const created = await context.app.inject({
    method: 'POST',
    url: '/api/v1/tools/short-links',
    headers: bearer(context.member),
    payload: { digest, burn_after_reading: true, expires_hours: 0 },
  })
  assert.equal(created.statusCode, 201)
  const slug = (JSON.parse(created.body) as { slug: string }).slug

  const mine = await context.app.inject({ method: 'GET', url: '/api/v1/tools/short-links', headers: bearer(context.member) })
  assert.equal(mine.statusCode, 200)
  assert.equal((JSON.parse(mine.body) as unknown[]).length, 1)

  const theirs = await context.app.inject({ method: 'GET', url: '/api/v1/tools/short-links', headers: bearer(context.other) })
  assert.equal(theirs.statusCode, 200)
  assert.deepEqual(JSON.parse(theirs.body), [])

  const foreignDelete = await context.app.inject({
    method: 'DELETE',
    url: `/api/v1/tools/short-links/${slug}`,
    headers: bearer(context.other),
  })
  assert.equal(foreignDelete.statusCode, 404)

  const first = await context.app.inject({ method: 'GET', url: `/s/${slug}` })
  assert.equal(first.statusCode, 200)
  assert.equal(first.body, 'burn me')

  const second = await context.app.inject({ method: 'GET', url: `/s/${slug}` })
  assert.equal(second.statusCode, 404)

  // A live link pins the digest even when the object has no retention.
  const live = await context.app.inject({
    method: 'POST',
    url: '/api/v1/tools/short-links',
    headers: bearer(context.member),
    payload: { digest },
  })
  assert.equal(live.statusCode, 201)
  const gc = await context.app.inject({ method: 'POST', url: '/api/v1/gc', headers: bearer(context.admin) })
  assert.equal(gc.statusCode, 200)
  assert.equal((JSON.parse(gc.body) as { deleted: string[] }).deleted.includes(`sha256/${digest}`), false)
})

test('private-witness objects are hidden from members and cannot be linked', async (t) => {
  const context = await build()
  t.after(() => context.close())

  const upload = await context.app.inject({
    method: 'POST',
    url: '/api/v1/objects',
    headers: { ...bearer(context.member), 'content-type': 'text/plain', 'x-filename': 'secret.txt' },
    payload: 'witness material',
  })
  assert.equal(upload.statusCode, 201)
  const digest = (JSON.parse(upload.body) as { digest: string }).digest

  const link = await context.app.inject({
    method: 'POST',
    url: '/api/v1/tools/short-links',
    headers: bearer(context.member),
    payload: { digest },
  })
  assert.equal(link.statusCode, 201)
  const slug = (JSON.parse(link.body) as { slug: string }).slug

  const marked = await context.app.inject({
    method: 'POST',
    url: `/api/v1/objects/sha256/${digest}/private-witness`,
    headers: bearer(context.member),
    payload: { objectKey: `sha256/${digest}` },
  })
  assert.equal(marked.statusCode, 200)

  const memberMeta = await context.app.inject({
    method: 'GET',
    url: `/api/v1/objects/sha256/${digest}/meta`,
    headers: bearer(context.member),
  })
  assert.equal(memberMeta.statusCode, 404)

  const adminMeta = await context.app.inject({
    method: 'GET',
    url: `/api/v1/objects/sha256/${digest}/meta`,
    headers: bearer(context.admin),
  })
  assert.equal(adminMeta.statusCode, 200)

  assert.equal((await context.app.inject({ method: 'GET', url: `/s/${slug}` })).statusCode, 404)
  assert.equal((await context.app.inject({ method: 'GET', url: `/p/${slug}` })).statusCode, 404)

  const listing = await context.app.inject({ method: 'GET', url: '/api/v1/s3-keys', headers: bearer(context.member) })
  assert.deepEqual(JSON.parse(listing.body), [])
})

test('OCI registry: Basic auth, nested repos, ranged chunks, verified digests and tag lifecycle', async (t) => {
  const context = await build()
  t.after(() => context.close())

  const anonymous = await context.app.inject({ method: 'GET', url: '/v2/' })
  assert.equal(anonymous.statusCode, 401)
  assert.match(String(anonymous.headers['www-authenticate'] ?? ''), /^Basic /)

  const ping = await context.app.inject({ method: 'GET', url: '/v2/', headers: basic(context.admin) })
  assert.equal(ping.statusCode, 200)
  assert.equal(ping.headers['docker-distribution-api-version'], 'registry/2.0')

  const repository = 'library/alpine'
  const start = await context.app.inject({
    method: 'POST',
    url: `/v2/${repository}/blobs/uploads/`,
    headers: basic(context.admin),
  })
  assert.equal(start.statusCode, 202)
  const location = String(start.headers.location)
  assert.match(location, /^\/v2\/library\/alpine\/blobs\/uploads\//)

  const first = await context.app.inject({
    method: 'PATCH',
    url: location,
    headers: { ...basic(context.admin), 'content-type': 'application/octet-stream', 'content-range': '0-4' },
    payload: Buffer.from('hello'),
  })
  assert.equal(first.statusCode, 202)
  assert.equal(first.headers.range, '0-4')

  const outOfOrder = await context.app.inject({
    method: 'PATCH',
    url: location,
    headers: { ...basic(context.admin), 'content-type': 'application/octet-stream', 'content-range': '10-14' },
    payload: Buffer.from('later'),
  })
  assert.equal(outOfOrder.statusCode, 416)

  const digest = sha256('hello world')
  const commit = await context.app.inject({
    method: 'PUT',
    url: `${location}?digest=sha256:${digest}`,
    headers: { ...basic(context.admin), 'content-type': 'application/octet-stream', 'content-range': '5-10' },
    payload: Buffer.from(' world'),
  })
  assert.equal(commit.statusCode, 201)
  assert.equal(commit.headers['docker-content-digest'], `sha256:${digest}`)

  const blob = await context.app.inject({
    method: 'GET',
    url: `/v2/${repository}/blobs/sha256:${digest}`,
    headers: basic(context.admin),
  })
  assert.equal(blob.statusCode, 200)
  assert.equal(blob.body, 'hello world')

  const ranged = await context.app.inject({
    method: 'GET',
    url: `/v2/${repository}/blobs/sha256:${digest}`,
    headers: { ...basic(context.admin), range: 'bytes=0-4' },
  })
  assert.equal(ranged.statusCode, 206)
  assert.equal(ranged.body, 'hello')
  assert.equal(ranged.headers['content-range'], 'bytes 0-4/11')

  // A lying digest must never persist the bytes under the claimed address.
  const badStart = await context.app.inject({ method: 'POST', url: `/v2/${repository}/blobs/uploads/`, headers: basic(context.admin) })
  const badLocation = String(badStart.headers.location)
  await context.app.inject({ method: 'PATCH', url: badLocation, headers: { ...basic(context.admin), 'content-type': 'application/octet-stream' }, payload: Buffer.from('abc') })
  const wrongDigest = sha256('xyz')
  const rejected = await context.app.inject({
    method: 'PUT',
    url: `${badLocation}?digest=sha256:${wrongDigest}`,
    headers: { ...basic(context.admin), 'content-type': 'application/octet-stream' },
  })
  assert.equal(rejected.statusCode, 400)
  const notStored = await context.app.inject({
    method: 'GET',
    url: `/v2/${repository}/blobs/sha256:${wrongDigest}`,
    headers: basic(context.admin),
  })
  assert.equal(notStored.statusCode, 404)

  const manifest = JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: { digest: `sha256:${digest}`, size: 11, mediaType: 'application/vnd.oci.image.config.v1+json' }, layers: [] })
  const put = await context.app.inject({
    method: 'PUT',
    url: `/v2/${repository}/manifests/v1`,
    headers: { ...basic(context.admin), 'content-type': 'application/vnd.oci.image.manifest.v1+json' },
    payload: manifest,
  })
  assert.equal(put.statusCode, 201)
  const manifestDigest = sha256(manifest)
  assert.equal(put.headers['docker-content-digest'], `sha256:${manifestDigest}`)

  const byTag = await context.app.inject({
    method: 'GET',
    url: `/v2/${repository}/manifests/v1`,
    headers: basic(context.admin),
  })
  assert.equal(byTag.statusCode, 200)
  assert.equal(byTag.body, manifest)

  const tags = await context.app.inject({
    method: 'GET',
    url: `/v2/${repository}/tags/list`,
    headers: basic(context.admin),
  })
  assert.equal(tags.statusCode, 200)
  assert.deepEqual(JSON.parse(tags.body), { name: repository, tags: ['v1'] })

  const catalog = await context.app.inject({ method: 'GET', url: '/v2/_catalog', headers: basic(context.admin) })
  assert.equal(catalog.statusCode, 200)
  assert.deepEqual(JSON.parse(catalog.body).repositories, [repository])

  const console = await context.app.inject({
    method: 'GET',
    url: '/api/v1/registry/repositories',
    headers: bearer(context.admin),
  })
  assert.equal(console.statusCode, 200)
  assert.deepEqual(JSON.parse(console.body), [{ repository, tags: ['v1'] }])

  const removed = await context.app.inject({
    method: 'DELETE',
    url: `/v2/${repository}/manifests/v1`,
    headers: basic(context.admin),
  })
  assert.equal(removed.statusCode, 202)
  const gone = await context.app.inject({
    method: 'GET',
    url: `/v2/${repository}/manifests/v1`,
    headers: basic(context.admin),
  })
  assert.equal(gone.statusCode, 404)
})
