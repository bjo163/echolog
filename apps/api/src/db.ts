/**
 * ECHOLOG local identity store.
 *
 * Standalone ECHOLOG does not call a Hub for authentication. It owns three
 * tables in one SQLite file next to the storage root:
 *
 *   users     — operator accounts for the console and the API
 *   sessions  — opaque cookie sessions, stored as SHA-256 of the token
 *   api_keys  — machine credentials, stored as SHA-256 plus a display prefix
 *
 * Node 24 ships `node:sqlite`, so this needs no native dependency and no
 * separate database container. Raw tokens are never stored: a leaked database
 * file yields hashes, not credentials.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto'

export type Role = 'admin' | 'member'

export interface UserRecord {
  id: string
  login: string
  role: Role
  password_hash: string
  created_at: string
  disabled: number
}

export interface UserSummary {
  id: string
  login: string
  role: Role
  created_at: string
  disabled: number
}

export interface SessionRecord {
  id: string
  user_id: string
  token_hash: string
  created_at: string
  expires_at: string
}

export interface ApiKeyRecord {
  id: string
  name: string
  key_hash: string
  prefix: string
  role: Role
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface EchologDatabase {
  handle: DatabaseSync
  path: string
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS audit_logs_timestamp ON audit_logs(timestamp);

CREATE TABLE IF NOT EXISTS short_links (
  slug TEXT PRIMARY KEY,
  digest TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  burn_after_reading INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS short_links_digest ON short_links(digest);
CREATE INDEX IF NOT EXISTS short_links_created_by ON short_links(created_by);
`

const SCHEMA_VERSION = 1

/**
 * Forward-only schema migrations. `CREATE TABLE IF NOT EXISTS` covers new
 * volumes; the ALTER below upgrades volumes created before `created_by`
 * existed. `PRAGMA user_version` makes this idempotent.
 */
function migrate(handle: DatabaseSync): void {
  const row = handle.prepare('PRAGMA user_version').get() as { user_version: number }
  if (row.user_version >= SCHEMA_VERSION) return

  const columns = handle.prepare('PRAGMA table_info(short_links)').all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'created_by')) {
    handle.exec("ALTER TABLE short_links ADD COLUMN created_by TEXT NOT NULL DEFAULT ''")
  }

  handle.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
}


export function openDatabase(path: string): EchologDatabase {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const handle = new DatabaseSync(path)
  handle.exec('PRAGMA journal_mode = WAL')
  handle.exec('PRAGMA foreign_keys = ON')

  // Check if tables already exist (e.g. legacy database before migrations)
  const tables = handle.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='short_links'").all() as Array<{ name: string }>
  if (tables.length > 0) {
    migrate(handle)
  }
  handle.exec(SCHEMA)
  migrate(handle)
  return { handle, path }
}

export function closeDatabase(db: EchologDatabase): void {
  db.handle.close()
}

