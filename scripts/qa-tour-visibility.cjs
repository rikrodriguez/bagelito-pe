/** Real WebGL/tour regression. Local preview only; no payment/provider calls.
 * Supply QA_HDR_FIXTURE_PATH with the unchanged pinned Drei apartment HDRI.
 * Playwright is the same optional browser dependency used by qa:3d.
 */
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { chromium } = require('playwright')

const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:4173')
assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname), 'Only a loopback preview is allowed')
const output = resolve(process.env.QA_OUTPUT || 'qa-artifacts/tour-visibility')
const hdrURL = 'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/lebombo_1k.hdr'
assert.ok(process.env.QA_HDR_FIXTURE_PATH, 'Provide the existing pinned HDRI as a local fixture; browser egress remains blocked')
const hdr = readFileSync(process.env.QA_HDR_FIXTURE_PATH)
assert.equal(createHash('sha256').update(hdr).digest('hex'), 'a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb')
const stops = [
  ['totem', -3.70], ['vitrina', 0], ['bagels', -2.05], ['schmears', 4.20],
  ['production', 0], ['cashier', 5.65], ['pickup', 6.95],
]
const results = [], failures = [], network = []
mkdirSync(output, { recursive: true })

async function visibleWebGL(page, label) {
  const state = await page.locator('canvas').evaluate(canvas => {
    const hidden = []
    for (let node = canvas; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) hidden.push({tag: node.tagName, className: node.className, opacity: style.opacity})
    }
    const rect = canvas.getBoundingClientRect()
    const gl = canvas.getContext('webgl2')
    return {hidden, width: rect.width, height: rect.height, webgl: Boolean(gl), contextLost: gl?.isContextLost(), bufferWidth: gl?.drawingBufferWidth, bufferHeight: gl?.drawingBufferHeight}
  })
  assert.deepEqual(state.hidden, [], `${label}: the actual WebGL canvas must remain visible`)
  assert.ok(state.width > 0 && state.height > 0 && state.webgl && !state.contextLost && state.bufferWidth > 0 && state.bufferHeight > 0, `${label}: a live, nonempty WebGL drawing buffer is required`)
  return state
}

async function audit() {
  const browser = await chromium.launch({headless: true, ...(process.env.QA_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.QA_CHROMIUM_EXECUTABLE_PATH} : {}), args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']})
  try {
    for (const [name, viewport] of [['desktop', {width: 1280, height: 800}], ['mobile', {width: 390, height: 844}]]) {
      const touch = name === 'mobile'
      const context = await browser.newContext({viewport, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch, serviceWorkers: 'block'})
      const traffic = {mode: name, reads: [], fixtureReads: 0, blocked: [], errors: []}
      network.push(traffic)
      try {
        await context.route('**/*', async route => {
          const request = route.request(), url = request.url()
          if (request.method() === 'GET' && new URL(url).origin === base.origin) {
            const response = await route.fetch({maxRedirects: 0})
            if (response.status() >= 300 && response.status() < 400) {
              traffic.blocked.push({method: 'GET', url, reason: 'redirect'})
              return route.abort('blockedbyclient')
            }
            traffic.reads.push({url, status: response.status()})
            return route.fulfill({response})
          }
          if (request.method() === 'GET' && url === hdrURL) {
            traffic.fixtureReads++
            return route.fulfill({status: 200, headers: {'content-type': 'application/octet-stream', 'access-control-allow-origin': '*'}, body: hdr})
          }
          traffic.blocked.push({method: request.method(), url})
          return route.abort('blockedbyclient')
        })
        const page = await context.newPage()
        page.setDefaultTimeout(30000)
        page.on('pageerror', error => traffic.errors.push(error.message))
        const config = await page.request.get(new URL('/api/payments/culqi/config', base).href, {maxRedirects: 0})
        assert.equal(config.status(), 200)
        const payment = await config.json()
        assert.equal(payment.enabled, false)
        assert.equal(payment.configured, false)
        assert.equal(payment.intakeEnabled, false)
        assert.equal(payment.mode, 'disabled')
        await page.goto(new URL('/playable', base).href, {waitUntil: 'networkidle'})
        await page.locator('canvas').waitFor()
        await visibleWebGL(page, name + '/explore')
        await page.locator('.tour-start-button').click()
        for (const [node, x] of stops) {
          await page.locator('[data-tour-node="' + node + '"]').waitFor()
          const canvas = await visibleWebGL(page, name + '/' + node)
          await page.waitForFunction(target => Math.abs(Number(document.querySelector('.playable-shell').getAttribute('data-player-x')) - target) < .06, x, {timeout: 30000})
          results.push({mode: name, node, canvas})
          if (node === 'bagels') await page.screenshot({path: resolve(output, name + '-visible-bagel-vitrina.png'), timeout: 60000})
          await page.locator('.guided-tour-panel').getByRole('button', {name: node === 'pickup' ? /Terminar visita/ : /Siguiente/}).click()
        }
        await page.locator('[data-tour-node="none"]').waitFor()
        await visibleWebGL(page, name + '/tour-finished')
        assert.equal(await page.locator('.guided-tour-panel').count(), 0)
        // Physical product interaction, rather than only the overlay CTA.
        await page.locator('.tour-start-button').click()
        for (let i = 0; i < 2; i++) await page.locator('.guided-tour-panel').getByRole('button', {name: /Siguiente/}).click()
        await page.waitForFunction(() => Math.abs(Number(document.querySelector('.playable-shell').getAttribute('data-player-x')) + 2.05) < .06)
        // A narrow viewport shows a portion of the physical case. Click an
        // actual on-screen product, not an off-screen first DOM entry.
        let hotspot
        const candidates = page.locator('.vitrina-hotspot')
        for (let index = 0; index < await candidates.count(); index++) {
          const box = await candidates.nth(index).boundingBox()
          if (box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0
            && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height) {
            hotspot = {box, label: await candidates.nth(index).innerText()}
            break
          }
        }
        assert.ok(hotspot, 'A real product hotspot must be visible inside the viewport')
        const x = hotspot.box.x + hotspot.box.width / 2, y = hotspot.box.y + hotspot.box.height / 2
        if (touch) await page.touchscreen.tap(x, y)
        else await page.mouse.click(x, y)
        await page.locator('[data-scene="pack-size"]').waitFor()
        assert.equal(await page.locator('canvas').count(), 0, 'The deliberate handoff must mount the real guided pack flow')
        results.push({mode: name, input: touch ? 'touch' : 'mouse', handoff: 'physical-bagel-to-pack-size', hotspot})
        assert.deepEqual(traffic.blocked, [])
        assert.deepEqual(traffic.errors, [])
      } catch (error) {
        failures.push({mode: name, message: String(error)})
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
    writeFileSync(resolve(output, 'visibility-results.json'), JSON.stringify({results, failures, network}, null, 2))
  }
  console.log(results.length + ' visibility/navigation checks; ' + failures.length + ' failures')
  for (const failure of failures) console.error(failure.mode + ': ' + failure.message)
  if (failures.length) process.exitCode = 1
}
audit().catch(error => { console.error(error); process.exitCode = 1 })
