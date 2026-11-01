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

export type UploadPhase = 'idle' | 'queued' | 'verifying' | 'committed' | 'failed'
