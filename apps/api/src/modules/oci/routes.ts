import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { DigestAccessPolicy } from '../../access.js'
import type { EchologConfig } from '../../config.js'
import type { EchologDatabase } from '../../db.js'
import { createEchologAuthenticator } from '../../auth.js'
import type { EchologPrincipal } from '../../auth.js'
import type { FsStorageDriver } from '../../core/index.js'
import { HttpProblem } from '../../limits.js'
import { FsOciStore, isValidRepository, isValidTag } from './store.js'

/**
 * A deliberately small OCI Distribution v1.1 surface.
 *
 * Real clients address nested repositories (`library/alpine`), so routing is a
 * single `/v2/*` handler that parses the tail itself. Uploads are held in a
 * bounded, expiring session map; a digest is verified from the assembled bytes
 * before anything is persisted, so an interrupted or lying client cannot create
 * an object under someone else's digest.
 */

const API_VERSION = 'registry/2.0'
const MAX_UPLOAD_SESSIONS = 32
const UPLOAD_TTL_MS = 30 * 60 * 1000
const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 1000
const DIGEST_PATTERN = /^sha256:([a-f0-9]{64})$/

export interface OciRouteOptions {
  driver: FsStorageDriver
  database: EchologDatabase
  access: DigestAccessPolicy
  now?: () => number
}

interface UploadSession {
  id: string
  repository: string
  chunks: Uint8Array[]
  size: number
  createdAt: number
}

type OciRequest =
  | { kind: 'ping' }
  | { kind: 'catalog' }
  | { kind: 'tags'; repository: string }
  | { kind: 'upload-start'; repository: string }
  | { kind: 'upload'; repository: string; uploadId: string }
  | { kind: 'blob'; repository: string; digest: string }
  | { kind: 'manifest'; repository: string; reference: string }

