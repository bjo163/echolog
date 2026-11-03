import { link, lstat, mkdir, open, readFile, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { md5Hex, sha256HexSync, type FsStorageDriver, type ObjectSidecar } from '../../core/index.js'

export interface S3KeyRecord {
  key: string
  object_key: string
  digest: string
  size: number
  content_type: string
  etag: string
  last_modified: string
  retention_until: string | null
  legal_hold: boolean
}

export interface PrivateWitnessMarker {
  digest: string
  marked_at: string
}

export class S3KeyConflictError extends Error {
  constructor() {
    super('An immutable object already exists at this key.')
    this.name = 'S3KeyConflictError'
  }
}

export class S3ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found.')
    this.name = 'S3ObjectNotFoundError'
  }
}

/** Filesystem namespace mapping S3 keys to ECHOLOG's immutable digest objects. */
export class FsS3KeyStore {
  private readonly root: string
  private readonly privateWitnessRoot: string
  private readonly driver: FsStorageDriver
  private readonly now: () => number
  private operation = Promise.resolve()

  constructor(options: { root: string; driver: FsStorageDriver; now?: () => number }) {
    this.root = resolve(options.root, 's3-keys')
    this.privateWitnessRoot = resolve(options.root, 'private-witness')
    this.driver = options.driver
    this.now = options.now ?? Date.now
  }

