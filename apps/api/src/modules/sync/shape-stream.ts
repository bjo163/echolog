import type { FastifyInstance } from 'fastify'
import type { EchologDatabaseAdapter } from '../../db/adapter.js'
import { createEchologAuthenticator } from '../../auth.js'
import type { EchologDatabase } from '../../db.js'

export interface ShapeChangeRecord {
  table: string
  action: 'insert' | 'update' | 'delete'
  lsn: number
  key: string
  data: Record<string, unknown>
  timestamp: string
}

/**
 * Shape Replication Protocol (P2P Delta Sync)
 * Emits HTTP delta streams of table modifications so other ECHOLOG nodes can replicate state.
 */
export class ShapeSyncManager {
  private adapter: EchologDatabaseAdapter
  private changeLog: ShapeChangeRecord[] = []
  private currentLsn = 0

  constructor(adapter: EchologDatabaseAdapter) {
    this.adapter = adapter
  }

  recordChange(table: string, action: 'insert' | 'update' | 'delete', key: string, data: Record<string, unknown>): ShapeChangeRecord {
    this.currentLsn++
    const change: ShapeChangeRecord = {
      table,
      action,
      lsn: this.currentLsn,
      key,
      data,
      timestamp: new Date().toISOString(),
    }
    this.changeLog.push(change)
    // Keep in-memory ring buffer of last 1000 changes
    if (this.changeLog.length > 1000) {
      this.changeLog.shift()
    }
    return change
  }

  getChangesSince(sinceLsn = 0, tableFilter?: string): { changes: ShapeChangeRecord[]; latestLsn: number } {
    const filtered = this.changeLog.filter((c) => c.lsn > sinceLsn && (!tableFilter || c.table === tableFilter))
    return {
      changes: filtered,
      latestLsn: this.currentLsn,
    }
  }

  async applyRemoteChange(change: ShapeChangeRecord): Promise<void> {
    if (this.adapter.kind === 'pglite') {
      if (change.table === 'short_links' && change.action === 'insert') {
        const d = change.data as any
        await this.adapter.createShortLink({
          slug: d.slug,
          digest: d.digest,
          filename: d.filename,
          content_type: d.content_type,
          expires_at: d.expires_at,
          burn_after_reading: Boolean(d.burn_after_reading),
        })
      }
    }
  }
}

export function registerShapeSyncRoutes(
  app: FastifyInstance,
  syncManager: ShapeSyncManager,
  database: EchologDatabase
): void {
  const authenticate = createEchologAuthenticator({ database })

  // GET /api/v1/sync/shapes/:table - Pull delta changes since LSN
  app.get('/api/v1/sync/shapes/:table', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) {
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'Authentication required' } })
    }

    const { table } = request.params as { table: string }
    const query = request.query as { since_lsn?: string }
    const sinceLsn = Number(query?.since_lsn ?? 0)

    const result = syncManager.getChangesSince(sinceLsn, table === 'all' ? undefined : table)
    return reply.code(200).send(result)
  })

  // POST /api/v1/sync/apply - Ingest and apply remote node delta change
  app.post('/api/v1/sync/apply', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) {
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'Authentication required' } })
    }

    const body = request.body as ShapeChangeRecord
    if (!body?.table || !body?.action) {
      return reply.code(400).send({ error: { code: 'invalid_change', message: 'Malformed shape change record' } })
    }

    await syncManager.applyRemoteChange(body)
    return reply.code(200).send({ status: 'applied', lsn: body.lsn })
  })
}

