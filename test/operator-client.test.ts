import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, toApiError } from '../client/lib/api.js'
import { formatBytes, grantRemainingSeconds, retentionWords, scanWords } from '../client/lib/format.js'
import {
  WATCHLIST_STORAGE_KEY,
  parseWatchlist,
  refFromSidecar,
  removeRef,
  serializeWatchlist,
  upsertRef,
} from '../client/lib/watchlist.js'
import type { ObjectSidecar } from '../client/types.js'

const DIGEST = 'a'.repeat(64)

function sidecar(overrides: Partial<ObjectSidecar> = {}): ObjectSidecar {
  return {
    object_key: `sha256/${DIGEST}`,
    digest: DIGEST,
    size: 2048,
    content_type: 'image/png',
    filename: 'tapes.png',
    uploader: 'operator',
    created_at: '2026-10-27T10:00:00.000Z',
    retention_until: null,
    legal_hold: false,
    scan: 'skipped',
    tags: [],
    ...overrides,
  }
}

void test('consumer reference carries exactly the four handoff fields', () => {
  const ref = refFromSidecar(sidecar())
  assert.deepEqual(Object.keys(ref).sort(), ['content_type', 'digest', 'object_key', 'size'])
  assert.equal(ref.object_key, `sha256/${DIGEST}`)
  assert.equal(ref.size, 2048)
})

void test('watchlist persistence strips everything that is not a reference', () => {
  const smuggled = [{ ...refFromSidecar(sidecar()), filename: 'tapes.png', uploader: 'operator', token: 'secret-session' }]
  const raw = serializeWatchlist(smuggled as never)
  const parsed = JSON.parse(raw) as Record<string, unknown>[]
  assert.equal(parsed.length, 1)
  const kept = parsed[0] as Record<string, unknown>
  assert.deepEqual(Object.keys(kept).sort(), ['content_type', 'digest', 'object_key', 'size'])
  assert.equal(kept.filename, undefined)
  assert.equal(kept.uploader, undefined)
  assert.equal(kept.token, undefined)
  assert.ok(WATCHLIST_STORAGE_KEY.startsWith('echolog.operator.'))
})

void test('watchlist rejects malformed, mismatched and duplicated entries', () => {
  const good = refFromSidecar(sidecar())
  const badKey = { object_key: 'sha256/deadbeef', digest: DIGEST, size: 1, content_type: 'image/png' }
  const badDigest = { object_key: 'sha256/zz', digest: 'not-hex', size: 1, content_type: 'image/png' }
  const raw = JSON.stringify([good, badKey, badDigest, good])
  assert.deepEqual(parseWatchlist(raw), [good])
  assert.deepEqual(parseWatchlist(null), [])
  assert.deepEqual(parseWatchlist('not json'), [])
  assert.deepEqual(parseWatchlist('{"object_key":[]}'), [])
})

void test('upsert and remove keep the watchlist sorted and unique', () => {
  const first = refFromSidecar(sidecar())
  const otherDigest = 'b'.repeat(64)
  const second = refFromSidecar(sidecar({ digest: otherDigest, object_key: `sha256/${otherDigest}` }))
  const merged = upsertRef(upsertRef([first], second), first)
  assert.deepEqual(merged.map((ref) => ref.digest), [first.digest, second.digest].sort())
  assert.deepEqual(removeRef(merged, first.object_key), [second])
})

void test('scan: skipped is never rendered as scanned', () => {
  const skipped = scanWords('skipped')
  assert.match(skipped.label, /skipped/)
  assert.match(skipped.label, /never scanned/i)
  assert.notEqual(skipped.tone, 'ok')
  assert.equal(scanWords('clean').tone, 'ok')
  assert.equal(scanWords('infected').tone, 'hot')
  assert.equal(scanWords('pending').tone, 'accent')
  // Unknown values degrade to the unscanned wording, never to "clean".
  assert.match(scanWords('whatever').label, /never scanned/i)
})

void test('retention wording puts legal hold first and names elapsed deadlines', () => {
  const now = Date.parse('2026-10-27T12:00:00.000Z')
  const held = retentionWords(sidecar({ legal_hold: true, retention_until: '2026-10-28T00:00:00.000Z' }), now)
  assert.match(held.label, /legal hold/)
  assert.equal(held.tone, 'hot')
  const active = retentionWords(sidecar({ retention_until: '2026-10-28T00:00:00.000Z' }), now)
  assert.match(active.label, /retention active until/)
  const elapsed = retentionWords(sidecar({ retention_until: '2026-10-26T00:00:00.000Z' }), now)
  assert.match(elapsed.label, /retention elapsed/)
  assert.match(retentionWords(sidecar(), now).label, /no retention deadline/)
})

void test('grant countdown floors at zero', () => {
  const now = Date.parse('2026-10-27T12:00:00.000Z')
  assert.equal(grantRemainingSeconds('2026-10-27T12:04:30.000Z', now), 270)
  assert.equal(grantRemainingSeconds('2026-10-27T11:00:00.000Z', now), 0)
  assert.equal(grantRemainingSeconds('nonsense', now), 0)
})

void test('size formatting stays exact for bytes and readable above', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1023), '1023 B')
  assert.equal(formatBytes(1024), '1.0 KiB')
  assert.equal(formatBytes(-5), 'unknown size')
})

void test('409 refusal text survives parsing verbatim', async () => {
  const refusal = new Response(
    JSON.stringify({ error: { code: 'legal_hold', message: 'Object is protected by retention policy.' } }),
    { status: 409, headers: { 'content-type': 'application/json' } },
  )
  const error = await toApiError(refusal)
  assert.equal(error.status, 409)
  assert.equal(error.code, 'legal_hold')
  assert.equal(error.message, 'Object is protected by retention policy.')
  assert.ok(error instanceof ApiError)
})

void test('non-JSON failure bodies still produce a usable error', async () => {
  const refusal = new Response('<html>gateway blast</html>', { status: 502 })
  const error = await toApiError(refusal)
  assert.equal(error.status, 502)
  assert.match(error.message, /502/)
})