  async ready(): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await this.assertDirectory(this.root)
    await mkdir(this.privateWitnessRoot, { recursive: true })
    await this.assertDirectory(this.privateWitnessRoot)
  }

  /** Irreversibly restrict a content-addressed object to D06 authorization. */
  async markPrivateWitness(digest: string): Promise<void> {
    validateDigest(digest)
    await this.ready()
    const path = this.privateWitnessPath(digest)
    const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`
    const handle = await open(temporaryPath, 'wx')
    try {
      await handle.writeFile(JSON.stringify({ digest, marked_at: new Date(this.now()).toISOString() }), 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await link(temporaryPath, path)
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
      if (!await this.privateWitnessMarker(digest)) throw new Error('Private witness marker is corrupt')
    } finally {
      await rm(temporaryPath, { force: true })
    }
  }

  async isPrivateWitness(digest: string): Promise<boolean> {
    return (await this.privateWitnessMarker(digest)) !== null
  }

  /** All marked digests, read in one directory pass for listing filters. */
  async privateWitnessDigests(): Promise<Set<string>> {
    await this.ready()
    const digests = new Set<string>()
    for (const entry of await readdir(this.privateWitnessRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) continue
      const path = join(this.privateWitnessRoot, entry.name)
      await this.assertRegularFile(path)
      const marker = JSON.parse(await readFile(path, 'utf8')) as { digest?: unknown; marked_at?: unknown }
      if (typeof marker.digest !== 'string' || !/^[a-f0-9]{64}$/.test(marker.digest)
        || `${marker.digest}.json` !== entry.name || typeof marker.marked_at !== 'string'
        || !Number.isFinite(Date.parse(marker.marked_at))) throw new Error('Private witness marker is corrupt')
      digests.add(marker.digest)
    }
    return digests
  }

  async privateWitnessMarker(digest: string): Promise<PrivateWitnessMarker | null> {
    validateDigest(digest)
    const path = this.privateWitnessPath(digest)
    try {
      await this.assertRegularFile(path)
      const value = JSON.parse(await readFile(path, 'utf8')) as { digest?: unknown; marked_at?: unknown }
      if (value.digest !== digest || typeof value.marked_at !== 'string' || !Number.isFinite(Date.parse(value.marked_at))) {
        throw new Error('Private witness marker is corrupt')
      }
      return { digest, marked_at: value.marked_at }
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
    metadata: { retentionUntil?: string | null; legalHold?: boolean; privateWitness?: boolean } = {},
  ): Promise<S3KeyRecord> {
    validateObjectKey(key)
    if (!contentType) throw new TypeError('contentType is required')
    const copy = new Uint8Array(bytes)
    const digest = sha256HexSync(copy)
    const objectKey = `sha256/${digest}`

    return this.serialized(async () => {
      const existing = await this.readRecord(key)
      if (existing) {
        if (existing.digest !== digest || existing.size !== copy.byteLength) throw new S3KeyConflictError()
        const stored = await this.driver.get(existing.object_key)
        if (!stored || stored.sidecar.digest !== digest) throw new Error('Indexed object is missing or corrupt')
        if (metadata.privateWitness) await this.markPrivateWitness(digest)
        return existing
      }

      const sidecar = await this.driver.putStream((async function* () { yield copy })(), {
        filename: basenameForKey(key),
        content_type: contentType,
        uploader: 's3-compatible-client',
        retention_until: metadata.retentionUntil ?? null,
        legal_hold: metadata.legalHold ?? false,
        scan: 'skipped',
      }, metadata.privateWitness ? async (object) => this.markPrivateWitness(object.digest) : undefined)
      const record: S3KeyRecord = {
        key,
        object_key: objectKey,
        digest,
        size: copy.byteLength,
        content_type: contentType,
        etag: md5Hex(copy),
        last_modified: sidecar.created_at,
        retention_until: metadata.retentionUntil ?? null,
        legal_hold: metadata.legalHold ?? false,
      }
      await this.writeRecord(record)
      return record
    })
  }

  async get(key: string): Promise<{ record: S3KeyRecord; bytes: Uint8Array; sidecar: ObjectSidecar } | null> {
    validateObjectKey(key)
    const record = await this.readRecord(key)
    if (!record) return null
    if (await this.isPrivateWitness(record.digest)) return null
    const object = await this.driver.get(record.object_key)
    if (!object || object.bytes.byteLength !== record.size || object.sidecar.digest !== record.digest) {
      throw new Error('Indexed object is missing or corrupt')
    }
    return { record, bytes: object.bytes, sidecar: object.sidecar }
  }

  async head(key: string): Promise<S3KeyRecord | null> {
    validateObjectKey(key)
    const record = await this.readRecord(key)
    return record && !await this.isPrivateWitness(record.digest) ? record : null
  }

  /** Resolve an exact namespace key only for the authenticated privacy-marker route. */
  async resolveForPrivateMarker(key: string): Promise<S3KeyRecord | null> {
    validateObjectKey(key)
    return this.readRecord(key)
  }

  async delete(key: string, at = new Date()): Promise<void> {
    validateObjectKey(key)
    await this.serialized(async () => {
      const record = await this.readRecord(key)
      if (!record) return
      if (await this.isPrivateWitness(record.digest)) throw new Error('Private witness object is protected')
      const object = await this.driver.get(record.object_key)
      if (record.legal_hold || object?.sidecar.legal_hold) throw new Error('Object is protected by legal hold')
      if (
        record.retention_until && Date.parse(record.retention_until) > at.getTime()
        || object?.sidecar.retention_until && Date.parse(object.sidecar.retention_until) > at.getTime()
      ) {
        throw new Error('Object retention period has not elapsed')
      }
      await this.assertRegularFile(this.recordPath(key))
      await rm(this.recordPath(key))
    })
  }

  async list(): Promise<S3KeyRecord[]> {
    await this.ready()
    const records: S3KeyRecord[] = []
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) continue
      const path = join(this.root, entry.name)
      await this.assertRegularFile(path)
      const record = parseRecord(JSON.parse(await readFile(path, 'utf8')))
      if (recordPathHash(record.key) !== entry.name.slice(0, -5)) throw new Error('S3 key index entry is corrupt')
      records.push(record)
    }
    return records.sort((left, right) => compareS3Keys(left.key, right.key))
  }

  async referencedObjectKeys(): Promise<Set<string>> {
    return new Set((await this.list()).map((record) => record.object_key))
  }

  async collect(at?: Date, extraReferences: Iterable<string> = []) {
    return this.serialized(async () => {
      const referenced = await this.referencedObjectKeys()
      for (const key of extraReferences) referenced.add(key)
      for (const entry of await readdir(this.privateWitnessRoot, { withFileTypes: true })) {
        if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name)) continue
        const path = join(this.privateWitnessRoot, entry.name)
        await this.assertRegularFile(path)
        const marker = JSON.parse(await readFile(path, 'utf8')) as { digest?: unknown; marked_at?: unknown }
        if (typeof marker.digest !== 'string' || !/^[a-f0-9]{64}$/.test(marker.digest)
          || `${marker.digest}.json` !== entry.name || typeof marker.marked_at !== 'string'
          || !Number.isFinite(Date.parse(marker.marked_at))) throw new Error('Private witness marker is corrupt')
        referenced.add(`sha256/${marker.digest}`)
      }
      return this.driver.gc(at, referenced)
    })
  }

  private async readRecord(key: string): Promise<S3KeyRecord | null> {
    const path = this.recordPath(key)
    try {
      await this.assertRegularFile(path)
      const record = parseRecord(JSON.parse(await readFile(path, 'utf8')))
      if (record.key !== key || recordPathHash(record.key) !== recordPathHash(key)) throw new Error('S3 key index entry is corrupt')
      return record
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  private async writeRecord(record: S3KeyRecord): Promise<void> {
    await this.ready()
    const path = this.recordPath(record.key)
    const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`
    const handle = await open(temporaryPath, 'wx')
    try {
      await handle.writeFile(JSON.stringify(record), 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await link(temporaryPath, path)
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
      const existing = await this.readRecord(record.key)
      if (!existing || existing.digest !== record.digest) throw new S3KeyConflictError()
    } finally {
      await rm(temporaryPath, { force: true })
    }
  }

  private recordPath(key: string): string {
    return join(this.root, `${recordPathHash(key)}.json`)
  }

  private privateWitnessPath(digest: string): string {
    return join(this.privateWitnessRoot, `${digest}.json`)
  }

  private async assertDirectory(path: string): Promise<void> {
    const entry = await lstat(path)
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('Unsafe S3 key index directory')
  }

  private async assertRegularFile(path: string): Promise<void> {
    const entry = await lstat(path)
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('Unsafe S3 key index file')
  }

  private async serialized<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.operation
    let release!: () => void
    this.operation = new Promise<void>((resolveOperation) => { release = resolveOperation })
    await previous
    try {
      return await work()
    } finally {
      release()
    }
  }
}

