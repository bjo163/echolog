import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SECTIONS, searchSections, sectionById, sectionFromPath, type SectionId } from '../lib/nav.ts'

/**
 * The sidebar, the palette, the mobile drawer and the route parser all read
 * this one model, so it is tested as the single source of truth it claims to be.
 */

test('a pathname resolves to its section and an unknown path falls back to the overview', () => {
  assert.equal(sectionFromPath('/'), 'overview')
  assert.equal(sectionFromPath('/objects'), 'objects')
  assert.equal(sectionFromPath('/objects/abcdef'), 'objects', 'an object detail keeps its section')
  assert.equal(sectionFromPath('/nope'), 'overview')
})

test('every section has a unique id and its href resolves back to it', () => {
  const ids = SECTIONS.map((entry) => entry.id)
  assert.equal(new Set(ids).size, ids.length, 'no two sections may share an id')
  for (const entry of SECTIONS) {
    assert.equal(sectionFromPath(entry.href), entry.id, `${entry.href} must resolve to ${entry.id}`)
  }
})

test('sectionById returns the entry it was asked for and falls back safely', () => {
  assert.equal(sectionById('settings').id, 'settings')
  assert.equal(sectionById('missing' as SectionId).id, 'overview')
})

test('searchSections matches labels and keywords, and returns everything for a blank query', () => {
  assert.equal(searchSections('').length, SECTIONS.length)
  assert.deepEqual(searchSections('fixity').map((entry) => entry.id), ['integrity'])
  assert.equal(searchSections('zzzz').length, 0)
})
