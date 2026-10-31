import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { md5Hex, sha256Hex, type ObjectSidecar } from '../src/core/index.js'
import { parseConfig } from '../src/config.js'
import { createEchologServer } from '../src/server.js'
import { createUser, issueApiKey, openDatabase } from '../src/db.js'

const GRANT_SECRET = 'echolog-e2e-grant-secret-0000000000000000001'
const BUCKET = 'echolog-e2e-bucket'
const ACCESS_KEY = 'echolog-e2e-access-key'
const SECRET_KEY = 'echolog-e2e-secret-key-for-sigv4-only'
const REGION = 'us-east-1'

interface RestErrorBody {
  error?: { code?: string; message?: string }
}

interface GcBody {
  deleted: string[]
  held: Array<{ object_key: string; reason: string }>
  bytes_freed: number
}

/**
 * M39-12 end-to-end proof: one service instance and one storage root exercised through BOTH
 * surfaces (the M39-09 REST API and the M39-10 bounded S3-compatible endpoint) in a single
 * run, followed by a real stop/restart that proves every object, sidecar and key record on
 * the rollback volume survives intact.
 */
void test('M39-12 round trip: REST and S3 share one storage, hold refuses delete on both surfaces, restart leaves every object intact', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'echolog-e2e-roundtrip-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const config = parseConfig({
    NODE_ENV: 'test',
    ECHOLOG_STORAGE_ROOT: root,
    ECHOLOG_DATABASE_PATH: join(root, 'echolog.db'),
    ECHOLOG_GRANT_SECRET: GRANT_SECRET,
    ECHOLOG_S3_BUCKET: BUCKET,
    ECHOLOG_S3_REGION: REGION,
    ECHOLOG_S3_ACCESS_KEY_ID: ACCESS_KEY,
    ECHOLOG_S3_SECRET_ACCESS_KEY: SECRET_KEY,
    ECHOLOG_MAX_UPLOAD_BYTES: '1048576',
    ECHOLOG_ALLOWED_MIME_TYPES: 'image/png,application/octet-stream',
  })

  // Identity lives in the same directory as the storage root, so the restart
  // below proves the credential store survives alongside the objects.
  const database = openDatabase(join(root, 'echolog.db'))
  createUser(database, { login: 'admin', password: 'e2e-only-password', role: 'admin' })
  const adminToken = issueApiKey(database, 'e2e-runner', 'admin').token

  const appA = createEchologServer(config, { database })
  t.after(() => appA.close())

  const endpointA = await appA.listen({ host: '127.0.0.1', port: 0 })
  const s3A = new S3Client({
    region: REGION,
    endpoint: endpointA,
    forcePathStyle: true,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  })
  t.after(() => s3A.destroy())
  const serviceHeaders = { authorization: `Bearer ${adminToken}` }

  // --- readiness -------------------------------------------------------------
  const readyA = await (await fetch(`${endpointA}/health/ready`)).json() as { status: string; storage: string }
  assert.deepEqual(readyA, { status: 'ready', app: 'echolog', storage: 'fs' })

  // --- surface 1: REST upload, write-once idempotency, grant download --------
  const payload = Buffer.from(crypto.getRandomValues(new Uint8Array(2048)))
  const digest = await sha256Hex(payload)
  const upload = await fetch(`${endpointA}/api/v1/objects`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'content-type': 'image/png', 'x-filename': 'witness-first.png' },
    body: payload,
  })
  assert.equal(upload.status, 201)
  const firstSidecar = await upload.json() as ObjectSidecar
  assert.equal(firstSidecar.object_key, `sha256/${digest}`)
  assert.equal(firstSidecar.digest, digest)
  assert.equal(firstSidecar.size, payload.byteLength)
  assert.equal(firstSidecar.content_type, 'image/png')
  assert.equal(firstSidecar.filename, 'witness-first.png')

  const reupload = await fetch(`${endpointA}/api/v1/objects`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'content-type': 'image/png', 'x-filename': 'must-not-replace.png' },
    body: payload,
  })
  assert.equal(reupload.status, 201)
  assert.deepEqual(await reupload.json(), firstSidecar, 'identical bytes must return the first sidecar unchanged')

  const grantResponse = await fetch(`${endpointA}/api/v1/objects/${firstSidecar.object_key}`, { headers: serviceHeaders })
  assert.equal(grantResponse.status, 200)
  const grant = await grantResponse.json() as { url: string; expires_at: string }
  const grantTtlMs = Date.parse(grant.expires_at) - Date.now()
  assert.ok(grantTtlMs > 0 && grantTtlMs <= 5 * 60 * 1000, 'grant must live at most five minutes')
  const downloadedA = await fetch(`${endpointA}${grant.url}`)
  assert.equal(downloadedA.status, 200)
  assert.equal(downloadedA.headers.get('content-type'), 'image/png')
  const downloadedBytes = Buffer.from(await downloadedA.arrayBuffer())
  assert.deepEqual(downloadedBytes, payload)
  assert.equal(await sha256Hex(downloadedBytes), digest, 'downloaded bytes must re-hash to the content address')

  // --- surface 2: the same bytes over the bounded S3 endpoint ----------------
  const keyRoundtrip = `e2e/roundtrip-${crypto.randomUUID()}.bin`
  const keyTransient = `e2e/transient-${crypto.randomUUID()}.bin`
  const keyHold = `e2e/hold-${crypto.randomUUID()}.bin`
  const keyRetention = `e2e/retention-${crypto.randomUUID()}.bin`
  const keyCrossHold = `e2e/cross-hold-${crypto.randomUUID()}.bin`

  await s3A.send(new HeadBucketCommand({ Bucket: BUCKET }))
  const put = await s3A.send(new PutObjectCommand({ Bucket: BUCKET, Key: keyRoundtrip, Body: payload, ContentType: 'application/octet-stream' }))
  assert.equal(put.ETag, `"${md5Hex(payload)}"`)

  // The S3 key maps onto the same content-addressed object REST stored: one root, one store.
  const headShared = await s3A.send(new HeadObjectCommand({ Bucket: BUCKET, Key: keyRoundtrip }))
  assert.equal(headShared.Metadata?.['echolog-digest'], digest)
  assert.equal(headShared.ContentLength, payload.byteLength)
  const getS3 = await s3A.send(new GetObjectCommand({ Bucket: BUCKET, Key: keyRoundtrip }))
  assert.deepEqual(Buffer.from(await getS3.Body?.transformToByteArray() ?? new Uint8Array()), payload)
  const listedFirst = await s3A.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'e2e/' }))
  assert.deepEqual(listedFirst.Contents?.map((entry) => entry.Key) ?? [], [keyRoundtrip])

  // Write-once on the S3 surface: identical re-put is idempotent, different bytes are refused.
  const duplicatePut = await s3A.send(new PutObjectCommand({ Bucket: BUCKET, Key: keyRoundtrip, Body: payload, ContentType: 'application/octet-stream' }))
  assert.equal(duplicatePut.ETag, put.ETag)
  await assert.rejects(
    s3A.send(new PutObjectCommand({ Bucket: BUCKET, Key: keyRoundtrip, Body: Buffer.from('different bytes'), ContentType: 'application/octet-stream' })),
    (error: unknown) => s3Status(error) === 409,
  )

  // S3 deletes its own object: put a transient key, list it, delete it, confirm it is gone.
  const transientBytes = Buffer.from('transient-s3-object')
  await s3A.send(new PutObjectCommand({ Bucket: BUCKET, Key: keyTransient, Body: transientBytes, ContentType: 'application/octet-stream' }))
  const listedWithTransient = await s3A.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'e2e/' }))
  assert.equal(listedWithTransient.KeyCount, 2)
  await s3A.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keyTransient }))
  await assert.rejects(
    s3A.send(new GetObjectCommand({ Bucket: BUCKET, Key: keyTransient })),
    (error: unknown) => s3Status(error) === 404,
  )
  const listedAfterDelete = await s3A.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'e2e/' }))
  assert.deepEqual(listedAfterDelete.Contents?.map((entry) => entry.Key) ?? [], [keyRoundtrip])

  // --- retention and legal hold refuse delete on BOTH surfaces ---------------
  const restHoldBytes = Buffer.from('legal-hold-e2e')
  const restHoldDigest = await sha256Hex(restHoldBytes)
  const restHoldUpload = await fetch(`${endpointA}/api/v1/objects`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'content-type': 'image/png', 'x-filename': 'held.png', 'x-echolog-legal-hold': 'true' },
    body: restHoldBytes,
  })
  assert.equal(restHoldUpload.status, 201)
  const restHoldKey = (await restHoldUpload.json() as ObjectSidecar).object_key

  const restHeldDelete = await fetch(`${endpointA}/api/v1/objects/${restHoldKey}`, { method: 'DELETE', headers: serviceHeaders })
  assert.equal(restHeldDelete.status, 409)
  const restHeldBody = await restHeldDelete.json() as RestErrorBody
  assert.equal(restHeldBody.error?.code, 'legal_hold')
  assert.match(restHeldBody.error?.message ?? '', /protected/)

  const retentionUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const restRetentionUpload = await fetch(`${endpointA}/api/v1/objects`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'content-type': 'image/png', 'x-filename': 'retained.png', 'x-echolog-retention-until': retentionUntil },
    body: Buffer.from('retention-e2e'),
  })
  assert.equal(restRetentionUpload.status, 201)
  const restRetentionKey = (await restRetentionUpload.json() as ObjectSidecar).object_key
  const restRetentionDelete = await fetch(`${endpointA}/api/v1/objects/${restRetentionKey}`, { method: 'DELETE', headers: serviceHeaders })
  assert.equal(restRetentionDelete.status, 409)
  assert.equal((await restRetentionDelete.json() as RestErrorBody).error?.code, 'retention_active')

  await s3A.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: keyHold,
    Body: Buffer.from('s3-legal-hold-e2e'),
    ContentType: 'application/octet-stream',
    Metadata: { 'echolog-legal-hold': 'true' },
  }))
  await assert.rejects(
    s3A.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keyHold })),
    (error: unknown) => s3Status(error) === 409 && `${(error as Error).name} ${(error as Error).message}`.includes('ObjectLocked'),
  )

  await s3A.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: keyRetention,
    Body: Buffer.from('s3-retention-e2e'),
    ContentType: 'application/octet-stream',
    Metadata: { 'echolog-retention-until': retentionUntil },
  }))
  await assert.rejects(
    s3A.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keyRetention })),
    (error: unknown) => s3Status(error) === 409 && `${(error as Error).name} ${(error as Error).message}`.includes('ObjectLocked'),
  )

  // Unheld REST objects do delete cleanly (proves the 409 above is hold-specific).
  const transientRest = await fetch(`${endpointA}/api/v1/objects`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'content-type': 'image/png', 'x-filename': 'ephemeral.png' },
    body: Buffer.from('delete-me-e2e'),
  })
  assert.equal(transientRest.status, 201)
  const transientRestKey = (await transientRest.json() as ObjectSidecar).object_key
  const deletedRest = await fetch(`${endpointA}/api/v1/objects/${transientRestKey}`, { method: 'DELETE', headers: serviceHeaders })
  assert.equal(deletedRest.status, 204)
  assert.equal((await fetch(`${endpointA}/api/v1/objects/${transientRestKey}/meta`, { headers: serviceHeaders })).status, 404)

  // --- admin GC: held objects are reported, never deleted; the S3-deleted orphan is freed --
  const gcResponse = await fetch(`${endpointA}/api/v1/gc`, { method: 'POST', headers: serviceHeaders })
  assert.equal(gcResponse.status, 200)
  const gc = await gcResponse.json() as GcBody
  assert.deepEqual(gc.deleted, [`sha256/${await sha256Hex(transientBytes)}`], 'only the S3-deleted orphan may be freed')
  assert.equal(gc.bytes_freed, transientBytes.byteLength)
  const heldOrder = (left: { object_key: string }, right: { object_key: string }) => left.object_key.localeCompare(right.object_key)
  assert.deepEqual([...gc.held].sort(heldOrder), [
    { object_key: restHoldKey, reason: 'legal_hold' },
    { object_key: restRetentionKey, reason: 'retention_active' },
  ].sort(heldOrder))
  // GC never deletes what it holds: both protected objects remain present after the sweep.
  assert.equal((await fetch(`${endpointA}/api/v1/objects/${restHoldKey}/meta`, { headers: serviceHeaders })).status, 200)
  assert.equal((await fetch(`${endpointA}/api/v1/objects/${restRetentionKey}/meta`, { headers: serviceHeaders })).status, 200)

  // Cross-surface fail-closed: an S3 key holding the SAME bytes as the REST-held object
  // inherits the hold from the shared sidecar, so its delete must also fail with 409.
  // The S3 surface answers every protected delete with the single generic ObjectLocked
  // refusal — fail closed, no reason detail, delete never reaches the volume.
  const crossPut = await s3A.send(new PutObjectCommand({ Bucket: BUCKET, Key: keyCrossHold, Body: restHoldBytes, ContentType: 'application/octet-stream' }))
  assert.equal(crossPut.ETag, `"${md5Hex(restHoldBytes)}"`)
  await assert.rejects(
    s3A.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keyCrossHold })),
    (error: unknown) => s3Status(error) === 409 && `${(error as Error).name} ${(error as Error).message}`.includes('ObjectLocked'),
  )
  // The protected object is still fully readable through both surfaces after the refusal.
  const crossGet = await s3A.send(new GetObjectCommand({ Bucket: BUCKET, Key: keyCrossHold }))
  assert.deepEqual(Buffer.from(await crossGet.Body?.transformToByteArray() ?? new Uint8Array()), restHoldBytes)
  const crossMeta = await fetch(`${endpointA}/api/v1/objects/sha256/${restHoldDigest}/meta`, { headers: serviceHeaders })
  assert.equal(crossMeta.status, 200)
  assert.equal((await crossMeta.json() as ObjectSidecar).legal_hold, true, 'the shared sidecar stays the single protected version')

  // --- rollback: stop the service, prove the volume survives on disk ---------
  await appA.close()
  await assert.rejects(fetch(`${endpointA}/health`), 'the stopped instance must refuse connections')

  const restRetentionDigest = restRetentionKey.slice('sha256/'.length)
  const s3HoldBytes = Buffer.from('s3-legal-hold-e2e')
  const s3RetentionBytes = Buffer.from('s3-retention-e2e')
  const expectedObjects = [
    digest,
    restHoldDigest,
    restRetentionDigest,
    await sha256Hex(s3HoldBytes),
    await sha256Hex(s3RetentionBytes),
  ].sort()
  const objectFiles = (await readdir(join(root, 'objects'))).sort()
  assert.deepEqual(objectFiles, expectedObjects, 'every committed object must still be on disk with the service stopped')
  const sidecarFiles = (await readdir(join(root, 'metadata'))).sort()
  assert.deepEqual(sidecarFiles, expectedObjects.map((name) => `${name}.json`), 'every sidecar must survive the stop')
  const keyRecords = (await readdir(join(root, 's3-keys'))).filter((name) => name.endsWith('.json'))
  assert.equal(keyRecords.length, 4, 'the four live S3 key records must survive the stop')
  assert.deepEqual(await readdir(join(root, 'tmp')), [], 'no temporary file may outlive the service')

  const persistedHold = JSON.parse(await readFile(join(root, 'metadata', `${restHoldDigest}.json`), 'utf8')) as ObjectSidecar
  assert.equal(persistedHold.legal_hold, true)
  assert.equal(persistedHold.object_key, restHoldKey)

  // --- restart on the same storage root: both surfaces serve the old data ----
  const appB = createEchologServer(config, { database })
  t.after(() => appB.close())
  const endpointB = await appB.listen({ host: '127.0.0.1', port: 0 })
  const s3B = new S3Client({
    region: REGION,
    endpoint: endpointB,
    forcePathStyle: true,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  })
  t.after(() => s3B.destroy())

  const readyB = await (await fetch(`${endpointB}/health/ready`)).json() as { status: string; storage: string }
  assert.deepEqual(readyB, { status: 'ready', app: 'echolog', storage: 'fs' })

  const metaB = await fetch(`${endpointB}/api/v1/objects/${firstSidecar.object_key}/meta`, { headers: serviceHeaders })
  assert.equal(metaB.status, 200)
  assert.deepEqual(await metaB.json(), firstSidecar, 'the REST sidecar must be identical after a restart')

  const grantB = await (await fetch(`${endpointB}/api/v1/objects/${firstSidecar.object_key}`, { headers: serviceHeaders })).json() as { url: string }
  const downloadedB = Buffer.from(await (await fetch(`${endpointB}${grantB.url}`)).arrayBuffer())
  assert.deepEqual(downloadedB, payload, 'the original bytes must still be downloadable through a fresh grant')
  assert.equal(await sha256Hex(downloadedB), digest)

  const headB = await s3B.send(new HeadObjectCommand({ Bucket: BUCKET, Key: keyRoundtrip }))
  assert.equal(headB.Metadata?.['echolog-digest'], digest)
  const getB = await s3B.send(new GetObjectCommand({ Bucket: BUCKET, Key: keyRoundtrip }))
  assert.deepEqual(Buffer.from(await getB.Body?.transformToByteArray() ?? new Uint8Array()), payload)
  const listedB = await s3B.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'e2e/' }))
  assert.deepEqual(listedB.Contents?.map((entry) => entry.Key) ?? [], [keyCrossHold, keyHold, keyRetention, keyRoundtrip].sort())

  // Holds survived the restart: the refused deletes still refuse on both surfaces.
  const heldAfterRestart = await fetch(`${endpointB}/api/v1/objects/${restHoldKey}`, { method: 'DELETE', headers: serviceHeaders })
  assert.equal(heldAfterRestart.status, 409)
  assert.equal((await heldAfterRestart.json() as RestErrorBody).error?.code, 'legal_hold')
  await assert.rejects(
    s3B.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keyHold })),
    (error: unknown) => s3Status(error) === 409 && `${(error as Error).name} ${(error as Error).message}`.includes('ObjectLocked'),
  )
})

function s3Status(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('$metadata' in error)) return undefined
  const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
  return metadata?.httpStatusCode
}
