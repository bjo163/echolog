import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { sha256Hex } from '../../core/index.js'
import type { EchologConfig } from '../../config.js'
import { compareS3Keys, S3KeyConflictError, S3ObjectNotFoundError, validateObjectKey, type FsS3KeyStore } from './store.js'
import { isSafeRawPath, verifyS3Request } from './sigv4.js'
import { createUploadLimiter } from './upload-limiter.js'

const DEFAULT_MAX_KEYS = 1000
const MAX_BUFFERED_UPLOADS = 4
const withUploadSlot = createUploadLimiter(MAX_BUFFERED_UPLOADS)

export function registerS3Routes(app: FastifyInstance, config: EchologConfig, store: FsS3KeyStore, now = () => Date.now()): void {
  if (!config.s3Bucket || !config.s3AccessKeyId || !config.s3SecretAccessKey) return
  const bucket = `/${config.s3Bucket}`
  app.route({
    method: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
    url: bucket,
    handler: async (request, reply) => request.method === 'PUT'
      ? withUploadSlot(() => handleS3Request(request, reply, config, store, now, null))
      : handleS3Request(request, reply, config, store, now, null),
  })
  app.route({
    method: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
    url: `${bucket}/*`,
    handler: async (request, reply) => request.method === 'PUT'
      ? withUploadSlot(() => handleS3Request(request, reply, config, store, now, getRawObjectKey(request, config.s3Bucket)))
      : handleS3Request(request, reply, config, store, now, getRawObjectKey(request, config.s3Bucket)),
  })
}