export function registerOciRoutes(
  app: FastifyInstance,
  config: EchologConfig,
  options: OciRouteOptions,
): FsOciStore {
  const now = options.now ?? Date.now
  const store = new FsOciStore(config.storageRoot)
  const uploads = new Map<string, UploadSession>()
  const authenticate = createEchologAuthenticator({
    database: options.database,
    serviceKey: config.serviceKey,
    arsyUrl: config.arsyUrl,
    ...(options.now ? { now: options.now } : {}),
  })

  // Manifest media types are not part of the object MIME allow-list; parse
  // them as opaque byte streams so the registry can verify the digest itself.
  for (const mediaType of [
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
  ]) {
    if (!app.hasContentTypeParser(mediaType)) {
      app.addContentTypeParser(mediaType, (_request, payload, done) => done(null, payload))
    }
  }

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/v2')) reply.header('docker-distribution-api-version', API_VERSION)
    return payload
  })

  const authorize = async (
    request: FastifyRequest,
    reply: FastifyReply,
    scope?: 'pull' | 'push',
  ): Promise<EchologPrincipal | null> => {
    const auth = await authenticate(request)
    if (auth.ok) return auth.principal
    reply.header('www-authenticate', `Basic realm="ECHOLOG OCI Registry"${scope ? `, scope="${scope}"` : ''}`)
    reply.code(auth.status === 503 ? 503 : 401).send({
      errors: [{
        code: auth.status === 503 ? 'UNAVAILABLE' : 'UNAUTHORIZED',
        message: auth.status === 503 ? 'Authentication is temporarily unavailable' : 'Authentication required',
      }],
    })
    return null
  }

  const parse = (request: FastifyRequest): OciRequest | null => parseOciPath(request.raw.url ?? '')

  const readChunk = async (request: FastifyRequest, maxBytes: number): Promise<Buffer> => {
    const body = request.body
    if (body === undefined || body === null) return Buffer.alloc(0)
    if (typeof body === 'string') return Buffer.from(body, 'utf8')
    if (body instanceof Uint8Array || Buffer.isBuffer(body)) return Buffer.from(body)
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
    throw new HttpProblem(400, 'invalid_body', 'Upload body must be a byte stream.')
  }

  const pruneUploads = (): void => {
    const cutoff = now() - UPLOAD_TTL_MS
    for (const [id, session] of uploads) {
      if (session.createdAt <= cutoff) uploads.delete(id)
    }
  }

  const appendChunk = async (
    request: FastifyRequest,
    reply: FastifyReply,
    session: UploadSession,
  ): Promise<boolean> => {
    const chunk = await readChunk(request, config.maxUploadBytes)
    if (session.size + chunk.byteLength > config.maxUploadBytes) {
      throw new HttpProblem(413, 'too_large', 'Upload exceeds the configured size limit.')
    }
    const contentRange = oneHeader(request.headers['content-range'])
    if (contentRange !== undefined) {
      const range = parseContentRange(contentRange)
      if (!range) {
        reply.code(416).header('location', uploadLocation(session)).send({
          errors: [{ code: 'BLOB_UPLOAD_INVALID', message: 'The Content-Range header is invalid' }],
        })
        return false
      }
      if (range.start !== session.size || range.end - range.start + 1 !== chunk.byteLength) {
        reply.code(416).header('location', uploadLocation(session)).send({
          errors: [{ code: 'BLOB_UPLOAD_INVALID', message: 'Content-Range does not match the current upload offset' }],
        })
        return false
      }
    }
    session.chunks.push(chunk)
    session.size += chunk.byteLength
    return true
  }

  // Ping.
  for (const url of ['/v2', '/v2/']) {
    app.get(url, async (request, reply) => {
      if (!await authorize(request, reply)) return reply
      return reply.code(200).send({})
    })
  }

  app.post('/v2/*', async (request, reply) => {
    const parsed = parse(request)
    if (!parsed || parsed.kind !== 'upload-start') return notFound(reply, 'UNSUPPORTED', 'Unsupported registry operation')
    if (!await authorize(request, reply, 'push')) return reply

    pruneUploads()
    if (uploads.size >= MAX_UPLOAD_SESSIONS) {
      return reply.code(429).send({ errors: [{ code: 'TOOMANYREQUESTS', message: 'Too many concurrent uploads' }] })
    }
    const id = randomUUID()
    const session: UploadSession = {
      id,
      repository: parsed.repository,
      chunks: [],
      size: 0,
      createdAt: now(),
    }
    uploads.set(id, session)
    return reply
      .code(202)
      .header('location', uploadLocation(session))
      .header('range', '0-0')
      .header('docker-upload-uuid', id)
      .send()
  })

  app.patch('/v2/*', async (request, reply) => {
    const parsed = parse(request)
    if (!parsed || parsed.kind !== 'upload') return notFound(reply, 'UNSUPPORTED', 'Unsupported registry operation')
    if (!await authorize(request, reply, 'push')) return reply
    const session = uploads.get(parsed.uploadId)
    if (!session || session.repository !== parsed.repository) {
      return notFound(reply, 'BLOB_UPLOAD_UNKNOWN', 'Upload session not found')
    }
    if (!await appendChunk(request, reply, session)) return reply
    return reply
      .code(202)
      .header('location', uploadLocation(session))
      .header('range', `0-${Math.max(0, session.size - 1)}`)
      .header('docker-upload-uuid', session.id)
      .send()
  })

  app.put('/v2/*', async (request, reply) => {
    const parsed = parse(request)
    if (!parsed) return notFound(reply, 'UNSUPPORTED', 'Unsupported registry operation')
    if (parsed.kind === 'upload') return commitUpload(request, reply, parsed)
    if (parsed.kind === 'manifest') return putManifest(request, reply, parsed)
    return notFound(reply, 'UNSUPPORTED', 'Unsupported registry operation')
  })

  app.get('/v2/*', async (request, reply) => {
    const parsed = parse(request)
    if (!parsed) return notFound(reply, 'UNSUPPORTED', 'Unsupported registry operation')
    switch (parsed.kind) {
      case 'ping': return reply.code(200).send({})
      case 'catalog': return catalog(request, reply)
      case 'tags': return tagList(request, reply, parsed.repository)
      case 'blob': return getBlob(request, reply, parsed.repository, parsed.digest, false)
      case 'manifest': return getManifest(request, reply, parsed.repository, parsed.reference, false)
      default: return notFound(reply, 'UNSUPPORTED', 'Unsupported registry operation')
    }
  })

  app.head('/v2/*', async (request, reply) => {
    const parsed = parse(request)
    if (!parsed) return notFound(reply, 'UNSUPPORTED', 'Unsupported registry operation')
    if (parsed.kind === 'blob') return getBlob(request, reply, parsed.repository, parsed.digest, true)
    if (parsed.kind === 'manifest') return getManifest(request, reply, parsed.repository, parsed.reference, true)
    return reply.code(200).send()
  })

  app.delete('/v2/*', async (request, reply) => {
    const parsed = parse(request)
    if (!parsed || parsed.kind !== 'manifest') return notFound(reply, 'UNSUPPORTED', 'Unsupported registry operation')
    if (!await authorize(request, reply, 'push')) return reply
    if (parsed.reference.startsWith('sha256:')) {
      return reply.code(405).send({
        errors: [{ code: 'UNSUPPORTED', message: 'Manifests are immutable; delete the tag instead' }],
      })
    }
    const deleted = await store.deleteTag(parsed.repository, parsed.reference)
    if (!deleted) return notFound(reply, 'MANIFEST_UNKNOWN', 'Tag not found')
    return reply.code(202).send()
  })

  // Console helper: one call, nested repositories included.
  app.get('/api/v1/registry/repositories', async (request, reply) => {
    if (!await authorize(request, reply, 'pull')) return reply
    const repositories = await store.listRepositories()
    const result = await Promise.all(repositories.map(async (repository) => ({
      repository,
      tags: await store.listTags(repository),
    })))
    return reply.header('cache-control', 'no-store').send(result)
  })

  async function commitUpload(
    request: FastifyRequest,
    reply: FastifyReply,
    parsed: { repository: string; uploadId: string },
  ): Promise<unknown> {
    if (!await authorize(request, reply, 'push')) return reply
    const session = uploads.get(parsed.uploadId)
    if (!session || session.repository !== parsed.repository) {
      return notFound(reply, 'BLOB_UPLOAD_UNKNOWN', 'Upload session not found')
    }

    const query = request.query as { digest?: unknown }
    const digestValue = typeof query.digest === 'string' ? query.digest : ''
    const requested = DIGEST_PATTERN.exec(digestValue)
    if (!requested) {
      uploads.delete(session.id)
      return reply.code(400).send({ errors: [{ code: 'DIGEST_INVALID', message: 'A sha256 digest query parameter is required' }] })
    }

    if (!await appendChunk(request, reply, session)) return reply
    uploads.delete(session.id)

    const hash = createHash('sha256')
    for (const chunk of session.chunks) hash.update(chunk)
    const actual = hash.digest('hex')
    if (actual !== requested[1]) {
      return reply.code(400).send({
        errors: [{ code: 'DIGEST_INVALID', message: 'Payload checksum does not match requested digest' }],
      })
    }

    const objectKey = `sha256/${actual}`
    if (!await options.driver.get(objectKey)) {
      await options.driver.putStream((async function* () {
        for (const chunk of session.chunks) yield chunk
      })(), {
        filename: `${parsed.repository}.blob`,
        content_type: 'application/octet-stream',
        uploader: 'oci-registry',
        scan: 'skipped',
      })
    }

    return reply
      .code(201)
      .header('location', `/v2/${parsed.repository}/blobs/sha256:${actual}`)
      .header('docker-content-digest', `sha256:${actual}`)
      .send()
  }

  async function putManifest(
    request: FastifyRequest,
    reply: FastifyReply,
    parsed: { repository: string; reference: string },
  ): Promise<unknown> {
    if (!await authorize(request, reply, 'push')) return reply
    const bytes = await readChunk(request, config.maxUploadBytes)
    if (bytes.byteLength === 0) {
      return reply.code(400).send({ errors: [{ code: 'MANIFEST_INVALID', message: 'Manifest body is empty' }] })
    }
    try {
      const manifest = JSON.parse(bytes.toString('utf8')) as { schemaVersion?: unknown }
      if (!manifest || typeof manifest !== 'object' || manifest.schemaVersion !== 2) {
        return reply.code(400).send({ errors: [{ code: 'MANIFEST_INVALID', message: 'Manifest must be schemaVersion 2 JSON' }] })
      }
    } catch {
      return reply.code(400).send({ errors: [{ code: 'MANIFEST_INVALID', message: 'Manifest is not valid JSON' }] })
    }

    const digest = createHash('sha256').update(bytes).digest('hex')
    const isDigestReference = parsed.reference.startsWith('sha256:')
    if (isDigestReference && parsed.reference !== `sha256:${digest}`) {
      return reply.code(400).send({ errors: [{ code: 'DIGEST_INVALID', message: 'Manifest digest does not match the body' }] })
    }
    if (!isDigestReference && !isValidTag(parsed.reference)) {
      return reply.code(400).send({ errors: [{ code: 'TAG_INVALID', message: 'Invalid tag name' }] })
    }

    const objectKey = `sha256/${digest}`
    if (!await options.driver.get(objectKey)) {
      const contentType = oneHeader(request.headers['content-type'])?.split(';', 1)[0]?.trim()
        || 'application/vnd.oci.image.manifest.v1+json'
      await options.driver.putStream((async function* () { yield bytes })(), {
        filename: `${parsed.repository}-manifest.json`,
        content_type: contentType,
        uploader: 'oci-registry',
        scan: 'skipped',
      })
    }

    if (!isDigestReference) await store.putTag(parsed.repository, parsed.reference, digest, new Date(now()))

    return reply
      .code(201)
      .header('location', `/v2/${parsed.repository}/manifests/sha256:${digest}`)
      .header('docker-content-digest', `sha256:${digest}`)
      .send()
  }

  async function getBlob(
    request: FastifyRequest,
    reply: FastifyReply,
    repository: string,
    digest: string,
    headOnly: boolean,
  ): Promise<unknown> {
    const principal = await authorize(request, reply, 'pull')
    if (!principal) return reply
    const hex = digest.slice('sha256:'.length)
    if (!await options.access.canRead(request, hex, principal)) {
      return notFound(reply, 'BLOB_UNKNOWN', 'Blob not found')
    }
    const object = await options.driver.get(`sha256/${hex}`)
    if (!object) return notFound(reply, 'BLOB_UNKNOWN', 'Blob not found')

    const total = object.bytes.byteLength
    const range = headOnly ? null : parseRange(oneHeader(request.headers.range), total)
    const base = reply
      .header('docker-content-digest', `sha256:${hex}`)
      .header('accept-ranges', 'bytes')
      .header('etag', `"sha256:${hex}"`)
      .type(object.sidecar.content_type)

    if (range === 'invalid') {
      return reply.code(416).header('content-range', `bytes */${total}`).send()
    }
    if (range) {
      const bytes = object.bytes.subarray(range.start, range.end + 1)
      return base
        .code(206)
        .header('content-range', `bytes ${range.start}-${range.end}/${total}`)
        .header('content-length', String(bytes.byteLength))
        .send(headOnly ? undefined : bytes)
    }

    base.header('content-length', String(total))
    if (headOnly) return base.code(200).send()
    return base.code(200).send(object.bytes)
  }

  async function getManifest(
    request: FastifyRequest,
    reply: FastifyReply,
    repository: string,
    reference: string,
    headOnly: boolean,
  ): Promise<unknown> {
    const principal = await authorize(request, reply, 'pull')
    if (!principal) return reply

    let digest: string
    if (reference.startsWith('sha256:')) {
      const match = DIGEST_PATTERN.exec(reference)
      if (!match) return notFound(reply, 'MANIFEST_UNKNOWN', 'Manifest not found')
      digest = match[1]!
    } else {
      if (!isValidTag(reference)) return notFound(reply, 'MANIFEST_UNKNOWN', 'Manifest not found')
      const tag = await store.getTag(repository, reference)
      if (!tag) return notFound(reply, 'MANIFEST_UNKNOWN', 'Tag not found')
      digest = tag.digest
    }

    if (!await options.access.canRead(request, digest, principal)) {
      return notFound(reply, 'MANIFEST_UNKNOWN', 'Manifest not found')
    }
    const object = await options.driver.get(`sha256/${digest}`)
    if (!object) return notFound(reply, 'MANIFEST_UNKNOWN', 'Manifest not found')

    const base = reply
      .header('docker-content-digest', `sha256:${digest}`)
      .header('etag', `"sha256:${digest}"`)
      .header('content-length', String(object.bytes.byteLength))
      .type(object.sidecar.content_type)
    return headOnly ? base.code(200).send() : base.code(200).send(object.bytes)
  }

  async function tagList(
    request: FastifyRequest,
    reply: FastifyReply,
    repository: string,
  ): Promise<unknown> {
    if (!await authorize(request, reply, 'pull')) return reply
    const page = parsePage(request)
    const tags = await store.listTags(repository)
    const visible = page.last ? tags.filter((tag) => tag > page.last!) : tags
    const sliced = visible.slice(0, page.size)
    const truncated = visible.length > sliced.length
    if (truncated && sliced.length > 0) {
      reply.header('link', `</v2/${repository}/tags/list?n=${page.size}&last=${encodeURIComponent(sliced[sliced.length - 1]!)}>; rel="next"`)
    }
    return reply.header('cache-control', 'no-store').send({ name: repository, tags: sliced.length > 0 ? sliced : null })
  }

  async function catalog(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    if (!await authorize(request, reply, 'pull')) return reply
    const page = parsePage(request)
    const repositories = await store.listRepositories()
    const visible = page.last ? repositories.filter((name) => name > page.last!) : repositories
    const sliced = visible.slice(0, page.size)
    const truncated = visible.length > sliced.length
    if (truncated && sliced.length > 0) {
      reply.header('link', `</v2/_catalog?n=${page.size}&last=${encodeURIComponent(sliced[sliced.length - 1]!)}>; rel="next"`)
    }
    return reply.header('cache-control', 'no-store').send({ repositories: sliced })
  }

  return store
}

