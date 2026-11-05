/** Shapes shared with the ECHOLOG REST surface (README.md, docs of the API). */

/** The only four fields a consumer of ECHOLOG may persist: a pure reference. */
export interface ObjectRef {
  object_key: string
  digest: string
  size: number
  content_type: string
}

/** Full sidecar as returned by GET /api/v1/objects/sha256/:digest/meta. */
export interface ObjectSidecar extends ObjectRef {
  filename: string
  uploader: string
  created_at: string
  retention_until: string | null
  legal_hold: boolean
  scan: string
  tags: string[]
}

export interface DownloadGrant {
  url: string
  expires_at: string
}

export interface GcHeldEntry {
  object_key: string
  reason: string
}

export interface GcResult {
  deleted: string[]
  held: GcHeldEntry[]
  bytes_freed: number
}

export interface StorageStats {
  quota_bytes: number
  committed_bytes: number
  objects_count: number
  held_bytes: number
  held_count: number
  active_retention_bytes: number
  active_retention_count: number
  eligible_gc_bytes: number
  eligible_gc_count: number
  s3_aliases_count: number
}

export interface S3KeyRecord {
  key: string
  object_key: string
  digest: string
  size: number
  content_type: string
  etag: string
  last_modified: string
  retention_until: string | null
  legal_hold: boolean
}

export interface AuditLogRecord {
  id: string
  timestamp: string
  actor: string
  action: string
  target: string
  details: string | null
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

export interface OciRepositoryItem {
  repository: string
  tags: string[]
}

export interface SemanticSearchResult {
  digest: string
  filename: string
  content_type: string
  snippet: string | null
  similarity: number | null
  indexed_at: string
  url: string
}

export interface SemanticSearchResponse {
  query: string
  engine: string
  dimensions: number
  total_matches: number
  results: SemanticSearchResult[]
}

export interface VectorStatsResponse {
  engine: string
  vector_extension: string
  dimensions: number
  metric: string
  indexed_objects: number
}

/**
 * Capability maturity as reported by the running instance.
 *
 * `available` is D19 core. `experimental` means the route exists but the domain
 * boundary does not treat it as production-ready. `unavailable` means the
 * capability has no server-side support at all, so a console must say so
 * instead of drawing a screen that cannot work.
 */
export type CapabilityMaturity = 'available' | 'experimental' | 'unavailable'

/** Non-secret runtime facts describing the instance the console is talking to. */
export interface ConsoleRuntimeFacts {
  product: 'ECHOLOG'
  domain: 'D19'
  version: string
  environment: 'development' | 'test' | 'production'
  identity_mode: 'standalone' | 'arsy_federated'
  identity_authority: 'local-echolog' | 'arsy-d00'
  storage: {
    backend: 'filesystem'
    quota_bytes: number
    max_upload_bytes: number
    allowed_mime_types: string[]
  }
  session_ttl_hours: number
  metrics_enabled: boolean
  features: Record<string, CapabilityMaturity>
}

/**
 * Result of a full-read fixity scan.
 *
 * The scan re-hashes the stored bytes and compares them with the content
 * address. It reports aggregates only: per-object results are published to an
 * in-process event bus and are not durable history.
 */
export interface FixityScanReport {
  objectsScanned: number
  corruptionsFound: number
  autoHealed: number
  lastScrubTime: string | null
}

export type UploadPhase = 'idle' | 'queued' | 'verifying' | 'committed' | 'failed'

export interface RealtimeBroadcastEvent {
  id: string
  type: string
  data: Record<string, any>
  timestamp: string
}

export interface AnalyticsOverview {
  status: string
  telemetry: {
    totalAuditEvents: number
    lastAuditEvent: any
    activeShortLinks: number
    autonomousScrubber: {
      objectsScanned: number
      corruptionsFound: number
      autoHealed: number
      lastScrubTime: string | null
    } | null
  }
  system: {
    memory: Record<string, number>
    uptime: number
    nodeVersion: string
  }
}

