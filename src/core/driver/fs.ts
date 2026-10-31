import { createHash, randomUUID } from 'node:crypto'
import { link, lstat, mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ObjectMetadataInput, ObjectSidecar, StorageDriver } from '../index.js'
import { parseObjectSidecar } from '../sidecar.js'

export class ObjectHeldError extends Error {
  readonly reason: 'legal_hold' | 'retention_active'

  constructor(reason: 'legal_hold' | 'retention_active') {
    super(reason === 'legal_hold' ? 'Object is under legal hold' : 'Object retention period has not elapsed')
    this.name = 'ObjectHeldError'
    this.reason = reason
  }
}

export class QuotaExceededError extends Error {
  constructor() {
    super('ECHOLOG storage quota exceeded')
    this.name = 'QuotaExceededError'
  }
}

export interface FsStorageDriverOptions {
  root: string
  quotaBytes: number
  now?: () => Date
}

export interface GcResult {
  deleted: string[]
  held: Array<{ object_key: string; reason: 'legal_hold' | 'retention_active' }>
  bytes_freed: number
}

/** Local immutable object store. Atomic rename is guaranteed only within one filesystem. */
export class FsStorageDriver implements StorageDriver {
  private readonly root: string
  private readonly quotaBytes: number
  private readonly now: () => Date
  private operation = Promise.resolve()

  constructor(options: FsStorageDriverOptions) {
    if (!Number.isSafeInteger(options.quotaBytes) || options.quotaBytes < 0) {
      throw new TypeError('quotaBytes must be a non-negative safe integer')
    }
    this.root = resolve(options.root)
    this.quotaBytes = options.quotaBytes
    this.now = options.now ?? (() => new Date())
  }

  async ready(): Promise<void> {
    await this.ensureDirectories()
    const probePath = join(this.root, 'tmp', `.ready-${randomUUID()}`)
    const handle = await open(probePath, 'wx')
    try {
      await handle.writeFile(new Uint8Array())
      await handle.sync()
    } finally {
      try {
        await handle.close()
      } finally {
        await rm(probePath, { force: true })
      }
    }
  }

  async put(objectKey: string, bytes: Uint8Array, sidecar: ObjectSidecar): Promise<void> {
    this.validateKey(objectKey)
    const copy = new Uint8Array(bytes)
    const digest = createHash('sha256').update(copy).digest('hex')
    if (objectKey !== `sha256/${digest}` || sidecar.digest !== digest || sidecar.object_key !== objectKey || sidecar.size !== copy.byteLength) {
      throw new Error('Object key and sidecar must match the uploaded bytes')
    }
    const stored = await this.putStream((async function* () { yield copy })(), sidecar)
    if (stored.object_key !== objectKey) throw new Error('Object key and sidecar must match the uploaded bytes')
  }

