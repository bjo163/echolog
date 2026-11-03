import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatBytes, formatDateTime, sanitizeDisplay, formatPrincipal, isPrincipalAdmin, formatObjectMetadata } from '../src/lib/format-extensions.js'
import type { EchologPrincipal } from '../src/auth.js'

test('formatBytes converts bytes to human readable format', async () => {
  assert.strictEqual(formatBytes(0), '0 B')
  assert.strictEqual(formatBytes(1023), '1023 B')
  assert.strictEqual(formatBytes(1024), '1.00 KB')
  assert.strictEqual(formatBytes(1024 * 1024), '1.00 MB')
  assert.strictEqual(formatBytes(1024 * 1024 * 1024), '1.00 GB')
  assert.strictEqual(formatBytes(1500, 1), '1.5 KB')
})

test('formatDateTime formats relative time', async () => {
  const now = new Date()
  const past = new Date(now.getTime() - 5000) // 5 seconds ago
  assert.match(formatDateTime(past.toISOString()), /5 second|few seconds|just now|moments ago/)
  
  const minuteAgo = new Date(now.getTime() - 60_000)
  assert.match(formatDateTime(minuteAgo.toISOString()), /1 minute/)
  
  const hourAgo = new Date(now.getTime() - 2 * 60_000 * 60)
  assert.match(formatDateTime(hourAgo.toISOString()), /2 hour/)
  
  const dayAgo = new Date(now.getTime() - 48 * 60_000 * 60)
  assert.match(formatDateTime(dayAgo.toISOString()), /2 day|yesterday/)
  
  const oldDate = new Date('2020-01-01')
  assert.match(formatDateTime(oldDate.toISOString()), /Jan 1 2020|2020/)
})

test('sanitizeDisplay sanitizes and truncates strings', async () => {
  assert.strictEqual(sanitizeDisplay('normal text'), 'normal text')
  assert.strictEqual(sanitizeDisplay('text/with/slashes'), 'slashes')
  assert.strictEqual(sanitizeDisplay('text\\with\\backslashes'), 'backslashes')
  assert.strictEqual(sanitizeDisplay(undefined), '-')
  assert.strictEqual(sanitizeDisplay(null), '-')
  assert.strictEqual(sanitizeDisplay('A'.repeat(100), 50).length, 50)
  assert.match(sanitizeDisplay('A'.repeat(100), 50), /\.\.\./)
})

test('formatPrincipal formats principal for display', async () => {
  assert.strictEqual(formatPrincipal({ kind: 'key', uploader: 'user1', role: 'member', keyId: 'key123' }), 'API key (user1)')
  assert.strictEqual(formatPrincipal({ kind: 'session', uploader: 'user1', role: 'member', userId: 'user456' }), 'Session (user1)')
  assert.strictEqual(formatPrincipal(undefined), 'anonymous')
  assert.strictEqual(formatPrincipal(null), 'anonymous')
})

test('isPrincipalAdmin checks admin privileges', async () => {
  assert.strictEqual(isPrincipalAdmin({ kind: 'key', uploader: 'user1', role: 'admin' }), true)
  assert.strictEqual(isPrincipalAdmin({ kind: 'key', uploader: 'user1', role: 'member' }), false)
  assert.strictEqual(isPrincipalAdmin({ kind: 'service', uploader: 'service', role: 'service' }), true)
  assert.strictEqual(isPrincipalAdmin(undefined), false)
})

test('formatObjectMetadata formats object metadata', async () => {
  const metadata = {
    filename: 'test.jpg',
    content_type: 'image/jpeg',
    size: 1024 * 1024 * 2, // 2 MB
    uploader: 'user1',
    retention: '2024-01-01T00:00:00.000Z',
    legal_hold: true
  }
  
  const formatted = formatObjectMetadata(metadata)
  assert.match(formatted, /"test.jpg"/)
  assert.match(formatted, /image\/jpeg/)
  assert.match(formatted, /2.00 MB/)
  assert.match(formatted, /user1/)
  assert.match(formatted, /legal hold/)
})
