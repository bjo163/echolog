import assert from 'node:assert/strict'
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { SignatureV4 } from '@smithy/signature-v4'
import type { HttpRequest } from '@smithy/types'
import { test, type TestContext } from 'node:test'
import { sha256Hex } from '../src/core/index.js'
import { FsStorageDriver } from '../src/core/index.js'
import { closeDatabase, createUser, issueApiKey, openDatabase, type EchologDatabase } from '../src/db.js'
import { parseConfig } from '../src/config.js'
import { createEchologServer } from '../src/server.js'
import { FsS3KeyStore } from '../src/modules/s3/store.js'

const BUCKET = 'echolog-test-bucket'
const ACCESS_KEY = 'echolog-test-access-key'
const SECRET_KEY = 'echolog-test-secret-key-for-sigv4-only'
const REGION = 'us-east-1'

/** Standalone identity for the test run: one administrator and one admin API key. */
function openTestDatabase(): { database: EchologDatabase; adminToken: string } {
  const database = openDatabase(':memory:')
  createUser(database, { login: 'admin', password: 'test-only-password', role: 'admin' })
  return { database, adminToken: issueApiKey(database, 'tester', 'admin').token }
}

async function getAvailablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return address.port
}

async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'echolog-s3-server-'))
  const port = await getAvailablePort()
  const identity = openTestDatabase()
  const config = parseConfig({
    NODE_ENV: 'test',
    ECHOLOG_STORAGE_ROOT: root,
    ECHOLOG_S3_BUCKET: BUCKET,
    ECHOLOG_S3_REGION: REGION,
    ECHOLOG_S3_ACCESS_KEY_ID: ACCESS_KEY,
    ECHOLOG_S3_SECRET_ACCESS_KEY: SECRET_KEY,
    ECHOLOG_GRANT_SECRET: 'echolog-test-grant-secret-0000000000000000001',
    ECHOLOG_MAX_UPLOAD_BYTES: '1048576',
  }, ['--port', String(port)])
  const app = createEchologServer(config, { database: identity.database })
  const endpoint = await app.listen({ host: '127.0.0.1', port })
  const client = new S3Client({
    region: REGION,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  })
  t.after(async () => {
    client.destroy()
    await app.close()
    closeDatabase(identity.database)
    await rm(root, { recursive: true, force: true })
  })
  return { app, client, endpoint, root, identity }
}

void test('ECHOLOG serves path-style single-bucket S3 operations through the AWS SDK', async (t) => {
  const { client } = await setup(t)
  const key = `backups/${globalThis.crypto.randomUUID()}.dump`
  const payload = Buffer.from('synthetic backup bytes')

  await client.send(new HeadBucketCommand({ Bucket: BUCKET }))
  const put = await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: payload, ContentType: 'application/octet-stream' }))
  assert.match(put.ETag ?? '', /^"[a-f0-9]{32}"$/)

  const head = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
  assert.equal(head.ContentLength, payload.byteLength)
  assert.equal(head.ContentType, 'application/octet-stream')
  assert.match(head.Metadata?.['echolog-digest'] ?? '', /^[a-f0-9]{64}$/)

  const get = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  // transformToByteArray() yields a plain Uint8Array; compare bytes, not the Buffer prototype.
  assert.deepEqual(Buffer.from(await get.Body?.transformToByteArray() ?? new Uint8Array()), payload)

  const listed = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'backups/' }))
  assert.equal(listed.KeyCount, 1)
  assert.equal(listed.Contents?.[0]?.Key, key)

  const duplicate = await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: payload, ContentType: 'application/octet-stream' }))
  assert.equal(duplicate.ETag, put.ETag)
  await assert.rejects(
    client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.from('different bytes'), ContentType: 'application/octet-stream' })),
    (error: unknown) => Boolean(error && typeof error === 'object' && '$metadata' in error && error.$metadata && typeof error.$metadata === 'object' && 'httpStatusCode' in error.$metadata && error.$metadata.httpStatusCode === 409),
  )

  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  const empty = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'backups/' }))
  assert.equal(empty.KeyCount, 0)
})

