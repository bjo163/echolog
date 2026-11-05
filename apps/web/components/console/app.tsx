'use client'

import { usePathname } from 'next/navigation'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { useConsole, ConsoleProvider } from './provider'
import { ConsoleShell } from './shell'
import { CommandPalette } from './global-search'
import { LoginScreen } from './login'
import { Notice } from '../ui/primitives'
import { OverviewSection } from '../sections/overview'
import { ObjectsSection } from '../sections/objects'
import { ObjectDetailSection } from '../sections/object-detail'
import { DepositSection } from '../sections/deposit'
import { IntegritySection } from '../sections/integrity'
import { RetentionSection } from '../sections/retention'
import { StorageSection } from '../sections/storage'
import { AccessSection } from '../sections/access'
import { ActivitySection } from '../sections/activity'
import { SettingsSection } from '../sections/settings'
import { PackagesSection } from '../sections/packages'

/**
 * The console application.
 *
 * One client tree renders every section, so the session, the runtime facts
 * and the failure state are shared rather than fetched again per screen.
 */

export function ConsoleApp() {
  return (
    <ConsoleProvider>
      <ConsoleInner />
    </ConsoleProvider>
  )
}

function ConsoleInner() {
  const pathname = usePathname()
  const { principal, authReady, loading, failure, notice, setNotice } = useConsole()

  if (!authReady) {
    return (
      <div className='boot'>
        <span className='spin' aria-hidden='true' />
        <p>Connecting to ECHOLOG…</p>
      </div>
    )
  }

  if (!principal) {
    return (
      <div className='app'>
        <LoginScreen />
      </div>
    )
  }

  const digestSegment = pathname.startsWith('/objects/') ? decodeURIComponent(pathname.slice('/objects/'.length)) : null
  const section = digestSegment ? 'objects' : pathname.split('/').filter(Boolean)[0] ?? 'overview'

  return (
    <ConsoleShell>
      <CommandPalette />
      {notice ? (
        <div className='notice success' role='status'>
          <CheckCircle2 size={16} aria-hidden='true' />
          <span>{notice.text}</span>
          <button type='button' aria-label='Dismiss the message' onClick={() => setNotice(null)}>
            <X size={15} aria-hidden='true' />
          </button>
        </div>
      ) : null}
      {failure ? (
        <Notice tone='bad' title={failure.title}>
          {failure.message} {failure.remedy}
          <span className='fine'>
            <AlertTriangle size={13} aria-hidden='true' />
          </span>
        </Notice>
      ) : null}
      {loading ? <p className='fine'>Updating from the API…</p> : null}
      {digestSegment ? <ObjectDetailSection digest={digestSegment} /> : null}
      {!digestSegment && section === 'overview' ? <OverviewSection /> : null}
      {!digestSegment && section === 'objects' ? <ObjectsSection /> : null}
      {!digestSegment && section === 'deposit' ? <DepositSection /> : null}
      {!digestSegment && section === 'integrity' ? <IntegritySection /> : null}
      {!digestSegment && section === 'retention' ? <RetentionSection /> : null}
      {!digestSegment && section === 'storage' ? <StorageSection /> : null}
      {!digestSegment && section === 'access' ? <AccessSection /> : null}
      {!digestSegment && section === 'activity' ? <ActivitySection /> : null}
      {!digestSegment && section === 'settings' ? <SettingsSection /> : null}
      {!digestSegment && section === 'packages' ? <PackagesSection /> : null}
    </ConsoleShell>
  )
}
