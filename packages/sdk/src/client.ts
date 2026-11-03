import type {
  ObjectSidecar,
  SemanticSearchResult,
  SemanticSearchResponse,
  VectorStatsResponse,
  ShortLinkRecord,
  StorageStats,
} from '@echolog/contract'

export interface EchologClientOptions {
  endpoint: string
  apiKey?: string
  sessionToken?: string
  fetcher?: typeof fetch
}

export class EchologApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'EchologApiError'
    this.status = status
    this.code = code
  }
}

/**
 * Official Echolog SDK Client
 * Provides an elegant, unified API for CAS Object Storage, AI Vector Search,
 * Zero-Copy Bucket Branching, Honeypot Canary Defense, and Short Links.
 */
export class Echolog {
  readonly endpoint: string
  private apiKey?: string
  private sessionToken?: string
  private fetcher: typeof fetch

  constructor(options: EchologClientOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, '')
    this.apiKey = options.apiKey
    this.sessionToken = options.sessionToken
    this.fetcher = options.fetcher ?? globalThis.fetch
  }

  private get authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/json',
    }
    if (this.apiKey) {
      headers['authorization'] = `Bearer ${this.apiKey}`
    } else if (this.sessionToken) {
      headers['authorization'] = `Bearer ${this.sessionToken}`
    }
    return headers
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.endpoint}${path.startsWith('/') ? path : `/${path}`}`
    const headers = {
      ...this.authHeaders,
      ...(init.headers as Record<string, string>),
    }

    const res = await this.fetcher(url, { ...init, headers })

    if (!res.ok) {
      let code = 'request_failed'
      let message = `Request failed with status ${res.status}`
      try {
        const body = (await res.json()) as any
        if (body?.error?.message) message = body.error.message
        if (body?.error?.code) code = body.error.code
      } catch {
        // Fallback to text
      }
      throw new EchologApiError(res.status, code, message)
    }

    if (res.status === 204) {
      return undefined as unknown as T
    }

    return (await res.json()) as T
  }

  // --- Storage Subsystem ---
  readonly storage = {
    upload: async (
      filename: string,
      content: string | Uint8Array | ArrayBuffer,
      contentType = 'application/octet-stream',
      options: { retentionUntil?: string; legalHold?: boolean } = {}
    ): Promise<ObjectSidecar> => {
      const headers: Record<string, string> = {
        'content-type': contentType,
        'x-filename': filename,
      }
      if (options.retentionUntil) headers['x-echolog-retention-until'] = options.retentionUntil
      if (options.legalHold) headers['x-echolog-legal-hold'] = 'true'

      const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : (content as any)

      return this.request<ObjectSidecar>('/api/v1/objects', {
        method: 'POST',
        headers,
        body,
      })
    },

    getMetadata: async (digest: string): Promise<ObjectSidecar> => {
      return this.request<ObjectSidecar>(`/api/v1/objects/sha256/${encodeURIComponent(digest)}/meta`)
    },

    download: async (digest: string): Promise<Response> => {
      const url = `${this.endpoint}/api/v1/objects/sha256/${encodeURIComponent(digest)}`
      return this.fetcher(url, { headers: this.authHeaders })
    },

    getStats: async (): Promise<StorageStats> => {
      return this.request<StorageStats>('/api/v1/storage/stats')
    },
  }

  // --- AI Semantic Search Subsystem ---
  readonly ai = {
    search: async (
      query: string,
      options: { limit?: number; contentTypeFilter?: string[] } = {}
    ): Promise<SemanticSearchResponse> => {
      return this.request<SemanticSearchResponse>('/api/v1/search/semantic', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query,
          limit: options.limit ?? 10,
          content_type_filter: options.contentTypeFilter,
        }),
      })
    },

    getStats: async (): Promise<VectorStatsResponse> => {
      return this.request<VectorStatsResponse>('/api/v1/search/stats')
    },

    ingest: async (digest: string): Promise<{ status: string; digest: string; filename: string }> => {
      return this.request<{ status: string; digest: string; filename: string }>(
        `/api/v1/search/ingest/${encodeURIComponent(digest)}`,
        { method: 'POST' }
      )
    },
  }

  // --- Zero-Copy Bucket Branching Subsystem ---
  readonly branches = {
    list: async (): Promise<Array<{ id: string; name: string; parent_branch: string | null; created_at: string }>> => {
      return this.request('/api/v1/branches')
    },

    create: async (params: {
      name: string
      fromBranch?: string
    }): Promise<{ id: string; name: string; parent_branch: string | null; created_at: string }> => {
      return this.request('/api/v1/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: params.name, from_branch: params.fromBranch }),
      })
    },

    delete: async (name: string): Promise<void> => {
      return this.request(`/api/v1/branches/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
    },
  }

  // --- Autonomous Security Canary Subsystem ---
  readonly security = {
    listCanaries: async (): Promise<any[]> => {
      return this.request('/api/v1/security/canaries')
    },

    createCanary: async (params: {
      name: string
      fakeFilename: string
      digest: string
      quarantineAction?: 'disable_user' | 'alert_only'
    }): Promise<any> => {
      return this.request('/api/v1/security/canaries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: params.name,
          fake_filename: params.fakeFilename,
          digest: params.digest,
          quarantine_action: params.quarantineAction,
        }),
      })
    },
  }

  // --- Short Links & Pastebin Subsystem ---
  readonly tools = {
    createPaste: async (params: {
      content: string
      title?: string
      retentionHours?: number
      burnAfterReading?: boolean
    }): Promise<{ slug: string; digest: string; url: string; raw_url: string }> => {
      return this.request('/api/v1/tools/paste', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: params.content,
          title: params.title,
          retention_hours: params.retentionHours,
          burn_after_reading: params.burnAfterReading,
        }),
      })
    },

    createShortLink: async (params: {
      digest: string
      burnAfterReading?: boolean
      customSlug?: string
    }): Promise<ShortLinkRecord> => {
      return this.request('/api/v1/tools/short-links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          digest: params.digest,
          burn_after_reading: params.burnAfterReading,
          custom_slug: params.customSlug,
        }),
      })
    },
  }
}
