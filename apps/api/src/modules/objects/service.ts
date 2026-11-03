import type { ObjectMetadataInput, ObjectSidecar } from '../../core/index.js'
import type { FsStorageDriver } from '../../core/index.js'

/** Application boundary for object operations; REST/auth policy is added by M39-09. */
export function createObjectService(driver: FsStorageDriver, collectObjects: (at?: Date) => ReturnType<FsStorageDriver['gc']> = (at) => driver.gc(at)) {
  return {
    ready() {
      return driver.ready()
    },
    upload(
      chunks: AsyncIterable<Uint8Array>,
      metadata: ObjectMetadataInput,
      beforePublish?: (sidecar: ObjectSidecar, existing: boolean) => Promise<void>,
    ) {
      return driver.putStream(chunks, metadata, beforePublish)
    },
    get(objectKey: string) {
      return driver.get(objectKey)
    },
    delete(objectKey: string) {
      return driver.delete(objectKey)
    },
    collect(at?: Date) {
      return collectObjects(at)
    },
    stats(at?: Date) {
      return driver.stats(at)
    },
  }
}
