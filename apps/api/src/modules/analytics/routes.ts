import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { EchologDatabase } from '../../db.js'
import type { AutonomousBitScrubber } from '../scrubber/worker.js'

export interface AnalyticsRoutesOptions {
  database: EchologDatabase
  scrubber?: AutonomousBitScrubber
}

export function registerAnalyticsRoutes(app: FastifyInstance, options: AnalyticsRoutesOptions): void {
  /**
   * GET /api/v1/analytics/overview
   * Aggregates storage telemetry, audit events, and autonomous scrubber status.
   */
  app.get('/api/v1/analytics/overview', async (_request: FastifyRequest, reply: FastifyReply) => {
    // 1. Audit log stats
    let totalAuditEvents = 0
    let lastAuditEvent: any = null
    try {
      const countRow = options.database.handle.prepare('SELECT COUNT(*) as count FROM audit_logs').get() as { count: number }
      totalAuditEvents = countRow ? countRow.count : 0

      lastAuditEvent = options.database.handle
        .prepare('SELECT action, actor, timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT 1')
        .get()
    } catch {
      // Table might be absent in mock tests
    }

    // 2. Short links stats
    let activeShortLinks = 0
    try {
      const shortLinksRow = options.database.handle
        .prepare('SELECT COUNT(*) as count FROM short_links WHERE expires_at IS NULL OR expires_at > datetime("now")')
        .get() as { count: number }
      activeShortLinks = shortLinksRow ? shortLinksRow.count : 0
    } catch {
      // Ignore if table missing
    }

    // 3. Scrubber status
    const scrubberStats = options.scrubber ? options.scrubber.getStats() : null

    return reply.send({
      status: 'healthy',
      telemetry: {
        totalAuditEvents,
        lastAuditEvent,
        activeShortLinks,
        autonomousScrubber: scrubberStats,
      },
      system: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        nodeVersion: process.version,
      },
    })
  })

  /**
   * POST /api/v1/analytics/scrub
   * Manually trigger an on-demand scrubbing cycle.
   */
  app.post('/api/v1/analytics/scrub', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!options.scrubber) {
      return reply.status(503).send({ error: 'Scrubber is not initialized' })
    }

    const results = await options.scrubber.runScrub()
    return reply.send({ success: true, results })
  })
}
