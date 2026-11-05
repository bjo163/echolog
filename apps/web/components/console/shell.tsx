'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  Archive,
  Database,
  FileSearch,
  HardDrive,
  KeyRound,
  Menu,
  Moon,
  Package,
  RefreshCw,
  ShieldCheck,
  Sun,
  UploadCloud,
  X,
} from 'lucide-react'
import { SECTIONS, type SectionId } from '../../lib/nav'
import { useConsole } from './provider'
import { GlobalSearch } from './global-search'

/**
 * The console shell.
 *
 * The top bar states the facts an operator needs before trusting a screen:
 * which environment answered, which identity mode is in force, which version
 * is running and whether the API is currently reachable. None of those are
 * guessed from the page title.
 */

const ICONS: Record<SectionId, typeof Archive> = {
  overview: Archive,
  objects: FileSearch,
  deposit: UploadCloud,
  integrity: ShieldCheck,
  retention: HardDrive,
  storage: Database,
  access: KeyRound,
  activity: Activity,
  settings: Package,
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { principal, runtime, health, loading, refresh, signOutOf } = useConsole()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const stored = window.localStorage.getItem('echolog-theme')
    if (stored === 'light' || stored === 'dark') setTheme(stored)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light')
    window.localStorage.setItem('echolog-theme', theme)
  }, [theme])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const active = SECTIONS.find((entry) =>
    entry.href === '/' ? pathname === '/' : pathname.startsWith(entry.href),
  )

  return (
    <div className='app'>
      <a className='skip-link' href='#main-content'>
        Skip to main content
      </a>
      <button
        type='button'
        className='mobile-menu'
        aria-label={mobileOpen ? 'Close the navigation' : 'Open the navigation'}
        aria-controls='console-navigation'
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((open) => !open)}
      >
        {mobileOpen ? <X size={18} aria-hidden='true' /> : <Menu size={18} aria-hidden='true' />}
      </button>
      {mobileOpen ? <div className='scrim' onClick={() => setMobileOpen(false)} aria-hidden='true' /> : null}
      <aside className={mobileOpen ? 'sidebar sidebar-open' : 'sidebar'} aria-label='Console sections'>
        <div className='brand'>
          <span className='mark' aria-hidden='true'>
            E
          </span>
          <div>
            <b>ECHOLOG</b>
            <small>D19 · Object Memory</small>
          </div>
        </div>
        <nav className='nav' id='console-navigation'>
          {SECTIONS.map((entry) => {
            const Icon = ICONS[entry.id]
            const isActive = active ? active.id === entry.id : false
            return (
              <Link
                key={entry.id}
                href={entry.href}
                className={isActive ? 'nav-item active' : 'nav-item'}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={15} aria-hidden='true' />
                <span>{entry.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className='sidebar-bottom'>
          <div className='session-status'>
            <span className='fine'>Signed in as</span>
            <b>{principal ? principal.login : 'Not signed in'}</b>
            {principal ? <small className='fine'>{principal.role}</small> : null}
          </div>
          {principal ? (
            <button type='button' className='btn secondary' onClick={() => void signOutOf()}>
              Sign out
            </button>
          ) : null}
        </div>
      </aside>
      <div className='main' id='main-content' tabIndex={-1}>
        <header className='topbar'>
          <div className='crumb'>
            <b>{active ? active.label : 'Overview'}</b>
            <small className='fine'>{active ? active.description : ''}</small>
          </div>
          <GlobalSearch />
          <div className='top-actions'>
            <RuntimeChips />
            <button
              type='button'
              className='icon-btn'
              aria-label='Refresh from the API'
              title='Refresh from the API'
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? 'spin' : undefined} aria-hidden='true' />
            </button>
            <button
              type='button'
              className='icon-btn'
              aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
              title={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={15} aria-hidden='true' /> : <Moon size={15} aria-hidden='true' />}
            </button>
          </div>
        </header>
        <div className='content'>{children}</div>
      </div>
    </div>
  )
}

/**
 * The runtime chips.
 *
 * Every chip states a fact the server reported. When the runtime facts are not
 * reachable the chip says so instead of falling back to a plausible default,
 * because an operator must never see a confident label for an unknown value.
 */
function RuntimeChips() {
  const { runtime, health } = useConsole()
  const identity = runtime ? runtime.identity_mode.replace('_', ' ') : null
  const environment = runtime ? runtime.environment : null
  const version = runtime ? runtime.version : null
  const reachable = health ? health.reachable : false
  const ready = health ? health.ready : false

  return (
    <div className='runtime-chips'>
      <span className={environment === 'production' ? 'chip chip-warn' : 'chip'} title='The environment this instance reports'>
        {environment ?? 'environment unknown'}
      </span>
      <span className='chip' title='The identity mode this instance runs in'>
        {identity ?? 'identity unknown'}
      </span>
      <span className='chip' title='The API version answering on this origin'>
        v{version ?? '?'}
      </span>
      <span
        className={ready ? 'chip chip-good' : reachable ? 'chip chip-warn' : 'chip chip-bad'}
        title={health ? health.detail : 'The API health endpoint did not answer'}
      >
        {ready ? 'API ready' : reachable ? 'API not ready' : 'API unreachable'}
      </span>
    </div>
  )
}
