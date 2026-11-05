'use client'

import { useState } from 'react'
import { LogIn, ShieldCheck } from 'lucide-react'
import { useConsole } from './provider'

/**
 * The sign-in screen.
 *
 * Credentials are sent once to the session endpoint and are never stored in
 * the browser. The form states that it authenticates against the local
 * ECHOLOG identity, which is the standalone deviation from ADR-0007 and is
 * therefore said out loud rather than implied.
 */
export function LoginScreen() {
  const { signInWith, failure } = useConsole()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className='login'>
      <div className='login-card'>
        <div className='brand'>
          <span className='mark' aria-hidden='true'>
            E
          </span>
          <div>
            <b>ECHOLOG</b>
            <small>D19 · Object Memory &amp; Evidence Integrity</small>
          </div>
        </div>
        <h2>Sign in to the operator console</h2>
        <p className='fine'>
          The console uses the local ECHOLOG identity. In federated mode the hub remains the canonical
          identity authority.
        </p>
        <form
          className='login-form'
          onSubmit={(event) => {
            event.preventDefault()
            setBusy(true)
            void signInWith(login, password).finally(() => setBusy(false))
          }}
        >
          <label htmlFor='echolog-login'>Operator login</label>
          <input
            id='echolog-login'
            name='login'
            autoComplete='username'
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            required
          />
          <label htmlFor='echolog-password'>Password</label>
          <input
            id='echolog-password'
            name='password'
            type='password'
            autoComplete='current-password'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {failure ? (
            <p className='fine login-error' role='alert'>
              {failure.message}
            </p>
          ) : null}
          <button type='submit' className='btn primary' disabled={busy}>
            <LogIn size={15} aria-hidden='true' /> {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className='fine login-secure'>
          <ShieldCheck size={14} aria-hidden='true' /> The password is sent over the session endpoint only and is
          never stored in the browser.
        </p>
      </div>
    </div>
  )
}