function parseOciPath(rawUrl: string): OciRequest | null {
  const pathname = new URL(rawUrl, 'http://echolog.invalid').pathname
  if (pathname === '/v2' || pathname === '/v2/') return { kind: 'ping' }
  if (!pathname.startsWith('/v2/')) return null
  const rest = pathname.slice(4)
  if (rest === '_catalog') return { kind: 'catalog' }

  const uploadStart = /^(.+)\/blobs\/uploads\/?$/.exec(rest)
  if (uploadStart && isValidRepository(uploadStart[1]!)) return { kind: 'upload-start', repository: uploadStart[1]! }

  const upload = /^(.+)\/blobs\/uploads\/([^/]+)$/.exec(rest)
  if (upload && isValidRepository(upload[1]!)) return { kind: 'upload', repository: upload[1]!, uploadId: upload[2]! }

  const blob = /^(.+)\/blobs\/(sha256:[a-f0-9]{64})$/.exec(rest)
  if (blob && isValidRepository(blob[1]!)) return { kind: 'blob', repository: blob[1]!, digest: blob[2]! }

  const tags = /^(.+)\/tags\/list$/.exec(rest)
  if (tags && isValidRepository(tags[1]!)) return { kind: 'tags', repository: tags[1]! }

  const manifest = /^(.+)\/manifests\/([^/]+)$/.exec(rest)
  if (manifest && isValidRepository(manifest[1]!)) return { kind: 'manifest', repository: manifest[1]!, reference: manifest[2]! }

  return null
}

