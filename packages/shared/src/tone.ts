import type { StatusWord } from './format.js'

/**
 * The only place a semantic status tone becomes a visual token. Views ask for
 * `toneClasses(word.tone)` and never choose a color themselves, so the wording
 * in client/lib/format.ts stays the single source of truth for what a state
 * means. All values come from the theme tokens in app/globals.css.
 */
export const toneClasses = {
  ok: 'border-status-ok/30 bg-status-ok/15 text-status-ok',
  hot: 'border-status-hot/30 bg-status-hot/15 text-status-hot',
  accent: 'border-status-accent/30 bg-status-accent/15 text-status-accent',
  night: 'border-status-night/30 bg-status-night/15 text-status-night',
  cyan: 'border-status-cyan/30 bg-status-cyan/15 text-status-cyan',
  pink: 'border-status-pink/30 bg-status-pink/15 text-status-pink',
} as const satisfies Record<StatusWord['tone'], string>

export function toneClassesFor(tone: StatusWord['tone']): string {
  return toneClasses[tone]
}

/** A 64-character digest reads better split than wrapped mid-glyph. */
export function splitDigest(digest: string): { head: string; tail: string } {
  const midpoint = Math.ceil(digest.length / 2)
  return { head: digest.slice(0, midpoint), tail: digest.slice(midpoint) }
}
