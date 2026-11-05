import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EmptyState, Metric, Notice, Panel, StatusBadge } from '../components/ui/primitives.tsx'

/**
 * The primitives carry the tone and wording every screen reuses, so they are
 * rendered to static markup and asserted on what an operator actually reads.
 * This needs no browser: the parts under test are decided at render, not on click.
 */

test('a status badge keeps its tone class and its label', () => {
  assert.match(renderToStaticMarkup(<StatusBadge tone='good'>Ready</StatusBadge>), /status status-good/)
  assert.match(renderToStaticMarkup(<StatusBadge tone='bad'>Mismatch</StatusBadge>), /status status-bad/)
  assert.match(renderToStaticMarkup(<StatusBadge tone='info'>Note</StatusBadge>), /status status-muted/)
})

test('a failed notice is announced as an alert, an informational one as a status', () => {
  assert.match(renderToStaticMarkup(<Notice tone='bad'>Upload failed</Notice>), /role="alert"/)
  assert.match(renderToStaticMarkup(<Notice tone='good'>Stored</Notice>), /role="status"/)
  assert.match(renderToStaticMarkup(<Notice tone='warn'>Retention near</Notice>), /role="status"/)
})

test('an empty state states both the fact and the reason', () => {
  const html = renderToStaticMarkup(
    <EmptyState title='No objects yet' description='Nothing has been preserved on this instance.' />,
  )
  assert.match(html, /No objects yet/)
  assert.match(html, /Nothing has been preserved on this instance\./)
})

test('a value the server did not report is shown verbatim, never replaced', () => {
  const html = renderToStaticMarkup(<Metric label='Objects stored' value='Not available' note='From storage statistics' />)
  assert.match(html, /Not available/)
  assert.match(html, /Objects stored/)
  assert.match(html, /From storage statistics/)
})

test('a panel only renders its head when there is something to head', () => {
  assert.doesNotMatch(renderToStaticMarkup(<Panel>Body only</Panel>), /panel-head/)
  const headed = renderToStaticMarkup(
    <Panel eyebrow='Storage' title='Capacity' description='What this instance can still accept.'>
      Body
    </Panel>,
  )
  assert.match(headed, /Storage/)
  assert.match(headed, /<h3>Capacity<\/h3>/)
  assert.match(headed, /What this instance can still accept\./)
})
