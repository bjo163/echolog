import { createReadStream } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { FsStorageDriver } from '../../core/index.js'
import { eventBus } from '../realtime/event-bus.js'

export interface ScrubberStats {
  objectsScanned: number
  corruptionsFound: number
  autoHealed: number
  lastScrubTime: string | null
}

export class AutonomousBitScrubber {
  private driver: FsStorageDriver
  private storageRoot: string
  private stats: ScrubberStats = {
    objectsScanned: 0,
    corruptionsFound: 0,
    autoHealed: 0,
    lastScrubTime: null,
  }

  constructor(driver: FsStorageDriver, storageRoot: string) {
    this.driver = driver
    this.storageRoot = storageRoot
  }

  public getStats(): ScrubberStats {
    return { ...this.stats }
  }

  /**
   * Run a thorough scrubbing cycle over physical storage files.
   * Compares the actual SHA-256 byte stream against the CAS digest address.
   */
  public async runScrub(): Promise<ScrubberStats> {
    const objectsDir = join(this.storageRoot, 'objects')
    let scanned = 0
    let corruptions = 0
    let healed = 0

    try {
      const prefixes = await readdir(objectsDir)
      for (const prefix of prefixes) {
        const prefixDir = join(objectsDir, prefix)
        const entries = await readdir(prefixDir)

        for (const entry of entries) {
          if (!entry.endsWith('.bin')) continue

          const fullDigest = `${prefix}${entry.replace('.bin', '')}`
          const binPath = join(prefixDir, entry)
          const sidecarPath = join(prefixDir, `${entry.replace('.bin', '')}.meta.json`)

          scanned++
          const actualSha256 = await this.computeFileSha256(binPath)

          if (actualSha256 !== fullDigest) {
            corruptions++

            // Attempt self-healing from sidecar backup or secondary copy if recorded
            let isHealed = false
            try {
              const sidecarContent = JSON.parse(await readFile(sidecarPath, 'utf8'))
              if (sidecarContent.backup_content_base64) {
                const recovered = Buffer.from(sidecarContent.backup_content_base64, 'base64')
                const recoveredHash = createHash('sha256').update(recovered).digest('hex')
                if (recoveredHash === fullDigest) {
                  await writeFile(binPath, recovered)
                  isHealed = true
                  healed++
                }
              }
            } catch {
              // Sidecar unreadable or no backup
            }

            // Publish alert to event bus
            eventBus.publish('scrubber.corruption_detected', {
              digest: fullDigest,
              expectedDigest: fullDigest,
              actualDigest: actualSha256,
              autoHealed: isHealed,
              timestamp: new Date().toISOString(),
            })
          }
        }
      }
    } catch {
      // Storage directory may be empty or not yet created
    }

    this.stats = {
      objectsScanned: scanned,
      corruptionsFound: corruptions,
      autoHealed: healed,
      lastScrubTime: new Date().toISOString(),
    }

    return this.getStats()
  }

  private computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }
}
