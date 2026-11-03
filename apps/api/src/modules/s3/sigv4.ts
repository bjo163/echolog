import { SignatureV4 } from '@smithy/signature-v4'
import type { HttpRequest } from '@smithy/types'
import type { FastifyRequest } from 'fastify'

type HashInput = string | ArrayBuffer | ArrayBufferView

/**
 * Smithy's SignatureV4 hash contract implemented on Web Crypto, so the S3 module keeps to
 * the same no-`node:crypto` boundary as the rest of apps/echolog. Instances are single use:
 * Smithy buffers updates and digests once.
 */
class WebCryptoSha256 {
  private readonly chunks: Uint8Array[] = []
  private readonly secret: Uint8Array | undefined

  constructor(secret?: HashInput) {
    this.secret = secret === undefined ? undefined : toBytes(secret)
  }

  update(value: HashInput): void {
    this.chunks.push(toBytes(value))
  }

  async digest(): Promise<Uint8Array> {
    const data = joinBytes(this.chunks)
    if (!this.secret) return new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(data)))
    const key = await crypto.subtle.importKey('raw', toArrayBuffer(this.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, toArrayBuffer(data)))
  }
}

export interface S3CredentialConfig {
  accessKeyId: string
  secretAccessKey: string
  region: string
}

export type S3AuthFailure = 'missing' | 'invalid' | 'stale' | 'unsupported' | 'unsafe-path'

/** Verify the supported SigV4 header-auth subset by re-signing with Smithy's implementation. */
export async function verifyS3Request(
  request: FastifyRequest,
  config: S3CredentialConfig,
  now = Date.now(),
): Promise<S3AuthFailure | null> {
  const authorization = oneHeader(request.headers.authorization)
  if (!authorization) return 'missing'
  const parsed = parseAuthorization(authorization)
  if (!parsed) return 'unsupported'
  if (parsed.accessKeyId !== config.accessKeyId || parsed.region !== config.region) return 'invalid'

  const dateHeader = oneHeader(request.headers['x-amz-date'])
  const payloadHeader = oneHeader(request.headers['x-amz-content-sha256'])
  if (!dateHeader || !payloadHeader || !/^\d{8}T\d{6}Z$/.test(dateHeader)) return 'unsupported'
  if (!/^[a-f0-9]{64}$/.test(payloadHeader)) return 'unsupported'
  const date = parseAmzDate(dateHeader)
  if (!date || Math.abs(now - date.getTime()) > 5 * 60 * 1000) return 'stale'
  if (parsed.credentialDate !== dateHeader.slice(0, 8)) return 'invalid'

  // Only a signed payload is accepted: UNSIGNED-PAYLOAD and chunked modes fail the hex test.
  // SigV4 authenticates the declared payload hash before the body is consumed. The route
  // compares this value with the actual bytes after bounded buffering.

  const rawUrl = request.raw.url
  const host = oneHeader(request.headers.host)
  if (!rawUrl || !host || rawUrl.includes('#')) return 'unsupported'
  const queryAt = rawUrl.indexOf('?')
  const rawPath = queryAt === -1 ? rawUrl : rawUrl.slice(0, queryAt)
  if (!isSafeRawPath(rawPath)) return 'unsafe-path'
  let parsedHost: URL
  try {
    parsedHost = new URL(`http://${host}`)
  } catch {
    return 'unsupported'
  }
  const searchParams = new URLSearchParams(queryAt === -1 ? '' : rawUrl.slice(queryAt + 1))
  if ([...searchParams.keys()].some((key) => /^x-amz-/i.test(key))) return 'unsupported'
  const query: Record<string, string | string[]> = {}
  for (const [key, value] of searchParams) {
    const existing = query[key]
    if (existing === undefined) query[key] = value
    else if (Array.isArray(existing)) existing.push(value)
    else query[key] = [existing, value]
  }

  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers[name] = value
    else if (Array.isArray(value)) return 'unsupported'
  }
  // Only the headers the client declared as signed take part in the canonical request;
  // transport headers added after signing (content-length, accept-encoding) stay unsigned.
  const signedHeaderList = parsed.signedHeaders.split(';')
  if (signedHeaderList.some((name) => name === 'authorization' || name === 'date')) return 'unsupported'
  const requiredHeaders = ['host', 'x-amz-date', 'x-amz-content-sha256']
  if (request.method === 'PUT' && headers['content-type']) requiredHeaders.push('content-type')
  for (const name of [
    'x-amz-meta-echolog-retention-until',
    'x-amz-meta-echolog-legal-hold',
    'x-amz-meta-echolog-private-witness',
  ]) {
    if (headers[name]) requiredHeaders.push(name)
  }
  if (requiredHeaders.some((name) => !signedHeaderList.includes(name))) return 'unsupported'
  if (signedHeaderList.some((name) => typeof headers[name] !== 'string')) return 'unsupported'
  const signedHeaders: Record<string, string> = {}
  for (const name of signedHeaderList) signedHeaders[name] = headers[name] as string

  const requestToVerify: HttpRequest = {
    method: request.method,
    protocol: 'http:',
    hostname: parsedHost.hostname,
    ...(parsedHost.port ? { port: Number(parsedHost.port) } : {}),
    path: rawPath,
    query,
    headers: signedHeaders,
  }
  const signer = new SignatureV4({
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    region: parsed.region,
    service: 's3',
    sha256: WebCryptoSha256,
    uriEscapePath: false,
    applyChecksum: false,
  })
  try {
    const expected = await signer.sign(requestToVerify, { signingDate: date })
    const expectedAuthorization = expected.headers.authorization
    const expectedParsed = expectedAuthorization ? parseAuthorization(expectedAuthorization) : null
    if (!expectedParsed || expectedParsed.signedHeaders !== parsed.signedHeaders) return 'invalid'
    return signaturesMatch(parsed.signature, expectedParsed.signature) ? null : 'invalid'
  } catch {
    return 'invalid'
  }
}

