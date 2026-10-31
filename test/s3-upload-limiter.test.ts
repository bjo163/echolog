import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { test } from 'node:test'
import { createUploadLimiter } from '../src/modules/s3/upload-limiter.js'

void test('upload limiter transfers permits without exceeding its active body bound', async () => {
  const limit = 4
  const runWithLimit = createUploadLimiter(limit)
  const releases: Array<() => void> = []
  let active = 0
  let peak = 0
  let retainedPayloads = 0
  let peakRetainedPayloads = 0
  let completed = 0
  const work = () => runWithLimit(async () => {
    active += 1
    peak = Math.max(peak, active)
    // Model a collected body remaining live while a serialized write is blocked.
    const payload = new Uint8Array(64 * 1024)
    retainedPayloads += 1
    peakRetainedPayloads = Math.max(peakRetainedPayloads, retainedPayloads)
    await new Promise<void>((resolve) => releases.push(resolve))
    void payload
    retainedPayloads -= 1
    active -= 1
    completed += 1
  })

  const tasks = Array.from({ length: 8 }, work)
  await setImmediate()
  assert.equal(active, limit)
  releases.shift()?.()
  // This arrives while the just-freed permit has a queued waiter. It must not steal that slot.
  tasks.push(work())
  await setImmediate()
  assert.equal(active, limit)

  for (let attempt = 0; completed < tasks.length && attempt < 20; attempt += 1) {
    while (releases.length > 0) releases.shift()?.()
    await setImmediate()
  }
  await Promise.all(tasks)
  assert.equal(completed, tasks.length)
  assert.ok(peak <= limit, `peak active upload bodies was ${peak}, expected at most ${limit}`)
  assert.ok(peakRetainedPayloads <= limit, `peak retained payloads was ${peakRetainedPayloads}, expected at most ${limit}`)
})
