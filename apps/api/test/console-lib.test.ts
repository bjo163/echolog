import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '@echolog/shared'
import { describeFailure, issueApiKey, listApiKeys, revokeApiKey, signIn, whoAmI } 
from '@echolog/shared'
import { toneClasses } from '@echolog/shared'

/**
 * The console layer is tested where it needs no browser: the credential calls,
 * the verbatim failure pass-through, and the tone table that turns a semantic
 * status into theme tokens. No React rendering, no DOM — one swapped function.
 */

interface Recorded {
  url: string
  method: string
  credentials: string | undefined
  headers: Record<string, string | undefined>
  body: string | undefined
}

function stubFetch(reply: { status: number; body: unknown }, capture: (call: Recorded) => void): () => void {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    capture({
      url: String(input),
      method: init.method ?? 'GET',
      credentials: init.credentials,
      headers: (init.headers ?? {}) as Record<string, string | undefined>,
      body: typeof init.body === 'string' ? init.body : undefined,
    })
    return new Response(
      reply.status === 204
        ? null
        : typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body),
      {
        status: reply.status,
        headers: { 'content-type': 'application/json' },
      },
    )
  }) as typeof fetch
  return () => { globalThis.fetch = original }
}

void test('console credential calls ride the session cookie, never a bearer token', async (t) => {
  const calls: Recorded[] = []
  const principal = { login: 'keeper', role: 'admin', kind: 'session' }
  t.after(stubFetch({ status: 200, body: principal }, (call) => calls.push(call)))

  assert.deepEqual(await signIn('keeper', 'a-secret'), principal)
  assert.deepEqual(await whoAmI(), principal)
  assert.equal(await listApiKeys(), undefined)

  const [login, me, keys] = calls
  assert.ok(login && me && keys)
  assert.equal(login.url, '/api/v1/session')
  assert.equal(login.method, 'POST')
  assert.equal(login.credentials, 'include')
  assert.equal(login.headers['content-type'], 'application/json')
  assert.equal(me.url, '/api/v1/me')
  assert.equal(me.credentials, 'include')
  assert.equal(me.headers.authorization, undefined, 'the console never handles a bearer token')
  assert.equal(keys.url, '/api/v1/keys')
  assert.equal(login.body, JSON.stringify({ login: 'keeper', password: 'a-secret' }))
  assert.equal(JSON.stringify([me, keys]).includes('a-secret'), false, 'only the sign-in body carries the password')
})

void test('an unauthenticated console renders the login card instead of failing', async (t) => {
  t.after(stubFetch({ status: 401, body: { error: { code: 'unauthorized', message: 'Authentication is required.' } } }, () => undefined))
  assert.equal(await whoAmI(), null)
})

void test('an unexpected console failure still surfaces, and keeps the server wording', async (t) => {
  t.after(stubFetch({ status: 507, body: { error: { code: 'quota_exceeded', message: 'The storage volume is full.' } } }, () => undefined))
  await assert.rejects(whoAmI(), (error: unknown) => error instanceof ApiError && error.status === 507 && error.code === 'quota_exceeded')
  assert.equal(
    describeFailure(new ApiError(507, 'quota_exceeded', 'The storage volume is full.')),
    'The storage volume is full. (quota_exceeded)',
  )
  assert.equal(describeFailure(new Error('plain')), 'plain')
  assert.equal(describeFailure('not an error'), 'Unexpected console failure.')
})

void test('a revoke call encodes the prefix it is given', async (t) => {
  const calls: Recorded[] = []
  t.after(stubFetch({ status: 204, body: '' }, (call) => calls.push(call)))
  await revokeApiKey('ecl_ab/ cd')
  assert.equal(calls[0]?.url, '/api/v1/keys/ecl_ab%2F%20cd')
  assert.equal(calls[0]?.method, 'DELETE')
  assert.equal(calls[0]?.credentials, 'include')
})

void test('issuing a key sends only a name and a known role', async (t) => {
  const calls: Recorded[] = []
  const body = { key: { id: '1', name: 'backup', prefix: 'ecl_zzzzzzzz', role: 'member', created_at: 'now' }, token: 'ecl_token' }
  t.after(stubFetch({ status: 201, body }, (call) => calls.push(call)))
  assert.deepEqual(await issueApiKey('backup', 'member'), body)
  assert.equal(calls[0]?.body, JSON.stringify({ name: 'backup', role: 'member' }))
})

void test('every tone the format layer can emit becomes a theme token', () => {
  assert.deepEqual(Object.keys(toneClasses).sort(), ['accent', 'cyan', 'hot', 'night', 'ok', 'pink'])
  for (const classes of Object.values(toneClasses)) {
    assert.match(classes, /bg-status-/, 'tones reference theme tokens')
    assert.doesNotMatch(classes, /#[0-9a-f]{3,8}|\brgba?\(/i, 'tones never carry a raw color')
  }
})
