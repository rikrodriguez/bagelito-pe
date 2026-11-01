/** Local browser regression: failed HDR -> usable DOM fallback -> explicit 3D retry.
 * Playwright is optional, as for qa:3d. No provider or external network is used.
 * BASE_URL=http://127.0.0.1:3190 QA_HDR_FIXTURE_PATH=/path/lebombo_1k.hdr node scripts/qa-visual-recovery.cjs
 */
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { chromium } = require('playwright')

const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:3190')
assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname), 'Only a loopback preview is allowed')
assert.ok(process.env.QA_HDR_FIXTURE_PATH, 'Provide the pinned HDR as a local fixture')
const hdr = readFileSync(process.env.QA_HDR_FIXTURE_PATH)
assert.equal(createHash('sha256').update(hdr).digest('hex'), 'a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb')
const hdrURL = 'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/lebombo_1k.hdr'
const output = resolve(process.env.QA_OUTPUT || 'qa-artifacts/visual-recovery')
const results = [], failures = [], network = []
mkdirSync(output, { recursive: true })

async function assertLiveWorld(page) {
  await page.locator('canvas').waitFor()
  await page.locator('.bagelito-3d-blue-sign').nth(7).waitFor({ state: 'attached' })
  assert.equal(await page.locator('canvas').count(), 1)
  assert.equal(await page.locator('.bagelito-3d-blue-sign').count(), 8)
  const canvas = await page.locator('canvas').evaluate(element => {
    const hidden = []
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) hidden.push(node.tagName)
    }
    const rect = element.getBoundingClientRect(), gl = element.getContext('webgl2')
    return { hidden, width: rect.width, height: rect.height, webgl: Boolean(gl), lost: gl?.isContextLost(), bufferWidth: gl?.drawingBufferWidth, bufferHeight: gl?.drawingBufferHeight }
  })
  assert.deepEqual(canvas.hidden, [])
  assert.ok(canvas.width > 0 && canvas.height > 0 && canvas.webgl && !canvas.lost && canvas.bufferWidth > 0 && canvas.bufferHeight > 0, 'A visible live WebGL world is required')
  assert.equal(await page.locator('.store-3d-fallback').count(), 0)
  return canvas
}

async function openGuidedMenu(page) {
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click()
  await page.getByRole('navigation', { name: 'Menú Bagelito' }).waitFor()
}

