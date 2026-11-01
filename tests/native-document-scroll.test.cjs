const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {exerciseNativeDocumentScroll, isLayoutFullBleed} = require('../scripts/lib/qa-native-document-scroll.cjs')

function fakePage({body = 'auto', html = 'visible', overflow = 500, blocked = false} = {}) {
  const events = []
  const state = {x: 0, y: 0, width: 500, height: 714, scrollHeight: 714 + overflow, bodyOverflowY: body, htmlOverflowY: html}
  return {events, page: {
    evaluate: async () => ({...state}),
    mouse: {
      move: async (x, y) => events.push(['move', x, y]),
      wheel: async (x, y) => {events.push(['wheel', x, y]); if (!blocked) state.y = y},
    },
    keyboard: {press: async key => {events.push(['key', key]); state.y = 0}},
    waitForFunction: async () => {if (blocked) throw new Error('Native scroll did not advance')},
  }}
}

test('an overflowing storefront advances with real wheel and returns with keyboard', async () => {
  const {page, events} = fakePage()
  const result = await exerciseNativeDocumentScroll(page)
  assert.equal(result.wheel.y, 500)
  assert.equal(result.returned.y, 0)
  assert.deepEqual(events.map(event => event[0]), ['move', 'wheel', 'key'])
  assert.equal(events[2][1], 'Control+Home')
})

test('hidden or clipped root/body overflow fails before any simulated input', async () => {
  for (const key of ['body', 'html']) for (const value of ['hidden', 'clip']) {
    const {page, events} = fakePage({[key]: value})
    await assert.rejects(exerciseNativeDocumentScroll(page), /must allow user scrolling/)
    assert.deepEqual(events, [])
  }
})

test('a blocked wheel fails rather than claiming programmatic scrolling as coverage', async () => {
  const {page} = fakePage({blocked: true})
  await assert.rejects(exerciseNativeDocumentScroll(page), /Native scroll did not advance/)
})

test('a fitting document is explicitly reported without wheel coverage', async () => {
  const {page, events} = fakePage({overflow: 0})
  const result = await exerciseNativeDocumentScroll(page)
  assert.equal(result.overflowing, false)
  assert.equal(result.wheel, null)
  assert.deepEqual(events, [])
})

test('scroll override is scoped to the document-flow storefront, preserving the tour default', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/reference/reference-storefront.css'), 'utf8')
  const base = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8')
  assert.match(css, /body:has\(\.reference-storefront\)\s*\{\s*overflow-x:hidden;overflow-y:auto\s*\}/)
  assert.match(base, /body\{overflow:hidden\}/)
})


test('full bleed excludes a real scrollbar, without accepting a gutter or overflow', () => {
  const geometry = {x: 0, right: 485, width: 485, innerWidth: 500, layoutViewportWidth: 485}
  assert.equal(isLayoutFullBleed(geometry), true)
  assert.equal(isLayoutFullBleed({...geometry, right: 500, width: 500}), false)
  assert.equal(isLayoutFullBleed({...geometry, right: 470, width: 470}), false)
  assert.equal(isLayoutFullBleed({...geometry, x: 15, right: 500}), false)
  assert.equal(isLayoutFullBleed({...geometry, layoutViewportWidth: undefined}), false)
})
