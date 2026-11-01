'use strict'
const assert = require('node:assert/strict')

function inspectDocumentScroll() {
  return {
    x: scrollX, y: scrollY, width: innerWidth, height: innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
  }
}

// scrollIntoView can move overflow:hidden documents, concealing a real input
// lock. This guard must run before the driver's programmatic gallery scrolling.
async function exerciseNativeDocumentScroll(page) {
  const initial = await page.evaluate(inspectDocumentScroll)
  for (const key of ['htmlOverflowY', 'bodyOverflowY']) {
    assert.ok(!['hidden', 'clip'].includes(initial[key]), `${key} must allow user scrolling`)
  }
  assert.equal(initial.y, 0, 'Entry starts at the top before native scrolling')
  const overflow = initial.scrollHeight - initial.height
  if (overflow <= 1) return {pass: true, overflowing: false, initial, wheel: null, returned: null}

  await page.mouse.move(Math.floor(initial.width / 2), Math.max(1, initial.height - 40))
  await page.mouse.wheel(0, Math.min(600, overflow))
  await page.waitForFunction(() => scrollY > 1, null, {timeout: 5000})
  const wheel = await page.evaluate(inspectDocumentScroll)
  assert.ok(wheel.y > 1, 'A real wheel must reach below-fold content')
  assert.equal(wheel.x, 0, 'Native vertical input must not shift the storefront sideways')

  await page.keyboard.press('Control+Home')
  await page.waitForFunction(() => scrollY === 0, null, {timeout: 5000})
  const returned = await page.evaluate(inspectDocumentScroll)
  assert.equal(returned.y, 0, 'Keyboard input returns to the entrance')
  assert.equal(returned.x, 0)
  return {pass: true, overflowing: true, initial, wheel, returned}
}

// Full bleed means the usable document width, not the native scrollbar track.
function isLayoutFullBleed({x, right, width, layoutViewportWidth}) {
  return Number.isFinite(layoutViewportWidth) && layoutViewportWidth > 0 &&
    Math.abs(width - layoutViewportWidth) <= 1 && Math.abs(x) <= 1 && Math.abs(right - layoutViewportWidth) <= 1
}

module.exports = {inspectDocumentScroll, exerciseNativeDocumentScroll, isLayoutFullBleed}