async function audit() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.QA_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.QA_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  })
  try {
    for (const scenario of [
      { name: 'desktop-recovery', viewport: { width: 1280, height: 800 }, recover: true },
      { name: 'mobile-recovery', viewport: { width: 390, height: 844 }, recover: true, touch: true },
      { name: 'storage-blocked', viewport: { width: 390, height: 844 }, recover: false, touch: true, storageBlocked: true },
    ]) {
      const context = await browser.newContext({ viewport: scenario.viewport, deviceScaleFactor: 1, isMobile: Boolean(scenario.touch), hasTouch: Boolean(scenario.touch), serviceWorkers: 'block' })
      let phase = scenario.recover ? 'initial-failure' : 'storage-blocked'
      let allowHdr = !scenario.recover
      const traffic = { scenario: scenario.name, reads: [], hdrAborts: 0, fixtureReads: 0, blocked: [], pageErrors: [], expectedHdrErrors: [], consoleErrors: [] }
      network.push(traffic)
      try {
        if (scenario.storageBlocked) {
          await context.addInitScript(() => {
            for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, {
              configurable: true,
              get() { throw new DOMException('Storage is blocked for this QA context.', 'SecurityError') },
            })
          })
        }
        await context.route('**/*', async route => {
          const request = route.request(), url = request.url()
          if (request.method() === 'GET' && new URL(url).origin === base.origin) {
            const response = await route.fetch({ maxRedirects: 0 })
            traffic.reads.push({ phase, url, status: response.status() })
            if (response.status() >= 300 && response.status() < 400) {
              traffic.blocked.push({ phase, method: 'GET', url, reason: 'redirect' })
              return route.abort('blockedbyclient')
            }
            return route.fulfill({ response })
          }
          if (request.method() === 'GET' && url === hdrURL) {
            if (!allowHdr) {
              traffic.hdrAborts++
              return route.abort('failed')
            }
            traffic.fixtureReads++
            return route.fulfill({ status: 200, headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' }, body: hdr })
          }
          traffic.blocked.push({ phase, method: request.method(), url })
          return route.abort('blockedbyclient')
        })
        const page = await context.newPage()
        page.setDefaultTimeout(45000)
        page.on('pageerror', error => {
          const entry = { phase, message: error.message }
          if (phase === 'initial-failure' && error.message.includes('lebombo_1k.hdr')) traffic.expectedHdrErrors.push(entry)
          else traffic.pageErrors.push(entry)
        })
        page.on('console', message => { if (message.type() === 'error') traffic.consoleErrors.push({ phase, message: message.text() }) })
        const config = await page.request.get(new URL('/api/payments/culqi/config', base).href, { maxRedirects: 0 })
        assert.equal(config.status(), 200)
        const payment = await config.json()
        for (const key of ['enabled', 'configured', 'intakeEnabled']) assert.equal(payment[key], false, key + ' must remain disabled')
        assert.equal(payment.mode, 'disabled')
        await page.goto(new URL('/', base).href, { waitUntil: 'domcontentloaded' })

        if (scenario.recover) {
          await page.getByRole('alert').filter({ has: page.getByRole('heading', { name: 'Tu visita continúa.' }) }).waitFor()
          assert.ok(traffic.hdrAborts >= 1, 'The failure must come after the fixture HDR was intentionally denied')
          assert.equal(traffic.fixtureReads, 0, 'The HDR cannot silently recover before an explicit retry')
          phase = 'dom-fallback'
          await page.getByRole('button', { name: 'Entrar a la tienda guiada →', exact: true }).click()
          await page.locator('.guided-commerce[data-scene="selector"]').waitFor()
          assert.notEqual(await page.locator('.guided-commerce').getAttribute('data-live-world'), 'true')
          assert.equal(await page.locator('canvas').count(), 0, 'The failed Canvas must unmount for DOM recovery')
          assert.equal(await page.locator('.store-3d-fallback').count(), 0)
          await page.getByRole('button', { name: 'Packs', exact: true }).click()
          await page.locator('[data-scene="pack-size"]').waitFor()
          assert.equal(traffic.fixtureReads, 0)
          results.push({ scenario: scenario.name, check: 'failed-HDR-to-usable-DOM-pack-selector' })

          await openGuidedMenu(page)
          phase = 'explicit-retry'
          allowHdr = true
          await page.getByRole('button', { name: 'Explorar tienda 3D', exact: true }).click()
          const canvas = await assertLiveWorld(page)
          assert.ok(traffic.fixtureReads >= 1, 'Explicit retry must request the previously failed HDR again')
          assert.equal(await page.locator('.guided-commerce').count(), 0)
          await page.locator('.tour-start-button').click()
          await page.locator('[data-tour-node="totem"]').waitFor()
          await assertLiveWorld(page)
          results.push({ scenario: scenario.name, check: 'explicit-retry-restores-live-world-and-tour', canvas })
        } else {
          const blocked = await page.evaluate(() => ['localStorage', 'sessionStorage'].map(key => {
            try { window[key].getItem('qa-storage-probe'); return false } catch (error) { return error.name === 'SecurityError' }
          }))
          assert.deepEqual(blocked, [true, true])
          await assertLiveWorld(page)
          await page.locator('.store-entry-categories').getByRole('button', { name: /Packs/ }).click()
          await page.locator('[data-scene="pack-size"]').waitFor()
          await page.getByRole('button', { name: 'Volver al paso anterior', exact: true }).click()
          await page.locator('[data-scene="selector"]').waitFor()
          await openGuidedMenu(page)
          await page.getByRole('button', { name: 'Explorar tienda 3D', exact: true }).click()
          await assertLiveWorld(page)
          results.push({ scenario: scenario.name, check: 'blocked-storage-keeps-category-and-exploration-usable' })
        }
        assert.deepEqual(traffic.blocked, [], 'No unrelated external request or write is allowed')
        assert.deepEqual(traffic.reads.filter(read => read.status >= 400), [], 'All local resources must load')
        assert.deepEqual(traffic.pageErrors, [], 'Only the intentionally failed HDR may cause a caught initial error')
      } catch (error) {
        failures.push({ scenario: scenario.name, phase, message: String(error) })
      } finally { await context.close() }
    }
  } finally {
    await browser.close()
    writeFileSync(resolve(output, 'recovery-results.json'), JSON.stringify({ results, failures, network }, null, 2))
  }
  console.log(results.length + ' recovery/storage checks; ' + failures.length + ' failures')
  if (failures.length) { failures.forEach(failure => console.error(failure.scenario + ': ' + failure.message)); process.exitCode = 1 }
}

audit().catch(error => { console.error(error); process.exitCode = 1 })
