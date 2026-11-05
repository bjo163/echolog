'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Overlay surfaces: the detail drawer and the confirmation dialog.
 *
 * Both trap focus, close on Escape, restore focus to the trigger and mark
 * themselves as modal, so a keyboard operator is never left behind an overlay
 * that silently swallowed their input.
 */

function useDismissable(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null
    const node = ref.current
    if (node) {
      const focusable = node.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])')
      ;(focusable ?? node).focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const items = Array.from(
        node.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])'),
      ).filter((item) => !item.hasAttribute('disabled'))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const target = restoreTo.current
      if (target) target.focus()
    }
  }, [open, onClose])

  return ref
}

export function DetailDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useDismissable(open, onClose)
  const titleId = useId()
  if (!open) return null
  return (
    <div className='drawer-layer'>
      <div className='scrim' onClick={onClose} aria-hidden='true' />
      <aside
        className='drawer'
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
        ref={ref}
        tabIndex={-1}
      >
        <header className='drawer-head'>
          <div>
            <h3 id={titleId}>{title}</h3>
            {subtitle ? <p className='fine'>{subtitle}</p> : null}
          </div>
          <button type='button' className='icon-btn' aria-label='Close the details panel' onClick={onClose}>
            <X size={16} aria-hidden='true' />
          </button>
        </header>
        <div className='drawer-body'>{children}</div>
        {footer ? <footer className='drawer-foot'>{footer}</footer> : null}
      </aside>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive,
  busy,
  confirmDisabled,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  destructive?: boolean
  busy?: boolean
  /** Keeps the confirm button disabled until the operator satisfies the rule. */
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useDismissable(open, onCancel)
  const titleId = useId()
  if (!open) return null
  return (
    <div className='drawer-layer'>
      <div className='scrim' onClick={onCancel} aria-hidden='true' />
      <div
        className='dialog'
        role='alertdialog'
        aria-modal='true'
        aria-labelledby={titleId}
        ref={ref}
        tabIndex={-1}
      >
        <h3 id={titleId}>{title}</h3>
        <div className='dialog-body'>{body}</div>
        <div className='actions'>
          <button type='button' className='btn secondary' onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type='button'
            className={destructive ? 'btn danger' : 'btn primary'}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
