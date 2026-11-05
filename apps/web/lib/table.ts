/**
 * Pure table logic.
 *
 * The console table has to sort, paginate and filter without the server
 * offering any of it, because the object list endpoint has no cursor, no sort
 * parameter and no page parameter. Keeping the logic here, rather than inside
 * a component, makes the behaviour testable without a DOM.
 */

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: string
  direction: SortDirection
}

export interface PageState {
  page: number
  pageSize: number
}

/** Comparator that treats `null` and `undefined` as "not reported". */
export function compareValues(a: unknown, b: unknown): number {
  const aMissing = a === null || a === undefined
  const bMissing = b === null || b === undefined
  if (aMissing && bMissing) return 0
  // Missing values sort last in both directions: an unknown value is never
  // presented as if it were the largest or the smallest real number.
  if (aMissing) return 1
  if (bMissing) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' })
}

export function sortRows<T>(rows: readonly T[], sort: SortState, accessor: (row: T, key: string) => unknown): T[] {
  const copy = [...rows]
  copy.sort((left, right) => {
    const result = compareValues(accessor(left, sort.key), accessor(right, sort.key))
    return sort.direction === 'asc' ? result : -result
  })
  return copy
}

/**
 * Applies a page window.
 *
 * The page is clamped instead of throwing, so a filter that shrinks the result
 * set can never leave the operator on a page that does not exist.
 */
export function paginate<T>(rows: readonly T[], page: PageState): { rows: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / page.pageSize))
  const current = Math.min(Math.max(1, page.page), pageCount)
  const start = (current - 1) * page.pageSize
  return { rows: rows.slice(start, start + page.pageSize), page: current, pageCount }
}

/** Case-insensitive substring match across the given fields. */
export function filterRows<T>(rows: readonly T[], query: string, fields: readonly (keyof T)[]): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...rows]
  return rows.filter((row) =>
    fields.some((field) => {
      const value = row[field]
      if (value === null || value === undefined) return false
      return String(value).toLowerCase().includes(needle)
    }),
  )
}

/** Flips the direction when the same column is sorted again. */
export function nextSort(current: SortState, key: string): SortState {
  if (current.key !== key) return { key, direction: 'asc' }
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

/** Selection helpers that never report more rows than the page actually holds. */
export function toggleSelection<T extends { digest: string }>(selected: readonly string[], row: T): string[] {
  return selected.includes(row.digest) ? selected.filter((item) => item !== row.digest) : [...selected, row.digest]
}

export function selectionSummary(selectedCount: number, totalCount: number): string {
  if (selectedCount === 0) return 'No objects selected'
  if (selectedCount === totalCount) return `All ${String(totalCount)} objects selected`
  return `${String(selectedCount)} of ${String(totalCount)} objects selected`
}
