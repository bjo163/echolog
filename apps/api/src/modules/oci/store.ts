import { lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * Tag index for the OCI registry.
 *
 * Blobs and manifests are content-addressed objects in the normal storage
 * driver; this store owns only the mutable tag -> digest mapping. Repository
 * names may be nested (`library/alpine`), so every path segment is validated
 * against the distribution-spec grammar before it can become a directory.
 */

export interface OciTagRecord {
  repository: string
  tag: string
  digest: string
  updated_at: string
}

const REPOSITORY_PATTERN = /^[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*)*$/
const TAG_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/
const DIGEST_PATTERN = /^[a-f0-9]{64}$/

export function isValidRepository(repository: string): boolean {
  return repository.length > 0 && repository.length <= 255 && REPOSITORY_PATTERN.test(repository)
}

export function isValidTag(tag: string): boolean {
  return TAG_PATTERN.test(tag)
}

export class FsOciStore {
  private readonly root: string

  constructor(storageRoot: string) {
    this.root = resolve(storageRoot, 'oci-tags')
  }

  async ready(): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await this.assertDirectory(this.root)
  }

  private repositoryPath(repository: string): string {
    if (!isValidRepository(repository)) throw new TypeError('Invalid OCI repository name')
    return join(this.root, ...repository.split('/'))
  }

  private tagPath(repository: string, tag: string): string {
    if (!isValidTag(tag)) throw new TypeError('Invalid OCI tag')
    return join(this.repositoryPath(repository), `${encodeURIComponent(tag)}.json`)
  }

  /** Replace the tag atomically: a reader never sees half a record. */
  async putTag(repository: string, tag: string, digest: string, now = new Date()): Promise<OciTagRecord> {
    if (!DIGEST_PATTERN.test(digest)) throw new TypeError('Invalid OCI digest')
    const directory = this.repositoryPath(repository)
    await mkdir(directory, { recursive: true })
    await this.assertDirectory(directory)
    const record: OciTagRecord = {
      repository,
      tag,
      digest,
      updated_at: now.toISOString(),
    }
    const path = this.tagPath(repository, tag)
    const temporaryPath = `${path}.${randomUUID()}.tmp`
    const handle = await open(temporaryPath, 'wx')
    try {
      await handle.writeFile(JSON.stringify(record), 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, path)
    return record
  }

  async getTag(repository: string, tag: string): Promise<OciTagRecord | null> {
    if (!isValidRepository(repository) || !isValidTag(tag)) return null
    const path = this.tagPath(repository, tag)
    try {
      await this.assertRegularFile(path)
      return parseRecord(JSON.parse(await readFile(path, 'utf8')), repository, tag)
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  async deleteTag(repository: string, tag: string): Promise<boolean> {
    if (!isValidRepository(repository) || !isValidTag(tag)) return false
    try {
      await rm(this.tagPath(repository, tag))
      return true
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  async listTags(repository: string): Promise<string[]> {
    if (!isValidRepository(repository)) return []
    const directory = this.repositoryPath(repository)
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
    const tags: string[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const tag = decodeURIComponent(entry.name.slice(0, -5))
      if (!isValidTag(tag)) continue
      tags.push(tag)
    }
    return tags.sort()
  }

  /** Walk the nested layout so `library/alpine` is reported, not `library`. */
  async listRepositories(): Promise<string[]> {
    await this.ready()
    const repositories: string[] = []
    const walk = async (directory: string, prefix: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
          await walk(path, prefix ? `${prefix}/${entry.name}` : entry.name)
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          const repository = prefix
          if (repository && isValidRepository(repository) && !repositories.includes(repository)) {
            repositories.push(repository)
          }
        }
      }
    }
    await walk(this.root, '')
    return repositories.sort()
  }

  private async assertDirectory(path: string): Promise<void> {
    const entry = await lstat(path)
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('Unsafe OCI tag directory')
  }

  private async assertRegularFile(path: string): Promise<void> {
    const entry = await lstat(path)
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('Unsafe OCI tag file')
  }
}

function parseRecord(value: unknown, repository: string, tag: string): OciTagRecord {
  if (!value || typeof value !== 'object') throw new Error('OCI tag index entry is invalid')
  const record = value as Partial<OciTagRecord>
  if (
    record.repository !== repository || record.tag !== tag
    || typeof record.digest !== 'string' || !DIGEST_PATTERN.test(record.digest)
    || typeof record.updated_at !== 'string' || !Number.isFinite(Date.parse(record.updated_at))
  ) {
    throw new Error('OCI tag index entry is invalid')
  }
  return record as OciTagRecord
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}
