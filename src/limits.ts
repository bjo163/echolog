export class HttpProblem extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message)
    this.name = 'HttpProblem'
  }
}

export async function* enforceSizeLimit(
  source: AsyncIterable<Uint8Array>,
  maxBytes: number,
): AsyncGenerator<Uint8Array> {
  let total = 0
  for await (const chunk of source) {
    if (!(chunk instanceof Uint8Array)) throw new HttpProblem(400, 'invalid_body', 'Upload body must be a byte stream.')
    total += chunk.byteLength
    if (!Number.isSafeInteger(total) || total > maxBytes) {
      throw new HttpProblem(413, 'too_large', 'Upload exceeds the configured size limit.')
    }
    yield chunk
  }
}

export function normalizedMimeType(value: string | undefined): string | null {
  if (!value) return null
  const mimeType = value.split(';', 1)[0]?.trim().toLowerCase()
  return mimeType && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType) ? mimeType : null
}

export function safeStoredFilename(value: string | undefined): string {
  const raw = value?.replace(/[\\/]/g, '/').split('/').at(-1) ?? ''
  const cleaned = Array.from(raw, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? '_' : character
  }).join('').trim().replace(/^\.+$/, '')
  return cleaned.slice(0, 255) || 'download'
}

export function contentDisposition(filename: string): string {
  const safe = safeStoredFilename(filename)
  const fallback = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\;]/g, '_')
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

export function parseRetention(value: string | undefined): string | null {
  if (value === undefined || value === '') return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new HttpProblem(400, 'invalid_retention', 'Retention must be a valid date.')
  return new Date(timestamp).toISOString()
}

export function headerFlag(value: string | undefined, name: string): boolean {
  if (value === undefined) return false
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false
  throw new HttpProblem(400, 'invalid_header', `${name} must be true or false.`)
}