void test('private witness markers hide every S3 alias and keep the object through GC', async (t) => {
  const { app, client, root, identity } = await setup(t)
  const key = `private/${globalThis.crypto.randomUUID()}.bin`
  const payload = Buffer.from('synthetic private witness bytes')
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: payload,
    ContentType: 'application/octet-stream',
    Metadata: { 'echolog-private-witness': 'true' },
  }))
  const digest = await sha256Hex(new Uint8Array(payload))
  const markerMatch = await app.inject({
    method: 'POST',
    url: `/api/v1/objects/sha256/${digest}/private-witness`,
    headers: { authorization: `Bearer ${identity.adminToken}`, 'content-type': 'application/json' },
    payload: { objectKey: key, requireAlreadyMarked: true },
  })
  assert.equal(markerMatch.statusCode, 200, 'the marker resolves a matching opaque S3 index key for the digest')
  const markerMismatch = await app.inject({
    method: 'POST',
    url: `/api/v1/objects/sha256/${digest}/private-witness`,
    headers: { authorization: `Bearer ${identity.adminToken}`, 'content-type': 'application/json' },
    payload: { objectKey: 'private/not-the-indexed-key.bin', requireAlreadyMarked: true },
  })
  assert.equal(markerMismatch.statusCode, 404, 'the marker rejects a namespace key that does not resolve to this digest')
  const lateAlias = `private-late-alias/${globalThis.crypto.randomUUID()}.bin`
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: lateAlias, Body: payload, ContentType: 'application/octet-stream' }))

  const driver = new FsStorageDriver({ root, quotaBytes: 10 * 1024 * 1024 })
  const store = new FsS3KeyStore({ root, driver })
  assert.equal(await store.isPrivateWitness(digest), true, 'the signed S3 upload header marks the digest before publication')
  assert.equal(await store.get(key), null)
  assert.equal(await store.head(key), null)
  const listing = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'private/' }))
  assert.equal(listing.KeyCount, 0)
  await assert.rejects(client.send(new GetObjectCommand({ Bucket: BUCKET, Key: lateAlias })), (error: unknown) =>
    Boolean(error && typeof error === 'object' && '$metadata' in error && error.$metadata
      && typeof error.$metadata === 'object' && 'httpStatusCode' in error.$metadata && error.$metadata.httpStatusCode === 404))
  await assert.rejects(client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })), (error: unknown) =>
    Boolean(error && typeof error === 'object' && '$metadata' in error && error.$metadata
      && typeof error.$metadata === 'object' && 'httpStatusCode' in error.$metadata && error.$metadata.httpStatusCode === 404))
  await assert.rejects(client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key })), (error: unknown) =>
    Boolean(error && typeof error === 'object' && '$metadata' in error && error.$metadata
      && typeof error.$metadata === 'object' && 'httpStatusCode' in error.$metadata && error.$metadata.httpStatusCode === 404))
  await assert.rejects(client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })), (error: unknown) =>
    Boolean(error && typeof error === 'object' && '$metadata' in error && error.$metadata
      && typeof error.$metadata === 'object' && 'httpStatusCode' in error.$metadata && error.$metadata.httpStatusCode === 404))

  const collected = await store.collect(new Date(Date.now() + 60_000))
  assert.equal(collected.deleted.includes(`sha256/${digest}`), false)
  assert.ok(await driver.get(`sha256/${digest}`))
  const restartedStore = new FsS3KeyStore({ root, driver })
  assert.equal(await restartedStore.isPrivateWitness(digest), true)
})

