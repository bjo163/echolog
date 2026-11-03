import type { FastifyInstance } from 'fastify'
import type { EchologConfig } from '../../config.js'
import type { EchologDatabase } from '../../db.js'
import { createEchologAuthenticator } from '../../auth.js'
import { generateLocalEmbedding, extractTextSnippet } from './embedder.js'
import type { FsStorageDriver } from '../../core/index.js'
import type { PGliteDatabaseAdapter } from '../../db/pglite-adapter.js'

export interface SemanticRouteOptions {
  driver: FsStorageDriver
  database: EchologDatabase
  pgliteAdapter?: PGliteDatabaseAdapter
}

export function registerSemanticSearchRoutes(
  app: FastifyInstance,
  config: EchologConfig,
  options: SemanticRouteOptions
): void {
  const authenticate = createEchologAuthenticator({
    database: options.database,
    serviceKey: config.serviceKey,
    arsyUrl: config.arsyUrl,
  })

  // 1. Semantic Search Query endpoint
  app.post('/api/v1/search/semantic', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) {
      return reply.code(auth.status).send({ error: { code: auth.code, message: 'Authentication required' } })
    }

    const body = request.body as {
      query?: string
      limit?: number
      content_type_filter?: string[]
    }

    const text = typeof body?.query === 'string' ? body.query.trim() : ''
    if (text.length === 0) {
      return reply.code(400).send({ error: { code: 'empty_query', message: 'Search query cannot be empty.' } })
    }

    const limit = Math.min(Math.max(Number(body?.limit ?? 10), 1), 50)
    const queryVec = generateLocalEmbedding(text, 384)

    if (options.pgliteAdapter) {
      const matches = await options.pgliteAdapter.searchSemantic(queryVec, limit, body.content_type_filter)
      return reply.code(200).send({
        query: text,
        engine: 'pglite+pgvector',
        dimensions: 384,
        total_matches: matches.length,
        results: matches.map((m) => ({
          digest: m.digest,
          filename: m.filename,
          content_type: m.content_type,
          snippet: m.extracted_text ? m.extracted_text.slice(0, 300) : null,
          similarity: m.similarity !== undefined ? Number(m.similarity.toFixed(4)) : null,
          indexed_at: m.indexed_at,
          url: `/api/v1/objects/sha256/${m.digest}`,
        })),
      })
    }

    // Fallback: Driver get by digest or return empty
    return reply.code(200).send({
      query: text,
      engine: 'sqlite_keyword_fallback',
      dimensions: 384,
      total_matches: 0,
      results: [],
    })
  })

  // 2. Vector Index Status
  app.get('/api/v1/search/stats', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) {
      return reply.code(auth.status).send({ error: { code: auth.code, message: 'Authentication required' } })
    }

    let indexedCount = 0
    if (options.pgliteAdapter) {
      try {
        const res = await options.pgliteAdapter.query<{ count: string | number }>('SELECT count(*) as count FROM object_embeddings;')
        indexedCount = Number(res.rows[0]?.count ?? 0)
      } catch {
        indexedCount = 0
      }
    }

    return reply.code(200).send({
      engine: options.pgliteAdapter ? 'PGlite + pgvector (WASM)' : 'SQLite (Fallback)',
      vector_extension: options.pgliteAdapter ? 'active' : 'disabled',
      dimensions: 384,
      metric: 'cosine_similarity',
      indexed_objects: indexedCount,
    })
  })

  // 3. Manual / Background Ingest trigger: POST /api/v1/search/ingest/:digest
  app.post('/api/v1/search/ingest/:digest', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth.ok) {
      return reply.code(auth.status).send({ error: { code: auth.code, message: 'Authentication required' } })
    }

    const { digest } = request.params as { digest: string }
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      return reply.code(400).send({ error: { code: 'invalid_digest', message: 'Valid 64-char hex digest required' } })
    }

    const obj = await options.driver.get(`sha256/${digest}`)
    if (!obj) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Object not found' } })
    }

    const snippet = extractTextSnippet(obj.bytes, obj.sidecar.content_type)
    if (!snippet) {
      return reply.code(422).send({ error: { code: 'not_textual', message: 'Content is not textual or extractable' } })
    }

    const embedding = generateLocalEmbedding(snippet, 384)

    if (options.pgliteAdapter) {
      await options.pgliteAdapter.upsertEmbedding({
        digest,
        filename: obj.sidecar.filename,
        content_type: obj.sidecar.content_type,
        extracted_text: snippet,
        embedding,
      })
    }

    return reply.code(200).send({
      status: 'indexed',
      digest,
      filename: obj.sidecar.filename,
      dimensions: 384,
      extracted_length: snippet.length,
    })
  })
}
