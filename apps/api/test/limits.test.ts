import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { FsStorageDriver } from '../src/core/index.js'
import type { ObjectMetadataInput } from '../src/core/index.js'
import { enforceSizeLimit, HttpProblem } from '../src/limits.js'

const metadata: ObjectMetadataInput = {
  filename: 'large.png',
  content_type: 'image/png',
  uploader: 'test',
}

void test('stream size limit aborts before commit and cleans its temporary file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'echolog-size-limit-'))
  try {
    const driver = new FsStorageDriver({ root, quotaBytes: 100 })
    const incoming = Readable.from([Buffer.from('1234'), Buffer.from('56789')])
    await assert.rejects(
      driver.putStream(enforceSizeLimit(incoming, 8), metadata),
      (error: unknown) => error instanceof HttpProblem && error.statusCode === 413,
    )
    assert.deepEqual(await readdir(join(root, 'objects')), [])
    assert.deepEqual(await readdir(join(root, 'metadata')), [])
    assert.deepEqual(await readdir(join(root, 'tmp')), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
