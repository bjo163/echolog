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
`

export function openDatabase(path: string): EchologDatabase {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const handle = new DatabaseSync(path)
  handle.exec('PRAGMA journal_mode = WAL')
  handle.exec('PRAGMA foreign_keys = ON')
  handle.exec(SCHEMA)
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
