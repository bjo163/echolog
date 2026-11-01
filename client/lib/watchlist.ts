import type { ObjectRef, ObjectSidecar } from '../types.js'

/**
 * The operator watchlist persists pure consumer references only — exactly the
 * four fields every ECHOLOG consumer is allowed to store
 * (`object_key, digest, size, content_type`). Names, uploaders, tokens and
 * any other sidecar field are projected away before anything is written.
 */

export const WATCHLIST_STORAGE_KEY = 'echolog.operator.watchlist.v1'

const digestPattern = /^[a-f0-9]{64}$/

export function refFromSidecar(sidecar: ObjectSidecar): ObjectRef {
  return {
    object_key: sidecar.object_key,
    digest: sidecar.digest,
    size: sidecar.size,
    content_type: sidecar.content_type,
  }
}

export function parseObjectRef(value: unknown): ObjectRef | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  const digest = candidate.digest
  const objectKey = candidate.object_key
  const size = candidate.size
  const contentType = candidate.content_type
  if (typeof digest !== 'string' || !digestPattern.test(digest)) return null
  if (typeof objectKey !== 'string' || objectKey !== `sha256/${digest}`) return null
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) return null
  if (typeof contentType !== 'string' || contentType.length === 0) return null
  return { object_key: objectKey, digest, size, content_type: contentType }
}

export function parseWatchlist(raw: string | null): ObjectRef[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const refs: ObjectRef[] = []
    const seen = new Set<string>()
    for (const item of parsed) {
      const ref = parseObjectRef(item)
      if (!ref || seen.has(ref.object_key)) continue
      seen.add(ref.object_key)
      refs.push(ref)
    }
    return refs
  } catch {
    return []
  }
}

/** Serialize writes only the four reference fields — never a full sidecar. */
export function serializeWatchlist(refs: readonly ObjectRef[]): string {
  const projected = refs
    .map((ref) => parseObjectRef(ref))
    .filter((ref): ref is ObjectRef => ref !== null)
    .map((ref) => ({
      object_key: ref.object_key,
      digest: ref.digest,
      size: ref.size,
      content_type: ref.content_type,
    }))
  return JSON.stringify(projected)
}

export function upsertRef(refs: readonly ObjectRef[], ref: ObjectRef): ObjectRef[] {
  const rest = refs.filter((item) => item.object_key !== ref.object_key)
  return [...rest, ref].sort((left, right) => left.object_key.localeCompare(right.object_key, 'en'))
}

export function removeRef(refs: readonly ObjectRef[], objectKey: string): ObjectRef[] {
  return refs.filter((item) => item.object_key !== objectKey)
}

/** True when a string is a bare SHA-256 digest the operator may track. */
export function isDigest(value: string): boolean {
  return digestPattern.test(value.trim())
}