void test('ListObjectsV2 delimiter pages advance beyond a returned common prefix', async (t) => {
  const { client } = await setup(t)
  for (const key of ['pages/a/one.txt', 'pages/a/two.txt', 'pages/b/one.txt', 'pages/😀/one.txt']) {
    await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.from(key), ContentType: 'application/octet-stream' }))
  }
  const first = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'pages/', Delimiter: '/', MaxKeys: 1 }))
  assert.deepEqual(first.CommonPrefixes?.map(({ Prefix }) => Prefix), ['pages/a/'])
  assert.equal(first.IsTruncated, true)
  assert.ok(first.NextContinuationToken)
  const second = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'pages/', Delimiter: '/', MaxKeys: 1, ContinuationToken: first.NextContinuationToken }))
  assert.deepEqual(second.CommonPrefixes?.map(({ Prefix }) => Prefix), ['pages/b/'])
  assert.notEqual(second.NextContinuationToken, first.NextContinuationToken)
  const third = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'pages/', Delimiter: '/', MaxKeys: 1, ContinuationToken: second.NextContinuationToken }))
  assert.deepEqual(third.CommonPrefixes?.map(({ Prefix }) => Prefix), ['pages/😀/'])
})

void test('ListObjectsV2 continuation orders mixed-case and punctuation keys without skipping', async (t) => {
  const { client } = await setup(t)
  const keys = ['ordered/A', 'ordered/a', 'ordered/!', 'ordered/_', 'ordered/-']
  for (const key of keys) {
    await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.from(key), ContentType: 'application/octet-stream' }))
  }

  const actual: string[] = []
  let continuationToken: string | undefined
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'ordered/',
      MaxKeys: 1,
      ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
    }))
    actual.push(...(page.Contents ?? []).map(({ Key }) => Key ?? ''))
    continuationToken = page.NextContinuationToken
  } while (continuationToken)

  const expected = [...keys].sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')))
  assert.deepEqual(actual, expected)
})

void test('ListObjectsV2 with max-keys zero returns a resumable empty page', async (t) => {
  const { client } = await setup(t)
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: 'zero/first', Body: Buffer.from('first'), ContentType: 'application/octet-stream' }))

  const emptyPage = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'zero/', MaxKeys: 0 }))
  assert.deepEqual(emptyPage.Contents ?? [], [])
  assert.equal(emptyPage.KeyCount, 0)
  assert.equal(emptyPage.IsTruncated, true)
  assert.ok(emptyPage.NextContinuationToken)

  const resumedPage = await client.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: 'zero/',
    MaxKeys: 1,
    ContinuationToken: emptyPage.NextContinuationToken,
  }))
  assert.deepEqual(resumedPage.Contents?.map(({ Key }) => Key), ['zero/first'])
})

void test('S3 namespace publication and GC serialize so concurrent uploads remain readable', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'echolog-s3-gc-'))
  t.after(async () => rm(root, { recursive: true, force: true }))
  const driver = new FsStorageDriver({ root, quotaBytes: 1024 * 1024 })
  const keys = new FsS3KeyStore({ root, driver })
  await Promise.all([keys.ready(), driver.ready()])
  const payloads = Array.from({ length: 12 }, (_, index) => Buffer.from(`published during collection ${index}`))
  await Promise.all(payloads.flatMap((payload, index) => [
    keys.put(`gc/concurrent-${index}.bin`, payload, 'application/octet-stream'),
    keys.collect(new Date(Date.now() + 1000)),
  ]))
  for (const [index, payload] of payloads.entries()) {
    const result = await keys.get(`gc/concurrent-${index}.bin`)
    assert.ok(result)
    assert.deepEqual(Buffer.from(result.bytes), payload)
  }
})

