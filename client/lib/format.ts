import type { ObjectSidecar } from '../types.js'

/**
 * Human-word status labels. Semantics rule: `scan: skipped` never looks scanned.
 * `tone` is a semantic status kind, not a style: the UI layer maps it to its own
 * design tokens, so no colour or class name is decided here.
 */

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return 'unknown size'
  if (size < 1024) return `${String(size)} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = size / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const unit = units[unitIndex] ?? 'TiB'
  return `${value.toFixed(1)} ${unit}`
}

export interface StatusWord {
  label: string
  tone: 'ok' | 'hot' | 'accent' | 'night' | 'cyan' | 'pink'
}

export function scanWords(scan: string): StatusWord {
  switch (scan) {
    case 'pending':
      return { label: 'scan: pending — no result recorded yet', tone: 'accent' }
    case 'clean':
      return { label: 'scan: clean — an antivirus pass reported clean', tone: 'ok' }
    case 'infected':
      return { label: 'scan: infected — do not distribute', tone: 'hot' }
    case 'skipped':
    default:
      return { label: 'scan: skipped — never scanned, no antivirus has run', tone: 'night' }
  }
}

export function retentionWords(sidecar: ObjectSidecar, nowMs: number): StatusWord {
  if (sidecar.legal_hold) return { label: 'held — legal hold active, deletion refused', tone: 'hot' }
  if (!sidecar.retention_until) return { label: 'no retention deadline', tone: 'night' }
  const until = Date.parse(sidecar.retention_until)
  if (!Number.isFinite(until)) return { label: 'retention date unreadable', tone: 'accent' }
  if (until > nowMs) {
    return { label: `retention active until ${new Date(until).toISOString()}`, tone: 'accent' }
  }
  return { label: `retention elapsed ${new Date(until).toISOString()} — GC may remove it`, tone: 'cyan' }
}

/** Seconds a download grant stays valid, from its server-issued expiry. */
export function grantRemainingSeconds(expiresAtIso: string, nowMs: number): number {
  const expiresAt = Date.parse(expiresAtIso)
  if (!Number.isFinite(expiresAt)) return 0
  return Math.max(0, Math.floor((expiresAt - nowMs) / 1000))
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'expired'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes > 0 ? `${String(minutes)}m ${String(rest).padStart(2, '0')}s` : `${String(rest)}s`
}
