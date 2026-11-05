/**
 * The console navigation model.
 *
 * One source of truth for the sections, so the sidebar, the command palette,
 * the mobile drawer and the route parser can never drift apart.
 */

export type SectionId =
  | 'overview'
  | 'objects'
  | 'deposit'
  | 'integrity'
  | 'retention'
  | 'storage'
  | 'access'
  | 'activity'
  | 'settings'

export interface SectionEntry {
  id: SectionId
  label: string
  href: string
  description: string
  /** Extra search terms for the command palette. */
  keywords: readonly string[]
}

export const SECTIONS: readonly SectionEntry[] = [
  {
    id: 'overview',
    label: 'Overview',
    href: '/',
    description: 'Preservation status, storage posture and recent activity.',
    keywords: ['home', 'status', 'summary', 'dashboard'],
  },
  {
    id: 'objects',
    label: 'Objects',
    href: '/objects',
    description: 'Every stored object with its content identity and lifecycle state.',
    keywords: ['files', 'blobs', 'cas', 'content', 'digest', 'alias'],
  },
  {
    id: 'deposit',
    label: 'Deposit',
    href: '/deposit',
    description: 'Preserve an original object and read back its evidence receipt.',
    keywords: ['upload', 'ingest', 'add', 'store', 'preservation'],
  },
  {
    id: 'integrity',
    label: 'Integrity',
    href: '/integrity',
    description: 'Byte-level fixity verification against the content address.',
    keywords: ['verify', 'fixity', 'scrub', 'checksum', 'sha256', 'corruption'],
  },
  {
    id: 'retention',
    label: 'Retention',
    href: '/retention',
    description: 'Retention windows, legal holds and expiry state.',
    keywords: ['hold', 'expiry', 'expire', 'lifecycle', 'policy'],
  },
  {
    id: 'storage',
    label: 'Storage',
    href: '/storage',
    description: 'Capacity, quotas, aliases and the state of recovery features.',
    keywords: ['quota', 'capacity', 'disk', 'backup', 'restore', 'bucket'],
  },
  {
    id: 'access',
    label: 'Access',
    href: '/access',
    description: 'Credentials, operators, roles and session state.',
    keywords: ['keys', 'users', 'roles', 'session', 'permission', 'policy'],
  },
  {
    id: 'activity',
    label: 'Activity',
    href: '/activity',
    description: 'The audit trail of what happened to which object.',
    keywords: ['audit', 'log', 'events', 'history', 'trail'],
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    description: 'Diagnostics, runtime facts and service connectivity.',
    keywords: ['diagnostics', 'version', 'environment', 'identity', 'config', 'about'],
  },
]

export function sectionById(id: SectionId): SectionEntry {
  const found = SECTIONS.find((entry) => entry.id === id)
  if (found) return found
  const fallback = SECTIONS[0]
  if (!fallback) throw new Error('The console has no sections configured.')
  return fallback
}

/** Resolves a pathname to a section, defaulting to the overview. */
export function sectionFromPath(pathname: string): SectionId {
  const segment = pathname.split('/').filter(Boolean)[0] ?? ''
  const match = SECTIONS.find((entry) => entry.id === segment)
  return match ? match.id : 'overview'
}

/** Searches sections and objects for the command palette. */
export function searchSections(query: string): SectionEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...SECTIONS]
  return SECTIONS.filter((entry) => {
    const haystack = [entry.label, entry.description, ...entry.keywords].join(' ').toLowerCase()
    return haystack.includes(needle)
  })
}