void test('S3 rejects unsupported operations and untrusted or oversized bodies before persistence', async (t) => {
  const { endpoint, root } = await setup(t)
  for (const suffix of ['?acl', '?versionId=abc', '?delete']) {
    const response = await signedPut(endpoint, `/${BUCKET}/query-rejected${suffix}`, Buffer.from('must not persist'))
    assert.equal(response.status, 501)
    assert.match(response.text, /NotImplemented/)
  }
  const tampered = await signedPut(endpoint, `/${BUCKET}/query-rejected-tampered`, Buffer.from('signed bytes'), Buffer.from('changed bytes'))
  assert.equal(tampered.status, 403)
  assert.match(tampered.text, /SignatureDoesNotMatch/)
  const unsignedPrivatePayload = Buffer.from('unsigned private policy')
  const unsignedPrivateFlag = await signedPut(
    endpoint,
    `/${BUCKET}/unsigned-private-flag`,
    unsignedPrivatePayload,
    unsignedPrivatePayload,
    'PUT',
    { 'x-amz-meta-echolog-private-witness': 'true' },
  )
  assert.equal(unsignedPrivateFlag.status, 501, 'privacy-affecting metadata must be included in SigV4 SignedHeaders')
  const postPayload = Buffer.from('POST body must not be stored')
  const post = await signedPut(endpoint, `/${BUCKET}/unsupported-post`, postPayload, postPayload, 'POST')
  assert.equal(post.status, 501)
  assert.match(post.text, /NotImplemented/)
  const oversizedPayload = Buffer.alloc(1024 * 1024 + 1, 0x7a)
  const oversized = await signedPut(endpoint, `/${BUCKET}/oversized`, oversizedPayload)
  assert.equal(oversized.status, 413)
  assert.match(oversized.text, /EntityTooLarge/)
  assert.deepEqual(await findMarker(root, 'must not persist'), [])
  assert.deepEqual(await findMarker(root, 'unsigned private policy'), [])
  assert.deepEqual(await findMarker(root, 'POST body must not be stored'), [])
  assert.deepEqual(await findMarker(root, 'z'.repeat(32)), [])
})

void test('ECHOLOG rejects bad signatures, stale dates, traversal paths and unsupported multipart without writing', async (t) => {
  const { client, endpoint, root } = await setup(t)
  const badClient = new S3Client({
    region: REGION,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: `${SECRET_KEY}-wrong` },
  })
  t.after(() => badClient.destroy())
  await assert.rejects(badClient.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: 'backups/invalid-signature.bin',
    Body: Buffer.from('must not persist'),
    ContentType: 'application/octet-stream',
  })))

  const staleUrl = new URL(`/${BUCKET}/backups/stale.bin`, endpoint)
  const stalePayload = Buffer.from('must not persist')
  const signer = new SignatureV4({
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    region: REGION,
    service: 's3',
    sha256: TestSha256,
    uriEscapePath: false,
  })
  const staleRequest: HttpRequest = {
    protocol: staleUrl.protocol,
    hostname: staleUrl.hostname,
    port: Number(staleUrl.port),
    method: 'PUT',
    path: staleUrl.pathname,
    query: {},
    headers: {
      host: staleUrl.host,
      'content-type': 'application/octet-stream',
      'x-amz-content-sha256': await sha256Hex(stalePayload),
    },
    body: stalePayload,
  }
  const signed = await signer.sign(staleRequest, { signingDate: new Date(Date.now() - 10 * 60 * 1000) })
  const staleResponse = await fetch(staleUrl, { method: 'PUT', headers: signed.headers, body: stalePayload })
  assert.equal(staleResponse.status, 403)
  assert.match(await staleResponse.text(), /RequestTimeTooSkewed/)

  const traversal = await fetch(`${endpoint}/${BUCKET}/%2e%2e/escape`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: 'must not persist' })
  assert.notEqual(traversal.status, 200)

  // Signed traversal attempts must fail on the server itself, not only in the client.
  const encoded = await signedPut(endpoint, `/${BUCKET}/..%2Fescape`, Buffer.from('must not persist'))
  assert.equal(encoded.status, 400)
  assert.match(encoded.text, /InvalidObjectName/)
  const dotSegment = await signedPut(endpoint, `/${BUCKET}/../escape`, Buffer.from('must not persist'))
  assert.equal(dotSegment.status, 400)
  assert.match(dotSegment.text, /InvalidObjectName/)
  const encodedDotDot = await signedPut(endpoint, `/${BUCKET}/%2e%2e/escape`, Buffer.from('must not persist'))
  assert.ok((encodedDotDot.status ?? 0) >= 400, `expected traversal probe to fail, got ${encodedDotDot.status}`)
  await assert.rejects(client.send(new PutObjectCommand({ Bucket: BUCKET, Key: '../escape', Body: Buffer.from('must not persist'), ContentType: 'application/octet-stream' })))

  await assert.rejects(client.send(new (await import('@aws-sdk/client-s3')).CreateMultipartUploadCommand({ Bucket: BUCKET, Key: 'backups/multipart.bin' })))
  const after = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'backups/' }))
  assert.equal(after.KeyCount, 0)
  // No rejected request may have persisted its payload anywhere in the storage volume.
  assert.deepEqual(await findMarker(root, 'must not persist'), [])
})

