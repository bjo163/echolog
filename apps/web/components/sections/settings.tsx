'use client'

import { useState } from 'react'
import { Download, Package } from 'lucide-react'
import { useConsole } from '../console/provider'
import { EmptyState, Notice, Panel, StatusBadge } from '../ui/primitives'
import { SectionHeader } from '../ui/layout'

/**
 * The settings screen.
 *
 * This is the diagnostics surface: what instance answered, what it reports
 * about itself and which capabilities it actually has. The exported document
 * contains no secret, no credential and no filesystem path.
 */

export function SettingsSection() {
  const { runtime, health, failure, nowMs } = useConsole()
  const [copied, setCopied] = useState(false)

  const diagnostics = {
    captured_at: new Date(nowMs).toISOString(),
    product: 'ECHOLOG',
    domain: 'D19',
    version: runtime ? runtime.version : null,
    environment: runtime ? runtime.environment : null,
    identity_mode: runtime ? runtime.identity_mode : null,
    identity_authority: runtime ? runtime.identity_authority : null,
    storage_backend: runtime ? runtime.storage.backend : null,
    storage_quota_bytes: runtime ? runtime.storage.quota_bytes : null,
    max_upload_bytes: runtime ? runtime.storage.max_upload_bytes : null,
    allowed_mime_types: runtime ? runtime.storage.allowed_mime_types : null,
    session_ttl_hours: runtime ? runtime.session_ttl_hours : null,
    metrics_enabled: runtime ? runtime.metrics_enabled : null,
    features: runtime ? runtime.features : null,
    api_reachable: health ? health.reachable : null,
    api_ready: health ? health.ready : null,
    api_detail: health ? health.detail : null,
    last_failure: failure ? { kind: failure.kind, message: failure.message } : null,
  }

  const download = () => {
    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'echolog-diagnostics.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const copy = () => {
    const clipboard = navigator.clipboard
    if (!clipboard) return
    void clipboard.writeText(JSON.stringify(diagnostics, null, 2)).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      },
      () => setCopied(false),
    )
  }

  return (
    <div className='stack'>
      <SectionHeader
        eyebrow='DIAGNOSTICS'
        title='What this instance reports about itself'
        description='Everything below comes from the running service. Nothing here is inferred by the browser.'
        actions={
          <div className='actions'>
            <button type='button' className='btn secondary' onClick={copy}>
              {copied ? 'Copied' : 'Copy diagnostics'}
            </button>
            <button type='button' className='btn primary' onClick={download}>
              <Download size={15} aria-hidden='true' /> Export diagnostics
            </button>
          </div>
        }
      />

      <div className='columns'>
        <Panel eyebrow='RUNTIME' title='Instance facts'>
          {runtime ? (
            <dl className='detail-grid'>
              <div>
                <dt className='fine'>Product</dt>
                <dd>{runtime.product}</dd>
              </div>
              <div>
                <dt className='fine'>Domain</dt>
                <dd>{runtime.domain}</dd>
              </div>
              <div>
                <dt className='fine'>Version</dt>
                <dd>{runtime.version}</dd>
              </div>
              <div>
                <dt className='fine'>Environment</dt>
                <dd>{runtime.environment}</dd>
              </div>
              <div>
                <dt className='fine'>Identity mode</dt>
                <dd>{runtime.identity_mode.replace('_', ' ')}</dd>
              </div>
              <div>
                <dt className='fine'>Identity authority</dt>
                <dd>{runtime.identity_authority.replace('-', ' ')}</dd>
              </div>
              <div>
                <dt className='fine'>Storage backend</dt>
                <dd>{runtime.storage.backend}</dd>
              </div>
              <div>
                <dt className='fine'>Metrics</dt>
                <dd>{runtime.metrics_enabled ? 'Enabled' : 'Disabled'}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState title='Runtime facts unavailable' description='The runtime facts endpoint did not answer.' />
          )}
        </Panel>

        <Panel eyebrow='LIMITS' title='Configured limits'>
          {runtime ? (
            <dl className='detail-grid'>
              <div>
                <dt className='fine'>Storage quota</dt>
                <dd>{runtime.storage.quota_bytes.toLocaleString('en-US')} bytes</dd>
              </div>
              <div>
                <dt className='fine'>Maximum upload</dt>
                <dd>{runtime.storage.max_upload_bytes.toLocaleString('en-US')} bytes</dd>
              </div>
              <div>
                <dt className='fine'>Session lifetime</dt>
                <dd>{String(runtime.session_ttl_hours)} hour(s)</dd>
              </div>
              <div>
                <dt className='fine'>Accepted content types</dt>
                <dd className='fine'>{runtime.storage.allowed_mime_types.join(', ')}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState title='Limits unavailable' description='No limits were reported by the instance.' />
          )}
        </Panel>
      </div>

      <Panel eyebrow='CONNECTIVITY' title='Service health'>
        <div className='actions'>
          <StatusBadge tone={health && health.ready ? 'good' : health && health.reachable ? 'warn' : 'bad'}>
            {health ? health.detail : 'No health answer'}
          </StatusBadge>
          {failure ? <StatusBadge tone='bad'>{failure.title}</StatusBadge> : null}
        </div>
        <p className='fine'>
          The console reads <code>/health/ready</code> through the same origin it uses for the API, so a browser
          network problem and a service problem are reported as different failures.
        </p>
      </Panel>

      <Panel eyebrow='CAPABILITIES' title='Feature availability'>
        {runtime ? (
          <ul className='capability-list'>
            {Object.entries(runtime.features).map(([name, maturity]) => (
              <li key={name}>
                <span>{name.replaceAll('_', ' ')}</span>
                <StatusBadge tone={maturity === 'available' ? 'good' : maturity === 'experimental' ? 'warn' : 'muted'}>
                  {maturity === 'available' ? 'Available' : maturity === 'experimental' ? 'Experimental' : 'Not supported'}
                </StatusBadge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title='Capability map unavailable' description='The server did not return a capability map.' />
        )}
      </Panel>

      <Notice tone='info' title='What the export contains'>
        <Package size={14} aria-hidden='true' /> Version, environment, identity mode, configured limits, the
        capability map and the current health answer. No secret, no credential, no database path and no storage
        path is included.
      </Notice>
    </div>
  )
}