function parseContentRange(value: string): { start: number; end: number } | null {
  const match = /^(?:bytes\s+)?(\d+)-(\d+)(?:\/(?:\d+|\*))?$/.exec(value.trim())
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null
  return { start, end }
}

function parseRange(value: string | undefined, total: number): { start: number; end: number } | 'invalid' | null {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match) return 'invalid'
  if (total === 0) return 'invalid'
  let start: number
  let end: number
  if (match[1] === '' && match[2] !== '') {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return 'invalid'
    start = Math.max(0, total - suffix)
    end = total - 1
  } else if (match[1] !== '') {
    start = Number(match[1])
    end = match[2] === '' ? total - 1 : Number(match[2])
  } else {
    return 'invalid'
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= total || end < start) return 'invalid'
  return { start, end: Math.min(end, total - 1) }
}

function parsePage(request: FastifyRequest): { size: number; last: string | null } {
  const query = request.query as { n?: unknown; last?: unknown }
  const rawSize = typeof query.n === 'string' ? query.n : undefined
  let size = DEFAULT_PAGE_SIZE
  if (rawSize !== undefined) {
    const parsed = Number(rawSize)
    size = Number.isSafeInteger(parsed) && parsed >= 1 ? Math.min(parsed, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE
  }
  return { size, last: typeof query.last === 'string' && query.last.length > 0 ? query.last : null }
}

function uploadLocation(session: UploadSession): string {
  return `/v2/${session.repository}/blobs/uploads/${session.id}`
}

function notFound(reply: FastifyReply, code: string, message: string): unknown {
  return reply.code(404).send({ errors: [{ code, message }] })
}

function oneHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}