const SCRYPT_KEYLEN = 64
const SCRYPT_COST = 16384

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST })
  return `scrypt$${SCRYPT_COST}$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

export function verifyPassword(stored: string, password: string): boolean {
  const [scheme, cost, salt, digest] = stored.split('$')
  if (scheme !== 'scrypt' || !cost || !salt || !digest) return false
  const expected = Buffer.from(digest, 'base64url')
  const actual = scryptSync(password, Buffer.from(salt, 'base64url'), expected.length, { N: Number(cost) })
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function nowIso(now = Date.now()): string {
  return new Date(now).toISOString()
}

export function findUserByLogin(db: EchologDatabase, login: string): UserRecord | undefined {
  return db.handle.prepare('SELECT * FROM users WHERE login = ?').get(login) as UserRecord | undefined
}

export function findUserById(db: EchologDatabase, id: string): UserRecord | undefined {
  return db.handle.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined
}

export function countUsers(db: EchologDatabase): number {
  const row = db.handle.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
  return row.n
}

export function listUsers(db: EchologDatabase): UserSummary[] {
  // The column list is fixed by this query, so the dynamic row shape is exact.
  return db.handle
    .prepare('SELECT id, login, role, created_at, disabled FROM users ORDER BY created_at ASC')
    .all() as unknown as UserSummary[]
}

export interface NewUser {
  login: string
  password: string
  role: Role
}

export function createUser(db: EchologDatabase, input: NewUser, now = Date.now()): UserRecord {
  const record: UserRecord = {
    id: randomUUID(),
    login: input.login,
    role: input.role,
    password_hash: hashPassword(input.password),
    created_at: nowIso(now),
    disabled: 0,
  }
  db.handle
    .prepare('INSERT INTO users (id, login, role, password_hash, created_at, disabled) VALUES (?, ?, ?, ?, ?, 0)')
    .run(record.id, record.login, record.role, record.password_hash, record.created_at)
  return record
}

export function setUserDisabled(db: EchologDatabase, login: string, disabled: boolean): boolean {
  const user = findUserByLogin(db, login)
  if (!user) return false
  if (disabled) {
    // A lock-out is only fail-closed if the sessions minted before it are gone:
    // re-enabling an account must not resurrect a cookie issued while it was
    // trusted. Deleting is idempotent, so disabling twice stays a no-op.
    db.handle.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
  }
  db.handle.prepare('UPDATE users SET disabled = ? WHERE login = ?').run(disabled ? 1 : 0, login)
  return true
}

export function createSession(
  db: EchologDatabase,
  userId: string,
  ttlMs: number,
  now = Date.now(),
): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = nowIso(now + ttlMs)
  db.handle
    .prepare('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(randomUUID(), userId, sha256(token), nowIso(now), expiresAt)
  return { token, expiresAt }
}

export function findSessionUser(
  db: EchologDatabase,
  token: string,
  now = Date.now(),
): { session: SessionRecord; user: UserRecord } | null {
  const session = db.handle
    .prepare('SELECT * FROM sessions WHERE token_hash = ?')
    .get(sha256(token)) as SessionRecord | undefined
  if (!session) return null
  if (Date.parse(session.expires_at) <= now) {
    db.handle.prepare('DELETE FROM sessions WHERE id = ?').run(session.id)
    return null
  }
  const user = findUserById(db, session.user_id)
  if (!user || user.disabled !== 0) return null
  return { session, user }
}

export function deleteSession(db: EchologDatabase, token: string): void {
  db.handle.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
}

export function purgeExpiredSessions(db: EchologDatabase, now = Date.now()): number {
  return Number(db.handle.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso(now)).changes)
}

export interface IssuedApiKey {
  id: string
  name: string
  role: Role
  token: string
  prefix: string
  createdAt: string
}

export function issueApiKey(db: EchologDatabase, name: string, role: Role, now = Date.now()): IssuedApiKey {
  const token = `ecl_${randomBytes(24).toString('base64url')}`
  const record: IssuedApiKey = {
    id: randomUUID(),
    name,
    role,
    token,
    prefix: token.slice(0, 12),
    createdAt: nowIso(now),
  }
  db.handle
    .prepare('INSERT INTO api_keys (id, name, key_hash, prefix, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(record.id, record.name, sha256(token), record.prefix, record.role, record.createdAt)
  return record
}

export function findApiKey(db: EchologDatabase, token: string): ApiKeyRecord | null {
  const record = db.handle
    .prepare('SELECT * FROM api_keys WHERE key_hash = ?')
    .get(sha256(token)) as ApiKeyRecord | undefined
  if (!record || record.revoked_at !== null) return null
  db.handle.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(nowIso(), record.id)
  return record
}

export function revokeApiKey(db: EchologDatabase, prefix: string, now = Date.now()): boolean {
  const result = db.handle
    .prepare('UPDATE api_keys SET revoked_at = ? WHERE prefix = ? AND revoked_at IS NULL')
    .run(nowIso(now), prefix)
  return result.changes > 0
}

export function listApiKeys(db: EchologDatabase): Omit<ApiKeyRecord, 'key_hash'>[] {
  return db.handle
    .prepare('SELECT id, name, prefix, role, created_at, last_used_at, revoked_at FROM api_keys ORDER BY created_at DESC')
    .all() as Omit<ApiKeyRecord, 'key_hash'>[]
}

export function findApiKeyByPrefix(db: EchologDatabase, prefix: string): ApiKeyRecord | undefined {
  return db.handle.prepare('SELECT * FROM api_keys WHERE prefix = ?').get(prefix) as ApiKeyRecord | undefined
}

export interface AuditLogRecord {
  id: string
  timestamp: string
  actor: string
  action: string
  target: string
  details: string | null
}

export function recordAuditLog(
  db: EchologDatabase,
  entry: {
    actor: string
    action: string
    target: string
    details?: Record<string, unknown> | string | null
  },
  now = Date.now(),
): AuditLogRecord {
  const record: AuditLogRecord = {
    id: randomUUID(),
    timestamp: nowIso(now),
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    details: entry.details
      ? typeof entry.details === 'string'
        ? entry.details
        : JSON.stringify(entry.details)
      : null,
  }
  db.handle
    .prepare('INSERT INTO audit_logs (id, timestamp, actor, action, target, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(record.id, record.timestamp, record.actor, record.action, record.target, record.details)
  return record
}

/**
 * Audit is evidence, not a transaction participant: a failed write must not
 * turn a successful delete or GC sweep into a 500.
 */
export function recordAuditLogSafe(
  db: EchologDatabase,
  entry: {
    actor: string
    action: string
    target: string
    details?: Record<string, unknown> | string | null
  },
  now = Date.now(),
): void {
  try {
    recordAuditLog(db, entry, now)
  } catch (error) {
    console.error(`ECHOLOG audit write failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function listAuditLogs(db: EchologDatabase, limit = 100): AuditLogRecord[] {
  return db.handle
    .prepare('SELECT id, timestamp, actor, action, target, details FROM audit_logs ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as unknown as AuditLogRecord[]
}

export interface ShortLinkRecord {
  slug: string
  digest: string
  filename: string
  content_type: string
  created_at: string
  expires_at: string | null
  burn_after_reading: number
  download_count: number
  created_by: string
}

const SHORT_LINK_DIGEST = /^[a-f0-9]{64}$/

export function createShortLink(
  db: EchologDatabase,
  entry: {
    slug: string
    digest: string
    filename: string
    content_type: string
    created_by: string
    expires_at?: string | null
    burn_after_reading?: boolean
  },
  now = Date.now(),
): ShortLinkRecord {
  if (!SHORT_LINK_DIGEST.test(entry.digest)) throw new TypeError('Short link digest must be a SHA-256 hex digest')
  const record: ShortLinkRecord = {
    slug: entry.slug,
    digest: entry.digest,
    filename: entry.filename,
    content_type: entry.content_type,
    created_at: nowIso(now),
    expires_at: entry.expires_at ?? null,
    burn_after_reading: entry.burn_after_reading ? 1 : 0,
    download_count: 0,
    created_by: entry.created_by,
  }
  db.handle
    .prepare(
      'INSERT INTO short_links (slug, digest, filename, content_type, created_at, expires_at, burn_after_reading, download_count, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      record.slug,
      record.digest,
      record.filename,
      record.content_type,
      record.created_at,
      record.expires_at,
      record.burn_after_reading,
      record.download_count,
      record.created_by
    )
  return record
}

export function resolveShortLink(db: EchologDatabase, slug: string, now = Date.now()): ShortLinkRecord | null {
  const link = db.handle.prepare('SELECT * FROM short_links WHERE slug = ?').get(slug) as ShortLinkRecord | undefined
  if (!link) return null
  if (link.expires_at !== null && Date.parse(link.expires_at) <= now) {
    db.handle.prepare('DELETE FROM short_links WHERE slug = ?').run(slug)
    return null
  }
  return link
}

/**
 * Count a download and, for a burn-after-reading link, delete it exactly once.
 * The conditional delete makes two concurrent readers unable to both win.
 */
export function consumeShortLink(db: EchologDatabase, slug: string, now = Date.now()): ShortLinkRecord | null {
  const link = resolveShortLink(db, slug, now)
  if (!link) return null
  if (link.burn_after_reading === 1) {
    const result = db.handle
      .prepare('DELETE FROM short_links WHERE slug = ? AND burn_after_reading = 1')
      .run(slug)
    if (Number(result.changes) === 0) return null
    return link
  }
  db.handle.prepare('UPDATE short_links SET download_count = download_count + 1 WHERE slug = ?').run(slug)
  return link
}

export function purgeExpiredShortLinks(db: EchologDatabase, now = Date.now()): number {
  const result = db.handle
    .prepare('DELETE FROM short_links WHERE expires_at IS NOT NULL AND expires_at <= ?')
    .run(nowIso(now))
  return Number(result.changes)
}

export function listShortLinks(
  db: EchologDatabase,
  viewer: { createdBy: string; isAdmin: boolean },
  now = Date.now(),
): ShortLinkRecord[] {
  purgeExpiredShortLinks(db, now)
  if (viewer.isAdmin) {
    return db.handle
      .prepare('SELECT * FROM short_links ORDER BY created_at DESC')
      .all() as unknown as ShortLinkRecord[]
  }
  return db.handle
    .prepare('SELECT * FROM short_links WHERE created_by = ? ORDER BY created_at DESC')
    .all(viewer.createdBy) as unknown as ShortLinkRecord[]
}

export function deleteShortLink(
  db: EchologDatabase,
  slug: string,
  viewer: { createdBy: string; isAdmin: boolean },
): boolean {
  const link = db.handle.prepare('SELECT * FROM short_links WHERE slug = ?').get(slug) as ShortLinkRecord | undefined
  if (!link) return false
  if (!viewer.isAdmin && link.created_by !== viewer.createdBy) return false
  return Number(db.handle.prepare('DELETE FROM short_links WHERE slug = ?').run(slug).changes) > 0
}

/**
 * Live short links pin their objects for GC. Without this, a paste with
 * `retention_hours=0` would be swept while its link still answers.
 */
export function listActiveShortLinkObjectKeys(db: EchologDatabase, now = Date.now()): Set<string> {
  const rows = db.handle
    .prepare('SELECT DISTINCT digest FROM short_links WHERE expires_at IS NULL OR expires_at > ?')
    .all(nowIso(now)) as Array<{ digest: string }>
  return new Set(
    rows
      .map((row) => row.digest)
      .filter((digest) => SHORT_LINK_DIGEST.test(digest))
      .map((digest) => `sha256/${digest}`),
  )
}

