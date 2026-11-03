import type { FsStorageDriver } from '../../core/index.js'
import type { PGliteDatabaseAdapter } from '../../db/pglite-adapter.js'
import { extractTextSnippet, generateLocalEmbedding } from './embedder.js'
import { eventBus } from '../realtime/event-bus.js'

export class BackgroundVectorIngestor {
  private driver: FsStorageDriver
  private pgliteAdapter?: PGliteDatabaseAdapter
  private queue: string[] = []
  private processing = false

  constructor(driver: FsStorageDriver, pgliteAdapter?: PGliteDatabaseAdapter) {
    this.driver = driver
    this.pgliteAdapter = pgliteAdapter
  }

  enqueue(digest: string): void {
    if (!this.pgliteAdapter) return
    this.queue.push(digest)
    void this.processNext()
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0 || !this.pgliteAdapter) {
      return
    }

    this.processing = true
    const digest = this.queue.shift()

    if (digest) {
      try {
        const obj = await this.driver.get(`sha256/${digest}`)
        if (obj) {
          const snippet = extractTextSnippet(obj.bytes, obj.sidecar.content_type)
          if (snippet && snippet.length > 0) {
            const embedding = generateLocalEmbedding(snippet, 384)
            await this.pgliteAdapter.upsertEmbedding({
              digest,
              filename: obj.sidecar.filename,
              content_type: obj.sidecar.content_type,
              extracted_text: snippet,
              embedding,
            })
            eventBus.publish('ai.indexed', {
              digest,
              filename: obj.sidecar.filename,
              dimensions: 384,
              timestamp: new Date().toISOString(),
            })
          }
        }
      } catch {
        // Ingest silently fails closed in background without crashing the server
      }
    }

    this.processing = false
    if (this.queue.length > 0) {
      setImmediate(() => {
        void this.processNext()
      })
    }
  }
}

