import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatBytes, validateUpload, type UploadLimits } from '../lib/upload-validate.ts'

/**
 * The server stays the authority on what it accepts, but the console should
 * reject the obvious cases before a large upload and should always name the
 * rule that was broken.
 */

const limits: UploadLimits = {
  maxUploadBytes: 1024,
  allowedMimeTypes: ['text/plain'],
  storageQuotaBytes: 4096,
  usedBytes: 0,
}

const base = {
  filename: 'note.txt',
  contentType: 'text/plain',
  size: 10,
  retentionUntil: null,
  legalHold: false,
}

test('a conforming candidate is allowed', () => {
  assert.deepEqual(validateUpload(base, limits), { issues: [], canUpload: true })
})

test('every rejection names the rule it broke', () => {
  const path = validateUpload({ ...base, filename: 'a/b.txt' }, limits)
  assert.equal(path.canUpload, false)
  assert.equal(path.issues[0]?.field, 'filename')
  assert.match(path.issues[0]?.message ?? '', /directory path/)

  const blank = validateUpload({ ...base, filename: '   ' }, limits)
  assert.equal(blank.issues[0]?.message, 'A filename is required.')

  const type = validateUpload({ ...base, contentType: 'application/zip' }, limits)
  assert.equal(type.issues.some((issue) => issue.field === 'contentType'), true)

  const empty = validateUpload({ ...base, size: 0 }, limits)
  assert.equal(empty.issues.some((issue) => issue.message === 'The selected file is empty.'), true)

  const big = validateUpload({ ...base, size: 5000 }, limits)
  assert.equal(big.issues.some((issue) => issue.field === 'size'), true)
})

test('an instance with no accepted-type list accepts any type', () => {
  const open = validateUpload({ ...base, contentType: 'application/zip' }, { ...limits, allowedMimeTypes: [] })
  assert.equal(open.canUpload, true)
})

test('a nearly full quota warns without blocking', () => {
  const result = validateUpload({ ...base, size: 500 }, { ...limits, usedBytes: 3300 })
  assert.equal(result.canUpload, true, 'a warning must never block an upload')
  assert.equal(result.issues[0]?.field, 'quota')
  assert.equal(result.issues[0]?.severity, 'warning')
})

test('a projected overflow is an error, not a warning', () => {
  const result = validateUpload({ ...base, size: 500 }, { ...limits, usedBytes: 4000 })
  assert.equal(result.canUpload, false)
  assert.equal(result.issues.some((issue) => issue.field === 'quota' && issue.severity === 'error'), true)
})

test('a legal hold is surfaced as a warning before the upload commits', () => {
  const result = validateUpload({ ...base, legalHold: true }, limits)
  assert.equal(result.canUpload, true)
  assert.equal(result.issues[0]?.field, 'legalHold')
  assert.equal(result.issues[0]?.severity, 'warning')
})

test('a past or invalid retention date is rejected', () => {
  const past = validateUpload({ ...base, retentionUntil: '2000-01-01T00:00:00.000Z' }, limits)
  assert.equal(past.issues.some((issue) => issue.field === 'retentionUntil'), true)

  const invalid = validateUpload({ ...base, retentionUntil: 'soon' }, limits)
  assert.equal(invalid.issues.some((issue) => issue.message.includes('not a valid date')), true)
})

test('a byte count is described, and an impossible one is not guessed', () => {
  assert.equal(formatBytes(0), '0.0 B')
  assert.equal(formatBytes(1536), '1.5 KB')
  assert.equal(formatBytes(Number.NaN), 'unknown size')
  assert.equal(formatBytes(-1), 'unknown size')
})
