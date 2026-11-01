const test = require('node:test')
const assert = require('node:assert/strict')
const { measureMobileLayout, inspectTapTarget, inspectCardContent } = require('../scripts/lib/qa-mobile-layout.cjs')

// Deterministic DOM geometry for the actual browser measurement functions.
// No browser, source rewriting, WebGL process, or application hooks are used.
function rect(x, y, width, height) { return { x, y, width, height, right: x + width, bottom: y + height } }
function element(box, options = {}) {
  return {
    tagName: options.tag || 'DIV', className: options.className || '', textContent: options.text || '',
    parentElement: options.parent || null, style: options.style || {}, attrs: options.attrs || {},
    clientWidth: box.width, clientHeight: box.height, scrollWidth: box.width, scrollHeight: box.height, scrollLeft: 0, scrollTop: 0,
    getBoundingClientRect: () => ({ ...box }),
    getAttribute(name) { return this.attrs[name] ?? null },
    contains(child) { for (let node = child; node; node = node.parentElement) if (node === this) return true; return false },
    querySelector(selector) { return this.queries?.[selector] ?? null },
    querySelectorAll(selector) { return this.lists?.[selector] ?? [] },
  }
}
function setup(t) {
  const previous = Object.fromEntries(['document', 'getComputedStyle', 'innerWidth', 'innerHeight'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  t.after(() => { for (const [name, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] } })
  const root = element(rect(0, 0, 390, 0), { tag: 'HTML', style: { overflowX: 'hidden', overflowY: 'hidden' } })
  const body = element(rect(0, 0, 390, 0), { tag: 'BODY', parent: root, style: { overflowX: 'hidden', overflowY: 'hidden' } })
  const commerce = element(rect(0, 0, 390, 844), { parent: body, style: { position: 'fixed' }, attrs: { 'data-scene': 'bagels', 'data-live-world': 'true' } })
  const canvas = element(rect(0, 0, 390, 844), { tag: 'CANVAS', parent: body, style: { position: 'fixed' } })
  canvas.getContext = () => ({ isContextLost: () => false, drawingBufferWidth: 390, drawingBufferHeight: 844 })
  const env = { root, body, commerce, canvas, targets: [], blockers: [], bagels: [], schmears: [], cashier: [], hit: null }
  env.makeBagels = () => Array.from({ length: 8 }, (_, index) => element(rect(30 + (index % 4) * 50, index < 4 ? 250 : 290, 10, 6), { parent: body, text: 'Bagel ' + index }))
  env.makeSchmears = () => Array.from({ length: 5 }, (_, index) => element(rect(240 + (index % 3) * 35, index < 3 ? 250 : 290, 10, 6), { parent: body, text: 'Schmear ' + index }))
  env.bagels = env.makeBagels(); env.schmears = env.makeSchmears()
  env.cashier = [element(rect(190, 260, 30, 12), { parent: body, text: 'CAJA' })]
  globalThis.innerWidth = 390; globalThis.innerHeight = 844
  globalThis.getComputedStyle = node => ({ display: 'block', visibility: 'visible', opacity: '1', position: 'static', overflowX: 'visible', overflowY: 'visible', backgroundColor: 'transparent', backgroundImage: 'none', pointerEvents: 'auto', textOverflow: 'clip', ...node.style })
  globalThis.document = {
    body, documentElement: root,
    querySelector(selector) { return selector === '.guided-commerce' ? commerce : selector === 'canvas' ? canvas : null },
    querySelectorAll(selector) {
      return ({ '.guided-commerce *': env.blockers, '.bagelito-3d-blue-sign': env.bagels, '.schmear-3d-sign': env.schmears, '.pos-label': env.cashier, canvas: [canvas], '.guided-commerce button:not([disabled]),.guided-commerce a[href]': env.targets, '.mobile-bagel-grid,.mobile-schmear-grid': [] })[selector] || []
    },
    elementFromPoint() { return env.hit },
    createRange() { let selected; return { selectNodeContents(node) { selected = node }, getClientRects() { return selected.glyphs || [selected.getBoundingClientRect()] } } },
  }
  return env
}
function invalid(group) {
  assert.equal(group.valid, false)
  assert.equal(group.clearFraction, null)
  assert.equal(group.roi.width * group.roi.height, 0)
  assert.ok(group.anchors.every(anchor => anchor.free === false), 'An invalid group cannot advertise free anchor centres')
}

test('zero-height BODY/root overflow does not clip fixed UI or complete card text', t => {
  const env = setup(t)
  const panel = element(rect(0, 500, 390, 230), { parent: env.commerce, style: { position: 'fixed', overflowY: 'auto' } })
  const article = element(rect(12, 520, 180, 80), { parent: panel })
  const button = element(rect(20, 530, 140, 60), { parent: article, tag: 'BUTTON', text: 'Cinnamon Raisin' })
  const label = element(rect(25, 550, 120, 20), { parent: button, text: 'Cinnamon Raisin' })
  button.lists = { '.mobile-bagel-sign,.mobile-schmear-label,small': [label] }
  env.targets = [button]; env.hit = label
  const tap = inspectTapTarget(button), content = inspectCardContent(button), layout = measureMobileLayout({ scene: 'bagels' })
  assert.deepEqual(tap.clip, { x: 20, y: 530, right: 160, bottom: 590, width: 140, height: 60 })
  assert.equal(tap.hit, true)
  assert.equal(content.texts[0].complete, true)
  assert.equal(layout.targets[0].effective44, true)
  assert.equal(layout.targets[0].clipped.height, 60)
})

test('real article/scroll clipping preserves the distinction between raw44 and effective42', t => {
  const env = setup(t)
  const scroll = element(rect(10, 500, 150, 100), { parent: env.commerce, style: { overflowY: 'auto' } })
  scroll.scrollHeight = 400
  const article = element(rect(20, 520, 42, 44), { parent: scroll, style: { overflowX: 'hidden' } })
  const button = element(rect(20, 520, 44, 44), { parent: article, tag: 'BUTTON' })
  const label = element(rect(20, 532, 44, 16), { parent: button, text: 'Everything' })
  button.lists = { '.mobile-bagel-sign,.mobile-schmear-label,small': [label] }
  env.targets = [button]; env.hit = button
  const tap = inspectTapTarget(button), layout = measureMobileLayout({ scene: 'bagels' })
  assert.equal(tap.rect.width, 44)
  assert.equal(tap.clip.width, 42)
  assert.ok(tap.scrollables.some(item => item.vertical && item.scrollHeight === 400))
  assert.equal(layout.targets[0].size44, true)
  assert.equal(layout.targets[0].effective44, false)
  assert.equal(inspectCardContent(button).texts[0].complete, false)
})

test('an opaque pointer-inert overlay blocks the projected physical vitrina ROI', t => {
  const env = setup(t)
  const before = measureMobileLayout({ scene: 'bagels' })
  assert.equal(before.canvas.webgl, true)
  assert.equal(before.canvas.lost, false)
  assert.equal(before.groups[0].valid, true)
  assert.equal(before.groups[0].clearFraction, 1)
  const roi = before.groups[0].roi
  env.blockers = [element(rect(roi.x, roi.y, roi.width, roi.height), { parent: env.commerce, style: { backgroundColor: 'rgb(255, 255, 255)', pointerEvents: 'none' } })]
  const after = measureMobileLayout({ scene: 'bagels' })
  assert.equal(after.groups[0].clearFraction, 0)
  assert.ok(after.groups[0].anchors.every(anchor => !anchor.free))
  assert.ok(after.canvasFreeFraction < 1)
})

test('missing cashier or product anchors cannot manufacture a free positive ROI', t => {
  const env = setup(t)
  env.cashier = []
  invalid(measureMobileLayout({ scene: 'cashier' }).groups[0])
  env.bagels = env.makeBagels().slice(0, 7)
  invalid(measureMobileLayout({ scene: 'bagels' }).groups[0])
  env.schmears = env.makeSchmears().slice(0, 4)
  invalid(measureMobileLayout({ scene: 'schmears' }).groups[0])
})

test('zero-size, non-finite or offscreen anchor rectangles explicitly invalidate the group', t => {
  const env = setup(t)
  for (const bad of [rect(30, 250, 0, 6), rect(NaN, 250, 10, 6), rect(391, 250, 10, 6)]) {
    env.bagels = env.makeBagels()
    env.bagels[0] = element(bad, { parent: env.body, text: 'Invalid anchor' })
    invalid(measureMobileLayout({ scene: 'bagels' }).groups[0])
  }
})

test('card glyphs with ellipsis or overlapping the remove control are reported honestly', t => {
  const env = setup(t)
  const article = element(rect(20, 520, 180, 80), { parent: env.commerce })
  const button = element(rect(20, 520, 180, 80), { parent: article, tag: 'BUTTON' })
  const label = element(rect(28, 540, 130, 18), { parent: button, text: 'Herb & Roasted Garlic', style: { textOverflow: 'ellipsis' } })
  const minus = element(rect(130, 535, 44, 44), { parent: article, tag: 'BUTTON' })
  article.queries = { '.mobile-product-count button': minus }
  button.lists = { '.mobile-bagel-sign,.mobile-schmear-label,small': [label] }
  const text = inspectCardContent(button).texts[0]
  assert.equal(text.ellipsis, true)
  assert.equal(text.complete, false)
  assert.equal(text.overlapsMinus, true)
})
