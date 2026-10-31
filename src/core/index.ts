import { createHash } from 'node:crypto'

export type ScanStatus = 'pending' | 'clean' | 'infected' | 'skipped'

/** Reference consumers may retain; object bytes remain in the storage owner. */
export interface ObjectReference {
  object_key: string
  digest: string
  size: number
  content_type: string
}

/** Sidecar fields travel with an object and do not imply a SQL record. */
export interface ObjectSidecar extends ObjectReference {
  filename: string
  uploader: string
  created_at: string
  retention_until: string | null
  legal_hold: boolean
  scan: ScanStatus
  tags: string[]
}

/** Contract only: M39-06 intentionally supplies no active storage driver. */
export interface StorageDriver {
  put(objectKey: string, bytes: Uint8Array, sidecar: ObjectSidecar): Promise<void>
  get(objectKey: string): Promise<{ bytes: Uint8Array; sidecar: ObjectSidecar } | null>
  delete(objectKey: string): Promise<void>
}

export { FsStorageDriver, ObjectHeldError, QuotaExceededError } from './driver/fs.js'
export type { FsStorageDriverOptions, GcResult } from './driver/fs.js'
export interface ObjectMetadataInput {
  filename: string
  content_type: string
  uploader: string
  retention_until?: string | null
  legal_hold?: boolean
  scan?: ScanStatus
  tags?: string[]
}

/** SHA-256 digest helper using the standard Web Crypto API, without Node imports. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength)
  input.set(bytes)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input.buffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Synchronous SHA-256 for the storage side, where a digest is computed while a key or an
 * index entry is written. Node built-ins stay inside this package: apps keep to Web Crypto.
 */
export function sha256HexSync(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * S3 ETag for a single-request upload is the MD5 hex of the payload. This is a protocol
 * identifier required by the S3 subset ECHOLOG serves; it is never a security digest and
 * must not replace the content-addressed SHA-256 key.
 */
export function md5Hex(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('hex')
}