async function handleS3Request(
  request: FastifyRequest,
  reply: FastifyReply,
  config: EchologConfig,
  store: FsS3KeyStore,
  now: () => number,
  key: string | null,
): Promise<unknown> {
  const resource = request.raw.url ?? `/${config.s3Bucket}`
  // Reject traversal in the request target before the payload is read or the store is touched.
  const rawTarget = new URL(resource, 'http://echolog.invalid').pathname
  if (!isSafeRawPath(rawTarget)) {
    return sendError(reply, 400, 'InvalidObjectName', 'The object key is invalid.', resource)
  }

  const query = new URL(resource, 'http://echolog.invalid').searchParams
  const listQuery = key === null && request.method === 'GET'
  const allowedQuery = listQuery
    ? new Set(['list-type', 'prefix', 'delimiter', 'max-keys', 'continuation-token', 'start-after', 'x-id'])
    : new Set(request.method === 'PUT' ? ['x-id'] : request.method === 'GET' ? ['x-id'] : request.method === 'HEAD' ? ['x-id'] : request.method === 'DELETE' ? ['x-id'] : [])
  const expectedOperation = listQuery ? 'ListObjectsV2' : request.method === 'PUT' ? 'PutObject' : request.method === 'GET' ? 'GetObject' : request.method === 'HEAD' ? (key === null ? 'HeadBucket' : 'HeadObject') : request.method === 'DELETE' ? 'DeleteObject' : null
  if ([...query.keys()].some((name) => !allowedQuery.has(name)) || (query.has('x-id') && query.getAll('x-id').some((value) => value !== expectedOperation))) {
    return sendError(reply, 501, 'NotImplemented', 'This S3 query operation is not supported.', resource)
  }

  const authFailure = await verifyS3Request(request, {
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: config.s3SecretAccessKey,
    region: config.s3Region,
  }, now())
  if (authFailure) {
    if (authFailure === 'missing') return sendError(reply, 403, 'AccessDenied', 'A signed S3 request is required.', resource)
    if (authFailure === 'stale') return sendError(reply, 403, 'RequestTimeTooSkewed', 'The request date is outside the accepted window.', resource)
    if (authFailure === 'unsafe-path') return sendError(reply, 400, 'InvalidObjectName', 'The object key is invalid.', resource)
    if (authFailure === 'unsupported') return sendError(reply, 501, 'NotImplemented', 'This S3 authentication mode is not supported.', resource)
    return sendError(reply, 403, 'SignatureDoesNotMatch', 'The request signature is invalid.', resource)
  }

  if (request.method === 'POST') {
    return sendError(reply, 501, 'NotImplemented', 'Browser POST uploads and this operation are not supported.', resource)
  }

  let payload: Uint8Array
  try {
    // Each active S3 request can retain chunk buffers and one contiguous copy. Four slots
    // bound that transient body memory to at most 8 * maxUploadBytes across handlers.
    payload = request.method === 'PUT' || request.method === 'POST'
      ? await readPayload(request.body, config.maxUploadBytes)
      : new Uint8Array()
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return sendError(reply, 413, 'EntityTooLarge', message || 'Object exceeds the configured size limit.', resource)
  }

  if (await sha256Hex(payload) !== oneHeader(request.headers['x-amz-content-sha256'])) {
    return sendError(reply, 403, 'SignatureDoesNotMatch', 'The request signature is invalid.', resource)
  }

  if (key === null) {
    if (request.method === 'HEAD') return reply.code(200).header('x-amz-bucket-region', config.s3Region).send()
    if (request.method === 'GET') return listObjects(request, reply, store, resource, config.s3Bucket, config.s3Region)
    return sendError(reply, 501, 'NotImplemented', 'Bucket creation and this operation are not supported.', resource)
  }

  let objectKey: string
  try {
    objectKey = decodeURIComponent(key)
    validateObjectKey(objectKey)
  } catch {
    return sendError(reply, 400, 'InvalidObjectName', 'The object key is invalid.', resource)
  }

  if (request.method === 'PUT') {
    return putS3Object(request, reply, config, store, objectKey, payload, resource)
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    try {
      const object = await store.get(objectKey)
      if (!object) return sendError(reply, 404, 'NoSuchKey', 'The specified key does not exist.', resource)
      const base = reply
        .header('etag', `"${object.record.etag}"`)
        .header('last-modified', new Date(object.record.last_modified).toUTCString())
        .header('content-type', object.record.content_type)
        .header('content-length', String(object.record.size))
        .header('x-amz-meta-echolog-digest', object.record.digest)
      if (object.record.retention_until) base.header('x-amz-meta-echolog-retention-until', object.record.retention_until)
      if (object.record.legal_hold) base.header('x-amz-meta-echolog-legal-hold', 'true')
      return request.method === 'HEAD' ? base.code(200).send() : base.code(200).send(object.bytes)
    } catch {
      return sendError(reply, 500, 'InternalError', 'The object could not be read.', resource)
    }
  }

  if (request.method === 'DELETE') {
    try {
      await store.delete(objectKey, new Date(now()))
      return reply.code(204).header('x-amz-version-id', 'null').send()
    } catch (error) {
      if (error instanceof S3ObjectNotFoundError) return reply.code(204).send()
      if (error instanceof Error && error.message === 'Private witness object is protected') {
        return sendError(reply, 404, 'NoSuchKey', 'The specified key does not exist.', resource)
      }
      if (error instanceof Error && /legal hold|retention period/.test(error.message)) {
        return sendError(reply, 409, 'ObjectLocked', 'Object is protected by ECHOLOG retention policy.', resource)
      }
      return sendError(reply, 500, 'InternalError', 'The object could not be deleted.', resource)
    }
  }

  return sendError(reply, 501, 'NotImplemented', 'This S3 operation is not supported.', resource)
}

