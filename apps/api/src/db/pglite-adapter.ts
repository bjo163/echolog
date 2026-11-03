import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { randomBytes, createHash, randomUUID } from 'node:crypto'
import type {
  ApiKeyRecord,
  AuditLogRecord,
  EchologDatabaseAdapter,
  EchologQueryResult,
  IssuedApiKey,
  ObjectEmbeddingRecord,
  Role,
  SessionRecord,
  ShortLinkRecord,
  UserRecord,
  UserSummary,
} from './adapter.js'

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export class PGliteDatabaseAdapter implements EchologDatabaseAdapter {
  readonly kind = 'pglite' as const
  private pglite: PGlite

  constructor(dataDir?: string) {
    this.pglite = new PGlite(dataDir ? { dataDir, extensions: { vector } } : { extensions: { vector } })
  }

  async init(): Promise<void> {
    await this.pglite.exec('CREATE EXTENSION IF NOT EXISTS vector;')

    await this.pglite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        login TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        disabled INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        token_hash TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        prefix TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS short_links (
        slug TEXT PRIMARY KEY,
        digest TEXT NOT NULL,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ,
        burn_after_reading INTEGER NOT NULL DEFAULT 0,
        download_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        event TEXT NOT NULL,
        actor TEXT NOT NULL,
        target TEXT,
        ip TEXT,
        timestamp TIMESTAMPTZ NOT NULL,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS object_embeddings (
        digest TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        extracted_text TEXT,
        embedding vector(384),
        indexed_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS object_embeddings_hnsw_idx 
      ON object_embeddings USING hnsw (embedding vector_cosine_ops);
    `)
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<EchologQueryResult<T>> {
    const res = await this.pglite.query<T>(sql, params)
    return {
      rows: res.rows,
      rowCount: res.rows.length,
    }
  }

  async exec(sql: string): Promise<void> {
    await this.pglite.exec(sql)
  }

  async close(): Promise<void> {
    await this.pglite.close()
  }

  // --- Users ---
  async createUser(login: string, passwordHash: string, role: Role): Promise<UserRecord> {
    const id = randomUUID()
    const now = new Date().toISOString()
    await this.pglite.query(
      `INSERT INTO users (id, login, role, password_hash, created_at, disabled)
       VALUES ($1, $2, $3, $4, $5, 0);`,
      [id, login, role, passwordHash, now]
    )
    return { id, login, role, password_hash: passwordHash, created_at: now, disabled: 0 }
  }

  async findUserByLogin(login: string): Promise<UserRecord | null> {
    const res = await this.pglite.query<UserRecord>(
      `SELECT id, login, role, password_hash, created_at, disabled FROM users WHERE login = $1 LIMIT 1;`,
      [login]
    )
    return res.rows[0] ?? null
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const res = await this.pglite.query<UserRecord>(
      `SELECT id, login, role, password_hash, created_at, disabled FROM users WHERE id = $1 LIMIT 1;`,
      [id]
    )
    return res.rows[0] ?? null
  }

  async listUsers(): Promise<UserSummary[]> {
    const res = await this.pglite.query<UserSummary>(
      `SELECT id, login, role, created_at, disabled FROM users ORDER BY created_at ASC;`
    )
    return res.rows
  }

  async setUserDisabled(login: string, disabled: boolean): Promise<void> {
    await this.pglite.query(
      `UPDATE users SET disabled = $1 WHERE login = $2;`,
      [disabled ? 1 : 0, login]
    )
  }

  // --- Sessions ---
  async createSession(userId: string, token: string, ttlMs: number): Promise<SessionRecord> {
    const id = randomUUID()
    const nowMs = Date.now()
    const now = new Date(nowMs).toISOString()
    const expiresAt = new Date(nowMs + ttlMs).toISOString()
    const tokenHash = sha256Hex(token)

    await this.pglite.query(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5);`,
      [id, userId, tokenHash, now, expiresAt]
    )

    return { id, user_id: userId, token_hash: tokenHash, created_at: now, expires_at: expiresAt }
  }

  async findSessionByToken(token: string): Promise<SessionRecord | null> {
    const tokenHash = sha256Hex(token)
    const res = await this.pglite.query<SessionRecord>(
      `SELECT id, user_id, token_hash, created_at, expires_at FROM sessions WHERE token_hash = $1 LIMIT 1;`,
      [tokenHash]
    )
    const session = res.rows[0]
    if (!session) return null
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await this.deleteSession(token)
      return null
    }
    return session
  }

  async deleteSession(token: string): Promise<void> {
    const tokenHash = sha256Hex(token)
    await this.pglite.query(`DELETE FROM sessions WHERE token_hash = $1;`, [tokenHash])
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    await this.pglite.query(`DELETE FROM sessions WHERE user_id = $1;`, [userId])
  }

  // --- API Keys ---
  async issueApiKey(name: string, role: Role): Promise<IssuedApiKey> {
    const id = randomUUID()
    const rawSecret = randomBytes(24).toString('base64url')
    const token = `ecl_${rawSecret}`
    const prefix = token.slice(0, 10)
    const keyHash = sha256Hex(token)
    const now = new Date().toISOString()

    await this.pglite.query(
      `INSERT INTO api_keys (id, name, key_hash, prefix, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [id, name, keyHash, prefix, role, now]
    )

    return { id, name, prefix, role, token }
  }

  async findApiKeyByToken(token: string): Promise<ApiKeyRecord | null> {
    const keyHash = sha256Hex(token)
    const res = await this.pglite.query<ApiKeyRecord>(
      `SELECT id, name, key_hash, prefix, role, created_at FROM api_keys WHERE key_hash = $1 LIMIT 1;`,
      [keyHash]
    )
    return res.rows[0] ?? null
  }

  async revokeApiKey(prefix: string): Promise<boolean> {
    const res = await this.pglite.query(`DELETE FROM api_keys WHERE prefix = $1;`, [prefix])
    return (res.affectedRows ?? 0) > 0
  }

  async listApiKeys(): Promise<ApiKeyRecord[]> {
    const res = await this.pglite.query<ApiKeyRecord>(
      `SELECT id, name, key_hash, prefix, role, created_at FROM api_keys ORDER BY created_at DESC;`
    )
    return res.rows
  }

  // --- Short Links ---
  async createShortLink(params: {
    slug: string
    digest: string
    filename: string
    content_type: string
    expires_at?: string | null
    burn_after_reading?: boolean
  }): Promise<ShortLinkRecord> {
    const now = new Date().toISOString()
    const record: ShortLinkRecord = {
      slug: params.slug,
      digest: params.digest,
      filename: params.filename,
      content_type: params.content_type,
      created_at: now,
      expires_at: params.expires_at ?? null,
      burn_after_reading: params.burn_after_reading ? 1 : 0,
      download_count: 0,
    }

    await this.pglite.query(
      `INSERT INTO short_links (slug, digest, filename, content_type, created_at, expires_at, burn_after_reading, download_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [
        record.slug,
        record.digest,
        record.filename,
        record.content_type,
        record.created_at,
        record.expires_at,
        record.burn_after_reading,
        record.download_count,
      ]
    )

    return record
  }

  async resolveShortLink(slug: string): Promise<ShortLinkRecord | null> {
    const res = await this.pglite.query<ShortLinkRecord>(
      `SELECT slug, digest, filename, content_type, created_at, expires_at, burn_after_reading, download_count
       FROM short_links WHERE slug = $1 LIMIT 1;`,
      [slug]
    )
    const link = res.rows[0]
    if (!link) return null

    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      await this.deleteShortLink(slug)
      return null
    }

    return link
  }

  async recordShortLinkDownload(slug: string): Promise<void> {
    const link = await this.resolveShortLink(slug)
    if (!link) return

    if (link.burn_after_reading === 1) {
      await this.deleteShortLink(slug)
      return
    }

    await this.pglite.query(
      `UPDATE short_links SET download_count = download_count + 1 WHERE slug = $1;`,
      [slug]
    )
  }

  async listShortLinks(): Promise<ShortLinkRecord[]> {
    const res = await this.pglite.query<ShortLinkRecord>(
      `SELECT slug, digest, filename, content_type, created_at, expires_at, burn_after_reading, download_count
       FROM short_links ORDER BY created_at DESC;`
    )
    return res.rows
  }

  async deleteShortLink(slug: string): Promise<void> {
    await this.pglite.query(`DELETE FROM short_links WHERE slug = $1;`, [slug])
  }

  // --- Audit Logs ---
  async recordAuditLog(params: {
    event: string
    actor: string
    target?: string | null
    ip?: string | null
    metadata?: Record<string, unknown> | null
  }): Promise<void> {
    const id = randomUUID()
    const now = new Date().toISOString()
    const metaStr = params.metadata ? JSON.stringify(params.metadata) : null

    await this.pglite.query(
      `INSERT INTO audit_logs (id, event, actor, target, ip, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [id, params.event, params.actor, params.target ?? null, params.ip ?? null, now, metaStr]
    )
  }

  async listAuditLogs(limit = 100): Promise<AuditLogRecord[]> {
    const res = await this.pglite.query<AuditLogRecord>(
      `SELECT id, event, actor, target, ip, timestamp, metadata
       FROM audit_logs ORDER BY timestamp DESC LIMIT $1;`,
      [limit]
    )
    return res.rows
  }

  // --- Vector Semantic Embeddings ---
  async upsertEmbedding(params: {
    digest: string
    filename: string
    content_type: string
    extracted_text: string
    embedding: number[]
  }): Promise<void> {
    const now = new Date().toISOString()
    const vecStr = `[${params.embedding.join(',')}]`

    await this.pglite.query(
      `INSERT INTO object_embeddings (digest, filename, content_type, extracted_text, embedding, indexed_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (digest) DO UPDATE SET
         filename = EXCLUDED.filename,
         content_type = EXCLUDED.content_type,
         extracted_text = EXCLUDED.extracted_text,
         embedding = EXCLUDED.embedding,
         indexed_at = EXCLUDED.indexed_at;`,
      [params.digest, params.filename, params.content_type, params.extracted_text, vecStr, now]
    )
  }

  async searchSemantic(
    queryEmbedding: number[],
    limit = 10,
    contentTypeFilter?: string[]
  ): Promise<ObjectEmbeddingRecord[]> {
    const vecStr = `[${queryEmbedding.join(',')}]`

    if (contentTypeFilter && contentTypeFilter.length > 0) {
      const res = await this.pglite.query<ObjectEmbeddingRecord>(
        `SELECT digest, filename, content_type, extracted_text, indexed_at,
                1 - (embedding <=> $1) AS similarity
         FROM object_embeddings
         WHERE content_type = ANY($2)
         ORDER BY embedding <=> $1 ASC
         LIMIT $3;`,
        [vecStr, contentTypeFilter, limit]
      )
      return res.rows
    }

    const res = await this.pglite.query<ObjectEmbeddingRecord>(
      `SELECT digest, filename, content_type, extracted_text, indexed_at,
              1 - (embedding <=> $1) AS similarity
       FROM object_embeddings
       ORDER BY embedding <=> $1 ASC
       LIMIT $2;`,
      [vecStr, limit]
    )
    return res.rows
  }
}
