import type { FastifyInstance } from 'fastify'
import type { EchologDatabase } from '../../db.js'
import { createEchologAuthenticator, isPrivileged } from '../../auth.js'
import { recordAuditLogSafe, setUserDisabled } from '../../db.js'
import { eventBus } from '../realtime/event-bus.js'

export interface HoneypotCanary {
  id: string
  name: string
  fake_filename: string
  digest: string
  triggered_count: number
  last_triggered_at: string | null
  quarantine_action: 'disable_user' | 'alert_only'
}

/**
 * Autonomous Honeypot Canary Engine
 * Plants fake decoy objects (e.g. `credentials.env`, `aws_access_keys.csv`).
 * If an unauthorized or compromised actor touches/downloads this object,
 * the Canary triggers an immediate security alert and automatically quarantines the user account.
 */
export class HoneypotManager {
  private canaries = new Map<string, HoneypotCanary>()

  createCanary(params: {
    name: string
    fakeFilename: string
    digest: string
    quarantineAction?: 'disable_user' | 'alert_only'
  }): HoneypotCanary {
    const canary: HoneypotCanary = {
      id: `canary-${Date.now()}`,
      name: params.name,
      fake_filename: params.fakeFilename,
      digest: params.digest,
      triggered_count: 0,
      last_triggered_at: null,
      quarantine_action: params.quarantineAction ?? 'disable_user',
    }
    this.canaries.set(params.digest, canary)
    return canary
  }

  isCanary(digest: string): HoneypotCanary | null {
    return this.canaries.get(digest) ?? null
  }

  listCanaries(): HoneypotCanary[] {
    return Array.from(this.canaries.values())
  }

  async triggerCanary(
    digest: string,
    database: EchologDatabase,
    actor: string,
    ip?: string
  ): Promise<HoneypotCanary | null> {
    const canary = this.canaries.get(digest)
    if (!canary) return null

    canary.triggered_count++
    canary.last_triggered_at = new Date().toISOString()

    // 1. Audit log critical breach alert
    recordAuditLogSafe(database, {
      actor,
      action: 'HONEYPOT_BREACH_TRIGGERED',
      target: canary.fake_filename,
      details: {
        canary_name: canary.name,
        ip: ip ?? 'unknown',
        action_taken: canary.quarantine_action,
        timestamp: canary.last_triggered_at,
      },
    })

    // 2. Autonomous Quarantine: Auto-disable compromised user if configured
    if (canary.quarantine_action === 'disable_user' && actor !== 'system' && actor !== 'anonymous') {
      try {
        setUserDisabled(database, actor, true)
      } catch {
        // User disable attempt
      }
    }

    // 3. Publish alert to Realtime SSE event bus
    eventBus.publish('security.honeypot_triggered', {
      digest,
      targetPath: canary.fake_filename,
      attackerIp: ip,
      quarantinedUser: canary.quarantine_action === 'disable_user' ? actor : undefined,
      timestamp: canary.last_triggered_at,
    })

    return canary
  }
}

export function registerHoneypotRoutes(
  app: FastifyInstance,
  honeypotManager: HoneypotManager,
  database: EchologDatabase
): void {
  const authenticate = createEchologAuthenticator({ database })

  // List honeypot canaries
  app.get('/api/v1/security/canaries', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok || !isPrivileged(auth.principal)) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Admin only' } })
    }
    return reply.code(200).send(honeypotManager.listCanaries())
  })

  // Create honeypot canary
  app.post('/api/v1/security/canaries', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok || !isPrivileged(auth.principal)) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Admin only' } })
    }

    const body = request.body as {
      name: string
      fake_filename: string
      digest: string
      quarantine_action?: 'disable_user' | 'alert_only'
    }

    if (!body?.name || !body?.fake_filename || !body?.digest) {
      return reply.code(400).send({ error: { code: 'invalid_params', message: 'Name, fake_filename and digest required' } })
    }

    const canary = honeypotManager.createCanary({
      name: body.name,
      fakeFilename: body.fake_filename,
      digest: body.digest,
      quarantineAction: body.quarantine_action,
    })

    return reply.code(201).send(canary)
  })
}

