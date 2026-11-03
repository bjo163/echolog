import type { FastifyInstance } from 'fastify'
import type { EchologDatabaseAdapter } from '../../db/adapter.js'
import { createEchologAuthenticator, isPrivileged } from '../../auth.js'
import type { EchologDatabase } from '../../db.js'

export interface StorageBranch {
  id: string
  name: string
  parent_branch: string | null
  created_at: string
  created_by: string
  active_objects: string[] // Array of SHA-256 digests in this branch snapshot
}

/**
 * Git-like Zero-Copy Bucket Branching & Time-Travel Engine
 * Leverages Content-Addressable Storage (CAS) immutability to branch and snapshot
 * the entire storage universe in milliseconds without duplicating binary bits on disk.
 */
export class BranchManager {
  private branches = new Map<string, StorageBranch>()

  constructor() {
    // Default root branch
    this.branches.set('main', {
      id: 'branch-main',
      name: 'main',
      parent_branch: null,
      created_at: new Date().toISOString(),
      created_by: 'system',
      active_objects: [],
    })
  }

  createBranch(params: {
    name: string
    fromBranch?: string
    createdBy: string
    currentDigests: string[]
  }): StorageBranch {
    const parentName = params.fromBranch ?? 'main'
    const parent = this.branches.get(parentName)
    const baseDigests = parent ? [...parent.active_objects] : [...params.currentDigests]

    const branch: StorageBranch = {
      id: `branch-${params.name}-${Date.now()}`,
      name: params.name,
      parent_branch: parentName,
      created_at: new Date().toISOString(),
      created_by: params.createdBy,
      active_objects: baseDigests,
    }

    this.branches.set(params.name, branch)
    return branch
  }

  getBranch(name: string): StorageBranch | null {
    return this.branches.get(name) ?? null
  }

  listBranches(): StorageBranch[] {
    return Array.from(this.branches.values())
  }

  deleteBranch(name: string): boolean {
    if (name === 'main') return false
    return this.branches.delete(name)
  }
}

export function registerBranchRoutes(
  app: FastifyInstance,
  branchManager: BranchManager,
  database: EchologDatabase,
  adapter?: EchologDatabaseAdapter
): void {
  const authenticate = createEchologAuthenticator({ database })

  // 1. List all active storage branches
  app.get('/api/v1/branches', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) {
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'Authentication required' } })
    }
    const branches = branchManager.listBranches()
    return reply.code(200).send(branches)
  })

  // 2. Create a new Zero-Copy Branch
  app.post('/api/v1/branches', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) {
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'Authentication required' } })
    }

    const body = request.body as { name?: string; from_branch?: string }
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name || !/^[a-zA-Z0-9_-]{2,30}$/.test(name)) {
      return reply.code(400).send({ error: { code: 'invalid_name', message: 'Valid branch name required (2-30 alphanumeric characters)' } })
    }

    if (branchManager.getBranch(name)) {
      return reply.code(409).send({ error: { code: 'branch_exists', message: `Branch "${name}" already exists.` } })
    }

    let currentDigests: string[] = []
    if (adapter && adapter.kind === 'pglite') {
      try {
        const rows = await adapter.query<{ digest: string }>('SELECT digest FROM object_embeddings;')
        currentDigests = rows.rows.map((r) => r.digest)
      } catch {
        currentDigests = []
      }
    }

    const branch = branchManager.createBranch({
      name,
      fromBranch: body.from_branch,
      createdBy: auth.principal.uploader,
      currentDigests,
    })

    return reply.code(201).send(branch)
  })

  // 3. Delete branch
  app.delete('/api/v1/branches/:name', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok || !isPrivileged(auth.principal)) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Only administrators can delete branches' } })
    }

    const { name } = request.params as { name: string }
    if (name === 'main') {
      return reply.code(400).send({ error: { code: 'cannot_delete_main', message: 'Cannot delete default main branch' } })
    }

    const deleted = branchManager.deleteBranch(name)
    if (!deleted) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Branch not found' } })
    }

    return reply.code(204).send()
  })
}

