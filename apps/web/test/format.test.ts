import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  NOT_AVAILABLE,
  formatAge,
  formatTimestamp,
  humaniseAction,
  isStale,
  maturityLabel,
  maturityTone,
  optionalNumber,
  truncateDigest,
  truncateMiddle,
} from '../lib/format.ts'

/**
 * The console must not turn an unreported value into a zero, an unknown age
 * into "now", or an experimental capability into a finished one. These tests
 * hold the wording to that rule.
 */

test('an unreported number reads as not available, never as zero', () => {
  assert.deepEqual(optionalNumber(null), { text: NOT_AVAILABLE, availability: 'unknown' })
  assert.deepEqual(optionalNumber(undefined), { text: NOT_AVAILABLE, availability: 'unknown' })
  assert.deepEqual(optionalNumber(Number.NaN), { text: NOT_AVAILABLE, availability: 'unknown' })
  assert.deepEqual(optionalNumber(1000), { text: '1,000', availability: 'known' })
  assert.deepEqual(optionalNumber(0), { text: '0', availability: 'known' }, 'a real zero is a known value')
})

test('a timestamp carries an explicit timezone and the ISO value', () => {
  const { text, iso } = formatTimestamp('2026-11-06T00:00:00.000Z')
  assert.equal(iso, '2026-11-06T00:00:00.000Z')
  assert.match(text, /2026/)
  assert.equal(text.trim(), text)
})

test('a missing or unparseable timestamp is not invented', () => {
  assert.deepEqual(formatTimestamp(null), { text: 'Not recorded', iso: null })
  assert.deepEqual(formatTimestamp(undefined), { text: 'Not recorded', iso: null })
  assert.deepEqual(formatTimestamp('not-a-date'), { text: 'not-a-date', iso: null })
})

test('age never collapses an unknown record into zero', () => {
  const now = Date.parse('2026-11-06T00:10:00.000Z')
  assert.equal(formatAge(null, now), null)
  assert.equal(formatAge(undefined, now), null)
  assert.equal(formatAge('not-a-date', now), null)
  assert.equal(formatAge('2026-11-06T00:09:30.000Z', now), '30s ago')
  assert.equal(formatAge('2026-11-06T00:05:00.000Z', now), '5m ago')
  assert.equal(formatAge('2026-11-05T22:10:00.000Z', now), '2h ago')
  assert.equal(formatAge('2026-11-01T00:10:00.000Z', now), '5d ago')
})

test('stale is decided by the window, not merely by presence', () => {
  const now = Date.parse('2026-11-06T00:00:00.000Z')
  assert.equal(isStale(null, now, 1000), false, 'an absent record is not stale, it is unknown')
  assert.equal(isStale('2026-11-05T23:59:59.000Z', now, 1000), false)
  assert.equal(isStale('2026-11-05T23:00:00.000Z', now, 1000), true)
})

test('a shortened identifier says that it was shortened', () => {
  const digest = 'a'.repeat(64)
  const short = truncateDigest(digest)
  assert.ok(short.length < digest.length)
  assert.match(short, /…/)
  assert.equal(truncateDigest('short'), 'short')
  assert.equal(truncateMiddle('short'), 'short')
  assert.match(truncateMiddle('x'.repeat(80)), /…/)
})

test('maturity wording never upgrades a capability', () => {
  assert.equal(maturityLabel('available'), 'Available')
  assert.equal(maturityLabel('experimental'), 'Experimental')
  assert.equal(maturityLabel('unavailable'), 'Not supported')
  assert.equal(maturityTone('available'), 'good')
  assert.equal(maturityTone('experimental'), 'warn')
  assert.equal(maturityTone('unavailable'), 'muted')
})

test('an action name becomes a sentence without inventing an outcome', () => {
  assert.equal(humaniseAction('object_created'), 'Object created')
  assert.equal(humaniseAction('gc_run'), 'Gc run')
})