export function validateObjectKey(key: string): void {
  if (!key || Buffer.byteLength(key, 'utf8') > 1024 || /\p{Cc}/u.test(key) || key.includes('\\')) {
    throw new TypeError('Invalid S3 object key')
  }
  if (key.split('/').some((part) => part === '.' || part === '..')) throw new TypeError('Invalid S3 object key')
}

function validateDigest(digest: string): void {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new TypeError('Invalid object digest')
}

function basenameForKey(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1) || 'object'
}

/** S3 keys are ordered by their UTF-8 byte sequence, independent of host locale. */
export function compareS3Keys(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function recordPathHash(key: string): string {
  return sha256HexSync(new TextEncoder().encode(key))
}

function parseRecord(value: unknown): S3KeyRecord {
  if (!value || typeof value !== 'object') throw new Error('S3 key index entry is invalid')
  const record = value as Partial<S3KeyRecord>
  if (
    typeof record.key !== 'string' || typeof record.object_key !== 'string'
    || typeof record.digest !== 'string' || !/^[a-f0-9]{64}$/.test(record.digest)
    || record.object_key !== `sha256/${record.digest}`
    || !Number.isSafeInteger(record.size) || typeof record.content_type !== 'string'
    || typeof record.etag !== 'string' || typeof record.last_modified !== 'string'
    || !(record.retention_until === null || typeof record.retention_until === 'string')
    || typeof record.legal_hold !== 'boolean'
  ) throw new Error('S3 key index entry is invalid')
  validateObjectKey(record.key)
  return record as S3KeyRecord
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}

function isAlreadyExists(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
}
