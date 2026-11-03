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
}

export interface IssuedApiKey {
  id: string
  name: string
  prefix: string
  role: Role
  token: string
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
}

export interface AuditLogRecord {
  id: string
  event: string
  actor: string
  target: string | null
  ip: string | null
  timestamp: string
  metadata: string | null
}

export interface ObjectEmbeddingRecord {
  digest: string
  filename: string
  content_type: string
  extracted_text: string | null
  similarity?: number
  indexed_at: string
}

export interface EchologQueryResult<T> {
  rows: T[]
  rowCount: number
}

export interface EchologDatabaseAdapter {
  readonly kind: 'sqlite' | 'pglite'
  init(): Promise<void>
  query<T = unknown>(sql: string, params?: unknown[]): Promise<EchologQueryResult<T>>
  exec(sql: string): Promise<void>
  close(): Promise<void>

  // Users
  createUser(login: string, passwordHash: string, role: Role): Promise<UserRecord>
  findUserByLogin(login: string): Promise<UserRecord | null>
  findUserById(id: string): Promise<UserRecord | null>
  listUsers(): Promise<UserSummary[]>
  setUserDisabled(login: string, disabled: boolean): Promise<void>

  // Sessions
  createSession(userId: string, token: string, ttlMs: number): Promise<SessionRecord>
  findSessionByToken(token: string): Promise<SessionRecord | null>
  deleteSession(token: string): Promise<void>
  deleteSessionsForUser(userId: string): Promise<void>

  // API Keys
  issueApiKey(name: string, role: Role): Promise<IssuedApiKey>
  findApiKeyByToken(token: string): Promise<ApiKeyRecord | null>
  revokeApiKey(prefix: string): Promise<boolean>
  listApiKeys(): Promise<ApiKeyRecord[]>

  // Short Links
  createShortLink(params: {
    slug: string
    digest: string
    filename: string
    content_type: string
    expires_at?: string | null
    burn_after_reading?: boolean
  }): Promise<ShortLinkRecord>
  resolveShortLink(slug: string): Promise<ShortLinkRecord | null>
  recordShortLinkDownload(slug: string): Promise<void>
  listShortLinks(): Promise<ShortLinkRecord[]>
  deleteShortLink(slug: string): Promise<void>

  // Audit Logs
  recordAuditLog(params: {
    event: string
    actor: string
    target?: string | null
    ip?: string | null
    metadata?: Record<string, unknown> | null
  }): Promise<void>
  listAuditLogs(limit?: number): Promise<AuditLogRecord[]>

  // Semantic Vector Embeddings
  upsertEmbedding(params: {
    digest: string
    filename: string
    content_type: string
    extracted_text: string
    embedding: number[]
  }): Promise<void>
  searchSemantic(queryEmbedding: number[], limit?: number, contentTypeFilter?: string[]): Promise<ObjectEmbeddingRecord[]>
}