/**
 * PUT a payload to an exact raw request target (no URL normalisation) with a valid SigV4
 * header signature, so server-side path validation is what decides the outcome.
 */
async function signedPut(
  endpoint: string,
  rawPath: string,
  body: Buffer,
  transmittedBody = body,
  method = 'PUT',
  unsignedHeaders: Record<string, string> = {},
): Promise<{ status: number; text: string }> {
  const url = new URL(endpoint)
  const target = new URL(rawPath, endpoint)
  const rawTargetPath = rawPath.split('?', 1)[0] ?? rawPath
  const query: Record<string, string | string[]> = {}
  for (const [name, value] of target.searchParams) {
    const current = query[name]
    if (current === undefined) query[name] = value
    else if (Array.isArray(current)) current.push(value)
    else query[name] = [current, value]
  }
  const signer = new SignatureV4({
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    region: REGION,
    service: 's3',
    sha256: TestSha256,
    uriEscapePath: false,
  })
  const request: HttpRequest = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: Number(url.port),
    method,
    path: rawTargetPath,
    query,
    headers: {
      host: url.host,
      'content-type': 'application/octet-stream',
      'x-amz-content-sha256': await sha256Hex(body),
    },
    body,
  }
  const signed = await signer.sign(request, { signingDate: new Date() })
  return await new Promise((resolve, reject) => {
    const outbound = httpRequest(
      { host: url.hostname, port: Number(url.port), method, path: rawPath, headers: { ...signed.headers, ...unsignedHeaders } },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('end', () => resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString() }))
      },
    )
    outbound.on('error', reject)
    outbound.end(transmittedBody)
  })
}

/** Every file under `dir` whose bytes contain `marker`, proving writes did not happen. */
async function findMarker(dir: string, marker: string): Promise<string[]> {
  const matches: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) matches.push(...await findMarker(path, marker))
    else if (entry.isFile() && (await readFile(path)).includes(marker)) matches.push(path)
  }
  return matches
}

class TestSha256 {
  private readonly chunks: Uint8Array[] = []
  private readonly secret: Uint8Array | undefined

  constructor(secret?: string | ArrayBuffer | ArrayBufferView) {
    // SigV4 derives the signing key with HMAC-SHA256, so a keyed digest must be an HMAC.
    this.secret = secret === undefined ? undefined : toBytes(secret)
  }

  update(value: string | ArrayBuffer | ArrayBufferView): void {
    this.chunks.push(toBytes(value))
  }

  async digest(): Promise<Uint8Array> {
    const data = joinBytes(this.chunks)
    if (!this.secret) return new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(data)))
    const key = await crypto.subtle.importKey('raw', toArrayBuffer(this.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, toArrayBuffer(data)))
  }
}

function toBytes(value: string | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (typeof value === 'string') return new TextEncoder().encode(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(new Uint8Array(value))
  return new Uint8Array(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
}

/** Web Crypto wants a standalone ArrayBuffer, not a view over a pooled or shared one. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function joinBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined
}