  async putStream(
    chunks: AsyncIterable<Uint8Array>,
    metadata: ObjectMetadataInput,
    beforePublish?: (sidecar: ObjectSidecar, existing: boolean) => Promise<void>,
  ): Promise<ObjectSidecar> {
    await this.ensureDirectories()
    const tempPath = join(this.root, 'tmp', randomUUID())
    const handle = await open(tempPath, 'wx')
    const hash = createHash('sha256')
    let size = 0
    let closed = false
    try {
      for await (const chunk of chunks) {
        if (!(chunk instanceof Uint8Array)) throw new TypeError('Object stream chunks must be Uint8Array values')
        const copy = new Uint8Array(chunk)
        size += copy.byteLength
        if (!Number.isSafeInteger(size)) throw new RangeError('Object is too large')
        hash.update(copy)
        await handle.writeFile(copy)
      }
      await handle.sync()
      await handle.close()
      closed = true
      const digest = hash.digest('hex')
      const objectKey = `sha256/${digest}`
      const sidecar = this.createSidecar(objectKey, digest, size, metadata)

      return await this.serialized(async () => {
        const objectPath = this.objectPath(objectKey)
        const sidecarPath = this.sidecarPath(objectKey)
        const existing = await this.readObject(objectKey)
        if (existing) {
          if (existing.bytes.byteLength !== size || createHash('sha256').update(existing.bytes).digest('hex') !== digest) {
            throw new Error('Content-addressed object is corrupt')
          }
          await beforePublish?.(existing.sidecar, true)
          await rm(tempPath, { force: true })
          return existing.sidecar
        }
        const used = await this.committedBytes()
        let objectAlreadyExists = false
        try {
          const existingBytes = await readFile(objectPath)
          objectAlreadyExists = true
          if (existingBytes.byteLength !== size || createHash('sha256').update(existingBytes).digest('hex') !== digest) {
            throw new Error('Content-addressed object is corrupt')
          }
        } catch (error) {
          if (!isMissing(error)) throw error
        }
        if (!objectAlreadyExists && used + size > this.quotaBytes) throw new QuotaExceededError()

        // A policy callback can durably reserve/restrict the digest before
        // bytes and metadata become visible to readers.
        await beforePublish?.(sidecar, objectAlreadyExists)

        // Both temporary files are siblings of their destinations, so rename stays on-volume.
        if (!objectAlreadyExists) await rename(tempPath, objectPath)
        else await rm(tempPath, { force: true })
        const sidecarTemp = `${sidecarPath}.${randomUUID()}.tmp`
        try {
          await this.writeDurable(sidecarTemp, JSON.stringify(sidecar))
          // link is an atomic create-if-absent; a racing duplicate cannot replace first metadata.
          try {
            await link(sidecarTemp, sidecarPath)
          } catch (error) {
            if (!isAlreadyExists(error)) throw error
          }
        } catch (error) {
          await rm(sidecarTemp, { force: true })
          // An object without a sidecar is invisible to get(); a retry can safely finish it.
          throw error
        }
        await rm(sidecarTemp, { force: true })
        return (await this.get(objectKey))?.sidecar ?? sidecar
      })
    } catch (error) {
      if (!closed) await handle.close().catch(() => undefined)
      await rm(tempPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  async get(objectKey: string): Promise<{ bytes: Uint8Array; sidecar: ObjectSidecar } | null> {
    this.validateKey(objectKey)
    try {
      await this.ensureDirectories()
      await this.assertRegularFile(this.objectPath(objectKey))
      await this.assertRegularFile(this.sidecarPath(objectKey))
      const [bytes, json] = await Promise.all([
        readFile(this.objectPath(objectKey)),
        readFile(this.sidecarPath(objectKey), 'utf8'),
      ])
      const sidecar = parseObjectSidecar(JSON.parse(json))
      if (
        sidecar.object_key !== objectKey || sidecar.size !== bytes.byteLength
        || createHash('sha256').update(bytes).digest('hex') !== sidecar.digest
      ) return null
      return { bytes: new Uint8Array(bytes), sidecar }
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  async delete(objectKey: string): Promise<void> {
    this.validateKey(objectKey)
    await this.serialized(async () => {
      const object = await this.get(objectKey)
      if (!object) return
      const reason = this.holdReason(object.sidecar, this.now())
      if (reason) throw new ObjectHeldError(reason)
      await rm(this.objectPath(objectKey), { force: true })
      await rm(this.sidecarPath(objectKey), { force: true })
    })
  }

  async gc(at = this.now(), referencedObjectKeys: ReadonlySet<string> = new Set()): Promise<GcResult> {
    return this.serialized(async () => {
      await this.ensureDirectories()
      const result: GcResult = { deleted: [], held: [], bytes_freed: 0 }
      for (const entry of await readdir(join(this.root, 'objects'), { withFileTypes: true })) {
        if (!entry.isFile() || !/^[a-f0-9]{64}$/.test(entry.name)) continue
        const objectKey = `sha256/${entry.name}`
        if (referencedObjectKeys.has(objectKey)) continue
        const object = await this.get(objectKey)
        if (!object) {
          try {
            await readFile(this.sidecarPath(objectKey))
          } catch (error) {
            if (!isMissing(error)) throw error
            const orphan = await stat(this.objectPath(objectKey))
            result.bytes_freed += orphan.size
            await rm(this.objectPath(objectKey), { force: true })
            result.deleted.push(objectKey)
          }
          continue
        }
        const expired = object.sidecar.retention_until !== null && Date.parse(object.sidecar.retention_until) > at.getTime()
        const reason = object.sidecar.legal_hold ? 'legal_hold' : expired ? 'retention_active' : null
        if (reason) {
          result.held.push({ object_key: objectKey, reason })
          continue
        }
        result.bytes_freed += object.sidecar.size
        await rm(this.objectPath(objectKey), { force: true })
        await rm(this.sidecarPath(objectKey), { force: true })
        result.deleted.push(objectKey)
      }
      return result
    })
  }

  private createSidecar(objectKey: string, digest: string, size: number, metadata: ObjectMetadataInput): ObjectSidecar {
    if (!metadata.filename || !metadata.content_type || !metadata.uploader) throw new TypeError('filename, content_type and uploader are required')
    const retention = metadata.retention_until ?? null
    if (retention !== null && !Number.isFinite(Date.parse(retention))) throw new TypeError('retention_until must be an ISO date')
    return {
      object_key: objectKey,
      digest,
      size,
      content_type: metadata.content_type,
      filename: metadata.filename,
      uploader: metadata.uploader,
      created_at: this.now().toISOString(),
      retention_until: retention,
      legal_hold: metadata.legal_hold ?? false,
      scan: metadata.scan ?? 'skipped',
      tags: [...(metadata.tags ?? [])],
    }
  }

  private holdReason(sidecar: ObjectSidecar, at: Date): ObjectHeldError['reason'] | null {
    if (sidecar.legal_hold) return 'legal_hold'
    if (sidecar.retention_until !== null && Date.parse(sidecar.retention_until) > at.getTime()) return 'retention_active'
    return null
  }

  private async committedBytes(): Promise<number> {
    let total = 0
    for (const entry of await readdir(join(this.root, 'objects'), { withFileTypes: true })) {
      if (!entry.isFile() || !/^[a-f0-9]{64}$/.test(entry.name)) continue
      total += (await stat(join(this.root, 'objects', entry.name))).size
    }
    return total
  }

  private async readObject(objectKey: string) {
    return this.get(objectKey)
  }

  private async writeDurable(path: string, contents: string): Promise<void> {
    const handle = await open(path, 'wx')
    try {
      await handle.writeFile(contents, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
  }

  private async ensureDirectories(): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await this.assertDirectory(this.root)
    for (const name of ['objects', 'metadata', 'tmp']) {
      await this.ensureDirectory(join(this.root, name))
    }
  }

  private async ensureDirectory(path: string): Promise<void> {
    try {
      await this.assertDirectory(path)
      return
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    try {
      await mkdir(path)
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
    }
    await this.assertDirectory(path)
  }

  private async assertDirectory(path: string): Promise<void> {
    const entry = await lstat(path)
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('Unsafe storage directory')
  }

  private async assertRegularFile(path: string): Promise<void> {
    const entry = await lstat(path)
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('Unsafe storage file')
  }

  private objectPath(objectKey: string): string {
    return join(this.root, 'objects', objectKey.slice('sha256/'.length))
  }

  private sidecarPath(objectKey: string): string {
    return join(this.root, 'metadata', `${objectKey.slice('sha256/'.length)}.json`)
  }

  private validateKey(objectKey: string): void {
    if (!/^sha256\/[a-f0-9]{64}$/.test(objectKey)) throw new TypeError('Object key must be sha256/<64 lowercase hex>')
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

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}

function isAlreadyExists(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
}
