'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Shared presentational primitives.
 *
 * Every screen composes from these, so spacing, tone and wording stay
 * identical between sections instead of drifting per screen.
 */

export type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'info'

export function Panel({
  eyebrow,
  title,
  description,
  actions,
  children,
  className = '',
}: {
  eyebrow?: string
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={'panel ' + className.trim()}>
      {(title || eyebrow || actions) && (
        <div className='panel-head'>
          <div>
            {eyebrow ? <span className='eyebrow'>{eyebrow}</span> : null}
            {title ? <h3>{title}</h3> : null}
            {description ? <p className='fine'>{description}</p> : null}
          </div>
          {actions ? <div className='actions'>{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  )
}

export function StatusBadge({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  const toneClass =
    tone === 'good' ? 'status-good' : tone === 'warn' ? 'status-warn' : tone === 'bad' ? 'status-bad' : 'status-muted'
  return (
    <span className={'status ' + toneClass} title={title}>
      {children}
    </span>
  )
}

export function Metric({
  label,
  value,
  note,
  icon: Icon,
  tone = 'muted',
}: {
  label: string
  value: string
  note?: string
  icon?: LucideIcon
  tone?: Tone
}) {
  return (
    <div className='metric'>
      {Icon ? (
        <span className={'metric-icon tone-' + tone}>
          <Icon size={16} aria-hidden={true} />
        </span>
      ) : null}
      <div>
        <span className='fine'>{label}</span>
        <b className='usage-number'>{value}</b>
        {note ? <small className='fine'>{note}</small> : null}
      </div>
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className='empty'>
      <b>{title}</b>
      <p className='fine'>{description}</p>
      {action ? <div className='actions'>{action}</div> : null}
    </div>
  )
}

export function Notice({
  tone,
  title,
  children,
  action,
}: {
  tone: Tone
  title?: string
  children: ReactNode
  action?: ReactNode
}) {
  const toneClass = tone === 'good' ? 'success' : tone === 'bad' ? 'error' : tone === 'warn' ? 'warning' : 'info'
  return (
    <div className={'notice ' + toneClass} role={tone === 'bad' ? 'alert' : 'status'}>
      <div>
        {title ? <b>{title}</b> : null}
        <span>{children}</span>
      </div>
      {action ? <div className='actions'>{action}</div> : null}
    </div>
  )
}
