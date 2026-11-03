import type { FastifyRequest } from 'fastify'
import type { EchologConfig } from './config.js'
import type { EchologPrincipal } from './auth.js'
import { isAdmin } from './auth.js'
import { HttpProblem } from './limits.js'
import type { FsS3KeyStore } from './modules/s3/store.js'

/**
 * One place that answers "may this principal read this digest?".
 *
 * A digest carrying the private-witness marker is admin-only for local
 * credentials, and for a Hub subject the Hub alone decides. Every surface
 * (REST, OCI, tools, listings) must ask this policy instead of calling the
 * storage driver directly.
 */
export interface DigestAccessPolicy {
  isPrivateWitness(digest: string): Promise<boolean>
  canRead(request: FastifyRequest, digest: string, principal: EchologPrincipal): Promise<boolean>
  /** Digests hidden from a given principal; admins get an empty set. */
  hiddenDigests(principal: EchologPrincipal): Promise<Set<string>>
}

export function createDigestAccessPolicy(
  s3Keys: FsS3KeyStore,
  config: EchologConfig,
  fetcher: typeof fetch = fetch,
): DigestAccessPolicy {
  const isPrivateWitness = (digest: string): Promise<boolean> => s3Keys.isPrivateWitness(digest)

  return {
    isPrivateWitness,
    async canRead(request, digest, principal) {
      if (!await isPrivateWitness(digest)) return true
      if (config.arsyUrl && principal.kind === 'arsy') {
        return authorizePrivateWitness(request, config, digest, fetcher)
      }
      return isAdmin(principal)
    },
    async hiddenDigests(principal) {
      if (isAdmin(principal)) return new Set()
      return s3Keys.privateWitnessDigests()
    },
  }
}

/**
 * Ask the Hub whether this bearer may read a private-witness digest. Only a
 * clean 204 authorizes; a network failure is 503 rather than an implicit yes.
 */
async function authorizePrivateWitness(
  request: FastifyRequest,
  config: EchologConfig,
  digest: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const authorization = request.headers.authorization
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false
  let response: Response
  try {
    response = await fetcher(new URL('/api/v1/witness/private-media-authorize', config.arsyUrl), {
      method: 'POST',
      headers: { authorization, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ digest }),
      redirect: 'error',
      signal: AbortSignal.timeout(3_000),
    })
  } catch {
    throw new HttpProblem(503, 'auth_unavailable', 'ARSY authorization is temporarily unavailable.')
  }
  if (response.status === 204) return true
  if (response.status === 401 || response.status === 403 || response.status === 404) return false
  if (!response.ok) throw new HttpProblem(503, 'auth_unavailable', 'ARSY authorization is temporarily unavailable.')
  return false
}
