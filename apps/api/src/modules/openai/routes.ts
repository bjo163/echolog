import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { generateLocalEmbedding } from '../ai/embedder.js'
import type { PGliteDatabaseAdapter } from '../../db/pglite-adapter.js'
import { createEchologAuthenticator } from '../../auth.js'
import type { EchologDatabase } from '../../db.js'

export interface OpenAiRoutesOptions {
  pgliteAdapter?: PGliteDatabaseAdapter
  database: EchologDatabase
  serviceKey?: string
  arsyUrl?: string
  fetcher?: typeof fetch
  now?: () => number
}

export function registerOpenAiRoutes(app: FastifyInstance, options: OpenAiRoutesOptions): void {
  const authenticate = createEchologAuthenticator({
    database: options.database,
    serviceKey: options.serviceKey,
    arsyUrl: options.arsyUrl,
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    ...(options.now ? { now: options.now } : {}),
  })
  /**
   * GET /v1/models (and /api/v1/models)
   * Lists available models in standard OpenAI response format.
   */
  const handleModels = async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await authenticate(req)
    if (!auth.ok) return reply.code(auth.status).send({ error: { message: 'Authentication required', type: 'authentication_error' } })
    return reply.send({
      object: 'list',
      data: [
        {
          id: 'text-embedding-384',
          object: 'model',
          created: 1700000000,
          owned_by: 'echolog',
          permission: [],
          root: 'text-embedding-384',
          parent: null,
        },
        {
          id: 'echolog-storage-rag',
          object: 'model',
          created: 1700000000,
          owned_by: 'echolog',
          permission: [],
          root: 'echolog-storage-rag',
          parent: null,
        },
      ],
    })
  }

  app.get('/v1/models', handleModels)
  app.get('/api/v1/models', handleModels)

  /**
   * POST /v1/embeddings (and /api/v1/embeddings)
   * OpenAI standard embedding endpoint for Cursor, Continue.dev, LangChain, etc.
   */
  const handleEmbeddings = async (
    request: FastifyRequest<{
      Body: {
        input: string | string[]
        model?: string
      }
    }>,
    reply: FastifyReply,
  ) => {
    const auth = await authenticate(request)
    if (!auth.ok) return reply.code(auth.status).send({ error: { message: 'Authentication required', type: 'authentication_error' } })
    const { input, model } = request.body || {}
    if (!input) {
      return reply.status(400).send({
        error: {
          message: "'input' is a required property",
          type: 'invalid_request_error',
          param: 'input',
          code: null,
        },
      })
    }

    const inputs = Array.isArray(input) ? input : [input]
    if (inputs.length > 32 || inputs.some((value) => typeof value !== 'string' || value.length > 8192)) {
      return reply.status(413).send({ error: { message: 'At most 32 text inputs of 8192 characters each are accepted.', type: 'invalid_request_error' } })
    }
    const data = inputs.map((text, index) => {
      const vector = generateLocalEmbedding(String(text), 384)
      return {
        object: 'embedding',
        index,
        embedding: vector,
      }
    })

    const totalTokens = inputs.reduce((acc, str) => acc + Math.ceil(str.length / 4), 0)

    return reply.send({
      object: 'list',
      data,
      model: model || 'text-embedding-384',
      usage: {
        prompt_tokens: totalTokens,
        total_tokens: totalTokens,
      },
    })
  }

  app.post('/v1/embeddings', handleEmbeddings)
  app.post('/api/v1/embeddings', handleEmbeddings)

  /**
   * POST /v1/chat/completions (and /api/v1/chat/completions)
   * Drop-in RAG completion endpoint answering queries from storage documents.
   */
  const handleChatCompletions = async (
    request: FastifyRequest<{
      Body: {
        messages: Array<{ role: string; content: string }>
        model?: string
        stream?: boolean
      }
    }>,
    reply: FastifyReply,
  ) => {
    const auth = await authenticate(request)
    if (!auth.ok) return reply.code(auth.status).send({ error: { message: 'Authentication required', type: 'authentication_error' } })
    const { messages, model, stream } = request.body || {}
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return reply.status(400).send({
        error: {
          message: "'messages' is a required array",
          type: 'invalid_request_error',
        },
      })
    }

    if (messages.length > 64 || messages.some((message) => typeof message?.content !== 'string') || messages.reduce((sum, message) => sum + (typeof message?.content === 'string' ? message.content.length : 0), 0) > 32_768) {
      return reply.status(413).send({ error: { message: 'At most 64 messages and 32768 total content characters are accepted.', type: 'invalid_request_error' } })
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

    // Query semantic search context if pglite is ready
    let contextSnippets: Array<{ filename: string; snippet: string; score: number }> = []
    if (options.pgliteAdapter) {
      try {
        const queryVector = generateLocalEmbedding(lastUserMessage, 384)
        const records = await options.pgliteAdapter.searchSemantic(queryVector, 3)
        contextSnippets = records.map((r) => ({
          filename: r.filename,
          snippet: r.extracted_text ?? '',
          score: r.similarity ?? 0.8,
        }))
      } catch {
        // Fallback gracefully without context
      }
    }

    let completionText = ''
    if (contextSnippets.length > 0) {
      const references = contextSnippets
        .map((s, idx) => `[Doc ${idx + 1}: ${s.filename} (match: ${(s.score * 100).toFixed(1)}%)]\n${s.snippet}`)
        .join('\n\n')
      completionText = `Berdasarkan pencarian dokumen di ECHOLOG Storage:\n\n${references}\n\nJawaban: Data yang ditemukan cocok dengan kueri "${lastUserMessage}".`
    } else {
      completionText = `ECHOLOG Storage Assistant: Tidak ditemukan dokumen relevan untuk kueri "${lastUserMessage}". Sistem storage & database siap menerima data baru.`
    }

    if (stream) {
      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache')
      reply.raw.setHeader('Connection', 'keep-alive')

      const chunkId = `chatcmpl-${Date.now()}`
      const chunk = {
        id: chunkId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model || 'echolog-storage-rag',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: completionText },
            finish_reason: null,
          },
        ],
      }

      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`)
      reply.raw.write(
        `data: ${JSON.stringify({
          ...chunk,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })}\n\n`,
      )
      reply.raw.write('data: [DONE]\n\n')
      reply.raw.end()
      return
    }

    return reply.send({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model || 'echolog-storage-rag',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: completionText,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: Math.ceil(lastUserMessage.length / 4),
        completion_tokens: Math.ceil(completionText.length / 4),
        total_tokens: Math.ceil((lastUserMessage.length + completionText.length) / 4),
      },
    })
  }

  app.post('/v1/chat/completions', handleChatCompletions)
  app.post('/api/v1/chat/completions', handleChatCompletions)
}
