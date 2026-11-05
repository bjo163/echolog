'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Page-level scaffolding shared by every section. */

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <header className= page-title>
      <div>
        <span className=eyebrow>{eyebrow}</span>
        <h2>{title}</h2>
        <p className=fine>{description}</p>
      </div>
      {actions ? <div className=actions>{actions}</div> : null}
    </header>
  )
}

export interface KeyValueEntry {
  label: string
  value: ReactNode
  hint?: string
}

/**
 * A definition list for factual fields.
 *
 * A value the server did not report stays visibly missing instead of being
 * collapsed into a dash that could be read as a measurement.
 */
export function KeyValueGrid({ entries, columns = 2 }: { entries: KeyValueEntry[]; columns?: number }) {
  const style = { '--detail-columns': String(columns) } as CSSProperties
  return (
    <dl className=detail-grid style={style}>
      {entries.map((entry) => (
        <div key={entry.label}>
          <dt className=fine>{entry.label}</dt>
          <dd>
            {entry.value}
            {entry.hint ? <small className=fine>{entry.hint}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function LoadingRow({ children = 'Reading from the API' }: { children?: ReactNode }) {
  return (
    <div className=loading role=status aria-live=polite>
      <span className=spin aria-hidden=true />
      <span>{children}</span>
    </div>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className=toolbar>{children}</div>
}

export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  icon: Icon,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  icon?: LucideIcon
}) {
  return (
    <div className=search>
      {Icon ? <Icon size={16} aria-hidden=true /> : null}
      <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  )
}
