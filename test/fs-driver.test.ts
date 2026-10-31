import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { FsStorageDriver, ObjectHeldError, QuotaExceededError, sha256Hex } from '../src/core/index.js'
import type { ObjectMetadataInput } from '../src/core/index.js'

const metadata: ObjectMetadataInput = {
  filename: 'sample.bin',
  content_type: 'application/octet-stream',
  uploader: 'test-user',
  scan: 'skipped',
  tags: ['fixture'],
}

async function withStore<T>(
  quotaBytes: number,
  run: (driver: FsStorageDriver, root: string) => Promise<T>,
  now: () => Date = () => new Date(),
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'echolog-fs-'))
  try {
    return await run(new FsStorageDriver({ root, quotaBytes, now }), root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function* stream(...chunks: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const chunk of chunks) yield chunk
}

void test('fs driver deduplicates bytes and preserves the first immutable object and sidecar', async () => {
  await withStore(100, async (driver, root) => {
    const bytes = new TextEncoder().encode('immutable bytes')
    const first = await driver.putStream(stream(bytes), metadata)
    const second = await driver.putStream(stream(new Uint8Array(bytes)), { ...metadata, filename: 'changed.bin' })
    assert.equal(first.object_key, `sha256/${await sha256Hex(bytes)}`)
    assert.equal(second.object_key, first.object_key)
    assert.equal(second.filename, 'sample.bin')
    assert.deepEqual((await driver.get(first.object_key))?.bytes, bytes)
    assert.deepEqual(await readFile(join(root, 'metadata', `${first.digest}.json`), 'utf8'), JSON.stringify(first))
  })
})

void test('interrupted stream leaves no visible object and removes its temporary file', async () => {
  await withStore(100, async (driver, root) => {
    async function* interrupted() {
      yield new TextEncoder().encode('partial')
      throw new Error('simulated interrupted upload')
    }
    await assert.rejects(driver.putStream(interrupted(), metadata), /simulated interrupted upload/)
    assert.deepEqual(await readdir(join(root, 'objects')), [])
    assert.deepEqual(await readdir(join(root, 'metadata')), [])
    assert.deepEqual(await readdir(join(root, 'tmp')), [])
  })
})

void test('before-publish policy failure leaves a new object invisible', async () => {
  await withStore(100, async (driver, root) => {
    const bytes = new TextEncoder().encode('private before publish')
    let observedKey = ''
    await assert.rejects(driver.putStream(stream(bytes), metadata, async (sidecar, existing) => {
      observedKey = sidecar.object_key
      assert.equal(existing, false)
      assert.equal(await driver.get(sidecar.object_key), null, 'readers cannot observe bytes before the policy callback completes')
      throw new Error('private marker unavailable')
    }), /private marker unavailable/)
    assert.ok(observedKey)
    assert.equal(await driver.get(observedKey), null)
    assert.deepEqual(await readdir(join(root, 'objects')), [])
    assert.deepEqual(await readdir(join(root, 'metadata')), [])
    assert.deepEqual(await readdir(join(root, 'tmp')), [])
  })
})

void test('legal hold and active retention prevent deletion and GC reports held objects', async () => {
  await withStore(100, async (driver) => {
    const held = await driver.putStream(stream(new TextEncoder().encode('held')), { ...metadata, legal_hold: true })
    const retained = await driver.putStream(stream(new TextEncoder().encode('retained')), {
      ...metadata,
      retention_until: '2999-01-01T00:00:00.000Z',
    })
    await assert.rejects(driver.delete(held.object_key), (error: unknown) => error instanceof ObjectHeldError && error.reason === 'legal_hold')
    await assert.rejects(driver.delete(retained.object_key), (error: unknown) => error instanceof ObjectHeldError && error.reason === 'retention_active')
    const result = await driver.gc(new Date('2026-01-01T00:00:00.000Z'))
    assert.deepEqual(result.deleted, [])
    assert.deepEqual(result.held.map(({ object_key, reason }) => ({ object_key, reason })), [
      { object_key: held.object_key, reason: 'legal_hold' },
      { object_key: retained.object_key, reason: 'retention_active' },
    ])
  })
})

void test('quota blocks new objects and GC removes expired bytes', async () => {
  await withStore(5, async (driver, root) => {
    const bytes = new TextEncoder().encode('12345')
    const stored = await driver.putStream(stream(bytes), { ...metadata, retention_until: '2020-01-01T00:00:00.000Z' })
    await assert.rejects(driver.putStream(stream(new TextEncoder().encode('x')), metadata), QuotaExceededError)
    assert.deepEqual(await readdir(join(root, 'tmp')), [])
    const result = await driver.gc(new Date('2026-01-01T00:00:00.000Z'))
    assert.deepEqual(result.deleted, [stored.object_key])
    assert.equal(result.bytes_freed, 5)
    assert.equal(await driver.get(stored.object_key), null)
  })
})

void test('GC removes an object left without a sidecar by an interrupted commit', async () => {
  await withStore(100, async (driver, root) => {
    const bytes = new TextEncoder().encode('orphaned')
    const digest = await sha256Hex(bytes)
    await mkdir(join(root, 'objects'), { recursive: true })
    await writeFile(join(root, 'objects', digest), bytes)
    const result = await driver.gc()
    assert.deepEqual(result.deleted, [`sha256/${digest}`])
    assert.equal(result.bytes_freed, bytes.byteLength)
    assert.equal(await driver.get(`sha256/${digest}`), null)
  })
})

void test('get rejects same-size on-disk corruption against the content digest', async () => {
  await withStore(100, async (driver, root) => {
    const bytes = new TextEncoder().encode('before')
    const stored = await driver.putStream(stream(bytes), metadata)
    await writeFile(join(root, 'objects', stored.digest), new TextEncoder().encode('broken'))
    assert.equal(await driver.get(stored.object_key), null)
  })
})

void test('delete becomes available once retention has expired', async () => {
  const now = new Date('2026-10-27T00:00:00.000Z')
  await withStore(100, async (driver) => {
    const stored = await driver.putStream(stream(new TextEncoder().encode('retained')), {
      ...metadata,
      retention_until: '2026-10-27T00:00:00.000Z',
    })
    assert.equal(await driver.get(stored.object_key) !== null, true)
    await driver.delete(stored.object_key)
    assert.equal(await driver.get(stored.object_key), null)
  }, () => now)
})

void test('driver rejects a non-content-addressed key and malformed sidecar', async () => {
  await withStore(100, async (driver) => {
    await assert.rejects(
      driver.put('sha256/0000000000000000000000000000000000000000000000000000000000000000', new TextEncoder().encode('x'), {
        ...metadata,
        object_key: 'sha256/0000000000000000000000000000000000000000000000000000000000000000',
        digest: '0'.repeat(64),
        size: 1,
        created_at: new Date().toISOString(),
        retention_until: null,
        legal_hold: false,
        scan: 'skipped',
        tags: [],
      }),
      /must match the uploaded bytes/,
    )
    await assert.rejects(driver.get('../metadata'), /Object key must be/)
  })
})

void test('driver refuses an object-directory symlink that points outside the storage root', async (t) => {
  const outside = await mkdtemp(join(tmpdir(), 'echolog-outside-'))
  try {
    await withStore(100, async (driver, root) => {
      const bytes = new TextEncoder().encode('safe object')
      const stored = await driver.putStream(stream(bytes), metadata)
      const objectDirectory = join(root, 'objects')
      const outsidePath = join(outside, 'objects')
      await mkdir(outsidePath)
      await writeFile(join(outsidePath, stored.digest), bytes)
      await rm(objectDirectory, { recursive: true })
      try {
        await symlink(outsidePath, objectDirectory, 'junction')
      } catch {
        t.skip('the current Windows environment does not permit creating a directory junction')
        return
      }
      await assert.rejects(driver.get(stored.object_key), /Unsafe storage directory/)
      assert.deepEqual(await readdir(outsidePath), [stored.digest])
    })
  } finally {
    await rm(outside, { recursive: true, force: true })
  }
})
