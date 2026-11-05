import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  compareValues,
  filterRows,
  nextSort,
  paginate,
  selectionSummary,
  sortRows,
  toggleSelection,
} from '../lib/table.ts'

/**
 * The object list has no server-side sort, page or filter, so the console owns
 * that behaviour. These tests pin the parts an operator would notice: missing
 * values, page clamping, and selection that never drifts past the page.
 */

test('missing values sort last in both directions', () => {
  assert.equal(compareValues(null, 5), 1)
  assert.equal(compareValues(5, null), -1)
  assert.equal(compareValues(undefined, undefined), 0, 'two unknowns are equal, not ordered')
})

test('numbers compare numerically and strings compare naturally', () => {
  assert.ok(compareValues(2, 10) < 0, '2 must sort before 10, not after it')
  assert.ok(compareValues('file2', 'file10') < 0)
})

test('sortRows copies and never mutates its input', () => {
  const rows = [{ size: 3 }, { size: 1 }, { size: 2 }]
  const sorted = sortRows(rows, { key: 'size', direction: 'asc' }, (row) => row.size)
  assert.deepEqual(sorted.map((row) => row.size), [1, 2, 3])
  assert.deepEqual(rows.map((row) => row.size), [3, 1, 2], 'the caller array is untouched')
  const desc = sortRows(rows, { key: 'size', direction: 'desc' }, (row) => row.size)
  assert.deepEqual(desc.map((row) => row.size), [3, 2, 1])
})

test('paginate clamps a page that no longer exists', () => {
  const rows = [1, 2, 3, 4, 5]
  assert.deepEqual(paginate(rows, { page: 9, pageSize: 2 }), { rows: [5], page: 3, pageCount: 3 })
  assert.deepEqual(paginate(rows, { page: 0, pageSize: 2 }), { rows: [1, 2], page: 1, pageCount: 3 })
  assert.deepEqual(paginate([], { page: 1, pageSize: 10 }), { rows: [], page: 1, pageCount: 1 })
})

test('filterRows matches a substring and treats a blank query as everything', () => {
  const rows = [{ key: 'alpha.txt' }, { key: 'beta.bin' }]
  assert.equal(filterRows(rows, '  ALPHA ', ['key']).length, 1)
  assert.equal(filterRows(rows, '   ', ['key']).length, 2)
  assert.equal(filterRows(rows, 'gamma', ['key']).length, 0)
})

test('nextSort flips the direction only on the same column', () => {
  assert.deepEqual(nextSort({ key: 'key', direction: 'asc' }, 'size'), { key: 'size', direction: 'asc' })
  assert.deepEqual(nextSort({ key: 'key', direction: 'asc' }, 'key'), { key: 'key', direction: 'desc' })
})

test('selection toggles by digest and never reports more than the page holds', () => {
  const row = { digest: 'abc' }
  assert.deepEqual(toggleSelection([], row), ['abc'])
  assert.deepEqual(toggleSelection(['abc', 'def'], row), ['def'])
  assert.equal(selectionSummary(0, 3), 'No objects selected')
  assert.equal(selectionSummary(2, 3), '2 of 3 objects selected')
  assert.equal(selectionSummary(3, 3), 'All 3 objects selected')
})
