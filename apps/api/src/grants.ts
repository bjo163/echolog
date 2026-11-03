const GRANT_TTL_SECONDS = 300

export interface DownloadGrant {
  token: string
  expiresAt: number
}

export async function createDownloadGrant(
  secret: string,
  objectKey: string,
  now = Date.now(),
): Promise<DownloadGrant> {
  const expiresAt = Math.floor(now / 1000) + GRANT_TTL_SECONDS
  const payload = encodeBase64Url(`${objectKey}\n${now}\n${expiresAt}`)
  const signature = await sign(secret, payload)
  return { token: `${payload}.${signature}`, expiresAt }
}

export async function verifyDownloadGrant(
  secret: string,
  token: string,
  expectedObjectKey: string,
  now = Date.now(),
): Promise<boolean> {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return false
  const expectedSignature = await sign(secret, payload)
  if (!constantTimeEqual(signature, expectedSignature)) return false

  let decoded: string
  try {
    decoded = decodeBase64Url(payload)
  } catch {
    return false
  }
  const parts = decoded.split('\n')
  if (parts[0] !== expectedObjectKey || (parts.length !== 2 && parts.length !== 3)) return false
  const issuedAt = parts.length === 3 ? Number(parts[1]) : null
  const expiry = Number(parts[parts.length - 1])
  const nowSeconds = Math.floor(now / 1000)
  return Number.isSafeInteger(expiry) && expiry > nowSeconds && expiry <= nowSeconds + GRANT_TTL_SECONDS
    && (issuedAt === null || Number.isSafeInteger(issuedAt) && issuedAt <= now && expiry <= Math.floor(issuedAt / 1000) + GRANT_TTL_SECONDS)
}

async function sign(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return Buffer.from(signature).toString('base64url')
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  if (leftBytes.length !== rightBytes.length) return false
  let mismatch = 0
  for (let index = 0; index < leftBytes.length; index += 1) mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  return mismatch === 0
}
