/** FIFO concurrency limiter for body reads that retain uploaded bytes in memory. */
export function createUploadLimiter(limit: number): <T>(work: () => Promise<T>) => Promise<T> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Upload concurrency limit must be a positive integer.')
  let active = 0
  const waiters: Array<(release: () => void) => void> = []

  function makeRelease(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = waiters.shift()
      if (next) next(makeRelease())
      else active -= 1
    }
  }

  async function acquire(): Promise<() => void> {
    if (active < limit) {
      active += 1
      return makeRelease()
    }
    return new Promise((resolve) => waiters.push(resolve))
  }

  return async <T>(work: () => Promise<T>): Promise<T> => {
    const release = await acquire()
    try { return await work() } finally { release() }
  }
}
