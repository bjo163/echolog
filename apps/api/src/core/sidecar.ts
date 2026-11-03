import type { ObjectSidecar } from './index.js'

const scanStatuses = new Set(['pending', 'clean', 'infected', 'skipped'])

export function parseObjectSidecar(value: unknown): ObjectSidecar {
  if (!value || typeof value !== 'object') throw new Error('Invalid object sidecar')
  const sidecar = value as Partial<ObjectSidecar>
  if (
    typeof sidecar.object_key !== 'string' || !/^sha256\/[a-f0-9]{64}$/.test(sidecar.object_key)
    || typeof sidecar.digest !== 'string' || sidecar.object_key !== `sha256/${sidecar.digest}`
    || !Number.isSafeInteger(sidecar.size) || (sidecar.size as number) < 0
    || typeof sidecar.content_type !== 'string' || typeof sidecar.filename !== 'string'
    || typeof sidecar.uploader !== 'string' || typeof sidecar.created_at !== 'string'
    || !(sidecar.retention_until === null || typeof sidecar.retention_until === 'string')
    || typeof sidecar.legal_hold !== 'boolean' || typeof sidecar.scan !== 'string'
    || !scanStatuses.has(sidecar.scan) || !Array.isArray(sidecar.tags)
    || !sidecar.tags.every((tag) => typeof tag === 'string')
  ) throw new Error('Invalid object sidecar')
  if (
    !Number.isFinite(Date.parse(sidecar.created_at as string))
    || (sidecar.retention_until !== null && !Number.isFinite(Date.parse(sidecar.retention_until as string)))
  ) throw new Error('Invalid object sidecar dates')
  return sidecar as ObjectSidecar
}