async function putS3Object(
  request: FastifyRequest,
  reply: FastifyReply,
  config: EchologConfig,
  store: FsS3KeyStore,
  objectKey: string,
  payload: Uint8Array,
  resource: string,
): Promise<unknown> {
  const contentType = oneHeader(request.headers['content-type'])?.split(';', 1)[0]?.trim().toLowerCase() || 'application/octet-stream'
  if (!config.allowedMimeTypes.includes(contentType)) {
    return sendError(reply, 415, 'InvalidContentType', 'The object content type is not allowed.', resource)
  }
  const retention = oneHeader(request.headers['x-amz-meta-echolog-retention-until']) ?? null
  if (retention !== null && !Number.isFinite(Date.parse(retention))) {
    return sendError(reply, 400, 'InvalidArgument', 'The ECHOLOG retention date is invalid.', resource)
  }
  const legalHoldHeader = oneHeader(request.headers['x-amz-meta-echolog-legal-hold'])
  if (legalHoldHeader !== undefined && legalHoldHeader !== 'true' && legalHoldHeader !== 'false') {
    return sendError(reply, 400, 'InvalidArgument', 'The ECHOLOG legal-hold value is invalid.', resource)
  }
  const privateWitnessHeader = oneHeader(request.headers['x-amz-meta-echolog-private-witness'])
  if (privateWitnessHeader !== undefined && privateWitnessHeader !== 'true' && privateWitnessHeader !== 'false') {
    return sendError(reply, 400, 'InvalidArgument', 'The ECHOLOG private-witness value is invalid.', resource)
  }
  try {
    const record = await store.put(objectKey, payload, contentType, {
      retentionUntil: retention,
      legalHold: legalHoldHeader === 'true',
      privateWitness: privateWitnessHeader === 'true',
    })
    return reply.code(200).header('etag', `"${record.etag}"`).header('x-amz-version-id', 'null').send()
  } catch (error) {
    if (error instanceof S3KeyConflictError) return sendError(reply, 409, 'PreconditionFailed', error.message, resource)
    if (error instanceof TypeError) return sendError(reply, 400, 'InvalidObjectName', 'The object key is invalid.', resource)
    return sendError(reply, 500, 'InternalError', 'The object could not be stored.', resource)
  }
}

