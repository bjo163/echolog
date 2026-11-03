import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  consumeShortLink,
  createShortLink,
  deleteShortLink,
  listActiveShortLinkObjectKeys,
  listAuditLogs,
  listShortLinks,
  openDatabase,
  purgeExpiredShortLinks,
  recordAuditLog,
  recordAuditLogSafe,
  resolveShortLink,
  type EchologDatabase,
} from '../src/db.js'

const DIGEST = 'a'.repeat(64)

async function withDatabase<T>(work: (database: EchologDatabase, directory: string) => Promise<T> | T): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'echolog-db-'))
  const database = openDatabase(join(directory, 'echolog.db'))
  try {
    return await work(database, directory)
  } finally {
    database.handle.close()
    await rm(directory, { recursive: true, force: true })
  }
}

void test('short links are owner-scoped for list and delete', async () => {
  await withDatabase(async (db) => {
    createShortLink(db, { slug: 'mine', digest: DIGEST, filename: 'a.txt', content_type: 'text/plain', created_by: 'alice' })
    createShortLink(db, { slug: 'theirs', digest: DIGEST, filename: 'b.txt', content_type: 'text/plain', created_by: 'bob' })

    assert.deepEqual(listShortLinks(db, { createdBy: 'alice', isAdmin: false }).map((link) => link.slug), ['mine'])
    assert.deepEqual(
      listShortLinks(db, { createdBy: 'alice', isAdmin: true }).map((link) => link.slug).sort(),
      ['mine', 'theirs'],
    )

    assert.equal(deleteShortLink(db, 'theirs', { createdBy: 'alice', isAdmin: false }), false)
    assert.ok(resolveShortLink(db, 'theirs'))
    assert.equal(deleteShortLink(db, 'theirs', { createdBy: 'alice', isAdmin: true }), true)
    assert.equal(resolveShortLink(db, 'theirs'), null)
  })
})

void test('burn-after-reading is consumable exactly once', async () => {
  await withDatabase(async (db) => {
    createShortLink(db, {
      slug: 'burn',
      digest: DIGEST,
      filename: 'burn.txt',
      content_type: 'text/plain',
      created_by: 'alice',
      burn_after_reading: true,
    })
    assert.ok(consumeShortLink(db, 'burn'))
    assert.equal(consumeShortLink(db, 'burn'), null)
    assert.equal(resolveShortLink(db, 'burn'), null)
  })
})

void test('non-burning links count downloads and expire on schedule', async () => {
  await withDatabase(async (db) => {
    const now = Date.parse('2026-01-01T00:00:00.000Z')
    createShortLink(db, {
      slug: 'counted',
      digest: DIGEST,
      filename: 'counted.txt',
      content_type: 'text/plain',
      created_by: 'alice',
    }, now)
    consumeShortLink(db, 'counted', now)
    consumeShortLink(db, 'counted', now)
    assert.equal(resolveShortLink(db, 'counted', now)?.download_count, 2)

    createShortLink(db, {
      slug: 'expiring',
      digest: DIGEST,
      filename: 'expiring.txt',
      content_type: 'text/plain',
      created_by: 'alice',
      expires_at: new Date(now + 1_000).toISOString(),
    }, now)
    assert.equal(purgeExpiredShortLinks(db, now + 2_000), 1)
    assert.equal(resolveShortLink(db, 'expiring', now + 2_000), null)
  })
})

void test('live short links are GC roots, expired ones are not', async () => {
  await withDatabase(async (db) => {
    const now = Date.parse('2026-01-01T00:00:00.000Z')
    createShortLink(db, {
      slug: 'live',
      digest: DIGEST,
      filename: 'live.txt',
      content_type: 'text/plain',
      created_by: 'alice',
    }, now)
    createShortLink(db, {
      slug: 'dead',
      digest: 'b'.repeat(64),
      filename: 'dead.txt',
      content_type: 'text/plain',
      created_by: 'alice',
      expires_at: new Date(now - 1_000).toISOString(),
    }, now)

    const roots = listActiveShortLinkObjectKeys(db, now)
    assert.ok(roots.has(`sha256/${DIGEST}`))
    assert.equal(roots.has(`sha256/${'b'.repeat(64)}`), false)
  })
})

void test('short-link digests must be real SHA-256 hex values', async () => {
  await withDatabase((db) => {
    assert.throws(
      () => createShortLink(db, { slug: 'bad', digest: 'not-a-digest', filename: 'x', content_type: 'text/plain', created_by: 'alice' }),
      /SHA-256/,
    )
  })
})

void test('audit writes are ordered, bounded and never throw from the safe wrapper', async () => {
  await withDatabase((db) => {
    recordAuditLog(db, { actor: 'alice', action: 'object_uploaded', target: 'sha256/x', details: { size: 3 } }, 1_000)
    recordAuditLog(db, { actor: 'bob', action: 'object_deleted', target: 'sha256/y', details: 'verbatim text' }, 2_000)
    const logs = listAuditLogs(db, 10)
    assert.equal(logs.length, 2)
    assert.equal(logs[0]?.action, 'object_deleted')
    assert.equal(logs[0]?.details, 'verbatim text')
    assert.equal(logs[1]?.details, JSON.stringify({ size: 3 }))

    // A missing audit table makes the write fail; the safe wrapper must swallow it.
    db.handle.exec('DROP TABLE audit_logs')
    assert.doesNotThrow(() => recordAuditLogSafe(db, { actor: 'alice', action: 'gc_executed', target: 'storage_root' }))
  })
})

void test('an existing volume upgrades to the current schema version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'echolog-migrate-'))
  const path = join(directory, 'legacy.db')
  try {
    // Simulate a volume created before `created_by` and without user_version.
    const legacy = openDatabase(path)
    legacy.handle.exec('DROP TABLE short_links')
    legacy.handle.exec(`CREATE TABLE short_links (
      slug TEXT PRIMARY KEY,
      digest TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      burn_after_reading INTEGER NOT NULL DEFAULT 0,
      download_count INTEGER NOT NULL DEFAULT 0
    )`)
    legacy.handle.exec('PRAGMA user_version = 0')
    legacy.handle.close()

    const upgraded = openDatabase(path)
    const columns = upgraded.handle.prepare('PRAGMA table_info(short_links)').all() as Array<{ name: string }>
    assert.ok(columns.some((column) => column.name === 'created_by'))
    const version = upgraded.handle.prepare('PRAGMA user_version').get() as { user_version: number }
    assert.equal(version.user_version, 1)
    createShortLink(upgraded, { slug: 'after', digest: DIGEST, filename: 'x', content_type: 'text/plain', created_by: 'alice' })
    upgraded.handle.close()

    // Re-opening must be a no-op, not a failed ALTER.
    const reopened = openDatabase(path)
    assert.ok(resolveShortLink(reopened, 'after'))
    reopened.handle.close()
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})
