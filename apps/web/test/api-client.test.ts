import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '@echolog/shared'
import { classifyStatus, describeFailure } from '../lib/api-client.ts'

/**
 * A failure must never be shown as "the service is broken" when the real
 * problem is an expired session, and a private-witness 404 must never be shown
 * as an empty archive. Each class carries its own wording and next step.
 */

test('every status the console can meet maps to a distinct class', () => {
  assert.equal(classifyStatus(401, null), 'unauthenticated')
  assert.equal(classifyStatus(403, null), 'forbidden')
  assert.equal(classifyStatus(404, null), 'not_found')
  assert.equal(classifyStatus(409, null), 'conflict')
  assert.equal(classifyStatus(413, null), 'too_large')
  assert.equal(classifyStatus(415, null), 'unsupported_media')
  assert.equal(classifyStatus(429, null), 'rate_limited')
  assert.equal(classifyStatus(507, null), 'quota_exceeded')
  assert.equal(classifyStatus(503, null), 'service_unavailable')
  assert.equal(classifyStatus(500, null), 'unknown')
})

test('an error code without a matching status still classifies', () => {
  assert.equal(classifyStatus(400, 'quota_exceeded'), 'quota_exceeded')
  assert.equal(classifyStatus(400, 'too_large'), 'too_large')
  assert.equal(classifyStatus(400, 'unsupported_media_type'), 'unsupported_media')
})

test('an API failure keeps the server wording and carries a remedy', () => {
  const failure = describeFailure(new ApiError(507, 'quota_exceeded', 'The storage volume is full.'))
  assert.equal(failure.kind, 'quota_exceeded')
  assert.equal(failure.message, 'The storage volume is full.')
  assert.equal(failure.status, 507)
  assert.equal(failure.code, 'quota_exceeded')
  assert.ok(failure.remedy.length > 0, 'an operator is told what to do next')
})

test('a private-witness 404 explains the privacy rule, not an empty archive', () => {
  const failure = describeFailure(new ApiError(404, 'not_found', ''))
  assert.equal(failure.kind, 'not_found')
  assert.match(failure.remedy, /private-witness/i)
})

test('a conflict says the key is immutable rather than simply failing', () => {
  const failure = describeFailure(new ApiError(409, 'conflict', ''))
  assert.equal(failure.kind, 'conflict')
  assert.match(failure.remedy, /immutable/i)
})

test('a non-API error is never reported as a known class', () => {
  const failure = describeFailure(new Error('boom'))
  assert.equal(failure.kind, 'unknown')
  assert.equal(failure.message, 'boom')
  assert.equal(failure.status, null)
  assert.equal(failure.code, null)
  assert.equal(describeFailure('a string').kind, 'unknown')
})