async function listObjects(
  request: FastifyRequest,
  reply: FastifyReply,
  store: FsS3KeyStore,
  resource: string,
  bucket: string,
  region: string,
): Promise<unknown> {
  const url = new URL(resource, 'http://echolog.invalid')
  const params = url.searchParams
  if ([...params.keys()].some((key) => !['list-type', 'prefix', 'delimiter', 'max-keys', 'continuation-token', 'start-after', 'x-id'].includes(key))) {
    return sendError(reply, 501, 'NotImplemented', 'This list query is not supported.', resource)
  }
  if (params.get('list-type') !== '2') return sendError(reply, 501, 'NotImplemented', 'Only ListObjectsV2 is supported.', resource)
  const prefix = params.get('prefix') ?? ''
  const delimiter = params.get('delimiter') ?? ''
  const maxValue = params.get('max-keys') ?? String(DEFAULT_MAX_KEYS)
  const maxKeys = Number(maxValue)
  if (!/^(0|[1-9]\d*)$/.test(maxValue) || !Number.isSafeInteger(maxKeys) || maxKeys > DEFAULT_MAX_KEYS) {
    return sendError(reply, 400, 'InvalidArgument', 'max-keys must be an integer from 0 to 1000.', resource)
  }
  const token = params.get('continuation-token')
  let after = params.get('start-after') ?? ''
  let skippedPrefix: string | null = null
  if (token) {
    try {
      const cursor = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as { after?: unknown; skippedPrefix?: unknown }
      if (typeof cursor.after !== 'string' || (cursor.skippedPrefix !== undefined && typeof cursor.skippedPrefix !== 'string')) {
        throw new Error('Invalid continuation cursor')
      }
      after = cursor.after
      skippedPrefix = typeof cursor.skippedPrefix === 'string' ? cursor.skippedPrefix : null
      if (after !== '') validateObjectKey(after)
      if (skippedPrefix !== null) validateObjectKey(skippedPrefix)
    } catch {
      return sendError(reply, 400, 'InvalidToken', 'The continuation token is invalid.', resource)
    }
  }

  const listed = await store.list()
  const visible: Awaited<ReturnType<typeof store.list>> = []
  for (const entry of listed) {
    if (!await store.isPrivateWitness(entry.digest)) visible.push(entry)
  }
  const all = visible.filter((entry) => entry.key.startsWith(prefix)
    && compareS3Keys(entry.key, after) > 0
    && (skippedPrefix === null || !entry.key.startsWith(skippedPrefix)))
  const contents: typeof all = []
  const commonPrefixes = new Set<string>()
  for (const entry of all) {
    const remainder = entry.key.slice(prefix.length)
    const delimiterAt = delimiter ? remainder.indexOf(delimiter) : -1
    if (delimiterAt >= 0) commonPrefixes.add(prefix + remainder.slice(0, delimiterAt + delimiter.length))
    else contents.push(entry)
  }
  const merged = [
    ...contents.map((entry) => ({ key: entry.key, record: entry })),
    ...[...commonPrefixes].map((key) => ({ key, record: null as (typeof all)[number] | null })),
  ].sort((left, right) => compareS3Keys(left.key, right.key))
  const page = merged.slice(0, maxKeys)
  const truncated = merged.length > page.length
  const lastPageKey = page[page.length - 1]?.key
  const cursorAfter = lastPageKey ?? after
  const cursorSkippedPrefix = lastPageKey && commonPrefixes.has(lastPageKey) ? lastPageKey : skippedPrefix
  const nextToken = truncated
    ? Buffer.from(JSON.stringify({ after: cursorAfter, ...(cursorSkippedPrefix ? { skippedPrefix: cursorSkippedPrefix } : {}) })).toString('base64url')
    : null
  const xml = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${xmlEscape(bucket)}</Name><Prefix>${xmlEscape(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys><IsTruncated>${truncated}</IsTruncated>${page.map(({ record }) => record ? `<Contents><Key>${xmlEscape(record.key)}</Key><LastModified>${xmlEscape(new Date(record.last_modified).toISOString())}</LastModified><ETag>&quot;${xmlEscape(record.etag)}&quot;</ETag><Size>${record.size}</Size><StorageClass>STANDARD</StorageClass></Contents>` : '').join('')}${[...commonPrefixes].filter((value) => page.some((item) => item.key === value)).map((value) => `<CommonPrefixes><Prefix>${xmlEscape(value)}</Prefix></CommonPrefixes>`).join('')}${nextToken ? `<NextContinuationToken>${nextToken}</NextContinuationToken>` : ''}</ListBucketResult>`
  return reply.code(200).type('application/xml').header('x-amz-bucket-region', region).send(xml)
}

function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  resource: string,
): unknown {
  const requestId = crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${xmlEscape(code)}</Code><Message>${xmlEscape(message)}</Message><Resource>${xmlEscape(resource)}</Resource><RequestId>${requestId}</RequestId></Error>`
  return reply.code(status).type('application/xml').header('x-amz-request-id', requestId).send(xml)
}

function getRawObjectKey(request: FastifyRequest, bucket: string): string | null {
  const rawUrl = request.raw.url
  if (!rawUrl) return null
  const path = new URL(rawUrl, 'http://echolog.invalid').pathname
  const prefix = `/${bucket}`
  // Path-style bucket operations arrive as `/bucket` and `/bucket/`; both are bucket-level,
  // so an empty remainder must not be read as an object key.
  if (path !== prefix && !path.startsWith(`${prefix}/`)) return null
  const remainder = path.slice(prefix.length + 1)
  return remainder.length > 0 ? remainder : null
}

async function readPayload(body: unknown, maxBytes: number): Promise<Uint8Array> {
  if (body === undefined || body === null) return new Uint8Array()
  if (body instanceof Uint8Array) {
    if (body.byteLength > maxBytes) throw new RangeError('Object exceeds the configured size limit.')
    return new Uint8Array(body)
  }
  if (typeof body !== 'object' || !(Symbol.asyncIterator in body)) throw new TypeError('S3 request payload is not a byte stream.')
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array)) throw new TypeError('S3 request payload is not a byte stream.')
    size += chunk.byteLength
    if (size > maxBytes) throw new RangeError('Object exceeds the configured size limit.')
    chunks.push(chunk)
  }
  const payload = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    payload.set(chunk, offset)
    offset += chunk.byteLength
  }
  return payload
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function oneHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}
