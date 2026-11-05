'use client'

import { useState } from 'react'
import { KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useConsole } from '../console/provider'
import { EmptyState, Notice, Panel, StatusBadge } from '../ui/primitives'
import { SectionHeader } from '../ui/layout'
import { ConfirmDialog } from '../ui/overlays'
import { formatTimestamp } from '../../lib/format'

/**
 * The access screen.
 *
 * The identity mode comes from the server, because whether ECHOLOG is
 * standalone or federated is a deployment fact that a browser cannot infer. A
 * freshly issued key is shown exactly once and is never stored.
 */

export function AccessSection() {
  const { principal, runtime, users, apiKeys, isAdmin, createKey, revoke, setDisabled } = useConsole()
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [issued, setIssued] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  const identityMode = runtime ? runtime.identity_mode : null
  const authority = runtime ? runtime.identity_authority : null

  return (
    <div className='stack'>
      <SectionHeader
        eyebrow='ACCESS'
        title='Who may read what'
        description='Operators, service credentials and the role each of them carries. Authorization decisions are made by the API, never by this screen.'
      />

      <div className='columns'>
        <Panel eyebrow='IDENTITY' title='This session'>
          <dl className='detail-grid'>
            <div>
              <dt className='fine'>Identity mode</dt>
              <dd>
                {identityMode ? (
                  <StatusBadge tone={identityMode === 'arsy_federated' ? 'warn' : 'muted'}>
                    {identityMode.replace('_', ' ')}
                  </StatusBadge>
                ) : (
                  'Not reported'
                )}
              </dd>
            </div>
            <div>
              <dt className='fine'>Identity authority</dt>
              <dd>{authority ? authority.replace('-', ' ') : 'Not reported'}</dd>
            </div>
            <div>
              <dt className='fine'>Operator</dt>
              <dd>{principal ? principal.login : 'Not signed in'}</dd>
            </div>
            <div>
              <dt className='fine'>Role</dt>
              <dd>{principal ? principal.role : 'Unknown'}</dd>
            </div>
            <div>
              <dt className='fine'>Credential kind</dt>
              <dd>{principal ? principal.kind : 'Unknown'}</dd>
            </div>
            <div>
              <dt className='fine'>Session lifetime</dt>
              <dd>{runtime ? String(runtime.session_ttl_hours) + ' hour(s)' : 'Not reported'}</dd>
            </div>
          </dl>
          {identityMode === 'standalone' ? (
            <p className='fine'>
              <ShieldCheck size={14} aria-hidden='true' /> Standalone mode keeps local identity inside ECHOLOG.
              This is the documented deviation from ADR-0007 and does not make ECHOLOG a second hub.
            </p>
          ) : null}
        </Panel>

        <Panel eyebrow='OPERATORS' title='Registered operators'>
          {!isAdmin ? (
            <EmptyState title='Administrator access required' description='The operator list is restricted to administrators.' />
          ) : users.length === 0 ? (
            <EmptyState title='No operators listed' description='The instance returned an empty operator list.' />
          ) : (
            <ul className='capability-list'>
              {users.map((user) => (
                <li key={user.id}>
                  <span>
                    {user.login} <span className='fine'>{user.role}</span>
                  </span>
                  <span className='actions'>
                    {user.disabled ? <StatusBadge tone='muted'>Disabled</StatusBadge> : <StatusBadge tone='good'>Active</StatusBadge>}
                    <button type='button' className='text-btn' onClick={() => void setDisabled(user.login, !user.disabled)}>
                      {user.disabled ? 'Enable' : 'Disable'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel eyebrow='CREDENTIALS' title='API keys'>
        {!isAdmin ? (
          <EmptyState title='Administrator access required' description='Credential management is restricted to administrators.' />
        ) : (
          <div className='stack'>
            <div className='key-form'>
              <label htmlFor='key-name'>Key name</label>
              <input id='key-name' value={name} onChange={(event) => setName(event.target.value)} placeholder='Reporting pipeline' />
              <label htmlFor='key-role'>Role</label>
              <select id='key-role' value={role} onChange={(event) => setRole(event.target.value as 'admin' | 'member')}>
                <option value='member'>Member</option>
                <option value='admin'>Administrator</option>
              </select>
              <button
                type='button'
                className='btn primary'
                disabled={!name.trim()}
                onClick={() => {
                  void createKey(name.trim(), role).then((result) => {
                    if (result) {
                      setIssued(result.token)
                      setName('')
                    }
                  })
                }}
              >
                <Plus size={15} aria-hidden='true' /> Issue a key
              </button>
            </div>

            {issued ? (
              <Notice tone='warn' title='Copy this key now'>
                <div className='stack'>
                  <code className='digest'>{issued}</code>
                  <span>This secret is shown once and is never stored by the console.</span>
                  <button type='button' className='text-btn' onClick={() => setIssued(null)}>
                    I have copied it
                  </button>
                </div>
              </Notice>
            ) : null}

            {apiKeys.length === 0 ? (
              <EmptyState title='No API keys' description='No credential has been issued for this instance.' />
            ) : (
              <ul className='capability-list'>
                {apiKeys.map((key) => (
                  <li key={key.id}>
                    <span>
                      {key.name} <span className='fine'>{key.prefix}… · {key.role}</span>
                    </span>
                    <span className='actions'>
                      {key.revoked_at ? <StatusBadge tone='muted'>Revoked</StatusBadge> : <StatusBadge tone='good'>Active</StatusBadge>}
                      <span className='fine'>
                        {key.last_used_at ? 'Last used ' + formatTimestamp(key.last_used_at).text : 'Never used'}
                      </span>
                      {!key.revoked_at ? (
                        <button type='button' className='text-btn' onClick={() => setRevoking(key.prefix)}>
                          <Trash2 size={13} aria-hidden='true' /> Revoke
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={revoking !== null}
        title='Revoke this credential'
        destructive
        confirmLabel='Revoke the key'
        body={
          <p>
            Revoking <b>{revoking}</b> stops any holder of that key from reaching ECHOLOG. Requests already in
            flight may still complete.
          </p>
        }
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          if (!revoking) return
          void revoke(revoking)
          setRevoking(null)
        }}
      />

      <p className='fine'>
        <KeyRound size={14} aria-hidden='true' /> Service credentials, grant secrets and session tokens never
        reach the browser bundle, browser storage or the log stream.
      </p>
    </div>
  )
}
