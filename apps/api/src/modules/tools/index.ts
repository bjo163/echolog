import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { DigestAccessPolicy } from '../../access.js'
import type { EchologConfig } from '../../config.js'
import type { EchologDatabase, ShortLinkRecord } from '../../db.js'
import {
  consumeShortLink,
  createShortLink,
  deleteShortLink,
  listShortLinks,
  recordAuditLogSafe,
  resolveShortLink,
} from '../../db.js'
import { createEchologAuthenticator } from '../../auth.js'
import type { EchologPrincipal } from '../../auth.js'
import type { FsStorageDriver } from '../../core/index.js'
import { contentDisposition, HttpProblem, normalizedMimeType, safeStoredFilename } from '../../limits.js'

const SLUG_PATTERN = /^[A-Za-z0-9_-]{3,30}$/
const DIGEST_PATTERN = /^[a-f0-9]{64}$/
const HTML_CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
const MAX_ATTEMPTS = 5

export interface ToolsRouteOptions {
  driver: FsStorageDriver
  database: EchologDatabase
  access: DigestAccessPolicy
  now?: () => number
}

interface PasteBody {
  content?: unknown
  title?: unknown
  retention_hours?: unknown
  burn_after_reading?: unknown
  custom_slug?: unknown
}

export function registerToolsRoutes(
  app: FastifyInstance,
  config: EchologConfig,
  options: ToolsRouteOptions,
): void {
  const now = options.now ?? Date.now
  const authenticate = createEchologAuthenticator({
    database: options.database,
    serviceKey: config.serviceKey,
    arsyUrl: config.arsyUrl,
    ...(options.now ? { now: options.now } : {}),
  })

  const requirePrincipal = async (request: FastifyRequest, reply: FastifyReply): Promise<EchologPrincipal | null> => {
    const auth = await authenticate(request)
    if (!auth.ok) {
      reply.code(auth.status).send({
        error: {
          code: auth.code,
          message: auth.code === 'auth_unavailable'
            ? 'ECHOLOG authentication is temporarily unavailable.'
            : 'Authentication is required.',
        },
      })
      return null
    }
    return auth.principal
  }

  // 1. Ephemeral pastebin. Text is stored as a normal CAS object so the GC,
  // quota and retention rules apply; the short link is only a pointer.
  app.post('/api/v1/tools/paste', async (request, reply) => {
    const principal = await requirePrincipal(request, reply)
    if (!principal) return reply

    if (!config.allowedMimeTypes.includes('text/plain')) {
      throw new HttpProblem(415, 'unsupported_media_type', 'Paste requires text/plain in the MIME allow-list.')
    }

    const body = (request.body ?? {}) as PasteBody
    const text = typeof body.content === 'string' ? body.content : ''
    if (text.trim().length === 0) {
      return reply.code(400).send({ error: { code: 'empty_content', message: 'Paste content cannot be empty.' } })
    }
    const bytes = Buffer.from(text, 'utf8')
    if (bytes.byteLength > config.maxUploadBytes) {
      throw new HttpProblem(413, 'too_large', 'Upload exceeds the configured size limit.')
    }

    const hours = Number(body.retention_hours ?? 24)
    if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 365) {
      return reply.code(400).send({ error: { code: 'invalid_retention', message: 'Retention hours must be between 0 and 8760.' } })
    }
    const expiresAt = hours > 0 ? new Date(now() + hours * 3600 * 1000).toISOString() : null
    const title = typeof body.title === 'string' ? safeStoredFilename(`${body.title.trim()}.txt`) : `paste-${now()}.txt`

    const sidecar = await options.driver.putStream((async function* () { yield bytes })(), {
      filename: title,
      content_type: 'text/plain; charset=utf-8',
      uploader: principal.uploader,
      retention_until: expiresAt,
      scan: 'skipped',
    })

    const customSlug = typeof body.custom_slug === 'string' && SLUG_PATTERN.test(body.custom_slug) ? body.custom_slug : null
    const link = insertLink(options.database, {
      slug: customSlug,
      digest: sidecar.digest,
      filename: sidecar.filename,
      content_type: sidecar.content_type,
      created_by: principal.uploader,
      expires_at: expiresAt,
      burn_after_reading: Boolean(body.burn_after_reading),
    }, Boolean(customSlug))

    recordAuditLogSafe(options.database, {
      actor: principal.uploader,
      action: 'short_link_created',
      target: `link:${link.slug}`,
      details: { digest: link.digest, kind: 'paste' },
    })

    return reply.code(201).send({
      slug: link.slug,
      digest: sidecar.digest,
      url: `/p/${link.slug}`,
      raw_url: `/s/${link.slug}`,
      burn_after_reading: link.burn_after_reading === 1,
      expires_at: link.expires_at,
    })
  })

  // Simple cURL paste endpoint. Authentication is required exactly as above;
  // this route exists for scripts, not for an anonymous inbox.
  app.post('/paste', async (request, reply) => {
    const principal = await requirePrincipal(request, reply)
    if (!principal) return reply

    if (!config.allowedMimeTypes.includes('text/plain')) {
      throw new HttpProblem(415, 'unsupported_media_type', 'Paste requires text/plain in the MIME allow-list.')
    }

    let text = ''
    if (typeof request.body === 'string') {
      text = request.body
    } else if (request.body && typeof request.body === 'object' && !(Symbol.asyncIterator in request.body)) {
      const body = request.body as Record<string, unknown>
      if (typeof body.c === 'string') text = body.c
      else if (typeof body.content === 'string') text = body.content
    } else {
      text = (await readBody(request.body, config.maxUploadBytes)).toString('utf8')
    }

    if (text.trim().length === 0) {
      return reply.code(400).type('text/plain').send('Empty content.\n')
    }
    const bytes = Buffer.from(text, 'utf8')
    if (bytes.byteLength > config.maxUploadBytes) {
      throw new HttpProblem(413, 'too_large', 'Upload exceeds the configured size limit.')
    }

    const sidecar = await options.driver.putStream((async function* () { yield bytes })(), {
      filename: `cli-paste-${now()}.txt`,
      content_type: 'text/plain; charset=utf-8',
      uploader: principal.uploader,
      scan: 'skipped',
    })
    const link = insertLink(options.database, {
      slug: null,
      digest: sidecar.digest,
      filename: sidecar.filename,
      content_type: sidecar.content_type,
      created_by: principal.uploader,
    }, false)

    recordAuditLogSafe(options.database, {
      actor: principal.uploader,
      action: 'short_link_created',
      target: `link:${link.slug}`,
      details: { digest: link.digest, kind: 'cli' },
    })

    return reply.code(201).type('text/plain').send(`/p/${link.slug}\n`)
  })

  // 2. Short link for an existing object.
  app.post('/api/v1/tools/short-links', async (request, reply) => {
    const principal = await requirePrincipal(request, reply)
    if (!principal) return reply

    const body = (request.body ?? {}) as {
      digest?: unknown
      custom_slug?: unknown
      burn_after_reading?: unknown
      expires_hours?: unknown
    }
    const digest = typeof body.digest === 'string' ? body.digest : ''
    if (!DIGEST_PATTERN.test(digest)) {
      return reply.code(400).send({ error: { code: 'invalid_digest', message: 'A 64-character hex digest is required.' } })
    }

    const object = await options.driver.get(`sha256/${digest}`)
    if (!object) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Underlying CAS object not found.' } })
    }
    // A link is an unauthenticated capability; it must never be a side door to
    // a private-witness object.
    if (await options.access.isPrivateWitness(digest)) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Underlying CAS object not found.' } })
    }

    const hours = Number(body.expires_hours ?? 0)
    if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 365) {
      return reply.code(400).send({ error: { code: 'invalid_retention', message: 'Expiry hours must be between 0 and 8760.' } })
    }
    const expiresAt = hours > 0 ? new Date(now() + hours * 3600 * 1000).toISOString() : null
    const customSlug = typeof body.custom_slug === 'string' && SLUG_PATTERN.test(body.custom_slug) ? body.custom_slug : null

    const link = insertLink(options.database, {
      slug: customSlug,
      digest: object.sidecar.digest,
      filename: object.sidecar.filename,
      content_type: object.sidecar.content_type,
      created_by: principal.uploader,
      expires_at: expiresAt,
      burn_after_reading: Boolean(body.burn_after_reading),
    }, Boolean(customSlug))

    recordAuditLogSafe(options.database, {
      actor: principal.uploader,
      action: 'short_link_created',
      target: `link:${link.slug}`,
      details: { digest: link.digest, kind: 'object' },
    })

    return reply.code(201).send({
      slug: link.slug,
      url: `/s/${link.slug}`,
      digest: link.digest,
      filename: link.filename,
      burn_after_reading: link.burn_after_reading === 1,
      expires_at: link.expires_at,
    })
  })

  app.get('/api/v1/tools/short-links', async (request, reply) => {
    const principal = await requirePrincipal(request, reply)
    if (!principal) return reply
    const links = listShortLinks(options.database, {
      createdBy: principal.uploader,
      isAdmin: isAdministrator(principal),
    }, now())
    return reply.header('cache-control', 'no-store').send(links.map(publicLink))
  })

  app.delete('/api/v1/tools/short-links/:slug', async (request, reply) => {
    const principal = await requirePrincipal(request, reply)
    if (!principal) return reply
    const { slug } = request.params as { slug: string }
    if (!SLUG_PATTERN.test(slug)) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Short link not found.' } })
    }
    const deleted = deleteShortLink(options.database, slug, {
      createdBy: principal.uploader,
      isAdmin: isAdministrator(principal),
    })
    if (!deleted) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Short link not found.' } })
    }
    recordAuditLogSafe(options.database, {
      actor: principal.uploader,
      action: 'short_link_deleted',
      target: `link:${slug}`,
    })
    return reply.code(204).send()
  })

  // 3. Raw resolver. Burn-after-reading is consumed exactly once.
  app.get('/s/:slug', async (request, reply) => {
    const link = await openLink(request, reply)
    if (!link) return reply
    const object = await options.driver.get(`sha256/${link.digest}`)
    if (!object) {
      return reply.code(404).type('text/plain').send('Underlying object not found.\n')
    }
    return reply
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', contentDisposition(link.filename))
      .type(link.content_type)
      .send(object.bytes)
  })

  // 4. Pastebin reader view. Every interpolated value is escaped and the page
  // is locked down with a CSP: paste text is hostile input by definition.
  app.get('/p/:slug', async (request, reply) => {
    const link = await openLink(request, reply)
    if (!link) return reply
    const object = await options.driver.get(`sha256/${link.digest}`)
    if (!object) {
      return reply.code(404).type('text/html; charset=utf-8').send('<h1>404 — Object not found</h1>')
    }

    const text = Buffer.from(object.bytes).toString('utf8')
    const headers = {
      'cache-control': 'private, no-store',
      'content-security-policy': HTML_CONTENT_SECURITY_POLICY,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    }
    const accept = request.headers.accept ?? ''
    if (accept.includes('text/plain') && !accept.includes('text/html')) {
      return reply.headers(headers).type('text/plain; charset=utf-8').send(text)
    }

    const filename = escapeHtml(link.filename)
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${filename} — ECHOLOG Pastebin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: #0f1117; color: #e2e8f0; margin: 0; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid #2d3748; padding-bottom: 12px; margin-bottom: 16px; }
    .meta { font-size: 12px; color: #a0aec0; }
    pre { background: #1a202c; padding: 16px; border-radius: 8px; overflow-x: auto; border: 1px solid #2d3748; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
    a.btn { background: #3182ce; color: #fff; text-decoration: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <strong>ECHOLOG Pastebin</strong> — ${filename}
      <div class="meta">Digest: ${escapeHtml(link.digest.slice(0, 16))}… · Created: ${escapeHtml(link.created_at)}${link.burn_after_reading === 1 ? ' · (Burned after this read)' : ''}</div>
    </div>
    <div>
      <a class="btn" href="/s/${encodeURIComponent(link.slug)}" download>Download Raw</a>
    </div>
  </div>
  <pre><code>${escapeHtml(text)}</code></pre>
</body>
</html>`

    return reply.headers(headers).type('text/html; charset=utf-8').send(html)
  })

  // 5. CLI dropzone. The MIME allow-list and size cap are the same rules as
  // the object API; a filename in the path is treated as untrusted.
  app.put('/drop/:filename', async (request, reply) => {
    const principal = await requirePrincipal(request, reply)
    if (!principal) return reply

    const contentType = normalizedMimeType(request.headers['content-type']) ?? 'application/octet-stream'
    if (!config.allowedMimeTypes.includes(contentType)) {
      throw new HttpProblem(415, 'unsupported_media_type', 'This content type is not allowed.')
    }
    const bytes = await readBody(request.body, config.maxUploadBytes)
    if (bytes.byteLength === 0) {
      return reply.code(400).type('text/plain').send('Empty upload.\n')
    }

    const { filename } = request.params as { filename: string }
    const sidecar = await options.driver.putStream((async function* () { yield bytes })(), {
      filename: safeStoredFilename(filename),
      content_type: contentType,
      uploader: principal.uploader,
      scan: 'skipped',
    })

    const link = insertLink(options.database, {
      slug: null,
      digest: sidecar.digest,
      filename: sidecar.filename,
      content_type: sidecar.content_type,
      created_by: principal.uploader,
    }, false)

    recordAuditLogSafe(options.database, {
      actor: principal.uploader,
      action: 'short_link_created',
      target: `link:${link.slug}`,
      details: { digest: link.digest, kind: 'drop' },
    })

    return reply.code(201).type('text/plain').send(
      `File: ${sidecar.filename}\nDigest: ${sidecar.digest}\nDownload URL: /s/${link.slug}\n`,
    )
  })

  async function openLink(request: FastifyRequest, reply: FastifyReply): Promise<ShortLinkRecord | null> {
    const { slug } = request.params as { slug: string }
    if (!SLUG_PATTERN.test(slug)) {
      reply.code(404).type('text/plain').send('Link expired or not found.\n')
      return null
    }
    const record = resolveShortLink(options.database, slug, now())
    if (!record) {
      reply.code(404).type('text/plain').send('Link expired or not found.\n')
      return null
    }
    if (await options.access.isPrivateWitness(record.digest)) {
      reply.code(404).type('text/plain').send('Link expired or not found.\n')
      return null
    }
    const consumed = consumeShortLink(options.database, slug, now())
    if (!consumed) {
      reply.code(404).type('text/plain').send('Link expired or not found.\n')
      return null
    }
    return consumed
  }
}

function publicLink(record: ShortLinkRecord) {
  return {
    slug: record.slug,
    digest: record.digest,
    filename: record.filename,
    content_type: record.content_type,
    created_at: record.created_at,
    expires_at: record.expires_at,
    burn_after_reading: record.burn_after_reading === 1,
    download_count: record.download_count,
    created_by: record.created_by,
  }
}

/** Insert with a generated or caller-chosen slug, mapping collisions to 409. */
function insertLink(
  database: EchologDatabase,
  entry: Omit<Parameters<typeof createShortLink>[1], 'slug'> & { slug: string | null },
  custom: boolean,
): ShortLinkRecord {
  const { slug: requested, ...rest } = entry
  const attempts = custom ? 1 : MAX_ATTEMPTS
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const slug = custom && requested ? requested : generateSlug()
    if (resolveShortLink(database, slug) !== null) {
      if (custom) throw new HttpProblem(409, 'slug_conflict', 'Slug already taken.')
      continue
    }
    try {
      return createShortLink(database, { ...rest, slug })
    } catch (error) {
      if (isUniqueViolation(error)) {
        if (custom) throw new HttpProblem(409, 'slug_conflict', 'Slug already taken.')
        continue
      }
      throw error
    }
  }
  throw new HttpProblem(503, 'slug_unavailable', 'Could not allocate a short link slug. Try again.')
}

function generateSlug(): string {
  return randomBytes(9).toString('base64url').slice(0, 9)
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
}

function isAdministrator(principal: EchologPrincipal): boolean {
  return principal.role === 'admin'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function readBody(body: unknown, maxBytes: number): Promise<Buffer> {
  if (body === undefined || body === null) return Buffer.alloc(0)
  if (typeof body === 'string') {
    const buffer = Buffer.from(body, 'utf8')
    if (buffer.byteLength > maxBytes) throw new HttpProblem(413, 'too_large', 'Upload exceeds the configured size limit.')
    return buffer
  }
  if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
    const buffer = Buffer.from(body)
    if (buffer.byteLength > maxBytes) throw new HttpProblem(413, 'too_large', 'Upload exceeds the configured size limit.')
    return buffer
  }
  if (typeof body === 'object' && Symbol.asyncIterator in body) {
    const chunks: Uint8Array[] = []
    let size = 0
    for await (const chunk of body as AsyncIterable<unknown>) {
      if (!(chunk instanceof Uint8Array)) throw new HttpProblem(400, 'invalid_body', 'Upload body must be a byte stream.')
      size += chunk.byteLength
      if (size > maxBytes) throw new HttpProblem(413, 'too_large', 'Upload exceeds the configured size limit.')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks, size)
  }
  return Buffer.alloc(0)
}