function parseAuthorization(value: string): { accessKeyId: string; credentialDate: string; region: string; signedHeaders: string; signature: string } | null {
  const match = /^AWS4-HMAC-SHA256 Credential=([^/ ,]+)\/(\d{8})\/([^/ ,]+)\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([a-f0-9]{64})$/.exec(value)
  if (!match) return null
  const [, accessKeyId, credentialDate, region, signedHeaders, signature] = match
  if (!accessKeyId || !credentialDate || !region || !signedHeaders || !signature) return null
  if (signedHeaders.split(';').some((header, index, headers) => !header || (index > 0 && header <= (headers[index - 1] ?? '')))) return null
  return { accessKeyId, credentialDate, region, signedHeaders, signature }
}

function parseAmzDate(value: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second] = match
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') === value ? date : null
}

/**
 * Reject absolute-path traversal in the raw request target, including percent-encoded
 * dot segments, before any handler touches the filesystem.
 */
export function isSafeRawPath(path: string): boolean {
  if (!path.startsWith('/') || path.includes('\\') || path.includes('//')) return false
  try {
    return path.split('/').slice(1).every((segment) => {
      const decoded = decodeURIComponent(segment)
      // Encoded separators (%2F) and dot segments are rejected outright: a request target
      // must map to one literal path segment per slash, so traversal can never reach the store.
      return decoded !== '.' && decoded !== '..' && !decoded.includes('/') && !decoded.includes('\\') && !/\p{Cc}/u.test(decoded)
    })
  } catch {
    return false
  }
}

function oneHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Length-checked, order-independent comparison of two hex signatures. */
function signaturesMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided, 'hex')
  const right = Buffer.from(expected, 'hex')
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0)
  return mismatch === 0
}

function toBytes(value: HashInput): Uint8Array {
  if (typeof value === 'string') return new TextEncoder().encode(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(new Uint8Array(value))
  return new Uint8Array(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
}

/** Web Crypto wants a standalone ArrayBuffer, not a view over a pooled or shared one. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function joinBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((size, chunk) => size + chunk.byteLength, 0)
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined
}
